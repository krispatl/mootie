/*
 * Client‑side logic for the MOOT AI interface. This script wires up
 * DOM interactions, sends requests to the API routes, handles speech
 * recording and transcription, and updates the UI accordingly.
 */

(() => {
  // Grab essential DOM nodes. These IDs match the markup defined
  // in index.html. If you change the markup please update these too.
  const conversation = document.getElementById('conversation');
  const userInput = document.getElementById('userInput');
  const chatForm = document.getElementById('chatForm');
  const recordBtn = document.getElementById('recordBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const listBtn = document.getElementById('listBtn');
  const documentInput = document.getElementById('documentInput');
  const liveToggle = document.getElementById('liveToggle');
  const vectorList = document.getElementById('vectorList');
  const modeChips = document.getElementById('modeChips');

  // Session state
  let mediaRecorder;
  let audioChunks = [];
  const sessionId = localStorage.getItem('moot_session') || crypto.randomUUID();
  localStorage.setItem('moot_session', sessionId);
  let coachMode = localStorage.getItem('moot_coach_mode') || 'judge';
  let autoPlay = true; // auto‑play assistant audio when allowed
  let liveMode = false; // automatically record after assistant finishes
  const liveRecordMs = 7000; // default length for timed recordings

  // Track whether the user has interacted with the page at least once.
  let userInteracted = false;
  ['click', 'keydown', 'touchstart'].forEach((evt) => {
    window.addEventListener(
      evt,
      () => {
        userInteracted = true;
      },
      { once: true }
    );
  });

  /**
   * Set the current coach mode and update UI state. This persists
   * the selection in localStorage so it survives reloads.
   * @param {string} mode
   */
  function setCoachMode(mode) {
    coachMode = mode;
    localStorage.setItem('moot_coach_mode', mode);
    // Update chip classes
    if (modeChips) {
      modeChips.querySelectorAll('button.chip').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
      });
    }
  }
  // Initialise selected mode on page load
  setCoachMode(coachMode);

  /**
   * Append a message card to the conversation. If an audio clip is
   * provided it will be rendered below the text and auto‑played if
   * allowed. Messages scroll into view automatically.
   * @param {'user'|'assistant'} role
   * @param {string} text
   * @param {string|null} audioBase64
   */
  function addMessage(role, text, audioBase64) {
    const card = document.createElement('div');
    card.className = `message ${role}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = role === 'user' ? 'You' : 'MOOT AI';
    const body = document.createElement('div');
    body.className = 'body';
    // Use marked.js for Markdown rendering if available, otherwise fall back
    if (window.marked && typeof window.marked.parse === 'function') {
      body.innerHTML = window.marked.parse(text);
    } else {
      // Escape HTML to prevent injection; convert basic newlines to <br>
      body.textContent = text;
    }
    card.appendChild(meta);
    card.appendChild(body);
    if (audioBase64) {
      const audio = document.createElement('audio');
      audio.src = `data:audio/mp3;base64,${audioBase64}`;
      audio.preload = 'auto';
      audio.setAttribute('playsinline', 'true');
      audio.controls = true;
      card.appendChild(audio);
      const tryPlay = () => {
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          p.catch(() => {
            // If blocked by autoplay policy, show a hint on the card
            if (!userInteracted) {
              const hint = document.createElement('div');
              hint.className = 'meta';
              hint.textContent = ' Tap anywhere to allow audio playback.';
              card.appendChild(hint);
            }
          });
        }
      };
      if (autoPlay) tryPlay();
      // Trigger recording after audio ends if live mode is on
      audio.addEventListener('ended', () => {
        if (liveMode) startTimedRecording(liveRecordMs);
      });
    }
    conversation.appendChild(card);
    conversation.scrollTop = conversation.scrollHeight;
  }

  /**
   * Submit a text message to the server and handle the assistant reply.
   */
  async function sendTextMessage() {
    const text = userInput.value.trim();
    if (!text) return;
    // Immediately display the user's message
    addMessage('user', text);
    userInput.value = '';
    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
          // Include the coach mode and session ID for future extensibility
        body: JSON.stringify({ text, sessionId, mode: coachMode }),
      });
      if (!response.ok) {
        const raw = await response.text();
        addMessage('assistant', `⚠️ API error (${response.status}): ${raw.slice(0, 120)}...`);
        return;
      }
      const data = await response.json();
      if (data.error) {
        addMessage('assistant', `⚠️ ${data.error}`);
        return;
      }
      addMessage('assistant', data.assistantResponse || '(no response)', data.assistantAudio);
    } catch (err) {
      console.error(err);
      addMessage('assistant', `⚠️ Network error: ${err?.message || String(err)}`);
    }
  }

  // Listen for submit events on the chat form
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendTextMessage();
  });

  /**
   * Determine if the user is currently typing in an input or textarea.
   * This prevents the spacebar from triggering voice recording while
   * composing a message.
   * @returns {boolean}
   */
  function isTypingInInput() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  /**
   * Start recording audio from the user's microphone. When the
   * recording stops, the audio is sent to the transcription endpoint.
   */
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        formData.append('sessionId', sessionId);
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          if (!res.ok) {
            const raw = await res.text();
            addMessage('assistant', `⚠️ Transcribe error (${res.status}): ${raw.slice(0, 120)}...`);
            return;
          }
          const data = await res.json();
          if (data.error) {
            addMessage('assistant', `⚠️ ${data.error}`);
            return;
          }
          if (data.text) {
            addMessage('user', data.text);
            // Immediately send the transcribed text as a chat message
            try {
              const follow = await fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: data.text, sessionId, mode: coachMode }),
              });
              if (!follow.ok) {
                const raw = await follow.text();
                addMessage('assistant', `⚠️ Chat error (${follow.status}): ${raw.slice(0, 120)}...`);
                return;
              }
              const out = await follow.json();
              if (out.error) {
                addMessage('assistant', `⚠️ ${out.error}`);
              } else {
                addMessage('assistant', out.assistantResponse || '(no response)', out.assistantAudio);
              }
            } catch (chatErr) {
              console.error(chatErr);
              addMessage('assistant', `⚠️ Network error: ${chatErr?.message || String(chatErr)}`);
            }
          }
        } catch (err) {
          console.error(err);
          addMessage('assistant', '⚠️ Failed to transcribe audio.');
        }
      };
      mediaRecorder.start();
    } catch (err) {
      console.error(err);
      addMessage('assistant', '⚠️ Microphone access denied.');
    }
  }

  /**
   * Stop recording if active.
   */
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  /**
   * Start a timed recording for live mode. After the given number
   * of milliseconds it automatically stops.
   * @param {number} ms
   */
  async function startTimedRecording(ms = liveRecordMs) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        formData.append('sessionId', sessionId);
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          if (!res.ok) {
            const raw = await res.text();
            addMessage('assistant', `⚠️ Transcribe error (${res.status}): ${raw.slice(0, 120)}...`);
            return;
          }
          const data = await res.json();
          if (data?.text) {
            addMessage('user', data.text);
            // Send to chat endpoint
            try {
              const follow = await fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: data.text, sessionId, mode: coachMode }),
              });
              if (!follow.ok) {
                const raw = await follow.text();
                addMessage('assistant', `⚠️ Chat error (${follow.status}): ${raw.slice(0, 120)}...`);
                return;
              }
              const out = await follow.json();
              addMessage('assistant', out.assistantResponse || '(no response)', out.assistantAudio);
            } catch (errChat) {
              console.error(errChat);
              addMessage('assistant', `⚠️ Network error: ${errChat?.message || String(errChat)}`);
            }
          }
        } catch (err) {
          console.error(err);
          addMessage('assistant', '⚠️ Failed to transcribe audio.');
        }
      };
      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      }, ms);
    } catch (e) {
      console.error(e);
      addMessage('assistant', '⚠️ Microphone access denied.');
    }
  }

  /**
   * Query the vector store and update the list of uploaded files. When
   * toggle is true the list will be shown or hidden. This function
   * gracefully handles errors and keeps the UI responsive.
   * @param {boolean} toggle
   */
  async function refreshVectorList(toggle = false) {
    if (!vectorList) return;
    if (toggle) {
      vectorList.style.display = vectorList.style.display === 'none' ? 'block' : 'none';
    }
    try {
      const res = await fetch('/api/vector-store');
      if (!res.ok) {
        const raw = await res.text();
        console.warn('vector-store route failed:', res.status, raw.slice(0, 120));
        return;
      }
      const data = await res.json();
      vectorList.innerHTML = '';
      const header = document.createElement('h3');
      header.textContent = 'Grounding Sources';
      vectorList.appendChild(header);
      if (!data.vectors || data.vectors.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No files in vector store.';
        vectorList.appendChild(empty);
        return;
      }
      data.vectors.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'item';
        const dot = document.createElement('span');
        dot.className = 'live-dot';
        row.appendChild(dot);
        const name = document.createElement('span');
        name.textContent = f.filename;
        row.appendChild(name);
        vectorList.appendChild(row);
      });
    } catch (err) {
      console.error(err);
    }
  }

  // Attach event listeners to UI elements
  recordBtn.addEventListener('mousedown', () => startRecording());
  recordBtn.addEventListener('touchstart', () => startRecording(), { passive: true });
  recordBtn.addEventListener('mouseup', () => stopRecording());
  recordBtn.addEventListener('mouseleave', () => stopRecording());
  recordBtn.addEventListener('touchend', () => stopRecording());

  // Spacebar push‑to‑talk (hold)
  let spaceDown = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !spaceDown && !isTypingInInput()) {
      e.preventDefault();
      spaceDown = true;
      startRecording();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && spaceDown) {
      e.preventDefault();
      spaceDown = false;
      stopRecording();
    }
  });

  // Upload document and attach to vector store
  uploadBtn.addEventListener('click', async () => {
    const file = documentInput.files && documentInput.files[0];
    if (!file) {
      alert('Choose a file first.');
      return;
    }
    const form = new FormData();
    form.append('document', file, file.name);
    try {
      const res = await fetch('/api/upload-document', { method: 'POST', body: form });
      if (!res.ok) {
        const raw = await res.text();
        alert('Upload error: ' + raw.slice(0, 200));
        return;
      }
      const data = await res.json();
      if (data.error) {
        alert('Upload error: ' + data.error);
      } else {
        alert('Uploaded and attached.');
        await refreshVectorList(false);
      }
    } catch (err) {
      console.error(err);
      alert('Upload failed.');
    }
  });

  // Show or hide the vector list when the Sources button is clicked
  listBtn.addEventListener('click', async () => {
    await refreshVectorList(true);
  });

  // Toggle live mode on click and update the indicator
  liveToggle.addEventListener('click', () => {
    liveMode = !liveMode;
    liveToggle.classList.toggle('live-on', liveMode);
    const dot = liveToggle.querySelector('.live-dot');
    if (dot) dot.style.display = liveMode ? 'inline-block' : 'none';
  });

  // Coach mode chip selection
  modeChips.addEventListener('click', (e) => {
    const btn = e.target.closest('button.chip');
    if (btn) {
      const mode = btn.getAttribute('data-mode');
      if (mode) setCoachMode(mode);
    }
  });

  // Initial load: fetch vector list and set coach mode
  refreshVectorList(false);
})();