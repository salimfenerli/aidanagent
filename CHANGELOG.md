# Aidan — Tarihçe Arşivi (CHANGELOG)

Bu dosya CLAUDE.md'den 10 Temmuz 2026'da taşındı (her sohbette otomatik yüklenen CLAUDE.md'yi küçültmek için).
Eski seans günlükleri, çözülen sorunlar, kaldırılan özellik gerekçeleri ve emekli Telegram bot dokümantasyonu burada.
Otomatik YÜKLENMEZ — geçmiş bir kararın detayı gerekirse Grep/Read ile bak.

---

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


---

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


---

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
- **Cache:** v7-19 → v7-21
- 🔴 **ÇÖZÜLEN 2 BUG (Salim "okuyamadı" dedi → kendi test scriptimle teşhis):**
  - **(1) Llama Vision lisans onayı (5016):** Llama 3.2 Vision, Meta lisansı yüzünden ilk kullanımda `5016: you must submit the prompt 'agree'` hatası verir. Çözüm: `visionRun()` helper — `env.AI.run` 5016 dönerse bir kez `{prompt:'agree'}` gönderir (lisans kabulü hesap için kalıcı), sonra asıl isteği tekrarlar. **Workers AI'da yeni bir lisanslı model kullanılırsa bu gerekebilir — model dökümanında "agree" notu var mı bak.**
  - **(2) Response formatı:** Bu modelde `env.AI.run` cevabı `r.response` bazen **string değil dizi/obje** gelir (`[object Object]`). `String()` ile değil, `typeof rr === 'string' ? rr : JSON.stringify(rr)` ile stringleyip `extractHoldingsJson`'a ver.
  - **Teşhis yöntemi (gelecekte işe yarar):** `aidan-mcp/.env`'deki `AIDAN_EMAIL/PASSWORD` + `SUPABASE_URL/KEY` ile Supabase password login (`/auth/v1/token?grant_type=password`) → access_token al → endpoint'i Python `urllib` ile çağır. **DİKKAT:** urllib default User-Agent Cloudflare'de `403 error 1010` yer → `User-Agent: Mozilla/...` + `Origin: https://aidanapp.pages.dev` header ekle. Pillow ile sahte portföy görseli üretip test edilebilir.
- ✅ **DOĞRULANDI:** Test görselinden THYAO/GARAN/ASELS adet+maliyet **eksiksiz** okundu. Worker'da `debug` alanı (holdings boşsa tam `r` yapısını döndürür) teşhis için kaldı — zararsız.

### Haziran 8, 2026 (📷 Görselden portföy — doğruluk + hız ayarı)
- Salim: "hesaplamalar yanlış + okuma uzun sürüyor". Kendi test scriptimle (Pillow ile sahte portföy görseli + login) teşhis edildi:
- **Hız:** Server tarafı zaten hızlı (2.5–5.5 sn, lisans onayı kalıcı — her istekte tekrarlanmıyor). Yavaşlık **büyük telefon fotosunun mobil upload'ı**. İyileştirme: görsel 1280→**1100px**, `max_tokens` 1536→**1024**, PWA status "10–15 sn sürebilir" beklenti mesajı (ADHD panik yapmasın).
- **Doğruluk — 3 sorun çözüldü:**
  - (a) Model bazen **satır atlıyordu** → prompt "TÜM satırları atlamadan oku".
  - (b) Maliyet/güncel/tutar **sütun karışması** → prompt "cost = lot başı ortalama maliyet, güncel fiyat/tutar DEĞİL".
  - (c) 🔑 **Türk sayı formatı (en sinsi):** `"2.145,00"` → model `2.145` number döndürüp binlik noktayı ondalık sanıyordu (2145 yerine 2.145). **Çözüm:** prompt artık sayıları **görseldeki haliyle STRING** istiyor (`"2.145,00"`), `parseNum()` güvenli çözer (virgül=ondalık+nokta=binlik; virgülsüzde "tüm gruplar 3 hane → binlik" sezgisi). 10 test durumu + endpoint testi (TUPRS 2.145,00 dahil 5 hisse) tam doğru.
- **Cache:** v7-21 → v7-22 (frontend: resize+status). Sonraki Worker-only düzeltmeler cache'i etkilemez.

### Haziran 8, 2026 (📷 Onay arayüzü 'son fiyat' sütunu + 💼 akşam portföy özeti push)
- Salim: (1) görsel onay arayüzüne alım/son fiyat/adet sütunları, (2) akşam özeti.
- **Son fiyat sütunu:** AI prompt'a `price` (güncel/son fiyat) okuma eklendi (maliyetten ayrı sütun), `extractHoldingsJson` parse eder (`parseNum` + `h.son`/`h.guncel` fallback). Onay modalı **2 kademeli karta** çevrildi: üst satır = sembol + piyasa select + sil; alt satır = **Adet | Alım fiyatı | Son fiyat** (mini etiketli `<label>`, mobilde sığar). `confirmPortfolioImport` yeni hisseye `price`'ı geçici yazar (Yahoo yenileyene kadar kâr/zarar hemen görünür). Test: THYAO alım 1280.5 / son 1297 ✓.
- **💼 Akşam portföy özeti push** (yeni cron `30 15 * * 1-5` = 18:30 TR hafta içi, BIST kapanışı sonrası): `runPortfolioSummary` — pozisyonlu hisselerin güncel değer + **günlük** (price−prevClose) + **toplam** (price−cost) kâr/zararını para birimine göre gruplu hesaplar, tek push: "Değer / Bugün / Toplam". `sendPushToAll` + `logPush` (📬 geçmişe de düşer). Manuel test: `?type=portfolio&secret=<WEBHOOK_SECRET>`. scheduled() routing + deploy.py + wrangler.toml güncellendi.
- **Cache:** v7-22 → v7-23

### Haziran 8, 2026 (📈 Borsa — gün içi canlı fiyat güncelleme)
- Salim: "anlık fiyata göre portföy gün içi hareket edecek mi?" — etmiyordu (sadece sekme açılışında 2dk+ eskiyse ya da manuel Yenile).
- **`startStockAutoRefresh`/`stopStockAutoRefresh`:** Borsa sekmesi açıkken **60 sn'de bir** `refreshStocks` (sessiz, başarıda toast yok, sadece spin). `showTab` stocks'a girince başlatır, çıkınca durdurur. Interval içinde `document.hidden` (telefon kilitli/arka plan) ve sekme aktif kontrolü → **pil + Cloudflare kotası dostu**.
- **`visibilitychange`:** Sayfa tekrar görünür olunca (kilit açılınca) borsa sekmesindeyse hemen bir tazele.
- ⚠️ Yahoo ücretsiz BIST verisi **~15 dk gecikmeli** olabilir — "canlı otomatik güncelleme" ama tam "anlık/tick" değil.
- **Cache:** v7-23 → v7-24

### Haziran 8, 2026 (📈 Borsa — portföy değer geçmişi + sparkline)
- Salim seçti ("bunu zaten ben de istiyodum"): portföy değer geçmişi.
- **Veri modeli:** `data.portfolioHistory[] = [{date:'YYYY-MM-DD', byCur:{TRY:{value,cost}}}]` (son 180 gün, para birimi başına). Yeni alan.
- **Snapshot kaydı (upsert by date, iki yerden):**
  - PWA `recordPortfolioSnapshot()` — `refreshStocks` sonrası bugünün değerini yazar (kullanıcı gün içi açınca).
  - Worker `runPortfolioSummary` — akşam kapanışta yazar (otoritatif kapanış değeri). İkisi de aynı güne upsert.
- **PWA gösterim:** Portföy özeti altında `renderPortfolioHistory` — baskın para birimi (en yüksek değerli) için **SVG sparkline** (`sparkline()`, son≥ilk yeşil/kırmızı) + **Dün · Hafta · Ay** yüzde değişim chip'leri (N gün önceki en yakın snapshot'a göre). En az 2 günlük geçmiş gerekir.
- **Akşam push'a eklendi:** `runPortfolioSummary` mesajına "Hafta +Y% · Ay +Z%" satırı (geçmiş varsa, `histFor` ile).
- **Cache:** v7-24 → v7-25

