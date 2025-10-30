export const config = { runtime: "nodejs" };
import OpenAI from "openai";
import formidable from "formidable";
import fs from "fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Disable Next/Vercel's default body parser
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
    // Parse multipart form data using formidable
    const form = formidable({ multiples: false, uploadDir: "/tmp", keepExtensions: true });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const file = files.file;
    if (!file || !file.filepath) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    // Upload to vector store
    const uploaded = await client.vectorStores.fileBatches.uploadAndPoll(VECTOR_STORE_ID, {
      files: [fs.createReadStream(file.filepath)],
    });

    return res.status(200).json({ success: true, result: uploaded });
  } catch (err) {
    console.error("upload-document error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
