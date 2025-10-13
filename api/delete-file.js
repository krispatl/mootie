// API route for deleting a file from the vector store. This endpoint
// expects a DELETE request with a `fileId` query parameter. It
// removes the specified file from the configured vector store. If
// successful it returns `{ success: true }`. Errors are reported
// with appropriate status codes and messages.

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { fileId } = req.query;
  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId parameter' });
  }
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  }
  if (!VECTOR_STORE_ID) {
    return res.status(500).json({ error: 'Missing VECTOR_STORE_ID' });
  }
  try {
    // Remove the file from the specified vector store.
    const resp = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      }
    );
    if (!resp.ok) {
      const errText = await resp.text();
      return res
        .status(resp.status)
        .json({ error: `Delete failed (${resp.status})`, details: errText.slice(0, 200) });
    }
    // Optionally, delete the underlying file from the file store. This is
    // commented out to avoid unintentional permanent deletion. Uncomment
    // if you wish to remove the file entirely once detached from the
    // vector store.
    // await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(fileId)}`, {
    //   method: 'DELETE',
    //   headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    // });
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('Delete-file error:', e);
    return res
      .status(500)
      .json({ error: 'Failed to delete file', details: e?.message || String(e) });
  }
}