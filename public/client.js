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
  currentTurn: 0, // 0 = user, 1 = AI
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

// Graceful getter for missing DOM
function getEl(id) {
  const el = document.getElementById(id);
  return el || { classList: { add(){}, remove(){}, toggle(){} }, style:{}, querySelector(){}, querySelectorAll(){ return []; } };
}

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

  if (references && references.length) {
    const refDiv = document.createElement('div');
    refDiv.className = 'references';
    refDiv.textContent = 'Referenced: ' + references.join(', ');
    container.appendChild(refDiv);
  }

  messagesDiv.appendChild(container);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // Save transcript
  state.transcript.push({ role, text, time: now.toISOString(), references });
  updateTranscriptUI();
}

function updateTranscriptUI() {
  if (!transcriptList) return;
  transcriptList.innerHTML = '';
  state.transcript.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'transcript-entry';
    const timeStr = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.textContent = `${entry.role === 'user' ? 'You' : 'Mootie'} [${timeStr}]: ${entry.text}`;
    transcriptList.appendChild(div);
  });
}

function updateScoreUI() {
  Object.keys(scoreRows || {}).forEach(key => {
    const row = scoreRows[key];
    if (!row) return;
    const values = state.scores[key] || [];
    const avg = values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
    const bar = row.querySelector('.fill');
    const valueSpan = row.querySelector('.value');
    if (bar) bar.style.width = `${Math.min(100, avg * 10)}%`;
    if (valueSpan) valueSpan.textContent = avg.toFixed(1);
  });
}

function setMode(mode) {
  state.mode = mode;
  try { localStorage.setItem('mootieMode', mode); } catch {}
  applyMode(mode);
}

function applyMode(mode) {
  [modeCoach, modeJudge, modeOpposition].forEach(btn => {
    if (!btn) return;
    btn.classList.toggle('active', btn.dataset?.mode === mode || btn.id?.toLowerCase().includes(mode));
  });
  // Accent color (optional CSS vars in :root)
  let color;
  if (mode === 'judge') color = getComputedStyle(document.documentElement).getPropertyValue('--judge-color') || '#7dd3fc';
  else if (mode === 'opposition') color = getComputedStyle(document.documentElement).getPropertyValue('--opposition-color') || '#a78bfa';
  else color = getComputedStyle(document.documentElement).getPropertyValue('--coach-color') || '#7dd3fc';
  document.documentElement.style.setProperty('--accent', color.trim());
  if (sessionInfo) sessionInfo.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
}

// Normalize vector-store API variety: {data:{files|vectors}} or flat arrays
function normalizeFiles(raw) {
  const arr = (raw?.data?.files || raw?.data?.vectors || raw?.files || raw?.vectors || raw || []);
  return arr.map(f => {
    const id = f.id || f.file_id || f.fileId;
    const name = f.filename || f.name || f.display_name || id || 'Unnamed';
    return { id, name };
  }).filter(f => !!f.id);
}

// ====================== Init ======================
window.addEventListener('DOMContentLoaded', () => {
  // Restore mode
  try {
    const savedMode = localStorage.getItem('mootieMode');
    if (savedMode) state.mode = savedMode;
  } catch {}
  applyMode(state.mode);

  // Mode toggles
  if (modeCoach) modeCoach.addEventListener('click', () => setMode('coach'));
  if (modeJudge) modeJudge.addEventListener('click', () => setMode('judge'));
  if (modeOpposition) modeOpposition.addEventListener('click', () => setMode('opposition'));

  // Send
  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (textInput) {
    textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // Record
  if (recordBtn) {
    recordBtn.addEventListener('mousedown', startRecording);
    recordBtn.addEventListener('mouseup', stopRecording);
    recordBtn.addEventListener('mouseleave', () => { if (state.recording) stopRecording(); });
    recordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); }, { passive: false });
    recordBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); }, { passive: false });
  }

  // Spacebar PTT
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      const active = document.activeElement;
      if (active !== textInput && active !== recordBtn && !state.recording) {
        e.preventDefault();
        startRecording();
      }
    }
  }, { passive: false });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && state.recording) {
      const active = document.activeElement;
      if (active !== textInput && active !== recordBtn) {
        e.preventDefault();
        stopRecording();
      }
    }
  }, { passive: false });

  // Uploads
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleUpload);
  }

  // Export & coach notes
  if (exportBtn) exportBtn.addEventListener('click', exportTranscript);
  if (coachFeedbackBtn) coachFeedbackBtn.addEventListener('click', getCoachFeedback);

  // Debate toggle
  if (debateToggle) {
    debateToggle.addEventListener('click', (e) => {
      if (!state.debate && debateSetupModal) {
        e.preventDefault();
        v4OpenDebateSetup();
      } else {
        toggleDebateMode();
      }
    });
  }

  // Debate setup modal hooks
  if (debateCancel) debateCancel.addEventListener('click', v4CloseDebateSetup);
  if (debateSetupForm) debateSetupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    v4StartDebateFromConfig();
  });

  // Prime data
  refreshVectorList();
  updateScoreUI();

  // Onboarding on first visit
  window.addEventListener('load', () => {
    try {
      const seen = localStorage.getItem('mootieOnboarded');
      if (!seen) setTimeout(startOnboarding, 600);
    } catch { setTimeout(startOnboarding, 600); }
  });
});

