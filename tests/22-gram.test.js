/**
 * 22 — GRAM GIRISI + PORSIYON EDITORU (15 Agu 2026)
 *
 * NEDEN: 410 temel besin yalnizca adet/dilim/kase birimiyle tutuluyordu;
 * "180 g tavuk" yazmanin yolu YOKTU. Gram yalnizca barkodlu paket urunlerde
 * vardi (scaleFood), yani kullanicinin en cok tarttigi seylerde degil.
 *
 * ⚠️ BU DOSYANIN EN ONEMLI SOZLESMESI: gram kipi YALNIZCA besinin gram
 * karsiligi biliniyorsa acilir. Bilinmeyen bir gram uydurmak, kullanicinin
 * "duzelttim" sandigi ama yanlis olcege oturan bir sayi uretir — hicbir sey
 * gostermemekten daha kotudur. Kisisel hafiza / ozel besinlerde gram YOK.
 *
 * Ikinci sozlesme: bilinmeyen makro 0 DEGIL null. 0 yazmak "olctuk, sifir
 * cikti" demektir ve hcNutritionStats bunu girilmis sayip protein ortalamasini
 * asagi ceker -> saglik kocu haksiz yere "protein yetersiz" der.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT } = require('./helpers/load');

const A = loadApp({ seed: {} });
const W = A.window;
// jsdom scrollIntoView'i uygulamiyor; editor acilisinda cagriliyor.
W.Element.prototype.scrollIntoView = function () {};
after(() => { try { A.close(); } catch (_) {} });

const coreSrc = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
const foodsSrc = fs.readFileSync(path.join(ROOT, 'foods.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

function seedFoods() {
  return A.evalIn('TURK_FOODS');
}
function bugununOgunleri() {
  const data = A.evalIn('data');
  const d = data.diet.days[W.today()];
  return (d && d.meals) || [];
}

describe('Temel besin veritabani — gram karsiligi', () => {
  test('470 besinin HEPSINDE g alani var ve pozitif', () => {
    const f = seedFoods();
    assert.strictEqual(f.length, 482, 'besin sayisi degismis');
    const eksik = f.filter(x => !(Number(x.g) > 0));
    assert.strictEqual(eksik.length, 0, 'g alani olmayan: ' + eksik.slice(0, 5).map(x => x.n).join(', '));
  });

  test('gram degerleri birim icin makul araliklarda', () => {
    // Bir "dilim"in 500 g olmasi veri hatasidir; bu test olcek kaymasini yakalar.
    const sinir = {
      dilim: [12, 80], bardak: [150, 300], kasik: [8, 30], avuc: [20, 45],
      fincan: [30, 120], kase: [120, 350], porsiyon: [60, 450],
    };
    // ⚠️ 10 Eyl 2026 — ISTISNALAR ADIYLA YAZILIR, BANT GENISLETILMEZ.
    // Bantlar EKMEK DILIMI ve CORBA KASESI varsayimiyla kalibre edildi. Uc
    // sinif besin bu varsayimi gercekten kiriyor:
    //   (1) buyuk dilim  — karpuz/pizza/borek/pasta dilimi 100-300 g'dir
    //   (2) dusuk yogunluk — misir gevregi, musli, patlamis misir: kase
    //       dolu ama hafif (patlamis misir ~0.04 g/ml)
    //   (3) kucuk porsiyon — granola, pismaniye, grissini olcuyle yenir
    // Bandi genisletmek bu uc durumu gecirirken ASIL aradigimiz olcek
    // hatasini da gecirirdi. O yuzden istisna LISTE, her biri gerekcesiyle.
    const istisna = {
      'Karpuz': [150, 350], 'Kavun': [120, 300], 'Ananas': [80, 200],
      'Pizza': [80, 160], 'Su böreği': [60, 160], 'Peynirli börek': [60, 160],
      'Etli ekmek': [60, 160], 'Trileçe': [60, 160], 'Cheesecake': [60, 160],
      'Mısır gevreği': [25, 60], 'Müsli': [30, 70], 'Patlamış mısır': [15, 45],
      'Granola': [30, 70], 'Pişmaniye': [25, 60], 'Grissini': [20, 60],
      'Şekersiz kakao': [3, 10],
    };
    for (const f of seedFoods()) {
      const u = String(f.u).replace(/^\d+\s*/, '');
      const s = istisna[f.n] || sinir[u];
      if (!s) continue;
      assert.ok(f.g >= s[0] && f.g <= s[1],
        `${f.n}: 1 ${u} = ${f.g} g, beklenen ${s[0]}-${s[1]}`);
    }
  });

  // ⚠️ 10 Eyl 2026 — YENI KAPI: gram alani UYDURULMUS mu?
  // Denetimde ortaya cikan asil hata buydu: `g` olculmemis, `k`'dan geri
  // turetilmisti (g = k / sabit). Belirtisi net — 470 besinin 59'u TAM
  // 2.00 kcal/g, 32'si 1.50, 26'si 0.40 idi. Gercek besinlerde bu kadar
  // tekrar OLMAZ; her kume bir kategoriye korlemesine uygulanmis bir
  // carpandir. Tek tek deger denetlemek yerine DESENI kilitliyoruz.
  test('gram alani k/sabit ile turetilmemis (uydurma gram kapisi)', () => {
    const sayac = new Map();
    for (const f of seedFoods()) {
      if (!(f.g > 0) || !(f.k > 0)) continue;
      const oran = (f.k / f.g).toFixed(2);
      sayac.set(oran, (sayac.get(oran) || 0) + 1);
    }
    const enSik = [...sayac.entries()].sort((a, b) => b[1] - a[1])[0];
    assert.ok(enSik[1] <= 20,
      `${enSik[1]} besin ayni kcal/g oranini (${enSik[0]}) paylasiyor — ` +
      'gram alani olculmemis, kalorinin sabite bolunmesiyle uretilmis olabilir');
  });

  // ⚠️ 10 Eyl 2026 — FIZIKSEL IMKANSIZLIK KAPISI.
  // 100 gram besinin icinde 100 gramdan fazla makro olamaz. Denetimde 7
  // besin bu kurali ciğniyordu (Cezerye 133 g, Bisküvi 113 g, Kabak
  // cekirdegi 104 g/100 g) — hepsi kucuk porsiyonda tam sayiya yuvarlanmis
  // makrolarin ve uydurma gramin birlikte urettigi hataydi.
  test('100 g besinde makro toplami 100 g\'i asmiyor', () => {
    for (const f of seedFoods()) {
      if (!(f.g > 0)) continue;
      const toplam = (f.p + f.c + f.f) / f.g * 100;
      assert.ok(toplam <= 100,
        `${f.n}: 100 g'da ${toplam.toFixed(0)} g makro — g ya da makrolar yanlis`);
    }
  });

  // ⚠️ Kalori ile makro BIRBIRINI TUTMALI (Atwater: 4/4/9).
  // Alkol ISTISNA ve bu bilincli: etanol 7 kcal/g tasir ama P/K/Y'nin
  // hicbirine girmez, o yuzden bu uc kayitta fark GERCEKTIR.
  test('kcal ile makrolar tutuyor (Atwater 4/4/9)', () => {
    const alkol = ['Bira', 'Şarap', 'Rakı'];
    const kotu = [];
    for (const f of seedFoods()) {
      if (alkol.includes(f.n) || !(f.k > 0)) continue;
      const hesap = f.p * 4 + f.c * 4 + f.f * 9;
      const fark = Math.abs(f.k - hesap);
      if (fark >= 25 && fark / f.k >= 0.20) {
        kotu.push(`${f.n}: yazan ${f.k} kcal, makrodan ${Math.round(hesap)}`);
      }
    }
    assert.deepStrictEqual(kotu, []);
  });

  test('turetilen kcal/100g fiziksel olarak mumkun (<= 900)', () => {
    // Saf yag 884 kcal/100g. Ustu bir deger g'nin yanlis oldugunu gosterir.
    for (const f of seedFoods()) {
      const per100 = f.k / f.g * 100;
      assert.ok(per100 <= 900, `${f.n}: ${Math.round(per100)} kcal/100g — g cok kucuk`);
      // Alt sinir yalniz kalorili besinler icin: light kola / cay / soda
      // gercekten ~0 kcal/100g'dir, orada dusuk deger DOGRUDUR.
      if (f.k >= 20) {
        assert.ok(per100 >= 5, `${f.n}: ${per100.toFixed(1)} kcal/100g — g cok buyuk`);
      }
    }
  });

  /**
   * LIGHT SOZLESMESI (Eyl 2026): light/yagsiz varyant eklerken en kolay
   * yapilan hata makrolari elle yazip ana urunle celismesi. Bir "light"
   * urun ana urunden AZ kalorili ve AZ yagli olmak zorunda; degilse
   * kullaniciya yanlis bir tercih sunuyoruz demektir.
   */
  test('light/yagsiz varyant ana urunden dusuk kalorili ve dusuk yagli', () => {
    const f = seedFoods();
    const bul = (n) => f.find(x => x.n === n);
    const ciftler = [
      ['Süt (yağsız)', 'Süt'], ['Süt (yarım yağlı)', 'Süt'],
      ['Yoğurt (yağsız)', 'Yoğurt'], ['Ayran (light)', 'Ayran'],
      ['Beyaz peynir (light)', 'Beyaz peynir'],
      ['Kaşar peyniri (light)', 'Kaşar peyniri'],
      ['Labne (light)', 'Labne'], ['Krem peynir (light)', 'Krem peynir'],
      ['Light dondurma', 'Dondurma'],
    ];
    for (const [lightAd, anaAd] of ciftler) {
      const l = bul(lightAd), a = bul(anaAd);
      assert.ok(l, lightAd + ' yok'); assert.ok(a, anaAd + ' yok');
      const lk = l.k / l.g, ak = a.k / a.g;      // 100 g basina normalize
      const lf = l.f / l.g, af = a.f / a.g;
      assert.ok(lk < ak, `${lightAd}: ${(lk*100).toFixed(0)} kcal/100g, ${anaAd} ${(ak*100).toFixed(0)} — light daha kalorili`);
      assert.ok(lf < af, `${lightAd}: yag ${(lf*100).toFixed(1)} g/100g, ${anaAd} ${(af*100).toFixed(1)} — light daha yagli`);
    }
  });

  /**
   * Yumurta akinin g'si 12'ydi (kategori kalori yogunlugundan turetilmisti)
   * — gercek bir yumurta akinin agirligi ~33 g. Gram kipi bu sayiyla
   * "3 yumurta aki = 36 g" gosteriyordu. Ak + sari = tam yumurta kontrolu
   * bu tur olcek kaymasini yakalar.
   */
  test('yumurta ak + sari = tam yumurta (olcek kaymasi kontrolu)', () => {
    const f = seedFoods();
    const ak = f.find(x => x.n === 'Yumurta akı');
    const sari = f.find(x => x.n === 'Yumurta sarısı');
    const tam = f.find(x => x.n === 'Yumurta');
    for (const alan of ['g', 'k', 'p', 'f']) {
      const toplam = ak[alan] + sari[alan];
      const fark = Math.abs(toplam - tam[alan]);
      // Tolerans: %15 ya da 1 birim. Makrolar tam sayiya yuvarlandigi icin
      // 3.6 + 2.7 = 6.3 -> 4 + 3 = 7 gibi bir birimlik sapma normaldir.
      assert.ok(fark / tam[alan] <= 0.15 || fark <= 1,
        `${alan}: ak ${ak[alan]} + sari ${sari[alan]} = ${toplam}, tam yumurta ${tam[alan]}`);
    }
  });
});

