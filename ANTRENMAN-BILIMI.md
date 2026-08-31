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

### Hareketin kendi tekrar tabanı 🟢

Kademe aralığı tek başına son söz değil. Motor atletik hedefte kademe 1'e 3-5 tekrar yazıyordu ve bunu **Hip Thrust'a da** uyguluyordu — kısa ROM'lu, kalça dominant bir harekette 3 tekrar ne kuvvet uyaranıdır ne de anlamlı teknik verir.

`PROGRAM_REP_FLOOR` bazı hareketlere kendi alt sınırını dayatır (hip thrust 6, lat pulldown 6, dambıl RDL 6, leg curl 8, baldır 8…). Taban aralığı **yukarı kaydırır**, aşağı asla indirmez, ve aralık genişliği korunur. Teste bağlı.

### Dinlenme de kademeye göre 🟢

Tek bir `restSec` vardı ve her harekete uygulanıyordu: atletik hedefte Leg Curl'e de 3 dk dinlenme yazılıyordu.

| Kademe | Atletik | Gerekçe |
|---|---|---|
| 1 — ana kaldırış | 180 sn | Ağır bileşkede 2+ dk hem kuvvet hem hipertrofi için daha iyi |
| 2 — yardımcı | 120 sn | |
| 3 — izolasyon | 75 sn | 60-90 sn ile fark gösterilemiyor |

⚠️ **Asıl sorun yan etkisiydi:** seans kapasitesi bu tek (uzun) dinlenmeye göre hesaplanıyordu. 60 dk'lık seans 4 harekete düşüyor, şablonun son slotları — **core dahil** — sessizce programdan düşüyordu.

---

## 3. Hacim 🟡

**Kas başına haftalık set sayısı**, hacmin ana ölçüsü olarak kullanılıyor. Her hedefin bir bandı var (atletik 8-14, kas 12-18).

Motor bandı **zorlar**: altında kalan kasa set ekler, üstünde kalandan alır. Hareket uydurmaz — sadece var olan hareketin setini oynatır.

🟡 **Neden tartışmalı:** "set" kaba bir ölçü. Yakınlığa kadar götürülen 3 set ile yarım bırakılan 3 set aynı değil. Efor derecesini (RIR/RPE) ölçmediğimiz için set sayısı elimizdeki en iyi vekil.

### Sabit üst tavan: 20 set 🟡

`maxSetsPerMuscleWeek: 20`. Hedef bandının üstünde ikinci bir güvenlik ağı. 16 yaş + okul + dövüş yükünde toparlanma kapasitesi yetişkinden düşük.

### Hacim hedefi olmayan bölgeler

`neck`, `core`, `calves`, `glutes`, `biceps`, `triceps` banda dahil değil — kalça squat/hinge'den, kollar itiş/çekişten payını zaten alıyor. Ayrı hedef koymak yapay şişirme olurdu.

### Kademe körü dengeleme — düzeltildi 🟢

Dengeleyici "en az setli hareket"e set ekliyordu ve bu **hep izolasyona** denk geliyordu: Leg Curl 4 sete çıkarken Lunge 2 sette kalıyordu. Dövüş sporcusunda tek taraflı bileşke işin değeri izolasyonun önündedir.

- **Eklerken sıra:** kademe 2 → 1 → 3
- **Kırparken sıra:** kademe 3 → 2 → 1; eşitlikte önce **makine** kırpılır

İkincisi gerçek bir hataydı: iki kademe-1 hareket eşit olduğunda dizi sonundaki kırpılıyordu, sonuç olarak **Squat 4→3 sete iniyor, Leg Press 4 sette kalıyordu.**

### Bandın altında kalırsa motor SUSMAZ 🟢

Set ekleyecek hareket bulunamayınca (örn. arka bacağı yalnız RDL taşıyor) motor sessizce bandın altında bırakıyordu. Tek harekette set tavanı **5**'tir — bandı tutturmak için tek harekete 6-7 set yığmak doğru çözüm değil. Motor 5'te durur ve **eksik kaldığını yazar.**

### Core: haftada 0 set kabul edilemez 🟢

En ağır bulgu. 60 dk ve altındaki programlarda **hiçbir core hareketi girmiyordu.** İki sebep birleşiyordu: `core` slotu şablonların en sonundaydı ve kapasite kesintisi hep oraya denk geliyordu; ayrıca üst gün odağı (göğüs/sırt/omuz) core'u filtreden eliyordu.

Üç düzeltme:

1. `core` slotu **her şablonda** var ve **izolasyondan önce** geliyor
2. `core` gün odağıyla sınırlanmaz — gövde her güne aittir
3. **Core garantisi:** şablonda core slotu varsa ve zaman bütçesi yüzünden düşmüşse zorla eklenir (maliyeti ~3 dk)

Dövüş sporcusunda gerekçe ayrıca güçlü: vuruş gücü bacaktan gelip gövde dönüşüyle aktarılır, anti-rotasyon dayanıklılığı aynı zamanda bel korumasıdır. Atletik hedefte **Pallof press ve farmer carry**, plank'ın önüne geçer (puanda +10).

---

## 4. Patlayıcılık 🟢

### Maksimal kuvvet ≠ patlayıcılık

Bu ayrım motorun atletik katmanının tamamının sebebi. Kuvvet-hız eğrisinde:

- **Maksimal kuvvet** ağır uçta (>%85 1RM, düşük hız)
- **Patlayıcılık** ortada (%30-60 1RM, **maksimum hız niyeti**)

Bir kickboksçu için ikisi de gerekli ama aynı şey değil. Motorun eski `guc` hedefi sadece ilkiydi.

### Patlayıcı iş hacimle değil TEMAS ile yönetilir 🟢

