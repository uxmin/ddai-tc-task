// .review.json 로드/업데이트
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { REVIEW_JSON_FILENAME, ReviewMap } from "../state";

interface ReviewEntry {
  path: string;
  filename: string;
  // ... 나머지 필드들
  [key: string]: any; // 다른 필드들도 허용
}

export function loadReviewJsonAsMap(jsonPath: string): ReviewMap {
  const result: ReviewMap = {};

  if (!fs.existsSync(jsonPath)) {
    return result;
  }

  try {
    const rawArray = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as any[];

    for (const entry of rawArray) {
      if (!entry.path || !entry.filename) {
        continue;
      }

      const fullKey = path.posix.join(entry.path.replace(/^\.\/?/, ""), entry.filename);
      result[fullKey] = {
        path: entry.path,
        filename: entry.filename,
        task_done: entry.task_done,
        tasked_by: entry.tasked_by,
        tasked_at: entry.tasked_at,
        review_done: entry.review_done,
        reviewed_by: entry.reviewed_by,
        reviewed_at: entry.reviewed_at,
        comment: entry.comment,
      };
    }
  } catch (err) {
    console.error(`${REVIEW_JSON_FILENAME} 파싱 실패: ${err}`);
  }

  return result;
}

function safeJsonParse<T>(jsonString: string): T | null {
  try {
    return JSON.parse(jsonString) as T;
  } catch (e) {
    console.error("JSON 파싱 오류:", e);
    return null;
  }
}

export async function mergeReviewFiles(rootReviewPath: string, resultReviewPath: string) {
  // 1. 소스 파일(result/.review.json)이 없으면 아무것도 하지 않음
  if (!fs.existsSync(resultReviewPath)) {
    console.log("소스 리뷰 파일(result/.review.json)이 없어 병합/복사 작업을 건너뜁니다.");
    return;
  }

  // 3. 대상 파일(루트의 .review.json)이 없는 경우 -> 소스 파일을 그대로 복사
  if (!fs.existsSync(rootReviewPath)) {
    console.log(".review.json 파일이 없어 result/.review.json을 복사합니다.");
    await fs.promises.copyFile(resultReviewPath, rootReviewPath);
    console.log("리뷰 파일 복사 완료.");
    return;
  }

  // 2. 대상 파일이 존재하는 경우 -> ✨ 올바른 병합 로직 실행
  try {
    console.log("기존 .review.json 파일에 병합을 시작합니다.");

    const resultReviewContent = await fs.promises.readFile(resultReviewPath, "utf-8");
    // [중요] 배열로 파싱합니다.
    const resultReviewList = safeJsonParse<ReviewEntry[]>(resultReviewContent);

    const rootReviewContent = await fs.promises.readFile(rootReviewPath, "utf-8");
    // [중요] 배열로 파싱합니다.
    const rootReviewList = safeJsonParse<ReviewEntry[]>(rootReviewContent);

    if (!resultReviewList || !rootReviewList) {
      vscode.window.showErrorMessage(".review.json 파일 중 하나가 손상되어 병합할 수 없습니다.");
      return;
    }

    // 병합 로직: rootReviewList(루트 파일, 최신 변경사항)를 Map으로 변환하여 조회 성능을 높입니다.
    // 키는 "path/filename" 조합으로 만듭니다.
    const rootDataMap = new Map<string, ReviewEntry>();
    for (const item of rootReviewList) {
      const uniqueKey = `${item.path}/${item.filename}`;
      rootDataMap.set(uniqueKey, item);
    }

    // resultReviewList(기본 구조)를 기준으로 최종 배열을 만듭니다. 이렇게 해야 순서가 유지됩니다.
    const mergedList = resultReviewList.map((resultItem) => {
      const uniqueKey = `${resultItem.path}/${resultItem.filename}`;

      // 만약 root Map에 동일한 키의 항목이 존재한다면, root의 항목(최신 값)을 사용합니다.
      if (rootDataMap.has(uniqueKey)) {
        return rootDataMap.get(uniqueKey)!;
      }

      // 그렇지 않다면, 기존 result 항목을 그대로 사용합니다.
      return resultItem;
    });

    // 병합된 배열을 다시 JSON 문자열로 변환하여 파일에 씁니다.
    await fs.promises.writeFile(rootReviewPath, JSON.stringify(mergedList, null, 2), "utf-8");
    console.log("리뷰 파일 병합 완료.");
  } catch (error) {
    console.error("리뷰 파일 병합 중 오류 발생:", error);
    vscode.window.showErrorMessage("리뷰 파일을 병합하는 중에 오류가 발생했습니다.");
  }
}
