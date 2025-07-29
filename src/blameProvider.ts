import * as vscode from 'vscode';
import { UuidInfo } from './models';
import { UuidFinder } from './uuidFinder';
import { getConfig } from './settings';
import { BlameTemplateRenderer } from './templateRenderer';
import { ClassInfo, PropertyInfo, SqlProcessor } from './sqlProcessor';
import { getUuidRange } from './utils';

export class BlameProvider {
  private hoverProvider?: vscode.Disposable;
  private uuidFinder: UuidFinder;
  private configListener: vscode.Disposable;

  constructor(
    private context: vscode.ExtensionContext,
    classes: ClassInfo[],
    properties: PropertyInfo[]
  ) {
    this.uuidFinder = new UuidFinder(classes, properties);
    this.initialize();

    this.configListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('uuidNavigator.showBlameOnHover')) {
        this.updateHoverProvider();
      }
    });

    context.subscriptions.push(this.configListener);
  }

  private async initialize() {
    await this.uuidFinder.initialize();
    this.updateHoverProvider();
    this.registerCommands();
  }

  private updateHoverProvider() {
    this.hoverProvider?.dispose();
    this.hoverProvider = undefined;

    if (getConfig().showBlameOnHover) {
      this.hoverProvider = vscode.languages.registerHoverProvider(
        ['sql', 'mssql'],
        {
          provideHover: async (document, position) => {
            const range = getUuidRange(document, position);
            if (!range) return null;

            const uuid = document.getText(range).replace(/["']/g, '');
            const info = this.uuidFinder.getInfo(uuid);
            if (!info) return null;

            return new vscode.Hover(this.createBlameMessage(info));
          }
        }
      );

      if (this.hoverProvider) {
        this.context.subscriptions.push(this.hoverProvider);
      }
    }
  }

  private registerCommands() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('uuid-navigator.refreshBlameCache', async () => {
        await this.uuidFinder.refreshCache();
        vscode.window.showInformationMessage('UUID blame cache refreshed');
      })
    );
  }

  private createBlameMessage(info: UuidInfo): vscode.MarkdownString {
    const config = getConfig();
    const template = config.blameTemplate || [];
    const content = BlameTemplateRenderer.render(template, info);

    const markdown = new vscode.MarkdownString(content);
    markdown.isTrusted = true;
    return markdown;
  }

  dispose() {
    this.hoverProvider?.dispose();
    this.configListener.dispose();
  }
}