**⚠️ 30 Ağu 2026 — TEMAS ARTIK ŞİDDETE GÖRE AĞIRLIKLI 🟡.** Eski hâli yalnızca *sayıyordu*: `contact` bir hareketin tekrar başına kaç kez yere değdiğiydi (pogo 1, makas sıçrama 2). Sonuç, bu bölümün kendi gerekçesiyle çelişiyordu — *"5 derinlik sıçraması ile 5 leg extension aynı set değildir"* diyen motor, 60 pogo hop ile 60 derinlik sıçramasını aynı bütçeden düşüyordu.

Artık her harekette `plyoW` (şiddet ağırlığı) var: ayak bileği sıçraması 0.5 · dikey/kutu/uzun/makas sıçrama 1 · tek bacak bound 1.5 · derinlik sıçraması 2 · patlayıcı şınav 0.5. Dayanak dikey yer tepki kuvveti — çocuk/ergen verisinde koşu ~1.7-1.9 BW, alçak sıçrama ~3.0-3.5 BW, yüksek sıçrama ~3.3-3.8 BW ([Brailey ve ark. 2026](https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2026.1748455/full)).

🔴 **Ağırlıklar tahmin.** Literatür bir "temas eşdeğeri" katsayısı vermiyor; sayılar vGRF sıralamasından türetildi. Sıra doğru, mutlak değerler değil.

⚠️ Hesap tek kaynaktan (`programContacts`) gelir. Aynı formül önce üç ayrı yerde elle yazılıydı ve ağırlık eklenince ikisi güncellenmeden kaldı — kütüphanede ağırlık duruyor, bütçe eski şekilde sayıyordu. Entegrasyon testi bunu kilitler.

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

