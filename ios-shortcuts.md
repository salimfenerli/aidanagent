# ⭐⭐ TEK KISAYOL — tartı + uyku + nabız (7 Eki 2026, ÜCRETSİZ, ÖNERİLEN)

Eski iki kısayolun (tartı + sağlık) yerine **tek kısayol**. Tarih biçimlendirme, başlık (header),
uyku süresi hesabı **yok** — hepsini sunucu yapıyor. 5 eylem + 1 otomasyon.

**Önce:** eski "Tartımı Aidan'a gönder" kısayolunu ve ona bağlı otomasyonu SİL (karışmasın).
Xiaomi Home → Apple Sağlık ve Google Health → Apple Sağlık bağlantıları açık olsun.

## Kısayol: "Aidan Sağlık"
Kısayollar → **+** → her adımda **Eylem Ekle** → aramaya yaz:

1. **Sağlık Örneklerini Bul** → Tür: **Kilo** · Sırala: Başlangıç Tarihi · **En Yeni Önce** · Limit: **1**
2. **Sağlık Örneklerini Bul** → Tür: **Vücut Yağ Yüzdesi** · En Yeni Önce · Limit **1**
3. **Sağlık Örneklerini Bul** → Tür: **Uyku Analizi** (aramada "uyku" yaz) · Filtre: **Başlangıç Tarihi → son 1 gün içinde** · Sırala: Başlangıç Tarihi · **En Eski Önce** · **Limit KAPALI**
   ⚠️ 8 Eki dersi: Sağlık bir geceyi onlarca parçaya böler (Yatakta, Çekirdek, Derin, REM, Uyanık). Limit 1 → tek parça gelir
   (yatış 23:00 = uyku programı, kalkış boş). Limit kapalı → TÜM parçalar gider, gerçek yatış/kalkış/süreyi sunucu çıkarır.
4. **Sağlık Örneklerini Bul** → Tür: **Dinlenme Nabzı** · En Yeni Önce · Limit **1**
5. **URL'nin İçeriğini Al**
   - URL: `https://aidan-pusher.fenerlisalim04.workers.dev/health?secret=GİZLİ_ANAHTAR`
   - ▾ Daha Fazla → Yöntem: **POST** · İstek Gövdesi: **JSON** · **Yeni Alan** (8 tane, hepsi *Metin*):

   | Alan | Değer (değişkene dokun → özelliği seç) |
   |---|---|
   | `kg` | 1. adımın çıktısı → **Değer** |
   | `kgDate` | 1. adımın çıktısı → **Başlangıç Tarihi** |
   | `fat` | 2. adımın çıktısı → **Değer** |
   | `bedtime` | 3. adımın çıktısı → **Başlangıç Tarihi** |
   | `wake` | 3. adımın çıktısı → **Bitiş Tarihi** |
   | `stage` | 3. adımın çıktısı → **Değer** (Çekirdek/Derin/Uyanık… — uyunan süreyi ayırır) |
   | `rhr` | 4. adımın çıktısı → **Değer** |
   | `rhrDate` | 4. adımın çıktısı → **Başlangıç Tarihi** (8 Eki: yoksa dünkü nabız bugüne yazılıyordu) |

   Değişken eklerken: alanın değer kutusuna dokun → klavyenin üstündeki çubuktan ilgili "Sağlık Örnekleri"ni seç → eklenen mavi kutuya tekrar dokun → **Değer / Başlangıç Tarihi / Bitiş Tarihi**. Tarih **biçimlendirmene gerek yok**.
6. (İsteğe bağlı) **Bildirim Göster** → içerik: 5. adımın çıktısı — ilk denemede ne döndüğünü görürsün.

**Test:** ▶︎'e bas → bildirimde `"ok":true` ve `"summary"` görmelisin. Hata görürsen ekran görüntüsünü Claude'a at.

## Otomasyon: kendi kendine çalışsın
Kısayollar → **Otomasyon** → **+** → **Uygulama** → **WhatsApp** (ya da her sabah açtığın bir uygulama) → **Açıldığında** ✓ → **Hemen Çalıştır** · Çalıştığında Bildir: kapalı → kısayol: **Aidan Sağlık**.

