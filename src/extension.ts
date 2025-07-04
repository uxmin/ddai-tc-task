import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { parseXlsxFile } from "./parseXlsxFile";
import { ReadonlyFileSystemProvider } from "./ReadonlyFileSystemProvider";
import { ReviewFileDecorationProvider, loadReviewJson } from "./reviewDecorationProvider";

const state = {
  workspaceRoot: "",
  allowedFiles: new Set<string>(),
  allowedFilesFromReviewJson: new Set<string>(),
  isChecking: false, // 무한 루프 방지 플래그
};

// JSON 파일 경로와 해당 파일에 연결된 웹뷰 패널을 저장하는 Map
const openReviewPanels = new Map<string, vscode.WebviewPanel>();
const forbiddenFiles = new Set<string>([
  ".review.json",
  ".gitignore",
  "generate.sh",
  "listup.sh",
  "merge_task_status.py",
  "merge-task-status.yml",
]);
const readonlyScheme = "readonly-file";

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "tc-task" is now active!');

  state.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  if (!state.workspaceRoot) return;

  const gitUser = getGitUserName();

  // 작업 제외 파일 추출
  const xlsxName = "workfile.xlsx";
  const xlsxPath = path.join(state.workspaceRoot, xlsxName);
  const parsedAllowedFiles = fs.existsSync(xlsxPath) ? parseXlsxFile(xlsxPath, gitUser) : [];
  state.allowedFiles = Array.isArray(parsedAllowedFiles) ? new Set<string>(parsedAllowedFiles) : parsedAllowedFiles;

  const reviewPath: string = path.join(state.workspaceRoot, ".review.json");
  const initialReviewMap = loadReviewJson(reviewPath, state.workspaceRoot);

  state.allowedFilesFromReviewJson = new Set<string>(Object.keys(initialReviewMap));

  const decorationProvider = new ReviewFileDecorationProvider(initialReviewMap, state.allowedFiles);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));
  decorationProvider["__forceRefresh"]?.();

  // ✅ .review.json 실시간 감지
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(state.workspaceRoot, ".review.json")
  );
  watcher.onDidChange(() => refreshReviewStatus(reviewPath, decorationProvider));
  watcher.onDidCreate(() => refreshReviewStatus(reviewPath, decorationProvider));
  watcher.onDidDelete(() => decorationProvider.updateReviewData({}));
  context.subscriptions.push(watcher);

  // ✅ workfile.xlsx 실시간 감지 (새로운 부분)
  const xlsxWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(state.workspaceRoot, xlsxName)
  );
  xlsxWatcher.onDidChange(() => {
    const updatedAllowedFiles = parseXlsxFile(xlsxPath, gitUser);
    decorationProvider.updateAllowedFiles(new Set<string>(updatedAllowedFiles));
    vscode.window.showInformationMessage(`'${xlsxName}' 파일이 업데이트되어 파일 허용 목록을 갱신했습니다.`, {
      modal: false,
    });
  });
  xlsxWatcher.onDidCreate(() => {
    const updatedAllowedFiles = parseXlsxFile(xlsxPath, gitUser);
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
        showStatusPanel(context, filePath, false);
      } else if (filePath) {
        vscode.window.showWarningMessage("The selected file is not a JSON file.", { modal: false });
      } else {
        vscode.window.showInformationMessage("No JSON file selected or open.", { modal: false });
      }
    })
  );

  vscode.workspace.onDidOpenTextDocument(async (document) => {
    // 이미 처리 중이거나, 우리 스킴이거나, 실제 파일이 아니면 무시
    if (state.isChecking || document.uri.scheme === readonlyScheme || document.uri.scheme !== "file") {
      return;
    }

    const filePath = document.uri.fsPath;
    const filename = path.basename(filePath);

    // 조건 1: 절대 금지 파일
    if (forbiddenFiles.has(filename)) {
      state.isChecking = true;
      vscode.window.showErrorMessage(`'${filename}' 파일은 절대 편집할 수 없습니다.`);
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      state.isChecking = false;
      return;
    }

    const relativePath = path.relative(state.workspaceRoot, filePath);
    let posixPath = relativePath.split(path.sep).join("/");
    if (posixPath.startsWith("workspace/")) {
      posixPath = posixPath.substring("workspace/".length);
    }

    // ✨ 조건 2: 할당되지 않은 리뷰 파일 (읽기 전용 대상)
    const isReadonly = state.allowedFilesFromReviewJson.has(posixPath) && !state.allowedFiles.has(posixPath);

    console.log("document.languageId:\t", document.languageId);
    console.log("filename:\t", filename);
    console.log("isReadonly:\t", isReadonly);
    console.log("posixPath:\t", posixPath);

    // 조건 3: 일반 JSON 파일 (웹뷰만 열기)
    // (isReadonly가 아닌 파일만 이 로직을 타게 됨)
    if (document.languageId === "json" && filename !== ".review.json") {
      state.isChecking = true;
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      await openFileWithCorrectMode(context, filePath);
      console.log("열림:", filePath);
      state.isChecking = false;
    }
  });

  // 1. ReadonlyFileSystemProvider 등록
  const readonlyProvider = new ReadonlyFileSystemProvider();
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(readonlyScheme, readonlyProvider, {
      isCaseSensitive: true,
      isReadonly: true,
    })
  );

  // 2. 파일 열기 로직을 처리하는 함수
  // 이 함수는 파일 경로를 받아 조건에 따라 적절한 모드로 파일을 엽니다.
  const openFileWithCorrectMode = async (context: vscode.ExtensionContext, filePath: string) => {
    // 상대 경로 및 POSIX 형식으로 변환 (사용자 코드와 동일)
    const relativePath = path.relative(state.workspaceRoot, filePath);
    let posixPath = relativePath.split(path.sep).join("/");
    if (posixPath.startsWith("workspace/")) {
      posixPath = posixPath.substring("workspace/".length);
    }

    // ✨ 핵심 조건부 로직 ✨
    const isReadonly = state.allowedFilesFromReviewJson.has(posixPath) && !state.allowedFiles.has(posixPath);

    if (isReadonly) {
      console.log(`[읽기 전용 모드]: ${posixPath}`);
      // file:// 스킴을 readonly-file:// 스킴으로 변경
      const targetUri = vscode.Uri.file(filePath).with({ scheme: readonlyScheme });
      // 1. 읽기 전용 에디터 열기
      await vscode.window.showTextDocument(targetUri, { preview: false, viewColumn: vscode.ViewColumn.One });
      // 2. ✨ 읽기 전용 웹뷰 함께 열기 ✨
      showStatusPanel(context, filePath, true);
    } else {
      console.log(`[편집 모드]: ${posixPath}`);
      // 일반 파일 스킴 사용
      const targetUri = vscode.Uri.file(filePath);
      // 1. 일반 에디터 열기
      await vscode.window.showTextDocument(targetUri, { preview: false, viewColumn: vscode.ViewColumn.One });
      // 2. ✨ 편집 가능 웹뷰 함께 열기 (파일이 JSON인 경우) ✨
      if (filePath.endsWith(".json")) {
        showStatusPanel(context, filePath, false);
      }
    }
  };

  // 3. 파일 열기를 트리거하는 커맨드 등록 (예시)
  // 예를 들어, 확장 기능의 TreeView 아이템을 클릭했을 때 이 커맨드를 호출할 수 있습니다.
  context.subscriptions.push(
    vscode.commands.registerCommand("myExtension.openFile", (filePath: string) => {
      openFileWithCorrectMode(context, filePath);
    })
  );

  // // JSON 문서 닫힐 때 패널도 닫기
  // context.subscriptions.push(
  //   vscode.workspace.onDidCloseTextDocument((document) => {
  //     const closedFilePath = document.uri.fsPath;
  //     // openReviewPanels 맵에서 해당 경로의 패널을 찾습니다.
  //     const panelToClose = openReviewPanels.get(closedFilePath);

  //     // 패널이 존재하면 닫습니다.
  //     if (panelToClose) {
  //       console.log(
  //         `[File Close -> Webview Close] JSON 파일 '${path.basename(closedFilePath)}'이(가) 닫혀 관련 웹뷰를 닫습니다.`
  //       );

  //       // onDidDispose가 자동으로 호출되므로 맵에서 직접 삭제할 필요가 없습니다.
  //       panelToClose.dispose();
  //     }
  //   })
  // );
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
 * @param isReadonly 패널을 읽기 전용 모드로 열지 여부.
 */
