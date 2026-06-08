# Aidan - ADHD Asistanı Projesi

## Kullanıcı
- **İsim:** Salim
- **Durum:** ADHD, **kod bilmiyor**
- **Yapamadıkları:** Python kuramaz, terminal kullanamaz, complex setup yapamaz
- **Cihazlar:** Windows bilgisayar + **iPhone + Safari**
- **Yaklaşım:** Adım adım, görsel, sade. Net "şuraya tıkla, şunu yaz" tarzı yönergeler.

## Proje
Tek HTML dosyalı, browser-based ADHD asistanı + sunucu tarafında Cloudflare Worker + Telegram bot. **PWA olarak telefon ve bilgisayara kurulu.**

## Mimari (Mevcut Durum)

```
┌──────────────┐      ┌──────────────┐      ┌───────────────┐
│  iPhone PWA  │◄────►│   Supabase   │◄────►│   Windows PC  │
│ (aidanapp.   │      │  (aidan_data │      │     PWA       │
│  pages.dev)  │      │    tablo)    │      │ (aidanapp...) │
└──────────────┘      └──────┬───────┘      └───────┬───────┘
                             │                       │
                      ┌──────▼──────┐         ┌─────▼──────┐
                      │ Cloudflare  │         │ Claude     │
                      │   Worker    │         │ Desktop +  │
                      │ + Workers AI│         │ MCP Server │
                      │ + Whisper   │         │ (Python)   │
                      └──────┬──────┘         └────────────┘
                             │
                      ┌──────▼──────┐
                      │  Telegram   │
                      │  bot (sesli │
                      │  + yazılı)  │
                      └─────────────┘
```

- **Frontend:** `asistan.html` (~2700 satır, tek dosya HTML + CSS + JS)
- **Hosting:** **Cloudflare Pages** (`aidanapp.pages.dev`) — Mayıs 27, 2026'da Netlify'dan geçildi (Netlify free tier kotası tükendi)
- **Deploy:** `py aidan-pages-deploy.py` ile Direct Upload API → 5 sn'de canlı
- **Bulut:** Supabase (`fluhzvzulrnfyqogrgfi.supabase.co`)
- **Bildirim:** Telegram bot (eski ntfy.sh deprecate edildi, kota sorunu)
- **PWA:** Manifest + Service Worker (network-first stratejisi) + **icon.png** (yeni bulut mascot)
- **Tasarım dili:** **Stitch-inspired dark mode** (May 28-29, 2026) — indigo `#6463ff`, koyu `#0a0b0f`, soft amber `#ffc640` yıldız. Inter font.
- **Cache versiyonu:** `aidan-v7-20` (sw.js içinde, her büyük değişikte artırılır)
- **AI:** Cloudflare Workers AI — **Llama 3.3 70B** (intent + tool use) + **Whisper** (sesli → metin). Bedava.
- **MCP Server (PC):** Python, Claude Desktop bağlanır, doğrudan Supabase'e operasyon yapar
- **Cloudflare Worker:** Cron brifing + Telegram webhook handler (artık static serve etmiyor, sadece backend)
- **Güvenlik:** Supabase RLS doğrulandı (anon=hiçbir şey, auth=sadece kendi user_id). Pages `_headers` ile CSP/HSTS/X-Frame/COOP/Permissions-Policy canlıda (8 header). Worker GET `?secret=` zorunlu (spam koruması). Sensitive paths (`/CLAUDE.md`, `/aidan-mcp/*`, `/.env*`) `_redirects` ile 404'e gidiyor.

## Dosyalar (`C:\Users\Salim\Desktop\claudedeneme\`)

