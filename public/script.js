// Simple client logic for Mootie Debate Mode
const chat = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const mic = document.getElementById('micIndicator');
const modal = document.getElementById('debateModal');
const openDebate = document.getElementById('openDebate');
const startDebate = document.getElementById('startDebate');
const closeModal = document.getElementById('closeModal');
const roundTime = document.getElementById('roundTime');
const roundTimeValue = document.getElementById('roundTimeValue');
const debateTopic = document.getElementById('debateTopic');
const firstTurn = document.getElementById('firstTurn');
const phaseBanner = document.getElementById('phaseBanner');

let currentMode = 'coach';
let debateActive = false;
let history = [];
let phaseIndex = 0;
let whoFirst = 'you';
let roundSeconds = 90;
let progressInterval = null;
let currentSpeaker = 'you';

const PHASES = ['Opening', 'Rebuttal', 'Closing', 'Feedback'];

document.querySelectorAll('.mode-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
  });
});
document.querySelector('.mode-btn[data-mode="coach"]').classList.add('active');

openDebate.addEventListener('click', ()=>{
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
});
closeModal.addEventListener('click', ()=>{
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
});

roundTime.addEventListener('input', ()=>{
  roundTimeValue.textContent = roundTime.value;
});

startDebate.addEventListener('click', ()=>{
  debateActive = true;
  phaseIndex = 0;
  roundSeconds = parseInt(roundTime.value,10);
  whoFirst = firstTurn.value;
  currentSpeaker = whoFirst;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
  history = [];
  pushSystem(`Debate started on “${debateTopic.value}” — ${roundSeconds}s per round. ${whoFirst==='you'?'You go first.':'Mootie goes first.'}`);
  startPhase();
});

sendBtn.addEventListener('click', ()=>{
  if(!input.value.trim()) return;
  userSays(input.value.trim());
  input.value='';
});

input.addEventListener('keydown', (e)=>{
  if(e.key==='Enter' && !e.shiftKey){
    e.preventDefault();
    sendBtn.click();
  }
});

// Spacebar toggles mic indicator (visual only unless wired to /api/whisper)
let micActive=false;
document.addEventListener('keydown', (e)=>{
  if (e.code === 'Space' && !e.repeat){
    micActive = !micActive;
    mic.classList.toggle('active', micActive);
  }
});

function pushSystem(text){
  const div = document.createElement('div');
  div.className = 'message ai';
  div.innerHTML = `<div class="meta">System</div>${escapeHtml(text)}`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function pushMsg(role, text){
  const div = document.createElement('div');
  div.className = `message ${role==='user'?'user':'ai'}`;
  div.innerHTML = `<div class="meta">${role==='user'?'You':'Mootie'}</div>${markdown(text)}`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function showPhaseBanner(text){
  phaseBanner.textContent = text;
  phaseBanner.classList.remove('hidden');
  requestAnimationFrame(()=> phaseBanner.classList.add('show'));
  setTimeout(()=>{
    phaseBanner.classList.remove('show');
    setTimeout(()=>phaseBanner.classList.add('hidden'), 250);
  }, 1400);
}

function startPhase(){
  const phase = PHASES[phaseIndex];
  showPhaseBanner(`${phase} Round`);

  // set progress bar
  const progress = document.createElement('div');
  progress.className = 'progress';
  const inner = document.createElement('div');
  inner.className = 'progress-inner';
  progress.appendChild(inner);
  chat.appendChild(progress);
  chat.scrollTop = chat.scrollHeight;

  const start = Date.now();
  clearInterval(progressInterval);
  progressInterval = setInterval(()=>{
    const elapsed = (Date.now() - start)/1000;
    const pct = Math.min(100, (elapsed/roundSeconds)*100);
    inner.style.width = pct + '%';
    if (elapsed >= roundSeconds){
      clearInterval(progressInterval);
      progress.remove();
      nextTurnOrPhase();
    }
  }, 200);

  // If Mootie starts, auto-generate
  if (currentSpeaker === 'mootie' && phase !== 'Feedback'){
    aiTurn(phase);
  }
}

function nextTurnOrPhase(){
  const phase = PHASES[phaseIndex];

  if (phase === 'Feedback'){
    // End debate after feedback
    debateActive = false;
    pushSystem('Debate complete. Generating final feedback & scores…');
    scoreDebate();
    return;
  }

  // Alternate turn:
  currentSpeaker = currentSpeaker === 'you' ? 'mootie' : 'you';

  if (currentSpeaker === 'mootie'){
    showPhaseBanner('Mootie is preparing…');
    setTimeout(()=> aiTurn(phase), 500);
  }else{
    showPhaseBanner('Your turn');
  }

  // After both spoke in this phase, advance phase
  if (currentSpeaker === whoFirst){
    // we wrapped back to the first speaker → next phase
    phaseIndex++;
    if (phaseIndex >= PHASES.length) {
      phaseIndex = PHASES.length - 1;
    } else {
      setTimeout(startPhase, 700);
    }
  }else{
    // stay in the same phase awaiting the other speaker
  }
}

function userSays(text){
  pushMsg('user', text);
  history.push({role:'user', content:text, phase: PHASES[phaseIndex]});
  if (debateActive && currentSpeaker === 'you'){
    // move to Mootie
    nextTurnOrPhase();
  }
}

async function aiTurn(phase){
  // Call serverless to produce Mootie message
  try{
    const body = {
      mode: currentMode,
      phase,
      topic: debateTopic.value,
      history
    };
    const res = await fetch('/api/debate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    const text = data.text || '(No response)';
    pushMsg('ai', text);
    history.push({role:'assistant', content:text, phase});
    // hand turn back
    nextTurnOrPhase();
  }catch(err){
    pushSystem('Error: '+err.message);
  }
}

async function scoreDebate(){
  try{
    const res = await fetch('/api/scorer', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ transcript: history })
    });
    const data = await res.json();
    const lines = [
      `**Scores** — Clarity: ${data.scores.clarity}, Structure: ${data.scores.structure}, Authority: ${data.scores.authority}, Responsiveness: ${data.scores.responsiveness}, Persuasiveness: ${data.scores.persuasiveness}`,
      '',
      `**Feedback**`,
      `• ${data.feedback.join('\\n• ')}`
    ].join('\\n');
    pushMsg('ai', lines);
  }catch(err){
    pushSystem('Scoring error: '+err.message);
  }
}

// Basic markdown (bold only) + HTML escape
function escapeHtml(s){return s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function markdown(s){return escapeHtml(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br/>')}
