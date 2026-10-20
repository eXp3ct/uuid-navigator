import { AliasService } from "./aliasService";
import { findBestFuzzyMatch, FuzzyCandidate } from "./fuzzyMatch";
import { ClassInfo, ClassPropertyLink, ClassType, ExtensionConfig, ObjectInfo, PropertyInfo, RoleInfo } from "./models";
import { getConfig } from "./settings";

/**
 * Всё, что нужно для поиска класса по расположению файла: классы по каталогу,
 * имена/алиасы классов и конфиг. Строится один раз на вызов linkClasses*.
 */
interface ClassLookup {
  /** Каталог -> классы, определённые в этом каталоге (без дублей по id). */
  classesByDirectory: Map<string, Map<string, ClassInfo>>;
  /** Имя/алиас класса (lower-case) -> класс. */
  classNameMap: Map<string, ClassInfo>;
  fuzzyCandidates: FuzzyCandidate<ClassInfo>[];
  config: ExtensionConfig;
}

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

  private buildClassesByDirectory(classes: ClassInfo[]): Map<string, Map<string, ClassInfo>> {
    const byDirectory = new Map<string, Map<string, ClassInfo>>();

    for (const cls of classes) {
      const dir = this.directoryOf(cls.filePath);
      if (dir === undefined) { continue; }

      let inDir = byDirectory.get(dir);
      if (!inDir) {
        inDir = new Map();
        byDirectory.set(dir, inDir);
      }
      if (!inDir.has(cls.id)) { inDir.set(cls.id, cls); }
    }

    return byDirectory;
  }

  private buildLookup(classes: ClassInfo[], config: ExtensionConfig): ClassLookup {
    const classNameMap = this.buildClassNameMap(classes);

    return {
      classesByDirectory: this.buildClassesByDirectory(classes),
      classNameMap,
      fuzzyCandidates: Array.from(classNameMap.entries()).map(([key, item]) => ({ key, item })),
      config
    };
  }

  /** Каталог файла (без имени файла) или undefined, если пути нет / он без каталога. */
  private directoryOf(filePath: string | undefined): string | undefined {
    if (!filePath) { return undefined; }

    const pathParts = filePath.split(/[\\/]/);
    if (pathParts.length < 2) { return undefined; }

    return pathParts.slice(0, -1).join('/');
  }

  private folderNameOf(filePath: string | undefined): string | undefined {
    if (!filePath) { return undefined; }

    const pathParts = filePath.split(/[\\/]/);
    if (pathParts.length < 2) { return undefined; }

    return pathParts[pathParts.length - 2].toLowerCase();
  }

  /** Класс, определённый в каталоге файла — только если он там единственный. */
  private findClassInSameDirectory(filePath: string | undefined, lookup: ClassLookup): ClassInfo | undefined {
    const dir = this.directoryOf(filePath);
    if (dir === undefined) { return undefined; }

    const inDir = lookup.classesByDirectory.get(dir);
    if (!inDir || inDir.size !== 1) { return undefined; }

    return inDir.values().next().value;
  }

  /**
   * Точное совпадение по имени/алиасу, а если не нашлось и fuzzy-матчинг включён —
   * ближайший класс по нормализованному имени/расстоянию Левенштейна.
   */
  private findClassByFolderName(filePath: string | undefined, lookup: ClassLookup): ClassInfo | undefined {
    const name = this.folderNameOf(filePath);
    if (!name) { return undefined; }

    const exact = lookup.classNameMap.get(name);
    if (exact) { return exact; }

    if (!lookup.config.fuzzyClassMatching) { return undefined; }

    return findBestFuzzyMatch(name, lookup.fuzzyCandidates, lookup.config.fuzzyClassMatchThreshold) ?? undefined;
  }

  /** Порядок фолбэка по расположению файла: класс из того же каталога -> имя/алиас папки -> fuzzy. */
  private resolveClassByLocation(filePath: string | undefined, lookup: ClassLookup): ClassInfo | undefined {
    return this.findClassInSameDirectory(filePath, lookup)
      ?? this.findClassByFolderName(filePath, lookup);
  }

  private isIgnoredStatusClass(cls: ClassInfo, config: ExtensionConfig): boolean {
    return !!(config.ignoreStatus && config.ignoreUuid && cls.id === config.ignoreUuid);
  }

  public linkClassesAndObjects(classes: ClassInfo[], objects: ObjectInfo[]) {
    const config = getConfig();
    const linkedIds = new Set<string>();
    const seenByClass = new Map<ClassInfo, Set<string>>();

    // Очищаем все существующие связи
    classes.forEach(cls => {
      cls.objects = [];
    });

    const attach = (cls: ClassInfo, obj: ObjectInfo) => {
      let seen = seenByClass.get(cls);
      if (!seen) {
        seen = new Set();
        seenByClass.set(cls, seen);
      }
      if (!seen.has(obj.id)) {
        seen.add(obj.id);
        cls.objects.push(obj);
      }
      linkedIds.add(obj.id);
    };

    this.linkObjectsByClassId(classes, objects, config, attach);

    const lookup = this.buildLookup(classes, config);
    this.linkObjectsByLocation(objects, lookup, linkedIds, attach);

    this.linkLeftoverObjectsToStatusClass(classes, objects, config, linkedIds, attach);
  }

  /** Проход 1: явный classId (кроме игнорируемого класса статусов). */
  private linkObjectsByClassId(
    classes: ClassInfo[],
    objects: ObjectInfo[],
    config: ExtensionConfig,
    attach: (cls: ClassInfo, obj: ObjectInfo) => void
  ) {
    const classMap = new Map(classes.map(c => [c.id, c]));

    objects.forEach(obj => {
      const cls = classMap.get(obj.classId);
      if (cls && !this.isIgnoredStatusClass(cls, config)) {
        attach(cls, obj);
      }
    });
  }

  /** Проход 2: по расположению файла объекта (каталог класса, имя папки/алиас, fuzzy). */
  private linkObjectsByLocation(
    objects: ObjectInfo[],
    lookup: ClassLookup,
    linkedIds: Set<string>,
    attach: (cls: ClassInfo, obj: ObjectInfo) => void
  ) {
    objects.forEach(obj => {
      if (linkedIds.has(obj.id)) { return; }

      const cls = this.resolveClassByLocation(obj.filePath, lookup);
      if (cls) { attach(cls, obj); }
    });
  }

  /** Проход 3: оставшиеся без класса объекты складываются в класс статусов. */
  private linkLeftoverObjectsToStatusClass(
    classes: ClassInfo[],
    objects: ObjectInfo[],
    config: ExtensionConfig,
    linkedIds: Set<string>,
    attach: (cls: ClassInfo, obj: ObjectInfo) => void
  ) {
    const statusClass = classes.find(c => config.ignoreUuid === c.id);
    if (!statusClass) { return; }

    objects.forEach(obj => {
      if (!linkedIds.has(obj.id)) { attach(statusClass, obj); }
    });
  }

  public linkClassesAndProperties(
    classes: ClassInfo[],
    properties: PropertyInfo[],
    links: ClassPropertyLink[]
  ) {
    const config = getConfig();
    const seenByClass = new Map<ClassInfo, Set<string>>();

    classes.forEach(cls => {
      if (!cls.properties) { cls.properties = []; }
      seenByClass.set(cls, new Set(cls.properties.map(p => p.id)));
    });

    const attach = (cls: ClassInfo, prop: PropertyInfo) => {
      const seen = seenByClass.get(cls)!;
      if (!seen.has(prop.id)) {
        seen.add(prop.id);
        cls.properties.push(prop);
      }
    };

    this.linkPropertiesByLinks(classes, properties, links, attach);
    this.linkAutoProperties(classes, properties, config, attach);
    this.linkPropertiesByLocation(classes, properties, links, config, attach);
  }

  /** Явные привязки из links (classes_property_definitions). */
  private linkPropertiesByLinks(
    classes: ClassInfo[],
    properties: PropertyInfo[],
    links: ClassPropertyLink[],
    attach: (cls: ClassInfo, prop: PropertyInfo) => void
  ) {
    const propertyMap = new Map(properties.map(p => [p.id, p]));
    const classMap = new Map(classes.map(c => [c.id, c]));

    links.forEach(link => {
      const cls = classMap.get(link.classId);
      const prop = propertyMap.get(link.propertyId);

      if (cls && prop) { attach(cls, prop); }
    });
  }

  /** Автоматическая привязка свойств из конфига ко всем обрабатываемым классам. */
  private linkAutoProperties(
    classes: ClassInfo[],
    properties: PropertyInfo[],
    config: ExtensionConfig,
    attach: (cls: ClassInfo, prop: PropertyInfo) => void
  ) {
    if (!config.autoLinkedProperties || config.autoLinkedProperties.length === 0) { return; }

    const autoUuids = new Set(config.autoLinkedProperties.map(p => p.uuid));
    const autoProperties = properties.filter(p => autoUuids.has(p.id));

    autoProperties.forEach(property => {
      classes.forEach(cls => {
        if (cls.classType === ClassType.Обрабатываемый) { attach(cls, property); }
      });
    });
  }

  /**
   * Фолбэк для свойств без явной связи (classes_property_definitions) — по расположению
   * файла, как у объектов: класс из того же каталога -> имя/алиас папки -> fuzzy.
   */
  private linkPropertiesByLocation(
    classes: ClassInfo[],
    properties: PropertyInfo[],
    links: ClassPropertyLink[],
    config: ExtensionConfig,
    attach: (cls: ClassInfo, prop: PropertyInfo) => void
  ) {
    const linkedPropertyIds = new Set(links.map(l => l.propertyId));
    const lookup = this.buildLookup(classes, config);

    properties.forEach(property => {
      if (linkedPropertyIds.has(property.id)) { return; }

      const cls = this.resolveClassByLocation(property.filePath, lookup);
      if (cls) { attach(cls, property); }
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