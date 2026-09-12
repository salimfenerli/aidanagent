// ============================================================================
// BESLENME PLANLAYICI (10 Agu 2026)
//
// ⚠️ KAPSAM SINIRI — BU MOTORUN EN ONEMLI KARARI:
// Bu bir KILO VERME araci DEGILDIR ve olamaz. Kullanici 16 yasinda, buyume
// doneminde ve haftada 6 gun antrenman yapiyor. Bu profilde asil risk AZ
// YEMEKtir. Motor yalnizca iki hedef tanir: 'koru' ve 'kas' (yagsiz kazanim).
// Kalori acigi, siklet dusurme, vucut yag orani hedefi YOK — arayuzde secenek
// olarak bile bulunmuyor ve `nutTargets` BMR'nin altina ASLA inmez.
// Siklet dusurmek gerekiyorsa bu antrenor + diyetisyen isidir.
//
// AI cagrisi YOK — motor tamamen kural tabanli ve deterministik.
// Bilimsel dayanaklar: ANTRENMAN-BILIMI.md (Beslenme bolumu).
// ============================================================================

const NUT_LIMITS = {
  proteinPerKg: 1.8,        // koru — sporcu araligi 1.6-2.2 g/kg
  proteinPerKgGain: 2.0,    // kas kazanimi
  proteinMaxPerKg: 2.5,     // ustune cikmanin ek faydasi gosterilmemis
  // ⚠️ 2.5 g/kg bir GUVENLIK esigi DEGIL, azalan getiri noktasidir (ISSN
  // protein pozisyon bildirisi >3.0 g/kg alimlarin bile guvenli oldugunu
  // soyluyor). Ayrimi yapmak zorundayiz cunku ikisi CAKISABILIYOR: 45 kg /
  // 3113 kcal profilinde gunun kalorisini Turk mutfagiyla doldurmak tek
  // basina ~110 g protein getiriyor (makarna 9 g, pilav 4 g/porsiyon).
  // 2.5'i mutlak sinir sayarsak gun %15 EKSIK bitiyor — yani gercek riski
  // (az yemek) onlemek icin gercek olmayan bir riski (fazla protein)
  // kovaliyoruz. Kalori acigi varken tavan 3.0'a kadar acilir.
  proteinAbsMaxPerKg: 3.0,
  proteinPerMealMin: 0.25,  // g/kg — ogun basi kas protein sentezi esigi
  proteinPerMealMax: 0.40,  // ustu ayni ogunde ek fayda vermiyor
  fatMinPerKg: 0.8,         // hormonal saglik tabani — ALTINA INILMEZ
  fatPct: 0.27,             // kcal'in yuzdesi (taban kuralini gecerse o kazanir)
  // ⚠️ YAG ORANI AYARLANABILIR AMA BANT ICINDE (21 Agu 2026). Salim'in
  // itirazi hakliydi: "genelde 2-2.2 kat protein, 1 kat yag" kalibi yaygin.
  // O kalip 2400-2600 kcal'de %25 yag verir ve DOGRUDUR — ama 3900 kcal'de
  // ayni 1 g/kg %16'ya duser. Yani kalip yanlis degil, SABIT g/kg yuksek
  // kaloride kiriliyor. Karar kullanicinin, sinir bilimin: DRI 4-18 yas
  // AMDR %25-35; ACSM kronik siniri %20. Ayar %25-32 arasinda serbest.
  fatPctMin: 0.25,          // DRI ergen AMDR tabani
  fatPctMax: 0.32,
  fatMinPct: 0.20,          // ACSM/AND/DC: kronik olarak enerjinin %20 altina inilmez
  // ⚠️ EKLENEN YAG TAVANI (21 Agu 2026). Motor kaloriyi kapatirken yaga
  // yoneliyordu: protein bandi sikiyken karbonhidrat kaynaklari protein
  // TASIDIGI icin (bulgur 5 g, pilav 4 g/porsiyon) kapiya takiliyor ve
  // geriye protein tasimayan tek sey — yag — kaliyordu. Sonuc: 3900 kcal'lik
  // gunde 134 g yagin 72 GRAMI eklenen yagdi (3 kasik zeytinyagi + 2 kasik
  // tahin + fistik ezmesi + badem). Enerji payi olarak (%32) AMDR icinde
  // ama gunde 5 kasik sivi yag PRATIKTE yenmez. Eklenen yag artik gun yag
  // hedefinin yarisini gecemez; gerisi gidanin kendi yagindan gelir.
  eklenenYagPay: 0.55,
  // ⚠️ SAF YAG AYRI SAYILIR. Tahin ve kuruyemis yiyecek gibi durur; sivi yag
  // durmaz. "Gunde 5 kasik zeytinyagi" sikayetinin kaynagi buydu — toplam
  // eklenen yag sinirini gecmiyordu ama saf yag olarak dokulunce sacmaydi.
  // Saf yag = protein YOK, karbonhidrat YOK (zeytinyagi; tahin degil).
  safYagMax: 3,
  gainSurplus: 350,         // yagsiz kazanim; buyuk fazla yag olarak birikir
  waterMlPerKg: 35,
  waterPerSession: 600,     // ml, agirlik seansi basina ek
  waterPerFight: 1000,      // ml, dovus seansi — ter hizi belirgin yuksek
  // ⚠️ ENERJI MEVCUDIYETI (20 Agu 2026). Eski "guvenlik tabani BMR" kurali
  // bilimsel olarak taban DEGILDI: 70 kg / 60 kg yagsiz kutle / 600 kcal
  // seansta BMR tabani EA ~21 kcal/kg FFM'e denk geliyor — IOC REDs
  // konsensusunun "bozulma" bolgesinin derinleri. Erkek ergende REDs'in
  // uyari sinyali (amenore gibi) yok; buyume geriligi ve uyku bozuklugu
  // ile ortaya cikiyor. Taban artik EA temelli.
  eaKritik: 30,             // kcal/kg yagsiz kutle — ALTI bozulma bolgesi
  eaSaglikli: 45,           // kcal/kg FFM — optimal bant
  ffmOran: 0.85,            // yagsiz kutle bilinmiyorsa muhafazakar tahmin
  seansKcal: 500,           // seans basi tahmini harcama (EA hesabi icin)
};

/**
 * MIKRO BESIN VERISI (18 Agu 2026) — PORSIYON BASINA.
 *
 * ⚠️ KAPSAM DURUSTLUGU — bu tablonun en onemli ozelligi.
 * TURK_FOODS 410 besin iceriyor; bu tabloda ~65'i var. Kismi veriyle "bugun
 * 1180 mg kalsiyum aldin" demek YANILTICI olur: hesaba katilmayan besinler
 * de kalsiyum tasiyor ve kullanici eksik sanip gereksiz takviye alabilir.
 * Bu yuzden motor her zaman KAPSAMI da yaziyor: "1180 mg — planin %85'i
 * hesaplandi, kalan %15'te veri yok". Sayi tek basina asla verilmiyor.
 *
 * 🟡 Degerler USDA / TurKomp ortalamalarindan porsiyona cevrilmis
 * YAKLASIK degerlerdir. Ayni yemegin evden eve degismesi zaten bu
 * hassasiyetin ustunde bir belirsizlik — hedefin %10'u icin ugrasmak
 * anlamsiz, buyuk aciklari gormek anlamli.
 *
 * Alanlar: ca (mg) · fe (mg) · d (IU) · lif (g)
 */
const NUT_MICRO_DATA = {
  // --- Sut urunleri: kalsiyumun ana kaynagi ---
  'Süt':              { ca: 239, fe: 0,   d: 5,   lif: 0 },
  'Ayran':            { ca: 200, fe: 0,   d: 4,   lif: 0 },
  'Kefir':            { ca: 234, fe: 0,   d: 4,   lif: 0 },
  'Yoğurt':           { ca: 238, fe: 0.1, d: 3,   lif: 0 },
  'Süzme yoğurt':     { ca: 149, fe: 0.1, d: 2,   lif: 0 },
  'Meyveli yoğurt':   { ca: 103, fe: 0.1, d: 1,   lif: 0.3 },
  'Beyaz peynir':     { ca: 150, fe: 0.1, d: 4,   lif: 0 },
  'Kaşar peyniri':    { ca: 225, fe: 0.1, d: 6,   lif: 0 },
  'Lor peyniri':      { ca: 31,  fe: 0,   d: 0,   lif: 0 },
  'Labne':            { ca: 13,  fe: 0,   d: 1,   lif: 0 },
  'Krem peynir':      { ca: 12,  fe: 0,   d: 1,   lif: 0 },
  'Haydari':          { ca: 120, fe: 0.2, d: 2,   lif: 0.5 },
  // --- Yumurta: D vitamininin gidadaki az kaynagindan biri ---
  'Yumurta':          { ca: 25,  fe: 0.9, d: 40,  lif: 0 },
  'Haşlanmış yumurta':{ ca: 25,  fe: 0.9, d: 40,  lif: 0 },
  'Omlet':            { ca: 39,  fe: 1.4, d: 63,  lif: 0 },
  'Menemen':          { ca: 90,  fe: 3.3, d: 132, lif: 3.3 },
  'Peynirli omlet':   { ca: 315, fe: 2.7, d: 128, lif: 0 },
  'Sahanda yumurta':  { ca: 22,  fe: 0.8, d: 33,  lif: 0 },
  // --- Kirmizi et: demirin en iyi emilen formu (hem demir) ---
  'Dana kıyma':       { ca: 13,  fe: 2.9, d: 4,   lif: 0 },
  'Dana bonfile':     { ca: 13,  fe: 3.9, d: 5,   lif: 0 },
  'Kuzu pirzola':     { ca: 15,  fe: 2.6, d: 3,   lif: 0 },
  'Kavurma':          { ca: 11,  fe: 2.6, d: 3,   lif: 0 },
  'İzgara köfte':     { ca: 28,  fe: 3,   d: 4,   lif: 0.5 },
  'Et döner':         { ca: 19,  fe: 3.3, d: 4,   lif: 0 },
  'Ciğer tava':       { ca: 14,  fe: 7.8,d: 22,  lif: 0 },
  'Adana kebap':      { ca: 19,  fe: 2.8, d: 3,   lif: 0.4 },
  'Şiş kebap':        { ca: 19,  fe: 3.5, d: 4,   lif: 0 },
  // --- Kanatli: demiri kirmizi etin yarisi kadar ---
  'Tavuk göğsü':      { ca: 18,  fe: 1.4, d: 6,   lif: 0 },
  'Tavuk but':        { ca: 16,  fe: 1.7, d: 8,   lif: 0 },
  'Tavuk şiş':        { ca: 17,  fe: 1.5, d: 6,   lif: 0 },
  // --- Yagli balik: D vitamininin gidadaki EN iyi kaynagi ---
  'Somon':            { ca: 16,  fe: 0.5, d: 804, lif: 0 },
  'Uskumru':          { ca: 23,  fe: 1.6, d: 577, lif: 0 },
  'Sardalya':         { ca: 300, fe: 2.4, d: 300, lif: 0 },
  'Hamsi tava':       { ca: 200, fe: 2.2, d: 400, lif: 0.5 },
  'Palamut':          { ca: 33,  fe: 2.1, d: 457, lif: 0 },
  'Ton balığı':       { ca: 11,  fe: 1.1, d: 183, lif: 0 },
  'Balık ızgara':     { ca: 60,  fe: 1.9, d: 484, lif: 0 },
  'Levrek':           { ca: 30,  fe: 0.8, d: 225, lif: 0 },
  // --- Baklagil: demir + lifin birlikte geldigi yer ---
  'Mercimek çorbası': { ca: 32,  fe: 2.3, d: 0,   lif: 4.6 },
  'Ezogelin çorbası': { ca: 30,  fe: 2,   d: 0,   lif: 4.3 },
  'Nohut':            { ca: 68,  fe: 4.1, d: 0,   lif: 10.5 },
  'Etli nohut':       { ca: 59,  fe: 4.1, d: 2,   lif: 8.8 },
  'Kuru fasulye':     { ca: 87,  fe: 3.7, d: 0,   lif: 10.7 },
  'Etli kuru fasulye':{ ca: 78,  fe: 3.7, d: 2,   lif: 9.2 },
  'Mercimek yemeği':  { ca: 48,  fe: 4.2, d: 0,   lif: 9.7 },
  'Humus':            { ca: 24,  fe: 1,   d: 0,   lif: 2.4 },
  'Piyaz':            { ca: 31,  fe: 1.1, d: 0,   lif: 3.1 },
  // --- Tahil ---
  'Tam buğday ekmek': { ca: 17,  fe: 0.8, d: 0,   lif: 2.3 },
  'Ekmek':            { ca: 13,  fe: 0.8, d: 0,   lif: 0.9 },
  'Simit':            { ca: 91,  fe: 2.5, d: 0,   lif: 3.4 },
  'Yulaf ezmesi':     { ca: 19,  fe: 1.7, d: 0,   lif: 3.7 },
  'Bulgur pilavı':    { ca: 16,  fe: 1.3, d: 0,   lif: 6 },
  'Sebzeli bulgur':   { ca: 25,  fe: 1.4, d: 0,   lif: 6.3 },
  'Pilav':            { ca: 9,   fe: 0.7, d: 0,   lif: 0.8 },
  'Makarna':          { ca: 12,  fe: 1.4, d: 0,   lif: 3.1 },
  'Tam buğday makarna': { ca: 27,  fe: 2,   d: 0,   lif: 8.1 },
  'Kinoa':            { ca: 25,  fe: 1.9, d: 0,   lif: 3.8 },
  'Leblebi':          { ca: 44,  fe: 1.4, d: 0,   lif: 3.9 },
  // --- Sebze / meyve: lif ---
  'Çoban salata':     { ca: 30,  fe: 0.8, d: 0,   lif: 2.5 },
  'Mevsim salata':    { ca: 30,  fe: 0.8, d: 0,   lif: 2.4 },
  'Ispanak yemeği':   { ca: 154, fe: 2.8, d: 0,   lif: 4.6 },
  'Fırında sebze':    { ca: 134, fe: 2.7, d: 0,   lif: 11.2 },
  'Türlü':            { ca: 113, fe: 2.5, d: 0,   lif: 10 },
  'Karnıyarık':       { ca: 64,  fe: 2,   d: 3,   lif: 7.1 },
  'Domates':          { ca: 17,  fe: 0.4, d: 0,   lif: 3.3 },
  'Salatalık':        { ca: 21,  fe: 0.3, d: 0,   lif: 1.7 },
  'Haşlanmış patates':{ ca: 16,  fe: 1,   d: 0,   lif: 4 },
  'Muz':              { ca: 5,   fe: 0.3, d: 0,   lif: 2 },
  'Elma':             { ca: 12,  fe: 0.2, d: 0,   lif: 4.6 },
  'Armut':            { ca: 15,  fe: 0.3, d: 0,   lif: 4.9 },
  'Portakal':         { ca: 63,  fe: 0.1, d: 0,   lif: 3.8 },
  'Kuru üzüm':        { ca: 16,  fe: 0.5, d: 0,   lif: 1 },
  'Kuru kayısı':      { ca: 6,   fe: 0.2, d: 0,   lif: 0.6 },
  // --- Kuruyemis / yag ---
  'Badem':            { ca: 33,  fe: 0.4, d: 0,   lif: 1.5 },
  'Ceviz':            { ca: 9,   fe: 0.3, d: 0,   lif: 0.6 },
  'Fındık':           { ca: 14,  fe: 0.5, d: 0,   lif: 1.1 },
  'Antep fıstığı':    { ca: 33,  fe: 1.2, d: 0,   lif: 3.1 },
  'Yer fıstığı':      { ca: 27,  fe: 1.4, d: 0,   lif: 2.6 },
  'Kabak çekirdeği':  { ca: 18,  fe: 5,   d: 0,   lif: 2.4 },
  'Ay çekirdeği':     { ca: 21,  fe: 1.6, d: 0,   lif: 2.1 },
  'Tahin':            { ca: 61,  fe: 0.7, d: 0,   lif: 1.3 },
  'Fıstık ezmesi':    { ca: 8,   fe: 0.6, d: 0,   lif: 0.9 },
  'Zeytin':           { ca: 18,  fe: 0.7, d: 0,   lif: 0.7 },
  'Zeytinyağı':       { ca: 0,   fe: 0.1, d: 0,   lif: 0 },
  'Tereyağı':         { ca: 2,   fe: 0,   d: 5,   lif: 0 },
  'Avokado':          { ca: 13,  fe: 0.6, d: 0,   lif: 6.7 },
  // --- Diger ---
  'Protein tozu':     { ca: 97,  fe: 0.3, d: 0,   lif: 0.5 },
  'Bal':              { ca: 1,   fe: 0.1, d: 0,   lif: 0 },
  'Sütlaç':           { ca: 204, fe: 0.3, d: 3,   lif: 0.7 },
  'Chia puding':      { ca: 271, fe: 3,   d: 2,   lif: 12 },
  'Müsli':            { ca: 17,  fe: 0.8, d: 0,   lif: 2.1 },
  'Granola':          { ca: 23,  fe: 1.2, d: 0,   lif: 3 },
  // --- Diyet / light urunler (Eyl 2026): light sut urunu yagi duser,
  // KALSIYUMU dusmez. Bunlari tabloya koymamak kapsami dusurup motoru
  // gereksiz yere susturuyordu. ---
  'Süt (yağsız)':          { ca: 240, fe: 0,   d: 5,  lif: 0 },
  'Süt (yarım yağlı)':     { ca: 240, fe: 0,   d: 5,  lif: 0 },
  'Yoğurt (yağsız)':       { ca: 240, fe: 0.1, d: 2,  lif: 0 },
  'Yunan yoğurdu (yağsız)':{ ca: 220, fe: 0.1, d: 2,  lif: 0 },
  'Protein yoğurt':        { ca: 240, fe: 0.1, d: 2,  lif: 0 },
  'Ayran (light)':         { ca: 200, fe: 0,   d: 3,  lif: 0 },
  'Kefir (light)':         { ca: 240, fe: 0,   d: 3,  lif: 0 },
  'Beyaz peynir (light)':  { ca: 150, fe: 0.1, d: 3,  lif: 0 },
  'Kaşar peyniri (light)': { ca: 250, fe: 0.1, d: 4,  lif: 0 },
  'Labne (light)':         { ca: 18,  fe: 0,   d: 1,  lif: 0 },
  'Krem peynir (light)':   { ca: 11,  fe: 0,   d: 1,   lif: 0 },
  'Cottage peyniri':       { ca: 83,  fe: 0.1, d: 0,  lif: 0 },
  // Yumurtanin D vitamini ve demiri SARISINDA — ak neredeyse sifir.
  'Yumurta akı':           { ca: 2,   fe: 0,   d: 0,  lif: 0 },
  'Sıvı yumurta akı':      { ca: 14,  fe: 0.1, d: 0,  lif: 0 },
  'Yumurta sarısı':        { ca: 22,  fe: 0.5, d: 37, lif: 0 },
  'Whey protein (izolat)': { ca: 60,  fe: 0.2, d: 0,  lif: 0 },
  'Kazein tozu':           { ca: 150, fe: 0.2, d: 0,  lif: 0 },
  'Protein süt':           { ca: 300, fe: 0,   d: 6,  lif: 0 },
  'Protein puding':        { ca: 200, fe: 0.4, d: 1,  lif: 1 },
  'Protein bar':           { ca: 98,  fe: 1.5, d: 0,   lif: 2.9 },
  'Hindi füme':            { ca: 2,   fe: 0.2, d: 0,  lif: 0 },
  'Tavuk göğsü füme':      { ca: 2,   fe: 0.2, d: 0,  lif: 0 },
  'Ton balığı (yağda)':    { ca: 12,  fe: 1.2, d: 200,lif: 0 },
  'Şirataki makarna':      { ca: 40,  fe: 0.1, d: 0,  lif: 6 },
  'Diyet galeta':          { ca: 2,   fe: 0.2, d: 0,  lif: 1 },
  'Pirinç patlağı galeta': { ca: 1,   fe: 0.1, d: 0,  lif: 0 },
  'Mısır patlağı (yağsız)':{ ca: 2,   fe: 0.5, d: 0,  lif: 3 },
  'Bitter çikolata (%85)': { ca: 7,   fe: 1.1, d: 0,  lif: 1 },
  'Badem sütü (şekersiz)': { ca: 30,  fe: 0.2, d: 0,  lif: 1 },
  // --- 5 Eyl 2026: SABLON HAVUZUNDAKI ACIKLAR ---
  // ⚠️ Bu sekizi sablonlarda VARDI ama mikro tablosunda YOKTU. Kapsam testi
  // yalniz PLANDA CIKAN besinleri kontrol ediyor; slotlar tek indeks uzerinde
  // yurudugu icin (bkz. nutBuildDay) havuzun bu kismi plana hic dusmuyordu ve
  // test kazayla geciyordu. Slot cakismasi cozulunce acik gorunur oldu.
  'Tavuk döner':           { ca: 25,  fe: 1.6, d: 6,   lif: 0.4 },
  'Hindi eti':             { ca: 27,  fe: 2,   d: 4,   lif: 0 },
  'Çökelek':               { ca: 20,  fe: 0.2, d: 1,  lif: 0 },
  'Bazlama':               { ca: 32,  fe: 1,   d: 0,   lif: 1.6 },
  'Cacık':                 { ca: 200, fe: 0.2, d: 2,  lif: 0.5 },
  'Fırın patates':         { ca: 14,  fe: 1.1, d: 0,   lif: 3.6 },
  'Üzüm':                  { ca: 15,  fe: 0.5, d: 0,   lif: 1.3 },
  'Hurma':                 { ca: 4,   fe: 0.1, d: 0,   lif: 0.7 },
};

/**
 * MIKRO BESIN HEDEFLERI — erkek, 14-18 yas.
 * Neden bu dortlu: 16 yasinda, haftada 6 gun antrenman yapan bir dovus
 * sporcusunda risk sirasi bu.
 */
const NUT_MICRO = [
  {
    id: 'kalsiyum', alan: 'ca', birim: 'mg', hedefSayi: 1300, ustSinir: 3000,
    ad: 'Kalsiyum', hedef: '1300 mg',
    neden: 'Zirve kemik kütlesinin yaklaşık %90\'ı 18 yaşına kadar kuruluyor. ' +
      'Bu pencere kapandıktan sonra geri alınamaz; darbeli bir sporda ayrıca korumadır.',
    kaynak: ['Süt', 'Yoğurt', 'Kefir', 'Ayran', 'Beyaz peynir', 'Kaşar peyniri',
      'Süzme yoğurt', 'Lor peyniri', 'Labne', 'Haydari'],
    porsiyon: '3-4 porsiyon süt ürünü',
  },
  {
    id: 'demir', alan: 'fe', birim: 'mg', hedefSayi: 11, ustSinir: 45,
    ad: 'Demir', hedef: '11 mg',
    neden: 'Büyüme + haftada 6 gün antrenman demir ihtiyacını yükseltir. ' +
      'Eksikliğin ilk belirtisi dayanıklılık düşüşü — 3. raundda biten kişi.',
    kaynak: ['Dana kıyma', 'Dana bonfile', 'Kuzu pirzola', 'Kavurma', 'Ciğer tava',
      'Mercimek çorbası', 'Etli nohut', 'Etli kuru fasulye', 'Kuru fasulye', 'Nohut'],
    porsiyon: 'Haftada 3-4 kez kırmızı et ya da baklagil',
    ipucu: 'Demir emilimi C vitaminiyle artar — yanına salata, limon ya da meyve koy. ' +
      'Çayı öğünden 1 saat sonra iç, öğünle birlikte emilimi düşürür.',
  },
  {
    id: 'dvit', alan: 'd', birim: 'IU', hedefSayi: 600, ustSinir: 4000,
    ad: 'D vitamini', hedef: '600 IU',
    neden: 'Kalsiyumun kemiğe girmesi için gerekli; Türkiye\'de eksikliği yaygın. ' +
      'Gıdadan tam karşılanması zordur — kışın kan değerine bakılması gereken tek madde budur.',
    kaynak: ['Somon', 'Uskumru', 'Sardalya', 'Hamsi tava', 'Palamut', 'Yumurta'],
    porsiyon: 'Haftada 2 kez yağlı balık + güneş',
    ipucu: 'Takviye kararı kan değerine bakan hekimin işi — motor takviye önermez.',
  },
  {
    id: 'lif', alan: 'lif', birim: 'g', hedefSayi: 38, ustSinir: null,
    ad: 'Lif', hedef: '30-38 g',
    neden: 'Yüksek kalorili bir planda lif kolayca düşer; sindirim ve tokluk bozulur.',
    kaynak: ['Çoban salata', 'Mercimek çorbası', 'Nohut', 'Kuru fasulye', 'Yulaf ezmesi',
      'Tam buğday ekmek', 'Bulgur pilavı', 'Elma', 'Armut', 'Muz', 'Fırında sebze'],
    porsiyon: 'Her ana öğünde sebze/salata + günde 1 baklagil ya da tam tahıl',
  },
];

/**
 * TAKVIYE KATMANI (18 Agu 2026).
 *
 * 🔴 SIRA DEGISMEZ: ONCE GIDA. Takviye yalnizca gida hedefi tutturmuyorsa
 * gundeme gelir ve o zaman bile ilk oneri "su gidayi ekle" olur. Bunun
 * sebebi ahlaki degil pratik: gidadan gelen mikro besin, yaninda geldigi
 * diger seylerle (protein, lif, potasyum, matris) birlikte calisiyor.
 *
 * 🔴 IKI SERT KAPI:
 *   - DEMIR: kan degeri olmadan ASLA onerilmez. Fazla demir vucuttan
 *     atilamaz, karacigerde birikir. Motor demir acigini yalniz GIDAYLA
 *     kapatmayi onerir.
 *   - UST SINIR: gida + takviye toplami ust sinirin ustune cikacaksa
 *     takviye onerilmez.
 */
