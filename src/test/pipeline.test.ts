import * as vscode from 'vscode';
import { SqlProcessor } from '../sqlProcessor';
import { AliasService } from '../aliasService';
import { CacheManager } from '../cacheManager';
import { ModelLinker } from '../modelLinker';
import { ClassInfo, ObjectInfo, PropertyInfo } from '../models';
import { findDefinitionOffset } from '../definitionLocator';
import { createFakeDocument } from './helpers/fakeTextDocument';
import { createMockConfig } from './__mocks__/settings';

jest.mock('vscode');
jest.mock('../settings', () => ({
  getConfig: jest.fn()
}));

import { getConfig } from '../settings';

// Все id и имена синтетические.
const STATUS_CLASS_ID = '0a000000-0000-4000-8000-000000000001';
const EQUIPMENT_CLASS_ID = '0b000000-0000-4000-8000-000000000001';
const EQUIPMENT_PROP_MODEL = '0b000000-0000-4000-8000-0000000000a1';
const EQUIPMENT_PROP_SERIAL = '0b000000-0000-4000-8000-0000000000a2';
const EQUIPMENT_STATUS_CREATED = '0b000000-0000-4000-8000-0000000000b1';
const EQUIPMENT_STATUS_ARCHIVE = '0b000000-0000-4000-8000-0000000000b2';

const WORKS_CLASS_ID = '0c000000-0000-4000-8000-000000000001';
const WORKS_PROP_TITLE = '0c000000-0000-4000-8000-0000000000a1';
const WORKS_PROP_DEADLINE = '0c000000-0000-4000-8000-0000000000a2';
const WORKS_PROP_UNLINKED = '0c000000-0000-4000-8000-0000000000a3';
const WORKS_STATUS_NEW = '0c000000-0000-4000-8000-0000000000b1';
const WORKS_STATUS_DONE = '0c000000-0000-4000-8000-0000000000b2';

const DUPLICATE_CLASS_ID = '0d000000-0000-4000-8000-000000000001';
const ORPHAN_STATUS_ID = '0e000000-0000-4000-8000-0000000000b1';
const EQUIPMENT_ROLE_ID = '0f000000-0000-4000-8000-0000000000c1';

const WS = '/ws';
const STATUS_CLASS_FILE = `${WS}/Статусы/Статусы.class.yaml`;
const EQUIPMENT_CLASS_FILE = `${WS}/Единицы оборудования/Единицы оборудования.class.yaml`;
const EQUIPMENT_OBJECT_FILE = `${WS}/Единицы оборудования/Единицы оборудования.object.yaml`;
const WORKS_CLASS_FILE = `${WS}/Работа заявки/1. Конфигурация класса.sql`;
const WORKS_OBJECT_FILE = `${WS}/Работа заявки/2. Конфигурация объектов.sql`;
const DUPLICATE_SQL_FILE = `${WS}/Дубли/Дубль.sql`;
const DUPLICATE_YAML_FILE = `${WS}/Дубли/Дубль.class.yaml`;
const ORPHAN_OBJECT_FILE = `${WS}/Прочее/Статус без класса.object.yaml`;
const ROLE_FILE = `${WS}/Роли/Роли.role.json`;

