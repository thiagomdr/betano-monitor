# IP publico + SSH + bootstrap scrape na VM Oracle (BR).
param(
  [string]$EventId = "88333982",
  [string]$Slug = "tembetary-independiente-fbc"
)

$ErrorActionPreference = "Stop"
$oracle = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $oracle "oci.local.env"

if (-not (Test-Path $envFile)) {
  Write-Error "Rode primeiro: powershell -File scripts/oracle/setup-oci.ps1"
}

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

Write-Host "=== Assign public IP ==="
$out = python (Join-Path $oracle "assign_public_ip.py") | ConvertFrom-Json
$ip = $out.public_ip
if (-not $ip) { throw "Sem IP publico" }
Write-Host "IP: $ip"

Write-Host "=== Open SSH 22 ==="
python (Join-Path $oracle "open_ssh_port.py") | Out-Null

$sshKey = $env:OCI_SSH_KEY_FILE
$user = if ($env:OCI_SSH_USER) { $env:OCI_SSH_USER } else { "opc" }
$bootstrap = Join-Path $oracle "bootstrap-vm.sh"

Write-Host "=== Aguardando SSH ($user@$ip) ==="
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i $sshKey "${user}@${ip}" "echo ok" 2>$null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 10
}
if (-not $ready) { throw "SSH nao conectou em $ip" }

Write-Host "=== Bootstrap + scrape ==="
Get-Content $bootstrap -Raw | ssh -o StrictHostKeyChecking=no -i $sshKey "${user}@${ip}" "bash -s -- $EventId $Slug"
