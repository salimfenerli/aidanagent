/**
 * 72 — KALORİ / MAKRO DOĞRULUĞU + GRAM ESAS (25 Eki 2026)
 *
 * Salim: "asla ama asla kalori makro hatası istemiyorum" + "porsiyon nitel bir
 * kavram, gramda derinleşelim".
 *
 * Kilitlenenler:
 *  - VERİTABANI: her besinde ölçülmüş gram var; 4P+4K+9Y kaloriyle %15 içinde
 *    (alkol hariç); 100 g'da 900 kcal'i geçmez; makro toplamı gramı geçmez; ad tekrarı yok
 *  - GİRİŞ: gerçekçi 20 yazım uçtan uca → doğru besin, doğru gram, kcal = tablo × gram oranı
 *  - "2 yumurta" geçmişteki birimsiz "Yumurta 320 kcal" kaydını ×2 YAPMAZ
 *  - ad birebir tutan tablo besini geçmişteki benzer addan ("Tavuk pilav") önce gelir
 *  - her tablo kaydı gramla etiketlenir: "Pilav (150g)" — "1 porsiyon" yok
 *  - plan/öneri satırları gramla: nutGramYaz
 *  - makroTutarli kapısı: günlükte "kontrol et", AI sonucu kendiliğinden açılmaz
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js', 'ajan.js'] });
after(() => A.close());
const W = A.window, d = W.document;
W.Element.prototype.scrollIntoView = function () {};
const E = (k) => A.evalIn(k);
const J = (k) => JSON.parse(E('JSON.stringify(' + k + ')'));
const DB = J('TURK_FOODS');
const ALKOL = /bira|şarap|rakı/i;

describe('veritabanı değişmezleri', () => {
  test('her besinde gram; Atwater %15; ≤900 kcal/100 g; makro ≤ gram', () => {
    const hata = [];
    for (const f of DB) {
      if (!(f.g > 0)) { hata.push(f.n + ': gram yok'); continue; }
      const a = 4 * f.p + 4 * f.c + 9 * f.f;
      if (!ALKOL.test(f.n) && Math.abs(a - f.k) > Math.max(15, f.k * 0.15)) hata.push(`${f.n}: ${f.k} kcal ama makrolar ${Math.round(a)}`);
      if (f.k / f.g * 100 > 900) hata.push(f.n + ': 100 g > 900 kcal');
      if (f.p + f.c + f.f > f.g * 1.02) hata.push(f.n + ': makro gramı aşıyor');
      if ([f.k, f.p, f.c, f.f].some(v => typeof v !== 'number' || v < 0)) hata.push(f.n + ': eksik/negatif değer');
    }
    assert.deepStrictEqual(hata, []);
  });
  test('ad tekrarı yok', () => {
    const g = new Set(), tekrar = [];
    for (const f of DB) { const k = f.n.toLocaleLowerCase('tr'); if (g.has(k)) tekrar.push(f.n); g.add(k); }
    assert.deepStrictEqual(tekrar, []);
  });
  test('referans kontrolleri (USDA/TürKomp, 100 g başına ±%12)', () => {
    const ref = { 'Yumurta': 143, 'Tavuk göğsü': 165, 'Pilav': 160, 'Makarna': 158, 'Ekmek': 265, 'Süt': 61,
      'Yulaf ezmesi': 379, 'Muz': 89, 'Elma': 52, 'Badem': 579, 'Zeytinyağı': 884, 'Beyaz peynir': 264, 'Somon': 206 };
    for (const [ad, k100] of Object.entries(ref)) {
      const f = DB.find(x => x.n === ad);
      assert.ok(f, ad + ' yok');
      const v = f.k / f.g * 100;
      assert.ok(Math.abs(v - k100) <= k100 * 0.12, `${ad}: ${Math.round(v)} kcal/100g, referans ${k100}`);
    }
  });
});

describe('giriş uçtan uca (yaz → + → günlük)', () => {
  E("openFoodModal('ogle')");
  const yaz = (q) => {
    d.getElementById('foodSearchInput').value = q; E('renderLocalMatches()');
    const b = d.querySelector('#foodLocal .food-row .food-quick');
    assert.ok(b, q + ': sonuç yok');
    const n0 = J('dietDay().meals').length; b.click();
    const m = J('dietDay().meals'); assert.ok(m.length > n0, q + ': kayıt yok');
    const r = m[m.length - 1]; E('data.diet.days[dietKey()].meals = []'); return r;
  };
  const vaka = [
    ['2 yumurta', 'Yumurta', 100], ['3 haşlanmış yumurta', 'Haşlanmış yumurta', 150],
    ['200 gr tavuk göğsü', 'Tavuk göğsü', 200], ['tavuk göğsü 250g', 'Tavuk göğsü', 250],
    ['150 g pilav', 'Pilav', 150], ['pilav', 'Pilav', 150], ['2 kase pilav', 'Pilav', 300],
    ['300g makarna', 'Makarna', 300], ['1 su bardağı süt', 'Süt', 200], ['500 ml süt', 'Süt', 500],
    ['2 dilim ekmek', 'Ekmek', 60], ['10 badem', 'Badem', 12], ['1 ölçek whey', 'Protein tozu', 30],
    ['köfte 6 adet', 'Köfte', 210], ['pizza 2 dilim', 'Pizza', 220], ['pirinç 100 gr çiğ', 'Pirinç (çiğ)', 100],
    ['2 kaşık yulaf', 'Yulaf ezmesi', 12], ['2 lahmacun', 'Lahmacun', 260], ['50 gr beyaz peynir', 'Beyaz peynir', 50],
    ['1 kaşık bal', 'Bal', 21],
  ];
  for (const [q, ad, gram] of vaka) {
    test(`"${q}" → ${ad} ${gram} g`, () => {
      const r = yaz(q);
      const f = DB.find(x => x.n === ad);
      assert.strictEqual(r.name, `${ad} (${gram}g)`);
      const k = Math.round(f.k * gram / f.g);
      assert.ok(Math.abs(r.kcal - k) <= 1, `${q}: ${r.kcal} kcal, beklenen ${k}`);
      assert.ok(Math.abs(r.protein - f.p * gram / f.g) <= 1, `${q}: protein ${r.protein}`);
    });
  }
  test('🔒 birimsiz geçmiş kayıt ("Yumurta" 320 kcal) "2 yumurta" ile katlanmaz', () => {
    E("data.diet.days['2026-01-02'] = { meals: [{ id: 1, name: 'Yumurta', kcal: 320, protein: 22, carb: 4, fat: 24 }] }");
    const r = yaz('2 yumurta');
    assert.strictEqual(r.kcal, 144);
  });
});

describe('gram yazımı ve kapı', () => {
  test('nutGramYaz: nitel birim gram, sayılı birim sayı + gram, bilinmeyen eski biçim', () => {
    assert.strictEqual(E("nutGramYaz(2, 'porsiyon', 'Pilav')"), '300 g');
    assert.strictEqual(E("nutGramYaz(2, 'adet', 'Yumurta')"), '2 adet (100 g)');
    assert.strictEqual(E("nutGramYaz(1, 'porsiyon', 'Uydurma yemek')"), '1 porsiyon');
  });
  test('makroTutarli: tutarlı / tutarsız / eksik makro / alkol', () => {
    assert.strictEqual(E('makroTutarli(144, 12.6, 0.8, 9.6)'), true);
    assert.strictEqual(E('makroTutarli(600, 12.6, 0.8, 9.6)'), false);
    assert.strictEqual(E('makroTutarli(600, null, null, null)'), true);
    assert.strictEqual(E("makroTutarli(142, 1.7, 11.9, 0, 'Bira')"), true);
  });
  test('KAPI: günlük satırı uyarır, AI sonucu tutarsızsa kendiliğinden açılmaz, ajan gramla yazar', () => {
    assert.match(readText('core.js'), /makroTutarli\(m\.kcal, m\.protein, m\.carb, m\.fat, m\.name\)/);
    assert.match(readText('foods.js'), /!\(_aiFood && _aiFood\._tutarsiz\)\) pickAiRow\(\)/);
    const r = J("ajanYemekCoz('3 yumurta')");
    assert.strictEqual(r.name, 'Yumurta (150g)');
  });
});
