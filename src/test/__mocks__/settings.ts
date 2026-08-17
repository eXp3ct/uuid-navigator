interface AutoLinkedProperty {
  name: string;
  uuid: string;
  classId: string | null;
}

export const mockConfig = {
  applyStyles: true,
  ignoreStatus: false,
  ignoreUuid: '',
  fuzzyClassMatching: true,
  fuzzyClassMatchThreshold: 0.82,
  autoLinkedProperties: [] as AutoLinkedProperty[],
};

export function getConfig() {
  return mockConfig;
}