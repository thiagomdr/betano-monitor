# Servidor local — painel Casino Scores (web/)
$Port = 8080
$Root = Join-Path (Split-Path -Parent $PSScriptRoot) "web"

Write-Host "Monitor Casino Scores: http://localhost:$Port"
Write-Host "Pasta: $Root"
Set-Location $Root
python -m http.server $Port
