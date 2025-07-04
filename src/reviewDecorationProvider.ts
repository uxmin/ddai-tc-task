import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface FolderReviewStatus {
  path: string;
  task_done: boolean;
  tasked_by: string;
  tasked_at?: string; // 없을 수도 있음
  review_done: boolean;
  review_comment?: string; // 없을 수도 있음
  reviewed_by: string;
  reviewed_at?: string; // 없을 수도 있음
  reporting?: string;
}
export type ReviewMap = Record<string, FolderReviewStatus>;

export function loadReviewJson(file: string, root: string): Record<string, FolderReviewStatus> {
  if (!fs.existsSync(file)) {
    console.warn(`[loadReviewJson] File not found: ${file}`);
    return {};
  }

  let raw: any[];
  try {
    const content = fs.readFileSync(file, "utf8");
    raw = JSON.parse(content);
    console.log(`[loadReviewJson] Successfully parsed ${Object.keys(raw).length} raw entries from ${file}`);
  } catch (error) {
    console.error(`[loadReviewJson] Error parsing JSON from ${file}:`, error);
    return {}; // 파싱 실패 시 빈 객체 반환
  }
  const fixed: Record<string, FolderReviewStatus> = {};

  for (const item of raw) {
    // path와 filename 조합으로 키 구성
    let rawPath = item.path.replace(/\\/g, "/"); // OS 상관없이 슬래시 통일

    // './' 접두어 제거
    if (rawPath.startsWith("./")) {
      rawPath = rawPath.slice(2);
    }

    const key = `${rawPath}/${item.filename}`;
    fixed[key] = item as FolderReviewStatus;
  }

  console.log(`[loadReviewJson] Final fixed review map contains ${Object.keys(fixed).length} entries.`);
  return fixed;
}

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

export class ReviewFileDecorationProvider implements vscode.FileDecorationProvider {
  private reviewData: Record<string, FolderReviewStatus> = {}; // .review.json 데이터
  private allowedFiles: Set<string> = new Set(); // filename.xlsx에서 읽어온 허용 파일 목록

  private _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined> =
    new vscode.EventEmitter();
  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[] | undefined> =
    this._onDidChangeFileDecorations.event;

  constructor(initialData: Record<string, any>, allowedFiles: Set<string>) {
    this.reviewData = initialData;
    this.allowedFiles = allowedFiles;
  }

  public __forceRefresh() {
    // undefined 를 넘기면 “전체”를 다시 그려 달라는 의미
    this._onDidChangeFileDecorations.fire(undefined);
  }

  updateReviewData(newData: Record<string, FolderReviewStatus>) {
    this.reviewData = newData;
    this._onDidChangeFileDecorations.fire(undefined); // 전체 업데이트
  }
  updateAllowedFiles(newAllowed: Set<string>) {
    this.allowedFiles = newAllowed;
    this._onDidChangeFileDecorations.fire(undefined);
  }

  /**
   * 현재 reviewData의 스냅샷을 반환합니다.
   * 이 데이터는 `.review.json` 파일의 내용을 파싱하여 생성된,
   * 파일 상대 경로(예: "llm-finetuning-data/ko-KR/train/NABL/calendar-app/TC_....json")를 키로 하는 객체입니다.
   * @returns 현재 검수 데이터 맵 (Record<string, any> 형태)
   */
  public getReviewData(): Record<string, any> {
    // FolderReviewStatus 대신 any로 임시 설정
    // reviewData 객체의 복사본을 반환하여 외부에서 직접 수정하는 것을 방지할 수 있습니다.
    // 하지만 현재 사용 사례에서는 직접 수정하는 것이 아니라 조회만 하므로 얕은 복사본도 충분합니다.
    return { ...this.reviewData };
  }