describe('Porsiyon <-> gram donusumu', () => {
  test('gram kipinde carpan = gram / birim-grami', () => {
    W.pickSeedFoodByName ? null : null;
    A.evalIn(`_aiFood = { name:'Test', kcal:200, protein:10, carb:20, fat:5, multi:false, items:[], source:'seed', unit:'porsiyon', grams:100 }`);
    W.showAiPortion('Test', 'Temel', '');
    W.setPortionMode('gram');
    W.setPortionValue(250);
    // 250 g / 100 g = 2.5 kat -> 500 kcal
    assert.strictEqual(A.evalIn('_portionMult()'), 2.5);
  });

  test('kip degisince miktar korunur (1.5 porsiyon -> 75 g)', () => {
    A.evalIn(`_aiFood = { name:'T', kcal:100, protein:5, carb:5, fat:5, multi:false, items:[], source:'seed', unit:'dilim', grams:50 }`);
    W.showAiPortion('T', 'Temel', '');
    W.setPortionValue(1.5);
    W.setPortionMode('gram');
    assert.strictEqual(Number(W.document.getElementById('aiQty').value), 75);
    W.setPortionMode('porsiyon');
    assert.strictEqual(Number(W.document.getElementById('aiQty').value), 1.5);
  });

  test('gram karsiligi YOKSA gram kipi acilmaz (uydurma olcek yok)', () => {
    A.evalIn(`_aiFood = { name:'Hafizadan', kcal:300, protein:null, carb:null, fat:null, multi:false, items:[], source:'memory', grams:null }`);
    W.showAiPortion('Hafizadan', 'Hafizandan', '');
    assert.strictEqual(W.document.querySelectorAll('#foodPortion .dt-seg-btn').length, 0,
      'gram karsiligi olmayan besinde segment gosterilmemeli');
    W.setPortionMode('gram');
    assert.strictEqual(A.evalIn('_portionMode'), 'porsiyon', 'gram kipine gecmemeli');
  });

  test('coklu yemekte ("4 yumurta 2 ekmek") adet carpani GIZLENIR', () => {
    // Miktar zaten sorguda sayildi; ikinci kez carpmak cift sayim olurdu.
    A.evalIn(`_aiFood = { name:'4 yumurta 2 ekmek', kcal:500, protein:30, carb:40, fat:20, multi:true, items:[], source:'ai', grams:400 }`);
    W.showAiPortion('4 yumurta 2 ekmek', 'Toplam', '');
    assert.strictEqual(W.document.querySelectorAll('#foodPortion .dt-seg-btn').length, 0);
    assert.strictEqual(W.document.getElementById('aiQty'), null);
  });
});

