# Migration + deploy de todas as Edge Functions do monitor.
# Requer SUPABASE_ACCESS_TOKEN (ou npx supabase login uma vez).

$ErrorActionPreference = 'Stop'
$ProjectRef = 'mddortcbebtkopeanrhu'
$Root = Split-Path -Parent $PSScriptRoot

Set-Location $Root

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  $tokenPath = Join-Path $env:APPDATA 'supabase\access-token'
  if (Test-Path $tokenPath) {
    $env:SUPABASE_ACCESS_TOKEN = (Get-Content $tokenPath -Raw).Trim()
  }
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host ''
  Write-Host 'Supabase CLI nao autenticado.' -ForegroundColor Yellow
  Write-Host 'Token: https://supabase.com/dashboard/account/tokens' -ForegroundColor Cyan
  Write-Host '  $env:SUPABASE_ACCESS_TOKEN = "seu-token"' -ForegroundColor White
  Write-Host '  npm run deploy:supabase' -ForegroundColor White
  Write-Host ''
  exit 1
}

Write-Host 'Aplicando migration futebol_estatisticas...' -ForegroundColor Cyan
node scripts/apply-migration-remote.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$functions = @(
  'betano-coleta',
  'betano-coleta-cron',
  'betano-alertas-avaliar',
  'betano-probe'
)

foreach ($fn in $functions) {
  Write-Host "Deploy $fn ..." -ForegroundColor Cyan
  npx supabase functions deploy $fn --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host 'Validando coleta + schema...' -ForegroundColor Green
node scripts/validate-betano-link.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Deploy Supabase concluido.' -ForegroundColor Green
