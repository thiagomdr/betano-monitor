# Configura ~/.oci + scripts/oracle/oci.local.env a partir da API key Oracle.
# Uso:
#   powershell -File scripts/oracle/setup-oci.ps1 `
#     -ApiKeyPem "C:\Users\Controle\Documents\Downloads\....pem" `
#     -UserOcid "ocid1.user..." `
#     -TenancyOcid "ocid1.tenancy..." `
#     -CompartmentOcid "ocid1.compartment..." `
#     -InstanceOcid "ocid1.instance..."

param(
  [string]$ApiKeyPem = "$env:USERPROFILE\Documents\Downloads\thiagomdrsouza@gmail.com-2026-07-08T00_22_27.043Z.pem",
  [string]$UserOcid = $env:OCI_USER_OCID,
  [string]$TenancyOcid = $env:OCI_TENANCY_OCID,
  [string]$CompartmentOcid = $env:OCI_COMPARTMENT_OCID,
  [string]$InstanceOcid = $env:OCI_INSTANCE_OCID,
  [string]$Region = "sa-saopaulo-1",
  [string]$SshKey = "$env:USERPROFILE\Documents\Downloads\ssh-key-2026-07-07.key"
)

$ErrorActionPreference = "Stop"
$ociDir = Join-Path $env:USERPROFILE ".oci"
$destPem = Join-Path $ociDir "oci_api_key.pem"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$localEnv = Join-Path $scriptDir "oci.local.env"

if (-not (Test-Path $ApiKeyPem)) {
  Write-Error "API key nao encontrada: $ApiKeyPem"
}

New-Item -ItemType Directory -Force -Path $ociDir | Out-Null
Copy-Item -Path $ApiKeyPem -Destination $destPem -Force

$fingerprint = python (Join-Path $scriptDir "fingerprint.py") $destPem
Write-Host "Fingerprint: $fingerprint"

if (-not $UserOcid) {
  $UserOcid = Read-Host "Cole OCI_USER_OCID (Configuration File Preview da Oracle)"
}
if (-not $TenancyOcid) {
  $TenancyOcid = Read-Host "Cole OCI_TENANCY_OCID"
}
if (-not $CompartmentOcid) {
  $CompartmentOcid = Read-Host "Cole OCI_COMPARTMENT_OCID (compartment root)"
}
if (-not $InstanceOcid) {
  $InstanceOcid = Read-Host "Cole OCI_INSTANCE_OCID (Compute -> Instances)"
}

$configPath = Join-Path $ociDir "config"
@"
[DEFAULT]
user=$UserOcid
fingerprint=$fingerprint
tenancy=$TenancyOcid
region=$Region
key_file=$destPem
"@ | Set-Content -Path $configPath -Encoding ASCII

$pemForEnv = $destPem -replace '\\', '/'
$sshForEnv = $SshKey -replace '\\', '/'
@"
OCI_USER_OCID=$UserOcid
OCI_TENANCY_OCID=$TenancyOcid
OCI_FINGERPRINT=$fingerprint
OCI_REGION=$Region
OCI_KEY_FILE=$pemForEnv
OCI_COMPARTMENT_OCID=$CompartmentOcid
OCI_INSTANCE_OCID=$InstanceOcid
OCI_SSH_KEY_FILE=$sshForEnv
OCI_SSH_USER=opc
"@ | Set-Content -Path $localEnv -Encoding UTF8

Write-Host ""
Write-Host "Config salvo:"
Write-Host "  $configPath"
Write-Host "  $localEnv"
Write-Host ""
Write-Host "Teste:"
Write-Host "  python scripts/oracle/assign_public_ip.py"
Write-Host "  python scripts/oracle/open_ssh_port.py"