### Haziran 9, 2026 (🗄️ Otomatik arşiv + 💪 erteleme farkındalığı)
- Salim seçti (genel uygulama için): otomatik arşiv + erteleme farkındalığı.
- **🗄️ Otomatik arşiv:** `isArchivedDone(t)` = `done && doneDate < bugün-7gün`. `filterTasks` default ('all') görünümünde eski bitenleri gizler (ana liste temiz). "Bitenler" filtresinde son 7 gün üstte, eskiler katlanır **"📦 Arşiv (N)"** `<details>` bölümünde. Yeni alan/field YOK — doneDate'ten hesaplanır.
- **💪 Erteleme farkındalığı:** `applyPostpone` her ertelemede `task.postponeCount++`. 3+ ertelenmiş (ve `!nudgeDismissed`) görevde kartta nazik **nudge çubuğu**: "🔄 N kez ertelendi · dokun, kolaylaştıralım 💜". Tıklayınca `postponeNudge` menüsü: ✂️ küçük adımlara böl (`addSubtask`) / ⚡ 2dk dene (`startTaskNow true`) / 👍 böyle kalsın (`nudgeDismissed=true`, bir daha gösterme). Utançsız dil — ADHP prokrastinasyon döngüsü.
- **Veri modeli yeni alanlar:** `task.postponeCount`, `task.nudgeDismissed`.
- **Cache:** v7-25 → v7-26

### Haziran 9, 2026 (🎧 Pomodoro timestamp fix — telefon kilitliyken doğru sayar)
- Salim sordu: "sayacı başlatıp telefonu kapatsam devam ediyor mu?" → **Hayır, etmiyordu (bug).** `setInterval(timerSec--, 1000)` iOS'ta arka planda durur/yavaşlar.
- **Çözüm — timestamp bazlı:** `timerEndTime = Date.now() + timerSec*1000` (başlangıçta). `tickTimer` her 250ms'de `timerSec = round((timerEndTime - now)/1000)` ile **gerçek zamandan** hesaplar (sayaç azaltma değil). Telefon kilitliyken zaman akar, açılınca doğru kalan süre. `pauseTimer` kalan süreyi kesinleştirir, `visibilitychange` açılınca `tickTimer()` ile anında eşitler.
- ⚠️ Sınır: PWA tamamen bellekten atılırsa (swipe-kapatma) timer sıfırlanır — kilit/arka plan sorun değil. Seans arka planda biterse bildirim açılışta gelir (PWA arka plan JS yok).
- **Cache:** v7-26 → v7-27
- ⏳ Salim'in seçtiği sıradaki özellikler: 🎯 sabah AI MIT önerisi · ⏱️ odağı göreve bağla (kısmen var: `currentFocusTaskId`→`actualMin`) · 🥧 portföy dağılımı · 📊 kişisel içgörü.

### Haziran 9, 2026 (📊 Haftalık karne — istediğinde açılan zengin özet)
- Salim seçti (📊 kişisel içgörü maddesi). NOT: haftada 1 açılışta çıkan ufak `weeklyInsight` kartı zaten vardı; bu onun **istediğinde açılan, zengin** versiyonu — ikisi paralel duruyor, biri diğerini bozmaz.
- **PWA:** action-row'a (🎯 Şu an ne yapayım · 📋 Şablonlar yanına) **"📊 Karne"** ghost butonu → `karneModal`.
  - `karneStats(weeksAgo)` — `weeksAgo` 0=bu hafta / 1=geçen / 2=önceki. `done`, `byCat`, gün gün `byDayArr` (Pzt-Paz), `mitDone`, `focusMin` (görevlerin `actualMin` toplamı — ⚠️ `data.pomoHistory` artık YAZILMIYOR, deprecated, ondan hesaplama!).
  - `renderKarne()` — Bu hafta / Geçen hafta sekmeleri, **gösterilen haftadan bir önceki** haftayla kıyas (↑/↓ chip), gün gün bar grafik (bugün amber `--secondary` vurgulu), ⭐MIT · 🎧odak dk · 🏆 top kategori pill'leri, kategori dağılımı yatay barlar, nazik kapanış cümlesi, alt farkındalık (anlık gecikmiş + 3+ ertelenmiş). Boş hafta için nazik durum.
  - **Tarih helper'ları:** `daysOfWeekIso(mondayIso)` + `prevDayIso(iso)` — ikisi de `'T12:00:00'` öğlen demirli (toISOString UTC kaymasını önler).
  - 🐛 **Düzeltilen mantık:** ilk versiyonda hafta sonu `getMondayIso(1)` ile alınıyordu — bu "geçen pazar"ı DEĞİL, *dünün haftasının pazartesisini* verir (bu pazartesiyi geçen haftaya katar). Doğrusu: `prevDayIso(getMondayIso((weeksAgo-1)*7))`. ⚠️ Mevcut `weeklyInsight` kartında da aynı latent bug var (`lastSun = getMondayIso(1)`) ama dokunulmadı — sadece Pzt-Çar göründüğü için pratikte az etkili.
- **Veri modeli:** Yeni alan YOK — `tasks` (doneDate/category/mitDate/actualMin/postponeCount/due) üzerinden hesaplanır.
- **Doğrulama:** Preview'da bu/geçen/önceki hafta seed verisiyle iki sekme + boş durum + mobil (375px) test edildi, kıyas sayıları doğrulandı, konsol hatası yok.
- **Cache:** v7-27 → v7-28

