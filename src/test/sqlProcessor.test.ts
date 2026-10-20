import * as vscode from 'vscode';
import { SqlProcessor } from '../sqlProcessor';
import { AliasService } from '../aliasService';
import { CacheManager } from '../cacheManager';
import { ModelLinker } from '../modelLinker';
import { createFakeDocument } from './helpers/fakeTextDocument';

jest.mock('vscode');

const CLASS_ID = '10000000-0000-4000-8000-000000000001';
const OBJECT_ID = '10000000-0000-4000-8000-000000000002';

function sqlClass(id: string, name: string): string {
  return `INSERT INTO classes (id, name, description, type) VALUES ('${id}', '${name}', 'sql description', 2);\n`;
}

function yamlClass(id: string, name: string): string {
  return `id: ${id}\nname: ${name}\ndescription: yaml description\n`;
}

function globToRegExp(glob: string): RegExp {
  const source = glob
    .replace(/[.+^$()|[\]\\]/g, '\\$&')
    .replace(/\{([^}]+)\}/g, (_, alternatives: string) => `(?:${alternatives.split(',').join('|')})`)
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '(?:.*/)?');
  return new RegExp(`^${source}$`, 'i');
}

/** Сколько мс «читается» файл: чем раньше в списке findFiles, тем дольше — чтобы порядок завершения IO был обратным. */
const READ_DELAY_STEP_MS = 3;

