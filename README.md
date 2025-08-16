# MOOT AI (Vercel)

MOOT AI debate practice tool.

## Deploy

1. Set environment variables on Vercel:
   - `OPENAI_API_KEY`
   - `VECTOR_STORE_ID` (optional, but required if you want file_search grounding)

2. `vercel` to deploy, or push to a Git repo connected to Vercel.

## Endpoints
- `POST /api/send-message` — chat via Responses API (+ TTS)
- `POST /api/transcribe` — uploads webm audio and transcribes with Whisper (`whisper-1`)
- `POST /api/upload-document` — uploads a file and attaches it to the Vector Store
- `GET  /api/vector-store` — lists files currently attached to the Vector Store

## Notes

