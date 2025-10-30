// /api/tts.js  — Vercel Node Function (CommonJS)
const OpenAI = require('openai');

module.exports = async function handler(req, res) {
  // Basic CORS (optional)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, voice = 'alloy', format = 'mp3' } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Missing `text` for TTS.' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Text-to-Speech (returns a web Response-like object)
    const ttsResp = await client.audio.speech.create({
      model: process.env.TTS_MODEL || 'gpt-4o-mini-tts', // or 'tts-1'
      voice,
      input: text,
      format, // 'mp3' | 'wav' | 'opus' etc.
    });

    const arrayBuffer = await ttsResp.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({
      success: true,
      audio: base64,
      mime: `audio/${format}`,
    });
  } catch (err) {
    console.error('tts error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'TTS failed',
    });
  }
};
