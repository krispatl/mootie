module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  if (!VECTOR_STORE_ID) return res.status(500).json({ error: "Missing VECTOR_STORE_ID" });

  try {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return res.status(400).json({ error: "Expected multipart/form-data" });
    }
    const boundary = "--" + contentType.split("boundary=")[1];
    let data = Buffer.alloc(0);
    for await (const chunk of req) data = Buffer.concat([data, chunk]);
    const parts = data.toString("binary").split(boundary);
    const filePart = parts.find(p => p.includes('name="document"'));
    if (!filePart) return res.status(400).json({ error: "No 'document' field found" });

    const filenameMatch = filePart.match(/filename="([^"]+)"/);
    const filename = filenameMatch ? filenameMatch[1] : "document.txt";

    const headerEnd = filePart.indexOf("\r\n\r\n");
    const fileBinary = filePart.slice(headerEnd + 4, filePart.lastIndexOf("\r\n"));
    const fileBuffer = Buffer.from(fileBinary, "binary");

    const form = new FormData();
    form.append("file", new Blob([fileBuffer]), filename);
    form.append("purpose", "assistants");

    const uploadResp = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: form
    });
    const uploaded = await uploadResp.json();
    if (!uploaded || !uploaded.id) return res.status(500).json({ error: "File upload failed", uploaded });

    const attachResp = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: uploaded.id })
    });
    const attached = await attachResp.json();
    if (attached.error) return res.status(500).json({ error: "Attach failed", details: attached });

    res.status(200).json({ file_id: uploaded.id, vector_status: attached });
  } catch (e) {
    console.error("Upload error:", e);
    res.status(500).json({ error: "Failed to upload and attach file." });
  }
};
