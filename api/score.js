// api/score.js
// Basic rubric scoring endpoint for Mootie.  This endpoint accepts a
// POST request with a `text` property and returns numeric metrics for
// clarity, structure, authority, responsiveness and persuasiveness on
// a 0–10 scale.  These heuristics are deliberately simple; they can
// later be replaced with more sophisticated language models or
// domain-specific scoring functions.

export default async function handler(req, res) {
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

// Parse JSON body from Request or Node req
async function parseBody(req) {
  if (req.body) {
    // In Vercel/Next.js, req.body may be populated already
    return req.body;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
  }
  return JSON.parse(raw || '{}');
}

/**
 * Compute heuristic scores for a piece of text.  Each metric is
 * normalized to a value between 0 and 10.  The rules are simple:
 * - clarity: shorter sentences imply higher clarity.
 * - structure: presence of ordering words like "first", "second", etc.
 * - authority: mentions of case law (e.g. containing " v. ") or statutes.
 * - responsiveness: mentions of "your honor" or direct replies.
 * - persuasiveness: usage of persuasive words such as "therefore", "must", "should".
 * Returns scores along with a textual note identifying strengths and weaknesses.
 */
function computeScores(text) {
  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  // Clarity: fewer words per sentence -> higher score
  const avgLen = sentences.length ? words.length / sentences.length : words.length;
  let clarity = Math.max(1, 10 - avgLen / 5);
  if (clarity > 10) clarity = 10;
  // Structure: count ordering keywords per sentence
  const structureKeywords = ['first', 'second', 'third', 'next', 'finally', 'step'];
  let structCount = 0;
  const lower = text.toLowerCase();
  structureKeywords.forEach(k => {
    const re = new RegExp('\\b' + k + '\\b', 'g');
    structCount += (lower.match(re) || []).length;
  });
  let structure = sentences.length ? Math.min(10, (structCount / sentences.length) * 10) : 0;
  // Authority: count case law citations (with v.) and capitalized proper nouns (heuristic)
  const caseMatches = text.match(/\b\w+\s+v\.\s+\w+/g) || [];
  let authority = Math.min(10, caseMatches.length * 2 + words.filter(w => /\b[A-Z][a-z]+/.test(w)).length * 0.1);
  // Responsiveness: look for direct address of the bench
  const respKeywords = ['your honor', 'you asked', 'in response', 'responding to'];
  let respCount = 0;
  respKeywords.forEach(k => {
    const re = new RegExp(k, 'gi');
    respCount += (text.match(re) || []).length;
  });
  let responsiveness = Math.min(10, respCount * 4);
  // Persuasiveness: persuasive phrases
  const persKeywords = ['therefore', 'thus', 'clearly', 'must', 'compelling', 'should'];
  let persCount = 0;
  persKeywords.forEach(k => {
    const re = new RegExp('\\b' + k + '\\b', 'gi');
    persCount += (text.match(re) || []).length;
  });
  let persuasiveness = Math.min(10, persCount * 3);
  // Generate notes: pick highest and lowest metric
  const vals = { clarity, structure, authority, responsiveness, persuasiveness };
  const sorted = Object.entries(vals).sort((a,b) => b[1] - a[1]);
  const strengths = sorted[0][0];
  const weaknesses = sorted[sorted.length - 1][0];
  const notes = `Strength: ${strengths}. Weakness: ${weaknesses}.`;
  return { clarity: round1(clarity), structure: round1(structure), authority: round1(authority), responsiveness: round1(responsiveness), persuasiveness: round1(persuasiveness), notes };
}

function round1(num) {
  return Math.round(num * 10) / 10;
}