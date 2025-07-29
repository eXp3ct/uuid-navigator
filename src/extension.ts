import * as vscode from 'vscode';
import { debounce } from 'lodash';
import { initializeHighlighter, highlightAllUuids } from './highlightingService';
import { registerNavigationCommands } from './navigationService';
import { BlameProvider } from './blameProvider';
import { SqlProcessor } from './sqlProcessor';
import { ExplorerProvider } from './explorerProvider';

export async function activate(context: vscode.ExtensionContext) {
	console.log('UUID Navigator activated');

	initializeHighlighter(context);
	registerNavigationCommands(context);

	const sqlProcessor = new SqlProcessor();
	const { classes, properties, objects } = await sqlProcessor.parseAllSqlFiles();

	new BlameProvider(context, classes, properties, objects);
	const explorerProvider = new ExplorerProvider(classes, objects);

	const treeView = vscode.window.createTreeView('uuidExplorer', {
		treeDataProvider: explorerProvider
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('uuid-navigator.findUuids', highlightAllUuids),
		vscode.window.onDidChangeActiveTextEditor(highlightAllUuids),
		vscode.workspace.onDidChangeTextDocument(() => highlightAllUuids()),
		treeView,

		vscode.commands.registerCommand('uuid-navigator.goToDefinition', async (uuid: string) => {
			const target = classes.find(c => c.id === uuid) || properties.find(p => p.id === uuid) || objects.find(o => o.id === uuid);

			if (target?.filePath) {
				try {
					const uri = vscode.Uri.file(target.filePath);
					const document = await vscode.workspace.openTextDocument(uri);
					const text = document.getText();
					const match = new RegExp(`'${uuid}'`).exec(text);

					if (match) {
						const position = document.positionAt(match.index);
						await vscode.window.showTextDocument(uri, {
							selection: new vscode.Range(position, position)
						});

						const name = target.name || 'Unknown';
						vscode.window.showInformationMessage(`Navigated to: ${name}`);
					} else {
						vscode.window.showErrorMessage(`UUID not found in file`);
					}
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to navigate: ${error}`);
				}
			} else {
				vscode.window.showErrorMessage(`Definition for UUID ${uuid} not found`);
			}
		}),

		vscode.commands.registerCommand('uuid-navigator.refreshExplorer', async () => {
			const { classes, objects } = await sqlProcessor.parseAllSqlFiles(true);
			explorerProvider.refresh(classes, objects);
		}),

		vscode.commands.registerCommand('uuid-navigator.insertUuid', (uuid: string) => {
			const editor = vscode.window.activeTextEditor;
			editor?.edit(editBuilder => {
				editBuilder.insert(editor.selection.active, uuid);
			});
		}),

		vscode.commands.registerCommand('uuid-navigator.showExplorer', async () => {
			try {
				await vscode.commands.executeCommand('uuid-navigator.refreshExplorer');
				await vscode.commands.executeCommand('uuidExplorer.focus');
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to show UUID Explorer: ${error}`);
				console.error(error);
			}
		}),

		vscode.commands.registerCommand('uuid-navigator.focusTreeView', () => {
			vscode.commands.executeCommand('uuidExplorer.focus');
		})
	);

	const watcher = vscode.workspace.createFileSystemWatcher('**/*.sql');
	const refreshTree = debounce(async () => {
		const { classes, objects } = await sqlProcessor.parseAllSqlFiles();
		explorerProvider.refresh(classes, objects);
	}, 500);

	watcher.onDidChange(uri => {
		sqlProcessor.invalidateCacheForFile(uri.fsPath);
		refreshTree();
	});

	watcher.onDidCreate(() => {
		sqlProcessor.invalidateCache();
		refreshTree();
	});

	watcher.onDidDelete(() => {
		sqlProcessor.invalidateCache();
		refreshTree();
	});

	context.subscriptions.push(watcher);

	setTimeout(() => {
		vscode.commands.executeCommand('uuid-navigator.refreshExplorer');
		highlightAllUuids();
	}, 2000);
}

export function deactivate() { }