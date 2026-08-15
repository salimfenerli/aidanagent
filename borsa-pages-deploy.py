"""
Cloudflare Pages Direct Upload — BORSA sitesi icin.

Aidan'in aidan-pages-deploy.py'sinin ayni mantigi, tek fark: kaynak klasor
borsa/ ve hedef proje "aidanborsa". Ayni scripti parametreyle paylasmak
cazipti ama iki INCLUDE listesi ve iki farkli servis yolu var; ortak script
"hangi projeye deploy ediyorum" hatasini kolaylastirirdi — sessiz ve pahali
bir hata sinifi (yanlis siteyi ezmek).

Env: CF_API_TOKEN, CF_ACCOUNT_ID
"""
import os
import sys
import json
import base64
import hashlib
import mimetypes
import httpx
from pathlib import Path

TOKEN = os.environ["CF_API_TOKEN"]
ACCOUNT = os.environ["CF_ACCOUNT_ID"]
PROJECT = os.environ.get("BORSA_PAGES_PROJECT", "aidanborsa")

API = "https://api.cloudflare.com/client/v4"
HDRS = {"Authorization": f"Bearer {TOKEN}"}
ROOT = Path(__file__).parent / "borsa"

# (yerel dosya, servis yolu)
INCLUDE = [
    ("index.html", "/index.html"),
    ("styles.css", "/styles.css"),
    ("shared.js", "/shared.js"),
    ("stocks.js", "/stocks.js"),
    ("sync.js", "/sync.js"),
    ("app.js", "/app.js"),
    ("supabase.js", "/supabase.js"),   # self-host: tedarik-zinciri riski yok
    ("sw.js", "/sw.js"),
    ("manifest.webmanifest", "/manifest.webmanifest"),
    ("icon.png", "/icon.png"),
    ("icon-maskable.png", "/icon-maskable.png"),
]
# Bunlar deployment'a multipart form field olarak gider (asset degil)
SPECIAL_FILES = ["_headers", "_redirects"]

MIME_MAP = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}


def mime_for(path: Path) -> str:
    return MIME_MAP.get(path.suffix.lower()) or mimetypes.guess_type(str(path))[0] or "application/octet-stream"


def ensure_project(client: httpx.Client) -> None:
    r = client.get(f"{API}/accounts/{ACCOUNT}/pages/projects/{PROJECT}", headers=HDRS)
    if r.status_code == 200:
        return
    print(f"Proje '{PROJECT}' yok, olusturuluyor...")
    r = client.post(
        f"{API}/accounts/{ACCOUNT}/pages/projects",
        headers=HDRS,
        json={"name": PROJECT, "production_branch": "main"},
    )
    if r.status_code not in (200, 201):
        sys.exit(f"Proje olusturulamadi: {r.status_code} {r.text}")
    print(f"Proje olusturuldu: {PROJECT}")


def main() -> None:
    missing = [f for f, _ in INCLUDE if not (ROOT / f).exists()]
    if missing:
        # Eksik dosya sessizce atlanirsa site 404'lerle yayina cikar ve bolum
        # hic acilmaz. Deploy'u burada durdurmak dogrusu.
        sys.exit(f"HATA — borsa/ icinde eksik dosya: {', '.join(missing)}")

    with httpx.Client(timeout=120) as client:
        ensure_project(client)

        # 1) Yuklenecek dosyalarin hash'leri
        payload, manifest = [], {}
        for fname, served in INCLUDE:
            data = (ROOT / fname).read_bytes()
            b64 = base64.b64encode(data).decode()
            digest = hashlib.blake2b(
                b64.encode() + mime_for(ROOT / fname).encode(), digest_size=16
            ).hexdigest()
            manifest[served] = digest
            payload.append({"key": digest, "value": b64,
                            "metadata": {"contentType": mime_for(ROOT / fname)},
                            "base64": True})

        # 2) Upload token
        r = client.get(f"{API}/accounts/{ACCOUNT}/pages/projects/{PROJECT}/upload-token", headers=HDRS)
        if r.status_code != 200:
            sys.exit(f"Upload token alinamadi: {r.status_code} {r.text}")
        jwt = r.json()["result"]["jwt"]

        # 3) Asset'leri yukle
        r = client.post("https://api.cloudflare.com/client/v4/pages/assets/upload",
                        headers={"Authorization": f"Bearer {jwt}"}, json=payload)
        if r.status_code != 200:
            sys.exit(f"Asset yukleme hatasi: {r.status_code} {r.text}")
        print(f"{len(payload)} dosya yuklendi.")

        # 4) Deployment olustur (_headers / _redirects multipart field olarak)
        files = {"manifest": (None, json.dumps(manifest))}
        for sf in SPECIAL_FILES:
            p = ROOT / sf
            if p.exists():
                files[sf.lstrip("_")] = (None, p.read_text(encoding="utf-8"))
        r = client.post(f"{API}/accounts/{ACCOUNT}/pages/projects/{PROJECT}/deployments",
                        headers=HDRS, files=files)
        if r.status_code not in (200, 201):
            sys.exit(f"Deployment hatasi: {r.status_code} {r.text}")
        url = r.json()["result"]["url"]
        print(f"Yayinda: {url}")
        print(f"Kalici adres: https://{PROJECT}.pages.dev/")


if __name__ == "__main__":
    main()
