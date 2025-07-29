import * as vscode from 'vscode';

export function getUuidRange(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Range | undefined {
  const uuidRegex = /["']?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["']?/gi;
  return document.getWordRangeAtPosition(position, uuidRegex);
}

export function isSqlFile(document: vscode.TextDocument): boolean {
  return document.languageId === 'sql' ||
    document.languageId === 'mssql' ||
    document.fileName.endsWith('.sql');
}