// /api/delete-file.js
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "DELETE")
    return res.status(405).json({ error: "Method not allowed" });

  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: "Missing fileId" });

  try {
    // remove from vector store if you have one
    if (process.env.VECTOR_STORE_ID) {
      try {
        await openai.beta.vectorStores.files.del(
          process.env.VECTOR_STORE_ID,
          fileId
        );
      } catch (err) {
        console.warn("vector delete warn:", err.message);
      }
    }

    // delete the file resource
    await openai.files.del(fileId);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("delete-file error:", err);
    res.status(500).json({ error: err.message });
  }
}
