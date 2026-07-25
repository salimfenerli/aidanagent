# Aidan - ADHD Asistanı Projesi

## 🔴 GÜNCEL DURUM (özet — detaylı seans günlükleri: CHANGELOG.md)

**Mimari:** `asistan.html` tek dosya DEĞİL — 5 modül sırayla yüklenir: `supabase.js` → `core.js` (diyet + uyku + ortak helper) → `tasks.js` (sekme/gün planı/quick-capture/journal/dump) → `stocks.js` (borsa) → `ui.js` (görev render/timer/ayarlar/auth/takvim/chat). (`app.js` eski bundle'ı repodan kalkmış — 25 Tem'de doğrulandı.)

**⚠️ DÜZENLEME KURALI:** Büyük dosyalarda Edit riskli + sandbox `rm` YOK (`mv` var). Düzenleme = **Python byte-replace + `node --check`**; **.bak OLUŞTURMA**; rollback = `git checkout <dosya>`. EOL eşle: **styles.css TEK BAŞINA LF** · diğer HEPSİ CRLF (core.js/ui.js/tasks.js/stocks.js/supabase.js/sw.js/asistan.html/worker.js/CLAUDE.md). ⚠️ 25 Tem'de doğrulandı — eski not yanlıştı, byte-replace'te `assert b'\r\n' in b` ile kontrol et.

**AI = Google Gemini** (`gemini-3.5-flash`, ücretsiz katman; `env.GEMINI_MODEL` ile ezilir, `env.GEMINI_API_KEY` secret). Worker'da tek AI fonksiyonu `aiRun` → Gemini generateContent; `visionRun` de Gemini multimodal (portföy/Classroom görsel OCR, `{response}` sözleşmesi korunur). Cloudflare `env.AI.run` (eski Llama) **ARTIK KULLANILMIYOR** — yanıltıcı Llama yorumları 24 Tem'de temizlendi. Sesli giriş tarayıcıda Web Speech API (Whisper yok).

**Deployed büyük paketler (hepsi CANLI — detay CHANGELOG.md):**
- **AI sağlık koçu (v7-117):** uyku + Hevy antrenman + beslenme BİRLİKTE — lokal desen tespiti ($0) + `/health-coach` (Gemini) + Pazar otomatik rapor. Diyet sekmesi üstünde şerit.
- **Diyet:** barkod tarayıcı (html5-qrcode + Open Food Facts), Türk besin DB, USDA+AI arama, özel besin/tarif, takviye takibi, BMR/TDEE (`calcGoals`), çoklu+haftalık program, makro grafik.
- **Borsa:** 15 göstergeli teknik analiz, mum grafik, Fibonacci, temel analiz paneli (`/stock-fundamentals`), AI taktik, BIST100 kıyas, risk/stop/pozisyon-boyutu paneli, işlem alarmı, portföy görselden ekleme.
- **Görev/Plan:** otomatik gün planı + blok bildirimleri (v7-109), planlama zekası — geçmişten öğrenen `planHistory`/`planProfile` + otomatik toparlama (v7-110), haftalık sabit program (`fixedSchedule`).
- **Hevy fitness (v7-111):** antrenman senkron (`/hevy-sync` proxy) + 1RM/rekor takibi + planlayıcıya "antrenman günü" bağı. ⚠️ **Hevy Pro ŞART** (API key ücretsiz hesapta üretilemez). Canlı test Salim'de.
- **Çapraz-modül:** günlük skor kartı, "Aidan'ın notu" tek dürtü, takviye/odak geçmiş şeridi, Classroom ödev görselden ekleme.

### 🔴 25 Temmuz 2026 — ⚖️ VÜCUT KOMPOZİSYONU + OTOMATİK TARTI (v7-122)
Salim: "yağ oranı için Xiaomi S400 akıllı tartım var, ordan bilgi alabilir miyiz — her gün çeksin aktif olarak."
**Kilo tek başına yanıltıcıydı:** kilo sabitken yağ düşüp kas artabilir (rekompozisyon), `hcWeightTrend` bunu göremiyordu.

**Neden Xiaomi Cloud DEĞİL, Apple Health (kalıcı karar).** Xiaomi'nin resmî API'si yok; var olan her şey tersine mühendislik (token extractor, micloud). 4 duvar: ① Worker'ın veri-merkezi IP'si Xiaomi'de sürekli captcha tetikler ② Xiaomi hesap şifresi Worker secret'ında durmak zorunda kalırdı — Aidan'da hiçbir yerde gerçek şifre saklanmıyor ③ Xiaomi istekleri RC4 imzalı, Web Crypto RC4 desteklemiyor ④ resmî olmadığı için habersiz kırılır, **sessizce** — yeni kurulan doğruluk katmanının tam tersi. Xiaomi zaten Apple Health'e kendisi yazıyor; verinin çıkmasını beklediği kapı orası. **Bu maddeye tekrar zaman harcama.**

**PWA Apple Health'i okuyamaz** (HealthKit native-only) → köprü **iOS Kısayol**.

