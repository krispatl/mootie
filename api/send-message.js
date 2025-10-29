// /api/send-message.js
// Restores full dynamic mode behavior + vector store + Mootie persona

import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = { runtime: "nodejs18.x" };

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ success: false, error: "Method not allowed" });

    const { text, mode } = req.body || {};
    if (!text) return res.status(400).json({ success: false, error: "Missing text input." });

    const vectorStoreId = process.env.VECTOR_STORE_ID;
    if (!vectorStoreId)
      return res.status(500).json({ success: false, error: "VECTOR_STORE_ID not defined in environment." });

    // 🎯 Core Mootie System Prompt
    const basePrompt = `
You are **Mootie**, an advanced AI Moot Court Coach. 
You help law students, advocates, and professionals improve rhetorical reasoning and oral argumentation.

Be articulate, fair, structured, and insightful. Reference uploaded documents when relevant.
Always provide concise yet thoughtful reasoning. Adapt your tone and purpose based on mode.
    `.trim();

    // 🎭 Mode Personalities
    const modePrompts = {
      coach: `COACH MODE — Encouraging mentor. Give constructive advice and feedback on logic, clarity, and delivery.`,
      judge: `JUDGE MODE — Neutral evaluator. Analyze both sides, render concise judgments, and highlight legal reasoning strengths or weaknesses.`,
      opposition: `OPPOSITION MODE — Critical counterpart. Present well-reasoned counterarguments to challenge the user’s position.`,
    };

    const activePrompt = `${basePrompt}\n\n${modePrompts[mode] || modePrompts.coach}`;

    // 🧠 GPT-5 with file_search
    const response = await client.responses.create({
      model: "gpt-5", // use gpt-4.1 if gpt-5 unavailable
      input: [
        { role: "system", content: activePrompt },
        { role: "user", content: text },
      ],
      tools: [
        {
          type: "file_search",
          vector_store_ids: [vectorStoreId],
          max_num_results: 4,
        },
      ],
      include: ["file_search_call.results"],
      metadata: { mode },
    });

    // 🗣️ Extract output text
    let outputText = response.output_text;
    if (!outputText && response.output?.length) {
      const msg = response.output.find((o) => o.type === "message");
      const textPart = msg?.content?.find((c) => c.type === "output_text");
      outputText = textPart?.text || "No textual response.";
    }

    // 📚 Extract citations
    const refs = [];
    for (const o of response.output || []) {
      if (o.type === "message" && Array.isArray(o.content)) {
        for (const c of o.content) {
          if (c.annotations) {
            for (const a of c.annotations) {
              if (a.type === "file_citation") refs.push(a.filename || a.file_id);
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
      error: err?.response?.data || err.message || "Failed to generate response.",
    });
  }
}
