import { UuidInfo } from './models';
import { ClassInfo, PropertyInfo } from './sqlProcessor';

export class UuidFinder {
  private cache: UuidInfo[] = [];
  private classes: ClassInfo[];
  private properties: PropertyInfo[];

  constructor(classes: ClassInfo[], properties: PropertyInfo[]) {
    this.classes = classes;
    this.properties = properties;
  }

  async initialize() {
    await this.buildCache();
  }

  async buildCache(): Promise<UuidInfo[]> {
    this.cache = [];

    this.classes.forEach(cls => {
      this.cache.push({
        uuid: cls.id,
        className: cls.name,
        description: cls.description,
        type: 'class'
      });
    });

    this.properties.forEach(prop => {
      this.cache.push({
        uuid: prop.id,
        propertyName: prop.name,
        description: prop.description,
        type: 'property',
        dataType: prop.dataType
      });
    });

    return this.cache;
  }

  getInfo(uuid: string): UuidInfo | undefined {
    const cached = this.cache.find(info => info.uuid === uuid);
    if (!cached) {return undefined;}

    const result: UuidInfo = {
      uuid,
      type: cached.type,
      dataType: cached.dataType
    };

    if (cached.type === 'property') {
      const property = this.properties.find(p => p.id === uuid);
      if (property) {
        result.propertyName = property.name;
        result.description = property.description;
        result.dataType = property.dataType;

        const classInfo = this.classes.find(c =>
          c.properties.some(p => p.id === uuid) ||
          c.id === property.sourceClassId
        );

        if (classInfo) {
          result.className = classInfo.name;
          result.classUuid = classInfo.id;
        }
      }
    }
    else if (cached.type === 'class') {
      const classInfo = this.classes.find(c => c.id === uuid);
      if (classInfo) {
        result.className = classInfo.name;
        result.description = classInfo.description;
      }
    }

    return result;
  }

  async refreshCache() {
    await this.buildCache();
  }
}