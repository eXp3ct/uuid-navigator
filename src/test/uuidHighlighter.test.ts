// import * as assert from 'assert';
// import * as vscode from 'vscode';
// import { activateHighlighter, highlightAllUuids } from '../uuidHighlighter';

// // Сохраняем оригинальные значения
// let originalWindow: any;
// let originalWorkspace: any;

// suite('UUID Highlighter Tests', () => {
//   let mockContext: any;
//   let mockEditor: any;
//   let mockDocument: any;

//   suiteSetup(() => {
//     // Сохраняем оригинальные значения
//     originalWindow = { ...vscode.window };
//     originalWorkspace = { ...vscode.workspace };
//   });

//   setup(() => {
//     // Создаем моки
//     mockDocument = {
//       getText: () => "INSERT INTO table VALUES ('9fbadb2d-6ea1-4add-aa1c-72ab43397449');",
//       positionAt: (offset: number) => new vscode.Position(0, offset),
//       languageId: 'sql',
//       fileName: 'test.sql'
//     };

//     let decorationsApplied = false;
//     let appliedDecorations: any[] = [];

//     mockEditor = {
//       document: mockDocument,
//       setDecorations: (type: any, ranges: any[]) => {
//         decorationsApplied = true;
//         appliedDecorations = ranges;
//       }
//     };

//     // Мокаем только нужные части
//     (vscode.window as any).activeTextEditor = mockEditor;
//     (vscode.window as any).createTextEditorDecorationType = () => ({
//       dispose: () => { }
//     });
//   });

//   teardown(() => {
//     // Восстанавливаем оригинальные значения
//     Object.assign(vscode.window, originalWindow);
//     Object.assign(vscode.workspace, originalWorkspace);
//   });

//   test('should activate highlighter', () => {
//     mockContext = {
//       subscriptions: []
//     };

//     activateHighlighter(mockContext);
//     assert.strictEqual(mockContext.subscriptions.length, 1);
//   });

//   test('should highlight UUIDs in SQL files', () => {
//     highlightAllUuids(mockEditor);
//     // Простая проверка, что функция отработала без ошибок
//     assert.ok(true);
//   });
// });