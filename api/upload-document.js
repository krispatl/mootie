import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false, // disable Next.js body parser to handle multipart
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(400).json({ success: false, error: "Form parsing failed" });
    }

    const file = files.document;
    if (!file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    try {
      // ✅ Send file to OpenAI (example)
      const stream = fs.createReadStream(file.filepath);
      const upload = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: (() => {
          const formData = new FormData();
          formData.append("purpose", "assistants");
          formData.append("file", stream, file.originalFilename);
          return formData;
        })(),
      });

      const result = await upload.json();
      if (!upload.ok) throw new Error(result.error?.message || "Upload failed");

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
