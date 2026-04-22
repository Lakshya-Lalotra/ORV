# Upload story-library branding assets to Cloudflare R2.
#
# Uploads the 3 story covers + starfield backdrop + wordmark / wiki logo /
# webtoon key visual into `branding/...` keys so `publicAssetUrl(...)` +
# `NEXT_PUBLIC_ORV_BLOB_BASE` can resolve them at runtime.
#
# Prerequisites:
#   1) Create an R2 API token: Cloudflare Dashboard -> R2 -> Manage R2 API Tokens
#      -> Create token with "Object Read & Write" on this bucket.
#   2) Set env vars in THIS shell before running (do not commit secrets):
#        $env:CLOUDFLARE_API_TOKEN = "your-token"
#        $env:R2_BUCKET = "your-bucket-name"
#   Or run: npx wrangler login   (browser) once, then only R2_BUCKET is required.
#
# Usage (from repo root):
#   npm run upload:r2-branding
# Or directly:
#   .\scripts\upload-branding-r2.ps1

$ErrorActionPreference = "Stop"

$bucket = $env:R2_BUCKET?.Trim()
if (-not $bucket) {
  Write-Error "Set R2_BUCKET to your R2 bucket name, e.g. `$env:R2_BUCKET = 'orv-assets'"
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$public = Join-Path $root "public"

$items = @(
  @{ Key = "branding/covers/orv.webp";                          Rel = "branding\covers\orv.webp";                          Ct = "image/webp" },
  @{ Key = "branding/covers/sequel.webp";                       Rel = "branding\covers\sequel.webp";                       Ct = "image/webp" },
  @{ Key = "branding/covers/oneshot.webp";                      Rel = "branding\covers\oneshot.webp";                      Ct = "image/webp" },
  @{ Key = "branding/background-stars.jpg";                     Rel = "branding\background-stars.jpg";                     Ct = "image/jpeg" },
  @{ Key = "branding/orv-reader-wordmark.png";                  Rel = "branding\orv-reader-wordmark.png";                  Ct = "image/png"  },
  @{ Key = "branding/orv-reader-wordmark-transparent.png";      Rel = "branding\orv-reader-wordmark-transparent.png";      Ct = "image/png"  },
  @{ Key = "branding/orv-webtoon-key-visual.jpg";               Rel = "branding\orv-webtoon-key-visual.jpg";               Ct = "image/jpeg" },
  @{ Key = "branding/orv-wiki-logo.png";                        Rel = "branding\orv-wiki-logo.png";                        Ct = "image/png"  }
)

Write-Host "Repo root: $root"
Write-Host "Bucket:    $bucket"

$uploaded = 0
$skipped = 0

foreach ($it in $items) {
  $local = Join-Path $public $it.Rel
  if (-not (Test-Path $local)) {
    Write-Warning "Skip missing file: $local"
    $skipped++
    continue
  }
  $dest = "$bucket/$($it.Key)"
  $size = (Get-Item $local).Length
  Write-Host ""
  Write-Host ("Uploading ({0:N0} bytes) -> {1}" -f $size, $dest)
  npx --yes wrangler@4 r2 object put $dest --file="$local" --remote --content-type="$($it.Ct)" -y
  if ($LASTEXITCODE -ne 0) {
    Write-Error "wrangler failed for $dest"
  }
  $uploaded++
}

Write-Host ""
Write-Host ("Done. Uploaded {0}, skipped {1}." -f $uploaded, $skipped)
Write-Host "Check https://<your-r2-public-base>/branding/covers/orv.webp in a browser to verify."
