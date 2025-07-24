import * as vscode from 'vscode';

export interface ExtensionConfig {
  highlightColor: string;  // Цвет текста UUID
  underline: boolean;      // Подчёркивание
  backgroundColor: string; // Фон UUID (HEX с альфа-каналом)
  showNotifications: boolean;
}

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('uuidNavigator');
  return {
    highlightColor: config.get('highlightColor', '#569CD6'),
    underline: config.get('underline', true),
    backgroundColor: config.get('backgroundColor', '#64c8ff1a'), // HEX с альфа-каналом
    showNotifications: config.get('showNotifications', true)
  };
}