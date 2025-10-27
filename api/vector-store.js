// api/vector-store.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(500).json({ success: false, error: 'Missing env vars (OPENAI_API_KEY, VECTOR_STORE_ID)' });
  }
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const url = `https://api.openai.com/v1/vector_stores/${encodeURIComponent(VECTOR_STORE_ID)}/files?limit=100`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(r.status).json({ success: false, error: 'OpenAI list failed', details: txt?.slice?.(0, 400) });
    }
    const json = await r.json();
    const raw = Array.isArray(json) ? json : (json?.data || []);
    const files = raw
      .filter(f => !['deleted', 'cancelled'].includes(f?.status))
      .map(f => ({
        id: f.id || f.file_id || f.fileId,
        filename: f.filename || f.name || f.display_name || (f.id || f.file_id || f.fileId),
        status: f.status || 'unknown'
      }))
      .filter(f => !!f.id);
    return res.status(200).json({ success: true, data: { files, vectorStoreId: VECTOR_STORE_ID } });
  } catch (e) {
    console.error('[vector-store] list error:', e);
    return res.status(500).json({ success: false, error: 'Failed to list vector store files', details: e?.message || String(e) });
  }
}
