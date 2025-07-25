import * as vscode from 'vscode';
import { ClassInfo, PropertyInfo } from './sqlParser';

export class UuidTreeProvider implements vscode.TreeDataProvider<UuidTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<UuidTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private classes: ClassInfo[]) { }

  refresh(classes: ClassInfo[]): void {
    this.classes = classes;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: UuidTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: UuidTreeItem): Thenable<UuidTreeItem[]> {
    if (!element) {
      // Корневой уровень - показываем классы
      console.log('Root level - classes:', this.classes.length);
      return Promise.resolve(
        this.classes.map(cls => new UuidTreeItem(
          cls.name,
          cls.id,
          cls.description,
          vscode.TreeItemCollapsibleState.Collapsed,
          'class',
          cls
        ))
      );
    }

    if (element.contextValue === 'class') {
      // Показываем свойства класса
      const cls = element.data as ClassInfo;
      console.log(`Class "${cls.name}" properties:`, cls.properties.length);

      return Promise.resolve(
        cls.properties.map(prop => new UuidTreeItem(
          prop.name,
          prop.id,
          prop.description,
          vscode.TreeItemCollapsibleState.None, // Свойства не раскрываются
          'property',
          prop
        ))
      );
    }

    return Promise.resolve([]);
  }
}

export class UuidTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly uuid: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: 'class' | 'property',
    public readonly data: ClassInfo | PropertyInfo
  ) {
    super(label, collapsibleState);
    this.tooltip = `${description}\nUUID: ${uuid}`;
    this.description = uuid;
    this.command = {
      command: 'uuid-navigator.insertUuid',
      title: 'Insert UUID',
      arguments: [uuid]
    };
  }
}