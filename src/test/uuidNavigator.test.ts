// import * as assert from 'assert';
// import * as vscode from 'vscode';
// import * as sinon from 'sinon';
// import { activateNavigator, findUuidReferences, clearReferenceHighlights } from '../uuidNavigator';

// suite('UUID Navigator Tests', () => {
//   let sandbox: sinon.SinonSandbox;

//   setup(() => {
//     sandbox = sinon.createSandbox();
//   });

//   teardown(() => {
//     sandbox.restore();
//     clearReferenceHighlights();
//   });

//   test('should activate navigator', () => {
//     const context = {
//       subscriptions: []
//     } as unknown as vscode.ExtensionContext;

//     const registerDefinitionProviderStub = sandbox.stub(vscode.languages, 'registerDefinitionProvider').returns({} as any);
//     const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand').returns({} as any);

//     activateNavigator(context);

//     assert.ok(registerDefinitionProviderStub.calledOnce);
//     assert.ok(registerCommandStub.calledOnce);
//     assert.strictEqual(context.subscriptions.length, 2);
//   });

//   test('should handle findUuidReferences with no range', async () => {
//     const mockDocument = {
//       getText: () => '',
//       positionAt: (offset: number) => new vscode.Position(0, offset)
//     } as unknown as vscode.TextDocument;

//     const mockPosition = new vscode.Position(0, 0);

//     // Stub getWordRangeAtPosition чтобы он возвращал null
//     sandbox.stub(vscode.TextDocument.prototype, 'getWordRangeAtPosition').returns(undefined);

//     const result = await findUuidReferences(mockDocument, mockPosition);
//     assert.strictEqual(result, null);
//   });
// });