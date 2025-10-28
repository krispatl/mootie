// api/transcribe.js
export const config = { api: { bodyParser: false, sizeLimit: '25mb' } };
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method not allowed' });
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ success:false, error:'Missing OPENAI_API_KEY' });
  try {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) return res.status(400).json({ success:false, error:'Expected multipart/form-data' });
    const boundaryToken = ct.split('boundary=')[1];
    if (!boundaryToken) return res.status(400).json({ success:false, error:'Malformed multipart (no boundary)' });
    const boundary = '--' + boundaryToken;
    let raw = Buffer.alloc(0); for await (const c of req) raw = Buffer.concat([raw,c]);
    const parts = raw.toString('binary').split(boundary);
    const filePart = parts.find(p => p.includes('name="audio"'));
    if (!filePart) return res.status(400).json({ success:false, error:"No file found under 'audio' field" });
    const headerEnd = filePart.indexOf('\r\n\r\n');
    if (headerEnd === -1) return res.status(400).json({ success:false, error:'Malformed multipart section' });
    const headers = filePart.slice(0, headerEnd);
    const bodyBin = filePart.slice(headerEnd + 4, filePart.lastIndexOf('\r\n'));
    const fileBuffer = Buffer.from(bodyBin, 'binary');
    const filenameMatch = headers.match(/filename="([^"]+)"/i);
    const filename = filenameMatch ? filenameMatch[1] : 'speech.webm';
    const form = new FormData();
    form.append('file', new Blob([fileBuffer]), filename);
    form.append('model', 'whisper-1');
    const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', { method:'POST', headers:{ Authorization:`Bearer ${OPENAI_API_KEY}` }, body: form });
    const txt = await tr.text();
    if (!tr.ok) return res.status(tr.status).json({ success:false, error:'Transcription failed', details: txt.slice(0,800) });
    let out; try { out = JSON.parse(txt); } catch { out = {}; }
    return res.status(200).json({ success:true, data:{ text: out.text || '' } });
  } catch (e) { return res.status(500).json({ success:false, error:'Transcription error', details: e?.message || String(e) }); }
}