function showStatusPanel(context: vscode.ExtensionContext, filepath: string, isReadonly: boolean) {
  const columnToShowIn = vscode.ViewColumn.Beside; // 항상 옆에 표시

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
    columnToShowIn, // 현재 에디터 옆에 패널 표시
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

  const relativePath = path.relative(workspaceRootPath, filepath);
  const posixPath = relativePath.split(path.sep).join("/");
  // 'workspace/' 접두사 제거 로직을 보다 안전하게 수정
  const processedPath = posixPath.startsWith("workspace/") ? posixPath.substring("workspace/".length) : posixPath;
  const dirOnly = path.dirname(processedPath);
  const currentPath = `./${dirOnly}`;
  const filename = path.basename(filepath);
  const currentFileReview = existingReviews.find((entry) => entry.path === currentPath && entry.filename === filename);
  console.log("DEBUG: Calculated currentPath for review.json:", currentPath);

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
          `.review.json을 쓰는 데 실패했습니다: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  });

  // 웹뷰에 초기 데이터 전송 (DOM 로드 후 데이터 설정)
  // 웹뷰 스크립트에서 'initialData' 명령을 처리할 준비가 되어 있어야 함
  const gitUser = getGitUserName();
  panel.webview.postMessage({
    command: "initialData",
    gitUserName: gitUser,
    data: currentFileReview, // 기존 데이터가 없으면 undefined가 될 수 있음
    // ✨ isReadonly 상태도 함께 전달
    isReadonly: isReadonly,
  });
}

/**
 * 웹뷰의 HTML 콘텐츠를 생성합니다.
 * @param webview 웹뷰 인스턴스.
 * @param scriptUri 웹뷰의 JavaScript 파일 URI.
 * @param filename 검수 중인 JSON 파일의 기본 이름.
 * @param isReadonly 웹뷰를 읽기 전용으로 표시할지 여부.
 * @returns 웹뷰용 HTML 문자열.
 */
function getWebviewHtml(webview: vscode.Webview, scriptUri: vscode.Uri, filename: string, isReadonly: boolean): string {
  // Tip: Install the es6-string-html extension for syntax highlighting in backticks
  const nonce = getNonce(); // For Content Security Policy

  // isReadonly 값에 따라 body 클래스 결정
  const bodyClass = isReadonly ? "readonly-mode" : "";
  return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Review Panel</title>
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
					<style>
							body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                padding: 20px; 
              }
							label { 
                display: block; 
                margin-bottom: 8px;
                cursor: pointer; /* 클릭 가능 영역임을 표시 */
              }
							textarea { 
                width: 100%; 
                height: 100px; 
                margin-bottom: 10px; 
                padding: 8px; 
                box-sizing: border-box;
                border: 1px solid #ccc;
                border-radius: 4px;
              }
							button { 
                padding: 10px 15px; 
                background-color: #007acc; 
                color: white; 
                border: none; 
                cursor: pointer;
                border-radius: 4px;
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

              /* ✨ 읽기 전용 모드 스타일 ✨ */
              body.readonly-mode input,
              body.readonly-mode textarea,
              body.readonly-mode select, /* <select> 박스 추가 */
              body.readonly-mode button {
                pointer-events: none; /* 마우스 이벤트 차단 */
                background-color: #f0f0f0; /* 비활성화된 배경색 */
                opacity: 0.7; /* 반투명하게 만들어 비활성화 시각적 효과 강화 */
                color: #888; /* 텍스트 색상도 흐리게 */
                border-color: #ddd; /* 테두리 색상도 흐리게 */
              }
              body.readonly-mode label,
              body.readonly-mode button {
                cursor: not-allowed; /* 커서 모양 변경 */
              }
              body.readonly-mode button#save-button {
                display: none; /* 저장 버튼 숨기기 */
              }
					</style>
			</head>
			<body class="${bodyClass}">
					<h3>${filename}</h3>
					<label>
            <input type="checkbox" id="taskDone"> 작업 완료
            <span id="taskMeta" class="inline-meta"></span>
          </label>
					<textarea id="reporting" placeholder="특이사항 입력"></textarea>
          <label>
            <input type="checkbox" id="reviewDone"> 검수 완료
            <span id="reviewMeta" class="inline-meta"></span>
          </label>
					<textarea id="comment" placeholder="검수 코멘트 입력"></textarea>
					<button id="save-button" onclick="saveStatus()">저장</button>

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
