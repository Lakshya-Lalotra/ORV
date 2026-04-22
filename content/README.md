# Local content (not committed)

## One command setup

```bash
npm run setup
```

This runs `prisma generate`, `prisma db push`, then picks the first source that exists:

1. **Full book from Archive** — `npm run ingest:txt:ia` or `ORV_FETCH_ARCHIVE=1` + `npm run setup`.
2. **Local `.txt`** → `npm run ingest:txt` (prefers `orv-archive-full.txt` if present).
3. **`.epub` in content/** → `npm run ingest:epub`.
4. **`.pdf`** → `npm run ingest:orv` (falls back to demos if extract fails).
5. **Else** → three demo chapters.

Windows: double-click `setup.ps1` (installs deps, runs `setup`, starts `npm run dev`).

> In production we do **not** use these ingest scripts — the live app parses each EPUB directly from R2 (see `NEXT_PUBLIC_ORV_BLOB_BASE` in `.env.example`). The steps below are only needed for local / offline experiments against the Prisma database.

## Plain text / OCR (`.txt`)

- **`File.txt`** — if you paste the full novel here, **save the file** (Ctrl+S), then run `npm run ingest:txt`. That name is chosen first over other `.txt` files.
- Long paste in one line is OK: ingest inserts line breaks before each `Chapter N:`.
- Or drop Archive `*_djvu.txt` here, **or** set `ORV_TXT_PATH` in `.env`.
- Optional: `ORV_MAX_CHAPTERS=15` when running `ingest:txt` to test on a subset.

## EPUB (`.epub`)

- Put **`Final Ebup.epub`** (or **`Final Epub.epub`**) here — that name is preferred over `File.epub` when several `.epub` files exist — then **`npm run ingest:epub`**.
  **Spine** mode uses **`Ch N:` / `Chapter N:`** in the title or first line so **`orv-ch-N`** matches the novel. Optional **`ORV_SKIP_FIRST_CHAPTERS`** skips the first N spine **files** before parsing.
- **`ORV_EPUB_MODE=merge`** — one merged HTML blob split on **`Chapter N:`** / **`Ch N:`** (older path).
- If neither fits, use Calibre **“Convert to TXT”** and run **`ingest:txt`** instead.

## PDF

- Put **any** `*.pdf` in this folder (preferred name is still
  `Omniscient Reader's Viewpoint - Sing-shong (singsyong).pdf`), **or** set `ORV_PDF_PATH` in `.env`.
- You must have rights to use that file.

## ORV Sequel (side story, Ch 553–999)

Put `orv_sequel.epub` in this folder, then:

```bash
npm run ingest:sequel                  # all 447 chapters, skips existing
npm run ingest:sequel -- --force       # wipe content/sequel/ and rebuild
npm run ingest:sequel -- --limit=10    # first 10 only
npm run ingest:sequel -- --from=600 --to=620
```

Parses the EPUB spine locally into structured JSON under `content/sequel/`:

- `index.json` — `[{ number, slug, title, order }]`
- `ch_{number}.json` — `{ segments[], authorNote[], sourceUrl, ... }` for each chapter (553–999).

The site then renders this at **`/stories/sequel`** (landing) and **`/stories/sequel/ch/[n]`** (reader). No Prisma ingest step needed — the loader reads JSON directly on the server.

## Manhwa 1:1 (optional)

Copy `manhwa-map.example.json` → `manhwa-map.json` and list image URLs in **segment order** per slug (`orv-ch-1`, …). Index `0` = first paragraph after the chapter title.

Each URL may be:

- `https://…` / `http://…`, or
- a **same-site path** like `/panels/orv-ch-1/001.webp` (files must live under `public/panels/…`).

### From files on disk (you must have rights to the images)

This project **does not** download from WEBTOON or other sites. If you have permission and save panels yourself:

1. Put images under folders named **`orv-ch-1`**, **`orv-ch-2`**, … (or **`1`**, **`2`**, …) inside **`content/panels/`** (gitignored).
2. Run **`npm run build:manhwa-map -- --sync`** — copies into **`public/panels/`** and writes **`content/manhwa-map.json`** with paths `/panels/...`.
3. Re-run your novel ingest (e.g. **`npm run ingest:epub`**) so `ManhwaPanel` rows attach to segments.

Optional: **`ORV_PUBLIC_ORIGIN=https://your.domain`** when running `build:manhwa-map` to emit absolute URLs instead of `/panels/...`.

Ingest **replaces** all chapters; demo rows are removed when import succeeds.

## Auth prologue copy (`/auth`)

- **`prologue.json`** — intro + reveal matrix (see repo). Edit or replace; use `{{readerName}}` in reveal lines where needed.
- **`prologue.txt`** (optional) — intro only, one line per step; optional whisper after a **TAB**. Used if you prefer not to use JSON for intro; see **`prologue.example.txt`**.
- Prologue **video / audio / finale hero** URLs: set **`NEXT_PUBLIC_ORV_BLOB_BASE`** or per-asset URLs in `.env` (see `.env.example`) so media can live on blob storage instead of `public/`.
