import * as vscode from 'vscode';

/** Всё, что парсерам нужно от документа: смещение в тексте -> позиция (строка/символ). */
export type PositionLookup = Pick<vscode.TextDocument, 'positionAt'>;

/**
 * Индекс строк по тексту файла. Заменяет vscode.workspace.openTextDocument при парсинге:
 * не открывает сотни документов в VS Code и считает позиции ровно по тому тексту,
 * который был прочитан с диска и захеширован.
 */
export function createPositionLookup(content: string): PositionLookup {
  const lineStarts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) { lineStarts.push(i + 1); }
  }

  return {
    positionAt(offset: number): vscode.Position {
      const clamped = Math.max(0, Math.min(offset, content.length));

      // Последняя строка, начало которой <= clamped
      let low = 0;
      let high = lineStarts.length - 1;
      while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (lineStarts[mid] <= clamped) { low = mid; } else { high = mid - 1; }
      }

      return new vscode.Position(low, clamped - lineStarts[low]);
    }
  };
}
