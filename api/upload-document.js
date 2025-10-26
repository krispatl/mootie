// api/upload-document.js
// Uploads a document to the OpenAI file store and attaches it to the
// configured vector store.  Accepts multipart/form-data with a
// "document" or "file" field.  Returns the file ID and the vector
// attachment status.

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
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ success: false, error: 'Expected multipart/form-data' });
    }
    const boundaryToken = contentType.split('boundary=')[1];
    if (!boundaryToken) return res.status(400).json({ success: false, error: 'Malformed multipart/form-data (no boundary)' });
    const boundary = '--' + boundaryToken;
    let raw = Buffer.alloc(0);
    for await (const chunk of req) raw = Buffer.concat([raw, chunk]);
    const parts = raw.toString('binary').split(boundary);
    // accept "document" or "file"
    const filePart = parts.find(p => p.includes('name="document"') || p.includes('name="file"'));
    if (!filePart) return res.status(400).json({ success: false, error: "No 'document' field found" });
    const headerEnd = filePart.indexOf('\r\n\r\n');
    if (headerEnd === -1) return res.status(400).json({ success: false, error: 'Malformed multipart section' });
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
      return res.status(500).json({ success: false, error: 'File upload failed', details: uploaded });
    }
    // Attach file to the vector store.  Use the v2 Assistants API path first,
    // falling back to the legacy v1 path if the v2 endpoint returns 404.
    const attachHeaders = {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    };
    let attachResp = await fetch(
      `https://api.openai.com/v1/assistants/v2/vector_stores/${VECTOR_STORE_ID}/files`,
      {
        method: 'POST',
        headers: attachHeaders,
        body: JSON.stringify({ file_id: uploaded.id })
      }
    );
    if (attachResp.status === 404) {
      attachResp = await fetch(
        `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
        {
          method: 'POST',
          headers: attachHeaders,
          body: JSON.stringify({ file_id: uploaded.id })
        }
      );
    }
    const attachText = await attachResp.text();
    let attached;
    try {
      attached = JSON.parse(attachText);
    } catch (_) {
      attached = {};
    }
    if (!attachResp.ok || attached?.error) {
      return res.status(attachResp.status).json({
        success: false,
        error: 'Attach failed',
        details: attached || attachText
      });
    }
    return res.status(200).json({ success: true, data: { file_id: uploaded.id, vector_status: attached } });
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ success: false, error: 'Failed to upload and attach file.' });
  }
}