/* ============================================================
   Aurora — Quiz Studio
   Pure vanilla JS, no build step. Data lives in localStorage.
   (Internal storage keys kept as "siteRegister.*" on purpose,
   so existing saved quizzes from earlier versions still load.)
   ============================================================ */

const STORAGE_KEY = "siteRegister.quizzes.v1";

/* ---------- Parser ---------- */
/**
 * Parses the plain-text question bank format into:
 * [{ question, options: [{label, text, correct}], explanation }]
 */
function parseQuizText(raw) {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const questions = [];
  let current = null;
  let mode = null; // 'question' | 'explanation'

  const pushCurrent = () => {
    if (current && current.options.length >= 2 && current.options.some(o => o.correct)) {
      questions.push(current);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const qMatch = line.match(/^Q\s*\d+[.):]\s*(.*)$/i);
    const optMatch = line.match(/^\(?([A-Da-d])[.):]\s*(.*)$/);
    const expMatch = line.match(/^Explanation\s*:\s*(.*)$/i);
    const isSeparator = /^-{3,}$/.test(line) || /^=+$/.test(line);

    if (qMatch) {
      pushCurrent();
      current = { question: qMatch[1].trim(), options: [], explanation: "" };
      mode = "question";
      continue;
    }

    if (optMatch && current && mode !== "explanation") {
      const rest = optMatch[2];
      // Strip everything from the checkmark onward so the answer isn't leaked
      const cleanText = rest.split("✅")[0].trim();
      const isCorrect = rest.includes("✅");
      current.options.push({
        label: optMatch[1].toUpperCase(),
        text: cleanText || rest.trim(),
        correct: isCorrect
      });
      mode = "option";
      continue;
    }

    if (expMatch && current) {
      current.explanation = expMatch[1].trim();
      mode = "explanation";
      continue;
    }

    if (isSeparator) {
      mode = null;
      continue;
    }

    if (line === "") continue;

    // Continuation of the previous field
    if (current) {
      if (mode === "question") {
        current.question += "\n" + line;
      } else if (mode === "explanation") {
        current.explanation += "\n" + line;
      } else if (mode === "option" && current.options.length) {
        const last = current.options[current.options.length - 1];
        last.text += " " + line;
      }
    }
  }
  pushCurrent();
  return questions;
}

/* ---------- Storage ---------- */
function loadQuizzes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to read quizzes from storage", e);
    return [];
  }
}

function saveQuizzes(quizzes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quizzes));
}

function addQuiz(title, questions) {
  const quizzes = loadQuizzes();
  const quiz = {
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random(),
    title: title || "Untitled Quiz",
    createdAt: new Date().toISOString(),
    questions
  };
  quizzes.unshift(quiz);
  saveQuizzes(quizzes);
  return quiz;
}

function deleteQuiz(id) {
  const quizzes = loadQuizzes().filter(q => q.id !== id);
  saveQuizzes(quizzes);
}

function renameQuiz(id, newTitle) {
  const quizzes = loadQuizzes();
  const quiz = quizzes.find(q => q.id === id);
  if (quiz) {
    quiz.title = newTitle;
    saveQuizzes(quizzes);
  }
}

/* ---------- Export / Import ---------- */
function downloadJSON(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 50) || "quiz";
}

function exportQuizzes(quizzes, filename) {
  const payload = {
    app: "site-register",
    version: 1,
    exportedAt: new Date().toISOString(),
    quizzes: quizzes.map(q => ({ title: q.title, createdAt: q.createdAt, questions: q.questions }))
  };
  downloadJSON(filename, payload);
}

function importQuizzesFromPayload(data) {
  const incoming = Array.isArray(data) ? data : (data && Array.isArray(data.quizzes) ? data.quizzes : null);
  if (!incoming) {
    throw new Error("That doesn't look like an Aurora export file.");
  }
  const valid = incoming.filter(q => q && typeof q.title === "string" && Array.isArray(q.questions) && q.questions.length > 0);
  if (valid.length === 0) {
    throw new Error("No valid quizzes found in that file.");
  }

  const imported = valid.map(q => ({
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random(),
    title: q.title,
    createdAt: q.createdAt || new Date().toISOString(),
    questions: q.questions
  }));

  const existing = loadQuizzes();
  saveQuizzes([...imported, ...existing]);
  return imported.length;
}

