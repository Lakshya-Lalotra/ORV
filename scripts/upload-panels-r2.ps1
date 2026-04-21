# Bulk-upload public/panels to Cloudflare R2 (dashboard only allows ~100 files).
#
# FAST (recommended): AWS CLI + R2 S3-compatible API
#   Install: winget install Amazon.AWSCLI   (or https://aws.amazon.com/cli/)
#   In Cloudflare: R2 → your bucket → S3 API → Create access key (Access Key ID + Secret).
#   Then in PowerShell:
#     $env:R2_BUCKET = "your-bucket"
#     $env:R2_ACCOUNT_ID = "from Cloudflare dashboard URL or R2 overview"
#     $env:AWS_ACCESS_KEY_ID = "r2 access key id"
#     $env:AWS_SECRET_ACCESS_KEY = "r2 secret"
#     .\scripts\upload-panels-r2.ps1
#
# SLOW (no AWS CLI): uses Wrangler per file — OK for small tests; thousands of files = very slow.
#   $env:CLOUDFLARE_API_TOKEN = "..."   # or: npx wrangler login
#   $env:R2_BUCKET = "your-bucket"
#   $env:R2_USE_WRANGLER = "1"
#   .\scripts\upload-panels-r2.ps1
#
# Usage (from repo root):
#   .\scripts\upload-panels-r2.ps1

$ErrorActionPreference = "Stop"

$bucket = $env:R2_BUCKET?.Trim()
if (-not $bucket) {
  Write-Error "Set R2_BUCKET to your R2 bucket name."
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$panelsDir = Join-Path $root "public\panels"

if (-not (Test-Path $panelsDir)) {
  Write-Error "Missing folder: $panelsDir"
}

$accountId = $env:R2_ACCOUNT_ID?.Trim()
$ak = $env:AWS_ACCESS_KEY_ID?.Trim()
$sk = $env:AWS_SECRET_ACCESS_KEY?.Trim()
$endpoint = if ($accountId) { "https://$accountId.r2.cloudflarestorage.com" } else { $null }

$useAws = $false
if (Get-Command aws -ErrorAction SilentlyContinue) {
  if ($accountId -and $ak -and $sk) {
    $useAws = $true
  }
}

if ($useAws) {
  Write-Host "Using AWS CLI sync -> s3://$bucket/panels/ (endpoint: $endpoint)"
  $env:AWS_EC2_METADATA_DISABLED = "true"
  aws s3 sync "$panelsDir" "s3://$bucket/panels" --endpoint-url $endpoint --only-show-errors
  if ($LASTEXITCODE -ne 0) { Write-Error "aws s3 sync failed" }
  Write-Host "Done. Panel URLs in DB should be like /panels/... — set NEXT_PUBLIC_ORV_PANELS_BASE or update DB to full R2 URLs when you add that env."
  exit 0
}

if ($env:R2_USE_WRANGLER -ne "1") {
  Write-Host ""
  Write-Host "AWS CLI + R2 S3 keys not configured. For large uploads, install AWS CLI and set:"
  Write-Host "  R2_ACCOUNT_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_BUCKET"
  Write-Host ""
  Write-Host "To force slow Wrangler-per-file upload anyway, set:"
  Write-Host '  $env:R2_USE_WRANGLER = "1"'
  Write-Host ""
  exit 1
}

Write-Host "Wrangler upload (slow) from: $panelsDir"
$files = Get-ChildItem -Path $panelsDir -Recurse -File
$total = $files.Count
$n = 0
foreach ($f in $files) {
  $n++
  $rel = $f.FullName.Substring($panelsDir.Length).Replace("\", "/").TrimStart("/")
  $key = "panels/$rel"
  $dest = "$bucket/$key"
  if ($n -eq 1 -or $n % 100 -eq 0 -or $n -eq $total) {
    Write-Host "[$n / $total] $key"
  }
  npx --yes wrangler@4 r2 object put $dest --file="$($f.FullName)" --remote -y
  if ($LASTEXITCODE -ne 0) {
    Write-Error "wrangler failed: $dest"
  }
}

Write-Host "Done ($total files)."
