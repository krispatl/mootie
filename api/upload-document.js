export const config = { api: { bodyParser: false } };

function _cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  _cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });
  if (!VECTOR_STORE_ID) return res.status(500).json({ success: false, error: 'Missing VECTOR_STORE_ID' });

  try {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) return res.status(400).json({ success: false, error: 'Expected multipart/form-data' });
    const boundaryToken = ct.split('boundary=')[1];
    if (!boundaryToken) return res.status(400).json({ success: false, error: 'Malformed multipart (no boundary)' });
    const boundary = '--' + boundaryToken;

    let raw = Buffer.alloc(0);
    for await (const chunk of req) raw = Buffer.concat([raw, chunk]);
    const parts = raw.toString('binary').split(boundary);
    const filePart = parts.find(p => p.includes('name="document"') || p.includes('name="file"'));
    if (!filePart) return res.status(400).json({ success: false, error: "No 'document' or 'file' field found" });

    const headerEnd = filePart.indexOf('\r\n\r\n');
    if (headerEnd === -1) return res.status(400).json({ success: false, error: 'Malformed multipart section' });
    const headers = filePart.slice(0, headerEnd);
    const bodyBin = filePart.slice(headerEnd + 4, filePart.lastIndexOf('\r\n'));
    const buf = Buffer.from(bodyBin, 'binary');
    const nameMatch = headers.match(/filename="([^"]+)"/i);
    const filename = nameMatch ? nameMatch[1] : 'document.txt';

    const form = new FormData();
    form.append('file', new Blob([buf]), filename);
    form.append('purpose', 'assistants');

    const up = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    const uploaded = await up.json();
    if (!up.ok || !uploaded?.id) {
      return res.status(up.status || 500).json({ success: false, error: 'File upload failed', details: uploaded });
    }

    const attach = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: uploaded.id }),
    });
    const attached = await attach.json();
    if (!attach.ok || attached?.error) {
      return res.status(attach.status || 500).json({ success: false, error: 'Attach failed', details: attached });
    }
    return res.status(200).json({ success: true, data: { file_id: uploaded.id, vector_status: attached } });
  } catch (e) {
    console.error('upload-document error:', e);
    return res.status(500).json({ success: false, error: 'Failed to upload & attach file' });
  }
}