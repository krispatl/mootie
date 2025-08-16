export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  try {
    // Parse multipart form (stream the single blob named "audio")
    const chunks = [];
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return res.status(400).json({ error: "Expected multipart/form-data" });
    }

    // Minimalistic multipart parser (only handles one file field named 'audio')
    const boundary = "--" + contentType.split("boundary=")[1];
    let data = Buffer.alloc(0);
    for await (const chunk of req) data = Buffer.concat([data, chunk]);

    const parts = data.toString("binary").split(boundary);
    const filePart = parts.find(p => p.includes('name="audio"'));
    if (!filePart) return res.status(400).json({ error: "No 'audio' field found" });

    // Extract binary content between header end and boundary
    const headerEnd = filePart.indexOf("\r\n\r\n");
    const fileBinary = filePart.slice(headerEnd + 4, filePart.lastIndexOf("\r\n"));
    const fileBuffer = Buffer.from(fileBinary, "binary");

    // Forward to Whisper (webm supported directly)
    const form = new FormData();
    form.append("file", new Blob([fileBuffer], { type: "audio/webm" }), "audio.webm");
    form.append("model", "whisper-1");

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: form
    });

    const out = await resp.json();
    if (!out || !out.text) return res.status(500).json({ error: "Transcription failed", out });
    res.status(200).json({ text: out.text });
  } catch (e) {
    console.error("Transcribe error:", e);
    res.status(500).json({ error: "Failed to transcribe audio." });
  }
}
