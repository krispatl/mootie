export default async function handler(req, res){
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  // Placeholder to integrate with TTS pipeline; returns dummy URL
  return res.status(200).json({ url: null, note: 'TTS placeholder. Wire to ElevenLabs/OpenAI TTS.' });
}
