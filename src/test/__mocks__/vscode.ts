const mockPosition = {
  line: 0,
  character: 0
};

const mockRange = {
  start: mockPosition,
  end: mockPosition
};

const mockDocument = {
  getText: jest.fn(),
  positionAt: jest.fn().mockReturnValue(mockPosition),
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

export const Position = jest.fn().mockImplementation(() => mockPosition);
export const Range = jest.fn().mockImplementation(() => mockRange);
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