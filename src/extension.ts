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
import { READONLY_SCHEME, RESULT_FOLDER, REVIEW_JSON_FILENAME, WORK_FOLDER, XLSX_FILENAME, state } from "./state";
import { loadReviewJson } from "./utils";
import { mergeReviewFiles } from "./utils/reviewJson";
import { setupModeAndWorker } from "./utils/setup";

export async function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "tc-task" is now active!');

  state.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  if (!state.workspaceRoot) {
    // 워크스페이스 자체가 없는 경우
    return;
  }

  // 초기 설정
  const resultFolderPath = path.join(state.workspaceRoot, RESULT_FOLDER);
  const workFolderPath = path.join(state.workspaceRoot, WORK_FOLDER);
  state.xlsxPath = path.join(state.workspaceRoot, XLSX_FILENAME);

  // 활성화 조건 검사
  if (!fs.existsSync(resultFolderPath) || !fs.existsSync(workFolderPath) || !fs.existsSync(state.xlsxPath)) {
    return; // 조건 미충족 시 확장 기능 실행 중단
  }

  state.reviewPath = path.join(state.workspaceRoot, REVIEW_JSON_FILENAME);
  const resultReviewPath = path.join(state.workspaceRoot, RESULT_FOLDER, REVIEW_JSON_FILENAME);

  console.log("\tstate.reviewPath:", state.reviewPath);
  console.log("\tresultReviewPath:", resultReviewPath);

  await mergeReviewFiles(state.reviewPath, resultReviewPath);

  const isInitialSetupSuccess = await setupModeAndWorker();
  if (!isInitialSetupSuccess) {
    vscode.window.showInformationMessage(
      "초기 설정이 취소되었습니다. '작업자 재선택' 명령어로 다시 시작할 수 있습니다."
    );
  }

  const initialAllowedFiles = fs.existsSync(state.xlsxPath) ? parseXlsxFile() : [];
  state.allowedFiles = new Set(initialAllowedFiles);

  const initialReviewMap = loadReviewJson();
  state.allowedFilesFromReviewJson = new Set<string>(Object.keys(initialReviewMap));

  // Provider 등록
  const decorationProvider = new ReviewFileDecorationProvider(initialReviewMap, state.allowedFiles);
  const readonlyProvider = new ReadonlyFileSystemProvider();
  const treeProvider = new FilteredFileTreeProvider(initialAllowedFiles);

  state.decorationProvider = decorationProvider;
  state.treeProvider = treeProvider;

  if (isInitialSetupSuccess) {
    state.treeProvider?.refresh();
    state.decorationProvider?.refresh();
  }

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
  setupFileWatchers(context);
  setupFileEventHandlers(context);
  registerCommands(context);

  console.log("Extension activated successfully.");
}

// 이 메서드는 확장 프로그램이 비활성화될 때 호출됩니다.
export function deactivate() {}
