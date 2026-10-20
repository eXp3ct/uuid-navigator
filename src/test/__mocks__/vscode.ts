const mockDocument = {
  getText: jest.fn(),
  positionAt: jest.fn().mockImplementation(() => new Position(0, 0)),
  uri: {
    fsPath: '/test/path.sql'
  }
};

const mockFileSystemWatcher = () => ({
  onDidChange: jest.fn(),
  onDidCreate: jest.fn(),
  onDidDelete: jest.fn(),
  dispose: jest.fn()
});

const mockWorkspace = {
  findFiles: jest.fn().mockResolvedValue([]),
  openTextDocument: jest.fn().mockResolvedValue(mockDocument),
  createFileSystemWatcher: jest.fn().mockImplementation(mockFileSystemWatcher),
  fs: {
    readFile: jest.fn()
  }
};

const mockUri = {
  file: jest.fn().mockImplementation(path => ({ fsPath: path }))
};

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(public readonly start: Position, public readonly end: Position) {}
}

export const workspace = mockWorkspace;
export const Uri = mockUri;

// Для методов, которые возвращают конструкторы
export const TextDocument = {
  create: jest.fn().mockReturnValue(mockDocument)
};

export default {
  Position,
  Range,
  workspace,
  Uri,
  TextDocument,
  version: '1.0.0'
};
