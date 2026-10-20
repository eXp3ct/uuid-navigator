import { ModelLinker } from '../modelLinker';
import { ClassInfo, ClassPropertyLink, ClassType, ExtensionConfig, ObjectInfo, PropertyInfo, RoleInfo } from '../models';
import { AliasService } from '../aliasService';
import { createMockConfig } from './__mocks__/settings';

jest.mock('../settings', () => ({
  getConfig: jest.fn()
}));

import { getConfig } from '../settings';

const STATUS_CLASS_ID = '00000000-0000-4000-8000-000000000001';

function makeClass(overrides: Partial<ClassInfo> & Pick<ClassInfo, 'id' | 'name'>): ClassInfo {
  return {
    description: '',
    classType: ClassType.Обрабатываемый,
    properties: [],
    objects: [],
    ...overrides
  };
}

function makeObject(overrides: Partial<ObjectInfo> & Pick<ObjectInfo, 'id'>): ObjectInfo {
  return {
    name: overrides.id,
    description: '',
    classId: 'unknown-class',
    parentId: null,
    ...overrides
  };
}

function makeProperty(overrides: Partial<PropertyInfo> & Pick<PropertyInfo, 'id'>): PropertyInfo {
  return {
    name: overrides.id,
    description: '',
    dataType: 0,
    ...overrides
  };
}

function ids(items: { id: string }[]): string[] {
  return items.map(i => i.id);
}