const NUT_SUPP = {
  kalsiyum: {
    ad: 'Kalsiyum sitrat', kanit: '🟡',
    dozKurali: (acik) => Math.min(500, Math.round(acik / 100) * 100),
    birim: 'mg',
    oncelik: 'Önce süt ürünü: 1 bardak süt 225 mg, 1 kase yoğurt 220 mg. ' +
      'Günde bir porsiyon eklemek açığın çoğunu kapatır.',
    nasil: 'Tek seferde 500 mg üstü emilmiyor — bölerek al. Yemekle birlikte.',
    uyari: 'Demir takviyesiyle AYNI öğünde alınmaz, emilimi düşürür.',
  },
  dvit: {
    ad: 'D3 vitamini', kanit: '🟢',
    dozKurali: (acik) => (acik > 400 ? 1000 : 600),
    birim: 'IU',
    oncelik: 'Gıdadan karşılanması pratikte zor: 600 IU için haftada 2 kez yağlı balık ' +
      'ya da her gün ~15 yumurta gerekir. Güneş yazın ana kaynak, kışın değil.',
    nasil: 'Yağda çözünür — yağ içeren bir öğünle al.',
    uyari: '⚠️ Doz kan değerine göre belirlenir. 25(OH)D testi yaptırmadan yüksek doz ' +
      '(4000 IU üstü) alınmaz; karar hekimin. Aidan sadece açığın büyüklüğünü gösterir.',
  },
  demir: {
    ad: null, kanit: '🔴',
    dozKurali: null,   // ⚠️ TAKVIYE ONERILMEZ
    birim: 'mg',
    oncelik: 'Açığı gıdayla kapat: 1 porsiyon kırmızı et 3.4 mg, 1 porsiyon nohut 3.9 mg, ' +
      '1 kase mercimek çorbası 2.5 mg.',
    nasil: 'Emilimi C vitamini artırır — yanına salata, limon ya da portakal. ' +
      'Çayı öğünden 1 saat sonra iç; öğünle birlikte emilimi yarı yarıya düşürür.',
    uyari: '🔴 KAN DEĞERİ OLMADAN DEMİR TAKVİYESİ ALINMAZ. Fazla demir vücuttan ' +
      'atılamaz, karaciğerde birikir. Ferritin ve hemoglobin bakılmadan başlanmaz — ' +
      'bu yüzden Aidan demirde takviye önermiyor, sadece gıda öneriyor.',
  },
  lif: {
    ad: null, kanit: '🟢',
    dozKurali: null,   // gida ile kolayca kapaniyor
    birim: 'g',
    oncelik: '1 porsiyon nohut 10 g, kuru fasulye 11 g, 1 armut 5 g, ' +
      '1 kase mercimek çorbası 5 g.',
    nasil: 'Lifi artırırken suyu da artır, yoksa tersi olur.',
    uyari: 'Lif takviyesi (psyllium vb.) sporcuda gerekmez — gıdayla kapanır.',
  },
};

/**
 * PERFORMANS TAKVIYELERI — bilgi, RECETE DEGIL.
 * ⚠️ Motor bunlari plana KOYMAZ ve "al" demez. Kanit seviyesini yaziyor ki
 * kullanici internetteki iddialarla karsilastirabilsin; 16 yasinda karar
 * antrenor + hekim isidir.
 */
const NUT_ERGO = [
  { ad: 'Kreatin monohidrat', kanit: '🟢',
    ne: 'Tekrarli patlayici efor ve kuvvette en cok calisilmis, en tutarli etkiyi gosteren madde.',
    not: 'Genc sporcularda kullanimini destekleyen pozisyon bildirileri var, ama 16 yasinda ' +
      'karar antrenör + hekimin. Aidan plana koymuyor.' },
  { ad: 'Kafein', kanit: '🟢',
    ne: 'Algilanan efor duser, dayaniklilik ve tepki suresi iyilesir.',
    not: 'Ergende uyku ve buyume hormonu salinimi kritik — aksam antrenmaninda kullanimi ' +
      'uykuyu bozar ve kazanci geri alir. Aidan onermiyor.' },
  { ad: 'Beta-alanin', kanit: '🟡',
    ne: '1-4 dakikalik yuksek siddetli efordda (bir raunt tam bu araliktadir) yorgunlugu geciktiriyor.',
    not: 'Etkisi kreatinden kucuk ve haftalar suren yukleme gerektiriyor.' },
  { ad: 'Omega-3 (EPA/DHA)', kanit: '🟡',
    ne: 'Haftada 2 kez yagli balik yenmiyorsa akla gelen tek genel takviye.',
    not: 'Once balik. Takviye ikinci secenek.' },
  { ad: 'Protein tozu', kanit: '🟢',
    ne: 'Takviye degil, pratik bir GIDA. Gunluk protein hedefi zaten tutuyorsa ek fayda yok.',
    not: 'Aidan bunu zaten ogun sablonlarinda kullaniyor — ayrica onerilecek bir sey degil.' },
];

/**
 * Gunluk planin mikro besin toplami + KAPSAM.
 * ⚠️ Kapsam olmadan toplam yaniltici: veri tablosunda olmayan besinler de
 * mikro besin tasiyor. Kapsam, hesaba KATILAN kalorilerin gun toplamina orani.
 */
function nutMicroTotals(meals) {
  const toplam = { ca: 0, fe: 0, d: 0, lif: 0 };
  let kapsananK = 0, tumK = 0;
  const eksikBesinler = [];
  for (const m of meals || []) {
    for (const it of (m.items || [])) {
      const k = (Number(it.adet) || 0) * (Number(it.k) || 0);
      tumK += k;
      const v = NUT_MICRO_DATA[it.n];
      if (!v) { if (eksikBesinler.indexOf(it.n) < 0) eksikBesinler.push(it.n); continue; }
      kapsananK += k;
      for (const alan of ['ca', 'fe', 'd', 'lif']) {
        toplam[alan] += (Number(it.adet) || 0) * (Number(v[alan]) || 0);
      }
    }
  }
  return {
    toplam: {
      ca: Math.round(toplam.ca), fe: Math.round(toplam.fe * 10) / 10,
      d: Math.round(toplam.d), lif: Math.round(toplam.lif),
    },
    kapsam: tumK > 0 ? Math.round((kapsananK / tumK) * 100) : 0,
    kapsanmayan: eksikBesinler,
  };
}

/**
 * Mikro besin durumu + TAKVIYE PLANI.
 * Sira: gida hedefi tutuyor mu → tutmuyorsa once gida onerisi → takviye
 * yalnizca gerekiyorsa ve guvenliyse.
 */
function nutMicroCheck(meals) {
  const t = nutMicroTotals(meals);
  const adlar = new Set();
  for (const m of meals || []) for (const it of (m.items || [])) adlar.add(it.n);

  return NUT_MICRO.map(mi => {
    const alinan = t.toplam[mi.alan];
    const hedef = mi.hedefSayi;
    const acik = Math.max(0, hedef - alinan);
    const oran = hedef > 0 ? Math.round((alinan / hedef) * 100) : 0;
    const supp = NUT_SUPP[mi.id] || {};

    // ⚠️ Kapsam dusukse "eksik" demek yanlis olur — bilmedigimiz besinler de
    // tasiyor. %70'in altinda kapsamda motor yorum yapmaz, veriyi gosterir.
    const guvenilir = t.kapsam >= 70;
    const yeterli = alinan >= hedef * 0.9;

    // Takviye onerisi UC kosula birden bagli:
    //   1) gercek bir acik var (hedefin %90'inin altinda)
    //   2) kapsam guvenilir (yoksa hayali acik uretiriz)
    //   3) o besin icin takviye GUVENLI (demirde degil)
    let takviye = null;
    if (acik > 0 && !yeterli && guvenilir && typeof supp.dozKurali === 'function') {
      const doz = supp.dozKurali(acik);
      const toplamTahmin = alinan + doz;
      // Ust sinir kapisi: gida + takviye toplami ust siniri gecmez
      if (!mi.ustSinir || toplamTahmin <= mi.ustSinir) {
        takviye = { ad: supp.ad, doz, birim: mi.birim, kanit: supp.kanit, nasil: supp.nasil };
      }
    }

    return {
      id: mi.id, ad: mi.ad, hedef: mi.hedef, hedefSayi: hedef, birim: mi.birim,
      neden: mi.neden, porsiyon: mi.porsiyon, ipucu: mi.ipucu || null,
      alinan, oran, acik, yeterli, guvenilir, kapsam: t.kapsam,
      varMi: mi.kaynak.some(k => adlar.has(k)),
      oneri: mi.kaynak.slice(0, 4),
      gidaOnce: supp.oncelik || null,
      uyari: supp.uyari || null,
      takviye,
    };
  });
}

// Gun tipine gore fiziksel aktivite katsayisi (PAL).
// Tek bir "aktivite seviyesi" sormak yerine PROGRAMDAN turetiliyor —
// antrenman gunu ile dinlenme gunu ayni kalori DEGILDIR.
// ⚠️ 21 Agu 2026 — CIFT ANTRENMAN GUNU 1.9 -> 1.8.
// Salim: "3900 kalori inanilmaz fazla". Kaba akil kontrolu onu dogruluyor:
// 68.5 kg'da 3903 kcal = 57 kcal/kg, sporcu bulk araligi ise 44-50.
// FAO'nun "yogun" bandi (2.0-2.4) GUN BOYU fiziksel is varsayar — tarlada
// calisan bir ergen. Okulda oturup 90 dakika antrenman yapan biri icin
// GUNUN TAMAMININ carpani o kadar yuksek degil. 1.8 ile cift antrenman
// gunu 3716 (54 kcal/kg) — hala ust uc ama savunulabilir.
// ⚠️ ASIL COZUM TAHMIN DEGIL OLCUM: palKat (asagida) kullanicinin kendi
// log + tarti verisinden gelen duzeltmeyi uygular. Formul bir baslangic
// noktasi; iki hafta veri biriktikten sonra sayiyi tarti soyler.
//
// ⚠️ 20 Agu 2026 — DINLENME GUNU 1.4'TEN 1.55'E. FAO/WHO/UNU'nun ERGEN
// tablosunda 16-17 yas erkek icin en dusuk kategori bile 1.55; 1.40 o
// raporda YETISKIN "sedanter"in alt ucu ve ergende karsiligi yok. Okula
// yuruyen bir 16 yasindaki icin gunde ~285 kcal sistematik eksik demekti —
// motorun kendi beyan ettigi "bu profilde asil risk AZ YEMEK" ilkesiyle en
// cok celisen sabit buydu. Agirlik gunu de sporcu ergen bandinin (1.75-2.05)
// altindaydi, 1.7'ye cikti. fight/both zaten bandin icinde, dokunulmadi.
const NUT_PAL = { rest: 1.55, strength: 1.7, fight: 1.75, both: 1.8 };

const NUT_DAY_LABEL = {
  rest: 'Dinlenme günü', strength: 'Ağırlık günü',
  fight: 'Dövüş günü', both: 'Ağırlık + dövüş',
};

/**
 * Bazal metabolizma — ⚠️ KENDI FORMULU YOK, paylasilan cekirdegi cagirir.
 * `hcBMR` ui.js ve worker.js'te byte-byte ozdes durur; saglik raporu ile
 * beslenme plani AYNI sayiyi kullansin diye tek kaynak orasi.
 * (Once burada Schofield, hcEnergyCheck'te Mifflin vardi — celisiyorlardi.)
 */
function nutBMR(sex, age, kg, cm) {
  if (typeof hcBMR !== 'function') return 0;   // cekirdek yuklenmeden cagrilmaz
  return hcBMR(sex, age, kg, cm);
}

/** Antrenman programindan o gunun tipini cikar. */
function nutDayType(dow, program) {
  const p = program || (typeof data !== 'undefined' ? data.program : null);
  if (!p || !Array.isArray(p.days)) return 'rest';
  const gun = p.days.filter(d => d && d.dow === dow);
  const guc = gun.some(d => d.type === 'strength');
  const dovus = gun.some(d => d.type === 'fight') ||
    (Array.isArray(p.fightDays) && p.fightDays.indexOf(dow) >= 0);
  if (guc && dovus) return 'both';
  if (dovus) return 'fight';
  if (guc) return 'strength';
  return 'rest';
}

/**
 * Gunluk enerji ve makro hedefi.
 * ⚠️ Kilo verme dali YOK. Hedef yalnizca 'koru' ya da 'kas'.
 */
/**
 * ⚠️ 4. parametre yagOran: verilmezse KULLANICI AYARI, o da yoksa varsayilan.
 * Testler ucuncu parametreye kadar cagiriyor ve ayar okumasi data'ya bakiyor;
 * harness'ta data.diet.nut bos oldugu icin varsayilan geliyor.
 */
function nutTargets(profil, dayType, hedef, yagOran) {
  const kg = Number(profil && profil.weight) || 0;
  const cm = Number(profil && profil.height) || 0;
  const age = Number(profil && profil.age) || 16;
  const sex = (profil && profil.sex) || 'male';
  if (!(kg > 0)) return null;

  const bmr = nutBMR(sex, age, kg, cm);
  // Tahmin edilen PAL, kullanicinin olculmus duzeltmesiyle carpilir (yoksa 1).
  const pal = Math.round(((NUT_PAL[dayType] || NUT_PAL.rest) * nutPalKat()) * 100) / 100;
  const tdee = Math.round(bmr * pal);
  const kas = hedef === 'kas';
  let kcal = tdee + (kas ? NUT_LIMITS.gainSurplus : 0);

  // 🔒 GUVENLIK TABANI: ENERJI MEVCUDIYETI (eski hali "BMR alti olamaz"di).
  // EA = (alim - antrenman harcamasi) / yagsiz kutle. Kritik esik 30 kcal/kg
  // FFM; hedef hicbir kosulda bunun altina inemez. Yagsiz kutle olcumu yoksa
  // muhafazakar tahmin kullanilir (kg x 0.85) — tahmin YUKARI degil ASAGI
  // sapsin diye oran dusuk tutuldu.
  const seans = dayType === 'both' ? 2 : (dayType === 'rest' ? 0 : 1);
  const ffm = Math.round(kg * NUT_LIMITS.ffmOran);
  const antrenmanKcal = seans * NUT_LIMITS.seansKcal;
  const eaTaban = Math.round(NUT_LIMITS.eaKritik * ffm + antrenmanKcal);
  const eaSaglikli = Math.round(NUT_LIMITS.eaSaglikli * ffm + antrenmanKcal);
  kcal = Math.max(kcal, eaTaban);

  const proteinG = Math.min(
    Math.round(kg * (kas ? NUT_LIMITS.proteinPerKgGain : NUT_LIMITS.proteinPerKg)),
    Math.round(kg * NUT_LIMITS.proteinMaxPerKg));
  // Yag: yuzde kurali ile taban kuralindan BUYUK olani kazanir.
  // Yag: yuzde kurali ile g/kg tabanindan BUYUK olani kazanir. Yuzde artik
  // ayarlanabilir (bant %25-32); taban her kosulda gecerli.
  const yPct = nutYagOran(yagOran);
  const fatG = Math.max(
    Math.round(kg * NUT_LIMITS.fatMinPerKg),
    Math.round(kcal * yPct / 9));
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  // ⚠️ Su eki SEANS TIPINE gore (20 Agu 2026). Tek "600 ml" sabiti dovus
  // seansi icin dusuktu: ACSM egzersiz SIRASINDA 0.4-0.8 L/saat diyor,
  // ergen sporcu derlemesi buyuk ergenlerde saatte 1 L'ye kadar. Kesin
  // sayi ancak TARTI ile bulunur; bu bir baslangic tahmini.
  const suEk = dayType === 'both'
    ? NUT_LIMITS.waterPerSession + NUT_LIMITS.waterPerFight
    : (dayType === 'fight' ? NUT_LIMITS.waterPerFight
      : (dayType === 'strength' ? NUT_LIMITS.waterPerSession : 0));
  const suMl = Math.round(kg * NUT_LIMITS.waterMlPerKg + suEk);

  return {
    dayType, hedef: kas ? 'kas' : 'koru',
    bmr, pal, tdee, kcal, yagOran: yPct,
    ffm, eaTaban, eaSaglikli,
    // Planin kendi EA'si — 30-45 arasi "dikkat", 30 alti kirmizi cizgi.
    ea: ffm > 0 ? Math.round((kcal - antrenmanKcal) / ffm) : null,
    protein: proteinG, carb: carbG, fat: fatG,
    carbPerKg: Math.round((carbG / kg) * 10) / 10,
    proteinPerKg: Math.round((proteinG / kg) * 10) / 10,
    waterL: Math.round(suMl / 100) / 10,
  };
}

/**
 * OGUN ORANLARI — [kalori orani, KARBONHIDRAT orani].
 *
 * ⚠️ 18 Agu 2026 — iki degisiklik:
 *
 * 1) KARBONHIDRAT ANTRENMANIN ETRAFINA KAYIYOR. Motor zamanlama kuralini
 *    METIN olarak yaziyordu ("antrenmandan 1-3 saat once karbonhidrat") ama
 *    makro dagilimi bunu YANSITMIYORDU — her ogun ayni orani aliyordu.
 *    Yazip uygulamamak, hic yazmamaktan daha kotu.
 * 2) YUKSEK KALORIDE 5. OGUN. 3200 kcal'i 4 ogune bolmek ogun basi 800-950
 *    kcal demek. 16 yasinda, gunde bir de dovus antrenmani varken bu miktar
 *    pratikte yenmez — plan kagit uzerinde dogru, hayatta uygulanamaz olur.
 *
 * Yag orani ayri tanimlanmaz: ogunun kalorisinden protein ve karbonhidrat
 * dusuldukten sonra KALAN yagdir. Boylece antrenman etrafindaki ogunlerde yag
 * dogal olarak duser (mide rahat olsun), uzak ogunlerde yukselir.
 */
// ⚠️ 20 Agu 2026 — ARA OGUN PAYI DENENDI VE GERI ALINDI. Olcum: 191 ornek
// ogunun 31'i kendi payinin %130 ustundeydi ve neredeyse hepsi ara/atistirma
// idi — sablonun TABANI (simit + yogurt + elma + fistik ezmesi ~600 kcal)
// ogune verilen %12 payin (364 kcal) ustunde. Ara ogun paylari 0.15-0.16'ya
// cikarilinca dagilim duzeldi (>%130 olan 31 -> 18) AMA 45 kg gibi hafif
// profillerde ana ogunler kendi paylarini tasiyamaz oldu ve gun %12 eksik
// kaldi (24-beslenme-kalite kirmizi). Sabit bir oran tablosu iki ucu ayni
// anda tutamiyor; hafif profilde ana ogun, agir profilde ara ogun sikisiyor.
// Oranlar 18 Agu haliyle birakildi, dagilim sapmasi BILINEN sinir olarak
// yazildi. Cozum oran degil SABLON HAVUZU (hafif ara ogun secenegi) olmali.
const NUT_MEAL_RATIO = {
  4: {
    rest:  { kahvalti: [0.25, 0.25], ogle: [0.30, 0.30], aksam: [0.30, 0.30], atistirma: [0.15, 0.15] },
    train: { kahvalti: [0.22, 0.18], ogle: [0.30, 0.34], aksam: [0.33, 0.36], atistirma: [0.15, 0.12] },
  },
  5: {
    rest:  { kahvalti: [0.22, 0.22], ara: [0.13, 0.13], ogle: [0.26, 0.26], aksam: [0.26, 0.26], atistirma: [0.13, 0.13] },
    train: { kahvalti: [0.19, 0.15], ara: [0.12, 0.11], ogle: [0.27, 0.31], aksam: [0.29, 0.32], atistirma: [0.13, 0.11] },
  },
};
// Ustune cikilinca 5. ogun acilir
const NUT_FIVE_MEAL_KCAL = 3000;

/** Kac ogun? Kalori esigine gore — 5. ogun kalabalik olsun diye degil, ogun basi miktar yenebilir olsun diye. */
function nutMealCount(kcal) {
  return (Number(kcal) || 0) > NUT_FIVE_MEAL_KCAL ? 5 : 4;
}

/**
 * ÖĞUN BAŞI PROTEIN PAYI (9 Eyl 2026).
 *
 * ⚠️ EŞIT BOLME BIRAKILDI. Protein n ogune esit bolunuyordu: ana ogun payi
 * ara ogunle AYNI oluyordu. Tabakta gorunen sonuc "yarim porsiyon somon +
 * 3 patates"ti. 5 Eyl'de capa tabanini 1 porsiyona cekmek denendi ve gun
 * proteini 20 kombinasyonun 11'inde sert tavana yapistigi icin GERI ALINDI —
 * cunku kok neden capa tabani degil, HEDEFIN KENDISIYDI.
 *
 * Kural bilerek ASIMETRIK:
 *   TABAN SERT    — hicbir ogun 0.25 g/kg altina itilmez. Esik alti ogun kas
 *                   protein sentezini maksimuma cikarmaz; kayip gercek.
 *   TAVAN YUMUŞAK — 0.40 g/kg ustunun EK anabolik faydasi gosterilmemistir
 *                   ama zarari da yoktur. Yani ana ogunu banda sigdirmak icin
 *                   ara ogunu esigin altina itmek YANLIS TAKAS olurdu.
 * Once her ogune taban ayrilir, KALAN oranla dagitilir.
 */
// ⚠️ ORANLAR GERCEK PORSIYONDAN TURETILDI, sezgiden degil. Turk ana yemegi
// tek porsiyonda 38-47 g protein tasiyor (somon 40, tavuk gogsu 47, levrek
// 38). Ana ogun payi bunun ALTINDA kalirsa motorun tek cikisi capayi
// yarimlamak oluyor — "yarim porsiyon somon" tam olarak boyle uretiliyordu.
// 69 kg / 138 g / 5 ogun ornegi: ogle 38.6 g, aksam 40 g — yani bir porsiyon.
const NUT_PROTEIN_RATIO = {
  4: {
    rest:  { kahvalti: 0.21, ogle: 0.31, aksam: 0.32, atistirma: 0.16 },
    train: { kahvalti: 0.20, ogle: 0.31, aksam: 0.33, atistirma: 0.16 },
  },
  5: {
    rest:  { kahvalti: 0.18, ara: 0.13, ogle: 0.28, aksam: 0.28, atistirma: 0.13 },
    train: { kahvalti: 0.17, ara: 0.13, ogle: 0.28, aksam: 0.29, atistirma: 0.13 },
  },
};

/**
 * Toplam proteini oran tablosuna gore bol — TABAN KORUNARAK.
 * ⚠️ Toplam, tabanlarin toplamini karsilamiyorsa oranlamanin anlami yok:
 * o profilde esit bolme zaten en iyi cozum. Zorlarsak ara ogun esigin altina
 * duser, ana ogun de tabaktaki farki tasiyamaz.
 * Yuvarlama EN BUYUK ARTIK yontemiyle kapatilir; gun toplami birebir korunur.
 */
function nutProteinSplit(toplam, sira, tablo, taban) {
  const n = sira.length;
  if (!(toplam > 0) || !n) return sira.map(() => 0);
  if (taban * n >= toplam) {
    const esit = Math.round(toplam / n);
    return sira.map(() => esit);
  }
  // ⚠️ "TABAN + KALANI ORANLA" DENENDI VE BIRAKILDI (9 Eyl 2026). O yontem
  // oranlari SULANDIRIYORDU: 69 kg profilinde tabanlar 5 x 17 = 85 g'i
  // pesin dagitiyor, geriye oranlanacak yalniz 53 g kaliyor ve ana ogun
  // 31 g'da kaliyordu — hala bir porsiyonun altinda. Dogrusu once ORANI
  // uygulamak, tabani sonra KIRPMA olarak dayatmak.
  const oranTop = sira.reduce((a, sl) => a + (Number(tablo[sl]) || 0), 0) || 1;
  const ham = sira.map(sl => toplam * ((Number(tablo[sl]) || 0) / oranTop));
  // Taban altinda kalan ogunler tabana cekilir; acigi taban USTUNDEKILER
  // kendi paylari oraninda oder. Iki gecis yetiyor (n kucuk, kayma az).
  for (let gecis = 0; gecis < 3; gecis++) {
    const eksik = ham.reduce((a, v) => a + Math.max(0, taban - v), 0);
    if (eksik <= 0) break;
    const fazlaTop = ham.reduce((a, v) => a + Math.max(0, v - taban), 0);
    if (fazlaTop <= 0) break;
    for (let i = 0; i < n; i++) {
      if (ham[i] < taban) ham[i] = taban;
      else ham[i] -= eksik * ((ham[i] - taban) / fazlaTop);
    }
  }
  const out = ham.map(v => Math.floor(v));
  const kalan = toplam - out.reduce((a, v) => a + v, 0);
  const artikSira = ham.map((v, i) => ({ i, artik: v - Math.floor(v) }))
    .sort((a, b) => b.artik - a.artik);
  for (let k = 0; k < kalan && k < artikSira.length; k++) out[artikSira[k].i]++;
  return out;
}

/**
 * Gunluk hedefi ogunlere bol.
 * ⚠️ Protein ARTIK ESIT DAGITILMIYOR — bkz. NUT_PROTEIN_RATIO. Toplam kadar
 * DAGILIM da onemli: ogun basina 0.25-0.40 g/kg araligi kas protein sentezini
 * maksimuma cikarir, gunun tamamini tek ogune yigmak ayni sonucu vermez.
 */
