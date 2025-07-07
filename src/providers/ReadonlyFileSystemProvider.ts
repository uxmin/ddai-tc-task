// src/ReadonlyFileSystemProvider.ts
import * as fs from "fs";
import * as vscode from "vscode";

// 이 클래스는 'readonly-file' 스킴으로 요청된 파일을 처리합니다.
// 항상 읽기 전용으로 동작하도록 설계합니다.
export class ReadonlyFileSystemProvider implements vscode.FileSystemProvider {
  // 파일의 상태(메타데이터)를 반환합니다.
  stat(uri: vscode.Uri): vscode.FileStat {
    // 실제 파일 시스템의 경로를 사용합니다.
    if (!fs.existsSync(uri.fsPath)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: fs.statSync(uri.fsPath).size,
      permissions: vscode.FilePermission.Readonly, // ✨ 핵심: 항상 읽기 전용 권한을 부여합니다.
    };
  }

  // 파일 내용을 읽어 반환합니다.
  readFile(uri: vscode.Uri): Uint8Array {
    return fs.readFileSync(uri.fsPath);
  }

  // 파일 쓰기는 항상 실패하도록 합니다.
  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void {
    throw vscode.FileSystemError.NoPermissions("이 파일은 할당되지 않아 수정할 수 없습니다.");
  }

  // --- 아래는 읽기 전용이므로 간단하게 처리합니다 ---
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

  watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    throw new Error("Method not implemented.");
  }
  createDirectory(uri: vscode.Uri): void {
    throw new Error("Method not implemented.");
  }
  delete(uri: vscode.Uri, options: { recursive: boolean }): void {
    throw new Error("Method not implemented.");
  }
  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
    throw new Error("Method not implemented.");
  }
}
