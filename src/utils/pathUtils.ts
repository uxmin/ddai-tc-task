// 경로 유틸
import * as path from "path";

export function normalizePath(root: string, filePath: string): string {
  // 상대 경로 및 POSIX 형식으로 변환 (사용자 코드와 동일)
  let relative = path.relative(root, filePath).split(path.sep).join("/");
  if (relative.startsWith("workspace/")) {
    relative = relative.substring("workspace/".length);
  }
  return relative;
}
