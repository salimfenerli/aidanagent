/**
 * 38 — GRAM SORGUSU + HIZLI EKLE OLCEGI (12 Eyl 2026)
 *
 * NEDEN: Salim "yemek arama ekleme kismi biraz sikintiliydi" dedi. jsdom'da
 * kullanici gibi gezilince sebep cikti ve birim testi degil KAPI hatasiydi:
 *
 *   "200 gr tavuk gogsu" yaz + "+" bas  ->  "Tavuk gogsu x200 · 49.600 kcal"
 *
 * parseFoodQuery birim kelimesini ATIYOR, yalniz sayiyi donduruyordu; hizli
 * ekleme de o sayiyi PORSIYON CARPANI saniyordu. Enter de ayni yolu kullandigi
 * icin en dogal hareket en buyuk hatayi uretiyordu. Uzerine eklenen kayit
 * hafizaya "x200" adiyla giriyor ve bir sonraki miktarli arama onu TEKRAR
 * carpiyordu: olculen zincir 14.880.000 kcal.
 *
 * Motor zaten gram biliyordu (TURK_FOODS[].g + porsiyon editorunun Gram kipi).
 * Eksik olan tek sey kapiydi — "motor var, kapi yok" deseninin aynisi.
 *
 * BU DOSYANIN KILITLEDIGI SOZLESMELER:
 *  1. Gram birimi sorguda KAYBOLMAZ (parseFoodQuery.gram).
 *  2. Gram sorgusu gram olarak uygulanir; sonuc besinin per-100g degeriyle tutar.
 *  3. Gram tabani bilinmiyorsa CARPMA YAPILMAZ ve kullaniciya soylenir.
 *  4. Adinda miktar yazan kayit ("x2" / "(200g)") ikinci kez carpilmaz;
 *     yeni miktar o TABANDAN yeniden olceklenir.
 *  5. Tek dokunusla eklenen hicbir kayit fiziksel ust siniri asmaz.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT } = require('./helpers/load');

const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js'] });
const W = A.window;
const d = W.document;
W.Element.prototype.scrollIntoView = function () {};
after(() => { try { A.close(); } catch (_) {} });

const E = (k) => A.evalIn(k);
const J = (k) => JSON.parse(E('JSON.stringify(' + k + ')'));
const foodsSrc = fs.readFileSync(path.join(ROOT, 'foods.js'), 'utf8');

function yaz(q) {
  d.getElementById('foodSearchInput').value = q;
  E('renderLocalMatches()');
}
function artiBas() {
  const b = d.querySelector('#foodLocal .food-row .food-quick');
  assert.ok(b, 'sonuc satirinda + butonu yok');
  b.click();
}
function sonKayit() {
  const m = J('dietDay()').meals || [];
  return m[m.length - 1];
}
function seed(ad) {
  return J('TURK_FOODS').find((f) => f.n === ad);
}

describe('Gram sorgusu sorgudan KAYBOLMUYOR', () => {
  test('gram/gr/g/ml gram olarak isaretlenir', () => {
    for (const q of ['200 gr tavuk', '200 gram tavuk', '200g tavuk', '150 ml sut']) {
      const r = J('parseFoodQuery(' + JSON.stringify(q) + ')');
      assert.strictEqual(r.gram, true, q + ' gram olarak isaretlenmedi');
      assert.ok(r.qty > 0, q + ' miktar okunmadi');
    }
  });

  test('porsiyon birimleri gram SAYILMAZ', () => {
    for (const q of ['2 dilim ekmek', '1 kase yogurt', '3 adet yumurta', 'yarim avokado']) {
      const r = J('parseFoodQuery(' + JSON.stringify(q) + ')');
      assert.strictEqual(r.gram, false, q + ' yanlislikla gram sayildi');
    }
  });

  test('cekirdek terim birim kelimelerinden arinmis', () => {
    assert.strictEqual(J("parseFoodQuery('200 gr tavuk gogsu')").core, 'tavuk gogsu');
    assert.strictEqual(J("parseFoodQuery('2 dilim ekmek')").core, 'ekmek');
  });
});

describe('Gram sorgusu GRAM olarak uygulanir', () => {
  test('200 gr tavuk gogsu = besinin 200 gramI (200 porsiyonu DEGIL)', () => {
    E("openFoodModal('ogle')");
    yaz('200 gr tavuk gogsu');
    artiBas();
    const rec = sonKayit();
    const sf = seed('Tavuk göğsü');
    const beklenen = Math.round(sf.k * 200 / sf.g);
    assert.ok(/\(200g\)$/.test(rec.name), 'etiket gram yazmiyor: ' + rec.name);
    assert.ok(Math.abs(rec.kcal - beklenen) <= 2,
      `200 g = ${beklenen} kcal olmali, ${rec.kcal} yazildi`);
    assert.ok(rec.kcal < sf.k * 5, 'gram sorgusu porsiyon carpani gibi uygulanmis');
  });

  test('Enter de ayni olcegi kullanir (en dogal hareket en buyuk hatayi uretmesin)', () => {
    E("openFoodModal('aksam')");
    yaz('100 gr yumurta');
    E('foodSearchEnter()');
    const rec = sonKayit();
    const sf = seed('Yumurta');
    const beklenen = Math.round(sf.k * 100 / sf.g);
    assert.ok(Math.abs(rec.kcal - beklenen) <= 2,
      `Enter: 100 g = ${beklenen} kcal olmali, ${rec.kcal} yazildi`);
  });

  test('gram tabani YOKSA carpma yapilmaz (uydurulmus olcek yok)', () => {
    E('ensureDiet(); data.diet.customFoods = [{ id: 1, name: "Annemin boregi", unit: "porsiyon", kcal: 300, protein: 9, carb: 30, fat: 16 }]; save();');
    E("openFoodModal('ara_ogun')");
    yaz('250 gr annemin boregi');
    artiBas();
    const rec = sonKayit();
    assert.strictEqual(rec.kcal, 300, 'gram tabani bilinmiyorken olcek uydurulmus: ' + rec.kcal);
    assert.ok(!/×/.test(rec.name), 'gram sorgusu carpana cevrilmis: ' + rec.name);
  });
});

describe('Adindaki miktar IKINCI KEZ uygulanmaz', () => {
  test('hafizadaki (200g) kaydina 300 g sorgusu 300 g yazar', () => {
    E("openFoodModal('ogle')");
    yaz('200 gr tavuk gogsu'); artiBas();
    yaz('300 gram tavuk gogsu'); artiBas();
    const rec = sonKayit();
    const sf = seed('Tavuk göğsü');
    const beklenen = Math.round(sf.k * 300 / sf.g);
    assert.ok(/\(300g\)$/.test(rec.name), 'etiket 300 g degil: ' + rec.name);
    assert.ok(Math.abs(rec.kcal - beklenen) <= 3,
      `300 g = ${beklenen} kcal olmali, ${rec.kcal} yazildi`);
  });

  test('hafizadaki ×2 kaydina 4 sorgusu ×4 yazar (×2 ×2 olmaz)', () => {
    E("openFoodModal('kahvalti')");
    yaz('2 dilim ekmek'); artiBas();
    yaz('4 dilim ekmek'); artiBas();
    const rec = sonKayit();
    const sf = seed('Ekmek');
    assert.ok(!/×.*×/.test(rec.name), 'carpan iki kez yazilmis: ' + rec.name);
    assert.ok(Math.abs(rec.kcal - sf.k * 4) <= 4,
      `4 dilim = ${sf.k * 4} kcal olmali, ${rec.kcal} yazildi`);
  });

  test('miktar yazilmadan eklenen hafiza kaydi OLDUGU GIBI eklenir', () => {
    E("openFoodModal('ogle')");
    yaz('2 dilim ekmek'); artiBas();
    const ilk = sonKayit();
    yaz('ekmek ×2');
    const b = d.querySelector('#foodLocal .food-row .food-quick');
    if (b) {
      b.click();
      const rec = sonKayit();
      assert.ok(rec.kcal <= ilk.kcal * 1.05 + 1,
        'miktar yazilmadan kayit buyumus: ' + ilk.kcal + ' -> ' + rec.kcal);
    }
  });
});

describe('Fiziksel ust sinir — tek dokunus catlagi', () => {
  /**
   * ⚠️ BU TEST HATA SINIFINI KILITLER, tek tek senaryoyu degil. Hangi yoldan
   * gelirse gelsin tek "+" dokunusu 5000 kcal'lik bir kayit uretmemeli:
   * en agir tek kalem (1 kg tatli bile) bunun altinda.
   */
  test('hicbir miktarli sorgu tek dokunusta 5000 kcal ustu kayit uretmez', () => {
    const sorgular = ['200 gr tavuk gogsu', '300 gram pilav', '150g yulaf ezmesi', '500 gr makarna',
      '2 dilim ekmek', '12 adet badem', '1 kase yogurt', '250 ml sut', '3 porsiyon kofte'];
    E("openFoodModal('aksam')");
    for (const q of sorgular) {
      yaz(q);
      const b = d.querySelector('#foodLocal .food-row .food-quick');
      if (!b) continue;
      b.click();
      const rec = sonKayit();
      assert.ok(rec.kcal != null && rec.kcal < 5000,
        `"${q}" -> ${rec.name} ${rec.kcal} kcal. Miktar olcegi yanlis uygulanmis.`);
    }
  });
});

