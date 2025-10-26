// client.js
// This script powers the enhanced Mootie interface.  It manages
// mode selection, message submission, recording/transcription,
// file uploads, scoring, transcripts and live debate mode.  All UI
// elements are queried by ID at start to avoid repeated DOM
// lookups.  If you extend functionality, keep functions small and
// pure where possible.


// Debate Setup Modal refs (v4)
const debateSetupModal = document.getElementById('debateSetupModal');
const debateSetupForm = document.getElementById('debateSetupForm');
const debateOpening = document.getElementById('debateOpening');
const debateRebuttal = document.getElementById('debateRebuttal');
const debateClosing = document.getElementById('debateClosing');
const debateStarter = document.getElementById('debateStarter');
const debateCancel = document.getElementById('debateCancel');
const enableCoachFeedback = document.getElementById('enableCoachFeedback');
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
  // Debate rounds configuration
  debateRounds: [
    { label: 'Opening', duration: 120 },
    { label: 'Rebuttal', duration: 120 },
    { label: 'Closing', duration: 120 }
  ],
  currentRoundIndex: 0,
  currentTurn: 0, // 0 = user, 1 = AI
  speakerFirstUser: true,
  debateTurnCount: 0
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
const coachFeedbackBtn = document.getElementById('coachFeedbackBtn');
// Debate status elements
const debateStatus = document.getElementById('debateStatus');
const roundLabel = document.getElementById('roundLabel');
const turnLabel = document.getElementById('turnLabel');
const progressFill = document.getElementById('progressFill');
const nextRoundBtn = document.getElementById('nextRoundBtn');

// Debate Engine v4 helpers
function v4OpenDebateSetup() {
  if (!debateSetupModal) { try { startDebate(); } catch(e){} return; }
  debateSetupModal.classList.remove('hidden');
}
function v4CloseDebateSetup() {
  if (debateSetupModal) debateSetupModal.classList.add('hidden');
}
function v4StartDebateFromConfig() {
  if (!debateSetupModal || !debateOpening || !debateRebuttal || !debateClosing || !debateStarter) { try { startDebate(); } catch(e){} return; }
  try {
    const opening = Math.max(15, Math.min(600, parseInt(debateOpening.value || '60', 10)));
    const rebuttal = Math.max(15, Math.min(600, parseInt(debateRebuttal.value || '45', 10)));
    const closing = Math.max(15, Math.min(600, parseInt(debateClosing.value || '30', 10)));
    const starter = (debateStarter.value === 'mootie') ? 'mootie' : 'you';
    try { state.debateRounds = [{ label: 'Opening', duration: opening }, { label: 'Rebuttal', duration: rebuttal }, { label: 'Closing', duration: closing }]; } catch(_){}
    try { state.speakerFirstUser = (starter !== 'mootie'); } catch(_){}
    try { state.enableCoachFeedback = !!(enableCoachFeedback && enableCoachFeedback.checked); } catch(_){}
  } catch(_){}
  v4CloseDebateSetup();
  try { startDebate(); } catch(e){ console.error('startDebate error', e); }
}

// Onboarding and help elements
const onboardingModal = document.getElementById('onboardingModal');
const onboardingTitle = document.getElementById('onboardingTitle');
const onboardingText = document.getElementById('onboardingText');
const onboardingNext = document.getElementById('onboardingNext');
const onboardingPrev = document.getElementById('onboardingPrev');
const helpButton = document.getElementById('helpButton');
const helpOverlay = document.getElementById('helpOverlay');
const closeHelp = document.getElementById('closeHelp');
// Score rows
const scoreRows = {
  clarity: document.getElementById('scoreClarity'),
  structure: document.getElementById('scoreStructure'),
  authority: document.getElementById('scoreAuthority'),
  responsiveness: document.getElementById('scoreResponsiveness'),
  persuasiveness: document.getElementById('scorePersuasiveness')
};

