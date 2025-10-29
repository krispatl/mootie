// /api/upload-document.js
import getRawBody from "raw-body";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;

    if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY or VECTOR_STORE_ID" });
    }

    // 1️⃣ Capture the raw multipart/form-data body
    const body = await getRawBody(req);

    // 2️⃣ Forward directly to OpenAI /v1/files endpoint
    const uploadRes = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": req.headers["content-type"], // forward original boundary
      },
      body,
    });

    const uploaded = await uploadRes.json();
    if (!uploadRes.ok) {
      return res.status(uploadRes.status).json(uploaded);
    }

    // 3️⃣ Attach the uploaded file to the vector store
    const attachRes = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file_id: uploaded.id }),
      }
    );

    const attachData = await attachRes.json();
    if (!attachRes.ok) {
      return res.status(attachRes.status).json(attachData);
    }

    return res.status(200).json({ success: true, file: uploaded });
  } catch (err) {
    console.error("upload-document error:", err);
    return res.status(500).json({ error: err.message });
  }
}
