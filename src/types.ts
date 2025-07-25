import * as vscode from 'vscode';

export interface ExtensionConfig {
  applyStyles: boolean;
  highlightColor: string;  // Цвет текста UUID
  underline: boolean;      // Подчёркивание
  backgroundColor: string; // Фон UUID (HEX с альфа-каналом)
  showNotifications: boolean;
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