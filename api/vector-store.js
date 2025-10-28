// api/vector-store.js
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method not allowed' });
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return res.status(500).json({ success:false, error:'Missing OPENAI_API_KEY' });
  if (!VECTOR_STORE_ID) return res.status(500).json({ success:false, error:'Missing VECTOR_STORE_ID' });
  try {
    const listResp = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, { headers:{ Authorization:`Bearer ${OPENAI_API_KEY}` } });
    const listText = await listResp.text();
    if (!listResp.ok) return res.status(listResp.status).json({ success:false, error:'Vector list failed', details: listText.slice(0,800) });
    let data; try { data = JSON.parse(listText); } catch { data = { data: [] }; }
    const items = Array.isArray(data?.data) ? data.data : [];
    const resolved = await Promise.all(items.map(async (f) => {
      try {
        const fr = await fetch(`https://api.openai.com/v1/files/${f.id}`, { headers:{ Authorization:`Bearer ${OPENAI_API_KEY}` } });
        const ft = await fr.text();
        if (!fr.ok) return { id:f.id, filename:'Unknown', bytes:null, created_at:null };
        const meta = JSON.parse(ft);
        return { id:f.id, filename: meta.filename || meta.name || 'Unnamed', bytes: meta.bytes ?? null, created_at: meta.created_at ?? null };
      } catch { return { id:f.id, filename:'Unknown', bytes:null, created_at:null }; }
    }));
    return res.status(200).json({ success:true, data:{ vectors: resolved } });
  } catch (e) { return res.status(500).json({ success:false, error:'Vector list error', details: e?.message || String(e) }); }
}
