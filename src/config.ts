import * as vscode from 'vscode';

export interface ExtensionConfig {
  highlightColor: string;
  underline: boolean;
  backgroundColor: string;
  showNotifications: boolean;
}

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('uuidNavigator');
  return {
    highlightColor: config.get('highlightColor', '#569CD6'),
    underline: config.get('underline', true),
    backgroundColor: config.get('backgroundColor', 'rgba(100, 200, 255, 0.1)'),
    showNotifications: config.get('showNotifications', true)
  };
}