import OpenAI from "openai";

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const vectorStoreId = process.env.VECTOR_STORE_ID;
    if (!vectorStoreId)
      return new Response(JSON.stringify({ success: false, error: "VECTOR_STORE_ID missing" }), {
        status: 500,
      });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file)
      return new Response(JSON.stringify({ success: false, error: "No file provided" }), {
        status: 400,
      });

    const uploaded = await client.vectorStores.fileBatches.uploadAndPoll(vectorStoreId, {
      files: [file],
    });

    return new Response(JSON.stringify({ success: true, data: uploaded }), {
      status: 200,
    });
  } catch (err) {
    console.error("upload-document error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
    });
  }
}