const WORKSPACE_FILES: Record<string, string> = {
  [STATUS_CLASS_FILE]: [
    `id: ${STATUS_CLASS_ID}`,
    'name: Статусы',
    'type: 1',
    'definitions: {}',
    ''
  ].join('\n'),

  // Класс называется иначе, чем папка; одно свойство с GUID-ключом, второе — через alias
  [EQUIPMENT_CLASS_FILE]: [
    `id: ${EQUIPMENT_CLASS_ID}`,
    'name:',
    '  ru-RU: Оборудование',
    '  en-US: Equipment',
    'description: Класс единиц оборудования',
    'aliases:',
    `  serialNumber: ${EQUIPMENT_PROP_SERIAL}`,
    'definitions:',
    `  ${EQUIPMENT_PROP_MODEL}:`,
    '    name: Модель',
    '    type: 0',
    '  serialNumber:',
    '    name: Серийный номер',
    '    type: 0',
    ''
  ].join('\n'),

  [EQUIPMENT_OBJECT_FILE]: [
    '-',
    `  id: ${EQUIPMENT_STATUS_CREATED}`,
    `  classId: ${STATUS_CLASS_ID}`,
    '  name: Создана',
    '  description: Единица оборудования создана',
    '',
    '-',
    `  id: ${EQUIPMENT_STATUS_ARCHIVE}`,
    `  classId: ${STATUS_CLASS_ID}`,
    '  name: Архив',
    '  description: Единица оборудования помещена в архив',
    ''
  ].join('\n'),

  // Комментарии специально смещают позиции в нормализованном SQL
  [WORKS_CLASS_FILE]: [
    '-- Конфигурация класса «Работы»',
    '/* многострочный',
    '   комментарий */',
    'INSERT INTO classes (id, name, description, type) VALUES',
    `  ('${WORKS_CLASS_ID}', 'Работы', 'Работы по заявке', 2);`,
    '',
    '-- Свойства',
    'INSERT INTO property_definitions (id, name, description, data_type) VALUES',
    `  ('${WORKS_PROP_TITLE}', 'Название работы', 'Название', 0),`,
    `  ('${WORKS_PROP_DEADLINE}', 'Срок', 'Срок выполнения', 5),`,
    `  ('${WORKS_PROP_UNLINKED}', 'Без привязки', 'Нет записи в classes_property_definitions', 0);`,
    '',
    'INSERT INTO classes_property_definitions (class_id, property_definition_id) VALUES',
    `  ('${WORKS_CLASS_ID}', '${WORKS_PROP_TITLE}'),`,
    `  ('${WORKS_CLASS_ID}', '${WORKS_PROP_DEADLINE}');`,
    ''
  ].join('\n'),

  [WORKS_OBJECT_FILE]: [
    '-- Статусы работ',
    'INSERT INTO objects (id, class_id, name, description) VALUES',
    `  ('${WORKS_STATUS_NEW}', '${STATUS_CLASS_ID}', 'Новая', 'Работа создана'),`,
    `  ('${WORKS_STATUS_DONE}', '${STATUS_CLASS_ID}', 'Выполнена', 'Работа выполнена');`,
    ''
  ].join('\n'),

  // Один и тот же класс в SQL и в YAML с разными именами
  [DUPLICATE_SQL_FILE]: [
    '-- старое определение',
    `INSERT INTO classes (id, name, description, type) VALUES ('${DUPLICATE_CLASS_ID}', 'Из SQL', 'sql', 2);`,
    ''
  ].join('\n'),
  [DUPLICATE_YAML_FILE]: [
    `id: ${DUPLICATE_CLASS_ID}`,
    'name: Из YAML',
    'description: yaml',
    ''
  ].join('\n'),

  // В каталоге нет класса -> статус остаётся в корзине класса статусов
  [ORPHAN_OBJECT_FILE]: [
    `id: ${ORPHAN_STATUS_ID}`,
    `classId: ${STATUS_CLASS_ID}`,
    'name: Статус без класса',
    ''
  ].join('\n'),

  [ROLE_FILE]: JSON.stringify({
    Id: '0f000000-0000-4000-8000-0000000000c0',
    Name: 'Группа',
    Roles: [{ Id: EQUIPMENT_ROLE_ID, Name: 'Кладовщик', Description: 'Роль' }]
  }, null, 2),

  // .yml платформа не загружает
  [`${WS}/Единицы оборудования/Лишний.class.yml`]: `id: 99999999-0000-4000-8000-000000000001\nname: Игнорируется\n`
};

function globToRegExp(glob: string): RegExp {
  const source = glob
    .replace(/[.+^$()|[\]\\]/g, '\\$&')
    .replace(/\{([^}]+)\}/g, (_, alternatives: string) => `(?:${alternatives.split(',').join('|')})`)
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '(?:.*/)?');
  return new RegExp(`^${source}$`, 'i');
}

