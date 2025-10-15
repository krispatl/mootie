// api/debate.js
// This endpoint is reserved for future live debate orchestration.  At
// present it accepts a POST request with arbitrary JSON and returns a
// simple message acknowledging the call.  A future implementation
// could coordinate timed turns, role switching and spectator feeds.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  let body = {};
  try {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    body = raw ? JSON.parse(raw) : {};
  } catch (err) {
    // ignore parse errors
  }
  return res.status(200).json({ success: true, data: { message: 'Debate endpoint placeholder', request: body } });
}