function getQuiz(id) {
  return loadQuizzes().find(q => q.id === id);
}

async function seedIfEmpty() {
  const existing = loadQuizzes();
  if (existing.length > 0) return;
  try {
    const res = await fetch("seed-quiz.txt");
    if (!res.ok) return;
    const text = await res.text();
    const questions = parseQuizText(text);
    if (questions.length) {
      addQuiz("Construction Materials & Concrete Technology", questions);
    }
  } catch (e) {
    // Offline on first load with no cache yet — fine, user can add their own.
    console.warn("Could not load seed quiz", e);
  }
}

/* ---------- Router ---------- */
const app = document.getElementById("app");

function router() {
  cleanupQuestionNav();
  const hash = location.hash || "#/home";

  if (hash.startsWith("#/quiz/")) return renderQuiz(hash.slice("#/quiz/".length));
  if (hash.startsWith("#/result/")) return renderResult(hash.slice("#/result/".length));
  if (hash === "#/add") return renderAdd();
  return renderHome();
}

function cleanupQuestionNav() {
  const overlay = document.getElementById("qnavOverlay");
  const drawer = document.getElementById("qnavDrawer");
  if (overlay) overlay.remove();
  if (drawer) drawer.remove();
}

window.addEventListener("hashchange", router);

document.getElementById("addQuizBtn").addEventListener("click", () => {
  location.hash = "#/add";
});

/* ---------- Home view ---------- */
function renderHome() {
  const tpl = document.getElementById("tpl-home");
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  const quizzes = loadQuizzes();
  document.getElementById("quizCount").textContent = String(quizzes.length).padStart(2, "0");

  const list = document.getElementById("quizList");
  const empty = document.getElementById("emptyState");
  const statusBox = document.getElementById("registerStatus");

  function setStatus(message, kind) {
    statusBox.hidden = !message;
    statusBox.textContent = message || "";
    statusBox.className = "ai-status" + (kind ? ` ai-status-${kind}` : "");
  }

  document.getElementById("exportAllBtn").addEventListener("click", () => {
    const current = loadQuizzes();
    if (current.length === 0) {
      setStatus("No quizzes to export yet.", "error");
      return;
    }
    exportQuizzes(current, `site-register-export-${new Date().toISOString().slice(0, 10)}.json`);
    setStatus(`Exported ${current.length} quiz${current.length === 1 ? "" : "zes"} to a .json file.`, "success");
  });

  const importFileInput = document.getElementById("importFileInput");
  document.getElementById("importBtn").addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", async () => {
    const file = importFileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const count = importQuizzesFromPayload(data);
      setStatus(`Imported ${count} quiz${count === 1 ? "" : "zes"}.`, "success");
      renderHome();
    } catch (err) {
      setStatus("Couldn't import that file: " + err.message, "error");
    } finally {
      importFileInput.value = "";
    }
  });

  if (quizzes.length === 0) {
    empty.hidden = false;
    empty.querySelector("[data-action='add']").addEventListener("click", () => location.hash = "#/add");
    return;
  }

  const CARD_ACCENTS = [
    "linear-gradient(135deg, #8B5CF6, #EC4899)",
    "linear-gradient(135deg, #EC4899, #3B82F6)",
    "linear-gradient(135deg, #3B82F6, #22D3EE)",
    "linear-gradient(135deg, #22D3EE, #8B5CF6)"
  ];

  quizzes.forEach((quiz, i) => {
    const card = document.createElement("article");
    card.className = "quiz-card";
    card.style.setProperty("--card-accent", CARD_ACCENTS[i % CARD_ACCENTS.length]);
    const date = new Date(quiz.createdAt);
    const dateStr = isNaN(date) ? "" : date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

    card.innerHTML = `
      <div class="quiz-card-top">
        <div>
          <div class="quiz-card-title" data-title-for="${quiz.id}">${escapeHtml(quiz.title)}</div>
          <div class="quiz-card-meta">
            <span>${quiz.questions.length} questions</span>
            ${dateStr ? `<span>Added ${dateStr}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="quiz-card-actions">
        <button class="btn btn-stamp" data-start="${quiz.id}">Start Quiz &rarr;</button>
        <button class="btn-outline" data-rename="${quiz.id}">Rename</button>
        <button class="btn-outline" data-export-one="${quiz.id}">Export</button>
        <button class="btn-outline btn-outline-danger" data-delete="${quiz.id}">Remove</button>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll("[data-start]").forEach(btn => {
    btn.addEventListener("click", () => {
      location.hash = `#/quiz/${btn.dataset.start}`;
    });
  });
  list.querySelectorAll("[data-rename]").forEach(btn => {
    btn.addEventListener("click", () => startRename(btn.dataset.rename));
  });
  list.querySelectorAll("[data-export-one]").forEach(btn => {
    btn.addEventListener("click", () => {
      const quiz = getQuiz(btn.dataset.exportOne);
      if (quiz) exportQuizzes([quiz], `${slugify(quiz.title)}.json`);
    });
  });
  list.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      const quiz = getQuiz(btn.dataset.delete);
      if (quiz && confirm(`Remove "${quiz.title}"? This can't be undone.`)) {
        deleteQuiz(btn.dataset.delete);
        renderHome();
      }
    });
  });
}

