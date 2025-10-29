// client.js
// Enhanced Mootie front-end: modes, chat, recording, uploads, scoring,
// debate mode, transcripts, onboarding/help, and FIXED vector-store delete UI.

// ====================== Global State ======================
const state = {
  mode: 'coach',
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
  recording: false,
  debate: false,
  debateTimer: null,
  debateRemaining: 0,
  debateRounds: [
    { label: 'Opening', duration: 120 },
    { label: 'Rebuttal', duration: 120 },
    { label: 'Closing', duration: 120 }
  ],
  currentRoundIndex: 0,
  currentTurn: 0,
  speakerFirstUser: true,
  debateTurnCount: 0,
  enableCoachFeedback: false
};

// ====================== DOM Refs ======================
const messagesDiv = document.getElementById('messages');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const recordBtn = document.getElementById('recordBtn');
const typingIndicator = document.getElementById('typingIndicator');

const modeCoach = document.getElementById('modeCoach');
const modeJudge = document.getElementById('modeJudge');
const modeOpposition = document.getElementById('modeOpposition');
const sessionInfo = document.getElementById('sessionInfo');

const debateToggle = document.getElementById('debateToggle');
const debateStatus = document.getElementById('debateStatus');
const roundLabel = document.getElementById('roundLabel');
const turnLabel = document.getElementById('turnLabel');

const progressFill = document.getElementById('progressFill');
const nextRoundBtn = document.getElementById('nextRoundBtn');

// Debate setup modal (optional)
const debateSetupModal = document.getElementById('debateSetupModal');
const debateSetupForm = document.getElementById('debateSetupForm');
const debateOpening = document.getElementById('debateOpening');
const debateRebuttal = document.getElementById('debateRebuttal');
const debateClosing = document.getElementById('debateClosing');
const debateStarter = document.getElementById('debateStarter');
const debateCancel = document.getElementById('debateCancel');
const enableCoachFeedback = document.getElementById('enableCoachFeedback');

// Sources / uploads
const sourceList = document.getElementById('sourceList');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');

// Transcript / export / notes
const exportBtn = document.getElementById('exportTranscript');
const transcriptList = document.getElementById('transcriptList');
const coachFeedbackBtn = document.getElementById('coachFeedbackBtn');

// Onboarding/help (optional)
const onboardingModal = document.getElementById('onboardingModal');
const onboardingTitle = document.getElementById('onboardingTitle');
const onboardingText = document.getElementById('onboardingText');
const onboardingNext = document.getElementById('onboardingNext');
const onboardingPrev = document.getElementById('onboardingPrev');
const helpButton = document.getElementById('helpButton');
const helpOverlay = document.getElementById('helpOverlay');
const closeHelp = document.getElementById('closeHelp');

// Scores UI (optional)
const scoreRows = {
  clarity: document.getElementById('scoreClarity'),
  structure: document.getElementById('scoreStructure'),
  authority: document.getElementById('scoreAuthority'),
  responsiveness: document.getElementById('scoreResponsiveness'),
  persuasiveness: document.getElementById('scorePersuasiveness')
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
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.16);
    setTimeout(() => ctx.close(), 200);
  } catch (e) { console.error('beep error:', e); }
}

function showTyping(show) {
  if (!typingIndicator) return;
  typingIndicator.classList.toggle('hidden', !show);
}

function addMessage(role, text, references = []) {
  if (!messagesDiv) return;
  const container = document.createElement('div');
  container.className = `message ${role}`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  meta.textContent = `${role === 'user' ? 'You' : 'Mootie'} • ${timeString}`;
  container.appendChild(meta);
  const body = document.createElement('div');
  body.className = 'text';
  body.textContent = text;
  container.appendChild(body);
  messagesDiv.appendChild(container);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  state.transcript.push({ role, text, time: now.toISOString(), references });
}

// ====================== Init ======================
window.addEventListener('DOMContentLoaded', () => {
  try {
    const savedMode = localStorage.getItem('mootieMode');
    if (savedMode) state.mode = savedMode;
  } catch {}
  applyMode(state.mode);

  // Uploads
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleUpload);
  }

  refreshVectorList();
});

// ====================== Upload / Delete / Vector List ======================

// prevent duplicate deletes
const deletingMap = new Map();

async function handleUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("purpose", "assistants");

  console.log("🚀 Uploading", file.name);

  try {
    const res = await fetch("/api/upload-document", { method: "POST", body: fd });
    const out = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log("✅ Uploaded:", out);
      await refreshVectorList();
    } else {
      console.error("❌ Upload failed:", out);
    }
  } catch (err) {
    console.error("🔥 Upload error:", err);
  }

  e.target.value = "";
}

async function deleteFile(fileId, refreshAfter = true) {
  if (!fileId) return;
  if (deletingMap.get(fileId)) return;
  deletingMap.set(fileId, true);

  console.log('[deleteFile]', fileId);
  const start = performance.now();
  try {
    const res = await fetch(`/api/delete-file?fileId=${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      console.log('✅ File deleted successfully.');
      const el = document.querySelector(`[data-file-id="${fileId}"]`);
      if (el) el.remove();
      if (refreshAfter) await refreshVectorList();
    } else {
      console.error('❌ Delete failed:', data?.error || `HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('🔥 Exception during delete:', err);
  } finally {
    deletingMap.delete(fileId);
    console.log('⏱️ Duration:', (performance.now() - start).toFixed(1), 'ms');
  }
}

async function refreshVectorList() {
  try {
    const res = await fetch('/api/list-files');
    const data = await res.json().catch(() => ({}));
    const container = document.getElementById('sourcesContainer');
    if (!container) return;
    container.innerHTML = '';

    if (data?.files?.length) {
      data.files.forEach(f => {
        const el = document.createElement('div');
        el.className = 'source-item';
        el.dataset.fileId = f.id;
        el.textContent = f.filename || f.id;

        const del = document.createElement('button');
        del.textContent = '🗑️';
        del.className = 'delete-btn';
        del.onclick = () => deleteFile(f.id);
        el.appendChild(del);

        container.appendChild(el);
      });
    } else {
      const el = document.createElement('div');
      el.textContent = 'No files in vector store.';
      el.className = 'no-files';
      container.appendChild(el);
    }
  } catch (err) {
    console.error('refreshVectorList error:', err);
  }
}
