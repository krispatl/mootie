// pages/api/list-files.js
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    const list = await openai.files.list();
    const files = list.data?.filter(f => f.purpose === "assistants") || [];
    res.status(200).json({ files });
  } catch (err) {
    console.error("list-files error:", err);
    res.status(500).json({ error: err.message });
  }
}
