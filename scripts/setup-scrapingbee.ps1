# Configura SCRAPINGBEE_API_KEY nos secrets da Edge Function betano-futebol-live.
param(
  [Parameter(Mandatory = $true)]
  [string]$ApiKey
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $root "..")

Write-Host "Gravando SCRAPINGBEE_API_KEY no Supabase (projeto linkado)..."
npx supabase secrets set "SCRAPINGBEE_API_KEY=$ApiKey" SCRAPINGBEE_COUNTRY=br SCRAPINGBEE_MAX_PER_RUN=6

Write-Host ""
Write-Host "Deploy da function:"
Write-Host "  npx supabase functions deploy betano-futebol-live --no-verify-jwt"
Write-Host ""
Write-Host "Teste local JSON:"
Write-Host '  cd scripts; $env:SCRAPINGBEE_API_KEY="..."; node test-scrapingbee-hctg.mjs 88494497 suica-colombia'
Write-Host "Teste local HTML (render_js + aba Gols):"
Write-Host '  cd scripts; $env:SCRAPINGBEE_API_KEY="..."; node test-scrapingbee-hctg.mjs 88494497 suica-colombia --html-only'