⚠️ **Saate bağlama** ("her gün 08:00"): Apple telefon KİLİTLİYKEN sağlık verisini okutmuyor → boş veri gider.
Uygulama açılınca tetiklenirse telefon açıktır. Her açılışta çalışması sorun değil: değişiklik yoksa sunucu hiçbir şey yazmaz.

---

# ⭐ KISAYOLSUZ YOL — Health Auto Export (6 Eki 2026, ÖNERİLEN)

Kısayol kurmak yerine **Health Auto Export** uygulaması Apple Sağlık'ı kendisi okuyup Aidan'a yollar.
Zincir: **Fitbit → Google Health (v5.05+) → Apple Sağlık → Health Auto Export → Aidan**

**Gerekli:** App Store → "Health Auto Export - JSON+CSV" · otomasyon için **Premium** (aylık $1.99 / yıllık $6.99 / ömür boyu $24.99).

1. **Google Health** uygulamasında Apple Sağlık bağlantısı AÇIK olsun (uyku, adım, nabız, HRV yazsın).
2. Health Auto Export'u aç → Apple Sağlık izinlerinin hepsine **İzin ver**.
3. **Automations → yeni otomasyon → REST API**
4. **URL:** `https://aidan-pusher.fenerlisalim04.workers.dev/health?secret=GİZLİ_ANAHTAR`
   (GİZLİ_ANAHTAR = Cloudflare → aidan-pusher → Settings → Variables → `WEBHOOK_SECRET`; tartı kısayolundakiyle aynı)
5. **Data type:** Health Metrics · **Format:** JSON · **Aggregate / Time grouping:** Day (günlük)
6. **Metrikler:** Step Count · Active Energy · Resting Heart Rate · Heart Rate Variability · Sleep Analysis · (istersen) Weight & Body Fat Percentage
7. **Date range:** son 2 gün · **Sıklık:** saatte bir (uygulama arka planda çalışır)
8. **Manual export** ile bir kez dene → Aidan → Diyet sekmesinde uyku kartı dolmalı.

Menü adları sürüme göre biraz farklı olabilir; mantık aynı: REST API + JSON + günlük toplam.
Uç biçimi otomatik tanır (`haeToItems`); eski Kısayol yolu da çalışmaya devam eder.

---

# 📱 iPhone Kısayolları — Tartı verisini Aidan'a otomatik gönder

Amaç: her sabah tartıya çıkacaksın, **sen hiçbir şey yapmadan** kilo ve yağ oranı Aidan'a düşecek.

Zincir şu:

```
Tartı → Xiaomi Home → Apple Sağlık → [Kısayol] → Aidan
        └── zaten çalışıyor ──┘        └─ bunu kuracaksın ─┘
```

İhtiyacın olan tek şey iPhone'da zaten kurulu olan **Kısayollar** uygulaması. Ekstra app yok, ücret yok.

---

## 🔧 Adım 0: Önce iki şeyi hazırla (5 dk)

### A) Xiaomi → Apple Sağlık izni

1. iPhone'da **Ayarlar** → **Sağlık** → **Veri Erişimi ve Aygıtlar**
2. Listeden **Mi Home / Xiaomi Home**'u seç
3. Şunları **aç**: `Kilo`, `Vücut Yağ Yüzdesi`, `Vücut Kitle İndeksi`
4. Kapalıysa veri hiç akmaz — bu adımı atlama

> Xiaomi Home uygulaman **8.7 veya üstü** olmalı. App Store'dan güncelle.

### B) Gizli anahtarı bul

Aidan'ın Worker'ında `WEBHOOK_SECRET` adında bir anahtar var.

- Cloudflare Dashboard → **Workers & Pages** → `aidan-pusher` → **Settings** → **Variables**
- `WEBHOOK_SECRET` değerini kopyala

Bunu iPhone'da **Notlar**'a geçici olarak yapıştır — birazdan lazım olacak. Kısayolu kurduktan sonra nottan sil.

---

## ⚖️ Kısayol: "Tartımı Aidan'a gönder"

### Kurulum

1. **Kısayollar** uygulamasını aç → sağ üstte **+**

