import * as path from "path";
import * as vscode from "vscode";
import * as XLSX from "xlsx";
import { state } from "../state";
import { toPosixPath } from "../utils";

export function parseXlsxFile(): string[] {
  const allowedFiles = new Set<string>();
  try {
    const workbook = XLSX.readFile(state.xlsxPath);
    const sheetName = workbook.SheetNames[0]; // 첫 번째 시트 사용
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // 헤더 포함하여 JSON으로 변환

    // 첫 번째 행 (헤더)를 읽어서 컬럼 인덱스 찾기
    const headers: string[] = jsonData[0] as string[];
    const filepathIdx = headers.findIndex((h) => h.trim().toLowerCase() === "filepath");
    const filenameIdx = headers.findIndex((h) => h.trim().toLowerCase() === "filename");
    const workerIdx = headers.findIndex((h) => h.trim().toLowerCase() === "worker");

    if (filepathIdx === -1 || filenameIdx === -1 || workerIdx === -1) {
      vscode.window.showWarningMessage(
        `'${state.xlsxPath}' 파일에 'filepath', 'filename', 'worker' 헤더가 모두 존재해야 합니다.`
      );
      return Array.from(allowedFiles);
    }

    // 두 번째 행부터 데이터 읽기
    for (let i = 1; i < jsonData.length; i++) {
      const row: any = jsonData[i];
      const filepath = row[filepathIdx];
      const filename = row[filenameIdx];
      const worker = row[workerIdx];

      if (
        typeof filepath === "string" &&
        typeof filename === "string" &&
        typeof worker === "string" &&
        filepath.trim() !== "" &&
        filename.trim() !== "" &&
        worker.trim() === state.gitUser
      ) {
        const fullPath = path.posix.join(filepath.trim(), filename.trim());
        allowedFiles.add(toPosixPath(fullPath));
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error parsing XLSX file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return Array.from(allowedFiles);
}
