// api/vector-store.js
// Lists files currently attached to your OpenAI vector store.
// Compatible with both v1 and Assistants v2 endpoints.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
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
    // --- Try the new Assistants v2 path first ---
    let resp = await fetch(
      `https://api.openai.com/v1/assistants/v2/vector_stores/${VECTOR_STORE_ID}/files`,
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );

    // --- Fallback to old v1 path if v2 not found ---
    if (resp.status === 404) {
      resp = await fetch(
        `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
      );
    }

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { data: [] };
    }

    const files = (data?.data || []).map(f => ({
      id: f.id,
      filename: f.filename || f.name || 'Unnamed file',
      bytes: f.bytes || f.size || null,
      created_at: f.created_at || null,
    }));

    return res.status(200).json({ success: true, data: { vectors: files } });

  } catch (e) {
    console.error('Vector list error:', e);
    return res.status(500).json({
      success: false,
      error: 'Failed to list vector store files',
      details: e?.message || String(e)
    });
  }
}
