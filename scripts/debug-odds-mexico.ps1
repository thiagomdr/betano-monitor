# Debug: odds Mexico 88363620 -> debug-e14164.log (NDJSON)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cfg = Get-Content (Join-Path $root 'web\supabase.config.json') | ConvertFrom-Json
$logPath = Join-Path $root '.cursor\debug-e14164.log'
$sessionId = 'e14164'
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

function Write-DebugLog($hypothesisId, $location, $message, $data) {
  $entry = @{
    sessionId = $sessionId
    hypothesisId = $hypothesisId
    location = $location
    message = $message
    data = $data
    timestamp = $ts
    runId = 'pre-fix'
  } | ConvertTo-Json -Compress
  Add-Content -Path $logPath -Value $entry -Encoding utf8
}

$headers = @{
  apikey = $cfg.anonKey
  Authorization = "Bearer $($cfg.anonKey)"
  Accept = 'application/json'
}

$live = Invoke-RestMethod -Uri "$($cfg.url)/rest/v1/futebol_live_rows?event_id=eq.88363620&select=event_id,home,away,score,minute,over_0_odd,over_0_line,over_1_odd,over_1_line,over_2_odd,over_2_line,under_0_odd,under_0_line,under_1_odd,under_1_line,under_2_odd,under_2_line" -Headers $headers
  Write-DebugLog 'H1-H5' 'debug-odds-mexico.ps1:live_row' 'BD futebol_live_rows Mexico' @{ row = $live; runId = 'post-fix-v2' }

$mercado = Invoke-RestMethod -Uri "$($cfg.url)/rest/v1/futebol_mercado_gols_05?event_id=eq.88363620&select=*" -Headers $headers
Write-DebugLog 'H3-H4' 'debug-odds-mexico.ps1:mercado_row' 'BD futebol_mercado_gols_05 Mexico' @{ row = $mercado }

$betanoHeaders = @{
  'User-Agent' = 'Mozilla/5.0 (compatible; BetanoMonitor/1.0)'
  Referer = 'https://www.betano.bet.br/live/'
  Origin = 'https://www.betano.bet.br'
  Accept = 'application/json'
}

