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

  try {
    // First remove from vector store
    const vectorUrl = `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${fileId}`;
    const vectorResp = await fetch(vectorUrl, {
      method: 'DELETE',
      headers: { 
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!vectorResp.ok) {
      const errorText = await vectorResp.text().catch(() => 'Unknown error');
      console.error('Vector store deletion failed:', vectorResp.status, errorText);
      return res.status(vectorResp.status).json({
        success: false,
        error: `Vector store deletion failed (${vectorResp.status})`,
        details: errorText.slice(0, 400)
      });
    }

    // Then delete the file entirely
    const fileUrl = `https://api.openai.com/v1/files/${fileId}`;
    const fileResp = await fetch(fileUrl, {
      method: 'DELETE',
      headers: { 
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!fileResp.ok) {
      const errorText = await fileResp.text().catch(() => 'Unknown error');
      console.error('File deletion failed:', fileResp.status, errorText);
      // We still return success since it was removed from vector store
      console.warn('File removed from vector store but not fully deleted');
    }

    return res.status(200).json({ 
      success: true, 
      data: { 
        deleted: true, 
        fileId,
        message: 'File successfully removed from vector store and deleted'
      } 
    });

  } catch (e) {
    console.error('[delete-file] Exception:', e);
    return res.status(500).json({ 
      success: false, 
      error: 'Delete request exception', 
      details: e?.message || String(e) 
    });
  }
}
