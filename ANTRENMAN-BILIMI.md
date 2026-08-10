# Antrenman Motoru — Bilimsel Şartname

Bu doküman `program.js`'in **niçin** öyle davrandığını anlatır. Kod bu şartnamenin uygulaması, tersi değil. Bir kural değiştirilecekse önce burası tartışılır.

**Kanıt seviyesi işaretleri** — dürüst olmak için her kural etiketli:

| İşaret | Anlamı |
|---|---|
| 🟢 | Yerleşik antrenman bilimi, geniş uzlaşı var |
| 🟡 | Makul ama tartışmalı; uzmanlar farklı sayılar veriyor |
| 🔴 | **Tahmin.** Literatür değeri değil, muhafazakâr seçilmiş mühendislik kararı |

⚠️ **Bu bir antrenörlük dokümanı değil.** 16 yaşındaki tek bir kullanıcı (kickboks + ağırlık) için yazılmış bir yazılımın karar kayıtlarıdır.

---

## 0. Motorun temel duruşu

**AI kullanılmaz.** Split seçimi, hacim dağılımı, ağırlık ve progresyon tamamen deterministik. Aynı girdi hep aynı programı verir.

Gerekçe üç katmanlı:
1. **Test edilebilirlik** — bir kural bozulursa test kırmızı olur. AI çıktısı test edilemez.
2. **Tutarlılık** — bir hafta squat'a 60 kg, ertesi hafta aynı veriyle 70 kg yazan bir sistem güvenilmez.
3. **Maliyet** — $0.

AI yalnızca **haftalık sağlık raporunda** kullanılır, o da hazır hesaplanmış sayıları yorumlamak için. Sayıyı AI üretmez.

**Motorun karışmadığı alanlar (kasıtlı):**
- Dövüş/teknik antrenmanın içeriği — antrenörün işi
- Sakatlık teşhisi ve tedavisi
- Beslenme reçetesi (kalori kısıtlaması hiçbir koşulda yazılmaz)

---

## 1. Bölünme seçimi 🟢

| Haftalık güç günü | Bölünme |
|---|---|
| ≤3 | Full body |
| 4 | Upper / Lower |
| 5 | Push / Pull / Legs |

Dayanak: kas grubu başına **haftalık frekans**ın toplam hacim kadar önemli olması. Az günde her kası her seans çalışırsın; çok günde bölmek zorundasın çünkü tek seansa sığmaz.

Bu bir tercih değil hacim matematiğidir — 2 günde PPL yaparsan her kası haftada 0.67 kez çalışırsın.

---

## 2. Kademe sistemi 🟢

Her hareket üç kademeden birine girer:

| Kademe | Ne | Atletik hedefte |
|---|---|---|
| 1 — Ana kaldırış | Ağır, iki taraflı, yüklenebilir | 4 × 3-5 |
| 2 — Yardımcı bileşke | Tek taraflı ya da vücut ağırlığı | 3 × 6-10 |
| 3 — İzolasyon | Tek eklem | 3 × 10-15 |

**Neden ayrım şart:** ana kaldırış ile yardımcı harekete aynı tekrar aralığını vermek yaygın bir hatadır. Bulgar split squat'ı 3 tekrar yapmak ne kuvvet ne hipertrofi uyaranıdır — sadece denge sınavıdır.

Her hedefin kendi kademe aralıkları var (`PROGRAM_GOALS[*].tiers`).

---

## 3. Hacim 🟡

**Kas başına haftalık set sayısı**, hacmin ana ölçüsü olarak kullanılıyor. Her hedefin bir bandı var (atletik 8-14, kas 12-18).

Motor bandı **zorlar**: altında kalan kasa set ekler, üstünde kalandan alır. Hareket uydurmaz — sadece var olan hareketin setini oynatır.

🟡 **Neden tartışmalı:** "set" kaba bir ölçü. Yakınlığa kadar götürülen 3 set ile yarım bırakılan 3 set aynı değil. Efor derecesini (RIR/RPE) ölçmediğimiz için set sayısı elimizdeki en iyi vekil.

### Sabit üst tavan: 20 set 🟡

