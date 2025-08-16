const conversation = document.getElementById("conversation");
const userInput = document.getElementById("userInput");
const chatForm = document.getElementById("chatForm");
const recordBtn = document.getElementById("recordBtn");
const uploadBtn = document.getElementById("uploadBtn");
const listBtn = document.getElementById("listBtn");
const documentInput = document.getElementById("documentInput");
const liveToggle = document.getElementById("liveToggle");

let mediaRecorder;
let audioChunks = [];
let sessionId = localStorage.getItem("moot_session") || crypto.randomUUID();
localStorage.setItem("moot_session", sessionId);

// Settings
let autoPlay = true;       // auto-play assistant audio
let liveMode = false;      // auto-start mic after assistant finishes
let liveRecordMs = 7000;   // live mode record duration (ms), tweak as you like

// Helpful: user has interacted? (autoplay policies)
let userInteracted = false;
["click","keydown","touchstart"].forEach(evt => {
  window.addEventListener(evt, () => { userInteracted = true; }, { once: true });
});

function addMessage(role, text, audioBase64) {
  const card = document.createElement("div");
  card.className = `message ${role}`;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = role === "user" ? "You" : "MOOT AI";
  const body = document.createElement("div");
  body.className = "body";
  body.innerHTML = (window.marked ? marked.parse(text) : text);
  card.appendChild(meta);
  card.appendChild(body);

  if (audioBase64) {
    const audio = document.createElement("audio");
    audio.src = `data:audio/mp3;base64,${audioBase64}`;
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true"); // iOS
    audio.setAttribute("autoplay", "true");    // hint
    card.appendChild(audio);

    // Try immediate playback
    const tryPlay = () => {
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          // If blocked by autoplay policy, show a tiny prompt
          if (!userInteracted) {
            const hint = document.createElement("div");
            hint.className = "meta";
            hint.textContent = "🔈 Tap anywhere to allow audio autoplay.";
            card.appendChild(hint);
          }
        });
      }
    };
    if (autoPlay) tryPlay();

    // After it ends, optionally trigger live mic
    audio.addEventListener("ended", () => {
      if (liveMode) {
        startTimedRecording(liveRecordMs);
      }
    });
  }

  conversation.appendChild(card);
  conversation.scrollTop = conversation.scrollHeight;
}

async function sendTextMessage() {
  const text = userInput.value.trim();
  if (!text) return;
  addMessage("user", text);
  userInput.value = "";

  const response = await fetch("/api/send-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sessionId })
  });

  // If the route is missing, avoid JSON.parse on HTML
  if (!response.ok) {
    const raw = await response.text();
    addMessage("assistant", `⚠️ API error (${response.status}): ${raw.slice(0,120)}...`);
    return;
    }

  const data = await response.json();
  if (data.error) {
    addMessage("assistant", `⚠️ ${data.error}`);
    return;
  }
  addMessage("assistant", data.assistantResponse || "(no response)", data.assistantAudio);
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendTextMessage();
});

// Press-and-hold voice recording
recordBtn.addEventListener("mousedown", () => startRecording());
recordBtn.addEventListener("touchstart", () => startRecording(), { passive: true });
recordBtn.addEventListener("mouseup", () => stopRecording());
recordBtn.addEventListener("mouseleave", () => stopRecording());
recordBtn.addEventListener("touchend", () => stopRecording());

// Spacebar push-to-talk (hold)
let spaceDown = false;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !spaceDown && !isTypingInInput()) {
    e.preventDefault();
    spaceDown = true;
    startRecording();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && spaceDown) {
    e.preventDefault();
    spaceDown = false;
    stopRecording();
  }
});
function isTypingInInput() {
  const el = document.activeElement;
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");
      formData.append("sessionId", sessionId);
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });

      if (!res.ok) {
        const raw = await res.text();
        addMessage("assistant", `⚠️ Transcribe error (${res.status}): ${raw.slice(0,120)}...`);
        return;
      }

      const data = await res.json();
      if (data.error) {
        addMessage("assistant", `⚠️ ${data.error}`);
        return;
      }
      if (data.text) {
        addMessage("user", data.text);
        const follow = await fetch("/api/send-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: data.text, sessionId })
        });

        if (!follow.ok) {
          const raw = await follow.text();
          addMessage("assistant", `⚠️ Chat error (${follow.status}): ${raw.slice(0,120)}...`);
          return;
        }

        const out = await follow.json();
        if (out.error) addMessage("assistant", `⚠️ ${out.error}`);
        else addMessage("assistant", out.assistantResponse || "(no response)", out.assistantAudio);
      }
    };
    mediaRecorder.start();
  } catch (err) {
    addMessage("assistant", "⚠️ Microphone access denied.");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

// Timed auto-record for live mode
async function startTimedRecording(ms = liveRecordMs) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");
      formData.append("sessionId", sessionId);
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });

      if (!res.ok) {
        const raw = await res.text();
        addMessage("assistant", `⚠️ Transcribe error (${res.status}): ${raw.slice(0,120)}...`);
        return;
      }

      const data = await res.json();
      if (data?.text) {
        addMessage("user", data.text);
        const follow = await fetch("/api/send-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: data.text, sessionId })
        });

        if (!follow.ok) {
          const raw = await follow.text();
          addMessage("assistant", `⚠️ Chat error (${follow.status}): ${raw.slice(0,120)}...`);
          return;
        }

        const out = await follow.json();
        addMessage("assistant", out.assistantResponse || "(no response)", out.assistantAudio);
      }
    };
    mediaRecorder.start();
    setTimeout(() => { if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop(); }, ms);
  } catch (e) {
    addMessage("assistant", "⚠️ Microphone access denied.");
  }
}

// Upload doc => attach to vector store
uploadBtn.addEventListener("click", async () => {
  const file = documentInput.files && documentInput.files[0];
  if (!file) return alert("Choose a file first.");
  const form = new FormData();
  form.append("document", file, file.name);
  const res = await fetch("/api/upload-document", { method: "POST", body: form });

  if (!res.ok) {
    const raw = await res.text();
    alert("Upload error: " + raw.slice(0,200));
    return;
  }

  const data = await res.json();
  if (data.error) alert("Upload error: " + data.error);
  else {
    alert("Uploaded and attached.");
    await refreshVectorList();
  }
});

listBtn.addEventListener("click", async () => {
  await refreshVectorList(true);
});

async function refreshVectorList(toggle=false) {
  const res = await fetch("/api/vector-store");
  if (!res.ok) {
    // Don’t JSON-parse HTML
    const raw = await res.text();
    console.warn("vector-store route failed:", res.status, raw.slice(0,120));
    return;
  }
  const data = await res.json();
  const holder = document.getElementById("vectorList");
  if (!holder) return;
  if (toggle) holder.style.display = holder.style.display === "none" ? "block" : "none";
  holder.innerHTML = "<h2>Grounding Sources</h2>";
  if (!data.vectors || !data.vectors.length) {
    holder.innerHTML += "<div class='item'><span class='dot'></span>No files in vector store.</div>";
    return;
  }
  data.vectors.forEach(f => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<span class="dot"></span> <span>${f.filename}</span>`;
    holder.appendChild(row);
  });
}

// Live Mode toggle
liveToggle.addEventListener("click", () => {
  liveMode = !liveMode;
  liveToggle.classList.toggle("live-on", liveMode);
  const dot = liveToggle.querySelector(".live-dot");
  if (dot) dot.style.display = liveMode ? "inline-block" : "none";
});

// initial load
refreshVectorList();
