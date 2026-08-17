import * as vscode from 'vscode';
import { ObjectInfo, ClassInfo, PropertyInfo, ClassPropertyLink, RoleInfo } from "./models";

export class SqlParser {
  public normalizeSql(content: string): string {
    return content
      .replace(/--.*$/gm, '') // Удаляем однострочные комментарии
      .replace(/\/\*[\s\S]*?\*\//g, '') // Удаляем многострочные комментарии
      // Сначала специальные случаи
      .replace(/:my_utc_now\b/g, 'NULL::timestamp') // \b - граница слова
      .replace(/:my_admin_id\b/g, 'NULL::uuid') // \b - граница слова
      .replace(/gen_random_uuid\(\)/g, 'NULL::uuid')
      // Затем общий случай для остальных параметров
      .replace(/:(\w+)/g, 'NULL');
  }

  public normalizeValue(value: string): string {
    // Если значение начинается и заканчивается кавычками - обрабатываем как строку
    if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
      // Убираем внешние кавычки
      let result = value.slice(1, -1);
      // Заменяем экранированные кавычки
      result = result.replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
      // Заменяем специальные значения внутри строки
      result = result
        .replace(/:my_utc_now/g, 'NULL')
        .replace(/:my_admin_id/g, 'NULL')
        .replace(/gen_random_uuid\(\)/g, 'NULL');
      return result;
    }

    // Для нестроковых значений просто делаем замены
    return value
      .replace(/:my_utc_now/g, 'NULL')
      .replace(/:my_admin_id/g, 'NULL')
      .replace(/gen_random_uuid\(\)/g, 'NULL')
      .trim();
  }

  public extractInserts(content: string): {
    tableName: string;
    columns: string[];
    values: string[][];
    positions: number[];
  }[] {
    const inserts = [];
    // Матчит только заголовок "INSERT INTO table (cols) VALUES" — сам блок значений
    // ищется отдельно через scanValuesClause, т.к. он может содержать произвольно
    // вложенные скобки внутри строковых литералов (например jsonb-функции вида
    // two_pass_tsvector(jsonb_to_text({0}))), которые non-string-aware regex с
    // ограниченной глубиной вложенности обрезает молча.
    const headerRegex = /INSERT\s+INTO\s+([^\s(]+)\s*\(([^)]+)\)\s*VALUES\s*/gi;

    let match;
    while ((match = headerRegex.exec(content)) !== null) {
      const tableName = match[1].trim();
      const columns = match[2].split(',').map(c => c.trim().replace(/["']/g, ''));
      const valuesStart = match.index + match[0].length;
      const valuesText = this.scanValuesClause(content, valuesStart);
      headerRegex.lastIndex = valuesStart + valuesText.length;

      const valueMatches = this.extractValueGroups(valuesText);

      if (!valueMatches) { continue; }

      const values = valueMatches.map(vGroup => {
        // Удаляем внешние скобки
        const inner = vGroup.slice(1, -1).trim();
        const values = [];
        let current = '';
        let inString = false;
        let stringChar = '';
        let depth = 0;

        for (let i = 0; i < inner.length; i++) {
          const char = inner[i];

          // Обработка строковых литералов
          if (char === "'" || char === '"') {
            if (!inString) {
              inString = true;
              stringChar = char;
            } else if (char === stringChar) {
              // Проверяем, что это не экранированная кавычка
              if (inner[i - 1] !== '\\') {
                inString = false;
              }
            }
          }

          // Обработка скобок только вне строковых литералов
          if (!inString && (char === '(' || char === ')')) {
            if (char === '(') { depth++; }
            if (char === ')') { depth--; }
          }

          // Разделитель - запятая вне строки и скобок
          if (char === ',' && !inString && depth === 0) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }

        // Добавляем последнее значение
        if (current.trim()) {
          values.push(current.trim());
        }

        return values.map(v => this.normalizeValue(v));
      });

      const positions = [];
      const uuidRegex = /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi;
      let uuidMatch;

      // Ищем UUID в оригинальном content, используя позицию начала VALUES
      const valuesContent = content.slice(valuesStart);

      while ((uuidMatch = uuidRegex.exec(valuesContent)) !== null) {
        // Добавляем позицию относительно начала всего content
        positions.push(valuesStart + uuidMatch.index);
      }

      inserts.push({ tableName, columns, values, positions });
    }

    return inserts;
  }

  /**
   * Находит конец блока VALUES, начиная с позиции start: строково- и скобочно-
   * осознанное сканирование до первого ';' вне строки и вне скобок (или до конца
   * содержимого, если ';' не встретился).
   */
  private scanValuesClause(content: string, start: number): string {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let i = start;

    for (; i < content.length; i++) {
      const char = content[i];

      if (inString) {
        if (char === stringChar && content[i - 1] !== '\\') {
          inString = false;
        }
        continue;
      }

      if (char === "'" || char === '"') {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '(') { depth++; continue; }
      if (char === ')') { depth--; continue; }

      if (char === ';' && depth === 0) { break; }
    }

    return content.slice(start, i).trim();
  }

  public extractValueGroups(str: string): string[] | null {
    const groups = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      // Обработка строковых литералов
      if (char === "'" || char === '"') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          // Проверяем, что это не экранированная кавычка
          if (str[i - 1] !== '\\') {
            inString = false;
          }
        }
      }

      // Обработка скобок только вне строковых литералов
      if (!inString) {
        if (char === '(') {
          if (depth === 0) { start = i; }
          depth++;
        } else if (char === ')') {
          depth--;
          if (depth === 0 && start !== -1) {
            groups.push(str.substring(start, i + 1));
            start = -1;
          }
        }
      }
    }

    return groups.length > 0 ? groups : null;
  }

