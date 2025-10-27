// api/score.js
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).json({success:false,error:'Method not allowed'});
  return res.status(200).json({ success:true, data:{
    clarity:7.5, structure:7.2, authority:7.8, responsiveness:7.1, persuasiveness:7.6,
    notes:'Tighten your relief; lead with the standard.'
  }});
}
