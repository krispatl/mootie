// api/upload-document.js
import formidable from "formidable";
import fs from "fs";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(500).json({ success: false, error: "Missing OPENAI_API_KEY or VECTOR_STORE_ID" });
  }

  const form = formidable({ multiples: false, maxFileSize: 20 * 1024 * 1024 });
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(400).json({ success: false, error: "Upload parse error" });
    }

    const file = files.document?.[0] || files.document;
    if (!file || !file.filepath) {
      return res.status(400).json({ success: false, error: "No file uploaded (field name must be 'document')" });
    }

    try {
      const buffer = fs.readFileSync(file.filepath);

      const resp = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: buffer,
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error("OpenAI upload error:", txt);
        return res.status(resp.status).json({ success: false, error: txt.slice(0, 500) });
      }

      const data = await resp.json();
      return res.status(200).json({ success: true, data });
    } catch (e) {
      console.error("Upload error:", e);
      return res.status(500).json({ success: false, error: e.message });
    } finally {
      try { fs.unlinkSync(file.filepath); } catch {}
    }
  });
}