try {
  $eventUrl = 'https://www.betano.bet.br/danae-webapi/api/live/events/88363620?queryLanguageId=5&queryOperatorId=8'
  $event = Invoke-RestMethod -Uri $eventUrl -Headers $betanoHeaders
  $topKeys = @($event.PSObject.Properties.Name)
  Write-DebugLog 'H1' 'debug-odds-mexico.ps1:event_keys' 'Betano event top keys' @{ keys = $topKeys }

  $eventResult = $event.result
  if ($eventResult) {
    $resultKeys = @($eventResult.PSObject.Properties.Name)
    $rMarkets = $eventResult.markets
    $rSelections = $eventResult.selections
    $rGoalSels = @()
    if ($rSelections) {
      foreach ($prop in $rSelections.PSObject.Properties) {
        $s = $prop.Value
        $n = [string]$s.name
        if ($n -match 'mais|menos') {
          $rGoalSels += "$n @ $($s.price) h=$($s.handicap)"
        }
      }
    }
    Write-DebugLog 'H1-H2' 'debug-odds-mexico.ps1:event_result' 'event.result selections' @{
      resultKeys = $resultKeys
      goalSelectionTexts = $rGoalSels
    }
  }
  if ($event.versionsPerAudience) {
    $vpa = ($event.versionsPerAudience | ConvertTo-Json -Depth 4 -Compress)
    if ($vpa.Length -gt 800) { $vpa = $vpa.Substring(0, 800) }
    Write-DebugLog 'H5' 'debug-odds-mexico.ps1:versions' 'event versionsPerAudience' @{ json = $vpa }
  }

  foreach ($extraUrl in @(
    'https://www.betano.bet.br/danae-webapi/api/live/events/88363620/markets?queryLanguageId=5&queryOperatorId=8',
    'https://www.betano.bet.br/api/live/event/88363620/markets',
    'https://www.betano.bet.br/danae-webapi/api/live/events/88363620?queryLanguageId=5&queryOperatorId=8&includeAllMarkets=true',
    'https://www.betano.bet.br/danae-webapi/api/live/event/88363620/markets/all?queryLanguageId=5&queryOperatorId=8'
  )) {
    try {
      $extra = Invoke-RestMethod -Uri $extraUrl -Headers $betanoHeaders
      $ek = @($extra.PSObject.Properties.Name)
      $ej = ($extra | ConvertTo-Json -Depth 3 -Compress)
      if ($ej.Length -gt 500) { $ej = $ej.Substring(0, 500) }
      Write-DebugLog 'H5' 'debug-odds-mexico.ps1:extra_url' "Extra API $extraUrl" @{ keys = $ek; sample = $ej }
    } catch {
      Write-DebugLog 'H5' 'debug-odds-mexico.ps1:extra_url_err' "Failed $extraUrl" @{ error = $_.Exception.Message }
    }
  }

  $markets = $event.markets
  if (-not $markets -and $event.data) { $markets = $event.data.markets }
  $selections = $event.selections
  if (-not $selections -and $event.data) { $selections = $event.data.selections }

  $goalSelections = @()
  if ($selections) {
    foreach ($prop in $selections.PSObject.Properties) {
      $s = $prop.Value
      $n = [string]$s.name
      if ($n -match 'mais|menos|over|under') {
        $goalSelections += @{
          id = $prop.Name
          name = $n
          price = $s.price
          handicap = $s.handicap
          marketId = $s.marketId
        }
      }
    }
  }
  Write-DebugLog 'H1-H2' 'debug-odds-mexico.ps1:goal_selections' 'All goal-ish selections' @{ selections = $goalSelections }

  $goalMarkets = @()
  if ($markets) {
    foreach ($prop in $markets.PSObject.Properties) {
      $m = $prop.Value
      $name = "$($m.name) $($m.typeName) $($m.marketType)"
      if ($name -match 'gol|goal|total|mais|menos') {
        $sels = @()
        if ($m.selectionIdList) {
          foreach ($sid in $m.selectionIdList) {
            $s = $selections.$sid
            if ($s) { $sels += @{ id = $sid; name = $s.name; price = $s.price; handicap = $s.handicap } }
          }
        }
        $goalMarkets += @{ id = $prop.Name; name = $name; selectionCount = $sels.Count; selections = $sels }
      }
    }
  }
  Write-DebugLog 'H1-H2' 'debug-odds-mexico.ps1:betano_event' 'Betano goal markets raw' @{ marketCount = $goalMarkets.Count; goalMarkets = $goalMarkets }

  $offersUrl = 'https://www.betano.bet.br/api/event/markets-offers/88363620'
  $offers = Invoke-RestMethod -Uri $offersUrl -Headers $betanoHeaders
  $offerKeys = @($offers.PSObject.Properties.Name)
  $inner = $offers
  if ($offers.result) { $inner = $offers.result }
  if ($offers.data) { $inner = $offers.data }
  $innerKeys = @($inner.PSObject.Properties.Name)
  $offerGoalTexts = @()
  $mo = $inner.marketOffers
  if ($mo) {
    $moJson = ($mo | ConvertTo-Json -Depth 12 -Compress)
    $has6686 = $moJson -match '2837006686'
    $idx35 = $moJson.IndexOf('3.5')
    $snippet35 = if ($idx35 -ge 0) { $moJson.Substring([Math]::Max(0,$idx35-100), [Math]::Min(400, $moJson.Length - [Math]::Max(0,$idx35-100))) } else { '' }
    if ($has6686) {
      $idx6686 = $moJson.IndexOf('2837006686')
      $snippet6686 = $moJson.Substring([Math]::Max(0,$idx6686-50), [Math]::Min(800, $moJson.Length - [Math]::Max(0,$idx6686-50)))
      Write-DebugLog 'H5' 'debug-odds-mexico.ps1:offers_6686' 'marketOffers around main market' @{ snippet = $snippet6686 }
    }
  }

  if ($mo) {
    foreach ($block in @($mo)) {
      $items = @($block)
      if ($block -is [System.Collections.IDictionary] -or $block.PSObject.Properties) {
        $items = @($block)
      }
      foreach ($item in $items) {
        if (-not $item) { continue }
        $iname = "$($item.name) $($item.marketName) $($item.typeName)"
        if ($iname -match 'gol|goal|total') {
          $sels = $item.selections
          if ($sels) {
            foreach ($s in @($sels)) {
              $offerGoalTexts += "$iname :: $($s.name) @ $($s.price)"
            }
          }
        }
      }
    }
    # also walk array form
    if ($mo -is [Array]) {
      foreach ($item in $mo) {
        $iname = "$($item.name) $($item.marketName)"
        if ($iname -match 'gol|goal|total|mais|menos') {
          foreach ($s in @($item.selections)) {
            $offerGoalTexts += "$iname :: $($s.name) @ $($s.price)"
          }
        }
      }
    }
    # dump first offer structure keys
    $first = $null
    if ($mo -is [Array] -and $mo.Count -gt 0) { $first = $mo[0] }
    elseif ($mo) { $first = $mo | Select-Object -First 1 }
    $firstKeys = if ($first) { @($first.PSObject.Properties.Name) } else { @() }
    $firstName = if ($first) { "$($first.name) $($first.marketName)" } else { '' }
  }
  # Find Total de Gols offers with 3.5/4.5/5.5 lines
  $offerSamples = @()
  $deepGoalHits = @()
  if ($mo -and $mo.PSObject.Properties) {
    foreach ($prop in $mo.PSObject.Properties) {
      $bucket = $prop.Value
      foreach ($item in @($bucket)) {
        if (-not $item) { continue }
        $blob = ($item | ConvertTo-Json -Depth 8 -Compress)
        if ($blob -match 'Mais de 3[,.]5|Mais de 4[,.]5|Total de Gols') {
          if ($blob.Length -gt 400) { $blob = $blob.Substring(0, 400) }
          $deepGoalHits += $blob
        }
      }
    }
  }
  Write-DebugLog 'H5' 'debug-odds-mexico.ps1:offers_deep' 'Deep search marketOffers for goal lines' @{
    hitCount = $deepGoalHits.Count
    hits = $deepGoalHits | Select-Object -First 8
  }

  if ($mo -and $mo.PSObject.Properties) {
    $propEnum = $mo.PSObject.Properties.GetEnumerator()
    if ($propEnum.MoveNext()) {
      $sample = $propEnum.Current.Value
      $sampleKeys = @($sample.PSObject.Properties.Name)
      $sampleJson = ($sample | ConvertTo-Json -Depth 4 -Compress)
      if ($sampleJson.Length -gt 1200) { $sampleJson = $sampleJson.Substring(0, 1200) }
      Write-DebugLog 'H5' 'debug-odds-mexico.ps1:offer_shape' 'First marketOffer shape' @{
        keys = $sampleKeys
        json = $sampleJson
      }
    }
    foreach ($prop in $mo.PSObject.Properties) {
      $v = $prop.Value
      $text = "$($v.name) $($v.marketName) $($v.typeName)"
      $selText = @()
      if ($v.selections) {
        foreach ($s in @($v.selections)) {
          if ($s.name -match 'mais|menos') { $selText += "$($s.name)@$($s.price)" }
        }
      }
      $joined = ($selText -join ' | ')
      if ($text -match 'total de gols|total goals' -or $joined -match '3[,.]5|4[,.]5|5[,.]5') {
        $offerSamples += "$text :: $joined"
      }
    }
  }
  Write-DebugLog 'H5' 'debug-odds-mexico.ps1:offers_gols' 'marketOffers Total de Gols samples' @{
    samples = $offerSamples
    sampleCount = $offerSamples.Count
  }

  $overviewUrl = 'https://www.betano.bet.br/danae-webapi/api/live/overview/latest?includeVirtuals=true&queryLanguageId=5&queryOperatorId=8'
  $overview = Invoke-RestMethod -Uri $overviewUrl -Headers $betanoHeaders
  $ovMarkets = $overview.markets
  $ovSelections = $overview.selections

  $allEventGoalSels = @()
  if ($ovMarkets) {
    foreach ($prop in $ovMarkets.PSObject.Properties) {
      $m = $prop.Value
      $eid = "$($m.eventId)"
      if ($eid -ne '88363620') { continue }
      $mname = "$($m.name) $($m.typeName)"
      if ($m.selectionIdList) {
        foreach ($sid in $m.selectionIdList) {
          $s = $ovSelections.$sid
          if ($s -and "$($s.name)" -match 'mais|menos') {
            $allEventGoalSels += "$mname : $($s.name) @ $($s.price)"
          }
        }
      }
    }
  }
  Write-DebugLog 'H1' 'debug-odds-mexico.ps1:overview_all_markets' 'ALL overview markets for Mexico event' @{
    selections = $allEventGoalSels
    count = $allEventGoalSels.Count
  }

  $ev = $overview.events.'88363620'
  if (-not $ev) {
    foreach ($e in $overview.events) {
      if ("$($e.id)" -eq '88363620') { $ev = $e; break }
    }
  }
  $marketIds = @()
  if ($ev.marketIdList) { $marketIds = @($ev.marketIdList) }

  $altSel = $ovSelections.'9935354058'
  if ($altSel) {
    $sj = ($altSel | ConvertTo-Json -Depth 4 -Compress)
    Write-DebugLog 'H1' 'debug-odds-mexico.ps1:alt_sel' 'Alt Mais de 3.5 selection' @{ json = $sj }
  }

  $altMarket = $ovMarkets.'2841484980'
  if ($altMarket) {
    $aj = ($altMarket | ConvertTo-Json -Depth 5 -Compress)
    Write-DebugLog 'H1' 'debug-odds-mexico.ps1:alt_market' 'Sample alt Total de Gols market' @{ json = $aj }
  }

  $zoneId = "$($ev.zoneId)"
  $zoneHctg = @()
  if ($ovMarkets -and $zoneId) {
    foreach ($prop in $ovMarkets.PSObject.Properties) {
      $m = $prop.Value
      if ("$($m.type)" -ne 'HCTG') { continue }
      if ("$($m.zoneId)" -ne $zoneId) { continue }
      $handicap = $m.handicap
      $sels = @()
      if ($m.selectionIdList) {
        foreach ($sid in $m.selectionIdList) {
          $s = $ovSelections.$sid
          if ($s) { $sels += "$($s.name)@$($s.price)" }
        }
      }
      $zoneHctg += "mid $($prop.Name) hc $handicap : $($sels -join ' | ')"
    }
  }
  Write-DebugLog 'H1' 'debug-odds-mexico.ps1:zone_hctg' "HCTG markets zoneId $zoneId" @{
    markets = $zoneHctg
    count = $zoneHctg.Count
  }

  $evJson = ($ev | ConvertTo-Json -Depth 6 -Compress)
  if ($evJson.Length -gt 2000) { $evJson = $evJson.Substring(0, 2000) }
  Write-DebugLog 'H1' 'debug-odds-mexico.ps1:event_json' 'Mexico event object from overview' @{ json = $evJson }

  $mainMarket = $ovMarkets.'2837006686'
  if ($mainMarket) {
    $mj = ($mainMarket | ConvertTo-Json -Depth 5 -Compress)
    if ($mj.Length -gt 1500) { $mj = $mj.Substring(0, 1500) }
    Write-DebugLog 'H1' 'debug-odds-mexico.ps1:main_market_json' 'Mexico Total de Gols main market' @{ json = $mj }
  }

  $mexicoMarketsByField = @()
  if ($ovMarkets) {
    foreach ($prop in $ovMarkets.PSObject.Properties) {
      $m = $prop.Value
      $blob = ($m | ConvertTo-Json -Depth 3 -Compress)
      if ($blob -match '88363620') {
        $mexicoMarketsByField += "mid $($prop.Name) : $($m.name) :: $blob".Substring(0, [Math]::Min(200, ("mid $($prop.Name) : $($m.name) :: $blob").Length))
      }
    }
  }
  Write-DebugLog 'H1' 'debug-odds-mexico.ps1:mexico_market_refs' 'Markets referencing event id in JSON' @{
    hits = $mexicoMarketsByField
  }

  $totalGolsMarkets = @()
  if ($ovMarkets -and $ovSelections) {
    foreach ($prop in $ovMarkets.PSObject.Properties) {
      $m = $prop.Value
      $mname = "$($m.name)"
      if ($mname -notmatch 'Total de Gols') { continue }
      $sels = @()
      if ($m.selectionIdList) {
        foreach ($sid in $m.selectionIdList) {
          $s = $ovSelections.$sid
          if ($s) { $sels += "$($s.name)@$($s.price)" }
        }
      }
      $totalGolsMarkets += "mid $($prop.Name) event $($m.eventId) : $($sels -join ' | ')"
    }
  }
  Write-DebugLog 'H1' 'debug-odds-mexico.ps1:all_total_gols' 'All Total de Gols markets in overview' @{
    markets = ($totalGolsMarkets | Select-Object -First 30)
    count = $totalGolsMarkets.Count
  }

  $mexico35 = @()
  if ($ovSelections -and $ovMarkets) {
    foreach ($prop in $ovSelections.PSObject.Properties) {
      $s = $prop.Value
      $n = [string]$s.name
      if ($n -notmatch 'Mais de 3[,.]5|Menos de 3[,.]5|Mais de 5[,.]5') { continue }
      $mid = "$($s.marketId)"
      $m = $ovMarkets.$mid
      $mname = if ($m) { "$($m.name)" } else { '?' }
      $meid = if ($m) { "$($m.eventId)" } else { '' }
      if ($meid -eq '88363620' -or $mid -in $marketIds) {
        $mexico35 += "market $mid ($mname) event $meid : $n @ $($s.price)"
      }
    }
  }
  Write-DebugLog 'H1' 'debug-odds-mexico.ps1:mexico_alt_lines' 'Alt 3.5/5.5 linked to Mexico' @{
    hits = $mexico35
    marketIds = $marketIds
  }

  $overviewGoalSels = @()
  foreach ($mid in $marketIds) {
    $m = $ovMarkets.$mid
    if (-not $m) { continue }
    $mname = "$($m.name) $($m.typeName)"
    if ($mname -notmatch 'gol|goal|total') { continue }
    if ($m.selectionIdList) {
      foreach ($sid in $m.selectionIdList) {
        $s = $ovSelections.$sid
        if ($s) {
          $overviewGoalSels += @{ market = $mname; name = $s.name; price = $s.price; handicap = $s.handicap }
        }
      }
    }
  }
  Write-DebugLog 'H1-H2' 'debug-odds-mexico.ps1:overview' 'Overview goal selections for Mexico' @{
    marketIdCount = $marketIds.Count
    selections = ($overviewGoalSels | ForEach-Object { "$($_.market): $($_.name) @ $($_.price)" })
  }

  # Simula anchor±1 (mesma logica da Edge Function)
  $anchorMid = '2837006686'
  $anchorM = $ovMarkets.$anchorMid
  $anchorHc = [double]$anchorM.handicap
  $anchorOver = $null
  foreach ($sid in $anchorM.selectionIdList) {
    $s = $ovSelections.$sid
    if ("$($s.name)" -match 'Mais') { $anchorOver = [double]$s.price; break }
  }
  $simPicks = @()
  foreach ($delta in @(-1, 1)) {
    $targetHc = $anchorHc + $delta
    $cands = @()
    foreach ($prop in $ovMarkets.PSObject.Properties) {
      $mid = $prop.Name
      if ($mid -eq $anchorMid -or $marketIds -contains $mid) { continue }
      $m = $prop.Value
      if ("$($m.type)" -ne 'HCTG') { continue }
      if ([Math]::Abs([double]$m.handicap - $targetHc) -gt 0.01) { continue }
      $over = $null
      foreach ($sid in $m.selectionIdList) {
        $s = $ovSelections.$sid
        if ("$($s.name)" -match 'Mais') { $over = [double]$s.price; break }
      }
      if ($null -eq $over) { continue }
      if ($delta -lt 0 -and $over -ge $anchorOver) { continue }
      if ($delta -gt 0 -and $over -le $anchorOver) { continue }
      $cands += [pscustomobject]@{ mid = $mid; over = $over; hc = $m.handicap }
    }
    if ($cands.Count -gt 0) {
      $sorted = if ($delta -lt 0) { $cands | Sort-Object over -Descending } else { $cands | Sort-Object over }
      $pick = $sorted[0]
      $simPicks += "delta $delta hc $targetHc -> mid $($pick.mid) over $($pick.over)"
    }
  }
  Write-DebugLog 'H1' 'debug-odds-mexico.ps1:sim_anchor' 'Simulated anchor±1 picks' @{
    anchorHc = $anchorHc
    anchorOver = $anchorOver
    picks = $simPicks
  }
} catch {
  Write-DebugLog 'H1' 'debug-odds-mexico.ps1:betano_error' 'Betano API failed' @{ error = $_.Exception.Message }
}

Write-Host "Logs written to $logPath"
