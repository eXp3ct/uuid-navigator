import * as vscode from 'vscode';

export interface ExtensionConfig {
  applyStyles: boolean;
  highlightColor: string;  // Цвет текста UUID
  underline: boolean;      // Подчёркивание
  backgroundColor: string; // Фон UUID (HEX с альфа-каналом)
  showNotifications: boolean;
  showBlameOnHover: boolean;
  blameTemplate?: string[];
  defaultClassTemplate?: string[];
  defaultPropertyTemplate?: string[];
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
  type: 'class' | 'property';
  className?: string;       // Всегда показываем, если есть
  classUuid?: string;       // Для свойств
  propertyName?: string;    // Только для свойств
  description?: string;     // Описание (для классов и свойств)
  filePath?: string;
  lineNumber?: number;
  position?: number;
}