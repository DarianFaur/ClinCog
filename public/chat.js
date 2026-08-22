// ============================================================
// chat.js — shared conceptualization chat logic.
// Reused by every case's -chat.html page. Which case it talks
// to is set by the <script data-module="..."> attribute, e.g.
// "depression", "anxiety", "addiction" — this must match a key
// in the VIGNETTES map on the server (worker.js).
//
// Conversation history is restored from and saved to this
// browser's local storage (see storage.js), so a student who
// closes the tab and comes back later, on the same device,
// picks up exactly where they left off.
// ============================================================

(function () {
  const scriptTag = document.currentScript;
  const moduleId = scriptTag.dataset.module;
  const URL_PROXY = `/api/chat/${moduleId}`;
  const MAX_EXCHANGES = 10;

  let history = ClinCog.getHistory(moduleId);

  const chatDiv = document.getElementById("chat");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const statusDiv = document.getElementById("chat-status");
  const restartBtn = document.getElementById("chat-restart");

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

  function updateStatus() {
    const used = history.length / 2;
    if (used >= MAX_EXCHANGES) {
      statusDiv.textContent = "You've reached the limit of exchanges for this interview.";
    } else if (used > 0) {
      statusDiv.textContent = `${used} of ${MAX_EXCHANGES} exchanges used.`;
    } else {
      statusDiv.textContent = "";
    }
  }

  // Restore any previous conversation for this case, on this device.
  function restore() {
    chatDiv.innerHTML = "";
    for (const msg of history) {
      renderMessage(msg.content, msg.role === "user" ? "student" : "patient");
    }
    updateStatus();
  }
  restore();

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const question = input.value.trim();
    if (!question) return;

    if (history.length >= MAX_EXCHANGES * 2) {
      updateStatus();
      return;
    }

    renderMessage(question, "student");
    input.value = "";
    sendBtn.disabled = true;
    statusDiv.textContent = "Waiting for a response...";

    // Only committed to "history" (and counted, and saved) once we get a
    // real reply - a failed call shouldn't cost the student an exchange.
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
      ClinCog.setHistory(moduleId, history);

      renderMessage(data.text, "patient");
      updateStatus();
    } catch (err) {
      statusDiv.textContent = "Something went wrong — that question wasn't counted. Try again.";
      console.error(err);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });

  if (restartBtn) {
    restartBtn.addEventListener("click", function () {
      if (!confirm("Start this interview over? This clears your conversation with this patient on this device.")) return;
      history = [];
      ClinCog.clearHistory(moduleId);
      restore();
    });
  }
})();
