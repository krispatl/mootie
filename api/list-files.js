import OpenAI from "openai";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const vectorStoreId = process.env.VECTOR_STORE_ID;

    if (!vectorStoreId)
      return res.status(500).json({ success: false, error: "VECTOR_STORE_ID missing" });

    const files = await client.vectorStores.files.list(vectorStoreId);

    res.status(200).json({ success: true, files: files.data });
  } catch (err) {
    console.error("list-files error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
