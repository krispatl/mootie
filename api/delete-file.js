export const config = { runtime: "nodejs" };
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ success: false, error: "Missing fileId" });

  try {
    // 1. Remove from vector store
    const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
    if (VECTOR_STORE_ID) {
      try {
        await client.vectorStores.files.del(VECTOR_STORE_ID, fileId);
      } catch (e) {
        console.warn("Vector store delete warning:", e.message);
      }
    }

    // 2. Remove from OpenAI file storage
    try {
      await client.files.del(fileId);
    } catch (e) {
      if (!/not found/i.test(e.message)) throw e;
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("delete-file error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
