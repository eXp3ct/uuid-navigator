import * as vscode from 'vscode';
import { activateHighlighter } from './uuidHighlighter';
import { activateNavigator } from './uuidNavigator';
import { highlightAllUuids } from './uuidHighlighter';
import { UuidBlameProvider } from './uuidBlame';

export function activate(context: vscode.ExtensionContext) {
	console.log('UUID Navigator activated');

	activateHighlighter(context);
	activateNavigator(context);
	new UuidBlameProvider(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('uuid-navigator.findUuids', () => highlightAllUuids()),
		vscode.window.onDidChangeActiveTextEditor(highlightAllUuids),
		vscode.workspace.onDidChangeTextDocument(() => highlightAllUuids()),
		vscode.commands.registerCommand('uuid-navigator.goToDefinition', (blameInfo: any) => {
			const uri = vscode.Uri.file(blameInfo.filePath);
			const position = new vscode.Position(blameInfo.lineNumber - 1, 0);
			vscode.window.showTextDocument(uri, { selection: new vscode.Range(position, position) });
		})
	);

	highlightAllUuids();
}

export function deactivate() { }