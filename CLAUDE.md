# Aidan - ADHD Asistanı Projesi

## 🔴 GÜNCEL DURUM — son seanslar (eski tarihçe: CHANGELOG.md)

Aşağıdaki tarihçe/mimari bölümleri 14 Haziran'da kaldı. O günden bugüne (cache **v7-88**) olan büyük değişiklikler:

- **Mimari refactor:** `asistan.html` artık tek dosya DEĞİL. Kod 5 modüle bölündü, asistan.html şu sırayla yüklüyor: `supabase.js` → `core.js` (diyet) → `tasks.js` (sekme yönetimi / gün planı / quick-capture / journal / dump) → `stocks.js` (borsa) → `ui.js` (görev render / timer / ayarlar / auth / takvim / chat). `app.js` = ESKİ birleşik bundle, artık YÜKLENMİYOR — dokunma/düzenleme, modülleri düzenle.
- **⚠️ DÜZENLEME KURALI (bu seansta doğrulandı):** Büyük dosyalarda Edit aracı riskli + sandbox `rm` izni YOK (ama `mv` var). Düzenlemeleri **Python byte-replace + `node --check`** ile yap; **.bak dosyası OLUŞTURMA** (silinemiyor, `rm ... || mv bak orig` rollback bloğu ters tepip düzenlemeyi geri alıyor). Rollback gerekirse `git checkout <dosya>`.
- **Diyet modülü dev büyüdü:** barkod tarayıcı (`html5-qrcode` self-host + Open Food Facts), Türk gömülü besin DB (`seedFoodMatches`), USDA+AI arama, özel besinler (`customFoods`), tarifler, takviye takibi, BMR/TDEE kalori hesaplayıcı (`calcGoals`), çoklu + haftalık program, makro donut/bar, gün kopyala. (OFF Türk yerel/market-markası ürünü ıskalayabilir → elle giriş + AI + Türk seed DB fallback var.)
- **Borsa modülü dev büyüdü:** hisse haber akışı (`loadStockNews`) + 15 göstergeli tam teknik analiz (RSI/MACD/Bollinger/ADX/OBV/Stoch/ATR...) + mum grafik + Fibonacci + AI taktik analiz + BIST100 kıyas.
- **Görev/Plan:** günü planla / zaman bloklama (`planMyDay`), takvim ICS sync (`createCalendarLink`), AI sohbet (`sendChat`), diyet karnesi.
- **AI modeli:** Llama 3.3 70B → **Llama 4 Scout** (git commit: "llama 4 scout update").
- **Cache:** `sw.js` = **aidan-v7-88**.

### 10 Temmuz 2026 — aralıklı takviye hatırlatıcısı + günlük skor kartı (modüller arası bağ)
- **⏰ Aralıklı hatırlatıcı:** Salim'in uyku düzeni değişken → takviye için tek saat yerine **aralık + periyot**. Takviye ekleme formunda "Tek saat / Aralıklı" chip'i; aralıklı: başlangıç–bitiş saati + sıklık (30dk/1sa/2sa/3sa). Veri: `data.reminders[i]` yeni alanlar `mode:'interval'`, `startTime`, `endTime`, `everyMin`. Worker `runFixedRemindersForUser`: slot mantığı (`lastFired='YYYY-MM-DD@slotDk'`, slot başına 1 push, >30dk eski slot atlanır, **gece yarısını aşan aralık desteklenir** örn. 22:00–02:00). 17 senaryo node testi geçti.
- **🧩 Günlük skor kartı:** Görevler tabı üstünde `#dailyScore` (nowCard altı) — MIT x/y · kcal yenen/hedef · su L · odak seans. Hedef tutan hücre amber tint (`.score-item.on`). Veri yoksa gizli. `renderDailyScore()` ui.js'te, renderTasks başında + showTab('tasks')'ta çağrılır.
- **📊 Sabah push dün özeti:** Worker `buildDailySummaryLine` — "Dün: ✓ N görev · kcal · su" satırı morning payload sonuna eklenir (AI + fallback ikisinde de çalışır, odak dahil edilmedi — pomoToday dünü güvenilir tutmaz).
- Cache v7-96 → **v7-97**.

