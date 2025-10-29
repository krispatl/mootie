// mootie_fixes/api/delete-file.js
//
// This revised handler deletes a file from both the vector store and the
// underlying file storage.  The original implementation only removed
// the file from the vector store, which left "ghost" filenames
// lingering in OpenAI's file list.  According to the API spec, a
// separate DELETE call on the files endpoint is necessary to remove
// the file permanently【218982108129933†L2090-L2108】.

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const { fileId } = req.query || {};
  if (!fileId) {
    return res.status(400).json({ success: false, error: 'Missing fileId' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY or VECTOR_STORE_ID' });
  }
  try {
    // Step 1: Remove from the vector store.  This makes the file
    // unavailable for file search but does not delete the underlying file.
    const url = `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`;
    const resp = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(resp.status).json({ success: false, error: `Delete from vector store failed`, details: txt.slice(0, 500) });
    }
    // Step 2: Delete the file resource itself.  Without this call the
    // file remains in your account and will continue to show up in
    // list requests, which is why you saw ghost filenames【218982108129933†L2090-L2108】.
    const fileUrl = `https://api.openai.com/v1/files/${encodeURIComponent(fileId)}`;
    const delResp = await fetch(fileUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
    if (!delResp.ok) {
      const txt = await delResp.text();
      // Even if this fails, we still removed the attachment from the vector store.
      return res.status(delResp.status).json({ success: false, error: `Delete file failed`, details: txt.slice(0, 500) });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('delete-file error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
}