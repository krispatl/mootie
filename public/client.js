
const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

let coachMode = localStorage.getItem('coachMode') || 'coach';
document.body.setAttribute('data-mode', coachMode);
let messages = [];
let uploadedFiles = [];
let mediaRecorder, analyser, audioCtx, raf;
let isRecording = false;

const elMsgs = $('#messages');
const elTyping = $('#typingWrap');
const elText = $('#text');
const elSend = $('#send');
const elRecord = $('#btnRecord');
const elExport = $('#btnExport');
const elChoose = $('#choose');
const elFile = $('#file');
const elFiles = $('#files');
const elUp = $('#upProg');
const elUpBar = $('#upBar');
const elScore = $('#btnScore');
const elBars = $('#scoreBars');
const elNotes = $('#btnNotes');
const canvas = $('#vizWave');
const ctx2d = canvas.getContext('2d');

function fmtTime(ts){ const d=new Date(ts); return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }
function scrollToBottom(){ elMsgs.scrollTop = elMsgs.scrollHeight; }
function stagger(el, i){ el.style.animationDelay = (i*0.04)+'s'; }

function addMessage(role, text, ctx=null){
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (role==='assistant' ? 'ai' : 'user') + ' enter';
  const lines = (text.match(/\n/g)||[]).length + 1;
  stagger(wrap, Math.min(lines, 5));

  const html = text
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g,'<em>$1</em>')
    .replace(/\n/g,'<br/>');

  wrap.innerHTML = `<div class="body">${html}</div>`;

  if(role==='assistant'){
    const meta = document.createElement('div');
    meta.className = 'meta';
    const parts = [];
    if(ctx?.files?.length) parts.push(`📄 <span class="ref">${ctx.files.join(', ')}</span>`);
    if(ctx?.mode) parts.push(`<span class="badge">Mode: ${ctx.mode}</span>`);
    if(ctx?.session) parts.push(`<span class="badge">Session ${ctx.session.slice(0,6)}</span>`);
    if(parts.length){ meta.innerHTML = parts.join(' • '); wrap.appendChild(meta); }

    const map = renderArgumentMap(text);
    if(map) wrap.appendChild(map);
  }

  elMsgs.appendChild(wrap);
  messages.push({role, text, ts: Date.now(), ctx});
  scrollToBottom();
}

function renderArgumentMap(text){
  const lines = text.split(/\n/);
  const hasKeys = lines.some(l=>/^ *(Premise|Evidence|Counterpoint)\s*:/i.test(l));
  if(!hasKeys) return null;
  const box = document.createElement('div');
  box.className = 'meta';
  box.style.flexDirection = 'column';
  box.style.alignItems = 'flex-start';
  box.style.gap = '.35rem';
  ['Premise','Evidence','Counterpoint'].forEach(k => {
    const m = lines.find(l=> new RegExp(`^ *${k}\\s*:`,'i').test(l));
    if(m){
      const val = m.split(':').slice(1).join(':').trim();
      const row = document.createElement('div');
      row.innerHTML = `<strong>${k}:</strong> ${val}`;
      box.appendChild(row);
    }
  });
  return box;
}

function setCoachMode(mode){
  coachMode = mode;
  localStorage.setItem('coachMode', mode);
  document.body.setAttribute('data-mode', mode);
  $('#modeJudge').classList.toggle('ghost', mode!=='judge');
  $('#modeOpp').classList.toggle('ghost', mode!=='opposition');
  $('#modeCoach').classList.toggle('ghost', mode!=='coach');
}
$('#modeJudge').onclick = ()=> setCoachMode('judge');
$('#modeOpp').onclick   = ()=> setCoachMode('opposition');
$('#modeCoach').onclick = ()=> setCoachMode('coach');

function showTyping(on=true){ elTyping.style.display = on ? 'flex' : 'none'; }

