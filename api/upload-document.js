// /api/upload-document.js
// Modern, serverless-safe upload handler for Vercel + OpenAI API

export const config = {
  api: {
    bodyParser: false, // required for FormData
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    // ✅ Parse FormData directly (works on Node 18+ / Vercel)
    const formData = await req.formData();
    const file = formData.get("document");

    if (!file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    // Check that it's a File or Blob
    if (typeof file.arrayBuffer !== "function") {
      return res.status(400).json({ success: false, error: "Invalid file object" });
    }

    // ✅ Send directly to OpenAI
    const uploadForm = new FormData();
    uploadForm.append("purpose", "assistants");
    uploadForm.append("file", file, file.name || "upload.pdf");

    const openaiRes = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: uploadForm,
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error("OpenAI upload failed:", data);
      return res
        .status(openaiRes.status)
        .json({ success: false, error: data.error?.message || "Upload failed" });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
