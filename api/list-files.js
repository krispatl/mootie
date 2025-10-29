// /api/list-files.js
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    const files = await openai.files.list();
    const filtered = files.data.filter((f) => f.purpose === "assistants");
    res.status(200).json({ files: filtered });
  } catch (err) {
    console.error("list-files error:", err);
    res.status(500).json({ error: err.message });
  }
}
