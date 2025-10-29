// api/list-files.js
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY or VECTOR_STORE_ID" });
  }

  try {
    const resp = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(resp.status).json({ error: txt.slice(0, 500) });
    }
    const data = await resp.json();
    const files = (data?.data || []).map(f => ({
      id: f.id || f.file_id,
      name: f.filename || f.display_name || f.id,
    }));
    return res.status(200).json({ files });
  } catch (e) {
    console.error("list-files error:", e);
    return res.status(500).json({ error: e.message });
  }
}