function nutMealSplit(t, kg) {
  if (!t) return [];
  const n = nutMealCount(t.kcal);
  const tip = t.dayType === 'rest' ? 'rest' : 'train';
  const tablo = NUT_MEAL_RATIO[n][tip];
  const sira = Object.keys(tablo);
  // ⚠️ Gunluk protein hedefi ogun basi tavana KIRPILMAZ — kirpilirsa
  // n x tavan < gunluk hedef olur ve toplam tutmaz. Tavan bir REHBERDIR:
  // ogun basi 0.25-0.40 g/kg araligi verimin en yuksek oldugu bant.
  const idealAlt = Math.round(kg * NUT_LIMITS.proteinPerMealMin);
  const idealUst = Math.round(kg * NUT_LIMITS.proteinPerMealMax);
  const pTablo = (NUT_PROTEIN_RATIO[n] || {})[tip] || {};
  const paylar = nutProteinSplit(t.protein, sira, pTablo, idealAlt);
  return sira.map((slot, i) => {
    const [kOran, cOran] = tablo[slot];
    const kcal = Math.round(t.kcal * kOran);
    const carb = Math.round(t.carb * cOran);
    const ogunProtein = paylar[i];
    // Yag = kalan kalori. Taban 0 — negatife dusmez.
    const fat = Math.max(0, Math.round((kcal - ogunProtein * 4 - carb * 4) / 9));
    return {
      slot, kcal, protein: ogunProtein,
      bantIci: ogunProtein >= idealAlt && ogunProtein <= idealUst,
      carb, fat,
      // Antrenman gununde hangi ogun antrenmanin neresine denk geliyor
      zaman: t.dayType === 'rest' ? null
        : (slot === 'ogle' ? 'once' : (slot === 'aksam' ? 'sonra' : null)),
    };
  });
}

/**
 * KARBONHIDRAT ZAMANLAMASI.
 * ⚠️ "Anabolik pencere" abartilidir — protein alimi icin saatlerce sure var.
 * Karbonhidratta ise zamanlama GERCEKTEN onemli: glikojen deposu bir sonraki
 * seansin yakitidir, ozellikle gun icinde iki antrenman varsa.
 */
function nutCarbTiming(dayType) {
  if (dayType === 'rest') {
    return ['Dinlenme günü — zamanlama serbest. Protein günün geneline yayılsın, ' +
      'karbonhidratı öğünlere dengeli dağıt.'];
  }
  const out = [
    'Antrenmandan 1-3 saat önce: karbonhidrat ağırlıklı bir öğün + protein. ' +
      'Yağı düşük tut, mide rahat olsun.',
    'Antrenmandan sonra 1-2 saat içinde: protein + karbonhidrat. ' +
      '“30 dakika penceresi” abartıdır ama aynı gün ikinci antrenman varsa erken ye.',
  ];
  if (dayType === 'both' || dayType === 'fight') {
    out.push('Dövüş antrenmanı yüksek yoğunluklu — o gün karbonhidratı kısma. ' +
      'Yorgunluk hissinin en sık sebebi az karbonhidrattır, az protein değil.');
  }
  return out;
}

// ---------------------------------------------------------------------------
// ORNEK GUN — Turk yemeklerinden, TURK_FOODS uzerinden olceklenir.
// Sablon: her ogunde bir PROTEIN capasi + bir KARBONHIDRAT capasi + sabit ekler.
// Capalar hedefi tutturacak sekilde porsiyon olceklenir (0.5 adimlarla).
// ⚠️ Referans verilen her besin adinin TURK_FOODS'ta bulunmasi teste baglidir.
// ⚠️ 18 Agu 2026 — UCUNCU CAPA: YAG.
// Motorda protein ve karbonhidrat capasi vardi, yag capasi YOKTU. Sonuc:
// yag hedefin %30 altinda kaliyor (68 g / 97 g) ve acik karbonhidratla
// doluyordu. Karbonhidrat capasi tek basina kalan kaloriyi kapatmak zorunda
// kalinca da "5 muz" gibi ogunler cikiyordu — protein tarafinda cozulen
// hatanin (4 bardak kefir) aynisi karbonhidrat tarafinda duruyordu.
// Yag capasi kucuk ve kalori yogun olmali: 1 kasik zeytinyagi = 14 g yag.
const NUT_TEMPLATES = {
  // ⚠️ 21 Agu 2026 — HAVUZ 2'DEN 5'E CIKTI. Eski halinde slot basina iki
  // sablon vardi ve "Baska oner" ikisi arasinda gidip geliyordu: gunluk
  // kullanimda ayni yemegi gormek, plani terk ettiren seydir. Ayrica iki
  // sablonun ikisi de ayni kaloriye oturuyordu; ogun payi kucuk oldugunda
  // motorun secebilecegi HAFIF bir alternatif yoktu.
  //
  // ⚠️ Yag capasi her sablonda VAR (salataya zeytinyagi gercekci), ama
  // artik serbest degil: gunluk EKLENEN yag hedefin %60'ini gecemiyor ve
  // ogun basi tavan 2 birim. Capayi sablondan silmek denendi — o zaman da
  // gunun yag payi %25'in (DRI ergen tabani) altina dusuyordu. Dogru yer
  // sablon degil TAVAN.
  kahvalti: [
    { protein: 'Yumurta', carb: 'Tam buğday ekmek', yag: 'Tahin', ek: ['Beyaz peynir', 'Zeytin', 'Domates'] },
    { protein: 'Süzme yoğurt', carb: 'Yulaf ezmesi', yag: 'Ceviz', ek: ['Muz', 'Bal'] },
    { protein: 'Yumurta', carb: 'Bazlama', yag: 'Zeytinyağı', ek: ['Beyaz peynir', 'Domates', 'Salatalık'] },
    { protein: 'Çökelek', carb: 'Tam buğday ekmek', yag: 'Ceviz', ek: ['Domates', 'Zeytin'] },
    { protein: 'Süzme yoğurt', carb: 'Simit', yag: 'Fındık', ek: ['Bal', 'Domates'] },
  ],
  // ⚠️ Capa PROTEIN YOGUN olmali — bkz. asagidaki kefir notu. Ilk denemede
  // buraya Kefir ve Sut capa yazilmisti (6 g/bardak) ve motor 90 kg'lik
  // profilde "4 bardak sut" uretti. Ayni hata, yeni ogunde tekrar etti.
  // Sut/kefir artik EK; capa yogun olan.
  ara: [
    { protein: 'Süzme yoğurt', carb: 'Simit', yag: 'Fıstık ezmesi', ek: ['Elma'] },
    { protein: 'Protein tozu', carb: 'Leblebi', yag: 'Badem', ek: ['Süt', 'Kuru üzüm'] },
    { protein: 'Ton balığı', carb: 'Tam buğday ekmek', yag: 'Zeytinyağı', ek: ['Domates'] },
    { protein: 'Süzme yoğurt', carb: 'Yulaf ezmesi', yag: 'Ceviz', ek: ['Kuru üzüm'] },
    { protein: 'Çökelek', carb: 'Bazlama', yag: 'Ceviz', ek: ['Domates', 'Salatalık'] },
    // ⚠️ HAFIF SECENEK (9 Eyl 2026). Havuzun besinin de capasi protein
    // YOGUNDU (protein tozu 24 g, suzme yogurt 16 g/kase) ve bunlarin
    // birim tabani 1 — yani ara ogun HEDEFI 18 g olsa bile 24 g teslim
    // ediyordu. Gunun protein butcesi orada tukendigi icin ana ogun tam
    // porsiyon capayi hic alamiyordu. Hafif capa (yogurt 11 g/kase) o
    // butceyi ana ogune birakiyor. 20 Agu notunun "cozum oran degil SABLON
    // HAVUZU" tespiti buydu.
    { protein: 'Cottage peyniri', carb: 'Simit', yag: 'Ceviz', ek: ['Elma'] },
  ],
  ogle: [
    { protein: 'Tavuk göğsü', carb: 'Bulgur pilavı', yag: 'Zeytinyağı', ek: ['Çoban salata', 'Ayran'] },
    { protein: 'Ton balığı', carb: 'Makarna', yag: 'Zeytinyağı', ek: ['Çoban salata'] },
    { protein: 'İzgara köfte', carb: 'Pilav', yag: 'Zeytinyağı', ek: ['Cacık', 'Çoban salata'] },
    { protein: 'Tavuk şiş', carb: 'Bulgur pilavı', yag: 'Zeytinyağı', ek: ['Ayran', 'Çoban salata'] },
    { protein: 'Tavuk döner', carb: 'Pilav', yag: 'Zeytinyağı', ek: ['Cacık', 'Çoban salata'] },
  ],
  aksam: [
    { protein: 'Dana kıyma', carb: 'Pilav', yag: 'Zeytinyağı', ek: ['Çoban salata', 'Yoğurt'] },
    { protein: 'Somon', carb: 'Haşlanmış patates', yag: 'Zeytinyağı', ek: ['Çoban salata'] },
    { protein: 'Tavuk but', carb: 'Bulgur pilavı', yag: 'Zeytinyağı', ek: ['Cacık', 'Çoban salata'] },
    { protein: 'Levrek', carb: 'Fırın patates', yag: 'Zeytinyağı', ek: ['Çoban salata'] },
    { protein: 'Hindi eti', carb: 'Pilav', yag: 'Zeytinyağı', ek: ['Cacık', 'Çoban salata'] },
  ],
  // ⚠️ Capa PROTEIN YOGUN olmali. Kefir (6 g/bardak) capa yapilinca motor
  // hedefi tutturmak icin "4 bardak kefir" yaziyordu — teknik olarak dogru,
  // pratikte sacma. Capa g/porsiyon degeri yuksek olandan secilir.
  // ⚠️ EK BOS BIRAKILMAZ: yag capasi kirpilinca geriye "yogurt + muz"
  // kaliyordu, iki kalem, ogun gibi durmuyordu.
  atistirma: [
    // ⚠️ 10 Eyl 2026 — 'Yoğurt' CAPALIKTAN CIKARILDI. Besin tablosu duzeltilince
    // sade yogurdun gercek degeri ortaya cikti: 200 g kase = 122 kcal / 7 g
    // protein (0.057 g/kcal). Motorun kendi yogunluk sozlesmesi >=0.08 istiyor;
    // 17 g'lik bir ara ogun hedefini sade yogurtla tutturmak 2.5 kase demekti.
    // Eski tabloda ayni kase 11 g protein yaziyordu — yani capa secimi HATALI
    // VERIYE dayaniyordu. Yerine yogun ve hafif olanlar: cottage (0.113) ve
    // hazir protein yogurt (0.154).
    { protein: 'Süzme yoğurt', carb: 'Muz', yag: 'Badem', ek: ['Bal'] },
    { protein: 'Protein tozu', carb: 'Elma', yag: 'Fındık', ek: ['Süt'] },
    { protein: 'Protein yoğurt', carb: 'Üzüm', yag: 'Ceviz', ek: ['Bal'] },
    { protein: 'Süzme yoğurt', carb: 'Armut', yag: 'Badem', ek: ['Kuru üzüm'] },
    { protein: 'Protein tozu', carb: 'Muz', yag: 'Fıstık ezmesi', ek: ['Süt'] },
    // Hafif secenek — bkz. ara havuzundaki not.
    // ⚠️ Capa once 'Kefir' yazildi ve SOZLESME TESTI kirmiziya dondu
    // (0.06 g protein/kcal): hafif olsun derken seyreltik capa secmek,
    // motorun "4 bardak kefir" hatasini geri getirir. Aranan sey seyreltik
    // capa DEGIL, KUCUK ama YOGUN capa: cottage 11 g proteini 98 kcal'de
    // tasiyor (0.112 g/kcal) ve birimi 'porsiyon' oldugu icin yarim
    // adimlarla buyuyup kuculebiliyor.
    { protein: 'Cottage peyniri', carb: 'Muz', yag: 'Badem', ek: ['Hurma'] },
  ],
};

/**
 * DOLGU KAYNAGI — ogun basina proteinsiz/az proteinli karbonhidrat.
 * ⚠️ 21 Agu 2026: doldurma adimlarinin protein kapisina takilinca yaga
 * kacmasinin PANZEHIRI. Bunlar kaloriyi tasir, protein tasimaz; capalar
 * tavana dayandiginda ogune EKLENIR (adet 0 ile durur, gerekirse buyur).
 * Slot'a gore secildi: kahvaltiya bal, ana ogune patates, atistirmaya meyve.
 */
// ⚠️ 5 Eyl 2026 — HER SLOT ICIN LISTE, TEK BESIN DEGIL. Dolgu ile
// karbonhidrat capasi AYNI BESIN olabiliyordu: aksam[1] sablonunda capa
// 'Haşlanmış patates', dolgu da oydu — tabakta 3 porsiyon capa + 1 dolgu =
// 4 HASLANMIS PATATES. Hem tabak sacma goruntu veriyordu hem de capaya
// konan TAVAN (3 porsiyon) fiilen deliniyordu. Ilk uygun aday secilir.
const NUT_FILL = {
  // ⚠️ Bal dolgu olarak denendi ve BIRAKILDI: motor "3 kasik bal" yaziyordu
  // (51 g seker). Dolgu kalori tasimali ama porsiyonu buyudugunde de makul
  // gorunmeli — meyve ve patates bu testi geciyor, sekerli olanlar gecmiyor.
  kahvalti: ['Armut', 'Elma', 'Muz'],
  ara: ['Muz', 'Elma', 'Armut'],
  // ⚠️ Ana ogun yedegi EKMEK degil MEYVE: ekmek dilimi 13 g karbonhidrat
  // tasiyor ve dolgu kuralinin esigi (>=15 g) altinda kaliyor — dolgu az
  // kalorili olursa isini yapmiyor, dongu yine yaga kaciyor.
  ogle: ['Haşlanmış patates', 'Armut', 'Muz'],
  aksam: ['Haşlanmış patates', 'Armut', 'Muz'],
  // Hurma dolgu olamaz: 1 adet 5 g karbonhidrat — 3 adetlik tavanla bile
  // tasidigi kalori (60 kcal) acigi kapatmaya yetmiyor.
  atistirma: ['Kuru üzüm', 'Muz', 'Elma', 'Armut'],
};

// ---------------------------------------------------------------------------
// KISISEL TERCIH KATMANI (9 Eyl 2026)
//
// ⚠️ NEDEN MOTORUN ICINDE, EKRANDA DEGIL: plan zaten "sevmediğini benzer
// makrolu başka yiyecekle değiştir" diye bir not yaziyordu — yani isi
// KULLANICIYA devrediyordu. Somon sevmeyen biri o notu okuyup her gun
// kafadan takas yapmaz, plani birakir. Takas motorun isi.
//
// ⚠️ SINIR: bu bir ALERJI ozelligi DEGIL. Motor yalnizca kendi sablon
// havuzundaki ~50 besin adini tanir; besin gunlugune elle yazilan seyleri
// ya da paketli urunlerin icindekiler listesini GORMEZ. Bu yuzden arayuzde
// "alerji" kelimesi gecmiyor, "sevmediklerim" geciyor. Gercek alerji
// yonetimi etiket okumakla olur, sablon filtresiyle degil.
// ---------------------------------------------------------------------------

/**
 * Diyet kisitlari. Kategori alani TURK_FOODS'ta YOK (n/u/g/k/p/c/f/a), o
 * yuzden kural ad kalibiyla yazildi — ve bu kalip yalniz SABLON HAVUZU
 * uzerinde calistigi icin guvenli: 470 besnin tamamini siniflandirmiyoruz,
 * motorun kendi kullandigi ~50 adi eliyoruz.
 * ⚠️ Yulaf 'glutensiz' listesinde YOK: saf yulaf glutensizdir (capraz
 * bulasma ayri bir konu) ve cikarilirsa kahvalti havuzunda tek bir
 * karbonhidrat capasi kalmiyor.
 */
const NUT_DIYET = {
  yok:        { ad: 'Kısıtlama yok', re: null },
  kirmizisiz: { ad: 'Kırmızı et yok', re: /kıyma|köfte|kuzu|dana|sucuk|kavurma|pastırma|et döner|iskender|kebap|pirzola/i },
  etsiz:      { ad: 'Et yok (balık var)', re: /tavuk|hindi|kıyma|köfte|kuzu|dana|sucuk|kavurma|döner|kebap|şiş|pirzola|salam|jambon/i },
  // ⚠️ VEJETARYEN SECENEGI BILEREK YOK (9 Eyl 2026). Eklenip olculdu:
  // ogle ve aksam havuzunda BALIKSIZ+ETSIZ hicbir capa kalmiyor ve kacis
  // kapisi her gun iki ogunde birden aciliyordu — yani secenek gorunuyor
  // ama tutmuyordu. Baklagil capasi da cozmuyor: motorun kendi yogunluk
  // sozlesmesi capadan >=0.08 g protein/kcal istiyor, kuru fasulye 0.056,
  // mercimek yemegi 0.060 — hedefe olceklenince "4 porsiyon kuru fasulye"
  // uretirdi ('4 bardak kefir' hatasinin baklagil hali). Vejetaryen destegi
  // once ANA OGUN HAVUZUNA yogun bitkisel capa eklemeyi gerektirir; o is
  // yapilmadan secenegi koymak kullaniciyi kandirmak olur.
  laktozsuz:  { ad: 'Süt ürünü yok', re: /süt|yoğurt|peynir|ayran|kefir|cacık|haydari|labne|çökelek|lor|kaymak|tereyağ|cottage/i },
  glutensiz:  { ad: 'Glutensiz', re: /ekmek|simit|bazlama|makarna|bulgur|börek|poğaça|pide|kek|kurabiye|erişte|mantı|kuskus/i },
};

/** Kayitli tercih — her zaman normalize edilmis sekilde doner. */
function nutTercih() {
  const n = (typeof data !== 'undefined' && data.diet && data.diet.nut) ? data.diet.nut : null;
  const t = (n && n.tercih && typeof n.tercih === 'object') ? n.tercih : {};
  return {
    diyet: NUT_DIYET[t.diyet] ? t.diyet : 'yok',
    sevmem: Array.isArray(t.sevmem) ? t.sevmem.filter(x => typeof x === 'string') : [],
    favori: Array.isArray(t.favori) ? t.favori.filter(x => typeof x === 'string') : [],
  };
}

// ⚠️ KACIS KAPISI. Bir slotun BUTUN sablonlari tercihe takilirsa o ogun
// planda hic gorunmez ve gun sessizce eksik biter — makro toplami da,
// ogun sayisi da yanlis olur. Boyle bir durumda motor tercihi o TEK ogun
// icin gecici olarak yok sayar ve ogunu isaretler; arayuz bunu yazar.
// Sessizce yanlis plan uretmektense, uyulamadigini soylemek dogru.
let _nutTercihKapali = false;

function nutIzinli(ad) {
  if (_nutTercihKapali) return true;
  if (!ad) return false;
  const tr = nutTercih();
  // Sevmedikleri KELIME KOKUYLE eslesir: "patates" deyince hem haslanmis
  // hem firin patates duser (bkz. nutAyniAile).
  if (tr.sevmem.some(x => x === ad || nutAyniAile(x, ad))) return false;
  const d = NUT_DIYET[tr.diyet];
  if (d && d.re && d.re.test(ad)) return false;
  return true;
}

/**
 * Bir capayi tercihe uygun hale getir. Engelliyse AYNI SLOTUN havuzundaki
 * baska bir sablonun ayni rolunu kullan — boylece tabak rolu bos kalmaz.
 * ⚠️ Sablonu komple atmak yerine capayi TAKAS etmek bilincli: "somon
 * sevmiyorum" diyen birinin aksam ogunu kaybolmamali, sadece baligi
 * degismeli.
 */
function nutCapaSec(slot, alan, ad) {
  if (nutIzinli(ad)) return nutFood(ad);
  for (const t2 of (NUT_TEMPLATES[slot] || [])) {
    const yedek = t2[alan];
    if (!yedek || yedek === ad || !nutIzinli(yedek)) continue;
    const f = nutFood(yedek);
    if (f) return f;
  }
  return null;
}

/** Sablonun kullanicinin favorilerinden kac kalem tasidigi. */
function nutFavoriPuan(t) {
  const fav = nutTercih().favori;
  if (!fav.length || !t) return 0;
  return [t.protein, t.carb, t.yag].concat(t.ek || [])
    .filter(Boolean).filter(ad => fav.indexOf(ad) >= 0).length;
}

/** Arayuzun tercih listesi — motorun GERCEKTEN kullandigi adlar, slot slot. */
function nutHavuzBesinleri() {
  const out = {};
  for (const slot of Object.keys(NUT_TEMPLATES)) {
    const s = [];
    const ekle = (ad) => { if (ad && s.indexOf(ad) < 0 && nutFood(ad)) s.push(ad); };
    for (const t of NUT_TEMPLATES[slot]) {
      [t.protein, t.carb, t.yag].concat(t.ek || []).forEach(ekle);
    }
    (NUT_FILL[slot] || []).forEach(ekle);
    out[slot] = s;
  }
  return out;
}

function setNutDiyet(tip) {
  const n = ensureNutrition();
  const tr = nutTercih();
  n.tercih = { diyet: NUT_DIYET[tip] ? tip : 'yok', sevmem: tr.sevmem, favori: tr.favori };
  save();
  renderNutrition();
}

/**
 * Tek dokunusla uc durum: notr -> favori -> sevmem -> notr.
 * ⚠️ Ayri "favori listesi" ve "sevmem listesi" ekrani denenmedi bilerek:
 * telefonda iki liste arasinda mod degistirmek, 50 kalemlik bir listede
 * kaybolmanin en hizli yolu. Tek hedef, tek dokunus.
 */
function nutTercihDongu(ad) {
  const tr = nutTercih();
  const fav = tr.favori.indexOf(ad) >= 0;
  const sev = tr.sevmem.indexOf(ad) >= 0;
  const n = ensureNutrition();
  const yeni = {
    diyet: tr.diyet,
    favori: tr.favori.filter(x => x !== ad),
    sevmem: tr.sevmem.filter(x => x !== ad),
  };
  if (!fav && !sev) yeni.favori.push(ad);
  else if (fav) yeni.sevmem.push(ad);
  n.tercih = yeni;
  save();
  renderNutrition();
}

function nutTercihSifirla() {
  const n = ensureNutrition();
  n.tercih = { diyet: 'yok', sevmem: [], favori: [] };
  save();
  renderNutrition();
}

/**
 * Iki besin adi AYNI SEYIN varyanti mi? Duz esitlik yetmiyor: "Fırın
 * patates" capasinin yanina "Haşlanmış patates" dolgusu konunca tabakta
 * yine 5 porsiyon patates cikiyor. Kelime koku (ilk 5 harf) karsilastirilir.
 */
function nutAyniAile(a, b) {
  const kok = (ad) => String(ad || '').toLocaleLowerCase('tr')
    .split(/\s+/).filter(w => w.length >= 4).map(w => w.slice(0, 5));
  const ka = kok(a), kb = kok(b);
  return ka.some(w => kb.indexOf(w) >= 0);
}

/**
 * Porsiyon metni. Birim zaten sayi iceriyorsa ("5 adet", "10 adet", "2 yarım")
 * bir daha sayi yazma — "1 5 adet Zeytin" gibi bozuk metin cikiyordu.
 */
function nutPortion(adet, birim) {
  const sayiliBirim = /^\d/.test(String(birim));
  if (sayiliBirim) return adet === 1 ? String(birim) : (adet + ' \u00d7 ' + birim);
  return adet + ' ' + birim;
}

/**
 * Porsiyon yuvarlama. 'adet' birimli besin (yumurta, muz, ekmek dilimi)
 * yarim olmaz — tam sayiya yuvarlanir. Digerleri 0.5 adiminda kalir.
 */
function nutRound(adet, birim) {
  const tam = /adet|dilim|kase|bardak|kutu|kaşık|olcek|ölçek/i.test(String(birim));
  return tam ? Math.max(1, Math.round(adet)) : Math.max(0.5, Math.round(adet * 2) / 2);
}

function nutFood(ad) {
  if (typeof TURK_FOODS === 'undefined') return null;
  return TURK_FOODS.find(f => f.n === ad) || null;
}

