# Tipster Arena — setup & smoke checklist
#
# Prerequisites:
#   - Project linked (npx supabase link)
#   - .env with SUPABASE_SERVICE_ROLE_KEY (and optional CRON_SECRET, LIVE_FEED_*)
#   - Panel user already created (scripts/setup-panel-auth.ps1)
#
# Usage:
#   powershell -File scripts/test-tipster-arena.ps1
#   powershell -File scripts/test-tipster-arena.ps1 -SkipInvoke
#   powershell -File scripts/test-tipster-arena.ps1 -ForceSettle -EventId <uuid> -HomeScore 2 -AwayScore 1

param(
  [switch]$SkipInvoke,
  [switch]$ForceSettle,
  [string]$EventId = "",
  [int]$HomeScore = 2,
  [int]$AwayScore = 1
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $root ".env"
$cfg = Get-Content (Join-Path $root "web\supabase.config.json") | ConvertFrom-Json

function Get-DotEnvValue([string]$Name) {
  if (-not (Test-Path $envPath)) { return $null }
  foreach ($line in Get-Content $envPath) {
    if ($line -match "^\s#") { continue }
    if ($line -match "^\s*#") { continue }
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

$url = (Get-DotEnvValue "SUPABASE_URL")
if (-not $url) { $url = $cfg.url }
$serviceKey = Get-DotEnvValue "SUPABASE_SERVICE_ROLE_KEY"
$cronSecret = Get-DotEnvValue "CRON_SECRET"

if (-not $serviceKey) {
  Write-Error "Defina SUPABASE_SERVICE_ROLE_KEY no .env"
}

$headers = @{
  apikey = $serviceKey
  Authorization = "Bearer $serviceKey"
  "Content-Type" = "application/json"
}
if ($cronSecret) {
  $headers["x-cron-secret"] = $cronSecret
}

Write-Host "=== Tipster Arena checklist ==="
Write-Host "URL: $url"
Write-Host ""

Write-Host "1) Schema smoke (tipsters / contests / live_events)..."
$contest = Invoke-RestMethod -Uri "$url/rest/v1/contests?slug=eq.arena-open&select=id,slug,status" -Headers $headers
if (-not $contest -or $contest.Count -lt 1) {
  Write-Error "Contest arena-open nao encontrado. Aplique a migration 20260723120000_tipster_arena.sql"
}
Write-Host "   OK contest=$($contest[0].slug) status=$($contest[0].status)"

if (-not $SkipInvoke) {
  Write-Host "2) Invoke tipster-live-collector..."
  try {
    $col = Invoke-RestMethod -Uri "$url/functions/v1/tipster-live-collector" -Method POST -Headers $headers -Body "{}"
    Write-Host "   OK events=$($col.events) markets=$($col.markets) selections=$($col.selections)"
  } catch {
    Write-Host "   WARN collector falhou (configure LIVE_FEED_* secrets e redeploy): $($_.Exception.Message)"
  }
} else {
  Write-Host "2) SkipInvoke — collector nao chamado"
}

Write-Host "3) Sample live events..."
$events = Invoke-RestMethod -Uri "$url/rest/v1/live_events?status=eq.live&select=id,home,away,minute,home_score,away_score&limit=5" -Headers $headers
if (-not $events -or $events.Count -lt 1) {
  Write-Host "   WARN nenhum live_event. Rode o collector depois de configurar o feed."
} else {
  $events | ForEach-Object {
    Write-Host "   $($_.home) x $($_.away) | $($_.minute)' $($_.home_score):$($_.away_score) | $($_.id)"
  }
}

if ($ForceSettle) {
  if (-not $EventId) {
    Write-Error "-ForceSettle requer -EventId <uuid do live_events.id>"
  }
  Write-Host "4) Force settle event=$EventId score=$HomeScore:$AwayScore ..."
  $body = @{
    force_event_id = $EventId
    home_score = $HomeScore
    away_score = $AwayScore
  } | ConvertTo-Json
  $settle = Invoke-RestMethod -Uri "$url/functions/v1/tipster-settle" -Method POST -Headers $headers -Body $body
  Write-Host "   $($settle | ConvertTo-Json -Depth 5 -Compress)"
} else {
  Write-Host "4) Settle auto..."
  try {
    $settle = Invoke-RestMethod -Uri "$url/functions/v1/tipster-settle" -Method POST -Headers $headers -Body "{}"
    Write-Host "   OK settled=$($settle.settled) events=$($settle.events)"
  } catch {
    Write-Host "   WARN settle: $($_.Exception.Message)"
  }
}

Write-Host "5) Ranking view..."
$rank = Invoke-RestMethod -Uri "$url/rest/v1/v_tipster_ranking?contest_slug=eq.arena-open&select=display_name,pnl_u,settled_n,winrate&order=pnl_u.desc&limit=10" -Headers $headers
if (-not $rank -or $rank.Count -lt 1) {
  Write-Host "   (vazio — tipster precisa login + ensure_tipster + place_pick pela UI)"
} else {
  $rank | ForEach-Object {
    Write-Host ("   {0,-20} pnl={1} settled={2} wr={3}" -f $_.display_name, $_.pnl_u, $_.settled_n, $_.winrate)
  }
}

Write-Host ""
Write-Host "Manual UI steps:"
Write-Host "  a) Abra web/tipster.html (scripts/serve-monitor.ps1)"
Write-Host "  b) Login Auth → apelido → Terminal → clique uma odd (pick 1u)"
Write-Host "  c) Force settle:"
Write-Host "     powershell -File scripts/test-tipster-arena.ps1 -SkipInvoke -ForceSettle -EventId <uuid> -HomeScore 2 -AwayScore 1"
Write-Host "  d) Aba Ranking / Meus picks → conferir pnl_u"
Write-Host ""
Write-Host "Done."
