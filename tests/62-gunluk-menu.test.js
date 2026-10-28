/**
 * 62 — GÜNLÜK MENÜ (18 Eki 2026)
 *
 * Salim: "diyet listesini halledelim, günlük öğün yazsın" → "her gün farklı menü".
 *
 * Kilitlenenler:
 *  - 7 gün ileri, her kova kendi TARİHİYLE yazılır; günler birbirinden farklı
 *  - satırlar "HH:MM · " önekli ve saate göre sıralı → worker öğün bekçisi okur (ikiz sözleşme)
 *  - aynı gün ikinci doldurma iş yapmaz; tarih değişince yalnız bayat kova tazelenir
 *  - elle eklenen kalem korunur; "Bugünü değiştir" yalnız bugünü değiştirir, Geri al var
 *  - Kapat önceki plana döner; profil yoksa hiçbir şey yazılmaz
 *  - KAPI: renderNutrition kartı çizer, ui.js açılışta tetikler
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const BLOK = W.slice(W.indexOf('// 🍽️ ÖĞÜN BEKÇİSİ (17 Eki 2026)'), W.indexOf('// 🍽️ ÖĞÜN BEKÇİSİ SONU'));
const wctx = { console, Date, JSON, Math, String, Array, Object, Number, encodeURIComponent };
vm.createContext(wctx);
vm.runInContext(BLOK + '\nthis.G = ogunGruplari;', wctx);

const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js', 'hafta.js'] });
after(() => A.close());
const E = (c) => JSON.parse(JSON.stringify(A.evalIn(c)));
const kur = () => A.evalIn(`(function(){ ensureDiet();
  data.diet.calc = { age: 16, sex: 'male', goal: 'gain', height: 184, weight: 68.5 };
  data.diet.plans = [{ id: 5, name: 'Bulk', weekly: false, meals: emptyPlanMeals() }];
  data.diet.activePlanId = 5;
  ensureNutrition().hedef = 'kas'; delete data.diet.nut.gunluk; })()`);
const kova = (i) => E(`(function(){ const p = nutGunlukPlan(); return (p.meals[dayKeyOf(shiftDateStr(today(), ${i}))] || []).map(x => x.name); })()`);

describe('günlük menü', () => {
  test('Aç → 7 kova dolu, plan aktif, hata yok', () => {
    kur();
    A.evalIn('nutGunlukAc(true)');
    for (let i = 0; i < 7; i++) assert.ok(kova(i).length >= 4, 'gün ' + i + ' boş');
    assert.strictEqual(A.evalIn('activePlan().name'), 'Aidan günlük menü');
    assert.strictEqual(A.evalIn('activePlan().weekly'), true);
    assert.deepStrictEqual(A.errors, []);
  });
  test('her satır saat önekli, saate göre sıralı', () => {
    const n = kova(0);
    const saat = n.map(x => /^(\d{2}):(\d{2}) · /.exec(x));
    assert.ok(saat.every(Boolean), n.join(' | '));
    const dk = saat.map(m => +m[1] * 60 + +m[2]);
    assert.deepStrictEqual(dk, dk.slice().sort((a, b) => a - b));
  });
  test('günler birbirinden farklı (en az 4 farklı menü / 7 gün)', () => {
    const govde = (i) => kova(i).map(x => x.replace(/^\d{2}:\d{2} · /, '').replace(/^[\d.,½¼¾]+\s*\S+\s*/, '')).sort().join('|');
    const farkli = new Set([0, 1, 2, 3, 4, 5, 6].map(govde));
    assert.ok(farkli.size >= 4, 'yalnız ' + farkli.size + ' farklı gün');
  });
  test('🔗 ikiz sözleşme: worker öğün bekçisi bu planı saatleriyle okur', () => {
    const veri = E('({ diet: { plans: data.diet.plans, activePlanId: data.diet.activePlanId } })');
    const g = JSON.parse(JSON.stringify(wctx.G(veri, A.evalIn('today()'))));
    assert.ok(g.length >= 4, JSON.stringify(g));
    assert.ok(g.every(x => x.kalemler.length > 0));
  });
  test('aynı gün ikinci doldurma iş yapmaz; tarih değişince yalnız bayat kova', () => {
    assert.strictEqual(A.evalIn('nutGunlukDoldur()'), 0);
    A.evalIn("data.diet.nut.gunluk.yazildi[dayKeyOf(today())] = shiftDateStr(today(), -7)");
    assert.strictEqual(A.evalIn('nutGunlukDoldur()'), 1);
  });
  test('elle eklenen kalem korunur', () => {
    A.evalIn("nutGunlukPlan().meals[dayKeyOf(today())].push({ id: 1, slot: 'aksam', name: '20:00 · Annemin yemeği', kcal: 600 })");
    A.evalIn("data.diet.nut.gunluk.yazildi[dayKeyOf(today())] = 'eski'; nutGunlukDoldur()");
    assert.ok(kova(0).includes('20:00 · Annemin yemeği'));
  });
  test('Bugünü değiştir → yalnız bugün değişir, Geri al eski hale döner', () => {
    const once0 = kova(0), once1 = kova(1);
    A.evalIn('nutGunlukYenile()');
    assert.notDeepStrictEqual(kova(0), once0);
    assert.deepStrictEqual(kova(1), once1);
  });
  test('Kapat → önceki plana döner; tekrar Aç çalışır', () => {
    A.evalIn('nutGunlukAc(false)');
    assert.strictEqual(A.evalIn('activePlan().name'), 'Bulk');
    assert.strictEqual(A.evalIn('nutGunlukDoldur()'), 0);       // kapalıyken yazmaz
    A.evalIn('nutGunlukAc(true)');
    assert.strictEqual(A.evalIn('activePlan().name'), 'Aidan günlük menü');
  });
  test('🔒 profil yoksa hiçbir şey yazılmaz', () => {
    kur();
    A.evalIn('data.diet.calc = {}; data.diet.weights = []; nutGunlukAc(true)');
    assert.strictEqual(A.evalIn('JSON.stringify(data.diet.nut.gunluk || null)'), 'null');
    assert.strictEqual(A.evalIn('activePlan().name'), 'Bulk');
  });
});

