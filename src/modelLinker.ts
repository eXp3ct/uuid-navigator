import { AliasService } from "./aliasService";
import { findBestFuzzyMatch, FuzzyCandidate } from "./fuzzyMatch";
import { ClassInfo, ClassPropertyLink, ClassType, ExtensionConfig, ObjectInfo, PropertyInfo, RoleInfo } from "./models";
import { getConfig } from "./settings";

export class ModelLinker {
  constructor(private aliasService: AliasService) { }

  /**
   * Класс -> все его имена-варианты (собственное имя + alias), используется и для
   * точного, и для fuzzy поиска класса по имени папки.
   */
  private buildClassNameMap(classes: ClassInfo[]): Map<string, ClassInfo> {
    const classNameMap = new Map<string, ClassInfo>();

    classes.forEach(cls => {
      classNameMap.set(cls.name.toLowerCase(), cls);

      if (this.aliasService) {
        const alias = this.aliasService.getAlias(cls.id);
        if (alias) {
          classNameMap.set(alias.toString().toLowerCase(), cls);
        }
      }
    });

    return classNameMap;
  }

  /**
   * Точное совпадение по имени/алиасу, а если не нашлось и fuzzy-матчинг включён —
   * ближайший класс по нормализованному имени/расстоянию Левенштейна.
   */
  private findClassByName(
    name: string,
    classNameMap: Map<string, ClassInfo>,
    config: ExtensionConfig
  ): ClassInfo | undefined {
    const exact = classNameMap.get(name);
    if (exact) { return exact; }

    if (!config.fuzzyClassMatching) { return undefined; }

    const candidates: FuzzyCandidate<ClassInfo>[] = Array.from(classNameMap.entries())
      .map(([key, item]) => ({ key, item }));

    return findBestFuzzyMatch(name, candidates, config.fuzzyClassMatchThreshold) ?? undefined;
  }

  private folderNameOf(filePath: string | undefined): string | undefined {
    if (!filePath) { return undefined; }

    const pathParts = filePath.split(/[\\/]/);
    if (pathParts.length < 2) { return undefined; }

    return pathParts[pathParts.length - 2].toLowerCase();
  }

  public linkClassesAndObjects(classes: ClassInfo[], objects: ObjectInfo[]) {
    const classMap = new Map(classes.map(c => [c.id, c]));
    const classNameMap = this.buildClassNameMap(classes);
    const config = getConfig();

    // Очищаем все существующие связи
    classes.forEach(cls => {
      cls.objects = [];
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

    // 2. Привязка по имени папки/алиасу (точное, затем fuzzy-фолбэк)
    objects.forEach(obj => {
      // Пропускаем уже привязанные объекты
      if (classMap.get(obj.classId)?.objects?.some(o => o.id === obj.id)) {
        return;
      }

      const classNameFromPath = this.folderNameOf(obj.filePath);
      if (!classNameFromPath) { return; }

      const cls = this.findClassByName(classNameFromPath, classNameMap, config);

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

    // 3. Фолбэк для свойств без явной связи (classes_property_definitions) — по имени
    // папки/алиасу класса, аналогично объектам (точное совпадение, затем fuzzy)
    const linkedPropertyIds = new Set(links.map(l => l.propertyId));
    const classNameMap = this.buildClassNameMap(classes);

    properties.forEach(property => {
      if (linkedPropertyIds.has(property.id)) { return; }

      const classNameFromPath = this.folderNameOf(property.filePath);
      if (!classNameFromPath) { return; }

      const cls = this.findClassByName(classNameFromPath, classNameMap, config);

      if (cls && !cls.properties.some(p => p.id === property.id)) {
        cls.properties.push(property);
      }
    });
  }

  public sortModel(
    classes: ClassInfo[],
    properties: PropertyInfo[],
    objects: ObjectInfo[],
    roles: RoleInfo[]
  ): {
    classes: ClassInfo[];
    properties: PropertyInfo[];
    objects: ObjectInfo[];
    roles: RoleInfo[];
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
      objects: objects.slice().sort((a, b) => a.name.localeCompare(b.name)),
      roles: roles.slice().sort((a,b) => a.name.localeCompare(b.name))
    };
  }
}