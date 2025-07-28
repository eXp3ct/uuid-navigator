import * as vscode from 'vscode';
import { UuidBlameInfo } from './types';

export class UuidBlameFinder {
  private cachedBlameInfo: UuidBlameInfo[] = [];

  async initialize() {
    await this.findUuidsWithComments();
  }

  async findUuidsWithComments(): Promise<UuidBlameInfo[]> {
    this.cachedBlameInfo = [];
    const files = await vscode.workspace.findFiles('**/*.sql');

    for (const file of files) {
      const document = await vscode.workspace.openTextDocument(file);
      const blameInfos = this.parseDocumentForUuidComments(document);
      this.cachedBlameInfo.push(...blameInfos);
    }

    return this.cachedBlameInfo;
  }

  private parseDocumentForUuidComments(document: vscode.TextDocument): UuidBlameInfo[] {
    const blameInfos: UuidBlameInfo[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const uuidMatch = line.match(/'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'/);

      if (uuidMatch && i > 0) {
        const prevLine = lines[i - 1].trim();
        if (prevLine.startsWith('--')) {
          const comment = prevLine.substring(2).trim();
          blameInfos.push({
            uuid: uuidMatch[1],
            comment: comment,
            filePath: document.uri.fsPath,
            lineNumber: i + 1 // 1-based
          });
        }
      }
    }

    return blameInfos;
  }

  getBlameInfo(uuid: string): UuidBlameInfo | undefined {
    return this.cachedBlameInfo.find(info => info.uuid === uuid);
  }

  async refreshCache() {
    await this.findUuidsWithComments();
  }
}