import { createPositionLookup } from '../positionLookup';

jest.mock('vscode');

describe('createPositionLookup', () => {
  const text = 'first\nsecond line\n\nfourth';
  const lookup = createPositionLookup(text);

  it('maps offsets to line and character', () => {
    expect(lookup.positionAt(0)).toMatchObject({ line: 0, character: 0 });
    expect(lookup.positionAt(text.indexOf('line'))).toMatchObject({ line: 1, character: 7 });
    expect(lookup.positionAt(text.indexOf('fourth'))).toMatchObject({ line: 3, character: 0 });
  });

  it('treats the newline itself as the end of its line', () => {
    expect(lookup.positionAt(text.indexOf('\n'))).toMatchObject({ line: 0, character: 5 });
  });

  it('clamps out-of-range offsets', () => {
    expect(lookup.positionAt(-5)).toMatchObject({ line: 0, character: 0 });
    expect(lookup.positionAt(10_000)).toMatchObject({ line: 3, character: 6 });
  });

  it('counts CRLF files by \\n like VS Code does', () => {
    const crlf = createPositionLookup('a\r\nb');
    expect(crlf.positionAt(3)).toMatchObject({ line: 1, character: 0 });
  });
});
