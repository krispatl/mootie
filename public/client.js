// client.js
// Mootie MVP front-end — Chat, Uploads, Voice Input, Scoring, TTS Playback

// ====================== Global State ======================
const state = {
  mode: "coach",
  scores: {
    clarity: [],
    structure: [],
    authority: [],
    responsiveness: [],
    persuasiveness: []
  },
  transcript: [],
  mediaRecorder: null,
  audioChunks: [],
  recording: false
};

// ====================== DOM Refs ======================
const messagesDiv = document.getElementById("messages");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const recordBtn = document.getElementById("recordBtn");
const typingIndicator = document.getElementById("typingIndicator");

const modeCoach = document.getElementById("modeCoach");
const modeJudge = document.getElementById("modeJudge");
const modeOpposition = document.getElementById("modeOpposition");
const sessionInfo = document.getElementById("sessionInfo");

const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const sourceList = document.getElementById("sourceList");

const exportBtn = document.getElementById("exportTranscript");
const transcriptList = document.getElementById("transcriptList");
const coachFeedbackBtn = document.getElementById("coachFeedbackBtn");

const helpButton = document.getElementById("helpButton");
const helpOverlay = document.getElementById("helpOverlay");
const closeHelp = document.getElementById("closeHelp");

const scoreRows = {
  clarity: document.getElementById("scoreClarity"),
  structure: document.getElementById("scoreStructure"),
  authority: document.getElementById("scoreAuthority"),
  responsiveness: document.getElementById("scoreResponsiveness"),
  persuasiveness: document.getElementById("scorePersuasiveness")
};

// ====================== Utilities ======================
function beep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.16);
    setTimeout(() => ctx.close(), 200);
  } catch (e) {
    console.error("beep error:", e);
  }
}

function showTyping(show) {
  if (!typingIndicator) return;
  typingIndicator.classList.toggle("hidden", !show);
}

function addMessage(role, text, references = []) {
  if (!messagesDiv) return;
  const container = document.createElement("div");
  container.className = `message ${role}`;
  const meta = document.createElement("div");
  meta.className = "meta";
  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.textContent = `${role === "user" ? "You" : "Mootie"} • ${timeString}`;
  container.appendChild(meta);

  const body = document.createElement("div");
  body.className = "text";
  body.textContent = text;
  container.appendChild(body);

  if (references && references.length) {
    const refDiv = document.createElement("div");
    refDiv.className = "references";
    refDiv.textContent = "Referenced: " + references.join(", ");
    container.appendChild(refDiv);
  }

  messagesDiv.appendChild(container);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  state.transcript.push({ role, text, time: now.toISOString(), references });
  updateTranscriptUI();
}

function updateTranscriptUI() {
  if (!transcriptList) return;
  transcriptList.innerHTML = "";
  state.transcript.forEach(entry => {
    const div = document.createElement("div");
    div.className = "transcript-entry";
    const timeStr = new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    div.textContent = `${entry.role === "user" ? "You" : "Mootie"} [${timeStr}]: ${entry.text}`;
    transcriptList.appendChild(div);
  });
}

function updateScoreUI() {
  Object.keys(scoreRows || {}).forEach(key => {
    const row = scoreRows[key];
    if (!row) return;
    const values = state.scores[key] || [];
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const bar = row.querySelector(".fill");
    const valueSpan = row.querySelector(".value");
    if (bar) bar.style.width = `${Math.min(100, avg * 10)}%`;
    if (valueSpan) valueSpan.textContent = avg.toFixed(1);
  });
}

function setMode(mode) {
  state.mode = mode;
  try {
    localStorage.setItem("mootieMode", mode);
  } catch {}
  applyMode(mode);
}

function applyMode(mode) {
  [modeCoach, modeJudge, modeOpposition].forEach(btn => {
    if (!btn) return;
    btn.classList.toggle("active", btn.dataset?.mode === mode || btn.id?.toLowerCase().includes(mode));
  });
  let color;
  if (mode === "judge") color = getComputedStyle(document.documentElement).getPropertyValue("--judge-color") || "#7dd3fc";
  else if (mode === "opposition") color = getComputedStyle(document.documentElement).getPropertyValue("--opposition-color") || "#a78bfa";
  else color = getComputedStyle(document.documentElement).getPropertyValue("--coach-color") || "#7dd3fc";
  document.documentElement.style.setProperty("--accent", color.trim());
  if (sessionInfo) sessionInfo.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
}

