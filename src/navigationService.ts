import * as vscode from 'vscode';
import { getConfig } from './settings';
import { ExtensionConfig } from './models';
import { getUuidRange } from './utils';
import { ConfigFileRepository } from './configFileRepository';
import { createPositionLookup, PositionLookup } from './positionLookup';

const repository = new ConfigFileRepository();
const utf8 = new TextDecoder('utf-8');

let highlightDecorations: vscode.TextEditorDecorationType[] = [];

export function registerNavigationCommands(context: vscode.ExtensionContext) {
  //TODO: убрать от сюда
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      ['sql', 'mssql', 'yaml', 'json'],
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
  const files = await repository.findFiles();

  const decorationType = createHighlightDecoration(config);
  highlightDecorations.push(decorationType);

  // Открытые документы берём из редактора (с несохранёнными правками), остальные читаем с диска:
  // openTextDocument на сотни файлов дорогой и запускает обработчики onDidOpenTextDocument (валидатор)
  const openDocuments = new Map(vscode.workspace.textDocuments.map(d => [d.uri.fsPath, d]));

  await Promise.all(files.map(async file => {
    try {
      const opened = openDocuments.get(file.fsPath);
      const text = opened ? opened.getText() : utf8.decode(await vscode.workspace.fs.readFile(file));
      const lookup = opened ?? createPositionLookup(text);

      findUuidMatches(text, lookup, uuid).forEach(range => {
        locations.push(new vscode.Location(file, range));
      });
    } catch (error) {
      console.error(`Error searching UUID in ${file.fsPath}:`, error);
    }
  }));

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

function findUuidMatches(text: string, lookup: PositionLookup, uuid: string): vscode.Range[] {
  const regex = new RegExp(`["']?${uuid}["']?`, 'gi');
  const ranges: vscode.Range[] = [];

  let match;
  while ((match = regex.exec(text)) !== null) {
    ranges.push(new vscode.Range(
      lookup.positionAt(match.index),
      lookup.positionAt(match.index + match[0].length)
    ));
  }

  return ranges;
}