2. **Eylem Ekle** → arama kutusuna **"Sağlık Örneklerini Bul"** yaz, seç
   - **Tür**: `Kilo`
   - **Sırala**: `Başlangıç Tarihi` · **Sıra**: `En Yeni Önce` · **Limit**: `1`

3. **+** → **"Sağlık Örneği Ayrıntılarını Al"** ekle
   - Ayrıntı: **`Değer`**
   - Bunu **Değişkene Ayarla** ile `kilo` adında bir değişkene kaydet
     (Eylem Ekle → "Değişkene Ayarla" → adı: `kilo`)

4. Şimdi aynısını yağ oranı için tekrarla:
   - **"Sağlık Örneklerini Bul"** → **Tür**: `Vücut Yağ Yüzdesi` · En Yeni Önce · Limit 1
   - **"Sağlık Örneği Ayrıntılarını Al"** → **Değer**
   - **"Değişkene Ayarla"** → adı: `yag`

5. **+** → **"URL'nin İçeriğini Al"** ekle
   - URL kutusuna yapıştır:
     ```
     https://aidan-pusher.fenerlisalim04.workers.dev/body
     ```
   - Altındaki **▾ Daha Fazla Göster**'e dokun
   - **Yöntem**: `POST`
   - **Başlıklar (Headers)** → **Yeni Başlık Ekle**:
     - Anahtar: `X-Aidan-Secret`
     - Değer: Adım 0-B'de kopyaladığın anahtar
   - **İstek Gövdesi**: `JSON`
   - **Yeni Alan Ekle** (iki alan):
     | Alan adı | Tip | Değer |
     |---|---|---|
     | `kg` | Metin | değişken **kilo** |
     | `fat` | Metin | değişken **yag** |
     | `date` | Metin | değişken **olcumTarihi** (aşağıya bak) |

#### ⚠️ `date` alanını atlama — 6 Eylül 2026'da bu yüzden bozulduk

Kısayol "**en son** Sağlık örneğini" okuyor. Xiaomi → Apple Sağlık bağlantısı
koparsa örnek yenilenmiyor ama Kısayol yine de çalışıyor: **haftalar önceki
ölçümü bugünün kilosu olarak** yolluyor. Gerçekte olan buydu — 14 Ağustos,
1 Eylül ve 8 Eylül kayıtları birbirinin aynısıydı (68.8 kg / %15.5).

Bu, veri gelmemekten **daha kötü**: trend canlı görünüyor, kilo eğimi sahte
düz çıkıyor, kalori kalibrasyonu çöple besleniyor ve "tartım gelmiyor"
uyarısı da susuyor çünkü teknik olarak kayıt var.

**Çözüm — ölçümün KENDİ tarihini yolla:**

- Adım 2'deki "Sağlık Örneklerini Bul" (Kilo) çıktısına bir tane daha
  **"Sağlık Örneği Ayrıntılarını Al"** ekle → Ayrıntı: **`Başlangıç Tarihi`**
- **"Tarihi Biçimlendir"** ekle → Biçim: **Özel** → `yyyy-MM-dd`
- **"Değişkene Ayarla"** → adı: `olcumTarihi`
- Yukarıdaki tabloda `date` alanına bu değişkeni koy

Böylece bayat bir örnek kendi eski tarihine yazılır (zararsız), bugüne değil.

**Ayrıca sunucu da koruyor:** `date` yollamasan bile, gelen ölçüm en son
kayıtla birebir aynıysa ve o kayıt 2+ gün eskiyse uç **yazmıyor** ve
bildirimde şunu döndürüyor:

```
⚠️ Tartı verisi yenilenmemiş — 2026-09-01 ölçümünün aynısı geliyor (68.8 kg).
Xiaomi Home → Apple Sağlık bağlantısını kontrol et.
```

Bu bildirimi görüyorsan sorun Aidan'da değil: **tartı → Xiaomi Home → Apple
Sağlık** halkalarından biri kopmuş. Sırayla bak: tartıya çık ve Xiaomi Home
uygulamasında yeni ölçüm göründü mü · Ayarlar → Sağlık → Veri Erişimi'nde
Xiaomi'nin `Kilo` ve `Vücut Yağ Yüzdesi` izinleri hâlâ açık mı.

     > Değer kutusuna dokununca çıkan listeden değişkeni seç — elle yazma.

