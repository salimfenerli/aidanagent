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
  proteinPerMealMin: 0.25,  // g/kg — ogun basi kas protein sentezi esigi
  proteinPerMealMax: 0.40,  // ustu ayni ogunde ek fayda vermiyor
  fatMinPerKg: 0.8,         // hormonal saglik tabani — ALTINA INILMEZ
  fatPct: 0.27,             // kcal'in yuzdesi (taban kuralini gecerse o kazanir)
  gainSurplus: 350,         // yagsiz kazanim; buyuk fazla yag olarak birikir
  waterMlPerKg: 35,
  waterPerSession: 600,     // ml, antrenman basina ek
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
  'Süt':              { ca: 225, fe: 0,   d: 5,   lif: 0 },
  'Ayran':            { ca: 150, fe: 0,   d: 3,   lif: 0 },
  'Kefir':            { ca: 180, fe: 0,   d: 3,   lif: 0 },
  'Yoğurt':           { ca: 220, fe: 0.1, d: 3,   lif: 0 },
  'Süzme yoğurt':     { ca: 230, fe: 0.1, d: 3,   lif: 0 },
  'Meyveli yoğurt':   { ca: 190, fe: 0.1, d: 2,   lif: 0.5 },
  'Beyaz peynir':     { ca: 145, fe: 0.1, d: 4,   lif: 0 },
  'Kaşar peyniri':    { ca: 240, fe: 0.1, d: 6,   lif: 0 },
  'Lor peyniri':      { ca: 15,  fe: 0,   d: 0,   lif: 0 },
  'Labne':            { ca: 20,  fe: 0,   d: 1,   lif: 0 },
  'Krem peynir':      { ca: 15,  fe: 0,   d: 1,   lif: 0 },
  'Haydari':          { ca: 120, fe: 0.2, d: 2,   lif: 0.5 },
  // --- Yumurta: D vitamininin gidadaki az kaynagindan biri ---
  'Yumurta':          { ca: 25,  fe: 0.9, d: 40,  lif: 0 },
  'Haşlanmış yumurta':{ ca: 25,  fe: 0.9, d: 40,  lif: 0 },
  'Omlet':            { ca: 50,  fe: 1.8, d: 80,  lif: 0 },
  'Menemen':          { ca: 55,  fe: 2.0, d: 80,  lif: 2 },
  'Peynirli omlet':   { ca: 210, fe: 1.8, d: 85,  lif: 0 },
  'Sahanda yumurta':  { ca: 30,  fe: 1.1, d: 45,  lif: 0 },
  // --- Kirmizi et: demirin en iyi emilen formu (hem demir) ---
  'Dana kıyma':       { ca: 15,  fe: 3.4, d: 5,   lif: 0 },
  'Dana bonfile':     { ca: 12,  fe: 3.6, d: 5,   lif: 0 },
  'Kuzu pirzola':     { ca: 18,  fe: 3.0, d: 3,   lif: 0 },
  'Kavurma':          { ca: 12,  fe: 2.8, d: 3,   lif: 0 },
  'İzgara köfte':     { ca: 30,  fe: 3.2, d: 4,   lif: 0.5 },
  'Et döner':         { ca: 20,  fe: 3.5, d: 4,   lif: 0 },
  'Ciğer tava':       { ca: 10,  fe: 7.0, d: 15,  lif: 0 },
  'Adana kebap':      { ca: 25,  fe: 3.8, d: 4,   lif: 0.5 },
  'Şiş kebap':        { ca: 18,  fe: 3.4, d: 4,   lif: 0 },
  // --- Kanatli: demiri kirmizi etin yarisi kadar ---
  'Tavuk göğsü':      { ca: 15,  fe: 1.2, d: 5,   lif: 0 },
  'Tavuk but':        { ca: 15,  fe: 1.6, d: 8,   lif: 0 },
  'Tavuk şiş':        { ca: 15,  fe: 1.3, d: 5,   lif: 0 },
  // --- Yagli balik: D vitamininin gidadaki EN iyi kaynagi ---
  'Somon':            { ca: 15,  fe: 0.5, d: 750, lif: 0 },
  'Uskumru':          { ca: 20,  fe: 1.4, d: 500, lif: 0 },
  'Sardalya':         { ca: 300, fe: 2.4, d: 300, lif: 0 },
  'Hamsi tava':       { ca: 200, fe: 2.2, d: 400, lif: 0.5 },
  'Palamut':          { ca: 25,  fe: 1.6, d: 350, lif: 0 },
  'Ton balığı':       { ca: 15,  fe: 1.5, d: 250, lif: 0 },
  'Balık ızgara':     { ca: 25,  fe: 0.8, d: 200, lif: 0 },
  'Levrek':           { ca: 20,  fe: 0.5, d: 150, lif: 0 },
  // --- Baklagil: demir + lifin birlikte geldigi yer ---
  'Mercimek çorbası': { ca: 35,  fe: 2.5, d: 0,   lif: 5 },
  'Ezogelin çorbası': { ca: 35,  fe: 2.3, d: 0,   lif: 5 },
  'Nohut':            { ca: 65,  fe: 3.9, d: 0,   lif: 10 },
  'Etli nohut':       { ca: 60,  fe: 4.2, d: 2,   lif: 9 },
  'Kuru fasulye':     { ca: 90,  fe: 3.8, d: 0,   lif: 11 },
  'Etli kuru fasulye':{ ca: 85,  fe: 4.0, d: 2,   lif: 10 },
  'Mercimek yemeği':  { ca: 40,  fe: 3.5, d: 0,   lif: 8 },
  'Humus':            { ca: 50,  fe: 2.0, d: 0,   lif: 5 },
  'Piyaz':            { ca: 70,  fe: 2.4, d: 0,   lif: 7 },
  // --- Tahil ---
  'Tam buğday ekmek': { ca: 15,  fe: 0.7, d: 0,   lif: 2 },
  'Ekmek':            { ca: 10,  fe: 0.6, d: 0,   lif: 0.7 },
  'Simit':            { ca: 80,  fe: 2.2, d: 0,   lif: 3 },
  'Yulaf ezmesi':     { ca: 20,  fe: 1.8, d: 0,   lif: 4 },
  'Bulgur pilavı':    { ca: 12,  fe: 1.0, d: 0,   lif: 4.5 },
  'Sebzeli bulgur':   { ca: 20,  fe: 1.1, d: 0,   lif: 5 },
  'Pilav':            { ca: 8,   fe: 0.6, d: 0,   lif: 0.7 },
  'Makarna':          { ca: 12,  fe: 1.3, d: 0,   lif: 3 },
  'Tam buğday makarna': { ca: 20, fe: 1.5, d: 0,  lif: 6 },
  'Kinoa':            { ca: 20,  fe: 1.5, d: 0,   lif: 3 },
  'Leblebi':          { ca: 45,  fe: 1.4, d: 0,   lif: 4 },
  // --- Sebze / meyve: lif ---
  'Çoban salata':     { ca: 30,  fe: 0.8, d: 0,   lif: 2.5 },
  'Mevsim salata':    { ca: 25,  fe: 0.7, d: 0,   lif: 2 },
  'Ispanak yemeği':   { ca: 200, fe: 3.6, d: 0,   lif: 6 },
  'Fırında sebze':    { ca: 60,  fe: 1.2, d: 0,   lif: 5 },
  'Türlü':            { ca: 45,  fe: 1.0, d: 0,   lif: 4 },
  'Karnıyarık':       { ca: 45,  fe: 1.4, d: 2,   lif: 5 },
  'Domates':          { ca: 8,   fe: 0.2, d: 0,   lif: 1.5 },
  'Salatalık':        { ca: 6,   fe: 0.1, d: 0,   lif: 0.5 },
  'Haşlanmış patates':{ ca: 8,   fe: 0.5, d: 0,   lif: 2 },
  'Muz':              { ca: 8,   fe: 0.5, d: 0,   lif: 3 },
  'Elma':             { ca: 10,  fe: 0.2, d: 0,   lif: 4 },
  'Armut':            { ca: 15,  fe: 0.3, d: 0,   lif: 5 },
  'Portakal':         { ca: 50,  fe: 0.1, d: 0,   lif: 3 },
  'Kuru üzüm':        { ca: 15,  fe: 0.5, d: 0,   lif: 1 },
  'Kuru kayısı':      { ca: 5,   fe: 0.2, d: 0,   lif: 0.5 },
  // --- Kuruyemis / yag ---
  'Badem':            { ca: 33,  fe: 0.4, d: 0,   lif: 1.5 },
  'Ceviz':            { ca: 15,  fe: 0.5, d: 0,   lif: 1 },
  'Fındık':           { ca: 18,  fe: 0.7, d: 0,   lif: 1.5 },
  'Antep fıstığı':    { ca: 30,  fe: 1.1, d: 0,   lif: 2.8 },
  'Yer fıstığı':      { ca: 25,  fe: 1.3, d: 0,   lif: 2.4 },
  'Kabak çekirdeği':  { ca: 15,  fe: 4.2, d: 0,   lif: 2 },
  'Ay çekirdeği':     { ca: 20,  fe: 1.5, d: 0,   lif: 2 },
  'Tahin':            { ca: 65,  fe: 0.7, d: 0,   lif: 1.4 },
  'Fıstık ezmesi':    { ca: 8,   fe: 0.6, d: 0,   lif: 1 },
  'Zeytin':           { ca: 15,  fe: 0.6, d: 0,   lif: 0.6 },
  'Zeytinyağı':       { ca: 0,   fe: 0.1, d: 0,   lif: 0 },
  'Tereyağı':         { ca: 2,   fe: 0,   d: 5,   lif: 0 },
  'Avokado':          { ca: 15,  fe: 0.7, d: 0,   lif: 8 },
  // --- Diger ---
  'Protein tozu':     { ca: 100, fe: 0.3, d: 0,   lif: 0.5 },
  'Bal':              { ca: 1,   fe: 0.1, d: 0,   lif: 0 },
  'Sütlaç':           { ca: 150, fe: 0.2, d: 2,   lif: 0.5 },
  'Chia puding':      { ca: 180, fe: 2.0, d: 1,   lif: 8 },
  'Müsli':            { ca: 40,  fe: 2.0, d: 0,   lif: 5 },
  'Granola':          { ca: 30,  fe: 1.6, d: 0,   lif: 4 },
};

