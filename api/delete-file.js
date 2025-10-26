// pages/api/delete-file.js

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { fileId } = req.query;
  if (!fileId) {
    return res.status(400).json({ success: false, error: 'Missing fileId parameter' });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;

  if (!OPENAI_API_KEY || !VECTOR_STORE_ID) {
    return res.status(500).json({ success: false, error: 'Missing API credentials' });
  }

  try {
    const response = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      }
    });

    const statusText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `OpenAI deletion failed: ${response.status}`,
        body: statusText
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        deleted: true,
        responseStatus: response.status,
        responseBody: statusText
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Unexpected server error', details: error.message });
  }
}
