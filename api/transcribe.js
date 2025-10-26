// api/transcribe.js
// Accepts multipart/form-data containing an "audio" field with a WebM blob.
// Sends the audio to OpenAI Whisper for transcription and returns the text.

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });
  }
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ success: false, error: 'Expected multipart/form-data' });
    }
    // Minimal multipart parser (single file field: "audio")
    const boundaryToken = contentType.split('boundary=')[1];
    if (!boundaryToken) {
      return res.status(400).json({ success: false, error: 'Malformed multipart/form-data (no boundary)' });
    }
    const boundary = '--' + boundaryToken;
    let raw = Buffer.alloc(0);
    for await (const chunk of req) raw = Buffer.concat([raw, chunk]);
    const parts = raw.toString('binary').split(boundary);
    const filePart = parts.find(p => p.includes('name="audio"'));
    if (!filePart) {
      return res.status(400).json({ success: false, error: "No 'audio' field found" });
    }
    const headerEnd = filePart.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return res.status(400).json({ success: false, error: 'Malformed multipart section' });
    }
    const bodyBin = filePart.slice(headerEnd + 4, filePart.lastIndexOf('\r\n'));
    const fileBuffer = Buffer.from(bodyBin, 'binary');
    // Send WebM directly to Whisper
    const form = new FormData();
    form.append('file', new Blob([fileBuffer], { type: 'audio/webm' }), 'audio.webm');
    form.append('model', 'whisper-1');
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form
    });
    const out = await resp.json();
    if (!out || !out.text) {
      return res.status(500).json({ success: false, error: 'Transcription failed', details: out });
    }
    return res.status(200).json({ success: true, data: { text: out.text } });
  } catch (e) {
    console.error('Transcribe error:', e);
    return res.status(500).json({ success: false, error: 'Failed to transcribe audio.' });
  }
}