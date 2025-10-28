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

## Deployment & Environment

Set these environment variables (locally in `.env` or in Vercel project settings):

- `OPENAI_API_KEY` (required)
- `VECTOR_STORE_ID` (optional, needed for file search)
- `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`)

The app uses the **Responses API** (`/v1/responses`) with `input` + `instructions`, and enables `file_search` via `tool_resources.file_search.vector_store_ids`.

Vector store files are uploaded via `/v1/files` then attached using `/v1/vector_stores/{id}/files`.

CORS is enabled for all API routes to support local + Vercel.
