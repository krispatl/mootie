// api/upload-document.js
// Accepts multipart form-data { document: File } and attaches it to the configured vector store.

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });
  if (!VECTOR_STORE_ID) return res.status(500).json({ success: false, error: 'Missing VECTOR_STORE_ID' });

  try {
    const formidable = (await import('formidable')).default;
    const fs = await import('fs');
    const form = formidable({ multiples: false });
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
    });

    const f = files.document || files.file;
    if (!f || Array.isArray(f)) {
      return res.status(400).json({ success: false, error: 'No document uploaded' });
    }
    const filepath = f.filepath || f.path;
    const filename = f.originalFilename || f.newFilename || 'document';

    // 1) upload file to OpenAI
    const formData = new (await import('form-data')).default();
    formData.append('purpose', 'assistants');
    formData.append('file', fs.createReadStream(filepath), { filename });

    const uploadResp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: formData
    });
    const uploadText = await uploadResp.text();
    if (!uploadResp.ok) {
      return res.status(uploadResp.status).json({ success: false, error: 'OpenAI file upload failed', details: uploadText });
    }
    const uploaded = JSON.parse(uploadText);

    // 2) attach to vector store
    const attachResp = await fetch(`https://api.openai.com/v1/vector_stores/${encodeURIComponent(VECTOR_STORE_ID)}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file_id: uploaded.id })
    });
    const attachText = await attachResp.text();
    if (!attachResp.ok) {
      return res.status(attachResp.status).json({ success: false, error: 'OpenAI attach failed', details: attachText });
    }
    const attached = JSON.parse(attachText);

    return res.status(200).json({ success: true, data: { file_id: uploaded.id, vector_status: attached } });
  } catch (e) {
    console.error('POST /api/upload-document error', e);
    return res.status(500).json({ success: false, error: e?.message || String(e) });
  }
}