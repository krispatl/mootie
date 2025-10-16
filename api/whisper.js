export default async function handler(req, res){
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  // Placeholder to integrate with STT pipeline; returns dummy transcript
  return res.status(200).json({ text: 'Transcription placeholder. Wire to your STT pipeline.' });
}