describe('SqlProcessor.parseAllSqlFiles', () => {
  let files: Map<string, string>;
  let findOrder: string[];
  let aliasChanged: () => void;
  let linker: jest.Mocked<Pick<ModelLinker, 'linkClassesAndProperties' | 'linkClassesAndObjects' | 'sortModel'>>;
  let processor: SqlProcessor;

  const workspace = vscode.workspace as unknown as {
    findFiles: jest.Mock;
    openTextDocument: jest.Mock;
    fs: { readFile: jest.Mock };
  };

  function setFiles(entries: Record<string, string>): void {
    files = new Map(Object.entries(entries));
    findOrder = [...files.keys()];
  }

  beforeEach(() => {
    files = new Map();
    findOrder = [];
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    workspace.findFiles.mockImplementation(async (pattern: string) => {
      const regex = globToRegExp(pattern);
      return findOrder.filter(p => regex.test(p)).map(p => ({ fsPath: p }));
    });
    workspace.fs.readFile.mockImplementation(async (uri: { fsPath: string }) => {
      const delay = Math.max(0, (findOrder.length - findOrder.indexOf(uri.fsPath)) * READ_DELAY_STEP_MS);
      await new Promise(resolve => setTimeout(resolve, delay));
      const content = files.get(uri.fsPath);
      if (content === undefined) { throw new Error(`ENOENT ${uri.fsPath}`); }
      return Buffer.from(content);
    });
    workspace.openTextDocument.mockImplementation(async (uri: { fsPath: string }) =>
      createFakeDocument(files.get(uri.fsPath) ?? '', uri.fsPath));
    workspace.openTextDocument.mockClear();

    linker = {
      linkClassesAndProperties: jest.fn(),
      linkClassesAndObjects: jest.fn(),
      sortModel: jest.fn((classes, properties, objects, roles) => ({ classes, properties, objects, roles }))
    };
    const aliasService = {
      onAliasesChanged: jest.fn((callback: () => void) => { aliasChanged = callback; })
    } as unknown as AliasService;

    processor = new SqlProcessor(
      aliasService,
      undefined,
      linker as unknown as ModelLinker,
      new CacheManager()
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('dispatch to parsers', () => {
    it('parses sql, class and object files and ignores everything else', async () => {
      setFiles({
        '/ws/a/1. Class.sql': sqlClass(CLASS_ID, 'SqlClass'),
        '/ws/b/Thing.class.yaml': yamlClass('20000000-0000-4000-8000-000000000001', 'YamlClass'),
        '/ws/b/Thing.object.yaml': `- id: ${OBJECT_ID}\n  classId: 20000000-0000-4000-8000-000000000001\n  name: Obj\n`,
        '/ws/b/Roles.role.json': JSON.stringify({ id: 'g', name: 'G', roles: [{ id: 'r1', name: 'Role' }] }),
        '/ws/b/Thing.class.yml': yamlClass('30000000-0000-4000-8000-000000000001', 'Ignored'),
        '/ws/b/readme.md': '# nothing'
      });

      const result = await processor.parseAllSqlFiles();

      expect(result.classes.map(c => c.name).sort()).toEqual(['SqlClass', 'YamlClass']);
      expect(result.objects.map(o => o.id)).toEqual([OBJECT_ID]);
      expect(result.roles.map(r => r.id)).toEqual(['r1']);
      expect(workspace.openTextDocument).toHaveBeenCalledTimes(4);
    });

    it('passes position and line numbers of the original text for yaml entities', async () => {
      const content = `\n\nid: ${CLASS_ID}\nname: Positioned\n`;
      setFiles({ '/ws/Positioned.class.yaml': content });

      const { classes } = await processor.parseAllSqlFiles();

      expect(classes[0]).toMatchObject({ position: content.indexOf(CLASS_ID), lineNumber: 3 });
    });

    it('links and sorts the merged model through the linker', async () => {
      setFiles({ '/ws/Class.sql': sqlClass(CLASS_ID, 'C') });

      await processor.parseAllSqlFiles();

      expect(linker.linkClassesAndProperties).toHaveBeenCalledTimes(1);
      expect(linker.linkClassesAndObjects).toHaveBeenCalledTimes(1);
      expect(linker.sortModel).toHaveBeenCalledTimes(1);
    });
  });

  describe('deterministic order and duplicate ids', () => {
    it('lets yaml win over sql for the same id regardless of discovery order and IO timing', async () => {
      const sqlFirst = {
        '/ws/A/Class.sql': sqlClass(CLASS_ID, 'FromSql'),
        '/ws/Z/Class.class.yaml': yamlClass(CLASS_ID, 'FromYaml')
      };
      setFiles(sqlFirst);
      const first = await processor.parseAllSqlFiles();

      setFiles({
        '/ws/Z/Class.class.yaml': sqlFirst['/ws/Z/Class.class.yaml'],
        '/ws/A/Class.sql': sqlFirst['/ws/A/Class.sql']
      });
      processor.invalidateCache();
      const second = await processor.parseAllSqlFiles();

      expect(first.classes).toHaveLength(1);
      expect(first.classes[0].name).toBe('FromYaml');
      expect(second.classes[0].name).toBe('FromYaml');
    });

    it('breaks ties inside the same group by path, independent of discovery order', async () => {
      const entries: Record<string, string> = {
        '/ws/b/Dup.class.yaml': yamlClass(CLASS_ID, 'FromB'),
        '/ws/a/Dup.class.yaml': yamlClass(CLASS_ID, 'FromA'),
        '/ws/c/Dup.class.json': JSON.stringify({ id: CLASS_ID, name: 'FromC' })
      };

      for (const order of [
        ['/ws/b/Dup.class.yaml', '/ws/a/Dup.class.yaml', '/ws/c/Dup.class.json'],
        ['/ws/c/Dup.class.json', '/ws/b/Dup.class.yaml', '/ws/a/Dup.class.yaml'],
        ['/ws/a/Dup.class.yaml', '/ws/c/Dup.class.json', '/ws/b/Dup.class.yaml']
      ]) {
        files = new Map(order.map(p => [p, entries[p]]));
        findOrder = order;
        processor.invalidateCache();

        const { classes } = await processor.parseAllSqlFiles();

        expect(classes.map(c => c.name)).toEqual(['FromA']);
      }
    });

    it('parses files in a stable order: yaml/json first, then sql, each by path', async () => {
      setFiles({
        '/ws/z/Late.sql': sqlClass('40000000-0000-4000-8000-000000000003', 'Sql-z'),
        '/ws/m/Mid.class.json': JSON.stringify({ id: '40000000-0000-4000-8000-000000000002', name: 'Json-m' }),
        '/ws/a/Early.sql': sqlClass('40000000-0000-4000-8000-000000000004', 'Sql-a'),
        '/ws/k/Key.class.yaml': yamlClass('40000000-0000-4000-8000-000000000001', 'Yaml-k')
      });

      await processor.parseAllSqlFiles();

      const opened = workspace.openTextDocument.mock.calls.map(([uri]) => uri.fsPath);
      expect(opened).toEqual(['/ws/k/Key.class.yaml', '/ws/m/Mid.class.json', '/ws/a/Early.sql', '/ws/z/Late.sql']);
      const [classes] = linker.sortModel.mock.calls[0];
      expect(classes.map(c => c.name)).toEqual(['Yaml-k', 'Json-m', 'Sql-a', 'Sql-z']);
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      setFiles({
        '/ws/One.class.yaml': yamlClass(CLASS_ID, 'One'),
        '/ws/Two.sql': sqlClass('50000000-0000-4000-8000-000000000001', 'Two')
      });
    });

    it('returns the cached result when no file changed', async () => {
      const first = await processor.parseAllSqlFiles();
      workspace.openTextDocument.mockClear();
      linker.sortModel.mockClear();

      const second = await processor.parseAllSqlFiles();

      expect(second).toEqual(first);
      expect(workspace.openTextDocument).not.toHaveBeenCalled();
      expect(linker.sortModel).not.toHaveBeenCalled();
    });

    it('re-links on forceRefresh but reuses per-file parse results for unchanged files', async () => {
      await processor.parseAllSqlFiles();
      workspace.openTextDocument.mockClear();

      await processor.parseAllSqlFiles(true);

      expect(linker.sortModel).toHaveBeenCalledTimes(2);
      expect(workspace.openTextDocument).not.toHaveBeenCalled();
    });

    it('re-parses only the changed file when content changes', async () => {
      await processor.parseAllSqlFiles();
      workspace.openTextDocument.mockClear();
      files.set('/ws/One.class.yaml', yamlClass(CLASS_ID, 'OneRenamed'));

      const { classes } = await processor.parseAllSqlFiles();

      expect(classes.map(c => c.name).sort()).toEqual(['OneRenamed', 'Two']);
      expect(workspace.openTextDocument).toHaveBeenCalledTimes(1);
      expect(workspace.openTextDocument.mock.calls[0][0].fsPath).toBe('/ws/One.class.yaml');
    });

    it('picks up added and removed files', async () => {
      await processor.parseAllSqlFiles();

      files.set('/ws/Three.class.json', JSON.stringify({ id: '50000000-0000-4000-8000-000000000002', name: 'Three' }));
      findOrder.push('/ws/Three.class.json');
      expect((await processor.parseAllSqlFiles()).classes.map(c => c.name).sort()).toEqual(['One', 'Three', 'Two']);

      files.delete('/ws/Two.sql');
      findOrder = findOrder.filter(p => p !== '/ws/Two.sql');
      expect((await processor.parseAllSqlFiles()).classes.map(c => c.name).sort()).toEqual(['One', 'Three']);
    });

    it('invalidateCache drops per-file results too', async () => {
      await processor.parseAllSqlFiles();
      workspace.openTextDocument.mockClear();

      processor.invalidateCache();
      await processor.parseAllSqlFiles();

      expect(workspace.openTextDocument).toHaveBeenCalledTimes(2);
    });

    it('invalidateCacheForFile re-parses just that file', async () => {
      await processor.parseAllSqlFiles();
      workspace.openTextDocument.mockClear();

      processor.invalidateCacheForFile('/ws/Two.sql');
      await processor.parseAllSqlFiles();

      expect(workspace.openTextDocument).toHaveBeenCalledTimes(1);
      expect(workspace.openTextDocument.mock.calls[0][0].fsPath).toBe('/ws/Two.sql');
    });

    it('invalidates everything when class aliases change', async () => {
      await processor.parseAllSqlFiles();
      workspace.openTextDocument.mockClear();

      aliasChanged();
      await processor.parseAllSqlFiles();

      expect(workspace.openTextDocument).toHaveBeenCalledTimes(2);
    });
  });

  describe('error tolerance', () => {
    it('skips files that cannot be read', async () => {
      setFiles({
        '/ws/Good.class.yaml': yamlClass(CLASS_ID, 'Good'),
        '/ws/Gone.class.yaml': yamlClass('60000000-0000-4000-8000-000000000001', 'Gone')
      });
      files.delete('/ws/Gone.class.yaml');

      const { classes } = await processor.parseAllSqlFiles();

      expect(classes.map(c => c.name)).toEqual(['Good']);
      expect(console.error).toHaveBeenCalled();
    });

    it('keeps going when opening one file fails', async () => {
      setFiles({
        '/ws/A.class.yaml': yamlClass('70000000-0000-4000-8000-000000000001', 'A'),
        '/ws/B.class.yaml': yamlClass('70000000-0000-4000-8000-000000000002', 'B')
      });
      const original = workspace.openTextDocument.getMockImplementation()!;
      workspace.openTextDocument.mockImplementation(async (uri: { fsPath: string }) => {
        if (uri.fsPath.endsWith('A.class.yaml')) { throw new Error('boom'); }
        return original(uri);
      });

      const { classes } = await processor.parseAllSqlFiles();

      expect(classes.map(c => c.name)).toEqual(['B']);
    });

    it('does not fail on malformed yaml among valid files', async () => {
      setFiles({
        '/ws/Bad.object.yaml': 'id: [oops',
        '/ws/Ok.class.yaml': yamlClass(CLASS_ID, 'Ok')
      });

      const { classes, objects } = await processor.parseAllSqlFiles();

      expect(classes.map(c => c.name)).toEqual(['Ok']);
      expect(objects).toEqual([]);
    });
  });
});