6. **+** → **"Bildirim Göster"** ekle
   - İçerik: **URL'nin İçeriği** (bir önceki adımın çıktısı)
   - Bu, işin olup olmadığını görmeni sağlar. Aidan cevabında `summary` diye bir satır döner.

7. Üstten kısayol adını **"Tartımı Aidan'a gönder"** yap → **Bitti**

### Test et

Kısayollar listesinde kısayola dokun. Bildirimde şuna benzer bir şey görmelisin:

```
{"ok":true,"saved":1,"summary":"2026-07-25: 72.4 kg · %18.2 yağ"}
```

`"ok":true` görüyorsan tamam. Aidan'ı aç → **Diyet** sekmesi → Kilo kartında görünecek.

---

## ⏰ Her sabah kendi kendine çalışsın

1. Kısayollar uygulaması → alt sekmeden **Otomasyon**
2. **+** → **Günün Saati**
3. Saat: **09:00** · Tekrar: **Günlük**
4. **İleri** → kısayol olarak **"Tartımı Aidan'a gönder"** seç
5. ⚠️ **"Çalıştırmadan Önce Sor"u KAPAT** → "Hemen Çalıştır"ı seç
   - Bunu kapatmazsan her sabah onay bildirimi çıkar, ADHD beynine gereksiz bir karar daha ekler

Bitti. Bundan sonra elini sürmüyorsun.

---

## 📊 Geçmiş tartımları toplu yükle (tek seferlik)

Kısayol bugünden itibaren çalışır. Eski tartımların da içeri girsin ki Aidan'ın eğilim
analizi ilk günden anlamlı olsun (regresyon için en az 4 tartım + 2 hafta gerekiyor).

1. **Xiaomi Home** uygulaması → tartı cihazın → geçmiş/veri ekranı → **Dışa Aktar** (CSV)
2. Dosyayı iPhone'dan bilgisayara ya da iCloud Drive'a at
3. Aidan → **Diyet** sekmesi → Kilo kartı → **"Tartı geçmişini yükle (CSV)"**
4. Aidan sana kaç tartım bulduğunu ve tarih aralığını gösterir → onayla

> Aynı güne ait mevcut kayıtların **silinmez**, birleştirilir. Rahatça yükleyebilirsin.

---

## 🆘 Çalışmıyor mu?

| Belirti | Sebep | Çözüm |
|---|---|---|
| Bildirimde `Not found` | Anahtar yanlış | `X-Aidan-Secret` başlığındaki değeri Cloudflare'den tekrar kopyala |
| `"ok":false, "geçerli ölçüm yok"` | Sağlık'ta veri yok | Xiaomi Home'da bir kez tartıl, izinleri kontrol et (Adım 0-A) |
| Kilo geliyor, yağ oranı gelmiyor | İzin kapalı | Ayarlar → Sağlık → Veri Erişimi → Xiaomi → `Vücut Yağ Yüzdesi` aç |
| Kısayol hata veriyor, mesaj yok | Değişken seçilmemiş | JSON alanlarında değeri **elle yazmadığından** emin ol, listeden değişken seç |
| Aidan'da eski tarih görünüyor | Tartılmamışsın | Kısayol Sağlık'taki **en son** ölçümü alır; o gün tartılmadıysan dünkü veriyi yollar |

**Aidan sessiz arızayı kendi yakalar:** 10 gündür yeni tartım gelmezse Diyet sekmesinde
"tartım kaydı gelmiyor — otomatik aktarım durmuş olabilir" uyarısı çıkar.

---

## 🔒 Güvenlik notu

- `X-Aidan-Secret` kısayolun içinde iCloud Keychain'e şifreli kaydedilir
- ❌ Kısayolu **link ile paylaşma** — anahtarı içeriyor
- Bu uç nokta **sadece** kilo/yağ oranı alanlarına yazar. Görev, diyet ya da borsa verine dokunamaz —
  anahtar sızsa bile birinin yapabileceği tek şey sahte tartım kaydı eklemek olur

---

## 🎁 Bonus: kilit ekranı butonu

1. Kilit ekranını basılı tut → **Özelleştir**
2. Saat altındaki widget alanı → **+ Widget Ekle** → **Kısayollar**
3. "Tartımı Aidan'a gönder" seç

