// api/upload-document.js
// Upload a document to OpenAI Files, then attach it to your Vector Store.
// Accepts multipart/form-data with "document" or "file" field.

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '50mb'
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });
  if (!VECTOR_STORE_ID) return res.status(500).json({ success: false, error: 'Missing VECTOR_STORE_ID' });

  try {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) {
      return res.status(400).json({ success: false, error: 'Expected multipart/form-data' });
    }

    // --- Minimal multipart parser for single file ("document" or "file") ---
    const boundaryToken = ct.split('boundary=')[1];
    if (!boundaryToken) return res.status(400).json({ success: false, error: 'Malformed multipart (no boundary)' });
    const boundary = '--' + boundaryToken;

    let raw = Buffer.alloc(0);
    for await (const chunk of req) raw = Buffer.concat([raw, chunk]);

    const parts = raw.toString('binary').split(boundary);
    const filePart = parts.find(p => p.includes('name="document"') || p.includes('name="file"'));
    if (!filePart) return res.status(400).json({ success: false, error: "No file found under 'document' or 'file' field" });

    const headerEnd = filePart.indexOf('\r\n\r\n');
    if (headerEnd === -1) return res.status(400).json({ success: false, error: 'Malformed multipart section' });

    const headers = filePart.slice(0, headerEnd);
    const bodyBin = filePart.slice(headerEnd + 4, filePart.lastIndexOf('\r\n'));
    const fileBuffer = Buffer.from(bodyBin, 'binary');

    const filenameMatch = headers.match(/filename="([^"\r\n]+)"/i);
    const filename = filenameMatch ? filenameMatch[1] : 'document.bin';

    // --- 1) Upload to OpenAI Files ---
    const form = new FormData();
    form.append('file', new Blob([fileBuffer]), filename);
    form.append('purpose', 'assistants');

    const uploadResp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    const uploadText = await uploadResp.text();
    if (!uploadResp.ok) {
      return res.status(uploadResp.status).json({
        success: false,
        error: 'OpenAI file upload failed',
        details: uploadText.slice(0, 1000),
      });
    }
    let uploaded;
    try { uploaded = JSON.parse(uploadText); } catch { uploaded = {}; }
    const file_id = uploaded?.id;
    if (!file_id) {
      return res.status(500).json({ success: false, error: 'Unexpected upload response', details: uploadText.slice(0, 1000) });
    }

    // --- 2) Attach to Vector Store (v2 beta header required) ---
    const attachResp = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
      body: JSON.stringify({ file_id }),
    });
    const attachText = await attachResp.text();
    if (!attachResp.ok) {
      return res.status(attachResp.status).json({
        success: false,
        error: 'Attach to vector store failed',
        details: attachText.slice(0, 1000),
      });
    }
    let attached;
    try { attached = JSON.parse(attachText); } catch { attached = {}; }

    return res.status(200).json({ success: true, data: { file_id, vector_status: attached } });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: 'Upload failed',
      details: e?.message || String(e),
    });
  }
}