/** Bir ogunu hedefe gore olcekle. Deterministik: sablon indeksi gunden turetilir. */
function nutBuildMeal(slot, hedefOgun, sablonIdx, anaTaban) {
  const list = NUT_TEMPLATES[slot] || [];
  if (!list.length) return null;
  const t = list[(Number(sablonIdx) || 0) % list.length];
  // ⚠️ Capalar tercihten GECIRILEREK secilir; engelliyse ayni slotun
  // havuzundan yedek gelir (bkz. nutCapaSec). Sablonu komple atmak
  // ogunu kaybettirirdi.
  const pf = nutCapaSec(slot, 'protein', t.protein);
  const cf = nutCapaSec(slot, 'carb', t.carb);
  if (!pf || !cf) return null;

  const yf = t.yag ? nutCapaSec(slot, 'yag', t.yag) : null;
  // ⚠️ ANA OGUN KORUMASI (18 Agu 2026). Capa sifirlanabilir kurali dogruydu
  // ama fazla genisti: ogle ve aksamda protein capasi silinince tabakta
  // "3 porsiyon pilav + salata" kaliyordu. Ana ogunde protein capasi
  // ogunun KENDISIDIR — makro matematigi tutsa bile o tabak yanlistir.
  const anaOgun = slot === 'ogle' || slot === 'aksam';

  // Ekler icin yedek aranmaz — ek, tabagin yaninda duran seydir; birini
  // cikarmak ogunu bozmaz. Capa oyle degil.
  const ekler = (t.ek || []).filter(nutIzinli).map(nutFood).filter(Boolean)
    .map(f => ({ n: f.n, u: f.u, adet: 1, k: f.k, p: f.p, c: f.c, f: f.f }));
  const ekK = ekler.reduce((a, x) => a + x.k, 0);
  const ekP = ekler.reduce((a, x) => a + x.p, 0);
  const ekY = ekler.reduce((a, x) => a + x.f, 0);

  // ⚠️ CAPALAR BIRBIRINI ETKILER — TEK GECISTE COZULMEZ (18 Agu 2026).
  // Eski kod protein capasini yalniz EKLERI dusup hesapliyordu. Ama Turk
  // mutfaginda karbonhidrat kaynagi da protein tasir (bulgur 5 g, pilav 4 g,
  // ekmek 3 g/porsiyon) ve o miktar HENUZ BILINMIYORDU. Sonuc sistematikti:
  // protein hedefin %20-48 ustunde, karbonhidrat %20 altinda.
  // Cozum: uc gecislik sabit nokta. Her turda capa, digerlerinin o anki
  // katkisi dusulerek yeniden boyutlanir; uc turda oturuyor.
  let pAdet = 1, yAdet = 0, cAdet = 1;
  // Capanin inebilecegi TABAN — denge adimi da bunu bilmeli, yoksa gun
  // toplamini duzeltirken proteinsiz bir ara ogun birakiyor.
  let pDip = 1;
  for (let tur = 0; tur < 3; tur++) {
    // Protein capasi: ekler + karbonhidrat + yag capasinin tasidigi protein dusulur.
    // ⚠️ Alt sinir 0.5 porsiyon: tavuk gogsu 47 g protein tasiyor, "en az 1
    // porsiyon" kurali hedefi tek basina %50 asiyordu (126 g hedefe 189 g cikti).
    const gerekP = Math.max(0, hedefOgun.protein - ekP -
      cAdet * cf.p - yAdet * (yf ? yf.p : 0));
    // ⚠️ ANA OGUNDE TABAN 1 PORSIYON DENENDI VE GERI ALINDI (5 Eyl 2026).
    // Sikayet gercekti: ogle/aksam tabaginda "yarim porsiyon somon +
    // 3 patates" cikiyor. Ama taban 1'e cekilince 69 kg profilinde gun
    // proteini 20 kombinasyonun 11'inde SERT TAVANA (2.5 g/kg) yapisti —
    // motorun 20 Agu'da bilerek cozdugu hatanin aynisi. Tabak estetigi
    // ugruna makro dogrulugundan vazgecilmez. Asil kok neden burasi degil:
    // nutMealSplit proteini bes ogune ESIT boluyor (28 g), ana ogun payi
    // ara ogunle ayni. Cozum orada, capa tabaninda degil. (anaTaban
    // parametresi cagri yerinde duruyor; ileride oran tablosu gelirse
    // kanca hazir.)
    // ⚠️ ANA OGUNDE CAPA TABANI 1 PORSIYON (9 Eyl 2026).
    // 5 Eyl'de bu denenmis ve GERI ALINMISTI: gun proteini 20 kombinasyonun
    // 11'inde sert tavana yapisiyordu. O denemenin eksigi burasi degildi —
    // protein hala BES OGUNE ESIT bolunuyordu, yani ana ogunun hedefi 28 g
    // iken capaya 40 g'lik bir porsiyon dayatiliyordu ve fark gun toplamina
    // biniyordu. Artik ana ogun hedefi zaten ~40 g (bkz. NUT_PROTEIN_RATIO),
    // dolayisiyla tam porsiyon hedefe UYUYOR, onu zorlamiyor.
    // `anaTaban` cagri yerinden gelir: nutBuildDay once 1 ile dener, gun
    // sert tavani asarsa 0.5 ile yeniden kurar. Kanca artik bos degil.
    // ⚠️ ANA OGUNDE CAPA TABANI 1 PORSIYON (9 Eyl 2026).
    // 5 Eyl'de bu denenmis ve GERI ALINMISTI: gun proteini 20 kombinasyonun
    // 11'inde sert tavana yapisiyordu. O denemenin eksigi burasi degildi —
    // protein hala BES OGUNE ESIT bolunuyordu, yani ana ogunun hedefi 28 g
    // iken capaya 40 g'lik porsiyon dayatiliyor ve fark gun toplamina
    // biniyordu. Artik ana ogun hedefi zaten ~40 g (NUT_PROTEIN_RATIO) ve
    // ara ogun havuzunda hafif secenek var; tam porsiyon hedefe UYUYOR.
    // `anaTaban` cagri yerinden gelir: nutBuildDay once 1 ile dener, gun
    // sert tavani asarsa 0.5 ile yeniden kurar.
    const pTaban = pf.u === 'porsiyon'
      ? (anaOgun ? Math.max(0.5, Number(anaTaban) || 0.5) : 0.5)
      : 1;
    pAdet = pf.p > 0 ? nutRound(gerekP / pf.p, pf.u) : 1;
    pAdet = Math.max(pTaban, Math.min(4, pAdet));
    // ⚠️ CAPA SIFIRA INEBILIR (18 Agu 2026). Hafif profillerde (50 kg) ogun
    // protein hedefi 18 g'a kadar iniyor ve sablonun SABIT EKLERI (peynir,
    // ayran, yogurt) bunu tek basina karsiliyor. "En az yarim porsiyon capa"
    // kurali o durumda hedefi %40 asiyordu. Ekler zaten protein kaynagi —
    // ustune tavuk koymak plani tutarsiz yapiyor, daha iyi yapmiyor.
    // Esik TABANA gore: yarim porsiyon verilebiliyorsa capa daha gec silinir.
    // Iki kosul birden gerekli:
    //   - ana ogun DEGIL (ogle/aksamda tabakta protein kalmali)
    //   - ekler ogun hedefinin en az yarisini ZATEN tasiyor
    // Ikinci kosul olmadan "1 simit + 1 elma" gibi proteinsiz bir ara ogun
    // cikiyordu: makro toplami duzeliyor ama ogun basi protein dagilimi —
    // yani kas protein sentezi esigi — coluyor.
    const eklerYeterli = ekP >= hedefOgun.protein * 0.5;
    pDip = (anaOgun || !eklerYeterli) ? pTaban : 0;
    if (pDip === 0 && pf.p > 0 && gerekP < pf.p * pTaban * 0.6) pAdet = 0;

    // ⚠️ YAG CAPASI KARBONHIDRATTAN ONCE. Yag once konmazsa karbonhidrat
    // capasi butun kaloriyi tek basina doldurur ve porsiyon sisirir. Ustelik
    // yag hedefi hormonal saglik tabaniyla korunuyor — "kalanla doldur"
    // muamelesi gormemeli.
    if (yf && yf.f > 0) {
      // ⚠️ YAG CAPASI ASAGI YUVARLANIR. 1 kasik zeytinyagi 14 g yag — en
      // yakina yuvarlamak ogun hedefini kolayca %40 asiyordu. Yag zaten
      // ekler (peynir, yogurt, kuruyemis) tarafindan da tasiniyor; eksik
      // kalirsa gun sonunda denge adimi ekliyor, fazlasi ise geri alinamiyor.
      const gerekY = Math.max(0, hedefOgun.fat - ekY - pAdet * pf.f - cAdet * cf.f);
      const yBirim = /adet|dilim|kase|bardak|kutu|kaşık|ölçek|olcek|avuç|yarım|yarim/i.test(String(yf.u)) ? 1 : 0.5;
      yAdet = Math.max(0, Math.min(3, Math.floor((gerekY / yf.f) / yBirim) * yBirim));
    }

    // Karbonhidrat capasi: kalan kaloriyi doldur.
    // ⚠️ TAVAN 3 PORSIYON. Eskiden 4'tu ama gercek sinir pratikti: motor
    // "5 muz" / "5 dilim ekmek" yaziyordu. Tavana dayanirsa acik gun sonunda
    // nutBalanceDay tarafindan DIGER ogunlere yayilir.
    const kalanK = Math.max(0, hedefOgun.kcal - ekK - pAdet * pf.k - yAdet * (yf ? yf.k : 0));
    cAdet = cf.k > 0 ? nutRound(kalanK / cf.k, cf.u) : 1;
    cAdet = Math.max(cf.u === 'porsiyon' ? 0.5 : 1, Math.min(3, cAdet));
  }

  // ⚠️ ROL etiketi (18 Agu 2026): denge adimlari eskiden items[0]/items[1]
  // diye INDEKSLE calisiyordu. Yag capasi eklenince bu kirilgan hale geldi —
  // capayi adiyla degil sirasiyla bulmak, siraya dokunan her degisikligi
  // sessiz bir bug'a cevirir.
  const kalemler = [
    { rol: 'p', n: pf.n, u: pf.u, adet: pAdet, k: pf.k, p: pf.p, c: pf.c, f: pf.f },
    { rol: 'c', n: cf.n, u: cf.u, adet: cAdet, k: cf.k, p: cf.p, c: cf.c, f: cf.f },
  ];
  if (yf && yAdet > 0) kalemler.push({ rol: 'y', n: yf.n, u: yf.u, adet: yAdet, k: yf.k, p: yf.p, c: yf.c, f: yf.f });
  for (const e of ekler) kalemler.push(Object.assign({ rol: 'ek' }, e));
  // Yag capasi 0 cikmis olsa bile denge adimi sonradan artirabilsin
  if (yf && yAdet === 0) kalemler.push({ rol: 'y', n: yf.n, u: yf.u, adet: 0, k: yf.k, p: yf.p, c: yf.c, f: yf.f });
  // Dolgu adayi 0 ile eklenir; denge adimi gerekirse buyutur, gerekmezse
  // sondaki filtre onu listeden atar.
  // Dolgu adayi capalarla cakismamali (bkz. NUT_FILL notu).
  const dfAdi = (NUT_FILL[slot] || []).find(ad =>
    nutIzinli(ad) &&
    !nutAyniAile(ad, cf.n) && !(yf && nutAyniAile(ad, yf.n)) &&
    !(t.ek || []).some(e => nutAyniAile(ad, e)));
  const df = nutFood(dfAdi || '');
  if (df) kalemler.push({ rol: 'd', n: df.n, u: df.u, adet: 0, k: df.k, p: df.p, c: df.c, f: df.f });

  const topla = (alan) => Math.round(kalemler.reduce((a, x) => a + x.adet * x[alan], 0));
  return {
    slot, ana: anaOgun, dipP: pDip,
    items: kalemler,
    kcal: topla('k'), protein: topla('p'), carb: topla('c'), fat: topla('f'),
  };
}

/**
 * Gun toplamini hedefe yaklastir.
 * ⚠️ Turk mutfaginda karbonhidrat kaynaklari da protein tasiyor (bulgur 5 g,
 * pilav 4 g, ekmek 3 g/porsiyon). Ogun ogun hesap tutuyor ama GUN TOPLAMI
 * hedefi asiyordu (126 g hedefe 168 g). Bu gecis, protein capalarini
 * kucultup toplami banda cekiyor. Zararli degil ama plan tutarsiz gorunuyordu.
 */
/**
 * ⚠️ PROTEIN HEDEFI BIR TAVAN DEGIL (18 Agu 2026).
 * Denge adimi proteini hedefin %10 ustune kadar kirpiyordu ve bunu yapmak
 * icin ogunlerden protein kaynagini SILIYORDU — ortaya "3 porsiyon pilav +
 * salata" gibi ogunler cikti. Yanlis olan kirpma degil, KIME kirptigiydi:
 *   - 1.8-2.0 g/kg bir HEDEFTIR, asilmasi zararli degildir
 *   - 2.5 g/kg ise TAVANDIR — ustunun ek faydasi gosterilmemistir
 * Motor artik hedefe degil TAVANA gore kirpiyor, ve gercek degeri yaziyor.
 */
