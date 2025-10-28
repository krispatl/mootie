// api/score.js
// Adds CORS support to the simple heuristic scoring endpoint.

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }
  const { text } = body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing `text` field' });
  }
  try {
    const metrics = computeScores(text);
    return res.status(200).json({ success: true, data: metrics });
  } catch (err) {
    console.error('score error:', err);
    return res.status(500).json({ success: false, error: 'Failed to score message' });
  }
}

// Parse JSON body
async function parseBody(req) {
  if (req.body) return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}

function computeScores(text) {
  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  const avgLen = sentences.length ? words.length / sentences.length : words.length;
  let clarity = Math.max(1, 10 - avgLen / 5);
  if (clarity > 10) clarity = 10;
  const structureKeywords = ['first', 'second', 'third', 'next', 'finally', 'step'];
  let structCount = 0;
  const lower = text.toLowerCase();
  structureKeywords.forEach(k => {
    const re = new RegExp('\\b' + k + '\\b', 'g');
    structCount += (lower.match(re) || []).length;
  });
  let structure = sentences.length ? Math.min(10, (structCount / sentences.length) * 10) : 0;
  const caseMatches = text.match(/\b\w+\s+v\.\s+\w+/g) || [];
  let authority = Math.min(10, caseMatches.length * 2 + words.filter(w => /\b[A-Z][a-z]+/.test(w)).length * 0.1);
  const respKeywords = ['your honor', 'you asked', 'in response', 'responding to'];
  let respCount = 0;
  respKeywords.forEach(k => {
    const re = new RegExp(k, 'gi');
    respCount += (text.match(re) || []).length;
  });
  let responsiveness = Math.min(10, respCount * 2);
  const persKeywords = ['therefore', 'must', 'should', 'because', 'hence', 'thus'];
  let persScore = 0;
  persKeywords.forEach(k => {
    const re = new RegExp('\\b' + k + '\\b', 'gi');
    persScore += (text.match(re) || []).length;
  });
  let persuasiveness = Math.min(10, persScore * 2);
  const notes = [
    clarity > 7 ? 'Clear' : 'Could be clearer',
    structure > 6 ? 'Well structured' : 'Improve structure',
    authority > 6 ? 'Authoritative' : 'Cite more authority',
    responsiveness > 6 ? 'Responsive' : 'Address the bench directly',
    persuasiveness > 6 ? 'Persuasive' : 'Use stronger connective reasoning'
  ].join(' · ');

  return { clarity, structure, authority, responsiveness, persuasiveness, notes };
}
