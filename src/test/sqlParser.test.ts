
import * as vscode from 'vscode';
import { SqlParser } from '../sqlParser';

jest.mock('vscode');

describe('SqlParser', () => {
  let parser: SqlParser;
  let mockDocument: vscode.TextDocument;

  beforeEach(() => {
    parser = new SqlParser();

    // Инициализация мока документа
    mockDocument = {
      positionAt: jest.fn().mockReturnValue({ line: 0 }),
      uri: vscode.Uri.file('/test/path.sql')
    } as unknown as vscode.TextDocument;
  });

  describe('normalizeSql', () => {
    it('should remove single-line comments', () => {
      const sql = `-- Comment\nSELECT * FROM table`;
      expect(parser.normalizeSql(sql)).toBe('\nSELECT * FROM table');
    });

    it('should remove multi-line comments', () => {
      const sql = `/* Comment */SELECT * FROM table`;
      expect(parser.normalizeSql(sql)).toBe('SELECT * FROM table');
    });

    it('should replace :my_utc_now with NULL:NULL', () => {
      const sql = `VALUES (:my_utc_now)`;
      expect(parser.normalizeSql(sql)).toBe('VALUES (NULL:NULL)');
    });

    it('should replace :my_admin_id with NULL:NULL', () => {
      const sql = `VALUES (:my_admin_id)`;
      expect(parser.normalizeSql(sql)).toBe('VALUES (NULL:NULL)');
    });

    it('should replace gen_random_uuid() with NULL:NULL', () => {
      const sql = `VALUES (gen_random_uuid())`;
      expect(parser.normalizeSql(sql)).toBe('VALUES (NULL:NULL)');
    });

    it('should replace other placeholders with NULL', () => {
      const sql = `VALUES (:test_param)`;
      expect(parser.normalizeSql(sql)).toBe('VALUES (NULL)');
    });
  });

  describe('normalizeValue', () => {
    it('should handle quoted strings', () => {
      const value = `'test value'`;
      expect(parser.normalizeValue(value)).toBe('test value');
    });

    it('should handle double-quoted strings', () => {
      const value = `"test value"`;
      expect(parser.normalizeValue(value)).toBe('test value');
    });

    it('should replace placeholders in strings', () => {
      const value = `'test :my_utc_now value'`;
      expect(parser.normalizeValue(value)).toBe('test NULL value');
    });

    it('should trim and normalize unquoted values', () => {
      const value = `  :my_admin_id  `;
      expect(parser.normalizeValue(value)).toBe('NULL');
    });

    it('should handle empty strings', () => {
      const value = `''`;
      expect(parser.normalizeValue(value)).toBe('');
    });
  });

  describe('extractInserts', () => {
    it('should parse simple INSERT statement', () => {
      const sql = `INSERT INTO classes (id, name) VALUES ('uuid', 'Test')`;
      const result = parser.extractInserts(sql);

      expect(result).toHaveLength(1);
      expect(result[0].tableName).toBe('classes');
      expect(result[0].columns).toEqual(['id', 'name']);
      expect(result[0].values).toEqual([['uuid', 'Test']]);
    });

    it('should parse multiple value groups', () => {
      const sql = `INSERT INTO table (id) VALUES (1), (2)`;
      const result = parser.extractInserts(sql);

      expect(result[0].values).toEqual([['1'], ['2']]);
    });

    it('should handle values with commas inside strings', () => {
      const sql = `INSERT INTO table (name) VALUES ('Name, with, commas')`;
      const result = parser.extractInserts(sql);

      expect(result[0].values[0][0]).toBe('Name, with, commas');
    });

    it('should handle escaped quotes in strings', () => {
      const sql = `INSERT INTO table (name) VALUES ('Escaped \\' quote')`;
      const result = parser.extractInserts(sql);

      expect(result[0].values[0][0]).toBe("Escaped ' quote");
    });

    it('should return empty array for invalid SQL', () => {
      const sql = `NOT AN INSERT STATEMENT`;
      expect(parser.extractInserts(sql)).toEqual([]);
    });

    it('should extract UUID positions', () => {
      const sql = `INSERT INTO table (id) VALUES ('123e4567-e89b-12d3-a456-426614174000')`;
      const result = parser.extractInserts(sql);

      // Правильная позиция начала UUID (индекс первого символа UUID)
      expect(result[0].positions).toEqual([31]);
    });

    it('should handle nested parentheses in values', () => {
      const sql = `INSERT INTO table (id) VALUES ((SELECT id FROM other_table))`;
      const result = parser.extractInserts(sql);

      expect(result[0].values[0][0]).toBe('(SELECT id FROM other_table)');
    });

    it('should ignore parentheses inside strings', () => {
      const sql = `INSERT INTO table (text) VALUES ('text with (parentheses)')`;
      const result = parser.extractInserts(sql);

      expect(result[0].values[0][0]).toBe('text with (parentheses)');
    });

    it('should handle unbalanced parentheses', () => {
      const sql = `INSERT INTO table (id) VALUES ('value')), (`; // Намеренно некорректный SQL
      const result = parser.extractInserts(sql);

      // Должен обработать только корректную часть
      expect(result[0].values[0][0]).toBe('value');
    });

  });

  describe('parseClass', () => {
    it('should parse valid class data', () => {
      const insert = {
        tableName: 'classes',
        columns: ['id', 'name', 'description', 'type'],
        values: [['uuid', "'Test'", "'Description'", '2']],
        positions: [0]
      };

      const result = parser.parseClass(insert, 0, 'file.sql', mockDocument);

      expect(result).toEqual({
        id: 'uuid',
        name: 'Test',
        description: 'Description',
        classType: 2,
        properties: [],
        objects: [],
        filePath: 'file.sql',
        lineNumber: 1,
        position: 0
      });
    });

    it('should return null for missing required fields', () => {
      const insert = {
        tableName: 'classes',
        columns: ['id'],
        values: [['']], // Пустой id
        positions: [0]
      };

      expect(parser.parseClass(insert, 0, 'file.sql', mockDocument)).toBeNull();
    });
  });

  describe('parseProperty', () => {
    it('should parse valid property data', () => {
      const insert = {
        tableName: 'property_definitions',
        columns: ['id', 'name', 'description', 'data_type', 'source_class_id'],
        values: [['prop1', "'Name'", "'Desc'", '1', 'null']],
        positions: [0]
      };

      const result = parser.parseProperty(insert, 0, 'file.sql', mockDocument);

      expect(result).toEqual({
        id: 'prop1',
        name: 'Name',
        description: 'Desc',
        dataType: 1,
        sourceClassId: undefined,
        filePath: 'file.sql',
        lineNumber: 1,
        position: 0
      });
    });

    it('should handle source_class_id', () => {
      const insert = {
        tableName: 'property_definitions',
        columns: ['id', 'name', 'source_class_id'],
        values: [['prop1', "'Name'", "'cls1'"]],
        positions: [0]
      };

      const result = parser.parseProperty(insert, 0, 'file.sql', mockDocument);
      expect(result?.sourceClassId).toBe('cls1');
    });

    it('should return null and log warning when missing id', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const insert = {
        tableName: 'property_definitions',
        columns: ['name'], // Нет id
        values: [["test"]],
        positions: [0]
      };

      const result = parser.parseProperty(insert, 0, 'file.sql', mockDocument);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid property - missing id or name:',
        { id: null, name: 'test' }
      );

      consoleSpy.mockRestore();
    });

    it('should return null and log warning when missing name', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const insert = {
        tableName: 'property_definitions',
        columns: ['id'], // Нет name
        values: [["prop1"]],
        positions: [0]
      };

      const result = parser.parseProperty(insert, 0, 'file.sql', mockDocument);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid property - missing id or name:',
        { id: 'prop1', name: null }
      );

      consoleSpy.mockRestore();
    });
  });

  describe('parseObject', () => {
    it('should parse valid object data', () => {
      const insert = {
        tableName: 'objects',
        columns: ['id', 'name', 'class_id', 'parent_id'],
        values: [['obj1', "'Name'", "'cls1'", "'parent1'"]],
        positions: [0]
      };

      const result = parser.parseObject(insert, 0, 'file.sql', mockDocument);

      expect(result).toEqual({
        id: 'obj1',
        name: 'Name',
        description: '',
        classId: 'cls1',
        parentId: 'parent1',
        filePath: 'file.sql',
        lineNumber: 1,
        position: 0
      });
    });

    it('should handle null parent_id', () => {
      const insert = {
        tableName: 'objects',
        columns: ['id', 'name', 'class_id', 'parent_id'],
        values: [['obj1', "'Name'", "'cls1'", 'null']],
        positions: [0]
      };

      const result = parser.parseObject(insert, 0, 'file.sql', mockDocument);
      expect(result?.parentId).toBeNull();
    });

    it('should return null when missing id', () => {
      const insert = {
        tableName: 'objects',
        columns: ['name', 'class_id'], // Нет id
        values: [["'Test'", "'cls1'"]],
        positions: [0]
      };

      const result = parser.parseObject(insert, 0, 'file.sql', mockDocument);
      expect(result).toBeNull();
    });

    it('should return null when missing name', () => {
      const insert = {
        tableName: 'objects',
        columns: ['id', 'class_id'], // Нет name
        values: [["'obj1'", "'cls1'"]],
        positions: [0]
      };

      const result = parser.parseObject(insert, 0, 'file.sql', mockDocument);
      expect(result).toBeNull();
    });

    it('should return null when missing class_id', () => {
      const insert = {
        tableName: 'objects',
        columns: ['id', 'name'], // Нет class_id
        values: [["'obj1'", "'Test'"]],
        positions: [0]
      };

      const result = parser.parseObject(insert, 0, 'file.sql', mockDocument);
      expect(result).toBeNull();
    });

    it('should return null when id is empty', () => {
      const insert = {
        tableName: 'objects',
        columns: ['id', 'name', 'class_id'],
        values: [["", "'Test'", "'cls1'"]], // Пустой id
        positions: [0]
      };

      const result = parser.parseObject(insert, 0, 'file.sql', mockDocument);
      expect(result).toBeNull();
    });

    it('should return null when name is empty', () => {
      const insert = {
        tableName: 'objects',
        columns: ['id', 'name', 'class_id'],
        values: [["'obj1'", "", "'cls1'"]], // Пустое name
        positions: [0]
      };

      const result = parser.parseObject(insert, 0, 'file.sql', mockDocument);
      expect(result).toBeNull();
    });

    it('should return null when class_id is empty', () => {
      const insert = {
        tableName: 'objects',
        columns: ['id', 'name', 'class_id'],
        values: [["'obj1'", "'Test'", ""]], // Пустой class_id
        positions: [0]
      };

      const result = parser.parseObject(insert, 0, 'file.sql', mockDocument);
      expect(result).toBeNull();
    });

    it('should return object when all required fields are present', () => {
      const insert = {
        tableName: 'objects',
        columns: ['id', 'name', 'class_id', 'parent_id', 'description'],
        values: [["obj1", "'Test'", "'cls1'", "'parent1'", "'Desc'"]],
        positions: [0]
      };

      const result = parser.parseObject(insert, 0, 'file.sql', mockDocument);
      expect(result).toEqual({
        id: 'obj1',
        name: 'Test',
        description: 'Desc',
        classId: 'cls1',
        parentId: 'parent1',
        filePath: 'file.sql',
        lineNumber: 1,
        position: 0
      });
    });

    it('should handle null parent_id', () => {
      const insert = {
        tableName: 'objects',
        columns: ['id', 'name', 'class_id', 'parent_id'],
        values: [["'obj1'", "'Test'", "'cls1'", 'null']], // Явный null
        positions: [0]
      };

      const result = parser.parseObject(insert, 0, 'file.sql', mockDocument);
      expect(result?.parentId).toBeNull();
    });
  });

  describe('parseLink', () => {
    it('should parse valid link', () => {
      const columns = ['class_id', 'property_definition_id'];
      const values = ['f4569f2f-6edd-4801-8079-cbe1d64ee684', '1ab2f377-9542-43c5-a1d3-e9e6b5f719c8'];

      const result = parser.parseLink(columns, values);
      expect(result).toEqual({
        classId: 'f4569f2f-6edd-4801-8079-cbe1d64ee684',
        propertyId: '1ab2f377-9542-43c5-a1d3-e9e6b5f719c8'
      });
    });

    it('should return null for invalid UUIDs', () => {
      const columns = ['class_id', 'property_definition_id'];
      const values = ['invalid', 'prop1'];

      expect(parser.parseLink(columns, values)).toBeNull();
    });
  });

  describe('extractValueGroups', () => {
    it('should extract simple value group', () => {
      const sql = `(1, 'test')`;
      expect(parser.extractValueGroups(sql)).toEqual([sql]);
    });

    it('should handle nested parentheses', () => {
      const sql = `(1, (2, 3))`;
      expect(parser.extractValueGroups(sql)).toEqual([sql]);
    });

    it('should ignore parentheses in strings', () => {
      const sql = `(1, 'test(ing)')`;
      expect(parser.extractValueGroups(sql)).toEqual([sql]);
    });

    it('should handle multiple groups', () => {
      const sql = `(1), (2)`;
      expect(parser.extractValueGroups(sql)).toEqual(['(1)', '(2)']);
    });
  });

  describe('stripQuotes', () => {
    it('should remove single quotes', () => {
      expect(parser.stripQuotes("'test'")).toBe('test');
    });

    it('should remove double quotes', () => {
      expect(parser.stripQuotes('"test"')).toBe('test');
    });

    it('should handle mixed quotes', () => {
      expect(parser.stripQuotes(`"'test'"`)).toBe(`'test'`);
    });
  });

  describe('isValidUuid', () => {
    it('should validate correct UUID', () => {
      expect(parser.isValidUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('should reject invalid UUID', () => {
      expect(parser.isValidUuid('not-a-uuid')).toBe(false);
    });

    it('should handle null', () => {
      expect(parser.isValidUuid(null)).toBe(false);
    });
  });
});