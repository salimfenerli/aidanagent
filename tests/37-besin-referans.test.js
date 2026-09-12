/**
 * 37 — BESIN VERITABANI REFERANS KAPISI (12 Eyl 2026)
 *
 * NEDEN BU DOSYA VAR: 22-gram besin tablosunun KENDI ICINDE tutarli olmasini
 * olcuyor (Atwater, makro toplami, kcal/g deseninin turetilmemis olmasi).
 * Tutarli bir tablo YANLIS da olabilir: 10 Eyl'de (v7-184) tum tablo dogrulanmis
 * per-100g referanslarla yeniden uretildi, testler yesildi — ama mikro besin
 * tablosu PORSIYON BASINA tutuldugu icin gramlar degisince bazi kayitlar
 * eski grama gore olceklenmis kaldi. Ornek: ceviz porsiyonu 2 yarim (5 g) iken
 * kalsiyumu 9 mg yaziyordu; bu 180 mg/100 g demek, gercek deger 98.
 * Porsiyon bazli "makul aralik" kapisi bunu GORMEZ (9 mg kucuk bir sayidir).
 *
 * BU DOSYANIN OLCTUGU SEY FARKLI BIR EKSEN: degerler DIS REFERANSLA tutuyor mu.
 * Asagidaki tablo USDA FoodData Central / myfooddata / TurKomp degerleridir ve
 * her satir PER 100 G'dir — yani tablodaki `g` alani yanlissa da, makro yanlissa
 * da, mikro eski grama gore olceklenmis kaldiysa da kirmizi olur.
 *
 * TOLERANS NEDEN GENIS: ayni besinin cesidi, pisirme kaybi ve marka farki
 * gercek bir yayilim uretir. Amac "tam tutsun" degil, OLCEK HATASINI yakalamak:
 * 2 kat sapma hatadir, %15 sapma degildir.
 *
 * YENI BESIN EKLERKEN: referansi olan jenerik besinleri (et, balik, sut urunu,
 * tahil, meyve, sebze, kuruyemis, zenginlestirilmis bitki sutu) buraya da ekle.
 * Kompozit Turk yemekleri (kebap, guvec, dolma) BILINCLI OLARAK DISARIDA:
 * per-100g degerleri tarif bagimlidir, referans veri tabanlarinda yoktur.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load');

const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js'] });
after(() => { try { A.close(); } catch (_) {} });

const J = (kod) => JSON.parse(A.evalIn('JSON.stringify(' + kod + ')'));

// [kcal, protein g, karbonhidrat g, yag g, Ca mg, Fe mg, D IU, lif g] — PER 100 G
const REF = {
  'Yumurta':                            [143, 12.6, 0.7, 9.5, 56, 1.75, 87, 0],
  'Yumurta akı':                            [52, 10.9, 0.7, 0.2, 7, 0.08, 0, 0],
  'Yumurta sarısı':                            [322, 15.9, 3.6, 26.5, 129, 2.73, 218, 0],
  'Süt':                            [61, 3.2, 4.8, 3.25, 113, 0.03, 2, 0],
  'Süt (yağsız)':                            [34, 3.4, 5, 0.1, 122, 0.03, 2, 0],
  'Süt (yarım yağlı)':                            [50, 3.3, 4.8, 1.8, 120, 0.03, 2, 0],
  'Yoğurt':                            [61, 3.5, 4.7, 3.25, 121, 0.05, 0, 0],
  'Yoğurt (yağsız)':                            [56, 5.7, 7.7, 0.2, 170, 0.07, 0, 0],
  'Yunan yoğurdu (yağsız)':                            [59, 10.3, 3.6, 0.39, 110, 0.07, 0, 0],
  'Süzme yoğurt':                            [97, 9, 3.98, 5, 100, 0.04, 0, 0],
  'Ayran':                            [38, 1.9, 2.9, 2, 100, 0.03, 0, 0],
  'Kefir':                            [55, 3.3, 4.5, 2.5, 120, 0.04, 0, 0],
  'Cottage peyniri':                            [98, 11.1, 3.4, 4.3, 83, 0.07, 0, 0],
  'Beyaz peynir':                            [270, 17.7, 1.5, 22.1, 490, 0.2, 13, 0],
  'Kaşar peyniri':                            [360, 25.5, 2, 27, 720, 0.2, 20, 0],
  'Lor peyniri':                            [100, 13, 3.5, 4, 130, 0.15, 0, 0],
  'Krem peynir':                            [350, 6.2, 5.5, 34, 98, 0.11, 0, 0],
  'Tereyağı':                            [717, 0.85, 0.06, 81, 24, 0.02, 60, 0],
  'Zeytinyağı':                            [884, 0, 0, 100, 1, 0.56, 0, 0],
  'Zeytin':                            [115, 0.84, 6.3, 10.7, 88, 3.3, 0, 3.2],
  'Tahin':                            [595, 17, 21.2, 53.8, 426, 4.26, 0, 9.3],
  'Fıstık ezmesi':                            [588, 25, 20, 50, 43, 1.9, 0, 6],
  'Bal':                            [304, 0.3, 82.4, 0, 6, 0.42, 0, 0.2],
  'Ekmek':                            [265, 9, 49, 3.2, 40, 2.7, 0, 2.7],
  'Tam buğday ekmek':                            [252, 12.3, 43.1, 3.5, 50, 2.5, 0, 6.8],
  'Kepekli ekmek':                            [250, 10, 44, 3, 50, 2.5, 0, 6],
  'Çavdar ekmeği':                            [259, 8.5, 48.3, 3.3, 73, 2.83, 0, 5.8],
  'Simit':                            [320, 10, 58, 5, 80, 2.3, 0, 3],
  'Mısır gevreği':                            [378, 7.5, 84, 1, 8, 8, 0, 3.3],
  'Müsli':                            [380, 10, 66, 8, 34, 2, 0, 7],
  'Granola':                            [471, 10, 64, 20, 51, 2.7, 0, 7],
  'Yulaf ezmesi':                            [71, 2.5, 12, 1.5, 9, 0.9, 0, 1.7],
  'Yulaf kepeği':                            [246, 17.3, 66.2, 7, 58, 5.4, 0, 15.4],
  'Keten tohumu':                            [534, 18.3, 28.9, 42.2, 255, 5.73, 0, 27.3],
  'Chia tohumu':                            [486, 16.5, 42.1, 30.7, 631, 7.72, 0, 34.4],
  'Şekersiz kakao':                            [228, 19.6, 57.9, 13.7, 128, 13.9, 0, 37],
  'Pilav':                            [170, 3.2, 32, 3, 6, 0.5, 0, 0.5],
  'Pirinç':                            [130, 2.7, 28, 0.3, 10, 0.2, 0, 0.4],
  'Pirinç (çiğ)':                            [365, 7.1, 80, 0.66, 28, 0.8, 0, 1.3],
  'Esmer pirinç':                            [112, 2.6, 23.5, 0.9, 10, 0.4, 0, 1.6],
  'Bulgur pilavı':                            [133, 3.8, 24, 2.5, 10, 0.96, 0, 4.5],
  'Makarna':                            [158, 5.8, 30.9, 0.9, 7, 0.5, 0, 1.8],
  'Tam buğday makarna':                            [124, 5.3, 26.5, 0.5, 15, 1.1, 0, 4.5],
  'Kinoa':                            [120, 4.4, 21.3, 1.9, 17, 1.49, 0, 2.8],
  'Kuskus':                            [112, 3.8, 23.2, 0.2, 8, 0.38, 0, 1.4],
  'Nohut (haşlanmış)':                            [164, 8.9, 27.4, 2.6, 49, 2.89, 0, 7.6],
  'Mercimek yemeği':                            [115, 6, 17, 2, 19, 1.9, 0, 4.5],
  'Leblebi':                            [364, 20.5, 61, 6, 139, 4.3, 0, 10.8],
  'Humus':                            [166, 7.9, 14.3, 9.6, 38, 2.44, 0, 6],
  'Domates':                            [18, 0.9, 3.9, 0.2, 10, 0.27, 0, 1.2],
  'Salatalık':                            [16, 0.65, 3.6, 0.11, 16, 0.28, 0, 0.5],
  'Brokoli':                            [35, 2.4, 7.2, 0.4, 47, 0.73, 0, 3.3],
  'Karnabahar':                            [25, 1.9, 5, 0.3, 22, 0.42, 0, 2],
  'Ispanak yemeği':                            [60, 3, 5.5, 3, 99, 2.2, 0, 2.2],
  'Haşlanmış patates':                            [87, 1.9, 20.1, 0.1, 8, 0.31, 0, 1.8],
  'Fırın patates':                            [93, 2.5, 21.2, 0.1, 10, 1.08, 0, 2.2],
  'Tatlı patates':                            [90, 2, 20.7, 0.15, 38, 0.69, 0, 3.3],
  'Avokado':                            [160, 2, 8.5, 14.7, 12, 0.55, 0, 6.7],
  'Muz':                            [89, 1.1, 22.8, 0.33, 5, 0.26, 0, 2.6],
  'Elma':                            [52, 0.26, 13.8, 0.17, 6, 0.12, 0, 2.4],
  'Armut':                            [57, 0.36, 15.2, 0.14, 9, 0.18, 0, 3.1],
  'Portakal':                            [47, 0.94, 11.8, 0.12, 40, 0.1, 0, 2.4],
  'Mandalina':                            [53, 0.81, 13.3, 0.31, 37, 0.15, 0, 1.8],
  'Üzüm':                            [69, 0.72, 18.1, 0.16, 10, 0.36, 0, 0.9],
  'Çilek':                            [32, 0.67, 7.7, 0.3, 16, 0.41, 0, 2],
  'Karpuz':                            [30, 0.61, 7.6, 0.15, 7, 0.24, 0, 0.4],
  'Kiraz':                            [63, 1.06, 16, 0.2, 13, 0.36, 0, 2.1],
  'Şeftali':                            [39, 0.91, 9.5, 0.25, 6, 0.25, 0, 1.5],
  'Kayısı':                            [48, 1.4, 11.1, 0.39, 13, 0.39, 0, 2],
  'İncir':                            [74, 0.75, 19.2, 0.3, 35, 0.37, 0, 2.9],
  'Nar':                            [83, 1.67, 18.7, 1.17, 10, 0.3, 0, 4],
  'Kivi':                            [61, 1.14, 14.7, 0.52, 34, 0.31, 0, 3],
  'Limon':                            [29, 1.1, 9.3, 0.3, 26, 0.6, 0, 2.8],
  'Greyfurt':                            [42, 0.77, 10.7, 0.14, 22, 0.08, 0, 1.6],
  'Ananas':                            [50, 0.54, 13.1, 0.12, 13, 0.29, 0, 1.4],
  'Mango':                            [60, 0.82, 15, 0.38, 11, 0.16, 0, 1.6],
  'Böğürtlen':                            [43, 1.39, 9.6, 0.49, 29, 0.62, 0, 5.3],
  'Yaban mersini':                            [57, 0.74, 14.5, 0.33, 6, 0.28, 0, 2.4],
  'Ahududu':                            [52, 1.2, 11.9, 0.65, 25, 0.69, 0, 6.5],
  'Vişne':                            [50, 1, 12.2, 0.3, 16, 0.32, 0, 1.6],
  'Erik':                            [46, 0.7, 11.4, 0.28, 6, 0.17, 0, 1.4],
  'Dut':                            [43, 1.44, 9.8, 0.39, 39, 1.85, 0, 1.7],
  'Trabzon hurması':                            [70, 0.58, 18.6, 0.19, 8, 0.15, 0, 3.6],
  'Ayva':                            [57, 0.4, 15.3, 0.1, 11, 0.7, 0, 1.9],
  'Kuru üzüm':                            [299, 3.07, 79.2, 0.46, 50, 1.88, 0, 3.7],
  'Kuru kayısı':                            [241, 3.4, 62.6, 0.51, 55, 2.66, 0, 7.3],
  'Kuru incir':                            [249, 3.3, 63.9, 0.93, 162, 2.03, 0, 9.8],
  'Kuru erik':                            [240, 2.18, 63.9, 0.38, 43, 0.93, 0, 7.1],
  'Hurma':                            [277, 1.81, 75, 0.15, 39, 1.02, 0, 6.7],
  'Fındık':                            [628, 14.95, 16.7, 60.75, 114, 4.7, 0, 9.7],
  'Badem':                            [579, 21.15, 21.55, 49.93, 269, 3.71, 0, 12.5],
  'Ceviz':                            [654, 15.23, 13.71, 65.21, 98, 2.91, 0, 6.7],
  'Antep fıstığı':                            [560, 20.2, 27.2, 45.3, 105, 3.92, 0, 10.6],
  'Yer fıstığı':                            [567, 25.8, 16.1, 49.2, 92, 4.58, 0, 8.5],
  'Kaju':                            [553, 18.2, 30.2, 43.9, 37, 6.68, 0, 3.3],
  'Ay çekirdeği':                            [584, 20.8, 20, 51.5, 78, 5.25, 0, 8.6],
  'Kabak çekirdeği':                            [559, 30.2, 10.7, 49.1, 46, 8.82, 0, 6],
  'Kestane':                            [245, 3.2, 53, 2.2, 29, 0.91, 0, 5.1],
  'Tavuk göğsü':                            [165, 31, 0, 3.6, 15, 1.04, 4, 0],
  'Tavuk but':                            [209, 26, 0, 10.9, 12, 1.26, 5, 0],
  'Hindi eti':                            [135, 30, 0, 0.7, 19, 1.4, 3, 0],
  'Dana bonfile':                            [212, 30, 0, 9.8, 9, 2.6, 3, 0],
  'Dana kıyma':                            [250, 26, 0, 15, 18, 2.5, 3, 0],
  'Kuzu pirzola':                            [294, 25, 0, 21, 16, 1.8, 2, 0],
  'Somon':                            [206, 22.1, 0, 12.4, 15, 0.34, 526, 0],
  'Levrek':                            [124, 23.6, 0, 2.6, 15, 0.4, 150, 0],
  'Uskumru':                            [262, 23.9, 0, 17.8, 15, 1.57, 360, 0],
  'Sardalya':                            [208, 24.6, 0, 11.5, 382, 2.92, 200, 0],
  'Alabalık':                            [148, 20.8, 0, 6.6, 43, 0.36, 635, 0],
  'Karides':                            [99, 24, 0.2, 0.3, 70, 0.51, 4, 0],
  'Ton balığı (suda)':                            [116, 25.5, 0, 0.8, 10, 1.02, 154, 0],
  'Ton balığı (yağda)':                            [186, 26.5, 0, 8.2, 12, 1.31, 269, 0],
  'Somon füme':                            [117, 18.3, 0, 4.3, 11, 0.85, 685, 0],
  'Tavuk ciğeri':                            [167, 24.5, 0.9, 6.5, 11, 11.6, 0, 0],
  'Pastırma':                            [240, 40, 2, 8, 11, 3.2, 0, 0],
  'Hellim':                            [321, 22, 2.2, 25, 700, 0.4, 0, 0],
  'Protein tozu':                            [390, 78, 8, 5, 320, 1, 0, 1.7],
  'Whey protein (izolat)':                            [373, 86.7, 3.3, 3.3, 200, 0.7, 0, 0],
  'Kazein tozu':                            [367, 80, 10, 3.3, 500, 0.7, 0, 0],
  'Bitter çikolata (%85)':                            [598, 10.9, 29.2, 50, 73, 11.9, 0, 10.9],
  'Çikolata':                            [535, 7.65, 59.4, 29.7, 189, 2.35, 0, 3.4],
  'Şeker':                            [400, 0, 100, 0, 1, 0.05, 0, 0],
  'Ketçap':                            [101, 1.04, 25.8, 0.1, 15, 0.35, 0, 0.3],
  'Hardal':                            [66, 3.74, 5.83, 3.34, 58, 1.51, 0, 3.3],
  'Kola':                            [42, 0, 10.6, 0, 2, 0.11, 0, 0],
  'Bira':                            [43, 0.46, 3.55, 0, 4, 0.01, 0, 0],
  'Şarap':                            [83, 0.07, 2.6, 0, 8, 0.27, 0, 0],
  'Patlamış mısır':                            [387, 12.9, 77.9, 4.5, 7, 3.19, 0, 14.5],
  'Kruvasan':                            [406, 8.2, 45.8, 21, 37, 2.03, 0, 2.6],
  'Pita ekmeği':                            [275, 9.1, 55.7, 1.2, 86, 2.44, 0, 2.2],
  'Baget ekmek':                            [274, 8.8, 51.9, 2.3, 45, 3, 0, 2.3],
  'Badem sütü (şekersiz)':                            [15, 0.56, 0.3, 1.1, 120, 0.15, 30, 0.3],
  'Yulaf sütü':                            [45, 1, 7, 1.5, 120, 0.2, 30, 0.8],
  'Soya sütü (şekersiz)':                            [33, 3.5, 1.5, 1.5, 120, 0.6, 30, 0.5],
};

// Alan bazli tolerans. Mikrolarda daha genis: cesit/marka yayilimi gercek.
const ALAN = [
  { ad: 'kcal',    tol: 15, min: 15 },
  { ad: 'protein', tol: 20, min: 1.5 },
  { ad: 'karb',    tol: 20, min: 1.5 },
  { ad: 'yag',     tol: 20, min: 1.5 },
  { ad: 'Ca',      tol: 40, min: 20 },
  { ad: 'Fe',      tol: 45, min: 1.0 },
  { ad: 'D',       tol: 50, min: 30 },
  { ad: 'lif',     tol: 45, min: 1.5 },
];

describe('Besin veritabani — dis referansla dogrulama', () => {
  const foods = J('TURK_FOODS');
  const micro = J('NUT_MICRO_DATA');
  const bul = (n) => foods.find((f) => f.n === n);

  test('referans listesindeki her besin tabloda var', () => {
    const eksik = Object.keys(REF).filter((n) => !bul(n));
    assert.deepStrictEqual(eksik, [], 'referansi olup tabloda olmayan: ' + eksik.join(', '));
  });

  test('makro degerleri referansla tutuyor (per 100 g)', () => {
    const kotu = [];
    for (const [n, r] of Object.entries(REF)) {
      const f = bul(n); if (!f) continue;
      for (let i = 0; i < 4; i++) {
        const olcum = [f.k, f.p, f.c, f.f][i] / f.g * 100;
        const hedef = r[i];
        const a = ALAN[i];
        if (olcum < a.min && hedef < a.min) continue;
        const sapma = (olcum - hedef) / (hedef || 0.01) * 100;
        if (Math.abs(sapma) > a.tol) {
          kotu.push(n + ' ' + a.ad + ': ' + olcum.toFixed(1) + ' vs referans ' + hedef
            + ' (' + (sapma > 0 ? '+' : '') + sapma.toFixed(0) + '%)');
        }
      }
    }
    assert.deepStrictEqual(kotu, []);
  });

  /**
   * ⚠️ BU TEST 10 EYL'DEKI OLCEK KALINTISINI YAKALAYAN TESTTIR.
   * NUT_MICRO_DATA porsiyon basina tutulur; `g` degisip mikro deger
   * olceklenmeden kalirsa buradan kirmizi doner.
   */
  test('mikro degerleri referansla tutuyor (porsiyon -> per 100 g)', () => {
    const kotu = [];
    for (const [n, r] of Object.entries(REF)) {
      const f = bul(n); const m = micro[n];
      if (!f || !m) continue;
      const olculen = [m.ca, m.fe, m.d, m.lif];
      for (let i = 0; i < 4; i++) {
        const olcum = olculen[i] / f.g * 100;
        const hedef = r[i + 4];
        const a = ALAN[i + 4];
        if (olcum < a.min && hedef < a.min) continue;
        const sapma = (olcum - hedef) / (hedef || 0.01) * 100;
        if (Math.abs(sapma) > a.tol) {
          kotu.push(n + ' ' + a.ad + ': ' + olcum.toFixed(1) + '/100g vs referans ' + hedef
            + ' (' + (sapma > 0 ? '+' : '') + sapma.toFixed(0) + '%)');
        }
      }
    }
    assert.deepStrictEqual(kotu, []);
  });

  /**
   * Birebir kopya satir: 'Kakaolu findik kremasi' 10 Eyl'de 'Findik kremasi'
   * ile ayni g/k/p/c/f ile duruyordu — arama iki ayni sonuc veriyordu.
   * Es anlamli ad ALIAS olur, yeni satir olmaz.
   */
  test('birebir ayni makroya sahip iki besin satiri yok', () => {
    const gorulen = new Map();
    const ciftler = [];
    // Kalorisiz icecekler (cay/soda/light gazoz) kacinilmaz olarak ayni sayilari
    // tasir; kapi kalorili besinler icin anlamli.
    for (const f of foods.filter((x) => x.k >= 20)) {
      const imza = [f.u, f.g, f.k, f.p, f.c, f.f].join('|');
      if (gorulen.has(imza)) ciftler.push(gorulen.get(imza) + ' = ' + f.n);
      else gorulen.set(imza, f.n);
    }
    // Bilincli ikizler: ayni besinin pisirme/adlandirma varyanti ya da
    // besin degeri gercekten ayirt edilemeyen cesitleri (pirinc aileleri).
    const muaf = new Set([
      'Yumurta = Haşlanmış yumurta',
      'Tavuk göğsü = Tavuk haşlama',
      'Hoşaf = Komposto',
      'Baldo pirinç = Osmancık pirinç',
      'Yasemin pirinç = Arborio pirinç',
      'Pirinç = Baldo pirinç',
      'Pirinç = Osmancık pirinç',
      'Esmer pirinç = Kırmızı pirinç',
    ]);
    const beklenmeyen = ciftler.filter((c) => !muaf.has(c));
    assert.deepStrictEqual(beklenmeyen, [],
      'birebir kopya satir (alias olmali): ' + beklenmeyen.join(', '));
  });

  test('her besin adi tekil', () => {
    const adlar = foods.map((f) => f.n);
    assert.strictEqual(new Set(adlar).size, adlar.length, 'ayni ad iki kez');
  });
});
