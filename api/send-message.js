// API route for handling user messages and generating AI responses.
// This endpoint accepts a POST request with a JSON body containing a
// `text` field (the user's prompt). It forwards the request to the
// OpenAI "responses" API, optionally including a vector store for file
// search, and returns the assistant's text and a base64‑encoded MP3
// audio response.

export default async function handler(req, res) {
  // Only allow POST requests; return 405 for other methods.
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Destructure the user input from the request body.  Newer clients may
  // send a `message` or `prompt` field instead of `text`.  We fall back
  // to whichever string field is provided.  This allows older and newer
  // front‑ends to coexist without triggering a 400 response.
  const { text, message, prompt } = req.body || {};
  const inputText = text || message || prompt;
  if (!inputText || typeof inputText !== 'string' || !inputText.trim()) {
    return res.status(400).json({ error: 'Missing or invalid message' });
  }

  // Pull necessary environment variables. Without these the request
  // cannot be fulfilled. Use clear error messages to aid debugging.
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  }

  // Compose the system prompt and user message. The system prompt
  // instructs MOOT AI to behave like a debate coach.
  const messages = [
    {
      role: 'system',
      content:
        'You are MOOT AI, a rigorous moot court debate partner. Be concise, cite logic clearly, ask targeted follow‑ups, and keep a professional, coach‑like tone. Format arguments in bullet points with bold headings when helpful.',
    },
    // Use the resolved inputText for the user message.  The original
    // `text` field is still accepted for backwards compatibility.
    { role: 'user', content: inputText },
  ];

  // Build the request payload for OpenAI. File search is enabled
  // automatically when a vector store ID is provided. It returns up to
  // 20 ranked results that will ground the response.
  const requestBody = {
    model: 'gpt-4o',
    input: messages,
    tools: [
      {
        type: 'file_search',
        vector_store_ids: VECTOR_STORE_ID ? [VECTOR_STORE_ID] : [],
        filters: null,
        max_num_results: 20,
        ranking_options: {
          ranker: 'auto',
          score_threshold: 0,
        },
      },
    ],
    stream: false,
    store: false,
    text: { format: { type: 'text' } },
    truncation: 'auto',
  };

  try {
    // Call the OpenAI responses API. If the call fails network‑wise,
    // the catch block below will handle it.
    const apiResp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!apiResp.ok) {
      const text = await apiResp.text();
      return res
        .status(apiResp.status)
        .json({ error: `OpenAI API error (${apiResp.status})`, details: text.slice(0, 200) });
    }
    const result = await apiResp.json();

    // Extract the assistant message from the output array. The result
    // should include a message object with an `output_text` chunk.
    let outText = 'No text available.';
    if (Array.isArray(result?.output)) {
      const outputMsg = result.output.find((o) => o.type === 'message');
      if (outputMsg && Array.isArray(outputMsg.content)) {
        const textChunk = outputMsg.content.find((c) => c.type === 'output_text');
        if (textChunk && typeof textChunk.text === 'string') {
          outText = textChunk.text;
        }
      }
    }

    // Attempt to synthesize the assistant response using OpenAI TTS. If
    // this call fails for any reason we still return the text response.
    let audioBase64 = null;
    try {
      const tts = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'tts-1', input: outText, voice: 'alloy', response_format: 'mp3' }),
      });
      if (tts.ok) {
        const buf = Buffer.from(await tts.arrayBuffer());
        audioBase64 = buf.toString('base64');
      }
    } catch (err) {
      console.error('TTS synthesis failed:', err);
    }

    // Return both the text and audio. Even if audio generation failed
    // (audioBase64 is null) the text will still be present.
    return res.status(200).json({ assistantResponse: outText, assistantAudio: audioBase64 });
  } catch (err) {
    // Catch network errors or unexpected exceptions and return a 500.
    console.error('Error generating response:', err);
    return res.status(500).json({ error: 'Error generating response', details: err?.message || String(err) });
  }
}