### Haziran 9, 2026 (4 yıldızlı özellik tek pakette — borsa rozet · zaman körlüğü · odak-görev · sabah MIT)
Salim "önerdiklerinin yıldızlı olanlarını hepsini yap" dedi → tek seansta 4 özellik (3'ü PWA, 1'i Worker). MIT açılımı = **Most Important Task** (En Önemli Görev), uygulamada "Bugünün 3'ü".
- **🟢 Borsa canlı/piyasa-açık rozeti** (Salim "borsa neden kendi kendine güncellenmiyor" dedi → asıl sorun: BIST 18:00'de kapanıyor + güncelleme sessizdi, donuk sanılıyordu):
  - `isMarketOpen(market, now)` — BIST 10-18 · ABD 16:30-23 · döviz hafta içi · kripto 7/24 (cihaz saati TR varsayımı). `marketStatusBadge()` → 🟢açık / 🔴kapalı / 🟡kısmen (watchlist'teki piyasalara göre). `updateStocksMeta()` etiket+rozeti ağ çağrısı yapmadan tazeler.
  - `startStockAutoRefresh` artık 20sn'de bir `updateStocksMeta` (canlı "az önce güncellendi") + 60sn'de bir (`_stockTick%3`) ağ tazeleme. `showTab` stocks açılışında 2dk yerine **15sn** eşikle koşulsuz tazele. HTML: toolbar'a `#marketStatus` span (`.stocks-meta` sol grup).
- **⏰ Zaman körlüğü "Şu an" kartı** (üst barda zaten saat+countdown vardı ama küçük/donuk/10sn):
  - Görevler panelinin EN ÜSTÜNE `#nowCard`: iri **saniyelik canlı saat** (`#nowClock` HH:MM:SS) + günün ritmi çubuğu (07:00–23:00 penceresi, "aktif güne ~Xsa kaldı") + yaklaşan hatırlatma geri sayımı (≤120dk göster, ≤15dk `.urgent` pulse).
  - `tickNow()` her 1sn (saat + gün çubuğu + nowNext). `_nextReminder` modül değişkeni `updateTopbar` (10sn) tarafından set edilir, `tickNow` saniyelik geri sayımı ondan hesaplar. Topbar saati de artık saniyelik eşitleniyor. ⚠️ `let _nextReminder` `updateTopbar`'dan ÖNCE bildirilmeli (TDZ — `updateTopbar()` ilk çağrı ondan önce çalışıyor).
- **⏱️ Odağı göreve tam bağla** (zaten `currentFocusTaskId`→`actualMin`, banner, "✓ Ndk sürdü" rozeti vardı; eksik = Odak sekmesinden görev seçememe):
  - `#focusTask` artık tıklanabilir → `openFocusPick()` / `focusPickModal` — bitmemiş görevler MIT/acil/gecikmiş önce, tıkla-bağla (`bindFocusTask`). Bağlıyken "🎯 görev ✕" (✕ = `dropFocusTask`).
  - 🔑 `resetTimer(keepFocus)` — preset değişince (`setTimer` → `resetTimer(true)`) bağ KORUNUR; sadece 🔄 Sıfırla butonu (`resetTimer()`) tam temizler. (Eskiden preset değiştirince bağ sessizce kopuyordu.)
  - Süre rozeti zenginleşti: tahmin+gerçek varsa `✓ 45dk · tahmin 30 (+15dk)` (tahmin↔gerçek kıyas, ADHD self-awareness).
- **🎯 Sabah AI MIT push** (Worker):
  - `autoSetMorningMit(data)` — sabah cron'da MIT seçili DEĞİLSE `suggestMitFromTasks` ile en iyi 3'ü bulup `mitDate=today` yazar (data mutasyonu), seçilenleri döndürür. MIT zaten varsa `[]` (dokunmaz). `buildMorning(data, autoSetMit)` → "🎯 Bugünün 3'ünü senin için seçtim" mesajı (push'ta buton yok, açınca MIT hazır). `runCronJob` 'morning' → `buildMorning(data, autoSetMorningMit(data))`; veri zaten sonda kaydediliyor (pushLog) → mitDate kalıcı. PWA tarafı değişmedi (realtime pull MIT kutusunu gösterir).
- **Doğrulama:** PWA 3 özellik preview'da test edildi (piyasa saati 5 senaryo, "Şu an" kartı normal+acil, picker sıralama+bağla+preset-koruma+rozet, mobil 375px, konsol temiz). Worker saf fonksiyonları (trToday/trDate/scoreTaskForMit/suggestMitFromTasks/autoSetMorningMit) tarayıcı motorunda test edildi (MIT-yok→3 otomatik seçim+mitDate, MIT-var→dokunma). Worker'ın sabah MIT'i canlıda ancak 08:00 cron'da ya da `?type=morning&secret=<WEBHOOK_SECRET>` ile teyit edilebilir (secret elde yok).
- **Cache:** v7-28 → v7-29
- ⏳ Kalan yıldızsız öneriler: ilaç/sabit hatırlatıcı · AI görev bölücü · geri sayım kartı · portföy pasta grafiği · tek hisse mini grafik · aylık karne · en verimli saat analizi · multi-user · takvim entegrasyonu.

### Haziran 9, 2026 (🪄 AI görev bölücü — büyük görevi küçük adımlara böl)
Salim seçti. "logolar corny olmasın" dedi → 🤖/emoji YOK, sade Lucide "sparkles" SVG (stroke, currentColor) — uygulamanın AI dili. ADHD task initiation: büyük/belirsiz görev → tek tıkla minik adımlar, ilk adım çok küçük (başlama eşiği düşer).
- **Worker:** `POST /split` (`handleSplitApi`) — `{text}` → `env.AI.run(AI_MODEL)` (Llama 3.3 70B, tool YOK), system prompt "3-6 adım, eylem fiiliyle başla, ilk adım çok küçük, SADECE JSON dizi, TÜRKÇE". `extractStepsJson(raw)` — `r.response` string değilse JSON.stringify; ```json bloğu ayıkla; ilk `[...]` dizisini parse; olmazsa satır satır (numaralı/tireli marker strip) fallback; 2-80 karakter filtre, max 6. Auth (verifyUser + AIDAN_EMAIL), CORS (journal kalıbı). Route `/split` eklendi.
- **PWA:** Görev kartı aksiyon satırına (✂️ alt adım butonunun yanına) **sparkles butonu** → `aiSplitTask(id)`. `SPLIT_ENDPOINT` → Supabase access-token ile `/split`, dönen adımları `t.subtasks`'a ekler (bitmiş görev varsa yeniden aktif), save + renderTasks. Hata/boş durumda nazik toast. Mevcut elle `splitTask()` (ekleme formu) + `addSubtask` aynen duruyor.
- **Veri modeli:** Yeni alan YOK — mevcut `task.subtasks[{text,done}]` kullanılıyor.
- **Doğrulama:** `extractStepsJson` 6 formatla tarayıcı motorunda test (JSON/markdown/önsözlü/numaralı/tireli/junk). **CANLI uçtan uca test** (CLAUDE.md Supabase-login tekniği, `aidan-mcp/.env` → access_token → urllib + UA Mozilla + Origin): "Tarih ödevi Fransız İhtilali 10 soru" → 6 temiz adım döndü ("Kitabı aç" / "İlk 3 soruyu çöz" / "Cevapları kontrol et"). Buton DOM'da, SVG sade, konsol temiz.
- **Cache:** v7-29 → v7-30

### Haziran 9, 2026 (🥧 Portföy donut dağılım grafiği)
Salim seçti. "logolar corny olmasın" devamı → food-pie 🥧 emoji YOK, başlık `📊 Dağılım`, grafik SVG donut.
- **PWA:** `donutChart(segments, size)` — saf SVG, `stroke-dasharray`/`stroke-dashoffset` tekniği (harici lib YOK), `rotate(-90)` ile tepeden başlar. `renderPortfolioPie()` — `portfolioSummary` ile `portfolioHistory` arasına `#portfolioPie`. Mantık: holdings (qty>0+cost), para birimine grupla, **baskın para birimi** (en yüksek değer, geçmiş grafikle tutarlı) için hisse bazlı % donut + legend (renk noktası + sembol + %). **Kur karıştırmaz** — diğer para birimleri "(+N diğer para birimi)" notuyla dışlanır. 8+ pozisyon → ilk 7 + "Diğer". `PIE_COLORS` tema paleti (indigo/yeşil/amber/turuncu/mavi/mor/pembe). <2 pozisyonda gizlenir (pasta anlamsız). `renderStocks` çağrı sırası: summary → pie → history.
- **Veri modeli:** Yeni alan YOK — `watchlist[i].qty/cost/price/currency/symbol` kullanılır.
- **Doğrulama:** Preview'da 4 hisseli (3 TRY + 1 USD) seed → THYAO 57.6% · GARAN 36.5% · ASELS 6.0% (matematik doğrulandı), BTC ayrı para birimi diye dışlandı, donut + legend + mobil (375px) temiz, konsol hatasız.
- **Cache:** v7-30 → v7-31
- 💬 **AI portföy yorumu** — Salim sordu. Cevap: betimleyici yorum YAPILABİLİR (dağılım/konsantrasyon/günlük performans gözlemi), ama **yatırım tavsiyesi (al/sat) YASAK** (lisanslı danışman değiliz). Sınır açıklandı, Salim "ai yorumlasa iyi olur evet" dedi → yapıldı (aşağıda).

### Haziran 9-10, 2026 (💬 AI portföy yorumu — betimleyici, tavsiye DEĞİL)
Salim onayladı ("ai yorumlasa iyi olur evet"). Tasarım ilkesi: **sayıları PWA hesaplar** (`buildPortfolioFacts` — AI sayı uyduramaz), **AI sadece betimler**.
- **Worker:** `POST /portfolio-comment` (`handlePortfolioCommentApi`) — `{facts}` → Llama 3.3 70B (tool YOK, journal kalıbı: auth verifyUser + AIDAN_EMAIL, CORS). System prompt KATI: al/sat/tut tavsiyesi YASAK, fiyat tahmini/gelecek yorumu YASAK, "iyi/kötü yatırım" YASAK, hisse övme/kötüleme YASAK, sayı uydurma YASAK. Konsantrasyonu nötr farkındalık olarak söyleyebilir ("yumurtaların çoğu tek sepette") ama ne yapılacağını SÖYLEMEZ. max_tokens 400, İngilizce şablon fallback'i var.
- **PWA:** `buildPortfolioFacts()` — holdings'i para birimine gruplar, her pozisyon için portföy %'si + günlük % + toplam kâr/zarar % satırları üretir (düz metin). **"Portföyü yorumla"** butonu (`#pfCommentBtn`, dashed border + sade sparkles SVG — corny emoji YOK) portföy geçmişinin altında, sadece pozisyon varsa görünür (`renderStocks` içinde toggle). `aiCommentPortfolio()` → `PF_COMMENT_ENDPOINT` → sonuç `pfCommentModal`'da, altında sabit not: *"Bu betimleyici bir özettir — yatırım tavsiyesi değildir."*
- **Veri modeli:** Yeni alan YOK.
- **Doğrulama:** `buildPortfolioFacts` preview'da 4 hisseli seed ile test (yüzdeler donut'la tutarlı). **CANLI uçtan uca test** (Supabase login tekniği): 3 hisseli facts → AI dağılım+konsantrasyon+günlük hareketi betimledi, "yumurtalar tek sepette (THYAO %57,6)" farkındalığı verdi, **al/sat tavsiyesi YOK** — sınırlar tutuyor. ⚠️ Python test scriptinde `/tmp/...` yolu Windows'ta `open()` ile çalışmaz (bash mapler, Python maplemez) — proje köküne yazıp silmek gerek.
- **Cache:** v7-31 → v7-32

### Haziran 10, 2026 (🧹 Telegram Faz 4 + ölü field temizliği)
Salim "eski özellik kalıntılarını ve Telegram kodlarını temizle" dedi. Tek seansta:
- **Worker (`worker.js`): -276 satır.** Telegram'a özel kod tamamen silindi:
  - `sendTg`, `answerCallback`, `clearReplyMarkup`, `sendTyping` (yardımcılar)
  - `transcribeVoice` (Whisper + Telegram `getFile` çağrısı)
  - `handleCallback` (inline button — sabah brifingi MIT öneri butonları)
  - `handleWebhook` (Telegram update handler, `/start`/`/help`, AI sohbet akışı)
  - `/webhook` route + `TELEGRAM_RETIRED` bayrağı + üst yorumdaki Telegram env değişkenleri
  - `runCronJob` içindeki `if (!TELEGRAM_RETIRED) await sendTg(...)` ve `channel: 'push-only'/'push+telegram'` koşulu (artık tek satır: `channel: 'push'`)
  - `fetchAidan` default'undan `checkins`, `routines`, `pomoHistory` çıkarıldı
  - 🔑 **KORUMA:** `aiInterpret` + `TOOL_HANDLERS` + `TOOL_SCHEMAS` + `buildSystemPrompt` AYNEN DURUYOR — `/ai` endpoint'i (PWA quick capture AI butonu) bunları kullanıyor. Llama 3.3 70B beyni hala canlı, sadece Telegram katmanı gitti.
  - **Rollback:** `git revert <faz4-commit>` — eski kod aynen geri gelir.
- **PWA (`asistan.html`):** Ölü field'lar temizlendi.
  - `data.routines` 3 yerden silindi (init, Supabase pull, realtime sync) — UI'da hiç yoktu, sadece backward-compat artığı.
  - Görev backward-compat'tan `t.streakCount`/`t.lastStreakDate` silindi (sadece set ediliyordu, hiç okunmuyordu — Streak feature May 26'da kalkmıştı, field kalıntısı).
  - 4 yerdeki görev yaratma literal'lerinden `streakCount: 0, lastStreakDate: null,` silindi (`makeTask`, şablondan görev, addTask, addQuickTask).
  - **Geriye uyumluluk:** Eski Supabase row'ında bu field'lar varsa **kayıyor** — yeni kod silmiyor, sadece eklemiyor. Yeni temiz row'da hiç oluşmuyor (preview'da test edildi: fresh data_keys = `[dumps, journal, lastWeeklyView, pomoToday, portfolioHistory, pushLog, reminders, settings, tasks, templates, watchlist]`).