**1. Veri modeli.** `diet.weights[]` artık `{date, kg, fat, lean, src}` — `fat` yağ oranı (%), `lean` yağsız kütle (kg), `src` `'manual'|'health'|'csv'`. Yeni `upsertBody()` **alan alan birleştirir, üzerine yazmaz**: sabah Kısayol kiloyu, akşam elle yağ oranı girilirse ikisi de kalır. `lean` verilmemişse **birleşmiş kayıttan** türetilir (ilk yazımda sadece gelen veriden türetiliyordu → yakalandı, testte kilitlendi).

**2. `POST /body` (worker.js).** Kimlik `X-Aidan-Secret` header'ı (ya da `?secret=`), **Supabase token DEĞİL** — Kısayol'un token yenileyecek yeri yok, 1 saatlik access_token her sabah patlardı. Uç **sadece** `diet.weights`'e yazar; secret sızsa yapılabilecek tek şey sahte tartım eklemek. Tek `{kg,fat,lean,date}` ya da toplu `{items:[…]}`. Kısayol her şeyi metin yollar → string/virgüllü ondalık ve **kesirli yağ oranı (0.182 = %18.2)** kabul edilir. Cevapta `summary` döner (Kısayol bildirimde gösterir — sessiz başarı = fark edilmeyen arıza).

**3. CSV içe aktarım.** Xiaomi/Mi Fitness/Zepp dışa aktarımları tek standart kullanmıyor → sütunlar **sabit sıraya göre değil başlıktaki anahtar kelimeye göre** eşleştirilir; ayraç (`,`/`;`/tab) otomatik, 4 tarih biçimi, `'Fat Mass (kg)'` kilo sütunuyla karışmasın diye yağ ÖNCE ve kütle birimliler DIŞLANARAK aranır. Okunamayan satır atlanır ve **sayısı kullanıcıya söylenir**.

**4. Paylaşılan çekirdek (ui.js ↔ worker.js byte-byte özdeş).** Yeni `hcRegress(pts,key)` — tek seri en küçük kareler; `hcWeightTrend` artık kilo/yağ/yağsız kütleyi **ayrı ayrı** regres eder, eski alan adları (`slopeKgPerWeek`, `totalChange`…) geriye uyumlu korundu. Kurallar 12 → **15**: **F)** rekompozisyon (kilo sabit + yağ düşüyor → `good`) · **G)** yağsız kütle kaybı (`eksik-log` varsa susar) · **H)** **sessiz arıza tespiti** — 10 gündür tartım gelmiyorsa uyarır (Kısayol durduğunda haftalarca fark edilmezdi).

**5. AI prompt.** Yağ oranını nasıl okuyacağı eklendi: tek ölçüm ±%3-5 sapar, **sadece eğilim** yorumlanır; kilo+yağ birlikte okunur; yağsız kütle düşüyorsa **daha az yemek değil** protein/uyku önerilir. **16 yaş sınırları korundu + biri eklendi: yağ oranı için "ideal/hedef sayı" vermek YASAK.**

