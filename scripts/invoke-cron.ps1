$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cfg = Get-Content (Join-Path $root 'web\supabase.config.json') | ConvertFrom-Json
$headers = @{
  apikey = $cfg.anonKey
  Authorization = "Bearer $($cfg.anonKey)"
}
Write-Host "Invoking betano-futebol-live..."
$res = Invoke-RestMethod -Uri "$($cfg.url)/functions/v1/betano-futebol-live" -Method POST -Headers $headers
Write-Host ($res | ConvertTo-Json -Depth 3 -Compress)
Start-Sleep -Seconds 3
$mercado = Invoke-RestMethod -Uri "$($cfg.url)/rest/v1/futebol_mercado_gols_05?is_live=eq.true&resultado=neq.excluido&select=home,away,last_minute,live_score,resultado&limit=5" -Headers $headers
if ($mercado) {
  Write-Host "Mercado ao vivo (amostra):"
  $mercado | ForEach-Object { Write-Host "  $($_.home) x $($_.away) | $($_.last_minute)' $($_.live_score) | $($_.resultado)" }
}
