// pages/api/upload-document.js
import { Readable } from "stream";
import FormData from "form-data";

export const config = { api: { bodyParser: false } };

// Parse the incoming multipart body manually
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // read the raw stream into a Buffer
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    // the browser must send FormData, not JSON
    // `req.headers['content-type']` should already include multipart/form-data
    const openaiUpload = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": req.headers["content-type"],
      },
      body: buffer,
    });

    const result = await openaiUpload.json();
    if (!openaiUpload.ok) return res.status(openaiUpload.status).json(result);

    // optional: attach file to your vector store
    if (process.env.VECTOR_STORE_ID) {
      await fetch(
        `https://api.openai.com/v1/vector_stores/${process.env.VECTOR_STORE_ID}/files`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ file_id: result.id }),
        }
      );
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("upload error:", err);
    return res.status(500).json({ error: err.message });
  }
}
