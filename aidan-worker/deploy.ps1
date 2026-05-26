# Aidan Worker tek tık deploy — PowerShell
# Kullanım: aidan-worker klasörü içinde sağ tık → PowerShell ile çalıştır
# VEYA: cd aidan-worker; .\deploy.ps1

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "===== Aidan Worker Deploy =====" -ForegroundColor Cyan
Write-Host ""

# Token: env'de varsa kullan, yoksa sor
if (-not $env:CF_API_TOKEN) {
    Write-Host "Cloudflare API token gerekli (Workers Edit yetkili)." -ForegroundColor Yellow
    $secure = Read-Host "CF_API_TOKEN" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $env:CF_API_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# Diğer env değişkenleri — .env'den oku
$envFile = Join-Path $PSScriptRoot ".env"
$mcpEnvFile = Join-Path $PSScriptRoot "..\aidan-mcp\.env"

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=#]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
        }
    }
    Write-Host "✓ aidan-worker/.env okundu" -ForegroundColor Green
}

if (Test-Path $mcpEnvFile) {
    Get-Content $mcpEnvFile | ForEach-Object {
        if ($_ -match '^([^=#]+)=(.*)$') {
            $name = $matches[1].Trim()
            # Sadece eksikleri doldur, varsa üstüne yazma
            if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
                [Environment]::SetEnvironmentVariable($name, $matches[2].Trim(), 'Process')
            }
        }
    }
    Write-Host "✓ aidan-mcp/.env okundu (eksikler için)" -ForegroundColor Green
}

# Sabit Cloudflare hesap id (CLAUDE.md'den)
if (-not $env:CF_ACCOUNT_ID) {
    $env:CF_ACCOUNT_ID = 'dd37c3eb3e7fbab35ee16f1a6db4cce1'
}

# Eksik olan WEBHOOK_SECRET ve TELEGRAM_BOT_TOKEN'ı interaktif sor
$required = @('SUPABASE_URL','SUPABASE_KEY','AIDAN_EMAIL','AIDAN_PASSWORD','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','WEBHOOK_SECRET','CF_ACCOUNT_ID','CF_API_TOKEN')
$missing = @()
foreach ($r in $required) {
    if (-not [Environment]::GetEnvironmentVariable($r, 'Process')) {
        $missing += $r
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Eksik env değişkenleri:" -ForegroundColor Yellow
    foreach ($m in $missing) {
        if ($m -match 'PASSWORD|TOKEN|KEY|SECRET') {
            $secure = Read-Host $m -AsSecureString
            $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            $val = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
            [Environment]::SetEnvironmentVariable($m, $val, 'Process')
        } else {
            $val = Read-Host $m
            [Environment]::SetEnvironmentVariable($m, $val, 'Process')
        }
    }
}

Write-Host ""
Write-Host "Deploy başlıyor..." -ForegroundColor Cyan

# Python ile gerçek deploy
$pythonExe = (Get-Command py -ErrorAction SilentlyContinue) ?? (Get-Command python -ErrorAction SilentlyContinue) ?? (Get-Command python3 -ErrorAction SilentlyContinue)
if (-not $pythonExe) {
    Write-Host "❌ Python bulunamadı. https://python.org'dan kur, 'Add to PATH' işaretle." -ForegroundColor Red
    exit 1
}

& $pythonExe.Source (Join-Path $PSScriptRoot "deploy.py")

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Worker deploy edildi." -ForegroundColor Green
    Write-Host ""
    Write-Host "Hızlı doğrulama:" -ForegroundColor Cyan
    Write-Host "  - Secret'sız GET → 404 dönmeli"
    try {
        $r = Invoke-WebRequest -Uri "https://aidan-pusher.fenerlisalim04.workers.dev/?type=morning" -SkipHttpErrorCheck -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 404) {
            Write-Host "    ✓ Secret'sız 404 — güvenlik açığı kapandı" -ForegroundColor Green
        } else {
            Write-Host "    ⚠️ Beklenmedik HTTP $($r.StatusCode) — propagasyon birkaç saniye sürebilir" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    ⚠️ Test isteği başarısız: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "❌ Deploy başarısız (exit $LASTEXITCODE)" -ForegroundColor Red
    Write-Host "   Yukarıdaki hata mesajına bak."
}
