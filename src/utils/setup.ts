import * as vscode from "vscode";
import { selectWorker } from "../parsers/xlsxParser";
import { openReviewPanels, state } from "../state";

/**
 * [신규 함수] 모드와 작업자를 설정하는 함수.
 * 성공적으로 설정되면 true, 사용자가 중간에 취소하면 false를 반환합니다.
 */
export async function setupModeAndWorker(): Promise<boolean> {
  // 1. 모드 선택 (취소 불가능)
  while (!state.mode) {
    state.mode = await vscode.window.showQuickPick(["work", "inspect"], {
      placeHolder: "모드를 선택해주세요.",
      ignoreFocusOut: true, // 창 바깥을 클릭해도 닫히지 않음
    });
    if (!state.mode) {
      await vscode.window.showWarningMessage("모드를 반드시 선택해야 합니다.", { modal: true });
    }
  }
  vscode.window.showInformationMessage(`'${state.mode}' 모드로 설정을 시작합니다.`);

  let selectedWorker: string | undefined;
  while (!selectedWorker) {
    selectedWorker = await selectWorker(); // XLSX에서 작업자 목록 가져오기

    if (!selectedWorker) {
      // 사용자가 QuickPick을 ESC로 닫은 경우
      const choice = await vscode.window.showWarningMessage(
        "작업자를 반드시 선택해야 합니다.",
        { modal: true },
        "다시 선택"
      );

      if (choice !== "다시 선택") {
        // 모달 경고창에서 '다시 선택' 외 다른 행동을 하면 설정 취소로 간주
        return false;
      }
    }
  }
  state.gitUser = selectedWorker;

  if (state.gitUser) {
    vscode.window.showInformationMessage(`'${selectedWorker}' 작업자의 작업 파일 리스트를 확인합니다.`);

    // ✨ 2. [핵심 추가] 열려있는 모든 웹뷰 패널 업데이트
    // openReviewPanels에 있는 각 패널에 대해 상태를 다시 확인하고 업데이트 메시지를 보냅니다.
    const panelClosePromises = [];
    for (const [filePath, panel] of openReviewPanels.entries()) {
      panelClosePromises.push(panel.dispose());
    }
    vscode.window.showInformationMessage(`'${state.gitUser}'의 작업 환경으로 전환되었습니다. 파일을 다시 열어주세요.`, {
      modal: true,
    });
  }

  return true; // 설정 성공
}
