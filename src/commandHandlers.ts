import * as vscode from 'vscode';
import debounce from 'lodash.debounce';
import { highlightAllUuids } from './highlightingService';
import { ClassInfo, ObjectInfo, PropertyInfo, SqlProcessor } from './sqlProcessor';
import { SqlValidator } from './sqlValidator';
import { ExplorerItem, ExplorerProvider } from './explorerProvider';
import { getConfig } from './settings';
import { BlameProvider } from './blameProvider';
import { AliasService } from './aliasService';

type CommandDependencies = {
  sqlProcessor: SqlProcessor;
  sqlValidator: SqlValidator;
  explorerProvider: ExplorerProvider;
  classes: ClassInfo[];
  properties: PropertyInfo[];
  objects: ObjectInfo[];
  treeView: vscode.TreeView<any>;
  blameProvider: BlameProvider;
  aliasService: AliasService;
};

const COMMANDS = {
  FIND_UUIDS: 'uuid-navigator.findUuids',
  GOTO_DEFINITION: 'uuid-navigator.goToDefinition',
  REFRESH_EXPLORER: 'uuid-navigator.refreshExplorer',
  SHOW_EXPLORER: 'uuid-navigator.showExplorer',
  VALIDATE_CURRENT_FILE: 'uuid-navigator.validateCurrentFile',
  SHOW_VALIDATION_LOGS: 'uuid-navigator.showValidatorLogs',
  INSERT_UUID: 'uuid-navigator.insertUuid',
  EXPLORER_FOCUS: 'uuid-navigator.focusTreeView',
  REFRESH_BLAME_CACHE: 'uuid-navigator.refreshBlameCache',
  MANAGE_CLASS_ALIASES: 'uuid-navigator.manageClassAliases',
  CLEAR_ALL_ALIASES: 'uuid-navigator.clearAllAliases',
  GOTO_DEFINITION_FROM_TREEVIEW: 'uuid-navigator.goToDefinitionFromTreeView'
};

export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandDependencies
) {
  const {
    sqlProcessor,
    sqlValidator,
    explorerProvider,
    classes,
    properties,
    objects,
    treeView,
    blameProvider,
    aliasService
  } = deps;

  // Регистрация команд
  const commands = [
    // Основные команды
    vscode.commands.registerCommand(COMMANDS.FIND_UUIDS, highlightAllUuids),
    vscode.window.onDidChangeActiveTextEditor(highlightAllUuids),
    vscode.workspace.onDidChangeTextDocument(() => highlightAllUuids()),
    treeView,

    vscode.commands.registerCommand(COMMANDS.CLEAR_ALL_ALIASES, async () => {
      await aliasService.clearAllAliases();
    }),
    //Информация
    vscode.commands.registerCommand(COMMANDS.REFRESH_BLAME_CACHE, () =>
      handleRefreshBlameCache(sqlProcessor, blameProvider)),

    // Навигация
    vscode.commands.registerCommand(COMMANDS.GOTO_DEFINITION, (uuid: string) =>
      handleGoToDefinition(uuid, classes, properties, objects)),

    // Explorer
    vscode.commands.registerCommand(COMMANDS.REFRESH_EXPLORER, () =>
      handleRefreshExplorer(sqlProcessor, explorerProvider)),

    vscode.commands.registerCommand(COMMANDS.EXPLORER_FOCUS, () =>
      handleFocusTreeView()),

    vscode.commands.registerCommand(COMMANDS.SHOW_EXPLORER, () =>
      handleShowExplorer()),

    vscode.commands.registerCommand(COMMANDS.MANAGE_CLASS_ALIASES, (item: ExplorerItem) =>
      handleManageClassAliases(item, aliasService, classes, async () => {
        await vscode.commands.executeCommand(COMMANDS.REFRESH_BLAME_CACHE)
        await vscode.commands.executeCommand(COMMANDS.REFRESH_EXPLORER)
      })
    ),

    vscode.commands.registerCommand(COMMANDS.GOTO_DEFINITION_FROM_TREEVIEW, (item: ExplorerItem) => 
      handleGoToDefinition(item.uuid, classes, properties, objects)),

    // Валидация
    vscode.commands.registerCommand(COMMANDS.VALIDATE_CURRENT_FILE, () =>
      handleValidateCurrentFile(sqlValidator)),

    vscode.commands.registerCommand(COMMANDS.SHOW_VALIDATION_LOGS, () =>
      sqlValidator.showOutput()),

    // Утилиты
    vscode.commands.registerCommand(COMMANDS.INSERT_UUID, (uuid: string) =>
      handleInsertUuid(uuid))
  ];

  commands.forEach(cmd => context.subscriptions.push(cmd));
}

