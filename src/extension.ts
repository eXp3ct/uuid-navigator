import * as vscode from 'vscode';
import { activateHighlighter } from './uuidHighlighter';
import { activateNavigator } from './uuidNavigator';
import { highlightAllUuids } from './uuidHighlighter';
import { UuidBlameProvider } from './uuidBlame';
import { SqlParser } from './sqlParser';
import { UuidTreeProvider } from './uuidTreeProvider';

export async function activate(context: vscode.ExtensionContext) {
	console.log('UUID Navigator activated');

	activateHighlighter(context);
	activateNavigator(context);
	const sqlParser = new SqlParser();
	const {classes, properties } = await sqlParser.parseAllSqlFiles();
	new UuidBlameProvider(context, classes, properties);
	const treeProvider = new UuidTreeProvider(classes);
	const treeView = vscode.window.createTreeView('uuidExplorer', {
		treeDataProvider: treeProvider
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('uuid-navigator.findUuids', () => highlightAllUuids()),
		vscode.window.onDidChangeActiveTextEditor(highlightAllUuids),
		vscode.workspace.onDidChangeTextDocument(() => highlightAllUuids()),
		vscode.commands.registerCommand('uuid-navigator.goToDefinition', async (uuid: string) => {
			//const { classes, properties } = await sqlParser.parseAllSqlFiles();

			// Ищем сначала в классах, потом в свойствах
			const target = classes.find(c => c.id === uuid) || properties.find(p => p.id === uuid);

			if (target && target.filePath) {
				try {
					const uri = vscode.Uri.file(target.filePath);
					const document = await vscode.workspace.openTextDocument(uri);

					// Находим точную позицию UUID в файле
					const text = document.getText();
					const uuidRegex = new RegExp(`'${uuid}'`);
					const match = uuidRegex.exec(text);

					if (match) {
						const position = document.positionAt(match.index);
						await vscode.window.showTextDocument(uri, {
							selection: new vscode.Range(position, position)
						});
						const name = (target as any).name || 'Unknown';
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
		treeView,

		// Refresh command
		vscode.commands.registerCommand('uuid-navigator.refreshExplorer', async () => {
			//const { classes } = await sqlParser.parseAllSqlFiles();
			treeProvider.refresh(classes);
		}),

		// Insert UUID command
		vscode.commands.registerCommand('uuid-navigator.insertUuid', (uuid: string) => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				editor.edit(editBuilder => {
					editBuilder.insert(editor.selection.active, uuid);
				});
			}
		}),

		// Show explorer command
		vscode.commands.registerCommand('uuid-navigator.showExplorer', async () => {
			try {
				// Сначала обновляем данные
				await vscode.commands.executeCommand('uuid-navigator.refreshExplorer');

				// Показываем представление (используем только ID представления)
				await vscode.commands.executeCommand('uuidExplorer.focus');
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to show UUID Explorer: ${error}`);
				console.error(error);
			}
		}),

		vscode.commands.registerCommand('uuid-navigator.focusTreeView', async () => {
			await vscode.commands.executeCommand('uuidExplorer.focus');
		})
	);


	setTimeout(() => vscode.commands.executeCommand('uuid-navigator.refreshExplorer'), 2000);
	highlightAllUuids();
}

export function deactivate() { }