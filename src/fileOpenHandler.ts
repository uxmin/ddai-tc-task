// 파일 열기 및 읽기 전용 처리
import * as path from "path";
import * as vscode from "vscode";
import { FORBIDDEN_FILES, READONLY_SCHEME, REVIEW_JSON_FILENAME, state, WORK_EXT } from "./state";
import { loadReviewJson } from "./utils";
import { normalizePath } from "./utils/pathUtils";
import { showStatusPanel } from "./webview/showStatusPanel";

// filePath를 이용해서 읽기 전용 모드로 열거나, 편집 모드로 열고 Status Panel을 띄워줌
async function openFileWithCorrectMode(context: vscode.ExtensionContext, filePath: string) {
  const posixPath = normalizePath(state.workspaceRoot, filePath);
  const reviewMap = loadReviewJson();
  const reviewEntity = reviewMap[posixPath];

  const isExplicitReadonly = state.allowedFilesFromReviewJson.has(posixPath) && !state.allowedFiles.has(posixPath);
  const isDailyReadonly = reviewEntity?.daily === true;

  const isReadonly = isExplicitReadonly || isDailyReadonly;
  if (isReadonly) {
    console.log(`[읽기 전용 모드]: ${posixPath}`);
    const targetUri = vscode.Uri.file(filePath).with({ scheme: READONLY_SCHEME });
    await vscode.window.showTextDocument(targetUri, { preview: false, viewColumn: vscode.ViewColumn.One });
    showStatusPanel(context, filePath, true);
  } else {
    console.log(`[편집 모드]: ${posixPath}`);
    const targetUri = vscode.Uri.file(filePath);
    await vscode.window.showTextDocument(targetUri, { preview: false, viewColumn: vscode.ViewColumn.One });
    if (filePath.endsWith(`.${WORK_EXT}`)) {
      showStatusPanel(context, filePath, false);
    }
  }
}

export function setupFileEventHandlers(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      // 이미 처리 중이거나, 읽기 전용 스킴으로 열렸거나, 실제 파일이 아니면 무시
      if (state.isChecking || document.uri.scheme === READONLY_SCHEME || document.uri.scheme !== "file") {
        return;
      }

      const filePath = document.uri.fsPath;
      const filename = path.basename(filePath);

      // 편집되면 안되는 파일들이 열렸을 때 바로 닫음
      if (FORBIDDEN_FILES.has(filename)) {
        state.isChecking = true;
        vscode.window.showErrorMessage(`'${filename}' is not editable.`);
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        state.isChecking = false;
        return;
      }

      // JSON 파일이며, 작업 로드가 작성된 파일이 아닐 때, 즉 작업 대상의 파일일 때 에디터를 닫고 웹뷰를 띄운다.
      if (document.languageId === WORK_EXT && filename !== REVIEW_JSON_FILENAME) {
        state.isChecking = true;
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        await openFileWithCorrectMode(context, filePath);
        state.isChecking = false;
      }
    })
  );
}

export { openFileWithCorrectMode };