**⚠️ 30 Ağu 2026 — YORGUNLUK EŞİĞİ %5 → %10.** Ölçülen çıktıdaki %5 düşüş yorgunluk sinyali sayılıyordu. **Bu eşik ergende ölçüm gürültüsünün altındaydı:** saptanabilir en küçük değişim CMJ yüksekliğinde **>%7**, tek bacak sıçrama mesafesinde >%8 ([Thomas ve ark. 2017](https://doi.org/10.3390/sports5010015)); kuvvet platformunda bile tek CMJ'nin varyasyon katsayısı ~%5 ([Cormack ve ark. 2008](https://www.innervations.com/resources/Reliability%20of%20measures%20obtained%20during%20single%20and%20repeated%20countermovement%20jumps%20-%20Cormack%20et%20al%20IJSPP%202008.pdf)), telefon uygulamasında %8.2 ([Rago ve ark. 2018](https://www.mdpi.com/2075-4663/6/3/91)).

Gürültünün içinde kalan bir uyarı her hafta yanar ve **görmezden gelinmeyi öğretir** — bu, uyarı olmamasından kötüdür.

Sıçramada "bir tekrar daha yaptın, kilo ekleyelim" yanlıştır. İlerleme daha yüksek/uzak sıçramaktır; ölçüsü cm/m.

- Çıktı %5+ **düştüyse** → bu durgunluk değil **yorgunluk** sinyalidir → hacim artırılmaz, **azaltılır**
- Ölçüm yoksa motor sessiz kalmaz, "ölç" der
- Sıçramaya asla kg yazılmaz

---

## 6.5 Hafta içi dalgalanma 🟢

Dokümanda "bilinen sınır" olarak duruyordu: *"Periyodizasyon yok. Hafta içi dalgalanma (ağır/orta/hafif gün) modellenmiyor."* Kapatıldı.

### Sorun 2×/hafta frekansın yan ürünüydü

Motor aynı ana kaldırışı haftada iki kez veriyordu (doğru), ama **ikisini de 3-5 tekrar / RPE 8'de** veriyordu. Aynı kalıbı haftada iki kez maksimum yükte çalışmak toparlanma kapasitesini aşar: ikinci seansta üretilen güç düşer, teknik bozulur, kazanç birinci seansın altına iner.

**Frekansı artırmanın şartı, seans şiddetini dağıtmaktır.**

| | Tekrar | RPE | Dinlenme | İşi |
|---|---|---|---|---|
| **AĞIR** gün | kademe aralığı (3-5) | 7-8 | tam (3 dk) | Sinir sistemi |
| **ORTA** gün | +3 / +4 (6-9) | 7 | ×0.7 (2 dk) | Hacim ve teknik |

Ağırlık da yeniden hesaplanır — aynı kiloyu 3-5 yerine 6-9 tekrar yapmak "orta gün" değil **başarısız ağır gün**. Vücut ağırlığı hareketlerinde ek yük de yeni tekrara göre iner (barfiks +12.5 → +5 kg).

### Ağır gün en iyi harekete gider, ilk güne değil 🟢

Aynı kalıbın iki farklı hareketi olabilir: `hinge` = hip thrust + RDL. Gün sırasına göre seçince motor **hip thrust'ı ağır, RDL'yi orta** yapıyordu — transferi yüksek hareket hafif güne düşüyordu. Sıra artık transfer puanına (`pri`) göre: RDL ağır, hip thrust orta.

### Kapsam sınırları

- Yalnız **kademe 1**'e uygulanır. Yardımcı ve izolasyon zaten orta-yüksek tekrarda; onları da dalgalandırmak uyaranı dağıtmaz, seyreltir.
- **Patlayıcı iş dışarıda** — ölçüsü hız, dalgalandırılmaz.
- **Bir kez uygulanır.** `advanceProgram` tekrar çağırmaz; yoksa aralık her hafta 3 tekrar büyür. Teste bağlı.
- Orta günün dinlenmesi ağır günü **asla geçemez** (kısa dinlenmeli hedeflerde sabit taban bunu ters çeviriyordu).

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

**Aile tekrarı her zaman kötü değil.** Salonda dikey press için havuzda 2 seçenek var (bar + dambıl) ve haftada iki kez dikey press yapmak zaten doğru programlamadır.

### Hareket kalitesi çeşitlilikten önce gelir 🟢

Eski kural (`aynı aile = −40`, istisnasız) bir hataya yol açıyordu: ikinci bacak gününde squat ailesi zaten kullanıldığı için motor serbest squat yerine **Leg Press** yazıyordu. Çeşitlilik uğruna transfer feda ediliyordu.

İki değişiklik:

**1 — `pri` (transfer puanı), puana ×12 ile girer:**

| pri | Ne | Örnek |
|---|---|---|
| 3 | Serbest ağırlık temel bileşke | Squat, Bench, OHP, RDL, Barbell Row, Barfiks |
| 2 | Serbest yardımcı / tek taraflı | Goblet squat, Bulgar, dambıl varyantları |
| 1 | Makine ya da kablo | Leg press, Lat pulldown, Leg curl, Pushdown |

Makine bir squat değildir: yol sabit, stabilizasyon talebi yok. Çeşitlilik ucuzdur, transfer değil.

**2 — 2×/hafta frekans artık cezalandırılmıyor.** Kas grubu başına haftada 2 antrenman yerleşik bilgidir; ana kaldırışın ikinci kez gelmesi "çeşitlilik eksiği" değil doğru programlamadır.

Muafiyet **dar** tutuldu — tekrarın türü ayrılıyor:

| Tekrar | Karar |
|---|---|
| Aynı hareket (aynı id), kademe 1, 2. kez | ✅ Frekans — ceza yok |
| Aynı ailenin **başka aleti** (bar RDL + dambıl RDL) | ❌ Sahte çeşitlilik — tam ceza |
| Herhangi bir ailenin 3. kez gelmesi | ❌ Tam ceza |

Test sözleşmesi buna göre yeniden yazıldı: aynı aile en fazla 2 kez, **ve** 2 kez geliyorsa ikisi de aynı hareket olmalı. Ayrı bir regresyon testi "ikinci bacak gününde makine ana kaldırış olmuyor"u kilitler.

---

## 9. Isınma 🟢

Seans süresinden 8 dk ısınmaya ayrılır ve **ne yapılacağı yazılır**:

1. 5 dk hafif kardiyo
2. (Atletik hedefte) dinamik hareketlilik + gövde rotasyonu
3. Alt/üst güne göre eklem hazırlığı
4. **O günün ana kaldırışına özel 2 ısınma seti** (adıyla) — sayıya girmez

⚠️ **Isınmaya sıçrama konmaz** — temas bütçesini sessizce şişirir. Teste bağlı.

---

## 9.5 Seans süresi — motor artık yalan söylemiyor 🟢

Kullanıcı "60 dk" diyor, motor 77 dk'lık seans yazıyor ve **bunu söylemiyordu.**

### Süre modeli

Eski hesap `set × (dinlenme + 45 sn)` idi ve her hareket için **bir fazla dinlenme** sayıyordu: son setten sonra o hareketin dinlenmesi değil, bir sonraki harekete geçiş dinlenmesi vardır (farklı kas, ~60 sn yeter).

```
süre = set × 45 + (set − 1) × dinlenme + 60
```

4 set × 3 dk'lık bir kaldırışta fark 2 dk; seans başına 6-8 dk, yani tam bir hareketlik yer.

Seçim aşamasında bütçeye **%15 tolerans** var — sonda superset uygulanıp süre geri kazanıldığı için. Aksi halde ucuz ama değerli son slotlar (core, izolasyon) 15 saniyelik farkla düşüyordu.

### Antagonist superset 🟢

Seans sığmıyorsa motor önce **bilimsel** çözümü dener: itiş ↔ çekiş dönüşümlü. Çalışan kasın dinlenmesi kısalmaz, sadece boş bekleme dolar — toplam süre ~%30 düşer, kuvvet çıktısı anlamlı olarak düşmez.

Alternatifi — herkesin yaptığı şey — dinlenmeyi 90 sn'ye indirmektir; **o** kuvvet çıktısını gerçekten düşürür.

Kurallar:
- Aynı kas ya da aynı kalıp asla eşleştirilmez (dinlenmenin amacı kalkar)
- Patlayıcı iş eşleştirilmez — amacı maksimum hız, tam dinlenme şart
- Alt vücut ana kaldırışları eşleştirilmez — teknik yorgunlukla bozulur, risk kazançtan büyük
- Yalnızca seans istenen süreye **sığmıyorsa** uygulanır

### Yetmezse dürüstçe söyler

Her güne `estMin` yazılır ve kartta görünür. Hâlâ taşıyorsa not düşülür: *"seansların 64 dk sürüyor, sen 60 dk demiştin. Sebep uydurma değil: ağır ana kaldırışta 3 dk dinlenme şart. Ya süreyi çıkar ya güç günü sayısını artır."*

Sessizce kırpmak da, susmak da yanlıştı.

---

## 9.6 Tempo 🟢

Biçim: **eksantrik · alt bekleme · konsantrik · üst bekleme.** `X` = maksimum hız niyeti.

Neden var: bağ dokusu (tendon, ligament) kas kadar hızlı adapte olmaz. Tendon sertliği uzun süreli yüksek gerilimle artar ve bunun ana kaynağı **eksantrik** fazdır. Kickboks gibi eklemi hızla yükleyen bir branşta bu koruyucu bir özelliktir, kozmetik değil.

| Kademe / hareket | Tempo | Gerekçe |
|---|---|---|
| 1 — ana kaldırış | `2-1-X-0` | İniş kontrollü, kalkışta **maksimum hız niyeti** |
| 2 — yardımcı | `3-1-1-0` | Gerilim süresi burada değerli |
| 3 — izolasyon | `3-0-1-1` | Tepede sıkma |
| Calisthenics (barfiks, dips, şınav) | `3-1-1-1` | Tepede izometrik bekleme |
| Nordic curl | `5-0-1-0` | Hareketin tamamı eksantrik |
| Hip thrust / glute bridge | `2-1-1-2` | Tepede sıkma olmadan uyaranın yarısı kayıp |
| Baldır | `3-2-1-1` | Altta 2 sn gerilme — aşil tendonu, tekmenin yay mekanizması |
| Patlayıcı · süre bazlı | yok | Birinin ölçüsü hız, diğerininki zaten süre |

### ⚠️ "Yavaş tempo her yere iyi gelir" yanlış 🟢

Motorun bu konudaki en önemli kararı. Kademe 1'de (3-5 tekrar, ağır) konsantriği **kasten yavaşlatmak** kaldırılan yükü düşürür ve kuvvet kazanımını azaltır. 5 saniyelik negatif ana kaldırışta yanlıştır — yeri yardımcı hareketler ve izolasyondur.

Teste bağlı: hiçbir kademe-1 hareketinde konsantrik 1 sn'yi geçemez.

---

## 9.7 RPE 🟢

Motorun bilinen eksiği olarak listelenmişti (bölüm 12, madde 3): *"Efor derecesi (RIR/RPE) yok."* Artık var.

| Kademe | RPE | RIR karşılığı |
|---|---|---|
| 1 — ana kaldırış | 7-8 | 2-3 tekrar kalsın |
| 2 — yardımcı | 8 | 2 tekrar kalsın |
| 3 — izolasyon | 8-9 | 1-2 tekrar kalsın |
| Boyun | 6-7 | koruma işi, zorlanmaz |
| Patlayıcı | **yok** | ölçü efor değil HIZ |

Hafta bağımlı ayarlar:
- **Teknik haftaları (1-2):** bir kademe düşer — önce hareket otursun
- **Hafifletme haftası:** tavan 6 — amaç toparlanmak

### 16 yaş kapısı: RPE 10 asla yazılmaz 🟢

Yetmezliğe (0 RIR) gitmek ek kazanç getirmeden yorgunluğu katlar; teknik bozulur ve dövüş antrenmanına yorgun gidilir. Tavan **9**, her hedefte ve her haftada teste bağlı.

RPE hafta değişiminde yeniden hesaplanır — seans kaçırılan haftada bile, çünkü hacim sabit kalsa da **hafta ilerler.**

---

## 9.8 Vücut ağırlığı kalibrasyonu 🟢

"Barfiks 4 × 3-5" yazmak 2 barfiks çekebilen biri için imkânsız, 20 çekebilen için ısınmadır. Motor bunu bilmeden yazmamalı.

Kurulumda üç sayı sorulur: **barfiks · şınav · dips** maksimum tekrar. Yöntem barbell ile aynı — Epley, 1RM denemesi **istemeden**:

```
toplam yük = vücut ağırlığı × hareket oranı
e1RM       = yük × (1 + maxTekrar / 30)
hedefYük    = e1RM / (1 + hedefTekrar / 30)
ek          = hedefYük − yük
```

| Hareket | Yük oranı |
|---|---|
| Barfiks / chin-up | 1.00 |
| Dips | 0.95 |
| Pike şınav | 0.70 |
| Şınav | 0.65 |
| Ters şınav | 0.55 |

- `ek ≥ 2.5 kg` → **"kemerle +X kg ekle"**
- `ek ≤ −3 kg` → **regresyon önerilir** (bant destekli / negatif / eğik) ve program not düşer
- Veri girilmezse hiçbir şey uydurulmaz

Örnek: 65 kg, 9 barfiks → hedef 3-5 tekrar için **+12.5 kg**.

---

## 9.9 Soğuma ve mobilite 🟢

Ayrı bir blok, "unutulursa olur" değil. ⚠️ **Statik germe antrenmandan SONRA** — öncesinde yapılan uzun statik germe kuvvet ve sıçrama çıktısını geçici olarak düşürür. Isınma dinamiktir (bölüm 9), germe buraya aittir. İkisi de teste bağlı.

Hedef bölgeler rastgele değil:

| Gün | İçerik | Neden |
|---|---|---|
| Alt | Kalça fleksör germe · 90/90 kalça dönüşü · ayak bileği duvar testi | Tekme yüksekliğinin ilk sınırı kalça fleksörü |
| Üst | Torasik açılım · lat + göğüs germe · omuz dış rotasyon | Vuruşun dönüşü torasikten gelir |
| Atletik | Boyun serbest hareket (zorlamadan) | |

---

## 9.10 Boy neden kullanılmıyor 🟢

Boy verisi motorda **kasten yok.** ROM'u etkiler ama hareket seçimini, hacmi ya da yükü değiştirecek bir kanıt yok. Uydurma parametre eklemek motoru bilimsel değil, **bilimsel görünümlü** yapar.

Kilo kullanılıyor: vücut ağırlığı hareketlerinin kalibrasyonu ve beslenme motoru (BMR/PAL) buradan besleniyor. Ayrı soru sorulmuyor, beslenme hesaplayıcısından okunuyor.

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
| Bacak günü yerleşimi | Dövüşün ertesi/öncesi güne konmaz **ve iki bacak günü arka arkaya gelmez** | 🟢 |
| Dinlenme | Haftada en az 1 tam gün | 🟢 |
| Ağrıyan bölge | O kası çalıştıran hareket havuzdan tamamen elenir | 🟢 |
| Boyun çalışması | Haftada 2 gün (izometrik) | 🟡 |

**Boyun neden 1'den 2'ye çıktı:** boyun kası da diğerleri gibi frekansa cevap verir ve izometrik işin toparlanma maliyeti neredeyse sıfırdır. Dövüş sporunda amaç kafa hızlanmasını — dolayısıyla konküzyon riskini — azaltmak; tek seans koruyucu eşik için zayıf kalıyordu.

### Gün yerleşimi: ceza tablosu 🟢

⚠️ **18 Ağu 2026 denetiminde bulunan en ağır hata.** Eski kod ağır bacak gününü yerleştirirken yalnız **dövüşe** komşuluğu kontrol ediyordu; iki bacak gününün **birbirine** komşuluğunu hiç kontrol etmiyordu. 300 yapılandırmanın **120'sinde (%40)** Pazar ve Pazartesi arka arkaya ağır bacak günü çıkıyordu — Pazar 4 set squat, ertesi gün 3 set daha.

Artık her gün için ceza hesaplanıyor, en düşük cezalı gün seçiliyor:

| Ceza | Durum |
|---|---|
| 200 | Aynı güne iki ağır yük |
| **90** | **İki ağır bacak günü arka arkaya** ← eklenen kural |
| 70 | Ağır bacak günü dövüşe komşu ← eski tek kural |
| 20 | İki üst gün arka arkaya (hafif — üst vücut daha hızlı toparlar) |
| 4 | Üst gün bacak gününe komşu (sorun değil, hafif tercih) |

Sonuç: **%40 → %0.** Beraberlikte hafta sırası kazanır, seçim deterministik kalır. Çözülemeyen durumda (çok az boş gün) motor susmuyor, ayrı bir not düşüyor.

### Antagonist denge: çekiş ≥ itiş × 0.8 🟢

İkinci bulunan hata. Şablonlar 2 itiş + 2 çekiş kurulmuştu ama **her iki üst gün de itişle başlıyordu** ve zaman bütçesi son slotu kestiğinde kesilen hep çekiş oluyordu. 45 dk'lık programda hafta toplamı **itiş 20 / çekiş 10** çıkıyordu.

⚠️ **Yön önemli: eksik olan çekiş.** İtiş fazlalığı omuz ekleminin en bilinen risk kalıbıdır — ön omuz ve göğüs kısalır, skapula kontrolü zayıflar. Bench-ağırlıklı programların klasik sorunu. Dövüş sporcusunda ayrıca klinçte ve savunmada çekiş kuvveti doğrudan iş görür.

Üç katmanlı düzeltme:

1. **Üst B artık çekişle başlıyor** (`pull_h` ilk slot). Tek günde 3 hareket varsa denge zaten kurulamaz (2-1 olur) — denge **günler arasında** kurulur: A itiş ağırlıklı, B çekiş ağırlıklı.
2. **Seans içi kapı:** bir günde itiş setleri çekişi 2'den fazla geçerse en az değerli itiş hareketi çekişle değiştirilir. Ölçü hareket sayısı değil **set** — güçte kademe 1'e 5 set veriliyor, "2 itiş 1 çekiş" günü 10'a 5 set demek. Değişiklik dengeyi gerçekten iyileştirmiyorsa yapılmaz.
3. **Haftalık kural:** çekiş toplamı itişin %80'ine çekilir.

Üçüncüsü neden gerekliydi: **itiş iki kasa bölünüyor** (göğüs + omuz) ve her biri kendi bandını ayrı ayrı dolduruyor; **çekiş tek etikette** (sırt) toplanıyor ve tek band alıyor. Şablon slotları 1-1 dengeli olsa bile hafta toplamında itiş öne geçiyor. Kural sert değil — kas tavanı (20) ve hareket başı 6 set sınırı bu adımı ezer.

Sonuç: **114/300 → 4/300**, kalan 4'ü de ters yönde (çekiş 1.38× — koruyucu taraf).

**Not:** plyometrik ve olimpik türev hareketler bu yaş için uygundur — gençlik direnç antrenmanı pozisyon bildirileri bunu destekler. Sınır hareketin kendisi değil, **teknik önce, hacim sonra** sırasıdır.

---

## 12. Beslenme 🟡

`nutrition.js` ayrı bir motordur, aynı ilkelerle çalışır: kural tabanlı, deterministik, AI yok.

### 🔴 KAPSAM SINIRI — en önemli karar

**Bu bir kilo verme aracı değildir ve olamaz.** Kullanıcı 16 yaşında, büyüme döneminde, haftada 6 gün antrenman yapıyor. Bu profilde asıl risk **az yemektir**.

Motor yalnızca iki hedef tanır: **koru** ve **kas** (yağsız kazanım). Kalori açığı, sıklet düşürme, vücut yağ oranı hedefi yok — arayüzde seçenek olarak bile bulunmuyor. `nutTargets` hiçbir koşulda BMR'nin altına inmez. Sıklet düşürmek gerekiyorsa bu antrenör + diyetisyen işidir.

### BMR — yaşa göre denklem 🟢

Mifflin-St Jeor **19-78 yaş** aralığında doğrulanmıştır; ergende sapar. 18 yaş altı için **Schofield** (yaş gruplu) kullanılıyor. 16 yaş / 70 kg örneğinde fark ~160 kcal — küçük değil.

### Enerji: tek "aktivite seviyesi" yok 🟢

Klasik hesaplayıcılar tek bir aktivite katsayısı sorar. Ama antrenman günü ile dinlenme günü **aynı kalori değildir**. Katsayı programdan türetilir:

| Gün | PAL | 70 kg örneği |
|---|---|---|
| Dinlenme | 1.4 | 2654 kcal |
| Ağırlık | 1.6 | 3034 kcal |
| Dövüş | 1.75 | 3318 kcal |
| Ağırlık + dövüş | 1.9 | 3602 kcal |

### Makrolar

| Makro | Kural | Kanıt |
|---|---|---|
| Protein | 1.8 g/kg (koru) · 2.0 (kas). Tavan 2.5 | 🟢 |
| Yağ | %27 kcal, **taban 0.8 g/kg** (hormonal sağlık) — hangisi büyükse | 🟢 |
| Karbonhidrat | Kalan. Antrenman gününde doğal olarak yüksek | 🟢 |
| Su | 35 ml/kg + seans başına 600 ml | 🟡 |
| Fazla (kas hedefi) | +350 kcal — büyük fazla yağ olarak birikir | 🟡 |

### Protein dağılımı 🟢

Toplam kadar **dağılım** da önemli. Öğün başına 0.25-0.40 g/kg bandı kas protein sentezini maksimuma çıkarır; günün tamamını tek öğüne yığmak aynı sonucu vermez.

⚠️ Bu bant bir **rehberdir, kırpma kuralı değil**. Öğün hedefi bantla kırpılırsa 4 × tavan < günlük hedef olur ve plan sessizce eksik protein verir. Motor proteini eşit böler, bandı bilgi olarak gösterir.

### Karbonhidrat zamanlaması 🟡

- Antrenmandan 1-3 saat önce: karbonhidrat + protein, yağ düşük
- Sonrasında 1-2 saat içinde: protein + karbonhidrat
- ⚠️ **"30 dakikalık anabolik pencere" abartıdır** — protein için saatlerce süre var. Karbonhidratta zamanlama gerçekten önemli, çünkü glikojen bir sonraki seansın yakıtı.
- Dövüş gününde karbonhidrat kısılmaz — yorgunluğun en sık sebebi az karbonhidrattır, az protein değil.

### Öğün sayısı ve zamanlama 🟢

**5. öğün 3000 kcal üstünde açılır.** 3200 kcal'i 4 öğüne bölmek öğün başı 800-950 kcal demek — 16 yaşında, aynı gün dövüş antrenmanı da varken bu miktar pratikte yenmez. Kâğıt üzerinde doğru, hayatta uygulanamaz bir plan doğru değildir.

**Karbonhidrat antrenmanın etrafına kayıyor.** Motor zamanlama kuralını *metin olarak* yazıyordu ("antrenmandan 1-3 saat önce karbonhidrat") ama makro dağılımı bunu yansıtmıyordu — her öğün aynı oranı alıyordu. Yazıp uygulamamak, hiç yazmamaktan kötüdür.

| Öğün | Dinlenme günü (kcal / karb) | Antrenman günü |
|---|---|---|
| Kahvaltı | 0.22 / 0.22 | 0.19 / **0.15** |
| Ara | 0.13 / 0.13 | 0.12 / 0.11 |
| Öğle *(antrenmandan önce)* | 0.26 / 0.26 | 0.27 / **0.31** |
| Akşam *(antrenmandan sonra)* | 0.26 / 0.26 | 0.29 / **0.32** |
| Atıştırma | 0.13 / 0.13 | 0.13 / 0.11 |

Yağ oranı ayrı tanımlanmaz: öğünün kalorisinden protein ve karbonhidrat düşüldükten sonra **kalan** yağdır. Böylece antrenman etrafındaki öğünlerde yağ doğal olarak düşer (mide rahat olsun), uzak öğünlerde yükselir.

### Örnek gün

Türk yemeklerinden (410 besinlik veritabanı) kurulur: her öğünde bir **protein çapası** + bir **karbonhidrat çapası** + bir **yağ çapası** + sabit ekler.

**Yağ çapası 18 Ağu 2026'da eklendi** ve gerçek bir hatayı kapattı: motorda protein ve karbonhidrat çapası vardı, yağ çapası yoktu. Sonuç, yağ hedefin %30 altında (68 g / 97 g) ve açığın karbonhidratla dolması. Dahası, karbonhidrat çapası kalan kalorinin tamamını tek başına kapatmak zorunda kalınca **"5 muz", "5 dilim ekmek"** gibi öğünler çıkıyordu — protein tarafında çözülmüş olan hatanın (4 bardak kefir) aynısı karbonhidrat tarafında duruyordu.

### Çapalar birbirini etkiler — tek geçişte çözülmez 🟢

Protein çapası yalnız **ekleri** düşerek hesaplanıyordu. Ama Türk mutfağında karbonhidrat kaynağı da protein taşır (bulgur 5 g, pilav 4 g, ekmek 3 g/porsiyon) ve o miktar henüz bilinmiyordu. Sapma sistematikti: **protein %20-48 fazla, karbonhidrat %20 eksik.**

Çözüm üç geçişlik sabit nokta: her turda çapa, diğerlerinin o anki katkısı düşülerek yeniden boyutlanır. Sıra `protein → yağ → karbonhidrat`; yağ karbonhidrattan önce gelir, yoksa karbonhidrat bütün kaloriyi tek başına doldurur.

### Motorda zorlanan kurallar

1. **Çapa, şablonun en protein yoğun kalemi olmalı** — ölçü mutlak gram değil **protein/kalori yoğunluğu** (≥0.08 g/kcal). Yumurta 6 g taşır ama 72 kcal'dir (0.083) — 3-4 adet yemek normaldir. Kefir de 6 g taşır ama 100 kcal'dir (0.060): hedefe göre ölçeklenince "4 bardak kefir" üretir. *(Bu hata `ara` öğünü eklenirken bir kez daha yapıldı — test yakaladı.)*
2. **`adet` birimli besinler tam sayı.** 1.5 yumurta olmaz.
3. **Hiçbir kalem 4 porsiyonu geçmez.**
4. **Her öğünde en az 8 g protein var.** "3 porsiyon pilav + salata" bir akşam yemeği değildir — ana öğünde (öğle/akşam) protein çapası hiçbir koşulda silinmez.
5. **Gün toplamı hem eksikte hem FAZLADA düzeltilir.** Motorda yalnız "açığı kapat" adımı vardı; bölünemeyen bir çapa (1 kutu ton balığı yarımlanamaz) günü %9 taşırdığında motor düzeltmeye çalışmıyordu bile.

### Protein hedefi bir tavan değil 🟢

Denge adımı proteini hedefin %10 üstüne kadar kırpıyordu ve bunu yapmak için öğünlerden protein kaynağını **siliyordu.** Yanlış olan kırpma değil, neye göre kırptığıydı:

- **1.8-2.0 g/kg bir HEDEFTIR** — aşılması zararlı değil
- **2.5 g/kg TAVANDIR** — üstünün ek faydası gösterilmemiş

Motor artık hedefe değil tavana göre kırpıyor. Tavan yine de aşılırsa (hafif profillerde şablonun sabit ekleri tek başına yaklaşabiliyor) kartta yazıyor.

### Sapma gizlenmez 🟢

Şablon tabanlı bir plan hedefi tam tutturamaz. Tutturduğunu söylemek yanlış olur. Kart artık gerçek değerleri hedefle yan yana gösteriyor: `3211 kcal (%-1) · 159 g P (2.4 g/kg) · 452 g K · 89 g Y`.

45 kg + 3100 kcal gibi köşe durumlarda kaloriyi tam tutturmak, protein tavanını aşmadan mümkün değil. Motor tavanı korur, kaloriyi eksik bırakır ve **sapmayı yazar.** Sessizce tavanı aşmak ya da sapmayı gizlemek daha kötü olurdu.

### Mikro besinler 🟡

Dört hedef, 14-18 yaş erkek için:

| Besin | Hedef | Üst sınır | Neden |
|---|---|---|---|
| Kalsiyum | 1300 mg | 2500 mg | Zirve kemik kütlesinin ~%90'ı 18 yaşına kadar kuruluyor; bu pencere kapanınca geri alınamaz |
| Demir | 11 mg | 45 mg | Büyüme + haftada 6 gün antrenman; eksikliğin ilk belirtisi dayanıklılık düşüşü |
| D vitamini | 600 IU | 4000 IU | Kalsiyumun kemiğe girmesi için gerekli, Türkiye'de eksikliği yaygın |
| Lif | 30-38 g | — | Yüksek kalorili planda kolayca düşer |

Artık gerçek sayı hesaplanıyor: `NUT_MICRO_DATA` **porsiyon başına** ca/fe/d/lif taşıyor (~90 besin).

### ⚠️ Kapsam dürüstlüğü — bu katmanın en önemli özelliği 🟢

Veritabanında 410 besin var, mikro tablosunda ~90'ı. **Kısmi veriyle "bugün 1180 mg kalsiyum aldın" demek yanıltıcıdır:** hesaba katılmayan besinler de kalsiyum taşıyor, kullanıcı eksik sanıp gereksiz takviye alabilir.

Bu yüzden sayı **hiçbir zaman tek başına verilmiyor**. Kart her zaman kapsamı da yazıyor: *"1290 / 1300 mg — örnek günün %100'ü hesaplandı"*. Kapsam **%70'in altındaysa motor yorum yapmaz ve takviye önermez** — sadece veriyi gösterir. Hayali bir açık üretip takviye önermek, hiç önermemekten kötüdür.

🟡 Değerler USDA / TürKomp ortalamalarından porsiyona çevrilmiş **yaklaşık** değerlerdir. Aynı yemeğin evden eve değişmesi zaten bu hassasiyetin üstünde bir belirsizlik — hedefin %10'u için uğraşmak anlamsız, büyük açıkları görmek anlamlı.

### Takviye: sıra değişmez, önce gıda 🟢

Takviye **yalnızca** gıda hedefi tutturmuyorsa gündeme gelir, o zaman bile ilk satır hangi yiyeceği ekleyeceğindir. Sebebi ahlaki değil pratik: gıdadan gelen mikro besin, yanında geldiği diğer şeylerle (protein, lif, potasyum, gıda matrisi) birlikte çalışıyor.

Üç koşul birden gerekiyor:

1. Gerçek bir açık var (hedefin %90'ının altında)
2. Kapsam güvenilir (≥%70)
3. O besin için takviye **güvenli**

| Besin | Motor ne yapıyor |
|---|---|
| **D vitamini** 🟢 | 600-1000 IU önerir. Gıdadan karşılamak pratikte zor: 600 IU için haftada 2 kez yağlı balık ya da her gün ~15 yumurta gerekir. ⚠️ Doz kan değerine göre — 25(OH)D testi olmadan yüksek doz yok, karar hekimin |
| **Kalsiyum** 🟡 | Kalan açık kadar, en fazla 500 mg. Önce süt ürünü: 1 bardak süt 225 mg. Demir takviyesiyle aynı öğünde alınmaz |
| **Demir** 🔴 | **Takviye önermiyor.** Açığı gıdayla kapatıyor |
| **Lif** 🟢 | Takviye önermiyor — 1 porsiyon nohut 10 g, gıdayla kapanır |

### 🔴 Demirde neden hiç takviye önerilmiyor

Fazla demir vücuttan **atılamaz**, karaciğerde birikir. Ferritin ve hemoglobin bakılmadan demir takviyesine başlanmaz — ve motorun bu değerleri bilmesine imkân yok. Bu yüzden demir açığında yazdığı şey gıda: *1 porsiyon kırmızı et 3.4 mg, 1 porsiyon nohut 3.9 mg, 1 kase mercimek çorbası 2.5 mg.* Emilim ipucu da veriyor: yanına C vitamini, çay öğünden 1 saat sonra.

Teste bağlı: 96 kombinasyonun hiçbirinde demir takviyesi çıkmıyor.

### Üst sınır kapısı 🟢

Gıda + takviye toplamı üst sınırı geçecekse takviye önerilmez. Teste bağlı.

### Performans takviyeleri — bilgi, reçete değil 🟡

Motor bunları plana **koymaz** ve "al" demez. Kanıt seviyesi yazılıyor ki kullanıcı internetteki iddialarla karşılaştırabilsin.

| Madde | Kanıt | Not |
|---|---|---|
| Kreatin monohidrat | 🟢 | Tekrarlı patlayıcı eforda en çok çalışılmış madde. Genç sporcularda kullanımını destekleyen pozisyon bildirileri var ama 16 yaşında karar antrenör + hekimin |
| Kafein | 🟢 | Algılanan efor düşer. **Ergende uyku kritik** — akşam antrenmanında kullanımı uykuyu bozar ve kazancı geri alır |
| Beta-alanin | 🟡 | 1-4 dakikalık yüksek şiddetli eforda (bir raunt tam bu aralıkta) yorgunluğu geciktiriyor. Etkisi kreatinden küçük |
| Omega-3 | 🟡 | Haftada 2 kez yağlı balık yenmiyorsa akla gelen tek genel takviye. Önce balık |
| Protein tozu | 🟢 | Takviye değil, pratik bir **gıda**. Günlük protein zaten tutuyorsa ek fayda yok |

Teste bağlı: bu maddelerin hiçbiri öğün şablonlarına girmiyor (protein tozu hariç — o bir gıda).

## 12. Bilinen sınırlar — motor bunları YAPAMAZ

Dürüstlük bölümü. Bunlar eksiklik olarak biliniyor:

1. **Kişiselleştirme yok.** Motor senin zayıf halkanı bilmiyor — asimetri, tek bacak dengesi, 3. raundda neyin düştüğü ölçülmüyor.
2. **Dövüş gününün yoğunluğu bilinmiyor.** Teknik günü ile spar günü aynı yük değil; ikisi de 40 temas sayılıyor.
3. ~~**Efor derecesi (RIR/RPE) yok.**~~ **Çözüldü (18 Ağu 2026)** — bkz. bölüm 9.7. Hacim hâlâ set sayısıyla ölçülüyor, ama artık her sette hedef RPE yazıyor.
4. **Bacak günü çakışması çözülmüyor, sadece uyarılıyor.** Dövüş günleri sıkışıksa motor "o gün bacağı hafif tut" diyor ama kendisi düzeltmiyor.
4b. ~~**İkincil kas payı sayılmıyor.**~~ **Çözüldü (18 Ağu 2026).** Doğrudan çalışan kas 1 set, dolaylı çalışan **0.5 set** (`PROGRAM_IKINCIL`). ⚠️ Bu sayım yalnız **durum raporunda** kullanılır — band zorlaması ve 16 yaş set tavanı doğrudan sette kalır. Sebebi: hacim önerilerinin dayandığı çalışmalar doğrudan set sayar; tavanı dolaylı setle şişirmek güvenlik kuralını gevşetmek olur. Kart artık iki sayı gösteriyor: `Arka bacak 8 +2`.
5. **Periyodizasyon kısmen var.** Hafta içi dalgalanma (ağır/orta) eklendi — bkz. bölüm 6.5. **Makro döngü hâlâ yok:** hazırlık → yarışma bloklaması, maç tarihine göre yüklenme ve tapering modellenmiyor.
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
| 18 Ağu 2026 | **Hafta içi dalgalanma (undulating):** aynı kalıp 2× geliyorsa ikincisi ORTA gün — tekrar +3/+4, RPE −1, dinlenme ×0.7, ağırlık yeniden hesap; ağır gün transfer puanı yüksek harekete gider. **İkincil kas payı:** dolaylı çalışma 0.5 set (yalnız raporda, tavan doğrudan sette kalır) |
| 18 Ağu 2026 | **Denetim bulguları:** iki ağır bacak günü arka arkaya düşüyordu (%40 → %0, gün yerleşimi ceza tablosuyla); çekiş hacmi itişin gerisinde kalıyordu (114/300 → 4/300; Üst B çekişle başlıyor + seans içi kapı + haftalık %80 kuralı) |
| 18 Ağu 2026 | **Mikro besin + takviye katmanı:** ~90 besin için porsiyon başına ca/fe/d/lif verisi; kapsam raporu (kapsam <%70 → yorum yok, takviye yok); takviye yalnızca gerçek açıkta ve üst sınır kapısıyla; demirde hiç takviye yok (kan değeri olmadan); performans takviyeleri kanıt seviyesiyle bilgi olarak |
| 18 Ağu 2026 | **Beslenme denetimi:** yağ çapası (yağ %30 eksik kalıyordu); çapalar için üç geçişlik sabit nokta (protein sistematik %20-48 fazlaydı); 3000 kcal üstünde 5. öğün; karbonhidratın antrenman etrafına kayması; fazlayı geri alma adımı; protein tavanı 2.5 g/kg'a göre kırpma; mikro besin katmanı (kalsiyum, demir, D vit, lif); sapma raporu |
| 18 Ağu 2026 | **Koçluk katmanı:** tempo (kademe + hareket bazlı), RPE (hafta bağımlı, tavan 9), vücut ağırlığı kalibrasyonu (Epley, 1RM denemesi yok), soğuma/mobilite bloğu, tablo çıktısı (Ad · Set×Tekrar · Tempo · Dinlenme · RPE · Yük); Hevy'ye tempo/RPE notu ve gerçek superset |
| 18 Ağu 2026 | **Bilimsel denetim.** Kademeye göre dinlenme; gerçek süre modeli + antagonist superset + dürüst süre uyarısı; core garantisi (60 dk'da haftalık core 0 setti); hareket kalitesi puanı `pri` (2. bacak gününde makine ana kaldırış oluyordu); 2×/hafta frekans muafiyeti; hareket bazlı tekrar tabanı (hip thrust 3 tekrar yazılıyordu); hacim dengeleyicide kademe önceliği; boyun 1→2 gün |
