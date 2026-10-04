/**
 * 47 — ÇEKİRDEK BESİN TUTARLILIĞI (27 Eyl 2026)
 *
 * NEDEN: Salim'in en sık yediği besinler (yumurta, bonfile, baldo/basmati
 * pilavı, tam buğday ekmek, patates) birbirinden bağımsız elle yazılmıştı.
 * Sonuç: "Baldo pirinç" YAĞSIZ haşlanmış değer taşıyordu (evde yenen tereyağlı
 * pilav değil), tam buğday ekmek etiketin %11 üstündeydi, çiğ ölçüm satırı
 * yoktu. 37-besin-referans her satırı TEK TEK dış kaynakla karşılaştırır;
 * bu dosya satırların BİRBİRİYLE tutarlılığını kilitler:
 *
 *   çiğ (etiket)  ──÷ 2,8──►  sade haşlanmış
 *        │
 *        └── + 14 g tereyağı + 13,5 g ayçiçek yağı ──►  pilav (531,5 g)
 *
 * 2,8 = pişme verimi: USDA pişmiş beyaz pirinç %68,4 nem, çiğ %11,6 nem
 * → kuru madde oranı 0,884 / 0,316. Bir satır değişip diğeri güncellenmezse
 * burası kırmızı döner.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load');

const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js'] });
after(() => { try { A.close(); } catch (_) {} });

const J = (kod) => JSON.parse(A.evalIn('JSON.stringify(' + kod + ')'));
const foods = J('TURK_FOODS');
const micro = J('NUT_MICRO_DATA');
const bul = (n) => { const f = foods.find((x) => x.n === n); assert.ok(f, n + ' tabloda yok'); return f; };
const per100 = (f) => [f.k, f.p, f.c, f.f].map((v) => v / f.g * 100);
const yakin = (a, b, tol, ad) => {
  const sapma = Math.abs(a - b) / Math.max(Math.abs(b), 0.5);
  assert.ok(sapma <= tol, ad + ': ' + a.toFixed(2) + ' vs ' + b.toFixed(2) + ' (%' + (sapma * 100).toFixed(1) + ')');
};

const VERIM = 2.8;
const TARIF = { pirinc: 180, tereyag: 14, yag: 13.5 };

function pilavBekle(cigAd) {
  const cig = per100(bul(cigAd));
  const tb = per100(bul('Tereyağı'));
  const ay = per100(bul('Ayçiçek yağı'));
  const kutle = TARIF.pirinc * VERIM + TARIF.tereyag + TARIF.yag;
  return [0, 1, 2, 3].map((i) =>
    (cig[i] * TARIF.pirinc + tb[i] * TARIF.tereyag + ay[i] * TARIF.yag) / kutle);
}

describe('pirinç ailesi — çiğ, haşlanmış ve pilav tek kaynaktan', () => {
  const AILE = [
    ['Baldo pirinç (çiğ)', 'Baldo pirinç', 'Baldo pilavı'],
    ['Basmati pirinç (çiğ)', 'Basmati pirinç', 'Basmati pilavı'],
    ['Pirinç (çiğ)', null, 'Pilav'],
  ];
  const ALAN = ['kcal', 'protein', 'karb', 'yağ'];

  for (const [cig, sade, pilav] of AILE) {
    if (sade) test(sade + ' = çiğ ÷ 2,8', () => {
      const c = per100(bul(cig)), s = per100(bul(sade));
      // yağ çok küçük sayılar (0,5 g) — yuvarlama payı geniş
      [0, 1, 2].forEach((i) => yakin(s[i], c[i] / VERIM, 0.04, sade + ' ' + ALAN[i]));
    });

    test(pilav + ' = standart tarif (çiğ + tereyağı + sıvı yağ)', () => {
      const bek = pilavBekle(cig), p = per100(bul(pilav));
      [0, 1, 2, 3].forEach((i) => yakin(p[i], bek[i], 0.04, pilav + ' ' + ALAN[i]));
    });
  }

  test('pilav YAĞLI, sade haşlanmış YAĞSIZ — ikisi karışmamalı', () => {
    // 27 Eyl'deki asıl bulgu: 'Baldo pirinç' yağsız değer taşıyordu ama
    // evde yenen şey tereyağlı pilav. İkisi ayrı satır ve farkı büyük olmalı.
    for (const [sade, pilav] of [['Baldo pirinç', 'Baldo pilavı'], ['Basmati pirinç', 'Basmati pilavı']]) {
      const s = per100(bul(sade)), p = per100(bul(pilav));
      assert.ok(s[3] < 1, sade + ' yağsız olmalı');
      assert.ok(p[3] > 4, pilav + ' tereyağlı olmalı');
      assert.ok(p[0] > s[0] * 1.2, pilav + ' sadeden en az %20 kalorili olmalı');
    }
  });

  test('esmer, beyazdan düşük kalorili ve kahverengi pilav yağlı', () => {
    assert.ok(per100(bul('Esmer pirinç'))[0] < per100(bul('Pirinç'))[0]);
    assert.ok(per100(bul('Kahverengi pilav'))[3] > 4);
  });
});

describe('et — çiğ ve pişmiş satır aynı eti anlatıyor', () => {
  test('bonfile: pişmiş/çiğ protein oranı ızgara verimine uyuyor (1,3–1,5)', () => {
    const c = per100(bul('Dana bonfile (çiğ)')), p = per100(bul('Dana bonfile'));
    const oran = p[1] / c[1];
    assert.ok(oran >= 1.3 && oran <= 1.5, 'oran ' + oran.toFixed(2));
    assert.ok(p[2] === 0 && c[2] === 0, 'etin karbonhidratı olmaz');
  });

  test('tavuk göğsü: aynı kural', () => {
    const c = per100(bul('Tavuk göğsü (çiğ)')), p = per100(bul('Tavuk göğsü'));
    const oran = p[1] / c[1];
    assert.ok(oran >= 1.25 && oran <= 1.45, 'oran ' + oran.toFixed(2));
  });
});

describe('mikro veri — yeni çekirdek satırlar kapsamda', () => {
  test('çekirdek besinlerin hepsinde mikro kaydı var', () => {
    const CEKIRDEK = ['Yumurta', 'Haşlanmış yumurta', 'Dana bonfile', 'Dana bonfile (çiğ)', 'Baldo pilavı',
      'Basmati pilavı', 'Baldo pirinç (çiğ)', 'Basmati pirinç (çiğ)', 'Tam buğday ekmek',
      'Haşlanmış patates', 'Tavuk göğsü', 'Pilav', 'Süzme yoğurt', 'Süt', 'Muz', 'Yulaf ezmesi'];
    const eksik = CEKIRDEK.filter((n) => !micro[n]);
    assert.deepStrictEqual(eksik, []);
  });

  test('tam buğday ekmek lifi etiketle tutuyor (7,9 g/100 g)', () => {
    const f = bul('Tam buğday ekmek');
    yakin(micro['Tam buğday ekmek'].lif / f.g * 100, 7.9, 0.1, 'lif');
  });
});

describe('arama — kullanıcının yazdığı biçim doğru satırı buluyor', () => {
  const ilk = (q) => (J(`seedFoodMatches(${JSON.stringify(q)}, 3)`)[0] || {}).n;
  const ara = (q) => J(`seedFoodMatches(${JSON.stringify(q)}, 5)`).map((x) => x.n);

  test('pilav sorgusu pilavı getirir, sade satırı değil', () => {
    assert.strictEqual(ilk('baldo pilav'), 'Baldo pilavı');
    assert.strictEqual(ilk('basmati pilav'), 'Basmati pilavı');
  });
  test('çiğ ölçüm bulunuyor', () => {
    assert.ok(ara('çiğ baldo').includes('Baldo pirinç (çiğ)'));
    assert.ok(ara('çiğ bonfile').includes('Dana bonfile (çiğ)'));
  });
  test('"bonfile" ve "tam buğday ekmeği" doğru satıra gidiyor', () => {
    assert.strictEqual(ilk('bonfile'), 'Dana bonfile');
    assert.strictEqual(ilk('tam buğday ekmeği'), 'Tam buğday ekmek');
  });
  test('"sıvı yağ" ayçiçek yağını buluyor', () => {
    assert.strictEqual(ilk('sıvı yağ'), 'Ayçiçek yağı');
  });
});
