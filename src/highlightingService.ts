import * as vscode from 'vscode';
import { getConfig } from './settings';
import { isSqlFile } from './utils';

let decorationType: vscode.TextEditorDecorationType;

export function initializeHighlighter(context: vscode.ExtensionContext) {
  updateDecorationStyle();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('uuidNavigator')) {
        updateDecorationStyle();
        highlightAllUuids();
      }
    })
  );
}

function updateDecorationStyle() {
  decorationType?.dispose();
  const config = getConfig();

  decorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: config.underline ? 'underline' : 'none',
    cursor: config.cursorPointer ? 'pointer' : 'default',
    color: config.highlightColor,
    backgroundColor: config.backgroundColor
  });
}

export function highlightAllUuids(editor = vscode.window.activeTextEditor) {
  if (!editor || !isSqlFile(editor.document)) {return;}

  const config = getConfig();
  if (!config.applyStyles) {return;}

  const decorations = findUuidDecorations(editor.document);
  editor.setDecorations(decorationType, decorations);
}

function findUuidDecorations(document: vscode.TextDocument) {
  const text = document.getText();
  const uuidRegex = /["']?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["']?/gi;
  const decorations: vscode.DecorationOptions[] = [];

  let match;
  while ((match = uuidRegex.exec(text)) !== null) {
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);

    decorations.push({
      range: new vscode.Range(startPos, endPos)
    });
  }

  return decorations;
}