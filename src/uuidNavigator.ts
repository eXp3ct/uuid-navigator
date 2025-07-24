import * as vscode from 'vscode';
import { ExtensionConfig, getConfig } from './config';

let referenceDecorations: vscode.TextEditorDecorationType[] = [];

export function activateNavigator(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      ['sql', 'mssql'],
      { provideDefinition: findUuidReferences }
    ),
    vscode.commands.registerCommand('uuid-navigator.clearHighlights', clearReferenceHighlights)
  );
}

export function clearReferenceHighlights() {
  referenceDecorations.forEach(decoration => decoration.dispose());
  referenceDecorations = [];
}

export async function findUuidReferences(document: vscode.TextDocument, position: vscode.Position) {
  const range = getUuidRangeAtPosition(document, position);
  if (!range) {return null;}

  const uuid = document.getText(range).replace(/["']/g, '');
  return await findUuidLocations(uuid);
}

function getUuidRangeAtPosition(document: vscode.TextDocument, position: vscode.Position) {
  const uuidRegex = /(?<q>["'])?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:(?<=['"])|(?<w>["'])?)/g;
  return document.getWordRangeAtPosition(position, uuidRegex);
}

async function findUuidLocations(uuid: string) {
  clearReferenceHighlights();
  const config = getConfig();
  const locations: vscode.Location[] = [];
  const files = await vscode.workspace.findFiles('**/*.sql');

  const decorationType = createReferenceDecorationType(getConfig());
  referenceDecorations.push(decorationType);

  for (const file of files) {
    const document = await vscode.workspace.openTextDocument(file);
    const matches = findUuidMatches(document, uuid);

    matches.forEach(match => {
      locations.push(new vscode.Location(file, match.range));
      highlightMatchInEditor(file, match);
    });
  }

  if (config.showNotifications && locations.length > 0) {
    vscode.window.showInformationMessage(
      `Found ${locations.length} references to UUID: ${uuid}`,
      { title: 'Clear Highlights', command: 'uuid-navigator.clearHighlights' }
    );
  }

  return locations;
}

function createReferenceDecorationType(config: ExtensionConfig) {
  return vscode.window.createTextEditorDecorationType({
    backgroundColor: config.backgroundColor,
    border: `1px solid ${config.backgroundColor.substring(0, 7)}b3`, // Добавляем прозрачность
    borderRadius: '2px'
  });
}

function findUuidMatches(document: vscode.TextDocument, uuid: string) {
  const text = document.getText();
  const regex = new RegExp(`["']?${uuid}["']?`, 'gi');
  const matches: { range: vscode.Range }[] = [];

  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      range: new vscode.Range(
        document.positionAt(match.index),
        document.positionAt(match.index + match[0].length)
      )
    });
  }

  return matches;
}

function highlightMatchInEditor(file: vscode.Uri, match: { range: vscode.Range }) {
  vscode.window.visibleTextEditors.forEach(editor => {
    if (editor.document.uri.toString() === file.toString()) {
      // Используем встроенный декор для референсов
      const decor = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
        border: `1px solid ${new vscode.ThemeColor('editor.findMatchHighlightBorder')}`
      });
      editor.setDecorations(decor, [{
        range: match.range,
        hoverMessage: `Reference to UUID`
      }]);
      setTimeout(() => decor.dispose(), 5000); // Автоочистка
    }
  });
}