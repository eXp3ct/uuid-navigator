import { ClassInfo, PropertyInfo, ObjectInfo, ParsedFile, RoleInfo } from "./models";

export class CacheManager {
  private cache: {
    data: { classes: ClassInfo[]; properties: PropertyInfo[]; objects: ObjectInfo[], roles: RoleInfo[] };
    fileHashes: Map<string, string>;
    timestamp: number;
  } | null = null;

  private fileCache = new Map<string, {
    hash: string;
    parsed: ParsedFile;
  }>();


  public isCacheValid(currentHashes: Map<string, string>): boolean {
    if (!this.cache) { return false; }
    if (this.cache.fileHashes.size !== currentHashes.size) { return false; }

    for (const [path, hash] of currentHashes) {
      if (this.cache.fileHashes.get(path) !== hash) {
        return false;
      }
    }

    return true;
  }

  public getCacheData() {
    return this.cache?.data;
  }

  public setCache(data: { classes: ClassInfo[]; properties: PropertyInfo[]; objects: ObjectInfo[]; roles: RoleInfo[] }, fileHashes: Map<string, string>) {
    this.cache = {
      data,
      fileHashes,
      timestamp: Date.now()
    };
  }

  public getFileCache(filePath: string) {
    return this.fileCache.get(filePath);
  }

  public setFileCache(filePath: string, hash: string, parsed: ParsedFile) {
    this.fileCache.set(filePath, { hash, parsed });
  }

  public invalidateCache() {
    this.cache = null;
    this.fileCache.clear();
  }

  public invalidateFileCache(filePath: string) {
    this.fileCache.delete(filePath);
    if (this.cache) {
      this.cache.fileHashes.delete(filePath);
    }
  }
}