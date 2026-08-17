import * as vscode from 'vscode';

const INCLUDE_PATTERNS = [
  '**/*.sql',
  '**/*.class.{yaml,yml,json}',
  '**/*.object.{yaml,yml,json}'
];

const EXCLUDE_PATTERN = '**/{bin,obj,node_modules,.git}/**';
const EXCLUDED_SEGMENTS = ['bin', 'obj', 'node_modules', '.git'];

export class ConfigFileRepository {
  public async findFiles(): Promise<vscode.Uri[]> {
    const results = await Promise.all(
      INCLUDE_PATTERNS.map(pattern => vscode.workspace.findFiles(pattern, EXCLUDE_PATTERN))
    );

    const uniqueByPath = new Map<string, vscode.Uri>();
    for (const uris of results) {
      for (const uri of uris) {
        uniqueByPath.set(uri.fsPath, uri);
      }
    }

    return Array.from(uniqueByPath.values());
  }

  public createWatchers(context: vscode.ExtensionContext): vscode.FileSystemWatcher[] {
    const watchers = INCLUDE_PATTERNS.map(pattern => vscode.workspace.createFileSystemWatcher(pattern));
    watchers.forEach(watcher => context.subscriptions.push(watcher));
    return watchers;
  }

  public isExcludedPath(fsPath: string): boolean {
    const normalized = fsPath.split(/[\\/]/);
    return EXCLUDED_SEGMENTS.some(segment => normalized.includes(segment));
  }
}
