# Deploy da Edge Function betano-probe
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
  Write-Host '  npm run deploy:probe' -ForegroundColor White
  Write-Host ''
  Write-Host 'Opcao B: crie um token em https://supabase.com/dashboard/account/tokens' -ForegroundColor Cyan
  Write-Host '  $env:SUPABASE_ACCESS_TOKEN = "seu-token"' -ForegroundColor White
  Write-Host '  npm run deploy:probe' -ForegroundColor White
  Write-Host ''
  exit 1
}

Write-Host "Deploy betano-probe -> projeto $ProjectRef ..." -ForegroundColor Cyan
npx supabase functions deploy betano-probe --project-ref $ProjectRef

if ($LASTEXITCODE -ne 0) {
  Write-Host 'Deploy falhou.' -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host 'Deploy concluido. Verificando endpoint...' -ForegroundColor Green

$envFile = Join-Path $Root '.env'
if (Test-Path $envFile) {
  $lines = Get-Content $envFile
  $url = ($lines | Where-Object { $_ -match '^EXPO_PUBLIC_SUPABASE_URL=' }) -replace '^EXPO_PUBLIC_SUPABASE_URL=', ''
  $key = ($lines | Where-Object { $_ -match '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' }) -replace '^EXPO_PUBLIC_SUPABASE_ANON_KEY=', ''
  $endpoint = "$($url.TrimEnd('/'))/functions/v1/betano-probe"
  try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST `
      -Headers @{ Authorization = "Bearer $key"; apikey = $key; 'Content-Type' = 'application/json' } `
      -Body '{}' -UseBasicParsing -ErrorAction Stop
    Write-Host "Probe OK: HTTP $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content.Substring(0, [Math]::Min(200, $response.Content.Length))
  } catch {
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
      Write-Host "Probe HTTP $code" -ForegroundColor Red
    } else {
      Write-Host $_.Exception.Message -ForegroundColor Red
    }
    exit 1
  }
}

Write-Host ''
Write-Host 'Confirme no dashboard: Edge Functions -> betano-probe' -ForegroundColor Cyan
