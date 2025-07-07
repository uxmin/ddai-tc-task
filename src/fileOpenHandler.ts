// 파일 열기 및 읽기 전용 처리
import * as path from "path";
import * as vscode from "vscode";
import { FORBIDDEN_FILES, openReviewPanels, READONLY_SCHEME, state } from "./state";
import { normalizePath } from "./utils/pathUtils";
import { showStatusPanel } from "./webview/showStatusPanel";

// 파일 열기 로직을 처리하는 함수
// 이 함수는 파일 경로를 받아 조건에 따라 적절한 모드로 파일을 엽니다.
async function openFileWithCorrectMode(context: vscode.ExtensionContext, filePath: string) {
  // 상대 경로 및 POSIX 형식으로 변환 (사용자 코드와 동일)
  const posixPath = normalizePath(state.workspaceRoot, filePath);
  const isReadonly = state.allowedFilesFromReviewJson.has(posixPath) && !state.allowedFiles.has(posixPath);
  if (isReadonly) {
    console.log(`[읽기 전용 모드]: ${posixPath}`);
    const targetUri = vscode.Uri.file(filePath).with({ scheme: READONLY_SCHEME });
    await vscode.window.showTextDocument(targetUri, { preview: false, viewColumn: vscode.ViewColumn.One });
    showStatusPanel(context, filePath, true);
  } else {
    console.log(`[편집 모드]: ${posixPath}`);
    const targetUri = vscode.Uri.file(filePath);
    await vscode.window.showTextDocument(targetUri, { preview: false, viewColumn: vscode.ViewColumn.One });
    if (filePath.endsWith(".json")) {
      showStatusPanel(context, filePath, false);
    }
  }
}

export function setupFileEventHandlers(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      // 이미 처리 중이거나, 우리 스킴이거나, 실제 파일이 아니면 무시
      if (state.isChecking || document.uri.scheme === READONLY_SCHEME || document.uri.scheme !== "file") {
        return;
      }

      const filePath = document.uri.fsPath;
      const filename = path.basename(filePath);

      // 조건 1: 절대 금지 파일
      if (FORBIDDEN_FILES.has(filename)) {
        state.isChecking = true;
        vscode.window.showErrorMessage(`'${filename}' is not editable.`);
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        state.isChecking = false;
        return;
      }

      const posixPath = normalizePath(state.workspaceRoot, filePath);
      // ✨ 조건 2: 할당되지 않은 리뷰 파일 (읽기 전용 대상)
      const isReadonly = state.allowedFilesFromReviewJson.has(posixPath) && !state.allowedFiles.has(posixPath);

      // console.log("document.languageId:\t", document.languageId);
      // console.log("filename:\t", filename);
      // console.log("isReadonly:\t", isReadonly);
      // console.log("posixPath:\t", posixPath);

      // 조건 3: 일반 JSON 파일 (웹뷰만 열기)
      // (isReadonly가 아닌 파일만 이 로직을 타게 됨)
      if (document.languageId === "json" && filename !== ".review.json") {
        state.isChecking = true;
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        await openFileWithCorrectMode(context, filePath);
        state.isChecking = false;
      }
    })
  );

  // JSON 문서 닫힐 때 패널도 닫기
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      const closedFilePath = document.uri.fsPath;
      // openReviewPanels 맵에서 해당 경로의 패널을 찾습니다.
      const panelToClose = openReviewPanels.get(closedFilePath);

      // 패널이 존재하면 닫습니다.
      if (panelToClose) {
        console.log(
          `[File Close -> Webview Close] JSON 파일 '${path.basename(closedFilePath)}'이(가) 닫혀 관련 웹뷰를 닫습니다.`
        );

        // onDidDispose가 자동으로 호출되므로 맵에서 직접 삭제할 필요가 없습니다.
        panelToClose.dispose();
      }
    })
  );
}

export { openFileWithCorrectMode };
