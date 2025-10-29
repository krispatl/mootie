// /api/upload-document.js
// Works on Vercel serverless runtime — no fs/formidable required

export const config = {
  api: {
    bodyParser: false, // we’ll manually stream the raw request
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    // Parse multipart upload manually using the Web Streams API
    const contentType = req.headers["content-type"] || "";
    if (!contentType.startsWith("multipart/form-data")) {
      return res
        .status(400)
        .json({ success: false, error: "Expected multipart/form-data" });
    }

    // Read the raw body into a Blob
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const blob = new Blob(chunks);

    // Send directly to OpenAI API
    const openaiRes = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: (() => {
        const formData = new FormData();
        formData.append("purpose", "assistants");
        formData.append("file", blob, "upload.bin");
        return formData;
      })(),
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error("OpenAI upload failed:", data);
      return res.status(openaiRes.status).json({
        success: false,
        error: data.error?.message || "Upload failed",
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
