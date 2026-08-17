import * as vscode from 'vscode';
import { YamlFileParser } from '../parsers/yamlFileParser';

jest.mock('vscode');

const CLASS_YAML = `id: 5a93b0e8-0bfc-4612-9966-97936ca334e5
name: Техкарты
description: Техкарты
type: 2
IsEnableOpensearch: true
definitions:
  079304d9-b91d-4915-86e3-98b036dd1b9d:
    name: Счетчик
    description: Счетчик
    type: 1
    order: 1
  c28def4e-5764-4865-94a6-3ef4637e1907:
    name: Группа техкарт
    description: Группа техкарт
    sourceClassId: a048e6b1-3737-4d73-ac82-ff57ebabf323
    type: 4
    order: 2
`;

const CLASS_JSON = JSON.stringify({
  id: '5a93b0e8-0bfc-4612-9966-97936ca334e5',
  name: 'Техкарты',
  description: 'Техкарты',
  type: 2,
  definitions: {
    '079304d9-b91d-4915-86e3-98b036dd1b9d': {
      name: 'Счетчик',
      description: 'Счетчик',
      type: 1
    }
  }
});

const OBJECT_YAML = `id: 8b88c8dd-0432-44b0-a3bd-26c4c8f061cf
classId: b2d437bc-af8e-4d75-ac25-70f481251233
name: Создана
description: Техкарта создана

id: e5c2f46b-db7e-47d7-8a9a-c75d526cd122
classId: b2d437bc-af8e-4d75-ac25-70f481251233
name: Архив
description: Техкарта удалена и помещена в архив
`;

describe('YamlFileParser', () => {
  let parser: YamlFileParser;
  let mockDocument: vscode.TextDocument;

  beforeEach(() => {
    parser = new YamlFileParser();
    mockDocument = {
      positionAt: jest.fn((offset: number) => ({ line: offset })),
    } as unknown as vscode.TextDocument;
  });

  describe('canHandle', () => {
    it('accepts .class.yaml/.yml/.json and .object.yaml/.yml/.json', () => {
      expect(parser.canHandle('Foo.class.yaml')).toBe(true);
      expect(parser.canHandle('Foo.class.yml')).toBe(true);
      expect(parser.canHandle('Foo.class.json')).toBe(true);
      expect(parser.canHandle('Foo.object.yaml')).toBe(true);
      expect(parser.canHandle('Foo.object.json')).toBe(true);
    });

    it('rejects unrelated files', () => {
      expect(parser.canHandle('Foo.sql')).toBe(false);
      expect(parser.canHandle('Foo.flow.json')).toBe(false);
      expect(parser.canHandle('Foo.operation.json')).toBe(false);
      expect(parser.canHandle('Foo.yaml')).toBe(false);
    });
  });

  describe('*.class.yaml', () => {
    it('parses the class and inlines properties as PropertyInfo + auto-links', () => {
      const result = parser.parseFile('Foo.class.yaml', CLASS_YAML, mockDocument);

      expect(result.classes).toHaveLength(1);
      expect(result.classes[0]).toMatchObject({
        id: '5a93b0e8-0bfc-4612-9966-97936ca334e5',
        name: 'Техкарты',
        description: 'Техкарты',
        classType: 2,
        filePath: 'Foo.class.yaml'
      });

      expect(result.properties).toHaveLength(2);
      const counter = result.properties.find(p => p.id === '079304d9-b91d-4915-86e3-98b036dd1b9d');
      expect(counter).toMatchObject({ name: 'Счетчик', description: 'Счетчик', dataType: 1, sourceClassId: undefined });

      const group = result.properties.find(p => p.id === 'c28def4e-5764-4865-94a6-3ef4637e1907');
      expect(group).toMatchObject({
        name: 'Группа техкарт',
        dataType: 4,
        sourceClassId: 'a048e6b1-3737-4d73-ac82-ff57ebabf323'
      });

      expect(result.links).toEqual([
        { classId: '5a93b0e8-0bfc-4612-9966-97936ca334e5', propertyId: '079304d9-b91d-4915-86e3-98b036dd1b9d' },
        { classId: '5a93b0e8-0bfc-4612-9966-97936ca334e5', propertyId: 'c28def4e-5764-4865-94a6-3ef4637e1907' }
      ]);

      expect(result.objects).toEqual([]);
      expect(result.roles).toEqual([]);
    });

    it('gives each property a distinct position pointing into the source', () => {
      const result = parser.parseFile('Foo.class.yaml', CLASS_YAML, mockDocument);
      const positions = result.properties.map(p => p.position);
      expect(new Set(positions).size).toBe(positions.length);
      expect(result.classes[0].position).toBeGreaterThanOrEqual(0);
    });
  });

  describe('*.class.json', () => {
    it('parses the same shape from JSON', () => {
      const result = parser.parseFile('Foo.class.json', CLASS_JSON, mockDocument);

      expect(result.classes[0]).toMatchObject({
        id: '5a93b0e8-0bfc-4612-9966-97936ca334e5',
        name: 'Техкарты',
        classType: 2
      });
      expect(result.properties).toHaveLength(1);
      expect(result.links).toHaveLength(1);
    });
  });

  describe('*.object.yaml', () => {
    it('splits blank-line-separated records and parses each independently', () => {
      const result = parser.parseFile('Foo.object.yaml', OBJECT_YAML, mockDocument);

      expect(result.objects).toHaveLength(2);
      expect(result.objects[0]).toMatchObject({
        id: '8b88c8dd-0432-44b0-a3bd-26c4c8f061cf',
        classId: 'b2d437bc-af8e-4d75-ac25-70f481251233',
        name: 'Создана',
        description: 'Техкарта создана',
        parentId: null
      });
      expect(result.objects[1]).toMatchObject({
        id: 'e5c2f46b-db7e-47d7-8a9a-c75d526cd122',
        name: 'Архив'
      });

      expect(result.classes).toEqual([]);
      expect(result.properties).toEqual([]);
      expect(result.links).toEqual([]);
    });

    it('would throw as a single document (regression guard for the split approach)', () => {
      const { parseDocument } = require('yaml');
      const doc = parseDocument(OBJECT_YAML);
      expect(doc.errors.length).toBeGreaterThan(0);
    });

    it('skips malformed blocks without throwing', () => {
      const content = `id: valid-id
classId: cls1
name: Ok
description: fine

id: [unterminated
classId: cls1
name: Broken
`;
      const result = parser.parseFile('Foo.object.yaml', content, mockDocument);
      expect(result.objects).toHaveLength(1);
      expect(result.objects[0].id).toBe('valid-id');
    });

    it('skips blocks missing required fields', () => {
      const content = `id: only-id-no-class-or-name
`;
      const result = parser.parseFile('Foo.object.yaml', content, mockDocument);
      expect(result.objects).toEqual([]);
    });
  });

  describe('malformed class file', () => {
    it('returns an empty ParsedFile and does not throw', () => {
      const result = parser.parseFile('Foo.class.yaml', 'id: [unterminated', mockDocument);
      expect(result).toEqual({ classes: [], properties: [], links: [], objects: [], roles: [] });
    });

    it('returns empty when required fields are missing', () => {
      const result = parser.parseFile('Foo.class.yaml', 'description: no id or name here', mockDocument);
      expect(result.classes).toEqual([]);
    });
  });
});
