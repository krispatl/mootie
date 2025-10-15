// api/upload-document.js
// Uploads a document to the OpenAI file store and attaches it to the
// configured vector store.  Accepts multipart/form-data with a
// "document" or "file" field.  Returns the file ID and the vector
// attachment status.

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  if (!VECTOR_STORE_ID) return res.status(500).json({ error: 'Missing VECTOR_STORE_ID' });
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }
    const boundaryToken = contentType.split('boundary=')[1];
    if (!boundaryToken) return res.status(400).json({ error: 'Malformed multipart/form-data (no boundary)' });
    const boundary = '--' + boundaryToken;
    let raw = Buffer.alloc(0);
    for await (const chunk of req) raw = Buffer.concat([raw, chunk]);
    const parts = raw.toString('binary').split(boundary);
    // accept "document" or "file"
    const filePart = parts.find(p => p.includes('name="document"') || p.includes('name="file"'));
    if (!filePart) return res.status(400).json({ error: "No 'document' field found" });
    const headerEnd = filePart.indexOf('\r\n\r\n');
    if (headerEnd === -1) return res.status(400).json({ error: 'Malformed multipart section' });
    const headers = filePart.slice(0, headerEnd);
    const bodyBin = filePart.slice(headerEnd + 4, filePart.lastIndexOf('\r\n'));
    const fileBuffer = Buffer.from(bodyBin, 'binary');
    const filenameMatch = headers.match(/filename="([^"]+)"/i);
    const filename = filenameMatch ? filenameMatch[1] : 'document.txt';
    // Upload file to OpenAI Files
    const form = new FormData();
    form.append('file', new Blob([fileBuffer]), filename);
    form.append('purpose', 'assistants');
    const uploadResp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form
    });
    const uploaded = await uploadResp.json();
    if (!uploaded || !uploaded.id) {
      return res.status(500).json({ error: 'File upload failed', uploaded });
    }
    // Attach file to Vector Store
    const attachResp = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file_id: uploaded.id })
    });
    const attached = await attachResp.json();
    if (attached?.error) {
      return res.status(500).json({ error: 'Attach failed', details: attached });
    }
    return res.status(200).json({ file_id: uploaded.id, vector_status: attached });
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ error: 'Failed to upload and attach file.' });
  }
}