import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { parseXlsxFile } from "./parseXlsxFile";
import { ReviewFileDecorationProvider, loadReviewJson } from "./reviewDecorationProvider";

// JSON 파일 경로와 해당 파일에 연결된 웹뷰 패널을 저장하는 Map
const openReviewPanels = new Map<string, vscode.WebviewPanel>();

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "tc-task" is now active!');

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  // 작업 제외 파일 추출
  const xlsxName = "filename.xlsx";
  const xlsxPath = path.join(workspaceRoot, xlsxName);
  let allowedFiles = fs.existsSync(xlsxPath) ? parseXlsxFile(xlsxPath, workspaceRoot) : new Set<string>();
  if (Array.isArray(allowedFiles)) allowedFiles = new Set<string>(allowedFiles);

  const reviewPath: string = path.join(workspaceRoot, ".review.json");
  const initialReviewMap = loadReviewJson(reviewPath, workspaceRoot);

  const decorationProvider = new ReviewFileDecorationProvider(initialReviewMap, allowedFiles);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));
  decorationProvider["__forceRefresh"]?.();

  // ✅ .review.json 실시간 감지
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRoot, ".review.json"));
  watcher.onDidChange(() => refreshReviewStatus(reviewPath, decorationProvider));
  watcher.onDidCreate(() => refreshReviewStatus(reviewPath, decorationProvider));
  watcher.onDidDelete(() => decorationProvider.updateReviewData({}));
  context.subscriptions.push(watcher);

  // ✅ filename.xlsx 실시간 감지 (새로운 부분)
  const xlsxWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRoot, xlsxName));
  xlsxWatcher.onDidChange(() => {
    const updatedAllowedFiles = parseXlsxFile(xlsxPath, workspaceRoot);
    decorationProvider.updateAllowedFiles(new Set<string>(updatedAllowedFiles));
    vscode.window.showInformationMessage(`'${xlsxName}' 파일이 업데이트되어 파일 허용 목록을 갱신했습니다.`, {
      modal: false,
    });
  });
  xlsxWatcher.onDidCreate(() => {
    const updatedAllowedFiles = parseXlsxFile(xlsxPath, workspaceRoot);
    decorationProvider.updateAllowedFiles(new Set<string>(updatedAllowedFiles));
    vscode.window.showInformationMessage(`'${xlsxName}' 파일이 생성되어 파일 허용 목록을 로드했습니다.`, {
      modal: false,
    });
  });
  xlsxWatcher.onDidDelete(() => {
    decorationProvider.updateAllowedFiles(new Set<string>()); // 파일 삭제 시 목록 초기화
    vscode.window.showInformationMessage(`'${xlsxName}' 파일이 삭제되어 파일 허용 목록을 초기화했습니다.`, {
      modal: false,
    });
  });
  context.subscriptions.push(xlsxWatcher);

  // 파일 열기 명령어
  context.subscriptions.push(
    vscode.commands.registerCommand("extension.openReviewPanel", async (uri: vscode.Uri) => {
      let filePath: string | undefined;

      if (uri?.fsPath) {
        filePath = uri.fsPath;
      } else if (vscode.window.activeTextEditor?.document.languageId === "json") {
        filePath = vscode.window.activeTextEditor.document.uri.fsPath;
      } else {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          filters: { "JSON Files": ["json"] },
          title: "Select a JSON file to review",
        });
        filePath = picked?.[0]?.fsPath;
      }

      if (filePath && filePath.endsWith(".json")) {
        showStatusPanel(context, filePath);
      } else if (filePath) {
        vscode.window.showWarningMessage("The selected file is not a JSON file.", { modal: false });
      } else {
        vscode.window.showInformationMessage("No JSON file selected or open.", { modal: false });
      }
    })
  );

  // JSON 문서 열릴 때 자동 패널
  vscode.workspace.onDidOpenTextDocument((document) => {
    const filename = path.basename(document.uri.fsPath);
    if (document.languageId === "json" && filename !== ".review.json") {
      showStatusPanel(context, document.uri.fsPath);
      console.log("열림:", document.uri.fsPath);
    }
  });

  // JSON 문서 닫힐 때 패널도 닫기
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      const filePath = document.uri.fsPath;
      if (document.languageId === "json") {
        const panel = openReviewPanels.get(filePath);
        if (panel) {
          panel.dispose();
          openReviewPanels.delete(filePath);
          console.log(`Review panel for ${path.basename(filePath)} closed.`);
        }
      }
    })
  );
}

// ✅ .review.json 변경 시 리프레시
function refreshReviewStatus(reviewPath: string, decorationProvider: ReviewFileDecorationProvider) {
  const updatedReviewMap = loadReviewJson(reviewPath, "");
  decorationProvider.updateReviewData(updatedReviewMap);
}