function byId<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find(i => i.id === id);
  if (!item) { throw new Error(`Not found: ${id}`); }
  return item;
}

function idsOf(items: { id: string }[]): string[] {
  return items.map(i => i.id).sort();
}

describe('pipeline: real SqlProcessor + parsers + ModelLinker', () => {
  const workspace = vscode.workspace as unknown as {
    findFiles: jest.Mock;
    openTextDocument: jest.Mock;
    fs: { readFile: jest.Mock };
  };

  let result: Awaited<ReturnType<SqlProcessor['parseAllSqlFiles']>>;

  function install(files: Record<string, string>) {
    workspace.findFiles.mockImplementation(async (pattern: string) => {
      const regex = globToRegExp(pattern);
      return Object.keys(files).filter(p => regex.test(p)).map(p => ({ fsPath: p }));
    });
    workspace.fs.readFile.mockImplementation(async (uri: { fsPath: string }) => Buffer.from(files[uri.fsPath] ?? ''));
    workspace.openTextDocument.mockImplementation(async (uri: { fsPath: string }) =>
      createFakeDocument(files[uri.fsPath] ?? '', uri.fsPath));
  }

  function createProcessor(): SqlProcessor {
    const aliasService = {
      getAlias: jest.fn(() => undefined),
      onAliasesChanged: jest.fn()
    } as unknown as AliasService;
    return new SqlProcessor(aliasService, undefined, new ModelLinker(aliasService), new CacheManager());
  }

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (getConfig as jest.Mock).mockReturnValue(createMockConfig({
      ignoreStatus: true,
      ignoreUuid: STATUS_CLASS_ID,
      fuzzyClassMatching: false
    }));

    install(WORKSPACE_FILES);
    result = await createProcessor().parseAllSqlFiles();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('(a) yaml class + sequence-root status objects', () => {
    it('keeps both statuses in the class from the same directory', () => {
      const cls = byId(result.classes, EQUIPMENT_CLASS_ID);

      expect(cls.name).toBe('Оборудование');
      expect(idsOf(cls.objects)).toEqual([EQUIPMENT_STATUS_CREATED, EQUIPMENT_STATUS_ARCHIVE].sort());
      expect(cls.objects.map(o => o.name).sort()).toEqual(['Архив', 'Создана']);
    });

    it('does not leave the statuses in the ignored status class', () => {
      const statusClass = byId(result.classes, STATUS_CLASS_ID);

      expect(statusClass.objects.map(o => o.id)).not.toContain(EQUIPMENT_STATUS_CREATED);
      expect(statusClass.objects.map(o => o.id)).not.toContain(EQUIPMENT_STATUS_ARCHIVE);
    });

    it('collects both properties, including the alias-keyed one', () => {
      const cls = byId(result.classes, EQUIPMENT_CLASS_ID);

      expect(cls.properties.map(p => p.name).sort()).toEqual(['Модель', 'Серийный номер']);
      expect(idsOf(cls.properties)).toEqual([EQUIPMENT_PROP_MODEL, EQUIPMENT_PROP_SERIAL].sort());
    });

    it('reports all objects with the status class id as class id', () => {
      expect(byId(result.objects, EQUIPMENT_STATUS_CREATED).classId).toBe(STATUS_CLASS_ID);
    });
  });

  describe('(b) sql folder whose name differs from the class name', () => {
    it('links the objects to the class via the same directory', () => {
      const cls = byId(result.classes, WORKS_CLASS_ID);

      expect(cls.name).toBe('Работы');
      expect(idsOf(cls.objects)).toEqual([WORKS_STATUS_NEW, WORKS_STATUS_DONE].sort());
    });

    it('links explicitly linked properties and falls back to the directory for the unlinked one', () => {
      const cls = byId(result.classes, WORKS_CLASS_ID);

      expect(idsOf(cls.properties)).toEqual([WORKS_PROP_TITLE, WORKS_PROP_DEADLINE, WORKS_PROP_UNLINKED].sort());
    });
  });

  describe('(c) the same class id in sql and yaml', () => {
    it('yaml name and file win', () => {
      const duplicates = result.classes.filter(c => c.id === DUPLICATE_CLASS_ID);

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].name).toBe('Из YAML');
      expect(duplicates[0].filePath).toBe(DUPLICATE_YAML_FILE);
    });
  });

  describe('other model parts', () => {
    it('keeps a status without a class of its own in the status class', () => {
      const statusClass = byId(result.classes, STATUS_CLASS_ID);

      expect(statusClass.objects.map(o => o.id)).toEqual([ORPHAN_STATUS_ID]);
    });

    it('reads roles from json with PascalCase keys', () => {
      expect(result.roles.map(r => ({ id: r.id, name: r.name }))).toEqual([{ id: EQUIPMENT_ROLE_ID, name: 'Кладовщик' }]);
    });

    it('does not load .yml files', () => {
      expect(result.classes.map(c => c.name)).not.toContain('Игнорируется');
    });

    it('is stable when the discovery order of files changes', async () => {
      const reversed = Object.fromEntries(Object.entries(WORKSPACE_FILES).reverse());
      install(reversed);

      const again = await createProcessor().parseAllSqlFiles();

      expect(again.classes.map(c => [c.id, c.name, c.filePath])).toEqual(result.classes.map(c => [c.id, c.name, c.filePath]));
      expect(byId(again.classes, EQUIPMENT_CLASS_ID).objects.map(o => o.id).sort())
        .toEqual(byId(result.classes, EQUIPMENT_CLASS_ID).objects.map(o => o.id).sort());
    });
  });

  describe('(d) go to definition offsets', () => {
    type Entity = ClassInfo | PropertyInfo | ObjectInfo;

    function checkOffset(entity: Entity): void {
      const text = WORKSPACE_FILES[entity.filePath!];
      const offset = findDefinitionOffset(text, entity.id, entity.position);

      expect(offset).toBeDefined();
      expect(offset).toBe(text.indexOf(entity.id));
      expect(text.slice(offset!, offset! + entity.id.length)).toBe(entity.id);
    }

    const isStructured = (e: Entity) => /\.(yaml|json)$/i.test(e.filePath ?? '');

    it('points exactly at the id for every yaml/json class, property and object', () => {
      const entities: Entity[] = [
        ...result.classes,
        ...result.properties,
        ...result.objects
      ].filter(isStructured);

      // классы: статусы, оборудование, дубль; свойства: 2; объекты: 2 + сирота
      expect(entities).toHaveLength(8);
      entities.forEach(checkOffset);
    });

    it('agrees with the parser position and line number for yaml entities', () => {
      const text = WORKSPACE_FILES[EQUIPMENT_OBJECT_FILE];
      const status = byId(result.objects, EQUIPMENT_STATUS_ARCHIVE);

      expect(status.position).toBe(text.indexOf(EQUIPMENT_STATUS_ARCHIVE));
      expect(status.lineNumber).toBe(text.slice(0, status.position).split('\n').length);
    });

    it('also finds the quoted ids of sql entities despite stale positions', () => {
      const sqlEntities: Entity[] = [
        ...result.classes,
        ...result.properties,
        ...result.objects
      ].filter(e => /\.sql$/i.test(e.filePath ?? '') && [WORKS_CLASS_FILE, WORKS_OBJECT_FILE].includes(e.filePath!));

      expect(sqlEntities).toHaveLength(6);
      sqlEntities.forEach(entity => {
        const text = WORKSPACE_FILES[entity.filePath!];
        const offset = findDefinitionOffset(text, entity.id, entity.position);

        expect(offset).toBe(text.indexOf(`'${entity.id}'`) + 1);
      });
    });
  });
});
