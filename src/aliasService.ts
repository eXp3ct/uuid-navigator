// aliasService.ts
import * as vscode from 'vscode';

interface ClassAliasMap {
  [classId: string]: string; // Теперь храним один алиас как строку
}

export class AliasService {
  private _onAliasesChanged = new vscode.EventEmitter<void>();
  readonly onAliasesChanged = this._onAliasesChanged.event;

  private static storageKey = 'uuid-navigator.classAliases';
  private aliases: ClassAliasMap = {};

  constructor(private context: vscode.ExtensionContext) {
    this.loadAliases();
  }

  private loadAliases(): void {
    const saved = this.context.globalState.get<ClassAliasMap>(AliasService.storageKey);
    this.aliases = saved || {};
  }

  private saveAliases(): Thenable<void> {
    const result = this.context.globalState.update(AliasService.storageKey, this.aliases);
    this._onAliasesChanged.fire();

    return result;
  }

  async clearAllAliases(): Promise<void> {
    this.aliases = {};
    await this.saveAliases();
  }

  getAlias(classId: string): string | undefined {
    //console.log('get alias for %s is %s', classId, this.aliases[classId])
    return this.aliases[classId];
  }

  async setAlias(classId: string, alias: string): Promise<void> {
    if (alias.trim().length === 0) {
      delete this.aliases[classId];
    } else {
      this.aliases[classId] = alias.trim();
    }
    await this.saveAliases();
  }

  async removeAlias(classId: string): Promise<void> {
    delete this.aliases[classId];
    await this.saveAliases();
  }
}