function startRename(id) {
  const titleEl = document.querySelector(`[data-title-for="${id}"]`);
  if (!titleEl) return;
  const quiz = getQuiz(id);
  if (!quiz) return;

  const input = document.createElement("input");
  input.type = "text";
  input.value = quiz.title;
  input.className = "rename-input";
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const newTitle = input.value.trim() || quiz.title;
    renameQuiz(id, newTitle);
    renderHome();
  };
  const cancel = () => {
    if (committed) return;
    committed = true;
    renderHome();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") cancel();
  });
  input.addEventListener("blur", commit);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- Settings (Gemini key/model) ---------- */
const SETTINGS_KEY = "siteRegister.settings.v1";

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveSettings(patch) {
  const current = loadSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
}

/* ---------- Gemini AI formatting ---------- */
const AI_FORMAT_PROMPT = `You convert raw study material into a plain-text multiple-choice question bank using this EXACT format. Output ONLY the formatted questions — no preamble, no markdown code fences, no commentary before or after.

Accuracy rules — these matter more than anything else below:
- If the source already contains the question and options worded out, copy that wording as closely as possible. Do not paraphrase, shorten, reorder, or rewrite phrasing that already exists in the source — only add formatting (numbering, lettering, line breaks, the ✅ marker, and an Explanation line).
- If the source states which option is correct — anywhere, including in a separate answer key, an answer table at the end of the document, bolded/starred text, or footnotes — that stated answer is the ONLY source of truth for which option gets the ✅ marker. Do not independently judge which answer seems right if the source already tells you. Take extra care matching each question's number to its corresponding entry in a separate answer key — this is the single most common place mistakes happen, so double-check each match before finalizing.
- Only decide the correct answer yourself when the source truly does not provide one anywhere (e.g. you were asked to generate new questions from plain reference material). In that case, only include a question if you are highly confident in the correct answer based on well-established facts — skip anything you're unsure about rather than guessing.

Format rules:
- Each question starts on its own line as: Q1. <question text>  (increment the number for each question)
- If a question includes multiple numbered or lettered sub-statements (e.g. a "consider the following statements" question with items 1., 2., 3.), put each sub-statement on its own line, with a real line break after each one — never merge them into a single run-on paragraph. See the second example below.
- Below it, list options as lettered lines: A) B) C) D) ...  (2 or more options is fine)
- Put a checkmark right after the text of the ONE correct option's line, like:
  C) Correct answer text  ✅ CORRECT
  Exactly one option per question must carry the ✅ marker.
- After the options, add one line starting with "Explanation:" giving a short reason the answer is correct.
- Separate each question block from the next with a line of dashes.

Example of one complete question:

Q1. What is the boiling point of water at sea level?

A) 90°C
B) 100°C  ✅ CORRECT
C) 110°C
D) 120°C

Explanation: At standard atmospheric pressure (1 atm), water boils at 100°C.

------------------------------------------------

Example of a question with multiple sub-statements (notice each stays on its own line):

Q2. Consider the following statements about photosynthesis:
1. It occurs only in the presence of sunlight.
2. It produces oxygen as a byproduct.
3. It takes place exclusively in the roots of a plant.
Which of the statements given above is/are correct?

A) 1 and 2 only  ✅ CORRECT
B) 2 and 3 only
C) 1 and 3 only
D) All of the above

Explanation: Statement 3 is false — photosynthesis occurs in chloroplasts, mainly in leaves, not roots.

------------------------------------------------

Now read the source material provided below (as text, or as an attached PDF) and produce as many well-formed multiple-choice questions as it reasonably supports, following the exact format and accuracy rules above. Keep the original language of the source material.`;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

