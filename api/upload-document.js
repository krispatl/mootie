// ✅ FINAL WORKING VERSION — Vercel + Next.js API route (Node runtime)
// handles multipart/form-data uploads safely and keeps filename extensions

import formidable from "formidable";
import fs from "fs";
import FormData from "form-data";

export const config = {
  api: { bodyParser: false }, // let formidable handle multipart
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // parse multipart upload
  const form = formidable({ multiples: false, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("❌ Form parse error:", err);
      return res.status(400).json({ success: false, error: "Form parse failed" });
    }

    const file = Array.isArray(files.document) ? files.document[0] : files.document;
    if (!file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const path = file.filepath || file.path;
    if (!path) {
      console.error("❌ Missing file path:", file);
      return res.status(400).json({ success: false, error: "Upload path not found" });
    }

    try {
      // build form to send to OpenAI
      const openaiForm = new FormData();
      openaiForm.append("purpose", "assistants");
      openaiForm.append("file", fs.createReadStream(path), file.originalFilename || "upload.pdf");

      const uploadRes = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: openaiForm,
      });

      const result = await uploadRes.json();

      if (!uploadRes.ok) {
        console.error("❌ OpenAI upload failed:", result);
        return res
          .status(uploadRes.status)
          .json({ success: false, error: result.error?.message || "Upload failed" });
      }

      console.log(`✅ Uploaded ${file.originalFilename} successfully.`);
      return res.status(200).json({ success: true, data: result });
    } catch (e) {
      console.error("🔥 Upload exception:", e);
      return res.status(500).json({ success: false, error: e.message });
    }
  });
}
