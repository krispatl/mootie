// api/delete-file.js
export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const { fileId } = req.query || {};
  if (!fileId) return res.status(400).json({ success: false, error: "Missing fileId" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(500).json({ success: false, error: "Missing OPENAI_API_KEY or VECTOR_STORE_ID" });
  }

  try {
    const url = `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`;
    const resp = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(resp.status).json({ success: false, error: `Delete failed`, details: txt.slice(0, 500) });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("delete-file error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
