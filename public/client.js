// client.js
// This script powers the enhanced Mootie interface.  It manages
// mode selection, message submission, recording/transcription,
// file uploads, scoring, transcripts and live debate mode.  All UI
// elements are queried by ID at start to avoid repeated DOM
// lookups.  If you extend functionality, keep functions small and
// pure where possible.

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
  debateRemaining: 0
};

// Cache DOM nodes
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
const sourceList = document.getElementById('sourceList');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const exportBtn = document.getElementById('exportTranscript');
const transcriptList = document.getElementById('transcriptList');
// Score rows
const scoreRows = {
  clarity: document.getElementById('scoreClarity'),
  structure: document.getElementById('scoreStructure'),
  authority: document.getElementById('scoreAuthority'),
  responsiveness: document.getElementById('scoreResponsiveness'),
  persuasiveness: document.getElementById('scorePersuasiveness')
};

// Restore state and attach listeners on load
window.addEventListener('DOMContentLoaded', () => {
  const savedMode = localStorage.getItem('mootieMode');
  if (savedMode) state.mode = savedMode;
  applyMode(state.mode);
  // Mode buttons
  modeCoach.addEventListener('click', () => setMode('coach'));
  modeJudge.addEventListener('click', () => setMode('judge'));
  modeOpposition.addEventListener('click', () => setMode('opposition'));
  // Send button
  sendBtn.addEventListener('click', handleSend);
  // Enter key to send
  textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  // Recording events (mouse and touch)
  recordBtn.addEventListener('mousedown', startRecording);
  recordBtn.addEventListener('mouseup', stopRecording);
  recordBtn.addEventListener('mouseleave', () => { if (state.recording) stopRecording(); });
  recordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
  recordBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });
  // Upload
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleUpload);
  // Export transcript
  exportBtn.addEventListener('click', exportTranscript);
  // Debate toggle
  debateToggle.addEventListener('click', toggleDebateMode);
  // Initial data
  refreshVectorList();
  updateScoreUI();
});

function setMode(mode) {
  state.mode = mode;
  localStorage.setItem('mootieMode', mode);
  applyMode(mode);
}

function applyMode(mode) {
  // toggle button classes
  [modeCoach, modeJudge, modeOpposition].forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  // Set accent color depending on mode
  let color;
  if (mode === 'judge') color = getComputedStyle(document.documentElement).getPropertyValue('--judge-color');
  else if (mode === 'opposition') color = getComputedStyle(document.documentElement).getPropertyValue('--opposition-color');
  else color = getComputedStyle(document.documentElement).getPropertyValue('--coach-color');
  document.documentElement.style.setProperty('--accent', color.trim());
  // update session info
  sessionInfo.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
}

async function handleSend() {
  const text = textInput.value.trim();
  if (!text) return;
  // Clear input
  textInput.value = '';
  addMessage('user', text);
  showTyping(true);
  try {
    const res = await fetch('/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, message: text, mode: state.mode })
    });
    const data = await res.json();
    showTyping(false);
    if (data.error) {
      addMessage('assistant', `Error: ${data.error}`);
      return;
    }
    const reply = data.assistantResponse || data.assistant || data.text || '';
    const references = data.references || [];
    addMessage('assistant', reply, references);
    if (reply) {
      await scoreMessage(reply);
    }
    // Play audio if present
    if (data.assistantAudio) {
      tryPlayAudio(data.assistantAudio);
    }
  } catch (e) {
    console.error('send error:', e);
    showTyping(false);
    addMessage('assistant', 'An error occurred while contacting the server.');
  }
}

function addMessage(role, text, references = []) {
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
  // store transcript
  state.transcript.push({ role, text, time: now.toISOString(), references });
  updateTranscriptUI();
}

function showTyping(show) {
  typingIndicator.classList.toggle('hidden', !show);
}

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
      state.scores[key].push(out.data[key]);
    });
    updateScoreUI();
    // Attach notes as system message after scoring
    if (notes) {
      addMessage('assistant', `Coach Note: ${notes}`);
    }
  } catch (err) {
    console.error('score error:', err);
  }
}

function updateScoreUI() {
  Object.keys(scoreRows).forEach(key => {
    const values = state.scores[key];
    const avg = values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
    const row = scoreRows[key];
    const bar = row.querySelector('.fill');
    const valueSpan = row.querySelector('.value');
    bar.style.width = `${Math.min(100, avg * 10)}%`;
    valueSpan.textContent = avg.toFixed(1);
  });
}

