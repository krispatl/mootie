// api/delete-file.js
// Deletes a file from an OpenAI vector store, polling until it disappears.

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { fileId } = req.query || {};
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!fileId) return res.status(400).json({ success: false, error: 'Missing fileId' });
  if (!OPENAI_API_KEY || !VECTOR_STORE_ID)
    return res.status(500).json({ success: false, error: 'Missing environment vars' });

  const headers = { Authorization: `Bearer ${OPENAI_API_KEY}` };

  const base = `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}`;
  const deleteUrl = `${base}/files/${encodeURIComponent(fileId)}`;

  console.log(`[delete-file] Starting delete of ${fileId} from store ${VECTOR_STORE_ID}`);

  try {
    // Send DELETE
    const delResp = await fetch(deleteUrl, { method: 'DELETE', headers });
    console.log(`[delete-file] DELETE returned`, delResp.status, delResp.statusText);

    // Poll for disappearance
    const maxWaitMs = 30000;
    const pollInterval = 3000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollInterval));
      const listResp = await fetch(`${base}/files`, { headers });
      const listData = await listResp.json();
      const exists = listData?.data?.some(f => f.id === fileId);
      console.log(`[delete-file] Poll check at ${((Date.now() - start)/1000).toFixed(1)}s: ${exists ? 'still exists' : 'gone'}`);
      if (!exists) {
        console.log(`[delete-file] ✅ File ${fileId} deleted successfully.`);
        return res.status(200).json({
          success: true,
          data: { deleted: true, fileId, verified: true },
          meta: { polls: Math.ceil((Date.now() - start) / pollInterval) }
        });
      }
    }

    console.warn(`[delete-file] ⚠️ Timeout: file still present after ${maxWaitMs / 1000}s`);
    return res.status(202).json({
      success: false,
      error: 'Delete pending (still present after 30s)',
      meta: { fileId, timeout: true }
    });
  } catch (e) {
    console.error('[delete-file] Uncaught exception:', e);
    return res.status(500).json({
      success: false,
      error: 'Unexpected deletion error',
      meta: { message: e.message }
    });
  }
}
