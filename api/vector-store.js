// api/vector-store.js
// List files attached to the configured OpenAI vector store.

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
    if (!OPENAI_API_KEY) return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });
    if (!VECTOR_STORE_ID) return res.status(500).json({ success: false, error: 'Missing VECTOR_STORE_ID' });

    // 1) list files in the vector store
    const listResp = await fetch(`https://api.openai.com/v1/vector_stores/${encodeURIComponent(VECTOR_STORE_ID)}/files`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    const listText = await listResp.text();
    if (!listResp.ok) {
      return res.status(listResp.status).json({ success: false, error: 'OpenAI list failed', details: listText });
    }
    let listJson;
    try { listJson = JSON.parse(listText); } catch { listJson = {}; }
    const files = Array.isArray(listJson.data) ? listJson.data : [];

    // 2) hydrate filenames
    const detailed = await Promise.all(files.map(async (f) => {
      try {
        const fResp = await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(f.file_id || f.id)}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
        });
        const fText = await fResp.text();
        const fJson = JSON.parse(fText);
        return {
          id: f.file_id || f.id,
          filename: fJson.filename || fJson.name || 'file',
          bytes: fJson.bytes,
          created_at: fJson.created_at
        };
      } catch {
        return { id: f.file_id || f.id, filename: 'file' };
      }
    }));

    return res.status(200).json({ success: true, data: { vectors: detailed } });
  } catch (e) {
    console.error('GET /api/vector-store error', e);
    return res.status(500).json({ success: false, error: e?.message || String(e) });
  }
}