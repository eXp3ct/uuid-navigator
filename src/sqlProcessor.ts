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
import { createPositionLookup } from './positionLookup';

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

    // Алиасы влияют только на линковку, результаты парсинга файлов от них не зависят
    this.aliasService.onAliasesChanged(() => {
      this.cacheManager.invalidateModel();
    });
  }

  public async parseAllSqlFiles(forceRefresh = false): Promise<{
    classes: ClassInfo[];
    properties: PropertyInfo[];
    objects: ObjectInfo[];
    roles: RoleInfo[];
  }> {
    const files = await this.readFiles();
    const currentFileHashes = new Map([...files].map(([filePath, file]) => [filePath, file.hash]));

    if (!forceRefresh) {
      const cacheData = this.cacheManager.getCacheData();
      if (cacheData && this.cacheManager.isCacheValid(currentFileHashes)) {
        return cacheData;
      }
    }

    const { classes, properties, objects, roles } = await this.parseFiles(files);
    this.cacheManager.retainFiles(new Set(files.keys()));
    this.cacheManager.setCache({ classes, properties, objects, roles }, currentFileHashes);

    return { classes, properties, objects, roles };
  }

  public invalidateCache(): void {
    this.cacheManager.invalidateCache();
  }

  public invalidateCacheForFile(filePath: string): void {
    this.cacheManager.invalidateFileCache(filePath);
  }

  /**
   * Читает все файлы конфигураций и хеширует их содержимое. Парсится потом ровно этот же
   * текст, поэтому хеш в кеше всегда соответствует разобранному содержимому
   * (несохранённые правки в редакторе не попадают в кеш под хешем файла с диска).
   */
  private async readFiles(): Promise<Map<string, ReadFile>> {
    const files = this.sortFiles(await this.repository.findFiles());

    const entries = await Promise.all(files.map(async file => {
      try {
        const bytes = await vscode.workspace.fs.readFile(file);
        const hash = crypto.createHash('sha1').update(bytes).digest('hex');
        return [file.fsPath, { hash, bytes }] as const;
      } catch (error) {
        console.error(`Error hashing file ${file.fsPath}:`, error);
        return undefined;
      }
    }));

    // Порядок вставки задаёт приоритет при дубликатах id ("первый побеждает"),
    // поэтому он не должен зависеть от скорости чтения файлов.
    const result = new Map<string, ReadFile>();
    for (const entry of entries) {
      if (entry) { result.set(entry[0], entry[1]); }
    }
    return result;
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

  private async parseFiles(files: Map<string, ReadFile>): Promise<{
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

    for (const [filePath, file] of files) {
      try {
        const { classes, properties, links, objects, roles } = this.parseFile(filePath, file);

        classes.forEach(cls => {
          if (!classMap.has(cls.id)) {
            // Линкер наполняет properties/objects класса. Классы из кеша по файлу
            // переиспользуются между пересборками, поэтому линкуем копию — иначе
            // в классе оставались бы свойства/объекты из прошлой сборки.
            const fresh: ClassInfo = { ...cls, properties: [], objects: [] };
            classMap.set(cls.id, fresh);
            allClasses.push(fresh);
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

  private parseFile(filePath: string, file: ReadFile): ParsedFile {
    const cached = this.cacheManager.getFileCache(filePath);
    if (cached && cached.hash === file.hash) {
      return cached.parsed;
    }

    // TextDecoder отбрасывает BOM, как и TextDocument в VS Code, так что смещения совпадают
    const content = utf8.decode(file.bytes);
    const parser = this.parsers.find(p => p.canHandle(filePath));
    const parsed = parser
      ? parser.parseFile(filePath, content, createPositionLookup(content))
      : { classes: [], properties: [], links: [], objects: [], roles: [] };

    this.cacheManager.setFileCache(filePath, file.hash, parsed);
    return parsed;
  }
}

interface ReadFile {
  hash: string;
  bytes: Uint8Array;
}

const utf8 = new TextDecoder('utf-8');

export { SqlParser };
