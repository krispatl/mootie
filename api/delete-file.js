// api/delete-file.js
// Removes a file from the configured vector store (v1). Does not delete the File itself.

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

  try {
    // Include beta header so the API correctly interprets the request as a File Search operation
    const resp = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      },
    );
    const text = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({
        success: false,
        error: `Delete failed (${resp.status})`,
        details: text.slice(0, 500),
      });
    }
    return res.status(200).json({ success: true, data: { deleted: true } });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to delete file', details: e?.message || String(e) });
  }
}
