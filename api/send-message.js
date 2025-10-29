// /api/send-message.js
// Handles chat messages from Mootie’s front-end and automatically
// uses the file_search tool to retrieve information from uploaded case docs.

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = {
  runtime: "nodejs18.x", // ensures modern runtime on Vercel
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ success: false, error: "Method not allowed" });

    const { text, mode } = req.body || {};
    if (!text)
      return res.status(400).json({ success: false, error: "Missing input text." });

    const vectorStoreId = process.env.VECTOR_STORE_ID;
    if (!vectorStoreId)
      return res.status(500).json({ success: false, error: "VECTOR_STORE_ID not defined in environment." });

    // 🧠 Configure model + tools
    const response = await client.responses.create({
      model: "gpt-5", // or "gpt-4.1" if you don’t yet have GPT-5 access
      input: text,
      // Tell the model to look inside your vector store
      tools: [
        {
          type: "file_search",
          vector_store_ids: [vectorStoreId],
          max_num_results: 4, // optional: limits search for speed
        },
      ],
      // Include file search results in the output (for citations)
      include: ["file_search_call.results"],
    });

    // 🧩 Extract text output
    let outputText = response.output_text;
    if (!outputText && response.output?.length) {
      const msg = response.output.find((o) => o.type === "message");
      const textPart = msg?.content?.find((c) => c.type === "output_text");
      outputText = textPart?.text || "No textual response from model.";
    }

    // 🔖 Extract any file references (citations)
    const refs = [];
    for (const o of response.output || []) {
      if (o.type === "message" && Array.isArray(o.content)) {
        for (const c of o.content) {
          if (c.annotations) {
            for (const a of c.annotations) {
              if (a.type === "file_citation") {
                refs.push(a.filename || a.file_id);
              }
            }
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        assistantResponse: outputText,
        references: [...new Set(refs)],
      },
    });
  } catch (err) {
    console.error("send-message error:", err);
    res.status(500).json({
      success: false,
      error: err?.response?.data || err.message || "Failed to send message.",
    });
  }
}
