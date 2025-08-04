import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { AliasService } from './aliasService';
import { ClassInfo, ClassPropertyLink, ObjectInfo, ParsedFile, PropertyInfo } from './models';
import { SqlParser } from './sqlParser';
import { ModelLinker } from './modelLinker';
import { CacheManger } from './cacheManager';

const CLASS_TABLE = 'classes';
const PROPERTY_TABLE = 'property_definitions';
const LINK_TABLE = 'classes_property_definitions';
const OBJECTS_TABLE = 'objects';



export class SqlProcessor {

  constructor(
    private aliasService: AliasService,
    private parser: SqlParser = new SqlParser(),
    private linker: ModelLinker = new ModelLinker(aliasService),
    private cacheManager: CacheManger = new CacheManger()
  ) {
    this.aliasService.onAliasesChanged(() => {
      this.cacheManager.invalidateCache();
    });
  }

  public async parseAllSqlFiles(forceRefresh = false): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
    objects: ObjectInfo[];
  }> {
    const currentFileHashes = await this.getFileHashes();

    if (!forceRefresh) {
      const cacheData = this.cacheManager.getCacheData();
      if (cacheData && this.cacheManager.isCacheValid(currentFileHashes)) {
        return cacheData;
      }
    }

    const { classes, properties, objects } = await this.parseFiles(currentFileHashes);
    this.cacheManager.setCache({ classes, properties, objects }, currentFileHashes);

    return { classes, properties, objects };
  }

  public invalidateCache(): void {
    this.cacheManager.invalidateCache();
  }

  public invalidateCacheForFile(filePath: string): void {
    this.cacheManager.invalidateFileCache(filePath);
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
    this.linker.linkClassesAndProperties(allClasses, allProperties, allLinks);
    this.linker.linkClassesAndObjects(allClasses, allObjects);

    // Сортируем и возвращаем
    return this.linker.sortModel(allClasses, allProperties, allObjects);
  }

  private async parseFile(filePath: string, fileHash: string): Promise<ParsedFile> {
    const cached = this.cacheManager.getFileCache(filePath);
    if (cached && cached.hash === fileHash) {
      return cached.parsed;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const content = this.parser.normalizeSql(document.getText());
    const inserts = this.parser.extractInserts(content);

    const classes: ClassInfo[] = [];
    const properties: PropertyInfo[] = [];
    const links: ClassPropertyLink[] = [];
    const objects: ObjectInfo[] = [];

    for (const insert of inserts) {
      try {
        if (insert.tableName === CLASS_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const classInfo = this.parser.parseClass(insert, i, filePath, document);
            if (classInfo) {classes.push(classInfo);}
          }
        }
        else if (insert.tableName === PROPERTY_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const property = this.parser.parseProperty(insert, i, filePath, document);
            if (property) {properties.push(property);}
          }
        }
        else if (insert.tableName === LINK_TABLE) {
          for (const values of insert.values) {
            const link = this.parser.parseLink(insert.columns, values);
            if (link) {links.push(link);}
          }
        }
        else if (insert.tableName === OBJECTS_TABLE) {
          for (let i = 0; i < insert.values.length; i++) {
            const object = this.parser.parseObject(insert, i, filePath, document);
            if (object) {objects.push(object);}
          }
        }
      } catch (error) {
        console.error(`Error processing insert in ${filePath}:`, error);
      }
    }

    const parsed = { classes, properties, links, objects };
    this.cacheManager.setFileCache(filePath, fileHash, parsed);
    return parsed;
  }
}

export { SqlParser };
