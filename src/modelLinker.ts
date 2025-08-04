import { AliasService } from "./aliasService";
import { ClassInfo, ClassPropertyLink, ClassType, ObjectInfo, PropertyInfo } from "./models";
import { getConfig } from "./settings";

export class ModelLinker {
  constructor(private aliasService: AliasService) { }

  public linkClassesAndObjects(classes: ClassInfo[], objects: ObjectInfo[]) {
    const classMap = new Map(classes.map(c => [c.id, c]));
    const classNameMap = new Map(classes.map(c => [c.name.toLowerCase(), c]));
    const config = getConfig();

    // Очищаем все существующие связи
    classes.forEach(cls => {
      cls.objects = [];
    });

    // Заполняем мапу имен классов и алиасов
    classes.forEach(cls => {
      // Основное имя класса
      classNameMap.set(cls.name.toLowerCase(), cls);

      // Добавляем алиас, если он есть
      if (this.aliasService) {
        const alias = this.aliasService.getAlias(cls.id);
        if (alias) {
          classNameMap.set(alias.toString().toLowerCase(), cls);
        }
      }
    });

    // Связываем объекты с классами в несколько проходов

    // 1. Привязка по явному class_id (кроме игнорируемых статусов)
    objects.forEach(obj => {
      const cls = classMap.get(obj.classId);
      if (cls) {
        if (config.ignoreStatus && config.ignoreUuid && cls.id === config.ignoreUuid) {
          return; // Пропускаем игнорируемые статусы
        }
        if (!cls.objects) { cls.objects = []; }
        cls.objects.push(obj);
      }
    });

    // 2. Привязка по имени папки/алиасу
    objects.forEach(obj => {
      // Пропускаем уже привязанные объекты
      if (classMap.get(obj.classId)?.objects?.some(o => o.id === obj.id)) {
        return;
      }

      if (!obj.filePath) { return; }

      const pathParts = obj.filePath.split(/[\\/]/);
      if (pathParts.length < 2) { return; }

      const classNameFromPath = pathParts[pathParts.length - 2].toLowerCase();
      const cls = classNameMap.get(classNameFromPath);

      if (cls && !cls.objects?.some(o => o.id === obj.id)) {
        if (!cls.objects) { cls.objects = []; }
        cls.objects.push(obj);
      }
    });

    // Удаление дубликатов
    classes.forEach(cls => {
      if (!cls.objects) { return; }

      const uniqueObjects = [];
      const seenIds = new Set();

      for (const obj of cls.objects) {
        if (!seenIds.has(obj.id)) {
          seenIds.add(obj.id);
          uniqueObjects.push(obj);
        }
      }

      cls.objects = uniqueObjects;
    });

    // Логирование непривязанных объектов (для отладки)
    const unlinkedObjects = objects.filter(obj =>
      !classes.some(cls => cls.objects?.some(o => o.id === obj.id))
    );
    const statusClass = classes.find(c => config.ignoreUuid === c.id);

    if (unlinkedObjects.length > 0 && statusClass) {
      //console.warn(`Linking ${unlinkedObjects.length} unlinked objects to Statuses class`);

      if (!statusClass.objects) {
        statusClass.objects = [];
      }

      for (const obj of unlinkedObjects) {
        if (!statusClass.objects.some(o => o.id === obj.id)) {
          statusClass.objects.push(obj);
        }
      }

      //console.warn('Unlinked objects:', unlinkedObjects);
    }
  }

  public linkClassesAndProperties(
    classes: ClassInfo[],
    properties: PropertyInfo[],
    links: ClassPropertyLink[]
  ) {
    const propertyMap = new Map(properties.map(p => [p.id, p]));
    const classMap = new Map(classes.map(c => [c.id, c]));
    const config = getConfig();

    // 1. Обрабатываем стандартные привязки из links
    links.forEach(link => {
      const cls = classMap.get(link.classId);
      const prop = propertyMap.get(link.propertyId);

      if (cls && prop) {
        if (!cls.properties.some(p => p.id === prop.id)) {
          cls.properties.push(prop);
        }
      }
    });

    // 2. Автоматическая привязка свойств из конфига
    if (config.autoLinkedProperties && config.autoLinkedProperties.length > 0) {
      const autoProperties = properties.filter(p =>
        config.autoLinkedProperties.some(autoProp =>
          autoProp.uuid === p.id
        )
      );

      autoProperties.forEach(property => {
        classes.forEach(cls => {
          // Проверяем что свойство еще не привязано
          if (!cls.properties.some(p => p.id === property.id) && cls.classType === ClassType.Обрабатываемый) {
            cls.properties.push(property);
          }
        });
      });
    }
  }

  public sortModel(
    classes: ClassInfo[],
    properties: PropertyInfo[],
    objects: ObjectInfo[]
  ): {
    classes: ClassInfo[];
    properties: PropertyInfo[];
    objects: ObjectInfo[];
  } {
    const sortedClasses = classes
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(cls => ({
        ...cls,
        properties: cls.properties
          ? cls.properties.slice().sort((a, b) => a.name.localeCompare(b.name))
          : [],
        objects: cls.objects
          ? cls.objects.slice().sort((a, b) => a.name.localeCompare(b.name))
          : []
      }));

    return {
      classes: sortedClasses,
      properties: properties.slice().sort((a, b) => a.name.localeCompare(b.name)),
      objects: objects.slice().sort((a, b) => a.name.localeCompare(b.name))
    };
  }
}