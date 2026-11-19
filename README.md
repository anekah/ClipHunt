# ClipHunt — AI Viral Video Clip Studio

ClipHunt is a full-stack AI video clipping platform that identifies engaging 20.0-second moments in videos using multi-signal scoring (transcript semantics, FFmpeg audio energy peaks, scene changes, comment timestamps, and replay heatmaps) and renders validated **16:9 Landscape** and **9:16 Vertical** (1080×1920 blurred-background) MP4 clips with optional burned-in ASS captions.

## Architecture Overview

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Motion.
- **Backend**: Node.js + Express (`server.ts`) with persistent SQLite runtime store (`.data/cliphunt.db`) and background job processing (`server/jobRunner.ts`).
- **Video Processing**: Native `ffmpeg` and `ffprobe` (`server/ffmpegPipeline.ts`) for audio RMS energy detection, visual scene-change detection, dual 16:9 & 9:16 H.264/AAC encoding, ASS subtitle burn-in, and 3-frame render validation.
- **AI Analysis**: Server-side `@google/genai` SDK (`gemini-4-hydrogen`) in `server/geminiAnalyzer.ts` with structured JSON schema output.
- **PostgreSQL / Supabase Schema**: Production migration blueprint provided in `db/schema.sql`.

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `GEMINI_API_KEY`: Server-side Gemini API key (configured via Secrets in AI Studio).
- `APP_URL`: Public application URL.
- `CLIPHUNT_DATA_DIR`: Optional directory for database and rendered MP4 clips (default `.data`).
- `MAX_UPLOAD_MB`: Maximum authorized upload size in MB (default `250`).

## Local Development & Verification

```bash
npm install
npm run dev
```

Run pure logic unit tests:

```bash
npx --yes tsx --test src/lib/*.test.ts
```

Build for production:

```bash
npm run build
npm start
```

## Deployment Notes

- Run the backend on a persistent Node/Docker host (Render, Railway, Cloud Run, or Fly.io) with `ffmpeg` and `ffprobe` installed so long-running video processing jobs do not hit serverless timeouts.
- For Supabase/PostgreSQL persistence, apply `db/schema.sql` to your database instance.
