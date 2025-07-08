// 상태 관리
import * as vscode from "vscode";

// review.json 항목의 타입 정의
export interface ReviewStatus {
  path: string;
  filename: string;
  task_done: boolean;
  tasked_by: string;
  tasked_at?: string;
  review_done: boolean;
  reviewed_by: string;
  reviewed_at?: string;
  comment?: string;
  reporting?: string;
}

// 파일 경로를 키로 가지는 리뷰 데이터 맵 타입
export type ReviewMap = Record<string, ReviewStatus>;

export interface ExtensionState {
  workspaceRoot: string;
  allowedFiles: Set<string>;
  allowedFilesFromReviewJson: Set<string>;
  isChecking: boolean; // 무한 루프 방지 플래그
}

export const state: ExtensionState = {
  workspaceRoot: "",
  allowedFiles: new Set<string>(),
  allowedFilesFromReviewJson: new Set<string>(),
  isChecking: false,
};

// 열려 있는 웹뷰 패널을 관리하는 Map (웹뷰 관리자에서만 직접 사용)
// 다른 모듈에서는 이 Map에 직접 접근하지 않습니다.
export const openReviewPanels = new Map<string, vscode.WebviewPanel>();

// 활성화 된 뷰 학인
export let previouslyVisibleJsonFiles: Set<string> = new Set();

export const FORBIDDEN_FILES = new Set<string>([
  ".review.json",
  ".gitignore",
  "generate.sh",
  "listup.sh",
  "merge_task_status.py",
  "merge-task-status.yml",
]);

export const READONLY_SCHEME = "readonly-file";
export const XLSX_FILENAME = "workfile.xlsx";
export const REVIEW_JSON_FILENAME = ".review.json";