`maxSetsPerMuscleWeek: 20`. Hedef bandının üstünde ikinci bir güvenlik ağı. 16 yaş + okul + dövüş yükünde toparlanma kapasitesi yetişkinden düşük.

### Hacim hedefi olmayan bölgeler

`neck`, `core`, `calves`, `glutes`, `biceps`, `triceps` banda dahil değil — kalça squat/hinge'den, kollar itiş/çekişten payını zaten alıyor. Ayrı hedef koymak yapay şişirme olurdu.

---

## 4. Patlayıcılık 🟢

### Maksimal kuvvet ≠ patlayıcılık

Bu ayrım motorun atletik katmanının tamamının sebebi. Kuvvet-hız eğrisinde:

- **Maksimal kuvvet** ağır uçta (>%85 1RM, düşük hız)
- **Patlayıcılık** ortada (%30-60 1RM, **maksimum hız niyeti**)

Bir kickboksçu için ikisi de gerekli ama aynı şey değil. Motorun eski `guc` hedefi sadece ilkiydi.

### Patlayıcı iş hacimle değil TEMAS ile yönetilir 🟢

3 tekrarlık derinlik sıçraması ile 3 tekrarlık leg extension aynı "set" değil — biri sinir sistemi işi, diğeri hipertrofi uyaranı. Bu yüzden patlayıcı iş kas başına set sayımından **tamamen çıkarıldı** ve ayrı bir bütçeye bağlandı: yere temas sayısı.

| Sınır | Değer | Kanıt |
|---|---|---|
| Seans başına temas | 60 | 🟡 |
| Hafta başına temas | 180 | 🟡 |
| Seans başına patlayıcı hareket | 2 | 🟢 |

### 🔴 Kickboks bütçeden düşülür — motorun en önemli satırı

`fightEquiv: 40` — bir dövüş antrenmanı 40 temas eşdeğeri sayılır.

**Bu bir literatür değeri DEĞİL.** İp atlama, adım çalışması, tekme — hepsi temas üretir ama kimse bunu saymamıştır. 40 muhafazakâr bir tahmin.

Bu satır olmasaydı motor "haftada 3 gün sıçrama" yazardı, sporcu zaten 4 gün kickboks yapardı, toplam eklem yükü katlanırdı. **Yanlış bir sayı bile, hiç saymamaktan iyidir.**

Sonuç davranışı doğrulandı: 4 gün kickboks + 2 gün ağırlık senaryosunda bütçe 160/180'e çıkıyor ve motor **yere temaslı sıçrama hiç vermiyor** — yerine sağlık topu / kettlebell (0 temas) koyuyor.

### Seans içi sıra zorunlu 🟢

Patlayıcı iş ısınmadan hemen sonra, ağır setten **önce**. Ağır squat'tan sonra yapılan sıçrama patlayıcılık geliştirmez — üretilen güç düşer, adaptasyon yön değiştirir.

Motorda `order: 0` ile zorlanıyor, teste bağlı.

### Rotasyonel güç 🟢

Vuruş gücü bacaktan gelip **gövde dönüşüyle** aktarılır. Havuzdaki Pallof press **anti-rotasyondur** (dönüşe direnç) — dönüş *üretmez*. Sağlık topu rotasyonel atışları bu boşluğu doldurur.

---

## 5. Dövüş yükü kuvvet hacminden de düşülür 🔴

`FIGHT_LEG_SETS: 1.5` — her dövüş günü alt vücut set tavanını 1.5 set düşürür.

**Neden eklendi:** temas bütçesinde kickboksu sayıp kuvvet hacminde saymamak tutarsızdı. Tekme atmak bacak işidir. 2 gün kickboks yapan biri için alt vücut tavanı 14 → 11 sete iner.

🔴 1.5 sayısı tahmin. Alt sınırın altına inmez (program boşaltılmaz).

Üst vücut bandı dövüşten **etkilenmez** — kickboks itiş/çekiş işi değil.

---

## 6. Progresyon

### Sıra önemli — ilk eşleşen kazanır 🟢

