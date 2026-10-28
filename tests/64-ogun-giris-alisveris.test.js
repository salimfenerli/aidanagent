/**
 * 64 — ÖĞÜN GİRİŞİ (kullanıcı gibi deneme) + HAFTALIK ALIŞVERİŞ LİSTESİ (18 Eki 2026)
 *
 * Salim: "bi kullanıcı gibi öğün yazdırmayı dene, kaloriler doğru mu" +
 * "haftalık yemeğe göre alışveriş listesi de verse iyi olur".
 * Denemede bulunan sessiz hatalar (sohbet VE yemek ekleme penceresi aynı çözücüyü kullanır):
 *  - "10 badem" → birim zaten "10 adet" → 690 kcal (gerçek 69)
 *  - "1 avuç fındık" → 12 g'lık birim → 75 kcal (avuç ≈ 30 g)
 *  - "yarım ekmek" → yarım DİLİM 40 kcal (≈125 g, 333)
 *  - "pizza 2 dilim" / "makarna 200 gr" → hiç eşleşmiyordu (sondaki miktar)
 *  - "tavuk döner dürüm" → 'dürüm' birim sanılıp atılıyor → porsiyon döner (323 yerine 488)
 *  - "200g tavuk" → Tavuk but (yağlı) → artık tavuk göğsü
 * Veritabanı: 498 kalemin 477'si Atwater (4P+4K+9Y) ile ±%15 tutarlı; kalan 21 açıklanabilir
 * (alkol, lif ağırlıklı sebze, şeker alkolü) — bu test o tutarlılığı kilitler.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load');

const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js', 'hafta.js', 'harcama.js', 'ajan.js'] });
after(() => A.close());
const E = (c) => JSON.parse(JSON.stringify(A.evalIn(c)));
const coz = (y) => E('ajanYemekCoz(' + JSON.stringify(y) + ')');

describe('öğün çözücü — kullanıcı cümleleri', () => {
  const vakalar = [
    ['3 yumurta', 'Yumurta', 216], ['10 badem', 'Badem', 69], ['5 zeytin', 'Zeytin', 23],
    ['1 avuç fındık', 'Fındık', 188], ['1 avuç badem', 'Badem', 173],
    ['yarım ekmek', 'Ekmek', 333], ['2 dilim ekmek', 'Ekmek', 160], ['2 ekmek', 'Ekmek', 160],
    ['pizza 2 dilim', 'Pizza', 586], ['makarna 200 gr', 'Makarna', 316], ['mercimek çorbası 1 kase', 'Mercimek çorbası', 150],
    ['tavuk döner dürüm', 'Tavuk dürüm', 488], ['adana dürüm', 'Adana dürüm', 602],
    ['200g tavuk', 'Tavuk göğsü', 331], ['200 gr tavuk göğsü', 'Tavuk göğsü', 331],
    ['1 ölçek protein tozu', 'Protein tozu', 117], ['2 yemek kaşığı fıstık ezmesi', 'Fıstık ezmesi', 188],
  ];
  for (const [cumle, ad, kcal] of vakalar) {
    test(cumle + ' → ' + ad + ' ' + kcal + ' kcal', () => {
      const r = coz(cumle);
      assert.ok(r.name.startsWith(ad), r.name);
      assert.strictEqual(r.kcal, kcal);
    });
  }
  test('🔒 eşleşmeyen → kalori null (uydurma yok)', () => {
    assert.strictEqual(coz('zxqw uydurma yemek').kcal, null);
  });
  test('Atwater tutarlılığı: bilinen istisnalar dışında her kalem ±%15', () => {
    const istisna = /çay|kahve|kola|bira|şarap|rakı|salatalık|çilek|karpuz|brokoli|karnabahar|limon|şirataki|gazoz|ice tea|sakız|kepeği|kakao|şurup/i;
    const kotu = E(`TURK_FOODS.filter(f => { const a = 4 * f.p + 4 * f.c + 9 * f.f; return f.k > 5 && Math.abs(a / f.k - 1) > 0.15; }).map(f => f.n)`)
      .filter(n => !istisna.test(n));
    assert.deepStrictEqual(kotu, []);
  });
});

describe('alışveriş listesi', () => {
  const kur = () => A.evalIn(`(function(){ ensureDiet();
    data.diet.calc = { age: 16, sex: 'male', goal: 'gain', height: 184, weight: 68.5 };
    const n = ensureNutrition(); n.hedef = 'kas'; delete n.gunluk;
    n.duzen = { kalk: '07:00', okul: { 1: { bas: '09:00', bit: '17:00' } }, antrenman: '17:00', yemekhane: true, yemekhaneSaat: '13:00' };
    data.diet.plans = [{ id: 3, name: 'Bulk', weekly: false, meals: emptyPlanMeals() }]; data.diet.activePlanId = 3;
    nutGunlukAc(true); })()`);
  test('7 günden toplanır; pişmiş yemek çiğ karşılığıyla, yemekhane yok', () => {
    kur();
    const liste = E('nutAlisverisListesi()');
    const adlar = liste.flatMap(g => g.kalemler.map(k => k.ad));
    assert.ok(adlar.length >= 10, adlar.join(','));
    for (const pismis of ['Pilav', 'Bulgur pilavı', 'Haşlanmış patates', 'Fırın patates', 'İzgara köfte', 'Tavuk sote']) {
      assert.ok(!adlar.includes(pismis), pismis + ' pişmiş haliyle listede');
    }
    assert.ok(!adlar.some(a => /yemekhane/i.test(a)));
    assert.ok(liste.every(g => g.kalemler.every(k => /\d/.test(k.miktar))));
  });
  test('yumurta adetle, sayılı birim tane sayısına çevrilir', () => {
    const k = E('nutAlisverisListesi()').flatMap(g => g.kalemler);
    const y = k.find(x => x.ad === 'Yumurta');
    assert.ok(y && /^\d+ adet$/.test(y.miktar), JSON.stringify(y));
  });
  test('eski satır (besin alanı yok) adından çözülür', () => {
    assert.deepStrictEqual(E("nutAlisSatir({ name: '07:15 · 6 adet Yumurta' })"), { ad: 'Yumurta', adet: 6 });
    assert.strictEqual(E("nutAlisSatir({ name: '13:00 · Okul yemekhanesi (tepsi)' })"), null);
  });
  test('KAPI: kart içinde liste açılır, işaret kaydedilir, metin kopyalanabilir', () => {
    kur();
    A.evalIn("if (!document.getElementById('nutSection')) { const d = document.createElement('div'); d.id = 'nutSection'; document.body.appendChild(d); } renderNutrition()");
    const det = A.window.document.querySelector('#nutSection details.nut-alis');
    assert.ok(det, 'liste bölümü yok');
    A.evalIn("nutAlisCiz(document.querySelector('#nutSection details.nut-alis'))");
    const kutu = det.querySelector('input[data-ad]');
    assert.ok(kutu);
    kutu.checked = true; kutu.dispatchEvent(new A.window.Event('change', { bubbles: true }));
    assert.strictEqual(A.evalIn('ensureNutrition().gunluk.alindi[' + JSON.stringify(kutu.dataset.ad) + ']'), true);
    assert.match(A.evalIn('nutAlisMetni()'), /^Et · tavuk · balık\n- /);
    assert.deepStrictEqual(A.errors, []);
  });
});
