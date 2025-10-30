import OpenAI from "openai";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ success: false, error: "Method not allowed" });

    const { text, mode } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const vectorStoreId = process.env.VECTOR_STORE_ID;

    if (!process.env.OPENAI_API_KEY)
      return res.status(500).json({ success: false, error: "Missing OPENAI_API_KEY" });
    if (!vectorStoreId)
      return res.status(500).json({ success: false, error: "Missing VECTOR_STORE_ID" });

    const messages = [
      {
        role: "system",
        content: `You are Mootie, an AI moot court coach in "${mode}" mode.
Provide legal reasoning, structure, and debate feedback.`,
      },
      { role: "user", content: text },
    ];

    const response = await openai.responses.create({
      model: "gpt-4.1",
      input: messages,
      tools: [{ type: "file_search", vector_store_ids: [vectorStoreId] }],
      include: ["file_search_call.results"],
    });

    const output = response.output_text ?? "";
    const references =
      response.output?.[1]?.content?.[0]?.annotations
        ?.filter((a) => a.type === "file_citation")
        ?.map((a) => a.filename || a.file_id) ?? [];

    return res.status(200).json({
      success: true,
      data: { assistantResponse: output, references },
    });
  } catch (err) {
    console.error("send-message error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server error" });
  }
}
