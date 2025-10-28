function _cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  _cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });
  if (!VECTOR_STORE_ID) return res.status(500).json({ success: false, error: 'Missing VECTOR_STORE_ID' });

  const q = req.query || {};
  const fileId = Array.isArray(q.fileId) ? q.fileId[0] : q.fileId;
  if (!fileId) return res.status(400).json({ success: false, error: 'Missing fileId' });

  try {
    const delRes = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
    });
    if (!delRes.ok) {
      const t = await delRes.text();
      return res.status(delRes.status).json({ success: false, error: 'Delete failed', details: t.slice(0,200) });
    }
    return res.status(200).json({ success: true, data: { deleted: true } });
  } catch (e) {
    console.error('delete-file error:', e);
    return res.status(500).json({ success: false, error: 'Failed to delete file' });
  }
}