import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { SqlProcessor } from '../sqlProcessor';
import { AliasService } from '../aliasService';
import { SqlParser } from '../sqlParser';
import { ModelLinker } from '../modelLinker';
import { CacheManager } from '../cacheManager';
import { ClassInfo, PropertyInfo, ObjectInfo, ParsedFile } from '../models';

jest.mock('vscode');
jest.mock('crypto');
jest.mock('../sqlParser');
jest.mock('../modelLinker');
jest.mock('../cacheManager');
jest.mock('../aliasService', () => {
  return {
    AliasService: jest.fn().mockImplementation(() => ({
      onAliasesChanged: jest.fn()
    }))
  }
});
describe('SqlProcessor', () => {
  let sqlProcessor: SqlProcessor;
  let mockAliasService: jest.Mocked<AliasService>;
  let mockParser: jest.Mocked<SqlParser>;
  let mockLinker: jest.Mocked<ModelLinker>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockContext: vscode.ExtensionContext;

  const mockFileHashes = new Map<string, string>([
    ['file1.sql', 'hash1'],
    ['file2.sql', 'hash2']
  ]);

  const sampleParsedData = {
    classes: [{ id: 'cls1', name: 'Class1' }] as ClassInfo[],
    properties: [{ id: 'prop1', name: 'Property1' }] as PropertyInfo[],
    objects: [{ id: 'obj1', name: 'Object1' }] as ObjectInfo[]
  };

  beforeEach(() => {
    // Инициализируем мок ExtensionContext
    mockContext = {
      subscriptions: [],
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
        setKeysForSync: jest.fn()
      },
      workspaceState: {
        get: jest.fn(),
        update: jest.fn()
      },
      extensionPath: '',
      asAbsolutePath: jest.fn(),
    } as unknown as vscode.ExtensionContext;

    // Явно создаём мок AliasService с методом onAliasesChanged
    mockAliasService = {
      onAliasesChanged: jest.fn(),
    } as unknown as jest.Mocked<AliasService>;

    mockParser = new SqlParser() as jest.Mocked<SqlParser>;
    mockLinker = new ModelLinker(mockAliasService) as jest.Mocked<ModelLinker>;
    mockCacheManager = new CacheManager() as jest.Mocked<CacheManager>;

    // Создаём экземпляр SqlProcessor с нашими моками
    sqlProcessor = new SqlProcessor(mockAliasService, mockParser, mockLinker, mockCacheManager);

    // Настройка моков vscode
    (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
      { fsPath: 'file1.sql' },
      { fsPath: 'file2.sql' }
    ]);

    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
      getText: jest.fn().mockReturnValue('sql content'),
      uri: { fsPath: 'test.sql' }
    });

    (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('file content'));

    // Мок для crypto
    (crypto.createHash as jest.Mock).mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mocked_hash')
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseAllSqlFiles', () => {
    it('should return cached data when cache is valid', async () => {
      mockCacheManager.isCacheValid.mockReturnValue(true);
      mockCacheManager.getCacheData.mockReturnValue(sampleParsedData);

      const result = await sqlProcessor.parseAllSqlFiles();

      expect(result).toEqual(sampleParsedData);
      expect(mockCacheManager.isCacheValid).toHaveBeenCalled();
      expect(mockCacheManager.getCacheData).toHaveBeenCalled();
    });

    it('should parse files and update cache when cache is invalid', async () => {
      mockCacheManager.isCacheValid.mockReturnValue(false);
      (sqlProcessor as any).parseFiles = jest.fn().mockResolvedValue(sampleParsedData);

      const result = await sqlProcessor.parseAllSqlFiles();

      expect(result).toEqual(sampleParsedData);
      expect(mockCacheManager.setCache).toHaveBeenCalledWith(sampleParsedData, expect.any(Map));
    });

    it('should force refresh when requested', async () => {
      (sqlProcessor as any).parseFiles = jest.fn().mockResolvedValue(sampleParsedData);

      const result = await sqlProcessor.parseAllSqlFiles(true);

      expect(result).toEqual(sampleParsedData);
      expect(mockCacheManager.isCacheValid).not.toHaveBeenCalled();
      expect(mockCacheManager.setCache).toHaveBeenCalled();
    });
  });

  describe('invalidateCache', () => {
    it('should call cacheManager.invalidateCache', () => {
      sqlProcessor.invalidateCache();
      expect(mockCacheManager.invalidateCache).toHaveBeenCalled();
    });
  });

  describe('invalidateCacheForFile', () => {
    it('should call cacheManager.invalidateFileCache', () => {
      const filePath = 'test.sql';
      sqlProcessor.invalidateCacheForFile(filePath);
      expect(mockCacheManager.invalidateFileCache).toHaveBeenCalledWith(filePath);
    });
  });

  describe('getFileHashes', () => {
    it('should return correct file hashes', async () => {
      const hashes = await (sqlProcessor as any).getFileHashes();

      expect(hashes.size).toBe(2);
      expect(hashes.get('file1.sql')).toBe('mocked_hash');
      expect(hashes.get('file2.sql')).toBe('mocked_hash');
      expect(vscode.workspace.findFiles).toHaveBeenCalledWith('**/*.sql');
    });
  });

  describe('parseFiles', () => {
    it('should process all files and link models', async () => {
      const mockParsedFile: ParsedFile = {
        classes: [{
          id: 'cls1', name: 'Class1',
          description: '',
          classType: 0,
          properties: [],
          objects: []
        }],
        properties: [{
          id: 'prop1', name: 'Property1',
          description: '',
          dataType: 0
        }],
        links: [{ classId: 'cls1', propertyId: 'prop1' }],
        objects: [{
          id: 'obj1', name: 'Object1', classId: 'cls1',
          description: '',
          parentId: null
        }]
      };

      (sqlProcessor as any).parseFile = jest.fn().mockResolvedValue(mockParsedFile);
      mockLinker.sortModel.mockReturnValue(sampleParsedData);

      const result = await (sqlProcessor as any).parseFiles(mockFileHashes);

      expect(result).toEqual(sampleParsedData);
      expect((sqlProcessor as any).parseFile).toHaveBeenCalledTimes(2);
      expect(mockLinker.linkClassesAndProperties).toHaveBeenCalled();
      expect(mockLinker.linkClassesAndObjects).toHaveBeenCalled();
      expect(mockLinker.sortModel).toHaveBeenCalled();
    });
  });

  describe('parseFile', () => {
    it('should return cached data if available', async () => {
      const cachedData: ParsedFile = {
        classes: [],
        properties: [],
        links: [],
        objects: []
      };

      mockCacheManager.getFileCache.mockReturnValue({
        hash: 'hash1',
        parsed: cachedData
      });

      const result = await (sqlProcessor as any).parseFile('file1.sql', 'hash1');

      expect(result).toEqual(cachedData);
      expect(mockParser.normalizeSql).not.toHaveBeenCalled();
    });

    it('should parse file and cache results when no cache', async () => {
      const mockInserts = [{
        tableName: 'classes',
        columns: ['id', 'name'],
        values: [['cls1', 'Class1']],
        positions: []
      }];

      mockParser.normalizeSql.mockReturnValue('normalized sql');
      mockParser.extractInserts.mockReturnValue(mockInserts);
      mockParser.parseClass.mockReturnValue({
        id: 'cls1', name: 'Class1',
        description: '',
        classType: 0,
        properties: [],
        objects: []
      });

      const result = await (sqlProcessor as any).parseFile('file1.sql', 'hash1');

      expect(result.classes).toHaveLength(1);
      expect(mockParser.normalizeSql).toHaveBeenCalled();
      expect(mockParser.extractInserts).toHaveBeenCalled();
      expect(mockParser.parseClass).toHaveBeenCalled();
      expect(mockCacheManager.setFileCache).toHaveBeenCalled();
    });

    it('should handle different table types', async () => {
      const mockInserts = [
        {
          tableName: 'classes',
          columns: ['id', 'name'],
          values: [['cls1', 'Class1']],
          positions: []
        },
        {
          tableName: 'property_definitions',
          columns: ['id', 'name'],
          values: [['prop1', 'Property1']],
          positions: []
        },
        {
          tableName: 'classes_property_definitions',
          columns: ['class_id', 'property_id'],
          values: [['cls1', 'prop1']],
          positions: []
        },
        {
          tableName: 'objects',
          columns: ['id', 'name', 'class_id'],
          values: [['obj1', 'Object1', 'cls1']],
          positions: []
        }
      ];

      mockParser.normalizeSql.mockReturnValue('normalized sql');
      mockParser.extractInserts.mockReturnValue(mockInserts);
      mockParser.parseClass.mockReturnValue({
        id: 'cls1', name: 'Class1',
        description: '',
        classType: 0,
        properties: [],
        objects: []
      });
      mockParser.parseProperty.mockReturnValue({
        id: 'prop1', name: 'Property1',
        description: '',
        dataType: 0
      });
      mockParser.parseLink.mockReturnValue({ classId: 'cls1', propertyId: 'prop1' });
      mockParser.parseObject.mockReturnValue({
        id: 'obj1', name: 'Object1', classId: 'cls1',
        description: '',
        parentId: null
      });

      const result = await (sqlProcessor as any).parseFile('file1.sql', 'hash1');

      expect(result.classes).toHaveLength(1);
      expect(result.properties).toHaveLength(1);
      expect(result.links).toHaveLength(1);
      expect(result.objects).toHaveLength(1);
    });
  });
});