# Servidor local — painel Monitor Betano (web/)
# Para painel + Chrome HCTG: .\scripts\start-monitor.ps1
$Port = 8080
$Root = Join-Path (Split-Path -Parent $PSScriptRoot) "web"

Write-Host "Monitor Betano: http://localhost:$Port"
Write-Host "Pasta: $Root"
Set-Location $Root
python -m http.server $Port
