import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { AliasService } from './aliasService';
import { ClassInfo, ClassPropertyLink, ObjectInfo, ParsedFile, PropertyInfo, RoleInfo } from './models';
import { SqlParser } from './sqlParser';
import { ModelLinker } from './modelLinker';
import { CacheManager } from './cacheManager';
import { ConfigFileRepository } from './configFileRepository';
import { ConfigFileParser } from './parsers/configParser';
import { SqlFileParser } from './parsers/sqlFileParser';
import { StructuredConfigParser } from './parsers/structuredConfigParser';

export class SqlProcessor {
  private readonly parsers: ConfigFileParser[];

  constructor(
    private aliasService: AliasService,
    private parser: SqlParser = new SqlParser(),
    private linker: ModelLinker = new ModelLinker(aliasService),
    private cacheManager: CacheManager = new CacheManager(),
    private repository: ConfigFileRepository = new ConfigFileRepository()
  ) {
    this.parsers = [new SqlFileParser(this.parser), new StructuredConfigParser()];

    this.aliasService.onAliasesChanged(() => {
      this.cacheManager.invalidateCache();
    });
  }

  public async parseAllSqlFiles(forceRefresh = false): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
    objects: ObjectInfo[];
    roles: RoleInfo[];
  }> {
    const currentFileHashes = await this.getFileHashes();

    if (!forceRefresh) {
      const cacheData = this.cacheManager.getCacheData();
      if (cacheData && this.cacheManager.isCacheValid(currentFileHashes)) {
        return cacheData;
      }
    }

    const { classes, properties, objects, roles } = await this.parseFiles(currentFileHashes);
    this.cacheManager.setCache({ classes, properties, objects, roles }, currentFileHashes);

    return { classes, properties, objects, roles };
  }

  public invalidateCache(): void {
    this.cacheManager.invalidateCache();
  }

  public invalidateCacheForFile(filePath: string): void {
    this.cacheManager.invalidateFileCache(filePath);
  }

  private async getFileHashes(): Promise<Map<string, string>> {
    const files = this.sortFiles(await this.repository.findFiles());

    const entries = await Promise.all(files.map(async file => {
      try {
        const content = await vscode.workspace.fs.readFile(file);
        return [file.fsPath, crypto.createHash('sha1').update(content).digest('hex')] as const;
      } catch (error) {
        console.error(`Error hashing file ${file.fsPath}:`, error);
        return undefined;
      }
    }));

    // Порядок вставки задаёт приоритет при дубликатах id ("первый побеждает"),
    // поэтому он не должен зависеть от скорости чтения файлов.
    const hashes = new Map<string, string>();
    for (const entry of entries) {
      if (entry) { hashes.set(entry[0], entry[1]); }
    }
    return hashes;
  }

  /** Структурные файлы (yaml/json) раньше sql, внутри группы — по пути: YAML перекрывает SQL. */
  private sortFiles(files: vscode.Uri[]): vscode.Uri[] {
    const group = (file: vscode.Uri) => (/\.sql$/i.test(file.fsPath) ? 1 : 0);
    return [...files].sort((a, b) => {
      const byGroup = group(a) - group(b);
      if (byGroup !== 0) { return byGroup; }
      return a.fsPath < b.fsPath ? -1 : a.fsPath > b.fsPath ? 1 : 0;
    });
  }

  private async parseFiles(fileHashes: Map<string, string>): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
    objects: ObjectInfo[];
    roles: RoleInfo[];
  }> {
    const classMap = new Map<string, ClassInfo>();
    const propertyMap = new Map<string, PropertyInfo>();
    const objectMap = new Map<string, ObjectInfo>();
    const rolesMap = new Map<string, RoleInfo>();

    const allLinks: ClassPropertyLink[] = [];
    let allClasses: ClassInfo[] = [];
    let allProperties: PropertyInfo[] = [];
    let allObjects: ObjectInfo[] = [];
    let allRoles: RoleInfo[] = [];

    for (const [filePath, fileHash] of fileHashes) {
      try {
        const { classes, properties, links, objects, roles } = await this.parseFile(filePath, fileHash);

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

        roles.forEach(role => {
          if(!rolesMap.has(role.id)){
            rolesMap.set(role.id, role);
            allRoles.push(role);
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
    return this.linker.sortModel(allClasses, allProperties, allObjects, allRoles);
  }

  private async parseFile(filePath: string, fileHash: string): Promise<ParsedFile> {
    const cached = this.cacheManager.getFileCache(filePath);
    if (cached && cached.hash === fileHash) {
      return cached.parsed;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const parser = this.parsers.find(p => p.canHandle(filePath));
    const parsed = parser
      ? parser.parseFile(filePath, document.getText(), document)
      : { classes: [], properties: [], links: [], objects: [], roles: [] };

    this.cacheManager.setFileCache(filePath, fileHash, parsed);
    return parsed;
  }
}

export { SqlParser };
