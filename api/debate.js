import fetch from 'node-fetch';

const OPENAI_URL = 'https://api.openai.com/v1/responses';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mode='coach', phase='Opening', topic='', history=[] } = req.body || {};
  const system = [
    `You are Mootie, an expert moot court ${mode}.`,
    `Debate phase: ${phase}. Topic: ${topic}.`,
    `Be concise, cite principles, and speak in well-structured paragraphs.`
  ].join(' ');

  const messages = [
    { role: 'system', content: system },
    ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: `${h.phase || ''}: ${h.content}` }))
  ];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey){
    // Fallback stub for offline use
    const canned = fallbackReply(mode, phase, topic, history);
    return res.status(200).json({ text: canned, model: 'stub' });
  }

  try{
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: messages
      })
    });
    if (!response.ok){
      const errTxt = await response.text();
      return res.status(response.status).json({ error: errTxt });
    }
    const data = await response.json();
    const text = data.output_text || (Array.isArray(data.output) ? data.output.map(o => o.content).join('\n') : 'OK');
    return res.status(200).json({ text, model: data.model || 'openai' });
  }catch(e){
    return res.status(500).json({ error: e.message });
  }
}

function fallbackReply(mode, phase, topic, history){
  const lastUser = [...history].reverse().find(h => h.role==='user');
  const point = lastUser ? lastUser.content : 'the prior point';
  return `(${mode} • ${phase}) On “${topic}”, I contend that ${point} raises significant concerns. I will address legal standards, likely counterarguments, and propose a narrowly tailored rule.`;
}
