import * as path from "path";
import * as vscode from "vscode";
import { parseXlsxFile } from "../parsers/xlsxParser";
import { REVIEW_JSON_FILENAME, ReviewMap, WORK_EXT } from "../state";
import { loadReviewJson, toPosixPath } from "../utils";
import { normalizePath } from "../utils/pathUtils";

export class ReviewFileDecorationProvider implements vscode.FileDecorationProvider {
  private reviewData: ReviewMap = {};
  private allowedFiles: Set<string> = new Set(); // filename.xlsx에서 읽어온 허용 파일 목록

  private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  constructor(initialData: ReviewMap, allowedFiles: Set<string>) {
    this.reviewData = initialData;
    this.allowedFiles = allowedFiles;
  }

  public __forceRefresh() {
    // undefined 를 넘기면 “전체”를 다시 그려 달라는 의미
    this._onDidChangeFileDecorations.fire(undefined);
  }

  updateReviewData(newData: ReviewMap) {
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
    // reviewData 객체의 복사본을 반환하여 외부에서 직접 수정하는 것을 방지할 수 있습니다.
    // 하지만 현재 사용 사례에서는 직접 수정하는 것이 아니라 조회만 하므로 얕은 복사본도 충분합니다.
    return { ...this.reviewData };
  }

  /**
   * ✨ [수정] 데코레이션을 새로고침하는 공식 메서드
   * 최신 데이터를 다시 로드하고 UI 변경을 트리거합니다.
   */
  public refresh(): void {
    // 1. 최신 데이터 다시 로드
    const newReviewMap = loadReviewJson();
    // 현재 state.gitUser를 기반으로 허용된 파일 목록을 다시 파싱합니다.
    const newAllowedFiles = new Set(parseXlsxFile());

    // 2. 내부 상태 업데이트
    this.reviewData = newReviewMap;
    this.allowedFiles = newAllowedFiles;

    // 3. VS Code에 전체 UI를 다시 그려달라고 알림
    this._onDidChangeFileDecorations.fire(undefined);
  }

  provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.FileDecoration | undefined {
    // 1. 현재 워크스페이스 폴더의 URI를 가져옵니다.
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      // 워크스페이스에 속하지 않는 파일은 데코레이션하지 않습니다.
      return undefined;
    }

    const filePath = uri.fsPath;
    const filename = path.basename(filePath);
    const keyToLookup = normalizePath(workspaceFolder.uri.fsPath, filePath);

    // 5. 생성된 keyToLookup으로 reviewData(reviewMap)를 조회합니다.
    const reviewEntry = this.reviewData[keyToLookup];

    // 💡 디버깅을 위해 추가
    // console.log(`[provideFileDecoration] URI: ${filePath}`);
    // console.log(`[provideFileDecoration] Key to Lookup: ${keyToLookup}`);
    // console.log(`[provideFileDecoration] Found Entry:`, reviewEntry ? "Yes" : "No");

    // File Deco
    if (!filename.endsWith(`.${WORK_EXT}`) || filename === REVIEW_JSON_FILENAME) {
      return undefined; // 데코레이션 없음
    }

    if (!reviewEntry) {
      // .review.json에 등록된 파일이 아니면 아무 데코레이션도 하지 않음
      return undefined;
    }

    // 4. ✨ 이제 리뷰 대상 파일임이 확실하므로, 사용자에게 할당되었는지 확인
    if (!this.allowedFiles.has(toPosixPath(keyToLookup))) {
      return {
        badge: "⛔",
        tooltip: "할당되지 않은 파일",
        color: new vscode.ThemeColor("descriptionForeground"),
      };
    }

    const { task_done, review_done, comment, reporting, daily } = reviewEntry;
    const isReportingEmpty = !(reporting ?? "");
    const isCommentEmpty = !(comment ?? "");

    let mainBadge: string;
    let mainTooltip: string;
    let mainColor: vscode.ThemeColor | undefined = undefined;

    if (daily) {
      return {
        badge: "✅",
        tooltip: "납품 완료",
        color: new vscode.ThemeColor("charts.green"),
      };
    }

    if (!task_done && !review_done) {
      mainBadge = "◌";
      mainTooltip = "작업 대기 (미시작)";
    } else if (task_done && !review_done) {
      mainBadge = "T";
      mainTooltip = "작업 완료 (검수 미완)";
      mainColor = new vscode.ThemeColor("gitDecoration.modifiedResourceForeground");
    } else if (task_done && review_done) {
      mainBadge = "✓";
      mainTooltip = "작업 및 검수 완료";
      mainColor = new vscode.ThemeColor("charts.yellow");
    } else {
      mainBadge = "✘";
      mainTooltip = "상태 오류 (순차적이지 않음)";
      mainColor = new vscode.ThemeColor("charts.red");
    }

    let flags = "";
    if (!isCommentEmpty || !isReportingEmpty) {
      flags += "💬";
    }

    return {
      badge: `${mainBadge}${flags}`,
      tooltip: `${mainTooltip}${!isCommentEmpty ? " (코멘트 있음)" : ""}${!isReportingEmpty ? " (리포팅 있음)" : ""}`,
      color: mainColor,
    };
  }
}