  /**
   * URI가 디렉토리인지 확인
   * @param uri 확인할 URI
   * @returns 디렉토리면 true, 아니면 false
   */
  private isDirectory(uri: vscode.Uri): boolean {
    try {
      return fs.lstatSync(uri.fsPath).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 주어진 폴더 경로에 allowedFiles에 포함된 JSON 파일이 하나라도 있는지 확인
   * @param folderPath 확인할 폴더의 절대 경로
   * @returns 할당된 JSON 파일이 하나라도 있으면 true
   */
  private checkIfFolderHasForbiddenFiles(folderPath: string, workspaceRoot: string): boolean {
    try {
      const filesInFolder = fs.readdirSync(folderPath);
      for (const file of filesInFolder) {
        const fullFilePath = path.join(folderPath, file);
        const stat = fs.lstatSync(fullFilePath);
        if (stat.isFile() && file.endsWith(".json") && file !== ".review.json" && this.allowedFiles.has(file)) {
          // 현재 파일의 workspace 기준 상대경로 만들기
          const relativePath = path.relative(workspaceRoot, fullFilePath);

          // 항상 POSIX 스타일로 통일
          const posixPath = relativePath.split(path.sep).join("/");

          if (this.allowedFiles.has(posixPath)) {
            return true; // 할당된 파일이 존재
          }
        }
      }
      return false;
    } catch (e) {
      console.error(`Error checking folder for forbidden files: ${e}`);
      return false;
    }
  }

  provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.FileDecoration | undefined {
    // 1. 현재 워크스페이스 폴더의 URI를 가져옵니다.
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      // 워크스페이스에 속하지 않는 파일은 데코레이션하지 않습니다.
      return undefined;
    }

    // 2. VS Code URI에서 파일 시스템 경로 (fsPath)를 얻습니다.
    //    (예: "/Users/youruser/projects/myproject/workspace/llm-finetuning-data/...")
    const filePath = uri.fsPath;
    const filename = path.basename(filePath);

    // 3. 워크스페이스 루트를 기준으로 파일의 상대 경로를 얻습니다.
    //    path.relative는 OS에 맞는 경로 구분자를 사용합니다.
    //    (예: "workspace/llm-finetuning-data/ko-KR/train/NABL/calendar-app/TC_samsung_calendarApp_single_intent_0009.i18n.json")
    const relativePathFromWorkspaceRoot = path.relative(workspaceFolder.uri.fsPath, filePath);

    // 4. 이 상대 경로를 `reviewMap` 키 형식에 맞게 변환합니다.
    //    "workspace/" 부분을 제거해야 합니다.
    const pathSegments = relativePathFromWorkspaceRoot.split(path.sep);
    let keyToLookup = "";

    if (pathSegments.length >= 1) {
      // 'workspace'만 건너뛰고 나머지 세그먼트를 사용합니다.
      const desiredSegments = pathSegments.slice(1);
      keyToLookup = desiredSegments.join("/");
    } else {
      // 경로가 너무 짧으면 매칭할 수 없습니다.
      return undefined;
    }

    // 5. 생성된 keyToLookup으로 reviewData(reviewMap)를 조회합니다.
    const reviewEntry = this.reviewData[keyToLookup];

    // 💡 디버깅을 위해 추가
    // console.log(`[provideFileDecoration] URI: ${filePath}`);
    // console.log(`[provideFileDecoration] Relative from Root: ${relativePathFromWorkspaceRoot}`);
    // console.log(`[provideFileDecoration] Key to Lookup: ${keyToLookup}`);
    // console.log(`[provideFileDecoration] Found Entry:`, reviewEntry ? "Yes" : "No");

    // Folder Deco
    if (this.isDirectory(uri)) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (!workspaceFolder) return undefined;

      const hasForbiddenFile = this.checkIfFolderHasForbiddenFiles(filePath, workspaceFolder.uri.fsPath);
      if (hasForbiddenFile) {
        return {
          // badge: "⚠️",
          tooltip: "할당된 작업 파일 포함됨",
          color: new vscode.ThemeColor("charts.purple"),
        };
      }
      return undefined;
    }

    // File Deco
    if (!filename.endsWith(".json") || filename === ".review.json") {
      return; // 데코레이션 없음
    }

    if (!this.allowedFiles.has(toPosixPath(keyToLookup))) {
      return {
        badge: "⛔",
        tooltip: "할당되지 않은 파일",
        color: new vscode.ThemeColor("descriptionForeground"),
      };
    }

    if (!reviewEntry) {
      return {
        badge: "◌",
        tooltip: "작업 대기 (미시작)",
      };
    }

    const { task_done, review_done, review_comment, reporting } = reviewEntry;
    const isReportingEmpty = !(reporting ?? "");
    const isReviewCommentEmpty = !(review_comment ?? "");

    if (!task_done && isReportingEmpty && !review_done && isReviewCommentEmpty) {
      return {
        badge: "◌",
        tooltip: "작업 대기 (미시작)",
      };
    } else if (task_done && isReportingEmpty && !review_done && isReviewCommentEmpty) {
      return {
        badge: "T",
        color: new vscode.ThemeColor("charts.yellow"),
        tooltip: "작업 완료 (검수 미완)",
      };
    } else if (task_done && !isReportingEmpty && !review_done && isReviewCommentEmpty) {
      return {
        badge: "T!",
        color: new vscode.ThemeColor("charts.orange"),
        tooltip: "작업 완료, 특이사항 있음 (검수 대기)",
      };
    } else if (task_done && review_done && isReviewCommentEmpty) {
      return {
        badge: "✓",
        color: new vscode.ThemeColor("charts.green"),
        tooltip: "작업 및 검수 완료",
      };
    } else if (task_done && review_done && !isReviewCommentEmpty) {
      return {
        badge: "💬",
        color: new vscode.ThemeColor("charts.blue"),
        tooltip: "작업 및 검수 완료 (코멘트 있음)",
      };
    } else {
      return {
        badge: "❌",
        tooltip: "상태 오류 (순차적이지 않음)",
        color: new vscode.ThemeColor("charts.red"),
      };
    }
  }
}
