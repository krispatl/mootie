
export const config = { runtime: 'edge' };

function naiveNotes(transcript){
  const parts = (transcript||[]).filter(x=>x.role==='assistant' || x.role==='user').slice(-12);
  const aiLines = parts.filter(x=>x.role==='assistant').map(x=>x.text).join(' ');
  const s1 = `Overall, your argument shows solid command of structure, with clear issue framing.`;
  const s2 = `Focus on tightening transitions and explicitly linking evidence to each premise; avoid overlong set‑ups.`;
  const s3 = `Next round: lead with relief sought, cite strongest authority early, and pre‑empt likely bench questions.`;
  return `${s1} ${s2} ${s3}`;
}

export default async function handler(req){
  try{
    const { transcript } = await req.json();
    const notes = naiveNotes(transcript);
    return new Response(JSON.stringify({ success:true, data:{ notes } }), {status:200, headers:{'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ success:false, error: e?.message || 'Failed to summarize' }), {status:200, headers:{'Content-Type':'application/json'}});
  }
}
