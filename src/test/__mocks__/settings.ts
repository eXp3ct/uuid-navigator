interface AutoLinkedProperty {
  name: string;
  uuid: string;
  classId: string | null;
}

export const mockConfig = {
  applyStyles: true,
  ignoreStatus: false,
  ignoreUuid: '',
  autoLinkedProperties: [] as AutoLinkedProperty[],
};

export function getConfig() {
  return mockConfig;
}