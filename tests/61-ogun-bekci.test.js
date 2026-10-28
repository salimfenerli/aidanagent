/**
 * 61 — ÖĞÜN BEKÇİSİ (17 Eki 2026)
 *
 * Salim: "bugün de yemek yemeyi unuttum, 1 öğün yedim". Plan öğün saatlerini
 * taşıyordu ("13:00 · Makarna — 300 g") ama hiçbir bildirim kullanmıyordu.
 *
 * Kilitlenenler:
 *  - saat PLANDAN gelir (önekli kalem yoksa ping yok — uydurma saat yok)
 *  - ana öğün 3, ara öğün 2 ping; Yedim/Atladım/kayıt susturur; ertele tek ping
 *  - kaçan tur telafi edilmez, sıradaki öğün başlayınca eskisi susar
 *  - KAPI: scheduled() her tur çağırır, push ogun alanını taşır, sw.js + tasks.js köprüsü,
 *    ajan.js Yedim plandaki kalemleri tek kez kaydeder, Geri al hepsini geri alır
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const BLOK = W.slice(W.indexOf('// 🍽️ ÖĞÜN BEKÇİSİ (17 Eki 2026)'), W.indexOf('// 🍽️ ÖĞÜN BEKÇİSİ SONU'));
const ctx = { console, Date, JSON, Math, String, Array, Object, Number, encodeURIComponent };
vm.createContext(ctx);
vm.runInContext(BLOK + '\nthis.G = ogunGruplari; this.D = ogunBekciDue; this.P = ogunBekciPayload;', ctx);
const js = (x) => JSON.parse(JSON.stringify(x));
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// 2026-10-17 Cumartesi (cmt)
const TARIH = '2026-10-17';
const m = (name, slot, kcal) => ({ id: Math.random(), name, slot, kcal, protein: 10 });
const veri = () => ({
  diet: {
    activePlanId: 2,
    days: {},
    plans: [
      { id: 1, name: 'Eski', weekly: false, meals: { all: [m('08:00 · Simit', 'kahvalti', 300)] } },
      { id: 2, name: 'Bulk', weekly: true, meals: {
        all: [m('07:15 · Haşlanmış yumurta — 6 adet (300 g)', 'kahvalti', 432), m('07:15 · Bal — 2 yemek kaşığı', 'kahvalti', 128),
          m('10:00 · Muz — 1 adet', 'atistirma', 105), m('Saatsiz kalem', 'aksam', 100)],
        cmt: [m('14:30 · Makarna — 300 g', 'ogle', 500), m('19:30 · Dana bonfile — 150 g', 'aksam', 300)],
        pzt: [m('13:00 · Yemekhane (tahmini)', 'ogle', 700)],
      } },
    ],
  },
});
const due = (d, saat) => js(ctx.D(d, TARIH, hm(saat))).map(x => x.g.saat + ':' + x.tur);

describe('saatler planDAN', () => {
  test('aktif plan + günün kovası, saatsiz kalem yok, sıralı', () => {
    const g = js(ctx.G(veri(), TARIH));
    assert.deepStrictEqual(g.map(x => [x.saat, x.slot]), [['07:15', 'kahvalti'], ['10:00', 'atistirma'], ['14:30', 'ogle'], ['19:30', 'aksam']]);
    assert.deepStrictEqual(g[0].kalemler, ['Haşlanmış yumurta', 'Bal']);
  });
  test('🔒 önekli kalem yoksa ping YOK', () => {
    const d = veri(); d.diet.plans[1].meals = { all: [m('Yumurta', 'kahvalti', 100)] };
    assert.deepStrictEqual(due(d, '07:15'), []);
  });
});

describe('nag kuralları', () => {
  test('ana öğün: saatinde, +20, +45 — sonra sus', () => {
    const d = veri();
    assert.deepStrictEqual(due(d, '14:30'), ['14:30:ilk']);
    assert.deepStrictEqual(due(d, '14:33'), []);              // aynı pencere iki kez atılmaz
    assert.deepStrictEqual(due(d, '14:50'), ['14:30:tekrar']);
    assert.deepStrictEqual(due(d, '15:15'), ['14:30:son']);
    assert.deepStrictEqual(due(d, '15:40'), []);
  });
  test('ara öğün 2 ping', () => {
    const d = veri();
    assert.deepStrictEqual(due(d, '10:00'), ['10:00:ilk']);
    assert.deepStrictEqual(due(d, '10:25'), ['10:00:son']);
    assert.deepStrictEqual(due(d, '10:45'), []);
  });
  test('Yedim / Atladım susturur', () => {
    const d = veri();
    due(d, '14:30');
    d.ogunBekci.g['14:30'].d = 'yedi';
    assert.deepStrictEqual(due(d, '14:50'), []);
  });
  test('o pencerede girilmiş öğün kaydı (sohbetten de) susturur', () => {
    const d = veri();
    d.diet.days[TARIH] = { meals: [{ name: 'tost', at: '14:05' }] };
    assert.deepStrictEqual(due(d, '14:30'), []);
    assert.deepStrictEqual(due(d, '19:30'), ['19:30:ilk']);   // öğlen kaydı akşamı susturmaz
  });
  test('ertele: yalnız erteleme saatinde tek ping', () => {
    const d = veri();
    due(d, '14:30');
    d.ogunBekci.g['14:30'] = { n: 1, e: hm('14:45') };
    assert.deepStrictEqual(due(d, '14:50'), []);              // nag yerine erteleme
    assert.deepStrictEqual(due(d, '14:45'), ['14:30:ertele']);
    assert.deepStrictEqual(due(d, '14:47'), []);
  });
  test('kaçan tur telafi edilmez, sıradaki öğün başlayınca eskisi susar', () => {
    const d = veri();
    assert.deepStrictEqual(due(d, '07:40'), []);              // 07:35 turu kaçtı
    assert.deepStrictEqual(due(d, '10:00'), ['10:00:ilk']);   // 07:15 artık sormaz
  });
  test('yeni gün → durum sıfırlanır', () => {
    const d = veri(); d.ogunBekci = { tarih: '2026-10-16', g: { '14:30': { d: 'yedi' } } };
    assert.deepStrictEqual(due(d, '14:30'), ['14:30:ilk']);
  });
  test('payload: tag öğün başına, url + ogun, Yedim/15 dk', () => {
    const p = js(ctx.P({ g: { saat: '14:30', slot: 'ogle', kalemler: ['Makarna', 'Zeytinyağı'] }, tur: 'ilk' }));
    assert.strictEqual(p.tag, 'aidan-ogun-14:30');
    assert.strictEqual(p.ogun, '14:30');
    assert.strictEqual(p.url, '/?ogun=14%3A30');
    assert.match(p.title, /14:30 · Öğle/);
    assert.match(p.message, /Makarna, Zeytinyağı/);
    assert.deepStrictEqual(p.actions.map(a => a.action), ['yedim', 'ertele']);
  });
});

describe('KAPI — tel çekildi mi', () => {
  test('scheduled() her turda runOgunBekci, kapatma ayarı var', () => {
    const sch = W.slice(W.indexOf('async scheduled(event, env, ctx)'));
    assert.match(sch.slice(0, 1500), /jobs\.push\(runOgunBekci\(env\)\);/);
    assert.match(W, /settings \|\| \{\}\)\.ogunBekci === false/);
  });
  test('sendPushToAll ogun alanını taşır, sw.js iletir', () => {
    assert.match(W, /ogun: payload\.ogun \|\| null/);
    const sw = readText('sw.js');
    assert.match(sw, /ogun = \(p\.data && p\.data\.ogun\) \|\| null/);
    assert.match(sw, /'\/\?ogun=' \+ encodeURIComponent\(d\.ogun\)/);
    assert.match(sw, /type: 'OGUN_ACTION'/);
  });
  test('tasks.js köprüsü ?ogun ve SW mesajını ajan.js\'e iletir', () => {
    const t = readText('tasks.js');
    assert.match(t, /q\.get\('ogun'\)/);
    assert.match(t, /OGUN_ACTION/);
    assert.match(t, /loadModule\('ajan'\)\.then\(\(\) => ogunBekciAksiyon/);
  });
});

describe('KAPI — ajan.js Yedim / Geri al / ertele (PWA)', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'foods.js', 'harcama.js', 'ajan.js'] });
  after(() => A.close());
  const kur = () => A.evalIn(`(function(){ ensureDiet(); const id = 99;
    data.diet.plans.push({ id, name: 'T', weekly: false, meals: { all: [
      { id: 1, name: '13:00 · Makarna — 300 g', slot: 'ogle', kcal: 500, protein: 17, carb: 90, fat: 3 },
      { id: 2, name: '13:00 · Zeytinyağı — 1 yk', slot: 'ogle', kcal: 90, protein: 0, carb: 0, fat: 10 },
      { id: 3, name: '19:30 · Tavuk', slot: 'aksam', kcal: 300, protein: 40 } ] } });
    data.diet.activePlanId = id; delete data.ogunBekci;
    const g = data.diet.days[today()]; if (g) g.meals = []; })()`);
  const ogunler = () => JSON.parse(JSON.stringify(A.evalIn('((data.diet.days[today()]||{}).meals||[]).map(m => [m.name, m.kcal, m.bekci])')));
  test('open → soru kartı, kayıt yok', () => {
    kur();
    A.evalIn("ogunBekciAksiyon('13:00', 'open')");
    const el = A.window.document.getElementById('ogunSheet');
    assert.ok(el && /yedin mi/.test(el.textContent) && /Makarna/.test(el.textContent));
    assert.strictEqual(ogunler().length, 0);
    assert.deepStrictEqual(A.errors, []);
  });
  test('Yedim → yalnız o saatin kalemleri, plandaki kaloriyle, bir kez', () => {
    kur();
    A.evalIn("ogunBekciAksiyon('13:00', 'yedim')");
    A.evalIn("ogunBekciAksiyon('13:00', 'yedim')");          // çift dokunuş
    assert.deepStrictEqual(ogunler(), [['13:00 · Makarna — 300 g', 500, '13:00'], ['13:00 · Zeytinyağı — 1 yk', 90, '13:00']]);
    assert.strictEqual(A.evalIn("data.ogunBekci.g['13:00'].d"), 'yedi');
  });
  test('Geri al → kayıt ve işaret geri', () => {
    kur();
    A.evalIn("ogunBekciAksiyon('13:00', 'yedim')");
    A.evalIn("ogunBekciAksiyon('13:00', 'geri')");
    assert.deepStrictEqual(ogunler(), []);
    assert.strictEqual(A.evalIn("JSON.stringify(data.ogunBekci.g['13:00'] || null)"), 'null');
  });
  test('ertele → 5 dk katına yuvarlanmış e, atla → d', () => {
    kur();
    A.evalIn("ogunBekciAksiyon('19:30', 'ertele')");
    const e = A.evalIn("data.ogunBekci.g['19:30'].e");
    assert.ok(e % 5 === 0 && e > 0);
    A.evalIn("ogunBekciAksiyon('19:30', 'atla')");
    assert.strictEqual(A.evalIn("data.ogunBekci.g['19:30'].d"), 'atla');
  });
  test('🔒 bozuk saat → hiçbir şey olmaz', () => {
    kur();
    A.evalIn("ogunBekciAksiyon('25:99', 'yedim'); ogunBekciAksiyon('<img>', 'yedim')");
    assert.deepStrictEqual(ogunler(), []);
  });
});
