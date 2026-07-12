# Deploy / update do worker HCTG na Kubmix (producao sa-east-1).
# Uso:
#   .\scripts\deploy-kubmix-hctg-worker.ps1
#   .\scripts\deploy-kubmix-hctg-worker.ps1 -HostIp 189.45.251.202
#
# Requer: chave PEM em $env:USERPROFILE\.ssh\kubmix-hctg.pem
#         .env local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY

param(
  [string]$HostIp = "189.45.251.202",
  [string]$PemPath = "$env:USERPROFILE\.ssh\kubmix-hctg.pem",
  [string]$RemoteUser = "admin",
  [string]$RemoteDir = "/home/admin/betano-monitor",
  [switch]$SkipClone,
  [switch]$StopAws
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root ".env"
$ServiceUnit = Join-Path $PSScriptRoot "kubmix-hctg-worker.service"
$AwsPem = "$env:USERPROFILE\.ssh\lightsail-sa-east-1.pem"
$AwsIp = "18.231.33.148"

if (-not (Test-Path $PemPath)) { Write-Error "Chave PEM nao encontrada: $PemPath" }
if (-not (Test-Path $EnvFile)) { Write-Error "Falta $EnvFile" }
if (-not (Test-Path $ServiceUnit)) { Write-Error "Falta $ServiceUnit" }

$remote = "${RemoteUser}@${HostIp}"
$sshOpts = @("-i", $PemPath, "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=accept-new")
function Invoke-Remote([string]$cmd) {
  ssh @sshOpts $remote $cmd
  if ($LASTEXITCODE -ne 0) { throw "SSH falhou (exit $LASTEXITCODE): $cmd" }
}

Write-Host "=== Deploy HCTG worker -> Kubmix $HostIp ===" -ForegroundColor Cyan

# Smoke SSH
Invoke-Remote "echo SSH_OK; whoami; free -h | head -2"

if (-not $SkipClone) {
  Write-Host "Instalando git/node se necessario e clonando repo..."
  Invoke-Remote @"
set -e
if ! command -v git >/dev/null 2>&1; then sudo apt-get update -y && sudo apt-get install -y git; fi
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if [ -d $RemoteDir/.git ]; then
  cd $RemoteDir && git fetch origin && git reset --hard origin/main
else
  rm -rf $RemoteDir
  git clone https://github.com/thiagomdr/betano-monitor.git $RemoteDir
fi
"@
} else {
  Write-Host "SkipClone: mantendo codigo remoto"
}

Write-Host "Enviando .env e unit systemd..."
scp @sshOpts $EnvFile "${remote}:${RemoteDir}/.env"
scp @sshOpts $ServiceUnit "${remote}:/tmp/kubmix-hctg-worker.service"

Invoke-Remote @"
set -e
cd $RemoteDir/scripts
npm install --omit=dev --ignore-scripts
./node_modules/.bin/playwright install --with-deps chromium
sudo mv /tmp/kubmix-hctg-worker.service /etc/systemd/system/kubmix-hctg-worker.service
sudo systemctl daemon-reload
sudo systemctl enable kubmix-hctg-worker
sudo systemctl restart kubmix-hctg-worker
sleep 5
sudo systemctl is-active kubmix-hctg-worker
sudo journalctl -u kubmix-hctg-worker -n 40 --no-pager
"@

if ($StopAws -and (Test-Path $AwsPem)) {
  Write-Host "Parando worker AWS Lightsail ($AwsIp)..." -ForegroundColor Yellow
  ssh -i $AwsPem -o BatchMode=yes -o ConnectTimeout=15 "ubuntu@$AwsIp" "sudo systemctl stop aws-hctg-worker; sudo systemctl disable aws-hctg-worker; sudo systemctl is-active aws-hctg-worker || true"
}

Write-Host "Deploy OK. Worker Kubmix em execucao." -ForegroundColor Green
Write-Host "Fonte: kubmix-worker / html-dom-kubmix | IP $HostIp"
