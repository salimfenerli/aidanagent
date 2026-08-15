"""
Cloudflare Pages Direct Upload — Aidan PWA için.
"aidanapp" projesi oluştur (yoksa), static dosyaları yükle, deployment oluştur.

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
PROJECT = os.environ.get("PAGES_PROJECT", "aidanapp")

API = "https://api.cloudflare.com/client/v4"
HDRS = {"Authorization": f"Bearer {TOKEN}"}
ROOT = Path(__file__).parent

# Sadece bu dosyalar asset olarak yüklensin
# _headers ve _redirects ayrı (deployment multipart field)
# (local source filename, served path) — Pages .html strip için kritik
INCLUDE = [
    ("asistan.html", "/index.html"),  # / için Pages default, .html strip yok
    ("supabase.js", "/supabase.js"),  # self-host: jsdelivr tedarik-zinciri riski yok
    ("html5-qrcode.min.js", "/html5-qrcode.min.js"),  # self-host: barkod tarayici
    ("core.js", "/core.js"),
    ("tasks.js", "/tasks.js"),
    ("ui.js", "/ui.js"),
    ("program.js", "/program.js"),
    ("nutrition.js", "/nutrition.js"),
    ("styles.css", "/styles.css"),
    ("404.html", "/404.html"),
    ("sw.js", "/sw.js"),
    ("manifest.webmanifest", "/manifest.webmanifest"),
    ("icon.png", "/icon.png"),
    ("icon-maskable.png", "/icon-maskable.png"),
    ("icon.svg", "/icon.svg"),
    ("icon-maskable.svg", "/icon-maskable.svg"),
]
ALIASES = {}  # artık gerek yok
# Bu dosyalar deployment'a multipart form field olarak gider
SPECIAL_FILES = ["_headers", "_redirects"]

MIME_MAP = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg":  "image/svg+xml",
    ".png":  "image/png",
}


def get_or_create_project():
    """aidanapp projesi var mı, yoksa oluştur."""
    r = httpx.get(f"{API}/accounts/{ACCOUNT}/pages/projects/{PROJECT}", headers=HDRS, timeout=30)
    if r.status_code == 200:
        sub = r.json()["result"]["subdomain"]
        print(f"  ✓ '{PROJECT}' projesi mevcut → {sub}")
        return sub
    if r.status_code == 404:
        print(f"  → '{PROJECT}' yok, oluşturuyorum…")
        r = httpx.post(
            f"{API}/accounts/{ACCOUNT}/pages/projects",
            headers=HDRS,
            json={"name": PROJECT, "production_branch": "main"},
            timeout=30,
        )
        if r.is_success:
            sub = r.json()["result"]["subdomain"]
            print(f"  ✓ Oluşturuldu → {sub}")
            return sub
        print(f"  ❌ {r.status_code}: {r.text[:500]}")
        sys.exit(1)
    print(f"  ❌ {r.status_code}: {r.text[:500]}")
    sys.exit(1)


def get_upload_token():
    r = httpx.get(f"{API}/accounts/{ACCOUNT}/pages/projects/{PROJECT}/upload-token", headers=HDRS, timeout=30)
    if not r.is_success:
        print(f"  ❌ Upload token: {r.status_code} {r.text[:300]}")
        sys.exit(1)
    return r.json()["result"]["jwt"]


def hash_content(content: bytes) -> str:
    """Cloudflare Pages için file hash. 32 hex chars. SHA256 first 32 chars."""
    # Wrangler blake3 kullanıyor ama API key olarak hangi hash olduğu önemli değil,
    # sadece tutarlı olması yeterli. SHA256[:32] basit ve hızlı.
    return hashlib.sha256(content).hexdigest()[:32]


def collect_files():
    files = []
    for source, served_path in INCLUDE:
        path = ROOT / source
        if not path.exists():
            print(f"  ⚠️  Atlandı (yok): {source}")
            continue
        content = path.read_bytes()
        ext = path.suffix
        ct = MIME_MAP.get(ext) or (mimetypes.guess_type(source)[0] or "application/octet-stream")
        h = hash_content(content)
        files.append({
            "path": served_path,
            "hash": h,
            "content": content,
            "content_type": ct,
            "size_kb": len(content) / 1024,
        })
        if source != served_path.lstrip("/"):
            print(f"  ✓ {served_path} ← {source:18s} {len(content)/1024:6.1f} KB  hash={h[:12]}…")
        else:
            print(f"  ✓ {served_path:28s} {len(content)/1024:6.1f} KB  hash={h[:12]}…")
    return files


def check_missing(jwt: str, hashes: list[str]) -> list[str]:
    r = httpx.post(
        f"{API}/pages/assets/check-missing",
        headers={"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"},
        json={"hashes": hashes},
        timeout=60,
    )
    if not r.is_success:
        print(f"  ❌ check-missing: {r.status_code} {r.text[:300]}")
        sys.exit(1)
    return r.json().get("result", [])


def upload_assets(jwt: str, files: list[dict]):
    """Cloudflare'a base64'lü dosyaları yükle."""
    payload = []
    for f in files:
        payload.append({
            "key": f["hash"],
            "value": base64.b64encode(f["content"]).decode("ascii"),
            "metadata": {"contentType": f["content_type"]},
            "base64": True,
        })
    r = httpx.post(
        f"{API}/pages/assets/upload",
        headers={"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if not r.is_success:
        print(f"  ❌ upload: {r.status_code} {r.text[:500]}")
        sys.exit(1)
    print(f"  ✓ {len(payload)} dosya yüklendi")


def create_deployment(files: list[dict], headers_content: bytes | None, redirects_content: bytes | None):
    """Pages deployment oluştur — manifest ile + _headers / _redirects multipart."""
    manifest = {f["path"]: f["hash"] for f in files}
    # Alias'lar: aynı hash'i farklı yola map et (extra upload yok)
    by_filename = {f["path"].lstrip("/"): f["hash"] for f in files}
    for alias_path, source_filename in ALIASES.items():
        if source_filename in by_filename:
            manifest[alias_path] = by_filename[source_filename]
            print(f"  alias: {alias_path} → {source_filename} (hash {by_filename[source_filename][:8]}…)")
    print(f"  Manifest: {len(manifest)} yol")
    # Pages multipart deployment için özel field name'ler.
    # Test sonucunda doğru kombinasyon: field name = "_headers" / "_redirects"
    # WITH filename in tuple (filename, content, content-type).
    files_data = {
        "manifest": (None, json.dumps(manifest), "application/json"),
    }
    if headers_content is not None:
        files_data["_headers"] = ("_headers", headers_content, "text/plain")
        print(f"  + _headers ({len(headers_content)} B)")
    if redirects_content is not None:
        files_data["_redirects"] = ("_redirects", redirects_content, "text/plain")
        print(f"  + _redirects ({len(redirects_content)} B)")
    r = httpx.post(
        f"{API}/accounts/{ACCOUNT}/pages/projects/{PROJECT}/deployments",
        headers=HDRS,
        files=files_data,
        timeout=120,
    )
    if not r.is_success:
        print(f"  ❌ deployment: {r.status_code} {r.text[:500]}")
        sys.exit(1)
    result = r.json()["result"]
    return result


if __name__ == "__main__":
    print(f"Account: {ACCOUNT}")
    print(f"Project: {PROJECT}\n")

    print("→ Proje kontrolü…")
    subdomain = get_or_create_project()
    print()

    print("→ Dosyalar toplanıyor…")
    files = collect_files()
    print(f"  Toplam: {len(files)} dosya, {sum(f['size_kb'] for f in files):.1f} KB")
    print()

    print("→ Upload token alınıyor…")
    jwt = get_upload_token()
    print(f"  ✓ JWT {len(jwt)} chars")
    print()

    print("→ Hangi hash'ler eksik kontrol ediliyor…")
    all_hashes = [f["hash"] for f in files]
    missing = check_missing(jwt, all_hashes)
    print(f"  Yüklenecek: {len(missing)} / {len(all_hashes)}")
    print()

    if missing:
        print("→ Dosyalar yükleniyor…")
        missing_files = [f for f in files if f["hash"] in missing]
        upload_assets(jwt, missing_files)
        print()

    # _headers ve _redirects ayrı oku
    headers_path = ROOT / "_headers"
    redirects_path = ROOT / "_redirects"
    headers_content = headers_path.read_bytes() if headers_path.exists() else None
    redirects_content = redirects_path.read_bytes() if redirects_path.exists() else None
    if headers_content is not None:
        print(f"  + _headers config: {len(headers_content)} B")
    if redirects_content is not None:
        print(f"  + _redirects config: {len(redirects_content)} B")
    print()

    print("→ Deployment oluşturuluyor…")
    dep = create_deployment(files, headers_content, redirects_content)
    print(f"  ✓ Deployment id: {dep.get('id', '?')[:16]}…")
    print(f"  Aliases: {dep.get('aliases', [])}")
    url = dep.get("url", "")
    print()
    print(f"🚀 Hazır!")
    print(f"   🌐 Production: https://{subdomain}/")
    print(f"   📱 PWA:        https://{subdomain}/asistan.html")
    if url and url != f"https://{subdomain}":
        print(f"   🔗 Deployment: {url}")