function updateTranscriptUI() {
  transcriptList.innerHTML = '';
  state.transcript.forEach((entry, index) => {
    const div = document.createElement('div');
    div.className = 'transcript-entry';
    const mode = state.mode;
    const timeStr = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.textContent = `${entry.role === 'user' ? 'You' : 'Mootie'} [${timeStr}]: ${entry.text}`;
    transcriptList.appendChild(div);
  });
}

// Recording logic
async function startRecording() {
  if (state.recording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder = mediaRecorder;
    state.audioChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      recordBtn.classList.remove('active');
      state.recording = false;
      const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
      // send to server
      const formData = new FormData();
      formData.append('audio', blob, 'speech.webm');
      try {
        const resp = await fetch('/api/transcribe', { method: 'POST', body: formData });
        const out = await resp.json();
        if (out && out.text) {
          textInput.value = out.text;
          handleSend();
        }
      } catch (e) {
        console.error('transcribe error:', e);
        addMessage('assistant', 'Failed to transcribe audio.');
      }
    };
    mediaRecorder.start();
    state.recording = true;
    recordBtn.classList.add('active');
  } catch (e) {
    console.error('recording error:', e);
    addMessage('assistant', 'Unable to access microphone.');
  }
}

function stopRecording() {
  if (!state.recording || !state.mediaRecorder) return;
  state.mediaRecorder.stop();
}

// Upload document
async function handleUpload(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  for (const file of files) {
    const formData = new FormData();
    formData.append('document', file, file.name);
    try {
      await fetch('/api/upload-document', { method: 'POST', body: formData });
    } catch (err) {
      console.error('upload error:', err);
      addMessage('assistant', `Failed to upload ${file.name}.`);
    }
  }
  fileInput.value = '';
  refreshVectorList();
}

async function refreshVectorList() {
  try {
    const res = await fetch('/api/vector-store');
    const data = await res.json();
    const vectors = data.vectors || data.files || [];
    sourceList.innerHTML = '';
    vectors.forEach(file => {
      const li = document.createElement('li');
      li.textContent = file.filename || file.name || 'Unnamed';
      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', () => deleteFile(file.id));
      li.appendChild(delBtn);
      sourceList.appendChild(li);
    });
  } catch (e) {
    console.error('vector list error:', e);
    sourceList.innerHTML = '<li class="empty">Unable to load sources</li>';
  }
}

async function deleteFile(fileId) {
  if (!fileId) return;
  try {
    await fetch(`/api/delete-file?fileId=${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    refreshVectorList();
  } catch (e) {
    console.error('delete file error:', e);
  }
}

// Export transcript
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
  a.href = url;
  a.download = 'mootie_transcript.txt';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 0);
}

// Debate mode
function toggleDebateMode() {
  state.debate = !state.debate;
  if (state.debate) {
    startDebateTimer();
    debateToggle.textContent = '⏹️ Stop Debate Mode';
    sessionInfo.textContent = 'Debate mode – your turn';
  } else {
    stopDebateTimer();
    debateToggle.textContent = '🗣️ Start Debate Mode';
    sessionInfo.textContent = `Mode: ${state.mode.charAt(0).toUpperCase() + state.mode.slice(1)}`;
  }
}

function startDebateTimer() {
  // 2 minutes per turn (120 seconds)
  state.debateRemaining = 120;
  updateDebateDisplay();
  if (state.debateTimer) clearInterval(state.debateTimer);
  state.debateTimer = setInterval(() => {
    state.debateRemaining--;
    updateDebateDisplay();
    if (state.debateRemaining <= 0) {
      // swap to AI or user turn
      state.debateRemaining = 120;
      // Optionally toggle speaker indicator (not implemented)
    }
  }, 1000);
}

function stopDebateTimer() {
  clearInterval(state.debateTimer);
  state.debateTimer = null;
}

function updateDebateDisplay() {
  const mins = Math.floor(state.debateRemaining / 60);
  const secs = state.debateRemaining % 60;
  const timerString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  sessionInfo.textContent = `Debate mode – ${timerString}`;
}

// Audio playback helper
function tryPlayAudio(base64) {
  try {
    const audio = new Audio('data:audio/mp3;base64,' + base64);
    audio.play();
  } catch (e) {
    console.error('audio playback error:', e);
  }
}