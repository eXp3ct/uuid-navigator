import { CacheManager } from '../cacheManager';
import { ClassInfo, PropertyInfo, ObjectInfo, RoleInfo } from '../models';

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  const sampleData = {
    classes: [{ id: 'cls1', name: 'Class1' }] as ClassInfo[],
    properties: [{ id: 'prop1', name: 'Property1' }] as PropertyInfo[],
    objects: [{ id: 'obj1', name: 'Object1' }] as ObjectInfo[],
    roles: [{ id: 'role1', name: 'Role1'}] as RoleInfo[]
  };

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  describe('isCacheValid', () => {
    it('should return false when cache is empty', () => {
      const fileHashes = new Map([['file1', 'hash1']]);
      expect(cacheManager.isCacheValid(fileHashes)).toBe(false);
    });

    it('should detect changed files', () => {
      const fileHashes = new Map([['file1', 'hash1']]);
      cacheManager.setCache(sampleData, fileHashes);

      const changedHashes = new Map([['file1', 'hash2']]);
      expect(cacheManager.isCacheValid(changedHashes)).toBe(false);
    });
  });

  describe('file cache operations', () => {
    it('should store and retrieve file cache', () => {
      const fileData = {
        hash: 'hash1',
        parsed: {
          classes: [],
          properties: [],
          links: [],
          objects: [],
          roles: []
        }
      };

      cacheManager.setFileCache('file.sql', 'hash1', fileData.parsed);
      expect(cacheManager.getFileCache('file.sql')).toEqual(fileData);
    });

    it('should invalidate single file cache', () => {
      cacheManager.setFileCache('file1.sql', 'hash1', { classes: [], properties: [], links: [], objects: [], roles: [] });
      cacheManager.invalidateFileCache('file1.sql');
      expect(cacheManager.getFileCache('file1.sql')).toBeUndefined();
    });
  });

  describe('global cache operations', () => {
    it('should set and get cache data', () => {
      const fileHashes = new Map([['file1', 'hash1']]);
      cacheManager.setCache(sampleData, fileHashes);
      expect(cacheManager.getCacheData()).toEqual(sampleData);
    });

    it('should completely clear cache', () => {
      cacheManager.setCache(sampleData, new Map());
      cacheManager.setFileCache('file1.sql', 'hash1', { classes: [], properties: [], links: [], objects: [], roles: [] });

      cacheManager.invalidateCache();

      expect(cacheManager.getCacheData()).toBeUndefined();
      expect(cacheManager.getFileCache('file1.sql')).toBeUndefined();
    });
  });

  describe('invalidateModel', () => {
    it('drops the merged model but keeps per-file parse results', () => {
      const parsed = { classes: [], properties: [], links: [], objects: [], roles: [] };
      cacheManager.setCache(sampleData, new Map([['file1', 'hash1']]));
      cacheManager.setFileCache('file1', 'hash1', parsed);

      cacheManager.invalidateModel();

      expect(cacheManager.getCacheData()).toBeUndefined();
      expect(cacheManager.getFileCache('file1')?.parsed).toBe(parsed);
    });
  });

  describe('retainFiles', () => {
    it('forgets parse results of files that are gone', () => {
      const parsed = { classes: [], properties: [], links: [], objects: [], roles: [] };
      cacheManager.setFileCache('kept.sql', 'h1', parsed);
      cacheManager.setFileCache('deleted.sql', 'h2', parsed);

      cacheManager.retainFiles(new Set(['kept.sql']));

      expect(cacheManager.getFileCache('kept.sql')).toBeDefined();
      expect(cacheManager.getFileCache('deleted.sql')).toBeUndefined();
    });
  });
});
