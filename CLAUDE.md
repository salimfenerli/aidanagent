# Aidan - ADHD Asistanı Projesi

## Kullanıcı
- **İsim:** Salim
- **Durum:** ADHD, **kod bilmiyor**
- **Yapamadıkları:** Python kuramaz, terminal kullanamaz, complex setup yapamaz
- **Cihazlar:** Windows bilgisayar + **iPhone + Safari**
- **Yaklaşım:** Adım adım, görsel, sade. Net "şuraya tıkla, şunu yaz" tarzı yönergeler.

## Proje
Tek HTML dosyalı, browser-based ADHD asistanı. **PWA olarak telefon ve bilgisayara kurulu.**

## Mimari (Mevcut Durum)
- **Frontend:** `asistan.html` (~2350 satır, tek dosya HTML + CSS + JS)
- **Hosting:** Netlify → `https://aidanagent.netlify.app/asistan.html`
- **Deploy:** Manuel **drag-drop** (Netlify Dashboard → Deploys → klasörü sürükle)
- **Bulut Senkron:** Supabase ✓ çalışıyor
- **Bildirim:** ntfy.sh ✓ çalışıyor
- **PWA:** Manifest + Service Worker + icon.svg (iPhone'a kurulu ✓)
- **Cache versiyonu:** `aidan-v3-0` (sw.js içinde, her büyük değişikte artırılır)
- **AI:** Yok, sonraya bırakıldı

## Dosyalar (C:\Users\Salim\Desktop\claudedeneme\)
- `asistan.html` — ana uygulama
- `index.html` — asistan.html'e redirect
- `manifest.webmanifest` — PWA manifest
- `sw.js` — service worker (cache versiyon yönetimi)
- `icon.svg`, `icon-maskable.svg` — PWA ikonları
- `CLAUDE.md` — bu dosya

## Özellikler

### Görevler
- Öncelik (acil/normal/düşük) + kategori (ödev/ev/kişisel) + son tarih + tahmini süre
- Alt görevler (Böl ile oluştur, sonradan + alt adım ekle, × ile sil)
- Tekrarlı: günlük / haftalık / **hafta içi (Pzt-Cum)** / **hafta sonu (Cmt-Paz)**
- **⭐ Bugünün 3'ü (MIT)** — günde en fazla 3 öncelik, üstte sabit kutu, hepsi bitince kutlama
- **🔥 Streak** — günlük tekrar görevde ardışık gün sayacı (3/7/14/30/60/100. günlerde kutlama)
- **🔔 Saat hatırlatması** — opsiyonel görev için saat (ntfy + browser notif)
- **✏️ Düzenleme** — görev metni modal'la değişebilir
- **🔍 Arama** — yazdıkça filtreli (görev + alt görev metni)
- **🏷️ Filtre chip'leri** — Hepsi / Bugün / Acil / Ödev / Ev / Kişisel / Bitenler (sayaçlı, son seçim hatırlanır)
- **📦 Yarın/Sonra ayrı** — gelecek tarihli görevler katlanır panelde
- **🎯 "Şu an ne yapayım?" butonu** — akıllı tek görev öneri modal'ı (MIT → acil → bugün → kısa → rastgele)
- Manuel "bitti" tıklandığında tahmin varsa "kaç dk sürdü?" sorar

### Odak (Pomodoro)
- 5/15/25/50 dk seçenekleri, dairesel timer
- Bugün sayacı + **son 7 gün bar grafik**
- Hyperfocus uyarısı — **gerçek aktivite**ye bağlı (5 dk hareketsizlik → sayaç sıfırlanır)

### Brain Dump
- Düşünce dökme
- **📋 Göreve çevir** — notu modal'la düzenleyip görev olarak ekle, dump silinir

### Rutinler & Check-in
- Saat bazlı rutinler (ntfy bildirim)
- Mood tracking (5 emoji: 😄/🙂/😐/😩/😴) + opsiyonel not + ADHD-aware toast cevapları

### Üst Bar (zaman körlüğü için)
- Şu an saati / Sonraki rutin / Kesintisiz çalışma

### Ayarlar
- ntfy.sh topic + test/web aç butonları
- Hyperfocus ayarları (aktif/pasif + dakika)
- Supabase URL/key + email-şifre auth + manuel senkron butonu
- Yedekleme (JSON export/import) + sıfırla

### Genel UI
- **Toast bildirimleri** (sağ üst, kayar, 4 renk: info/success/warning/error)
- **Custom modal sistemi** — `aidanPrompt(title, label, default, multiline)` Promise döner
- **Suggest modal** — "Şu an ne yapayım?" için
- Motivasyon banner (× ile kapatılabilir, session boyu gizlenir)

## Tasarım
- **Tema:** Koyu, sade. GitHub/Linear tarzı.
- **Renkler:** CSS variables (--bg, --surface, --accent indigo, --warning altın MIT için, vs.)
- **Mobil:** Tüm UI mobile-first, görev kartı 4 buton (☆ ▶️ ✏️ 🗑️)

## Supabase Kurulumu ✅ TAMAMLANDI
- **Proje:** Salim'in kendi Supabase projesi (`fluhzvzulrnfyqogrgfi.supabase.co`)
- **Email:** `fenerlisalim04@gmail.com`
- **Tablo:** `aidan_data` (user_id, data jsonb, updated_at) — RLS aktif
- **Auth:** Email + Şifre (Magic link bırakıldı)
- **3 Policy:** SELECT/INSERT/UPDATE — auth.uid() = user_id
- **GRANT:** authenticated rolüne verildi
- **Site URL:** `https://aidanagent.netlify.app` (path olmadan)

## Çözülen Sorunlar (Geçmiş Notlar)
- **Site URL** önce `/asistan.html` ile yazılmış → düzeltildi (path olmamalı)
- **Aidan'a girilen Project URL** `/rest/v1` ile yazılmış → kod otomatik kırpıyor
- **"Confirm email" toggle** bulunamadı → SQL ile manuel set edildi (sonra signup düzeldi)
- **Permission denied** → GRANT eksikti, `GRANT ... TO authenticated` ile çözüldü
- **Settings → Tasks geri atma bug'ı** → realtime echo'su location.reload tetikliyordu, fix: 3sn echo grace period + render-only update
- **Body Doubling** (sahte tıklama sesleri) → silindi, gerçek body doubling değildi
- **Magic link kodu** → silindi (email+şifre yetiyor)
- **Hyperfocus yanlış tetikleme** → tab açık olmaktan değil, gerçek aktiviteden sayıyor artık
- **Üst barda yinelenen "Aidan açık" metriği** → silindi, 3 metrik kaldı
- **Görev kartında 5dk butonu** → silindi (Pomodoro'daki ile çakışıyordu), 4 buton kaldı
- **Mood 8 emoji** → 5'e indirildi (sadelik)
- **Placeholder motivasyon mesajı** ("Saat ___'de başladın") → düzeltildi
- **Manuel bitti süre kaydı** → görev tahmini varsa "kaç dk sürdü?" diye sorar

## Mevcut Durum
- ✅ Bilgisayar + iPhone'da PWA kurulu
- ✅ ntfy.sh telefon bildirimi çalışıyor
- ✅ Supabase bulut senkronu çalışıyor (her iki cihazda giriş yapıldı)
- ✅ Tasarım sadeleştirilmiş (GitHub/Linear tarzı)
- ✅ Büyük özellik seti eklendi (MIT, streak, arama, filtre, dump→görev, hatırlatma, hafta içi/sonu, pomodoro trend, vs.)
- ⏳ AI hâlâ beklemede (API key gelince eklenecek)

## Önemli Kararlar
- ❌ **Şifreleme yok** (master password) — karmaşıklık, unutma riski
- ❌ **Magic link bıraktık** — redirect URL sorunları
- ✅ **Email+şifre auth** — basit, dayanıklı
- ✅ **localStorage + cloud sync** — Supabase'e debounced push, realtime pull
- ✅ **MIT 3 limit kasıtlı** — ADHD beyni 3'ten fazlasında dağılır
- ✅ **Streak sadece daily için** — weekdays/weekends streak mantığı karmaşık, sonraya
- ⏳ **AI sonraya bırakıldı**
- ⏳ **Native app yok** — PWA yeterli

## Kullanıcının Üslubu
- "Süper", "tamam oldu" tarzı kısa onaylar
- Hata mesajlarını tam aktarır
- Türkçe yazıyor, Türkçe cevap istiyor
- Yorulduğunda "boşa token harcanmasın" gibi pragmatik notlar veriyor
- "Sıkmadan", "fazlalıklar neler" gibi sade/keskin sorular sorar
- Karar verirken "sen ne dersin / en uygunu ne sence" diye soruyor → öneri yapıp tek seçenekle git, gerekçesini söyle

## Yanıtlama Tarzı
- **Kısa, eylem odaklı** yanıtlar
- **Numaralı adımlar** + emoji başlıklar + tablo
- "Şuraya tıkla, şunu yaz" netliği
- Onun yapamayacağı şeyleri (kod) ben yapıyorum, yapabileceği şeyleri (browser tıklamaları) ona anlatıyorum
- ADHD friendly: uzun duvarlar yerine kısa, parçalı bilgi
- Verdiğim her uzun kılavuzdan sonra "şimdi 1. adımı yap, bittiğinde söyle" demek
- **Task listesi kullanıyorum** (TaskCreate/Update) — çoklu işlerde Salim'in görmesi için
- Her büyük değişiklik setinden sonra **sw.js cache versiyonunu artır** (telefon PWA'sı eski cache'i atsın diye)

## URL'ler
- Aidan: `https://aidanagent.netlify.app/asistan.html`
- Netlify Dashboard: `https://app.netlify.com`
- Supabase Project: `https://supabase.com/dashboard/project/_`
- Supabase SQL Editor: `https://supabase.com/dashboard/project/_/sql/new`
- Supabase Auth Providers: `https://supabase.com/dashboard/project/_/auth/providers`

## Deploy Süreci
1. Ben dosyaları düzenliyorum (HTML/SW)
2. **sw.js cache versiyonunu artırıyorum** (örn `v3-0` → `v3-1`)
3. Salim → Netlify Dashboard → **aidanagent** → **Deploys** sekmesi
4. Sayfanın altındaki **"Drag and drop"** kutusuna **`claudedeneme` klasörünü** sürükler
   - ⚠️ KLASÖR sürüklenir, tek dosya değil — yoksa diğer asset'ler kaybolur
5. Telefonda PWA güncellemesi: App Switcher'dan Aidan'ı kapat → tekrar aç
6. Bilgisayarda: Ctrl+Shift+R

## Test Edilmesi Gereken (Bekleyen Bug Listesi)
- 🐛 Service worker dış kaynakları (Supabase JS CDN) cache'liyor mu? Eski sürüm kalıyor olabilir
- 🐛 Hyperfocus alarm 45dk sonra spam mı oluyor (her 45dk tekrar mı çalıyor)
- 🐛 Mobil görev kartında 4 buton sığıyor mu (önce 5'ti, kaldırdık)
- 🐛 "Şu an ne yapayım" modal'ı bilgisayarda ESC ile kapanıyor mu

## Yol Haritası
- **Şimdi:** Salim deploy edip test ediyor. Bug raporlarını bekliyoruz.
- **Sonra:** Yukarıdaki bug listesini doğrula/düzelt
- **Sonra:** Claude API entegrasyonu (key alabildiğinde)
- **İleride opsiyonel:** True custom tekrar (Pzt-Çar-Cum checkbox), mood grafik, dış kaynak cache stratejisi düzeltme, görev sürükle-bırak sıralama

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
  lastStreakDate: null        // 'YYYY-MM-DD'
}
```

## Veri Modeli — data root (localStorage 'aidan')
```js
{
  tasks: [...],
  dumps: [{text, when}],
  routines: [{id, time, name, lastFired}],
  checkins: [{emoji, label, note, when}],
  pomoToday: {date, count},
  pomoHistory: {'YYYY-MM-DD': count},
  settings: {
    ntfyTopic, hyperfocusEnabled, hyperfocusMin,
    supaUrl, supaKey
  }
}
```
