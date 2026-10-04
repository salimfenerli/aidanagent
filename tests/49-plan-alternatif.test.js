/**
 * 49 — PLAN ALTERNATİFLERİ (29 Eyl 2026)
 *
 * Salim: "uygulama alternatif de versin — patates yerine şu kadar pilav da
 * yiyebilirsin". Plandaki kalem aynı roldeki besinle değiştirilir; miktar
 * rolün ANA MAKROSU eşitlenerek hesaplanır (karbonhidrat ↔ karbonhidrat,
 * protein ↔ protein). Sayılar foods.js'ten, uydurma yok.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { loadApp, fixture, read: readText } = require('./helpers/load');

const A = loadApp({ seed: fixture(), scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js'] });
after(() => { try { A.close(); } catch (_) {} });
const J = (k) => JSON.parse(A.evalIn('JSON.stringify(' + k + ')'));

const PATATES = { id: 901, slot: 'aksam', name: '19:30 · Haşlanmış patates — 4 adet (540 g)', kcal: 468, protein: 10.4, carb: 108.4, fat: 0.4 };
const TAVUK = { id: 902, slot: 'aksam', name: '19:30 · Tavuk göğsü — 120 g (pişmiş)', kcal: 198, protein: 37.2, carb: 0, fat: 4.3 };
const YEMEKHANE = { id: 903, slot: 'ogle', name: '13:00 · Yemekhane (tahmini) · Pilav — 1 porsiyon (150 g)', kcal: 245 };
const YUMURTA = { id: 904, slot: 'kahvalti', name: '07:15 · Haşlanmış yumurta — 6 adet (300 g)', kcal: 432 };

A.evalIn(`ensureDiet(); data.diet.plans = [{ id: 77, name: 'Test', weekly: false,
  meals: Object.assign(emptyPlanMeals(), { all: ${JSON.stringify([PATATES, TAVUK, YEMEKHANE, YUMURTA])} }) }];
  data.diet.activePlanId = 77; data.diet.days = {};`);

const per = (ad, key) => J(`(function(){ const f = TURK_FOODS.find(x => x.n === ${JSON.stringify(ad)}); return f[${JSON.stringify(key)}] / f.g; })()`);
const alts = (it) => J('planAltList(' + JSON.stringify(it) + ')');

describe('ayrıştırma', () => {
  test('saat, ad ve gram okunuyor', () => {
    assert.deepStrictEqual(J('planAltParse(' + JSON.stringify(PATATES.name) + ')'), { saat: '19:30', ad: 'Haşlanmış patates', gram: 540 });
    assert.strictEqual(J('planAltParse(' + JSON.stringify(TAVUK.name) + ')').gram, 120);
  });
  test('yemekhane ve yumurta alternatif almaz', () => {
    assert.strictEqual(alts(YEMEKHANE).length, 0, 'tepsiyi kullanıcı seçmiyor');
    assert.strictEqual(alts(YUMURTA).length, 0, '6 yumurta kullanıcının sabit tercihi');
  });
});

describe('eşdeğer miktar — ana makro korunur', () => {
  test('patates → pilav: karbonhidrat aynı kalıyor', () => {
    const a = alts(PATATES);
    const pilav = a.find(x => x.ad === 'Baldo pilavı');
    assert.ok(pilav, 'baldo pilavı listede yok');
    const hedef = per('Haşlanmış patates', 'c') * 540;
    assert.ok(Math.abs(pilav.carb - hedef) / hedef < 0.03, pilav.carb + ' vs ' + hedef.toFixed(1));
    assert.ok(!a.some(x => x.ad === 'Haşlanmış patates'), 'kendisi listelenmemeli');
  });
  test('tavuk → bonfile: protein aynı, kalori farkı gösteriliyor', () => {
    const b = alts(TAVUK).find(x => x.ad === 'Dana bonfile');
    const hedef = per('Tavuk göğsü', 'p') * 120;
    assert.ok(Math.abs(b.protein - hedef) / hedef < 0.05);
    assert.ok(b.kcal > TAVUK.kcal, 'bonfile daha yağlı — kalori yüksek çıkmalı');
  });
  test('adetli besinde adet de yazılıyor', () => {
    const muz = alts({ id: 1, slot: 'atistirma', name: '10:00 · Pirinç patlağı galeta — 3 adet (27 g)', kcal: 105 }).find(x => x.ad === 'Muz');
    assert.match(muz.etiket, /adet \(\d+ g\)/);
  });
  test('sevmediği besin listelenmez', () => {
    A.evalIn(`data.diet.nut = data.diet.nut || {}; data.diet.nut.tercih = { sevmem: ['Basmati pilavı'] };`);
    assert.ok(!alts(PATATES).some(x => x.ad === 'Basmati pilavı'));
    A.evalIn('data.diet.nut.tercih = {};');
  });
});

describe('seçim ve ekran', () => {
  test('alternatif seçilince plan kalemi yendi sayılır, günlüğe alternatif yazılır', () => {
    A.evalIn('togglePlanEaten(901)');
    const i = J('planAltList(' + JSON.stringify(PATATES) + ').findIndex(x => x.ad === "Bulgur pilavı")');
    A.evalIn('planAltPick(901, ' + i + ')');
    const log = J('dietDay(false).meals.filter(m => m.planId === 901)');
    assert.strictEqual(log.length, 1, 'eski kayıt silinmeli, tek kayıt kalmalı');
    assert.match(log[0].name, /^19:30 · Bulgur pilavı/);
    assert.ok(log[0].carb > 100);
  });
  test('plan listesinde Değiştir düğmesi ve açılan liste', () => {
    A.evalIn('_planAltOpen = 902; renderDietPlan();');
    const el = A.window.document.getElementById('planList');
    assert.ok(el.querySelector('.plan-alt-btn'), 'düğme yok');
    assert.ok(el.querySelectorAll('.plan-alt-row').length >= 3, 'alternatif satırları yok');
    assert.match(el.textContent, /yerine: Bulgur pilavı/);
    assert.ok(A.window.document.getElementById('planAltStyle'), 'stil modülle inmeli');
  });
});

describe('mimari', () => {
  test('kod ilk yüklemede değil, foods.js içinde', () => {
    assert.match(readText('core.js'), /typeof planAltHtml === 'function'/);
    assert.ok(!/function planAltList|function newPlan/.test(readText('core.js')));
    assert.match(readText('foods.js'), /function newPlan\(/);
  });
});
