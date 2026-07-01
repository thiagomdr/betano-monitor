# Deploy das Edge Functions betano-coleta e betano-probe
# Requer autenticação Supabase CLI (uma vez).

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
  Write-Host 'Opcao A (recomendada): abra um terminal interativo e rode:' -ForegroundColor Cyan
  Write-Host '  npx supabase login' -ForegroundColor White
  Write-Host '  npm run deploy:coleta' -ForegroundColor White
  Write-Host ''
  Write-Host 'Opcao B: crie um token em https://supabase.com/dashboard/account/tokens' -ForegroundColor Cyan
  Write-Host '  $env:SUPABASE_ACCESS_TOKEN = "seu-token"' -ForegroundColor White
  Write-Host '  npm run deploy:coleta' -ForegroundColor White
  Write-Host ''
  exit 1
}

Write-Host "Deploy betano-coleta + betano-coleta-cron + betano-alertas-avaliar + betano-probe -> projeto $ProjectRef ..." -ForegroundColor Cyan
npx supabase functions deploy betano-coleta --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx supabase functions deploy betano-coleta-cron --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx supabase functions deploy betano-alertas-avaliar --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx supabase functions deploy betano-probe --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Deploy concluido. Verificando endpoint betano-coleta...' -ForegroundColor Green

$envFile = Join-Path $Root '.env'
if (Test-Path $envFile) {
  $lines = Get-Content $envFile
  $url = ($lines | Where-Object { $_ -match '^EXPO_PUBLIC_SUPABASE_URL=' }) -replace '^EXPO_PUBLIC_SUPABASE_URL=', ''
  $key = ($lines | Where-Object { $_ -match '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' }) -replace '^EXPO_PUBLIC_SUPABASE_ANON_KEY=', ''
  $endpoint = "$($url.TrimEnd('/'))/functions/v1/betano-coleta"
  try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST `
      -Headers @{ Authorization = "Bearer $key"; apikey = $key; 'Content-Type' = 'application/json' } `
      -Body '{}' -UseBasicParsing -ErrorAction Stop
    Write-Host "Coleta OK: HTTP $($response.StatusCode)" -ForegroundColor Green
    $content = $response.Content
    if ($content.Length -gt 400) {
      Write-Host $content.Substring(0, 400)
      Write-Host '...'
    } else {
      Write-Host $content
    }
  } catch {
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
      Write-Host "Coleta HTTP $code" -ForegroundColor Red
    } else {
      Write-Host $_.Exception.Message -ForegroundColor Red
    }
    exit 1
  }
} else {
  Write-Host '.env nao encontrado — pule verificacao automatica.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Confirme no dashboard: Edge Functions -> betano-coleta' -ForegroundColor Cyan
