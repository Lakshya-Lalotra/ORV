# Upload prologue assets to Cloudflare R2 (Video, audio, art under public/).
#
# Prerequisites:
#   1) Create an R2 API token: Cloudflare Dashboard → R2 → Manage R2 API Tokens
#      → Create token with "Object Read & Write" on this bucket (or Admin Read & Write).
#   2) Set env vars in THIS shell before running (do not commit secrets):
#        $env:CLOUDFLARE_API_TOKEN = "your-token"
#        $env:R2_BUCKET = "your-bucket-name"
#   Or run: npx wrangler login   (browser) once, then only R2_BUCKET is required.
#
# Usage (from repo root):
#   .\scripts\upload-prologue-r2.ps1
#
# Optional: $env:R2_UPLOAD_REMOTE = "1"  (default) uses --remote; wrangler targets real R2.

$ErrorActionPreference = "Stop"

$bucket = $env:R2_BUCKET?.Trim()
if (-not $bucket) {
  Write-Error "Set R2_BUCKET to your R2 bucket name, e.g. `$env:R2_BUCKET = 'orv-assets'"
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$public = Join-Path $root "public"

$items = @(
  @{ Key = "Video/gilded-lily-animation.mp4"; Rel = "Video\gilded-lily-animation.mp4"; Ct = "video/mp4" },
  @{ Key = "audio/gilded-lily.mp3"; Rel = "audio\gilded-lily.mp3"; Ct = "audio/mpeg" },
  @{ Key = "art/finale-hero.jpg"; Rel = "art\finale-hero.jpg"; Ct = "image/jpeg" },
  @{ Key = "branding/orv-reader-wordmark.png"; Rel = "branding\orv-reader-wordmark.png"; Ct = "image/png" },
  @{ Key = "branding/orv-reader-wordmark-transparent.png"; Rel = "branding\orv-reader-wordmark-transparent.png"; Ct = "image/png" },
  @{ Key = "branding/orv-webtoon-key-visual.jpg"; Rel = "branding\orv-webtoon-key-visual.jpg"; Ct = "image/jpeg" },
  @{ Key = "branding/orv-wiki-logo.png"; Rel = "branding\orv-wiki-logo.png"; Ct = "image/png" }
)

Write-Host "Repo root: $root"
Write-Host "Bucket:    $bucket"

foreach ($it in $items) {
  $local = Join-Path $public $it.Rel
  if (-not (Test-Path $local)) {
    Write-Warning "Skip missing file: $local"
    continue
  }
  $dest = "$bucket/$($it.Key)"
  Write-Host ""
  Write-Host "Uploading -> $dest"
  npx --yes wrangler@4 r2 object put $dest --file="$local" --remote --content-type="$($it.Ct)" -y
  if ($LASTEXITCODE -ne 0) {
    Write-Error "wrangler failed for $dest"
  }
}

Write-Host ""
Write-Host "Done. Set NEXT_PUBLIC_ORV_BLOB_BASE to your public R2 base URL (or per-file URLs) on Render."