// ====================== Chat / Send ======================
async function handleSend() {
  const text = (textInput?.value || '').trim();
  if (!text) return;
  if (textInput) textInput.value = '';
  addMessage('user', text);
  showTyping(true);
  try {
    const res = await fetch('/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, message: text, mode: state.mode })
    });
    const result = await res.json();
    showTyping(false);
    if (!result || result.success === false) {
      addMessage('assistant', `Error: ${result?.error || 'An error occurred'}`);
      return;
    }
    const payload = result.data || result;
    const reply = payload.assistantResponse || payload.assistant || payload.text || '';
    const references = payload.references || [];
    addMessage('assistant', reply, references);
    if (reply) await scoreMessage(reply);
    if (payload.assistantAudio) tryPlayAudio(payload.assistantAudio);
  } catch (e) {
    console.error('send error:', e);
    showTyping(false);
    addMessage('assistant', 'An error occurred while contacting the server.');
  }
}

// ====================== Scoring ======================
async function scoreMessage(text) {
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const out = await res.json();
    if (!out || !out.success || !out.data) return;
    const { clarity, structure, authority, responsiveness, persuasiveness, notes } = out.data;
    ['clarity','structure','authority','responsiveness','persuasiveness'].forEach(key => {
      if (typeof out.data[key] === 'number') state.scores[key].push(out.data[key]);
    });
    updateScoreUI();
    if (notes) addMessage('assistant', `Coach Note: ${notes}`);
  } catch (err) { console.error('score error:', err); }
}

// ====================== Recording / Transcription ======================
async function startRecording() {
  if (state.recording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder = mediaRecorder;
    document.body.classList.add('user-speaking');
    state.audioChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) state.audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      recordBtn?.classList.remove('active', 'pulsing');
      state.recording = false;
      beep();
      const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', blob, 'speech.webm');
      try {
        const resp = await fetch('/api/transcribe', { method: 'POST', body: formData });
        const out = await resp.json();
        if (!out || out.success === false) {
          addMessage('assistant', out?.error || 'Failed to transcribe audio.');
          return;
        }
        const payload = out.data || out;
        if (payload && payload.text) {
          if (textInput) textInput.value = payload.text;
          handleSend();
        }
      } catch (e) {
        console.error('transcribe error:', e);
        addMessage('assistant', 'Failed to transcribe audio.');
      } finally {
        document.body.classList.remove('user-speaking');
      }
    };
    mediaRecorder.start();
    state.recording = true;
    recordBtn?.classList.add('active', 'pulsing');
    beep();
  } catch (e) {
    console.error('recording error:', e);
    addMessage('assistant', 'Unable to access microphone.');
  }
}

function stopRecording() {
  if (!state.recording || !state.mediaRecorder) return;
  state.mediaRecorder.stop();
}

