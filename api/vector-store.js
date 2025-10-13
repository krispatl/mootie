// API route to list files currently stored in the vector store. The
// endpoint returns a list of objects containing the file ID and
// filename for each attachment. If the environment variables are
// missing, it returns an empty list rather than throwing an error.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  // Without an API key or vector store ID there is nothing to list.
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(200).json({ vectors: [] });
  }

  try {
    // List the files attached to the vector store.
    const list = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });
    if (!list.ok) {
      const errText = await list.text();
      return res
        .status(list.status)
        .json({ vectors: [], error: `Failed to list vector store (${list.status})`, details: errText.slice(0, 200) });
    }
    const data = await list.json();
    if (!Array.isArray(data?.data)) {
      return res.status(200).json({ vectors: [] });
    }
    // For each file, fetch its metadata to get the filename. This can
    // potentially be parallelised with Promise.all.
    const filesWithNames = await Promise.all(
      data.data.map(async (file) => {
        try {
          const fr = await fetch(`https://api.openai.com/v1/files/${file.id}`, {
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
          });
          if (!fr.ok) {
            return { id: file.id, filename: 'Unknown file' };
          }
          const fd = await fr.json();
          return { id: file.id, filename: fd?.filename || 'Unnamed file' };
        } catch {
          return { id: file.id, filename: 'Unknown file' };
        }
      })
    );
    return res.status(200).json({ vectors: filesWithNames });
  } catch (e) {
    console.error('Vector list error:', e);
    return res.status(200).json({ vectors: [] });
  }
}