// 파일 워처 관련
import * as vscode from "vscode";
import { REVIEW_JSON_FILENAME, state, XLSX_FILENAME } from "./state";

export function setupFileWatchers(context: vscode.ExtensionContext) {
  // ✅ .review.json 실시간 감지
  const reviewJsonWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(state.workspaceRoot, REVIEW_JSON_FILENAME)
  );

  reviewJsonWatcher.onDidCreate(() => state.decorationProvider?.refresh());
  reviewJsonWatcher.onDidChange(() => state.decorationProvider?.refresh());
  reviewJsonWatcher.onDidDelete(() => state.decorationProvider?.refresh());

  // ✅ workfile.xlsx 실시간 감지 (새로운 부분)
  const xlsxWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(state.workspaceRoot, XLSX_FILENAME)
  );

  const refreshAllProviders = (message: string) => {
    vscode.window.showInformationMessage(message);
    state.decorationProvider?.refresh();
    state.treeProvider?.refresh();
  };

  xlsxWatcher.onDidChange(() => refreshAllProviders(`'${XLSX_FILENAME}' 파일이 업데이트되어 목록을 갱신합니다.`));
  xlsxWatcher.onDidCreate(() => refreshAllProviders(`'${XLSX_FILENAME}' 파일이 생성되어 목록을 갱신합니다.`));
  xlsxWatcher.onDidDelete(() => refreshAllProviders(`'${XLSX_FILENAME}' 파일이 삭제되어 목록을 갱신합니다.`));

  context.subscriptions.push(reviewJsonWatcher, xlsxWatcher);
}
