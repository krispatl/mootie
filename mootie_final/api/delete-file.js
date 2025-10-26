// api/delete-file.js
// Removes a file from the configured vector store.  Requires a DELETE
// request with a `fileId` query parameter.  Returns { success: true } on
// success.

// Delete a file from the configured OpenAI vector store.
// This handler supports both the legacy v1 vector store API and the newer
// Assistants v2 API for vector stores.  It attempts the v2 endpoint first
// and falls back to v1 if the v2 endpoint returns a 404.  Errors are
// propagated with as much detail as possible to aid debugging on the client.
export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const { fileId } = req.query || {};
  if (!fileId) {
    return res.status(400).json({ success: false, error: 'Missing fileId parameter' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY' });
  }
  if (!VECTOR_STORE_ID) {
    return res.status(500).json({ success: false, error: 'Missing VECTOR_STORE_ID' });
  }
  const headers = { Authorization: `Bearer ${OPENAI_API_KEY}` };
  try {
    // Attempt v2 Assistants API first
    let resp = await fetch(
      `https://api.openai.com/v1/assistants/v2/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`,
      { method: 'DELETE', headers }
    );
    // If the v2 endpoint returns 404, fall back to the legacy v1 endpoint
    if (resp.status === 404) {
      resp = await fetch(
        `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`,
        { method: 'DELETE', headers }
      );
    }
    const text = await resp.text();
    // If the response is not OK, forward the error details
    if (!resp.ok) {
      return res.status(resp.status).json({
        success: false,
        error: `Delete failed (${resp.status})`,
        details: text.slice(0, 300)
      });
    }
    // Try to parse JSON; some endpoints return no body
    let parsed = {};
    try { parsed = JSON.parse(text); } catch (_) {}
    return res.status(200).json({ success: true, data: { deleted: parsed?.deleted ?? true }, details: parsed });
  } catch (e) {
    console.error('Delete-file error:', e);
    return res.status(500).json({ success: false, error: 'Failed to delete file', details: e?.message || String(e) });
  }
}