# 📱 iPhone'a Aidan Kısayolları Kur

Bu kısayollarla iPhone'undan **Siri + tek tık** Aidan'a not bırakacaksın.
Hepsi ücretsiz, ekstra app gerekmiyor — sadece **Kısayollar** (Shortcuts) app.

---

## 🔑 Önce: Bot bilgilerini hazırla

İhtiyacın olan 2 şey (`.env`'den bul, kimseyle paylaşma):

- **BOT_TOKEN** — örn `7826532789:AAH...` (Telegram BotFather verdi)
- **CHAT_ID** — `7264211579` (senin ID'in)

Bu ikisini iPhone'a **Apple Notes**'a kaydet, kısayol kurarken kopyala-yapıştır lazım olacak.

---

## 🎤 Kısayol 1: "Aidan'a not bırak" (Siri ile sesli)

**Kullanım:** "Hey Siri, **Aidan'a not bırak**" de → Siri "ne not bırakayım?" diye sorar → konuş → Telegram bot'a otomatik gider, brain dump'a düşer.

### Kurulum (5 dk)

1. iPhone'da **Kısayollar** app'ini aç
2. Sağ üstte **+** tıkla
3. **Eylem Ekle** (Add Action) tıkla
4. Arama kutusuna **"Dikte Et"** yaz, **Metin Dikte Et** seç
   - Bu Siri'nin konuşmayı yazıya çevirir
5. Tekrar **+** tıkla → **"URL'nin İçeriğini Al"** (Get Contents of URL) ekle
6. URL kutusuna yapıştır:
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/sendMessage
   ```
   ⚠️ `<BOT_TOKEN>` yerine GERÇEK token'ı yapıştır
7. URL kutusunun altındaki **▾ Göster Daha Fazla** tıkla
8. **Yöntem (Method)**: `POST` seç
9. **İstek Gövdesi (Request Body)**: `JSON` seç
10. **+ Yeni Alan Ekle**:
    - Alan adı: `chat_id` · Tip: **Sayı (Number)** · Değer: senin chat ID (örn `7264211579`)
    - **+ Yeni Alan Ekle** → Alan adı: `text` · Tip: **Metin (Text)** · Değer kutusuna **dokun** → açılan listede **Diktelenmiş Metin** (Dictated Text) seç
11. Üstten **kısayol adını** "Aidan'a not bırak" yap
12. **Bitti** (Done) tıkla

### Test
- Siri'ye "**Hey Siri, Aidan'a not bırak**" de
- "Söyle bakalım" gibi soracak → konuş: "yarın saat 3'te diş hekimi"
- Telegram'da bot'tan cevap gelecek: "✅ Brain dump'a eklendi" gibi

---

## 📊 Kısayol 2: "Aidan durum" (bugünün özeti)

**Kullanım:** "Hey Siri, **Aidan durum**" → Telegram'da bugünün özeti hemen gelir.

### Kurulum (2 dk)

1. Yeni kısayol (sağ üstte +)
2. **URL'nin İçeriğini Al** ekle
3. URL: `https://api.telegram.org/bot<BOT_TOKEN>/sendMessage`
4. Yöntem: POST, Gövde: JSON
5. Alanlar:
   - `chat_id` (Number) → senin chat ID
   - `text` (Text) → `bugün ne yapayım`
6. Kısayol adı: "Aidan durum"
7. Bitti

### Test
- "Hey Siri, **Aidan durum**" → Telegram'a brifing gelir

---

## ⚡ Kısayol 3: Share Sheet'ten görev ekle

**Kullanım:** Safari/Mail/Notlar'da bir yazıyı **seç → Paylaş → Aidan'a görev ekle** → görev olarak girer.

### Kurulum (3 dk)

1. Yeni kısayol
2. Üstten **i** ikonuna tıkla (settings) → **Paylaşım Sayfasında Göster** (Show in Share Sheet) açık olsun
3. **Eylem Ekle** → **URL'nin İçeriğini Al**
4. URL: `https://api.telegram.org/bot<BOT_TOKEN>/sendMessage`
5. Yöntem: POST, Gövde: JSON
6. Alanlar:
   - `chat_id` → senin chat ID
   - `text` → Metin alanına dokun → **Kısayol Girdisi** (Shortcut Input) seç
     - Yani paylaşım sayfasından gelen metin direkt görev olur
7. Kısayol adı: "Aidan'a görev ekle"
8. Bitti

### Test
- Safari'de bir başlık seç → Paylaş ikonu → aşağı kaydır → **Aidan'a görev ekle** → görev olarak gider

---

## 🔒 Güvenlik notu

Bot token'ı kısayolun içine yapıştırınca **iCloud Keychain'a şifreli kaydedilir**. Sadece senin iCloud'una bağlı cihazlardan erişilir. Yine de:

- ❌ Kısayolu **paylaşma** (link share) — token'ı içeriyor
- ✅ AirDrop ile başkasına yollarsan token'ı önce çıkar

---

## 🆘 Çalışmıyor mu?

- **"Yanıt bekleniyor" takılı kalıyor**: BOT_TOKEN yanlış. `.env`'den tekrar kopyala.
- **"Bot bana cevap yazmadı"**: chat_id yanlış. Sadece **senin** chat_id'inle bot konuşur.
- **Siri "Bu kısayolu çalıştıramadım"**: JSON gövdesinde alan adlarını kontrol et: `chat_id` (alt çizgi ve küçük harf), `text` (küçük harf).
- **Test için**: Kısayollar app içinden manuel ▶️ ile çalıştır, hata mesajı net gözükür.

---

## 🎁 Bonus: Kilit ekranı widget

iOS 16+ kilit ekranına **küçük kısayol butonu** koyabilirsin:

1. Kilit ekranını basılı tut → **Özelleştir** (Customize)
2. Saat altındaki widget alanı → **+ Widget Ekle**
3. **Kısayollar** seç → "Aidan'a not bırak" küçük buton
4. Bitti — kilit ekranında tek tıkla Siri tetiklenir

Sabah uyandığında telefonu kaldır → tek tık → "günaydın matematik var" diye konuş → bot'a düşer.