describe('Ogune ekleme', () => {
  test('gram kipinde etikete gram yazilir ve makro olceklenir', () => {
    const once = bugununOgunleri().length;
    A.evalIn(`_aiFood = { name:'Tavuk gogsu', kcal:200, protein:38, carb:0, fat:4, multi:false, items:[], source:'seed', unit:'porsiyon', grams:100 }`);
    W.showAiPortion('Tavuk gogsu', 'Temel', '');
    W.setPortionMode('gram');
    W.setPortionValue(180);
    W.addAiFood();
    const m = bugununOgunleri();
    assert.strictEqual(m.length, once + 1);
    const son = m[m.length - 1];
    assert.match(son.name, /\(180g\)/);
    assert.strictEqual(son.kcal, 360);
    assert.strictEqual(son.protein, 68);   // 38 * 1.8 = 68.4 -> 68
  });

  test('BILINMEYEN makro 0 degil null kaydedilir', () => {
    // hcNutritionStats kapsamayi "protein != null" ile sayiyor; 0 yazmak
    // veriyi "girilmis" gosterip protein ortalamasini asagi cekiyordu.
    A.evalIn(`_aiFood = { name:'Bilinmeyen', kcal:150, protein:null, carb:null, fat:null, multi:false, items:[], source:'ai', grams:null }`);
    W.showAiPortion('Bilinmeyen', 'AI tahmini', '');
    W.addAiFood();
    const son = bugununOgunleri().slice(-1)[0];
    assert.strictEqual(son.kcal, 150);
    assert.strictEqual(son.protein, null, 'protein 0 olarak kaydedilmis');
    assert.strictEqual(son.carb, null);
    assert.strictEqual(son.fat, null);
  });

  test('bilinmeyen makro onizlemede 0 degil tire gorunur', () => {
    A.evalIn(`_aiFood = { name:'X', kcal:150, protein:null, carb:null, fat:null, multi:false, items:[], source:'ai', grams:null }`);
    W.showAiPortion('X', 'AI', '');
    const html = W.document.getElementById('aiPreview').innerHTML;
    assert.ok(html.includes('—'), 'tire (—) yok');
    assert.ok(!/>0</.test(html), 'sifir gosterilmis');
  });

  test('miktar 0 / bos ise eklenmez', () => {
    A.evalIn(`_aiFood = { name:'Y', kcal:100, protein:1, carb:1, fat:1, multi:false, items:[], source:'seed', unit:'adet', grams:50 }`);
    W.showAiPortion('Y', 'Temel', '');
    W.document.getElementById('aiQty').value = '0';
    const once = bugununOgunleri().length;
    W.addAiFood();
    assert.strictEqual(bugununOgunleri().length, once, '0 miktarla ogun eklenmis');
  });
});

