# Aidan - bilgisayar ekran suresi gonderici (11 Eki 2026)
# ActivityWatch (localhost:5600) bugunun AKTIF suresini (bilgisayar basinda degilken sayilmaz)
# program ve site bazinda sayar; ozet Aidan'a gider (worker /screen -> aidan_screen tablosu).
# Gorev Zamanlayici yarim saatte bir gizlice calistirir (kur.bat kurar). Elle de calistirilabilir.
# NOT: Bu dosyada Turkce karakter YOK - Windows PowerShell 5.1 BOM'suz dosyayi ANSI okur.
$ErrorActionPreference = 'Stop'
$klasor = Split-Path -Parent $MyInvocation.MyCommand.Path
$ayar = Join-Path $klasor 'ayar.txt'
$log = Join-Path $klasor 'son-gonderim.txt'
function Yaz($m) { ((Get-Date -Format 'yyyy-MM-dd HH:mm') + '  ' + $m) | Out-File -FilePath $log -Encoding utf8 }

if (-not (Test-Path $ayar)) { Yaz 'ayar.txt yok - once kur.bat calistir'; exit 1 }
$secret = (Get-Content $ayar -Raw).Trim()
$AW = 'http://localhost:5600/api/0'
$URL = 'https://aidan-pusher.fenerlisalim04.workers.dev/screen'
if ($env:AIDAN_EKRAN_URL) { $URL = $env:AIDAN_EKRAN_URL }   # yalniz test icin
if ($env:AIDAN_AW_URL) { $AW = $env:AIDAN_AW_URL }

function Sorgu($satirlar, $gun) {
  $off = [DateTimeOffset]::Now.Offset
  $isaret = '+'; if ($off -lt [TimeSpan]::Zero) { $isaret = '-' }
  $o = $isaret + ('{0:hh\:mm}' -f $off.Duration())
  $bas = $gun.ToString('yyyy-MM-dd') + 'T00:00:00' + $o
  $son = $gun.AddDays(1).ToString('yyyy-MM-dd') + 'T00:00:00' + $o
  $govde = @{ timeperiods = @("$bas/$son"); query = $satirlar } | ConvertTo-Json -Depth 5
  $r = Invoke-RestMethod -Method Post -Uri "$AW/query/" -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($govde))
  return @($r[0])
}

# Bilgisayar basinda degilken (AFK) gecen sure sayilmaz.
$ortak = @(
  'afk = flood(query_bucket(find_bucket("aw-watcher-afk_")));',
  'not_afk = filter_keyvals(afk, "status", ["not-afk"]);'
)
$pencere = $ortak + @(
  'w = flood(query_bucket(find_bucket("aw-watcher-window_")));',
  'w = filter_period_intersect(w, not_afk);',
  'RETURN = sort_by_duration(merge_events_by_keys(w, ["app"]));'
)
# Site adlari yalniz "ActivityWatch Web Watcher" tarayici eklentisi kuruluysa gelir (yoksa bos gecer).
# 11 Eki: eklenti tarayici ARKADAYKEN de aktif sekmeyi sayiyordu (site > tarayici suresi cikti);
# site suresi yalniz tarayici penceresi ONDE + bilgisayar basindayken sayilir.
$web = $ortak + @(
  'w = flood(query_bucket(find_bucket("aw-watcher-window_")));',
  'w = filter_period_intersect(w, not_afk);',
  'tarayici = filter_keyvals(w, "app", ["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "Google Chrome", "Microsoft Edge"]);',
  'b = flood(query_bucket(find_bucket("aw-watcher-web")));',
  'b = filter_period_intersect(b, tarayici);',
  'b = split_url_events(b);',
  'RETURN = sort_by_duration(merge_events_by_keys(b, ["$domain"]));'
)

$ozet = @()
# Dun + bugun: gece yarisini gecen son yarim saat dune de yazilsin.
foreach ($gun in @((Get-Date).Date.AddDays(-1), (Get-Date).Date)) {
  try { $app = Sorgu $pencere $gun } catch { Yaz 'ActivityWatch calismiyor (localhost:5600) - uygulamayi ac'; exit 1 }
  $site = @()
  try { $site = Sorgu $web $gun } catch { $site = @() }
  $toplam = [int](($app | Where-Object { $_ } | Measure-Object -Property duration -Sum).Sum)
  if ($toplam -lt 60) { continue }
  $apps = @($app | Where-Object { $_ -and $_.duration -ge 60 } | Select-Object -First 25 | ForEach-Object { @{ ad = [string]$_.data.app; sn = [int]$_.duration } })
  $sites = @($site | Where-Object { $_ -and $_.duration -ge 60 -and $_.data.'$domain' } | Select-Object -First 25 | ForEach-Object { @{ ad = [string]$_.data.'$domain'; sn = [int]$_.duration } })
  $govde = @{ date = $gun.ToString('yyyy-MM-dd'); toplamSn = $toplam; apps = $apps; sites = $sites } | ConvertTo-Json -Depth 5
  try {
    $r = Invoke-RestMethod -Method Post -Uri $URL -Headers @{ 'X-Aidan-Secret' = $secret } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($govde))
    $ozet += [string]$r.summary
  } catch {
    Yaz ('Aidan reddetti: ' + $_.Exception.Message + ' (404 = gizli anahtar yanlis, kur.bat ile tekrar gir)'); exit 1
  }
}
if ($ozet.Count) { Yaz ('OK  ' + ($ozet -join '  |  ')) } else { Yaz 'Bugun henuz 1 dakikadan fazla aktif sure yok' }
