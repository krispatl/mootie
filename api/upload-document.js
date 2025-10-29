export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.startsWith("multipart/form-data")) {
      return res
        .status(400)
        .json({ success: false, error: "Expected multipart/form-data" });
    }

    // read entire request into a blob
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const blob = new Blob(chunks);

    // try to recover original filename from the header
    const match = /filename="([^"]+)"/i.exec(contentType);
    const filename = match?.[1] || "upload.pdf"; // default fallback

    const formData = new FormData();
    formData.append("purpose", "assistants");
    // 👇 use the actual filename so OpenAI sees .pdf, .docx, etc.
    formData.append("file", blob, filename);

    const upload = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    });

    const result = await upload.json();
    if (!upload.ok) {
      console.error("OpenAI upload failed:", result);
      return res
        .status(upload.status)
        .json({ success: false, error: result.error?.message || "Upload failed" });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
