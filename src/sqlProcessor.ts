import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { AliasService } from './aliasService';
import { getConfig } from './settings';
import { ClassType } from './models';

const CLASS_TABLE = 'classes';
const PROPERTY_TABLE = 'property_definitions';
const LINK_TABLE = 'classes_property_definitions';
const OBJECTS_TABLE = 'objects';

export interface ClassInfo {
  id: string;
  name: string;
  description: string;
  classType: number;
  properties: PropertyInfo[];
  objects: ObjectInfo[];
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

export interface ObjectInfo {
  id: string;
  name: string;
  description: string;
  classId: string;
  parentId: string | null;
  filePath?: string;
  lineNumber?: number;
  position?: number;
}

interface ClassPropertyLink {
  classId: string;
  propertyId: string;
}

interface ParsedFile {
  classes: ClassInfo[];
  properties: PropertyInfo[];
  links: ClassPropertyLink[];
  objects: ObjectInfo[];
}

export class SqlProcessor {
  private cache: {
    data: { classes: ClassInfo[]; properties: PropertyInfo[]; objects: ObjectInfo[] };
    fileHashes: Map<string, string>;
    timestamp: number;
  } | null = null;

  private fileCache = new Map<string, {
    hash: string;
    parsed: ParsedFile;
  }>();

  constructor(private aliasService: AliasService) {
    this.aliasService.onAliasesChanged(() => {
      this.invalidateCache();
    });
  }

  public async parseAllSqlFiles(forceRefresh = false): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
    objects: ObjectInfo[]
  }> {
    const currentFileHashes = await this.getFileHashes();

    if (!forceRefresh && this.cache && this.isCacheValid(currentFileHashes)) {
      return this.cache.data;
    }

    const { classes, properties, objects } = await this.parseFiles(currentFileHashes);

    this.cache = {
      data: { classes, properties, objects },
      fileHashes: currentFileHashes,
      timestamp: Date.now()
    };

    return { classes, properties, objects };
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
    if (!this.cache) { return false; }
    if (this.cache.fileHashes.size !== currentHashes.size) { return false; }

    for (const [path, hash] of currentHashes) {
      if (this.cache.fileHashes.get(path) !== hash) {
        return false;
      }
    }

    return true;
  }

