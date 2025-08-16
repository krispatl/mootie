module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) return res.status(200).json({ vectors: [] });

  try {
    const list = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }
    });
    const data = await list.json();
    if (!Array.isArray(data.data)) return res.status(200).json({ vectors: [] });

    const filesWithNames = await Promise.all(data.data.map(async (file) => {
      const fr = await fetch(`https://api.openai.com/v1/files/${file.id}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }
      });
      const fd = await fr.json();
      return { id: file.id, filename: fd.filename || "Unnamed file" };
    }));

    res.status(200).json({ vectors: filesWithNames });
  } catch (e) {
    console.error("Vector list error:", e);
    res.status(200).json({ vectors: [] });
  }
};
