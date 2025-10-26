// api/delete-file.js
// DELETE /api/delete-file?fileId=<id>
// -> { success: true, data: { deleted: true, fileId } }

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
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(500).json({ success: false, error: 'Missing env vars (OPENAI_API_KEY, VECTOR_STORE_ID)' });
  }

  const url = `https://api.openai.com/v1/vector_stores/${encodeURIComponent(VECTOR_STORE_ID)}/files/${encodeURIComponent(fileId)}`;
  try {
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
    });

    // Treat any 2xx as accepted (OpenAI may return 204 No Content)
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return res.status(resp.status).json({
        success: false,
        error: `OpenAI delete failed (${resp.status})`,
        details: txt?.slice?.(0, 400)
      });
    }

    return res.status(200).json({ success: true, data: { deleted: true, fileId } });
  } catch (e) {
    console.error('[delete-file] Exception:', e);
    return res.status(500).json({ success: false, error: 'Delete request exception', details: e?.message || String(e) });
  }
}
