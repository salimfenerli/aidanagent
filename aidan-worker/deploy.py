"""
Aidan Worker deploy scripti — Cloudflare API üzerinden.
Wrangler'a gerek yok, sadece python + httpx.

Çalıştırmadan önce env değişkenleri ayarla:
  CF_API_TOKEN   — Cloudflare API token
  CF_ACCOUNT_ID  — Cloudflare account id
  SUPABASE_URL / SUPABASE_KEY / AIDAN_EMAIL / AIDAN_PASSWORD
  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / WEBHOOK_SECRET

Bu script aynı zamanda PWA static dosyalarını da (asistan.html, sw.js,
manifest, ikonlar) Worker'a embed eder — site Worker URL'inden serve edilir.
"""
import os
import sys
import json
import base64
import mimetypes
import httpx
from pathlib import Path

TOKEN = os.environ["CF_API_TOKEN"]
ACCOUNT = os.environ["CF_ACCOUNT_ID"]
SCRIPT_NAME = "aidan-pusher"

API = "https://api.cloudflare.com/client/v4"
HDRS = {"Authorization": f"Bearer {TOKEN}"}

ROOT = Path(__file__).parent.parent       # claudedeneme/
WORKER_DIR = Path(__file__).parent        # claudedeneme/aidan-worker/

# Worker'a embed edilecek static dosyalar — yol → mime
STATIC_FILES = [
    ("asistan.html",         "text/html; charset=utf-8"),
    ("index.html",           "text/html; charset=utf-8"),
    ("sw.js",                "application/javascript; charset=utf-8"),
    ("manifest.webmanifest", "application/manifest+json"),
    ("icon.svg",             "image/svg+xml"),
    ("icon-maskable.svg",    "image/svg+xml"),
]


def build_worker_js() -> str:
    """worker.js'i oku, static dosyaları base64'le embed et."""
    raw = (WORKER_DIR / "worker.js").read_text(encoding="utf-8")
    embedded: dict[str, dict[str, str]] = {}
    total_kb = 0
    for fname, mime in STATIC_FILES:
        path = ROOT / fname
        if not path.exists():
            print(f"  ⚠️  Eksik: {fname}")
            continue
        data = path.read_bytes()
        b64 = base64.b64encode(data).decode("ascii")
        embedded[f"/{fname}"] = {"content_b64": b64, "type": mime}
        # Root path '/' alias'ı asistan.html için
        size_kb = len(data) / 1024
        total_kb += size_kb
        print(f"  ✓ /{fname:25s} {size_kb:6.1f} KB → {len(b64)/1024:6.1f} KB b64")

    json_blob = json.dumps(embedded)
    print(f"  📦 Toplam embed: {total_kb:.1f} KB raw, {len(json_blob)/1024:.1f} KB JSON")
    if "__STATIC_FILES__" not in raw:
        print("  ❌ worker.js içinde __STATIC_FILES__ placeholder yok!")
        sys.exit(1)
    return raw.replace("__STATIC_FILES__", json_blob)


CRON_LIST = [
    {"cron": "0 5 * * *"},   # 08:00 TR sabah brifing
    {"cron": "0 6 * * *"},   # 09:00 TR deadline uyarı
    {"cron": "0 9 * * *"},   # 12:00 TR öğle ping
    {"cron": "0 18 * * *"},  # 21:00 TR akşam özet
    {"cron": "0 18 * * SUN"},  # Pazar 21:00 TR — haftalık review (AI yorumlu)
    {"cron": "*/30 7-15 * * 1-5"},  # BIST saatleri (10-18 TR, hafta içi) — borsa alarm
    {"cron": "30 15 * * 1-5"},  # 18:30 TR hafta içi — akşam portföy özeti (BIST kapanışı sonrası)
    {"cron": "*/15 * * * *"},  # 15 dk'da bir — sabit hatırlatıcı kontrolü (ilaç/su/ders, data.reminders)
]


