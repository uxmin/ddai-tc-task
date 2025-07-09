import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { openReviewPanels, REVIEW_JSON_FILENAME, state } from "../state";
import { loadReviewJson } from "../utils";
import { normalizePath } from "../utils/pathUtils";
import { getWebviewHtml } from "./getWebviewHtml";

/**
 * JSON 파일 검수용 웹뷰 패널을 생성하고 표시합니다.
 * @param context 확장 프로그램 컨텍스트.
 * @param filepath 검수할 JSON 파일의 전체 경로.
 * @param isReadonly 패널을 읽기 전용 모드로 열지 여부.
 */
export function showStatusPanel(context: vscode.ExtensionContext, filepath: string, isReadonly: boolean) {
  // 작업 파일 대상이 아닌 경우에는 패널을 열지 않음
  const relativePath = normalizePath(state.workspaceRoot, filepath);
  if (!state.allowedFilesFromReviewJson.has(relativePath)) {
    return;
  }

  // 이미 열려 있는 패널이 있는지 확인
  let panel = openReviewPanels.get(filepath);
  if (panel) {
    // 이미 열려 있으면 해당 패널을 활성화
    panel.reveal(vscode.ViewColumn.Beside);
    // ✨ 이미 열린 패널에 읽기 전용 상태 업데이트 메시지 전송
    panel.webview.postMessage({ command: "setReadOnly", value: isReadonly });
    // 새 패널을 만들지 않고 종료
    return;
  }

  // 웹뷰 패널 생성 또는 가져오기
  // 각 JSON 파일마다 독립적인 패널이 열리도록 ensurePanelExists 대신 createWebviewPanel 사용
  panel = vscode.window.createWebviewPanel(
    "reviewPanel", // 패널 유형의 고유 식별자
    `Review: ${path.basename(filepath)}`, // 패널 제목
    vscode.ViewColumn.Beside, // 현재 에디터 옆에 패널 표시
    { enableScripts: true, retainContextWhenHidden: true } // 스크립트 활성화 및 상태 유지
  );
  openReviewPanels.set(filepath, panel);

  // 패널이 닫힐 때 Map에서 제거 (사용자가 직접 닫았을 경우)
  panel.onDidDispose(
    async () => {
      // 1. 맵에서 자기 자신을 제거합니다.
      openReviewPanels.delete(filepath);
      console.log(`[Webview Close] 웹뷰 패널이 닫혔습니다: ${path.basename(filepath)}`);

      // 2. 이 웹뷰와 연결된 텍스트 에디터를 찾습니다.
      const targetEditor = vscode.window.visibleTextEditors.find((editor) => editor.document.uri.fsPath === filepath);

      // 3. 에디터가 화면에 보이면 닫습니다.
      if (targetEditor) {
        console.log(`[Webview Close -> File Close] 관련 JSON 파일 '${path.basename(filepath)}'을(를) 닫습니다.`);

        // VS Code 1.63 이상에서는 아래와 같이 간단하게 닫을 수 있습니다.
        // 이는 에디터를 닫는 가장 안정적인 방법입니다.
        await vscode.window.showTextDocument(targetEditor.document, {
          viewColumn: targetEditor.viewColumn,
          preserveFocus: false, // 포커스를 주지 않음
        });
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      }
    },
    null,
    context.subscriptions
  );

  // 웹뷰의 JavaScript 파일 URI 가져오기
  const scriptPath = vscode.Uri.joinPath(context.extensionUri, "media", "webview.js");
  const scriptUri = panel.webview.asWebviewUri(scriptPath);

  // 웹뷰에 HTML 콘텐츠 설정
  panel.webview.html = getWebviewHtml(panel.webview, scriptUri, path.basename(filepath), isReadonly);

  // 1. 기존 검수 상태 로드 및 웹뷰에 전송
  const workspaceRootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRootPath) {
    vscode.window.showErrorMessage(
      `워크스페이스 루트 경로를 찾을 수 없습니다. ${REVIEW_JSON_FILENAME}을 저장할 수 없습니다.`
    );
    return;
  }

  let existingReviews: any[] = [];
  if (fs.existsSync(state.reviewPath)) {
    try {
      const fileContent = fs.readFileSync(state.reviewPath, "utf-8");
      existingReviews = JSON.parse(fileContent);
    } catch (error) {
      vscode.window.showErrorMessage(
        `${REVIEW_JSON_FILENAME}을 읽거나 파싱하는 데 실패했습니다: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // 읽기 실패 시 빈 상태로 시작
    }
  }

  const reviewMap = loadReviewJson();
  const processedPath = normalizePath(workspaceRootPath, filepath);
  const currentFileReview = reviewMap[processedPath];
  const currentPath = `./${path.dirname(processedPath)}`;

  console.log(`DEBUG: Calculated currentPath for ${REVIEW_JSON_FILENAME}`);

  // 웹뷰에서 확장 프로그램으로 전송된 메시지 처리
  panel.webview.onDidReceiveMessage(async (message) => {
    console.log("📥 웹뷰 메시지 수신:", message);

    // 메시지가 "saveStatus" 명령인지 확인
    if (message.command === "saveStatus") {
      // ✨ 읽기 전용 모드일 경우 저장 로직을 실행하지 않음
      if (isReadonly) {
        vscode.window.showWarningMessage("이 파일은 할당되지 않아 저장할 수 없습니다.");
        return;
      }

      const now = new Date().toISOString();

      // 이전 값과 비교해서 상태 변경 여부 판단
      const isTaskChanged = message.task_done !== currentFileReview?.task_done;
      const isReviewChanged = message.review_done !== currentFileReview?.review_done;

      const newStatus: any = {
        path: currentPath,
        filename: path.basename(filepath),

        task_done: message.task_done,
        tasked_by: (() => {
          if (message.task_done) {
            return currentFileReview?.tasked_by || "";
          }
          return "";
        })(),
        tasked_at: (() => {
          if (!message.task_done) {
            return "";
          }
          if (isTaskChanged && message.task_done) {
            return now;
          }
          return currentFileReview?.tasked_at || "";
        })(),

        review_done: message.review_done,
        reviewed_by: (() => {
          if (message.review_done) {
            return currentFileReview?.reviewed_by || "";
          }
          return "";
        })(),
        reviewed_at: (() => {
          if (!message.review_done) {
            return "";
          }
          if (isReviewChanged && message.review_done) {
            return now;
          }
          return currentFileReview?.reviewed_at || "";
        })(),

        comment: message.comment,
        reporting: message.reporting,
      };

      const existingIndex = existingReviews.findIndex(
        (entry) => entry.path === newStatus.path && entry.filename === newStatus.filename
      );
      if (existingIndex !== -1) {
        // 기존 항목이 있으면 해당 위치에서 업데이트
        existingReviews[existingIndex] = newStatus;
      } else {
        existingReviews.push(newStatus);
      }

      try {
        fs.writeFileSync(state.reviewPath, JSON.stringify(existingReviews, null, 2));
        vscode.window.showInformationMessage(`Review status for ${path.basename(filepath)} saved successfully.`);

        // ✅ JSON 탭 닫기 시도
        const normalizedFilepath = path.resolve(filepath);
        const targetEditor = vscode.window.visibleTextEditors.find((editor) => {
          const editorPath = path.resolve(editor.document.uri.fsPath);
          return editorPath === normalizedFilepath;
        });

        if (targetEditor) {
          const document = targetEditor.document;
          if (document.isDirty) {
            await document.save(); // 💾 변경사항 저장
          }
          await vscode.window.showTextDocument(document, targetEditor.viewColumn);
          await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        } else {
          console.warn("JSON 파일 탭을 닫지 못했습니다: 열려 있는 에디터에서 찾지 못함");
        }
        // 웹뷰 닫기
        panel.dispose();
      } catch (error) {
        vscode.window.showErrorMessage(
          `${REVIEW_JSON_FILENAME}을 쓰는 데 실패했습니다: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  });

  // 웹뷰에 초기 데이터 전송 (DOM 로드 후 데이터 설정)
  // 웹뷰 스크립트에서 'initialData' 명령을 처리할 준비가 되어 있어야 함
  panel.webview.postMessage({
    command: "initialData",
    gitUserName: state.gitUser,
    data: currentFileReview, // 기존 데이터가 없으면 undefined가 될 수 있음
    isReadonly: isReadonly,
  });
}
