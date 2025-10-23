// api/vector-store.js
// Lists files attached to your vector store and resolves filenames.

export const config = { runtime: 'edge' };

function j(res, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return j({ success: false, error: 'Method not allowed' }, 405);
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
  if (!OPENAI_API_KEY) return j({ success: false, error: 'Missing OPENAI_API_KEY' }, 500);
  if (!VECTOR_STORE_ID) return j({ success: false, error: 'Missing VECTOR_STORE_ID' }, 500);

  try {
    const listResp = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    const listText = await listResp.text();
    if (!listResp.ok) {
      return j({ success: false, error: 'List failed', details: listText }, listResp.status);
    }
    const list = JSON.parse(listText);
    const items = Array.isArray(list?.data) ? list.data : [];

    // resolve filenames by hitting /v1/files/{id}
    const resolved = await Promise.all(
      items.map(async (f) => {
        try {
          const fr = await fetch(`https://api.openai.com/v1/files/${f.id}`, {
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
          });
          const ft = await fr.text();
          if (!fr.ok) return { id: f.id, filename: 'Unknown', bytes: null, created_at: null };
          const meta = JSON.parse(ft);
          return {
            id: f.id,
            filename: meta.filename || meta.name || 'Unnamed',
            bytes: meta.bytes ?? null,
            created_at: meta.created_at ?? null,
          };
        } catch {
          return { id: f.id, filename: 'Unknown', bytes: null, created_at: null };
        }
      })
    );

    return j({ success: true, data: { vectors: resolved } });
  } catch (e) {
    return j({ success: false, error: 'Vector list error', details: e?.message || String(e) }, 500);
  }
}