// Simple beep utility using Web Audio API.  Generates a short tone to
// indicate start/stop of recording without needing external audio assets.
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
    console.error('beep error:', e);
  }
}

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
  // Coach feedback
  coachFeedbackBtn.addEventListener('click', getCoachFeedback);
  // Space bar microphone trigger
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      // do not capture if typing in textarea or other input
      const active = document.activeElement;
      if (active !== textInput && active !== recordBtn && !state.recording) {
        e.preventDefault();
        startRecording();
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      const active = document.activeElement;
      if (active !== textInput && active !== recordBtn && state.recording) {
        e.preventDefault();
        stopRecording();
      }
    }
  });
  // Initial data
  refreshVectorList();
  updateScoreUI();
  // v4 debate setup hooks
  try {
    if (debateToggle) {
      debateToggle.addEventListener('click', (e) => {
        if (!state.debate) {
          e.stopImmediatePropagation();
          e.preventDefault();
          v4OpenDebateSetup();
        }
      }, { capture: true });
    }
    if (debateCancel) debateCancel.addEventListener('click', v4CloseDebateSetup);
    if (debateSetupForm) debateSetupForm.addEventListener('submit', (e) => { e.preventDefault(); v4StartDebateFromConfig(); });
  } catch(e) { console.warn('v4 hook error', e); }

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
    const result = await res.json();
    showTyping(false);
    if (!result || result.success === false) {
      const errMsg = result?.error || 'An error occurred';
      addMessage('assistant', `Error: ${errMsg}`);
      return;
    }
    const payload = result.data || result;
    const reply = payload.assistantResponse || payload.assistant || payload.text || '';
    const references = payload.references || [];
    addMessage('assistant', reply, references);
    if (reply) {
      await scoreMessage(reply);
    }
    // Play audio if present
    if (payload.assistantAudio) {
      tryPlayAudio(payload.assistantAudio);
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
    try { document.body.classList.add('user-speaking'); } catch(_){ }
    state.audioChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      // stop pulsing and beep at end
      recordBtn.classList.remove('active');
      recordBtn.classList.remove('pulsing');
      state.recording = false;
      beep();
      const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
      // send to server
      const formData = new FormData();
      formData.append('audio', blob, 'speech.webm');
      try {
        const resp = await fetch('/api/transcribe', { method: 'POST', body: formData });
        const out = await resp.json();
        if (!out || out.success === false) {
          const msg = out?.error || 'Failed to transcribe audio.';
          addMessage('assistant', msg);
          return;
        }
        const payload = out.data || out;
        if (payload && payload.text) {
          textInput.value = payload.text;
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
    recordBtn.classList.add('pulsing');
    // beep on start
    beep();
  } catch (e) {
    console.error('recording error:', e);
    addMessage('assistant', 'Unable to access microphone.');
  }
}

function stopRecording() {
  if (!state.recording || !state.mediaRecorder) return;
  state.mediaRecorder.stop();
  try { document.body.classList.remove('user-speaking'); } catch(_){ }
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
    const out = await res.json();
    let vectors = [];
    if (out && out.success !== false) {
      const data = out.data || out;
      vectors = data.vectors || data.files || [];
    }
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
    if (!vectors.length) {
      sourceList.innerHTML = '<li class="empty">No sources uploaded</li>';
    }
  } catch (e) {
    console.error('vector list error:', e);
    sourceList.innerHTML = '<li class="empty">Unable to load sources</li>';
  }
}

