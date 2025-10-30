export const config = { runtime: "nodejs" };
import OpenAI from "openai";
import formidable from "formidable";
import fs from "fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Disable default body parser so formidable can handle multipart
export const api = { bodyParser: false };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!VECTOR_STORE_ID) {
    return res.status(400).json({ success: false, error: "Missing VECTOR_STORE_ID" });
  }

  try {
    const form = formidable({
      multiples: false,
      uploadDir: "/tmp",
      keepExtensions: true,
    });

    // Parse the uploaded file
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    // Your frontend sends "file" → access via files.file
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploadedFile || !uploadedFile.filepath) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    // Upload to your vector store
    const result = await client.vectorStores.fileBatches.uploadAndPoll(VECTOR_STORE_ID, {
      files: [fs.createReadStream(uploadedFile.filepath)],
    });

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("upload-document error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
