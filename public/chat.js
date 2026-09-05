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
  const MAX_EXCHANGES = 20;

  // Replace with the real Turnstile site key once you've created a
  // Turnstile widget (Invisible type) in the Cloudflare dashboard - this
  // value is public by design, unlike the secret key (which lives only
  // as a Cloudflare secret on the Worker, never in this file).
  const TURNSTILE_SITE_KEY = "0x4AAAAAAEnj-1VYzxHm_t9H";

  let history = ClinCog.getHistory(moduleId);

  const chatDiv = document.getElementById("chat");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const statusDiv = document.getElementById("chat-status");
  const restartBtn = document.getElementById("chat-restart");

  // ---- Student model choice (uvt.clincog.net only): a small, optional
  // toggle between Haiku (fast) and Sonnet (more thoughtful replies).
  // Not shown anywhere else - the demo tier stays fixed on Gemini Flash,
  // and adopted instructors pick their model on the adopt.html page
  // instead. Deliberately just these two; there is no path to Opus here.
  if (window.location.hostname === "uvt.clincog.net") {
    const modelBar = document.createElement("div");
    modelBar.style.cssText = "display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:13px;color:var(--ink-muted)";
    modelBar.innerHTML = `
      <span>Model:</span>
      <div id="student-model-toggle" style="display:flex;gap:6px;">
        <button type="button" data-model="claude-haiku-4-5-20251001" style="padding:5px 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:13px;cursor:pointer;">Fast (Haiku)</button>
        <button type="button" data-model="claude-sonnet-5" style="padding:5px 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:13px;cursor:pointer;">Thoughtful (Sonnet)</button>
      </div>`;
    chatDiv.parentNode.insertBefore(modelBar, chatDiv);

    const modelButtons = modelBar.querySelectorAll("button");
    function paintModelButtons() {
      const current = ClinCog.getStudentModel();
      modelButtons.forEach((b) => {
        const active = b.dataset.model === current;
        b.style.background = active ? "var(--brand)" : "var(--surface)";
        b.style.borderColor = active ? "var(--brand)" : "var(--line)";
        b.style.color = active ? "#fff" : "var(--ink)";
      });
    }
    modelButtons.forEach((b) => {
      b.addEventListener("click", () => {
        ClinCog.setStudentModel(b.dataset.model);
        paintModelButtons();
      });
    });
    paintModelButtons();
  }

  // ---- Turnstile: an invisible, dormant widget we trigger on demand,
  // right before each send, rather than once per page load - keeps
  // every chat request individually verified without any visible UI. ----
  let turnstileWidgetId = null;
  let turnstileReady = false;
  let pendingResolve = null;
  let pendingReject = null;

  function initTurnstile() {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = function () {
      const container = document.createElement("div");
      container.style.display = "none";
      document.body.appendChild(container);
      turnstileWidgetId = turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        size: "invisible",
        execution: "execute",
        callback: function (token) { if (pendingResolve) pendingResolve(token); },
        "error-callback": function () { if (pendingReject) pendingReject(new Error("challenge failed")); },
      });
      turnstileReady = true;
    };
    document.head.appendChild(script);
  }
  initTurnstile();

  function getTurnstileToken() {
    return new Promise(function (resolve, reject) {
      if (!turnstileReady) { reject(new Error("not ready")); return; }
      pendingResolve = resolve;
      pendingReject = reject;
      setTimeout(function () { reject(new Error("timeout")); }, 8000);
      turnstile.reset(turnstileWidgetId);
      turnstile.execute(turnstileWidgetId);
    });
  }

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
      sendBtn.disabled = true;
    } else if (used > 0) {
      statusDiv.textContent = `${used} of ${MAX_EXCHANGES} exchanges used.`;
      sendBtn.disabled = false;
    } else {
      statusDiv.textContent = "";
      sendBtn.disabled = false;
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
    statusDiv.textContent = "Verifying…";

    // Only committed to "history" (and counted, and saved) once we get a
    // real reply - a failed call shouldn't cost the student an exchange.
    const newMessage = { role: "user", content: question };
    const historyToSend = [...history, newMessage];

    try {
      const turnstileToken = await getTurnstileToken();
      statusDiv.textContent = "Waiting for a response...";

      const response = await fetch(URL_PROXY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historyToSend, turnstileToken, byok: ClinCog.getByok(), studentModel: ClinCog.getStudentModel() }),
      });

      if (response.status === 429) {
        statusDiv.textContent = "Too many requests right now — please wait a moment and try again. That question wasn't counted.";
        return;
      }
      if (response.status === 403) {
        statusDiv.textContent = "We couldn't verify your browser — please refresh the page and try again. That question wasn't counted.";
        return;
      }
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
