# Verifica secrets Telegram no Supabase e envia mensagem demo via Edge Function.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$cfg = Get-Content (Join-Path $root "web\supabase.config.json") | ConvertFrom-Json

Write-Host "Secrets TELEGRAM no Supabase:"
npx supabase secrets list 2>&1 | Select-String "TELEGRAM"

$headers = @{
  apikey        = $cfg.anonKey
  Authorization = "Bearer $($cfg.anonKey)"
}

Write-Host ""
Write-Host "Enviando mensagem demo via telegram-test..."
$res = Invoke-RestMethod -Uri "$($cfg.url)/functions/v1/telegram-test" -Method POST -Headers $headers
Write-Host ($res | ConvertTo-Json -Depth 4 -Compress)

if (-not $res.ok) {
  throw "Falha no teste Telegram."
}
Write-Host "OK - confira o Telegram."
