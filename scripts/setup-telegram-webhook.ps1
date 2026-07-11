# Registra webhook do Telegram apontando para a Edge Function telegram-webhook.
# Requer: projeto linkado, TELEGRAM_BOT_TOKEN, secrets no Supabase.
#
# Uso:
#   $env:TELEGRAM_BOT_TOKEN="..."
#   powershell -File scripts/setup-telegram-webhook.ps1

param(
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
  [string]$SupabaseUrl = $((
    Get-Content (Join-Path (Split-Path $PSScriptRoot -Parent) 'web\supabase.config.json') | ConvertFrom-Json
  ).url)
)

$ErrorActionPreference = "Stop"

if (-not $BotToken) {
  Write-Error "Defina TELEGRAM_BOT_TOKEN."
}
if (-not $SupabaseUrl) {
  Write-Error "Nao foi possivel ler web/supabase.config.json (url)."
}

$secret = [guid]::NewGuid().ToString('N')
$webhookUrl = "$SupabaseUrl/functions/v1/telegram-webhook?secret=$secret"

Write-Host "Gravando TELEGRAM_WEBHOOK_SECRET no Supabase..."
npx supabase secrets set "TELEGRAM_WEBHOOK_SECRET=$secret"

Write-Host "Registrando webhook no Telegram (callback_query para botoes)..."
$body = @{
  url = $webhookUrl
  allowed_updates = @("callback_query")
  drop_pending_updates = $true
} | ConvertTo-Json
$result = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BotToken/setWebhook" -Method Post -ContentType "application/json" -Body $body
$result | ConvertTo-Json

Write-Host ""
$info = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BotToken/getWebhookInfo" -Method Get
Write-Host "Webhook info:"
$info.result | ConvertTo-Json

Write-Host ""
Write-Host "Deploy da function telegram-webhook:"
Write-Host "  npx supabase functions deploy telegram-webhook --no-verify-jwt"
Write-Host "  npx supabase functions deploy betano-futebol-live --no-verify-jwt"
