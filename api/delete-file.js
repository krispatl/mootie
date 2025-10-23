// api/delete-file.js
// Compatible with both legacy and new Assistants v2 vector store endpoints.

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
    // Try new Assistants v2 endpoint first
    let resp = await fetch(
      `https://api.openai.com/v1/assistants/v2/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`,
      { method: 'DELETE', headers }
    );

    // Fallback to legacy path if not found
    if (resp.status === 404) {
      resp = await fetch(
        `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`,
        { method: 'DELETE', headers }
      );
    }

    const text = await resp.text();
    console.log('OpenAI delete response:', text);

    if (!resp.ok) {
      return res.status(resp.status).json({
        success: false,
        error: `Delete failed (${resp.status})`,
        details: text.slice(0, 200),
      });
    }

    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = {}; }

    return res.status(200).json({
      success: true,
      data: { deleted: parsed?.deleted ?? true },
      details: parsed,
    });
  } catch (e) {
