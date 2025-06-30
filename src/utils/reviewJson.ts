import * as fs from "fs";
import * as path from "path";
import { ReviewMap } from "../reviewDecorationProvider";

export function loadReviewJsonAsMap(jsonPath: string): ReviewMap {
  const result: ReviewMap = {};

  if (!fs.existsSync(jsonPath)) return result;

  try {
    const rawArray = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as any[];

    for (const entry of rawArray) {
      if (!entry.path || !entry.filename) continue;

      const fullKey = path.posix.join(entry.path.replace(/^\.\/?/, ""), entry.filename);
      result[fullKey] = {
        path: entry.path,
        task_done: entry.task_done,
        tasked_by: entry.tasked_by,
        tasked_at: entry.tasked_at,
        review_done: entry.review_done,
        review_comment: entry.review_comment,
        reviewed_by: entry.reviewed_by,
        reviewed_at: entry.reviewed_at,
      };
    }
  } catch (err) {
    console.error(`.review.json 파싱 실패: ${err}`);
  }

  return result;
}
