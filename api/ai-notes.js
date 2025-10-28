// api/ai-notes.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method not allowed' });
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ success:false, error:'Missing OPENAI_API_KEY' });
  try {
    let raw=''; for await (const c of req) raw+=c;
    let transcript=[]; try { ({ transcript } = JSON.parse(raw||'{}')); } catch {}
    const compact = Array.isArray(transcript) ? transcript.slice(-50).map(t => `${t.role}: ${t.text}`).join('\n').slice(0, 4000) : '';
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', headers:{ Authorization:`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ model:'gpt-4o-mini', messages:[{role:'system', content:'You are a moot court coach. Provide concise, actionable notes.'},{role:'user', content:'Transcript (last turns):\n'+compact+'\n\nGive 3-5 bullet coaching tips.'}], temperature:0.4 })
    });
    const j = await r.json();
    if (!r.ok) return res.status(r.status).json({ success:false, error:j?.error?.message || 'Notes error', details: j });
    const notes = j?.choices?.[0]?.message?.content || 'No notes.';
    return res.status(200).json({ success:true, data:{ notes } });
  } catch (e) { return res.status(500).json({ success:false, error:e?.message || String(e) }); }
}
