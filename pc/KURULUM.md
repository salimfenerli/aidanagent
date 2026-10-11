# 💻 Bilgisayar ekran süresi → Aidan (11 Eki 2026)

**Ne yapar:** Bilgisayarda hangi programda/sitede ne kadar kaldığın (başında değilken sayılmaz) yarım saatte bir Aidan'a gider. Sohbete sor: "bugün bilgisayarda ne kadar YouTube izledim?"

## Kurulum (bir kere, ~5 dk)
1. **ActivityWatch'ı kur:** https://activitywatch.net → Download → Windows → kur ve aç (sağ altta saat yanında simgesi çıkar). Başlangıçta açılsın ayarı varsayılan açık.
2. **Site adları için (isteğe bağlı):** Chrome Web Mağazası → "ActivityWatch Web Watcher" eklentisini ekle.
3. **GitHub Desktop → Fetch → Pull**, sonra *Repository → Show in Explorer* → `pc` klasörü.
4. **`kur.bat`'a çift tıkla** → gizli anahtarı yapıştır (iPhone'daki Aidan Sağlık kısayolunun adresinde `secret=`'den sonraki kısım) → Enter.
5. Ekranda `OK 2026-10-11: 3s 20dk · en çok chrome` gibi bir satır görürsen tamam.

## Sorun olursa
- `son-gonderim.txt` dosyasında son durum yazar.
- **"ActivityWatch çalışmıyor"** → ActivityWatch'ı aç.
- **"404"** → gizli anahtar yanlış → `kur.bat`'ı tekrar çalıştır.
- Durdurmak: `kaldir.bat`.

⚠️ `ayar.txt` gizli anahtarını tutar — `.gitignore`'da, GitHub'a GİTMEZ. Kimseyle paylaşma.