async function formatWithGemini(file, apiKey, model) {
  const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
  let parts;

  if (isPdf) {
    const base64 = await fileToBase64(file);
    parts = [
      { text: AI_FORMAT_PROMPT },
      { inlineData: { mimeType: "application/pdf", data: base64 } }
    ];
  } else {
    const text = await file.text();
    parts = [{ text: AI_FORMAT_PROMPT + "\n\n---SOURCE TEXT---\n" + text }];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts }] })
    });
  } catch (e) {
    throw new Error("Couldn't reach Gemini. Check your internet connection and try again.");
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errJson = await res.json();
      detail = (errJson && errJson.error && errJson.error.message) || "";
    } catch (e) { /* ignore */ }
    if (res.status === 400 || res.status === 403) {
      throw new Error("Gemini rejected the request — double check your API key." + (detail ? ` (${detail})` : ""));
    }
    if (res.status === 404) {
      throw new Error(`Model "${model}" wasn't found. Try updating the model name in Advanced settings.`);
    }
    if (res.status === 429) {
      throw new Error("Gemini's free-tier rate limit was hit. Wait a bit and try again.");
    }
    throw new Error(`Gemini API error (${res.status}).` + (detail ? ` ${detail}` : ""));
  }

  const data = await res.json();
  const candidate = data.candidates && data.candidates[0];
  if (!candidate) {
    const blockReason = data.promptFeedback && data.promptFeedback.blockReason;
    throw new Error(blockReason ? `Gemini blocked this request (${blockReason}).` : "Gemini returned no output for this file.");
  }
  const text = (candidate.content && candidate.content.parts || [])
    .map(p => p.text || "").join("\n").trim();
  if (!text) throw new Error("Gemini returned an empty response. Try again, or format manually.");
  return text;
}

