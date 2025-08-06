import * as vscode from 'vscode';
import { getConfig } from './settings';
import { ExtensionConfig } from './models';
import { getUuidRange } from './utils';

let highlightDecorations: vscode.TextEditorDecorationType[] = [];

export function registerNavigationCommands(context: vscode.ExtensionContext) {
  //TODO: убрать от сюда
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      ['sql', 'mssql'],
      { provideDefinition: findUuidReferences }
    ),
    vscode.commands.registerCommand('uuid-navigator.clearHighlights', clearHighlights)
  );
}

export function clearHighlights() {
  highlightDecorations.forEach(d => d.dispose());
  highlightDecorations = [];
}

export async function findUuidReferences(document: vscode.TextDocument, position: vscode.Position) {
  const range = getUuidRange(document, position);
  if (!range) {return null;}

  const uuid = document.getText(range).replace(/["']/g, '');
  return await findUuidLocations(uuid);
}

async function findUuidLocations(uuid: string) {
  clearHighlights();
  const config = getConfig();
  const locations: vscode.Location[] = [];
  const files = await vscode.workspace.findFiles('**/*.sql');

  const decorationType = createHighlightDecoration(config);
  highlightDecorations.push(decorationType);

  for (const file of files) {
    const document = await vscode.workspace.openTextDocument(file);
    const matches = findUuidMatches(document, uuid);

    matches.forEach(match => {
      locations.push(new vscode.Location(file, match.range));
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

function createHighlightDecoration(config: ExtensionConfig) {
  return vscode.window.createTextEditorDecorationType({
    backgroundColor: config.backgroundColor,
    border: `1px solid ${config.backgroundColor.substring(0, 7)}b3`,
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