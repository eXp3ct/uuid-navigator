import * as vscode from 'vscode';

export interface ExtensionConfig {
  applyStyles: boolean;
  highlightColor: string;  // Цвет текста UUID
  underline: boolean;      // Подчёркивание
  backgroundColor: string; // Фон UUID (HEX с альфа-каналом)
  showNotifications: boolean;
  showBlameOnHover: boolean;
  blameTemplate?: string[];
}

export interface ExtensionContext extends vscode.ExtensionContext {
  subscriptions: vscode.Disposable[];
  globalState: vscode.Memento & {
    setKeysForSync(keys: readonly string[]): void;
    get<T>(key: string): T | undefined;
    update(key: string, value: any): Thenable<void>;
  };
  workspaceState: vscode.Memento;
}

export interface UuidBlameInfo {
  uuid: string;
  comment: string;
  filePath: string;
  lineNumber: number;
}