- **`deploy.py`:** Worker secret inherit listesinden `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` çıkarıldı. Bunlar Cloudflare dashboard'da hala duruyor (kimseyi bozmuyor); istersen Worker → Settings → Variables'tan elle silebilirsin.
- **`wrangler.toml`:** Yorumlardaki Telegram referansları VAPID + WEBHOOK_SECRET ile değişti.
- **CLAUDE.md:** Mimari diyagramından Telegram kutusu çıktı, veri modelinden `routines`/`checkins`/`pomoHistory`/`ntfyTopic`/`hyperfocus`/`streakCount`/`lastStreakDate` çıktı, "Bildirim" satırı "Web Push" olarak yenilendi.
- ⚠️ **Telegram bot BotFather'da hâlâ duruyor** — sadece sussun diye. İstersen BotFather'a `/deletebot` yazarak silebilirsin; Cloudflare Worker artık `/webhook` route'una bakmıyor zaten (gelen update'leri Cloudflare 404 döner). Webhook URL Telegram'da kayıtlıysa "Webhook fail" notifikasyonları bot loglarında birikebilir — Telegram setWebhook ile boş URL koyarsan o da temizlenir.
- **Doğrulama:** PWA preview'da boş başlangıç ✅ + legacy data ✅ (eski field'lar kayıyor, yeni hata yok) + console temiz. Worker syntax brace dengesi 0 ✅, paren -1 (string/comment içi normal). Gerçek deploy doğrulaması GitHub Actions tarafından yapılır.
- **Cache:** v7-33 → v7-34

