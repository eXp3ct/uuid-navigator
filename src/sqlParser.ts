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
    const classMap = new Map<string, ClassInfo>();

    const files = await vscode.workspace.findFiles('**/*.sql');
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
                }
              }
            } else if (insert.tableName === 'classes_property_definitions') {
              for (const values of insert.values) {
                this.linkClassProperty(insert.columns, values, classMap, properties);
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
    console.log('Found classes:', classes);
    console.log('Found properties:', properties);
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

  private linkClassProperty(columns: string[], values: string[], classMap: Map<string, ClassInfo>, properties: PropertyInfo[]) {
    const classId = this.getValue(columns, values, 'class_id');
    const propertyId = this.getValue(columns, values, 'property_definition_id');

    if (!classId || !propertyId) return;

    const cls = classMap.get(classId);
    const prop = properties.find(p => p.id === propertyId);

    if (cls && prop) {
      // Убедитесь, что свойство не добавлено ранее
      if (!cls.properties.some(p => p.id === prop.id)) {
        cls.properties.push(prop);
      }
    }
  }

  private getValue(columns: string[], values: string[], column: string): string | null {
    const index = columns.indexOf(column);
    return index >= 0 && index < values.length ? values[index] : null;
  }
}