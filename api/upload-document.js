// api/upload-document.js
// Uploads a file to OpenAI Files and attaches it to your vector store.

export const config = { runtime: 'edge' };

function j(res, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return j({ success: false, error: 'Method not allowed' }, 405);
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return j({ success: false, error: 'Missing OPENAI_API_KEY' }, 500);
  if (!VECTOR_STORE_ID) return j({ success: false, error: 'Missing VECTOR_STORE_ID' }, 500);

  try {
    // Parse form data (Edge runtime supports this natively)
    const form = await req.formData();
    const file = form.get('document') || form.get('file');
    if (!file || typeof file === 'string')
      return j({ success: false, error: "No file received (use field name 'document' or 'file')." }, 400);

    // 1) Upload to OpenAI Files
    const uploadForm = new FormData();
    // file is already a Blob/File in Edge runtime (has stream/name)
    uploadForm.append('file', file, file.name || 'upload.bin');
    uploadForm.append('purpose', 'assistants');

    const uploadResp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: uploadForm,
    });

    const uploadedText = await uploadResp.text();
    if (!uploadResp.ok) {
      return j({ success: false, error: 'OpenAI file upload failed', details: uploadedText }, uploadResp.status);
    }
    const uploaded = JSON.parse(uploadedText);
    const fileId = uploaded.id;
    if (!fileId) return j({ success: false, error: 'Unexpected upload response', details: uploaded }, 500);

    // 2) Attach file to your Vector Store
    const attachResp = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ file_id: fileId }),
      }
    );

    const attachText = await attachResp.text();
    if (!attachResp.ok) {
      return j({ success: false, error: 'Attach to vector store failed', details: attachText }, attachResp.status);
    }

    const attached = JSON.parse(attachText);
    return j({ success: true, data: { file_id: fileId, vector_status: attached } });
  } catch (e) {
    return j({ success: false, error: 'Upload failed', details: e?.message || String(e) }, 500);
  }
}
