
export const config = { runtime: 'edge' };

function naiveScore(transcript){
  const text = (transcript||[]).map(x=>x.text).join(' ');
  const len = Math.max(1, text.length);
  const clarity = Math.min(10, 6 + (text.match(/\btherefore|because|hence|thus\b/gi)||[]).length);
  const structure = Math.min(10, 6 + (text.match(/\bfirst|second|finally|conclusion\b/gi)||[]).length);
  const authority = Math.min(10, 5 + (text.match(/\bv\.|U\.S\.|F\.3d|CFR|Stat\.\b/gi)||[]).length);
  const delivery = Math.min(10, 6 + Math.min(4, Math.floor(len/800)));
  return { clarity, structure, authority, delivery };
}

export default async function handler(req) {
  try{
    const { transcript } = await req.json();
    const scores = naiveScore(transcript);
    return new Response(JSON.stringify({ success:true, data: scores }), {status:200, headers:{'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ success:false, error: e?.message || 'Failed to score' }), {status:200, headers:{'Content-Type':'application/json'}});
  }
}
