import * as fs from 'fs';
import * as path from 'path';
import { StructuredConfigParser } from '../parsers/structuredConfigParser';
import { ParsedFile } from '../models';
import { createFakeDocument } from './helpers/fakeTextDocument';

jest.mock('vscode');

const FIXTURES = path.join(__dirname, 'fixtures', 'structured');

function load(name: string): { filePath: string; content: string } {
  const filePath = path.join(FIXTURES, name);
  return { filePath, content: fs.readFileSync(filePath, 'utf8') };
}

describe('StructuredConfigParser', () => {
  const parser = new StructuredConfigParser();
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  function parseFixture(name: string): { parsed: ParsedFile; content: string } {
    const { filePath, content } = load(name);
    return { parsed: parser.parseFile(filePath, content, createFakeDocument(content, filePath)), content };
  }

  function parseInline(fileName: string, content: string): ParsedFile {
    return parser.parseFile(fileName, content, createFakeDocument(content, fileName));
  }

  describe('canHandle', () => {
    it.each([
      'Foo.class.yaml', 'Foo.class.json', 'Foo.object.yaml', 'Foo.object.json',
      'Foo.role.yaml', 'Foo.role.json', 'FOO.CLASS.YAML', '/a/b/Foo.Object.Json'
    ])('accepts %s', filePath => {
      expect(parser.canHandle(filePath)).toBe(true);
    });

    it.each([
      'Foo.sql', 'Foo.flow.json', 'Foo.operation.json', 'Foo.yaml', 'Foo.json',
      'Foo.class.yml', 'Foo.object.yml', 'Foo.role.yml', 'Foo.class.yaml.bak'
    ])('rejects %s', filePath => {
      expect(parser.canHandle(filePath)).toBe(false);
    });
  });

  describe('object file with sequence root', () => {
    it('parses items written as "-" followed by a newline, with blank lines between items', () => {
      const { parsed } = parseFixture('statuses.object.yaml');

      expect(parsed.objects.map(o => o.id)).toEqual([
        '11111111-aaaa-4aaa-8aaa-000000000001',
        '11111111-aaaa-4aaa-8aaa-000000000003',
        '11111111-aaaa-4aaa-8aaa-000000000004'
      ]);
      expect(parsed.objects[0]).toMatchObject({
        name: 'Создан',
        description: 'Элемент создан',
        classId: '22222222-bbbb-4bbb-8bbb-000000000002',
        parentId: null
      });
      expect(parsed.classes).toEqual([]);
      expect(parsed.properties).toEqual([]);
      expect(parsed.links).toEqual([]);
      expect(parsed.roles).toEqual([]);
    });

    it('defaults description to empty string and reads parentId', () => {
      const { parsed } = parseFixture('statuses.object.yaml');

      expect(parsed.objects[1].description).toBe('');
      expect(parsed.objects[2].parentId).toBe('11111111-aaaa-4aaa-8aaa-000000000003');
    });

    it('points position at the id token and lineNumber at its line', () => {
      const { parsed, content } = parseFixture('statuses.object.yaml');

      for (const object of parsed.objects) {
        const expected = content.indexOf(object.id);
        expect(object.position).toBe(expected);
        expect(content.slice(object.position, object.position! + object.id.length)).toBe(object.id);
        expect(object.lineNumber).toBe(content.slice(0, expected).split('\n').length);
      }
    });
  });

  describe('object file with mapping root', () => {
    it('parses a single object with PascalCase keys and localized name', () => {
      const { parsed, content } = parseFixture('single.object.yaml');

      expect(parsed.objects).toHaveLength(1);
      expect(parsed.objects[0]).toMatchObject({
        id: '44444444-dddd-4ddd-8ddd-000000000001',
        classId: '55555555-eeee-4eee-8eee-000000000002',
        name: 'Единственный',
        description: 'Объект в корне-маппинге',
        parentId: null,
        lineNumber: 1,
        position: content.indexOf('44444444')
      });
    });
  });

  describe('object file in JSON', () => {
    it('parses an array of objects; position points at the opening quote', () => {
      const { parsed, content } = parseFixture('items.object.json');

      expect(parsed.objects.map(o => o.name)).toEqual(['Первый', 'Второй']);
      expect(parsed.objects[1].parentId).toBe('bbbbbbbb-5555-4555-8555-000000000001');
      for (const object of parsed.objects) {
        expect(object.position).toBe(content.indexOf(object.id) - 1);
        expect(content[object.position!]).toBe('"');
        expect(object.lineNumber).toBe(content.slice(0, object.position).split('\n').length);
      }
    });
  });

  describe('class file', () => {
    it('resolves localized names, class type and plain GUID definitions', () => {
      const { parsed } = parseFixture('localized.class.yaml');

      expect(parsed.classes).toHaveLength(1);
      expect(parsed.classes[0]).toMatchObject({
        id: '66666666-ffff-4fff-8fff-000000000001',
        name: 'Оборудование',
        description: 'Единицы оборудования',
        classType: 1,
        properties: [],
        objects: []
      });

      const model = parsed.properties.find(p => p.id === '77777777-1111-4111-8111-000000000003');
      expect(model).toMatchObject({ name: 'Модель', description: 'Модель оборудования', dataType: 0 });
    });

    it('resolves alias-keyed definitions through the class aliases map', () => {
      const { parsed, content } = parseFixture('localized.class.yaml');

      const serial = parsed.properties.find(p => p.id === '77777777-1111-4111-8111-000000000002');
      expect(serial).toMatchObject({ name: 'Серийный номер', description: '' });
      // id лежит в значении aliases — на него и указывает позиция
      expect(serial!.position).toBe(content.indexOf('77777777-1111-4111-8111-000000000002'));
      expect(parsed.properties.some(p => p.name === 'Потерянный')).toBe(false);
    });

    it('warns about and skips definitions whose key is an unknown alias', () => {
      parseFixture('localized.class.yaml');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknownAlias'));
    });

    it('keeps sourceClassId for references and drops the empty guid', () => {
      const { parsed } = parseFixture('localized.class.yaml');

      const owner = parsed.properties.find(p => p.name === 'Владелец');
      expect(owner).toMatchObject({ dataType: 4, sourceClassId: '88888888-2222-4222-8222-000000000005' });
      const noSource = parsed.properties.find(p => p.name === 'Без источника');
      expect(noSource!.sourceClassId).toBeUndefined();
    });

    it('creates a link per definition in file order', () => {
      const { parsed } = parseFixture('localized.class.yaml');

      expect(parsed.links).toEqual([
        { classId: '66666666-ffff-4fff-8fff-000000000001', propertyId: '77777777-1111-4111-8111-000000000003' },
        { classId: '66666666-ffff-4fff-8fff-000000000001', propertyId: '77777777-1111-4111-8111-000000000002' },
        { classId: '66666666-ffff-4fff-8fff-000000000001', propertyId: '77777777-1111-4111-8111-000000000004' },
        { classId: '66666666-ffff-4fff-8fff-000000000001', propertyId: '77777777-1111-4111-8111-000000000006' }
      ]);
    });

    it('points class and definition positions at the id tokens', () => {
      const { parsed, content } = parseFixture('localized.class.yaml');

      expect(parsed.classes[0].position).toBe(content.indexOf(parsed.classes[0].id));
      expect(parsed.classes[0].lineNumber).toBe(1);

      const model = parsed.properties.find(p => p.name === 'Модель')!;
      expect(model.position).toBe(content.indexOf('77777777-1111-4111-8111-000000000003'));
      expect(model.lineNumber).toBe(content.slice(0, model.position).split('\n').length);
    });

    it('defaults class type to 2 when absent', () => {
      const { parsed } = parseFixture('notype.class.yaml');

      expect(parsed.classes[0]).toMatchObject({ name: 'Без типа', classType: 2, description: '' });
      expect(parsed.properties).toEqual([]);
    });

    it('parses a PascalCase JSON class', () => {
      const { parsed, content } = parseFixture('pascal.class.json');

      expect(parsed.classes[0]).toMatchObject({
        id: 'aaaaaaaa-4444-4444-8444-000000000001',
        name: 'Класс из JSON',
        description: 'PascalCase-ключи',
        classType: 0
      });
      expect(parsed.classes[0].position).toBe(content.indexOf(parsed.classes[0].id) - 1);
      expect(parsed.properties).toHaveLength(1);
      expect(parsed.properties[0]).toMatchObject({
        id: 'aaaaaaaa-4444-4444-8444-000000000002',
        name: 'Поле',
        dataType: 0
      });
      expect(parsed.properties[0].position).toBe(content.indexOf('aaaaaaaa-4444-4444-8444-000000000002') - 1);
      expect(parsed.links).toHaveLength(1);
    });

    it('falls back to ru, __default and the first value for localized names', () => {
      const cases: [string, string][] = [
        ['name:\n    ru: Русский\n    en: English', 'Русский'],
        ['name:\n    __default: По умолчанию\n    en: English', 'По умолчанию'],
        ['name:\n    en: English\n    de: Deutsch', 'English'],
        ['name:\n    en-US: English\n    ru-RU: Русский', 'Русский']
      ];
      for (const [nameYaml, expected] of cases) {
        const content = `id: 12121212-0000-4000-8000-000000000001\n${nameYaml.replace(/^ {4}/gm, '  ')}\n`;
        expect(parseInline('X.class.yaml', content).classes[0].name).toBe(expected);
      }
    });

    it('skips duplicate definitions inside one class (first wins)', () => {
      const content = [
        'id: 13131313-0000-4000-8000-000000000001',
        'name: Дубли',
        'aliases:',
        '  a: 13131313-0000-4000-8000-000000000002',
        'definitions:',
        '  13131313-0000-4000-8000-000000000002:',
        '    name: Первое',
        '  a:',
        '    name: Второе',
        ''
      ].join('\n');

      const parsed = parseInline('X.class.yaml', content);

      expect(parsed.properties.map(p => p.name)).toEqual(['Первое']);
      expect(parsed.links).toHaveLength(1);
    });

    it('supports a sequence of classes in one file', () => {
      const content = [
        '- id: 14141414-0000-4000-8000-000000000001',
        '  name: Первый',
        '- id: 14141414-0000-4000-8000-000000000002',
        '  name: Второй',
        ''
      ].join('\n');

      expect(parseInline('X.class.yaml', content).classes.map(c => c.name)).toEqual(['Первый', 'Второй']);
    });
  });

  describe('role file', () => {
    it('creates a RoleInfo per item of "roles" and none for the group itself', () => {
      const { parsed, content } = parseFixture('groups.role.yaml');

      expect(parsed.roles.map(r => r.id)).toEqual([
        'dddddddd-7777-4777-8777-000000000002',
        'dddddddd-7777-4777-8777-000000000003'
      ]);
      expect(parsed.roles[0]).toMatchObject({ name: 'Оператор', description: 'Работает с заявками' });
      expect(parsed.roles[1]).toMatchObject({ name: 'Наблюдатель', description: '' });
      for (const role of parsed.roles) {
        expect(role.position).toBe(content.indexOf(role.id));
        expect(role.lineNumber).toBe(content.slice(0, role.position).split('\n').length);
      }
      expect(parsed.classes).toEqual([]);
      expect(parsed.objects).toEqual([]);
    });

    it('supports a JSON array of role groups', () => {
      const content = JSON.stringify([
        { id: 'g1', name: 'G1', roles: [{ id: 'r1', name: 'Role 1' }] },
        { id: 'g2', name: 'G2', roles: [{ id: 'r2', name: 'Role 2' }] }
      ]);

      expect(parseInline('X.role.json', content).roles.map(r => r.id)).toEqual(['r1', 'r2']);
    });
  });

  describe('invalid input', () => {
    it('returns what it could parse from a malformed file without throwing', () => {
      const { parsed } = parseFixture('broken.object.yaml');

      // name получился последовательностью, а не строкой — запись пропущена
      expect(parsed.objects).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('parse error'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"id", "classId" and "name" are required'));
    });

    it('returns an empty ParsedFile for garbage', () => {
      const empty = { classes: [], properties: [], links: [], objects: [], roles: [] };

      expect(parseInline('X.class.yaml', 'id: [unterminated')).toEqual(empty);
      expect(parseInline('X.object.json', '{ "id": ')).toEqual(empty);
      expect(parseInline('X.class.yaml', '')).toEqual(empty);
      expect(parseInline('X.object.yaml', 'just a string')).toEqual(empty);
      expect(parseInline('X.object.yaml', '- 1\n- two\n')).toEqual(empty);
    });

    it('warns and skips documents missing required fields', () => {
      expect(parseInline('X.class.yaml', 'description: no id or name').classes).toEqual([]);
      expect(parseInline('X.object.yaml', 'id: only-id').objects).toEqual([]);
      expect(parseInline('X.object.yaml', 'id: a\nclassId: b\n').objects).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(3);
    });

    it('keeps valid siblings when one sequence item is invalid', () => {
      const content = [
        '- id: 15151515-0000-4000-8000-000000000001',
        '  classId: 15151515-0000-4000-8000-0000000000aa',
        '  name: Хороший',
        '- id: 15151515-0000-4000-8000-000000000002',
        '  name: Без класса',
        ''
      ].join('\n');

      expect(parseInline('X.object.yaml', content).objects.map(o => o.name)).toEqual(['Хороший']);
    });

    it('reports duplicate keys of blank-line separated records instead of splitting them (platform rejects it too)', () => {
      const content = 'id: a\nclassId: b\nname: One\n\nid: c\nclassId: d\nname: Two\n';

      const parsed = parseInline('X.object.yaml', content);

      expect(parsed.objects.map(o => o.name)).toEqual(['One']);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Map keys must be unique'));
    });
  });
});
