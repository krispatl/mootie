// /api/delete-file.js
export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fileId } = req.query || {};
  if (!fileId) {
    return res.status(400).json({ error: "Missing fileId" });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY or VECTOR_STORE_ID" });
  }

  try {
    // 1️⃣ Remove file from vector store
    const removeVec = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${fileId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      }
    );

    // 2️⃣ Delete actual file from OpenAI storage
    await fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });

    if (!removeVec.ok) {
      const txt = await removeVec.text();
      return res.status(removeVec.status).json({ error: txt });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("delete-file error:", err);
    return res.status(500).json({ error: err.message });
  }
}