export function setupFileWatchers(
  context: vscode.ExtensionContext,
  sqlProcessor: SqlProcessor,
  sqlValidator: SqlValidator,
  explorerProvider: ExplorerProvider,
  blameProvider: BlameProvider
) {
  // Общая функция создания вотчеров
  const createFileWatcher = (callback: () => Promise<void>) => {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.sql');
    const debouncedRefresh = debounce(callback, 500);

    watcher.onDidChange(uri => sqlProcessor.invalidateCacheForFile(uri.fsPath));
    watcher.onDidCreate(() => sqlProcessor.invalidateCache());
    watcher.onDidDelete(() => sqlProcessor.invalidateCache());

    [watcher.onDidChange, watcher.onDidCreate, watcher.onDidDelete].forEach(
      event => event(() => debouncedRefresh())
    );

    context.subscriptions.push(watcher);
    return watcher;
  };

  // Валидация документов
  const validateDocument = (document: vscode.TextDocument) => {
    const config = getConfig();
    if (config.enableValidation) {
      sqlValidator.validateDocument(document);
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(validateDocument),
    vscode.workspace.onDidSaveTextDocument(validateDocument),
    vscode.workspace.onDidCloseTextDocument(doc => {
      sqlValidator.clearDiagnostics(doc.uri);
    })
  );

  // Вотчер для TreeView
  createFileWatcher(async () => {
    const { classes, objects } = await sqlProcessor.parseAllSqlFiles();
    explorerProvider.refresh(classes, objects);
  });

  // Вотчер для BlameProvider
  createFileWatcher(async () => {
    const { classes, properties, objects } = await sqlProcessor.parseAllSqlFiles();
    await blameProvider.refresh(classes, properties, objects);
  });
}


async function handleManageClassAliases(
  item: ExplorerItem,
  aliasService: AliasService,
  classes: ClassInfo[],
  callback: (...args: any) => Thenable<void>
) {
  const cls = classes.find(c => c.id === item.uuid);
  if (!cls) {
    vscode.window.showErrorMessage('Класс не найден');
    return;
  }

  const currentAlias = aliasService.getAlias(item.uuid) || '';
  const newAlias = await vscode.window.showInputBox({
    prompt: `Установите алиас для класса "${cls.name}"`,
    placeHolder: 'Введите один алиас',
    value: currentAlias,
    validateInput: (value) => {
      if (value.includes(',')) {
        return 'Алиас не должен содержать запятых';
      }
      return null;
    }
  });

  if (newAlias !== undefined) { // undefined - пользователь отменил ввод
    await aliasService.setAlias(item.uuid, newAlias);
    await callback();
    const action = newAlias.trim() ? 'обновлен' : 'удален';
    vscode.window.showInformationMessage(`Алиас для класса "${cls.name}" ${action}`);
  }
}

async function handleGoToDefinition(uuid: string, classes: ClassInfo[], properties: PropertyInfo[], objects: ObjectInfo[]) {
  const target = classes.find(c => c.id === uuid) || properties.find(p => p.id === uuid) || objects.find(o => o.id === uuid);
  if (!target?.filePath) {
    vscode.window.showErrorMessage(`Definition for UUID ${uuid} not found`);
    return;
  }

  try {
    const uri = vscode.Uri.file(target.filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    const match = new RegExp(`'${uuid}'`).exec(text);

    if (!match) {
      vscode.window.showErrorMessage(`UUID not found in file`);
      return;
    }

    const position = document.positionAt(match.index);
    await vscode.window.showTextDocument(uri, { selection: new vscode.Range(position, position) });
    vscode.window.showInformationMessage(`Navigated to: ${target.name || 'Unknown'}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to navigate: ${error}`);
  }
}

async function handleRefreshBlameCache(sqlProcessor: SqlProcessor, blameProvider: BlameProvider) {
  const { classes, properties, objects } = await sqlProcessor.parseAllSqlFiles(true);

  await blameProvider.refresh(classes, properties, objects);
  vscode.window.showInformationMessage('UUID blame cache refreshed');
}


async function handleRefreshExplorer(sqlProcessor: SqlProcessor, explorerProvider: ExplorerProvider) {
  const { classes, objects } = await sqlProcessor.parseAllSqlFiles(true);
  explorerProvider.refresh(classes, objects);
}

async function handleShowExplorer() {
  try {
    await vscode.commands.executeCommand(COMMANDS.REFRESH_EXPLORER);
    await vscode.commands.executeCommand(COMMANDS.EXPLORER_FOCUS);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to show UUID Explorer: ${error}`);
    console.error(error);
  }
}

async function handleFocusTreeView() {
  try {
    await vscode.commands.executeCommand('uuidExplorer.focus');
  } catch (error) {
    console.error(error);
  }
}


function handleValidateCurrentFile(sqlValidator: SqlValidator) {
  const editor = vscode.window.activeTextEditor;
  editor && sqlValidator.validateDocument(editor.document);
}

function handleInsertUuid(uuid: string) {
  const editor = vscode.window.activeTextEditor;
  editor?.edit(editBuilder => editBuilder.insert(editor.selection.active, uuid));
}




