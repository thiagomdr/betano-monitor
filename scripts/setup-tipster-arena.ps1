# Configura tipster_collector_config com URLs das Edge Functions.
# Requer: .env com SUPABASE_SERVICE_ROLE_KEY (e opcional CRON_SECRET)
param()

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $root ".env"
$cfg = Get-Content (Join-Path $root "web\supabase.config.json") | ConvertFrom-Json

function Get-DotEnvValue([string]$Name) {
  if (-not (Test-Path $envPath)) { return $null }
  foreach ($line in Get-Content $envPath) {
    if ($line -match "^\s*#") { continue }
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

$url = (Get-DotEnvValue "SUPABASE_URL")
if (-not $url) { $url = $cfg.url }
$key = Get-DotEnvValue "SUPABASE_SERVICE_ROLE_KEY"
$cron = Get-DotEnvValue "CRON_SECRET"
if (-not $key) { Write-Error "Defina SUPABASE_SERVICE_ROLE_KEY no .env" }

$base = $url.TrimEnd("/")
$body = @{
  id = "default"
  ativo = $true
  collector_url = "$base/functions/v1/tipster-live-collector"
  prematch_url = "$base/functions/v1/tipster-prematch-collector"
  bridge_url = "$base/functions/v1/tipster-prematch-bridge"
  link_sync_url = "$base/functions/v1/tipster-link-sync"
  settle_url = "$base/functions/v1/tipster-settle"
  cron_secret = $cron
  updated_at = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json

$headers = @{
  apikey = $key
  Authorization = "Bearer $key"
  "Content-Type" = "application/json"
  Prefer = "resolution=merge-duplicates"
}

Invoke-RestMethod -Uri "$base/rest/v1/tipster_collector_config?on_conflict=id" -Method POST -Headers $headers -Body $body | Out-Null
Write-Host "OK tipster_collector_config apontando para:"
Write-Host "  collector:  $base/functions/v1/tipster-live-collector"
Write-Host "  prematch:   $base/functions/v1/tipster-prematch-collector"
Write-Host "  bridge:     $base/functions/v1/tipster-prematch-bridge"
Write-Host "  link-sync:  $base/functions/v1/tipster-link-sync"
Write-Host "  settle:     $base/functions/v1/tipster-settle"
Write-Host "Crons: bridge */10, link-sync */2, prematch */5, settle (existente)."
Write-Host "Deploy Edges + secrets LIVE_FEED_* / CRON_SECRET antes do cron ter efeito."
