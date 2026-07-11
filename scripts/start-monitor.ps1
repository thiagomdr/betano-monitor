# Painel local + worker HCTG (Chrome / Playwright no PC).
# O botao "Iniciar Sistema" no painel so liga a coleta Edge no Supabase;
# o Chrome so abre se este worker estiver rodando neste PC.
#
# Uso:
#   .\scripts\start-monitor.ps1              # painel + worker (Chrome visivel)
#   .\scripts\start-monitor.ps1 -Headless    # worker sem janela
#   .\scripts\start-monitor.ps1 -PanelOnly   # so http://localhost:8080

param(
  [switch]$Headless,
  [switch]$PanelOnly,
  [switch]$WorkerOnly,
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$WorkerScript = Join-Path $Root "scripts\run-local-hctg-worker.ps1"
$ServeScript = Join-Path $Root "scripts\serve-monitor.ps1"

function Test-WorkerRunning {
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if ($p.CommandLine -match "hctg-worker\.mjs") { return $true }
  }
  return $false
}

if (-not $PanelOnly) {
  if (Test-WorkerRunning) {
    Write-Host "Worker HCTG ja em execucao (node hctg-worker.mjs)." -ForegroundColor Yellow
  } else {
    Write-Host "Iniciando worker HCTG em nova janela (Chrome)..." -ForegroundColor Cyan
    $workerArgs = @("-NoExit", "-File", $WorkerScript)
    if ($Headless) { $workerArgs += "-Headless" }
    Start-Process powershell -ArgumentList $workerArgs -WorkingDirectory $Root
    Write-Host "Worker iniciado. Deixe a janela do PowerShell aberta." -ForegroundColor Green
  }
}

if (-not $WorkerOnly) {
  Write-Host "Painel: http://localhost:$Port" -ForegroundColor Cyan
  Write-Host "Depois de abrir o painel, confirme Sistema: ATIVO (botao verde)." -ForegroundColor Yellow
  & $ServeScript
}
