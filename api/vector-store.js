// api/vector-store.js
// Lists files attached to the configured OpenAI vector store.  Returns
// an array of objects with id and filename properties.  On any
// errors or missing configuration the endpoint returns an empty list.

export default async function handler(req, res) {
  // Lists files currently attached to the configured vector store.  This
  // implementation supports both the legacy v1 vector store API and the newer
  // Assistants v2 API.  It returns a list of objects with id, filename, size
  // and creation timestamp if available.
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });
  }
  if (!VECTOR_STORE_ID) {
    return res.status(500).json({ success: false, error: 'Missing VECTOR_STORE_ID' });
  }
  try {
    // Attempt to list files using the v2 Assistants API path
    let resp = await fetch(
      `https://api.openai.com/v1/assistants/v2/vector_stores/${VECTOR_STORE_ID}/files`,
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    // If v2 path not found, fall back to v1 path
    if (resp.status === 404) {
      resp = await fetch(
        `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
      );
    }
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { data: [] };
    }
    const list = Array.isArray(data?.data) ? data.data : [];
    // Build file metadata results.  Some fields may not exist on all endpoints.
    const filesWithNames = await Promise.all(
      list.map(async (file) => {
        // file may already include filename or name; if not, fetch from /files/:id
        let filename = file.filename || file.name;
        let size = file.bytes || file.size;
        let createdAt = file.created_at || null;
        if (!filename || size == null) {
          try {
            const fr = await fetch(`https://api.openai.com/v1/files/${file.id}`, {
              headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
            });
            const fd = await fr.json();
            filename = filename || fd.filename || fd.name || 'Unnamed file';
            size = size || fd.bytes || fd.size;
            createdAt = createdAt || fd.created_at;
          } catch (_) {
            filename = filename || 'Unnamed file';
          }
        }
        return { id: file.id, filename, size, created_at: createdAt };
      })
    );
    return res.status(200).json({ success: true, data: { vectors: filesWithNames } });
  } catch (e) {
    console.error('Vector list error:', e);
    return res.status(500).json({ success: false, error: 'Failed to list vector store files', details: e?.message || String(e) });
  }
}