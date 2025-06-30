import * as vscode from "vscode";
import * as XLSX from "xlsx";

export function parseXlsxFile(xlsxPath: string, rootDir: string): string[] {
  const allowedFiles = new Set<string>();
  try {
    const workbook = XLSX.readFile(xlsxPath);
    const sheetName = workbook.SheetNames[0]; // 첫 번째 시트 사용
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // 헤더 포함하여 JSON으로 변환

    // 첫 번째 행 (헤더)를 읽어서 'filename' 컬럼 인덱스 찾기
    const headers: string[] = jsonData[0] as string[];
    const filenameColumnIndex = headers.findIndex(
      (header) => header.trim().toLowerCase() === "filename" // "filename" 헤더 찾기
    );

    if (filenameColumnIndex === -1) {
      vscode.window.showWarningMessage(`'${xlsxPath}' 파일에 'filename' 헤더가 없습니다.`, { modal: false });
      return Array.from(allowedFiles);
    }

    // 두 번째 행부터 데이터 읽기
    for (let i = 1; i < jsonData.length; i++) {
      const row: any = jsonData[i];
      const filename = row[filenameColumnIndex];

      if (typeof filename === "string" && filename.trim() !== "") {
        // 공백 이후의 내용도 파일명으로 간주할 수 있도록 .split(' ')[0] 등으로 처리하지 않음
        allowedFiles.add(filename.trim());
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error parsing XLSX file: ${error instanceof Error ? error.message : String(error)}`,
      { modal: false }
    );
  }
  return Array.from(allowedFiles);
}
