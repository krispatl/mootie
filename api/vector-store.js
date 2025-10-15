// api/vector-store.js
// Lists files attached to the configured OpenAI vector store.  Returns
// an array of objects with id and filename properties.  On any
// errors or missing configuration the endpoint returns an empty list.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(200).json({ success: true, data: { vectors: [] } });
  }
  try {
    const list = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
    });
    const data = await list.json();
    if (!Array.isArray(data?.data)) {
      return res.status(200).json({ success: true, data: { vectors: [] } });
    }
    const filesWithNames = await Promise.all(
      data.data.map(async (file) => {
        const fr = await fetch(`https://api.openai.com/v1/files/${file.id}`, {
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
        });
        const fd = await fr.json();
        return { id: file.id, filename: fd.filename || 'Unnamed file' };
      })
    );
    return res.status(200).json({ success: true, data: { vectors: filesWithNames } });
  } catch (e) {
    console.error('Vector list error:', e);
    return res.status(200).json({ success: true, data: { vectors: [] } });
  }
}