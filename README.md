# ORV Reader — immersive novel + manhwa shell

Next.js 16 app with a **Prisma + SQLite** API (swap to **PostgreSQL** on [Neon](https://neon.tech) or [Supabase](https://supabase.com) for production). Demo copy and images are **placeholders**; replace with properly licensed novel text and manhwa art before publishing.

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production
- `npm run db:migrate` — apply schema
- `npm run setup` — **recommended**: `prisma generate` + `db push`, then prefer **`content/*.txt`** (OCR) → else PDF → else 3 demos.
- `npm run db:seed` — three demo chapters only (`chapter-1-demo` … `chapter-3-demo`)
- `npm run ingest:txt` — import from local DJVU/plain text. See `content/README.md`.
- `npm run ingest:txt:ia` — **download full ~7.6MB** Archive `*_djvu.txt`, then import all chapters (fixes “only 39 chapters” if you had a partial file).
- `npm run ingest:epub` — import from **`content/*.epub`** (prefers **`Final Ebup.epub`** / **`Final Epub.epub`**, then **`File.epub`**). **Spine** mode reads **`Ch N:` / `Chapter N:`** from each file so **`orv-ch-1` = novel chapter 1** (same numbering as [Bittu5134/ORV-Reader](https://github.com/Bittu5134/ORV-Reader) / orv.pages.dev). Optional **`ORV_SKIP_FIRST_CHAPTERS`** drops leading spine files. For a guaranteed match to the repo, use **`npm run ingest:bittu`**. **`ORV_EPUB_MODE=merge`** merges HTML then splits on headings.
- `npm run ingest:bittu` — **recommended for full novel:** fetch **551** chapters from [Bittu5134/ORV-Reader](https://github.com/Bittu5134/ORV-Reader) (fan project; respect their [LICENSE](https://github.com/Bittu5134/ORV-Reader/blob/main/LICENSE.txt)).
- `npm run ingest:orv` — import from PDF only. Replaces all chapters. Optional `content/manhwa-map.json` for panel URLs.
- Windows: `setup.ps1` — install, setup, `npm run dev`

## Environment

Copy `.env.example` to `.env`. For hosted Postgres, set `DATABASE_URL` and run `npx prisma migrate deploy`.

## Routes

- `/` — landing
- `/chapters` — chapter list (Prisma `Chapter` rows, ordered by `order`)
- `/chapter/[slug]` — reader

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/chapters/[slug]` | Chapter JSON for the reader |
| POST | `/api/progress` | Upsert reading position (`sessionId`, `chapterSlug`, `segmentIndex`, `scrollRatio`) |
| GET | `/api/progress?sessionId=&chapterSlug=` | Load saved progress |
| POST | `/api/analytics` | Events (`sessionId`, `event`, optional `meta`) |
| GET | `/api/audio-assets` | Audio metadata from DB |

## Content model

- **Chapter** → ordered **Segment** rows (novel blocks) → optional **ManhwaPanel** (1:1 by `segmentId`).
- **AudioAsset** stores URLs/keys for hosted sound files (procedural audio works without files).
- **ReadingProgress** / **AnalyticsEvent** back progress and telemetry.

## Legal

Do not scrape or redistribute **Webnovel** or **webtoon** sources without rights. This repo only demonstrates structure and UX.
