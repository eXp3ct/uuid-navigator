import * as vscode from 'vscode';
import { SqlProcessor } from '../sqlProcessor';
import { AliasService } from '../aliasService';
import { CacheManager } from '../cacheManager';
import { ModelLinker } from '../modelLinker';
import { createFakeDocument } from './helpers/fakeTextDocument';
import { createMockConfig } from './__mocks__/settings';

jest.mock('vscode');
jest.mock('../settings', () => ({
  getConfig: jest.fn()
}));

import { getConfig } from '../settings';

// Повторный парсинг после изменения части файлов: кеш по хешу не должен отдавать устаревшую модель.
const CLASS_ID = '1a000000-0000-4000-8000-000000000001';
const PROP_A = '1a000000-0000-4000-8000-0000000000a1';
const PROP_B = '1a000000-0000-4000-8000-0000000000a2';

const CLASS_FILE = '/ws/Класс/1. Класс.sql';
const PROPS_FILE = '/ws/Класс/2. Свойства.sql';
const YAML_CLASS_FILE = '/ws/Новый/Новый.class.yaml';

const classSql = `INSERT INTO classes (id, name, description, type) VALUES ('${CLASS_ID}', 'Класс', '', 2);\n`;

function propsSql(props: { id: string; name: string }[]): string {
  if (props.length === 0) { return '-- пусто\n'; }
  return [
    'INSERT INTO property_definitions (id, name, description, data_type) VALUES',
    props.map(p => `  ('${p.id}', '${p.name}', '', 0)`).join(',\n') + ';',
    'INSERT INTO classes_property_definitions (class_id, property_definition_id) VALUES',
    props.map(p => `  ('${CLASS_ID}', '${p.id}')`).join(',\n') + ';',
    ''
  ].join('\n');
}

function patternMatches(pattern: string, fsPath: string): boolean {
  if (pattern === '**/*.sql') { return fsPath.endsWith('.sql'); }
  const kind = /\*\*\/\*\.(\w+)\./.exec(pattern)?.[1];
  return !!kind && new RegExp(`\\.${kind}\\.(yaml|json)$`).test(fsPath);
}

describe('incremental refresh (per-file hash cache)', () => {
  const workspace = vscode.workspace as unknown as {
    findFiles: jest.Mock;
    openTextDocument: jest.Mock;
    fs: { readFile: jest.Mock };
  };

  let disk: Record<string, string>;
  let processor: SqlProcessor;

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (getConfig as jest.Mock).mockReturnValue(createMockConfig());

    disk = {
      [CLASS_FILE]: classSql,
      [PROPS_FILE]: propsSql([{ id: PROP_A, name: 'Старое имя' }, { id: PROP_B, name: 'Второе' }])
    };

    workspace.findFiles.mockImplementation(async (pattern: string) =>
      Object.keys(disk).filter(p => patternMatches(pattern, p)).map(fsPath => ({ fsPath })));
    workspace.fs.readFile.mockImplementation(async (uri: { fsPath: string }) => Buffer.from(disk[uri.fsPath] ?? ''));
    workspace.openTextDocument.mockImplementation(async (uri: { fsPath: string }) =>
      createFakeDocument(disk[uri.fsPath] ?? '', uri.fsPath));

    const aliasService = { getAlias: jest.fn(() => undefined), onAliasesChanged: jest.fn() } as unknown as AliasService;
    processor = new SqlProcessor(aliasService, undefined, new ModelLinker(aliasService), new CacheManager());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const classOf = async () => {
    const { classes } = await processor.parseAllSqlFiles();
    return classes.find(c => c.id === CLASS_ID)!;
  };

  it('shows the renamed property when only the property file changed', async () => {
    expect((await classOf()).properties.map(p => p.name).sort()).toEqual(['Второе', 'Старое имя']);

    disk[PROPS_FILE] = propsSql([{ id: PROP_A, name: 'Новое имя' }, { id: PROP_B, name: 'Второе' }]);

    expect((await classOf()).properties.map(p => p.name).sort()).toEqual(['Второе', 'Новое имя']);
  });

  it('drops a removed property from the class', async () => {
    await classOf();

    disk[PROPS_FILE] = propsSql([{ id: PROP_B, name: 'Второе' }]);

    expect((await classOf()).properties.map(p => p.id)).toEqual([PROP_B]);
  });

  it('does not duplicate properties across repeated refreshes', async () => {
    await processor.parseAllSqlFiles(true);
    await processor.parseAllSqlFiles(true);

    expect((await classOf()).properties).toHaveLength(2);
  });

  it('picks up a created file and forgets a deleted one', async () => {
    await classOf();

    disk[YAML_CLASS_FILE] = 'id: 1b000000-0000-4000-8000-000000000001\nname: Новый класс\n';
    let { classes } = await processor.parseAllSqlFiles();
    expect(classes.map(c => c.name)).toContain('Новый класс');

    delete disk[YAML_CLASS_FILE];
    ({ classes } = await processor.parseAllSqlFiles());
    expect(classes.map(c => c.name)).not.toContain('Новый класс');
  });

  it('parses the saved file content (the one that was hashed), not an unsaved editor buffer', async () => {
    workspace.openTextDocument.mockImplementation(async (uri: { fsPath: string }) =>
      createFakeDocument(uri.fsPath === PROPS_FILE ? propsSql([{ id: PROP_A, name: 'Несохранённое' }]) : disk[uri.fsPath], uri.fsPath));

    const names = (await classOf()).properties.map(p => p.name).sort();

    expect(names).toEqual(['Второе', 'Старое имя']);
  });
});
