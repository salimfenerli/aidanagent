/**
 * 44 — CİĞ/KURU ÖLÇÜM + EV ÖLÇÜSÜ + ARAMA SIRASI (22 Eyl 2026)
 *
 * Salim: "besinlerin makrolari da dogru olsun, database'i internetle karsilastirir
 * misin, kullanirken goruyorum database hatalarini".
 *
 * Tablonun per-100 g degerleri zaten 37 numarali testte USDA'ya bagliydi ve
 * DOGRUYDU. Kullanirken gorulen hatalar tablodan degil, ARAMA ve OLCU katmanindan
 * geliyordu — tutarlilik testlerinin hicbirinin bakmadigi yer:
 *
 *   "50 g yulaf"            -> hic sonuc yok ('g' birim listesinde yoktu)
 *   "yulaf" / "50g yulaf"   -> 200 g PISMIS LAPA degeri (5,4 kat eksik)
 *   "100 g kuru makarna"    -> kuru satir yoktu, pismis secilince 2,3 kat eksik
 *   "2 yemek kaşığı yulaf"  -> "yemek yulaf" diye aranip hic sonuc yok
 *   "1 çay kaşığı bal"      -> yemek kasigi sayiliyordu (3 kat fazla)
 *   "yulaf" / "patates"     -> ilk sirada Yulaf sütü / Patates püresi
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { loadApp, fixture } = require('./helpers/load');

const A = loadApp({ seed: Object.assign(fixture(), { diet: { kcalGoal: 2600, days: {}, weights: [], plan: [] } }),
  scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js'] });
after(() => { try { A.close(); } catch (_) {} });
const J = (k) => JSON.parse(A.evalIn('JSON.stringify(' + k + ')'));
const ilk = (q) => J('seedFoodMatches(' + JSON.stringify(q) + ', 3).map(x => x.n)');

/** Kullanici gibi: aramaya yaz, ilk temel besini hizli ekle, son kaydi dondur. */
function ekle(q) {
  A.evalIn('showUndoToast = () => {}; if (!document.getElementById("foodSearchInput")) openFoodModal("kahvalti");');
  A.evalIn('dietDay().meals = [];');
  A.evalIn('document.getElementById("foodSearchInput").value = ' + JSON.stringify(q) + '; renderLocalMatches(); quickAddSeed(0);');
  return J('dietDay().meals.slice(-1)[0]');
}

describe('Birim ayiklama', () => {
  test('"50 g yulaf" (bosluklu gram) sonuc verir ve GRAM sayilir', () => {
    const p = J('parseFoodQuery("50 g yulaf")');
    assert.strictEqual(p.core, 'yulaf');
    assert.strictEqual(p.gram, true);
    assert.strictEqual(p.qty, 50);
  });

  test('"2 yemek kaşığı yulaf" cekirdegi yulaf, olcek yemek', () => {
    const p = J('parseFoodQuery("2 yemek kaşığı yulaf")');
    assert.strictEqual(p.core, 'yulaf');
    assert.strictEqual(p.olcek, 'yemek');
  });

  test('yemek ADI iceren sorgu bozulmaz ("yemek" tek basina birim degil)', () => {
    assert.ok(J('parseFoodQuery("mercimek yemeği")').core.indexOf('yemeg') >= 0);
  });
});

describe('Kullanici gibi ekleme — kalori gercege yakin', () => {
  const yakin = (gercek, olcum, tol) => Math.abs(olcum - gercek) / gercek <= (tol || 0.2);

  test('50 g yulaf ~ 190 kcal (eskiden 36)', () => {
    const r = ekle('50 g yulaf');
    assert.ok(/Yulaf ezmesi/.test(r.name), r.name);
    assert.ok(yakin(190, r.kcal), r.kcal + ' kcal');
  });

  test('2 yemek kaşığı yulaf ~ 10-15 g (eskiden 2 porsiyon)', () => {
    const r = ekle('2 yemek kaşığı yulaf');
    assert.ok(r.kcal >= 30 && r.kcal <= 60, r.name + ' ' + r.kcal + ' kcal');
  });

  test('1 çay kaşığı bal = yemek kaşığının üçte biri', () => {
    const r = ekle('1 çay kaşığı bal');
    assert.ok(yakin(21, r.kcal, 0.25), r.kcal + ' kcal');
  });

  test('1 su bardağı yulaf ~ 80 g (hacimden grama, yogunluk 0,4)', () => {
    const r = ekle('1 su bardağı yulaf');
    assert.ok(yakin(304, r.kcal), r.name + ' ' + r.kcal);
  });

  test('100 gr kuru makarna ~ 371 kcal (pismis degil)', () => {
    const r = ekle('100 gr kuru makarna');
    assert.ok(/kuru/.test(r.name) && yakin(371, r.kcal), r.name + ' ' + r.kcal);
  });

  test('200 g çiğ tavuk göğsü ~ 240 kcal', () => {
    const r = ekle('200 g çiğ tavuk');
    assert.ok(yakin(240, r.kcal), r.name + ' ' + r.kcal);
  });

  test('kendi birimiyle ayni olcu CARPAN olarak kalir (2 dilim ekmek)', () => {
    const r = ekle('2 dilim ekmek');
    assert.ok(yakin(160, r.kcal), r.name + ' ' + r.kcal);
  });
});

describe('Arama sirasi', () => {
  test('"yulaf" -> kuru yulaf ezmesi ilk sirada (sut degil)', () => assert.strictEqual(ilk('yulaf')[0], 'Yulaf ezmesi'));
  test('"patates" -> sade patates ilk sirada (pure degil)', () => assert.strictEqual(ilk('patates')[0], 'Haşlanmış patates'));
  test('adin kendisi takma addan ONCE gelir ("pirinç" -> Pirinç)', () => assert.strictEqual(ilk('pirinç')[0], 'Pirinç'));
  test('pismis ve kuru satir BIRLIKTE gorunur (makarna, bulgur)', () => {
    assert.ok(ilk('makarna').indexOf('Makarna (kuru)') >= 0);
    assert.ok(ilk('bulgur').indexOf('Bulgur (kuru)') >= 0);
  });
  test('"kırmızı mercimek" artik bulunuyor', () => assert.strictEqual(ilk('kırmızı mercimek')[0], 'Kırmızı mercimek (kuru)'));
});
