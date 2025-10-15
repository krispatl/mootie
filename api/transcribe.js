// API route to transcribe user audio to text using OpenAI Whisper.
// Expects a POST request with multipart/form-data containing one field
// named `audio`. The audio file should be WebM; this route forwards
// the audio to OpenAI's Whisper endpoint and returns the transcript.

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  }

  try {
    const contentType = req.headers['content-type'] || '';

    // Create a buffer from the incoming request if needed.  We'll parse
    // different formats depending on the content type.
    let fileBuffer;
    // If the request is multipart/form-data, extract the `audio` field.
    if (contentType.includes('multipart/form-data')) {
      const boundaryToken = contentType.split('boundary=')[1];
      if (!boundaryToken) {
        return res.status(400).json({ error: 'Malformed multipart/form-data (no boundary)' });
      }
      const boundary = '--' + boundaryToken;
      // Read full body
      let raw = Buffer.alloc(0);
      for await (const chunk of req) raw = Buffer.concat([raw, chunk]);
      const parts = raw.toString('binary').split(boundary);
      const filePart = parts.find((p) => p.includes('name="audio"') || p.includes('name="file"'));
      if (!filePart) {
        return res.status(400).json({ error: "No audio field found" });
      }
      const headerEnd = filePart.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return res.status(400).json({ error: 'Malformed multipart section' });
      }
      const bodyBin = filePart.slice(headerEnd + 4, filePart.lastIndexOf('\r\n'));
      fileBuffer = Buffer.from(bodyBin, 'binary');
    } else if (contentType.includes('application/json')) {
      // Newer clients may post a JSON body with a base64‑encoded audio string.
      const { audio } = req.body || {};
      if (!audio || typeof audio !== 'string') {
        return res.status(400).json({ error: 'Missing audio data' });
      }
      // Support data URIs (e.g. "data:audio/webm;base64,...") and plain base64
      const base64String = audio.includes(',') ? audio.split(',')[1] : audio;
      try {
        fileBuffer = Buffer.from(base64String, 'base64');
      } catch {
        return res.status(400).json({ error: 'Invalid base64 audio' });
      }
    } else {
      return res.status(400).json({ error: 'Unsupported content-type' });
    }
    // Ensure we have a buffer to send.
    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: 'No audio content found' });
    }
    // Build form data for Whisper; Node 18+ provides FormData/Blob globally.
    const form = new FormData();
    form.append('file', new Blob([fileBuffer], { type: 'audio/webm' }), 'audio.webm');
    form.append('model', 'whisper-1');
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form,
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res
        .status(resp.status)
        .json({ error: `Transcription error (${resp.status})`, details: text.slice(0, 200) });
    }
    const out = await resp.json();
    if (!out || typeof out.text !== 'string') {
      return res.status(500).json({ error: 'Transcription failed', out });
    }
    return res.status(200).json({ text: out.text });
  } catch (e) {
    console.error('Transcribe error:', e);
    return res.status(500).json({ error: 'Failed to transcribe audio.', details: e?.message || String(e) });
  }
}