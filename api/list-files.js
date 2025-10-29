// pages/api/list-files.js
export default async function handler(req, res) {
  const { OPENAI_API_KEY, VECTOR_STORE_ID } = process.env;
  const r = await fetch(
    `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/files`,
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
  );
  const j = await r.json();
  return res.status(r.status).json(j);
}