**🐛 Düzeltilen 2 mevcut bug:** kilo detay modalı `arr.map(w=>w.kg)` ile **NaN** üretiyordu (kilosuz kayıt gelince) · veri silinince **kaynak rozeti eski metniyle ekranda kalıyordu** (erken dönüş `renderWeightSrc`'yi atlıyordu).

**Doğrulama:** 73 test (18 CSV ayrıştırma + 9 worker upsert + 27 çekirdek/kural + 19 DOM) · paylaşılan çekirdek **16 fonksiyon 26825 bayt byte-byte özdeş** · **250 rastgele senaryoda PWA ↔ Worker birebir aynı fakt** · 6 dosya `node --check` temiz · EOL doğrulandı (styles.css LF, diğerleri CRLF).
**Yeni veri alanları:** `diet.weights[*].fat` / `.lean` / `.src`
**Yeni dosya yok** · **Rehber:** `ios-shortcuts.md` tamamen yeniden yazıldı (eski Telegram içeriği ölüydü)
**Cache:** v7-121 → **v7-122**

### 🔴 25 Temmuz 2026 — 🫀 SAĞLIK ANALİZ DOĞRULUĞU (v7-121)
Salim: "beslenme, ağırlık antrenmanı, uyku hepsini AI analiz etsin ve geliştirsin — bunu yüksek doğrulukta yapabiliyor muyuz?" **Cevap hayırdı.** Veri toplanıyordu ama AI'a giderken atılıyordu. Özellik değil, DOĞRULUK eklendi.

**Bulunan 6 doğruluk kaybı ve kapatılışı:**

**1. Antrenman analizi kördü (en büyük kayıp).** `buildHealthFacts` antrenman için sadece `${w.date} ${w.title}` gönderiyordu. Oysa `normalizeHevyWorkout` her seansta `volumeKg`/`setCount`/`durationMin`, her egzersizde `{name, tid, sets, volumeKg, top:{kg,reps,e1rm}}` saklıyor ve `h.prs` rekorları hesaplanıyordu — **hiçbiri fakta girmiyordu.** AI "gittin/gitmedin" dışında bir şey bilmediği için "antrenmanını geliştir" fiziksel olarak diyemiyordu.
- Yeni `hcHevyStats`: dönem hacmi, haftalık hacim serisi + son 2 hafta trendi, haftalık set, **kas grubu set dağılımı (itme/çekme/bacak/gövde)**, itme/çekme oranı, bacak payı, ortalama süre, en çok çalışılan 6 egzersiz ve **en çok yapılan 5 harekette e1RM eğilimi** (ilk yarı en iyisi → son yarı en iyisi, %değişim).
- **Kas grubu gerçek veriden:** yeni `hevyFetchTemplates` Hevy `/exercise_templates`'ten `tid → primary_muscle_group` haritası çeker, `data.hevy.muscles`'a yazar, 30 günde bir tazelenir (PWA `withTemplates` bayrağıyla ister, cron da tazeler). Harita yoksa `HC_NAME_HINTS` ad tahminine düşer ve fakta "%N tahmindir" notu girer.
- 🐛 Yan bug: PWA `w.durMin || w.duration` okuyordu, gerçek alan `durationMin` → **antrenman süresi PWA faktlarında hep 0 gidiyormuş.**

**2. Kısmi gün bias'ı (sessiz, sistematik).** Sadece kahvaltı girilen gün TAM GÜN sayılıp ortalamaya giriyordu → kcal ve protein **sistematik olarak düşük** çıkıyor, AI da buna bakıp "yetersiz besleniyorsun" diyordu. Ölçüldü: sentetik veride eski yöntem 2225 kcal, doğrusu 2600 — **%17 hata.** Artık `<2 öğün` ya da `<max(600, hedefin %50'si)` olan gün "kısmi" işaretlenir, ortalamaya KATILMAZ, sayısı ayrıca raporlanır.
- Ek: **makro kapsama oranı** — kcal girilip protein girilmeyen öğünler protein ortalamasını düşürüyordu. %85'in altındaysa fakta "gerçek alım bundan YÜKSEK, 'protein yetersiz' deme" notu girer.

**3. Kalori↔kilo tutarlılık kontrolü (yeni — asıl "yüksek doğruluk" burası).** Kilo eskiden sadece "ilk kayıt / son kayıt"tı. Artık `hcWeightTrend` **en küçük kareler regresyonu** ile kg/hafta eğimi verir (min 4 tartım + 2 hafta). `hcEnergyCheck` bunu kaloriyle birleştirir: `gerçek harcama ≈ ort.kcal − (eğim×7700/7)`, Mifflin-St Jeor TDEE ile karşılaştırır. Sapma ≥%20 ise **"eksik-log"** verdikti fakta girer ve prompt AI'a "bu sayılar olduğundan düşüktür, beslenme yetersizliği yorumu YAPMA, kaydı tamamlamayı öner" der. **Artık AI eksik loga tam veri muamelesi yapmıyor.**

**4. Karbonhidrat/yağ + öğün saati.** `m.carb`/`m.fat` her öğünde kayıtlıydı, fakta girmiyordu — eklendi. Yeni alan **`meal.at` ('HH:MM')**: core.js'teki 7 `day.meals.push` noktasının hepsi `mealNow()` ile damgalanır. Geç yeme (22:00 sonrası) analizi açıldı. Eski kayıtlarda yok, kapsama oranı raporlanır.

**5. Katmanlı pencere.** Tek 14 gün her şeye yetmiyordu. `HC_WIN = { sleep:14, diet:28, train:84, weight:84 }` — antrenman progresyonu ve kilo eğilimi 2-3 ay ister, uyku borcu 14 günlük bir olgudur.

**6. Lokal kurallar 6 → 12** (`healthPatterns`, AI'sız $0): hacim düşüşü/artışı · itme-çekme dengesizliği · **hiç çekme yok** (0'a bölme kaçağıydı, oran `null` dönüp uyarı hiç çıkmıyordu — testte yakalandı) · bacak ihmali · güç durgunluğu/gerilemesi/ilerlemesi · eksik log · yetersiz kayıt.

**⚠️ MİMARİ — PAYLAŞILAN ÇEKİRDEK (yeni kalıcı kural).** Önceki ikizler (PWA `buildHealthFacts` ↔ worker `buildHealthFactsSrv`) elle kopyalandığı için **kayıyordu**: aynı veriden iki farklı "OTOMATİK TESPİTLER" satırı çıkıyordu (uyku kuralları sadece PWA'daydı). Artık sayısal işin TAMAMI **`ui.js` ve `worker.js` içinde birebir aynı 573 satırlık blokta** (`hc*` önekli, hiçbir global okumayan saf fonksiyonlar): `hcHevyStats` · `hcNutritionStats` · `hcWeightTrend` · `hcEnergyCheck` · `hcSleepLines` · `hcSleepPatterns` · `hcHabitPatterns` · `hcTrainingPatterns` · `hcAllPatterns` · `hcBuildFacts`. Her iki `buildHealthFacts` ince sarmalayıcıya indi.
- **Bu bloğu düzenlersen İKİ DOSYAYA DA yaz** — test blok uzunluğunu ve içeriğini byte-byte karşılaştırıyor.

**AI prompt'u:** yeni alanların nasıl okunacağı eklendi (denge aralığı 0.8-1.3, durgunlukta önce uyku/yemek bak, "kısmi gün zaten ayrıldı tekrar düzeltme", "eksik-log varsa yetersizlik yorumu yapma"). **16 yaş güvenlik sınırları AYNEN korundu** (teşhis/ilaç/kalori kısıtlama/görünüm yorumu/aşırı antrenman yasak, max 2 öneri).

**Doğrulama:** paylaşılan çekirdek iki dosyada **byte-byte özdeş (29401 byte)** · **200 rastgele senaryoda PWA ve Worker birebir aynı faktları üretti** · 28 kural/kenar-durum testi (5 yeni kural + eski 6 kural regresyonu + ince-veri koruması + 0'a bölme + tarih sınırları) · 6 dosya `node --check` temiz · EOL doğrulandı (styles.css LF, diğerleri CRLF).
**Yeni veri alanları:** `data.hevy.muscles` / `.musclesAt` · `diet.days[*].meals[*].at`
**Cache:** v7-120 → **v7-121**

### 🔴 25 Temmuz 2026 — VERİ MİMARİSİ SERTLEŞTİRME (v7-120)
Kapsamlı değerlendirmenin çıkardığı 6 madde sırayla kapatıldı. **Özellik eklenmedi, dayanıklılık eklendi.**

**1. Senkron çakışma koruması (kritik — sessiz veri kaybı vardı).** Eski `pullFromCloud` yorumu aynen "Bulutta veri var — yereli onunla değiştir" idi: karşılaştırma/birleştirme/zaman damgası YOK. iPhone + PC birlikte kullanıldığı için telefon çevrimdışıyken yapılan değişiklik, uygulama açılınca sessizce siliniyordu. `updated_at` yazılıyordu ama **hiçbir yerde okunmuyordu**.
- Yeni durum: `aidan_syncRev` (son eşitlenen sürüm) + `aidan_dirty` (yerelde bekleyen değişiklik) izlenir. Karar matrisi: bulut aynı+temiz → hiçbir şey · bulut aynı+kirli → **yereli push et** · bulut yeni+temiz → uygula · **bulut yeni+kirli → ÇAKIŞMA, kullanıcıya sor** (her iki tarafın görev/öğün sayısı gösterilir).
- **Ezilen taraf HER durumda `aidan_conflictBackup`'a yedeklenir**, Ayarlar → "Çakışma yedeğini geri al" ile dönülebilir (`restoreConflictBackup`).
- `pushToCloudNow` artık `.select('updated_at')` ile **sunucunun yazdığı** sürümü geri okur — yerel ISO ile server timestamptz formatı farklı olsaydı her pull sahte çakışma sayardı.
- Realtime handler: bizden eski sürümü yoksayar (`revMs` ile ms'e indirip karşılaştırır), yerelde bekleyen varsa yedekleyip toast'la haber verir. Eski koddaki 3 saniyelik "echo penceresi" gerçek güncellemeleri de sessizce düşürüyordu.

**2. localStorage kota koruması.** 6 yerde çıplak `setItem` vardı, kota dolunca istisna fırlatıp o anki işlemi bozuyordu. Hepsi `saveLocal()`'a alındı: `QuotaExceededError`'da önce `pruneOldData(true)` ile agresif budama, sonra tek tekrar deneme, olmazsa kullanıcıya net uyarı. **İstisna asla dışarı sızmaz.**

**3. Veri budama.** `data.tasks` (bitmiş görevler ASLA silinmiyordu, sadece arşivde gizleniyordu) ve `data.diet.days` sonsuza büyüyordu (~700 KB/yıl). `pruneOldData()` — 180 günden eski **bitmiş** görev + diyet günü atılır, günde bir kez init'te çalışır. **Aktif görevlere yaşı ne olursa olsun dokunulmaz** (teste bağlandı).

**4. `defer`.** 5 script'e eklendi. `supabase.js` (201 KB) `<head>` içinde defer'siz durup çizimi bloke ediyordu. Gövdede inline `<script>` yok, script'ler zaten `</body>` öncesinde → sıra ve DOM erişimi güvenli.

**5. Ölü kod.** 7 fonksiyon, **112 satır** silindi (`addDump`/`dumpVoice`/`lookupMealMacros`/`renderAiFood`/`renderMealList`/`searchFood`/`saveSettings`). Kalan referans: 0.

**6. CSS — hipotez YANLIŞ çıktı.** "4 tema katmanı üst üste binmiş, aynı özellikler 2-4 kez tanımlanıyor" beklentisiyle bakıldı; gerçekte **1628 kuralın sadece 33'ü** (2.6 KB / %1.4) tamamen eziliyordu. Onlar silindi (188.3 → 185.7 KB). **CSS şişkin değil, uygulama gerçekten büyük** — ileride bu maddeye tekrar zaman harcama.

**Doğrulama:** 18 senkron testi (5 pull senaryosu + yedek + revMs format farkı) · 15 budama/kota testi · önceki 41+9+200 test regresyonsuz · 6 dosya `node --check` temiz.
**Cache:** v7-119 → **v7-120**

### 🔴 25 Temmuz 2026 — SAAT DİLİMİ BUG'I (v7-119) — EN KRİTİK DÜZELTME
Kod denetiminde bulundu. **`today()` UTC döndürüyordu**, Türkiye UTC+3 → **00:00–03:00 arası PWA bir önceki günü "bugün" sanıyordu.**
- **Etki (her gece, 3 saat boyunca):** 01:00'de bitirilen görev düne yazılıyor · gece yarısından sonra girilen uyku yanlış geceye · 00:30'daki öğün dünün kalorisine · "yarın 14:00 dişçi" bir gün geri · MIT/pomodoro/arşiv/erteleme hepsi kayıyor.
- **Daha kötüsü:** Worker `trToday()` ile TR saatini doğru hesaplıyordu → **PWA ile Worker o 3 saatte farklı gün söylüyordu**; cron'un yazdığını PWA başka güne okuyordu.
- **Düzeltme:** `core.js`'e tek yardımcı — `isoLocal(d)` (yerel saat dilimi ofsetini düşerek ISO tarih üretir). `today()` buna bağlandı ve **21 ham `toISOString().slice(0,10)` çağrısının 21'i** (core/tasks/stocks/ui) buradan geçirildi. Artık dosyada tek ham çağrı `isoLocal`'ın kendi içinde.
- **Doğrulama:** `TZ=Europe/Istanbul` altında 9 sınır testi (gece yarısı sonrası, gün dönümü, yıl dönümü, artık gün) + **24 saatin 1440 dakikasının hepsinde PWA `isoLocal` ile Worker `trToday` aynı günü veriyor.**
- **⚠️ Kalıcı kural:** Yeni kodda `new Date().toISOString().slice(0,10)` **ASLA** yazma — her zaman `isoLocal(d)` / `today()` / `shiftDateStr()` kullan.

**Aynı denetimde bulunan, henüz TEMİZLENMEYEN ölü kod** (7 fonksiyon, hiçbiri çağrılmıyor, dinamik dispatch de yok): `addDump`/`dumpVoice` (tasks.js), `lookupMealMacros`/`renderAiFood`/`renderMealList`/`searchFood` (core.js), `saveSettings` (ui.js). Ayrıca `app.js` artık repoda YOK (eski not güncellendi), modül isim çakışması da yok.

### 25 Temmuz 2026 — 😴 UYKU BORCU ALGORİTMASI (v7-118)
Salim: "uyku borcunu sadece toplama çıkarma değil, farklı bi algoritması var ya, öyle hesaplayalım." Haklıydı — eski `sleepDebt` son 7 gecenin (hedef−gerçek) düz toplamıydı.
- **Yeni model (`core.js`, Borbély iki-süreç modelinin sadeleştirilmişi):** `D = max(0, D*0.85 + contrib)`, eskiden yeniye 14 gece.
  - `SLEEP_DECAY 0.85` → borç günde %15 erir (**yarı ömür ~4.3 gün**), sonsuza birikmez.
  - `SLEEP_PAYBACK 0.5` → **fazla uyku açığı 1:1 kapatmaz**, yarı verimle öder (4sa'lik geceden sonra 10sa uyumak borcu silmez).
  - Gecelik tavan: açık en fazla **+4sa**, kredi en fazla **−2sa** (outlier koruması).
  - **0 tabanı — "uyku bankası" YOK**, borç negatife inmez (eski kod inebiliyordu).
  - **Kayıtsız gece "iyi uyudu" sayılmaz** — sadece erime uygulanır, `missing` sayacına yazılır.
- **Kalite→saat: kendinden öğrenen model (`sleepQualityModel`).** Öznel kalite ile ölçülen süre arasında korelasyon sadece orta düzeyde (r≈0.3–0.5) → **sabit katsayı uydurulmaz**. Hem kalite hem saat girilmiş **≥8 gece** birikince Salim'in kendi kalite başına **medyanı** hesaplanır, saatsiz geceler onunla borca girer (`est:true`, UI'da "kaliteden tahmin" notu, AI özetinde "tahmini"). Yetersiz veri → tahmin yok, gece sessizce atlanmaz, kart "N gece kayıtsız" der.
- **🐛 Düzeltilen 2 mevcut bug:**
  1. **Chip-only geceler tüm hesaplardan düşüyordu** — sabah sadece Kötü/Orta/İyi'ye basıp saat girmezsen `hours=null` oluyor, `sleepDebt`/`buildHealthFacts`/çapraz-sinyal hepsi o geceyi atıyordu → **borç sürekli 0 görünüyor, AI'a "UYKU: kayıt yok" gidiyordu.**
  2. **`badSleepStreak` eksik günde `break`** ediyordu → bir sabah kaydı unutulunca 5 gecelik kötü seri 2 görünüyordu. Artık tek gün boşluk seriyi bozmaz, 2 ardışık boşluk keser.
- **Bant + toparlanma:** `sleepDebtBand` (<2 temiz · <5 hafif · <9 belirgin · 9+ ağır) ve `sleepRecoveryNights` — "hedefin 1sa üstünde kaç gece uyursan kapanır". ADHD için soyut saatten çok daha eylemsel. `healthPatterns` #2 artık banda göre danger/warn seçiyor.
- **Worker ikizi:** `sleepDebtSrv` (`worker.js`) — cron sağlık raporu aynı sayıyı üretsin diye birebir port. AI prompt'una "bu sayı üstel ağırlıklı, düz toplam değil, **yeniden hesaplama**" notu eklendi.
- **Doğrulama:** 41 senaryo testi (üstel birikim, asimetrik ödeme, 0 tabanı, erime, gecelik tavan, kayıtsız gece, model eşiği, bantlar, streak bug'ı + 10 regresyon) · **200 rastgele senaryoda PWA↔Worker ikizleri birebir aynı** · `node --check` core/ui/sw/worker temiz.
- **CSS:** `.sleep-debt.bad` + `.sd-est` eklendi (tam kenar + tint, yan-şerit yok — Impeccable uyumlu).
- **Cache:** v7-117 → **v7-118**

### 25 Temmuz 2026 — 🫀 AI SAĞLIK KOÇU (v7-117)
Salim: "beslenme, spor, uyku verilerimi AI işleyip geliştirilebilir kısımları söylesin." Uyku (v7-113/116) ve Hevy (v7-111) ayrı ayrı vardı ama **hiçbiri birbirine bakmıyordu** — bu paket üçünü tek yerde birleştirir.
- **Yer:** Diyet sekmesinin EN ÜSTÜ — `#healthCoachStrip` (`renderHealthCoach`, `showTab('diet')` içinden çağrılır). Yeni sekme YOK.
- **Katman 1 — lokal desen tespiti (`healthPatterns`, $0, anında, AI YOK).** Mevcut helper'ları kullanır, yeniden yazmaz (`badSleepStreak`/`sleepDebt`/`sleepSeries`/`trainedOn`/`hevyWorkoutsIn`). 6 kural, ciddiyete göre sıralı (danger>warn>good), **max 3 satır**:
  1. 3+ gece ardışık kötü/az uyku (danger) · 2. 7 günlük uyku borcu ≥4sa · 3. yatış saati savrulması ≥2sa
  4. **ÇAPRAZ SİNYAL:** iyi uyuduğu günlerde antrenman oranı %40+ yüksekse → "uyku, spor planının görünmeyen yarısı"
  5. 7+ gün antrenman boşluğu / haftada 3+ seans (good) · 6. **antrenman günlerinde protein hedefin %70'inin altında**