/* ---------- Add view ---------- */
function renderAdd() {
  const tpl = document.getElementById("tpl-add");
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  const titleInput = document.getElementById("titleInput");
  const rawTextarea = document.getElementById("rawTextarea");
  const preview = document.getElementById("parsePreview");
  const errorBox = document.getElementById("parseError");
  const saveBtn = document.getElementById("saveBtn");
  const form = document.getElementById("addForm");

  let parsedQuestions = null;
  let lastFileNameForTitle = "";

  function updatePreview() {
    const text = rawTextarea.value;
    preview.hidden = true;
    errorBox.hidden = true;
    if (!text.trim()) {
      parsedQuestions = null;
      saveBtn.disabled = true;
      return;
    }
    const questions = parseQuizText(text);
    if (questions.length === 0) {
      parsedQuestions = null;
      saveBtn.disabled = true;
      errorBox.hidden = false;
      errorBox.textContent = "Couldn't find any questions in that text yet. Check it matches the format below (Q1., A)-D), a ✅ on the correct option).";
      return;
    }
    parsedQuestions = questions;
    saveBtn.disabled = false;
    preview.hidden = false;
    preview.textContent = `Parsed ${questions.length} question${questions.length === 1 ? "" : "s"} successfully.`;
    if (!titleInput.value.trim() && lastFileNameForTitle) {
      titleInput.value = lastFileNameForTitle;
    }
  }

  rawTextarea.addEventListener("input", updatePreview);

  /* --- Tabs --- */
  const tabButtons = document.querySelectorAll(".tab-btn");
  const panels = { manual: document.getElementById("tabManual"), ai: document.getElementById("tabAI") };
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== btn.dataset.tab; });
    });
  });

  /* --- Manual tab: file upload fills the textarea --- */
  const fileInput = document.getElementById("fileInput");
  const fileDrop = document.getElementById("fileDrop");
  const fileHint = document.getElementById("fileHint");

  function loadManualFile(file) {
    if (!file) return;
    fileHint.textContent = `Selected: ${file.name}`;
    lastFileNameForTitle = file.name.replace(/\.txt$/i, "").replace(/[_-]+/g, " ").trim();
    const reader = new FileReader();
    reader.onload = () => {
      rawTextarea.value = String(reader.result || "");
      updatePreview();
    };
    reader.onerror = () => {
      errorBox.hidden = false;
      errorBox.textContent = "Couldn't read that file. Please try again.";
    };
    reader.readAsText(file);
  }

  fileInput.addEventListener("change", () => loadManualFile(fileInput.files[0]));
  ["dragover", "dragenter"].forEach(evt =>
    fileDrop.addEventListener(evt, e => { e.preventDefault(); fileDrop.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach(evt =>
    fileDrop.addEventListener(evt, e => { e.preventDefault(); fileDrop.classList.remove("dragover"); })
  );
  fileDrop.addEventListener("drop", e => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadManualFile(file);
  });

  /* --- AI tab --- */
  const aiFileInput = document.getElementById("aiFileInput");
  const aiFileDrop = document.getElementById("aiFileDrop");
  const aiFileHint = document.getElementById("aiFileHint");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const modelInput = document.getElementById("modelInput");
  const aiFormatBtn = document.getElementById("aiFormatBtn");
  const aiStatus = document.getElementById("aiStatus");
  const offlineNotice = document.getElementById("offlineNotice");
  const forgetKeyBtn = document.getElementById("forgetKeyBtn");
  const forgetKeyNote = document.getElementById("forgetKeyNote");

  const settings = loadSettings();
  if (settings.geminiApiKey) apiKeyInput.value = settings.geminiApiKey;
  if (settings.geminiModel) modelInput.value = settings.geminiModel;
  apiKeyInput.addEventListener("change", () => saveSettings({ geminiApiKey: apiKeyInput.value.trim() }));
  modelInput.addEventListener("change", () => saveSettings({ geminiModel: modelInput.value.trim() || "gemini-flash-lite-latest" }));

  forgetKeyBtn.addEventListener("click", () => {
    apiKeyInput.value = "";
    saveSettings({ geminiApiKey: "" });
    forgetKeyNote.hidden = false;
    setTimeout(() => { forgetKeyNote.hidden = true; }, 4000);
  });

  let aiFile = null;
  function setAiFile(file) {
    if (!file) return;
    aiFile = file;
    aiFileHint.textContent = `Selected: ${file.name}`;
  }
  aiFileInput.addEventListener("change", () => setAiFile(aiFileInput.files[0]));
  ["dragover", "dragenter"].forEach(evt =>
    aiFileDrop.addEventListener(evt, e => { e.preventDefault(); aiFileDrop.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach(evt =>
    aiFileDrop.addEventListener(evt, e => { e.preventDefault(); aiFileDrop.classList.remove("dragover"); })
  );
  aiFileDrop.addEventListener("drop", e => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) setAiFile(file);
  });

  function refreshOfflineNotice() {
    offlineNotice.hidden = navigator.onLine;
  }
  refreshOfflineNotice();
  window.addEventListener("online", refreshOfflineNotice);
  window.addEventListener("offline", refreshOfflineNotice);

  function setAiStatus(message, kind) {
    aiStatus.hidden = !message;
    aiStatus.textContent = message || "";
    aiStatus.className = "ai-status" + (kind ? ` ai-status-${kind}` : "");
  }

  aiFormatBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim() || "gemini-flash-lite-latest";

    if (!navigator.onLine) {
      setAiStatus("You're offline — AI formatting needs an internet connection.", "error");
      return;
    }
    if (!aiFile) {
      setAiStatus("Choose a source file first.", "error");
      return;
    }
    if (!apiKey) {
      setAiStatus("Paste your Gemini API key first.", "error");
      return;
    }

    saveSettings({ geminiApiKey: apiKey, geminiModel: model });
    aiFormatBtn.disabled = true;
    setAiStatus("Formatting with AI — this can take a few seconds...", "loading");

    try {
      const formatted = await formatWithGemini(aiFile, apiKey, model);
      rawTextarea.value = formatted;
      updatePreview();
      if (parsedQuestions && parsedQuestions.length) {
        setAiStatus(`Done — parsed ${parsedQuestions.length} question${parsedQuestions.length === 1 ? "" : "s"}. Double-check the correct answers and wording against your source before saving — AI can occasionally mismatch or misword a question.`, "success");
        if (!titleInput.value.trim()) {
          titleInput.value = aiFile.name.replace(/\.(txt|pdf)$/i, "").replace(/[_-]+/g, " ").trim();
        }
      } else {
        setAiStatus("Gemini responded, but the output didn't match the expected format. You can edit the text box below by hand, or try again.", "error");
      }
    } catch (err) {
      setAiStatus(err.message + " You can edit the text box below by hand, or use the Paste / Upload Text tab instead.", "error");
    } finally {
      aiFormatBtn.disabled = false;
    }
  });

  /* --- Save --- */
  form.addEventListener("submit", e => {
    e.preventDefault();
    if (!parsedQuestions) return;
    const title = titleInput.value.trim() || lastFileNameForTitle || "Untitled Quiz";
    const quiz = addQuiz(title, parsedQuestions);
    location.hash = `#/quiz/${quiz.id}`;
  });
}

