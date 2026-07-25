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
