// ============================================================
// icd-select.js — the "what's your probable diagnosis?" step
// between the conceptualization chat and the structured
// evaluation. Renders the WHO Embedded Classification Tool
// (ECT), a free-text ICD-11 search, and saves the student's
// chosen entity (foundationUri + label) before letting them
// continue to evaluation.
//
// Include after storage.js, with the target case and the
// evaluation page to link to:
//   <script src="/icd-select.js" data-module="schizophrenia"
//           data-eval-href="/schizophrenia-eval.html"></script>
//
// Architecture note: only the OAuth TOKEN is proxied through our
// own Worker (/api/icd/token), because that's the only part that
// needs a secret. The actual searches go straight from the
// browser to WHO's id.who.int, authenticated with that token -
// this is the pattern WHO's own docs recommend, not a full
// reverse proxy of every search.
// ============================================================

(function () {
  const script = document.currentScript;
  const moduleId = script.dataset.module;
  const evalHref = script.dataset.evalHref;
  if (!moduleId || !evalHref) return;

  const ECT_VERSION = "1.7.1";
  const INO = moduleId; // the ECT "instance number" - just needs to match between input+div

  // ---- inject ECT's own CSS + JS from WHO's CDN ----
  const cssLink = document.createElement("link");
  cssLink.rel = "stylesheet";
  cssLink.href = `https://icdcdn.who.int/embeddedct/icd11ect-${ECT_VERSION}.css`;
  document.head.appendChild(cssLink);

  // ---- our own styling for the surrounding card ----
  const css = `
  .icd-picker { background:var(--surface); border:1px solid var(--line); border-radius:16px;
    padding:24px 26px; margin:28px 0; }
  .icd-picker .eyebrow { margin-bottom:8px; }
  .icd-picker h3 { font-family:var(--head); font-size:18px; margin-bottom:6px; }
  .icd-picker .no-wrong-answer { font-size:13px; color:var(--ink-muted); background:var(--surface-sunken);
    border-radius:8px; padding:8px 12px; margin-bottom:16px; display:inline-block; }
  .icd-picker .ctw-input { width:100%; padding:11px 14px; border:1px solid var(--line); border-radius:10px;
    font-family:var(--sans); font-size:14px; color:var(--ink); background:var(--surface); margin-bottom:4px; }
  .icd-picker .ctw-window { position:relative; z-index:5; }
  .icd-picker .icd-confirmed { display:none; align-items:center; gap:10px; flex-wrap:wrap;
    background:var(--brand-pale); border-radius:10px; padding:12px 14px; margin-top:14px; }
  .icd-picker .icd-confirmed.on { display:flex; }
  .icd-picker .icd-confirmed .label { font-weight:600; color:var(--ink); font-size:14px; }
  .icd-picker .icd-confirmed button { background:none; border:none; text-decoration:underline;
    color:var(--ink-muted); font-size:13px; cursor:pointer; padding:0; }
  .icd-picker .icd-error { display:none; color:#900; font-size:13px; margin-top:10px; }
  .icd-picker .icd-error.on { display:block; }
  .icd-continue-row { display:none; margin-top:18px; }
  .icd-continue-row.on { display:block; }
  `;
  document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));

  // ---- markup ----
  const wrap = document.createElement("div");
  wrap.className = "icd-picker";
  wrap.innerHTML = `
    <span class="eyebrow">Before the evaluation</span>
    <h3>What do you think is the most likely diagnosis?</h3>
    <span class="no-wrong-answer">There's no wrong answer here — this is just your working hypothesis, for comparison later.</span>
    <input type="text" class="ctw-input" autocomplete="off" data-ctw-ino="${INO}" placeholder="Start typing a diagnosis (ICD-11 search)…" />
    <div class="ctw-window" data-ctw-ino="${INO}"></div>
    <div class="icd-confirmed" id="icd-confirmed-${INO}">
      <span class="label">Your hypothesis: <span id="icd-confirmed-label-${INO}"></span></span>
      <button type="button" id="icd-change-${INO}">Change</button>
    </div>
    <div class="icd-error" id="icd-error-${INO}">ICD-11 search is temporarily unavailable — you can still proceed and pick a hypothesis later.</div>
    <div class="icd-continue-row" id="icd-continue-row-${INO}">
      <a class="btn btn-secondary" href="${evalHref}">Proceed to evaluation →</a>
    </div>
  `;

  // Replace the old static "eval-link" block with this new flow, if present;
  // otherwise just append to the page's main content.
  const oldLink = document.querySelector(".eval-link");
  if (oldLink) {
    oldLink.replaceWith(wrap);
  } else {
    document.querySelector("#ccg-viewport, main")?.appendChild(wrap);
  }

  const confirmedBox = document.getElementById(`icd-confirmed-${INO}`);
  const confirmedLabel = document.getElementById(`icd-confirmed-label-${INO}`);
  const changeBtn = document.getElementById(`icd-change-${INO}`);
  const errorBox = document.getElementById(`icd-error-${INO}`);
  const continueRow = document.getElementById(`icd-continue-row-${INO}`);
  const inputEl = wrap.querySelector(".ctw-input");
  const windowEl = wrap.querySelector(".ctw-window");

  function showConfirmed(label) {
    confirmedLabel.textContent = label;
    confirmedBox.classList.add("on");
    inputEl.style.display = "none";
    windowEl.style.display = "none";
    continueRow.classList.add("on");
  }
  function showSearch() {
    confirmedBox.classList.remove("on");
    inputEl.style.display = "";
    windowEl.style.display = "";
    inputEl.value = "";
    inputEl.focus();
  }

  changeBtn.addEventListener("click", showSearch);

  // Restore a previously-chosen hypothesis, if the student already picked
  // one on an earlier visit to this page.
  const existing = typeof ClinCog !== "undefined" && ClinCog.getDiagnosisHypothesis(moduleId);
  if (existing) {
    showConfirmed(existing.label);
  }

  // ---- load the ECT script, then configure it ----
  const ectScript = document.createElement("script");
  ectScript.src = `https://icdcdn.who.int/embeddedct/icd11ect-${ECT_VERSION}.js`;
  ectScript.onload = function () {
    if (!window.ECT) return;
    ECT.Handler.configure(
      {
        apiServerUrl: "https://id.who.int",
        apiSecured: true,
        popupMode: false,
      },
      {
        getNewTokenFunction: async () => {
          try {
            const byok = typeof ClinCog !== "undefined" ? ClinCog.getByok() : null;
            const res = await fetch("/api/icd/token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ byok }),
            });
            const data = await res.json();
            if (!data.token) throw new Error("no token");
            errorBox.classList.remove("on");
            return data.token;
          } catch (e) {
            errorBox.classList.add("on");
            throw e;
          }
        },
        selectedEntityFunction: (selectedEntity) => {
          const label = selectedEntity.selectedText || selectedEntity.title;
          if (typeof ClinCog !== "undefined") {
            ClinCog.setDiagnosisHypothesis(moduleId, {
              foundationUri: selectedEntity.foundationUri,
              label,
            });
          }
          showConfirmed(label);
        },
      }
    );
  };
  ectScript.onerror = function () {
    errorBox.classList.add("on");
    continueRow.classList.add("on"); // don't block the student if WHO's CDN is unreachable
  };
  document.body.appendChild(ectScript);
})();
