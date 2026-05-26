"""
Aidan Worker deploy scripti — Cloudflare API üzerinden.
Wrangler'a gerek yok, sadece python + httpx.

Çalıştırmadan önce env değişkenleri ayarla:
  CF_API_TOKEN   — Cloudflare API token
  CF_ACCOUNT_ID  — Cloudflare account id
"""
import os
import sys
import json
import httpx
from pathlib import Path

TOKEN = os.environ["CF_API_TOKEN"]
ACCOUNT = os.environ["CF_ACCOUNT_ID"]
SCRIPT_NAME = "aidan-pusher"

API = "https://api.cloudflare.com/client/v4"
HDRS = {"Authorization": f"Bearer {TOKEN}"}

WORKER_JS = (Path(__file__).parent / "worker.js").read_text(encoding="utf-8")

CRON_LIST = [
    {"cron": "0 5 * * *"},   # 08:00 TR sabah brifing
    {"cron": "0 6 * * *"},   # 09:00 TR deadline uyarı
    {"cron": "0 9 * * *"},   # 12:00 TR öğle ping
    {"cron": "0 18 * * *"},  # 21:00 TR akşam özet
]


def upload_script():
    url = f"{API}/accounts/{ACCOUNT}/workers/scripts/{SCRIPT_NAME}"
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2025-01-01",
    }
    files = {
        "metadata": (None, json.dumps(metadata), "application/json"),
        "worker.js": ("worker.js", WORKER_JS, "application/javascript+module"),
    }
    r = httpx.put(url, headers=HDRS, files=files, timeout=60)
    print(f"Upload script: {r.status_code}")
    if not r.is_success:
        print(r.text)
        sys.exit(1)
    body = r.json()
    if not body.get("success"):
        print(json.dumps(body, indent=2))
        sys.exit(1)
    print("  ✓ Worker scripti yüklendi")


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
        print(r.text)


def set_crons():
    url = f"{API}/accounts/{ACCOUNT}/workers/scripts/{SCRIPT_NAME}/schedules"
    r = httpx.put(url, headers=HDRS, json=CRON_LIST, timeout=30)
    print(f"Set crons: {r.status_code}")
    if not r.is_success:
        print(r.text)
    else:
        print("  ✓ 4 cron trigger ayarlandı")


def get_subdomain():
    url = f"{API}/accounts/{ACCOUNT}/workers/subdomain"
    r = httpx.get(url, headers=HDRS, timeout=30)
    if r.is_success:
        return r.json().get("result", {}).get("subdomain")
    return None


if __name__ == "__main__":
    print(f"Account: {ACCOUNT}")
    print(f"Script:  {SCRIPT_NAME}\n")

    upload_script()
    print()

    # Secret'lar
    secrets = {
        "SUPABASE_URL": os.environ["SUPABASE_URL"],
        "SUPABASE_KEY": os.environ["SUPABASE_KEY"],
        "AIDAN_EMAIL": os.environ["AIDAN_EMAIL"],
        "AIDAN_PASSWORD": os.environ["AIDAN_PASSWORD"],
        "NTFY_TOPIC": os.environ.get("NTFY_TOPIC", ""),
    }
    for k, v in secrets.items():
        if v:
            set_secret(k, v)
    print()

    enable_workers_dev()
    print()
    set_crons()
    print()

    sub = get_subdomain()
    if sub:
        print(f"\n🚀 Hazır! URL: https://{SCRIPT_NAME}.{sub}.workers.dev")
        print(f"   Test:  https://{SCRIPT_NAME}.{sub}.workers.dev/?type=morning")