/**
 * MIKRO BESIN HEDEFLERI — erkek, 14-18 yas.
 * Neden bu dortlu: 16 yasinda, haftada 6 gun antrenman yapan bir dovus
 * sporcusunda risk sirasi bu.
 */
const NUT_MICRO = [
  {
    id: 'kalsiyum', alan: 'ca', birim: 'mg', hedefSayi: 1300, ustSinir: 2500,
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
    id: 'lif', alan: 'lif', birim: 'g', hedefSayi: 30, ustSinir: null,
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
const NUT_PAL = { rest: 1.4, strength: 1.6, fight: 1.75, both: 1.9 };

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
function nutTargets(profil, dayType, hedef) {
  const kg = Number(profil && profil.weight) || 0;
  const cm = Number(profil && profil.height) || 0;
  const age = Number(profil && profil.age) || 16;
  const sex = (profil && profil.sex) || 'male';
  if (!(kg > 0)) return null;

  const bmr = nutBMR(sex, age, kg, cm);
  const pal = NUT_PAL[dayType] || NUT_PAL.rest;
  const tdee = Math.round(bmr * pal);
  const kas = hedef === 'kas';
  let kcal = tdee + (kas ? NUT_LIMITS.gainSurplus : 0);

  // 🔒 GUVENLIK TABANI: hedef hicbir kosulda BMR'nin altina inemez.
  kcal = Math.max(kcal, bmr);

  const proteinG = Math.min(
    Math.round(kg * (kas ? NUT_LIMITS.proteinPerKgGain : NUT_LIMITS.proteinPerKg)),
    Math.round(kg * NUT_LIMITS.proteinMaxPerKg));
  // Yag: yuzde kurali ile taban kuralindan BUYUK olani kazanir.
  const fatG = Math.max(
    Math.round(kg * NUT_LIMITS.fatMinPerKg),
    Math.round(kcal * NUT_LIMITS.fatPct / 9));
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  const seans = dayType === 'both' ? 2 : (dayType === 'rest' ? 0 : 1);
  const suMl = Math.round(kg * NUT_LIMITS.waterMlPerKg + seans * NUT_LIMITS.waterPerSession);

  return {
    dayType, hedef: kas ? 'kas' : 'koru',
    bmr, pal, tdee, kcal,
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
 * Gunluk hedefi ogunlere bol.
 * ⚠️ Protein EŞIT dagitilir — toplam kadar DAGILIM da onemli. Ogun basina
 * 0.25-0.40 g/kg araligi kas protein sentezini maksimuma cikarir; gunun
 * tamamini tek ogune yigmak ayni sonucu vermez.
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
  const ogunProtein = Math.round(t.protein / sira.length);
  const idealAlt = Math.round(kg * NUT_LIMITS.proteinPerMealMin);
  const idealUst = Math.round(kg * NUT_LIMITS.proteinPerMealMax);
  return sira.map(slot => {
    const [kOran, cOran] = tablo[slot];
    const kcal = Math.round(t.kcal * kOran);
    const carb = Math.round(t.carb * cOran);
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
  kahvalti: [
    { protein: 'Yumurta', carb: 'Tam buğday ekmek', yag: 'Tahin', ek: ['Beyaz peynir', 'Zeytin', 'Domates'] },
    { protein: 'Süzme yoğurt', carb: 'Yulaf ezmesi', yag: 'Ceviz', ek: ['Muz', 'Bal'] },
  ],
  // ⚠️ Capa PROTEIN YOGUN olmali — bkz. asagidaki kefir notu. Ilk denemede
  // buraya Kefir ve Sut capa yazilmisti (6 g/bardak) ve motor 90 kg'lik
  // profilde "4 bardak sut" uretti. Ayni hata, yeni ogunde tekrar etti.
  // Sut/kefir artik EK; capa yogun olan.
  ara: [
    { protein: 'Süzme yoğurt', carb: 'Simit', yag: 'Fıstık ezmesi', ek: ['Elma'] },
    { protein: 'Protein tozu', carb: 'Leblebi', yag: 'Badem', ek: ['Süt', 'Kuru üzüm'] },
  ],
  ogle: [
    { protein: 'Tavuk göğsü', carb: 'Bulgur pilavı', yag: 'Zeytinyağı', ek: ['Çoban salata', 'Ayran'] },
    { protein: 'Ton balığı', carb: 'Makarna', yag: 'Zeytinyağı', ek: ['Çoban salata'] },
  ],
  aksam: [
    { protein: 'Dana kıyma', carb: 'Pilav', yag: 'Zeytinyağı', ek: ['Çoban salata', 'Yoğurt'] },
    { protein: 'Somon', carb: 'Haşlanmış patates', yag: 'Zeytinyağı', ek: ['Çoban salata'] },
  ],
  // ⚠️ Capa PROTEIN YOGUN olmali. Kefir (6 g/bardak) capa yapilinca motor
  // hedefi tutturmak icin "4 bardak kefir" yaziyordu — teknik olarak dogru,
  // pratikte sacma. Capa g/porsiyon degeri yuksek olandan secilir.
  atistirma: [
    { protein: 'Süzme yoğurt', carb: 'Muz', yag: 'Badem', ek: [] },
    { protein: 'Protein tozu', carb: 'Elma', yag: 'Fındık', ek: ['Süt'] },
  ],
};

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
function nutBuildMeal(slot, hedefOgun, sablonIdx) {
  const list = NUT_TEMPLATES[slot] || [];
  if (!list.length) return null;
  const t = list[(Number(sablonIdx) || 0) % list.length];
  const pf = nutFood(t.protein), cf = nutFood(t.carb);
  if (!pf || !cf) return null;

  const yf = t.yag ? nutFood(t.yag) : null;
  // ⚠️ ANA OGUN KORUMASI (18 Agu 2026). Capa sifirlanabilir kurali dogruydu
  // ama fazla genisti: ogle ve aksamda protein capasi silinince tabakta
  // "3 porsiyon pilav + salata" kaliyordu. Ana ogunde protein capasi
  // ogunun KENDISIDIR — makro matematigi tutsa bile o tabak yanlistir.
  const anaOgun = slot === 'ogle' || slot === 'aksam';

  const ekler = (t.ek || []).map(nutFood).filter(Boolean)
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
    const pTaban = pf.u === 'porsiyon' ? 0.5 : 1;
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
  const proteinTavan = kg > 0
    ? Math.max(t.protein, Math.round(kg * NUT_LIMITS.proteinMaxPerKg))
    : Math.round(t.protein * 1.25);
  for (let tur = 0; tur < 20; tur++) {
    if (toplamP() <= proteinTavan) break;
    // Capanin inebilecegi taban ogun kurulurken belirlendi (ana ogun mu,
    // ekler proteini karsiliyor mu). Denge adimi bunu EZEMEZ.
    const dip = (m) => (m.dipP == null ? 0 : m.dipP);
    const aday = meals.slice().sort((a, b) => b.protein - a.protein)
      .find(m => { const c = capa(m, 'p'); return c && c.adet > dip(m); });
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
      if (toplamP() <= proteinTavan) break;
      let hedefOgun = null, hedefEk = null;
      for (const m of meals.slice().sort((a, b) => b.protein - a.protein)) {
        const proteinliler = (m.items || []).filter(x => x.adet > 0 && x.p >= 4);
        if (proteinliler.length <= 1) continue;           // son kaynak kalsin
        const ek = proteinliler.filter(x => x.rol === 'ek').sort((a, b) => b.p - a.p)[0];
        if (ek) { hedefOgun = m; hedefEk = ek; break; }
      }
      if (hedefEk) {
        hedefEk.adet = 0;
        hedefOgun.items = hedefOgun.items.filter(x => x.adet > 0);
        yenile(hedefOgun);
        continue;
      }
      // ⚠️ EKLER BITTIYSE ANA OLMAYAN OGUNUN CAPASINI KUCULT (18 Agu 2026).
      // `dipP` bir vekildi; ASIL kural "ogunde protein kalsin". Hafif
      // profilde (45 kg) 5 ogunun her birine tam capa koymak tavani
      // yapisal olarak asiyor. Gercek sinir: ogun 8 g proteinin altina
      // DUSMESIN. Ana ogun capasi bu adimda da korunur.
      let kucultuldu = false;
      for (const m of meals.slice().sort((a, b) => b.protein - a.protein)) {
        if (m.ana) continue;
        const c = capa(m, 'p');
        if (!c || c.adet <= 0) continue;
        const adim = adimi(c.u);
        const yeni = c.adet - adim <= 0 ? 0 : nutRound(c.adet - adim, c.u);
        if (m.protein - (c.adet - yeni) * c.p < 8) continue;   // ogun proteinsiz kalmasin
        c.adet = yeni;
        m.items = m.items.filter(x => x.adet > 0);
        yenile(m); kucultuldu = true; break;
      }
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
  const TAVAN = { c: 3, y: 3 };
  for (let tur = 0; tur < 40; tur++) {
    const acik = t.kcal - toplamK();
    if (acik <= t.kcal * 0.05) break;
    // Hedefinin en gerisinde kalan ogunu doldur — "en dusuk kalorili" degil.
    const sirali = meals.slice().sort((a, b) =>
      ((a.kcal - ((a.hedef && a.hedef.kcal) || a.kcal)) - (b.kcal - ((b.hedef && b.hedef.kcal) || b.kcal))));
    const yagDolu = meals.reduce((a, m) => a + m.fat, 0) >= t.fat;
    let yapildi = false;
    for (const m of sirali) {
      // Yag kaldiraci yalniz gun yag hedefi ALTINDAYKEN kullanilir; yoksa
      // acigi yagla kapatmak makro dengesini bozar (karbonhidrat eksik kalir).
      for (const rol of (yagDolu ? ['c'] : ['c', 'y'])) {
        const c = capa(m, rol);
        if (!c || c.adet >= TAVAN[rol]) continue;
        // ⚠️ DOLDURMA PROTEIN TAVANINI ASAMAZ (18 Agu 2026). Turk karbonhidrat
        // kaynaklari protein tasir (bulgur 5 g, pilav 4 g/porsiyon); kalori
        // acigini karbonhidratla kapatirken protein geri sisiyordu ve
        // kirpma adiminin isini bozuyordu. Asacaksa yag kaldiracina gec.
        if (toplamP() + adimi(c.u) * c.p > proteinTavan) continue;
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
    for (const rol of ['c', 'y']) {
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
  for (let tur = 0; tur < 40; tur++) {
    const tavan = t.kcal * 1.05;
    const geri = meals.filter(m => m.hedef && m.kcal < m.hedef.kcal * 0.8)
      .sort((a, b) => (a.kcal / a.hedef.kcal) - (b.kcal / b.hedef.kcal))[0];
    if (!geri) break;
    const yagDolu2 = meals.reduce((a, m) => a + m.fat, 0) >= t.fat;
    let yapildi = false;
    for (const rol of (yagDolu2 ? ['c'] : ['c', 'y'])) {
      const c = capa(geri, rol);
      if (!c || c.adet >= TAVAN[rol]) continue;
      const artis = adimi(c.u) * c.k;
      if (toplamK() + artis > tavan) continue;
      if (toplamP() + adimi(c.u) * c.p > proteinTavan) continue;
      c.adet = nutRound(c.adet + adimi(c.u), c.u);
      yenile(geri); yapildi = true; break;
    }
    if (!yapildi) break;
  }
  // ⚠️ DORDUNCU ADIM: YAG TAMAMLAMA (18 Agu 2026).
  // Kalori bandi tutunca dongu duruyor, ama protein kirpma adimi protein
  // tasiyan ekleri (ayran, yogurt) cikarirken YAGI da goturuyor. Yag hormonal
  // saglik tabaniyla korunan tek makro — "kalan" muamelesi gormemeli.
  for (let tur = 0; tur < 12; tur++) {
    const yagT = meals.reduce((a, m) => a + m.fat, 0);
    if (yagT >= t.fat * 0.9) break;
    // ⚠️ Tavan kontrolu EKLEMEDEN SONRAKI degere gore. Eskiden ekleme
    // oncesi bakiliyordu ve son adim tavani asabiliyordu: 1 kasik
    // zeytinyagi 119 kcal, gunu tek basina %5'ten cikariyordu.
    const aday = meals.slice()
      .sort((a, b) => a.fat - b.fat)
      .find(m => {
        const c = capa(m, 'y');
        return c && c.adet < TAVAN.y && (toplamK() + adimi(c.u) * c.k) <= t.kcal * 1.05;
      });
    if (!aday) break;
    const c = capa(aday, 'y');
    c.adet = nutRound(c.adet + adimi(c.u), c.u);
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
  for (let tur = 0; tur < 16; tur++) {
    if (toplamK() >= t.kcal * 0.95) break;
    let yapildi = false;
    for (const rol of ['y', 'c']) {
      const aday = meals.slice().sort((a, b) => (a[rol === 'y' ? 'fat' : 'carb'] - b[rol === 'y' ? 'fat' : 'carb']))
        .find(m => {
          const c = capa(m, rol);
          if (!c || c.adet >= 4) return false;
          return toplamP() + adimi(c.u) * c.p <= proteinTavan;
        });
      if (!aday) continue;
      const c = capa(aday, rol);
      c.adet = nutRound(c.adet + adimi(c.u), c.u);
      yenile(aday); yapildi = true; break;
    }
    if (!yapildi) break;
  }
  // Tum doldurma adimlarindan sonra son bir fazla kontrolu.
  fazlayiKirp();
  // Kullanilmayan yag capasini (adet 0) listeden cikar
  for (const m of meals) m.items = (m.items || []).filter(x => x.adet > 0);
  return meals;
}

function nutBuildDay(t, kg, sablonIdx) {
  const ogunler = nutMealSplit(t, kg);
  const meals = ogunler.map(o => {
    const m = nutBuildMeal(o.slot, o, sablonIdx);
    if (m) { m.zaman = o.zaman || null; m.hedef = { kcal: o.kcal, protein: o.protein, carb: o.carb, fat: o.fat }; }
    return m;
  }).filter(Boolean);
  return nutBalanceDay(meals, t, kg);
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
    yagTabanAltinda: kg > 0 && gercek.fat < kg * NUT_LIMITS.fatMinPerKg,
  };
}

/** Haftanin 7 gunu icin hedef ozeti — gun tipleri programdan gelir. */
function nutWeek(profil, hedef, program) {
  const out = [];
  for (let dow = 1; dow <= 7; dow++) {
    const d = dow % 7;   // 1..6, sonra 0 (Pazar)
    const tip = nutDayType(d, program);
    out.push({ dow: d, tip, hedef: nutTargets(profil, tip, hedef) });
  }
  return out;
}

// ---------------------------------------------------------------------------
function ensureNutrition() {
  ensureDiet();
  if (!data.diet.nut || typeof data.diet.nut !== 'object') {
    data.diet.nut = { hedef: 'koru', sablon: 0, kurulduAt: null };
  }
  return data.diet.nut;
}

function nutProfile() {
  ensureDiet();
  const c = data.diet.calc;
  if (!c || !(c.weight > 0)) return null;
  return { sex: c.sex || 'male', age: Number(c.age) || 16, height: Number(c.height) || 0, weight: Number(c.weight) || 0 };
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

function renderNutrition() {
  const el = document.getElementById('nutSection');
  if (!el) return;
  const n = ensureNutrition();
  const prof = nutProfile();

  if (!prof) {
    el.innerHTML = '<div class="nut-wrap nut-empty">' +
      '<div class="nut-head"><h3>Beslenme planı</h3></div>' +
      '<p class="nut-lead">Önce aşağıdaki hesaplayıcıya yaş, boy ve kilonu gir — ' +
      'plan senin verinden hesaplanır, tahmin edilmez.</p></div>';
    return;
  }

  const bugun = new Date().getDay();
  const tip = nutDayType(bugun, data.program);
  const t = nutTargets(prof, tip, n.hedef);
  if (!t) { el.innerHTML = ''; return; }

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
    escapeHtml((typeof programDayLabel === 'function' ? programDayLabel(g.dow) : String(g.dow)).slice(0, 3)) +
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

    '<div class="nut-week">' + hafta + '</div>' +

    nutAiHtml(n) +

    '<details class="nut-timing"><summary>Karbonhidrat zamanlaması</summary>' +
    nutCarbTiming(tip).map(x => '<div class="nt-row">' + escapeHtml(x) + '</div>').join('') +
    '</details>' +

    '<div class="nut-sample-head">Örnek gün · ' + ogunler.length + ' öğün ' +
    '<button class="nut-mini" onclick="nutNextTemplate()">Başka öner</button></div>' +
    '<div class="nut-meals">' + ogunHtml + '</div>' +
    // ⚠️ SAPMA GIZLENMEZ: sablon tabanli bir plan hedefi tam tutturamaz.
    // Tutturdugunu soylemek yerine ne cikardigini yazmak dogru olan.
    '<div class="nut-sub">Örnek toplam: <b>' + gercek.kcal + ' kcal</b> (%' +
    (ozet.sapma.kcal >= 0 ? '+' : '') + ozet.sapma.kcal + ') · ' +
    gercek.protein + 'g P (' + ozet.proteinPerKg + ' g/kg) · ' +
    gercek.carb + 'g K · ' + gercek.fat + 'g Y. ' +
    'Bu bir şablon — sevmediğini benzer makrolu başka yiyecekle değiştir.</div>' +
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
    fat: g.hedef.fat, bmr: g.hedef.bmr, suL: g.hedef.waterL,
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
    if (kcal < h.bmr) {
      out.red.push(nutDowLabel(dow) + ': ' + kcal + ' kcal — bazal metabolizmanın (' + h.bmr + ') altında.');
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
    (ai ? '<button class="nut-mini" onclick="nutAiClear()">Sil</button>' : '') +
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