Tartıdan iner inmez tek dokunuşla yollarsın — otomasyonun 09:00'ı beklemeden.

---

# 🫀 Uyku ve sağlık verisi — Fitbit Air → Aidan

Amaç: her sabah uyku süren, adımın, dinlenme nabzın ve HRV'n Aidan'a düşecek.
Uyku borcu motoru zaten yazılı — veri akmaya başladığı gün elle giriş biter.

Zincir şu:

```
Fitbit Air → Google Health → Apple Sağlık → [Kısayol] → Aidan
             └──── ikisini de sen kuracaksın ────┘   └─ uç hazır ─┘
```

> **Neden Fitbit'in kendi API'sini kullanmıyoruz:** Fitbit Web API Eylül 2026'da
> kapanıyor. Yerine gelen Google Health API yıllık güvenlik denetimi (CASA, 500–4.500 $)
> istiyor — tek kişilik projeye kapalı. Apple Sağlık köprüsü kalıcı çözüm, geçici yama değil.

---

## 🔧 Adım 0: Köprüyü aç (cihaz geldiğinde, 10 dk)

1. App Store'dan **Google Health** uygulamasını kur — sürüm **5.05 veya üstü** olmalı
   (çift yönlü Apple Sağlık senkronu 3 Ağustos 2026'da bu sürümle geldi; eskisinde
   veri Apple Sağlık'a **hiç** düşmez ve hattın geri kalanı sessizce boş çalışır)
2. Fitbit Air'ı **birleştirdiğin asıl Google hesabıyla** eşleştir
   — ⚠️ ilk eşleştirdiğin hesap kalıcı adres olur, sonradan değiştirmek veri taşımak demek
3. Google Health → Ayarlar → **Apple Sağlık** → yazma iznini aç: `Uyku`, `Adım`,
   `Dinlenme Nabzı`, `Kalp Atış Hızı Değişkenliği`, `Aktif Enerji`
4. iPhone → **Ayarlar** → **Sağlık** → **Veri Erişimi ve Aygıtlar** → **Google Health**
   → yukarıdaki beş izin **açık** mı, gözünle doğrula

Gizli anahtar tartıyla aynı: Cloudflare → `aidan-pusher` → Settings → Variables →
`WEBHOOK_SECRET`. Zaten Kısayol'un içinde varsa yeniden kopyalamana gerek yok.

---

## ⚙️ Kısayolu genişlet

Yeni bir kısayol **açma** — mevcut "Tartımı Aidan'a gönder"in içine ekle ve adını
**"Sabah verimi Aidan'a gönder"** yap. Tek otomasyon, tek bildirim, sabaha tek adım.

### A) Uyku (yatış + kalkış saati)

Uyku örneğinin "değeri" bir sayı değil, kategoridir — o yüzden süreyi değil
**saatleri** yolluyoruz. Uç yatış→kalkış farkını kendi hesaplıyor.

1. **Sağlık Örneklerini Bul** → Tür: `Uyku Analizi` · Sırala: `Başlangıç Tarihi`
   · Sıra: `En Yeni Önce` · Limit: `1`
2. **Sağlık Örneği Ayrıntılarını Al** → Ayrıntı: **`Başlangıç Tarihi`**
3. **Tarihi Biçimlendir** → Saat Biçimi: **Özel** → `HH:mm` → **Değişkene Ayarla**: `yatis`
4. Aynı örnek için **Sağlık Örneği Ayrıntılarını Al** → **`Bitiş Tarihi`**
   → **Tarihi Biçimlendir** `HH:mm` → **Değişkene Ayarla**: `kalkis`

> Fitbit'in bildirdiği "uyunan süre" saat farkından kısadır (uyanık kalınan dakikalar
> düşülür). Kısayol'dan doğrudan süreyi çekebilirsen `hours` alanı olarak yolla —
> uç ona öncelik verir, saatlerden türetmez.

### B) Adım ve aktif kalori (gün toplamı)

Bunlar gün içinde parça parça kaydedilir, tek örnek almak yanlış olur.