### Haziran 10, 2026 (⏰ Sabit hatırlatıcılar — ilaç/su/ders push)
Salim seçti (kalan öneri listesinden 💊 ilaç/sabit hatırlatıcı). Görevlerden tamamen ayrı, sade bir liste — görev listesi şişmez, her gün tekrar eden "İlacını al" görev kartı olarak durmaz.
- **Veri modeli:** `data.reminders[] = [{id, label, time:'HH:MM', days:'daily'|'weekdays', enabled, lastFired:'YYYY-MM-DD'}]` — yeni alan.
- **PWA:** Ayarlar'da "⏰ Sabit hatırlatıcılar" bölümü (📱 Bildirimler'in altında): liste (toggle aç/kapa + ✕ sil, saate göre sıralı, kapalılar soluk) + ekleme formu (isim + `<input type=time>` + her gün/hafta içi select). `renderFixedReminders/addFixedReminder/toggleFixedReminder/deleteFixedReminder`, showTab settings hook'u. `.fixedrem-*` CSS.
- **Worker:** `runFixedReminders(env)` — **yeni 8. cron `*/15 * * * *`** her 15 dk: saati gelen (diff 0-30 dk penceresi) + bugün atılmamış (`lastFired`) + gün filtresi uyan hatırlatıcıya `sendPushToAll` + `logPush('reminder')` (📬 geçmişe düşer), `lastFired=bugün` yazıp kaydeder. Manuel test: `?type=reminders&secret=...`.
  - **Gece yarısı taşması çözüldü:** son cron turu 23:45 → 23:46-23:59 hatırlatıcıları normalde hiç atılmazdı. 00:00/00:15 turunda `nowMin<=30 && diff<0` ise `diff+=1440`, `fireDay=dün` (lastFired düne yazılır, hafta içi kontrolü de düne göre) — pencere gün dönümünü aşar.
  - deploy.py `CRON_LIST` + wrangler.toml'a cron eklendi. scheduled() routing'i borsa kalıbıyla aynı (`if event.cron === ... return`).
- **Doğrulama:** due-mantığı 12 senaryoyla tarayıcı motorunda test (tam saat / +15dk / bugün atılmış / +31dk eski / erken / pazar-hafta içi / kapalı / gece yarısı yakalama / dün atılmışsa atla / 00:10'da sabah 9 patlamaz / cmt gecesi hafta içi filtresi). PWA formu preview'da test: ekle/toggle/sil/boş durum + mobil 375px ✅, konsol temiz.
- ⚠️ **15 dk hassasiyet** — 09:00 hatırlatıcısı 09:00-09:15 arasında gelir (cron çeyrek saatlerde). UI'da "~15 dk hassasiyet" notu var.
- **Cache:** v7-32 → v7-33

### Haziran 11, 2026 (📉 Tek hisse mini grafik + 💾 veri yedeği otomasyonu)
Salim pros/cons sonrası iki iş seçti: borsa kartına grafik + defansif veri yedeği.
- **📉 Tek hisse mini grafik:**
  - **Worker:** `POST /stock-history` (`handleStockHistoryApi`) — `{ySymbol, range:'1mo'|'3mo'|'1y'}` → Yahoo chart endpoint proxy. `STOCK_HISTORY_RANGES` map (1mo=daily, 3mo=daily, 1y=weekly). null close değerleri (kapalı gün/tatil) atlanır, paralel index korunur. Response: `{timestamps, closes, min, max, first, last, changePct, currency, name}`. Auth (verifyUser + AIDAN_EMAIL), CORS, 5dk CF cache (`cf:{cacheTtl:300,cacheEverything:true}`).
  - **PWA:** Borsa kartı `.stock-card` artık `cursor:pointer` + `onclick="openStockChart(idx)"`. Action butonları (.stock-actions) `event.stopPropagation()` ile yutar — Pozisyon/Alarm/Sil etkisiz olmaz. Modal `#stockChartModal`: sembol + market badge + isim + son fiyat + günlük %, **range chip'leri** (1 ay / 3 ay / 1 yıl, aktif olan dolu mor), `#stockChartArea` SVG line chart, Min / range% / Max alt rozetleri.
  - **`lineChart(values, isDown)` helper:** SVG path tabanlı, sparkline'ın "ağabey" versiyonu (420×140, padding 8/10). 2 path = (a) `linearGradient` ile soft alan dolgusu (top 0.28 opacity → bottom 0), (b) line stroke 2px. Yükselen=yeşil (#34c759), düşen=kırmızı (#ef4444). `defs/linearGradient` ID = 'lc-fill-u/d'.
  - **Veri akışı:** `openStockChart` modalı sentakla → `loadStockHistory('1mo')` → Supabase access-token + `STOCK_HISTORY_ENDPOINT` → response varsa lineChart + stats; auth yok/hata varsa nazik mesaj.
  - **Doğrulama:** Preview'da iki sahte hisse (THYAO + AAPL) seed, kart tıklama modalı açtı, modal başlık/isim/fiyat/% doğru, range butonları doğru, `lineChart` 20 günlük yükselen seri ile çizdi (2 path, yeşil), mobil 375px'te tam sığdı, konsol temiz. Gerçek `/stock-history` fetch'i canlı deploy sonrası test edilecek (preview'da Supabase login yok).
- **💾 Veri yedeği otomasyonu:**
  - **Supabase tablo** (Salim'in 1 kez SQL Editor'da çalıştırması gerek):
    ```sql
    create table aidan_backups (
      id bigint primary key generated always as identity,
      user_id uuid not null,
      snapshot_at timestamptz not null default now(),
      data jsonb not null
    );
    create index on aidan_backups (user_id, snapshot_at desc);
    alter table aidan_backups enable row level security;
    create policy "users see own backups" on aidan_backups for select using (auth.uid() = user_id);
    create policy "users insert own backups" on aidan_backups for insert with check (auth.uid() = user_id);
    create policy "users delete own backups" on aidan_backups for delete using (auth.uid() = user_id);
    ```
  - **Worker:** `runBackup(env)` — fetchAidan → `aidan_backups`'a INSERT (user_id + data jsonb). Sonra `select id order by snapshot_at desc` → ilk 12'den eskileri toplu DELETE (`id=in.(...)`). Tablo yoksa (`404` veya "not exist") sessiz log + `{ok:false, reason:'table-missing'}` döner, Salim SQL'i çalıştırmadan deploy etse de Worker susmaz.
  - **Yeni cron (9. cron):** `0 0 * * 1` = **Pazartesi 03:00 TR** (UTC 00:00 — düşük trafik). Push YOK, sessiz çalışır. `scheduled()` routing + `?type=backup&secret=<WEBHOOK_SECRET>` manuel test. `deploy.py CRON_LIST` + `wrangler.toml` güncellendi.
  - **Saklama:** Son 12 yedek (~3 ay). Salim Supabase dashboard `aidan_backups` tablosundan görür ve JSON'u indirebilir. PWA UI eklenmedi (otomasyon = arka planda yeter, ileride "📥 Yedek geçmişi" Ayarlar'a eklenebilir).
- **🧹 deploy.py temizliği:** Faz 4'te kaçırılan iki TELEGRAM artığı (üst yorumda + `secret_names` listesinde `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) silindi. Artık deploy sırasında env'de Telegram aranmıyor.
- **🚨 Salim'in yapacağı tek şey:** Supabase Dashboard → SQL Editor → yukarıdaki blok yapıştır + RUN. Tablo + RLS politikaları kurulur. Tablo kurulmadan Worker zaten sessizce atlar — ilk pazartesi sabahından önce SQL çalıştırılırsa o haftadan itibaren yedek alır.
- **Cache:** v7-34 → v7-35