- **Katman 2 — AI analizi.** `POST /health-coach` (Gemini, `aiRun`). `buildHealthFacts(14)` uyku+antrenman+beslenme+kilo+görev bağlamını düz metin özetler — **sayıları PWA hesaplar, AI uydurmaz** (portföy yorumu kalıbı). AI'ın en çok işine yarayan kesit: **antrenman günü vs dinlenme günü ortalama protein**.
- **Prompt sınırları (16 yaş — KATI, gevşetilmemeli):** teşhis YASAK, ilaç/takviye YASAK, **kalori kısıtlaması / kilo verme diyeti YASAK**, vücut şekli/görünüm yorumu YASAK, aşırı antrenman teşviki YASAK, **en fazla 2 öneri** (ADHD'de fazla seçenek felç eder), Türkçe zorunlu. Modalda sabit not: "gözlem özetidir, tıbbi tavsiye değildir".
- **Haftalık otomatik rapor:** Pazar 21:00 cron'u (`0 18 * * SUN`) artık `runCronJob('weekly')` → `.then(runCronJob('health'))`. **YENİ CRON EKLENMEDİ** — deploy.py/wrangler.toml'a dokunulmadı. Tam metin `data.coach.lastText`'e yazılır (PWA "Son rapor"), push'a 380 karakter özet gider. Manuel test: `?type=health&secret=<WEBHOOK_SECRET>`.
- **Veri yoksa sessiz:** `hasHealthData()` (uyku+antrenman+öğün toplamı <3 kayıt) → şerit hiç görünmez, AI çağrılmaz, boş push atılmaz.
- **Yeni veri alanı:** `data.coach = { lastRunAt, lastText, reports:[{at,text,auto?}] }` (son 12). Yeni DOSYA yok — kod `ui.js` sonuna eklendi.
- **🐛 Düzeltilen mevcut bug:** `weightKg` ve `calcWeight` `type="number"` idi → **iPhone Türkçe klavyesinde virgüllü "70,5" HİÇ girilemiyordu** (tarayıcı type=number'da virgülü reddeder; koddaki `.replace(',','.')` ölü koddu). `type` kaldırıldı, `inputmode="decimal"` kaldı.
- **Doğrulama (72 test, hepsi geçti):** worker saf fonksiyon 23 test (facts üretimi, veri eşiği, prompt sınırlarının varlığı) · jsdom gerçek DOM 24 test (6 desenin hepsi tetiklendi, çapraz sinyal dahil, XSS kaçışı, modal) · **regresyon 25 test, orijinal HEAD ile birebir karşılaştırıldı** (6 sekme + diyet/su/kilo/tarih + logSleep/sleepDebt/sleepStats30/renderSleepCard + Hevy + quickCapture + aidanNoteLine). Impeccable CSS denetimi temiz (yan-şerit/gradient/glass/saf-renk yok, reduced-motion var).
- **Cache:** v7-116 → **v7-117**

### ⚠️ 25 Tem 2026 — İKİ KOPYA REPO KARIŞIKLIĞI (çözüldü, tekrarlamasın)
`C:\Users\Salim\OneDrive\Masaüstü\claudedeneme` = **29 Haziran'da donmuş ÖLÜ kopya** (v7-85, origin'den 32 commit geride). Gerçek repo: **`C:\Users\Salim\OneDrive\Documents\GitHub\aidanagent`**. GitHub Desktop'ta ikisi de aynı remote'a baktığı için **ikisi de "aidanagent" görünüyordu**; eski olan listeden kaldırıldı (dosyalar diskte duruyor).
- **Kalıcı kural:** yeni seansta iş yapmadan önce `git rev-list --left-right --count HEAD...origin/main` ile uzak farkı KONTROL ET. Yerel `origin/main` ref'i hiç fetch edilmemişse "güncel" yalanı söyler — bir seans bu yüzden yanlış tabana yazıldı.
- Ölü kopyadaki `.git/index.lock` (12 Tem'den kalma) GitHub Desktop'ın hiçbir değişikliği görmemesine yol açıyordu. **Sandbox `.git`'e yazamaz/silemez** — kilit dosyasını Salim elle silmeli.

### 24 Temmuz 2026 — 😴 UYKU TAKİBİ (v7-113)
Salim: "uyku takibi ekle". Görevler üstünde **uyku kartı** — sabah Kötü/Orta/İyi chip + opsiyonel yatış/kalkış saati (gece yarısı geçişi hesaplanır, 16h üstü reddedilir), 15:00 sonrası nag yok, girildikten sonra slim özet + 7 gün nokta şeridi + haftalık ort. **Planlayıcıya bağ:** kötü/az uyku (kalite `bad` ya da <6s) → prompt'a "bugün enerji düşük, AZ+KISA blok, ağır işi en iyi saate, +20-30dk tampon"; iyi uyku → "zorlu işleri rahat koy". `sleepLine` twin (worker + tasks.js), **sadece bugün için** (akşam yarını planlarken uyku henüz yok → boş döner). "Aidan'ın notu"na kötü-uyku sabahı dürtüsü. Yeni veri `data.sleep[]` (60 gün, `{date,bedtime,wake,hours,quality}`), **kural tabanlı** (AI maliyeti yok). core.js helper: `ensureSleep/sleepFor/sleepHours/logSleep/sleepStats/lastNightSleep/fmtSleepHours`. 36 senaryo test + `node --check`. Cache v7-112 → **v7-113**.

### 24 Temmuz 2026 — 📓 İŞLEM GÜNLÜĞÜ (v7-114)
Salim: "trade'e yardımcı olsun". Borsa tabında **İşlem Günlüğü** (stocksList altında `#tradeJournal`) — al/sat sinyali/fiyat tahmini YOK, **süreç + disiplin** aracı. "+ İşlem aç" → modal (işlem-öncesi kontrol): sembol (watchlist datalist) · yön Long/Short · giriş/stop/hedef/adet → canlı **risk/ödül + hisse başı/toplam risk** önizleme · **neden** chip (kırılım/geri çekilme/trend/temel/diğer) · **duygu** chip (plana uygun/sakin/FOMO/intikam). Kapat → çıkış fiyatı sor → **pnl + R katı** hesaplanır. **İstatistik:** win rate, ort. R, en iyi setup (ort R), en çok kaybettiren duygu (win rate). **Disiplin uyarısı** modalda: bugün 3+ işlem ("plan mı hırs mı") ya da 3+ ardışık zarar ("mola?"). Veri `data.trades[]` (son 200, `{id,symbol,market,side,entry,stop,target,qty,reason,emotion,note,opened,status,exit,closed,pnl,r}`), **kural tabanlı** (AI yok). stocks.js helper: `ensureTrades/tradeRiskPerShare/tradeRR/computeTradeClose/isTradeWin/tradeStats/tradesOpenedToday/tradeLossStreak/renderTradeJournal` + modal `openTradeModal/saveTradeModal/closeTradePrompt/tjPick/updateTradePreview`. `renderStocks`'a bağlı. 21 senaryo test (long/short, kazanç/zarar, istatistik) + `node --check`. Cache v7-113 → **v7-114**.

### AI modeli notu
Llama 3.3 70B → Llama 4 Scout → **Gemini** (Tem 2026) geçişi tamam. Aşağıdaki eski mimari bölümlerinde hâlâ "Llama" geçiyorsa **güncel değildir** — gerçek = Gemini (yukarı bak).

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
                      │ (Gemini)    │         │ (Python)   │
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
- **AI:** **Google Gemini** (`gemini-3.5-flash`, ücretsiz) — intent/plan/split/yorum + görsel OCR (multimodal). Worker `aiRun`/`visionRun`. Cloudflare Workers AI (Llama) emekli. Sesli giriş Web Speech API ile tarayıcıda.
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
- **🧠 AI butonu** (`quickCaptureAI`) — metni Worker `/ai`'ye yollar, Gemini yorumlar + görev ekler, realtime sync

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
- **📷 Görselden portföy:** aracı kurum ekran görüntüsü → AI vision (`/portfolio-image`, Gemini multimodal) → adet/maliyet/son fiyat oku → düzenlenebilir onay modalı → ekle
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
- `POST /split` — AI görev bölücü: `{text}` → Gemini → 3-6 kısa eylem adımı `{steps:[...]}`. Auth + CORS, tool yok. `extractStepsJson` (markdown/numaralı/tireli toleranslı).
- `POST /portfolio-comment` — AI portföy yorumu: `{facts}` (PWA hesaplar, AI uydurmasın) → betimleyici özet `{comment}`. KATI prompt: al/sat/tut tavsiyesi + fiyat tahmini + iyi/kötü yatırım demek YASAK. Auth + CORS, tool yok.
- `POST /stocks` — Yahoo fiyat proxy (`{entries:[{display,yahoo}]}` veya eski `{symbols}`).
- `POST /stock-history` — tek hisse geçmiş close serisi: `{ySymbol, range:'1mo'|'3mo'|'1y'}` → `{timestamps, closes, min, max, first, last, changePct, currency, name}`. Yahoo chart endpoint proxy'si, 5dk CF cache, auth + CORS, tool yok. PWA mini grafik modali kullanır.
- `POST /portfolio-image` — portföy görseli → Gemini multimodal → sembol/adet/maliyet/son fiyat JSON. `visionRun` (aiRun'a gider), `parseNum` (Türk sayı formatı).

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
- Google Gemini intent + tool use
- Sesli giriş: tarayıcı Web Speech API (tr-TR)
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
- ✅ **Ücretsiz model (Gemini, eskiden Llama) > Claude API ($5/ay)** — şimdilik yeterli. İleride hibrit olabilir.
- ✅ **Auto-deploy ZORUNLU** — Salim drag-drop ile Netlify credit yakıyordu
- ✅ **Network-first SW** — cache vs deploy çatışmasını kalıcı çözdü
- ✅ **Düşük öncelik kaldırıldı** — Normal + Acil yeter, decision paralysis önler
- ✅ **2dk dene butonu** — task initiation altın kuralı
- ✅ **Stitch-inspired tasarım dili (May 29)** — Google Stitch mockup → CSS, indigo+amber paleti, sade kart yapısı. Mevcut JS hiç değişmedi, sadece görsel.
- ✅ **Mascot logo: mor bulut karakter (May 29)** — Recraft AI üretimi, Salim seçti. 3 varyant `logo-concepts/`'te yedek.
- ✅ **GitHub Actions otomatik deploy (önce vardı, May 29 cementli)** — `git push` yeter, drag-drop ya da manuel `py deploy.py` gereksiz.
- ⏳ **Hibrit AI (Gemini + Claude)** — kullanım sonrası karar
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
- **Satır sonları (25 Tem'de ölçüldü, eski not YANLIŞTI):** yalnız **styles.css = LF**; core.js / ui.js / tasks.js / stocks.js / supabase.js / sw.js / asistan.html / worker.js / CLAUDE.md = **CRLF**. Python replace'te önce `b.count(b'\r\n')` ile doğrula.
- **Tarih hesapları** hep `'T12:00:00'` öğlen demirli (toISOString UTC kayması bug'ı).
- **Preview testi:** SW cache taze modülü gizleyebilir → `serviceWorker.getRegistrations()→unregister()` + `caches.delete()` + reload.
- **iOS PWA sınırları:** arka planda JS yok (timer timestamp bazlı), başka uygulama kilitlenemez, Yahoo BIST ~15dk gecikmeli.

## Yeni Sohbet Başlıyorsa — Kalıcı Uyarılar
1. ⚠️ Deploy = `git push` → GitHub Actions (Pages + Worker birlikte). Netlify / drag-drop / ntfy ASLA önerme.
2. ⚠️ **Sandbox'tan ASLA `git` komutu çalıştırma** (`git status`/`add`/`diff` dahil). Git `.git/index.lock` yaratıyor ve sandbox'ta silme izni olmadığı için dosya kalıyor → Salim'in bilgisayarında "a lock file exists / Another git process seems to be running" hatası çıkıyor. Değişen dosyaları görmek için `ls`/dosya araçlarını kullan. Kaza olursa: `mv .git/index.lock .git/index.lock.eskimis` (mv izni VAR, rm YOK).
3. ⚠️ Büyük dosyalarda Edit aracı yerine **Python byte-replace + `node --check`** (üstteki DÜZENLEME KURALI); .bak oluşturma, rollback = `git checkout <dosya>`.
4. ⚠️ Push bildirimi sorununda 3 şart: Worker `Urgency: high` + SW her push'ta `showNotification` + fresh subscription (Ayarlar → "Push'u sıfırla"). Kayıtlar `data.settings.pushSubs[]`.
5. ⚠️ Tasarım: Impeccable standardı (üstte, KALICI) — koyu tema + amber accent. Eski mor/indigo YOK.
6. Kaldırılmış özellikleri yeniden önerme — "Önemli Kararlar" + "Kaldırılan özellikler" listesine bak.
7. Salim'in test sonuçlarını sor; sıradaki iş için "Açık işler / backlog" bölümüne bak.
