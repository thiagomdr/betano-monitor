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
Start-Sleep -Seconds 4
$live = Invoke-RestMethod -Uri "$($cfg.url)/rest/v1/futebol_live_rows?event_id=eq.88363620&select=score,minute,over_0_odd,over_0_line,over_1_odd,over_1_line,over_2_odd,over_2_line" -Headers $headers
Write-Host "Mexico over_0: $($live.over_0_odd) line $($live.over_0_line) | over_1: $($live.over_1_odd) @ $($live.over_1_line)"
