/**
 * 46 — KAHVALTI YUMURTA SAYISI + SIMIT HAVUZDAN CIKTI (25 Eyl 2026)
 *
 * Salim'in geri bildirimi: "2 yumurta az, ben 6 tane yiyorum" ve "simit ne
 * alaka". Kok neden: yumurta tabani herkes icin 2 idi ve kirpma adimlari
 * gun proteini bandin ustune cikinca ilk kahvaltiyi (en yuksek proteinli
 * ogun) kucultuyordu; simit ise kahvalti/ara sablonlarinda ve cantada capa.
 *
 * Sozlesme:
 *   · tercih.yumurta (2..8) varsa kahvalti HER GUN yumurtali ve tam o sayida
 *   · hicbir kirpma adimi o yumurtayi azaltmaz (diger ogunler kuculur)
 *   · ayar yoksa eski davranis (taban 2) aynen
 *   · Simit hicbir varsayilan sablonda ve cantada yok
 *   · tercih yazicilari (diyet / dongu) yumurta sayisini kaybetmez
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load');

const app = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js'] });
after(() => { try { app.close(); } catch (_) {} });
const E = (kod) => app.evalIn(kod);
const J = (kod) => JSON.parse(E('JSON.stringify(' + kod + ')'));

const PROGRAM = {
  days: [{ dow: 1, type: 'strength' }, { dow: 2, type: 'strength' }, { dow: 3, type: 'fight' },
    { dow: 4, type: 'rest' }, { dow: 5, type: 'strength' }, { dow: 6, type: 'fight' }, { dow: 0, type: 'strength' }],
};

function kur(tercih) {
  E('ensureDiet(); data.diet.calc = {sex:"male",age:16,height:184,weight:69};' +
    'data.diet.weights = [{date:"2026-09-13",kg:69}];' +
    'ensureNutrition(); data.diet.nut.hedef = "kas"; data.diet.nut.sablon = 0;' +
    'data.diet.nut.tercih = ' + JSON.stringify(tercih || null) + ';' +
    'data.program = ' + JSON.stringify(PROGRAM) + ';');
}
const gun = (dow) => J('(function(){const p=nutProfile();' +
  'const tip=nutDayType(' + dow + ',data.program);const t=nutTargets(p,tip,"kas");' +
  'return nutBuildDay(t,p.weight,nutGunSablon(data.diet.nut,' + dow + '));})()');
const yumurta = (m) => {
  const x = (m.items || []).find(i => i.n === 'Yumurta' && i.adet > 0);
  return x ? x.adet : 0;
};

describe('1 — kahvalti yumurta sayisi kullanicinin', () => {
  test('tercih.yumurta = 6 → yedi gunun yedisinde kahvaltida 6 yumurta', () => {
    kur({ diyet: 'yok', sevmem: [], favori: [], yumurta: 6 });
    for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
      const k = gun(dow).find(m => m.slot === 'kahvalti');
      assert.ok(k, 'kahvalti yok (dow ' + dow + ')');
      assert.strictEqual(yumurta(k), 6, 'dow ' + dow + ': kahvaltida ' + yumurta(k) + ' yumurta');
    }
  });

  test('6 yumurtali gunde protein diger ogunlerden kirpilir, gun makul kalir', () => {
    kur({ diyet: 'yok', sevmem: [], favori: [], yumurta: 6 });
    for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
      const g = gun(dow);
      const p = g.reduce((a, m) => a + m.protein, 0);
      // 69 kg: tavan 2.5 g/kg = 172; kullanicinin sabit yumurtasi yuzunden
      // bir miktar asim kabul, ama kontrolsuz buyume yok.
      assert.ok(p <= 69 * 2.7, 'dow ' + dow + ': gun proteini ' + p + ' g');
    }
  });

  test('ayar yoksa eski davranis: yumurtali kahvaltida en az 2, zorunlu yumurta yok', () => {
    kur(null);
    assert.strictEqual(J('nutTercih().yumurta'), 0);
    for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
      const k = gun(dow).find(m => m.slot === 'kahvalti');
      const y = yumurta(k);
      assert.ok(y === 0 || y >= 2, 'dow ' + dow + ': ' + y + ' yumurta');
    }
  });

  test('gecersiz degerler normalize: 1 → 0 (otomatik), 20 → 8, "6" → 6', () => {
    assert.strictEqual(J('nutYumurtaAdet(1)'), 0);
    assert.strictEqual(J('nutYumurtaAdet(20)'), 8);
    assert.strictEqual(J('nutYumurtaAdet("6")'), 6);
    assert.strictEqual(J('nutYumurtaAdet(undefined)'), 0);
  });

  test('diyet tipi ve favori dongusu yumurta sayisini silmez', () => {
    kur({ diyet: 'yok', sevmem: [], favori: [], yumurta: 6 });
    E('renderNutrition = function(){}; save = function(){};');
    E('setNutDiyet("laktozsuz")');
    assert.strictEqual(J('nutTercih().yumurta'), 6);
    E('nutTercihDongu("Muz")');
    assert.strictEqual(J('nutTercih().yumurta'), 6);
    E('setNutYumurta(0)');
    assert.strictEqual(J('nutTercih().yumurta'), 0);
  });
});

describe('2 — simit varsayilan havuzda yok', () => {
  test('hicbir sablonda ve canta listesinde Simit yok', () => {
    const havuz = J('Object.keys(NUT_TEMPLATES).map(k => NUT_TEMPLATES[k]).flat()' +
      '.map(t => [t.protein, t.carb, t.yag].concat(t.ek || []))');
    assert.ok(!havuz.flat().includes('Simit'), 'sablonda simit var');
    assert.ok(!J('NUT_TASINIR.carb').includes('Simit'), 'cantada simit var');
  });

  test('yeni sablon kalemleri besin tablosunda var', () => {
    for (const ad of ['Granola', 'Pirinç patlağı galeta', 'Kepekli ekmek']) {
      assert.ok(J('!!nutFood(' + JSON.stringify(ad) + ')'), ad + ' tabloda yok');
    }
  });
});