function nutBalanceDay(meals, t, kg) {
  const capa = (m, rol) => (m.items || []).find(x => x.rol === rol);
  const yenile = (m) => {
    const topla = (alan) => Math.round(m.items.reduce((a, x) => a + x.adet * x[alan], 0));
    m.kcal = topla('k'); m.protein = topla('p'); m.carb = topla('c'); m.fat = topla('f');
  };
  const adimi = (u) => (/adet|dilim|kase|bardak|kutu|kaşık|ölçek|olcek|avuç|yarım|yarim/i.test(String(u)) ? 1 : 0.5);

  const toplamP = () => meals.reduce((a, m) => a + m.protein, 0);
  // SERT TAVAN — guvenlik siniri, asla asilmaz.
  const proteinTavan = kg > 0
    ? Math.max(t.protein, Math.round(kg * NUT_LIMITS.proteinMaxPerKg))
    : Math.round(t.protein * 1.25);
  // ⚠️ YUMUSAK BANT (20 Agu 2026). Kirpma adimlari hedefe degil TAVANA
  // bakiyordu; sonuc her profilde ayniydi: plan tavana YAPISIYORDU
  // (2.3-2.5 g/kg) ve kullaniciya "hedef 126 g" yazip 174 g veren bir gun
  // gosteriliyordu. Tavan asilmadigi icin motor bunu sorun saymiyordu.
  // Artik kirpma hedefin %10 ustunu amaclar; tavan yalnizca kirmizi cizgi.
  // Tabak kurallari (ana ogunde capa kalir, ogun 8 g altina inmez, son
  // protein kaynagi silinmez, tabak 3 kalemin altina inmez) bandin ONUNDE
  // gelir — bant tutmuyorsa motor zorlamaz, gercek degeri yazar.
  const proteinBant = Math.min(proteinTavan, Math.round(t.protein * 1.10));
  // ⚠️ KIRPMA ARA OGUNU ESIK ALTINA ITEMEZ (9 Eyl 2026).
  // Ana ogune tam porsiyon capa konunca gun proteini yukseldi ve kirpma
  // adimi acigi ARA OGUNDEN kapatmaya basladi: olcumde gun basina 1.4 ogun
  // 0.25 g/kg esiginin altina dustu (14-15 g). Bu sessiz bir takas: gun
  // toplami duzeliyor ama esik alti ogun kas protein sentezini maksimuma
  // cikarmiyor — yani kazanilan sey kaybedilenden kucuk.
  // Duz 8 g tabani bu isi goremiyordu cunku 69 kg icin esik 17 g.
  // SERT TAVAN asiliyorsa (guvenlik) taban yine 8 g'a duser.
  const ogunDip = kg > 0
    ? Math.max(8, Math.round(kg * NUT_LIMITS.proteinPerMealMin))
    : 8;
  for (let tur = 0; tur < 20; tur++) {
    if (toplamP() <= proteinBant) break;
    // Capanin inebilecegi taban ogun kurulurken belirlendi (ana ogun mu,
    // ekler proteini karsiliyor mu). Denge adimi bunu EZEMEZ.
    const dip = (m) => (m.dipP == null ? 0 : m.dipP);
    // ⚠️ 9 Eyl 2026 — BU DONGUDE OGUN ESIGI YOKTU ve ara ogunu esik altina
    // itiyordu. Olcum: "1 bardak kefir" (11 g) — halbuki o ogunun hedefi
    // 18, esigi 17 g. Dongunun amaci gun toplamini yumusak banda cekmek;
    // bant SOFT, ogun basi esik ise kalite kurali. Aday bulunamazsa dongu
    // kirilir ve gun bandin biraz ustunde biter — motorun kendi sirasi bu
    // (tabak kurallari bandin onunde gelir).
    const aday = meals.slice().sort((a, b) => b.protein - a.protein)
      .find(m => {
        const c = capa(m, 'p');
        if (!c || c.adet <= dip(m)) return false;
        const yeniAdet = Math.max(dip(m), c.adet - adimi(c.u));
        return m.protein - (c.adet - yeniAdet) * c.p >= ogunDip;
      });
    if (!aday) break;
    // Azaltirken de birim kurali gecerli — 1.5 yumurta olmaz.
    const c0 = capa(aday, 'p');
    const adim = adimi(c0.u);
    const hedefAdet = c0.adet - adim;
    c0.adet = hedefAdet <= dip(aday) ? dip(aday) : nutRound(hedefAdet, c0.u);
    yenile(aday);
  }

  // ⚠️ Capa tabana dayandiysa PROTEIN TASIYAN EKLERI kirp (18 Agu 2026).
  // Hafif profillerde (45-55 kg) sablonun sabit ekleri — ayran, yogurt, sut,
  // peynir — tek baslarina 2.5 g/kg tavanini asabiliyor. Bunlar ogunun
  // omurgasi degil yanindaki seyler; birini cikarmak tabagi bozmaz. Ogunun
  // SON protein kaynagi asla cikarilmaz.
  const ekleriKirp = () => {
    for (let tur = 0; tur < 12; tur++) {
      if (toplamP() <= proteinBant) break;
      const sert = toplamP() > proteinTavan;
      let hedefOgun = null, hedefEk = null;
      for (const m of meals.slice().sort((a, b) => b.protein - a.protein)) {
        const proteinliler = (m.items || []).filter(x => x.adet > 0 && x.p >= 4);
        if (proteinliler.length <= 1) continue;           // son kaynak kalsin
        // ⚠️ TABAK 3 KALEMIN ALTINA INMEZ (20 Agu 2026). Kirpma makro
        // matematigini duzeltirken ortaya "2 kase yogurt + 1 muz" gibi
        // ogunler cikiyordu: sayilar tutuyor ama tabak yemek gibi durmuyor.
        // ⚠️ AMA SERT TAVAN BU KURALIN USTUNDEDIR. Hafif profilde (45-55 kg)
        // sabit ekler tek baslarina 2.5 g/kg'i asabiliyor; orada guvenlik
        // siniri tabak estetiginden once gelir.
        if (!sert && (m.items || []).filter(x => x.adet > 0).length <= 3) continue;
        const ek = proteinliler.filter(x => x.rol === 'ek').sort((a, b) => b.p - a.p)[0];
        if (ek) { hedefOgun = m; hedefEk = ek; break; }
      }
      if (hedefEk) {
        hedefEk.adet = 0;
        yenile(hedefOgun);
        continue;
      }
      // ⚠️ EKLER BITTIYSE ANA OLMAYAN OGUNUN CAPASINI KUCULT (18 Agu 2026).
      // `dipP` bir vekildi; ASIL kural "ogunde protein kalsin". Hafif
      // profilde (45 kg) 5 ogunun her birine tam capa koymak tavani
      // yapisal olarak asiyor. Gercek sinir: ogun 8 g proteinin altina
      // DUSMESIN. Ana ogun capasi bu adimda da korunur.
      // ⚠️ IKI GECIS (20 Agu 2026). Once TABAK KURALLARINA saygili dene;
      // hicbir aday bulunamazsa ve SERT TAVAN hala asiliyorsa, kurallari
      // gevseterek ikinci gecisi yap. Tek gecisli "sert ise kurallari bos
      // ver" hali, kirpilecek baska yer VARKEN bile ara ogunun protein
      // kaynagini siliyordu — "1 simit + 1 elma" oradan cikiyordu.
      const kucult = (kurallara) => {
        for (const m of meals.slice().sort((a, b) => b.protein - a.protein)) {
          if (m.ana) continue;
          const c = capa(m, 'p');
          if (!c || c.adet <= 0) continue;
          const adim = adimi(c.u);
          const yeni = c.adet - adim <= 0 ? 0 : nutRound(c.adet - adim, c.u);
          // Yumusak gecis: ogun basi esigi (0.25 g/kg) korunur.
          // Sert gecis (guvenlik siniri asiliyor): yalniz 8 g korunur.
          if (m.protein - (c.adet - yeni) * c.p < (kurallara ? ogunDip : 8)) continue;
          if (yeni === 0 && kurallara) {
            const kalan = (m.items || []).filter(x => x.adet > 0 && x !== c);
            if (kalan.length < 3) continue;                      // tabak 3 kalemin altina inmez
            if (!kalan.some(x => x.p >= 10)) continue;           // gercek protein kaynagi kalsin
          }
          c.adet = yeni;
          // ⚠️ items ORTA YERDE FILTRELENMEZ (21 Agu 2026): adet 0 ile bekleyen
          // YAG CAPASI da siliniyordu ve sonraki adimlar onu geri buyutemiyordu.
          // 45 kg profilinde ogle/aksam tabaginda hic yag capasi kalmiyor, gun
          // yag hedefinin %29 altinda bitiyordu. Filtre zaten en sonda var.
          yenile(m); return true;
        }
        return false;
      };
      // ⚠️ SON CARE (21 Agu 2026). Iki gecis de bos donerse ve SERT TAVAN
      // hala asiliyorsa ana ogun capasi da kuculur. 50 kg / dovus / kas +
      // protein tozlu ara ogun sablonunda tam bu oluyordu: ana ogun
      // korumasi yuzunden kirpacak yer kalmiyor ve gun 131 g ile 125 g
      // tavanin ustunde bitiyordu. Guvenlik siniri her tabak kuralindan
      // once gelir — ama SIRA sonuncu, yani ancak baska care yokken.
      const anaKucult = () => {
        for (const m of meals.slice().sort((a, b) => b.protein - a.protein)) {
          const c = capa(m, 'p');
          if (!c || c.adet <= 0) continue;
          const adim = adimi(c.u);
          const yeni = c.adet - adim <= 0 ? 0 : nutRound(c.adet - adim, c.u);
          if (m.ana && yeni === 0) continue;      // ana ogun capasiz kalmaz
          if (m.protein - (c.adet - yeni) * c.p < 8) continue;
          c.adet = yeni;
          // (filtre yok — yukaridaki nota bak)
          yenile(m); return true;
        }
        return false;
      };
      const kucultuldu = kucult(true) || (sert && (kucult(false) || anaKucult()));
      if (!kucultuldu) break;
    }
  };
  ekleriKirp();

  // ⚠️ Protein capasi kuculunce KALORI de dustu (3034 hedefe 2692 cikti).
  // Acigi once KARBONHIDRAT, sonra YAG capasindan kapat — proteini bozmadan.
  //
  // ⚠️ 18 Agu 2026: eskiden yalniz karbonhidrat kaldiraci vardi ve tavana
  // dayaninca dongu duruyordu; kahvalti 616 kcal hedefe 401 kcal cikiyor,
  // gun toplami tutsa da OGUN dagilimi bozuluyordu. Yag capasi ikinci
  // kaldiractir: kalori yogun (1 kasik zeytinyagi 119 kcal) ve porsiyonu
  // sismez.
  const toplamK = () => meals.reduce((a, m) => a + m.kcal, 0);
  // y tavani 3 -> 2: "3 kasik zeytinyagi" tek ogunde savunulamaz.
  const TAVAN = { c: 3, y: 2, d: 3 };
  // Eklenen yag = CAPA olarak konan yag (zeytinyagi, tahin, kuruyemis).
  // Gidanin kendi yagi (et, peynir, yumurta) bu hesaba GIRMEZ.
  const eklenenYag = () => meals.reduce((a, m) =>
    a + (m.items || []).reduce((b, x) => b + (x.rol === 'y' ? x.adet * x.f : 0), 0), 0);
  const yagSiniri = t.fat * NUT_LIMITS.eklenenYagPay;
  const safYag = (x) => x.p === 0 && x.c === 0 && x.f > 0;
  const safYagAdet = () => meals.reduce((a, m) =>
    a + (m.items || []).reduce((b, x) => b + (safYag(x) ? x.adet : 0), 0), 0);
  const yagYeriVar = (c) => {
    if (c.rol !== 'y') return true;
    if (safYag(c) && safYagAdet() + adimi(c.u) > NUT_LIMITS.safYagMax) return false;
    return (eklenenYag() + adimi(c.u) * c.f) <= yagSiniri;
  };
  // ⚠️ SIRALAMA: KALORI once, protein bandi sonra (20 Agu 2026).
  // Yumusak bant doldurma adimlarini da kilitleyince gun %11 eksik
  // kaliyordu — 16 yasinda, gunde 6 gun antrenmanda asil risk AZ YEMEK.
  // Kural: gun kalorisi hedefin %95'inin altindayken protein kapisi SERT
  // TAVAN'dir; kalori banda girdikten sonra yumusak bant devreye doner.
  // ⚠️ 5 Eyl 2026 — BAND MERKEZI, ALT KENARI DEGIL. Doldurma dongusu
  // hedefin %95'ine ulasinca duruyordu; olcum 20 kombinasyonun 17'sinde
  // sonucun hedefin ALTINDA bittigini gosterdi (ortalama -%3,4). Kas
  // kazanimi hedefinde bu, +350 kcal'lik fazlanin ucte birinin
  // buharlasmasi demek — motorun kendi "asil risk AZ YEMEK" ilkesiyle
  // celisiyordu. Esik %2'ye cekildi; fazla kacarsa fazlayiKirp geri aliyor.
  // ⚠️ pKapi esigi BILEREK 0.95'te BIRAKILDI. Once 0.98'e cekildi (dongu
  // esigiyle ayni olsun diye) ve olcum kotulesti: idx1'de gun proteini
  // 171 g / 2.48 g/kg ile SERT TAVANA yapisti. Iki esigin FARKLI olmasi
  // dogru — %95-%98 araligi motorun "acigi proteinsiz kaynakla kapat"
  // penceresi. O pencerenin ise yaramasi dolgunun capadan FARKLI besin
  // olmasina bagli (bkz. NUT_FILL); eskiden ayni besin oldugu icin pencere
  // kilitleniyordu ve gun %95'te takili kaliyordu.
  // ⚠️ KAPI ADIMIN PROTEININE GORE (5 Eyl 2026). Iki uc de olculdu:
  //   esik 0.95 -> gun hedefin %2,5 altinda bitiyor (az yeme riski)
  //   esik 0.98 -> kalori duzeliyor AMA protein 2,48 g/kg ile tavana yapisiyor
  // Ikisi de yanlis, cunku tek bir esik iki farkli kalemi ayni muameleye
  // tabi tutuyor. Gercek ayrim SU: %95'ten sonra acigi kapatmak serbest
  // olmali ama yalnizca PROTEIN TASIMAYAN kalemlerle (meyve, ekmek, zeytin-
  // yagi). Pilav/bulgur/patates (3-5 g/porsiyon) o pencerede giremez —
  // proteini sisiren onlardi.
  const NUT_DUSUK_P = 2;   // g/adim — bunun altindaki kalem "proteinsiz" sayilir
  const pKapi = (adimP) => {
    if (toplamK() < t.kcal * 0.95) return proteinTavan;
    return (adimP <= NUT_DUSUK_P) ? proteinTavan : proteinBant;
  };
  for (let tur = 0; tur < 40; tur++) {
    const acik = t.kcal - toplamK();
    if (acik <= t.kcal * 0.02) break;
    // Hedefinin en gerisinde kalan ogunu doldur — "en dusuk kalorili" degil.
    const sirali = meals.slice().sort((a, b) =>
      ((a.kcal - ((a.hedef && a.hedef.kcal) || a.kcal)) - (b.kcal - ((b.hedef && b.hedef.kcal) || b.kcal))));
    const yagDolu = meals.reduce((a, m) => a + m.fat, 0) >= t.fat;
    let yapildi = false;
    for (const m of sirali) {
      // Yag kaldiraci yalniz gun yag hedefi ALTINDAYKEN kullanilir; yoksa
      // acigi yagla kapatmak makro dengesini bozar (karbonhidrat eksik kalir).
      // ⚠️ SIRA UC DURUMLU (21 Agu 2026):
      //   gun yagi hedefin %90 ALTINDA  -> once YAG (yag da bir hedeftir,
      //     "kalan" degil; dolgu eklenince yag hic buyuyemez oldu ve
      //     enerji payi %24'e dustu — DRI ergen tabani %25)
      //   %90-100 arasi               -> once karbonhidrat, sonra dolgu, en son yag
      //   hedefi doldurduysa          -> yag hic buyumez
      // Eklenen yag tavani her ucunde de gecerli; yani "once yag" demek
      // sinirsiz yag demek degil, 5 kasik zeytinyagina donus yok.
      const yagAcik = meals.reduce((a, m) => a + m.fat, 0) < t.fat;
      for (const rol of (yagDolu ? ['c', 'd'] : (yagAcik ? ['y', 'c', 'd'] : ['c', 'd', 'y']))) {
        const c = capa(m, rol);
        if (!c || c.adet >= TAVAN[rol]) continue;
        if (!yagYeriVar(c)) continue;
        // ⚠️ DOLDURMA PROTEIN TAVANINI ASAMAZ (18 Agu 2026). Turk karbonhidrat
        // kaynaklari protein tasir (bulgur 5 g, pilav 4 g/porsiyon); kalori
        // acigini karbonhidratla kapatirken protein geri sisiyordu ve
        // kirpma adiminin isini bozuyordu. Asacaksa yag kaldiracina gec.
        const adimP = adimi(c.u) * c.p;
        if (toplamP() + adimP > pKapi(adimP)) continue;
        c.adet = nutRound(c.adet + adimi(c.u), c.u);
        yenile(m); yapildi = true; break;
      }
      if (yapildi) break;
    }
    if (!yapildi) break;
  }
  // ⚠️ FAZLAYI DA GERI AL (18 Agu 2026). Motorda yalniz "acigi kapat" adimi
  // vardi, "fazlayi kirp" adimi YOKTU. Bolunemeyen bir capa (1 kutu ton
  // baligi yarimlanamaz) ogunu hedefin ustune tasiyinca gun toplami %9
  // asiyor ve motor bunu duzeltmeye calismiyordu bile.
  // Once KARBONHIDRAT, sonra YAG kirpilir; protein capasina dokunulmaz.
  const fazlayiKirp = () => {
  for (let tur = 0; tur < 24; tur++) {
    if (toplamK() <= t.kcal * 1.05) break;
    let yapildi = false;
    for (const rol of ['d', 'c', 'y']) {
      const aday = meals.slice()
        .sort((a, b) => ((b.kcal - ((b.hedef && b.hedef.kcal) || b.kcal)) -
                         (a.kcal - ((a.hedef && a.hedef.kcal) || a.kcal))))
        .find(m => {
          const c = capa(m, rol);
          if (!c || c.adet <= 0) return false;
          const dipC = rol === 'c' ? (adimi(c.u) === 1 ? 1 : 0.5) : 0;
          return c.adet > dipC;
        });
      if (!aday) continue;
      const c = capa(aday, rol);
      const dipC = rol === 'c' ? (adimi(c.u) === 1 ? 1 : 0.5) : 0;
      const yeniAdet = c.adet - adimi(c.u);
      c.adet = yeniAdet <= dipC ? dipC : nutRound(yeniAdet, c.u);
      yenile(aday); yapildi = true; break;
    }
    if (!yapildi) break;
  }
  };
  fazlayiKirp();

  // ⚠️ UCUNCU ADIM: OGUN DAGILIMI (18 Agu 2026).
  // Gun toplami %5 bandina girince dongu duruyordu — ama toplam tutarken
  // dagilim bozuk kalabiliyordu (atistirma 255 kcal / hedef 422). Bir gunun
  // dogru olmasi, toplaminin dogru olmasi DEMEK DEGIL: 900 kcal'lik ogunun
  // yaninda 250 kcal'lik ogun, ogun basi protein bandini da bozar.
  // Bu adim, toplami tavanin altinda tutarak hedefinin %20'sinden fazla
  // gerisinde kalan ogunleri doldurur.
  for (let tur = 0; tur < 60; tur++) {
    const tavan = t.kcal * 1.05;
    const geri = meals.filter(m => m.hedef && m.kcal < m.hedef.kcal * 0.8)
      .sort((a, b) => (a.kcal / a.hedef.kcal) - (b.kcal / b.hedef.kcal))[0];
    if (!geri) break;
    const yagDolu2 = meals.reduce((a, m) => a + m.fat, 0) >= t.fat;
    let yapildi = false;
    // ⚠️ EK DE BIR KALDIRACTIR (20 Agu 2026). Capalar tavana dayaninca adim
    // duruyordu ve kahvalti hedefinin %47'sinde kaliyordu. Ekler (peynir,
    // zeytin, ayran) 1 porsiyonda sabitti; 2'ye cikmalari hem gercekci hem
    // de tabagi buyutmenin en dogal yolu. Tavan 2 — "3 dilim peynir" degil.
    // ⚠️ YAG KAPISI OGUN BAZLI (20 Agu 2026). "Gun yagi doldu" kurali
    // dogruydu ama fazla genisti: protein kirpma adimi yag TASIYAN ekleri
    // (peynir, ayran) cikardigi icin o ogun hem kalorisiz hem yagsiz
    // kaliyor, gun yagi baska ogunlerde dolu oldugu icin de kapanmiyordu.
    // Bu ogunun KENDI yag hedefi altindaysa yag capasi acilir.
    const ogunYagAcik = geri.hedef && geri.fat < (geri.hedef.fat || 0) * 0.8;
    const roller = (yagDolu2 && !ogunYagAcik) ? ['c', 'd'] : ['c', 'd', 'y'];
    // ⚠️ 20 Agu 2026: PAL duzeltmesi hedefleri ~%6 yukseltince sablonlar
    // kendi paylarina yetismekte zorlandi. Cok geride kalan ogunde ek tavani
    // 2 yerine 3 ("3 dilim peynir" degil, "3 porsiyon salata/ayran" gibi
    // dusun — ekler kucuk kalemler). Normal geride kalanda tavan 2.
    const ekTavan = geri.kcal < geri.hedef.kcal * 0.7 ? 3 : 2;
    const adaylar = roller.map(r => capa(geri, r))
      .concat((geri.items || []).filter(x => x.rol === 'ek' && x.adet > 0 && x.adet < ekTavan));
    // ⚠️ COK GERIDE KALAN OGUNDE KARBONHIDRAT TAVANI 4 (20 Agu 2026).
    // Kahvalti hedefinin %57'sinde kaliyordu: capa tavana dayanmis, yag
    // capasi gun yagi dolu diye kapali, ekler 25 kcal'lik kaldiraclar.
    // "4 dilim ekmek" kahvaltida gercekci; gun tavani zaten ustte duruyor.
    const cokGeri = geri.kcal < geri.hedef.kcal * 0.7;
    for (const c of adaylar) {
      if (!c) continue;
      const tav = (c.rol === 'c' && cokGeri) ? 4 : TAVAN[c.rol];
      if (c.rol !== 'ek' && c.adet >= tav) continue;
      if (!yagYeriVar(c)) continue;
      const artis = adimi(c.u) * c.k;
      if (toplamK() + artis > tavan) continue;
      // ⚠️ BU ADIMDA CAPA KAPISI SERT TAVAN (20 Agu 2026). Yumusak bant
      // burada dagilimi kilitliyordu: hafif profilde gun proteini zaten
      // bandin ustunde oldugu icin kahvaltiya bir dilim ekmek bile
      // eklenemiyor, ogun hedefinin %57'sinde kaliyordu. Bu adim gun
      // toplamini +%5 tavaninin ustune cikaramaz; kilitlenmesi gereken
      // yer burasi degil. Ek kaldiraci protein tasidigi icin banda bagli.
      const kapi = c.rol === 'ek' ? proteinBant : proteinTavan;
      if (toplamP() + adimi(c.u) * c.p > kapi) continue;
      c.adet = nutRound(c.adet + adimi(c.u), c.u);
      yenile(geri); yapildi = true; break;
    }
    // ⚠️ Gun tavani doluysa sorun EKSIK degil DAGILIMDIR: hedefinin en
    // ustundeki ogunden bir adim al, geri kalan ogune ver. Toplam sabit
    // kalir, dagilim duzelir. Protein capasina dokunulmaz.
    if (!yapildi) {
      const fazla = meals.slice()
        .filter(m => m.hedef && m !== geri && m.kcal > m.hedef.kcal)
        .sort((a, b) => (b.kcal / b.hedef.kcal) - (a.kcal / a.hedef.kcal))[0];
      if (!fazla) break;
      const ver = ['c', 'y'].map(r => capa(fazla, r))
        .find(c => c && c.adet > (c.rol === 'c' ? (adimi(c.u) === 1 ? 1 : 0.5) : 0));
      if (!ver) break;
      const yeniAdet = ver.adet - adimi(ver.u);
      const dipV = ver.rol === 'c' ? (adimi(ver.u) === 1 ? 1 : 0.5) : 0;
      ver.adet = yeniAdet <= dipV ? dipV : nutRound(yeniAdet, ver.u);
      yenile(fazla);
      continue;
    }
  }
  // ⚠️ DORDUNCU ADIM: YAG TAMAMLAMA (18 Agu 2026).
  // Kalori bandi tutunca dongu duruyor, ama protein kirpma adimi protein
  // tasiyan ekleri (ayran, yogurt) cikarirken YAGI da goturuyor. Yag hormonal
  // saglik tabaniyla korunan tek makro — "kalan" muamelesi gormemeli.
  for (let tur = 0; tur < 12; tur++) {
    const yagT = meals.reduce((a, m) => a + m.fat, 0);
    if (yagT >= t.fat * 0.95) break;
    // ⚠️ Tavan kontrolu EKLEMEDEN SONRAKI degere gore. Eskiden ekleme
    // oncesi bakiliyordu ve son adim tavani asabiliyordu: 1 kasik
    // zeytinyagi 119 kcal, gunu tek basina %5'ten cikariyordu.
    const aday = meals.slice()
      .sort((a, b) => a.fat - b.fat)
      .find(m => {
        const c = capa(m, 'y');
        return c && c.adet < TAVAN.y && yagYeriVar(c) &&
          (toplamK() + adimi(c.u) * c.k) <= t.kcal * 1.05;
      });
    if (!aday) break;
    const c = capa(aday, 'y');
    c.adet = nutRound(c.adet + adimi(c.u), c.u);
    yenile(aday);
  }
  // ⚠️ YAG FAZLASINI DA GERI AL (9 Eyl 2026).
  // Motorda yag icin yalniz TABAN korumasi vardi; ustu serbestti. Ana ogune
  // tam porsiyon capa gelince (dana kiyma 19 g, somon 13 g yag) gidanin
  // KENDI yagi yukseldi ve yag capasi bunun ustune biniyordu: hafif
  // profillerde yag +%10 fazla, karbonhidrat -%9 eksik bitiyordu. Antrenman
  // yakiti karbonhidrat — bu takas yanlis yonde.
  // Yalniz EKLENEN yag (rol 'y') kirpilir; gidanin kendi yagina dokunulmaz.
  // Bosalan kaloriyi hemen asagidaki son gecis dolgu/karbonhidratla kapatir.
  // ⚠️ IKI KOSUL BIRDEN, tek basina yag fazlasi YETMEZ. Once yalniz
  // "yag > hedef x 1.05" ile denendi ve olcum kotulesti: kirpma normal
  // profillerde de calisip yag acigini GERI GETIRDI (hedefin altinda biten
  // gun 6/20'den 13/20'ye ciktikti). Sorun yag fazlasinin kendisi degil,
  // yagin KARBONHIDRATIN YERINI almasiydi — o yuzden kosul ikili.
  for (let tur = 0; tur < 12; tur++) {
    const yagT = meals.reduce((a, m) => a + m.fat, 0);
    const karbT = meals.reduce((a, m) => a + m.carb, 0);
    if (yagT <= t.fat * 1.10) break;
    if (karbT >= t.carb * 0.98) break;
    const aday = meals.slice().sort((a, b) => b.fat - a.fat)
      .find(m => { const c = capa(m, 'y'); return c && c.adet > 0; });
    if (!aday) break;
    const c = capa(aday, 'y');
    const yeni = c.adet - adimi(c.u);
    c.adet = yeni <= 0 ? 0 : nutRound(yeni, c.u);
    yenile(aday);
  }

  // ⚠️ SON GECIS: doldurma adimlari karbonhidrat ekledi, karbonhidrat da
  // protein tasiyor. Tavan yeniden asilmis olabilir — ekleri bir kez daha
  // kirp, sonra bosalan kaloriyi YAG ile kapat (yag protein tasimaz).
  ekleriKirp();
  // ⚠️ Son gecisin capa tavani 4 (digerlerinde 3). Sebep: buraya ancak
  // hafif profil + dusuk hedef gibi kose durumlarda gelinir ve orada
  // alternatif, kaloriyi %9 eksik birakmaktir. Once YAG denenir (protein
  // tasimaz, tavani zorlamaz), yetmezse karbonhidrat.
  // ⚠️ ESIK 0.95 -> 0.98 (9 Eyl 2026). Ana doldurma dongusu 5 Eyl'de %2
  // bandina cekilmisti; bu son gecis %5'te kalmisti ve tutarsizdi. Fark
  // yag fazlasi kirpildiktan SONRA gorunur oldu: kirpma gunu %1-4 eksik
  // birakiyor, son gecis "%5 icindeyim" deyip hic calismiyor ve acik
  // oldugu gibi kaliyordu (20 gunun 16'si hedefin altinda bitti).
  for (let tur = 0; tur < 16; tur++) {
    if (toplamK() >= t.kcal * 0.98) break;
    let yapildi = false;
    // ⚠️ Sira degisti (21 Agu 2026): once DOLGU, sonra yag, en son
    // karbonhidrat capasi. Dolgu proteinsiz oldugu icin protein kapisina
    // takilmiyor ve yag sinirini de zorlamiyor.
    for (const rol of ['d', 'y', 'c']) {
      const alan = rol === 'y' ? 'fat' : 'carb';
      const aday = meals.slice().sort((a, b) => (a[alan] - b[alan]))
        .find(m => {
          const c = capa(m, rol);
          if (!c || c.adet >= 4) return false;
          if (!yagYeriVar(c)) return false;
          return toplamP() + adimi(c.u) * c.p <= pKapi();
        });
      if (!aday) continue;
      const c = capa(aday, rol);
      c.adet = nutRound(c.adet + adimi(c.u), c.u);
      yenile(aday); yapildi = true; break;
    }
    if (!yapildi) break;
  }
  // ⚠️ SERT TAVAN SON SUPURGESI (21 Agu 2026). Buraya kadarki her adim tabak
  // kurallarina saygi gosterir; ama guvenlik siniri tabak kurallarindan once
  // gelir. Bu supurge protein TASIYAN kalemleri kirpar — ana ogun capasi ve
  // ogun basi 8 g protein korunur.
  // ⚠️ SIRA ONEMLI: supurge KALORI KURTARMASINDAN ONCE calisir. Tersi
  // denendi ve gun %26 eksik bitti: kurtarma kaloriyi dolduruyor, supurge
  // hemen ardindan protein tasiyan karbonhidrati (makarna 23 g/porsiyon)
  // kirpip ayni kaloriyi geri aliyordu.
  // ⚠️ Aday secimi protein YOGUNLUGUNA gore: ayni grami en az kaloriyle
  // goturen kalem kirpilir, boylece gun kalorisi en az zarar gorur.
  for (let tur = 0; tur < 30; tur++) {
    if (toplamP() <= proteinTavan) break;
    let yapildi = false;
    for (const m of meals.slice().sort((a, b) => b.protein - a.protein)) {
      const aday = (m.items || []).filter(x => x.adet > 0 && x.p > 0)
        .filter(x => !(x.rol === 'p' && m.ana))
        .sort((a, b) => (b.p / (b.k || 1)) - (a.p / (a.k || 1)))[0];
      if (!aday) continue;
      const adim = adimi(aday.u);
      const yeni = aday.adet - adim <= 0 ? 0 : nutRound(aday.adet - adim, aday.u);
      if (m.protein - (aday.adet - yeni) * aday.p < 8) continue;
      aday.adet = yeni; yenile(m); yapildi = true; break;
    }
    if (!yapildi) break;
  }

  // ⚠️ KOSE DURUM KURTARMASI. Iki uc profil normal tavanlarla hedefe
  // ulasamiyor: 45 kg + cift antrenman + kas hedefi 3113 kcal, yani
  // 69 kcal/kg — kucuk vucut, cok yuksek hedef; butun capalar tavana
  // dayaniyor. Bu adim yalniz o kose durumda calisir (normalde dongu ilk
  // kontrolde cikar) ve tavani 4'E cikarir — 4 SINIRDIR, "5 muz" sozlesmesi
  // teste bagli.
  for (let tur = 0; tur < 30; tur++) {
    if (toplamK() >= t.kcal * 0.95) break;
    let yapildi = false;
    for (const rol of ['d', 'c']) {
      const aday = meals.slice()
        .sort((a, b) => (a.kcal / (a.hedef ? a.hedef.kcal : a.kcal)) -
                        (b.kcal / (b.hedef ? b.hedef.kcal : b.kcal)))
        .find(m => {
          const c = capa(m, rol);
          // Kalori acigi varken kapi 2.5 degil 3.0 g/kg (yukaridaki nota bak).
          return c && c.adet < 4 &&
            toplamP() + adimi(c.u) * c.p <= (kg > 0 ? kg * NUT_LIMITS.proteinAbsMaxPerKg : proteinTavan);
        });
      if (!aday) continue;
      const c = capa(aday, rol);
      c.adet = nutRound(c.adet + adimi(c.u), c.u);
      yenile(aday); yapildi = true; break;
    }
    if (!yapildi) break;
  }

  // ⚠️ BESINCI ADIM: OGUN BASI PROTEIN DAGILIMI (9 Eyl 2026).
  // Kirpma adimlari GUN TOPLAMI banda girer girmez duruyordu; dagilima hic
  // bakmiyorlardi. Olcumde gorunen tam olarak buydu: gun 152 g ile bandin
  // icinde ama aksam 51 g (kendi hedefi 40), atistirma 14 g (esigi 17).
  // Toplam dogru, tabak yanlis — ve esik alti ogun kas protein sentezini
  // maksimuma cikarmiyor, yani kayip gercek.
  // Sira ONEMLI: once hedefinin USTUNDEKI ogunden protein tasiyan bir ek
  // kirpilir (gun toplami dusmesin diye yer acilir), SONRA dusuk ogunun
  // capasi buyutulur. Tersi olsaydi her tur gun toplamini yukari iterdi.
  for (let tur = 0; tur < 20; tur++) {
    const dusuk = meals.filter(m => m.protein < ogunDip)
      .sort((a, b) => a.protein - b.protein)[0];
    if (!dusuk) break;
    let yapildi = false;
    // (a) Hedefini asan ogunden protein tasiyan EK kirp — capaya dokunma.
    const fazla = meals.slice()
      .filter(m => m !== dusuk && m.hedef && m.protein > (m.hedef.protein || 0) + 4)
      .sort((a, b) => (b.protein - b.hedef.protein) - (a.protein - a.hedef.protein))[0];
    if (fazla) {
      const ek = (fazla.items || [])
        .filter(x => x.rol === 'ek' && x.adet > 0 && x.p >= 4)
        .sort((a, b) => b.p - a.p)[0];
      // Kirptiktan sonra o ogun de esigin altina dusmemeli.
      if (ek && fazla.protein - ek.adet * ek.p >= ogunDip) {
        ek.adet = 0; yenile(fazla); yapildi = true;
      }
    }
    // (b) Dusuk ogunun protein capasini bir adim buyut.
    const c = capa(dusuk, 'p');
    if (c && c.adet < 4) {
      const artisK = adimi(c.u) * c.k, artisP = adimi(c.u) * c.p;
      // ⚠️ KAPI SERT TAVAN DEGIL YUMUSAK BANT. Sert tavanla denendi ve gun
      // proteini +%14'e cikti (2.3-2.5 g/kg): dagilim duzeliyordu ama plan
      // "hedef 138 g" yazip 158 g veriyordu. Bant kapisiyla adim once (a)
      // ile yer acmak zorunda kaliyor — yani protein TASINIYOR, eklenmiyor.
      if (toplamK() + artisK <= t.kcal * 1.05 && toplamP() + artisP <= proteinBant) {
        c.adet = nutRound(c.adet + adimi(c.u), c.u); yenile(dusuk); yapildi = true;
      }
    }
    if (!yapildi) break;
  }

  // Tum doldurma adimlarindan sonra son bir fazla kontrolu.
  fazlayiKirp();
  // Kullanilmayan yag capasini (adet 0) listeden cikar
  for (const m of meals) m.items = (m.items || []).filter(x => x.adet > 0);
  return meals;
}

/**
 * ⚠️ SLOTLAR AYNI INDEKSTE YURUMEZ (5 Eyl 2026).
 * Tek `sablonIdx` bes slota birden uygulaniyordu ve havuzlar ayni sirada
 * oldugu icin capalar cakisiyordu: idx1'de hem ara hem atistirma
 * 'Protein tozu' seciyor, gun proteini 2.48 g/kg ile SERT TAVANA yapisiyor
 * (hedef 2.0 g/kg, sapma +%23). Capasi o gun kullanilmis bir sablon
 * atlanir; havuz tukenirse ilk aday kullanilir (plan uretilmeden kalmaz).
 */
function nutBuildDay(t, kg, sablonIdx) {
  const ogunler = nutMealSplit(t, kg);
  const kullanilan = new Set();
  // ⚠️ SABLON SECIMI ARTIK KOR ROTASYON DEGIL (9 Eyl 2026).
  // Rotasyon hala BIRINCIL sira — "Baska oner" calismaya devam etsin diye.
  // Ama sirada onde olan bir sablon ogunun protein hedefini KABACA
  // isikaliyorsa (protein tozlu ara ogun 24 g teslim ederken hedef 18 g)
  // atlanir. Sonucu olcumle gorduk: o tek kalem gunun protein butcesini
  // yiyor ve ANA OGUN tam porsiyon capa alamiyordu.
  // Hicbir aday bandi tutmuyorsa EN YAKIN olan secilir — plan uretilmeden
  // kalmaz, motor sessizce bos ogun dondurmez.
  // ⚠️ TOLERANS ASIMETRIK YAPILMAK ISTENDI, OLCUM REDDETTI (9 Eyl 2026).
  // Gerekce makuldu: ana ogunde fazla protein sorun degil, tabak dogru.
  // Ama ana ogunde tavani gevsetmek amaci olan seyi (havuz cesitliligi)
  // GERI GETIRMEDI — "Tavuk gogsu + bulgur" 39 g hedefe 70 g teslim
  // ediyor (capa 47 + bulgur 15 + ayran 6 + salata 2), yani her makul
  // tavani asiyor. Buna karsilik gun proteini her profilde 1.5-3.5 puan
  // KOTULESTI. Simetrik %35 kaldi; havuz cesitliligi ayri bir is.
  const bandaSigar = (m, o) => {
    if (!m || !o || !(o.protein > 0)) return true;
    return Math.abs(m.protein - o.protein) <= Math.max(8, o.protein * 0.35);
  };

  const kur = (anaTaban) => ogunler.map(o => {
    const havuz = NUT_TEMPLATES[o.slot] || [];
    // ⚠️ FAVORI SIRAYI DEGISTIRIR, ROTASYONU OLDURMEZ. Rotasyon sirasi once
    // kurulur, sonra favori puanina gore KARARLI siralanir — esit puanlilar
    // arasinda "Baska oner" hala calisir. Kullanici hicbir sey secmediyse
    // butun puanlar 0 ve sira rotasyonun aynisi kalir.
    const sira = [];
    for (let k = 0; k < Math.max(1, havuz.length); k++) {
      sira.push(((Number(sablonIdx) || 0) + k) % Math.max(1, havuz.length));
    }
    if (nutTercih().favori.length) {
      sira.sort((a, b) => nutFavoriPuan(havuz[b]) - nutFavoriPuan(havuz[a]));
    }
    let m = null, secilen = null, enYakin = null, enYakinT = null, enYakinFark = Infinity;
    for (let k = 0; k < sira.length; k++) {
      const idx = sira[k];
      const aday = havuz[idx];
      if (aday && k < sira.length - 1 && kullanilan.has(aday.protein)) continue;
      const kurulan = nutBuildMeal(o.slot, o, idx, anaTaban);
      if (!kurulan) continue;
      const fark = Math.abs(kurulan.protein - (o.protein || 0));
      if (fark < enYakinFark) { enYakinFark = fark; enYakin = kurulan; enYakinT = aday; }
      if (bandaSigar(kurulan, o)) { m = kurulan; secilen = aday; break; }
    }
    if (!m && enYakin) { m = enYakin; secilen = enYakinT; }
    // ⚠️ KACIS KAPISI: slotun butun sablonlari tercihe takildiysa ogun
    // KAYBOLMAZ — tercih o tek ogun icin yok sayilir ve isaretlenir.
    // Sessizce 4 ogunluk bir gun uretmek, uyulamadigini soylememekten
    // daha kotu: makro toplami da ogun sayisi da yanlis olurdu.
    if (!m) {
      _nutTercihKapali = true;
      try {
        m = nutBuildMeal(o.slot, o, (Number(sablonIdx) || 0), anaTaban);
      } finally { _nutTercihKapali = false; }
      if (m) m.tercihDisi = true;
    }
    if (m) {
      if (secilen) kullanilan.add(secilen.protein);
      m.zaman = o.zaman || null;
      m.hedef = { kcal: o.kcal, protein: o.protein, carb: o.carb, fat: o.fat };
    }
    return m;
  }).filter(Boolean);

  const dene = nutBalanceDay(kur(1), t, kg);
  // Ana ogun tabani sert tavani asiyorsa (hafif profil) 0.5'e geri dus.
  const tavan = kg > 0 ? Math.max(t.protein, Math.round(kg * NUT_LIMITS.proteinMaxPerKg)) : Infinity;
  const toplamP = dene.reduce((a, m) => a + m.protein, 0);
  if (toplamP <= tavan) return dene;
  kullanilan.clear();
  return nutBalanceDay(kur(0.5), t, kg);
}

