# Monitora proximo jogo ao vivo: cron Edge + worker local + hctg_lines no BD.
param(
  [int]$IntervalSec = 120,
  [int]$MaxMinutes = 480,
  [switch]$NoCron
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$cfg = Get-Content (Join-Path $root "web\supabase.config.json") | ConvertFrom-Json
$logPath = Join-Path $root ".cursor\watch-live-hctg.log"
$headers = @{
  apikey         = $cfg.anonKey
  Authorization  = "Bearer $($cfg.anonKey)"
}

function Write-Log([string]$Msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Msg"
  Add-Content -Path $logPath -Value $line
  Write-Host $line
}

function Get-MercadoRows {
  $uri = "$($cfg.url)/rest/v1/futebol_mercado_gols_05?is_live=eq.true&resultado=neq.excluido&select=event_id,home,away,last_minute,live_score,resultado,hctg_source,hctg_fetched_at,hctg_lines&order=updated_at.desc"
  Invoke-RestMethod -Uri $uri -Headers $headers
}

function Test-HctgReady($rows) {
  foreach ($r in $rows) {
    $lines = $r.hctg_lines
    if ($null -eq $lines) { continue }
    if ($lines -is [array] -and $lines.Count -gt 0) { return $r }
    if ($lines -is [string] -and $lines -ne "[]" -and $lines.Length -gt 2) { return $r }
  }
  return $null
}

$deadline = (Get-Date).AddMinutes($MaxMinutes)
Write-Log "Monitor iniciado (intervalo ${IntervalSec}s, max ${MaxMinutes}min)"

while ((Get-Date) -lt $deadline) {
  try {
    if (-not $NoCron) {
      $cron = Invoke-RestMethod -Uri "$($cfg.url)/functions/v1/betano-futebol-live" -Method POST -Headers $headers
      Write-Log "cron live_total=$($cron.live_total) total=$($cron.total) hctg=$($cron.hctg_source)"
    }

    Start-Sleep -Seconds 5
    $rows = @(Get-MercadoRows)
    if ($rows.Count -eq 0) {
      Write-Log "mercado: 0 jogos ao vivo"
    } else {
      foreach ($r in $rows) {
        $n = 0
        if ($r.hctg_lines -is [array]) { $n = $r.hctg_lines.Count }
        Write-Log "  $($r.home) x $($r.away) | $($r.last_minute)' $($r.live_score) | $($r.resultado) | hctg=$n linhas ($($r.hctg_source))"
      }
      $ready = Test-HctgReady $rows
      if ($ready) {
        Write-Log "SUCESSO: HCTG capturado para $($ready.home) x $($ready.away) (event $($ready.event_id))"
        $ready | ConvertTo-Json -Depth 6 | Add-Content -Path $logPath
        exit 0
      }
    }
  } catch {
    Write-Log "ERRO: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $IntervalSec
}

Write-Log "Timeout apos ${MaxMinutes}min sem HCTG capturado"
exit 1