1. **Sağlık Örneklerini Bul** → Tür: `Adım` · Tarih aralığı: **bugün**
2. **Sağlık Örneği Ayrıntılarını Al** → `Değer`
3. **İstatistik Hesapla** → **Toplam** → **Değişkene Ayarla**: `adim`
4. Aynısını `Aktif Enerji` için tekrarla → **Değişkene Ayarla**: `kalori`

### C) Dinlenme nabzı ve HRV (günde tek ölçüm)

1. **Sağlık Örneklerini Bul** → Tür: `Dinlenme Nabzı` · En Yeni Önce · Limit `1`
   → **Ayrıntı: Değer** → **Değişkene Ayarla**: `nabiz`
2. Aynısını `Kalp Atış Hızı Değişkenliği` için → **Değişkene Ayarla**: `hrv`

### D) Aidan'a yolla

**URL'nin İçeriğini Al** ekle:

- URL: `https://aidan-pusher.fenerlisalim04.workers.dev/health`
- **Yöntem**: `POST`
- **Başlıklar** → `X-Aidan-Secret` = Cloudflare'den aldığın anahtar
- **İstek Gövdesi**: `JSON` → alanlar:

  | Alan adı | Değer |
  |---|---|
  | `bedtime` | değişken **yatis** |
  | `wake` | değişken **kalkis** |
  | `steps` | değişken **adim** |
  | `kcalOut` | değişken **kalori** |
  | `rhr` | değişken **nabiz** |
  | `hrv` | değişken **hrv** |

  > Değer kutusuna dokununca çıkan listeden değişkeni seç — elle yazma.
  > `date` alanını **yollamıyoruz**: uç TR saatine göre bugünü kullanır, kısayol
  > 09:00'da çalıştığı için bu zaten uyandığın gündür.

Sonuna **Bildirim Göster** → içerik: **URL'nin İçeriği**.

### Test et

```
{"ok":true,"saved":1,"sleep":1,"health":1,"summary":"2026-08-23: 7.5 saat uyku · 9120 adim · 58 bpm"}
```

`"ok":true` görüyorsan tamam. Aidan → uyku kartında görünür, uyku borcu aynı gün hesaplanır.

---

## 📊 Uç ne kabul ediyor

| Alan | Aralık | Not |
|---|---|---|
| `bedtime` / `wake` | `HH:MM` ya da tam ISO damgası | ikisi de olursa süre türetilir |
| `hours` | 0.5 – 16 | verilirse saatlerden **türetmeyi ezer** |
| `steps` | 0 – 100.000 | gün toplamı |
| `rhr` | 30 – 130 | dinlenme nabzı |
| `hrv` | 3 – 300 | SDNN, ms |
| `kcalOut` | 0 – 10.000 | aktif enerji |

Aralık dışı değer **sessizce düşer**, kayda girmez. Metin ve virgüllü ondalık
(`"6,8"`) kabul edilir — Kısayol her şeyi metin yollar.

Toplu geçmiş yüklemek için: `{"items":[{...},{...}]}` — tek istekte 400 güne kadar.

---

## 🆘 Çalışmıyor mu?

| Belirti | Sebep | Çözüm |
|---|---|---|
| Bildirimde `Not found` | Anahtar yanlış | `X-Aidan-Secret` değerini Cloudflare'den tekrar kopyala |
| `"ok":false, "gecerli olcum yok"` | Sağlık'ta veri yok | Google Health sürümü 5.05+ mı, yazma izinleri açık mı (Adım 0) |
| Uyku gelmiyor, adım geliyor | Uyku izni kapalı | Ayarlar → Sağlık → Veri Erişimi → Google Health → `Uyku` aç |
| Adım sayısı çok düşük | `İstatistik Hesapla` adımı yok | Toplam almadan tek örnek gidiyor demektir |
| `hours` saçma çıkıyor | Yanlış uyku örneği | En Yeni Önce · Limit 1 ayarını kontrol et; gündüz şekerlemesi seçilmiş olabilir |

---

## 🔒 Güvenlik notu

Bu uç **sadece** uyku ve günlük sağlık metriklerine yazar. Görev, diyet, tartı ya da
borsa verine dokunamaz — anahtar sızsa bile yapılabilecek tek şey sahte uyku kaydı
eklemek olur. Kısayolu **link ile paylaşma**, anahtarı içeriyor.
