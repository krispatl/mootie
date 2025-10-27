// api/send-message.js
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).json({success:false,error:'Method not allowed'});
  const { text } = req.body || {};
  return res.status(200).json({ success:true, data:{ assistant: `Echo: ${text||''}`, references: [] }});
}
