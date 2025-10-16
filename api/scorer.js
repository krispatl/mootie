export default async function handler(req, res){
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  const { transcript=[] } = req.body || {};

  // naive heuristics for demo; replace with model-assisted scoring if desired
  const text = transcript.map(t => t.content).join(' ');
  const len = text.length;
  const hasStruct = /first|second|therefore|however|because/i.test(text) ? 1 : 0;
  const cites = (text.match(/v\./g) || []).length + (text.match(/\bUSC\b/g) || []).length;

  const scores = {
    clarity: clamp(Math.round(6 + (len>400?2:0) + (len>800?2:0)), 1, 10),
    structure: clamp(4 + hasStruct*4, 1, 10),
    authority: clamp(3 + Math.min(7, cites), 1, 10),
    responsiveness: clamp(5 + (/\b(as noted|you claim|your argument)\b/i.test(text)?3:0), 1, 10),
    persuasiveness: clamp(5 + Math.floor(Math.random()*4), 1, 10)
  };

  const feedback = [
    scores.structure < 8 ? 'Tighten structure with signposting (First, Second, Therefore).' : 'Strong structure and flow.',
    scores.authority < 7 ? 'Add precedent or statutory hooks to strengthen authority.' : 'Good use of authority.',
    scores.responsiveness < 7 ? 'Engage the opponent’s key claim directly and refute succinctly.' : 'Directly responsive to arguments.',
    scores.clarity < 8 ? 'Simplify dense sentences and define terms.' : 'Clear and concise delivery.'
  ];

  return res.status(200).json({ scores, feedback });
}

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
