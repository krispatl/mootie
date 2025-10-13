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
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }

    // Extract boundary token from the multipart header. Without this we
    // cannot parse the incoming body.
    const boundaryToken = contentType.split('boundary=')[1];
    if (!boundaryToken) {
      return res.status(400).json({ error: 'Malformed multipart/form-data (no boundary)' });
    }
    const boundary = '--' + boundaryToken;

    // Read the entire request body into a buffer. This allows us to
    // manually split the sections. For large files this could be
    // memory‑intensive, but the typical audio sample is short.
    let raw = Buffer.alloc(0);
    for await (const chunk of req) raw = Buffer.concat([raw, chunk]);

    // Split the body by the boundary and look for the `audio` part.
    const parts = raw.toString('binary').split(boundary);
    const filePart = parts.find((p) => p.includes('name="audio"'));
    if (!filePart) {
      return res.status(400).json({ error: "No 'audio' field found" });
    }

    // Separate the headers from the body of the file part.
    const headerEnd = filePart.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return res.status(400).json({ error: 'Malformed multipart section' });
    }
    const bodyBin = filePart.slice(headerEnd + 4, filePart.lastIndexOf('\r\n'));
    const fileBuffer = Buffer.from(bodyBin, 'binary');

    // Build the form data for Whisper. Node 18+ provides global
    // FormData/Blob; if unavailable you may need to import them.
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