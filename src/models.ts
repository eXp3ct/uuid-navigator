import * as vscode from 'vscode';

export interface ExtensionConfig {
  applyStyles: boolean;
  highlightColor: string;
  underline: boolean;
  backgroundColor: string;
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

export interface UuidInfo {
  uuid: string;
  type: 'class' | 'property' | 'object';
  className?: string;
  classUuid?: string;
  propertyName?: string;
  description?: string;
  filePath?: string;
  lineNumber?: number;
  position?: number;
  dataType?: DataType;
}

export enum DataType {
  String = 0,
  Int = 1,
  Double = 2,
  Boolean = 3,
  Reference = 4,
  DateTime = 5,
  StringArray = 6,
  IntArray = 7,
  DoubleArray = 8,
  ReferenceArray = 9,
  Attachment = 10,
  MultipleAttachment = 11,
  Signature = 12,
  MultipleSignature = 13,
  Date = 14,
  Time = 15
}