// /api/upload-document.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = {
  api: { bodyParser: false }, // let FormData stream through
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // Parse FormData directly
    const formData = await req.formData(); // available in Vercel Edge & Next 13+
    const file = formData.get("file");
    if (!file) return res.status(400).json({ error: "No file provided" });

    // Upload file to OpenAI
    const uploaded = await openai.files.create({
      file,
      purpose: "assistants",
    });

    // (Optional) Add to a vector store if you have one
    // const store = await openai.beta.vectorStores.fileBatches.create({
    //   vector_store_id: process.env.OPENAI_VECTOR_STORE_ID,
    //   files: [uploaded.id],
    // });

    return res.status(200).json({ success: true, file: uploaded });
  } catch (err) {
    console.error("upload-document error:", err);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
}
