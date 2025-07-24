import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.log('UUID Navigator activated for MS SQL');

	const uuidDecorationType = vscode.window.createTextEditorDecorationType({
		textDecoration: 'underline',
		cursor: 'pointer',
		color: '#569CD6',
		backgroundColor: 'rgba(100, 200, 255, 0.1)'
	});

	// Регистрируем провайдер определений
	const definitionProvider = vscode.languages.registerDefinitionProvider(
		['sql', 'mssql'],
		{
			provideDefinition(document, position) {
				const range = getUuidRangeAtPosition(document, position);
				if (!range) return null;

				const uuid = document.getText(range).replace(/["']/g, '');
				return findUuidReferences(uuid);
			}
		}
	);

	// Команда для поиска UUID
	const findUuidsCommand = vscode.commands.registerCommand('uuid-navigator.findUuids', () => {
		highlightAllUuids();
	});

	context.subscriptions.push(
		definitionProvider,
		findUuidsCommand
	);

	// Обработчики для автоматической подсветки
	vscode.window.onDidChangeActiveTextEditor(highlightAllUuids);
	vscode.workspace.onDidChangeTextDocument(() => highlightAllUuids());

	// Первоначальная подсветка
	highlightAllUuids();
}

// Находит диапазон UUID в позиции курсора
function getUuidRangeAtPosition(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
	const uuidRegex = /(?<q>["'])?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:(?<=['"])|(?<w>["'])?)/g;
	const range = document.getWordRangeAtPosition(position, uuidRegex);
	return range;
}

// Подсвечивает все UUID в активном редакторе
function highlightAllUuids() {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !isSqlFile(editor.document)) return;

	const decorations: vscode.DecorationOptions[] = [];
	const text = editor.document.getText();
	const uuidRegex = /(?<q>["'])?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:(?<=['"])|(?<w>["'])?)/g;

	let match;
	while ((match = uuidRegex.exec(text)) !== null) {
		const startPos = editor.document.positionAt(match.index);
		const endPos = editor.document.positionAt(match.index + match[0].length);

		decorations.push({
			range: new vscode.Range(startPos, endPos),
			hoverMessage: `UUID: ${match[0].replace(/["']/g, '')}\n\nCtrl+Click to find references`
		});
	}

	const decorationType = vscode.window.createTextEditorDecorationType({
		textDecoration: 'underline',
		cursor: 'pointer',
		color: '#569CD6',
		backgroundColor: 'rgba(100, 200, 255, 0.1)'
	});

	editor.setDecorations(decorationType, decorations);
}


let referenceDecorations: vscode.TextEditorDecorationType[] = [];

function clearReferenceHighlights() {
	referenceDecorations.forEach(decoration => decoration.dispose());
	referenceDecorations = [];
}

// Ищет все вхождения UUID по всем файлам
async function findUuidReferences(uuid: string): Promise<vscode.Location[]> {
	clearReferenceHighlights(); // Очищаем предыдущие подсветки

	const locations: vscode.Location[] = [];
	const files = await vscode.workspace.findFiles('**/*.sql');
	const decorationType = vscode.window.createTextEditorDecorationType({
		backgroundColor: 'rgba(255,215,0,0.3)',
		border: '1px solid rgba(255,215,0,0.7)',
		borderRadius: '2px'
	});
	referenceDecorations.push(decorationType);

	// Добавляем команду для очистки подсветки
	const disposeCommand = vscode.commands.registerCommand('uuid-navigator.clearHighlights', () => {
		clearReferenceHighlights();
	});
	referenceDecorations.push({ dispose: () => disposeCommand.dispose() } as any);


	for (const file of files) {
		const document = await vscode.workspace.openTextDocument(file);
		const text = document.getText();
		const regex = new RegExp(`["']?${uuid}["']?`, 'gi');

		let match;
		while ((match = regex.exec(text)) !== null) {
			const startPos = document.positionAt(match.index);
			const endPos = document.positionAt(match.index + match[0].length);
			const range = new vscode.Range(startPos, endPos);

			locations.push(new vscode.Location(file, range));

			// Подсветка в открытых редакторах
			vscode.window.visibleTextEditors.forEach(editor => {
				if (editor.document.uri.toString() === file.toString()) {
					const decorations = [{
						range,
						hoverMessage: `Reference to UUID: ${uuid}`
					}];
					editor.setDecorations(decorationType, decorations);

					// Автоматическое удаление подсветки через 5 секунд
					setTimeout(() => {
						editor.setDecorations(decorationType, []);
					}, 5000);
				}
			});
		}
	}
	// Показываем уведомление с возможностью очистки
	vscode.window.showInformationMessage(
		`Found ${locations.length} references to UUID: ${uuid}`,
		{ title: 'Clear Highlights', command: 'uuid-navigator.clearHighlights' }
	);
	return locations;
}

// Проверяет, является ли файл SQL-файлом
function isSqlFile(document: vscode.TextDocument): boolean {
	return document.languageId === 'sql' ||
		document.languageId === 'mssql' ||
		document.fileName.endsWith('.sql');
}