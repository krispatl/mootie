export const config = { runtime: "nodejs" };
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
    if (!VECTOR_STORE_ID) {
      return res.status(400).json({ success: false, error: "Missing VECTOR_STORE_ID" });
    }

    const list = await client.vectorStores.files.list(VECTOR_STORE_ID);
    const cleaned = [];

    for (const file of list.data) {
      try {
        await client.files.retrieve(file.id); // verify it still exists
        cleaned.push(file);
      } catch (err) {
        if (err.status === 404) {
          console.warn(`🧽 Removing ghost file ${file.id} from vector store...`);
          await client.vectorStores.files.del(VECTOR_STORE_ID, file.id);
        } else {
          throw err;
        }
      }
    }

    return res.status(200).json({ success: true, files: cleaned });
  } catch (err) {
    console.error("list-files error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
