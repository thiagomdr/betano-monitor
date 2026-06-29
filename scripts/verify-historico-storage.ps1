# Verifica bucket web + URL publica do historico (debug session 94b3c3)
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$LogPath = Join-Path $Root 'debug-94b3c3.log'
$EnvFile = Join-Path $Root '.env'
$ProjectRef = 'mddortcbebtkopeanrhu'

function Write-DebugLog {
  param([string]$HypothesisId, [string]$Location, [string]$Message, [hashtable]$Data)
  $entry = @{
    sessionId = '94b3c3'
    hypothesisId = $HypothesisId
    location = $Location
    message = $Message
    data = $Data
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  } | ConvertTo-Json -Compress
  Add-Content -Path $LogPath -Value $entry -Encoding UTF8
}

$publicUrl = "https://$ProjectRef.supabase.co/storage/v1/object/public/web/historico/index.html"

# H1: bucket web ausente
$bucketCheckStatus = $null
$bucketCheckBody = $null
try {
  $r = Invoke-WebRequest -Uri $publicUrl -UseBasicParsing -ErrorAction Stop
  $bucketCheckStatus = $r.StatusCode
  $bucketCheckBody = $r.Content.Substring(0, [Math]::Min(120, $r.Content.Length))
} catch {
  if ($_.Exception.Response) {
    $bucketCheckStatus = [int]$_.Exception.Response.StatusCode
    try {
      $sr = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
      $bucketCheckBody = $sr.ReadToEnd()
    } catch { $bucketCheckBody = $_.Exception.Message }
  } else {
    $bucketCheckBody = $_.Exception.Message
  }
}

$bodyStr = if ($null -eq $bucketCheckBody) { '' } else { $bucketCheckBody.ToString() }
$previewLen = [Math]::Min(200, $bodyStr.Length)
Write-DebugLog -HypothesisId 'H1' -Location 'verify-historico-storage.ps1:public-url' -Message 'GET public historico URL' -Data @{
  status = $bucketCheckStatus
  bodyPreview = if ($previewLen -gt 0) { $bodyStr.Substring(0, $previewLen) } else { '' }
  url = $publicUrl
}

# H2: lista buckets via CLI
Set-Location $Root
$lsOutput = npx supabase storage ls ss:/// --linked --experimental 2>&1 | Out-String
Write-DebugLog -HypothesisId 'H2' -Location 'verify-historico-storage.ps1:storage-ls' -Message 'supabase storage ls' -Data @{
  output = $lsOutput.Trim().Substring(0, [Math]::Min(500, $lsOutput.Trim().Length))
}

# H3: arquivo local existe
$localHtml = Join-Path $Root 'web\historico\index.html'
Write-DebugLog -HypothesisId 'H3' -Location 'verify-historico-storage.ps1:local-file' -Message 'local index.html' -Data @{
  exists = (Test-Path $localHtml)
  size = if (Test-Path $localHtml) { (Get-Item $localHtml).Length } else { 0 }
}

Write-Host "URL: $publicUrl"
Write-Host "HTTP: $bucketCheckStatus"
Write-Host "Body: $($bucketCheckBody.Substring(0, [Math]::Min(200, $bucketCheckBody.Length)))"
Write-Host "Log: $LogPath"