/* ---------- Quiz view ---------- */
let quizState = null; // { quiz, index, answers: [{selectedLabel, correct}|null, ...] }

function renderQuiz(id) {
  const quiz = getQuiz(id);
  if (!quiz) { location.hash = "#/home"; return; }

  if (!quizState || quizState.quiz.id !== id) {
    quizState = { quiz, index: 0, answers: new Array(quiz.questions.length).fill(null) };
  }

  const tpl = document.getElementById("tpl-quiz");
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  // Move the fixed-position drawer/overlay out from under .view: a CSS
  // transform on an ancestor (like .view's entrance animation) turns that
  // ancestor into the containing block for position:fixed descendants,
  // which briefly mispositions them until the animation finishes.
  // Parenting them directly to <body> avoids that entirely.
  const qnavOverlayEl = document.getElementById("qnavOverlay");
  const qnavDrawerEl = document.getElementById("qnavDrawer");
  if (qnavOverlayEl) document.body.appendChild(qnavOverlayEl);
  if (qnavDrawerEl) document.body.appendChild(qnavDrawerEl);

  document.querySelector("[data-confirm-exit]").addEventListener("click", e => {
    const hasUnfinishedProgress = quizState.answers.some(a => a) && quizState.answers.some(a => !a);
    if (hasUnfinishedProgress) {
      if (!confirm("Exit this quiz? Your progress on this attempt won't be saved.")) {
        e.preventDefault();
      }
    }
  });

  wireQuestionNav();
  renderQuestion();
}

function wireQuestionNav() {
  const toggleBtn = document.getElementById("navToggleBtn");
  const closeBtn = document.getElementById("qnavCloseBtn");
  const overlay = document.getElementById("qnavOverlay");
  const drawer = document.getElementById("qnavDrawer");

  const open = () => { overlay.classList.add("show"); drawer.classList.add("open"); };
  const close = () => { overlay.classList.remove("show"); drawer.classList.remove("open"); };

  toggleBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);

  renderQuestionNav();
}

function renderQuestionNav() {
  const grid = document.getElementById("qnavGrid");
  if (!grid) return;
  grid.innerHTML = "";

  quizState.quiz.questions.forEach((_, i) => {
    const answer = quizState.answers[i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qnav-item";
    if (answer) btn.classList.add(answer.correct ? "correct" : "incorrect");
    if (i === quizState.index) btn.classList.add("current");
    btn.textContent = String(i + 1);
    btn.addEventListener("click", () => {
      quizState.index = i;
      document.getElementById("qnavOverlay").classList.remove("show");
      document.getElementById("qnavDrawer").classList.remove("open");
      renderQuestion();
    });
    grid.appendChild(btn);
  });
}

function renderQuestion() {
  const { quiz, index, answers } = quizState;
  const q = quiz.questions[index];
  const existingAnswer = answers[index];

  document.getElementById("qIndex").textContent = "Q " + String(index + 1).padStart(2, "0");
  document.getElementById("qTotal").textContent = String(quiz.questions.length).padStart(2, "0");
  document.getElementById("progressFill").style.width = `${(index / quiz.questions.length) * 100}%`;
  document.getElementById("questionText").textContent = q.question;

  const optionsList = document.getElementById("optionsList");
  optionsList.innerHTML = "";
  const explainNote = document.getElementById("explainNote");
  explainNote.hidden = true;

  q.options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.type = "button";
    btn.innerHTML = `<span class="option-letter">${opt.label}</span><span class="option-text">${escapeHtml(opt.text)}</span>`;
    if (!existingAnswer) {
      btn.addEventListener("click", () => selectOption(opt, q));
    }
    optionsList.appendChild(btn);
  });

  const prevBtn = document.getElementById("prevBtn");
  prevBtn.hidden = index === 0;
  prevBtn.onclick = () => {
    quizState.index -= 1;
    renderQuestion();
  };

  const nextBtn = document.getElementById("nextBtn");
  if (existingAnswer) {
    showAnswerState(q, existingAnswer.selectedLabel);
  } else {
    nextBtn.hidden = true;
  }

  renderQuestionNav();
}

