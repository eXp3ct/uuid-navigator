import * as vscode from 'vscode';
import { initializeHighlighter, highlightAllUuids } from './highlightingService';
import { registerNavigationCommands } from './navigationService';
import { BlameProvider } from './blameProvider';
import { SqlProcessor } from './sqlProcessor';
import { ExplorerProvider } from './explorerProvider';
import { SqlValidator } from './sqlValidator';
import { registerCommands, setupFileWatchers } from './commandHandlers';
import { AliasService } from './aliasService';

export async function activate(context: vscode.ExtensionContext) {
	console.log('UUID Navigator activated');

	// Инициализация сервисов
	initializeHighlighter(context);
	registerNavigationCommands(context);

	// Инициализация классов
	const aliasService = new AliasService(context);
	const sqlProcessor = new SqlProcessor(aliasService);
	const sqlValidator = new SqlValidator();
	const { classes, properties, objects } = await sqlProcessor.parseAllSqlFiles();

	// Создание провайдеров 
	const blameProvider = new BlameProvider(context, classes, properties, objects);
	const explorerProvider = new ExplorerProvider(classes, objects);
	const treeView = vscode.window.createTreeView('uuidExplorer', {
		treeDataProvider: explorerProvider
	});

	// Регистрация всего функционала
	registerCommands(context, {
		sqlProcessor,
		sqlValidator,
		explorerProvider,
		classes,
		properties,
		objects,
		treeView,
		blameProvider,
		aliasService
	});

	setupFileWatchers(context, sqlProcessor, sqlValidator, explorerProvider, blameProvider);

	// Делаем первоначальные действия
	setTimeout(() => {
		vscode.commands.executeCommand('uuid-navigator.refreshExplorer');
		highlightAllUuids();
	}, 2000);
}

export function deactivate() { }