### 10 Temmuz 2026 — 4. seans: 🎓 Classroom görsel köprüsü + çoklu portföy görseli
- **Classroom neden görsel:** Salim'in okul Google hesabı OAuth/API + takvim `.ics` beslemesine **yönetici düzeyinde kapalı** (OAuth Playground bile "kuruluş devre dışı bıraktı" dedi). Otomatik senkron imkânsız → borsa portföy-görsel deseniyle **ekran görüntüsü köprüsü**.
- **Worker `/classroom-image`:** iki aşama (vision OCR transkript → 70B metin modeli yapılandırma). `extractClassroomJson` → `{title, due, course}`. Tarih çözümü: bugünün tarihi + gün adı prompt'a verilir, "Yarın/Cuma/12 Tem" → tam `YYYY-MM-DD` (geçersizse null). `verifyUser`+`allowUser`+CORS, `AI_MODEL`/`VISION_MODEL` mevcut sabitler.
- **Frontend (ui.js):** Görevler→Okul bölümüne "Classroom ödevi ekle (ekran görüntüsü)" butonu + `handleClassroomPhoto` (resize→endpoint) + `classroomImportModal` düzenlenebilir onay (başlık/son tarih/ders). `confirmClassroomImport` → `makeTask({category:'odev'})`, ders→`notes`; **aynı başlık+tarih aktif görevde varsa atla** (tekrar görüntüde çift olmaz). 16 senaryo node testi.
- **📷 Çoklu portföy görseli (stocks.js):** `portfolioPhotoInput`'a `multiple`; `handlePortfolioPhoto` artık dosya dizisini döngüyle okur, `mergePortfolioHoldings` sembol bazında birleştirir (ilk dolu alan korunur, sonrakiler eksikleri doldurur). 8 senaryo node testi.
- **📷 Çoklu Classroom görseli (v7-102):** sayfalarca ödev → `classroomPhotoInput`'a `multiple` + `handleClassroomPhoto` döngü + `mergeClassroomItems` (başlık+tarih anahtarıyla çakışan görselleri tekilleştirir; aynı başlık farklı tarih = ayrı ödev; eksik ders bilgisi doldurulur). 6 senaryo node testi.
- Cache v7-99 → **v7-102**.

### 10 Temmuz 2026 — 3. seans: "Aidan'ın notu" (çapraz-modül tek dürtü)
Salim "modülleri bağla" yönünü seçti. Skor kartı sayı gösteriyor ama yorumlamıyordu → skor kartının altına (`#aidanNote`) **tek satır akıllı dürtü**: tüm modülleri (görev/geri sayım/MIT/takviye/su/odak/erteleme) okuyup **en önemli tek sinyali** nazik dille söyler (ADHD: tek şeye indir). Salim bir şeyi halledince not sonrakine kayar (canlı).
- **`aidanNoteLine()` (ui.js):** öncelik sırasıyla ilk eşleşen döner — (1) gecikmiş acil görev (2) geri sayım ≤2 gün (3) MIT seçili+öğleden sonra hiç bitmemiş (4) takviye 3+ gün atlandı (`suppMissedStreak` helper) (5) akşam+su yarının altında (6) öğleden sonra odak seansı yok+MIT bekliyor (7) 3+ ertelenen görev (8) akşam her şey tamam→pozitif. Saat-duyarlı, yerel/kural tabanlı (AI maliyeti YOK, anında).
- **`renderAidanNote()`** `renderDailyScore()` başında çağrılır (skor boş dönse bile çalışır). **Impeccable:** renkli emoji YOK — tek tutarlı sparkles SVG + tona göre tam-kenar tint (urgent=danger / warn=amber / good=success / info=nötr), yan-şerit yok.
- Veri modeli yeni alan YOK — mevcut task/countdown/reminder/diet/pomoToday'den türetilir.
- Doğrulama: 14 senaryo node testi (öncelik sırası + saat filtreleri) + preview mobil 375px (urgent/warn/good tint görsel, konsol temiz).
- Cache v7-98 → **v7-99**.

