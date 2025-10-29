// pages/api/upload-document.js
import formidable from "formidable";
import fs from "fs";
import FormData from "form-data";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ success: false, error: "Method not allowed" });

  const form = formidable({ multiples: false, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ success: false, error: "Form parse failed" });

    const file = Array.isArray(files.document) ? files.document[0] : files.document;
    if (!file) return res.status(400).json({ success: false, error: "No file uploaded" });

    const path = file.filepath || file.path;
    const filename = file.originalFilename || "upload.pdf";
    const { OPENAI_API_KEY, VECTOR_STORE_ID } = process.env;

    if (!OPENAI_API_KEY || !VECTOR_STORE_ID)
      return res.status(500).json({ success: false, error: "Missing env vars" });

    try {
      // 1️⃣ Upload to /v1/files
      const uploadForm = new FormData();
      uploadForm.append("purpose", "assistants");
      uploadForm.append("file", fs.createReadStream(path), filename);

      const fileRes = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: uploadForm,
      });

      const fileData = await fileRes.json();
      if (!fileRes.ok) return res.status(fileRes.status).json(fileData);

      // 2️⃣ Attach to your vector store
      const attachRes = await fetch(
        `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ file_id: fileData.id }),
        }
      );

      const attachData = await attachRes.json();
      if (!attachRes.ok) return res.status(attachRes.status).json(attachData);

      return res.status(200).json({ success: true, data: attachData });
    } catch (e) {
      console.error("🔥 Upload error:", e);
      return res.status(500).json({ success: false, error: e.message });
    }
  });
}