### Haziran 11, 2026 — 2. seans (🍅 pomodoro persistence + ⏳ geri sayım + 📥 yedek UI)
Pros/cons'tan kalan defansif paket. Salim "yapmaya başla" deyince üçü tek seansta yapıldı.
- **🍅 Pomodoro persistence:**
  - `aidan_timer` localStorage key — `{running, isBreak, workMin, breakMin, totalSec, timerSec, timerEndTime, currentFocusTaskId, focusStartTime, savedAt}`.
  - `saveTimerState()` start/pause'da yazar, `clearTimerState()` reset/tick-bitiş'te siler.
  - `restoreTimerState()` sayfa yüklenince çağrılır (`updateTimerDisplay()` sonrası). 3 senaryo:
    - **Aktif seans:** `timerEndTime > now` → interval'i yeniden başlat, eski endTime korunur (kilit ekranındaki gerçek zaman akışı).
    - **Uzakta bitmiş seans:** `running && timerEndTime <= now` → pomoCount +1, varsa `focusTaskId.actualMin += workMin`, "Seans yokken bitti" notify, state temizle. Mola moduna geçirmez (zaman çoktan geçti).
    - **Duraklı:** `!running && timerSec < workMin*60` → timerSec restore, display update.
  - Sınır: PWA tamamen swipe-kapatma + uzun süre kapalı kalırsa, açılışta seans "yokken bitti" mantığıyla işlenir — banner yerine notify mesajı. iOS arka plan JS hâlâ yok, bu tasarımla kapatıldı.
  - **Doğrulama:** 3 senaryo browser motorunda test edildi (preview), konsol temiz.
