const vscode = acquireVsCodeApi();

function formatDateTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // 0-based
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatUser(name, currentUser) {
  if (!name) return "@me"; // 저장 안된 상태
  return name === currentUser ? "@me" : `@${name}`;
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelector("button").addEventListener("click", () => {
    const taskDone = document.getElementById("taskDone").checked;
    const taskNotice = document.getElementById("notice").value;
    const reviewDone = document.getElementById("reviewDone").checked;
    const reviewComment = document.getElementById("comment").value;

    console.log("📤 saveStatus message 전송");
    vscode.postMessage({
      command: "saveStatus",
      task_done: taskDone,
      notice: taskNotice,
      review_done: reviewDone,
      review_comment: reviewComment,
    });
  });

  // ✅ 초기값 세팅 리스너 추가
  window.addEventListener("message", (event) => {
    const message = event.data;
    console.log("📥 웹뷰 메시지 수신 (프론트):", message);

    if (message.command === "initialData" && message.data) {
      const currentUser = message.gitUserName;
      const { task_done, notice, tasked_by, tasked_at, review_done, reviewed_by, reviewed_at, review_comment } =
        message.data;

      document.getElementById("taskDone").checked = task_done || false;
      document.getElementById("notice").value = notice || "";
      document.getElementById("reviewDone").checked = review_done || false;
      document.getElementById("comment").value = review_comment || "";

      const taskMetaEl = document.getElementById("taskMeta");
      taskMetaEl.innerHTML =
        task_done || notice
          ? `<span class="inline-meta">
        <span class="badge">${formatUser(tasked_by, currentUser)}</span>
        <span class="meta-time"> ${formatDateTime(tasked_at)}</span>
      </span>`
          : "";

      const reviewMetaEl = document.getElementById("reviewMeta");
      reviewMetaEl.innerHTML =
        review_done || review_comment
          ? `<span class="inline-meta">
        <span class="badge">${formatUser(reviewed_by, currentUser)}</span>
        <span class="meta-time"> ${formatDateTime(reviewed_at)}</span>
      </span>`
          : "";
    }
    if (message.command === "save-complete") {
      document.getElementById("modal").style.display = "none";
    }
  });
});
