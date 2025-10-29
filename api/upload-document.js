// pages/api/upload-document.js
import formidable from "formidable";
import FormData from "form-data";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const form = formidable({ multiples: false, keepExtensions: true, fileWriteStreamHandler: () => null });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(400).json({ success: false, error: "Form parsing failed" });
    }

    // get file object
    const file = Array.isArray(files.document) ? files.document[0] : files.document;
    if (!file) return res.status(400).json({ success: false, error: "No file uploaded" });

    try {
      // File is held in memory; its buffer is in file._writeStream._writableState.getBuffer()
      const buffers = file._writeStream?._writableState?.getBuffer?.().map(b => b.chunk) || [];
      const blob = new Blob(buffers);
      const filename = file.originalFilename || "upload.pdf";

      const formData = new FormData();
      formData.append("purpose", "assistants");
      formData.append("file", blob, filename);

      const openaiRes = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: formData,
      });

      const data = await openaiRes.json();
      if (!openaiRes.ok) {
        console.error("OpenAI upload failed:", data);
        return res.status(openaiRes.status).json({ success: false, error: data.error?.message });
      }

      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error("Upload error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });
}
