// pages/api/vector-store.js
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { OPENAI_API_KEY, VECTOR_STORE_ID } = process.env;
    if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY or VECTOR_STORE_ID" });
    }

    const response = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ Vector store fetch failed:", data);
      return res.status(response.status).json(data);
    }

    // Return a simplified array for your UI
    const vectors = (data.data || []).map(f => ({
      id: f.id,
      filename: f.filename || f.name || "unknown",
      created_at: f.created_at,
    }));

    return res.status(200).json({ vectors });
  } catch (err) {
    console.error("🔥 Vector store error:", err);
    return res.status(500).json({ error: err.message });
  }
}
