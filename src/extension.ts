import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { registerCommands } from "./commandHandler";
import { setupFileEventHandlers } from "./fileOpenHandler";
import { setupFileWatchers } from "./fileWatchers";
import { parseXlsxFile, selectWorker } from "./parsers/xlsxParser";
import { FilteredFileTreeProvider } from "./providers/FilteredFileTreeProvider";
import { ReadonlyFileSystemProvider } from "./providers/ReadonlyFileSystemProvider";
import { ReviewFileDecorationProvider } from "./providers/ReviewDecorationProvider";
import { READONLY_SCHEME, REVIEW_JSON_FILENAME, XLSX_FILENAME, state } from "./state";
import { getGitUserName, loadReviewJson } from "./utils";

export async function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "tc-task" is now active!');

  state.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  if (!state.workspaceRoot) {
    vscode.window.showErrorMessage("워크스페이스를 열어주세요.");
    return;
  }

  // 초기 설정
  state.xlsxPath = path.join(state.workspaceRoot, XLSX_FILENAME);
  state.reviewPath = path.join(state.workspaceRoot, REVIEW_JSON_FILENAME);

  if (fs.existsSync(state.reviewPath)) {
    while (!state.mode) {
      state.mode = await vscode.window.showQuickPick(["work", "inspect"], {
        placeHolder: "모드를 선택해주세요.",
      });

      if (!state.mode) {
        await vscode.window.showWarningMessage(
          "모드를 선택해야만 작업이 진행됩니다.",
          { modal: true } // 모달로 해서 닫히지 않도록 할 수도 있음
        );
      }
    }
  }
  vscode.window.showInformationMessage(`${state.mode}가 선택되었습니다.`);

  if (state.mode === "work") {
    state.gitUser = getGitUserName();
  } else {
    const selectedWorker = await selectWorker();
    if (!selectedWorker) {
      vscode.window.showErrorMessage("검수할 작업자를 선택하지 않았습니다.");
      return;
    }
    vscode.window.showInformationMessage(`${selectedWorker} 작업자의 작업을 검수합니다.`);
    state.gitUser = selectedWorker;
  }

  const initialAllowedFiles = fs.existsSync(state.xlsxPath) ? parseXlsxFile() : [];
  state.allowedFiles = new Set(initialAllowedFiles);

  const initialReviewMap = loadReviewJson();
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
