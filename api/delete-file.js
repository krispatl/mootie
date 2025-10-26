// api/delete-file.js
// Robust deletion with confirmation and debug logging

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { fileId } = req.query || {};
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;

  if (!fileId) return res.status(400).json({ success: false, error: 'Missing fileId parameter' });
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID)
    return res.status(500).json({ success: false, error: 'Missing API key or vector store ID' });

  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log(`[delete-file] Attempting to delete ${fileId} from store ${VECTOR_STORE_ID}`);
    const delResp = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`,
      { method: 'DELETE', headers }
    );

    const status = delResp.status;
    console.log(`[delete-file] Delete response status: ${status}`);

    // Always recheck file list
    const listResp = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
      { headers }
    );
    const listData = await listResp.json();

    const stillExists = listData?.data?.some(f => f.id === fileId);
    if (stillExists) {
      console.warn(`[delete-file] File ${fileId} still exists after deletion attempt`);
      return res.status(200).json({
        success: false,
        error: 'File still present after deletion attempt',
        meta: { status, listCount: listData?.data?.length }
      });
    }

    console.log(`[delete-file] ✅ File ${fileId} successfully deleted`);
    return res.status(200).json({
      success: true,
      data: { deleted: true, fileId, status },
      meta: { verified: true }
    });
  } catch (e) {
    console.error('[delete-file] Exception:', e);
    return res.status(500).json({
      success: false,
      error: 'Unexpected error during file deletion',
      meta: { message: e.message }
    });
  }
}
