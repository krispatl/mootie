// api/delete-file.js
// Removes a file from your vector store (does NOT delete the file itself).

export const config = { runtime: 'edge' };

function j(res, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method !== 'DELETE') {
    return j({ success: false, error: 'Method not allowed' }, 405);
  }

  const url = new URL(req.url);
  const fileId = url.searchParams.get('fileId');
  if (!fileId) return j({ success: false, error: 'Missing fileId parameter' }, 400);

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return j({ success: false, error: 'Missing OPENAI_API_KEY' }, 500);
  if (!VECTOR_STORE_ID) return j({ success: false, error: 'Missing VECTOR_STORE_ID' }, 500);

  try {
    const resp = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      }
    );
    const text = await resp.text();
    if (!resp.ok) {
      return j({ success: false, error: `Delete failed (${resp.status})`, details: text.slice(0, 300) }, resp.status);
    }
    // OpenAI typically returns: { id, object: "vector_store.file.deleted", deleted: true }
    return j({ success: true, data: { deleted: true } });
  } catch (e) {
    return j({ success: false, error: 'Failed to delete file', details: e?.message || String(e) }, 500);
  }
}