describe('ModelLinker', () => {
  let linker: ModelLinker;
  let aliases: Record<string, string>;

  function setConfig(overrides: Partial<ExtensionConfig> = {}) {
    (getConfig as jest.Mock).mockReturnValue(createMockConfig(overrides));
  }

  beforeEach(() => {
    aliases = {};
    const aliasService = {
      getAlias: jest.fn((classId: string) => aliases[classId]),
      onAliasesChanged: jest.fn()
    } as unknown as AliasService;

    linker = new ModelLinker(aliasService);
    setConfig();
  });

  describe('linkClassesAndObjects', () => {
    it('links objects by explicit classId', () => {
      const classes = [makeClass({ id: 'cls1', name: 'Class1' })];
      const objects = [makeObject({ id: 'obj1', classId: 'cls1' })];

      linker.linkClassesAndObjects(classes, objects);

      expect(ids(classes[0].objects)).toEqual(['obj1']);
    });

    it('clears previously linked objects before relinking', () => {
      const stale = makeObject({ id: 'stale', classId: 'cls1' });
      const classes = [makeClass({ id: 'cls1', name: 'Class1', objects: [stale] })];

      linker.linkClassesAndObjects(classes, [makeObject({ id: 'obj1', classId: 'cls1' })]);

      expect(ids(classes[0].objects)).toEqual(['obj1']);
    });

    it('removes duplicate objects', () => {
      const classes = [makeClass({ id: 'cls1', name: 'Class1' })];
      const objects = [
        makeObject({ id: 'obj1', classId: 'cls1' }),
        makeObject({ id: 'obj1', classId: 'cls1' })
      ];

      linker.linkClassesAndObjects(classes, objects);

      expect(classes[0].objects).toHaveLength(1);
    });

    it('prefers the explicit class over any location-based fallback', () => {
      const classes = [
        makeClass({ id: 'cls1', name: 'ClassA', filePath: '/ws/Dir/a.class.yaml' }),
        makeClass({ id: 'cls2', name: 'ClassB', filePath: '/ws/Other/b.class.yaml' })
      ];
      const objects = [makeObject({ id: 'obj1', classId: 'cls2', filePath: '/ws/Dir/a.object.yaml' })];

      linker.linkClassesAndObjects(classes, objects);

      expect(classes[0].objects).toHaveLength(0);
      expect(ids(classes[1].objects)).toEqual(['obj1']);
    });

    describe('ignored status class', () => {
      const statusClass = () => makeClass({ id: STATUS_CLASS_ID, name: 'Статусы', filePath: '/ws/Статусы/status.class.yaml' });

      beforeEach(() => setConfig({ ignoreStatus: true, ignoreUuid: STATUS_CLASS_ID }));

      it('links a status object to the class of its directory even when the folder name differs from the class name', () => {
        const work = makeClass({ id: 'cls-work', name: 'Работы', filePath: '/ws/Работа заявки/work.class.yaml' });
        const classes = [statusClass(), work];
        const objects = [
          makeObject({ id: 'st1', classId: STATUS_CLASS_ID, filePath: '/ws/Работа заявки/work.object.yaml' })
        ];

        linker.linkClassesAndObjects(classes, objects);

        expect(ids(work.objects)).toEqual(['st1']);
        expect(classes[0].objects).toHaveLength(0);
      });

      it('works with Windows-style separators', () => {
        const work = makeClass({ id: 'cls-work', name: 'Работы', filePath: 'C:\\ws\\Работа заявки\\work.class.sql' });
        const objects = [
          makeObject({ id: 'st1', classId: STATUS_CLASS_ID, filePath: 'C:/ws/Работа заявки/work.object.sql' })
        ];

        linker.linkClassesAndObjects([statusClass(), work], objects);

        expect(ids(work.objects)).toEqual(['st1']);
      });

      it('falls back to the status class bucket when nothing else matches', () => {
        const status = statusClass();
        const work = makeClass({ id: 'cls-work', name: 'Работы', filePath: '/ws/Работы/work.class.yaml' });
        const objects = [
          makeObject({ id: 'st1', classId: STATUS_CLASS_ID, filePath: '/ws/Неизвестная папка/some.object.yaml' }),
          makeObject({ id: 'st2', classId: STATUS_CLASS_ID })
        ];

        linker.linkClassesAndObjects([status, work], objects);

        expect(ids(status.objects)).toEqual(['st1', 'st2']);
        expect(work.objects).toHaveLength(0);
      });

      it('does not touch the status bucket when the status class is absent', () => {
        const work = makeClass({ id: 'cls-work', name: 'Работы', filePath: '/ws/Работы/work.class.yaml' });
        const objects = [makeObject({ id: 'st1', classId: STATUS_CLASS_ID, filePath: '/ws/Прочее/x.object.yaml' })];

        expect(() => linker.linkClassesAndObjects([work], objects)).not.toThrow();
        expect(work.objects).toHaveLength(0);
      });
    });

    describe('same-directory linking', () => {
      it('links an object to the only class defined in its directory regardless of the folder name', () => {
        const cls = makeClass({ id: 'cls1', name: 'Работы', filePath: '/ws/Работа заявки/1. Класс.sql' });
        const objects = [makeObject({ id: 'obj1', filePath: '/ws/Работа заявки/2. Объекты.sql' })];

        linker.linkClassesAndObjects([cls], objects);

        expect(ids(cls.objects)).toEqual(['obj1']);
      });

      it('does not use the same-directory class for objects from another directory', () => {
        const cls = makeClass({ id: 'cls1', name: 'Работы', filePath: '/ws/Работа заявки/class.yaml' });
        const objects = [makeObject({ id: 'obj1', filePath: '/ws/Другая папка/obj.yaml' })];

        linker.linkClassesAndObjects([cls], objects);

        expect(cls.objects).toHaveLength(0);
      });

      it('takes priority over an exact folder-name match with another class', () => {
        const local = makeClass({ id: 'cls-local', name: 'Локальный', filePath: '/ws/Склад/local.class.yaml' });
        const named = makeClass({ id: 'cls-named', name: 'Склад', filePath: '/ws/Elsewhere/named.class.yaml' });
        const objects = [makeObject({ id: 'obj1', filePath: '/ws/Склад/obj.yaml' })];

        linker.linkClassesAndObjects([local, named], objects);

        expect(ids(local.objects)).toEqual(['obj1']);
        expect(named.objects).toHaveLength(0);
      });

      it('counts the same class defined twice in a directory only once', () => {
        const a = makeClass({ id: 'cls1', name: 'Работы', filePath: '/ws/Dir/a.class.yaml' });
        const b = makeClass({ id: 'cls1', name: 'Работы', filePath: '/ws/Dir/b.class.sql' });
        const objects = [makeObject({ id: 'obj1', filePath: '/ws/Dir/obj.yaml' })];

        linker.linkClassesAndObjects([a, b], objects);

        expect(ids(a.objects)).toEqual(['obj1']);
      });

      it('falls through to name matching when two classes live in the directory', () => {
        const first = makeClass({ id: 'cls1', name: 'Первый', filePath: '/ws/Склад/first.class.yaml' });
        const second = makeClass({ id: 'cls2', name: 'Второй', filePath: '/ws/Склад/second.class.yaml' });
        const byName = makeClass({ id: 'cls3', name: 'Склад', filePath: '/ws/Другое/stock.class.yaml' });
        const objects = [makeObject({ id: 'obj1', filePath: '/ws/Склад/obj.yaml' })];

        linker.linkClassesAndObjects([first, second, byName], objects);

        expect(first.objects).toHaveLength(0);
        expect(second.objects).toHaveLength(0);
        expect(ids(byName.objects)).toEqual(['obj1']);
      });

      it('leaves the object unlinked when the directory is ambiguous and no name matches', () => {
        const first = makeClass({ id: 'cls1', name: 'Первый', filePath: '/ws/Dir/first.class.yaml' });
        const second = makeClass({ id: 'cls2', name: 'Второй', filePath: '/ws/Dir/second.class.yaml' });
        const objects = [makeObject({ id: 'obj1', filePath: '/ws/Dir/obj.yaml' })];

        linker.linkClassesAndObjects([first, second], objects);

        expect(first.objects).toHaveLength(0);
        expect(second.objects).toHaveLength(0);
      });
    });

    describe('name / alias matching', () => {
      it('links an object by exact folder name (case-insensitive)', () => {
        const cls = makeClass({ id: 'cls1', name: 'Class1', filePath: '/ws/elsewhere/c.class.yaml' });
        const objects = [makeObject({ id: 'obj1', filePath: '/path/to/class1/file.sql' })];

        linker.linkClassesAndObjects([cls], objects);

        expect(ids(cls.objects)).toEqual(['obj1']);
      });

      it('links an object by the class alias', () => {
        const cls = makeClass({ id: 'cls1', name: 'Class1' });
        aliases['cls1'] = 'Короткий';
        const objects = [makeObject({ id: 'obj1', filePath: '/ws/Короткий/file.sql' })];

        linker.linkClassesAndObjects([cls], objects);

        expect(ids(cls.objects)).toEqual(['obj1']);
      });

      it('ignores objects with a path that has no directory', () => {
        const cls = makeClass({ id: 'cls1', name: 'Class1' });
        const objects = [makeObject({ id: 'obj1', filePath: 'invalidpath' })];

        linker.linkClassesAndObjects([cls], objects);

        expect(cls.objects).toHaveLength(0);
      });

      it('handles classes without properties/objects arrays', () => {
        const classes = [{ id: 'cls1', name: 'Class1' } as unknown as ClassInfo];

        linker.linkClassesAndObjects(classes, []);

        expect(classes[0].objects).toEqual([]);
      });
    });

    describe('fuzzy matching', () => {
      const classes = () => [makeClass({ id: 'cls1', name: 'Отдел продаж', filePath: '/ws/classes/c.class.yaml' })];

      it('links by folder name with punctuation/case differences when enabled', () => {
        setConfig({ fuzzyClassMatching: true });
        const cls = classes();
        const objects = [makeObject({ id: 'obj1', filePath: '/root/Отдел-Продаж/file.sql' })];

        linker.linkClassesAndObjects(cls, objects);

        expect(ids(cls[0].objects)).toEqual(['obj1']);
      });

      it('does not link when fuzzy matching is disabled', () => {
        setConfig({ fuzzyClassMatching: false });
        const cls = classes();
        const objects = [makeObject({ id: 'obj1', filePath: '/root/Отдел-Продаж/file.sql' })];

        linker.linkClassesAndObjects(cls, objects);

        expect(cls[0].objects).toHaveLength(0);
      });

      it('does not link a genuinely different word even when enabled', () => {
        setConfig({ fuzzyClassMatching: true });
        const cls = [makeClass({ id: 'cls1', name: 'Работы', filePath: '/ws/classes/c.class.yaml' })];
        const objects = [makeObject({ id: 'obj1', filePath: '/root/Работа заявки/file.sql' })];

        linker.linkClassesAndObjects(cls, objects);

        expect(cls[0].objects).toHaveLength(0);
      });

      it('prefers an exact match over a fuzzy one', () => {
        setConfig({ fuzzyClassMatching: true });
        const exact = makeClass({ id: 'cls-exact', name: 'Отдел продаж', filePath: '/ws/a/c.class.yaml' });
        const near = makeClass({ id: 'cls-near', name: 'Отдел продаж 2', filePath: '/ws/b/c.class.yaml' });
        const objects = [makeObject({ id: 'obj1', filePath: '/root/Отдел продаж/file.sql' })];

        linker.linkClassesAndObjects([near, exact], objects);

        expect(ids(exact.objects)).toEqual(['obj1']);
        expect(near.objects).toHaveLength(0);
      });
    });
  });

  describe('linkClassesAndProperties', () => {
    it('links properties to classes based on links', () => {
      const classes = [makeClass({ id: 'cls1', name: 'Class1' })];
      const properties = [makeProperty({ id: 'prop1' })];
      const links: ClassPropertyLink[] = [{ classId: 'cls1', propertyId: 'prop1' }];

      linker.linkClassesAndProperties(classes, properties, links);

      expect(ids(classes[0].properties)).toEqual(['prop1']);
    });

    it('does not duplicate existing links', () => {
      const prop = makeProperty({ id: 'prop1' });
      const classes = [makeClass({ id: 'cls1', name: 'Class1', properties: [prop] })];
      const links: ClassPropertyLink[] = [
        { classId: 'cls1', propertyId: 'prop1' },
        { classId: 'cls1', propertyId: 'prop1' }
      ];

      linker.linkClassesAndProperties(classes, [prop], links);

      expect(classes[0].properties).toHaveLength(1);
    });

    describe('auto-linked properties', () => {
      const autoProp = { name: 'Статус', uuid: 'auto-prop', classId: null };

      it('attaches them to processable classes only', () => {
        setConfig({ autoLinkedProperties: [autoProp] });
        const processable = makeClass({ id: 'cls1', name: 'Class1', classType: ClassType.Обрабатываемый });
        const reference = makeClass({ id: 'cls2', name: 'Class2', classType: ClassType.Справочный });
        const properties = [makeProperty({ id: 'auto-prop' })];

        linker.linkClassesAndProperties([processable, reference], properties, []);

        expect(ids(processable.properties)).toEqual(['auto-prop']);
        expect(reference.properties).toHaveLength(0);
      });

      it('does not attach twice when the property is also linked explicitly', () => {
        setConfig({ autoLinkedProperties: [autoProp] });
        const cls = makeClass({ id: 'cls1', name: 'Class1' });
        const properties = [makeProperty({ id: 'auto-prop' })];

        linker.linkClassesAndProperties([cls], properties, [{ classId: 'cls1', propertyId: 'auto-prop' }]);

        expect(cls.properties).toHaveLength(1);
      });
    });

    describe('fallback for properties without an explicit link', () => {
      it('links via the only class defined in the same directory', () => {
        const cls = makeClass({ id: 'cls1', name: 'Работы', filePath: '/ws/Работа заявки/1. Класс.sql' });
        const properties = [makeProperty({ id: 'prop1', filePath: '/ws/Работа заявки/prop.sql' })];

        linker.linkClassesAndProperties([cls], properties, []);

        expect(ids(cls.properties)).toEqual(['prop1']);
      });

      it('falls through to name matching when the directory holds two classes', () => {
        const first = makeClass({ id: 'cls1', name: 'Первый', filePath: '/ws/Склад/first.class.yaml' });
        const second = makeClass({ id: 'cls2', name: 'Второй', filePath: '/ws/Склад/second.class.yaml' });
        const byName = makeClass({ id: 'cls3', name: 'Склад', filePath: '/ws/Другое/stock.class.yaml' });
        const properties = [makeProperty({ id: 'prop1', filePath: '/ws/Склад/prop.sql' })];

        linker.linkClassesAndProperties([first, second, byName], properties, []);

        expect(first.properties).toHaveLength(0);
        expect(second.properties).toHaveLength(0);
        expect(ids(byName.properties)).toEqual(['prop1']);
      });

      it('links by exact folder name', () => {
        const cls = makeClass({ id: 'cls1', name: 'Класс1' });
        const properties = [makeProperty({ id: 'prop1', filePath: '/root/Класс1/file.sql' })];

        linker.linkClassesAndProperties([cls], properties, []);

        expect(ids(cls.properties)).toEqual(['prop1']);
      });

      it('links by class alias', () => {
        const cls = makeClass({ id: 'cls1', name: 'Класс1' });
        aliases['cls1'] = 'Сокращение';
        const properties = [makeProperty({ id: 'prop1', filePath: '/root/Сокращение/file.sql' })];

        linker.linkClassesAndProperties([cls], properties, []);

        expect(ids(cls.properties)).toEqual(['prop1']);
      });

      it('links by fuzzy folder name only when fuzzy matching is enabled', () => {
        const build = () => ({
          cls: makeClass({ id: 'cls1', name: 'Отдел продаж', filePath: '/ws/classes/c.class.yaml' }),
          properties: [makeProperty({ id: 'prop1', filePath: '/root/Отдел-Продаж/file.sql' })]
        });

        setConfig({ fuzzyClassMatching: true });
        const on = build();
        linker.linkClassesAndProperties([on.cls], on.properties, []);
        expect(ids(on.cls.properties)).toEqual(['prop1']);

        setConfig({ fuzzyClassMatching: false });
        const off = build();
        linker.linkClassesAndProperties([off.cls], off.properties, []);
        expect(off.cls.properties).toHaveLength(0);
      });

      it('leaves a property unlinked when no class is close to the folder name', () => {
        setConfig({ fuzzyClassMatching: true });
        const cls = makeClass({ id: 'cls1', name: 'Финансы', filePath: '/ws/classes/c.class.yaml' });
        const properties = [makeProperty({ id: 'prop1', filePath: '/root/Совершенно другое/file.sql' })];

        linker.linkClassesAndProperties([cls], properties, []);

        expect(cls.properties).toHaveLength(0);
      });

      it('is skipped for a property that already has an explicit link', () => {
        setConfig({ fuzzyClassMatching: true });
        const linked = makeClass({ id: 'cls1', name: 'ClassA', filePath: '/ws/A/a.class.yaml' });
        const sameDir = makeClass({ id: 'cls2', name: 'ClassB', filePath: '/ws/B/b.class.yaml' });
        const properties = [makeProperty({ id: 'prop1', filePath: '/ws/B/prop.sql' })];

        linker.linkClassesAndProperties([linked, sameDir], properties, [{ classId: 'cls1', propertyId: 'prop1' }]);

        expect(ids(linked.properties)).toEqual(['prop1']);
        expect(sameDir.properties).toHaveLength(0);
      });
    });
  });

  describe('sortModel', () => {
    it('sorts classes, properties, objects and roles by name', () => {
      const classes = [
        makeClass({ id: 'cls2', name: 'BClass' }),
        makeClass({ id: 'cls1', name: 'AClass' })
      ];
      const properties = [makeProperty({ id: 'prop2', name: 'BProperty' }), makeProperty({ id: 'prop1', name: 'AProperty' })];
      const objects = [
        makeObject({ id: 'obj2', name: 'BObject', classId: 'cls1' }),
        makeObject({ id: 'obj1', name: 'AObject', classId: 'cls1' })
      ];
      const roles: RoleInfo[] = [
        { id: 'role1', name: 'BRole', description: '' },
        { id: 'role2', name: 'ARole', description: '' }
      ];

      const result = linker.sortModel(classes, properties, objects, roles);

      expect(result.classes[0].name).toBe('AClass');
      expect(result.properties[0].name).toBe('AProperty');
      expect(result.objects[0].name).toBe('AObject');
      expect(result.roles[0].name).toBe('ARole');
    });

    it('sorts nested properties and objects', () => {
      const classes = [
        makeClass({
          id: 'cls1',
          name: 'Class1',
          properties: [makeProperty({ id: 'prop2', name: 'BProp' }), makeProperty({ id: 'prop1', name: 'AProp' })],
          objects: [
            makeObject({ id: 'obj2', name: 'BObject', classId: 'cls1' }),
            makeObject({ id: 'obj1', name: 'AObject', classId: 'cls1' })
          ]
        })
      ];

      const result = linker.sortModel(classes, [], [], []);

      expect(result.classes[0].properties[0].name).toBe('AProp');
      expect(result.classes[0].objects[0].name).toBe('AObject');
    });

    it('handles empty inputs', () => {
      const result = linker.sortModel([], [], [], []);

      expect(result).toEqual({ classes: [], properties: [], objects: [], roles: [] });
    });
  });
});
