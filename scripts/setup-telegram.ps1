# Configura Telegram para notificacoes de captura +0,5 na Edge Function.
# 1) Crie o bot no @BotFather e envie /start ao bot no Telegram.
# 2) Execute: $env:TELEGRAM_BOT_TOKEN="seu-token"; .\scripts\setup-telegram.ps1

param(
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN
)

$ErrorActionPreference = "Stop"

if (-not $BotToken) {
  Write-Error "Defina TELEGRAM_BOT_TOKEN (variavel de ambiente ou parametro -BotToken)."
}

Write-Host "Buscando chat_id em getUpdates (envie /start ao bot se a lista vier vazia)..."
$uri = "https://api.telegram.org/bot$BotToken/getUpdates"
$resp = Invoke-RestMethod -Uri $uri -Method Get
$updates = @($resp.result)

if (-not $updates.Count) {
  Write-Host ""
  Write-Host "Nenhum update encontrado."
  Write-Host "Abra o bot no Telegram, envie /start e rode este script de novo."
  exit 1
}

$chats = $updates |
  ForEach-Object { $_.message.chat } |
  Where-Object { $_ } |
  Sort-Object id -Unique

Write-Host ""
Write-Host "Chats encontrados:"
foreach ($c in $chats) {
  $label = if ($c.username) { "@$($c.username)" } elseif ($c.title) { $c.title } elseif ($c.first_name) { $c.first_name } else { "chat" }
  Write-Host "  chat_id=$($c.id)  ($label)"
}

$chatId = [string]$chats[-1].id
Write-Host ""
Write-Host "Usando chat_id: $chatId"
Write-Host "Gravando secrets no Supabase (projeto linkado)..."

npx supabase secrets set "TELEGRAM_BOT_TOKEN=$BotToken" "TELEGRAM_CHAT_ID=$chatId" "TELEGRAM_NOTIFY_CAPTURE=1"

Write-Host ""
Write-Host "Secrets configurados. Faca deploy da function:"
Write-Host "  npx supabase functions deploy betano-futebol-live --no-verify-jwt"
