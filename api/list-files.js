// api/list-files.js
export default async function handler(req, res) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;

  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(500).json({ success: false, error: "Missing keys" });
  }

  try {
    const response = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );

    const data = await response.json();
    // Always return fresh data from OpenAI — never merge or cache
    return res.status(200).json({ success: true, files: data.data || [] });
  } catch (e) {
    console.error("list-files error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
