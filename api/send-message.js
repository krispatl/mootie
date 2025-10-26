// api/send-message.js
// Simple text generation via OpenAI Responses API.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!OPENAI_API_KEY) return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });

  let payload = {};
  try {
    if (req.headers['content-type']?.includes('application/json')) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      payload = JSON.parse(raw || '{}');
    } else {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      try { payload = JSON.parse(raw || '{}'); } catch { payload = {}; }
    }
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  const text = payload.text || payload.message || payload.prompt || '';
  const mode = String(payload.mode || 'coach');
  const system = getSystemPrompt(mode);

  try {
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: text || 'Respond briefly.' }
        ]
      })
    });
    const txt = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({ success: false, error: 'OpenAI error', details: txt });
    }
    let out;
    try { out = JSON.parse(txt); } catch { out = { output: txt }; }

    const outputText = out.output_text || out.output || out.content?.[0]?.text || out.choices?.[0]?.message?.content || '';
    return res.status(200).json({ success: true, data: { text: outputText }, raw: out });
  } catch (e) {
    console.error('POST /api/send-message error', e);
    return res.status(500).json({ success: false, error: e?.message || String(e) });
  }
}

function getSystemPrompt(mode) {
  if (mode === 'judge') {
    return 'You are Mootie, a concise but fair judge giving brief, specific feedback and probing questions.';
  }
  if (mode === 'opposition') {
    return 'You are Mootie acting as the opposing counsel. Be rigorous, anticipate weaknesses, and keep replies concise.';
  }
  return 'You are Mootie, an AI moot-court coach. Be encouraging, precise, and actionable.';
}