async function deleteFile(fileId) {
  const startTime = performance.now();
  const groupName = `[deleteFile ${fileId}]`;
  console.groupCollapsed(groupName);

  try {
    if (!fileId) {
      console.error('❌ No fileId provided to deleteFile()');
      alert('Delete failed: fileId missing.');
      console.groupEnd(groupName);
      return;
    }

    console.log('🧭 Starting deleteFile at', new Date().toLocaleTimeString());
    console.log('📦 File ID:', fileId);

    const endpoint = `/api/delete-file?fileId=${encodeURIComponent(fileId)}&debug=1`;
    console.log('🔗 Request URL:', endpoint);

    const res = await fetch(endpoint, { method: 'DELETE' });
    console.log('📡 Response received:', res.status, res.statusText);

    // Try reading as JSON; if not JSON, fallback to text
    let data;
    try {
      data = await res.json();
    } catch (err) {
      console.warn('⚠️ Response not JSON, trying text...', err);
      const txt = await res.text();
      console.log('Raw text:', txt);
      data = { raw: txt };
    }

    console.log('🧩 Full response body:', data);

    if (!res.ok || !data?.success) {
      console.warn('❌ Delete failed:', data?.error || `HTTP ${res.status}`);
      alert(`Delete failed: ${data?.error || 'Unknown error'}`);
    } else {
      console.log('✅ File deleted successfully.');
      alert('✅ File deleted successfully!');
    }

    console.log('⏱️ Duration:', (performance.now() - startTime).toFixed(1), 'ms');
    console.groupEnd(groupName);

    // Refresh file list afterward
    await refreshVectorList();
  } catch (err) {
    console.error('💥 Uncaught error during deleteFile:', err);
    alert(`Delete failed: ${err.message}`);
    console.groupEnd(groupName);
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

// Request coach feedback summary from server and display as a message
async function getCoachFeedback() {
  try {
    const resp = await fetch('/api/ai-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: state.transcript })
    });
    const out = await resp.json();
    if (!out || out.success === false) {
      const msg = out?.error || 'Failed to fetch coach feedback.';
      addMessage('assistant', msg);
      return;
    }
    const notes = out.data?.notes;
    if (notes) {
      addMessage('assistant', `Coach Feedback: ${notes}`);
    } else {
      addMessage('assistant', 'No feedback available.');
    }
  } catch (err) {
    console.error('coach feedback error:', err);
    addMessage('assistant', 'Failed to fetch coach feedback.');
  }
}

// Debate mode
function toggleDebateMode() {
  if (state.debate) {
    // End debate
    endDebate();
  } else {
    // Start debate
    startDebate();
  }
}

// Initialize debate: ask user for starting side and begin first round
function startDebate() {
  state.debate = true;
  // Choose starting speaker via confirm (OK => user, Cancel => AI)
  try {
    const userFirst = window.confirm('Would you like to go first?\nOK = You, Cancel = Mootie');
    state.speakerFirstUser = userFirst;
  } catch (e) {
    state.speakerFirstUser = true;
  }
  state.currentRoundIndex = 0;
  state.debateTurnCount = 0;
  debateToggle.textContent = '⏹️ Stop Debate Mode';
  // Show status area
  debateStatus.classList.remove('hidden');
  startRound();
}

// Begin a round
function startRound() {
  const round = state.debateRounds[state.currentRoundIndex];
  if (!round) {
    endDebate();
    return;
  }
  // Determine starting speaker for this round: alternate each round
  const startUser = state.speakerFirstUser ? 0 : 1;
  // If odd round, invert starting speaker
  state.currentTurn = (state.currentRoundIndex % 2 === 0 ? startUser : 1 - startUser);
  state.debateRemaining = round.duration;
  state.debateTurnCount = 0;
  // Update labels
  roundLabel.textContent = round.label;
  turnLabel.textContent = state.currentTurn === 0 ? 'Your Turn' : "Mootie's Turn";
  // Update session info
  updateDebateDisplay();
  // Start timer interval
  if (state.debateTimer) clearInterval(state.debateTimer);
  state.debateTimer = setInterval(() => {
    state.debateRemaining--;
    if (state.debateRemaining <= 0) {
      handleTurnEnd();
    }
    updateDebateDisplay();
  }, 1000);
}

// Handle end of a turn within a round
function handleTurnEnd() {
  const round = state.debateRounds[state.currentRoundIndex];
  if (!round) {
    endDebate();
    return;
  }
  if (state.debateTurnCount === 0) {
    // Switch to other speaker for second half of this round
    state.debateTurnCount = 1;
    state.currentTurn = 1 - state.currentTurn;
    state.debateRemaining = round.duration;
    turnLabel.textContent = state.currentTurn === 0 ? 'Your Turn' : "Mootie's Turn";
  } else {
    // Completed both turns for this round
    nextRound();
  }
}

// Proceed to next round
function nextRound() {
  state.currentRoundIndex++;
  if (state.currentRoundIndex >= state.debateRounds.length) {
    endDebate();
    return;
  }
  startRound();
}

// End the debate and clean up
function endDebate() {
  state.debate = false;
  clearInterval(state.debateTimer);
  state.debateTimer = null;
  // Hide status area
  debateStatus.classList.add('hidden');
  debateToggle.textContent = '🗣️ Start Debate Mode';
  sessionInfo.textContent = `Mode: ${state.mode.charAt(0).toUpperCase() + state.mode.slice(1)}`;
}

// Update debate UI display each tick
function updateDebateDisplay() {
  if (!state.debate) return;
  const round = state.debateRounds[state.currentRoundIndex];
  const total = round ? round.duration : 1;
  const percent = Math.max(0, Math.min(1, (total - state.debateRemaining) / total)) * 100;
  progressFill.style.width = percent + '%';
  const mins = Math.floor(state.debateRemaining / 60);
  const secs = state.debateRemaining % 60;
  const timerString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  sessionInfo.textContent = `Debate: ${round?.label || ''} – ${timerString}`;
}

// Audio playback helper
function tryPlayAudio(base64) {
  try { if (state && state.debate && state.currentTurn === 1) { document.body.classList.add('ai-speaking'); v4PauseDebateTimer(); } } catch(_){}
  try {
try {
    const audio = new Audio('data:audio/mp3;base64,' + base64);
    audio.play();
  
    try {
      if (state && state.debate && state.currentTurn === 1) {
        document.body.classList.remove('ai-speaking');
        v4ResumeDebateTimer();
        handleTurnEnd();
      }
    } catch(_){}
  } catch (e) {
    console.error('audio playback error:', e);
    try {
      if (state && state.debate && state.currentTurn === 1) {
        document.body.classList.remove('ai-speaking');
        v4ResumeDebateTimer();
        handleTurnEnd();
      }
    } catch(_){}
  }
} catch (e) {
    console.error('audio playback error:', e);
  }
}

// ================= Onboarding and Help System =================
// Array of onboarding steps with title and description
const onboardingSteps = [
  {
    title: 'Welcome to Mootie ⚖️',
    text: 'Your AI Moot Court Coach helps you practice arguments and improve your reasoning skills.'
  },
  {
    title: 'Modes',
    text: 'Switch between Coach, Judge, and Opposition modes to train from multiple perspectives.'
  },
  {
    title: 'Voice Input',
    text: 'Press the mic or hit the spacebar to start recording your arguments.'
  },
  {
    title: 'Scoring',
    text: 'Watch your clarity, structure, and persuasiveness scores update live after each round.'
  },
  {
    title: 'Coach Feedback',
    text: 'Click “Coach Feedback” at any time to receive personalized improvement tips.'
  },
  {
    title: 'Start Debating',
    text: 'You’re ready! Press “Start Debate Mode” and choose who goes first.'
  }
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
  try {
    localStorage.setItem('mootieOnboarded', 'true');
  } catch (e) {
    // ignore storage errors silently
  }
}

// Attach onboarding navigation listeners
if (onboardingNext) {
  onboardingNext.addEventListener('click', () => {
    if (onboardingStep < onboardingSteps.length - 1) {
      showOnboardingStep(onboardingStep + 1);
    } else {
      endOnboarding();
    }
  });
}
if (onboardingPrev) {
  onboardingPrev.addEventListener('click', () => {
    if (onboardingStep > 0) {
      showOnboardingStep(onboardingStep - 1);
    }
  });
}

// Help overlay toggle handlers
if (helpButton && helpOverlay) {
  helpButton.addEventListener('click', () => {
    helpOverlay.classList.toggle('hidden');
  });
}
if (closeHelp && helpOverlay) {
  closeHelp.addEventListener('click', () => {
    helpOverlay.classList.add('hidden');
  });
}

// Show onboarding modal on first visit
window.addEventListener('load', () => {
  try {
    const seen = localStorage.getItem('mootieOnboarded');
    if (!seen) {
      setTimeout(() => {
        startOnboarding();
      }, 600);
    }
  } catch (e) {
    // In private browsing or storage unavailable, still show onboarding
    setTimeout(() => {
      startOnboarding();
    }, 600);
  }
});
function v4PauseDebateTimer() {
  if (state.debateTimer) { clearInterval(state.debateTimer); state.debateTimer = null; }
}
function v4ResumeDebateTimer() {
  if (!state.debate) return;
  if (state.debateTimer) return;
  state.debateTimer = setInterval(() => {
    try {
      state.debateRemaining--;
      if (state.debateRemaining <= 0) { handleTurnEnd(); }
      updateDebateDisplay();
    } catch(e) { console.warn('timer tick error', e); }
  }, 1000);
}
