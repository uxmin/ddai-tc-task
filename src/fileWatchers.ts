// 파일 워처 관련
import * as path from "path";
import * as vscode from "vscode";
import { parseXlsxFile } from "./parsers/xlsxParser";
import { FilteredFileTreeProvider } from "./providers/FilteredFileTreeProvider";
import { ReviewFileDecorationProvider } from "./providers/ReviewDecorationProvider";
import { REVIEW_JSON_FILENAME, state, XLSX_FILENAME } from "./state";
import { getGitUserName, loadReviewJson } from "./utils";

export function setupFileWatchers(
  context: vscode.ExtensionContext,
  decorationProvider: ReviewFileDecorationProvider,
  treeProvider: FilteredFileTreeProvider
) {
  // ✅ .review.json 실시간 감지
  const reviewJsonWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(state.workspaceRoot, REVIEW_JSON_FILENAME)
  );
  const reviewPath: string = path.join(state.workspaceRoot, REVIEW_JSON_FILENAME);

  reviewJsonWatcher.onDidCreate(() => refreshReviewStatus(reviewPath, decorationProvider));
  reviewJsonWatcher.onDidChange(() => refreshReviewStatus(reviewPath, decorationProvider));
  reviewJsonWatcher.onDidDelete(() => {
    decorationProvider.updateReviewData({});
    state.allowedFilesFromReviewJson = new Set<string>();
  });

  // ✅ workfile.xlsx 실시간 감지 (새로운 부분)
  const xlsxWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(state.workspaceRoot, XLSX_FILENAME)
  );
  const xlsxPath = path.join(state.workspaceRoot, XLSX_FILENAME);
  const gitUser = getGitUserName();

  const updateAllowedFiles = (message: string) => {
    const updatedFiles = parseXlsxFile(xlsxPath, gitUser);
    state.allowedFiles = new Set(updatedFiles);
    decorationProvider.updateAllowedFiles(state.allowedFiles);
    treeProvider.refresh(updatedFiles); // ✨ TreeView 갱신
    vscode.window.showInformationMessage(message, { modal: false });
  };

  xlsxWatcher.onDidChange(() =>
    updateAllowedFiles(`'${XLSX_FILENAME}' 파일이 업데이트되어 파일 허용 목록을 갱신했습니다.`)
  );
  xlsxWatcher.onDidCreate(() =>
    updateAllowedFiles(`'${XLSX_FILENAME}' 파일이 생성되어 파일 허용 목록을 로드했습니다.`)
  );
  xlsxWatcher.onDidDelete(() => {
    state.allowedFiles.clear();
    decorationProvider.updateAllowedFiles(state.allowedFiles);
    treeProvider.refresh([]); // ✨ TreeView 갱신
    vscode.window.showInformationMessage(`'${XLSX_FILENAME}' 파일이 삭제되어 파일 허용 목록을 초기화했습니다.`);
  });

  context.subscriptions.push(reviewJsonWatcher, xlsxWatcher);
}

// ✅ .review.json 변경 시 리프레시
function refreshReviewStatus(reviewPath: string, decorationProvider: ReviewFileDecorationProvider) {
  const updatedReviewMap = loadReviewJson(reviewPath);
  decorationProvider.updateReviewData(updatedReviewMap);
  state.allowedFilesFromReviewJson = new Set<string>(Object.keys(updatedReviewMap));
}
