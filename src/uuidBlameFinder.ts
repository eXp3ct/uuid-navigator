import * as vscode from 'vscode';
import { UuidBlameInfo } from './types';
import { ClassInfo, PropertyInfo, SqlParser } from './sqlParser';

export class UuidBlameFinder {
  private cachedBlameInfo: UuidBlameInfo[] = [];

  private classesInfo: { classes: ClassInfo[], properties: PropertyInfo[] } = {
    classes: [],
    properties: []
  };

  constructor(
    private classes: ClassInfo[],
    private properties: PropertyInfo[]
  ) {
    this.classesInfo.classes = this.classes;
    this.classesInfo.properties = this.properties;
  }

  async initialize() {
    await this.findUuidsInClassesAndProperties();
  }

  async findUuidsInClassesAndProperties(): Promise<UuidBlameInfo[]> {
    this.cachedBlameInfo = [];

    // Добавляем информацию о классах
    for (const cls of this.classesInfo.classes) {
      this.cachedBlameInfo.push({
        uuid: cls.id,
        className: cls.name,
        description: cls.description,
        type: 'class'
      });
    }

    // Добавляем информацию о свойствах
    for (const prop of this.classesInfo.properties) {
      this.cachedBlameInfo.push({
        uuid: prop.id,
        propertyName: prop.name,
        description: prop.description,
        type: 'property'
      });
    }

    return this.cachedBlameInfo;
  }

  getBlameInfo(uuid: string): UuidBlameInfo | undefined {
    // Ищем UUID в кэше
    const cachedInfo = this.cachedBlameInfo.find(info => info.uuid === uuid);
    if (!cachedInfo) return undefined;

    // Создаем базовый объект с информацией
    const result: UuidBlameInfo = {
      uuid,
      type: cachedInfo.type,
      filePath: cachedInfo.filePath,
      lineNumber: cachedInfo.lineNumber,
      position: cachedInfo.position
    };

    // Для всех UUID добавляем имя и описание
    if (cachedInfo.type === 'property') {
      const property = this.classesInfo.properties.find(p => p.id === uuid);
      if (property) {
        result.propertyName = property.name;
        result.description = property.description;

        // Находим родительский класс для свойства
        const classInfo = this.classesInfo.classes.find(c =>
          c.properties.some(p => p.id === uuid) ||
          c.id === property.sourceClassId
        );

        if (classInfo) {
          result.className = classInfo.name;
          result.classUuid = classInfo.id;
        }
      }
    } else if (cachedInfo.type === 'class') {
      const classInfo = this.classesInfo.classes.find(c => c.id === uuid);
      if (classInfo) {
        result.className = classInfo.name;
        result.description = classInfo.description;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }



  async refreshCache() {
    await this.findUuidsInClassesAndProperties();
  }
}