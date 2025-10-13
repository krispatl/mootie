// API route for uploading user documents (e.g. briefs) and attaching
// them to a vector store for grounding. Accepts multipart/form-data
// containing a single `document` field. The uploaded file is first
// stored in the OpenAI file store and then attached to the specified
// vector store.

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  }
  if (!VECTOR_STORE_ID) {
    return res.status(500).json({ error: 'Missing VECTOR_STORE_ID' });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }
    const boundaryToken = contentType.split('boundary=')[1];
    if (!boundaryToken) {
      return res.status(400).json({ error: 'Malformed multipart/form-data (no boundary)' });
    }
    const boundary = '--' + boundaryToken;

    // Read the entire request body so we can locate the document part.
    let raw = Buffer.alloc(0);
    for await (const chunk of req) raw = Buffer.concat([raw, chunk]);
    const parts = raw.toString('binary').split(boundary);
    const filePart = parts.find((p) => p.includes('name="document"'));
    if (!filePart) {
      return res.status(400).json({ error: "No 'document' field found" });
    }
    const headerEnd = filePart.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return res.status(400).json({ error: 'Malformed multipart section' });
    }
    const headers = filePart.slice(0, headerEnd);
    const bodyBin = filePart.slice(headerEnd + 4, filePart.lastIndexOf('\r\n'));
    const fileBuffer = Buffer.from(bodyBin, 'binary');
    const filenameMatch = /filename="([^\"]+)"/i.exec(headers);
    const filename = filenameMatch ? filenameMatch[1] : 'document.txt';

    // Step 1: Upload the file to the OpenAI file endpoint.
    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([fileBuffer]), filename);
    uploadForm.append('purpose', 'assistants');
    const uploadResp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: uploadForm,
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      return res
        .status(uploadResp.status)
        .json({ error: `File upload failed (${uploadResp.status})`, details: errText.slice(0, 200) });
    }
    const uploaded = await uploadResp.json();
    if (!uploaded || !uploaded.id) {
      return res.status(500).json({ error: 'File upload failed', uploaded });
    }

    // Step 2: Attach the uploaded file to the specified vector store.
    const attachResp = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: uploaded.id }),
    });
    if (!attachResp.ok) {
      const errText = await attachResp.text();
      return res
        .status(attachResp.status)
        .json({ error: `Attach failed (${attachResp.status})`, details: errText.slice(0, 200) });
    }
    const attached = await attachResp.json();
    if (attached?.error) {
      return res.status(500).json({ error: 'Attach failed', details: attached });
    }
    return res.status(200).json({ file_id: uploaded.id, vector_status: attached });
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ error: 'Failed to upload and attach file.', details: e?.message || String(e) });
  }
}