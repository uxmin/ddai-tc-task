import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as xlsx from "xlsx";
import { state } from "../state";
import { toPosixPath } from "../utils";

/**
 * xlsx 파일을 읽어 worker, filepath, filename 정보를 반환
 */
function readXlsxRows(): { headers: string[]; rows: any[][] } | null {
  if (!fs.existsSync(state.xlsxPath)) {
    vscode.window.showErrorMessage(`'${state.xlsxPath}' 파일이 없습니다.`);
    return null;
  }

  try {
    const workbook = xlsx.readFile(state.xlsxPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }); // 2차원 배열
    const headers: string[] = jsonData[0] as string[];
    const rows = jsonData.slice(1) as any[][];
    return { headers, rows };
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error reading XLSX file: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

export function parseXlsxFile(): string[] {
  const allowedFiles = new Set<string>();
  try {
    const result = readXlsxRows();

    if (!result) return [];

    const { headers, rows } = result;

    const filepathIdx = headers.findIndex((h) => h.trim().toLowerCase() === "filepath");
    const filenameIdx = headers.findIndex((h) => h.trim().toLowerCase() === "filename");
    const workerIdx = headers.findIndex((h) => h.trim().toLowerCase() === "worker");

    if (filepathIdx === -1 || filenameIdx === -1 || workerIdx === -1) {
      vscode.window.showWarningMessage(
        `'${state.xlsxPath}' 파일에 'filepath', 'filename', 'worker' 헤더가 모두 존재해야 합니다.`
      );
      return [];
    }

    // 두 번째 행부터 데이터 읽기
    for (const row of rows) {
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

export async function selectWorker(): Promise<string | undefined> {
  const result = readXlsxRows();
  if (!result) return;

  const { headers, rows } = result;
  const workerIdx = headers.findIndex((h) => h.trim().toLowerCase() === "worker");
  if (workerIdx === -1) {
    vscode.window.showErrorMessage(`'${state.xlsxPath}' 파일에 'worker' 헤더가 존재하지 않습니다.`);
    return;
  }

  const workers = new Set<string>();
  for (const row of rows) {
    const worker = row[workerIdx];
    if (typeof worker === "string" && worker.trim() !== "") {
      workers.add(worker.trim());
    }
  }

  if (workers.size === 0) {
    vscode.window.showErrorMessage("workfile.xlsx에서 작업자를 찾을 수 없습니다.");
    return;
  }

  const workerList = Array.from(workers);

  const selectedWorker = await vscode.window.showQuickPick(workerList, {
    placeHolder: "검수할 작업자를 선택해주세요.",
  });

  return selectedWorker;
}
