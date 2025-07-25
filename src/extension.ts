import * as vscode from 'vscode';
import { activateHighlighter } from './uuidHighlighter';
import { activateNavigator } from './uuidNavigator';
import { highlightAllUuids } from './uuidHighlighter';
import { UuidBlameProvider } from './uuidBlame';
import { SqlParser } from './sqlParser';
import { UuidTreeProvider } from './uuidTreeProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('UUID Navigator activated');

	activateHighlighter(context);
	activateNavigator(context);
	new UuidBlameProvider(context);
	const sqlParser = new SqlParser();
	const treeProvider = new UuidTreeProvider([]);
	const treeView = vscode.window.createTreeView('uuidExplorer', {
		treeDataProvider: treeProvider
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('uuid-navigator.findUuids', () => highlightAllUuids()),
		vscode.window.onDidChangeActiveTextEditor(highlightAllUuids),
		vscode.workspace.onDidChangeTextDocument(() => highlightAllUuids()),
		vscode.commands.registerCommand('uuid-navigator.goToDefinition', (blameInfo: any) => {
			const uri = vscode.Uri.file(blameInfo.filePath);
			const position = new vscode.Position(blameInfo.lineNumber - 1, 0);
			vscode.window.showTextDocument(uri, { selection: new vscode.Range(position, position) });
		}),
		treeView,

		// Refresh command
		vscode.commands.registerCommand('uuid-navigator.refreshExplorer', async () => {
			const { classes } = await sqlParser.parseAllSqlFiles();
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