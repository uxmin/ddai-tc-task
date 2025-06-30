const vscode = acquireVsCodeApi();

window.addEventListener("DOMContentLoaded", () => {
  document.querySelector("button").addEventListener("click", () => {
    const taskDone = document.getElementById("taskDone").checked;
    const reviewDone = document.getElementById("reviewDone").checked;
    const reviewComment = document.getElementById("comment").value;

    vscode.postMessage({
      command: "saveStatus",
      task_done: taskDone,
      review_done: reviewDone,
      review_comment: reviewComment,
    });
  });

  // ✅ 초기값 세팅 리스너 추가
  window.addEventListener("message", (event) => {
    console.log(">>>>", event);
    const message = event.data;
    if (message.command === "initialData" && message.data) {
      const { task_done, review_done, review_comment } = message.data;
      document.getElementById("taskDone").checked = task_done || false;
      document.getElementById("reviewDone").checked = review_done || false;
      document.getElementById("comment").value = review_comment || "";
    }
  });
});
