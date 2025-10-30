import OpenAI from "openai";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { fileId } = req.query || {};

    if (!fileId)
      return res.status(400).json({ success: false, error: "Missing fileId" });

    const vectorStoreId = process.env.VECTOR_STORE_ID;
    if (!vectorStoreId)
      return res.status(500).json({ success: false, error: "VECTOR_STORE_ID missing" });

    await client.vectorStores.files.del(vectorStoreId, fileId);

    res.status(200).json({ success: true, deleted: fileId });
  } catch (err) {
    console.error("delete-file error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
