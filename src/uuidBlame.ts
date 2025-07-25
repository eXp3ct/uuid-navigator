import * as vscode from 'vscode';
import { UuidBlameInfo } from './types';
import { UuidBlameFinder } from './uuidBlameFinder';
import { getConfig } from './config';

export class UuidBlameProvider {
  private hoverProviderDisposable: vscode.Disposable | undefined;
  private blameFinder: UuidBlameFinder;
  private configChangeDisposable: vscode.Disposable;

  constructor(private context: vscode.ExtensionContext) {
    this.blameFinder = new UuidBlameFinder();
    this.initialize();

    this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('uuidNavigator.showBlameOnHover')) {
        this.updateHoverProvider();
      }
    });

    context.subscriptions.push(this.configChangeDisposable);
  }

  private async initialize() {
    await this.blameFinder.initialize();
    this.updateHoverProvider();
    this.registerCommands();
  }

  private updateHoverProvider() {
    // Удаляем старый провайдер, если он есть
    if (this.hoverProviderDisposable) {
      this.hoverProviderDisposable.dispose();
      this.hoverProviderDisposable = undefined;
    }

    // Создаем новый только если включено в конфиге
    if (getConfig().showBlameOnHover) {
      this.hoverProviderDisposable = vscode.languages.registerHoverProvider(
        ['sql', 'mssql'],
        {
          provideHover: async (document, position) => {
            const range = this.getUuidRangeAtPosition(document, position);
            if (!range) return null;

            const uuid = document.getText(range).replace(/["']/g, '');
            const blameInfo = this.blameFinder.getBlameInfo(uuid);
            if (!blameInfo) return null;

            return new vscode.Hover(this.createBlameMessage(blameInfo));
          }
        }
      );

      if (this.hoverProviderDisposable) {
        this.context.subscriptions.push(this.hoverProviderDisposable);
      }
    }
  }

  private registerCommands() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('uuid-navigator.refreshBlameCache', async () => {
        await this.blameFinder.refreshCache();
        vscode.window.showInformationMessage('UUID blame cache refreshed');
      })
    );
  }

  private getUuidRangeAtPosition(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
    const uuidRegex = /(?<q>["'])?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:(?<=['"])|(?<w>["'])?)/g;
    return document.getWordRangeAtPosition(position, uuidRegex);
  }

  private createBlameMessage(blameInfo: UuidBlameInfo): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`### UUID Reference\n\n`);
    markdown.appendMarkdown(`**UUID:** \`${blameInfo.uuid}\`\n\n`);
    markdown.appendMarkdown(`**Description:** ${blameInfo.comment}\n\n`);
    markdown.appendMarkdown(`**Location:** ${vscode.workspace.asRelativePath(blameInfo.filePath)}:${blameInfo.lineNumber}`);

    // Добавляем команду для перехода к определению
    markdown.appendMarkdown(`\n\n[Go to definition](command:uuid-navigator.goToDefinition?${encodeURIComponent(JSON.stringify(blameInfo))})`);

    markdown.isTrusted = true; // Разрешаем выполнение команд в Markdown

    return markdown;
  }

  dispose() {
    this.hoverProviderDisposable?.dispose();
  }
}