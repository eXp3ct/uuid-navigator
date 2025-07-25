import * as vscode from 'vscode';

export interface ClassInfo {
  id: string;
  name: string;
  description: string;
  properties: PropertyInfo[];
}

export interface PropertyInfo {
  id: string;
  name: string;
  description: string;
  dataType: number;
  sourceClassId?: string;
}

export interface ClassPropertyLink {
  id?: string;
  classId: string;
  propertyId: string;
  // Дополнительные поля из classes_property_definitions при необходимости
}

export class SqlParser {
  private normalizeSql(content: string): string {
    // Удаляем комментарии
    let normalized = content
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    // Заменяем параметры на NULL
    normalized = normalized.replace(/:my_utc_now/g, 'NULL::timestamp');
    normalized = normalized.replace(/:my_admin_id/g, 'NULL::uuid');
    normalized = normalized.replace(/:(\w+)/g, 'NULL');

    // Упрощаем JSON-значения
    normalized = normalized.replace(/'\[.*?\]':NULL/g, "'[]'::jsonb");
    normalized = normalized.replace(/':NULL/g, "''");

    return normalized;
  }

  private extractInserts(content: string): {
    tableName: string;
    columns: string[];
    values: string[][];
  }[] {
    const inserts: {
      tableName: string;
      columns: string[];
      values: string[][];
    }[] = [];

    // Регулярка для поиска INSERT-запросов
    const insertRegex = /INSERT\s+INTO\s+([^\s(]+)\s*\(([^)]+)\)\s*VALUES\s*(?:\(([^)]+)\))(?:\s*,\s*\(([^)]+)\))*/gi;

    let match;
    while ((match = insertRegex.exec(content)) !== null) {
      const tableName = match[1].trim();
      const columns = match[2].split(',').map(c => c.trim().replace(/["']/g, ''));

      // Обрабатываем все группы значений
      const valueGroups = [];
      for (let i = 3; i < match.length; i++) {
        if (match[i]) {
          valueGroups.push(match[i].split(/(?<!\\),/).map(v =>
            v.trim().replace(/^['"]|['"]$/g, '')
          ));
        }
      }

      inserts.push({
        tableName,
        columns,
        values: valueGroups
      });
    }
    return inserts;
  }

  public async parseAllSqlFiles(): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
  }> {
    const classes: ClassInfo[] = [];
    const properties: PropertyInfo[] = [];
    const links: ClassPropertyLink[] = [];
    const classMap = new Map<string, ClassInfo>();
    const propertyMap = new Map<string, PropertyInfo>();

    const files = await vscode.workspace.findFiles('**/*.sql');

    // Первый проход: сбор всех данных
    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const content = this.normalizeSql(document.getText());
        const inserts = this.extractInserts(content);

        for (const insert of inserts) {
          try {
            if (insert.tableName === 'classes') {
              for (const values of insert.values) {
                const classInfo = this.parseClass(insert.columns, values);
                if (classInfo) {
                  classes.push(classInfo);
                  classMap.set(classInfo.id, classInfo);
                }
              }
            } else if (insert.tableName === 'property_definitions') {
              for (const values of insert.values) {
                const property = this.parseProperty(insert.columns, values);
                if (property) {
                  properties.push(property);
                  propertyMap.set(property.id, property);
                }
              }
            } else if (insert.tableName === 'classes_property_definitions') {
              for (const values of insert.values) {
                // Пропускаем только строки, где ВСЕ значения - функции
                const allValuesAreFunctions = values.every(v =>
                  v.includes('gen_random_uuid(') ||
                  v.includes(':my_utc_now') ||
                  v.includes(':my_admin_id')
                );

                if (allValuesAreFunctions) {
                  console.log('Skipping fully functional row:', values);
                  continue;
                }

                const link = this.parseLink(insert.columns, values);
                if (link) {
                  links.push(link);
                  console.log('Found valid link:', link);
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

    console.log(links)
    // Второй проход: связывание
    this.linkClassesAndProperties(classes, properties, links);


    return { classes, properties };
  }

  private parseClass(columns: string[], values: string[]): ClassInfo | null {
    const id = this.getValue(columns, values, 'id');
    const name = this.getValue(columns, values, 'name');
    const description = this.getValue(columns, values, 'description');

    if (!id || !name) return null;

    return {
      id,
      name,
      description: description || '',
      properties: []
    };
  }

  private parseProperty(columns: string[], values: string[]): PropertyInfo | null {
    const id = this.getValue(columns, values, 'id');
    const name = this.getValue(columns, values, 'name');
    const description = this.getValue(columns, values, 'description');
    const dataType = parseInt(this.getValue(columns, values, 'data_type') || '0');
    const sourceClassId = this.getValue(columns, values, 'source_class_id');

    if (!id || !name) return null;

    return {
      id,
      name,
      description: description || '',
      dataType,
      sourceClassId: sourceClassId || undefined
    };
  }

  private parseLink(columns: string[], values: string[]): ClassPropertyLink | null {
    // Создаем копию значений для безопасной обработки
    const processedValues = [...values];

    // Заменяем функции на пустые строки (они нас не интересуют)
    for (let i = 0; i < processedValues.length; i++) {
      if (processedValues[i].includes('gen_random_uuid(') ||
        processedValues[i].includes(':my_utc_now') ||
        processedValues[i].includes(':my_admin_id')) {
        processedValues[i] = '';
      }
    }

    // Получаем ID класса и свойства (уже без функций)
    const classId = this.getValue(columns, processedValues, 'class_id');
    const propertyId = this.getValue(columns, processedValues, 'property_definition_id');

    // Проверяем что это валидные UUID
    if (!this.isValidUuid(classId) || !this.isValidUuid(propertyId)) {
      console.log('Skipping invalid UUIDs:', { classId, propertyId });
      return null;
    }

    return {
      classId: classId!,
      propertyId: propertyId!
    };
  }
  private isValidUuid(uuid: string | null): boolean {
    if (!uuid) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }
  //FIXME: Исправить привязку свойств к классу
  private linkClassesAndProperties(
    classes: ClassInfo[],
    properties: PropertyInfo[],
    links: ClassPropertyLink[]
  ) {
    const propertyMap = new Map(properties.map(p => [p.id, p]));
    const classMap = new Map(classes.map(c => [c.id, c]));

    let linkedCount = 0;

    links.forEach(link => {
      const cls = classMap.get(link.classId);
      const prop = propertyMap.get(link.propertyId);

      if (cls && prop) {
        if (!cls.properties.some(p => p.id === prop.id)) {
          cls.properties.push(prop);
          linkedCount++;
          console.log(`Linked: ${cls.name} ↔ ${prop.name}`);
        }
      } else {
        console.warn('Broken link - missing class or property:', link);
      }
    });

    console.log(`Successfully linked ${linkedCount} properties`);
  }

  private getValue(columns: string[], values: string[], column: string): string | null {
    const index = columns.indexOf(column);
    return index >= 0 && index < values.length ? values[index] : null;
  }
}