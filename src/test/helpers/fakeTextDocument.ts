import type * as vscode from 'vscode';

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.sql': 'sql',
  '.yaml': 'yaml',
  '.json': 'json',
};

/**
 * In-memory TextDocument для тестов: позиции считаются по '\n' (как в VS Code).
 * Не зависит от мока vscode в runtime, нужен только тип.
 */
export function createFakeDocument(content: string, fsPath: string): vscode.TextDocument {
  const lines = content.split('\n');
  const lineStarts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      lineStarts.push(i + 1);
    }
  }

  const clampLine = (line: number) => Math.max(0, Math.min(line, lines.length - 1));

  const positionAt = (offset: number) => {
    const clamped = Math.max(0, Math.min(offset, content.length));
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= clamped) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { line: low, character: clamped - lineStarts[low] };
  };

  const offsetAt = (position: { line: number; character: number }) => {
    const line = clampLine(position.line);
    const character = Math.max(0, Math.min(position.character, lines[line].length));
    return lineStarts[line] + character;
  };

  const extensionMatch = /\.[^./\\]+$/.exec(fsPath);
  const extension = extensionMatch ? extensionMatch[0].toLowerCase() : '';

  const document = {
    getText: (range?: { start: { line: number; character: number }; end: { line: number; character: number } }) =>
      range ? content.slice(offsetAt(range.start), offsetAt(range.end)) : content,
    positionAt,
    offsetAt,
    lineAt: (line: number) => ({ text: lines[line] }),
    lineCount: lines.length,
    uri: { fsPath },
    fileName: fsPath,
    languageId: LANGUAGE_BY_EXTENSION[extension] ?? 'plaintext',
  };

  return document as unknown as vscode.TextDocument;
}
