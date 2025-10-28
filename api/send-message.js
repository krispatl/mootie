// api/send-message.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method not allowed' });
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ success:false, error:'Missing OPENAI_API_KEY' });
  try {
    let body = ''; for await (const c of req) body += c;
    let { text, mode } = {}; try { ({ text, mode } = JSON.parse(body||'{}')); } catch {}
    const sys = buildSystemPrompt(mode);
    const chatResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', headers:{ Authorization:`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ model:'gpt-4o-mini', messages:[{role:'system', content:sys},{role:'user', content:text||''}], temperature:0.4 })
    });
    const chatJson = await chatResp.json();
    if (!chatResp.ok) return res.status(chatResp.status).json({ success:false, error: chatJson?.error?.message || 'LLM error', details: chatJson });
    const assistant = chatJson?.choices?.[0]?.message?.content || '';
    let assistantAudio = null;
    try {
      const ttsResp = await fetch('https://api.openai.com/v1/audio/speech', {
        method:'POST', headers:{ Authorization:`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ model:'gpt-4o-mini-tts', voice:'alloy', input: assistant.slice(0,800), format:'mp3' })
      });
      if (ttsResp.ok) {
        const buf = Buffer.from(await ttsResp.arrayBuffer());
        assistantAudio = buf.toString('base64');
      }
    } catch {}
    return res.status(200).json({ success:true, data:{ assistantResponse: assistant, assistantAudio, references: [] } });
  } catch (e) { return res.status(500).json({ success:false, error:e?.message || String(e) }); }
}
function buildSystemPrompt(mode){
  const base='You are Mootie, an AI moot court coach. Be concise, precise, and constructive.';
  if(mode==='judge') return base+' Respond as an appellate judge grilling counsel with legal rigor.';
  if(mode==='opposition') return base+' Respond as opposing counsel: rebut and press for clarity.';
  return base+' Respond as a supportive coach: improve structure and argument strength with quick tips.';
}