- **⏳ Geri sayım kartı:**
  - **Veri:** `data.countdowns[] = [{id, label, date:'YYYY-MM-DD'}]`. Yeni alan.
  - **PWA:** Görevler tabında `#nowCard`'ın hemen altında `#countdownList`. Sıralı: past → urgent (≤3 gün, kırmızı + pulse) → warn (≤10 gün, amber) → normal. Geçmiş tarihler 7 gün boyunca "X gün önce" olarak görünür (kaçırma farkındalığı). Boş listede kart hiç görünmez.
  - **renderCountdowns** Görevler tabına girince çağrılır, sayfa yüklenince bir kez. **renderCountdownManage** Ayarlar tabında.
  - **🐛 Düzeltilen subtle bug:** `daysUntilCountdown` ilk versiyonda `'T12:00:00'` ile target + gece yarısı bugün → 0.5 gün diff → Math.ceil = 1. "Bugün" 1 gün gösteriyordu. **Düzeltme:** hem target hem bugün lokal gece yarısı, `Math.round` ile diff (DST'ye dayanıklı: `new Date(y, m-1, d)`).
  - **Ayarlar:** Sabit hatırlatıcıların altında "⏳ Geri sayımlar" satırı: liste + ekleme formu (label + date + Ekle). Tıklayarak sil.
- **📥 PWA yedek UI:**
  - **Ayarlar** → "💾 Yedekleme" altına "☁️ Otomatik yedekler" katlanır `<details>` bölümü. Açılınca `loadBackupList()` (bir kez bağlanan toggle event'i, idempotent `_hooked` flag ile).
  - `loadBackupList()` → `_supa.from('aidan_backups').select('id, snapshot_at, data').order(...).limit(12)`. RLS sayesinde sadece kendi yedekleri gelir. `_backupCache` map'i ID → data tutar (indirme için).
  - Her satır: tarih (`tr-TR` locale) + `N görev · K alan` meta + "📥 İndir" butonu. `downloadBackup(id, dateLabel)` Blob + URL ile JSON dosyası indirir (`aidan-backup-YYYY-MM-DD.json`).
  - **Tablo yoksa:** error.code `42P01` veya mesaj match'i → "Tablo henüz yok, SQL'i çalıştır" nazik mesaj. Login yoksa "Önce Supabase'e giriş yap" mesajı.
  - **Yedek henüz alınmadıysa** (tablo boş): "Henüz yedek yok, ilk Pazartesi 03:00'da otomatik" + manuel test ipucu.
- **Veri modeli yeni alan:** `data.countdowns[]`.
- **Cache:** v7-35 → v7-36

### Haziran 11, 2026 — 3. seans (👥 Multi-user Faz 1 — davet kodlu)
Pros/cons'tan en büyük yapısal eksikti: tek-user kilidi. Salim "davet kodlu kapalı" seçti — arkadaş çevresi modeli.
- **Mimari karar:** Worker'da `SUPABASE_SERVICE_KEY` (service_role) yeni env. Eklendiği an tüm cron'lar multi-user; yoksa **fallback** olarak Salim tek-user akışı (mevcut davranış aynen). Salim hiç bozulmaz, hazır olunca service key eklenir ve aktive olur.
- **`hasServiceKey(env)`** her yerde modu kontrol eder. **`allowUser(env, user)`** AI endpoint'lerinde 5 yerdeki AIDAN_EMAIL whitelist'i tek noktadan yönetir (service key varsa açık, yoksa Salim-only).
- **`fetchAllUsers(env)`** — service key ile `aidan_data` tüm satırlar; yoksa fetchAidan tek user. **`saveUserData(env, userId, data)`** — service key ile direkt INSERT/UPDATE; yoksa saveAidan. **`insertBackup`** + **`listAndPruneBackups`** — `aidan_backups`'a multi-user yazma.
- **5 cron tek pakette multi-user:** `runCronJob`, `runStockCheck`, `runPortfolioSummary`, `runFixedReminders`, `runBackup` hepsi `fetchAllUsers` döngüsü. Her user kendi içeride `runXForUser(env, u)` yardımcısıyla işlenir, tek user çökse diğerleri devam eder (try/catch).
- **3 yeni endpoint** (Worker):
  - `POST /signup` — `{email, password, code}`. service key gerekli. (1) `invite_codes` tablosundan kod doğrula (eksik/kullanılmış → 400), (2) Supabase `auth/v1/signup`, (3) kodu `used_by/used_at` ile işaretle. Email confirm-açık ise session=null + needsEmailConfirm:true.
  - `POST /invite/create` — `{note?}`. Sadece `AIDAN_EMAIL` (ilk faz). `genInviteCode()` crypto.getRandomValues + 8 char alfabe (O/0/I/1 confusion'u önle) → `AIDAN-XXXXXXXX`. RLS policy `users create own codes` sayesinde kullanıcının kendi token'ı ile yazar.
  - `GET /invite/list` — `Bearer token`. RLS otomatik filtreler → sadece kullanıcının ürettiği kodları döner. Tablo yoksa `tableExists:false` + boş array (UI nazik mesaj göster).
- **PWA tarafı:**
  - **Auth ekranı yenilendi:** "🔓 Giriş Yap" varsayılan, "🆕 Yeni Hesap" butonu → davet kodu input + "✅ Kayıt Ol (davet koduyla)" açılır. `signUpUser` artık Worker `/signup`'a yollar (eski direkt `_supa.auth.signUp` kaldırıldı). Şifre min 6 → 8 karakter (Supabase varsayılanı).
  - **Ayarlar → "👥 Davet et"** bölümü: not input + "＋ Yeni kod üret". Liste: her kod (monospace) + tarih + kullanım durumu + "📋 Kopyala" (kullanılmamışsa). Kopyala `navigator.clipboard` ile. Login yoksa "Kilitli" nazik mesaj. Tablo yoksa "CLAUDE.md'de SQL var" yönlendirmesi.
  - `getSupaToken()` helper — `_supa.auth.getSession()` ile fresh access_token. Tüm Worker çağrıları bunu kullanır.
- **Salim'in yapacağı 2 hazırlık:**
  1. **service_role key** → Cloudflare aidan-pusher Variables'a `SUPABASE_SERVICE_KEY` (Secret).
  2. **Supabase SQL Editor** → `invite_codes` tablosu + 3 RLS policy (kendi kodlarını gör, kendi adına oluştur, kendi adına sil) — SQL CLAUDE.md'de.
- **Faz 2 (sonraki):** Yeni user için onboarding (boş Aidan tutorial), Salim'in özel admin paneli (kim kayıtlı/aktif).
- **Faz 3:** Belki diğer user'lar da kendi davet kodlarını üretebilsin (limit'le).
- **Risk yok:** Service key + invite_codes tablosu olmadan Worker mevcut tek-user davranışını korur. PWA auth ekranındaki "Yeni Hesap" akışı service key gerektirir — yoksa 503 nazik mesaj.
- **Cache:** v7-36 → v7-37

### Haziran 14, 2026 (🥗 Diyet sekmesi + diyet programı)
Salim iki fikir istedi: (1) iPhone ekran süresi kısıtlama, (2) diyet sekmesi.
- **Ekran süresi:** PWA iOS'ta başka uygulamayı kilitleyemez (Apple izni yok). Kestirme (Shortcuts) ile en fazla Odak modu (yumuşak) açılır, sert kilit olmaz. Salim "şimdilik gerek yok" dedi → yapılmadı (ileride: push hatırlatıcı + iOS Odak tetik butonu hibriti).
- **🥗 Diyet sekmesi (6. sekme):** Görevler·Plan·Odak·Borsa·**Diyet**·Ayarlar. Tab bar + drawer item + showTab hook + APP_TAB_TITLES.
  - **Kalori halkası** (SVG ring, hedefe göre dolar, aşınca kırmızı) + öğün log (kahvaltı/öğle/akşam/atıştırma, opsiyonel kcal, öğüne gruplu).
  - **Su takibi:** tıklanır bardak ikonları + ilerleme çubuğu, ＋/− ve `setWater` toggle.
  - **Kilo trendi:** gir (Türk sayı "70,1" parse) → sparkline + son değişim (düşüş yeşil = wt-down).
  - **Öğün hatırlatıcı:** tek tıkla mevcut sabit hatırlatıcı (`data.reminders`) sistemine ekler — Worker değişikliği YOK.
- **🥗 Diyet programı (Planım):** her gün aynı şablon `data.diet.plan[]`.
  - **Elle ekle** + **fotoğraf→AI:** Worker `POST /diet-plan-image` (`handleDietPlanImageApi`, vision = portföy-görsel kalıbı) diyetisyen kağıdını okuyup öğünlere böler. `extractDietPlanJson` (markdown/çer-çöp toleranslı). ⚠️ İSİM: mevcut Gün-Planı parser'ı `extractPlanJson(raw)` ile çakışmasın diye `extractDietPlanJson` adı zorunlu.
  - **"yedim" işareti:** planlı yemeği bugünün öğün loguna ekler/çıkarır (`meal.planId` ile bağlı) → kalori halkasına yansır, üstü çizilir. Plan sabit, işaret günlük.
- **Impeccable uyumlu:** yan-şerit yok, amber accent, tam kenar+tint, dekoratif emoji yok (foto/yedim Lucide SVG).
- **Veri modeli yeni:** `data.diet` (aşağıda) + `day.meals[i].planId` (plana bağlı log).
- ⚠️ **TOOLING UYARISI (önemli):** Edit aracı bu büyük dosyaları (asistan.html ~10.5k satır, worker.js ~3.6k) yazışta SESSİZCE KUYRUĞUNDAN KIRPIYOR — iki kez oldu (asistan.html 10421→10369; worker.js'te `scheduled()` + tüm cron'lar + /signup + /stock-history uçtu). Her seferinde `git show HEAD:<dosya>` ile geri yüklenip değişiklikler **Python string-replace** ile uygulandı (CRLF korunur). **Bu büyük dosyalarda Edit aracı KULLANMA → Python/sed.**
- **Deploy:** GitHub Desktop'tan commit+push. Sandbox git `.git`'e yazamıyor (mount izni: kilit dosyası yaratır ama silemez → her komut index.lock bırakır). Çözüm: hiç sandbox-git çalıştırma; GHD'den commit+push, kilit kalırsa Explorer'dan `.git/index.lock` sil.
- **Doğrulama:** node --check (her iki dosya) + sahte-DOM mantık testi (öğün/su/kilo/plan/yedim) + `extractDietPlanJson` 4 formatla + closing-tag/endpoint/cron sayımı (scheduled+/signup+/stock-history korundu).
- **Cache:** v7-63 → v7-64

### Haziran 14, 2026 — 2. seans (🐛 beyaz input bug + 💧 su: bardak→litre)
- **🐛 Beyaz input bug (kök neden):** Koyu tema input stili `input[type="text"], ...` ile yazılmış — `type` attribute'u OLMAYAN inputları (`#mealName`, `#planName`) yakalamıyordu → tarayıcı varsayılanı (bembeyaz) kalıyor, diyet formunu bozuyordu. **Çözüm:** her iki CSS form kuralına (satır ~178 ve ~2283) `input:not([type])` eklendi → tüm bare inputlar artık koyu tema, ileride de korur. (Sitedeki tek 2 bare input bunlardı.)
- **💧 Su: bardak → litre** (Salim: "boş bardaklar çirkin, litre olarak girerim"):
  - Boş bardak ikonları (`.water-glasses`/`.glass`) ve `± bardak` butonları kaldırıldı.
  - Yeni: hızlı butonlar (+0,25 / +0,5 / +1 / −0,25 L) + "toplam (L)" elle giriş (`#waterSet`, Türk virgül parse). İlerleme çubuğu litre/hedef oranına göre.
  - `fmtL(n)` helper — 1.5 → "1,5" (sondaki sıfır atılır, Türkçe gösterim).
  - **Veri modeli:** `day.waterL` (litre, ondalık) + `data.diet.waterGoalL` (varsayılan 2.5 L). Eski `day.water` (bardak) + `waterGoal` geriye uyumluluk için duruyor ama artık YAZILMIYOR/okunmuyor. Üst özet mini stat "su (bardak)"→"su (L)". Hedef input litre (0,5–10, step 0,1).
  - `.glass` CSS ölü kaldı (zararsız, dokunulmadı).
- **Doğrulama:** node --check (inline JS) SYNTAX OK + dangling eski referans (waterGlasses/addWater/setWater/day.water) taraması temiz.
- **Cache:** v7-65 → v7-66

### Haziran 14, 2026 — 3. seans (🔱 iki aşamalı program okuma + ✅ onay modalı + öğün chip)
- **🔱 Diyet programı okuma — iki aşamalı (Worker `handleDietPlanImageApi`):** Eskiden tek küçük vision modeline (Llama 3.2 11B) hem OCR hem JSON yapılandırma yaptırılıyordu → atlama/hata. Yeni:
  - **Aşama 1:** `visionRun` SADECE transkript (ham OCR, max_tokens 1500) — küçük model okumaya odaklanır.
  - **Aşama 2:** `env.AI.run(AI_MODEL)` = **Llama 3.3 70B** transkripti öğünlere bölüp JSON üretir (asıl doğruluk burada, temperature 0.1).
  - **Fallback:** iki-aşama boş dönerse eski tek-aşama (vision→direkt JSON) `directPrompt` ile denenir. Response'a `transcript` (ilk 600 char) teşhis için eklendi.
  - `extractDietPlanJson` aynen kullanılıyor. worker.js **LF** satır sonu (asistan.html CRLF — Python replace'te dikkat!).
- **✅ Görselden okuma artık doğrudan plana yazmıyor:** `dietPlanFromImage` → `openDietPlanImport(items)` düzenlenebilir onay modalı (`#dietPlanImportModal`, borsa import kalıbı). Her satır: yemek adı + öğün select + kcal + sil. `confirmDietPlanImport` plana ekler. AI hatası plana sızmaz. `_dpImportItems` geçici liste.
- **🍔 Öğün seçimi gizli dropdown → görünür chip:** Plan ekle + öğün ekle formlarındaki `<select>` (Salim hep kahvaltıya düşüyordu, dropdown fark edilmiyordu) → `.slot-chips` segmented butonlar (Kahvaltı/Öğle/Akşam/Ara öğün), seçili amber vurgulu. `_planSlot`/`_mealSlot` state + `selectPlanSlot`/`selectMealSlot`. `addPlanMeal`/`addMeal` artık state'ten okur (eski `planSlot`/`mealSlot` element id'leri kaldırıldı).
- **Doğrulama:** worker.js + asistan.html `node --check` OK, dangling referans (slotEl/planSlot/mealSlot getElementById) taraması temiz. Canlı görsel-okuma testi deploy sonrası yapılacak.
- **Cache:** v7-66 → v7-67

### Haziran 14, 2026 — 4. seans (🍽️ FatSecret tarzı: tarih gezinme + kalan-kalori panosu + makro çubuk + sık yedikleri)
Salim "diyet sekmesini FatSecret/MyFitnessPal'a benzet, eksikleri ekle" dedi. Barkod hariç 3 özellik seçti.
- **📅 Tarih gezinme (diary):** `_dietDate` runtime state (varsayılan null=bugün). `dietKey()` + `dietDay(create=true)` seçili güne göre çalışır — render'lar `dietDay(false)` (boş geçmiş gün yaratmaz), mutator'lar `dietDay(true)`. Üstte `‹ Bugün ›` navigatörü (`dietDateShift`/`dietDateToday`/`renderDietDateNav`), gelecek engelli (next disabled). `shiftDateStr` öğlen-demirli. `logWeight` artık `dietKey()`'e yazar. showTab('diet') → `_dietDate=null` (sekmeye girince bugüne döner).
- **🎯 Kalan-kalori panosu:** Halka merkezi artık **KALAN kcal** (hedef−yenen, eksiyse kırmızı `.over`). Sağ minik kartlar (su/kilo) → **hedef kcal / yenen kcal** (`#calGoal`/`#calFood`). FatSecret ana ekran hissi.
- **📊 Makro çubukları:** `dietMacroRow` (düz P/K/Y metni, kaldırıldı) → `#macroBars` = Protein(mavi)/Karbonhidrat(amber)/Yağ(coral) hedef+ilerleme çubukları (`renderMacroBars`). Hedefler: `data.diet.proteinGoal/carbGoal/fatGoal` — kcalGoal'dan türetilen varsayılan (%25/%50/%25 → 4/4/9 kcal/g). Hedefler bölümüne 3 input + `setDietGoals` parse. (Eski `renderDietMacros` + `.diet-macro-row` CSS silindi.)
- **🔁 Sık yediklerin:** `frequentMeals(limit)` geçmiş tüm günlerin öğünlerini ada göre (tr-lowercase key) gruplar, sayar, son görülen kcal/makro/slot'u tutar, sayıya göre sıralar. Öğün ekle kartında `#freqMeals` chip satırı (`renderFrequentMeals`). Dokun → `quickAddMeal(i)` o öğünü kcal+makro+slot'uyla seçili güne ekler. Yeni veri alanı YOK (geçmişten türetilir). ADHD friction-killer.
- **Doğrulama:** asistan.html `node --check` OK + node mantık testi (shiftDateStr/gelecek-engeli/frequentMeals sıralama+son-kcal+slot/kalan+makro math, 10/10 geçti) + dangling tarama temiz.
- **Cache:** v7-67 → v7-68

### Haziran 14, 2026 — 5. seans (🍳 çoklu yemek makro — bileşene ayır + topla)
Salim: "4 yumurta buluyor ama '4 yumurta 2 dilim ekmek' bulamıyor, tek tek yazınca buluyor." Kök neden: `/food-macros` tek yemek için yazılmıştı (`parseMacroJson` tek nesne bekliyordu). Türk yemekleri DB fikri Salim'in isteğiyle ertelendi ("boş ver").
- **Worker `handleFoodMacrosApi`:** AI prompt artık öğünü **bileşenlerine ayırıyor** → `{items:[{name,en,grams,kcal,protein,carb,fat}]}`. `parseMealItemsJson` (markdown/önsöz/bare-obje/dizi toleranslı, max 12 bileşen) parse eder, **server bileşenleri toplar** (AI toplamına güvenmez). max_tokens 200→500. Tek yemekse USDA da denenir (çoklu öğünde N çağrı yapılmaz). Yanıt: `{name, grams, ai:toplam, db, items:[breakdown], multi}`.
- **PWA `renderMacroResult`:** çoklu öğünde AI satırı "Toplam" etiketli + altında bileşen dökümü ("yumurta · 310 kcal + ekmek · 133 kcal"). Tek yemekte eski davranış ("AI tahmini" + USDA "Veritabanı"). Dokun → toplam kcal+makro mealKcal'a dolar, tek satır öğün olarak loglanır.
- **Doğrulama:** worker+asistan `node --check` OK + `parseMealItemsJson` 8 format testi (çoklu toplam 443 kcal/30 P doğru, fence/önsöz/bare/junk/gramsız-varsayılan). Canlı uçtan uca test deploy sonrası (Supabase login tekniği).
- **Cache:** v7-68 → v7-69
- **🔢 Devamı (Salim: "AI tahmin etmesin, USDA'dan bulup toplasın"):** Çoklu yemekte artık **her bileşen ayrı ayrı USDA'dan** çekiliyor (gramına ölçekli, `Promise.all` paralel), USDA bulamazsa o bileşen AI tahminine düşer, sonra **server toplar**. Yanıt `{ai:toplam, items:[{...,source:'usda'|'ai'}], source:'usda'|'mixed'|'ai'}`. PWA etiketi kaynağa göre ("Veritabanı" / "Veritabanı + AI" / "Toplam (AI)"), bileşen dökümünde AI olanlara "(tahmin)" notu. `db` alanı kaldırıldı (USDA artık toplama entegre). ⚠️ USDA İngilizce/jenerik; Türk yemek isimleri AI'nın verdiği `en` ile aranır (bonfile→beef tenderloin). **Cache:** v7-69 → v7-70
- **🐛 İki düzeltme (Salim: "2'den fazla yemeği algılamıyor + pirinç deyince pişmiş alıyor"):** (1) `parseMealItemsJson` artık **bare-dizi** (`[{},{},{}]`) çıktısını da parse ediyor — eski regex sadece `{...}` arıyordu, AI 3+ yemekte sarmalsız dizi dönünce kırılıyordu. Sıra: tüm string → `[...]` → `{...}`. (2) Prompt: "KAÇ yemek varsa HEPSİNİ çıkar, sınır YOK" + **çiğ/pişmiş ayrımı** ("pirinç"=raw white rice, "pilav"=cooked) + 3'lü örnek. max_tokens 500→800. Test: bare-dizi/wrapped/fence/önsöz 3-4 öğe hepsi geçti. Sadece worker.js değişti (frontend aynı, cache bump yok).
- ⏳ Türkçe besin DB araştırıldı: **TürKomp** resmi ulusal DB (645 yemek) ama **API'si yok**; FatSecret API (OAuth+limit), Open Food Facts (paketli). Öneri: TürKomp değerlerinden gömülü Türk yemekleri DB (Salim henüz karar vermedi).

---

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

