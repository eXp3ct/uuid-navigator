import type * as vscode from 'vscode';
import { createFakeDocument } from './helpers/fakeTextDocument';

describe('createFakeDocument', () => {
  const content = 'ab\ncd\n\nef\nlast';

  it('positionAt and offsetAt round-trip for every offset', () => {
    const doc = createFakeDocument(content, '/ws/file.sql');

    for (let offset = 0; offset <= content.length; offset++) {
      const position = doc.positionAt(offset);
      expect(doc.offsetAt(position)).toBe(offset);
    }
  });

  it('computes line and character across multiple lines', () => {
    const doc = createFakeDocument(content, '/ws/file.sql');

    expect(doc.positionAt(0)).toEqual({ line: 0, character: 0 });
    expect(doc.positionAt(3)).toEqual({ line: 1, character: 0 });
    expect(doc.positionAt(7)).toEqual({ line: 3, character: 0 });
    expect(doc.positionAt(8)).toEqual({ line: 3, character: 1 });
    expect(doc.positionAt(content.length)).toEqual({ line: 4, character: 4 });
  });

  it('exposes lineCount and lineAt', () => {
    const doc = createFakeDocument(content, '/ws/file.sql');

    expect(doc.lineCount).toBe(5);
    expect(doc.lineAt(0).text).toBe('ab');
    expect(doc.lineAt(2).text).toBe('');
    expect(doc.lineAt(4).text).toBe('last');
  });

  it('getText returns the whole text or the text inside a range', () => {
    const doc = createFakeDocument(content, '/ws/file.sql');

    expect(doc.getText()).toBe(content);
    const range = { start: { line: 0, character: 1 }, end: { line: 1, character: 2 } } as unknown as vscode.Range;
    expect(doc.getText(range)).toBe('b\ncd');
  });

  it('exposes uri and fileName from the path', () => {
    const doc = createFakeDocument(content, '/ws/Классы/Работы.class.yaml');

    expect(doc.uri.fsPath).toBe('/ws/Классы/Работы.class.yaml');
    expect(doc.fileName).toBe('/ws/Классы/Работы.class.yaml');
  });

  it.each([
    ['/ws/file.sql', 'sql'],
    ['/ws/Object.object.yaml', 'yaml'],
    ['/ws/Class.class.JSON', 'json'],
    ['/ws/readme.txt', 'plaintext'],
    ['/ws/noextension', 'plaintext'],
  ])('derives languageId for %s', (fsPath, languageId) => {
    expect(createFakeDocument('', fsPath).languageId).toBe(languageId);
  });
});