  private normalizeSql(content: string): string {
    return content
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/:my_utc_now/g, 'NULL::timestamp')
      .replace(/:my_admin_id/g, 'NULL::uuid')
      .replace(/gen_random_uuid\(\)/g, 'NULL::uuid')
      .replace(/:(\w+)/g, 'NULL');
  }

  private normalizeValue(value: string): string {
    return value
      .replace(/:my_utc_now/g, 'NULL')
      .replace(/:my_admin_id/g, 'NULL')
      .replace(/gen_random_uuid\(\)/g, 'NULL')
      .replace(/^['"]|['"]$/g, '')
      .trim();
  }

  private extractInserts(content: string): {
    tableName: string;
    columns: string[];
    values: string[][];
    positions: number[];
  }[] {
    const inserts = [];
    const insertRegex = /INSERT\s+INTO\s+([^\s(]+)\s*\(([^)]+)\)\s*VALUES\s*((?:\((?:[^()]|\([^)]*\))*\))(?:\s*,\s*\((?:[^()]|\([^)]*\))*\))*)/gi;

    let match;
    while ((match = insertRegex.exec(content)) !== null) {
      const tableName = match[1].trim();
      const columns = match[2].split(',').map(c => c.trim().replace(/["']/g, ''));
      const valueMatches = this.extractValueGroups(match[3]);

      if (!valueMatches) { continue; }

      const values = valueMatches.map(vGroup =>
        vGroup.slice(1, -1).split(/(?<!\\),/).map(val => this.normalizeValue(val.trim()))
      );

      const positions = [];
      const uuidRegex = /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi;
      let uuidMatch;

      while ((uuidMatch = uuidRegex.exec(match[3])) !== null) {
        positions.push(uuidMatch.index);
      }

      inserts.push({ tableName, columns, values, positions });
    }

    return inserts;
  }

  private extractValueGroups(str: string): string[] | null {
    const groups = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < str.length; i++) {
      if (str[i] === '(') {
        if (depth === 0) { start = i; }
        depth++;
      }
      else if (str[i] === ')') {
        depth--;
        if (depth === 0 && start !== -1) {
          groups.push(str.substring(start, i + 1));
        }
      }
    }

    return groups.length > 0 ? groups : null;
  }

  private stripQuotes(str: string): string {
    return str.replace(/['"]/g, '');
  }

  private async parseFiles(fileHashes: Map<string, string>): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
    objects: ObjectInfo[];
  }> {
    const classMap = new Map<string, ClassInfo>();
    const propertyMap = new Map<string, PropertyInfo>();
    const objectMap = new Map<string, ObjectInfo>();

    const allLinks: ClassPropertyLink[] = [];
    let allClasses: ClassInfo[] = [];
    let allProperties: PropertyInfo[] = [];
    let allObjects: ObjectInfo[] = [];

    for (const [filePath, fileHash] of fileHashes) {
      try {
        const { classes, properties, links, objects } = await this.parseFile(filePath, fileHash);

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

        objects.forEach(obj => {
          if (!objectMap.has(obj.id)) {
            objectMap.set(obj.id, obj);
            allObjects.push(obj);
          }
        });

        allLinks.push(...links);
      } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
      }
    }

    // Сортируем свойства перед привязкой
    allProperties.sort((a, b) => a.name.localeCompare(b.name));

    // Привязываем отсортированные данные
    this.linkClassesAndProperties(allClasses, allProperties, allLinks);
    this.linkClassesAndObjects(allClasses, allObjects);

    // Сортируем классы и их внутренние элементы
    const sortedClasses = allClasses
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(cls => ({
        ...cls,
        properties: cls.properties
          ? cls.properties.slice().sort((a, b) => a.name.localeCompare(b.name))
          : [],
        objects: cls.objects
          ? cls.objects.slice().sort((a, b) => a.name.localeCompare(b.name))
          : []
      }));

    return {
      classes: sortedClasses,
      properties: allProperties.slice().sort((a, b) => a.name.localeCompare(b.name)),
      objects: allObjects.slice().sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  private async parseFile(filePath: string, fileHash: string): Promise<ParsedFile> {
    const cached = this.fileCache.get(filePath);
    if (cached && cached.hash === fileHash) {
      //console.log('File parsed from cache', fileHash);
      return cached.parsed;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const content = this.normalizeSql(document.getText());
    const inserts = this.extractInserts(content);

    const classes: ClassInfo[] = [];
    const properties: PropertyInfo[] = [];
    const links: ClassPropertyLink[] = [];
    const objects: ObjectInfo[] = [];

    for (const insert of inserts) {
      try {
        if (insert.tableName === CLASS_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const classInfo = this.parseClass(insert, i, filePath, document);
            if (classInfo) { classes.push(classInfo); }
          }
        }
        else if (insert.tableName === PROPERTY_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const property = this.parseProperty(insert, i, filePath, document);
            if (property) { properties.push(property); }
          }
        }
        else if (insert.tableName === LINK_TABLE) {
          for (const values of insert.values) {
            const link = this.parseLink(insert.columns, values);
            if (link) { links.push(link); }
          }
        }
        else if (insert.tableName === OBJECTS_TABLE) { // Обрабатываем объекты
          for (let i = 0; i < insert.values.length; i++) {
            const object = this.parseObject(insert, i, filePath, document);
            if (object) { objects.push(object); }
          }
        }
      } catch (error) {
        console.error(`Error processing insert in ${filePath}:`, error);
      }
    }

    const parsed = { classes, properties, links, objects };
    this.fileCache.set(filePath, { hash: fileHash, parsed });
    //console.warn('File parsed', filePath);
    return parsed;
  }

  // Добавляем метод для парсинга объектов
  private parseObject(
    insert: any,
    index: number,
    filePath: string,
    document: vscode.TextDocument
  ): ObjectInfo | null {
    const { columns, values, positions } = insert;
    const row = values[index];

    const id = this.getValue(columns, row, 'id');
    const name = this.getValue(columns, row, 'name');
    const description = this.getValue(columns, row, 'description');
    const classId = this.getValue(columns, row, 'class_id');
    const parentId = this.getValue(columns, row, 'parent_id');

    if (!id || !name || !classId) { return null; }

    return {
      id,
      name: this.stripQuotes(name),
      description: this.stripQuotes(description || ''),
      classId,
      parentId: parentId === 'null' ? null : parentId,
      filePath,
      lineNumber: document.positionAt(positions[index]).line + 1,
      position: positions[index]
    };
  }

  private linkClassesAndObjects(classes: ClassInfo[], objects: ObjectInfo[]) {
    const classMap = new Map(classes.map(c => [c.id, c]));
    const classNameMap = new Map(classes.map(c => [c.name.toLowerCase(), c]));
    const config = getConfig();

    // Очищаем все существующие связи
    classes.forEach(cls => {
      cls.objects = [];
    });

    // Заполняем мапу имен классов и алиасов
    classes.forEach(cls => {
      // Основное имя класса
      classNameMap.set(cls.name.toLowerCase(), cls);

      // Добавляем алиас, если он есть
      if (this.aliasService) {
        const alias = this.aliasService.getAlias(cls.id);
        if (alias) {
          classNameMap.set(alias.toString().toLowerCase(), cls);
        }
      }
    });

    // Связываем объекты с классами в несколько проходов

    // 1. Привязка по явному class_id (кроме игнорируемых статусов)
    objects.forEach(obj => {
      const cls = classMap.get(obj.classId);
      if (cls) {
        if (config.ignoreStatus && config.ignoreUuid && cls.id === config.ignoreUuid) {
          return; // Пропускаем игнорируемые статусы
        }
        if (!cls.objects) { cls.objects = []; }
        cls.objects.push(obj);
      }
    });

    // 2. Привязка по имени папки/алиасу
    objects.forEach(obj => {
      // Пропускаем уже привязанные объекты
      if (classMap.get(obj.classId)?.objects?.some(o => o.id === obj.id)) {
        return;
      }

      if (!obj.filePath) { return; }

      const pathParts = obj.filePath.split(/[\\/]/);
      if (pathParts.length < 2) { return; }

      const classNameFromPath = pathParts[pathParts.length - 2].toLowerCase();
      const cls = classNameMap.get(classNameFromPath);

      if (cls && !cls.objects?.some(o => o.id === obj.id)) {
        if (!cls.objects) { cls.objects = []; }
        cls.objects.push(obj);
      }
    });

    // Удаление дубликатов
    classes.forEach(cls => {
      if (!cls.objects) { return; }

      const uniqueObjects = [];
      const seenIds = new Set();

      for (const obj of cls.objects) {
        if (!seenIds.has(obj.id)) {
          seenIds.add(obj.id);
          uniqueObjects.push(obj);
        }
      }

      cls.objects = uniqueObjects;
    });

    // Логирование непривязанных объектов (для отладки)
    const unlinkedObjects = objects.filter(obj =>
      !classes.some(cls => cls.objects?.some(o => o.id === obj.id))
    );
    const statusClass = classes.find(c => config.ignoreUuid === c.id);

    if (unlinkedObjects.length > 0 && statusClass) {
      //console.warn(`Linking ${unlinkedObjects.length} unlinked objects to Statuses class`);

      if (!statusClass.objects) {
        statusClass.objects = [];
      }

      for (const obj of unlinkedObjects) {
        if (!statusClass.objects.some(o => o.id === obj.id)) {
          statusClass.objects.push(obj);
        }
      }

      //console.warn('Unlinked objects:', unlinkedObjects);
    }
  }

  private parseClass(
    insert: any,
    index: number,
    filePath: string,
    document: vscode.TextDocument
  ): ClassInfo | null {
    const { columns, values, positions } = insert;
    const row = values[index];

    const id = this.getValue(columns, row, 'id');
    const name = this.getValue(columns, row, 'name');
    const description = this.getValue(columns, row, 'description');
    const type = parseInt(this.getValue(columns, row, 'type') || '0');
    if (!id || !name) { return null; }

    return {
      id,
      name: this.stripQuotes(name),
      description: this.stripQuotes(description || '') || '',
      classType: type,
      properties: [],
      objects: [],
      filePath,
      lineNumber: document.positionAt(positions[index]).line + 1,
      position: positions[index]
    };
  }

  private parseProperty(
    insert: any,
    index: number,
    filePath: string,
    document: vscode.TextDocument
  ): PropertyInfo | null {
    const { columns, values, positions } = insert;
    const row = values[index];

    const id = this.getValue(columns, row, 'id');
    const name = this.getValue(columns, row, 'name');
    const description = this.getValue(columns, row, 'description');
    const dataType = parseInt(this.getValue(columns, row, 'data_type') || '0');
    let sourceClassId = this.getValue(columns, row, 'source_class_id');

    if (sourceClassId === 'null' || !sourceClassId) {
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
      lineNumber: document.positionAt(positions[index]).line + 1,
      position: positions[index]
    };
  }

  private parseLink(columns: string[], values: string[]): ClassPropertyLink | null {
    const normalized = values.map(v => this.normalizeValue(v));
    const classId = this.getValue(columns, normalized, 'class_id');
    const propertyId = this.getValue(columns, normalized, 'property_definition_id');

    if (!this.isValidUuid(classId) || !this.isValidUuid(propertyId) || !classId || !propertyId) {
      return null;
    }

    return { classId, propertyId };
  }

  private linkClassesAndProperties(
    classes: ClassInfo[],
    properties: PropertyInfo[],
    links: ClassPropertyLink[]
  ) {
    const propertyMap = new Map(properties.map(p => [p.id, p]));
    const classMap = new Map(classes.map(c => [c.id, c]));
    const config = getConfig();

    // 1. Обрабатываем стандартные привязки из links
    links.forEach(link => {
      const cls = classMap.get(link.classId);
      const prop = propertyMap.get(link.propertyId);

      if (cls && prop) {
        if (!cls.properties.some(p => p.id === prop.id)) {
          cls.properties.push(prop);
        }
      }
    });

    // 2. Автоматическая привязка свойств из конфига
    if (config.autoLinkedProperties && config.autoLinkedProperties.length > 0) {
      const autoProperties = properties.filter(p =>
        config.autoLinkedProperties.some(autoProp =>
          autoProp.uuid === p.id
        )
      );

      autoProperties.forEach(property => {
        classes.forEach(cls => {
          // Проверяем что свойство еще не привязано
          if (!cls.properties.some(p => p.id === property.id) && cls.classType === ClassType.Обрабатываемый) {
            cls.properties.push(property);
          }
        });
      });
    }
  }

  private getValue(columns: string[], values: string[], column: string): string | null {
    const index = columns.indexOf(column);
    return index >= 0 && index < values.length ? values[index] : null;
  }

  private isValidUuid(uuid: string | null): boolean {
    return !!uuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }
}