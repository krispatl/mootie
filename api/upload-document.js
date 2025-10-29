// mootie_fixes/api/upload-document.js
//
// This revised handler fixes the file‑upload process for vector stores.
// The original code attempted to POST the binary document directly to
// the vector store endpoint, which does not match the OpenAI API.  According
// to the OpenAI API spec you must first upload the file using the files API
// with purpose "assistants", then attach the returned file_id to your
// existing vector store using a separate request【218982108129933†L407-L431】.  
// This implementation follows that sequence and returns the final
// vector store file object to the client.

import formidable from "formidable";
import fs from "fs";
import FormData from "form-data";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(500).json({ success: false, error: "Missing OPENAI_API_KEY or VECTOR_STORE_ID" });
  }

  // Parse the incoming form data (the uploaded file appears under the
  // "document" field).  formidable stores the file in a temp location.
  const form = formidable({ multiples: false, maxFileSize: 20 * 1024 * 1024 });
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(400).json({ success: false, error: "Upload parse error" });
    }

    const file = files.document?.[0] || files.document;
    if (!file || !file.filepath) {
      return res.status(400).json({ success: false, error: "No file uploaded (field name must be 'document')" });
    }

    try {
      // Step 1: Upload the file to OpenAI's Files API.  This call must
      // use multipart/form-data and include a purpose of "assistants" so
      // the file can be attached to a vector store【218982108129933†L407-L431】.  We use the
      // form-data library to build the multipart body.
      const fd = new FormData();
      fd.append('file', fs.createReadStream(file.filepath), file.originalFilename || file.newFilename || 'upload');
      fd.append('purpose', 'assistants');
      const uploadResp = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: fd
      });
      if (!uploadResp.ok) {
        const txt = await uploadResp.text();
        console.error("OpenAI file upload error:", txt);
        return res.status(uploadResp.status).json({ success: false, error: txt.slice(0, 500) });
      }
      const fileData = await uploadResp.json();
      const fileId = fileData.id;

      // Step 2: Attach the uploaded file to the existing vector store.  The
      // vector store API expects a JSON body containing the file_id field【218982108129933†L2054-L2067】.
      const attachResp = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file_id: fileId })
      });
      if (!attachResp.ok) {
        const txt = await attachResp.text();
        console.error("OpenAI vector store attach error:", txt);
        return res.status(attachResp.status).json({ success: false, error: txt.slice(0, 500) });
      }
      const data = await attachResp.json();
      return res.status(200).json({ success: true, data });
    } catch (e) {
      console.error("Upload error:", e);
      return res.status(500).json({ success: false, error: e.message });
    } finally {
      // Always remove the temporary file to avoid leaving behind ghost files
      try { fs.unlinkSync(file.filepath); } catch {}
    }
  });
}