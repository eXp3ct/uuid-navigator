import { UuidInfo } from './models';
import { getConfig } from './settings';
import { ClassInfo, ObjectInfo, PropertyInfo } from './sqlProcessor';

export class UuidFinder {
  private cache: UuidInfo[] = [];
  private classes: ClassInfo[];
  private properties: PropertyInfo[];
  private objects: ObjectInfo[];

  constructor(classes: ClassInfo[], properties: PropertyInfo[], objects: ObjectInfo[]) {
    this.classes = classes;
    this.properties = properties;
    this.objects = objects;
  }

  async initialize() {
    await this.buildCache(this.classes, this.properties, this.objects);
  }

  async buildCache(classes: ClassInfo[], properties: PropertyInfo[], objects: ObjectInfo[]): Promise<UuidInfo[]> {
    this.cache = [];

    classes.forEach(cls => {
      this.cache.push({
        uuid: cls.id,
        className: cls.name,
        description: cls.description,
        type: 'class'
      });
    });

    properties.forEach(prop => {
      this.cache.push({
        uuid: prop.id,
        propertyName: prop.name,
        description: prop.description,
        type: 'property',
        dataType: prop.dataType
      });
    });

    objects.forEach(obj => {
      this.cache.push({
        uuid: obj.id,
        propertyName: obj.name,
        description: obj.description,
        type: 'object',
        classUuid: obj.parentId || ''
      });
    });

    return this.cache;
  }

  getInfo(uuid: string): UuidInfo | undefined {
    const cached = this.cache.find(info => info.uuid === uuid);
    const config = getConfig();
    if (!cached) { return undefined; }

    const result: UuidInfo = {
      uuid,
      type: cached.type,
      dataType: cached.dataType
    };

    if (cached.type === 'property') {
      const property = this.properties.find(p => p.id === uuid);
      const autoLinkedProperties = config.autoLinkedProperties;
      if (property && !autoLinkedProperties.some(prop => prop.uuid === property.id)) {
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
          result.classType = classInfo.classType;
        }
      }
      else if (property) {
        result.propertyName = property.name;
        result.description = property.description;
        result.dataType = property.dataType;

        const autoLinkedProp = autoLinkedProperties.find(p => p.uuid === property.id);
        result.className = autoLinkedProp?.name;
        result.classUuid = autoLinkedProp?.classId || '';        
      }
    }
    else if (cached.type === 'class') {
      const classInfo = this.classes.find(c => c.id === uuid);
      if (classInfo) {
        result.className = classInfo.name;
        result.description = classInfo.description;
        result.classType = classInfo.classType;
      }
    }

    if (cached.type === 'object') {
      const object = this.objects.find(o => o.id === uuid);
      if (object) {
        result.propertyName = object.name;
        result.description = object.description;

        const classInfo = this.classes.find(c =>
          c.objects.some(o => o.id === uuid) ||
          c.id === object.parentId
        );

        if (classInfo) {
          result.className = classInfo.name;
          result.classUuid = classInfo.id;
          result.classType = classInfo.classType;
        }
      }
    }

    return result;
  }

  public updateData(classes: ClassInfo[], properties: PropertyInfo[], objects: ObjectInfo[]) {
    this.classes = classes;
    this.properties = properties;
    this.objects = objects;
  }

  public async refreshCache(): Promise<void> {
    await this.buildCache(this.classes, this.properties, this.objects);
  }
}