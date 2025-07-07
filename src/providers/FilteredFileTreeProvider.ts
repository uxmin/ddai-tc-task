import * as path from "path";
import * as vscode from "vscode";
import { state } from "../state";

// TreeItem을 상속하여 파일 경로를 저장할 수 있도록 확장합니다.
class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly resourceUri: vscode.Uri,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(resourceUri, collapsibleState);
    this.tooltip = this.resourceUri.fsPath;
    // 파일을 클릭했을 때 실행될 커맨드를 정의합니다.
    this.command = {
      command: "myExtension.openFile", // 파일 열기 커맨드
      title: "Open File",
      arguments: [this.resourceUri.fsPath], // 파일 경로를 인자로 전달
    };
  }
}

export class FilteredFileTreeProvider implements vscode.TreeDataProvider<FileTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileTreeItem | undefined | null | void> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<FileTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private includedFiles: string[];

  constructor(files: string[]) {
    this.includedFiles = files;
  }

  // 데이터가 변경되었을 때 이 함수를 호출하여 트리를 새로고침합니다.
  refresh(files: string[]): void {
    this.includedFiles = files;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FileTreeItem): vscode.ProviderResult<FileTreeItem[]> {
    if (!state.workspaceRoot) {
      return Promise.resolve([]);
    }

    if (element) {
      // 이 예제에서는 하위 폴더를 구현하지 않으므로 자식이 없습니다.
      return Promise.resolve([]);
    } else {
      // 루트 레벨의 아이템들을 반환합니다.
      const items = this.includedFiles.map((filepath) => {
        const absolutePath = path.join(state.workspaceRoot, "workspace", filepath); // 실제 파일 시스템 경로로 변환
        return new FileTreeItem(vscode.Uri.file(absolutePath), vscode.TreeItemCollapsibleState.None);
      });
      return Promise.resolve(items);
    }
  }
}
