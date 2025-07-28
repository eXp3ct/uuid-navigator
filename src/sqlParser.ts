import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { sortBy } from 'lodash';
import { DataType } from './types';

export interface ClassInfo {
  id: string;
  name: string;
  description: string;
  properties: PropertyInfo[];
  filePath?: string;
  lineNumber?: number;
  position?: number;
}

export interface PropertyInfo {
  id: string;
  name: string;
  description: string;
  dataType: number;
  sourceClassId?: string;
  filePath?: string;
  lineNumber?: number;
  position?: number;
}

export interface ClassPropertyLink {
  id?: string;
  classId: string;
  propertyId: string;
}

export class SqlParser {
  private cache: {
    data: { classes: ClassInfo[]; properties: PropertyInfo[] };
    fileHashes: Map<string, string>;
    timestamp: number;
  } | null = null;

  private fileCache = new Map<string, {
    content: string;
    hash: string;
    parsed: {
      classes: ClassInfo[];
      properties: PropertyInfo[];
      links: ClassPropertyLink[];
    };
  }>();

  public async parseAllSqlFiles(forceRefresh = false): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
  }> {
    // Получаем текущие хэши файлов
    const currentFileHashes = await this.getFileHashes();

    // Проверяем валидность кэша
    if (!forceRefresh && this.cache && this.isCacheValid(currentFileHashes)) {
      return this.cache.data;
    }

    // Парсим файлы
    const { classes, properties } = await this.parseFiles(currentFileHashes);

    // Обновляем кэш
    this.cache = {
      data: { classes, properties },
      fileHashes: currentFileHashes,
      timestamp: Date.now()
    };

    return { classes, properties };
  }

  public invalidateCache(): void {
    this.cache = null;
    this.fileCache.clear();
  }

  public invalidateCacheForFile(filePath: string): void {
    this.fileCache.delete(filePath);
    if (this.cache) {
      this.cache.fileHashes.delete(filePath);
    }
  }

  private async getFileHashes(): Promise<Map<string, string>> {
    const files = await vscode.workspace.findFiles('**/*.sql');
    const hashes = new Map<string, string>();

    await Promise.all(files.map(async file => {
      try {
        const content = await vscode.workspace.fs.readFile(file);
        const hash = crypto.createHash('sha1').update(content).digest('hex');
        hashes.set(file.fsPath, hash);
      } catch (error) {
        console.error(`Error hashing file ${file.fsPath}:`, error);
      }
    }));

    return hashes;
  }

  private isCacheValid(currentHashes: Map<string, string>): boolean {
    if (!this.cache) return false;

    // Быстрая проверка количества файлов
    if (this.cache.fileHashes.size !== currentHashes.size) return false;

    // Подробная проверка хэшей
    for (const [path, hash] of currentHashes) {
      if (this.cache.fileHashes.get(path) !== hash) {
        return false;
      }
    }

    return true;
  }


  private normalizeSql(content: string): string {
    // Удаляем комментарии
    let normalized = content
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    // Заменяем параметры и функции на NULL
    normalized = normalized.replace(/:my_utc_now/g, 'NULL::timestamp');
    normalized = normalized.replace(/:my_admin_id/g, 'NULL::uuid');
    normalized = normalized.replace(/gen_random_uuid\(\)/g, 'NULL::uuid');
    normalized = normalized.replace(/:(\w+)/g, 'NULL');

    return normalized;
  }

  private normalizeValue(value: string): string {
    return value
      .replace(/:my_utc_now/g, 'NULL')
      .replace(/:my_admin_id/g, 'NULL')
      .replace(/gen_random_uuid\(\)/g, 'NULL')
      .replace(/^['"]|['"]$/g, '')
      .trim();
  }

  private extractInserts(content: string, filePath: string): {
    tableName: string;
    columns: string[];
    values: string[][];
    positions: number[];
  }[] {
    const inserts: {
      tableName: string;
      columns: string[];
      values: string[][];
      positions: number[];
    }[] = [];

    // Улучшенное регулярное выражение для обработки многострочных INSERT
    const insertRegex = /INSERT\s+INTO\s+([^\s(]+)\s*\(([^)]+)\)\s*VALUES\s*((?:\((?:[^()]|\([^)]*\))*\))(?:\s*,\s*\((?:[^()]|\([^)]*\))*\))*)/gi;

    let match;
    while ((match = insertRegex.exec(content)) !== null) {
      const tableName = match[1].trim();
      const columns = match[2].split(',').map(c => c.trim().replace(/["']/g, ''));

      const valuesRaw = match[3];

      // Улучшенная обработка значений с учетом вложенных скобок
      const valueMatches = this.extractValuesWithNestedParentheses(valuesRaw);
      if (!valueMatches) continue;

      const values: string[][] = valueMatches.map(vGroup =>
        vGroup
          .slice(1, -1) // remove surrounding parentheses
          .split(/(?<!\\),/) // split by commas not preceded by backslash
          .map(val => this.normalizeValue(val.trim()))
      );

      const positions: number[] = [];
      const uuidRegex = /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi;
      let uuidMatch;
      while ((uuidMatch = uuidRegex.exec(valuesRaw)) !== null) {
        positions.push(uuidMatch.index);
      }

      inserts.push({
        tableName,
        columns,
        values,
        positions
      });
    }

    return inserts;
  }

  private extractValuesWithNestedParentheses(str: string): string[] | null {
    const result: string[] = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < str.length; i++) {
      if (str[i] === '(') {
        if (depth === 0) {
          start = i;
        }
        depth++;
      } else if (str[i] === ')') {
        depth--;
        if (depth === 0 && start !== -1) {
          result.push(str.substring(start, i + 1));
        }
      }
    }

    return result.length > 0 ? result : null;
  }

  private stripQuotes(str: any): string {
    return str.replace("'", '')
  }
  private async parseFiles(fileHashes: Map<string, string>): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
  }> {
    let allClasses: ClassInfo[] = [];
    let allProperties: PropertyInfo[] = [];
    const allLinks: ClassPropertyLink[] = [];
    const classMap = new Map<string, ClassInfo>();
    const propertyMap = new Map<string, PropertyInfo>();

    // Обрабатываем файлы последовательно для сохранения порядка
    for (const [filePath, fileHash] of fileHashes) {
      try {
        const { classes, properties, links } = await this.parseFile(filePath, fileHash);

        classes.forEach(cls => {
          if (!classMap.has(cls.id)) {
            classMap.set(cls.id, cls);
            allClasses.push(cls);
          }
        });

        properties.forEach(prop => {
          if (!propertyMap.has(prop.id)) {
            propertyMap.set(prop.id, prop);
            allProperties.push(prop);
          }
        });

        allLinks.push(...links);
      } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
      }
    }

    // Связываем классы и свойства после загрузки всех файлов
    this.linkClassesAndProperties(allClasses, allProperties, allLinks);

    allClasses = sortBy(allClasses, c => c.name);
    allProperties = sortBy(allProperties, p => p.name);

    return { classes: allClasses, properties: allProperties };
  }

  private async parseFile(filePath: string, fileHash: string): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
    links: ClassPropertyLink[];
  }> {
    // Проверяем кэш файла
    if (this.fileCache.has(filePath)) {
      const cached = this.fileCache.get(filePath)!;
      if (cached.hash === fileHash) {
        return cached.parsed;
      }
    }

    // Читаем и парсим файл
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const content = this.normalizeSql(document.getText());
    const inserts = this.extractInserts(content, filePath);

    const classes: ClassInfo[] = [];
    const properties: PropertyInfo[] = [];
    const links: ClassPropertyLink[] = [];

    for (const insert of inserts) {
      try {
        if (insert.tableName === 'classes') {
          for (let i = 0; i < insert.values.length; i++) {
            const classInfo = this.parseClass(
              insert.columns,
              insert.values[i],
              filePath,
              document.positionAt(insert.positions[i]).line + 1,
              insert.positions[i]
            );
            if (classInfo) classes.push(classInfo);
          }
        } else if (insert.tableName === 'property_definitions') {
          for (let i = 0; i < insert.values.length; i++) {
            const property = this.parseProperty(
              insert.columns,
              insert.values[i],
              filePath,
              document.positionAt(insert.positions[i]).line + 1,
              insert.positions[i]
            );
            if (property) properties.push(property);
          }
        } else if (insert.tableName === 'classes_property_definitions') {
          for (const values of insert.values) {
            const link = this.parseLink(insert.columns, values);
            if (link) links.push(link);
          }
        }
      } catch (error) {
        console.error(`Error processing insert in ${filePath}:`, error);
      }
    }

    // Кэшируем результаты парсинга файла
    this.fileCache.set(filePath, {
      content,
      hash: fileHash,
      parsed: { classes, properties, links }
    });

    return { classes, properties, links };
  }

  private parseClass(columns: string[], values: string[], filePath: string, lineNumber: number, position: number): ClassInfo | null {
    const id = this.getValue(columns, values, 'id');
    const name = this.getValue(columns, values, 'name');
    const description = this.getValue(columns, values, 'description');

    if (!id || !name) return null;

    return {
      id,
      name: this.stripQuotes(name),
      description: this.stripQuotes(description) || '',
      properties: [],
      filePath,
      lineNumber,
      position
    };
  }

  private parseProperty(columns: string[], values: string[], filePath: string, lineNumber: number, position: number): PropertyInfo | null {
    const id = this.getValue(columns, values, 'id');
    const name = this.getValue(columns, values, 'name');
    const description = this.getValue(columns, values, 'description');
    const dataType = parseInt(this.getValue(columns, values, 'data_type') || '0');
    if (!(dataType in DataType)) {
      console.warn(`Invalid dataType: ${dataType} for property ${id}`);
    }
    let sourceClassId = this.getValue(columns, values, 'source_class_id');

    // Нормализация sourceClassId
    if (sourceClassId === 'null' || sourceClassId === null || sourceClassId === 'undefined') {
      sourceClassId = null;
    }

    if (!id || !name) {
      console.warn('Invalid property - missing id or name:', { id, name });
      return null;
    }

    return {
      id,
      name: this.stripQuotes(name),
      description: this.stripQuotes(description || ''),
      dataType,
      sourceClassId: sourceClassId || undefined,
      filePath,
      lineNumber,
      position
    };
  }

  private parseLink(columns: string[], values: string[]): ClassPropertyLink | null {
    const normalized = values.map(v => this.normalizeValue(v));
    const classId = this.getValue(columns, normalized, 'class_id');
    const propertyId = this.getValue(columns, normalized, 'property_definition_id');

    if (!this.isValidUuid(classId) || !this.isValidUuid(propertyId)) {
      return null;
    }

    return {
      classId: classId || '',
      propertyId: propertyId || ''
    };
  }

  private linkClassesAndProperties(
    classes: ClassInfo[],
    properties: PropertyInfo[],
    links: ClassPropertyLink[]
  ) {
    const propertyMap = new Map(properties.map(p => [p.id, p]));
    const classMap = new Map(classes.map(c => [c.id, c]));

    // Собираем все ID свойств, которые должны быть связаны
    const allPropertyIds = new Set<string>();
    links.forEach(link => allPropertyIds.add(link.propertyId));
    // Проверяем наличие всех свойств
    const missingProperties = Array.from(allPropertyIds).filter(id => !propertyMap.has(id));
    if (missingProperties.length > 0) {
      console.warn('Missing property definitions for IDs:', missingProperties);
    }

    // Связываем только те свойства, которые существуют
    links.forEach(link => {
      const cls = classMap.get(link.classId);
      const prop = propertyMap.get(link.propertyId);

      if (cls && prop) {
        if (!cls.properties.some(p => p.id === prop.id)) {
          cls.properties.push(prop);
          console.log(`Linked property ${prop.name || prop.id} to class ${cls.name || cls.id}`);
        }
      } else {
        if (!cls) {
          console.warn(`Class not found for link: ${link.classId}`);
        }
        if (!prop) {
          console.warn(`Property not found for link: ${link.propertyId}`);
        }
      }
    });
  }

  private getValue(columns: string[], values: string[], column: string): string | null {
    const index = columns.indexOf(column);
    return index >= 0 && index < values.length ? values[index] : null;
  }

  private isValidUuid(uuid: string | null): boolean {
    if (!uuid) return false;
    const isValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
    if (!isValid) {
      console.warn(`Invalid UUID format: ${uuid}`);
    }
    return isValid;
  }
}