/**
 * PLANIN GERCEK DEGERLERI — hedefle yan yana.
 * ⚠️ Sablon tabanli bir plan hedefi tam tutturamaz; tutturdugunu SOYLEMEK
 * yanlis olur. Motor ne cikardigini yazar, kullanici karsilastirsin.
 */
function nutDaySummary(meals, t, kg) {
  const topla = (alan) => (meals || []).reduce((a, m) => a + (Number(m[alan]) || 0), 0);
  const gercek = { kcal: topla('kcal'), protein: topla('protein'), carb: topla('carb'), fat: topla('fat') };
  const sapma = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0);
  return {
    gercek, hedef: { kcal: t.kcal, protein: t.protein, carb: t.carb, fat: t.fat },
    sapma: {
      kcal: sapma(gercek.kcal, t.kcal), protein: sapma(gercek.protein, t.protein),
      carb: sapma(gercek.carb, t.carb), fat: sapma(gercek.fat, t.fat),
    },
    proteinPerKg: kg > 0 ? Math.round((gercek.protein / kg) * 10) / 10 : null,
    proteinTavanAsildi: kg > 0 && gercek.protein > kg * NUT_LIMITS.proteinMaxPerKg,
    // ⚠️ 20 Agu 2026: alarm esigi g/kg TEK BASINA yetmiyordu. 70 kg'da
    // 0.8 g/kg = 56 g = 3400 kcal'lik planin %14.8'i; DRI'nin 4-18 yas
    // AMDR tabani %25, ACSM'in kronik siniri %20. Yani 60 g yag yiyen bir
    // gun (=%16) alarm vermiyordu. Iki kuraldan BUYUK olani kazanir.
    yagTabanAltinda: kg > 0 && gercek.fat < Math.max(
      kg * NUT_LIMITS.fatMinPerKg, (t.kcal * NUT_LIMITS.fatMinPct) / 9),
  };
}

/** Haftanin 7 gunu icin hedef ozeti — gun tipleri programdan gelir. */
function nutWeek(profil, hedef, program, yagOran) {
  const out = [];
  for (let dow = 1; dow <= 7; dow++) {
    const d = dow % 7;   // 1..6, sonra 0 (Pazar)
    const tip = nutDayType(d, program);
    out.push({ dow: d, tip, hedef: nutTargets(profil, tip, hedef, yagOran) });
  }
  return out;
}

// ---------------------------------------------------------------------------
function ensureNutrition() {
  ensureDiet();
  if (!data.diet.nut || typeof data.diet.nut !== 'object') {
    data.diet.nut = { hedef: 'koru', sablon: 0, kurulduAt: null, yagOran: NUT_LIMITS.fatPct };
  }
  return data.diet.nut;
}

/**
 * Secili yag orani. Ayar yoksa varsayilan; disarida kalirsa banda KIRPILIR.
 * ⚠️ Kirpma sessiz degil: setNutYag zaten banda kirpilmis deger yaziyor,
 * bu fonksiyon eski/bozuk kayitlara karsi ikinci savunma.
 */
/**
 * PAL DUZELTME KATSAYISI — kullanicinin kendi verisinden.
 * ⚠️ Motor BMR x PAL ile TAHMIN eder; iki kisi ayni kiloda ayni antrenmani
 * yapip farkli yakabilir. `hcEnergyCheck` zaten loglanan kaloriyi kilo
 * egimiyle karsilastirip GERCEK harcamayi cikariyor (karnedeki "kayit
 * guvenilirligi" bloku bunu gosteriyor). Kullanici onaylayinca o oran
 * buraya yazilir ve butun hedefler olcume gore kayar.
 * Bant %85-115: olcum de hatali olabilir (eksik log, seyrek tarti), tek
 * bir pencere motoru ucurmasin.
 */
function nutPalKat(deger) {
  const v = Number(deger != null ? deger : (data && data.diet && data.diet.nut ? data.diet.nut.palKat : null));
  if (!isFinite(v) || v <= 0) return 1;
  return Math.min(1.15, Math.max(0.85, v));
}

/** Olculen harcama vs motorun tahmini. Yeterli veri yoksa null. */
function nutKalibrasyon() {
  try {
    if (typeof dietKarneStats !== 'function') return null;
    const s = dietKarneStats('month');
    if (!s || !s.enerji || s.kcalDays < 10) return null;
    const olculen = Math.round(Number(s.enerji.impliedBurn));
    if (!isFinite(olculen) || olculen <= 0) return null;
    const prof = nutProfile();
    if (!prof) return null;
    const n = ensureNutrition();
    const hafta = nutWeek(prof, n.hedef, (typeof data !== 'undefined' ? data.program : null));
    const tahmin = Math.round(hafta.reduce((a, g) => a + (g.hedef ? g.hedef.tdee : 0), 0) / (hafta.length || 1));
    if (!(tahmin > 0)) return null;
    return {
      olculen, tahmin, gun: s.kcalDays,
      kat: Math.round((olculen / tahmin) * 100) / 100,
      fark: Math.round(((olculen - tahmin) / tahmin) * 100),
    };
  } catch (e) { return null; }
}

function setNutPalKat(k) {
  const n = ensureNutrition();
  n.palKat = nutPalKat(k);
  save();
  renderNutrition();
  if (typeof showToast === 'function') {
    showToast('Hedefler ölçülen harcamana göre ayarlandı', 'success');
  }
}

function nutYagOran(deger) {
  const v = Number(deger != null ? deger : (data && data.diet && data.diet.nut ? data.diet.nut.yagOran : null));
  if (!isFinite(v) || v <= 0) return NUT_LIMITS.fatPct;
  return Math.min(NUT_LIMITS.fatPctMax, Math.max(NUT_LIMITS.fatPctMin, v));
}

function setNutYag(o) {
  const n = ensureNutrition();
  n.yagOran = nutYagOran(o);
  save();
  renderNutrition();
}

/**
 * ⚠️ 6 Eyl 2026 — KILO ARTIK TARTIDAN OKUNUYOR.
 * Önceden profil `calc.weight`e bağlıydı: hesaplayıcı bir kez çalıştırılmazsa
 * motor hiç açılmıyordu, çalıştırılsa bile o gün girilen kilo AYLARCA
 * donuyordu — oysa tartı her sabah gerçek kiloyu yolluyor. Artık en yeni
 * tartı kaydı `calc.weight`i EZİYOR; hesaplayıcının işi yaş + boy.
 * ⚠️ BOY zorunlu: `hcBMR` boysuz anlamlı sayı üretmez, 0 ile çağırmak
 * uydurma hedef demektir — o yüzden profil `null` döner ve motor SUSAR.
 */
function nutProfile() {
  ensureDiet();
  const c = data.diet.calc || {};
  const sonTarti = (data.diet.weights || []).filter(w => w && w.kg > 0).pop();
  const kg = (sonTarti && sonTarti.kg) || Number(c.weight) || 0;
  const cm = Number(c.height) || 0;
  if (!(kg > 0) || !(cm >= 120 && cm <= 230)) return null;
  return { sex: c.sex || 'male', age: Number(c.age) || 16, height: cm, weight: kg };
}

function setNutGoal(h) {
  const n = ensureNutrition();
  n.hedef = h === 'kas' ? 'kas' : 'koru';   // ⚠️ ucuncu secenek YOK
  save();
  renderNutrition();
}

function nutNextTemplate() {
  const n = ensureNutrition();
  n.sablon = (Number(n.sablon) || 0) + 1;
  save();
  renderNutrition();
}

/**
 * Ogun basligi. ⚠️ MEAL_SLOTS'a 'ara' EKLENMEDI bilincli olarak: o sabit
 * besin gunlugunde ve dugme etiketlerinde de kullaniliyor, oraya yeni bir
 * ogun eklemek bu ozellikle ilgisi olmayan ekranlari degistirirdi.
 */
function nutSlotLabel(slot) {
  if (slot === 'ara') return 'Ara öğün';
  return (typeof MEAL_SLOTS !== 'undefined' && MEAL_SLOTS[slot]) || slot;
}

/**
 * 🔴 6 Eyl 2026 — TEK HEDEF KAYNAGI.
 *
 * AYNI EKRANDA IKI FARKLI SAYI vardi. Diyet sekmesindeki hesaplayici
 * (`calcGoals`, core.js) kendi Mifflin BMR'sini, kullanicinin sectigi PAL'i
 * ve sabit 1.8 g/kg proteini kullanip `data.diet.kcalGoal`e yaziyordu;
 * beslenme motoru ise paylasilan `hcBMR`yi, gun tipine gore PAL'i ve enerji
 * mevcudiyeti tabanini kullaniyor. Ornek olcum (16 yas, 178 cm, 68.5 kg):
 * hesaplayici BMR 1723 / hedef 3274 kcal, motor BMR 1870 / hedef 2899 kcal.
 * Gunluk ekrani 3274 gosterip "kalan"i ona gore sayiyor, plan 2899 oneriyor.
 * 375 kcal fark, hangisinin gecerli oldugu hicbir yerde yazmiyor.
 *
 * ⚠️ MOTOR KAZANIR: `hcBMR` saglik raporuyla ORTAK cekirdek, PAL gun tipine
 * gore degisiyor (dinlenme 1.55 → agirlik+dovus 1.8), enerji mevcudiyeti
 * tabani var ve 16 yas kilitleri buna bagli. Hesaplayicinin tek isi artik
 * PROFIL toplamak (yas/boy/kilo/cinsiyet).
 *
 * ⚠️ Hedef GUN TIPINE gore degisiyor; gunluk her acilista bugunun tipine
 * senkronlaniyor. Degismediyse `save()` cagrilmiyor — her render'da yazmak
 * senkron trafigini bosa sisirirdi.
 */
function nutSyncDietGoals(t) {
  if (!t || !(t.kcal > 0)) return false;
  ensureDiet();
  const d = data.diet;
  const yeni = { kcalGoal: t.kcal, proteinGoal: t.protein, carbGoal: t.carb, fatGoal: t.fat };
  let degisti = false;
  for (const k in yeni) { if (d[k] !== yeni[k]) { d[k] = yeni[k]; degisti = true; } }
  if (t.waterL > 0 && d.waterGoalL !== t.waterL) { d.waterGoalL = t.waterL; degisti = true; }
  if (degisti) { save(); if (typeof renderDiet === 'function') renderDiet(); }
  return degisti;
}

function renderNutrition() {
  const el = document.getElementById('nutSection');
  if (!el) return;
  const n = ensureNutrition();
  const prof = nutProfile();

  if (!prof) {
    // ⚠️ "Aşağıdaki hesaplayıcıya gir" YETMIYORDU: hesaplayıcı KAPALI bir
    // <details> icinde ve hangi alanin eksik oldugu yazmiyordu. Eksigi
    // ADIYLA soyle, kapiyi da tek dokunusa indir.
    const eksik = (typeof dietSetupEksik === 'function') ? dietSetupEksik() : [];
    const sonTarti = (data.diet.weights || []).filter(w => w && w.kg > 0).pop();
    el.innerHTML = '<div class="nut-wrap nut-empty">' +
      '<div class="nut-head"><h3>Beslenme planı</h3></div>' +
      '<p class="nut-lead">' +
      (eksik.length
        ? 'Plan için tek eksik: <b>' + escapeHtml(eksik.join(' ve ')) + '</b>. ' +
          (sonTarti ? 'Kilonu tartıdan alıyorum (' + sonTarti.kg + ' kg), ' +
            'onu yazmana gerek yok. ' : '') +
          'Girdiğin an hedef ve örnek gün senin verinden hesaplanır — tahmin edilmez.'
        : 'Profil okunamadı — hesaplayıcıyı bir kez çalıştır.') +
      '</p>' +
      '<button class="small primary" onclick="dietSetupOpen()">Kurulumu aç</button>' +
      '</div>';
    return;
  }

  const bugun = new Date().getDay();
  const tip = nutDayType(bugun, data.program);
  const t = nutTargets(prof, tip, n.hedef);
  if (!t) { el.innerHTML = ''; return; }
  nutSyncDietGoals(t);

  const ogunler = nutBuildDay(t, prof.weight, n.sablon);
  const ozet = nutDaySummary(ogunler, t, prof.weight);
  const gercek = ozet.gercek;

  const ZAMAN = { once: 'antrenmandan önce', sonra: 'antrenmandan sonra' };
  const ogunHtml = ogunler.map(m =>
    '<div class="nut-meal"><div class="nm-head"><span>' + escapeHtml(nutSlotLabel(m.slot)) +
    (m.zaman ? '<i class="nm-when">' + escapeHtml(ZAMAN[m.zaman] || '') + '</i>' : '') + '</span>' +
    '<b>' + m.kcal + ' kcal · ' + m.protein + 'g P</b></div>' +
    '<div class="nm-list">' + m.items.map(x =>
      '<div class="nm-item"><span>' + escapeHtml(x.n) + '</span>' +
      '<span class="nm-qty">' + escapeHtml(nutPortion(x.adet, x.u)) + '</span></div>'
    ).join('') + '</div></div>').join('');

  // ⚠️ Mikro besin blogu artik SAYI veriyor — ama her zaman KAPSAMIYLA
  // birlikte. Kismi veriden uretilen bir toplam, kapsami yazilmadan
  // gosterilirse kullanici hayali bir acigi takviyeyle kapatmaya kalkar.
  // Olculen harcama tahminden %8'den fazla sapiyorsa kalibrasyon teklifi.
  const kalib = nutKalibrasyon();
  const katAktif = nutPalKat();
  const kalibHtml = (kalib && Math.abs(kalib.fark) >= 8)
    ? '<div class="nut-kalib"><b>Ölçülen harcaman ' + kalib.olculen + ' kcal/gün</b> — ' +
      'motorun tahmini ' + kalib.tahmin + ' (%' + (kalib.fark > 0 ? '+' : '') + kalib.fark + '). ' +
      kalib.gun + ' günlük kayıt + kilo eğiminden hesaplandı, formülden değil. ' +
      '<button class="nut-mini" onclick="setNutPalKat(' + kalib.kat + ')">Hedefleri buna göre ayarla</button>' +
      (katAktif !== 1 ? '<span class="nut-kalib-on">şu an ×' + katAktif + ' düzeltme uygulanıyor · ' +
        '<button class="nut-mini" onclick="setNutPalKat(1)">sıfırla</button></span>' : '') +
      '</div>'
    : (katAktif !== 1
      ? '<div class="nut-kalib"><b>Hedeflerin ölçüme göre ×' + katAktif + ' düzeltilmiş.</b> ' +
        '<button class="nut-mini" onclick="setNutPalKat(1)">sıfırla</button></div>'
      : '');

  // --- Tercih bloku ---
  const tercih = nutTercih();
  const havuz = nutHavuzBesinleri();
  const tercihChip = (ad) => {
    const fav = tercih.favori.indexOf(ad) >= 0;
    const sev = tercih.sevmem.indexOf(ad) >= 0;
    // Diyet kisiti yuzunden zaten disaridaysa ayri gorunsun — kullanici
    // "ben bunu secmedim ki" demesin.
    const kisit = !sev && !nutIzinli(ad);
    return '<button type="button" class="nut-chip' + (fav ? ' fav' : '') +
      (sev || kisit ? ' no' : '') + '" onclick="nutTercihDongu(' +
      JSON.stringify(ad).replace(/"/g, '&quot;') + ')">' +
      (fav ? '★ ' : (sev ? '✕ ' : '')) + escapeHtml(ad) + '</button>';
  };
  const tercihSay = [
    tercih.sevmem.length ? tercih.sevmem.length + ' sevmediğin' : '',
    tercih.favori.length ? tercih.favori.length + ' favorin' : '',
    tercih.diyet !== 'yok' ? NUT_DIYET[tercih.diyet].ad.toLocaleLowerCase('tr') : '',
  ].filter(Boolean).join(' · ') || 'hepsi serbest';
  const tercihDisiOgun = ogunler.filter(m => m.tercihDisi).map(m => nutSlotLabel(m.slot));
  const tercihHtml =
    '<details class="nut-tercih"><summary>Tercihlerim<span class="nut-tercih-say">' +
    escapeHtml(tercihSay) + '</span></summary>' +
    '<div class="nut-sub">Bir yiyeceğe dokun: <b>★ favori</b> → <b>✕ sevmem</b> → nötr. ' +
    'Sevmediğini plana koymam, yerine aynı öğünün havuzundan başka bir çapa gelir; ' +
    'favorin öne çıkar. <b>Bu bir alerji özelliği değil</b> — motor yalnızca aşağıdaki ' +
    'şablon besinlerini tanır, günlüğe elle yazdığın şeyleri ya da paketli ürünlerin ' +
    'içindekiler listesini görmez.</div>' +
    '<div class="nut-goal nut-diyet">' +
    Object.keys(NUT_DIYET).map(k =>
      '<button type="button" class="nut-chip' + (tercih.diyet === k ? ' on' : '') +
      '" onclick="setNutDiyet(\'' + k + '\')">' + escapeHtml(NUT_DIYET[k].ad) + '</button>').join('') +
    '</div>' +
    Object.keys(havuz).map(slot =>
      '<div class="nt-slot"><b>' + escapeHtml(nutSlotLabel(slot)) + '</b>' +
      '<div class="nt-chips">' + havuz[slot].map(tercihChip).join('') + '</div></div>').join('') +
    ((tercih.sevmem.length || tercih.favori.length || tercih.diyet !== 'yok')
      ? '<button class="nut-mini" onclick="nutTercihSifirla()">Tercihleri sıfırla</button>' : '') +
    '</details>' +
    (tercihDisiOgun.length
      ? '<div class="nut-note">Şu öğünlerde tercihine uyamadım: <b>' +
        escapeHtml(tercihDisiOgun.join(', ')) + '</b>. O öğünün havuzunda kısıtlarına ' +
        'uyan hiçbir şablon kalmadı, öğünü boş bırakmaktansa kuralı gevşettim — ' +
        'yani gün toplamı doğru ama o tabak sana göre değil. Kısıtlardan birini ' +
        'gevşetirsen düzelir.</div>'
      : '');

  const mikroToplam = nutMicroTotals(ogunler);
  const mikro = nutMicroCheck(ogunler);
  const mikroHtml = mikro.map(mi => {
    const durum = !mi.guvenilir ? 'veri yetersiz' : (mi.yeterli ? 'hedef tutuyor' : 'açık var');
    const sinif = !mi.guvenilir ? ' belirsiz' : (mi.yeterli ? ' ok' : '');
    return '<div class="nut-micro' + sinif + '">' +
      '<div class="nmi-head"><b>' + escapeHtml(mi.ad) + '</b>' +
      '<span class="nmi-hedef">' + mi.alinan + ' / ' + mi.hedefSayi + ' ' +
      escapeHtml(mi.birim) + '</span>' +
      '<span class="nmi-durum">' + escapeHtml(durum) + '</span></div>' +
      '<div class="nmi-bar"><i style="width:' + Math.min(100, mi.oran) + '%"></i></div>' +
      '<div class="nmi-neden">' + escapeHtml(mi.neden) + '</div>' +
      (mi.yeterli
        ? '<div class="nmi-kaynak">Örnek gün bunu zaten karşılıyor — takviye gerekmiyor.</div>'
        : '<div class="nmi-kaynak"><b>Önce gıda:</b> ' + escapeHtml(mi.gidaOnce || mi.porsiyon) + '</div>') +
      (mi.takviye
        ? '<div class="nmi-supp">' + escapeHtml(mi.takviye.kanit) + ' Kalan açık için: <b>' +
          escapeHtml(mi.takviye.ad) + ' ' + mi.takviye.doz + ' ' + escapeHtml(mi.takviye.birim) +
          '</b> — ' + escapeHtml(mi.takviye.nasil) + '</div>'
        : '') +
      (mi.uyari && !mi.yeterli ? '<div class="nmi-ipucu">' + escapeHtml(mi.uyari) + '</div>' : '') +
      (mi.ipucu ? '<div class="nmi-ipucu">' + escapeHtml(mi.ipucu) + '</div>' : '') +
      '</div>';
  }).join('');

  const ergoHtml = NUT_ERGO.map(e =>
    '<div class="nut-ergo"><div class="ne-head">' + escapeHtml(e.kanit) + ' <b>' +
    escapeHtml(e.ad) + '</b></div>' +
    '<div class="ne-ne">' + escapeHtml(e.ne) + '</div>' +
    '<div class="ne-not">' + escapeHtml(e.not) + '</div></div>').join('');

  const hafta = nutWeek(prof, n.hedef, data.program).map(g =>
    '<span class="nut-day' + (g.dow === bugun ? ' on' : '') + '">' +
    escapeHtml(DKRN_WD[g.dow] || String(g.dow)) +
    ' <b>' + (g.hedef ? g.hedef.kcal : '—') + '</b></span>').join('');

  el.innerHTML = '<div class="nut-wrap">' +
    '<div class="nut-head"><h3>Beslenme planı</h3>' +
    '<span class="nut-badge">' + escapeHtml(NUT_DAY_LABEL[tip] || '') + '</span></div>' +

    '<div class="nut-targets">' +
    '<div class="nt-cell"><b>' + t.kcal + '</b><span>kcal</span></div>' +
    '<div class="nt-cell"><b>' + t.protein + 'g</b><span>protein</span></div>' +
    '<div class="nt-cell"><b>' + t.carb + 'g</b><span>karbonhidrat</span></div>' +
    '<div class="nt-cell"><b>' + t.fat + 'g</b><span>yağ</span></div>' +
    '<div class="nt-cell"><b>' + t.waterL + 'L</b><span>su</span></div>' +
    '</div>' +
    '<div class="nut-sub">BMR ' + t.bmr + ' · bugünkü harcama ~' + t.tdee +
    ' (aktivite ×' + t.pal + ') · protein ' + t.proteinPerKg + ' g/kg · karb ' + t.carbPerKg + ' g/kg</div>' +

    '<div class="nut-goal">' +
    '<button class="nut-chip' + (n.hedef === 'koru' ? ' on' : '') + '" onclick="setNutGoal(\'koru\')">Kiloyu koru</button>' +
    '<button class="nut-chip' + (n.hedef === 'kas' ? ' on' : '') + '" onclick="setNutGoal(\'kas\')">Kas kazan</button>' +
    '</div>' +

    // Yag orani — bant ICINDE serbest. Gram karsiligi yaninda yaziyor ki
    // "yuzde" soyut kalmasin; itiraz zaten gram uzerineydi.
    '<div class="nut-goal nut-yag">' +
    '<span class="nut-yag-lbl">yağ oranı</span>' +
    [0.25, 0.27, 0.30].map(o =>
      '<button class="nut-chip' + (Math.abs(nutYagOran() - o) < 0.005 ? ' on' : '') +
      '" onclick="setNutYag(' + o + ')">%' + Math.round(o * 100) +
      '<i>' + Math.round(t.kcal * o / 9) + ' g</i></button>').join('') +
    '</div>' +
    '<div class="nut-sub">Yağ oranı %25-32 arasında serbest — <b>%25</b> 14-18 yaş DRI tabanı, ' +
    'altına inilmiyor. "1 g/kg yağ" kalıbı 2500 kcal\'de %25 verir ama ' +
    t.kcal + ' kcal\'de %' + Math.round(prof.weight * 9 / t.kcal * 100) + '\'e düşer; ' +
    'sabit g/kg yüksek kaloride kırılıyor. Kalan kalori karbonhidrata gidiyor.</div>' +

    tercihHtml +

    kalibHtml +

    '<div class="nut-week">' + hafta + '</div>' +

    nutAiHtml(n) +

    '<details class="nut-timing"><summary>Karbonhidrat zamanlaması</summary>' +
    nutCarbTiming(tip).map(x => '<div class="nt-row">' + escapeHtml(x) + '</div>').join('') +
    '</details>' +

    '<div class="nut-sample-head">Örnek gün · ' + ogunler.length + ' öğün ' +
    '<button class="nut-mini" onclick="nutOrnekPlana()">Plana aktar</button>' +
    '<button class="nut-mini" onclick="nutNextTemplate()">Başka öner</button></div>' +
    '<div class="nut-meals">' + ogunHtml + '</div>' +
    // ⚠️ SAPMA GIZLENMEZ: sablon tabanli bir plan hedefi tam tutturamaz.
    // Tutturdugunu soylemek yerine ne cikardigini yazmak dogru olan.
    '<div class="nut-sub">Örnek toplam: <b>' + gercek.kcal + ' kcal</b> (%' +
    (ozet.sapma.kcal >= 0 ? '+' : '') + ozet.sapma.kcal + ') · ' +
    gercek.protein + 'g P (' + ozet.proteinPerKg + ' g/kg) · ' +
    gercek.carb + 'g K · ' + gercek.fat + 'g Y. ' +
    'Bu bir şablon — sevmediğin varsa <b>Tercihlerim</b>\'den işaretle, motor kendi değiştirir.</div>' +
    (ozet.proteinTavanAsildi
      ? '<div class="nut-note">Şablonun sabit ekleri (ayran, yoğurt, peynir) yüzünden bu ' +
        'örnek gün ' + ozet.proteinPerKg + ' g/kg protein veriyor; hedef ' + t.proteinPerKg +
        ' g/kg. Zararlı değil — üstünün ek faydası gösterilmemiş, o kadar. İstersen ' +
        'ayran ya da yoğurdu azalt, yerine karbonhidrat koy.</div>'
      : '') +

    '<details class="nut-micro-wrap"><summary>Mikro besinler ve takviye — ' +
    'örnek günün %' + mikroToplam.kapsam + '\u2019i hesaplandı</summary>' +
    '<div class="nut-micro-note">⚠️ <b>Kapsam %' + mikroToplam.kapsam + '.</b> ' +
    'Mikro besin tablosunda 410 besinin ~90\u2019ı var; kalanlar hesaba katılmadı ' +
    (mikroToplam.kapsanmayan.length
      ? '(' + escapeHtml(mikroToplam.kapsanmayan.slice(0, 5).join(', ')) + ') '
      : '') +
    've onlar da mikro besin taşıyor. Bu yüzden sayı hiçbir zaman tek başına ' +
    'verilmiyor — kapsam %70\u2019in altındaysa Aidan yorum yapmaz, sadece veriyi gösterir. ' +
    'Değerler USDA/TürKomp ortalamalarından porsiyona çevrilmiş yaklaşık değerlerdir.</div>' +
    '<div class="nut-micro-note"><b>Sıra değişmez: önce gıda.</b> Takviye yalnızca gıda ' +
    'hedefi tutturmuyorsa öneriliyor, o zaman bile ilk satır hangi yiyeceği ekleyeceğin. ' +
    'Demirde hiç önerilmiyor — sebebi aşağıda.</div>' +
    mikroHtml +
    '<div class="nut-micro-note nut-ergo-head"><b>Performans takviyeleri — bilgi, reçete değil</b><br>' +
    'Aidan bunları plana koymuyor ve “al” demiyor. Kanıt seviyesi yazıyor ki internetteki ' +
    'iddialarla karşılaştırabilesin; 16 yaşında karar antrenör ve hekimin.</div>' +
    ergoHtml + '</details>' +

    '<div class="nut-disc">Bu plan yaşına, kilona ve antrenman programına göre hesaplanmış bir ' +
    '<b>başlangıç noktasıdır</b>; diyetisyen değildir. Kilo verme / sıklet düşürme planı ' +
    'üretmez — 16 yaşında, büyüme döneminde ve haftada 6 gün antrenman yaparken asıl risk ' +
    'az yemektir. Sıklet için hocan ve bir diyetisyenle konuş.</div>' +
    '</div>';
}

// ============================================================================
// AI BESLENME YAZICI (12 Agu 2026)
//
// 🔴 MIMARI KARAR — AI HEDEFI BELIRLEMEZ, HEDEFI DOLDURUR.
// Sayilari (kcal / protein / karb / yag / su) yukaridaki kural tabanli motor
// hesaplar; AI yalnizca "bu hedefi Turk mutfagindan, senin sevdiklerinle nasil
// doldururum" sorusunu cevaplar. Portfoy yorumu ve teknik analiz kalibinin
// aynisi: SAYIYI PWA HESAPLAR, AI UYDURMAZ.
//
// 🔒 VE ASIL KORUMA — DONEN PLAN KORU KORUNE KAYDEDILMEZ.
// Serbest metin kutusuna "zayiflamak istiyorum" yazilabilir; prompt bunu
// yasakliyor ama prompt bir RICADIR, garanti degil. `nutAiValidate` donen
// planin HER gununu hedefle karsilastirir. BMR'nin altinda ya da gunluk
// hedefin %15 altinda kalan tek bir gun bile varsa PLANIN TAMAMI reddedilir
// ve HIC kaydedilmez — sebebi kullaniciya yazilir. Bu kapi promptun degil
// kodun icinde oldugu icin modelin ne dedigine bagli degildir.

// ============================================================================
// PROGRAM -> GUNLUK (20 Agu 2026)
//
// 🔴 SORUN: uc ayri plan yuzeyi vardi ve ikisi OLU idi.
//   1) kural motorunun "ornek gun"u   — yalniz GOSTERILIYORDU
//   2) AI'in yazdigi haftalik program — yalniz GOSTERILIYORDU
//   3) "plan" listesi                 — 'yedim' ile gunluge kcal+makro YAZAN
//                                       tek yer
// Yani Aidan aylardir dogru bir program uretiyordu ve kullanici ayni yemekleri
// gunluge ELLE giriyordu. Bu adim 1 ve 2'yi 3'e baglar: program tiklanabilir
// bir listeye donusur, kalori sayma tek dokunusa iner.
//
// ⚠️ Aktarilan satirlar `kaynak: 'aidan'` ile isaretlenir. Yeniden aktarimda
// YALNIZCA onlar silinir — kullanicinin elle ekledigi yemekler korunur.
// ⚠️ MEAL_SLOTS'ta 'ara' YOK (kahvalti/ogle/aksam/atistirma). Motorun ara
// ogunu 'atistirma' kovasina duser; yoksa gunlukte hicbir gruba girmez.
// ============================================================================
const NUT_PLAN_ADI = 'Aidan programı';

/** Motorun ornek gununu plan satirlarina cevirir. Saf fonksiyon — test edilir. */
function nutOrnekSatirlari(ogunler) {
  const out = [];
  for (const m of (ogunler || [])) {
    for (const x of (m.items || [])) {
      if (!(x.adet > 0)) continue;
      out.push({
        slot: m.slot === 'ara' ? 'atistirma' : m.slot,
        name: nutPortion(x.adet, x.u) + ' ' + x.n,
        kcal: Math.round(x.adet * x.k),
        protein: Math.round(x.adet * x.p),
        carb: Math.round(x.adet * x.c),
        fat: Math.round(x.adet * x.f),
      });
    }
  }
  return out;
}

/** AI ogun adi serbest metin — slot'a cevir. */
function nutSlotKey(ad) {
  const s = String(ad || '').toLocaleLowerCase('tr');
  if (s.indexOf('kahvalt') >= 0 || s.indexOf('sabah') >= 0) return 'kahvalti';
  if (s.indexOf('öğle') >= 0 || s.indexOf('ogle') >= 0 || s.indexOf('öğlen') >= 0) return 'ogle';
  if (s.indexOf('akşam') >= 0 || s.indexOf('aksam') >= 0) return 'aksam';
  return 'atistirma';
}

/**
 * AI gununu plan satirlarina cevirir. Saf fonksiyon — test edilir.
 * ⚠️ Satir = OGUN, kalem degil. AI kalemleri serbest metin yazar ve kalem
 * basina makro YOKTUR; ogun basina kcal/protein vardir. Kalem basina makro
 * uydurmak, motorun "sayiyi PWA hesaplar" sozlesmesini bozardi.
 */
function nutAiSatirlari(gun) {
  return ((gun && gun.ogunler) || []).map(o => {
    const kalem = (o.kalemler || []).join(', ');
    const ad = (o.ad || 'Öğün') + (kalem ? ' — ' + kalem : '');
    return {
      slot: nutSlotKey(o.ad),
      name: ad.length > 90 ? ad.slice(0, 89) + '…' : ad,
      kcal: Math.round(Number(o.kcal) || 0) || null,
      protein: Math.round(Number(o.protein) || 0) || null,
      carb: null, fat: null,
    };
  });
}

function nutPlanBul() {
  ensureDiet();
  const d = data.diet;
  d.plans = d.plans || [];
  let p = d.plans.find(x => x.name === NUT_PLAN_ADI);
  if (!p) {
    p = { id: Date.now(), name: NUT_PLAN_ADI, weekly: false, meals: emptyPlanMeals() };
    d.plans.push(p);
  }
  d.activePlanId = p.id;
  return p;
}

/** Bir kovayi Aidan satirlariyla tazeler; elle eklenenlere DOKUNMAZ. */
function nutPlanaYaz(p, kova, satirlar) {
  p.meals[kova] = (p.meals[kova] || []).filter(x => x.kaynak !== 'aidan');
  let i = 0;
  for (const s of satirlar) {
    p.meals[kova].push(Object.assign({ id: Date.now() + (i++), kaynak: 'aidan' }, s));
  }
}

function nutOrnekPlana() {
  const prof = nutProfile();
  if (!prof) { showToast('Önce boy ve kilonu gir', 'info'); return; }
  const n = ensureNutrition();
  const tip = nutDayType(new Date().getDay(), (typeof data !== 'undefined' ? data.program : null));
  const t = nutTargets(prof, tip, n.hedef);
  if (!t) return;
  const satirlar = nutOrnekSatirlari(nutBuildDay(t, prof.weight, n.sablon));
  if (!satirlar.length) { showToast('Aktarılacak öğün yok', 'info'); return; }
  const p = nutPlanBul();
  const kova = p.weekly ? dayKeyOf(dietKey()) : 'all';
  const oncesi = JSON.stringify(p.meals[kova] || []);
  nutPlanaYaz(p, kova, satirlar);
  save(); renderDiet();
  const geri = () => { const q = nutPlanBul(); q.meals[kova] = JSON.parse(oncesi); save(); renderDiet(); };
  const mesaj = satirlar.length + ' kalem plana aktarıldı — “yedim” işaretle, günlüğe yazılsın';
  if (typeof showUndoToast === 'function') showUndoToast(mesaj, geri);
  else showToast(mesaj, 'success');
}

function nutAiPlana() {
  const n = ensureNutrition();
  const ai = n && n.ai;
  if (!ai || !Array.isArray(ai.gunler) || !ai.gunler.length) {
    showToast('Önce Aidan\'a program yazdır', 'info'); return;
  }
  const p = nutPlanBul();
  const oncesi = JSON.stringify(p.meals);
  const oncekiWeekly = p.weekly;
  p.weekly = true;   // AI plani 7 gunluk; haftalik kova olmadan gunler karisir
  let toplam = 0;
  for (const g of ai.gunler) {
    const kova = _DAY_KEYS[Number(g.dow)];
    if (!kova) continue;
    const satirlar = nutAiSatirlari(g);
    nutPlanaYaz(p, kova, satirlar);
    toplam += satirlar.length;
  }
  save(); renderDiet();
  const geri = () => {
    const q = nutPlanBul(); q.meals = JSON.parse(oncesi); q.weekly = oncekiWeekly;
    save(); renderDiet();
  };
  const mesaj = toplam + ' öğün haftalık plana aktarıldı — “yedim” işaretle, günlüğe yazılsın';
  if (typeof showUndoToast === 'function') showUndoToast(mesaj, geri);
  else showToast(mesaj, 'success');
}

// ============================================================================

const NUT_AI_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/diet-plan';
const NUT_AI_REQ_MAX = 500;      // istek metni tavani (~150 token)
const NUT_AI_FLOOR = 0.85;       // hedefin bu oraninin altinda kalan gun = gizli kalori acigi
const NUT_AI_PROTEIN_MIN = 0.70; // altinda REDDETMEZ, uyarir — protein eksigi tehlikeli degil
const NUT_AI_MAX_ITEMS = 12;     // ogun basina kalem tavani (depolama sismesin)

function nutDowLabel(dow) {
  if (typeof programDayLabel === 'function') return programDayLabel(dow);
  return ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][Number(dow) % 7] || '';
}