function downloadTranscript(){
  const text = messages.map(m => `[${fmtTime(m.ts)}] ${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
  const blob = new Blob([text], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mootie_transcript.txt';
  a.click();
}

async function sendTextMessage(){
  const content = elText.value.trim();
  if(!content) return;
  addMessage('user', content);
  elText.value = '';

  showTyping(true);

  const ctx = { mode: coachMode, files: uploadedFiles.map(f=>f.name).slice(0,3), session: sessionId };

  try{
    const res = await fetch('/api/send-message', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: content, coachMode, contextFiles: uploadedFiles.map(f=>f.id) })
    });
    const data = await res.json();
    const reply = data?.data?.text || data?.text || data?.message || '…';
    const refs = data?.data?.citations?.map(c=>c.title || c.filename) || ctx.files;
    addMessage('assistant', reply, {...ctx, files: refs});
  }catch(err){
    addMessage('assistant', 'There was an error responding. Please try again.');
    console.error(err);
  }finally{
    showTyping(false);
  }
}

function resizeCanvas(){
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
}
window.addEventListener('resize', resizeCanvas, {passive:true});
resizeCanvas();

function drawWave(){
  if(!analyser) return;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);
  ctx2d.clearRect(0,0,canvas.width,canvas.height);
  const w = canvas.width, h = canvas.height;
  const barW = Math.max(2, Math.floor(w / 64));
  for(let i=0;i<64;i++){
    const v = dataArray[i] / 255;
    const bh = v * (h*0.9);
    const x = i*barW + 4;
    const y = h - bh;
    ctx2d.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    ctx2d.fillRect(x,y,barW-6,bh);
  }
  raf = requestAnimationFrame(drawWave);
}

async function startRecording(){
  if(isRecording) return;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    drawWave();

    mediaRecorder = new MediaRecorder(stream);
    const chunks = [];
    mediaRecorder.ondataavailable = (e)=> e.data.size && chunks.push(e.data);
    mediaRecorder.onstop = async ()=>{
      cancelAnimationFrame(raf);
      if(audioCtx) audioCtx.close();
      const blob = new Blob(chunks, {type:'audio/webm'});
      const form = new FormData();
      form.append('file', blob, 'speech.webm');
      const r = await fetch('/api/transcribe', {method:'POST', body:form});
      const j = await r.json();
      const txt = j?.data?.text || j?.text || '';
      if(txt){ elText.value = (elText.value ? (elText.value + ' ') : '') + txt; }
      isRecording = false;
    };
    mediaRecorder.start();
    isRecording = true;
  }catch(e){ console.error(e); }
}

function stopRecording(){
  if(!isRecording) return;
  mediaRecorder.stop();
}

$('#choose').onclick = ()=> elFile.click();
elFile.onchange = async (e)=>{
  const files = Array.from(e.target.files||[]);
  if(!files.length) return;
  elUp.style.display = 'block'; elUpBar.style.width = '0%';
  let loaded = 0;
  for(const file of files){
    const form = new FormData();
    form.append('file', file);
    const r = await fetch('/api/upload-document', {method:'POST', body:form});
    const j = await r.json();
    if(j?.success && j?.data){
      uploadedFiles.push({id:j.data.id, name:j.data.filename || file.name, pages:j.data.pages});
      renderFileList();
    }
    loaded++;
    elUpBar.style.width = Math.round(loaded/files.length*100)+'%';
  }
  setTimeout(()=>{ elUp.style.display='none'; }, 500);
};

function renderFileList(){
  elFiles.innerHTML = '';
  uploadedFiles.forEach(f=>{
    const row = document.createElement('div');
    row.className = 'file';
    row.innerHTML = `<div class="name">📄 ${f.name}</div>
      <button class="icon-btn del" title="Delete">✖</button>`;
    row.querySelector('.del').onclick = async ()=>{
      if(!confirm(`Delete ${f.name}?`)) return;
      const r = await fetch('/api/delete-file', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fileId:f.id})});
      const j = await r.json();
      if(j?.success){ uploadedFiles = uploadedFiles.filter(x=>x.id!==f.id); renderFileList(); }
    };
    elFiles.appendChild(row);
  });
}

const sessionId = (localStorage.getItem('sessionId') || (Date.now().toString(36)+Math.random().toString(36).slice(2)));
localStorage.setItem('sessionId', sessionId);

$('#btnScore').onclick = async ()=>{
  const r = await fetch('/api/score-rubric', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ sessionId, transcript: messages })
  });
  const j = await r.json();
  const scores = j?.data || {clarity:7, structure:7, authority:6, delivery:7};
  renderBars(scores);
  const mean = (scores.clarity + scores.structure + scores.authority + scores.delivery)/4;
  const lastAI = [...$$('.msg.ai')].pop();
  if(lastAI){ lastAI.style.boxShadow = `0 0 ${8+mean*2}px color-mix(in oklab,var(--accent),transparent 60%)`; }
};
function renderBars(s){
  elBars.innerHTML = '';
  const rows = [['Clarity', s.clarity],['Structure', s.structure],['Authority', s.authority],['Delivery', s.delivery]];
  rows.forEach(([label,val])=>{
    const row = document.createElement('div'); row.className='bar-row';
    row.innerHTML = `<div class="label">${label}</div>
      <div class="meter"><div class="fill" style="width:${Math.round(val/10*100)}%"></div></div>
      <div class="score">${val.toFixed(1)}/10</div>`;
    elBars.appendChild(row);
  });
}

$('#btnNotes').onclick = async ()=>{
  const r = await fetch('/api/ai-notes', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ sessionId, transcript: messages })
  });
  const j = await r.json();
  const notes = j?.data?.notes || 'Summary unavailable.';
  addMessage('assistant', `**AI Notes**\n${notes}`, {mode:coachMode, files:uploadedFiles.map(f=>f.name).slice(0,2), session:sessionId});
};

elSend.onclick = sendTextMessage;
elExport.onclick = downloadTranscript;

let holdTimer;
elRecord.addEventListener('mousedown', ()=>{ holdTimer = setTimeout(startRecording, 120); });
elRecord.addEventListener('mouseup', ()=>{ clearTimeout(holdTimer); stopRecording(); });
elRecord.addEventListener('mouseleave', ()=>{ clearTimeout(holdTimer); stopRecording(); });
elRecord.addEventListener('touchstart', (e)=>{ e.preventDefault(); holdTimer = setTimeout(startRecording, 120); }, {passive:false});
elRecord.addEventListener('touchend', ()=>{ clearTimeout(holdTimer); stopRecording(); }, {passive:true});

addMessage('assistant', 'Hi! Choose a **coach mode** and send a message. Upload any briefs to ground my responses.' , {mode:coachMode, session:sessionId});
