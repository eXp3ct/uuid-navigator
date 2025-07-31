import * as vscode from 'vscode';
import { ExtensionConfig } from './models';

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('uuidNavigator', null);

  const baseConfig = {
    applyStyles: config.get<boolean>('applyStyles', true),
    highlightColor: config.get<string>('highlightColor', '#569CD6'),
    underline: config.get<boolean>('underline', true),
    backgroundColor: config.get<string>('backgroundColor', '#64c8ff1a'),
    showNotifications: config.get<boolean>('showNotifications', true),
    showBlameOnHover: config.get<boolean>('showBlameOnHover', true),
    enableValidation: config.get<boolean>('enableValidation', true),
    validateJson: config.get<boolean>('validateJson', true),
    cursorPointer: config.get<boolean>('cursorPointer', true),
    ignoreStatus: config.get<boolean>('ignoreStatus', true),
    ignoreUuid: config.get<string>('ignoreUuid', 'b2d437bc-af8e-4d75-ac25-70f481251233')
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