1. **Seans kaçırıldıysa** (planlananın yarısından azı) → hacim ARTMAZ, durgunluk sayacı da artmaz
2. Hedef tekrar aralığının üstüne çıkıldıysa → ağırlık bir kademe artar
3. Deload koşulu (aşağıda)
4. Hiçbiri değilse → ağırlık sabit, "bir tekrar daha ekle"

**1. kuralın en başta olması bilinçli.** Yetişemediğin programı ağırlaştırmak en sık yapılan hatadır ve motoru kullanıcıya karşı çalıştırır.

### Başlangıç ağırlığı: 1RM denemesi ASLA önerilmez 🟢

Ağırlık, Hevy'deki tahmini 1RM'den **Epley formülünün tersiyle** hedef tekrara çevrilir, sonra **×0.9** güvenli tarafa çekilir, 2.5 kg'a yuvarlanır.

Geçmiş veri yoksa `kg: null` kalır — **uydurulmaz.** Kart "ilk hafta kendine göre ayarla" der.

### Patlayıcı iş: çıktı ile ölçülür, ağırlıkla DEĞİL 🟢

Sıçramada "bir tekrar daha yaptın, kilo ekleyelim" yanlıştır. İlerleme daha yüksek/uzak sıçramaktır; ölçüsü cm/m.

- Çıktı %5+ **düştüyse** → bu durgunluk değil **yorgunluk** sinyalidir → hacim artırılmaz, **azaltılır**
- Ölçüm yoksa motor sessiz kalmaz, "ölç" der
- Sıçramaya asla kg yazılmaz

---

## 7. Deload 🟢

İki tetikleyici, aynı hafifletmeyi uygular (set × 0.6):

| Tip | Koşul | Neden |
|---|---|---|
| **Planlı** | Her 5. hafta | Yorgunluk performansı düşürene kadar beklenmez |
| **Reaktif** | 2 hafta üst üste ilerleme yok | Birikmiş yorgunluğun işareti |

**Üç kural motorda zorlanıyor:**

1. **Deload GEÇİCİDİR.** Normal hacim `setsBase`'de saklanır, ertesi hafta geri gelir. *(Bu koruma olmadan program haftalar içinde sessizce eriyordu: 10 haftada 74 → 50 set ve orada kalıyordu.)*
2. **Arka arkaya iki deload olmaz.** Planlı ve reaktif tetikleyiciler üst üste denk gelebiliyordu; sonuç iki hafta düşük hacim = gereksiz gerileme.
3. **Seans kaçırılan haftada deload tetiklenmez.** Zaten yapılmamış programı ayrıca hafifletmek anlamsız.

Hafifletmede **ağırlık değil set** düşer — amaç toparlanmak, gerilemek değil.

---

## 8. Hareket seçimi

### Puanlama deterministik 🟢

| Etken | Puan |
|---|---|
| Slot 0'da ana kaldırış | +45 |
| Hafta içinde kullanılmamış | +20 |
| Dövüş sporcusunda tek taraflı iş | +12 |
| **Aynı aile tekrarı** | **−40** |
| Aynı kalıp + kademe tekrarı | −14 |
| Aynı kası o gün tekrar yükleme | −8 |

Beraberlikte kütüphane sırası kazanır → seçim deterministik kalır.

### Hareket ailesi 🟢

**Aile = aynı hareket, farklı alet.** `Romen Deadlift` ile `Dambıl Romen Deadlift` ayrı id'lerdir ama aynı harekettir; motor bunu "çeşitlilik" sanıyordu.

⚠️ Fazla geniş gruplamak da hata: **leg press bir squat değildir** (makine, farklı yüklenme, farklı stabilite talebi). Aile listesi bilinçli olarak dar tutuldu.

**Aile tekrarı her zaman kötü değil.** Salonda dikey press için havuzda 2 seçenek var (bar + dambıl) ve haftada iki kez dikey press yapmak zaten doğru programlamadır. Yanlış olan tekrarın **sistemik** olması. Test bunu ayırt eder: aynı aile en fazla 2 kez, tekrar eden aile sayısı en fazla 1, alt vücutta hiç tekrar yok.

---

## 9. Isınma 🟢

Seans süresinden 8 dk ısınmaya ayrılır ve **ne yapılacağı yazılır**:

