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
import fs from 'fs';

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
	const changelogPath = path.join(context.extensionPath, 'CHANGELOG.md');

	try {
		const changelogContent = fs.readFileSync(changelogPath, 'utf8');
		const latestChanges = extractChangesForVersion(changelogContent, version);

		const showChanges = 'Показать изменения';
		const dontShowAgain = 'Не показывать снова';

		const selection = await vscode.window.showInformationMessage(
			`Расширение обновлено до версии ${version}!`,
			showChanges,
			dontShowAgain
		);

		if (selection === showChanges) {
			showChangelogInWebview(context, latestChanges, version);
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

function extractChangesForVersion(content: string, version: string): string {
	const versionPattern = new RegExp(`## \\[${version}\\] - \\d{4}-\\d{2}-\\d{2}([\\s\\S]+?)(?=## \\[\\d+\\.\\d+\\.\\d+\\]|$)`);
	const match = content.match(versionPattern);
	return match ? match[1].trim() : 'Изменения для этой версии не найдены в CHANGELOG.md';
}

function showChangelogInWebview(context: vscode.ExtensionContext, changes: string, version: string) {
	const panel = vscode.window.createWebviewPanel(
		'extensionChangelog',
		`Что нового в v${version}`,
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true
		}
	);

	panel.webview.html = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Изменения в v${version}</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    line-height: 1.6;
                }
                h1 {
                    color: var(--vscode-editor-foreground);
                    border-bottom: 1px solid var(--vscode-editorWidget-border);
                    padding-bottom: 0.3em;
                }
                h2 {
                    color: var(--vscode-editor-foreground);
                    border-bottom: 1px solid var(--vscode-editorWidget-border);
                    padding-bottom: 0.3em;
                    margin-top: 1.5em;
                }
                ul {
                    padding-left: 2em;
                }
                li {
                    margin-bottom: 0.5em;
                }
                code {
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 0.2em 0.4em;
                    border-radius: 3px;
                    font-family: var(--vscode-editor-font-family);
                }
                .added {
                    color: #388a34;
                }
                .fixed {
                    color: #ad0707;
                }
                .version-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1em;
                }
            </style>
        </head>
        <body>
            <div class="version-header">
                <h1>Изменения в версии ${version}</h1>
                <span>${extractVersionDate(changes)}</span>
            </div>
            ${simpleMarkdownToHtml(changes)}
        </body>
        </html>
    `;
}

function extractVersionDate(changes: string): string {
	const dateMatch = changes.match(/\[.*\] - (\d{4}-\d{2}-\d{2})/);
	return dateMatch ? dateMatch[1] : '';
}

function simpleMarkdownToHtml(markdown: string): string {
	// Обработка заголовков
	let html = markdown
		.replace(/^## \[.*\] - \d{4}-\d{2}-\d{2}/gm, '') // Удаляем строку версии
		.replace(/^### (Added|Добавлено)/gm, '<h2 class="added">$1</h2>')
		.replace(/^### (Fixed|Исправлено)/gm, '<h2 class="fixed">$1</h2>')
		.replace(/^### (.+)/gm, '<h2>$1</h2>');

	// Обработка списков
	html = html.replace(/^-\s(.+)/gm, '<li>$1</li>');
	html = html.replace(/<li>.+<\/li>/g, '<ul>$&</ul>');

	// Обработка переносов строк
	html = html.replace(/\n/g, '<br>');

	// Обработка встроенного кода
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

	return html;
}

function convertChangelogToHtml(markdown: string): string {
	// Простой конвертер Markdown -> HTML для вашего формата
	return markdown
		.replace(/### Added/g, '<h2 class="added">Добавлено</h2>')
		.replace(/### Fixed/g, '<h2 class="fixed">Исправлено</h2>')
		.replace(/-\s(.+)/g, '<li>$1</li>')
		.replace(/\n/g, '<br>');
}