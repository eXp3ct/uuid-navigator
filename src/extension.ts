import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('UUID Navigator activated for MS SQL');

    // Стиль подсветки
    const uuidDecorationType = vscode.window.createTextEditorDecorationType({
        textDecoration: 'underline',
        cursor: 'pointer',
        color: '#569CD6',
        backgroundColor: 'rgba(100, 200, 255, 0.1)'
    });

    // Команда для ручного поиска UUID
    const findUuidsCommand = vscode.commands.registerCommand('uuid-navigator.findUuids', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            highlightUuids(editor);
            vscode.window.showInformationMessage(`UUID search completed in ${editor.document.fileName}`);
        } else {
            vscode.window.showWarningMessage('No active editor found');
        }
    });

    // Автоматическая подсветка
    const handleEditorChange = (editor: vscode.TextEditor | undefined) => {
        if (editor && isMsSqlFile(editor.document)) {
            highlightUuids(editor);
        }
    };

    // Проверка для MS SQL файлов
    function isMsSqlFile(document: vscode.TextDocument): boolean {
        return document.languageId === 'sql' || 
               document.languageId === 'mssql' || 
               document.fileName.endsWith('.sql');
    }

    // Подсветка UUID
    function highlightUuids(editor: vscode.TextEditor) {
        const text = editor.document.getText();
        const decorations: vscode.DecorationOptions[] = [];
        
        // Улучшенный regex для всех вариантов UUID
        const uuidRegex = /(?<q>["'])?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:(?<=['"])|(?<w>["'])?)/g;

        let match;
        while ((match = uuidRegex.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            
            decorations.push({
                range: new vscode.Range(startPos, endPos),
                hoverMessage: `UUID: ${match[0].replace(/["']/g, '')}`,
                renderOptions: {
                    after: {
                        contentText: " (UUID)",
                        color: 'rgba(153,153,153,0.7)'
                    }
                }
            });
        }

        editor.setDecorations(uuidDecorationType, decorations);
    }

    // Регистрация обработчиков
    context.subscriptions.push(findUuidsCommand);
    vscode.window.onDidChangeActiveTextEditor(handleEditorChange);
    vscode.workspace.onDidChangeTextDocument(e => {
        const editor = vscode.window.activeTextEditor;
        if (editor && e.document === editor.document) {
            handleEditorChange(editor);
        }
    });

    // Инициализация для текущего редактора
    handleEditorChange(vscode.window.activeTextEditor);
}