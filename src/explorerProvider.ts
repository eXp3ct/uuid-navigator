import * as vscode from 'vscode';
import { ClassInfo, ObjectInfo, PropertyInfo } from './models';

export class ExplorerProvider implements vscode.TreeDataProvider<ExplorerItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ExplorerItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private classes: ClassInfo[], private objects: ObjectInfo[]) { }

  refresh(classes: ClassInfo[], objects: ObjectInfo[]): void {
    this.classes = classes;
    this.objects = objects;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ExplorerItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ExplorerItem): Thenable<ExplorerItem[]> {
    if (!element) {
      // Корневой уровень - показываем классы
      return Promise.resolve(
        this.classes.map(cls => new ExplorerItem(
          cls.name,
          cls.id,
          cls.description,
          vscode.TreeItemCollapsibleState.Collapsed,
          'class',
          cls,
          cls.filePath,
          cls.lineNumber,
          cls.position
        ))
      );
    }

    if (element.contextValue === 'class') {
      const cls = element.data as ClassInfo;
      const items: ExplorerItem[] = [];

      // Добавляем свойства класса
      if (cls.properties && cls.properties.length > 0) {
        items.push(new ExplorerItem(
          'Свойства',
          'properties-' + cls.id,
          'Свойства класса ' + cls.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          'properties-folder',
          cls,
          cls.filePath,
          cls.lineNumber,
          cls.position
        ));
      }

      // Добавляем объекты класса (включая статусы)
      if (cls.objects && cls.objects.length > 0) {
        items.push(new ExplorerItem(
          'Объекты',
          'objects-' + cls.id,
          'Объекты класса ' + cls.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          'objects-folder',
          cls,
          cls.filePath,
          cls.lineNumber,
          cls.position
        ));
      }

      return Promise.resolve(items);
    }

    if (element.contextValue === 'properties-folder') {
      const cls = element.data as ClassInfo;
      return Promise.resolve(
        cls.properties.map(prop => new ExplorerItem(
          prop.name,
          prop.id,
          prop.description,
          vscode.TreeItemCollapsibleState.None,
          'property',
          prop,
          prop.filePath,
          prop.lineNumber,
          prop.position
        ))
      );
    }

    if (element.contextValue === 'objects-folder') {
      const cls = element.data as ClassInfo;
      return Promise.resolve(
        cls.objects.map(obj => new ExplorerItem(
          obj.name,
          obj.id,
          obj.description,
          vscode.TreeItemCollapsibleState.None,
          'object',
          obj,
          obj.filePath,
          obj.lineNumber,
          obj.position
        ))
      );
    }

    return Promise.resolve([]);
  }
}

export class ExplorerItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly uuid: string,
    description: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: 'class' | 'property' | 'object' | 'properties-folder' | 'objects-folder',
    public readonly data: ClassInfo | PropertyInfo | ObjectInfo,
    public readonly filePath?: string,
    public readonly lineNumber?: number,
    public readonly position?: number,

  ) {
    super(label, collapsibleState);
    this.tooltip = `${description}\nUUID: ${uuid}`;
    this.description = uuid;
    this.command = {
      command: 'uuid-navigator.insertUuid',
      title: 'Insert UUID',
      arguments: [uuid]
    };

    // Устанавливаем иконки в зависимости от типа элемента
    switch (contextValue) {
      case 'class':
        this.iconPath = new vscode.ThemeIcon('symbol-class');
        break;
      case 'property':
        this.iconPath = new vscode.ThemeIcon('symbol-property');
        break;
      case 'object':
        this.iconPath = new vscode.ThemeIcon('symbol-object');
        break;
      case 'properties-folder':
        this.iconPath = new vscode.ThemeIcon('symbol-namespace');
        break;
      case 'objects-folder':
        this.iconPath = new vscode.ThemeIcon('symbol-array');
        break;
    }
  }
}