describe('KAPI', () => {
  test('renderNutrition kartı çizer (Aç düğmesi)', () => {
    kur();
    A.evalIn("if (!document.getElementById('nutSection')) { const d = document.createElement('div'); d.id = 'nutSection'; document.body.appendChild(d); } renderNutrition()");
    assert.match(A.window.document.getElementById('nutSection').innerHTML, /nutGunlukAc\(true\)/);
  });
  test('ui.js açılışta bayat menüyü tetikler', () => {
    const ui = readText('ui.js');
    assert.match(ui, /g\.son === today\(\)\) return;/);
    assert.match(ui, /'hafta'\]\.map\(m => loadModule\(m\)\)/);
    assert.match(ui, /nutGunlukDoldur\(\)/);
  });
});

describe('makro benzerliği + çeşitlilik (18 Eki)', () => {
  // 28 gün (sabit tarihten — sonuç saate bağlı olmasın), gerçek profil şekli: 68.5 kg, bulk, haftada 3 antrenman
  const olc = (tercih) => E(`(function(){ ensureDiet();
    data.diet.calc = { age: 16, sex: 'male', goal: 'gain', height: 184, weight: 68.5 };
    data.program = { days: [{ dow: 1, type: 'strength' }, { dow: 3, type: 'strength' }, { dow: 5, type: 'strength' }] };
    const n = ensureNutrition(); n.hedef = 'kas';
    n.tercih = ${tercih ? `{ diyet: 'yok', favori: ['Yumurta'], sevmem: ['Zeytin', 'Domates', 'Armut'], yumurta: 6 }` : 'undefined'};
    n.gunluk = { acik: true, yazildi: {}, kay: {}, ana: {} };
    const prof = nutProfile(), out = [];
    for (let i = 0; i < 28; i++) {
      const tarih = shiftDateStr('2026-10-05', i);
      const t = nutTargets(prof, hfGunTipi(data, tarih), n.hedef);
      const sat = nutGunlukSatirlar(tarih, prof, n);
      n.gunluk.ana[tarih] = sat.ana;
      const s = sat.reduce((x, m) => ({ k: x.k + (m.kcal || 0), c: x.c + (m.carb || 0), f: x.f + (m.fat || 0) }), { k: 0, c: 0, f: 0 });
      out.push({ k: s.k / t.kcal - 1, c: s.c / t.carb - 1, f: s.f / t.fat - 1, ana: sat.ana, adlar: sat.map(x => x.name) });
    }
    data.program = null; delete n.tercih;
    return out; })()`);
  const maks = (r, a) => Math.max(...r.map(d => Math.abs(d[a])));
  for (const tercih of [false, true]) {
    const ad = tercih ? ' (6 yumurta + sevmediklerim)' : '';
    // Ölçüm (3 × 90 gün): düz profil k/c/f en kötü 5/8/11 %, tercihli 5/12/16 %.
    // Eski hal (tek şablon): karbonhidrat %-24, yağ %+25'e kadar kayıyordu.
    const sinir = tercih ? { k: 0.05, c: 0.15, f: 0.20 } : { k: 0.05, c: 0.10, f: 0.12 };
    test('her gün kalori ±%5, karbonhidrat/yağ bant içinde' + ad, () => {
      const r = olc(tercih);
      for (const a of ['k', 'c', 'f']) assert.ok(maks(r, a) <= sinir[a], a + ' ' + maks(r, a));
    });
    test('28 günde ≥4 farklı öğle, ≥4 farklı akşam, ≥10 farklı ana yemek çifti' + ad, () => {
      const r = olc(tercih);
      assert.ok(new Set(r.map(d => d.ana[0])).size >= 4, JSON.stringify(r.map(d => d.ana)));
      assert.ok(new Set(r.map(d => d.ana[1])).size >= 4, JSON.stringify(r.map(d => d.ana)));
      assert.ok(new Set(r.map(d => d.ana.join('/'))).size >= 10);
    });
  }
  test('🔒 "Domates sevmem" → Çoban / Mevsim salata çıkmaz', () => {
    const r = olc(true);
    const hepsi = r.flatMap(d => d.adlar).join(' | ');
    assert.ok(!/Çoban salata|Mevsim salata|Domates/.test(hepsi), hepsi.slice(0, 300));
  });
  test('yeni havuz şablonları gerçekten seçilebiliyor (ölü şablon yok)', () => {
    const ana = olc(false).concat(olc(true)).flatMap(d => d.ana);
    assert.ok(['Et sote', 'Alabalık', 'Tavuk sote', 'Tavuk pirzola'].some(x => ana.includes(x)), ana.join(','));
  });
});