  public stripQuotes(str: string): string {
    // Удаляем только внешние кавычки, если они есть
    if ((str.startsWith("'") && str.endsWith("'")) ||
      (str.startsWith('"') && str.endsWith('"'))) {
      return str.slice(1, -1);
    }
    return str;
  }

  public parseObject(
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
      classId: this.stripQuotes(classId),
      parentId: parentId === 'null' ? null : this.stripQuotes(parentId || ''),
      filePath,
      lineNumber: document.positionAt(positions[index]).line + 1,
      position: positions[index]
    };
  }



  public parseClass(
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

  public parseProperty(
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
      sourceClassId: this.stripQuotes(sourceClassId || '') || undefined,
      filePath,
      lineNumber: document.positionAt(positions[index]).line + 1,
      position: positions[index]
    };
  }

  public parseLink(columns: string[], values: string[]): ClassPropertyLink | null {
    const normalized = values.map(v => this.normalizeValue(v));
    const classId = this.getValue(columns, normalized, 'class_id');
    const propertyId = this.getValue(columns, normalized, 'property_definition_id');

    if (!this.isValidUuid(classId) || !this.isValidUuid(propertyId) || !classId || !propertyId) {
      return null;
    }

    return { classId, propertyId };
  }

  public parseRole(
    insert: any,
    index: number,
    filePath: string,
    document: vscode.TextDocument
  ): RoleInfo | null {
    const { columns, values, positions } = insert;
    const row = values[index];

    const id = this.getValue(columns, row, 'id');
    const name = this.getValue(columns, row, 'name');
    const description = this.getValue(columns, row, 'description');
    
    if (!id || !name) { return null; }

    return {
      id,
      name: this.stripQuotes(name),
      description: this.stripQuotes(description || '') || '',
      filePath,
      lineNumber: document.positionAt(positions[index]).line + 1,
      position: positions[index]
    };
  }


  public getValue(columns: string[], values: string[], column: string): string | null {
    const index = columns.indexOf(column);
    return index >= 0 && index < values.length ? values[index] : null;
  }

  public isValidUuid(uuid: string | null): boolean {
    return !!uuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }
}