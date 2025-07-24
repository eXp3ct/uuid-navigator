import * as vscode from 'vscode';
import { ExtensionConfig, getConfig } from './config';

let decorationType: vscode.TextEditorDecorationType;
let currentEditor: vscode.TextEditor | undefined;

export function activateHighlighter(context: vscode.ExtensionContext) {
  updateDecorationType();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('uuidNavigator')) {
        updateDecorationType();
        highlightAllUuids();
      }
    })
  );
}

function updateDecorationType() {
  const config = getConfig();
  decorationType?.dispose();

  decorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: config.underline ? 'underline' : 'none',
    cursor: 'pointer',
    color: config.highlightColor,
    backgroundColor: config.backgroundColor
  });
}

export function highlightAllUuids(editor = vscode.window.activeTextEditor) {
  if (!editor || !isSqlFile(editor.document)) {return;}
  const { applyStyles } = getConfig();
  if (!applyStyles) return;
  const decorations = findUuidDecorations(editor.document);
  editor.setDecorations(decorationType, decorations);
}

function findUuidDecorations(document: vscode.TextDocument) {
  const text = document.getText();
  const uuidRegex = /(?<q>["'])?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:(?<=['"])|(?<w>["'])?)/g;
  const decorations: vscode.DecorationOptions[] = [];

  let match;
  while ((match = uuidRegex.exec(text)) !== null) {
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    decorations.push({
      range: new vscode.Range(startPos, endPos),
      hoverMessage: `UUID: ${match[0].replace(/["']/g, '')}\n\nCtrl+Click to find references`
    });
  }

  return decorations;
}

function isSqlFile(document: vscode.TextDocument): boolean {
  return document.languageId === 'sql' ||
    document.languageId === 'mssql' ||
    document.fileName.endsWith('.sql');
}