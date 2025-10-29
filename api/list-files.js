// /api/list-files.js
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
    if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY or VECTOR_STORE_ID" });
    }

    const listRes = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      }
    );

    const data = await listRes.json();
    if (!listRes.ok) {
      return res.status(listRes.status).json(data);
    }

    const files = (data.data || []).map((f) => ({
      id: f.id,
      filename: f.filename,
      created_at: f.created_at,
    }));

    return res.status(200).json({ success: true, files });
  } catch (err) {
    console.error("list-files error:", err);
    return res.status(500).json({ error: err.message });
  }
}