// ====================== Init ======================
window.addEventListener("DOMContentLoaded", () => {
  try {
    const savedMode = localStorage.getItem("mootieMode");
    if (savedMode) state.mode = savedMode;
  } catch {}
  applyMode(state.mode);

  if (modeCoach) modeCoach.addEventListener("click", () => setMode("coach"));
  if (modeJudge) modeJudge.addEventListener("click", () => setMode("judge"));
  if (modeOpposition) modeOpposition.addEventListener("click", () => setMode("opposition"));

  if (sendBtn) sendBtn.addEventListener("click", handleSend);
  if (textInput) {
    textInput.addEventListener("keypress", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  if (recordBtn) {
    recordBtn.addEventListener("mousedown", startRecording);
    recordBtn.addEventListener("mouseup", stopRecording);
    recordBtn.addEventListener("mouseleave", () => {
      if (state.recording) stopRecording();
    });
    recordBtn.addEventListener("touchstart", e => {
      e.preventDefault();
      startRecording();
    }, { passive: false });
    recordBtn.addEventListener("touchend", e => {
      e.preventDefault();
      stopRecording();
    }, { passive: false });
  }

  window.addEventListener("keydown", e => {
    if (e.code === "Space" && !e.repeat) {
      const active = document.activeElement;
      if (active !== textInput && active !== recordBtn && !state.recording) {
        e.preventDefault();
        startRecording();
      }
    }
  }, { passive: false });
  window.addEventListener("keyup", e => {
    if (e.code === "Space" && state.recording) {
      const active = document.activeElement;
      if (active !== textInput && active !== recordBtn) {
        e.preventDefault();
        stopRecording();
      }
    }
  }, { passive: false });

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleUpload);
  }

  if (exportBtn) exportBtn.addEventListener("click", exportTranscript);
  if (coachFeedbackBtn) coachFeedbackBtn.addEventListener("click", getCoachFeedback);

  if (helpButton && helpOverlay)
    helpButton.addEventListener("click", () => helpOverlay.classList.toggle("hidden"));
  if (closeHelp && helpOverlay)
    closeHelp.addEventListener("click", () => helpOverlay.classList.add("hidden"));

  refreshVectorList();
  updateScoreUI();
});

// ====================== Chat / Send ======================
async function handleSend() {
  const text = (textInput?.value || "").trim();
  if (!text) return;
  if (textInput) textInput.value = "";
  addMessage("user", text);
  showTyping(true);
  try {
    const res = await fetch("/api/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, message: text, mode: state.mode })
    });
    const result = await res.json();
    showTyping(false);
    if (!result || result.success === false) {
      addMessage("assistant", `Error: ${result?.error || "An error occurred"}`);
      return;
    }
    const payload = result.data || result;
    const reply = payload.assistantResponse || payload.assistant || payload.text || "";
    const references = payload.references || [];
    addMessage("assistant", reply, references);
    if (reply) {
      await scoreMessage(reply);
      await playTTS(reply);
    }
  } catch (e) {
    console.error("send error:", e);
    showTyping(false);
    addMessage("assistant", "An error occurred while contacting the server.");
  }
}

// ====================== Scoring ======================
async function scoreMessage(text) {
  try {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const out = await res.json();
    if (!out || !out.success || !out.data) return;
    const { clarity, structure, authority, responsiveness, persuasiveness, notes } = out.data;
    ["clarity", "structure", "authority", "responsiveness", "persuasiveness"].forEach(key => {
      if (typeof out.data[key] === "number") state.scores[key].push(out.data[key]);
    });
    updateScoreUI();
    if (notes) addMessage("assistant", `Coach Note: ${notes}`);
  } catch (err) {
    console.error("score error:", err);
  }
}

// ====================== Recording / Transcription ======================
async function startRecording() {
  if (state.recording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder = mediaRecorder;
    document.body.classList.add("user-speaking");
    state.audioChunks = [];
    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      recordBtn?.classList.remove("active", "pulsing");
      state.recording = false;
      beep();
      const blob = new Blob(state.audioChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", blob, "speech.webm");
      try {
        const resp = await fetch("/api/transcribe", { method: "POST", body: formData });
        const out = await resp.json();
        if (!out || out.success === false) {
          addMessage("assistant", out?.error || "Failed to transcribe audio.");
          return;
        }
        const payload = out.data || out;
        if (payload && payload.text) {
          if (textInput) textInput.value = payload.text;
          handleSend();
        }
      } catch (e) {
        console.error("transcribe error:", e);
        addMessage("assistant", "Failed to transcribe audio.");
      } finally {
        document.body.classList.remove("user-speaking");
      }
    };
    mediaRecorder.start();
    state.recording = true;
    recordBtn?.classList.add("active", "pulsing");
    beep();
  } catch (e) {
    console.error("recording error:", e);
    addMessage("assistant", "Unable to access microphone.");
  }
}

