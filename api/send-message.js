// api/send-message.js
// Generates a response from the Mootie assistant.  This handler accepts
// POST requests with either `text`, `message` or `prompt` fields and an
// optional `mode` indicating the coach persona (coach, judge,
// opposition).  It forwards the request to OpenAI's /v1/responses API
// with a system prompt tailored to the selected mode and optionally
// retrieves grounding documents from your configured vector store.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  let body;
  try {
    body = req.body || await parseJSON(req);
  } catch (err) {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }
  const userInput = body.text || body.message || body.prompt || '';
  const mode = body.mode || 'coach';
  if (!userInput) {
    return res.status(400).json({ success: false, error: 'Missing text' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });
  }
  // Construct system prompt based on mode
  const systemPrompt = getSystemPrompt(mode);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput }
  ];
  const requestBody = {
    model: 'gpt-4o',
    input: messages,
    tools: [
      {
        type: 'file_search',
        vector_store_ids: VECTOR_STORE_ID ? [VECTOR_STORE_ID] : [],
        filters: null,
        max_num_results: 20,
        ranking_options: { ranker: 'auto', score_threshold: 0 }
      }
    ],
    stream: false,
    store: false,
    text: { format: { type: 'text' } },
    truncation: 'auto'
  };
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
    if (!result || !Array.isArray(result.output)) {
      return res.status(500).json({ success: false, error: 'Invalid response format from OpenAI', result });
    }
    // Extract assistant text
    let outText = 'No response.';
    const output = result.output.find(o => o.type === 'message');
    if (output && output.content) {
      const chunk = output.content.find(c => c.type === 'output_text');
      if (chunk && chunk.text) outText = chunk.text;
    }
    // Extract citations if present (strings like "[1]", "[2]" etc)
    const citations = [];
    const citationMatches = outText.match(/\[(\d+)\]/g) || [];
    citationMatches.forEach(m => {
      const num = m.replace(/\[|\]/g, '');
      citations.push(num);
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
      const buf = Buffer.from(await ttsResp.arrayBuffer());
      audioBase64 = buf.toString('base64');
    } catch (err) {
      console.error('TTS failed:', err);
    }
    return res.status(200).json({ success: true, data: { assistantResponse: outText, assistantAudio: audioBase64, references: citations } });
  } catch (err) {
    console.error(err);
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
      return 'You are Mootie, acting as a stern judge in a moot court. Ask probing questions, challenge unsupported claims, and provide rigorous critique. Keep a professional tone and avoid fluff.';
    case 'opposition':
      return 'You are Mootie, representing opposing counsel in a moot court. Respond with counterarguments and adversarial reasoning. Point out logical flaws and bring up alternative precedents.';
    case 'coach':
    default:
      return 'You are Mootie, a constructive moot court coach. Offer helpful feedback, highlight strengths and weaknesses, and encourage improvement in clarity, structure, authority and persuasiveness.';
  }
}

function pickVoice(mode) {
  // Choose a distinct voice per mode for TTS playback
  switch (mode) {
    case 'judge': return 'alloy';
    case 'opposition': return 'nova';
    case 'coach':
    default: return 'echo';
  }
}