import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { registerCommands } from "./commandHandler";
import { setupFileEventHandlers } from "./fileOpenHandler";
import { setupFileWatchers } from "./fileWatchers";
import { parseXlsxFile } from "./parsers/xlsxParser";
import { FilteredFileTreeProvider } from "./providers/FilteredFileTreeProvider";
import { ReadonlyFileSystemProvider } from "./providers/ReadonlyFileSystemProvider";
import { ReviewFileDecorationProvider } from "./providers/ReviewDecorationProvider";
import { READONLY_SCHEME, REVIEW_JSON_FILENAME, XLSX_FILENAME, state } from "./state";
import { getGitUserName, loadReviewJson } from "./utils";

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "tc-task" is now active!');

  state.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  if (!state.workspaceRoot) {
    vscode.window.showErrorMessage("워크스페이스를 열어주세요.");
    return;
  }

  // 초기 설정
  const gitUser = getGitUserName();
  const xlsxPath = path.join(state.workspaceRoot, XLSX_FILENAME);
  const reviewPath: string = path.join(state.workspaceRoot, REVIEW_JSON_FILENAME);

  const initialAllowedFiles = fs.existsSync(xlsxPath) ? parseXlsxFile(xlsxPath, gitUser) : [];
  state.allowedFiles = new Set(initialAllowedFiles);

  const initialReviewMap = loadReviewJson(reviewPath);
  state.allowedFilesFromReviewJson = new Set<string>(Object.keys(initialReviewMap));

  // Provider 등록
  const decorationProvider = new ReviewFileDecorationProvider(initialReviewMap, state.allowedFiles);
  const readonlyProvider = new ReadonlyFileSystemProvider();
  const treeProvider = new FilteredFileTreeProvider(initialAllowedFiles);

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorationProvider),
    vscode.workspace.registerFileSystemProvider(READONLY_SCHEME, readonlyProvider, {
      isCaseSensitive: true,
      isReadonly: true,
    }),
    vscode.window.createTreeView("myTaskFiles", { treeDataProvider: treeProvider })
  );
  decorationProvider["__forceRefresh"]?.();

  // watcher 등록
  setupFileWatchers(context, decorationProvider, treeProvider);
  setupFileEventHandlers(context);
  registerCommands(context);

  console.log("Extension activated successfully.");
}

// 이 메서드는 확장 프로그램이 비활성화될 때 호출됩니다.
export function deactivate() {}