function stopRecording() {
  if (!state.recording || !state.mediaRecorder) return;
  state.mediaRecorder.stop();
}

// ====================== Upload / Delete / Vector Store ======================
const deletingMap = new Map();

async function handleUpload(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("purpose", "assistants");
      addMessage("assistant", `📤 Uploading ${file.name}...`);
      const res = await fetch("/api/upload-document", { method: "POST", body: fd });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.error) {
        console.error("❌ Upload failed:", out);
        addMessage("assistant", `❌ ${file.name}: ${out?.error?.message || "Upload failed."}`);
      } else {
        addMessage("assistant", `✅ Uploaded ${file.name}`);
      }
    } catch (err) {
      console.error("🔥 Upload error:", err);
      addMessage("assistant", `❌ ${file.name}: Upload error.`);
    }
  }

  e.target.value = "";
  await refreshVectorList();
}

async function deleteFile(fileId, refreshAfter = true) {
  if (!fileId) return;
  if (deletingMap.get(fileId)) return;
  deletingMap.set(fileId, true);

  try {
    const res = await fetch(`/api/delete-file?fileId=${encodeURIComponent(fileId)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      const el = document.querySelector(`[data-file-id="${fileId}"]`);
      if (el) el.remove();
      if (refreshAfter) await refreshVectorList();
    } else {
      addMessage("assistant", `⚠️ Delete failed for ${fileId}`);
    }
  } catch (err) {
    console.error("delete error:", err);
  } finally {
    deletingMap.delete(fileId);
  }
}

async function refreshVectorList() {
  try {
    const res = await fetch("/api/list-files");
    const data = await res.json().catch(() => ({}));
    const container = document.getElementById("sourceList");
    if (!container) return;
    container.innerHTML = "";

    if (data?.files?.length) {
      addMessage("assistant", `📁 Loaded ${data.files.length} file(s) in vector store.`);
      data.files.forEach(f => {
        const el = document.createElement("div");
        el.className = "source-item";
        el.dataset.fileId = f.id;

        const label = document.createElement("span");
        label.textContent = f.filename || f.name || f.id;
        el.appendChild(label);

        const del = document.createElement("button");
        del.textContent = "🗑️";
        del.className = "delete-btn";
        del.onclick = () => deleteFile(f.id);
        el.appendChild(del);

        container.appendChild(el);
      });
    } else {
      const el = document.createElement("div");
      el.className = "no-files";
      el.textContent = "No files in vector store.";
      container.appendChild(el);
    }
  } catch (err) {
    console.error("refreshVectorList error:", err);
    addMessage("assistant", "⚠️ Could not load vector store files.");
  }
}

window.handleUpload = handleUpload;
window.deleteFile = deleteFile;
window.refreshVectorList = refreshVectorList;

// ====================== Export & Coach Feedback ======================
function exportTranscript() {
  if (!state.transcript.length) return;
  let content = "# Mootie Transcript\n\n";
  state.transcript.forEach(entry => {
    const timeStr = new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    content += `[${timeStr}] ${entry.role === "user" ? "You" : "Mootie"}: ${entry.text}\n`;
  });
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mootie_transcript.txt";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 0);
}

async function getCoachFeedback() {
  try {
    const resp = await fetch("/api/ai-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: state.transcript })
    });
    const out = await resp.json().catch(() => ({}));
    if (!out || out.success === false) {
      addMessage("assistant", out?.error || "Failed to fetch coach feedback.");
      return;
    }
    const notes = out.data?.notes;
    if (notes) addMessage("assistant", `Coach Feedback: ${notes}`);
    else addMessage("assistant", "No feedback available.");
  } catch (err) {
    console.error("coach feedback error:", err);
    addMessage("assistant", "Failed to fetch coach feedback.");
  }
}

// ====================== TTS Playback ======================
async function playTTS(text) {
  if (!text) return;
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "alloy" })
    });
    if (!response.ok) throw new Error(`TTS request failed: ${response.status}`);
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play();
  } catch (err) {
    console.error("TTS playback error:", err);
  }
}
