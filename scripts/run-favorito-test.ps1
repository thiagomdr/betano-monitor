# Versao de teste — Favorito 1X2 + print do odd inicial.
#
# Uso:
#   .\scripts\run-favorito-test.ps1              # checklist
#   .\scripts\run-favorito-test.ps1 -ColetaOn    # liga coleta + checklist
#   .\scripts\run-favorito-test.ps1 -Capture     # tira 1 print pendente (Chrome)
#   .\scripts\run-favorito-test.ps1 -Capture -EventId 88491234
#   .\scripts\run-favorito-test.ps1 -CleanupShots

param(
  [switch]$ColetaOn,
  [switch]$ColetaOff,
  [switch]$Capture,
  [string]$EventId = "",
  [switch]$CleanupShots,
  [switch]$Headless
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Scripts = Join-Path $Root "scripts"
$EnvFile = Join-Path $Root ".env"

if (-not (Test-Path $EnvFile)) {
  Write-Error "Falta $EnvFile com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY"
}

$nodeArgs = @("test-favorito-smoke.mjs")
if ($ColetaOn) { $nodeArgs += @("--coleta", "on") }
if ($ColetaOff) { $nodeArgs += @("--coleta", "off") }
if ($CleanupShots) { $nodeArgs += "--cleanup-shots" }
if ($Capture) {
  $nodeArgs += "--capture"
  if ($EventId) { $nodeArgs += $EventId }
}

$env:HCTG_HEADLESS = if ($Headless) { "1" } else { "0" }

Write-Host "=== Teste Favorito 1X2 + print ===" -ForegroundColor Cyan
Write-Host "Comando: node $($nodeArgs -join ' ')" -ForegroundColor DarkGray

Push-Location $Scripts
try {
  if ($Capture -and -not (Test-Path (Join-Path $Scripts "node_modules\playwright"))) {
    Write-Host "Instalando dependencias Playwright..." -ForegroundColor Yellow
    npm install
  }
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