describe('Kayit uretimi tek disipline bagli', () => {
  test('hicbir ekleme yolu Date.now() ile id uretmiyor', () => {
    // Ayni ms'de iki ekleme ayni id alir; geri alma YANLIS kaydi siler.
    const satirlar = foodsSrc.split('\n')
      .filter((l) => /id:\s*Date\.now\(\)/.test(l) && /meals\.push|slot:\s*_mealSlot/.test(l));
    assert.deepStrictEqual(satirlar, [], 'Date.now() id kullanan ekleme yolu: ' + satirlar.join(' | '));
  });

  test('porsiyon editoru ve barkod yolunda geri alma var', () => {
    for (const fn of ['addPickedFood', 'addAiFood']) {
      const kod = E('String(' + fn + ')');
      assert.ok(/_mealUndoToast|showUndoToast/.test(kod), fn + ' geri alma sunmuyor');
      assert.ok(/_mealId\(\)/.test(kod) || /_mealUndoToast/.test(kod), fn + ' id disiplinine bagli degil');
    }
  });
});

describe('Siralama — tam kelime eslesmesi one gecer', () => {
  /**
   * "peynir" arayan biri ilk uc sonucta PEYNIR gormuyordu: 'Peynirli börek',
   * 'Peynirli omlet', 'Peynirli poğaça'. Tek bonus "ad sorguyla BASLIYOR" idi
   * (30.000) ve tam kelime eslesmesini eziyordu.
   */
  test('peynir aramasi ilk 3te gercek peynir veriyor', () => {
    const ilk3 = J("seedFoodMatches('peynir', 10)").slice(0, 3).map((f) => f.n);
    const peynirVar = ilk3.some((n) => /peynir(i)?$/i.test(n.replace(/\s*\(.*\)$/, '')));
    assert.ok(peynirVar, 'ilk 3: ' + ilk3.join(', '));
  });

  test('tam kelime eslesmesi, adin sorguyla baslamasindan guclu', () => {
    const tam = E("foodMatchScore('Beyaz peynir', null, 'peynir')");
    const onek = E("foodMatchScore('Peynirli börek', null, 'peynir')");
    assert.ok(tam > onek, `tam kelime ${tam} <= onek ${onek}`);
  });

  test('tam ad eslesmesi her zaman birinci', () => {
    assert.strictEqual(J("seedFoodMatches('yogurt', 5)")[0].n, 'Yoğurt');
    assert.strictEqual(J("seedFoodMatches('ekmek', 5)")[0].n, 'Ekmek');
  });
});
