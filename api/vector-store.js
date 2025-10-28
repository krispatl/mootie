function _cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  _cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(200).json({ success: true, data: { vectors: [] } });
  }

  try {
    const list = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
    });
    const json = await list.json();
    const items = Array.isArray(json?.data) ? json.data : [];
    const result = [];
    for (const f of items) {
      const fr = await fetch(`https://api.openai.com/v1/files/${f.id}`, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      });
      const meta = await fr.json();
      result.push({ id: f.id, name: meta?.filename || 'Unnamed file' });
    }
    return res.status(200).json({ success: true, data: { vectors: result } });
  } catch (e) {
    console.error('vector-store error:', e);
    return res.status(200).json({ success: true, data: { vectors: [] } });
  }
}