function selectOption(selected, q) {
  if (quizState.answers[quizState.index]) return;
  quizState.answers[quizState.index] = { selectedLabel: selected.label, correct: !!selected.correct };
  showAnswerState(q, selected.label);
  renderQuestionNav();
}

function showAnswerState(q, selectedLabel) {
  const buttons = document.querySelectorAll(".option");
  q.options.forEach((opt, i) => {
    const btn = buttons[i];
    btn.disabled = true;
    if (opt.correct) {
      btn.classList.add("correct");
    } else if (opt.label === selectedLabel) {
      btn.classList.add("incorrect");
    } else {
      btn.classList.add("faded");
    }
  });

  const explainNote = document.getElementById("explainNote");
  const explainText = document.getElementById("explainText");
  if (q.explanation) {
    explainText.textContent = q.explanation;
    explainNote.hidden = false;
  }

  const nextBtn = document.getElementById("nextBtn");
  nextBtn.hidden = false;
  nextBtn.textContent = quizState.index + 1 >= quizState.quiz.questions.length
    ? "See Results \u2192"
    : "Next Question \u2192";
  nextBtn.onclick = () => {
    if (quizState.index + 1 >= quizState.quiz.questions.length) {
      location.hash = `#/result/${quizState.quiz.id}`;
    } else {
      quizState.index += 1;
      renderQuestion();
    }
  };
}

/* ---------- Result view ---------- */
function renderResult(id) {
  const quiz = getQuiz(id);
  if (!quiz || !quizState || quizState.quiz.id !== id) { location.hash = "#/home"; return; }

  const tpl = document.getElementById("tpl-result");
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  const total = quiz.questions.length;
  const score = quizState.answers.filter(a => a && a.correct).length;
  const pct = total ? Math.round((score / total) * 100) : 0;
  const pass = pct >= 60;

  const stampEl = document.getElementById("resultStamp");
  const cardEl = document.querySelector(".result-card");
  stampEl.textContent = pass ? "\u2728 Nice work" : "\uD83D\uDCAA Keep going";
  stampEl.className = "result-stamp " + (pass ? "pass" : "fail");
  cardEl.style.setProperty("--result-glow", pass
    ? "linear-gradient(135deg, #34D399, #22D3EE)"
    : "linear-gradient(135deg, #8B5CF6, #EC4899)");

  document.getElementById("resultTitle").textContent = "Quiz Complete";
  document.getElementById("resultPct").textContent = `${pct}% correct`;

  const scoreEl = document.getElementById("resultScore");
  scoreEl.textContent = `0/${total}`;
  let shown = 0;
  const step = () => {
    shown += 1;
    scoreEl.textContent = `${Math.min(shown, score)}/${total}`;
    if (shown < score) requestAnimationFrame(() => setTimeout(step, 35));
  };
  if (score > 0) requestAnimationFrame(() => setTimeout(step, 200));

  document.getElementById("retakeBtn").addEventListener("click", () => {
    quizState = { quiz, index: 0, answers: new Array(quiz.questions.length).fill(null) };
    location.hash = `#/quiz/${quiz.id}`;
  });
}

/* ---------- Boot ---------- */
(async function init() {
  await seedIfEmpty();
  router();
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
