# Aidan - bilgisayar ekran suresi KURULUM (kur.bat cagirir). Turkce karakter yok (PowerShell 5.1).
$k = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host ''
Write-Host '=== Aidan - bilgisayar ekran suresi kurulumu ===' -ForegroundColor Cyan
Write-Host ''
try { Invoke-RestMethod -Uri 'http://localhost:5600/api/0/info' -TimeoutSec 5 | Out-Null }
catch {
  Write-Host 'ActivityWatch calismiyor.' -ForegroundColor Red
  Write-Host 'Once https://activitywatch.net adresinden indir, kur ve ac; sonra kur.bat i tekrar calistir.'
  exit 1
}
Write-Host 'ActivityWatch calisiyor.' -ForegroundColor Green
Write-Host ''
Write-Host 'Gizli anahtar: iPhone daki Aidan Saglik kisayolunun adresinde secret= den sonraki kisim.'
$s = Read-Host 'Gizli anahtari yapistir ve Enter a bas'
if (-not $s -or -not $s.Trim()) { Write-Host 'Bos birakildi, kurulum iptal.' -ForegroundColor Red; exit 1 }
Set-Content -Path (Join-Path $k 'ayar.txt') -Value $s.Trim() -Encoding ASCII

$vbs = Join-Path $k 'gizli-calistir.vbs'
# Her 30 dakikada bir, yalniz sen oturum acmisken; pencere acilmaz (vbs gizli calistirir). Yonetici izni gerekmez.
& schtasks.exe /Create /F /TN 'Aidan Ekran Suresi' /SC MINUTE /MO 30 /TR "wscript.exe `"$vbs`"" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Zamanlanmis gorev kurulamadi.' -ForegroundColor Red; exit 1 }
Write-Host 'Zamanlanmis gorev kuruldu: her 30 dakikada bir.' -ForegroundColor Green

Write-Host 'Ilk gonderim deneniyor...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $k 'aidan-ekran.ps1')
$log = Join-Path $k 'son-gonderim.txt'
if (Test-Path $log) { Write-Host ''; Get-Content $log }
Write-Host ''
Write-Host 'Bitti. Aidan sohbetine "bugun bilgisayarda ne kadar zaman gecirdim?" diye sorabilirsin.' -ForegroundColor Cyan