### 10 Temmuz 2026 — 2. seans: "Geçmiş hafızası" (takviye uyum şeridi + odak günlüğü)
Tespit: skor kartı/sabah özetinin altındaki veri tek günlüktü — takviye `takenDate` üzerine yazılıyordu, odak `pomoToday` sadece bugünü tutuyordu. Paket:
- **💊 Takviye geçmişi:** `markSuppTaken` artık `r.takenLog[]` tutar (son 30 gün, `takenDate` geriye uyumlu senkron). `suppTakenOn(r,d)` helper. Takviye satırında **son 7 gün nokta şeridi** (`suppLast7`): dolu=alındı, boş=alınmadı, soluk `na`=kapsam dışı (hafta içi takviyesinde hafta sonu + `r.id` epoch'undan türetilen oluşturma tarihi öncesi). Nötr gösterim — streak DEĞİL (streak stres kaynağıydı).
- **🎧 Odak günlüğü:** `data.focusDays{'YYYY-MM-DD':n}` (son 60 gün) — `logFocusDay()` ui.js'te, pomodoro bitişinin 2 noktasında (tickTimer + restoreTimerState "uzakta bitti").
- **🧩 Skor kartına 5. hücre:** takviye x/y (bugüne uyan aktifler; hafta içi olanlar hafta sonu sayılmaz). kcal hücresi format değişti: değer=yenen, etiket=`/hedef kcal` (5 hücrede taşıyordu). CSS: `:has(> :nth-child(5))` daraltma + kcal `flex:1.6`.
- **📊 Sabah push "Dün" satırına** odak seansı + `💊 x/y takviye` eklendi (worker `buildDailySummaryLine`, focusDays+takenLog'dan; sıfır değerler yazılmaz — utanç değil bilgi).
- **Veri modeli yeni:** `data.focusDays{}`, `reminders[i].takenLog[]`.
- Doğrulama: 25 senaryo node testi + preview'da mobil 375px görsel test (şerit, toggle, 5 hücre, konsol temiz). ⚠️ Preview'da SW cache'i taze modülü gizleyebilir — `serviceWorker.getRegistrations()→unregister + caches.delete` sonrası reload ile test et.
- Cache v7-97 → **v7-98**.

### 7 Temmuz 2026 — elle eklenen besin otomatik "Kendi besinlerim"e kaydolsun
Salim: barkod/OFF yerel Türk ürününü ıskalayınca paket arkasından elle makro giriyorum, bir daha sormasın. **`core.js` `addMeal()`:** kcal girildiyse öğün eklenirken besin otomatik `data.diet.customFoods`'a upsert edilir (ad ile dedupe — varsa makroları günceller, yoksa ekler), toast "eklendi · besinlerine kaydedildi". Elle sekmesinde protein/karb/yağ girişi (`mealP`/`mealC`/`mealF` inputları) zaten vardı. İkinci sefer arama kutusuna adı yazınca "Kendi besinlerim" altında tek tıkla gelir. Cache v7-87 → v7-88.

---


## ⚙️ Oturum Kuralı
- Aksi söylenmedikçe tüm dokümantasyon/dosya düzenleme işlemleri bu dosya (`CLAUDE.md`) üzerinden yürütülür.
- **Gerekmedikçe bu dosyayı güncelleme komutu verilmez** — sadece önemli mimari/özellik/karar değişikliklerinde güncellenir, küçük/geçici detaylar için değil.

## 🤖 Orkestratör Kuralı (10 Temmuz 2026 — KALICI)
Her görevde şu akış uygulanır:
1. **Önce karmaşıklığı değerlendir.**
2. **Basit iş** (boilerplate yazımı, küçük düzenlemeler, test, dokümantasyon) → Agent tool ile **claude-sonnet-5** subagent'a devret (`model: "sonnet"`).
3. **Derin akıl yürütme, mimari karar, karmaşık debug** gerektiren iş → ana model (Fable) kendisi tam güçle yapar.
4. Ucuz modelin halledebileceği işe asla full Fable reasoning harcanmaz.
5. **Her seferinde hangi modelin seçildiği ve nedeni tek satırla açıklanır.**
- ⚠️ İstisna: iş o kadar küçükse ki subagent'a bağlam aktarmak işin kendisinden pahalıysa (tek satır düzenleme, cache bump gibi), inline yapılır — yine tek satır gerekçeyle.

## 🎨 Tasarım Standardı — "Impeccable" (KALICI / ZORUNLU)
Salim'in talebi (Haz 13): **Tüm UI/arayüz işlerinde Impeccable framework standardında çalış.** Tam framework `C:\Users\Salim\Downloads\impeccable-main\` içinde açılı (OpenAI-format skill: `.agents/skills/impeccable/SKILL.md` + `reference/*.md`). Yeni bir UI işine başlamadan önce `SKILL.md` + register referansı `reference/product.md` (Aidan app UI = "product register") okunmalı. Aşağıdaki kurallar her arayüz kodunda İSTİSNASIZ uygulanır:

1. **Yasaklı AI alışkanlıkları:** mor/neon gradyan YOK, glassmorphism (cam/`backdrop-filter: blur`) YOK, gereksiz parlama/glow YOK, gradient-text YOK.
2. **MUTLAK YASAK — yan-şerit kenarlık:** `border-left`/`border-right` >1px renkli accent (kart/liste/callout/toast'ta) ASLA. Bunun yerine **tam kenar + arka plan tinti + leading dot/ikon**. (Aidan'ın eski görev/borsa/plan/toast kartları hep bunu yapıyordu → v9'da temizlendi.)
3. **Tipografi:** Inter/Roboto/Arial/sistem-varsayılanı gibi aşırı kullanılmış fontlar YOK — karakterli modern fontlar. **Product UI'da tek font ailesi doğru**; iki benzer grotesk eşleştirme YOK; **UI label/buton/data'da display font YOK**. Hiyerarşi boyut + **kalınlık + renk tonu** ile. Çok küçük metinden kaçın (≥4.5:1 kontrast).
4. **Renk/kontrast:** saf `#000`/`#fff` YOK — renkler hafif tonlanır. Renkli zemine asla gri metin. WCAG AA (gövde ≥4.5:1, büyük ≥3:1). Restrained palet: accent yalnız aksiyon/seçim/durum için, dekor için DEĞİL.
5. **Düzen/boşluk:** her şeyi zorla ortalama YOK; kart tembel cevaptır, **iç içe kart kesinlikle YOK**; kart radius 12–16px (32px+ YOK). 8pt grid, monoton-olmayan ritim.
6. **Mikro etkileşim:** bounce/elastik YOK; ease-out (quart/quint/expo), 150–250ms, durum bildiren hareket. `prefers-reduced-motion` alternatifi zorunlu.
7. **Product ban:** standart affordance'ları yeniden icat etme — **özel scrollbar YOK**, garip form kontrolü YOK, "modal ilk düşünce" YOK (önce inline/progressive). Ghost-card YOK (1px kenar + ≥16px gölge aynı öğede birlikte değil).

**Aidan'da uygulanan token'lar (asistan.html, v7-59):**
- Tema: **koyu** (mor TAMAMEN kaldırıldı). `--bg:#0c0d11`, yüzeyler `#16171d`/`#1b1c23`/`#24262e`.
- Accent: **amber** `#f5a524` (hover `#ffb43a`, light `#fbbf5a`, tint `#fcd34d`). Amber dolgular üzerine **koyu** metin `--on-accent:#1c1206` (beyaz okunmaz!).
- Tonlu beyaz/siyah: başlık `--text-strong:#f4f4f7`, gövde `--text:#e7e8ec`, açık metin `--on-dark:#f6f5f2`. Saf beyaz/siyah kullanılmaz.
- Semantik: success `#34c759`, danger `#ef4444` (üstüne `--on-dark`), info/mavi `#5aa2ff`, kategori şeritleri amber/mavi/teal/coral (mor yok).
- Font: **tek aile — Hanken Grotesk** (400–800, `--font-sans`; `--font-display` de buna eşit). Bricolage düştü (display font UI/data'da yasak + iki grotesk eşleştirme öneriye aykırı). Google Fonts ile yüklü; CSP `_headers`'da `fonts.googleapis.com`+`fonts.gstatic.com` izinli.
- CSS katmanları (hepsi tek dosyada, en sondaki en yüksek öncelik): STITCH `:root` (aktif palet) → "DARK + AMBER THEME (v7)" (amber kontrast) → "IMPECCABLE PASS (v8)" (tipografi, 8pt ritim, glow/glass/gradyan temizliği) → **"IMPECCABLE FRAMEWORK SPEC (v9)"** (`</style>` öncesi: yan-şerit→tam kenar+tint, tek aile, özel scrollbar kaldırma, ghost-card düzeltme, ease-out motion).
- Emoji politikası (v60): **dekoratif/corny emojiler tamamen kaldırıldı** (kategori/başlık/buton/toast prefix'leri + 💜🎉🌙☀️ vb. ~400+ yer). Korunanlar yalnız işlevsel olanlar: durum noktaları 🟢🔴🟡, bayraklar 🇹🇷🇺🇸, onay/çarpı ✓✕❌, oklar →↑↓ ve birkaç buton ikon glyph'i (✏️🗑️✂️🎧). Bunlar ileride Lucide/Tabler SVG'ye çevrilecek (Impeccable "tutarlı ikon stili"). Yeni UI'da emoji KULLANMA — SVG ikon kullan.
- ⏳ Açık iş: kalan buton-glyph emojilerini SVG'ye çevir; `icon.png` mascot logosu hâlâ MOR — amber tonlu yeniden üretilecek. Değişiklikler henüz **deploy edilmedi** (Salim onayı bekliyor). Cache `v7-60`.

## Kullanıcı
- **İsim:** Salim
- **Durum:** ADHD, **kod bilmiyor**
- **Yapamadıkları:** Python kuramaz, terminal kullanamaz, complex setup yapamaz
- **Cihazlar:** Windows bilgisayar + **iPhone + Safari**
- **Yaklaşım:** Adım adım, görsel, sade. Net "şuraya tıkla, şunu yaz" tarzı yönergeler.

## Proje
Tek HTML dosyalı, browser-based ADHD asistanı + sunucu tarafında Cloudflare Worker (cron push + AI endpoint'leri). **PWA olarak telefon ve bilgisayara kurulu.** Telegram bot Haziran 10, 2026'da kod tabanından tamamen kaldırıldı.

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
                      │ (Llama)     │         │ (Python)   │
                      └─────────────┘         └────────────┘
                             │
                      ┌──────▼──────┐
                      │  Web Push   │
                      │  (lock      │
                      │   ekranı)   │
                      └─────────────┘
```

- **Frontend:** `asistan.html` (~6700 satır, tek dosya HTML + CSS + JS)
- **Hosting:** **Cloudflare Pages** (`aidanapp.pages.dev`) — Mayıs 27, 2026'da Netlify'dan geçildi (Netlify free tier kotası tükendi)
- **Deploy:** `py aidan-pages-deploy.py` ile Direct Upload API → 5 sn'de canlı
- **Bulut:** Supabase (`fluhzvzulrnfyqogrgfi.supabase.co`)
- **Bildirim:** Web Push (VAPID, iOS lock ekranı). Telegram + ntfy emekli.
- **PWA:** Manifest + Service Worker (network-first stratejisi) + **icon.png** (yeni bulut mascot)
- **Tasarım dili:** **Stitch-inspired dark mode** (May 28-29, 2026) — indigo `#6463ff`, koyu `#0a0b0f`, soft amber `#ffc640` yıldız. Inter font.
- **Cache versiyonu:** `aidan-v7-37` (sw.js içinde, her büyük değişikte artırılır)
- **AI:** Cloudflare Workers AI — **Llama 3.3 70B** (intent + tool use) + **Llama 3.2 Vision** (portföy görsel okuma). Bedava. Whisper artık kullanılmıyor (sesli giriş Web Speech API ile tarayıcıda).
- **MCP Server (PC):** Python, Claude Desktop bağlanır, doğrudan Supabase'e operasyon yapar
- **Cloudflare Worker:** Cron push (brifing/borsa/portföy/hatırlatıcı) + PWA AI endpoint'leri (`/ai`, `/journal`, `/split`, `/portfolio-comment`, `/portfolio-image`, `/stocks`)
- **Güvenlik:** Supabase RLS doğrulandı (anon=hiçbir şey, auth=sadece kendi user_id). Pages `_headers` ile CSP/HSTS/X-Frame/COOP/Permissions-Policy canlıda (8 header). Worker GET `?secret=` zorunlu (spam koruması). Sensitive paths (`/CLAUDE.md`, `/aidan-mcp/*`, `/.env*`) `_redirects` ile 404'e gidiyor.

## Dosyalar (`C:\Users\Salim\Desktop\claudedeneme\`)

### Frontend (Cloudflare Pages'e deploy oluyor)
- `asistan.html` — ana uygulama. Pages'te `/index.html` olarak servis ediliyor (auto-strip redirect loop'u önlemek için)
- `404.html` — Aidan stilinde dark mode error sayfası, `_redirects` 404 hedefi
- `manifest.webmanifest` — PWA manifest (start_url + scope = `/`)
- `sw.js` — service worker (network-first, otomatik update mesajı, cache `aidan-v7-32`, push + notificationclick handler)
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
- **🎯 "Şu an ne yapayım?"** — akıllı tek görev öneri (MIT → acil → bugün → kısa → rastgele), energy-aware (🔋/⚡/🚀)
- **🗄️ Otomatik arşiv** — 7+ gün önce bitenler ana görünümden gizlenir, "Bitenler"de katlanır 📦 Arşiv bölümünde (Haz 9)
- **💪 Erteleme farkındalığı** — 3+ ertelenen görevde nazik nudge çubuğu → böl / 2dk dene / kalsın (Haz 9)
- **📝 Görev notu** — `task.notes`, kartta gri italik (editTask 2. adım)
- **👆 Swipe** — sağa=tamamla, sola=sil (ikisi undo'lu), mobilde
- **↩️ Undo** — sil/bitir 5sn "geri al" toast'lu

### Quick Capture (üst bar)
- Üst barda tek input — aklına geleni 2 sn'de yaz, sonra düşün
- **/ tuşu** ile odaklan, **Enter** ile ekle
- Kategori/öncelik atmaya gerek yok — sonra düzenle
- **🎯 Akıllı + butonu** (`parseQuickInput`) — "yarın 14:00 dişçi" → lokal regex ile tarih/saat/kategori/öncelik/süre parse ($0, anında)
- **🎙️ Sesli giriş** — Web Speech API `tr-TR`, söyle → input'a yazar (Telegram şart değil)
- **🧠 AI butonu** (`quickCaptureAI`) — metni Worker `/ai`'ye yollar, Llama yorumlar + görev ekler, realtime sync

### 🧠 Zihin boşalt (brain dump)
- Görevler tabında katlanır panel. `data.dumps[]` — dök, ✓göreve çevir (parser'dan), ✗sil
- Telegram emekliliğinde kaybedilen son özellik PWA'ya geri geldi (Haz 4)

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
- **⏱️ Timestamp bazlı** (Haz 9) — `timerEndTime` + `tickTimer`, telefon kilitliyken doğru sayar (eski setInterval bug'ı düzeltildi)
- **Odağı göreve bağla** — `currentFocusTaskId` seçiliyse biten pomodoro `actualMin`'e eklenir

### 📈 Borsa (4. sekme)
- **4 piyasa watchlist:** 🇹🇷 BIST (.IS) · 🇺🇸 ABD · 💱 Döviz (=X) · ₿ Kripto (-USD) — market chip + `toYahooSymbol`
- **Fiyat:** Yahoo Finance bedava (Worker `/stocks` proxy), kart sol border + %değişim, gün içi **60sn otomatik** güncelleme (sekme açıkken)
- **Portföy:** adet (`qty`) + ortalama maliyet (`cost`) → kâr/zarar (kart + üst özet), çoklu para birimi gruplu
- **🔔 Alarm:** üst/alt fiyat eşiği → cron push (hafta içi BIST saatleri)
- **📷 Görselden portföy:** aracı kurum ekran görüntüsü → AI vision (`/portfolio-image`, Llama 3.2 Vision) → adet/maliyet/son fiyat oku → düzenlenebilir onay modalı → ekle
- **💼 Akşam özeti push** (18:30 hafta içi) — değer + günlük/toplam kâr/zarar + hafta/ay
- **📈 Değer geçmişi** — `data.portfolioHistory[]`, sparkline + dün/hafta/ay yüzde

### Üst Bar
- Şu an saati / Sıradaki hatırlatma (görev reminderTime'larından) / Kesintisiz çalışma süresi

### Header subtitle (canlı)
- "🌤️ Salı, 26 Mayıs · ⭐ 2/3 · ✅ 5 bitti" gibi günün durumuna göre

### Ayarlar
- Bildirimler artık Telegram'dan (UI sadece bilgi notu)
- **⏰ Sabit hatırlatıcılar** (Haz 10) — ilaç/su/ders gibi her gün aynı saatte push. İsim + saat + her gün/hafta içi, aç-kapa toggle + sil. `data.reminders[]`, Worker 15 dk cron'u kontrol eder.
- Supabase auth (email + şifre)
- Yedekleme (JSON export/import) + sıfırla

### ❌ Kaldırılan özellikler (yeniden ÖNERME)
Mood/check-in · Pomodoro trend grafiği · Rutinler sekmesi · Hafta takvimi · Streak · Hyperfocus uyarısı · ntfy.sh · Motivasyon banner · pomoHistory · Düşük öncelik · weekdays/weekends repeat · Body doubling · Magic link. Gerekçeler: "Önemli Kararlar" + CHANGELOG.md. (Brain dump sekmesi kaldırıldı ama Görevler'e katlanır panel olarak geri döndü.)

### Genel UI
- Toast bildirimleri (sağ üst)
- Custom modal sistemi `aidanPrompt(title, label, default, multiline)`
- Suggest modal (Şu an ne yapayım?)
- Service Worker yeni sürüm aktif olunca **otomatik reload toast** ("🔄 Aidan güncellendi, yeniden yükleniyor...")

### Sekmeler: 4
Görevler · 🎧 Odak · 📈 Borsa · ⚙️ Ayarlar
(Brain dump UI Görevler tabında katlanır panel olarak geri döndü; Rutinler kaldırıldı)

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
| `0 18 * * SUN` | Pazar 21:00 | 💜 Haftalık review |
| `*/30 7-15 * * 1-5` | Hafta içi 10-18 | 📈 Borsa alarm kontrol |
| `30 15 * * 1-5` | Hafta içi 18:30 | 💼 Akşam portföy özeti |
| `*/15 * * * *` | Sürekli (15 dk) | ⏰ Sabit hatırlatıcı kontrolü (`data.reminders`) |
| `0 0 * * 1` | Pazartesi 03:00 | 💾 Haftalık veri yedeği (`aidan_backups` tablosu, son 12 saklanır) |

### Endpoint'ler
- `GET /?type=morning|noon|evening|deadline|weekly|stocks|portfolio|reminders|backup&secret=<WEBHOOK_SECRET>` — manuel cron test. **Secret zorunlu** (spam koruması). Eksik/yanlış secret → 404.
- `POST /webhook` — Telegram'dan gelen update (X-Telegram-Bot-Api-Secret-Token header ile auth). **Telegram emekli** (`TELEGRAM_RETIRED=true`): sahibe bilgi mesajı, AI işleme yok.
- `POST /ai` — PWA quick capture AI (Supabase token auth, CORS). Telegram'la aynı pipeline.
- `POST /journal` — sesli akşam günlüğü, AI sıcak yansıma (tool yok).
- `POST /split` — AI görev bölücü: `{text}` → Llama 3.3 70B → 3-6 kısa eylem adımı `{steps:[...]}`. Auth + CORS, tool yok. `extractStepsJson` (markdown/numaralı/tireli toleranslı).
- `POST /portfolio-comment` — AI portföy yorumu: `{facts}` (PWA hesaplar, AI uydurmasın) → betimleyici özet `{comment}`. KATI prompt: al/sat/tut tavsiyesi + fiyat tahmini + iyi/kötü yatırım demek YASAK. Auth + CORS, tool yok.
- `POST /stocks` — Yahoo fiyat proxy (`{entries:[{display,yahoo}]}` veya eski `{symbols}`).
- `POST /stock-history` — tek hisse geçmiş close serisi: `{ySymbol, range:'1mo'|'3mo'|'1y'}` → `{timestamps, closes, min, max, first, last, changePct, currency, name}`. Yahoo chart endpoint proxy'si, 5dk CF cache, auth + CORS, tool yok. PWA mini grafik modali kullanır.
- `POST /portfolio-image` — portföy görseli → Llama 3.2 Vision → sembol/adet/maliyet/son fiyat JSON. `visionRun` (5016 lisans `agree` retry), `parseNum` (Türk sayı formatı).

### Telegram (EMEKLİ — kod silindi, Haz 10 Faz 4)
Bot/webhook/sesli mesaj akışı worker'dan tamamen kaldırıldı (detay CHANGELOG.md). `aiInterpret` + `TOOL_HANDLERS` + `TOOL_SCHEMAS` DURUYOR — PWA `/ai` endpoint'i kullanıyor, silme.

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

## 📜 Tarihçe → CHANGELOG.md
Eski seans günlükleri (Mayıs 25 – Haziran 14, 2026), çözülen sorunların detayı, kaldırılan özelliklerin gerekçeleri ve emekli Telegram bot dokümantasyonu **`CHANGELOG.md`**'ye taşındı (10 Tem 2026 — token tasarrufu; o dosya otomatik yüklenmez). Geçmiş bir kararın gerekçesi/detayı gerekirse oradan Grep'le ara. 7 Temmuz sonrası seanslar üstteki GÜNCEL DURUM bölümünde tutulur.


## Mevcut Durum

### ✅ Çalışıyor
- iPhone + PC PWA, otomatik senkron (`aidanapp.pages.dev`)
- **Stitch-inspired tasarım v7-1** canlıda — indigo accent, mor bulut mascot logo
- Supabase auth + realtime sync + **RLS test edildi/doğrulandı**
- MCP server Claude Desktop'a bağlı
- **GitHub Actions otomatik deploy** — her `git push` Cloudflare Pages'e gider (`.github/workflows/deploy.yml`)
- Manuel deploy alternatifi: `py aidan-pages-deploy.py` → 5 sn canlı
- Cloudflare Worker 9 cron schedule (brifing/deadline/öğle/akşam/haftalık/borsa-alarm/portföy-özeti/sabit-hatırlatıcı/veri-yedeği)
- **Telegram EMEKLİ** (`TELEGRAM_RETIRED=true`) — AI + sesli + bildirim hepsi PWA'da. Bot kodu duruyor (rollback için), webhook sahibe bilgi mesajı döner.
- **📈 Borsa modülü** — 4 piyasa watchlist + alarm + portföy + görselden AI ekleme + akşam özeti + canlı güncelleme + değer geçmişi
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

## ⏳ Açık işler / backlog
- Buton-glyph emojilerini (✏️🗑️✂️🎧 vb.) Lucide SVG'ye çevir (Impeccable açık işi — Sonnet subagent'a uygun)
- `icon.png` mascot hâlâ MOR → amber tonlu yeniden üretim + maskable
- Multi-user Faz 2 (yeni user onboarding + admin görünümü) — `SUPABASE_SERVICE_KEY` eklenince
- Aylık karne · en verimli saat analizi (haftalık karne + bestHourInfo zaten var)

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
  // Seri alanları:
  seriesId: null,             // string, aynı serideki görevler aynı id
  seriesName: null,           // 'Tarih kitabı'
  seriesIndex: null,          // 1, 2, 3...
  seriesTotal: null,          // toplam parça sayısı
  // Yeni alanlar:
  notes: null,                // (Haz 4) serbest not, kartta italik
  postponeCount: 0,           // (Haz 9) kaç kez ertelendi — 3+ nudge tetikler
  nudgeDismissed: false       // (Haz 9) erteleme nudge'ı kapatıldı mı
}
```

## Veri Modeli — data root (localStorage 'aidan' = Supabase row.data)

```js
{
  tasks: [...],
  dumps: [{text, when}],
  pomoToday: {date, count},
  templates: [{id, name, emoji, builtin, tasks:[{text,category?,estimateMin?}]}],  // (Haz 2) kullanıcı şablonları
  lastWeeklyView: 'YYYY-Www', // (Haz 2) haftalık insight kartı son gösterim (ISO hafta)
  journal: [{date, text, reflection}],  // (Haz 4) sesli akşam günlüğü, son 60 gün
  pushLog: [{type, title, body, at, subs}],  // (Haz 4) bildirim geçmişi, son 7 gün/max 60
  watchlist: [{symbol, ySymbol, market, name, price, prevClose, changePct, currency,
               alarmAbove, alarmBelow, lastAlertedAbove, lastAlertedBelow, qty, cost, fetchedAt, error}],  // (Haz 6-8) borsa
  portfolioHistory: [{date:'YYYY-MM-DD', byCur:{TRY:{value,cost}}}],  // (Haz 8) portföy değer geçmişi, son 180 gün
  reminders: [{id, label, time:'HH:MM', days:'daily'|'weekdays', enabled, lastFired:'YYYY-MM-DD'}],  // (Haz 10) sabit hatırlatıcılar — Worker 15dk cron push'lar
  diet: {  // (Haz 14) diyet sekmesi + diyet programı
    kcalGoal, waterGoal,
    days: { 'YYYY-MM-DD': { meals:[{id, slot, name, kcal, planId?}], water } },  // günlük öğün log + su; planId = plandan gelen kayıt
    weights: [{date:'YYYY-MM-DD', kg}],  // kilo trendi
    plan: [{id, slot, name, kcal}]  // diyet programı — her gün aynı şablon
  },
  settings: {
    supaUrl, supaKey,         // Aidan'ın kendi Supabase config'i
    muteUntil,                // (Haz 2) bildirim sustur (epoch ms)
    pushSubs: [{endpoint, keys:{p256dh,auth}, ua, added}]  // (Haz 2) background push cihaz kayıtları
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
```

## 🔧 Kalıcı Teknik Notlar (tarihçeden damıtıldı)
- **Canlı endpoint testi:** `aidan-mcp/.env` → Supabase password login (`/auth/v1/token?grant_type=password`) → access_token; Python urllib'e `User-Agent: Mozilla/...` + `Origin: https://aidanapp.pages.dev` header'ı ekle (yoksa Cloudflare 403 error 1010).
- **Workers AI lisanslı model:** ilk kullanımda `5016: submit 'agree'` hatası → `visionRun()` bir kez `{prompt:'agree'}` yollar (hesap için kalıcı), sonra asıl istek.
- **`env.AI.run` cevabı** bazen string değil dizi/obje → `typeof rr === 'string' ? rr : JSON.stringify(rr)`.
- **Türk sayı formatı:** "2.145,00" → `parseNum()` (virgül=ondalık, nokta=binlik); AI'dan sayıyı görseldeki haliyle STRING iste.
- **Satır sonları:** worker.js / styles.css / sw.js / ui.js = **LF**; asistan.html / core.js / CLAUDE.md = **CRLF** — Python replace'te EOL eşle.
- **Tarih hesapları** hep `'T12:00:00'` öğlen demirli (toISOString UTC kayması bug'ı).
- **Preview testi:** SW cache taze modülü gizleyebilir → `serviceWorker.getRegistrations()→unregister()` + `caches.delete()` + reload.
- **iOS PWA sınırları:** arka planda JS yok (timer timestamp bazlı), başka uygulama kilitlenemez, Yahoo BIST ~15dk gecikmeli.

## Yeni Sohbet Başlıyorsa — Kalıcı Uyarılar
1. ⚠️ Deploy = `git push` → GitHub Actions (Pages + Worker birlikte). Netlify / drag-drop / ntfy ASLA önerme.
2. ⚠️ Büyük dosyalarda Edit aracı yerine **Python byte-replace + `node --check`** (üstteki DÜZENLEME KURALI); .bak oluşturma, rollback = `git checkout <dosya>`.
3. ⚠️ Push bildirimi sorununda 3 şart: Worker `Urgency: high` + SW her push'ta `showNotification` + fresh subscription (Ayarlar → "Push'u sıfırla"). Kayıtlar `data.settings.pushSubs[]`.
4. ⚠️ Tasarım: Impeccable standardı (üstte, KALICI) — koyu tema + amber accent. Eski mor/indigo YOK.
5. Kaldırılmış özellikleri yeniden önerme — "Önemli Kararlar" + "Kaldırılan özellikler" listesine bak.
6. Salim'in test sonuçlarını sor; sıradaki iş için "Açık işler / backlog" bölümüne bak.
