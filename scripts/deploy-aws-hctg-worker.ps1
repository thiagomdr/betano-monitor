# Deploy / update do worker HCTG na Lightsail AWS (producao).
# Uso:
#   .\scripts\deploy-aws-hctg-worker.ps1
#   .\scripts\deploy-aws-hctg-worker.ps1 -HostIp 18.231.33.148
#
# Requer: chave PEM em $env:USERPROFILE\.ssh\lightsail-sa-east-1.pem
#         .env local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY

param(
  [string]$HostIp = "18.231.33.148",
  [string]$PemPath = "$env:USERPROFILE\.ssh\lightsail-sa-east-1.pem",
  [string]$RemoteUser = "ubuntu",
  [string]$RemoteDir = "/home/ubuntu/betano-monitor",
  [switch]$SkipClone
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root ".env"
$ServiceUnit = Join-Path $PSScriptRoot "aws-hctg-worker.service"

if (-not (Test-Path $PemPath)) { Write-Error "Chave PEM nao encontrada: $PemPath" }
if (-not (Test-Path $EnvFile)) { Write-Error "Falta $EnvFile" }
if (-not (Test-Path $ServiceUnit)) { Write-Error "Falta $ServiceUnit" }

$remote = "${RemoteUser}@${HostIp}"
$ssh = { param([string]$cmd) ssh -i $PemPath -o BatchMode=yes -o StrictHostKeyChecking=accept-new $remote $cmd }

Write-Host "=== Deploy HCTG worker -> AWS $HostIp ===" -ForegroundColor Cyan

if (-not $SkipClone) {
  & $ssh "if [ -d $RemoteDir/.git ]; then cd $RemoteDir && git fetch origin && git reset --hard origin/main; else rm -rf $RemoteDir && git clone https://github.com/thiagomdr/betano-monitor.git $RemoteDir; fi"
} else {
  Write-Host "SkipClone: mantendo codigo remoto"
}

Write-Host "Enviando .env e unit systemd..."
scp -i $PemPath -o BatchMode=yes $EnvFile "${remote}:${RemoteDir}/.env"
scp -i $PemPath -o BatchMode=yes $ServiceUnit "${remote}:/tmp/aws-hctg-worker.service"

& $ssh @"
set -e
cd $RemoteDir/scripts
npm install --omit=dev
npx playwright install chromium
sudo mv /tmp/aws-hctg-worker.service /etc/systemd/system/aws-hctg-worker.service
sudo systemctl daemon-reload
sudo systemctl enable aws-hctg-worker
sudo systemctl restart aws-hctg-worker
sleep 3
sudo systemctl is-active aws-hctg-worker
sudo journalctl -u aws-hctg-worker -n 30 --no-pager
"@

Write-Host "Deploy OK. Worker AWS em execucao." -ForegroundColor Green
