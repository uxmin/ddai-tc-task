(function () {
  const vscode = acquireVsCodeApi();

  function formatDateTime(isoString) {
    if (!isoString) {
      return "";
    }
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // 0-based
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  function formatUser(name, currentUser) {
    if (!name) {
      return "@me";
    } // 저장 안된 상태
    return name === currentUser ? "@me" : `@${name}`;
  }

  /**
   * UI의 읽기 전용 상태를 설정/해제하는 함수
   * @param {boolean} isReadonly
   */
  function setReadOnlyMode(isReadonly) {
    document.body.classList.toggle("readonly-mode", isReadonly);
  }

  window.addEventListener("DOMContentLoaded", () => {
    document.querySelector("button").addEventListener("click", () => {
      const taskDone = document.getElementById("taskDone").checked;
      const reviewDone = document.getElementById("reviewDone").checked;
      const comment = document.getElementById("comment").value;
      const reporting = document.getElementById("reporting").value;

      console.log("📤 saveStatus message 전송");
      vscode.postMessage({
        command: "saveStatus",
        task_done: taskDone,
        review_done: reviewDone,
        comment: comment,
        reporting: reporting,
      });
    });
  });

  // ✅ 초기값 세팅 리스너 추가
  window.addEventListener("message", (event) => {
    const message = event.data;
    console.log("📥 웹뷰 메시지 수신 (프론트):", message);

    switch (message.command) {
      case "initialData":
        const data = message.data || {};
        const currentUser = message.gitUserName;

        document.getElementById("taskDone").checked = data.task_done || false;
        document.getElementById("reviewDone").checked = data.review_done || false;
        document.getElementById("comment").value = data.comment || "";
        document.getElementById("reporting").value = data.reporting || "";

        const taskMetaEl = document.getElementById("taskMeta");
        taskMetaEl.innerHTML = data.task_done
          ? `<span class="inline-meta">
                        <span class="badge">${formatUser(data.tasked_by, currentUser)}</span>
                        <span class="meta-time"> ${formatDateTime(data.tasked_at)}</span>
                       </span>`
          : "";

        const reviewMetaEl = document.getElementById("reviewMeta");
        reviewMetaEl.innerHTML = data.review_done
          ? `<span class="inline-meta">
                        <span class="badge">${formatUser(data.reviewed_by, currentUser)}</span>
                        <span class="meta-time"> ${formatDateTime(data.reviewed_at)}</span>
                       </span>`
          : "";

        // ✨ 초기 읽기 전용 상태 설정 (가장 중요)
        setReadOnlyMode(message.isReadonly);
        break;

      case "setReadOnly":
        setReadOnlyMode(message.value);
        break;
      case "save-complete":
        document.getElementById("modal").style.display = "none";
        break;
    }
  });
})();
