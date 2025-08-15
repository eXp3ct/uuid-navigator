import { ModelLinker } from '../modelLinker';
import { ClassInfo, ClassType, ObjectInfo, PropertyInfo, ClassPropertyLink, RoleInfo } from '../models';
import { AliasService } from '../aliasService';
import { mockConfig } from './__mocks__/settings';

jest.mock('../settings', () => ({
  getConfig: jest.fn()
}));

import { getConfig as mockGetConfig } from '../settings';

describe('ModelLinker', () => {
  let linker: ModelLinker;
  let mockAliasService: jest.Mocked<AliasService>;

  beforeEach(() => {
    mockAliasService = {
      getAlias: jest.fn(),
      onAliasesChanged: jest.fn()
    } as unknown as jest.Mocked<AliasService>;

    linker = new ModelLinker(mockAliasService);

    // Сбрасываем мок конфига перед каждым тестом
    (mockGetConfig as jest.Mock).mockReturnValue({
      ignoreStatus: false,
      ignoreUuid: '',
      autoLinkedProperties: []
    });
  });

  describe('linkClassesAndProperties', () => {
    it('should link properties to classes based on links', () => {
      const classes: ClassInfo[] = [
        {
          id: 'cls1', name: 'Class1', properties: [], objects: [], classType: ClassType.Обрабатываемый,
          description: ''
        }
      ];
      const properties: PropertyInfo[] = [
        { id: 'prop1', name: 'Property1', dataType: 0, description: '' }
      ];
      const links: ClassPropertyLink[] = [
        { classId: 'cls1', propertyId: 'prop1' }
      ];

      linker.linkClassesAndProperties(classes, properties, links);

      expect(classes[0].properties).toHaveLength(1);
      expect(classes[0].properties[0].id).toBe('prop1');
    });

    it('should not duplicate existing links', () => {
      const classes: ClassInfo[] = [
        {
          id: 'cls1', name: 'Class1', properties: [{ id: 'prop1', name: 'Property1', dataType: 0, description: '' }], objects: [], classType: ClassType.Обрабатываемый,
          description: ''
        }
      ];
      const properties: PropertyInfo[] = [
        { id: 'prop1', name: 'Property1', dataType: 0, description: '' }
      ];
      const links: ClassPropertyLink[] = [
        { classId: 'cls1', propertyId: 'prop1' }
      ];

      linker.linkClassesAndProperties(classes, properties, links);

      expect(classes[0].properties).toHaveLength(1);
    });

    it('should not link properties to non-processable classes', () => {
      mockConfig.autoLinkedProperties = [
        {
          name: 'Статус',
          uuid: '576a5608-b985-4b67-ac22-eb2e9d8082bd',
          classId: 'b2d437bc-af8e-4d75-ac25-70f481251233'
        }
      ];

      const classes: ClassInfo[] = [
        {
          id: 'cls1',
          name: 'Class1',
          properties: [],
          objects: [],
          classType: ClassType.Справочный // Не обрабатываемый тип
          ,
          description: ''
        }
      ];

      const properties: PropertyInfo[] = [
        {
          id: '576a5608-b985-4b67-ac22-eb2e9d8082bd',
          name: 'Status',
          dataType: 0,
          description: '',
          sourceClassId: 'b2d437bc-af8e-4d75-ac25-70f481251233'
        }
      ];

      linker.linkClassesAndProperties(classes, properties, []);

      expect(classes[0].properties).toHaveLength(0);
    });

    describe('linkClassesAndObjects', () => {
      it('should link objects to classes by classId', () => {
        const classes: ClassInfo[] = [
          {
            id: 'cls1', name: 'Class1', properties: [], objects: [],
            description: '',
            classType: 0
          }
        ];
        const objects: ObjectInfo[] = [
          { id: 'obj1', name: 'Object1', classId: 'cls1', parentId: null, description: '' }
        ];

        linker.linkClassesAndObjects(classes, objects);

        expect(classes[0].objects).toHaveLength(1);
        expect(classes[0].objects[0].id).toBe('obj1');
      });

      it('should link objects by path when classId not found', () => {
        const classes: ClassInfo[] = [
          {
            id: 'cls1', name: 'Class1', properties: [], objects: [],
            description: '',
            classType: 0
          }
        ];
        const objects: ObjectInfo[] = [
          { id: 'obj1', name: 'Object1', classId: 'unknown', parentId: null, description: '', filePath: '/path/to/Class1/file.sql' }
        ];

        linker.linkClassesAndObjects(classes, objects);

        expect(classes[0].objects).toHaveLength(1);
      });

      it('should remove duplicate objects', () => {
        const classes: ClassInfo[] = [
          {
            id: 'cls1', name: 'Class1', properties: [], objects: [],
            description: '',
            classType: 0
          }
        ];
        const objects: ObjectInfo[] = [
          { id: 'obj1', name: 'Object1', classId: 'cls1', parentId: null, description: '' },
          { id: 'obj1', name: 'Object1', classId: 'cls1', parentId: null, description: '' }
        ];

        linker.linkClassesAndObjects(classes, objects);

        expect(classes[0].objects).toHaveLength(1);
      });
    });

    describe('sortModel', () => {
      it('should sort classes, properties and objects by name', () => {
        const classes: ClassInfo[] = [
          {
            id: 'cls2', name: 'BClass', properties: [], objects: [],
            description: '',
            classType: 0
          },
          {
            id: 'cls1', name: 'AClass', properties: [], objects: [],
            description: '',
            classType: 0
          }
        ];
        const properties: PropertyInfo[] = [
          { id: 'prop2', name: 'BProperty', dataType: 0, description: '' },
          { id: 'prop1', name: 'AProperty', dataType: 0, description: '' }
        ];
        const objects: ObjectInfo[] = [
          { id: 'obj2', name: 'BObject', classId: 'cls1', parentId: null, description: '' },
          { id: 'obj1', name: 'AObject', classId: 'cls1', parentId: null, description: '' }
        ];
        const roles: RoleInfo[] = [
          { id: 'role1', name: 'BRole', description: '' },
          { id: 'role2', name: 'ARole', description: '' },
        ]

        const result = linker.sortModel(classes, properties, objects, roles);

        expect(result.classes[0].name).toBe('AClass');
        expect(result.properties[0].name).toBe('AProperty');
        expect(result.objects[0].name).toBe('AObject');
        expect(result.roles[0].name).toBe('ARole');
      });

      it('should sort nested properties and objects', () => {
        const classes: ClassInfo[] = [
          {
            id: 'cls1',
            name: 'Class1',
            properties: [
              { id: 'prop2', name: 'BProp', dataType: 0, description: '' },
              { id: 'prop1', name: 'AProp', dataType: 0, description: '' }
            ],
            objects: [
              { id: 'obj2', name: 'BObject', classId: 'cls1', parentId: null, description: '' },
              { id: 'obj1', name: 'AObject', classId: 'cls1', parentId: null, description: '' }
            ],
            description: '',
            classType: 0
          }
        ];

        const result = linker.sortModel(classes, [], [], []);

        expect(result.classes[0].properties[0].name).toBe('AProp');
        expect(result.classes[0].objects[0].name).toBe('AObject');
      });
    });

    describe('edge cases', () => {
      it('should handle empty inputs', () => {
        const result = linker.sortModel([], [], [], []);
        expect(result.classes).toEqual([]);
        expect(result.properties).toEqual([]);
        expect(result.objects).toEqual([]);
      });

      it('should handle missing properties/objects arrays', () => {
        const classes: ClassInfo[] = [
          { id: 'cls1', name: 'Class1' } as unknown as ClassInfo
        ];

        linker.linkClassesAndObjects(classes, []);
        expect(classes[0].objects).toEqual([]);
      });

      it('should handle objects with invalid file paths', () => {
        const classes: ClassInfo[] = [
          {
            id: 'cls1', name: 'Class1', properties: [], objects: [],
            description: '',
            classType: 0
          }
        ];
        const objects: ObjectInfo[] = [
          { id: 'obj1', name: 'Object1', classId: 'unknown', parentId: null, description: '', filePath: 'invalidpath' }
        ];

        linker.linkClassesAndObjects(classes, objects);
        expect(classes[0].objects).toHaveLength(0);
      });
    });
  });
});