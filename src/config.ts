import * as vscode from 'vscode';
import { ExtensionConfig } from './types';


export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('uuidNavigator');
  return {
    applyStyles: config.get('applyStyles', true),
    highlightColor: config.get('highlightColor', '#569CD6'),
    underline: config.get('underline', true),
    backgroundColor: config.get('backgroundColor', '#64c8ff1a'), // HEX с альфа-каналом
    showNotifications: config.get('showNotifications', true)
  };
}

export { ExtensionConfig };
