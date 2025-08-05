import * as vscode from 'vscode';
import { initializeHighlighter, highlightAllUuids } from './highlightingService';
import { registerNavigationCommands } from './navigationService';
import { BlameProvider } from './blameProvider';
import { SqlProcessor } from './sqlProcessor';
import { ExplorerProvider } from './explorerProvider';
import { SqlValidator } from './sqlValidator';
import { registerCommands, setupFileWatchers } from './commandHandlers';
import { AliasService } from './aliasService';
import path from 'path';

export async function activate(context: vscode.ExtensionContext) {
	checkForExtensionUpdate(context);
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

function checkForExtensionUpdate(context: vscode.ExtensionContext) {
	const extension = vscode.extensions.getExtension(context.extension.id);
	if (!extension) {return;}

	const currentVersion = extension.packageJSON.version;
	const previousVersion = context.globalState.get('extensionVersion');

	if (currentVersion && currentVersion !== previousVersion) {
		showUpdateNotification(currentVersion, context);
	}

	context.globalState.update('extensionVersion', currentVersion);
}

async function showUpdateNotification(version: string, context: vscode.ExtensionContext) {
	try {
		const showChanges = 'Показать изменения';
		const dontShowAgain = 'Не показывать снова';

		const selection = await vscode.window.showInformationMessage(
			`Расширение обновлено до версии ${version}!`,
			showChanges,
			dontShowAgain
		);

		if (selection === showChanges) {
			showChangelogInPreview(context);
		} else if (selection === dontShowAgain) {
			context.globalState.update('disableUpdateNotifications', true);
		}
	} catch (error) {
		console.error('Error reading CHANGELOG:', error);
		vscode.window.showInformationMessage(
			`Расширение обновлено до версии ${version}!`
		);
	}
}

async function showChangelogInPreview(context: vscode.ExtensionContext) {
    const changelogPath = path.join(context.extensionPath, 'CHANGELOG.md');
    const uri = vscode.Uri.file(changelogPath);
    await vscode.commands.executeCommand('markdown.showPreview', uri);
}
