import * as vscode from "vscode";

export class FilteredFileTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private includedFiles: string[];

  constructor(files: string[]) {
    this.includedFiles = files;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    return this.includedFiles.map((filepath) => {
      return new vscode.TreeItem(vscode.Uri.file(filepath), vscode.TreeItemCollapsibleState.None);
    });
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }
}
