import * as vscode from 'vscode';

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
  private parsedData: { classes: ClassInfo[]; properties: PropertyInfo[] } | null = null;

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
    const insertRegex = /INSERT\s+INTO\s+([^\s(]+)\s*\(([^)]+)\)\s*VALUES\s*((?:\((?:[^)]|\n)*\))(?:\s*,\s*\((?:[^)]|\n)*\))*)/gi;

    let match;
    while ((match = insertRegex.exec(content)) !== null) {
      const tableName = match[1].trim();
      const columns = match[2].split(',').map(c => c.trim().replace(/["']/g, ''));

      const valuesRaw = match[3];
      // Улучшенная обработка значений с учетом переносов строк
      const valueMatches = valuesRaw.match(/\(([^)]+)\)/g);
      if (!valueMatches) continue;

      const values: string[][] = valueMatches.map(vGroup =>
        vGroup
          .slice(1, -1) // remove surrounding parentheses
          .split(/(?<!\\),/g)
          .map(val => this.normalizeValue(val))
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

  private stripQuotes(str: any): string {
    return str.replace("'", '')
  }
  public async parseAllSqlFiles(forceRefresh: boolean = false): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
  }> {
    if (!forceRefresh && this.parsedData) {
      return this.parsedData;
    }
    const classes: ClassInfo[] = [];
    const properties: PropertyInfo[] = [];
    const links: ClassPropertyLink[] = [];
    const classMap = new Map<string, ClassInfo>();
    const propertyMap = new Map<string, PropertyInfo>();

    const files = await vscode.workspace.findFiles('**/*.sql');

    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const content = this.normalizeSql(document.getText());
        const inserts = this.extractInserts(content, file.fsPath);

        for (const insert of inserts) {
          try {
            if (insert.tableName === 'classes') {
              for (let i = 0; i < insert.values.length; i++) {
                const values = insert.values[i];
                const position = insert.positions[i];
                const classInfo = this.parseClass(
                  insert.columns,
                  values,
                  file.fsPath,
                  document.positionAt(position).line + 1,
                  position
                );
                if (classInfo) {
                  classes.push(classInfo);
                  classMap.set(classInfo.id, classInfo);
                }
              }
            } else if (insert.tableName === 'property_definitions') {
              for (let i = 0; i < insert.values.length; i++) {
                const values = insert.values[i];
                const position = insert.positions[i];
                const property = this.parseProperty(
                  insert.columns,
                  values,
                  file.fsPath,
                  document.positionAt(position).line + 1,
                  position
                );
                //console.log('Property: ', property)
                if (property) {
                  properties.push(property);
                  propertyMap.set(property.id, property);
                }
              }
            } else if (insert.tableName === 'classes_property_definitions') {
              for (const values of insert.values) {
                const link = this.parseLink(insert.columns, values);
                if (link) {
                  links.push(link);
                  console.log('Found valid link:', link);
                } else {
                  console.log('Skipping row due to missing UUIDs:', values);
                }
              }
            }
          } catch (error) {
            console.error(`Error processing insert in ${file.fsPath}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error processing file ${file.fsPath}:`, error);
      }
    }

    this.linkClassesAndProperties(classes, properties, links);

    this.parsedData = { classes, properties };
    return { classes, properties };
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
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }
}
