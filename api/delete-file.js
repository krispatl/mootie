// api/delete-file.js
// Removes a file from the configured vector store.
// Usage:
//   DELETE /api/delete-file?fileId=FILE_ID[&debug=1]
//   or JSON body: { "fileId": "FILE_ID" }
//
// Debugging:
//   - Enable by adding ?debug=1 OR setting process.env.DEBUG=1
//   - Logs are verbose but never print full secrets.
// Response shape (always):
//   { success: boolean, data?: any, error?: string, meta?: object }

const RUNTIME_HAS_FETCH = typeof fetch === 'function';

// Optional: polyfill fetch on older Node runtimes
let polyfilledFetch = null;
async function ensureFetch() {
  if (RUNTIME_HAS_FETCH) return fetch;
  if (!polyfilledFetch) {
    const mod = await import('node-fetch');
    polyfilledFetch = mod.default;
  }
  return polyfilledFetch;
}

function mask(str, visible = 4) {
  if (!str || typeof str !== 'string') return str;
  if (str.length <= visible) return '*'.repeat(str.length);
  return str.slice(0, visible) + '…' + '*'.repeat(Math.max(0, str.length - visible - 1));
}

function nowISO() {
  return new Date().toISOString();
}

function makeReqId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default async function handler(req, res) {
  const t0 = Date.now();
  const reqId = makeReqId();

  // CORS preflight (if you’re calling from a different origin in dev)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Request-Id', reqId);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const debug = url.searchParams.get('debug') === '1' || process.env.DEBUG === '1';

  const log = (...args) => {
    if (debug) console.log(`[delete-file][${reqId}]`, ...args);
  };

  try {
    if (req.method !== 'DELETE') {
      log('Invalid method:', req.method);
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        meta: { reqId, method: req.method }
      });
    }

    // Gather inputs
    const qFileId = url.searchParams.get('fileId');
    let bodyFileId = null;
    if (req.headers['content-type']?.includes('application/json')) {
      try {
        const raw = await readBodyJSON(req);
        bodyFileId = raw?.fileId || null;
        log('Parsed JSON body:', raw);
      } catch (e) {
        log('Body JSON parse failed:', e?.message || e);
      }
    }
    const fileId = qFileId || bodyFileId;

    // Env
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
    const OPENAI_ORG_ID = process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION;

    // Log (masked)
    log('Incoming at', nowISO());
    log('Node version:', process.version);
    log('Headers (subset):', {
      'content-type': req.headers['content-type'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'user-agent': req.headers['user-agent'],
    });
    log('Params:', { fileId, query: Object.fromEntries(url.searchParams.entries()) });
    log('Env:', {
      OPENAI_API_KEY: mask(OPENAI_API_KEY),
      VECTOR_STORE_ID: VECTOR_STORE_ID,
      OPENAI_ORG_ID: OPENAI_ORG_ID || '(none)',
    });

    // Validate inputs
    if (!fileId) {
      log('Missing fileId');
      return res.status(400).json({
        success: false,
        error: 'Missing fileId parameter',
        meta: { reqId }
      });
    }
    // Simple sanity check; OpenAI file ids typically start with "file_"/"file-"
    if (!/^file[-_]/i.test(fileId)) {
      log('fileId format looks unusual:', fileId);
    }
    if (!OPENAI_API_KEY) {
      log('Missing OPENAI_API_KEY');
      return res.status(500).json({
        success: false,
        error: 'Server misconfiguration: OPENAI_API_KEY is missing',
        meta: { reqId }
      });
    }
    if (!VECTOR_STORE_ID) {
      log('Missing VECTOR_STORE_ID');
      return res.status(500).json({
        success: false,
        error: 'Server misconfiguration: VECTOR_STORE_ID is missing',
        meta: { reqId }
      });
    }

    // Build request
    const endpoint = `https://api.openai.com/v1/vector_stores/${encodeURIComponent(
      VECTOR_STORE_ID
    )}/files/${encodeURIComponent(fileId)}`;

    const headers = {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    };
    if (OPENAI_ORG_ID) headers['OpenAI-Organization'] = OPENAI_ORG_ID;

    // Timeout guard
    const controller = new AbortController();
    const timeoutMs = Number(process.env.DELETE_TIMEOUT_MS || 15000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    log('DELETE', endpoint, 'with headers:', {
      Authorization: mask(headers.Authorization),
      'OpenAI-Organization': OPENAI_ORG_ID || '(none)',
    });

    const doFetch = await ensureFetch();
    let resp;
    try {
      resp = await doFetch(endpoint, {
        method: 'DELETE',
        headers,
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      log('Fetch threw:', fetchErr?.name, fetchErr?.message);
      if (fetchErr?.name === 'AbortError') {
        return res.status(504).json({
          success: false,
          error: `OpenAI delete timed out after ${timeoutMs}ms`,
          meta: { reqId, timeoutMs }
        });
      }
      return res.status(502).json({
        success: false,
        error: 'Failed to reach OpenAI',
        meta: { reqId, detail: fetchErr?.message || String(fetchErr) }
      });
    }
    clearTimeout(timeout);

    const text = await resp.text();
    log('OpenAI status:', resp.status, resp.statusText);
    log('OpenAI raw body (first 600 chars):', text.slice(0, 600));

    // Sometimes OpenAI returns bodyless 204; treat any 2xx as success
    if (resp.ok) {
      const durationMs = Date.now() - t0;
      log('Success; durationMs:', durationMs);
      return res.status(200).json({
        success: true,
        data: { deleted: true, fileId },
        meta: { reqId, durationMs, status: resp.status }
      });
    }

    // Non-2xx path
    // Interpret common cases to produce clearer messages
    const lowered = text.toLowerCase();
    let hint = null;
    if (resp.status === 401 || resp.status === 403) {
      hint = 'Check OPENAI_API_KEY (and OpenAI org if applicable).';
    } else if (resp.status === 404) {
      hint = 'File not found in this vector store. It may already be deleted.';
    } else if (resp.status === 400 && lowered.includes('invalid')) {
      hint = 'Check vector store ID and file ID formatting.';
    }

    return res.status(resp.status).json({
      success: false,
      error: `OpenAI delete failed (${resp.status})`,
      data: safeJsonParse(text),
      meta: { reqId, hint }
    });

  } catch (e) {
    console.error(`[delete-file][${reqId}] Uncaught error:`, e);
    return res.status(500).json({
      success: false,
      error: 'Unhandled server error',
      meta: { reqId, detail: e?.message || String(e) }
    });
  } finally {
    // Optional: small tail log
    // (kept minimal to avoid noise unless debugging is on)
  }
}

// ---- helpers ----
function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return { raw: s?.slice?.(0, 1000) }; }
}

function readBodyJSON(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
