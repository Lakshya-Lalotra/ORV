# ORV Reader — immersive novel + manhwa shell

Next.js 16 app with a **Prisma + PostgreSQL** API (swap to SQLite for local-only use). Demo copy and images are **placeholders**; replace with properly licensed novel text and manhwa art before publishing.

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production
- `npm run db:migrate` — apply schema
- `npm run setup` — **recommended**: `prisma generate` + `db push`, then prefer **`content/*.txt`** (OCR) → else EPUB → else PDF → else 3 demos.
- `npm run db:seed` — three demo chapters only (`chapter-1-demo` … `chapter-3-demo`)
- `npm run ingest:txt` — import from local DJVU/plain text. See `content/README.md`.
- `npm run ingest:txt:ia` — **download full ~7.6MB** Archive `*_djvu.txt`, then import all chapters.
- `npm run ingest:epub` — import from **`content/*.epub`** (prefers **`Final Ebup.epub`** / **`Final Epub.epub`**, then **`File.epub`**). **Spine** mode reads **`Ch N:` / `Chapter N:`** from each file so **`orv-ch-1` = novel chapter 1**. Optional **`ORV_SKIP_FIRST_CHAPTERS`** drops leading spine files. **`ORV_EPUB_MODE=merge`** merges HTML then splits on headings.
- `npm run ingest:orv` — import from PDF only. Replaces all chapters. Optional `content/manhwa-map.json` for panel URLs.
- Windows: `setup.ps1` — install, setup, `npm run dev`

> Once `NEXT_PUBLIC_ORV_BLOB_BASE` points at your R2 bucket, the running app parses each EPUB directly from R2 and the Prisma chapter/segment tables are no longer required for novel reads. The offline `ingest:*` scripts are kept for local snapshotting and debugging only.

## Environment

Copy `.env.example` to `.env`. For hosted Postgres, set `DATABASE_URL` and run `npx prisma migrate deploy`.

## Routes

- `/` — landing
- `/chapters` — chapter list
- `/chapter/[slug]` — reader

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/chapters/[slug]` | Chapter JSON for the reader |
| POST | `/api/progress` | Upsert reading position (`sessionId`, `chapterSlug`, `segmentIndex`, `scrollRatio`) |
| GET | `/api/progress?sessionId=&chapterSlug=` | Load saved progress |
| POST | `/api/analytics` | Events (`sessionId`, `event`, optional `meta`) |
| GET | `/api/audio-assets` | Audio metadata from DB |

All non-public endpoints require the reader-gate cookie set by `/auth` and are rate-limited per IP.

## Content model

- **Chapter** → ordered **Segment** rows (novel blocks) → optional **ManhwaPanel** (1:1 by `segmentId`).
- **AudioAsset** stores URLs/keys for hosted sound files (procedural audio works without files).
- **ReadingProgress** / **AnalyticsEvent** back progress and telemetry.

## Legal

Do not scrape or redistribute **Webnovel** or **webtoon** sources without rights. This repo only demonstrates structure and UX.
