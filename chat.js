// ============================================================
// chat.js — shared conceptualization chat logic.
// Reused by every case's -chat.html page. Which case it talks
// to is set by the <script data-module="..."> attribute, e.g.
// "depression", "anxiety", "addiction" — this must match a key
// in the VIGNETTES map on the server (worker.js).
// ============================================================

(function () {
  const scriptTag = document.currentScript;
  const moduleId = scriptTag.dataset.module;
  const URL_PROXY = `/api/chat/${moduleId}`;
  const MAX_EXCHANGES = 10;

  let history = [];

  const chatDiv = document.getElementById("chat");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const statusDiv = document.getElementById("chat-status");

  function renderMessage(text, who) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + who;
    const label = document.createElement("span");
    label.className = "who";
    label.textContent = who === "student" ? "You" : "Patient";
    wrap.appendChild(label);
    wrap.appendChild(document.createTextNode(text));
    chatDiv.appendChild(wrap);
    chatDiv.scrollTop = chatDiv.scrollHeight;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const question = input.value.trim();
    if (!question) return;

    if (history.length >= MAX_EXCHANGES * 2) {
      statusDiv.textContent = "You've reached the limit of exchanges for this interview.";
      return;
    }

    renderMessage(question, "student");
    input.value = "";
    sendBtn.disabled = true;
    statusDiv.textContent = "Waiting for a response...";

    // Only committed to "history" (and counted) once we get a real reply -
    // a failed call shouldn't cost the student one of their exchanges.
    const newMessage = { role: "user", content: question };
    const historyToSend = [...history, newMessage];

    try {
      const response = await fetch(URL_PROXY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historyToSend }),
      });

      if (!response.ok) throw new Error("Server error: " + response.status);

      const data = await response.json();
      history = [...historyToSend, { role: "assistant", content: data.text }];

      renderMessage(data.text, "patient");
      statusDiv.textContent = `${history.length / 2} of ${MAX_EXCHANGES} exchanges used.`;
    } catch (err) {
      statusDiv.textContent = "Something went wrong — that question wasn't counted. Try again.";
      console.error(err);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });
})();
