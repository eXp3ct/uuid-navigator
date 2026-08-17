import * as vscode from 'vscode';
import { ConfigFileRepository } from '../configFileRepository';

jest.mock('vscode');

describe('ConfigFileRepository', () => {
  let repository: ConfigFileRepository;

  beforeEach(() => {
    repository = new ConfigFileRepository();
    jest.clearAllMocks();
  });

  describe('findFiles', () => {
    it('queries sql, class and object patterns, all excluding bin/obj/node_modules/.git', async () => {
      (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

      await repository.findFiles();

      const exclude = '**/{bin,obj,node_modules,.git}/**';
      expect(vscode.workspace.findFiles).toHaveBeenCalledWith('**/*.sql', exclude);
      expect(vscode.workspace.findFiles).toHaveBeenCalledWith('**/*.class.{yaml,yml,json}', exclude);
      expect(vscode.workspace.findFiles).toHaveBeenCalledWith('**/*.object.{yaml,yml,json}', exclude);
    });

    it('merges results from all patterns and de-duplicates by path', async () => {
      (vscode.workspace.findFiles as jest.Mock)
        .mockResolvedValueOnce([{ fsPath: 'a.sql' }, { fsPath: 'b.sql' }])
        .mockResolvedValueOnce([{ fsPath: 'c.class.yaml' }])
        .mockResolvedValueOnce([{ fsPath: 'a.sql' }]); // duplicate

      const files = await repository.findFiles();

      expect(files.map(f => f.fsPath).sort()).toEqual(['a.sql', 'b.sql', 'c.class.yaml']);
    });
  });

  describe('createWatchers', () => {
    it('creates one watcher per include pattern and registers them for disposal', () => {
      const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

      const watchers = repository.createWatchers(context);

      expect(watchers).toHaveLength(3);
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/*.sql');
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/*.class.{yaml,yml,json}');
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/*.object.{yaml,yml,json}');
      expect(context.subscriptions).toHaveLength(3);
    });
  });

  describe('isExcludedPath', () => {
    it('flags paths under bin/obj/node_modules/.git', () => {
      expect(repository.isExcludedPath('/repo/src/bin/Debug/Foo.sql')).toBe(true);
      expect(repository.isExcludedPath('/repo/src/obj/Debug/Foo.sql')).toBe(true);
      expect(repository.isExcludedPath('/repo/node_modules/pkg/Foo.sql')).toBe(true);
      expect(repository.isExcludedPath('/repo/.git/Foo.sql')).toBe(true);
    });

    it('does not flag ordinary paths, even if they contain "bin"/"obj" as a substring', () => {
      expect(repository.isExcludedPath('/repo/src/Migrations/Foo.sql')).toBe(false);
      expect(repository.isExcludedPath('/repo/src/Cabin/Foo.sql')).toBe(false);
      expect(repository.isExcludedPath('/repo/src/Objects/Foo.sql')).toBe(false);
    });
  });
});
