# Envia mensagem de exemplo no formato de captura +0,5 (teste manual).
param(
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
  [string]$ChatId = $env:TELEGRAM_CHAT_ID,
  [string]$EventId = $env:TELEGRAM_TEST_EVENT_ID,
  [switch]$Demo
)

$ErrorActionPreference = "Stop"
if (-not $BotToken -or -not $ChatId) {
  Write-Error "Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID."
}

$root = Split-Path $PSScriptRoot -Parent
$cfg = Get-Content (Join-Path $root 'web\supabase.config.json') | ConvertFrom-Json
$h = @{ apikey = $cfg.anonKey; Authorization = "Bearer $($cfg.anonKey)" }

if ($Demo) {
  $text = "Flamengo x Palmeiras / +0,5 ODD 1.85 (TESTE)"
  $eventDemo = "demo-test"
  $urlDemo = "https://www.betano.bet.br/live/"
  $keyboard = @(
    ,@(
      @{ text = "🔗"; url = $urlDemo },
      @{ text = "✓"; callback_data = "cap_ok:$eventDemo" },
      @{ text = "✗"; callback_data = "cap_bad:$eventDemo" }
    )
  )
} else {
  if (-not $EventId) {
    $sample = Invoke-RestMethod -Uri "$($cfg.url)/rest/v1/futebol_mercado_gols_05?select=event_id&limit=1" -Headers $h
    $EventId = $sample.event_id
  }

  $row = Invoke-RestMethod -Uri "$($cfg.url)/rest/v1/futebol_mercado_gols_05?event_id=eq.$EventId&select=event_id,home,away,over_05_odd,betano_url" -Headers $h
  $r = $row[0]
  if (-not $r) { Write-Error "Evento $EventId nao encontrado. Use -Demo para teste sem BD." }

  $odd = if ($null -ne $r.over_05_odd) { [string]$r.over_05_odd } else { "—" }
  $text = "$($r.home) x $($r.away) / +0,5 ODD $odd (TESTE)"

  $row1 = @()
  if ($r.betano_url) { $row1 += @{ text = "🔗"; url = $r.betano_url } }
  $row1 += @{ text = "✓"; callback_data = "cap_ok:$($r.event_id)" }
  $row1 += @{ text = "✗"; callback_data = "cap_bad:$($r.event_id)" }
  $keyboard = @(, $row1)
}

$bodyObj = @{
  chat_id = $ChatId
  text = $text
  disable_web_page_preview = $true
  reply_markup = @{ inline_keyboard = $keyboard }
}
$body = $bodyObj | ConvertTo-Json -Depth 6
$utf8 = New-Object System.Text.UTF8Encoding $false
$bytes = $utf8.GetBytes($body)

Invoke-RestMethod -Uri "https://api.telegram.org/bot$BotToken/sendMessage" -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes
Write-Host "Mensagem de teste enviada."