/**
 * JSON 파일 검수용 웹뷰 패널을 생성하고 표시합니다.
 * @param context 확장 프로그램 컨텍스트.
 * @param filepath 검수할 JSON 파일의 전체 경로.
 */
function showStatusPanel(context: vscode.ExtensionContext, filepath: string) {
  // 이미 열려 있는 패널이 있는지 확인
  let panel = openReviewPanels.get(filepath);
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside); // 이미 열려 있으면 해당 패널을 활성화
    return; // 새 패널을 만들지 않고 종료
  }

  // 웹뷰 패널 생성 또는 가져오기
  // 각 JSON 파일마다 독립적인 패널이 열리도록 ensurePanelExists 대신 createWebviewPanel 사용
  panel = vscode.window.createWebviewPanel(
    "reviewPanel", // 패널 유형의 고유 식별자
    `Review: ${path.basename(filepath)}`, // 패널 제목
    vscode.ViewColumn.Beside, // 현재 에디터 옆에 패널 표시
    { enableScripts: true } // 웹뷰에서 JavaScript 활성화
  );
  openReviewPanels.set(filepath, panel);

  // 패널이 닫힐 때 Map에서 제거 (사용자가 직접 닫았을 경우)
  panel.onDidDispose(
    () => {
      openReviewPanels.delete(filepath);
      console.log(`Review panel for ${path.basename(filepath)} disposed by user.`);
    },
    null,
    context.subscriptions
  );

  // 웹뷰의 JavaScript 파일 URI 가져오기
  const scriptPath = vscode.Uri.joinPath(context.extensionUri, "media", "webview.js");
  const scriptUri = panel.webview.asWebviewUri(scriptPath);

  // 웹뷰에 HTML 콘텐츠 설정
  panel.webview.html = getWebviewHtml(panel.webview, scriptUri, path.basename(filepath));

  // 1. 기존 검수 상태 로드 및 웹뷰에 전송
  const workspaceRootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRootPath) {
    vscode.window.showErrorMessage("워크스페이스 루트 경로를 찾을 수 없습니다. .review.json을 저장할 수 없습니다.");
    return;
  }

  const reviewPath = path.join(workspaceRootPath, `.review.json`);

  let existingReviews: any[] = [];
  if (fs.existsSync(reviewPath)) {
    try {
      const fileContent = fs.readFileSync(reviewPath, "utf-8");
      existingReviews = JSON.parse(fileContent);
    } catch (error) {
      vscode.window.showErrorMessage(
        `.review.json을 읽거나 파싱하는 데 실패했습니다: ${error instanceof Error ? error.message : String(error)}`
      );
      // 읽기 실패 시 빈 상태로 시작
    }
  }

  const fullPath = filepath;
  const filename = path.basename(fullPath);
  const relativePath = path.relative(workspaceRootPath, fullPath); // 예: "workspace/llm-finetuning-data/ko-KR/..."
  const pathSegments = relativePath.split(path.sep);

  let processedPath = "";
  // 2. 경로 세그먼트가 최소 1개 이상일 때만 처리합니다.
  // (첫 번째 'workspace'만 건너뛰기 위함)
  if (pathSegments.length >= 1) {
    // 3. 인덱스 1부터의 세그먼트만 사용하여 새로운 경로를 생성합니다.
    // 즉, 'workspace' (인덱스 0)만 제거합니다.
    const desiredSegments = pathSegments.slice(1);
    processedPath = desiredSegments.join(path.sep);
  } else {
    // 세그먼트가 없으면 빈 문자열 또는 에러 처리할 수 있습니다.
    processedPath = "";
  }

  const dirOnly = path.dirname(processedPath);
  const currentPath = `./${dirOnly.replace(/\\/g, "/")}`;
  const currentFileReview = existingReviews.find((entry) => entry.path === currentPath && entry.filename === filename);
  console.log("DEBUG: Calculated currentPath for review.json:", currentPath);

  // 웹뷰에서 확장 프로그램으로 전송된 메시지 처리
  panel.webview.onDidReceiveMessage(async (message) => {
    console.log("📥 웹뷰 메시지 수신:", message);

    // 메시지가 "saveStatus" 명령인지 확인
    if (message.command === "saveStatus") {
      const now = new Date().toISOString();
      const hasNotice = !!message.notice?.trim();
      const hasReviewComment = !!message.review_comment?.trim();

      // 이전 값과 비교해서 상태 변경 여부 판단
      const isTaskChanged = message.task_done !== currentFileReview?.task_done;
      const isNoticeChanged = message.notice !== currentFileReview?.notice;
      const isReviewChanged = message.review_done !== currentFileReview?.review_done;
      const isCommentChanged = message.review_comment !== currentFileReview?.review_comment;

      const newStatus: any = {
        path: currentPath,
        filename: path.basename(filepath),
        task_done: message.task_done,
        notice: message.notice,
        tasked_by: "",
        tasked_at:
          message.task_done || hasNotice
            ? isTaskChanged || isNoticeChanged
              ? now
              : currentFileReview?.tasked_at || ""
            : currentFileReview?.tasked_at || "",
        review_done: message.review_done,
        review_comment: message.review_comment,
        reviewed_by: "",
        reviewed_at:
          message.review_done || hasReviewComment
            ? isReviewChanged || isCommentChanged
              ? now
              : currentFileReview?.reviewed_at || ""
            : currentFileReview?.reviewed_at || "",
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
        fs.writeFileSync(reviewPath, JSON.stringify(existingReviews, null, 2));
        vscode.window.showInformationMessage(`Review status for ${path.basename(filepath)} saved successfully.`);
        // ✅ JSON 탭 닫기 시도
        const normalizedFilepath = path.resolve(filepath);
        const targetEditor = vscode.window.visibleTextEditors.find((editor) => {
          const editorPath = path.resolve(editor.document.uri.fsPath);
          return editorPath === normalizedFilepath;
        });

        if (targetEditor) {
          const document = targetEditor.document;
          const viewColumn = targetEditor.viewColumn;
          await vscode.window.showTextDocument(document, viewColumn);
          await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        } else {
          console.warn("JSON 파일 탭을 닫지 못했습니다: 열려 있는 에디터에서 찾지 못함");
        }
        // 웹뷰 닫기
        panel.dispose();
      } catch (error) {
        vscode.window.showErrorMessage(
          `.review.json을 쓰는 데 실패했습니다: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  });

  const gitUser = getGitUserName();

  // 웹뷰에 초기 데이터 전송 (DOM 로드 후 데이터 설정)
  // 웹뷰 스크립트에서 'initialData' 명령을 처리할 준비가 되어 있어야 함
  panel.webview.postMessage({
    command: "initialData",
    gitUserName: gitUser,
    data: currentFileReview, // 기존 데이터가 없으면 undefined가 될 수 있음
  });
}

/**
 * 웹뷰의 HTML 콘텐츠를 생성합니다.
 * @param webview 웹뷰 인스턴스.
 * @param scriptUri 웹뷰의 JavaScript 파일 URI.
 * @param filename 검수 중인 JSON 파일의 기본 이름.
 * @returns 웹뷰용 HTML 문자열.
 */
function getWebviewHtml(webview: vscode.Webview, scriptUri: vscode.Uri, filename: string): string {
  // Tip: Install the es6-string-html extension for syntax highlighting in backticks
  const nonce = getNonce(); // For Content Security Policy

  return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Review Panel</title>
					<meta http-equiv="Content-Security-Policy" 
                content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
					<style>
							body { 
                font-family: sans-serif; 
                padding: 20px; 
              }
							label { 
                display: block; 
                margin-bottom: 8px; 
              }
							textarea { 
                width: 100%; 
                height: 100px; 
                margin-bottom: 10px; 
                padding: 8px; 
                box-sizing: border-box; 
              }
							button { 
                padding: 10px 15px; 
                background-color: #007acc; 
                color: white; 
                border: none; 
                cursor: pointer; 
              }
							button:hover { 
                background-color: #005f99; 
              }

              .inline-meta {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin-left: 8px;
              }

              .badge {
                background-color: #007acc;
                color: white;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 0.85em;
                font-weight: bold;
              }

              .meta-time {
                font-size: 0.8em;
                color: #888;
              }
					</style>
			</head>
			<body>
					<h3>${filename}</h3>
					<label>
            <input type="checkbox" id="taskDone"> 작업 완료
            <span id="taskMeta"></span>
          </label>
					<textarea id="notice" placeholder="작업 코멘트 입력 (특이사항 등)"></textarea>
          <label>
            <input type="checkbox" id="reviewDone"> 검수 완료
            <span id="reviewMeta"></span>
          </label>
					<textarea id="comment" placeholder="검수 코멘트 입력"></textarea>
					<button onclick="saveStatus()">저장</button>

					<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>
	`;
}

/**
 * Content Security Policy를 위한 논스로 사용될 무작위 문자열을 생성합니다.
 * @returns 무작위 영숫자 문자열.
 */
function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function getGitUserName(): string {
  try {
    const output = execSync("git config user.name", { encoding: "utf-8" }).trim();
    return output;
  } catch (error) {
    console.warn("Git user.name 조회 실패:", error);
    return "";
  }
}

// 이 메서드는 확장 프로그램이 비활성화될 때 호출됩니다.
export function deactivate() {}
