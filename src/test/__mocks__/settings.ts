import { ExtensionConfig } from '../../models';

/** Полный ExtensionConfig с безопасными для тестов значениями; поля переопределяются точечно. */
export function createMockConfig(overrides: Partial<ExtensionConfig> = {}): ExtensionConfig {
  return {
    applyStyles: true,
    highlightColor: '#569CD6',
    underline: true,
    backgroundColor: '#64c8ff1a',
    showNotifications: false,
    showBlameOnHover: false,
    enableValidation: true,
    validateJson: true,
    cursorPointer: true,
    ignoreStatus: false,
    ignoreUuid: '',
    fuzzyClassMatching: false,
    fuzzyClassMatchThreshold: 0.82,
    autoLinking: true,
    autoLinkedProperties: [],
    ...overrides
  };
}

export const mockConfig: ExtensionConfig = createMockConfig();

export function getConfig(): ExtensionConfig {
  return mockConfig;
}
