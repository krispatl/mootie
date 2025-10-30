// /api/tts.js — ESM version compatible with "type": "module"
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, voice = "alloy", format = "mp3" } = await req.json?.() || req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Missing text for TTS" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.audio.speech.create({
      model: process.env.TTS_MODEL || "gpt-4o-mini-tts",
      voice,
      input: text,
      format
    });

    // Convert audio data to base64
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      success: true,
      audio: base64,
      mime: `audio/${format}`
    });

  } catch (err) {
    console.error("TTS error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "TTS failed"
    });
  }
}
