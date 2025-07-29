import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { sortBy } from 'lodash';

const CLASS_TABLE = 'classes';
const PROPERTY_TABLE = 'property_definitions';
const LINK_TABLE = 'classes_property_definitions';

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

interface ClassPropertyLink {
  classId: string;
  propertyId: string;
}

interface ParsedFile {
  classes: ClassInfo[];
  properties: PropertyInfo[];
  links: ClassPropertyLink[];
}

export class SqlProcessor {
  private cache: {
    data: { classes: ClassInfo[]; properties: PropertyInfo[] };
    fileHashes: Map<string, string>;
    timestamp: number;
  } | null = null;

  private fileCache = new Map<string, {
    hash: string;
    parsed: ParsedFile;
  }>();

  public async parseAllSqlFiles(forceRefresh = false): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
  }> {
    const currentFileHashes = await this.getFileHashes();

    if (!forceRefresh && this.cache && this.isCacheValid(currentFileHashes)) {
      return this.cache.data;
    }

    const { classes, properties } = await this.parseFiles(currentFileHashes);

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
    if (this.cache.fileHashes.size !== currentHashes.size) return false;

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

      if (!valueMatches) continue;

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
        if (depth === 0) start = i;
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
  }> {
    const classMap = new Map<string, ClassInfo>();
    const propertyMap = new Map<string, PropertyInfo>();
    const allLinks: ClassPropertyLink[] = [];
    let allClasses: ClassInfo[] = [];
    let allProperties: PropertyInfo[] = [];

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

    this.linkClassesAndProperties(allClasses, allProperties, allLinks);
    return {
      classes: sortBy(allClasses, c => c.name),
      properties: sortBy(allProperties, p => p.name)
    };
  }

  private async parseFile(filePath: string, fileHash: string): Promise<ParsedFile> {
    const cached = this.fileCache.get(filePath);
    if (cached && cached.hash === fileHash) {
      return cached.parsed;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const content = this.normalizeSql(document.getText());
    const inserts = this.extractInserts(content);

    const classes: ClassInfo[] = [];
    const properties: PropertyInfo[] = [];
    const links: ClassPropertyLink[] = [];

    for (const insert of inserts) {
      try {
        if (insert.tableName === CLASS_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const classInfo = this.parseClass(insert, i, filePath, document);
            if (classInfo) classes.push(classInfo);
          }
        }
        else if (insert.tableName === PROPERTY_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const property = this.parseProperty(insert, i, filePath, document);
            if (property) properties.push(property);
          }
        }
        else if (insert.tableName === LINK_TABLE) {
          for (const values of insert.values) {
            const link = this.parseLink(insert.columns, values);
            if (link) links.push(link);
          }
        }
      } catch (error) {
        console.error(`Error processing insert in ${filePath}:`, error);
      }
    }

    const parsed = { classes, properties, links };
    this.fileCache.set(filePath, { hash: fileHash, parsed });

    return parsed;
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

    if (!id || !name) return null;

    return {
      id,
      name: this.stripQuotes(name),
      description: this.stripQuotes(description || '') || '',
      properties: [],
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

    links.forEach(link => {
      const cls = classMap.get(link.classId);
      const prop = propertyMap.get(link.propertyId);

      if (cls && prop) {
        if (!cls.properties.some(p => p.id === prop.id)) {
          cls.properties.push(prop);
        }
      } else {
        if (!cls) console.warn(`Class not found for link: ${link.classId}`);
        if (!prop) console.warn(`Property not found for link: ${link.propertyId}`);
      }
    });
  }

  private getValue(columns: string[], values: string[], column: string): string | null {
    const index = columns.indexOf(column);
    return index >= 0 && index < values.length ? values[index] : null;
  }

  private isValidUuid(uuid: string | null): boolean {
    return !!uuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }
}