def upload_script(worker_js: str):
    url = f"{API}/accounts/{ACCOUNT}/workers/scripts/{SCRIPT_NAME}"
    # bindings: AI binding ŞART (env.AI.run için) + secret'ları inherit ile koru.
    # inherit = önceki Worker versiyonundaki secret'ı aynen tut (değer GitHub Actions env'inde olmasa bile kaybolmaz).
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2025-01-01",
        "bindings": [
            {"type": "ai", "name": "AI"},
            {"type": "inherit", "name": "SUPABASE_URL"},
            {"type": "inherit", "name": "SUPABASE_KEY"},
            {"type": "inherit", "name": "AIDAN_EMAIL"},
            {"type": "inherit", "name": "AIDAN_PASSWORD"},
            {"type": "inherit", "name": "WEBHOOK_SECRET"},
            {"type": "inherit", "name": "VAPID_PUBLIC_KEY"},
            {"type": "inherit", "name": "VAPID_PRIVATE_KEY"},
        ],
    }
    files = {
        "metadata": (None, json.dumps(metadata), "application/json"),
        "worker.js": ("worker.js", worker_js, "application/javascript+module"),
    }
    r = httpx.put(url, headers=HDRS, files=files, timeout=120)
    print(f"Upload script: {r.status_code}")
    if not r.is_success:
        print(r.text[:1000])
        sys.exit(1)
    body = r.json()
    if not body.get("success"):
        print(json.dumps(body, indent=2)[:1500])
        sys.exit(1)
    print(f"  ✓ Worker scripti yüklendi ({len(worker_js)/1024:.1f} KB)")


def enable_workers_dev():
    url = f"{API}/accounts/{ACCOUNT}/workers/scripts/{SCRIPT_NAME}/subdomain"
    r = httpx.post(url, headers=HDRS, json={"enabled": True}, timeout=30)
    print(f"Enable workers.dev: {r.status_code}")
    if r.status_code == 404:
        # Bu account için subdomain yoksa oluştur
        sub_url = f"{API}/accounts/{ACCOUNT}/workers/subdomain"
        r0 = httpx.get(sub_url, headers=HDRS, timeout=30)
        print(f"  Subdomain check: {r0.status_code} {r0.text[:200]}")
    if r.is_success:
        print("  ✓ workers.dev açıldı")


def set_secret(name: str, value: str):
    url = f"{API}/accounts/{ACCOUNT}/workers/scripts/{SCRIPT_NAME}/secrets"
    payload = {"name": name, "text": value, "type": "secret_text"}
    r = httpx.put(url, headers=HDRS, json=payload, timeout=30)
    print(f"Set secret {name}: {r.status_code}")
    if not r.is_success:
        print(r.text[:500])


def set_crons():
    url = f"{API}/accounts/{ACCOUNT}/workers/scripts/{SCRIPT_NAME}/schedules"
    r = httpx.put(url, headers=HDRS, json=CRON_LIST, timeout=30)
    print(f"Set crons: {r.status_code}")
    if not r.is_success:
        print(r.text[:500])
    else:
        print(f"  ✓ {len(CRON_LIST)} cron trigger ayarlandı")


def get_subdomain():
    url = f"{API}/accounts/{ACCOUNT}/workers/subdomain"
    r = httpx.get(url, headers=HDRS, timeout=30)
    if r.is_success:
        return r.json().get("result", {}).get("subdomain")
    return None


if __name__ == "__main__":
    print(f"Account: {ACCOUNT}")
    print(f"Script:  {SCRIPT_NAME}\n")

    print("→ Static dosyaları Worker'a embed ediyorum…")
    worker_js = build_worker_js()
    print()

    upload_script(worker_js)
    print()

    # Secret'lar (varsa)
    secret_names = [
        "SUPABASE_URL", "SUPABASE_KEY", "AIDAN_EMAIL", "AIDAN_PASSWORD",
        "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "WEBHOOK_SECRET",
        "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY",
    ]
    for k in secret_names:
        v = os.environ.get(k, "")
        if v:
            set_secret(k, v)
    print()

    enable_workers_dev()
    print()
    set_crons()
    print()

    sub = get_subdomain()
    if sub:
        base = f"https://{SCRIPT_NAME}.{sub}.workers.dev"
        print(f"\n🚀 Hazır!")
        print(f"   🌐 Site:   {base}/")
        print(f"   📱 PWA:    {base}/asistan.html")
        print(f"   🔧 Cron:   {base}/?secret=<WEBHOOK_SECRET>&type=morning")
        print(f"   🤖 Bot WH: {base}/webhook")