### Frontend (Cloudflare Pages'e deploy oluyor)
- `asistan.html` — ana uygulama. Pages'te `/index.html` olarak servis ediliyor (auto-strip redirect loop'u önlemek için)
- `404.html` — Aidan stilinde dark mode error sayfası, `_redirects` 404 hedefi
- `manifest.webmanifest` — PWA manifest (start_url + scope = `/`)
- `sw.js` — service worker (network-first, otomatik update mesajı, cache `aidan-v7-6`, push + notificationclick handler)
- `icon.png` — **ana PWA ikonu** (1024x1024, mor bulut mascot, Recraft AI üretimi May 29)
- `icon-maskable.png` — maskable PWA ikonu (%80 safe area, dark navy `#0a0b0f` padding)
- `icon.svg`, `icon-maskable.svg` — legacy fallback SVG ikonları (manifest'te de var)
- `logo-concepts/` — 3 farklı logo varyantı + PDF→PNG dönüştürme scriptleri (yedek, deploy edilmiyor)
- `_headers` — Cloudflare Pages config: 8 security header (CSP, HSTS, X-Frame, COOP, Permissions-Policy, Referrer-Policy, X-Content-Type, X-XSS)
- `_redirects` — Pages config: `/asistan.html` → `/`, sensitive paths (`/CLAUDE.md`, `/aidan-mcp/*`, `/aidan-worker/*`, `/.env*`, `/.git*`, `/.claude/*`, `/netlify.toml`, `/blackjack.html`) → 404
- `aidan-pages-deploy.py` — Cloudflare Pages Direct Upload script (multipart `_headers`/`_redirects` field + asset manifest)

### MCP Server (PC'de çalışır, Claude Desktop için)
- `aidan-mcp/server.py` — FastMCP server, Supabase REST direkt çağırır
- `aidan-mcp/.env` — credentials (gitignore'da, asla commit edilmez)

### Cloudflare Worker
- `aidan-worker/worker.js` — Worker kodu (cron + webhook + AI + tools). Sadece backend, static serve YOK.
- `aidan-worker/deploy.py` — Cloudflare API üzerinden deploy scripti (wrangler yok)
- `aidan-worker/wrangler.toml` — cron schedules referansı

### Meta
- `CLAUDE.md` — bu dosya
- `.gitignore` — .env, .claude/settings.local.json, vs.

## Servisler & URL'ler

| Servis | URL | Not |
|---|---|---|
| Aidan PWA | **https://aidanapp.pages.dev/** | Canlı (Cloudflare Pages) |
| Cloudflare Pages Dashboard | https://dash.cloudflare.com/?to=/:account/pages | "aidanapp" projesi |
| GitHub Repo | https://github.com/salimfenerli/aidanagent | Private, eski Netlify backup'ı |
| Supabase | https://supabase.com/dashboard/project/fluhzvzulrnfyqogrgfi | Email + şifre auth |
| Cloudflare Dashboard | https://dash.cloudflare.com | Worker + Pages burada |
| Worker URL | https://aidan-pusher.fenerlisalim04.workers.dev | Cron + webhook (sadece backend) |
| Worker test (GET) | `?type=morning\|noon\|evening\|deadline&secret=<WEBHOOK_SECRET>` | Manuel brifing tetikleme |
| Telegram bot | t.me/salim_aidan_bot | Asıl kullanıcı arayüzü mobilde |

## Credentials (sadece .env'de)
- **Supabase:** `fluhzvzulrnfyqogrgfi.supabase.co`, publishable key, fenerlisalim04@gmail.com
- **Telegram:** BotFather'dan token, chat_id: `7264211579`
- **Cloudflare:** account `dd37c3eb3e7fbab35ee16f1a6db4cce1`
- **API token:** sadece .env veya geçici env var olarak

## Özellikler

### Görevler (Aidan core)
- Öncelik (Normal / 🔥 Acil) + kategori (📚 Ödev / 📖 Özel Ders / 🏠 Ev / 💜 Kişisel) + son tarih + tahmini süre
- Alt görevler: ✂️ aksiyon butonu ile ekle (görev kartı şişmesin diye sadece subtask varsa liste görünür)
- Tekrarlı: günlük / haftalık (weekdays/weekends temizlendi — kullanım yoktu)
- **⭐ Bugünün 3'ü (MIT)** — günde en fazla 3 öncelik, üstte sabit kutu, tıklanır=bitir
- **🎯 MIT akıllı öneri kutusu** — MIT seçilmemişse en uygun 3 görev tıklanabilir kart (deadline/öncelik/yaş/kategori skoru)
- **🔔 Saat hatırlatma** — saat ekli görev için bildirim
- **🕰️ Yaş rozeti** — 5+ gündür duran görevlere "🕰️ Ng" uyarısı
- **📅 Ertele butonu** — tıkla → Yarın / +3 gün / Haftaya / Tarih seç. ADHD için kritik — utanç yerine kaydır.
- **⚡ 2dk dene** — estimateMin > 5 görevlere. Task initiation altın kuralı.
- **🎉 Done dopamine** — bittiğinde konfeti + chord ses + "+N bugün" sayaç
- **📊 Doluluk göstergesi** — bugünün toplam tahmini dk, anti-overwhelm
- **🌙 Akşam özeti** — 19:00+ veya 5+ bittiyse otomatik gösterilir (utanç değil gurur)
- **✏️ Düzenleme** — modal'la
- **🔍 Arama** — yazdıkça filtreli
- **🏷️ Filtre chip'leri** — Hepsi / Bugün / Acil / Ödev / Özel Ders / Ev / Kişisel / Bitenler
- **📦 Yarın/Sonra** — katlanır panel
- **🎯 "Şu an ne yapayım?"** — akıllı tek görev öneri (MIT → acil → bugün → kısa → rastgele)

### Quick Capture (üst bar)
- Üst barda tek input — aklına geleni 2 sn'de yaz, sonra düşün
- **/ tuşu** ile odaklan, **Enter** ile ekle
- Kategori/öncelik atmaya gerek yok — sonra düzenle

### Ödev Serisi
- "Tarih kitabı 50-100 sayfa, salıya bitsin" → otomatik 7 görev böler
- Her görevde `seriesId/seriesName/seriesIndex/seriesTotal`
- Görev kartında 📚 rozeti "3/7" tıklanır → seri detay modal'ı
- **🔄 Yeniden dengele** — kalan günler + yeni deadline ile redistribute (hafta sonu atlama opsiyonel)
- **🗑️ Seriyi sil** — modal'dan tek tıkla
- ⚠️ Gecikmiş görevler modal'da kırmızı çerçeveli
- MCP'den `add_homework_series`, `reschedule_series`, `list_series`

### Odak (🎧 Pomodoro)
- 5dk + 25/5 preset (15/3 ve 50/10 silindi — decision paralysis)
- Dairesel timer, çalışırken hafif nabız animasyonu, durakta soluk
- Status: HAZIR / Çalışma / Mola / Durakta
- "dakika / odak / mola" alt etiket
- Bugün seans sayacı

### Üst Bar
- Şu an saati / Sıradaki hatırlatma (görev reminderTime'larından) / Kesintisiz çalışma süresi

### Header subtitle (canlı)
- "🌤️ Salı, 26 Mayıs · ⭐ 2/3 · ✅ 5 bitti" gibi günün durumuna göre

### Ayarlar
- Bildirimler artık Telegram'dan (UI sadece bilgi notu)
- Supabase auth (email + şifre)
- Yedekleme (JSON export/import) + sıfırla

### ❌ KALDIRILDILAR (Mayıs 25-26, 2026)
- **Mood / Check-in sekmesi** — kullanılmıyordu (May 25)
- **🍅 Pomodoro trend grafik** — yer kaplıyordu
- **🧠 Brain Dump sekmesi** — Telegram brain_dump tool yeterli (data field geriye uyumluluk için duruyor)
- **⏰ Rutinler sekmesi** — Worker cron + task reminderTime aynı işi yapıyor
- **📅 Hafta takvimi modal** — ADHD beyninin sevmediği grid, görev kartında "📅 Yarın" zaten var
- **🔥 Streak feature** — sadece daily için, stres kaynağı, az kullanım
- **🧠 Hyperfocus uyarısı** — şüpheli tetikleme, sessiz başarısız oluyordu
- **📱 ntfy.sh** — Telegram'a tamamen geçildi (quota sorunu vardı)
- **💪 Motivasyon banner** — ilk 5'ten sonra göz arkasına atılıyordu
- **📊 pomoHistory data** — grafik silinince consumer kalmadı
- **⬇️ Düşük öncelik** — Normal + Acil yeter, 3'lü seçim decision paralysis
- **Tekrar: weekdays/weekends** — daily + weekly yeter
- **Suggest modal "5dk dene" + "Başka tane"** — duplicate fonksiyonlar
- **Manuel done "kaç dk sürdü?" prompt** — sıkıyordu, focus modunda otomatik ölçüm var

### Genel UI
- Toast bildirimleri (sağ üst)
- Custom modal sistemi `aidanPrompt(title, label, default, multiline)`
- Suggest modal (Şu an ne yapayım?)
- Service Worker yeni sürüm aktif olunca **otomatik reload toast** ("🔄 Aidan güncellendi, yeniden yükleniyor...")

### Sekmeler: 5 → 3
Görevler · 🎧 Odak · ⚙️ Ayarlar (Brain Dump + Rutinler kaldırıldı)

## MCP Server (Claude Desktop için)

`aidan-mcp/server.py` — FastMCP server. PC'de çalışır. Claude Desktop config:

```json
{
  "mcpServers": {
    "aidan": {
      "command": "py",
      "args": ["C:\\Users\\Salim\\Desktop\\claudedeneme\\aidan-mcp\\server.py"]
    }
  }
}
```

(Config dosyası: `%APPDATA%\Claude\claude_desktop_config.json`)

### Tool'lar (MCP)
- `list_tasks(filter)` — active/today/done/mit/all
- `add_task(text, priority?, category?, due?, estimate_min?, reminder_time?, repeat?, mit?)` — kategori artık `odev|ders|ev|kisisel`
- `complete_task(task_id, actual_min?)`
- `delete_task(task_id)`
- `update_task(task_id, ...)`
- `add_subtask(task_id, text)`
- `brain_dump(text)`
- `daily_briefing()` — bugünün özeti
- `find_task(query)` — arama
- `add_homework_series(name, deadline, pages_from?, pages_to?, chunks?, daily_minutes?, ...)`
- `reschedule_series(series_id|series_name, new_deadline, skip_weekends?)`
- `list_series()`

## Cloudflare Worker

URL: `aidan-pusher.fenerlisalim04.workers.dev`

### Cron schedules (UTC)
| Cron | TR saati | İş |
|---|---|---|
| `0 5 * * *` | 08:00 | 🌅 Sabah brifingi |
| `0 6 * * *` | 09:00 | ⏰ Deadline uyarısı |
| `0 9 * * *` | 12:00 | ☀️ Öğle check-in |
| `0 18 * * *` | 21:00 | 🌙 Akşam özet |

### Endpoint'ler
- `GET /?type=morning|noon|evening|deadline&secret=<WEBHOOK_SECRET>` — manuel brifing test. **Secret zorunlu** (spam koruması). Eksik/yanlış secret → 404.
- `POST /webhook` — Telegram'dan gelen update (X-Telegram-Bot-Api-Secret-Token header ile auth)

### Telegram Bot Webhook
- Bot: `t.me/salim_aidan_bot`
- Webhook URL: `https://aidan-pusher.fenerlisalim04.workers.dev/webhook`
- Secret token: WEBHOOK_SECRET env var

### Bot tool'ları (Llama 3.3 70B function calling)
- `add_task` — yeni görev (kategori: odev/ders/ev/kisisel)
- `list_tasks(filter)` — active/today/done/mit/urgent/all
- `complete_task(query)` — metin araması ile bitir
- `delete_task(query)` — metin araması ile sil
- `show_briefing` — bugünün özeti. **MIT seçilmediyse akıllı 3 öneri** (skor: deadline + öncelik + yaş + kategori). Gecikmiş görev bölümü ayrı.
- `set_mit(query)` — bir görevi bugünün MIT'ine ekle
- `unset_mit(query)` — MIT'ten çıkar
- `postpone_task(query, to)` — yarın/salı/DD.MM.YYYY'ye kaydır
- `brain_dump(text)` — dump'a ekle

### Sesli mesaj akışı
1. Telegram voice mesajı → file_id
2. `/getFile` ile file_path
3. Audio download (OGG/Opus)
4. `env.AI.run('@cf/openai/whisper', { audio: array })` → metin
5. "🎤 Duyduğum: ..." kullanıcıya gönder (yanlışsa fark etsin)
6. Normal AI pipeline'a sok

### Sistem prompt (özet)
- Türkçe ZORUNLU
- Kısa, samimi cevap
- Tool seçimi netlerse direkt çağır
- Sohbet (selam/naber) için tool çağırma
- Tarih: bugün=today, yarın=today+1, "salı" → en yakın o gün
- Code-level fallback: AI İngilizce şablon dönerse Türkçe rastgele cevapla değiştir

### Cloudflare credentials
- Account ID: `dd37c3eb3e7fbab35ee16f1a6db4cce1`
- API token: "Edit Cloudflare Workers" template, .env'de
- Subdomain: `fenerlisalim04.workers.dev`
- AI binding: `env.AI` (Workers AI)

### Worker deploy

```bash
cd aidan-worker
# .env'de veya geçici env var olarak: CF_API_TOKEN, CF_ACCOUNT_ID, SUPABASE_*, AIDAN_*, TELEGRAM_*
py deploy.py
```

Veya manuel API çağrısı (deploy.py inline). Wrangler yok.

## Çözülen Sorunlar (Tarihçe)

### Eski
- Site URL `/asistan.html` ile yazılmıştı → düzeltildi
- Project URL `/rest/v1` ile yazılmıştı → kod kırpıyor
- Confirm email toggle yok → SQL ile manuel set edildi
- Permission denied → GRANT eksikti
- Settings → Tasks geri atma → realtime echo'su, fix: 3sn grace + render-only update
- Body Doubling silindi (sahte sesler, gerçek body doubling değildi)
- Magic link silindi
- Hyperfocus yanlış tetikleme → gerçek aktiviteye bağlandı
- Üst barda yinelenen "Aidan açık" silindi
- Görev kartında 5dk butonu silindi (Pomodoro ile çakışıyordu)
- Mood 8 emoji → 5 → 0 (tamamen kaldırıldı)

### Mayıs 25, 2026 (büyük seans)
- **MCP server kuruldu** — Claude Desktop'tan Aidan kontrolü
- **Auto-deploy kuruldu** — Git → Netlify
  - ⚠️ Netlify ilk linklediğinde **yeni boş `salimfenerli/aidanagent` repo'su açtı** (eski `salimfenerli/aidan` repo'su askıda kaldı). Force push ile kurtardık.
- **Service Worker cache problemi** — yeni dosyalar gelmiyordu. Çözüm: network-first stratejisine geçtik, yeni SW aktiflesince istemcilere "reload" mesajı atar. Bir daha cache cehennemi yok.
- **ntfy.sh quota** — Cloudflare Worker'lar paylaşımlı IP, gün içinde 429 yedi. **Telegram'a geçildi.**
- **Llama İngilizce şablon cevap** — "naber" deyince *"Your input is not sufficient"* dönüyordu. Sistem prompt'u sertleştirildi + code-level fallback ile çözüldü.
- **Mood otomatik kayıt rahatsız edici** — sen "yorgunum" yazdığında otomatik mood log atıyordu. Mood feature tamamen kaldırıldı.

### Mayıs 26, 2026 (gece seansı — büyük temizlik + ADHD silahları + güvenlik)
- **5 sekme → 3** (Brain Dump + Rutinler kaldırıldı)
- **Yeni ADHD silahları:** Quick capture topbar (/ tuşu), ⚡2dk dene, 🎉 Done dopamine (konfeti+ses+counter), 📊 Doluluk göstergesi, 🌙 Akşam özet PWA'da
- **Yeni özellikler:** 📅 Ertele butonu (yarın/+3/haftaya/seç), 🕰️ görev yaşı rozeti, 📖 Özel Ders kategorisi, 🎯 MIT akıllı öneri kutusu, 🔄 Seri yeniden dengele
- **Worker:** Sabah brifingi akıllı MIT öneri (deadline + öncelik + yaş skoru), set_mit / unset_mit / postpone_task tool'ları
- **Kaldırılan kalıntılar:** ntfy.sh, Streak, Hyperfocus, pomoHistory, Motivasyon banner, Brain Dump tab, Rutinler tab, Hafta takvimi, Pomodoro 15/3+50/10 preset, Düşük öncelik, weekdays/weekends repeat, suggest modal'da "5dk dene"+"Başka tane", manuel done "kaç dk?" prompt
- **🎧 Odak tab:** 🍅→🎧, timer pulse animasyonu, daha temiz preset (5dk + 25/5)
- **🔒 Güvenlik sıkılaştırma:** Worker GET endpoint'i artık `?secret=` zorunlu. Netlify security headers (CSP, HSTS, X-Frame, Referrer-Policy, Permissions-Policy, X-Content-Type, COOP). Supabase RLS 4 senaryoda canlıda doğrulandı (anon=hiçbir şey, auth=sadece kendi user_id).
- **Cache:** v5-0 → v6-0

### Mayıs 28-29, 2026 (Stitch tasarım yenilemesi + yeni mascot logo)
- **Tam tasarım yenilemesi** Google Stitch (eski Galileo AI) ile mockup üretildi, CSS Stitch'in design token'larına uyduruldu
- **Yeni renk paleti:** indigo accent `#6463ff` (eski `#7c6ff7` yerine), koyu `#0a0b0f` (eski `#090b0f`), soft amber `#ffc640` (eski `#e5a117`)
- **Tipografi:** Inter font, h1 dev (30px) tarih hero, brand 21px, body 14-15px
- **Header yenilendi:** sol küçük bulut logo + "Aidan" + sağ takvim ikonu; altında DEV tarih ("Perşembe, 28 Mayıs") + mor nokta + mood subtitle ("☀️ yeni başlangıç" / "🌆 akşam toparlanma" gibi)
- **Topbar küçültüldü** (sade tek satır), **stats (0/0/0) kaldırıldı** (görsel gürültü)
- **Quick capture** pill + soft glow focus
- **Tabs** segmented pill (Görevler/Odak/Ayarlar)
- **MIT box** sade: sarı yıldız (★) + 3 görev satırı (kart değil)
- **Görev kartları** Stitch tarzı: sol kalın renkli border (priority/category) + round checkbox + sade chip
- **Action butonları** (⭐⚡✏️🗑️) subtle gri, hover'da belirginleşiyor (opacity 0.55 → 1)
- **Filter chip'leri** nötr, aktif olan dolu mor (renkli karmaşa yok)
- **"Şu an ne yapayım?"** ghost button (transparent + border, parlak mor değil)
- **Yeni mascot logo:** mor bulut karakter (Recraft AI üretimi, Salim seçimi) — 2 göz + sevimli ifade, sağda sarı yıldız aksı (logoda küçük PDF gelmedi, PNG'ye çevrildi)
- **3 logo varyantı `logo-concepts/`'te** — flat (büyük gözler), refined (aktif), 3d (beyaz-mor dramatic). Değiştirmek için sadece kopyala-yapıştır.
- **Theme color** `#1e1e2e` → `#0a0b0f` (manifest + meta tag)
- **Otomatik deploy çalışıyor:** GitHub Actions `deploy.yml` her push'ta tetikleniyor — drag-drop gereksiz, `git push` yeter
- **Stitch.withgoogle.com** (eski Galileo AI) ücretsiz tier mockup için kullanıldı — 350 Gemini 2.5 Flash gen/ay
- **Cache:** v6-4 → v7-0 (tasarım) → v7-1 (logo + manifest)

### ⚠️ Güvenlik açık: Cloudflare API token leak (May 29)
- `.github/workflows/deploy.yml`'de `CF_API_TOKEN` fallback olarak **açık commit edildi**: `cfut_dLXSejO...`
- Git history'de duruyor → token'ı Cloudflare dashboard'dan **revoke et**, yeni token oluştur, GitHub repo `Settings → Secrets → Actions`'a `CF_API_TOKEN` adıyla ekle
- Workflow zaten secret'ı önce kontrol ediyor (`${{ secrets.CF_API_TOKEN || 'cfut_...' }}`) — secret eklendiğinde fallback bypass olur
- Bu yapılana kadar repo private kalmalı

### Mayıs 27, 2026 (Netlify → Cloudflare Pages göçü + URL temizliği)
- **Netlify free tier kotası tükendi** — "This team has exceeded the credit limit" 503 hatası
- **Cloudflare Pages'e geçildi** — Direct Upload API ile (wrangler yok), Python script ile multipart upload
- **URL temizliği:** `aidanagent.netlify.app/asistan.html` → **`aidanapp.pages.dev/`** (kullanıcı identifier yok, kısa)
- **Çözülen Pages problemleri:**
  - `.html` auto-strip redirect loop (`/` → 308 → `/asistan` → 308 → ∞) → asistan.html'i `/index.html` path'inde upload ederek çözüldü
  - `_headers`/`_redirects` asset olarak yükleniyordu (200 servis) → multipart form field (filename tuple ile) olarak gönderildi
  - Sensitive paths (`/CLAUDE.md`, `/aidan-mcp/*`) SPA fallback ile 200 dönüyordu → `_redirects` ile `/404.html` 404 yönlendirmesi
  - Cache propagation lag → deployment-specific URL'lerden test edilerek doğrulandı
- **Yeni dosyalar:** `404.html` (dark mode), `_headers`, `_redirects`, `aidan-pages-deploy.py`
- **Worker artık sadece backend** — static serve etmiyor, cron + webhook + AI işine odaklı
- **Manifest düzeltildi** — `start_url` ve `scope` = `/` (eski `/asistan.html` yerine)
- **8 security header canlıda doğrulandı:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-XSS-Protection, COOP
- **Cache:** v6-0 → v6-3

### Haziran 2, 2026 (BÜYÜK seans — background push + şablon + energy + token temizliği)
- **↩️ Undo sistemi:** görev sil/bitir → 5sn "geri al" toast'lu (`showUndoToast`). `deleteTask` confirm'i kaldırıldı, `toggleTask` justFinished'e undo. ADHD impulsive-tap kurtarıcı.
- **🔔 PWA bildirim (iOS uyumlu):** eski `new Notification()` iOS PWA'da çalışmıyordu → `notify()` artık SW `reg.showNotification` kullanıyor + `sw.js`'e `notificationclick` handler. Ayarlar'da test butonu + cihaz kayıt durumu.
- **🎙️ Sesli giriş (PWA'da!):** quick capture'a 🎙️ butonu, Web Speech API `tr-TR`. Söyle → input'a yazar → Enter ile onayla (otomatik göndermez). **Artık sesli için Telegram şart değil.**
- **📋 Görev şablonları:** 4 hazır preset (sınav haftası / ödev oturumu / ev toparlama / sabah başlangıç) + kendi şablonunu kaydet-sil. `makeTask()` ortak üreteç eklendi. "Şu an ne yapayım" yanında "📋 Şablonlar" ghost butonu. → `data.templates[]`
- **⚡ Energy-aware "Şu an ne yapayım":** modalda 🔋Düşük / ⚡Orta / 🚀Yüksek enerji. Düşük=kısa iş (≤20dk) öne, Yüksek=acil/uzun (≥30dk) havuz daraltma. ADHD enerji dalgasına uyum.
- **💜 Haftalık insight kartı:** Pzt/Sal/Çar açılışta MIT üstünde "geçen hafta X görev / en aktif kategori / en verimli gün". `data.lastWeeklyView` (ISO hafta) ile haftada 1×. (Worker `buildWeekly` + Pazar 21:00 cron zaten vardı, bu UI tarafı.)
- **🟢 Sync status dot:** brand-row'da logo yanında yeşil(pulse)/sarı/gri nokta, `aidan_lastPush`'tan hesap, hover tooltip.
- **🔕 Bildirim sustur:** Ayarlar'da 1sa/3sa/8sa. `data.settings.muteUntil` — reminderTime interval + beep susar.
- **📲 BACKGROUND PUSH (VAPID web-push) — telefon kapalıyken bile bildirim:**
  - VAPID P-256 anahtar çifti üretildi: **public koda gömülü** (`VAPID_PUBLIC_KEY` asistan.html'de, güvenli), **private Worker secret** (`VAPID_PRIVATE_KEY`)
  - Frontend: `subscribeToPush()` → `pushManager.subscribe` → subscription `data.settings.pushSubs[]`'a yazılır, Supabase'e sync olur (yeni tablo YOK)
  - Worker: **RFC 8291 aes128gcm** payload şifreleme + **RFC 8292 VAPID JWT (ES256)**, saf `crypto.subtle`, harici kütüphane YOK. `sendPushToAll()` her cron brifingini Telegram + push gönderir, ölü sub (404/410) temizler. **VAPID env yoksa sessizce atlar (Telegram bozulmaz).**
  - Şifreleme Python round-trip ile doğrulandı → **Apple push servisi HTTP 201 ile kabul ediyor (3 kez)** ⚠️ AMA Salim telefonda banner GÖRMEDİ — şüphe: iOS foreground'da banner göstermez (test sırasında uygulama açıktı) VEYA iOS Ayarlar→Bildirimler→Aidan kapalı. **Görünüm doğrulaması bekliyor** (Salim'e "Aidan'ı kapat+kilitle+bekle" testi verildi).
  - `deploy.py` secret listesine `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` eklendi
- **🔐 Token temizliği:** Worker deploy için Salim geçici token verdi (sohbette ifşa oldu) → deploy sonrası Salim Cloudflare'den sildi, `/user/tokens/verify` "Invalid" doğrulandı. GitHub Actions deploy kalan token'la çalışıyor (sw.js marker push ile teyit). **May 29 leaked token meselesi de bununla kapandı — artık tek temiz token var.**
- **Cache:** v7-1 → v7-7
- **🧠 AI'ı PWA'ya taşındı (Telegram'dan kademeli çıkışın 1. adımı):**
  - Worker'a **`POST /ai`** endpoint (`handleAiApi`): Telegram'la AYNI pipeline — `aiInterpret` + `TOOL_HANDLERS` + `saveAidan`, JSON döner. Supabase access-token auth (`verifyUser`), MVP'de sadece hesap sahibi. CORS = `aidanapp.pages.dev`.
  - Frontend: quick capture'a **🧠 butonu** (`quickCaptureAI`) — metni `/ai`'ye yollar, Worker Supabase'e yazar, realtime sync + `manualPull` ile PWA güncellenir. Sesli giriş (🎙️) + 🧠 = Telegram sesli akışının PWA karşılığı.
  - `_headers` CSP `connect-src`'e Worker URL eklendi.
  - **GitHub Actions artık Worker'ı da otomatik deploy ediyor** (`deploy.yml`'e Worker step + `aidan-worker/**` paths). Token GitHub Secrets'ta, `git push` yeter — Worker için elle deploy/token gerekmez.
  - ⚠️ **BULUNAN+DÜZELTİLEN BUG:** `deploy.py` metadata'sında `bindings` yoktu → her Worker deploy'unda **AI binding (`env.AI`) düşüyordu** (hem /ai hem Telegram AI "env.AI undefined" veriyordu). Düzeltme: metadata.bindings'e `{type:ai,name:AI}` + tüm secret'lar `{type:inherit}` (deploy'da kaybolmasın). **Artık deploy AI binding'i korur.**
  - Uçtan uca test: Supabase login → `/ai` "bugun ne yapayim" → reply döndü ✅
- **Cache:** v7-6 → v7-7 (AI butonu)
- ⏳ **Sıradaki:** Telegram'ı emekli et (AI + sesli + bildirim artık PWA'da) · multi-user (Yol A: davetli arkadaşlar)

### Haziran 3, 2026 (background push görünmeme bug'ı ÇÖZÜLDÜ)
- 🔴 Açık iş kapandı: Apple HTTP 201 alıyordu ama Salim banner göremiyordu. Sebep tek değildi, **3'lü düzeltmeyle** çözüldü:
  - **Worker:** `Urgency: normal` → **`high`** (WebKit dokümantasyonu: lock ekranı için şart, normal ertelenebilir/drop edilebilir)
  - **SW push handler savunmacı:** decrypt/parse hatasında bile `showNotification` çağırır (iOS izin iptalini önler, hata mesajı body'ye düşer → teşhis kolaylaşır). Tek showNotification per push şartı garanti altında.
  - **PWA Ayarlar'a "🔄 Push'u sıfırla" butonu:** stale subscription'ı unsubscribe + pushSubs'tan sil + fresh subscribe yapar. Push handler eklenmeden önce yapılmış eski subscription'ları kurtarır.
- **Test:** Salim Aidan kapalı + telefon kilitliyken `?type=noon&secret=...` ile manuel tetiklendi → **kilit ekranında banner ✅ çıktı**. Background push artık güvenilir.
- **⚠️ Secret rotate gerekli:** Test için sohbette geçici `WEBHOOK_SECRET` paylaşıldı (`aidan-push-test-2026-03-x9k7m2`). Salim Cloudflare → aidan-pusher → Variables → WEBHOOK_SECRET'ı yeni değerle güncelleyebilir (mecbur değil ama temiz).
- **Cache:** v7-7 → v7-8
- ⏳ **Sıradaki artık net:** Telegram'ı emekliye ayır (bildirim ✅ + AI ✅ + sesli ✅ PWA'da) → sonra multi-user (Yol A).
- 🚦 **Telegram emeklilik Faz 1 başladı (Haz 3 gece):** Salim 3 gün boyunca Telegram'a HİÇ yazmayacak, tüm etkileşim PWA'dan (🧠 AI / 🎙️ sesli / quick capture / push bildirimleri). Kod değişikliği YOK, paralel çalışıyorlar. Çıkış kriteri: 3 gün sorunsuz → Faz 2 (Worker'dan `sendTg` cron çağrısı yorum satırı yap, push tek kanal). 4 fazlı plan CLAUDE.md'de yok ama sohbet geçmişinde tartışıldı — özet: F1 deneme / F2 cron-only-push / F3 webhook-cevap-modu / F4 kod-temizliği. Her faz tek commit, `git revert` ile geri.

### Haziran 4, 2026 (Telegram EMEKLİ — F2 + F3 birleşik)
- Salim F1 (3 gün deneme) atladı, doğrudan F2 + F3'e geçildi. Push güvenilir çalışıyor, AI butonu (+ akıllı parser) ve sesli giriş PWA'da hazır → Telegram'a ihtiyaç kalmadı.
- **Tek bayrak: `TELEGRAM_RETIRED = true`** (worker.js başında). Açıp kapatmak için tek satır flip + deploy.
  - **Cron:** `runCronJob` artık `sendTg` çağırmıyor (bayrak true iken). Push tek kanal. `channel: 'push-only'` döner.
  - **Webhook:** `handleWebhook` sahibi (Salim) yazarsa tek bilgi mesajı dönüyor — "Aidan artık aidanapp.pages.dev'de, mesajın işlenmedi". AI/Whisper/tool processing YOK. Diğer kullanıcılara sessiz 200 OK.
  - Eski kod yorum satırı değil, IF altında — bayrak false dönerse normal akış geri gelir.
- **Faz 4 (kod silme) yapılmadı.** Eski Telegram pipeline aynen duruyor (`sendTg`, `transcribeVoice`, `aiInterpret`, `TOOL_HANDLERS`). Rollback risk yok.
- **Telegram bot BotFather'da hâlâ duruyor** — silinmedi. Gerek olursa bayrak çevrilir, bot tekrar canlı. Salim isterse `/deletebot` ile sonradan kapatabilir.
- **Bildirim akışı:** Sadece PWA push (web.push.apple.com) → iOS lock ekranı. Telegram bildirimleri çıkmaz.
- ⏳ Sıradaki adımlar — eksik analizi sohbetinden:
  - 🥇 Brain dump UI (Telegram'dan kaybedilen tek özellik PWA'da yok)
  - 🥈 Bildirim geçmişi (push log)
  - 🥉 Sesli akşam günlüğü (Whisper + AI özet)
  - Sonra: multi-user · borsa · onboarding
- **Cache:** v7-13 (frontend değişmedi, sadece Worker)

### Haziran 4, 2026 (gece — 3 yeni özellik + UI cilası + mobil fix)
Telegram emekliliği sonrası tek seansta çok iş yapıldı (v7-13 → v7-16):
- **🎯 Akıllı + butonu (parseQuickInput):** quick capture'da "yarın 14:00 dişçi" → AI'sız lokal regex ile tarih/saat/kategori/öncelik/süre parse. Türkçe boundary helper (JS `\b` ş/ı/ç sonunda kırılır). Telegram AI parse'ının PWA karşılığı, $0 + anında.
- **👆 Swipe gestures:** görev kartı `.task-row` içine sarıldı. Sağa = tamamla (yeşil), sola = sil (kırmızı), ikisi undo'lu. Axis detect (|dx|>|dy|*1.3), threshold 80px + direnç.
- **📝 Görev notu (task.notes):** editTask'a 2. adım (multiline prompt), kartta gri italik border-left.
- **🎨 SVG ikon refactor:** tab/quick capture/aksiyon butonu emoji'leri Lucide inline SVG. `.icon` helper (currentColor stroke). Kategori/öncelik emoji'leri (📚🔥💜) ADHD anchor olarak korundu. AI=4-uçlu simetrik yıldız, mic=sade.
- **📱 Mobil fix:** (a) yana kayma — html/body overflow-x:hidden + overscroll-behavior-x:none + touch-action:pan-y (b) iOS klavye — focusin scrollIntoView + visualViewport --kb-h.
- **🧠 Zihin boşalt (brain dump UI):** Görevler tabında katlanır panel. `data.dumps[]`, input/sesli/+ ile dök, ✓göreve çevir (parser'dan geçer) / ✗sil, badge. uniqueDumpWhen() — Date.now() çakışma bug'ı fix. **Telegram'dan kaybedilen son özellik PWA'da.**
- **📬 Bildirim geçmişi:** Worker `logPush()` her cron'da `data.pushLog[]`'a yazar (son 7 gün, max 60). PWA Ayarlar > "📬 Son 7 gün" katlanır liste (başlık + rel-zaman + gövde). "Brifing geldi mi" merakı biter.
- **🌙 Sesli akşam günlüğü:** Worker `POST /journal` (handleJournalApi) → Llama supportive yansıma (tool YOK, yargısız system prompt, biten görev sayısı context). PWA journalModal: textarea + 🎙️ Web Speech continuous (tarayıcı çevirir, Whisper'sız $0) + "Aidan'a yorumlat"/"Sadece kaydet". `data.journal[]` günde 1 upsert, son 60 gün. Akşam özeti kartında buton. AI fail olsa lokal kaydeder. ADHD decompression ritüeli.
- **Veri modeli yeni alanlar:** `task.notes`, `data.pushLog[]`, `data.journal[]`
- **Cache:** v7-13 → v7-16

### Haziran 6, 2026 (📈 Borsa modülü — 4. sekme)
- **Veri kaynağı doğrulandı:** Yahoo Finance bedava API (`query1.finance.yahoo.com/v8/finance/chart/THYAO.IS`) — API key YOK, BIST + ABD + döviz + kripto hepsi. THYAO=297 TRY, AAPL=307 USD, USDTRY=46 test edildi. CORS yüzünden tarayıcı direkt çekemez → **Worker proxy**.
- **Kararlar (Salim):** 4. sekme (Görevler/Odak/**Borsa**/Ayarlar), watchlist+alarm full paket, şimdilik sadece BIST.
- **Worker:**
  - `POST /stocks` (`handleStocksApi`) — `{symbols:[...]}` → Yahoo'dan paralel çek, `[{symbol,price,prevClose,changePct,currency,name}]`. Auth (verifyUser), CORS. `bistSymbol()` yalın koda `.IS` ekler (THYAO→THYAO.IS). Cache 60sn.
  - `runStockCheck()` cron — watchlist fiyat kontrol, `alarmAbove`/`alarmBelow` eşik geçilince push + `lastAlertedAbove/Below` ile spam önler (fiyat geri dönünce reset).
  - **Yeni cron:** `*/30 7-15 * * 1-5` (BIST saatleri 10-18 TR, hafta içi) → deploy.py + wrangler.toml. scheduled() bu cron'u runStockCheck'e yönlendirir. Manuel test: `?type=stocks&secret=...`.
- **PWA:**
  - 4. sekme 📈 Borsa (trending-up SVG). `data.watchlist[]`.
  - Hisse ekle (sembol input), fiyat kartı (sol border + %değişim yeşil/kırmızı), Yenile (spin), alarm kur (üst/alt eşik aidanPrompt), sil. Sekme açılınca 2dk+ eskiyse auto-refresh.
  - Mobilde 4 tab tek satıra sığdırıldı (`.tab` padding/font/icon küçült, flex:1, nowrap).
- **Veri modeli:** `data.watchlist[] = [{symbol,name,price,prevClose,changePct,currency,alarmAbove,alarmBelow,lastAlertedAbove,lastAlertedBelow,fetchedAt,error}]`
- **Cache:** v7-16 → v7-17

### Haziran 6, 2026 gece (📈 Borsa portföyü — adet + maliyet + kâr/zarar)
- Watchlist artık portföy: her hisseye `qty` (adet) + `cost` (ortalama maliyet) eklenebilir (opsiyonel, "Pozisyon" butonu)
- Kart içi pozisyon satırı + üst "💼 Portföy değeri" özet kartı (toplam değer, kâr/zarar TL+%, maliyet, pozisyon sayısı)
- Bug fix: edit sırasında duplike `function addTask() {` oluşmuş, script'i kırıyordu — node yoktu, py+regex ile bulunup temizlendi
- **Veri:** `watchlist[i].qty`, `watchlist[i].cost`
- **Cache:** v7-17 → v7-18

### Haziran 8, 2026 (📈 Borsa — ABD / Döviz / Kripto desteği)
- Roadmap'teki sıradaki adım uygulandı: watchlist artık sadece BIST değil, **4 piyasa**:
  - 🇹🇷 **BIST** → `.IS` suffix (THYAO → THYAO.IS)
  - 🇺🇸 **ABD** → suffix yok (AAPL, TSLA doğrudan Yahoo sembolü)
  - 💱 **Döviz** → `=X` suffix (USDTRY → USDTRY=X)
  - ₿ **Kripto** → `-USD` suffix (BTC → BTC-USD)
- **PWA:** Borsa sekmesinde hisse eklemenin üstüne 4 "market chip" (🇹🇷🇺🇸💱₿) — seçilen piyasaya göre placeholder örnekleri değişir (`MARKET_PLACEHOLDERS`). `toYahooSymbol(sym, market)` kullanıcı girdisini doğru Yahoo sembolüne çevirir, watchlist kaydına `ySymbol` + `market` alanları eklenir. Kart üstünde küçük market rozeti (BIST hariç).
  - `legacyYSymbol(w)` — eski kayıtlarda (`ySymbol` yok) geriye dönük .IS varsayımıyla fallback üretir.
- **Çoklu para birimi portföy özeti:** `renderPortfolioSummary` artık para birimine göre gruplar — tek para varsa eski büyük kart görünümü, birden fazla varsa (TRY+USD gibi) her biri ayrı satır (`pf-cur-row`). Kur karışıklığı/yanıltma önlendi.
- **Worker:** `/stocks` endpoint'i yeni `{entries:[{display,yahoo}]}` formatını kabul ediyor (PWA artık Yahoo sembolünü kendi hesaplayıp yolluyor); eski `{symbols:[...]}` formatı geriye dönük uyum için duruyor (`bistSymbol` ile çevrilir, hep BIST varsayar). `fetchStockQuotes` hem yeni hem eski formatı işler. `runStockCheck` cron'u her hisse için `w.ySymbol || bistSymbol(w.symbol)` kullanır.
- **Veri modeli:** `watchlist[i].ySymbol` (Yahoo Finance API sembolü), `watchlist[i].market` (`'bist'|'abd'|'fx'|'crypto'`)
- **Cache:** v7-18 → v7-19

### Haziran 8, 2026 (📷 Görselden portföy — AI vision)
- Salim istedi: aracı kurum uygulamasının **portföy ekran görüntüsünü** atınca AI okuyup hisseleri otomatik eklesin.
- **Worker:** `POST /portfolio-image` (`handlePortfolioImageApi`) — base64 görseli **Cloudflare Workers AI vision modeline** (`@cf/meta/llama-3.2-11b-vision-instruct`, bedava) verir. Prompt: her satır için `symbol/qty/cost/market` JSON iste. Auth (verifyUser + AIDAN_EMAIL), CORS. `base64ToBytes` (image: number[] formatı), `extractHoldingsJson` (markdown/çer-çöp toleranslı parse, sayı+market doğrulama, max 40 satır). Görsel ~6MB sınırı.
- **PWA:** Borsa sekmesinde hisse eklemenin altında **"📷 Ekran görüntüsünden portföy ekle"** butonu (dashed accent). `<input type=file accept=image/* capture>` → `resizeImageToDataUrl` canvas ile max 1280px jpeg'e küçültür (yükleme küçük) → Worker'a yollar.
  - **Onay modalı** (`portfolioImportModal`): AI'nın bulduğu varlıklar **düzenlenebilir satırlar** (sembol/adet/maliyet input + piyasa select + sil). Vision hata yapabilir → kullanıcı düzeltip onaylar. `confirmPortfolioImport` watchlist'e ekler/günceller (varsa qty+cost update, yoksa yeni + `toYahooSymbol`), sonra `refreshStocks`.
  - `_pfImportHoldings` geçici liste, `updatePfImport`/`removePfImport` ile düzenlenir.
- **CSP:** Değişiklik gerekmedi — `img-src` zaten `data: blob:` (canvas), `connect-src` Worker'ı içeriyor.
- **Veri modeli:** Yeni alan yok — mevcut `watchlist[i].qty/cost/symbol/ySymbol/market` kullanılıyor.
- **Cache:** v7-19 → v7-20
- ⚠️ **Test bekliyor:** Vision modelin Türkçe aracı kurum ekranlarında OCR doğruluğu bilinmiyor (ilk deneme). Onay modalı yanlışlara karşı güvenlik ağı. Salim gerçek ss ile deneyecek.
- ⏳ Sıradaki: auto-archive · çoklu kategori · multi-user (Yol A) · ölü field temizliği · Faz 4 Telegram kod silme.

## Mevcut Durum

### ✅ Çalışıyor
- iPhone + PC PWA, otomatik senkron (`aidanapp.pages.dev`)
- **Stitch-inspired tasarım v7-1** canlıda — indigo accent, mor bulut mascot logo
- Supabase auth + realtime sync + **RLS test edildi/doğrulandı**
- MCP server Claude Desktop'a bağlı
- **GitHub Actions otomatik deploy** — her `git push` Cloudflare Pages'e gider (`.github/workflows/deploy.yml`)
- Manuel deploy alternatifi: `py aidan-pages-deploy.py` → 5 sn canlı
- Cloudflare Worker 4 cron schedule
- Telegram bot iki yönlü (yazılı + 🎤 sesli)
- Llama 3.3 70B intent + tool use
- Whisper sesli → metin
- Ödev serisi + yeniden dengele
- Network-first SW
- Pages 8 security headers canlıda (CSP/HSTS/X-Frame/COOP/Permissions-Policy/Referrer/X-Content-Type/X-XSS)

### 💰 Maliyet
**$0/ay** — hepsi free tier:
- Cloudflare Pages: sınırsız bandwidth + 500 build/ay (Direct Upload kullanıyoruz, build limiti tüketmiyor)
- Supabase: free
- Cloudflare Workers: 100K istek/gün
- Cloudflare Workers AI: 10K neuron/gün
- Telegram Bot: sınırsız bedava
- Netlify: ❌ kullanılmıyor (kota tükendi)
- ntfy: ❌ kullanılmıyor

## Önemli Kararlar

- ❌ **Şifreleme yok** (master password) — karmaşıklık, unutma riski
- ❌ **Magic link bıraktık** — redirect URL sorunları
- ✅ **Email+şifre auth** — basit, dayanıklı
- ✅ **localStorage + cloud sync** — Supabase'e debounced push, realtime pull
- ✅ **MIT 3 limit kasıtlı** — ADHD beyni 3'ten fazlasında dağılır
- ❌ **Streak feature kaldırıldı (May 26)** — sadece daily için, stres kaynağı
- ❌ **Mood feature kaldırıldı** — Salim kullanmıyordu
- ❌ **Hyperfocus uyarısı kaldırıldı (May 26)** — sessiz başarısız oluyordu
- ❌ **Brain Dump + Rutinler tab kaldırıldı (May 26)** — Telegram/Worker zaten yapıyor
- ❌ **Hafta takvimi kaldırıldı (May 26)** — ADHD'nin sevmediği grid
- ❌ **Body Doubling reddedildi** — sahte sesler değer katmadı
- ✅ **Telegram tek bildirim kanalı** — ntfy free tier güvensiz, Telegram sınırsız
- ✅ **Llama (bedava) > Claude API ($5/ay)** — ilk versiyonda yeterli. İleride hibrit olabilir.
- ✅ **Auto-deploy ZORUNLU** — Salim drag-drop ile Netlify credit yakıyordu
- ✅ **Network-first SW** — cache vs deploy çatışmasını kalıcı çözdü
- ✅ **Düşük öncelik kaldırıldı** — Normal + Acil yeter, decision paralysis önler
- ✅ **2dk dene butonu** — task initiation altın kuralı
- ✅ **Stitch-inspired tasarım dili (May 29)** — Google Stitch mockup → CSS, indigo+amber paleti, sade kart yapısı. Mevcut JS hiç değişmedi, sadece görsel.
- ✅ **Mascot logo: mor bulut karakter (May 29)** — Recraft AI üretimi, Salim seçti. 3 varyant `logo-concepts/`'te yedek.
- ✅ **GitHub Actions otomatik deploy (önce vardı, May 29 cementli)** — `git push` yeter, drag-drop ya da manuel `py deploy.py` gereksiz.
- ⏳ **Hibrit AI (Llama + Claude)** — kullanım sonrası karar
- ⏳ **Borsa modülü** — Salim "sona, daha detaylı" dedi, planlanmadı
- ⏳ **Native app yok** — PWA yeterli

## Kullanıcının Üslubu

- "Süper", "tamam oldu" tarzı kısa onaylar
- Hata mesajlarını tam aktarır
- Türkçe yazıyor, Türkçe cevap istiyor
- Yorulduğunda "boşa token harcanmasın" gibi pragmatik notlar
- "Sıkmadan", "fazlalıklar neler" gibi sade/keskin sorular
- "sen ne dersin / en uygunu ne sence" → öneri yap, tek seçenekle git, gerekçeyi söyle
- Aynı şeyi 2 kere açıklatma — anladıysa kestir

## Yanıtlama Tarzı

- **Kısa, eylem odaklı** yanıtlar
- **Numaralı adımlar** + emoji başlıklar + tablo
- "Şuraya tıkla, şunu yaz" netliği
- Onun yapamayacağı şeyleri (kod) ben yapıyorum, yapabileceği şeyleri (browser tıklamaları) ona anlatıyorum
- ADHD friendly: uzun duvarlar yerine parçalı bilgi
- Verdiğim her uzun kılavuzdan sonra "şimdi 1. adımı yap, bittiğinde söyle"
- **TaskCreate/Update** kullan (Salim'in görmesi için)
- **AskUserQuestion** tek karar gerekiyorsa kullan
- Her büyük değişiklikten sonra `sw.js` cache versiyonunu artır

## Deploy Süreci (GitHub Actions otomatik — varsayılan)

1. Ben dosyaları düzenliyorum
2. `sw.js` cache versiyonunu artırıyorum (örn `v7-1` → `v7-2`)
3. `git add <changed-files> && git commit -m "..." && git push`
4. **GitHub Actions** `.github/workflows/deploy.yml` push'u yakalar (asistan.html, sw.js, manifest, icon.*, deploy.py, workflow değişince tetiklenir)
5. Workflow Python kurar, `httpx` install eder, `py aidan-pages-deploy.py` çalıştırır (~30sn-2dk)
6. `https://aidanapp.pages.dev/` canlı
7. Telefonda + bilgisayarda PWA: yeni SW otomatik aktif olur, toast "🔄 güncellendi" çıkar, sayfa yenilenir
8. Doğrulama: `curl -s https://aidanapp.pages.dev/sw.js | head -1` → yeni cache versiyonunu göster

### Manuel deploy (yedek, token elinde varsa)
```bash
export CF_API_TOKEN=<token> CF_ACCOUNT_ID=dd37c3eb3e7fbab35ee16f1a6db4cce1
py aidan-pages-deploy.py
```

⚠️ Netlify ve drag-drop yöntemi artık **GEREKSİZ**. Salim'e söyleme bile, otomatik akıyor.

## Test Edilmesi Gereken

- 🐛 Telegram sesli mesaj — gürültülü ortamda Whisper başarısı?
- 🐛 Llama 3.3 70B kompleks komutlarda (örn "salı 3 sınav var planla") doğruluk?
- 🐛 Worker cron'ları gerçekten 08:00 TR'de fire ediyor mu? (yarın sabah doğrulanacak)
- 🐛 Mobil görev kartında 4 buton sığıyor mu
- 🐛 "Şu an ne yapayım" modal'ı bilgisayarda ESC ile kapanıyor mu

## Yol Haritası

### Şu an (Mayıs 25-26)
- ✅ Telegram bot iki yönlü kuruldu
- ✅ Sesli mesaj
- ⏳ Salim kullanacak, kullanım sonrası ne eksik anlayacağız

### Sonra (sıradaki feature)
- ✅ **Borsa modülü** — BIST + ABD + Döviz + Kripto watchlist, fiyat alarmı, portföy (Haz 6-8'de tamamlandı)
- 🎯 **Akıllı MIT öneren** — sabah AI bugünün 3'ünü öner (geçmiş + saat)
- 📊 **Haftalık review** — pazar 21:00 AI "bu hafta nasıl geçtin"
- 🔄 **Seri otomatik dengeleme** — atlanan gün varsa yeniden böl
- 🧹 **Pomodoro trend grafik sil** (gereksiz)
- 🧹 **Rutinler sekmesi Worker'a taşı** (UI'da yer kaplıyor)

### İleride opsiyonel
- True custom tekrar (Pzt-Çar-Cum checkbox)
- Görev sürükle-bırak sıralama
- Hibrit AI (Llama + Claude fallback zor durumlar için)
- ChatGPT-tarzı uzun bağlamlı sohbet (Telegram'da)

## Veri Modeli — Görev objesi

```js
{
  id: Date.now(),
  text: 'Görev metni',
  done: false,
  doneDate: null,             // 'YYYY-MM-DD'
  subtasks: [{text, done}],
  created: 'tr-TR locale string',
  priority: 'normal',         // 'urgent' | 'normal' | 'low'
  category: null,             // 'odev' | 'ev' | 'kisisel'
  due: null,                  // 'YYYY-MM-DD'
  estimateMin: null,
  actualMin: null,
  repeat: null,               // 'daily' | 'weekly' | 'weekdays' | 'weekends'
  reminderTime: null,         // 'HH:MM'
  lastReminded: null,         // 'YYYY-MM-DD'
  mitDate: null,              // 'YYYY-MM-DD' (sadece bugün ise MIT)
  streakCount: 0,
  lastStreakDate: null,       // 'YYYY-MM-DD'
  // Seri alanları (NEW):
  seriesId: null,             // string, aynı serideki görevler aynı id
  seriesName: null,           // 'Tarih kitabı'
  seriesIndex: null,          // 1, 2, 3...
  seriesTotal: null           // toplam parça sayısı
}
```

## Veri Modeli — data root (localStorage 'aidan' = Supabase row.data)

```js
{
  tasks: [...],
  dumps: [{text, when}],
  routines: [{id, time, name, lastFired}],
  checkins: [...],            // DEPRECATED ama silmedik (geriye uyumluluk)
  pomoToday: {date, count},
  pomoHistory: {'YYYY-MM-DD': count},
  templates: [{id, name, emoji, builtin, tasks:[{text,category?,estimateMin?}]}],  // NEW (Haz 2) — kullanıcı şablonları
  lastWeeklyView: 'YYYY-Www', // NEW (Haz 2) — haftalık insight kartı son gösterim (ISO hafta)
  settings: {
    ntfyTopic,                // DEPRECATED
    hyperfocusEnabled, hyperfocusMin,
    supaUrl, supaKey,         // Aidan'ın kendi Supabase config'i
    muteUntil,                // NEW (Haz 2) — bildirim sustur (epoch ms)
    pushSubs: [{endpoint, keys:{p256dh,auth}, ua, added}]  // NEW (Haz 2) — background push cihaz kayıtları
  }
}
```

## Hızlı Komutlar (yeni sohbette başlangıç için)

```bash
# Aidan deploy (GitHub Actions otomatik — varsayılan)
cd /c/Users/Salim/Desktop/claudedeneme
git add asistan.html sw.js  # neyi değiştirdiysen
git commit -m "..."
git push                     # ~30sn-2dk içinde canlı

# Manuel deploy (yedek, token elinde varsa)
export CF_API_TOKEN=<token> CF_ACCOUNT_ID=dd37c3eb3e7fbab35ee16f1a6db4cce1
py aidan-pages-deploy.py

# Logo değiştirme (logo-concepts'ten birini aktif et)
cp logo-concepts/logo-1-flat.png icon.png   # ya da -2-refined / -3-3d
py logo-concepts/make_icons.py              # maskable yeniden üret
# sonra: sw.js cache version artır + git push

# Worker manuel test
curl "https://aidan-pusher.fenerlisalim04.workers.dev/?type=morning&secret=<WEBHOOK_SECRET>"

# Aidan'ın live durumu kontrol
curl -sI "https://aidanapp.pages.dev/" | grep -i "content-security-policy"
curl -s "https://aidanapp.pages.dev/sw.js" | head -1  # cache versiyonu

# Telegram webhook info
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

## Yeni Sohbet Başlıyorsa — Önce Bunları Yap

0. ✅ **Background push ÇÖZÜLDÜ (Haz 3):** Salim kilit ekranında banner gördü, doğrulandı. Düzeltme = Urgency `normal→high` + SW push handler savunmacı + "Push'u sıfırla" butonu. Artık Telegram emekliliğine engel YOK.
1. **Salim'in test sonuçlarını sor**: 🧠 AI butonu (PWA quick capture) çalıştı mı (görev ekledi mi)? Yeni özellikler (undo / şablon / energy / sesli giriş / sync dot) nasıl gidiyor?
2. **PWA'yı yeni URL'den yükledi mi?** (`aidanapp.pages.dev`) — eski Netlify URL'i ölü
3. **Sıradaki feature** (öncelik sırası):
   - 🥇 **Brain dump UI** — Telegram emeklilikten kaybedilen tek özellik PWA'da yok. `data.dumps` field zaten var. "Aklıma X geldi" hızlı ekle + liste.
   - 🥈 **Bildirim geçmişi** — Worker push gönderirken Supabase'e log, PWA'da "📬 Son 7 gün" listesi. "Sabah brifingi geldi mi gelmedi mi" merakı kalmasın.
   - 🥉 **Sesli akşam günlüğü** — Gün sonu konuş, Whisper text'e, AI özetle. ADHD decompression ritüeli.
   - **Multi-user (Yol A: davetli arkadaşlar)** — Worker tek `AIDAN_EMAIL`'e bakıyor → tüm aidan_data satırlarını dolaş, davet kodu, email onayı. Background push zaten multi-user uyumlu.
   - ✅ **Borsa modülü TAMAMLANDI** (Haz 6-8) — BIST+ABD+Döviz+Kripto watchlist, alarm, portföy (adet+maliyet+kâr/zarar). Sıradaki: auto-archive · çoklu kategori · ölü field temizliği.
   - **Faz 4 (Telegram kod temizliği)** — Multi-user oturduktan sonra `sendTg`/`transcribeVoice`/`aiInterpret`/Telegram tool'ları silinir. Hangisinin sadece Telegram'a özel olduğunu bilmek için: `if (!TELEGRAM_RETIRED)` altında olanlar.
4. ⚠️ **Netlify / drag-drop deploy ASLA önerme** — `git push` → GitHub Actions otomatik deploy var
5. ⚠️ **ntfy.sh'tan asla bahsetme**, Telegram bot kullanılıyor
6. ⚠️ **Mood/check-in'den bahsetme**, kaldırıldı
7. ✅ **Token durumu temiz (Haz 2)** — May 29 leaked + geçici deploy token'ları silindi, GitHub Actions tek temiz token'la (GitHub Secrets `CF_API_TOKEN`) çalışıyor. Yeni token ifşa olursa yine sildirip doğrula (`/user/tokens/verify`).
8. ✅ **Worker deploy GitHub Actions'ta** — `.github/workflows/deploy.yml` Pages + Worker'ı birden deploy eder (`aidan-worker/worker.js` veya `aidan-worker/deploy.py` değişince tetiklenir). Token GitHub Secrets'ta, `git push` yeter. Manuel `py aidan-worker/deploy.py` sadece acil/yedek (Windows'ta `PYTHONIOENCODING=utf-8` şart). **CLAUDE.md eski versiyonunda "Worker DEĞİL" yazıyordu, AI taşıma sonrası güncellendi.**
9. ⚠️ **Background push (Haz 3 itibarıyla çalışıyor):** Apple lock ekranına ulaşması için 3 şart birden gerekli: (a) Worker `Urgency: high` (b) SW push handler her halükarda `showNotification` çağırmalı (iOS aksi halde izni iptal eder) (c) subscription fresh olmalı (eski SW'lerde oluşturulmuş subscription'lar bozuk). Sorun çıkarsa: Salim Ayarlar'dan "🔄 Push'u sıfırla" → manuel cron tetikle (`?type=noon&secret=<WEBHOOK_SECRET>`). subscription Supabase'de `data.settings.pushSubs[]`'ta.
10. ⚠️ **Tasarım dili Stitch-inspired** — renkler `#6463ff` indigo, `#0a0b0f` koyu, `#ffc640` amber. Eski mor `#7c6ff7` ve emoji 🧠 logo YOK. Brand-logo-icon = mor bulut karakter PNG. Cache artık **v7-19**.
11. ⚠️ **Logo değiştirmek istenirse** `logo-concepts/logo-{1,2,3}-{flat,refined,3d}.png`'den biri `icon.png` üzerine kopyalanır, `make_icons.py` ile maskable yenilenir, push edilir.
