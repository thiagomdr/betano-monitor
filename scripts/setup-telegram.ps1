# Configura Telegram para notificacoes de captura +0,5 na Edge Function.
# Uso:
#   $env:TELEGRAM_BOT_TOKEN="seu-token"
#   powershell -File scripts/setup-telegram.ps1
# Ou com chat_id manual (ex. via @userinfobot):
#   $env:TELEGRAM_BOT_TOKEN="..." ; $env:TELEGRAM_CHAT_ID="123456789"
#   powershell -File scripts/setup-telegram.ps1

param(
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
  [string]$ChatId = $env:TELEGRAM_CHAT_ID,
  [int]$WaitSeconds = 90
)

$ErrorActionPreference = "Stop"

if (-not $BotToken) {
  Write-Error "Defina TELEGRAM_BOT_TOKEN (variavel de ambiente ou parametro -BotToken)."
}

function Get-TelegramUpdates {
  param([string]$Token)
  $uri = "https://api.telegram.org/bot$Token/getUpdates?limit=20"
  $resp = Invoke-RestMethod -Uri $uri -Method Get
  return @($resp.result)
}

function Send-TelegramTest {
  param([string]$Token, [string]$TargetChatId)
  $text = @(
    "TESTE Monitor Betano",
    "",
    "Telegram configurado com sucesso.",
    "Voce recebera uma mensagem assim que um jogo for capturado (+0,5)."
  ) -join "`n"
  $body = @{ chat_id = $TargetChatId; text = $text } | ConvertTo-Json
  Invoke-RestMethod -Uri "https://api.telegram.org/bot$Token/sendMessage" -Method Post -ContentType "application/json" -Body $body | Out-Null
}

if (-not $ChatId) {
  Write-Host "Bot: https://t.me/MonitorBetanoBot"
  Write-Host "Buscando chat_id (envie /start ao bot agora se ainda nao enviou)..."
  $updates = Get-TelegramUpdates -Token $BotToken
  if (-not $updates.Count -and $WaitSeconds -gt 0) {
    Write-Host "Aguardando ate ${WaitSeconds}s por uma mensagem ao bot..."
    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 3
      $updates = Get-TelegramUpdates -Token $BotToken
      if ($updates.Count) { break }
    }
  }

  if (-not $updates.Count) {
    Write-Host ""
    Write-Host "Nenhum update encontrado."
    Write-Host "1) Abra https://t.me/MonitorBetanoBot e envie /start"
    Write-Host "2) Ou obtenha seu id em @userinfobot e rode:"
    Write-Host '   $env:TELEGRAM_CHAT_ID="SEU_ID"; powershell -File scripts/setup-telegram.ps1'
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
  $ChatId = [string]$chats[-1].id
}

Write-Host ""
Write-Host "Usando chat_id: $ChatId"
Write-Host "Gravando secrets no Supabase (projeto linkado)..."

npx supabase secrets set "TELEGRAM_BOT_TOKEN=$BotToken" "TELEGRAM_CHAT_ID=$ChatId" "TELEGRAM_NOTIFY_CAPTURE=1"

Write-Host "Enviando mensagem de teste..."
Send-TelegramTest -Token $BotToken -TargetChatId $ChatId
Write-Host "Mensagem de teste enviada."

Write-Host ""
Write-Host "Secrets configurados. Se alterou codigo da function, redeploy:"
Write-Host "  npx supabase functions deploy betano-futebol-live --no-verify-jwt"
