
import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const fileId = req.query.fileId;
  const vectorStoreId = process.env.VECTOR_STORE_ID;

  console.log('[API] Deleting file from vector store:', fileId);

  if (!fileId || !vectorStoreId || !process.env.OPENAI_API_KEY) {
    return res.status(400).json({ success: false, error: 'Missing required parameters' });
  }

  try {
    const response = await openai.beta.vectorStores.files.del(vectorStoreId, fileId);
    return res.status(200).json({ success: true, data: response });
  } catch (err) {
    console.error('[API ERROR] Failed to delete file:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