// ====================== Uploads / Sources ======================
async function handleUpload(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  for (const file of files) {
    const formData = new FormData();
    formData.append('document', file, file.name);
    try {
      const resp = await fetch('/api/upload-document', { method: 'POST', body: formData });
      const out = await resp.json().catch(() => ({}));
      if (out?.success === false) {
        addMessage('assistant', `Failed to upload ${file.name}: ${out?.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('upload error:', err);
      addMessage('assistant', `Failed to upload ${file.name}.`);
    }
  }
  if (fileInput) fileInput.value = '';
  await refreshVectorList();
}

async function refreshVectorList() {
  const res = await fetch('/api/list-files');
  const data = await res.json().catch(() => ({}));

  const container = document.getElementById('sourcesContainer');
  container.innerHTML = ''; // clear stale list before re-rendering

  if (data?.files?.length) {
    for (const f of data.files) {
      const el = document.createElement('div');
      el.className = 'source-item';
      el.dataset.fileId = f.id;
      el.textContent = f.filename || f.id;
      container.appendChild(el);
    }
  } else {
    const el = document.createElement('div');
    el.textContent = 'No files in vector store.';
    container.appendChild(el);
  }
}

async function deleteFile(fileId) {
  console.log('[deleteFile]', fileId);
  const start = performance.now();
  try {
    const res = await fetch(`/api/delete-file?fileId=${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json().catch(() => ({}));
    console.log('🧩 Full response body:', data);

    if (!res.ok || !data?.success) {
      console.error('❌ Delete failed:', data?.error || `HTTP ${res.status}`);
    } else {
      console.log('✅ File deleted successfully.');
      const row = document.querySelector(`[data-file-id="${fileId}"]`);
      if (row) {
        row.remove();
        console.log(`🧹 Removed element with data-file-id="${fileId}"`);
      } else {
        console.warn(`⚠️ No element found for data-file-id="${fileId}"`);
      }
      if (typeof refreshVectorList === 'function') {
        console.log('🔁 Refreshing source list…');
        await refreshVectorList();
      }
    }
  } catch (err) {
    console.error('🔥 Exception during delete:', err);
  }
  console.log('⏱️ Duration:', (performance.now() - start).toFixed(1), 'ms');
}

// ====================== Export & Coach Feedback ======================
function exportTranscript() {
  if (!state.transcript.length) return;
  let content = '# Mootie Debate Transcript\n\n';
  state.transcript.forEach(entry => {
    const timeStr = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    content += `[${timeStr}] ${entry.role === 'user' ? 'You' : 'Mootie'}: ${entry.text}\n`;
  });
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'mootie_transcript.txt';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 0);
}

async function getCoachFeedback() {
  try {
    const resp = await fetch('/api/ai-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: state.transcript })
    });
    const out = await resp.json().catch(() => ({}));
    if (!out || out.success === false) {
      addMessage('assistant', out?.error || 'Failed to fetch coach feedback.');
      return;
    }
    const notes = out.data?.notes;
    if (notes) addMessage('assistant', `Coach Feedback: ${notes}`);
    else addMessage('assistant', 'No feedback available.');
  } catch (err) {
    console.error('coach feedback error:', err);
    addMessage('assistant', 'Failed to fetch coach feedback.');
  }
}

// ====================== Debate Mode ======================
function toggleDebateMode() {
  if (state.debate) endDebate();
  else startDebate();
}

function v4OpenDebateSetup() {
  if (!debateSetupModal) { startDebate(); return; }
  debateSetupModal.classList.remove('hidden');
}
function v4CloseDebateSetup() {
  if (debateSetupModal) debateSetupModal.classList.add('hidden');
}
function v4StartDebateFromConfig() {
  if (!debateSetupModal || !debateOpening || !debateRebuttal || !debateClosing || !debateStarter) {
    startDebate(); return;
  }
  try {
    const opening = Math.max(15, Math.min(600, parseInt(debateOpening.value || '60', 10)));
    const rebuttal = Math.max(15, Math.min(600, parseInt(debateRebuttal.value || '45', 10)));
    const closing = Math.max(15, Math.min(600, parseInt(debateClosing.value || '30', 10)));
    const starter = (debateStarter.value === 'mootie') ? 'mootie' : 'you';
    state.debateRounds = [{ label: 'Opening', duration: opening }, { label: 'Rebuttal', duration: rebuttal }, { label: 'Closing', duration: closing }];
    state.speakerFirstUser = (starter !== 'mootie');
    state.enableCoachFeedback = !!(enableCoachFeedback && enableCoachFeedback.checked);
  } catch {}
  v4CloseDebateSetup();
  startDebate();
}

function startDebate() {
  state.debate = true;
  try {
    const userFirst = window.confirm('Would you like to go first?\nOK = You, Cancel = Mootie');
    state.speakerFirstUser = userFirst;
  } catch { state.speakerFirstUser = true; }
  state.currentRoundIndex = 0;
  state.debateTurnCount = 0;
  if (debateToggle) debateToggle.textContent = '⏹️ Stop Debate Mode';
  if (debateStatus) debateStatus.classList.remove('hidden');
  startRound();
}

function startRound() {
  const round = state.debateRounds[state.currentRoundIndex];
  if (!round) { endDebate(); return; }
  const startUser = state.speakerFirstUser ? 0 : 1;
  state.currentTurn = (state.currentRoundIndex % 2 === 0 ? startUser : 1 - startUser);
  state.debateRemaining = round.duration;
  state.debateTurnCount = 0;
  if (roundLabel) roundLabel.textContent = round.label;
  if (turnLabel) turnLabel.textContent = state.currentTurn === 0 ? 'Your Turn' : "Mootie's Turn";
  updateDebateDisplay();
  if (state.debateTimer) clearInterval(state.debateTimer);
  state.debateTimer = setInterval(() => {
    state.debateRemaining--;
    if (state.debateRemaining <= 0) handleTurnEnd();
    updateDebateDisplay();
  }, 1000);
}

function handleTurnEnd() {
  const round = state.debateRounds[state.currentRoundIndex];
  if (!round) { endDebate(); return; }
  if (state.debateTurnCount === 0) {
    state.debateTurnCount = 1;
    state.currentTurn = 1 - state.currentTurn;
    state.debateRemaining = round.duration;
    if (turnLabel) turnLabel.textContent = state.currentTurn === 0 ? 'Your Turn' : "Mootie's Turn";
  } else {
    nextRound();
  }
}

function nextRound() {
  state.currentRoundIndex++;
  if (state.currentRoundIndex >= state.debateRounds.length) { endDebate(); return; }
  startRound();
}

function endDebate() {
  state.debate = false;
  clearInterval(state.debateTimer); state.debateTimer = null;
  if (debateStatus) debateStatus.classList.add('hidden');
  if (debateToggle) debateToggle.textContent = '🗣️ Start Debate Mode';
  if (sessionInfo) sessionInfo.textContent = `Mode: ${state.mode.charAt(0).toUpperCase() + state.mode.slice(1)}`;
}

function updateDebateDisplay() {
  if (!state.debate) return;
  const round = state.debateRounds[state.currentRoundIndex];
  const total = round ? round.duration : 1;
  const percent = Math.max(0, Math.min(1, (total - state.debateRemaining) / total)) * 100;
  if (progressFill) progressFill.style.width = percent + '%';
  const mins = Math.floor(state.debateRemaining / 60);
  const secs = state.debateRemaining % 60;
  const timerString = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  if (sessionInfo) sessionInfo.textContent = `Debate: ${round?.label || ''} – ${timerString}`;
}

// Audio playback helper
function tryPlayAudio(base64) {
  try {
    if (state.debate && state.currentTurn === 1) v4PauseDebateTimer();
    const audio = new Audio('data:audio/mp3;base64,' + base64);
    audio.play().finally(() => {
      if (state.debate && state.currentTurn === 1) {
        v4ResumeDebateTimer();
        handleTurnEnd();
      }
    });
  } catch (e) {
    console.error('audio playback error:', e);
    if (state.debate && state.currentTurn === 1) {
      v4ResumeDebateTimer();
      handleTurnEnd();
    }
  }
}

function v4PauseDebateTimer() {
  if (state.debateTimer) { clearInterval(state.debateTimer); state.debateTimer = null; }
}
function v4ResumeDebateTimer() {
  if (!state.debate || state.debateTimer) return;
  state.debateTimer = setInterval(() => {
    state.debateRemaining--;
    if (state.debateRemaining <= 0) handleTurnEnd();
    updateDebateDisplay();
  }, 1000);
}

// ====================== Onboarding / Help ======================
const onboardingSteps = [
  { title: 'Welcome to Mootie ⚖️', text: 'Your AI Moot Court Coach helps you practice arguments and improve your reasoning skills.' },
  { title: 'Modes', text: 'Switch between Coach, Judge, and Opposition modes to train from multiple perspectives.' },
  { title: 'Voice Input', text: 'Press the mic or hit the spacebar to start recording your arguments.' },
  { title: 'Scoring', text: 'Watch your clarity, structure, and persuasiveness scores update live after each round.' },
  { title: 'Coach Feedback', text: 'Click “Coach Feedback” at any time to receive personalized improvement tips.' },
  { title: 'Start Debating', text: 'You’re ready! Press “Start Debate Mode” and choose who goes first.' }
];
let onboardingStep = 0;

function showOnboardingStep(index) {
  if (!onboardingModal) return;
  onboardingStep = index;
  const step = onboardingSteps[index];
  if (onboardingTitle) onboardingTitle.textContent = step.title;
  if (onboardingText) onboardingText.textContent = step.text;
  if (onboardingPrev) onboardingPrev.style.display = index === 0 ? 'none' : 'inline-block';
  if (onboardingNext) onboardingNext.textContent = index === onboardingSteps.length - 1 ? 'Finish' : 'Next';
}
function startOnboarding() {
  if (!onboardingModal) return;
  onboardingModal.classList.remove('hidden');
  showOnboardingStep(0);
}
function endOnboarding() {
  if (!onboardingModal) return;
  onboardingModal.classList.add('hidden');
  try { localStorage.setItem('mootieOnboarded', 'true'); } catch {}
}

if (onboardingNext) onboardingNext.addEventListener('click', () => {
  if (onboardingStep < onboardingSteps.length - 1) showOnboardingStep(onboardingStep + 1);
  else endOnboarding();
});
if (onboardingPrev) onboardingPrev.addEventListener('click', () => {
  if (onboardingStep > 0) showOnboardingStep(onboardingStep - 1);
});
if (helpButton && helpOverlay) {
  helpButton.addEventListener('click', () => helpOverlay.classList.toggle('hidden'));
}
if (closeHelp && helpOverlay) {
  closeHelp.addEventListener('click', () => helpOverlay.classList.add('hidden'));
}
