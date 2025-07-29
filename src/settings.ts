import * as vscode from 'vscode';
import { ExtensionConfig } from './models';

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('uuidNavigator');

  const baseConfig = {
    applyStyles: config.get('applyStyles', true),
    highlightColor: config.get('highlightColor', '#569CD6'),
    underline: config.get('underline', true),
    backgroundColor: config.get('backgroundColor', '#64c8ff1a'),
    showNotifications: config.get('showNotifications', true),
    showBlameOnHover: config.get('showBlameOnHover', true)
  };

  if (baseConfig.showBlameOnHover) {
    return {
      ...baseConfig,
      blameTemplate: config.get<string[]>('blameTemplate', [
        'type',
        'className',
        'classUuid',
        'uuid',
        'propertyName',
        'description',
        'dataType',
        'goToButton'
      ])
    };
  }

  return baseConfig;
}