describe('Guvenlik + sozlesme', () => {
  test('besin adi HTML olarak yorumlanmaz (XSS)', () => {
    A.evalIn(`_aiFood = { name:'<img src=x onerror=alert(1)>', kcal:10, protein:1, carb:1, fat:1, multi:false, items:[], source:'seed', unit:'adet', grams:10 }`);
    W.showAiPortion('<img src=x onerror=alert(1)>', 'Temel', '');
    const fp = W.document.getElementById('foodPortion');
    assert.strictEqual(fp.querySelectorAll('img').length, 0, 'ad HTML olarak islenmis');
  });

  test('gram kipi bir AG istegi tetiklemez (motor lokal)', () => {
    // Donusum tamamen aritmetik; AI'a sormak hem yavas hem gereksiz maliyet.
    // 2 Eyl 2026: porsiyon editoru core.js'ten foods.js'e tasindi.
    const i = foodsSrc.indexOf('function setPortionMode');
    const j = foodsSrc.indexOf('function showAiPortion');
    assert.ok(i > 0 && j > i, 'porsiyon editoru foods.js\'te bulunamadi');
    assert.ok(!/fetch\s*\(/.test(foodsSrc.slice(i, j)), 'gram kipinde fetch var');
  });
});

describe('Impeccable — dt-* porsiyon editoru', () => {
  const blok = cssSrc.slice(cssSrc.indexOf('.dt-seg {'));

  test('yan-serit kenarlik yok, tam kenar var', () => {
    assert.ok(!/border-(left|right)\s*:\s*[2-9]/.test(blok));
    assert.ok(/border:\s*1px/.test(blok));
  });

  test('gradyan / glass / saf renk yok', () => {
    assert.ok(!/linear-gradient|backdrop-filter/.test(blok));
    assert.ok(!/#fff\b|#ffffff\b|#000\b|#000000\b/i.test(blok));
  });

  test('ease-out + reduced-motion var', () => {
    assert.ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(blok));
    assert.ok(/prefers-reduced-motion/.test(blok));
  });

  test('sayilar tabular — ekranin yarisi rakam', () => {
    assert.ok(/\.dt-macro-val[\s\S]{0,220}tabular-nums/.test(blok));
    assert.ok(/\.dt-pe-num input[\s\S]{0,260}tabular-nums/.test(blok));
  });

  test('styles.css hala LF ve NUL icermiyor', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'styles.css'));
    assert.strictEqual(raw.indexOf(Buffer.from('\r\n')), -1);
    assert.strictEqual(raw.indexOf(0), -1, 'NUL bayti geri gelmis');
  });
});
