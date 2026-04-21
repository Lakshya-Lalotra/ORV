# Run from repo root (orv-reader): right-click Run with PowerShell, or:
#   cd path\to\orv-reader
#   .\setup.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "  Installing dependencies (if needed)..." -ForegroundColor Cyan
npm install

Write-Host ""
npm run setup

Write-Host ""
Write-Host "  Starting dev server — http://localhost:3000/chapters" -ForegroundColor Green
npm run dev
