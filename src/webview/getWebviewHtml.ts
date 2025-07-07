import * as vscode from "vscode";
import { getNonce } from "../utils";

/**
 * 웹뷰의 HTML 콘텐츠를 생성합니다.
 * @param webview 웹뷰 인스턴스.
 * @param scriptUri 웹뷰의 JavaScript 파일 URI.
 * @param filename 검수 중인 JSON 파일의 기본 이름.
 * @param isReadonly 웹뷰를 읽기 전용으로 표시할지 여부.
 * @returns 웹뷰용 HTML 문자열.
 */
export function getWebviewHtml(
  webview: vscode.Webview,
  scriptUri: vscode.Uri,
  filename: string,
  isReadonly: boolean
): string {
  // Tip: Install the es6-string-html extension for syntax highlighting in backticks
  const nonce = getNonce(); // For Content Security Policy

  // isReadonly 값에 따라 body 클래스 결정
  const bodyClass = isReadonly ? "readonly-mode" : "";
  return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Review Panel</title>
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
					<style>
							body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                padding: 20px; 
              }
							label { 
                display: block; 
                margin-bottom: 8px;
                cursor: pointer; /* 클릭 가능 영역임을 표시 */
              }
							textarea { 
                width: 100%; 
                height: 100px; 
                margin-bottom: 10px; 
                padding: 8px; 
                box-sizing: border-box;
                border: 1px solid #ccc;
                border-radius: 4px;
              }
							button { 
                padding: 10px 15px; 
                background-color: #007acc; 
                color: white; 
                border: none; 
                cursor: pointer;
                border-radius: 4px;
              }
							button:hover { 
                background-color: #005f99; 
              }

              .inline-meta {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin-left: 8px;
              }

              .badge {
                background-color: #007acc;
                color: white;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 0.85em;
                font-weight: bold;
              }

              .meta-time {
                font-size: 0.8em;
                color: #888;
              }

              /* ✨ 읽기 전용 모드 스타일 ✨ */
              body.readonly-mode input,
              body.readonly-mode textarea,
              body.readonly-mode select, /* <select> 박스 추가 */
              body.readonly-mode button {
                pointer-events: none; /* 마우스 이벤트 차단 */
                background-color: #f0f0f0; /* 비활성화된 배경색 */
                opacity: 0.7; /* 반투명하게 만들어 비활성화 시각적 효과 강화 */
                color: #888; /* 텍스트 색상도 흐리게 */
                border-color: #ddd; /* 테두리 색상도 흐리게 */
              }
              body.readonly-mode label,
              body.readonly-mode button {
                cursor: not-allowed; /* 커서 모양 변경 */
              }
              body.readonly-mode button#save-button {
                display: none; /* 저장 버튼 숨기기 */
              }
					</style>
			</head>
			<body class="${bodyClass}">
					<h3>${filename}</h3>
					<label>
            <input type="checkbox" id="taskDone"> 작업 완료
            <span id="taskMeta" class="inline-meta"></span>
          </label>
					<textarea id="reporting" placeholder="특이사항 입력"></textarea>
          <label>
            <input type="checkbox" id="reviewDone"> 검수 완료
            <span id="reviewMeta" class="inline-meta"></span>
          </label>
					<textarea id="comment" placeholder="검수 코멘트 입력"></textarea>
					<button id="save-button" onclick="saveStatus()">저장</button>

					<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>
	`;
}
