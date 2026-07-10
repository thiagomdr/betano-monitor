# Worker HCTG no PC local (IP residencial da casa).
# Abre Chrome via Playwright, scrape DOM Total de Gols, grava no Supabase.
#
# Uso:
#   .\scripts\run-local-hctg-worker.ps1           # loop continuo
#   .\scripts\run-local-hctg-worker.ps1 -Once     # um ciclo e sai
#   .\scripts\run-local-hctg-worker.ps1 -Headless # Chrome sem janela
#
# Requisitos: Node 20+, .env com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
#   cd scripts; npm install   (instala Chromium do Playwright)

param(
  [switch]$Once,
  [switch]$Headless,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Scripts = Join-Path $Root "scripts"
$EnvFile = Join-Path $Root ".env"

Write-Host "=== Betano HCTG worker LOCAL (IP da casa) ===" -ForegroundColor Cyan
Write-Host "Pasta: $Scripts"

if (-not (Test-Path $EnvFile)) {
  Write-Error "Falta $EnvFile com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY"
}

function Get-DotEnvValue([string]$Name) {
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match "^\s*#") { continue }
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

$url = Get-DotEnvValue "SUPABASE_URL"
$key = Get-DotEnvValue "SUPABASE_SERVICE_ROLE_KEY"
if (-not $url -or -not $key) {
  Write-Error "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env"
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js nao encontrado no PATH. Instale Node 20+."
}

Push-Location $Scripts
try {
  if (-not $SkipInstall) {
    if (-not (Test-Path (Join-Path $Scripts "node_modules\playwright"))) {
      Write-Host "Instalando dependencias (npm install + Chromium)..." -ForegroundColor Yellow
      npm install
    }
    & node (Join-Path $Scripts "ensure-playwright-chromium.mjs")
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Chromium do Playwright nao encontrado - baixando (1a vez, ~200 MB)..." -ForegroundColor Yellow
      npx playwright install chromium
      if ($LASTEXITCODE -ne 0) {
        Write-Error "Falha ao instalar Chromium. Rode: cd scripts; npx playwright install chromium"
      }
    }
  }

  $env:HCTG_WORKER_SOURCE = "local-worker"
  $env:HCTG_HTML_SOURCE = "html-dom-local"
  $env:HCTG_HEADLESS = if ($Headless) { "1" } else { "0" }

  # Perfil Chrome local — mantem cookie +18 entre jogos
  $profileDir = Join-Path $Root ".chrome-hctg-profile"
  if (-not $env:HCTG_CHROME_PROFILE) {
    $env:HCTG_CHROME_PROFILE = $profileDir
  }

  # Defaults suaves para PC de casa (pode sobrescrever no .env)
  if (-not $env:HCTG_POLL_SEC) { $env:HCTG_POLL_SEC = "90" }
  if (-not $env:HCTG_MAX_PER_CYCLE) { $env:HCTG_MAX_PER_CYCLE = "4" }
  if (-not $env:HCTG_DELAY_MIN_SEC) { $env:HCTG_DELAY_MIN_SEC = "3" }
  if (-not $env:HCTG_DELAY_MAX_SEC) { $env:HCTG_DELAY_MAX_SEC = "7" }

  Write-Host "Supabase: $url"
  Write-Host "Modo: local-worker | hctg_source=html-dom-local | headless=$($env:HCTG_HEADLESS)"
  Write-Host "Chrome vai abrir com seu IP residencial. Deixe este terminal aberto." -ForegroundColor Green
  Write-Host "Ctrl+C para parar."
  Write-Host ""

  $argsList = @("vps-hctg-worker.mjs")
  if ($Once) { $argsList += "--once" }

  & node @argsList
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
