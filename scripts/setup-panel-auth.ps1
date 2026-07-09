# Cria usuario do painel (Supabase Auth). Rode uma vez.
# Requer: projeto linkado + SUPABASE_SERVICE_ROLE_KEY no .env (ou Dashboard).
param(
  [Parameter(Mandatory = $true)]
  [string]$Email,
  [Parameter(Mandatory = $true)]
  [string]$Password
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $root ".env"

function Get-DotEnvValue([string]$Name) {
  if (-not (Test-Path $envPath)) { return $null }
  foreach ($line in Get-Content $envPath) {
    if ($line -match "^\s*#") { continue }
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
      return $Matches[1].Trim()
    }
  }
  return $null
}

$cfg = Get-Content (Join-Path $root "web\supabase.config.json") | ConvertFrom-Json
$url = Get-DotEnvValue "SUPABASE_URL"
if (-not $url) { $url = $cfg.url }
$key = Get-DotEnvValue "SUPABASE_SERVICE_ROLE_KEY"
if (-not $key) {
  Write-Error "Defina SUPABASE_SERVICE_ROLE_KEY no .env ou crie o usuario em Authentication > Users no Dashboard."
}

$body = @{
  email = $Email
  password = $Password
  email_confirm = $true
} | ConvertTo-Json

$headers = @{
  apikey = $key
  Authorization = "Bearer $key"
  "Content-Type" = "application/json"
}

Write-Host "Criando usuario $Email ..."
try {
  Invoke-RestMethod -Uri "$url/auth/v1/admin/users" -Method POST -Headers $headers -Body $body | Out-Null
  Write-Host "OK. Use esse email e senha no painel (GitHub Pages)."
} catch {
  $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
  $err = $reader.ReadToEnd()
  if ($err -match "already") {
    Write-Host "Usuario ja existe. Redefina a senha no Dashboard se necessario."
  } else {
    throw $err
  }
}

Write-Host ""
Write-Host "No Dashboard: Authentication > Providers > Email > desative 'Confirm email' e 'Enable sign ups' se quiser so login."
