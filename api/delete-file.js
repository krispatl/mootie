// pages/api/delete-file.js
// Fully verified OpenAI Vector Store file deletion with status check and polling.

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { fileId } = req.query || {};
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;

  if (!fileId)
    return res.status(400).json({ success: false, error: 'Missing fileId parameter' });

  if (!OPENAI_API_KEY || !VECTOR_STORE_ID)
    return res.status(500).json({ success: false, error: 'Missing environment variables (OPENAI_API_KEY, VECTOR_STORE_ID)' });

  const headers = { Authorization: `Bearer ${OPENAI_API_KEY}` };
  const baseUrl = `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${fileId}`;

  try {
    console.log(`[delete-file] Checking status for file ${fileId}...`);

    // --- 1. Check current file status ---
    const statusResp = await fetch(baseUrl, { method: 'GET', headers });
    if (!statusResp.ok) {
      const msg = await statusResp.text();
      return res.status(statusResp.status).json({
        success: false,
        error: `Failed to fetch file status (${statusResp.status})`,
        details: msg.slice(0, 400),
      });
    }
    const statusJson = await statusResp.json();
    const fileStatus = statusJson?.status || 'unknown';
    console.log(`[delete-file] Current file status: ${fileStatus}`);

    // --- 2. Wait until status is 'completed' ---
    let waited = 0;
    while (fileStatus !== 'completed' && waited < 30000) {
      console.log(`[delete-file] Waiting for file to finish processing... (${waited / 1000}s)`);
      await new Promise(r => setTimeout(r, 3000));
      waited += 3000;

      const pollResp = await fetch(baseUrl, { method: 'GET', headers });
      const pollJson = await pollResp.json();
      if (pollJson.status === 'completed') break;
    }

    // --- 3. Delete the file ---
    console.log(`[delete-file] Sending DELETE request for ${fileId}...`);
    const deleteResp = await fetch(baseUrl, { method: 'DELETE', headers });
    const deleteText = await deleteResp.text();
    console.log(`[delete-file] DELETE response status: ${deleteResp.status}`);

    if (!deleteResp.ok) {
      return res.status(deleteResp.status).json({
        success: false,
        error: `OpenAI deletion failed (${deleteResp.status})`,
        body: deleteText.slice(0, 400),
      });
    }

    // --- 4. Confirm deletion via file list ---
    console.log(`[delete-file] Verifying that ${fileId} is gone...`);
    const listResp = await fetch(`https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`, { headers });
    const listJson = await listResp.json();
    const stillExists = listJson?.data?.some(f => f.id === fileId);

    if (stillExists) {
      console.warn(`[delete-file] ⚠️ File ${fileId} still exists after delete attempt`);
      return res.status(202).json({
        success: false,
        error: 'Delete request accepted but file still present (processing delay)',
        meta: { verified: false },
      });
    }

    // --- 5. Success ---
    console.log(`[delete-file] ✅ File ${fileId} deleted successfully.`);
    return res.status(200).json({
      success: true,
      data: {
        deleted: true,
        fileId,
        status: 'verified',
      },
    });
  } catch (err) {
    console.error('[delete-file] Exception:', err);
    return res.status(500).json({
      success: false,
      error: 'Unexpected error during file deletion',
      details: err.message,
    });
  }
}
