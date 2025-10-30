export const config = { runtime: "nodejs" };
import OpenAI from "openai";
import fs from "fs";
import path from "path";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempPath = path.join("/tmp", file.name);
    await fs.promises.writeFile(tempPath, buffer);

    const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
    if (!VECTOR_STORE_ID) {
      return res.status(400).json({ success: false, error: "Missing VECTOR_STORE_ID" });
    }

    const uploaded = await client.vectorStores.fileBatches.uploadAndPoll(VECTOR_STORE_ID, {
      files: [fs.createReadStream(tempPath)]
    });

    return res.status(200).json({ success: true, result: uploaded });
  } catch (err) {
    console.error("upload-document error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
