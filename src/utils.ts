import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ReviewMap, state } from "./state";

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Git 설정에서 user.name을 가져옵니다.
 */
export function getGitUserName(): string {
  try {
    const output = execSync("git config user.name", { encoding: "utf-8" }).trim();
    return output;
  } catch (error) {
    console.warn("Git user.name 조회 실패:", error);
    return "";
  }
}

/**
 * 웹뷰의 Content Security Policy를 위한 nonce 값을 생성합니다.
 * @returns 무작위 영숫자 문자열.
 */
export function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * .review.json 파일을 읽고 파싱하여 ReviewMap 객체로 변환합니다.
 * @param workspaceRoot 워크스페이스 루트 경로
 * @returns 파일 경로를 키로 하는 ReviewMap 객체
 */
export function loadReviewJson(): ReviewMap {
  const reviewMap: ReviewMap = {};

  if (!fs.existsSync(state.reviewPath)) {
    return reviewMap;
  }

  try {
    const fileContent = fs.readFileSync(state.reviewPath, "utf-8");
    const reviews: any[] = JSON.parse(fileContent);

    for (const entry of reviews) {
      if (entry.path && entry.filename) {
        // "./" 로 시작하는 경로에서 "./" 제거
        const cleanedPath = entry.path.startsWith("./") ? entry.path.substring(2) : entry.path;
        // POSIX 통일 추가
        const posixPath = cleanedPath.replace(/\\/g, "/");
        const fullPath = toPosixPath(path.join(cleanedPath, entry.filename));
        reviewMap[fullPath] = entry;
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(`.review.json 파일을 읽거나 파싱하는 데 실패했습니다: ${error}`);
  }

  // console.log(`[loadReviewJson] Loaded keys:`, Object.keys(reviewMap));
  return reviewMap;
}
