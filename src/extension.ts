import * as vscode from 'vscode';
import { activateHighlighter } from './uuidHighlighter';
import { activateNavigator } from './uuidNavigator';
import { highlightAllUuids } from './uuidHighlighter';

export function activate(context: vscode.ExtensionContext) {
	console.log('UUID Navigator activated');

	activateHighlighter(context);
	activateNavigator(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('uuid-navigator.findUuids', () => highlightAllUuids()),
		vscode.window.onDidChangeActiveTextEditor(highlightAllUuids),
		vscode.workspace.onDidChangeTextDocument(() => highlightAllUuids())
	);

	highlightAllUuids();
}

export function deactivate() { }