/** AI'a gonderilecek fakt paketi — hedefler PWA'da hesaplanmis halde gider. */
function nutAiFacts() {
  const prof = nutProfile();
  if (!prof) return null;
  const n = ensureNutrition();
  const prog = (typeof data !== 'undefined' && data) ? data.program : null;
  const hedefler = nutWeek(prof, n.hedef, prog).filter(g => g.hedef).map(g => ({
    dow: g.dow, tip: g.tip, etiket: NUT_DAY_LABEL[g.tip] || '',
    kcal: g.hedef.kcal, protein: g.hedef.protein, carb: g.hedef.carb,
    fat: g.hedef.fat, bmr: g.hedef.bmr, taban: g.hedef.eaTaban, suL: g.hedef.waterL,
  }));
  if (!hedefler.length) return null;
  return {
    hedef: n.hedef,
    profil: { age: prof.age, weight: prof.weight, height: prof.height, sex: prof.sex },
    hedefler,
  };
}

/**
 * 🔒 GUVENLIK KAPISI. Donen plani hedeflerle karsilastirir.
 * Tek bir gun bile duserse `ok:false` — kismi kayit YOK, cunku "6 gunu dogru
 * 1 gunu ac birakan" bir plan tam da engellemek istedigimiz seydir.
 */
function nutAiValidate(plan, hedefler) {
  const out = { ok: false, gunler: [], red: [], uyari: [] };
  const gunler = (plan && Array.isArray(plan.gunler)) ? plan.gunler : [];
  if (!gunler.length) { out.red.push('AI okunabilir bir plan döndürmedi.'); return out; }

  const hMap = {};
  (hedefler || []).forEach(h => { if (h && isFinite(Number(h.dow))) hMap[Number(h.dow)] = h; });

  gunler.forEach(g => {
    const dow = Number(g && g.dow);
    const h = hMap[dow];
    if (!h) { out.red.push('Plan tanınmayan bir gün içeriyor.'); return; }
    const ham = Array.isArray(g.ogunler) ? g.ogunler : [];
    if (!ham.length) { out.red.push(nutDowLabel(dow) + ': hiç öğün yok.'); return; }

    let kcal = 0, protein = 0, bozuk = false;
    ham.forEach(o => {
      const k = Number(o && o.kcal), p = Number(o && o.protein);
      if (!isFinite(k) || !isFinite(p) || k < 0 || p < 0) { bozuk = true; return; }
      kcal += k; protein += p;
    });
    if (bozuk || !(kcal > 0)) { out.red.push(nutDowLabel(dow) + ': sayılar okunamadı.'); return; }
    kcal = Math.round(kcal); protein = Math.round(protein);

    // ⚠️ Iki ayri kapi. BMR tabani mutlak (bazal metabolizmanin altinda gun
    // olamaz); %15 tabani ise gizli acik yakalar — hedef 3000'ken 2400 yazmak
    // teknik olarak "az" degil, kalori acigidir.
    // ⚠️ 20 Agu 2026: kapi BMR degil ENERJI MEVCUDIYETI tabani. BMR alti
    // olmayan bir gun de EA olarak bozulma bolgesinde olabilir — antrenman
    // harcamasi dusuldukten sonra geriye kalan sey onemli. Eski hesap
    // gunde 600-1000 kcal'lik antrenman yukunu hic gormuyordu.
    const taban = h.taban || h.bmr;
    if (kcal < taban) {
      out.red.push(nutDowLabel(dow) + ': ' + kcal + ' kcal — antrenman yükü ' +
        'düşüldüğünde güvenli enerji tabanının (' + taban + ') altında.');
      return;
    }
    if (kcal < Math.round(h.kcal * NUT_AI_FLOOR)) {
      out.red.push(nutDowLabel(dow) + ': ' + kcal + ' kcal — hedef ' + h.kcal + ', bu bir kalori açığı.');
      return;
    }
    if (protein < Math.round(h.protein * NUT_AI_PROTEIN_MIN)) {
      out.uyari.push(nutDowLabel(dow) + ': protein ' + protein + 'g, hedef ' + h.protein + 'g — düşük.');
    }

    out.gunler.push({
      dow, tip: h.tip, kcal, protein,
      hedefKcal: h.kcal, hedefProtein: h.protein,
      ogunler: ham.slice(0, 8).map(o => ({
        ad: String((o && o.ad) || '').slice(0, 60),
        saat: String((o && o.saat) || '').slice(0, 6),
        kcal: Math.round(Number(o && o.kcal) || 0),
        protein: Math.round(Number(o && o.protein) || 0),
        kalemler: (Array.isArray(o && o.kalemler) ? o.kalemler : [])
          .slice(0, NUT_AI_MAX_ITEMS).map(x => String(x).slice(0, 90)),
      })),
    });
  });

  out.ok = out.gunler.length > 0 && out.red.length === 0;
  return out;
}

