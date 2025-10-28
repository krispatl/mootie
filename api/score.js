// api/score.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method not allowed' });
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ success:false, error:'Missing OPENAI_API_KEY' });
  try {
    let raw=''; for await (const c of req) raw+=c;
    let { text } = {}; try { ({ text } = JSON.parse(raw||'{}')); } catch {}
    const prompt = `Score the following answer from 0-10 in five categories and add one coaching note. Return ONLY strict JSON with keys clarity, structure, authority, responsiveness, persuasiveness (numbers) and notes (string).\n\nAnswer: ${text}`;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', headers:{ Authorization:`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ model:'gpt-4o-mini', messages:[{role:'system', content:'You are an objective grader. Output strict JSON only.'},{role:'user', content:prompt}], temperature:0.2 })
    });
    const j = await r.json();
    if (!r.ok) return res.status(r.status).json({ success:false, error: j?.error?.message || 'Scoring error', details: j });
    let parsed={}; try { parsed = JSON.parse(j?.choices?.[0]?.message?.content || '{}'); } catch {}
    const out = {
      clarity: Number(parsed.clarity ?? 0),
      structure: Number(parsed.structure ?? 0),
      authority: Number(parsed.authority ?? 0),
      responsiveness: Number(parsed.responsiveness ?? 0),
      persuasiveness: Number(parsed.persuasiveness ?? 0),
      notes: (parsed.notes ?? '').toString().slice(0, 500),
    };
    return res.status(200).json({ success:true, data: out });
  } catch (e) { return res.status(500).json({ success:false, error:e?.message || String(e) }); }
}
