import * as vscode from 'vscode';
import { ParsedFile } from '../models';
import { SqlParser } from '../sqlParser';
import { ConfigFileParser } from './configParser';

const CLASS_TABLE = 'classes';
const PROPERTY_TABLE = 'property_definitions';
const LINK_TABLE = 'classes_property_definitions';
const OBJECTS_TABLE = 'objects';
const ROLES_TABLE = 'public.roles';

export class SqlFileParser implements ConfigFileParser {
  constructor(private parser: SqlParser = new SqlParser()) { }

  public canHandle(filePath: string): boolean {
    return filePath.endsWith('.sql');
  }

  public parseFile(filePath: string, content: string, document: vscode.TextDocument): ParsedFile {
    const normalized = this.parser.normalizeSql(content);
    const inserts = this.parser.extractInserts(normalized);

    const parsed: ParsedFile = { classes: [], properties: [], links: [], objects: [], roles: [] };

    for (const insert of inserts) {
      try {
        if (insert.tableName === CLASS_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const classInfo = this.parser.parseClass(insert, i, filePath, document);
            if (classInfo) { parsed.classes.push(classInfo); }
          }
        }
        else if (insert.tableName === PROPERTY_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const property = this.parser.parseProperty(insert, i, filePath, document);
            if (property) { parsed.properties.push(property); }
          }
        }
        else if (insert.tableName === LINK_TABLE) {
          for (const values of insert.values) {
            const link = this.parser.parseLink(insert.columns, values);
            if (link) { parsed.links.push(link); }
          }
        }
        else if (insert.tableName === OBJECTS_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const object = this.parser.parseObject(insert, i, filePath, document);
            if (object) { parsed.objects.push(object); }
          }
        }
        else if (insert.tableName === ROLES_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const role = this.parser.parseRole(insert, i, filePath, document);
            if (role) { parsed.roles.push(role); }
          }
        }
      } catch (error) {
        console.error(`Error processing insert in ${filePath}:`, error);
      }
    }

    return parsed;
  }
}
