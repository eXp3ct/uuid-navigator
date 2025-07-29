import * as vscode from 'vscode';
import { ClassInfo, PropertyInfo } from './sqlProcessor';

export class ExplorerProvider implements vscode.TreeDataProvider<ExplorerItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ExplorerItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private classes: ClassInfo[]) { }

  refresh(classes: ClassInfo[]): void {
    this.classes = classes;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ExplorerItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ExplorerItem): Thenable<ExplorerItem[]> {
    if (!element) {
      return Promise.resolve(
        this.classes.map(cls => new ExplorerItem(
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
      const cls = element.data as ClassInfo;
      return Promise.resolve(
        cls.properties.map(prop => new ExplorerItem(
          prop.name,
          prop.id,
          prop.description,
          vscode.TreeItemCollapsibleState.None,
          'property',
          prop
        ))
      );
    }

    return Promise.resolve([]);
  }
}

class ExplorerItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly uuid: string,
    description: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
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