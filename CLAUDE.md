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
│   (Aidan)    │      │  (aidan_data │      │     PWA       │
│              │      │    tablo)    │      │   (Aidan)     │
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
- **Hosting:** Netlify, **otomatik git deploy** (`salimfenerli/aidanagent` repo)
- **Deploy:** Otomatik — git push → 30 sn sonra `https://aidanagent.netlify.app/asistan.html`'de canlı
- **Bulut:** Supabase (`fluhzvzulrnfyqogrgfi.supabase.co`)
- **Bildirim:** Telegram bot (eski ntfy.sh deprecate edildi, kota sorunu)
- **PWA:** Manifest + Service Worker (network-first stratejisi) + icon.svg
- **Cache versiyonu:** `aidan-v6-0` (sw.js içinde, her büyük değişikte artırılır)
- **AI:** Cloudflare Workers AI — **Llama 3.3 70B** (intent + tool use) + **Whisper** (sesli → metin). Bedava.
- **MCP Server (PC):** Python, Claude Desktop bağlanır, doğrudan Supabase'e operasyon yapar
- **Cloudflare Worker:** Cron brifing + Telegram webhook handler
- **Güvenlik:** Supabase RLS doğrulandı (anon=hiçbir şey, auth=sadece kendi user_id). Netlify CSP/HSTS/X-Frame headers canlıda. Worker GET `?secret=` zorunlu (spam koruması).

## Dosyalar (`C:\Users\Salim\Desktop\claudedeneme\`)

### Frontend (Netlify'a deploy oluyor)
- `asistan.html` — ana uygulama
- `index.html` — asistan.html'e redirect
- `manifest.webmanifest` — PWA manifest
- `sw.js` — service worker (network-first, otomatik update mesajı)
- `icon.svg`, `icon-maskable.svg` — PWA ikonları
- `netlify.toml` — Netlify config (CLAUDE.md ve aidan-mcp/ public'e gitmesin diye 404 redirect)

### MCP Server (PC'de çalışır, Claude Desktop için)
- `aidan-mcp/server.py` — FastMCP server, Supabase REST direkt çağırır
- `aidan-mcp/.env` — credentials (gitignore'da, asla commit edilmez)

### Cloudflare Worker
- `aidan-worker/worker.js` — Worker kodu (cron + webhook + AI + tools)
- `aidan-worker/deploy.py` — Cloudflare API üzerinden deploy scripti (wrangler yok)
- `aidan-worker/wrangler.toml` — cron schedules referansı

### Meta
- `CLAUDE.md` — bu dosya
- `.gitignore` — .env, .claude/settings.local.json, vs.

## Servisler & URL'ler

| Servis | URL | Not |
|---|---|---|
| Aidan PWA | https://aidanagent.netlify.app/asistan.html | Canlı |
| Netlify Dashboard | https://app.netlify.com | "aidanagent" projesi |
| GitHub Repo | https://github.com/salimfenerli/aidanagent | Private, Netlify oluşturmuştu |
| Supabase | https://supabase.com/dashboard/project/fluhzvzulrnfyqogrgfi | Email + şifre auth |
| Cloudflare Dashboard | https://dash.cloudflare.com | Worker'lar burada |
| Worker URL | https://aidan-pusher.fenerlisalim04.workers.dev | Cron + webhook |
| Worker test (GET) | `?type=morning\|noon\|evening\|deadline` | Manuel brifing tetikleme |
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

## Mevcut Durum

### ✅ Çalışıyor
- iPhone + PC PWA, otomatik senkron
- Supabase auth + realtime sync + **RLS test edildi/doğrulandı**
- MCP server Claude Desktop'a bağlı
- Auto-deploy (git push → 30 sn canlı)
- Cloudflare Worker 4 cron schedule
- Telegram bot iki yönlü (yazılı + 🎤 sesli)
- Llama 3.3 70B intent + tool use
- Whisper sesli → metin
- Ödev serisi + yeniden dengele
- Network-first SW
- Netlify security headers (CSP/HSTS/X-Frame canlıda)

### 💰 Maliyet
**$0/ay** — hepsi free tier:
- Netlify: 300 credits/ay (auto-deploy ile drag-drop'tan az kullanım)
- Supabase: free
- Cloudflare Workers: 100K istek/gün
- Cloudflare Workers AI: 10K neuron/gün
- Telegram Bot: sınırsız bedava
- ntfy: kullanılmıyor

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

## Deploy Süreci (otomatik)

1. Ben dosyaları düzenliyorum
2. `sw.js` cache versiyonunu artırıyorum (örn `v5-0` → `v5-1`)
3. `git add -A && git commit -m "..." && git push`
4. Netlify webhook tetikler, 30 sn içinde canlı
5. Telefonda PWA: yeni SW otomatik aktif olur, toast "🔄 güncellendi" çıkar, sayfa yenilenir
6. Bilgisayarda PWA aynı şekilde

⚠️ Eski drag-drop yöntemi artık **GEREKSİZ**. Salim'e söyleme bile, otomatik olsun.

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
- 📈 **Borsa modülü** — BIST + ABD watchlist, fiyat alarmı (Salim istemişti, henüz yapılmadı)
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
  settings: {
    ntfyTopic,                // DEPRECATED
    hyperfocusEnabled, hyperfocusMin,
    supaUrl, supaKey          // Aidan'ın kendi Supabase config'i
  }
}
```

## Hızlı Komutlar (yeni sohbette başlangıç için)

```bash
# Aidan deploy (otomatik)
git -C "C:/Users/Salim/Desktop/claudedeneme" add -A && \
  git -C "C:/Users/Salim/Desktop/claudedeneme" commit -m "..." && \
  git -C "C:/Users/Salim/Desktop/claudedeneme" push

# Worker manuel test
curl https://aidan-pusher.fenerlisalim04.workers.dev/?type=morning

# Aidan'ın live durumu kontrol
curl -s "https://aidanagent.netlify.app/asistan.html?t=$(date +%s)" | grep "subtitle"

# Telegram webhook info
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

## Yeni Sohbet Başlıyorsa — Önce Bunları Yap

1. **Salim'in test sonuçlarını sor**: sesli Telegram çalıştı mı? Sabah brifingi geldi mi?
2. **Sıradaki feature** için karar: Borsa modülü en olası
3. **Brain Dump / Rutinler hakkında karar bekliyor** — kullanmazsa silmek istiyor
4. ⚠️ **Drag-drop deploy ASLA önerme**, artık git push otomatik
5. ⚠️ **ntfy.sh'tan asla bahsetme**, Telegram bot kullanılıyor
6. ⚠️ **Mood/check-in'den bahsetme**, kaldırıldı
