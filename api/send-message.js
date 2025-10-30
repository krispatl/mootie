// api/send-message.js
// Generates a response from the Mootie assistant using the OpenAI Responses API.
// Supports optional file_search grounding via a configured Vector Store.
// Adds CORS and robust parsing for both Vercel (req.body present) and raw streams.

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let body;
  try {
    body = req.body ?? await parseJSON(req);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  const userInput = body.text || body.message || body.prompt || '';
  const mode = body.mode || 'coach';
  if (!userInput) {
    return res.status(400).json({ success: false, error: 'Missing text' });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });
  }

  const systemPrompt = getSystemPrompt(mode);

  // Build Responses API payload
  const requestBody = {
    model: OPENAI_MODEL,
    // Use the recommended fields for Responses API
    input: userInput,
    instructions: systemPrompt,
    tools: [{ type: 'file_search' }],
    stream: false,
    // Request that citations be included when file_search is used.
    // Some deployments include citations in the output when enabled.
    // (If not present, we simply won't show them.)
    metadata: { app: 'mootie' }
  };

  if (VECTOR_STORE_ID) {
    requestBody.tool_resources = {
      file_search: { vector_store_ids: [VECTOR_STORE_ID] }
    };
  }

  try {
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const result = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ success: false, error: result?.error?.message || 'OpenAI error', details: result });
    }

    // Robust extraction of assistant text
    let outText = '';
    // 1) Some responses expose top-level `output_text` (SDKs).
    if (typeof result.output_text === 'string' && result.output_text.trim()) {
      outText = result.output_text;
    }
    // 2) Fallback: look inside `output` array -> message -> content -> output_text
    if (!outText && Array.isArray(result.output)) {
      const msg = result.output.find(o => o.type === 'message');
      if (msg && Array.isArray(msg.content)) {
        const textChunk = msg.content.find(c => c.type === 'output_text' && typeof c.text === 'string');
        if (textChunk) outText = textChunk.text;
      }
    }
    // 3) Fallback to `content` fields if present
    if (!outText && typeof result.content === 'string') {
      outText = result.content;
    }
    if (!outText) outText = 'No response.';

    // Parse bracket-style citations like [1], [2]
    const citations = [];
    (outText.match(/\[(\d+)\]/g) || []).forEach(m => {
      const n = m.replace(/\[|\]/g, '');
      if (!citations.includes(n)) citations.push(n);
    });

    // Optional TTS
    let audioBase64 = null;
    try {
      const voice = pickVoice(mode);
      const ttsResp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: 'tts-1', input: outText, voice, response_format: 'mp3' })
      });
      if (ttsResp.ok) {
        const buf = Buffer.from(await ttsResp.arrayBuffer());
        audioBase64 = buf.toString('base64');
      }
    } catch (e) {
      console.error('TTS failed:', e?.message || e);
    }

    return res.status(200).json({
      success: true,
      data: { assistantResponse: outText, assistantAudio: audioBase64, references: citations }
    });
  } catch (err) {
    console.error('send-message error:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Error generating response.' });
  }
}

async function parseJSON(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}

function getSystemPrompt(mode) {
  switch (mode) {
    case 'judge':
      return 'You are Mootie, a stern judge in a moot court. Ask probing questions, challenge unsupported claims, and provide rigorous critique. Keep a professional tone and avoid fluff.';
    case 'opposition':
      return 'You are Mootie, representing opposing counsel. Respond with counterarguments and adversarial reasoning. Point out logical flaws and bring up alternative precedents.';
    case 'coach':
    default:
      return 'You are Mootie, a constructive moot court coach. Offer helpful feedback, highlight strengths and weaknesses, and encourage improvement in clarity, structure, authority and persuasiveness.';
  }
}

function pickVoice(mode) {
  switch (mode) {
    case 'judge': return 'alloy';
    case 'opposition': return 'nova';
    case 'coach':
    default: return 'echo';
  }
}
