// pages/api/upload-document.js
import OpenAI from "openai";

export const config = {
  api: { bodyParser: false }, // REQUIRED for multipart uploads
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Parse multipart/form-data manually using the Web API available in Node 18+ on Vercel
    const form = await req.formData?.(); // ❌ This will fail (req is not Request)
    // Instead, use this:
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const blob = new Blob(buffers);
    const data = await new Response(blob).formData();
    const file = data.get("file");

    if (!file) {
      return res.status(400).json({ error: "No file field found." });
    }

    const uploaded = await openai.files.create({
      file,
      purpose: "assistants",
    });

    // Optional: attach to your vector store
    if (process.env.VECTOR_STORE_ID) {
      await openai.beta.vectorStores.fileBatches.create({
        vector_store_id: process.env.VECTOR_STORE_ID,
        files: [uploaded.id],
      });
    }

    return res.status(200).json({ success: true, file: uploaded });
  } catch (err) {
    console.error("upload-document error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
}
