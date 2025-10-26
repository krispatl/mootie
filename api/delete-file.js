// api/delete-file.js
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
    return res.status(500).json({ success: false, error: 'Missing environment variables' });
  }

  const url = `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${fileId}`;
  console.log(`[API] DELETE ${url}`);

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API] Delete failed:', errorText);
      return res.status(response.status).json({
        success: false,
        error: `Failed to delete file`,
        details: errorText
      });
    }

    return res.status(200).json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[API] Delete error:', error);
    return res.status(500).json({
      success: false,
      error: 'Exception during delete',
      details: error?.message || String(error)
    });
  }
}
