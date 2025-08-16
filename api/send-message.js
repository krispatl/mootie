export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { text, sessionId } = req.body || {};
  if (!text) return res.status(400).json({ error: "Missing text" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  // Build Responses API request
  const messages = [
    { role: "system", content: "You are MOOT AI, a rigorous moot court debate partner. Be concise, cite logic clearly, ask targeted follow-ups, and keep a professional, coach-like tone. Format arguments in bullet points with bold headings when helpful." },
    { role: "user", content: text }
  ];

  const requestBody = {
    model: "gpt-4o",
    input: messages,
    tools: [
      { type: "file_search", vector_store_ids: VECTOR_STORE_ID ? [VECTOR_STORE_ID] : [], filters: null, max_num_results: 20, ranking_options: { ranker: "auto", score_threshold: 0 } }
    ],
    stream: false,
    store: false,
    text: { format: { type: "text" } },
    truncation: "auto"
  };

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    const result = await resp.json();
    if (!result || !Array.isArray(result.output)) {
      return res.status(500).json({ error: "Invalid response format from OpenAI", result });
    }
    let output = result.output.find(o => o.type === "message");
    let outText = "No text available.";
    if (output && output.content) {
      const chunk = output.content.find(c => c.type === "output_text");
      if (chunk && chunk.text) outText = chunk.text;
    }

    // TTS (optional)
    let audioBase64 = null;
    try {
      const tts = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "tts-1", input: outText, voice: "alloy", response_format: "mp3" })
      });
      const buf = Buffer.from(await tts.arrayBuffer());
      audioBase64 = buf.toString("base64");
    } catch (e) {
      // non-fatal
      console.error("TTS failed:", e);
    }

    res.status(200).json({ assistantResponse: outText, assistantAudio: audioBase64 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error generating response." });
  }
}
