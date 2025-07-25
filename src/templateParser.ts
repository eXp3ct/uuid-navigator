import * as vscode from 'vscode';
import { UuidBlameInfo } from './types';

export class BlameTemplateParser {
  private static elementTemplates = {
    className: (info: UuidBlameInfo) => `### Class name: ${this.extractClassName(info.filePath)}`,
    uuid: (info: UuidBlameInfo) => `**UUID:** \`${info.uuid}\``,
    lineComment: (info: UuidBlameInfo) => `**Description:** ${info.comment}`,
    location: (info: UuidBlameInfo) => `**Location:** ${vscode.workspace.asRelativePath(info.filePath)}:${info.lineNumber}`,
    goToButton: (info: UuidBlameInfo) => `[Go to definition](command:uuid-navigator.goToDefinition?${encodeURIComponent(JSON.stringify(info))})`
  };

  static parse(template: string[], blameInfo: UuidBlameInfo): string {
    return template
      .map(element => {
        const templateFn = this.elementTemplates[element as keyof typeof this.elementTemplates];
        return templateFn ? templateFn(blameInfo) : '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  private static extractClassName(filePath: string): string {
    const pathParts = filePath.split(/[\\\/]/);
    return pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Unknown';
  }
}