1. 5 dk hafif kardiyo
2. (Atletik hedefte) dinamik hareketlilik + gövde rotasyonu
3. Alt/üst güne göre eklem hazırlığı
4. **O günün ana kaldırışına özel 2 ısınma seti** (adıyla) — sayıya girmez

⚠️ **Isınmaya sıçrama konmaz** — temas bütçesini sessizce şişirir. Teste bağlı.

---

## 10. Kondisyon 🟡

| Dövüş günü | Öneri |
|---|---|
| ≥3 | **0 seans.** Aerobik tabanı zaten o sağlıyor |
| ≤2 | 1-2 düşük şiddetli seans |

**Girişim etkisi (interference):** uzun süreli yüksek şiddetli kondisyon, kuvvet ve patlayıcılık adaptasyonunu aynı gün içinde baskılar. Kural: patlayıcı/ağır seanstan **önce** yapılmaz.

Motor seansın **içeriğine karışmaz** — sert interval işi antrenörün alanı.

---

## 11. 16 yaş kapıları

Hepsi motorda zorlanıyor, her biri ayrı teste bağlı:

| Kapı | Kural | Kanıt |
|---|---|---|
| 1RM denemesi | Asla önerilmez | 🟢 |
| Şok yüklemesi (derinlik sıçraması) | 9. haftadan önce açılmaz | 🟢 |
| Teknik haftası | İlk 2 hafta set 2, mesafe/yükseklik zorlanmaz | 🟢 |
| Seviye 2 hareketler | Teknik haftalarından sonra | 🟡 |
| Haftalık set tavanı | 20 | 🟡 |
| Ağır gün tavanı | Güç + dövüş ≤ 6 | 🟡 |
| Bacak günü yerleşimi | Dövüşün ertesi/öncesi güne konmaz | 🟢 |
| Dinlenme | Haftada en az 1 tam gün | 🟢 |
| Ağrıyan bölge | O kası çalıştıran hareket havuzdan tamamen elenir | 🟢 |

**Not:** plyometrik ve olimpik türev hareketler bu yaş için uygundur — gençlik direnç antrenmanı pozisyon bildirileri bunu destekler. Sınır hareketin kendisi değil, **teknik önce, hacim sonra** sırasıdır.

---

## 12. Bilinen sınırlar — motor bunları YAPAMAZ

Dürüstlük bölümü. Bunlar eksiklik olarak biliniyor:

1. **Kişiselleştirme yok.** Motor senin zayıf halkanı bilmiyor — asimetri, tek bacak dengesi, 3. raundda neyin düştüğü ölçülmüyor.
2. **Dövüş gününün yoğunluğu bilinmiyor.** Teknik günü ile spar günü aynı yük değil; ikisi de 40 temas sayılıyor.
3. **Efor derecesi (RIR/RPE) yok.** Hacim set sayısıyla ölçülüyor, yakınlıkla değil.
4. **Bacak günü çakışması çözülmüyor, sadece uyarılıyor.** Dövüş günleri sıkışıksa motor "o gün bacağı hafif tut" diyor ama kendisi düzeltmiyor.
5. **Periyodizasyon yok.** Hafta içi dalgalanma (ağır/orta/hafif gün) ve makro döngü (hazırlık → yarışma) modellenmiyor.
6. **Hareket tekniği denetlenmiyor.** Motor kaç kilo kaldırdığını bilir, nasıl kaldırdığını bilmez.

Bu yüzden karta sabit not düşülür: **başlangıç noktasıdır, kişiye özel antrenörlük değildir.**

---

## Değişiklik kaydı

| Tarih | Değişiklik |
|---|---|
| 9 Ağu 2026 | İlk motor: bölünme, hacim tavanı, Epley progresyonu |
| 9 Ağu 2026 | Atletik katman: temas bütçesi, dövüş mahsubu, seans içi sıra |
| 9 Ağu 2026 | Kalite paketi: kademe sistemi, hacim bandı, ısınma, kondisyon |
| 10 Ağu 2026 | Hareket ailesi, dövüş→bacak hacmi mahsubu, planlı deload |
| 10 Ağu 2026 | Bulunan 2 bug: deload kalıcı hacim kaybı yapıyordu, ardışık deload olabiliyordu |
