// 명령어 등록
import * as vscode from "vscode";
import { openFileWithCorrectMode } from "./fileOpenHandler";
import { WORK_EXT } from "./state";
import { showStatusPanel } from "./webview/showStatusPanel";

export function registerCommands(context: vscode.ExtensionContext) {
  // 리뷰 패널 열기 명령어
  const openReviewPanelCommand = vscode.commands.registerCommand(
    "extension.openReviewPanel",
    async (uri: vscode.Uri) => {
      let filePath: string | undefined;

      if (uri?.fsPath) {
        filePath = uri.fsPath;
      } else if (vscode.window.activeTextEditor?.document.languageId === WORK_EXT) {
        filePath = vscode.window.activeTextEditor.document.uri.fsPath;
      } else {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          filters: { "JSON Files": [WORK_EXT] },
          title: `Select a ${WORK_EXT.toUpperCase()} file to review`,
        });
        filePath = picked?.[0]?.fsPath;
      }

      if (filePath && filePath.endsWith(`.${WORK_EXT}`)) {
        showStatusPanel(context, filePath, false);
      } else if (filePath) {
        vscode.window.showWarningMessage(`The selected file is not a ${WORK_EXT.toUpperCase()} file.`, {
          modal: false,
        });
      } else {
        vscode.window.showInformationMessage(`No ${WORK_EXT.toUpperCase()} file selected or open.`, { modal: false });
      }
    }
  );

  // 파일 열기 트리거용 명령어
  const openFileCommand = vscode.commands.registerCommand("myExtension.openFile", (filePath: string) => {
    openFileWithCorrectMode(context, filePath);
  });

  context.subscriptions.push(openReviewPanelCommand, openFileCommand);
}
