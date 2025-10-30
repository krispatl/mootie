import OpenAI from "openai";
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const id = process.env.VECTOR_STORE_ID;
    if (!id) return res.status(500).json({ success: false, error: "Missing VECTOR_STORE_ID" });

    const files = await openai.vectorStores.files.list(id);
    return res.status(200).json({ success: true, files: files.data });
  } catch (err) {
    console.error("list-files error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
