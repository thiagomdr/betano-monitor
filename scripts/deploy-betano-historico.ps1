# Gera HTML local (abrir-no-celular.html). Painel web principal: GitHub Pages (push em main).
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$OutPath = Join-Path $Root 'web\historico\index.html'
$MobilePath = Join-Path $Root 'web\historico\abrir-no-celular.html'
$EnvFile = Join-Path $Root '.env'

Set-Location $Root

if (-not (Test-Path $EnvFile)) {
  Write-Host '.env nao encontrado' -ForegroundColor Red
  exit 1
}

Write-Host 'Gerando painel historico ...' -ForegroundColor Cyan
npm run build:historico-html
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Copy-Item -Path $OutPath -Destination $MobilePath -Force
Write-Host "HTML gerado: $OutPath" -ForegroundColor Green
Write-Host "Mobile: $MobilePath" -ForegroundColor Cyan
Write-Host ''
Write-Host 'Painel web (GitHub Pages):' -ForegroundColor Cyan
Write-Host '  https://thiagomdr.github.io/betano-monitor/' -ForegroundColor White
Write-Host '  (deploy automatico apos git push em main + secrets configurados)' -ForegroundColor DarkGray
