// /api/upload-document.js
import OpenAI from "openai";
export const config = { api: { bodyParser: false } }; // allow FormData streaming
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // ---- parse multipart form directly ----
    const form = await req.formData(); // available in Vercel Node 18+ / Edge
    const file = form.get("file");
    if (!file) return res.status(400).json({ error: "No file provided" });

    // ---- upload to OpenAI ----
    const uploaded = await openai.files.create({ file, purpose: "assistants" });

    // ---- optional: attach to a vector store ----
    // const store = await openai.beta.vectorStores.fileBatches.create({
    //   vector_store_id: process.env.VECTOR_STORE_ID,
    //   files: [uploaded.id],
    // });

    return res.status(200).json({ success: true, file: uploaded });
  } catch (err) {
    console.error("upload-document error:", err);
    return res.status(500).json({ error: err.message });
  }
}
