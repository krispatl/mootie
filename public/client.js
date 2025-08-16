const conversation = document.getElementById("conversation");
const userInput = document.getElementById("userInput");
const chatForm = document.getElementById("chatForm");
const recordBtn = document.getElementById("recordBtn");
const uploadBtn = document.getElementById("uploadBtn");
const listBtn = document.getElementById("listBtn");
const documentInput = document.getElementById("documentInput");

let mediaRecorder;
let audioChunks = [];
let sessionId = localStorage.getItem("moot_session") || crypto.randomUUID();
localStorage.setItem("moot_session", sessionId);

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
    audio.controls = true;
    audio.src = `data:audio/mp3;base64,${audioBase64}`;
    card.appendChild(audio);
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

// Upload doc => attach to vector store
uploadBtn.addEventListener("click", async () => {
  const file = documentInput.files && documentInput.files[0];
  if (!file) return alert("Choose a file first.");
  const form = new FormData();
  form.append("document", file, file.name);
  const res = await fetch("/api/upload-document", { method: "POST", body: form });
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

// initial load
refreshVectorList();
