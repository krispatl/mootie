// api/transcribe.js
// Accepts multipart/form-data { audio: File } (WebM/WAV/MP3) and returns Whisper text.

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });

  try {
    const formidable = (await import('formidable')).default;
    const fs = await import('fs');
    const form = formidable({ multiples: false });
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
    });
    const f = files.audio || files.file;
    if (!f || Array.isArray(f)) {
      return res.status(400).json({ success: false, error: 'No audio uploaded' });
    }
    const filepath = f.filepath || f.path;
    const filename = f.originalFilename || f.newFilename || 'audio.webm';

    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filepath), { filename });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: formData
    });
    const t = await r.text();
    if (!r.ok) return res.status(r.status).json({ success: false, error: 'OpenAI transcription failed', details: t });
    let j; try { j = JSON.parse(t); } catch { j = { text: t }; }
    return res.status(200).json({ success: true, data: { text: j.text || '' } });
  } catch (e) {
    console.error('POST /api/transcribe error', e);
    return res.status(500).json({ success: false, error: e?.message || String(e) });
  }
}