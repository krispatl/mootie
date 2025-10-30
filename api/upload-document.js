import OpenAI from "openai";
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const id = process.env.VECTOR_STORE_ID;
    if (!id) return res.status(500).json({ success: false, error: "Missing VECTOR_STORE_ID" });

    const form = await req.formData();
    const file = form.get("file");
    if (!file) return res.status(400).json({ success: false, error: "No file provided" });

    const upload = await openai.vectorStores.fileBatches.uploadAndPoll(id, { files: [file] });
    return res.status(200).json({ success: true, data: upload });
  } catch (err) {
    console.error("upload-document error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