async function nutAiWrite() {
  const el = document.getElementById('nutAiReq');
  const istek = String((el && el.value) || '').trim().slice(0, NUT_AI_REQ_MAX);
  const facts = nutAiFacts();
  if (!facts) {
    showToast('Önce yaş, boy ve kilonu gir — plan senin verinden hesaplanır.', 'warning', 5000);
    return;
  }
  const btn = document.getElementById('nutAiBtn');
  const eski = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Yazılıyor…'; }
  try {
    const token = await getSupaToken();
    if (!token) { showToast('Giriş gerekli — Ayarlar\'dan bulut girişi yap.', 'warning'); return; }
    const r = await fetch(NUT_AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        istek, hedef: facts.hedef, profil: facts.profil, hedefler: facts.hedefler,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { showToast(j.error || ('Plan yazılamadı (' + r.status + ')'), 'error', 6000); return; }

    const v = nutAiValidate(j.plan, facts.hedefler);
    const n = ensureNutrition();
    if (!v.ok) {
      // 🔒 Reddedilen plan KAYDEDILMEZ — eskisi de silinmez, oldugu gibi kalir.
      n.aiRed = { at: Date.now(), istek, sebep: v.red.slice(0, 5) };
      save(); renderNutrition();
      showToast('Plan reddedildi: hedefin altında kalıyor. Kaydedilmedi.', 'error', 7000);
      return;
    }
    n.ai = {
      istek, at: Date.now(), hedefTipi: facts.hedef,
      gunler: v.gunler, uyari: v.uyari,
      notlar: (j.plan && Array.isArray(j.plan.notlar) ? j.plan.notlar : [])
        .slice(0, 5).map(s => String(s).slice(0, 240)),
    };
    n.aiRed = null;
    save(); renderNutrition();
    showToast('Beslenme programın yazıldı.', 'success');
  } catch (e) {
    showToast('Bağlantı hatası: ' + e.message, 'error', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = eski || 'Aidan yazsın'; }
  }
}

function nutAiClear() {
  const n = ensureNutrition();
  n.ai = null; n.aiRed = null;
  save();
  renderNutrition();
}

function nutAiHtml(n) {
  const ai = n && n.ai;
  const red = n && n.aiRed;
  const bugun = new Date().getDay();

  let h = '<div class="nut-ai">' +
    '<div class="nut-sample-head">Sana özel program' +
    (ai ? '<button class="nut-mini" onclick="nutAiPlana()">Plana aktar</button>' +
          '<button class="nut-mini" onclick="nutAiClear()">Sil</button>' : '') +
    '</div>' +
    '<textarea id="nutAiReq" class="nut-ai-req" rows="2" maxlength="' + NUT_AI_REQ_MAX + '" ' +
    'placeholder="Sevmediklerin, bütçen, okul saatlerin, yemek yapabilme durumun…">' +
    escapeHtml((ai && ai.istek) || (red && red.istek) || '') + '</textarea>' +
    '<div class="nut-ai-row">' +
    '<button id="nutAiBtn" class="nut-chip on" onclick="nutAiWrite()">' +
    (ai ? 'Yeniden yaz' : 'Aidan yazsın') + '</button>' +
    '<span class="nut-ai-hint">Kalori ve makro hedefini yukarıdaki motor hesaplar; ' +
    'AI sadece o hedefi doldurur.</span></div>';

  if (red && Array.isArray(red.sebep) && red.sebep.length) {
    h += '<div class="nut-ai-red"><b>Son plan reddedildi — kaydedilmedi.</b>' +
      red.sebep.map(s => '<div>' + escapeHtml(s) + '</div>').join('') +
      '<div class="nut-ai-sub">Hedefin altında kalan bir gün kaydedilmez. ' +
      'Bu araç kilo verme / sıklet düşürme planı üretmez.</div></div>';
  }

  if (ai && Array.isArray(ai.gunler) && ai.gunler.length) {
    h += '<div class="nut-ai-days">' + ai.gunler.map(g =>
      '<details class="nut-ai-day"' + (Number(g.dow) === bugun ? ' open' : '') + '>' +
      '<summary><span>' + escapeHtml(nutDowLabel(g.dow)) + '</span>' +
      '<b>' + g.kcal + ' kcal · ' + g.protein + 'g P</b>' +
      '<i>hedef ' + g.hedefKcal + ' · ' + g.hedefProtein + 'g</i></summary>' +
      (g.ogunler || []).map(o =>
        '<div class="nut-meal"><div class="nm-head"><span>' + escapeHtml(o.ad) +
        (o.saat ? ' · ' + escapeHtml(o.saat) : '') + '</span>' +
        '<b>' + o.kcal + ' kcal · ' + o.protein + 'g P</b></div>' +
        '<div class="nm-list">' + (o.kalemler || []).map(x =>
          '<div class="nm-item"><span>' + escapeHtml(x) + '</span></div>').join('') +
        '</div></div>').join('') +
      '</details>').join('') + '</div>';

    if (Array.isArray(ai.uyari) && ai.uyari.length) {
      h += '<div class="nut-ai-warn">' + ai.uyari.map(s =>
        '<div>' + escapeHtml(s) + '</div>').join('') + '</div>';
    }
    if (Array.isArray(ai.notlar) && ai.notlar.length) {
      h += '<div class="nut-ai-notes">' + ai.notlar.map(s =>
        '<div class="nt-row">' + escapeHtml(s) + '</div>').join('') + '</div>';
    }
    h += '<div class="nut-ai-sub">Her günü hedefinle karşılaştırıp öyle kaydettim — ' +
      'hedefin altında kalan bir plan buraya hiç düşmez.</div>';
  }

  return h + '</div>';
}

// ---------------------------------------------------------------------------
// KALAN MAKRO -> YEMEK ONERISI (9 Eyl 2026)
//
// ⚠️ NEDEN: gunluk zaten "32 g protein, 240 kcal kaldi" diye yaziyordu ama
// NE YIYECEGINI soylemiyordu. Aradaki bosluk kullanicinin ustunde kaliyor ve
// gunun sonunda kapanmiyor — motorun kendi ilkesi "asil risk AZ YEMEK" iken
// bu bosluk tam da az yemeye cikiyor.
//
// ⚠️ SINIR — ONERI, RECETE DEGIL: adaylar yalnizca kullanicinin KENDI
// kaydettigi besinler, gecmiste yedikleri ve tohum tablo. Ag cagrisi ve AI
// yok; sonuc deterministik ve aciklanabilir.
//
// ⚠️ MAKROSUZ GUN SESSIZ GECMEZ: gunun kalorisinin buyuk kismi makro
// bilgisi olmadan girilmisse P/K/Y acigi UYDURMADIR. O durumda motor
// yalniz kaloriye gore siralar ve bunu YAZAR.
// ---------------------------------------------------------------------------

// Bu esigin altinda "kapatilacak acik" yok sayilir — 80 kcal icin oneri
// gostermek gurultu.
const NUT_ONER_ESIK = 120;
// ⚠️ TEK ONERININ TAVANI. Ilk olcumde saf makro puani "3 porsiyon Adana
// kebap (1440 kcal)" ve "2 porsiyon Citir tavuk" uretti: matematik dogru,
// oneri uygulanamaz. Bir oneri TEK KALEMDIR, gunun yerine gecmez.
const NUT_ONER_MAX_KCAL = 700;
// ⚠️ GECMISTEN GELEN KALEMIN BIRIMI YOKTUR. `frequentMeals` gunlukteki
// kayitlari dondurur ve o kayitlarda birim alani YOK — varsayilan
// 'porsiyon' yazilinca ekranda "2 porsiyon Yumurta" cikiyordu, halbuki
// o kayit 320 kcal'lik bir kahvaltinin KENDISI. Boyle kalemler "2× Yumurta"
// diye gosterilir: carpan kaydin kendisine uygulanir, hayali bir porsiyona
// degil.
const NUT_ONER_KAYIT = '*';
// Buyuk birimlerde (bir tabak yemek) 2 porsiyondan fazlasi onerilmez;
// kucuk birimlerde (kasik, avuc, dilim) 3'e kadar makul. Gecmis kayit da
// buyuk sayilir — bir ogunun 3 katini onermek uygulanabilir degil.
const NUT_ONER_BUYUK_BIRIM = /porsiyon|kase|kutu|dürüm|durum|tabak|bardak|\*/i;

/** Oneri etiketi. Birimi olmayan gecmis kayit "2× Ad" diye yazilir. */
function nutOnerEtiket(o) {
  if (!o) return '';
  if (o.u === NUT_ONER_KAYIT) return (o.adet === 1 ? o.n : (o.adet + '\u00d7 ' + o.n));
  return nutPortion(o.adet, o.u) + ' ' + o.n;
}
// ⚠️ KAYNAK CARPANI. Saf makro puani her seferinde tohum tabloyu seciyordu;
// kullanicinin kendi kaydettigi "Annemin köftesi" hicbir listede
// gorunmuyordu. Halbuki onun porsiyonu ve makrosu kendi gercegine gore
// girilmis — ve zaten yiyecegi sey o. Carpanlar kucuk tutuldu: kaynak
// SIRALAMAYI etkiler, makro dogrulugunu EZMEZ.
const NUT_ONER_KAYNAK_KAT = { 'kendi besinin': 1.35, 'sık yediğin': 1.2, 'tablo': 1 };
// Makro bilgisi olan kalori orani bunun altindaysa P/K/Y hedefleri
// guvenilir degil (bkz. yukaridaki not).
const NUT_ONER_MAKRO_KAPSAM = 0.6;

/** Secili gunun yenen toplami + makro kapsami. */
function nutOnerDurum() {
  ensureDiet();
  const d = data.diet;
  const day = (typeof dietDay === 'function') ? dietDay(false) : { meals: [] };
  const meals = (day && day.meals) ? day.meals : [];
  let k = 0, p = 0, c = 0, f = 0, makroK = 0;
  for (const m of meals) {
    const mk = Number(m.kcal) || 0;
    k += mk; p += Number(m.protein) || 0; c += Number(m.carb) || 0; f += Number(m.fat) || 0;
    if (m.protein != null || m.carb != null || m.fat != null) makroK += mk;
  }
  const hedef = {
    k: Number(d.kcalGoal) || 0, p: Number(d.proteinGoal) || 0,
    c: Number(d.carbGoal) || 0, f: Number(d.fatGoal) || 0,
  };
  return {
    hedef, yenen: { k, c, p, f },
    acik: { k: hedef.k - k, p: hedef.p - p, c: hedef.c - c, f: hedef.f - f },
    kapsam: k > 0 ? makroK / k : 1,
    ogunSayisi: meals.length,
  };
}

/**
 * Aday havuzu. Sira ONEMLI: kullanicinin kendi besinleri once gelir cunku
 * porsiyon ve makro degerleri onun gercegine gore girilmis; tohum tablo
 * yalnizca yedek.
 */
function nutOnerAdaylar() {
  ensureDiet();
  const out = [], gorulen = new Set();
  const ekle = (o, kaynak) => {
    const ad = String((o && (o.n || o.name)) || '').trim();
    const k = Number(o && (o.k != null ? o.k : o.kcal));
    if (!ad || !(k > 0)) return;
    const key = ad.toLocaleLowerCase('tr');
    if (gorulen.has(key)) return;
    if (!nutIzinli(ad)) return;              // tercih filtresi burada da gecerli
    gorulen.add(key);
    out.push({
      n: ad, u: (o.u || o.unit || 'porsiyon'), k: Math.round(k),
      p: Number(o.p != null ? o.p : o.protein) || 0,
      c: Number(o.c != null ? o.c : o.carb) || 0,
      f: Number(o.f != null ? o.f : o.fat) || 0,
      kaynak,
    });
  };
  for (const cf of (data.diet.customFoods || [])) ekle(cf, 'kendi besinin');
  if (typeof frequentMeals === 'function') {
    for (const fm of frequentMeals(30)) {
      ekle({ n: fm.name, u: NUT_ONER_KAYIT, k: fm.kcal, p: fm.protein, c: fm.carb, f: fm.fat },
        'sık yediğin');
    }
  }
  if (typeof TURK_FOODS !== 'undefined') {
    for (const f of TURK_FOODS) ekle(f, 'tablo');
  }
  return out;
}

/**
 * Acik vektorunun "kotuluk" olcusu — makrolar kendi hedeflerine
 * normalize edilir, yoksa kalori her seyi ezerdi.
 * ⚠️ ASMA, EKSIK KALMAKTAN DAHA AGIR CEZALI (x1.6): hedefi 200 kcal asmak
 * geri alinamaz, 200 kcal eksik kalmak bir sonraki ogunde kapanir.
 */
function nutOnerHata(acik, hedef, makroGuvenli) {
  const t = (d, h, w) => (h > 0 ? ((d < 0 ? -d * 1.6 : d) / h) * w : 0);
  let s = t(acik.k, hedef.k, 1);
  if (makroGuvenli) {
    s += t(acik.p, hedef.p, 1.3) + t(acik.c, hedef.c, 0.6) + t(acik.f, hedef.f, 0.8);
  }
  return s;
}

/** En iyi 3 oneri. Yoksa bos dizi. */
function nutOner(limit) {
  const dur = nutOnerDurum();
  if (!(dur.hedef.k > 0) || dur.acik.k < NUT_ONER_ESIK) return [];
  const makroGuvenli = dur.kapsam >= NUT_ONER_MAKRO_KAPSAM &&
    dur.hedef.p > 0 && dur.hedef.c > 0 && dur.hedef.f > 0;
  const simdiki = nutOnerHata(dur.acik, dur.hedef, makroGuvenli);
  const puanli = [];
  for (const a of nutOnerAdaylar()) {
    const adetTavan = NUT_ONER_BUYUK_BIRIM.test(String(a.u)) ? 2 : 3;
    const kcalTavan = Math.min(NUT_ONER_MAX_KCAL, dur.hedef.k * 0.4);
    const kat = NUT_ONER_KAYNAK_KAT[a.kaynak] || 1;
    let enIyi = null;
    const denenen = [];
    for (const ham of [0.5, 1, 1.5, 2, 3]) {
      const adet = nutRound(ham, a.u);
      // nutRound 'adet' birimli besinde yuvarliyor; ayni adet iki kez
      // denenmesin diye tekrar atlanir.
      if (adet > adetTavan || denenen.indexOf(adet) >= 0) continue;
      denenen.push(adet);
      if (adet * a.k > kcalTavan) continue;
      const kalan = {
        k: dur.acik.k - adet * a.k, p: dur.acik.p - adet * a.p,
        c: dur.acik.c - adet * a.c, f: dur.acik.f - adet * a.f,
      };
      // Kalori hedefini %8'den fazla asan oneri yapilmaz.
      if (kalan.k < -dur.hedef.k * 0.08) continue;
      // ⚠️ MAKRO GUVENILIR DEGILSE PROTEIN YOGUNLUGU AYIRIR (9 Eyl 2026).
      // O durumda puan yalniz kaloriye bakiyor ve ayni kaloriyi tasiyan her
      // sey BERABERE kaliyor — olcumde ilk uce "2 porsiyon Profiterol"
      // girdi, cunku 700 kcal'i o da tasiyor. Beraberlik bozulacaksa
      // protein tasiyan lehine bozulsun: 16 yasinda, gunde 6 gun antrenman
      // yapan biri icin tek kalemlik ekin en guvenli hali budur.
      const ayirac = makroGuvenli ? 0 : (a.k > 0 ? (a.p / a.k) * 0.5 : 0);
      const puan = (simdiki - nutOnerHata(kalan, dur.hedef, makroGuvenli) + ayirac) * kat;
      if (!enIyi || puan > enIyi.puan) enIyi = { adet, puan, kalan };
    }
    if (enIyi && enIyi.puan > 0) puanli.push(Object.assign({}, a, enIyi));
  }
  puanli.sort((x, y) => y.puan - x.puan);
  // ⚠️ AYNI AILEDEN IKINCI ONERI GOSTERILMEZ: "haslanmis patates / firin
  // patates / patates puresi" ucu birden ilk uce girip listeyi ise
  // yaramaz hale getiriyordu.
  const secilen = [];
  for (const o of puanli) {
    if (secilen.some(x => nutAyniAile(x.n, o.n))) continue;
    secilen.push(o);
    if (secilen.length >= (limit || 3)) break;
  }
  return secilen;
}

/** Saate gore makul ogun — oneri hangi ogune yazilacak. */
function nutOnerSlot() {
  const s = new Date().getHours();
  if (s < 10) return 'kahvalti';
  if (s < 15) return 'ogle';
  if (s < 21) return 'aksam';
  return 'atistirma';
}

let _nutOner = [];
function nutOnerEkle(i) {
  const o = _nutOner[i];
  if (!o) return;
  const day = dietDay();
  const ad = nutOnerEtiket(o);
  day.meals.push({
    id: (typeof _mealId === 'function') ? _mealId() : Date.now(),
    slot: nutOnerSlot(), name: ad,
    kcal: Math.round(o.adet * o.k),
    protein: Math.round(o.adet * o.p),
    carb: Math.round(o.adet * o.c),
    fat: Math.round(o.adet * o.f),
    at: (typeof mealNow === 'function') ? mealNow() : '',
  });
  save();
  if (typeof renderDiet === 'function') renderDiet();
  if (typeof showToast === 'function') showToast(ad + ' eklendi', 'success');
}

function renderNutOner() {
  const el = document.getElementById('nutOnerSection');
  if (!el) return;
  // ⚠️ YALNIZ BUGUN. Gecmis bir gunu incelerken "ne yesem" sorusu
  // anlamsiz; tarih gezinmesi acikken bu karti gostermek kafa karistirir.
  if (typeof dietKey === 'function' && typeof today === 'function' && dietKey() !== today()) {
    el.innerHTML = ''; return;
  }
  const dur = nutOnerDurum();
  if (!(dur.hedef.k > 0)) { el.innerHTML = ''; return; }
  if (dur.acik.k < NUT_ONER_ESIK) {
    // Gun kapandiysa da bir sey soylemek gerekiyor — bos kart "bozuk"
    // gorunuyor, yaziyla kapanmasi daha net.
    el.innerHTML = '<div class="diet-card"><div class="diet-card-head">' +
      '<span class="diet-card-title">Ne yesem?</span></div>' +
      '<div class="nut-sub">' + (dur.acik.k < 0
        ? 'Hedefi ' + (-dur.acik.k) + ' kcal aştın — bugünlük tamam.'
        : 'Günün doldu, ' + Math.max(0, dur.acik.k) + ' kcal kaldı. Öneriye gerek yok.') +
      '</div></div>';
    return;
  }
  _nutOner = nutOner(3);
  const makroGuvenli = dur.kapsam >= NUT_ONER_MAKRO_KAPSAM &&
    dur.hedef.p > 0 && dur.hedef.c > 0 && dur.hedef.f > 0;
  const eksik = [
    dur.acik.k > 0 ? dur.acik.k + ' kcal' : null,
    (makroGuvenli && dur.acik.p > 4) ? dur.acik.p + ' g protein' : null,
    (makroGuvenli && dur.acik.c > 8) ? dur.acik.c + ' g karb' : null,
    (makroGuvenli && dur.acik.f > 4) ? dur.acik.f + ' g yağ' : null,
  ].filter(Boolean).join(' · ');
  const uyari = makroGuvenli ? '' :
    '<div class="nut-sub">Bugün yediklerinin yalnızca %' + Math.round(dur.kapsam * 100) +
    '’inde makro bilgisi var; protein/karb/yağ açığı bu yüzden güvenilir değil. ' +
    'Sıralama <b>sadece kaloriye</b> göre. Yemeği modaldeki "Ara" sekmesinden ' +
    'seçersen makrolar da gelir.</div>';
  const satirlar = _nutOner.length
    ? _nutOner.map((o, i) =>
      '<div class="dt-row"><button class="dt-row-main" onclick="nutOnerEkle(' + i + ')">' +
      '<span class="dt-row-name">' + escapeHtml(nutOnerEtiket(o)) + '</span>' +
      '<span class="dt-row-sub">' + escapeHtml(
        'P' + Math.round(o.adet * o.p) + ' · K' + Math.round(o.adet * o.c) +
        ' · Y' + Math.round(o.adet * o.f) + '  ·  ' + o.kaynak) + '</span></button>' +
      '<span class="dt-row-kcal">' + Math.round(o.adet * o.k) + '</span>' +
      '<button class="dt-row-del" onclick="nutOnerEkle(' + i + ')" aria-label="Ekle">＋</button>' +
      '</div>').join('')
    : '<div class="nut-sub">Açığı bozmadan kapatan bir şey bulamadım — kalan ' +
      'boşluk için havuzdaki her seçenek hedefi fazla aşıyor.</div>';
  el.innerHTML = '<div class="diet-card">' +
    '<div class="diet-card-head"><span class="diet-card-title">Ne yesem?</span>' +
    '<span class="diet-card-meta">' + escapeHtml(eksik) + ' kaldı</span></div>' +
    uyari + satirlar +
    '<div class="nut-sub">Dokununca <b>' + escapeHtml(nutSlotLabel(nutOnerSlot())) +
    '</b> öğününe yazılır. Sevmediklerin bu listede de elenir.</div>' +
    '</div>';
}

// ============================================================================
// DIYET KARNESI (ui.js'ten tasindi, 20 Agu 2026)
// Yalniz Diyet sekmesinden acilir; o sekme bu dosyayi zaten bekliyor.
// hcWeightTrend / hcEnergyCheck health.js'te (tembel). Diyet sekmesi ucunu de
// birlikte bekler (tasks.js), o yuzden render aninda tanimlidir; yine de
// asagidaki typeof kapisi duruyor — sozlesme degil, emniyet kemeri.
// ============================================================================
let _dietKarnePeriod = 'week'; // 'week' | 'month'
// ⚠️ core.js'teki GUN_KISA ile AYNI olmak zorunda (teste bagli). Dogrudan
// ona bagli DEGIL cunku 18-nutrition motoru core.js OLMADAN, yalitilmis bir
// vm'de yukluyor — bu dosya cekirdege bagimli hale gelirse o sozlesme kirilir.
const DKRN_WD = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function dietKarneStats(period) {
  ensureDiet();
  const days = data.diet.days || {};
  const span = period === 'month' ? 30 : 7;
  const t = today();
  const isos = [];
  for (let i = span - 1; i >= 0; i--) isos.push(shiftDateStr(t, -i));
  const goal = data.diet.kcalGoal || 2000;
  const wGoal = data.diet.waterGoalL || 2.5;
  let loggedDays = 0, kcalSum = 0, kcalDays = 0;
  let pSum = 0, cSum = 0, fSum = 0, macroDays = 0;
  let waterSum = 0, waterDays = 0, underGoal = 0, overGoal = 0;
  // ⚠️ 20 Agu 2026 — "hedefin ALTINDA kalmak" basari degil (bkz. asagidaki
  // not). Bant sayaclari: hedefin ±%10'u TUTTURMAK, %90 alti EKSIK.
  let bantta = 0, eksik = 0, fazla = 0;
  const pGoal = data.diet.proteinGoal || 0;
  let proteinDays = 0, proteinHit = 0;
  // Hangi ogun en cok atlaniyor? Kayit tutulan gunlerde bakilir — hic kayit
  // olmayan gun "ogun atlandi" demek degil, "gun loglanmadi" demektir.
  const slotMiss = { kahvalti: 0, ogle: 0, aksam: 0, atistirma: 0 };
  const daily = [];
  isos.forEach(iso => {
    const day = days[iso];
    const meals = (day && day.meals) ? day.meals : [];
    const logged = meals.length > 0;
    const kcal = meals.reduce((sm, m) => sm + (Number(m.kcal) || 0), 0);
    let p = 0, c = 0, f = 0;
    meals.forEach(m => { p += Number(m.protein) || 0; c += Number(m.carb) || 0; f += Number(m.fat) || 0; });
    const waterL = day ? (Number(day.waterL) || 0) : 0;
    if (logged) {
      loggedDays++;
      if (kcal > 0) {
        kcalSum += kcal; kcalDays++;
        if (kcal <= goal) underGoal++; else overGoal++;
        if (kcal < goal * 0.9) eksik++;
        else if (kcal > goal * 1.1) fazla++;
        else bantta++;
      }
      if (p || c || f) { pSum += p; cSum += c; fSum += f; macroDays++; }
      if (p > 0) { proteinDays++; if (pGoal && p >= pGoal * 0.9) proteinHit++; }
      const varSlot = {};
      meals.forEach(m => { varSlot[m.slot] = true; });
      Object.keys(slotMiss).forEach(k => { if (!varSlot[k]) slotMiss[k]++; });
    }
    if (waterL > 0) { waterSum += waterL; waterDays++; }
    daily.push({ iso, kcal, logged });
  });
  const weights = (data.diet.weights || []).filter(w => w.kg != null && w.date >= isos[0] && w.date <= t).sort((a, b) => a.date < b.date ? -1 : 1);
  const wFirst = weights[0] || null, wLast = weights[weights.length - 1] || null;
  const avgKcalV = kcalDays ? Math.round(kcalSum / kcalDays) : 0;
  // ⚠️ CAPRAZ OKUMA (20 Agu 2026). Karne simdiye kadar YALNIZ loga bakiyordu:
  // "ortalama 2100 kcal" diyor ama kilo haftada 0.4 kg artiyorsa o log eksik.
  // Saglik kocunun zaten kullandigi iki fonksiyon burada da calisir — ayni
  // sayidan iki farkli hikaye anlatmayalim diye YENIDEN HESAPLANMIYOR.
  let enerji = null;
  try {
    if (typeof hcWeightTrend === 'function' && typeof hcEnergyCheck === 'function') {
      const tr = hcWeightTrend(data.diet.weights || [], isos[0], t);
      if (tr && tr.slopeKgPerWeek != null && avgKcalV > 0) {
        enerji = hcEnergyCheck(avgKcalV, tr.slopeKgPerWeek, data.diet.calc);
        if (enerji) enerji.slope = Math.round(tr.slopeKgPerWeek * 100) / 100;
      }
    }
  } catch (e) { enerji = null; }
  const kacan = Object.keys(slotMiss).sort((a, b) => slotMiss[b] - slotMiss[a])[0];
  return {
    bantta, eksik, fazla, proteinDays, proteinHit, enerji,
    kacanSlot: (loggedDays >= 3 && slotMiss[kacan] >= 2) ? kacan : null,
    kacanGun: slotMiss[kacan] || 0,
    period, span, isos, daily, goal, wGoal, loggedDays,
    avgKcal: kcalDays ? Math.round(kcalSum / kcalDays) : 0, kcalDays,
    avgP: macroDays ? Math.round(pSum / macroDays) : 0,
    avgC: macroDays ? Math.round(cSum / macroDays) : 0,
    avgF: macroDays ? Math.round(fSum / macroDays) : 0,
    proteinGoal: data.diet.proteinGoal || 0, carbGoal: data.diet.carbGoal || 0, fatGoal: data.diet.fatGoal || 0,
    avgWater: waterDays ? Math.round(waterSum / waterDays * 100) / 100 : 0, waterDays,
    underGoal, overGoal, weights, weightLast: wLast,
    weightDiff: (wFirst && wLast && wFirst !== wLast) ? +(wLast.kg - wFirst.kg).toFixed(1) : (wLast ? 0 : null),
  };
}

function openDietKarne() { _dietKarnePeriod = 'week'; renderDietKarne(); document.getElementById('dietKarneModal').classList.add('active'); }
function closeDietKarne() { document.getElementById('dietKarneModal').classList.remove('active'); }
function setDietKarnePeriod(p) { _dietKarnePeriod = p; renderDietKarne(); }

function renderDietKarne() {
  const el = document.getElementById('dietKarneBody');
  if (!el) return;
  const period = _dietKarnePeriod;
  const isMonth = period === 'month';
  const s = dietKarneStats(period);
  const tabs = `
    <div class="krn-tabs">
      <button class="krn-tab ${period === 'week' ? 'active' : ''}" onclick="setDietKarnePeriod('week')">Bu hafta</button>
      <button class="krn-tab ${isMonth ? 'active' : ''}" onclick="setDietKarnePeriod('month')">Bu ay</button>
    </div>`;
  if (s.loggedDays === 0) {
    el.innerHTML = tabs + `<div class="krn-empty">${isMonth ? 'Son 30 günde' : 'Bu hafta'} henüz öğün kaydı yok. Yemek ekleyince karne dolmaya başlar.</div>`;
    return;
  }
  const maxK = Math.max(s.goal, ...s.daily.map(d => d.kcal), 1);
  const todayIso = today();
  const bars = s.daily.map(d => {
    const h = d.kcal ? Math.max(6, Math.round(d.kcal / maxK * 100)) : 2;
    const over = d.kcal > s.goal;
    const isToday = d.iso === todayIso;
    const cls = (!d.logged ? 'empty' : (over ? 'over' : '')) + (isToday ? ' today' : '');
    const wd = isMonth ? '' : DKRN_WD[new Date(d.iso + 'T12:00:00').getDay()];
    const val = (!isMonth && d.kcal) ? Math.round(d.kcal) : '';
    return `<div class="dkrn-bar-col${isMonth ? ' m' : ''}">
      ${isMonth ? '' : `<div class="krn-bar-val">${val}</div>`}
      <div class="dkrn-bar ${cls}" style="height:${h}%;" title="${d.iso}: ${Math.round(d.kcal)} kcal"></div>
      ${isMonth ? '' : `<div class="krn-bar-day ${isToday ? 'today' : ''}">${wd}</div>`}
    </div>`;
  }).join('');
  // ⚠️ ESKI "%adh hedefte" HESABI YANLIS YONDEYDI (20 Agu 2026): hedefin
  // ALTINDA kalinan gunleri basari sayiyor ve "istikrarli gidiyorsun"
  // yaziyordu. Bu uygulamanin kendi kurali bunun tersi — 16 yasinda, buyume
  // doneminde, haftada 6 gun antrenmanda asil risk AZ YEMEK. Artik basari
  // BANTTA kalmak (hedefin ±%10'u); hedefin altinda gecen gun uyaridir.
  const adh = s.kcalDays ? Math.round(s.bantta / s.kcalDays * 100) : 0;
  const proteinPct = s.proteinDays ? Math.round(s.proteinHit / s.proteinDays * 100) : 0;
  const SLOT_ADI = { kahvalti: 'kahvaltı', ogle: 'öğle', aksam: 'akşam', atistirma: 'ara öğün' };
  const macroRows = [
    ['Protein', s.avgP, s.proteinGoal, 'var(--macro-pro)'],
    ['Karbonhidrat', s.avgC, s.carbGoal, 'var(--macro-carb)'],
    ['Yağ', s.avgF, s.fatGoal, 'var(--macro-fat)'],
  ].map(row => {
    const name = row[0], val = row[1], gl = row[2], col = row[3];
    const pct = gl ? Math.min(100, Math.round(val / gl * 100)) : 0;
    return `<div class="krn-cat-row">
      <span class="krn-cat-lbl">${name}</span>
      <span class="krn-cat-track"><span class="krn-cat-fill" style="width:${pct}%; background:${col};"></span></span>
      <span class="krn-cat-num">${val}g</span>
    </div>`;
  }).join('');
  let weightBlock = '';
  if (s.weightDiff !== null && s.weightLast) {
    const dir = s.weightDiff > 0 ? 'wt-up' : (s.weightDiff < 0 ? 'wt-down' : '');
    const sign = s.weightDiff > 0 ? '+' : '';
    const spark = s.weights.length >= 2 ? sparkline(s.weights.map(w => w.kg)) : '';
    weightBlock = `<div class="krn-section-lbl">Kilo</div>
      <div class="dkrn-weight">
        <div class="dkrn-weight-spark">${spark}</div>
        <div class="dkrn-weight-meta">${s.weightLast.kg} kg <span class="${dir}">${sign}${s.weightDiff} kg</span></div>
      </div>`;
  }
  // Sira onemli: once KAYDIN GUVENILIRLIGI, sonra icerik. Eksik logdan
  // uretilen "az yiyorsun" yorumu yanlis yoldur — once log duzelir.
  let note;
  if (s.enerji && s.enerji.verdict === 'eksik-log') {
    note = `Loglanan kalori (<b>${s.avgKcal}</b>) kilo değişiminle uyuşmuyor — ` +
      `kilo haftada ${s.enerji.slope > 0 ? '+' : ''}${s.enerji.slope} kg. Bazı öğünler girilmemiş olmalı; ` +
      `ortalamaları olduğundan düşük kabul et.`;
  } else if (s.kacanSlot) {
    note = `En çok <b>${SLOT_ADI[s.kacanSlot]}</b> kaydı eksik (${s.kacanGun} gün). ` +
      `Programı plana aktarıp “yedim” işaretlemek bunu tek dokunuşa indirir.`;
  } else if (s.eksik >= Math.max(2, Math.round(s.kcalDays * 0.4))) {
    note = `<b>${s.eksik}</b> gün hedefin %10'undan fazla altında kaldın. ` +
      `Bu yaşta ve bu antrenman hacminde asıl risk az yemek — öğün atlamamaya bak.`;
  } else if (adh >= 70 && s.kcalDays >= 3) {
    note = `Kayıtlı günlerin <b>%${adh}</b>'inde hedef bandındaydın — istikrarlı gidiyorsun.`;
  } else if (s.proteinDays >= 3 && proteinPct < 50 && s.proteinGoal) {
    note = `Protein hedefini kayıtlı günlerin sadece <b>%${proteinPct}</b>'inde tutturmuşsun. ` +
      `Kaloriden önce protein — her öğüne bir kaynak koy.`;
  } else if (s.loggedDays >= (isMonth ? 20 : 5)) {
    note = `<b>${s.loggedDays}</b> gün kayıt tuttun — takip etmek işin yarısı.`;
  } else {
    note = `Her kayıt bir farkındalık. <b>${s.loggedDays}</b> gün loglamışsın, devam.`;
  }
  el.innerHTML = tabs + `
    <div class="krn-hero">
      <div class="krn-big">${s.avgKcal}</div>
      <div class="krn-big-lbl">ortalama günlük kcal<br><span class="krn-cmp-note">hedef ${s.goal} · ${s.kcalDays} gün kayıt</span></div>
    </div>
    <div class="dkrn-chart${isMonth ? ' month' : ''}">${bars}</div>
    <div class="krn-statline">
      <span class="krn-pill">${s.loggedDays} gün kayıt</span>
      ${s.kcalDays ? `<span class="krn-pill" title="hedefin ±%10 bandı">%${adh} bantta</span>` : ''}
      ${s.eksik ? `<span class="krn-pill warn">${s.eksik} gün eksik</span>` : ''}
      ${(s.proteinDays && s.proteinGoal) ? `<span class="krn-pill" title="protein hedefinin en az %90'ı">%${proteinPct} protein</span>` : ''}
      ${s.waterDays ? `<span class="krn-pill">~${fmtL(s.avgWater)} L/gün su</span>` : ''}
    </div>
    ${s.kacanSlot ? `<div class="krn-statline"><span class="krn-pill warn">en çok atlanan: ${SLOT_ADI[s.kacanSlot]} · ${s.kacanGun} gün</span></div>` : ''}
    ${s.enerji ? `<div class="krn-section-lbl">Kayıt güvenilirliği</div>
      <div class="krn-note ${s.enerji.verdict === 'tutarli' ? '' : 'warn'}">${escapeHtml(s.enerji.note)}</div>` : ''}
    ${macroRows ? `<div class="krn-section-lbl">Ortalama makro (g/gün)</div><div class="krn-cats">${macroRows}</div>` : ''}
    ${weightBlock}
    <div class="krn-note">${note}</div>
  `;
}
