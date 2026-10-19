/**
 * 67 — ÖĞÜN KARTI + AYARLAR TEMBEL MODÜLÜ (18 Eki 2026)
 *
 * Faz 2 ilk adımı: ana ekranda sıradaki öğün + "Yedim / Atladım" (ogun.js).
 * Yer açma: ayarlar + global arama kodu ayarlar.js'e taşındı; ui.js'te aynı
 * adlı yer tutucular (`_lz`) ilk çağrıda modülü indirir, modül onları ezer.
 *
 * Kilitlenenler:
 *  - öğün durumları worker bekçisiyle aynı kural (işaret / pencere kaydı / sıradaki başladı)
 *  - plan saatsizse kart gizli; bekleyen öğünde Yedim → kayıt + sayaç artar
 *  - yer tutucuların hepsinin gerçeği ayarlar.js'te; modül yüklenince ezilir
 *  - KAPI: asistan.html yer tutucusu, ui.js açılış kancası, ajanYenile kartı tazeler
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'foods.js', 'harcama.js', 'ajan.js', 'ayarlar.js', 'ogun.js'] });
after(() => A.close());
const E = (c) => JSON.parse(JSON.stringify(A.evalIn(c)));
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const kur = () => A.evalIn(`(function(){ ensureDiet();
  data.diet.plans = [{ id: 7, name: 'T', weekly: false, meals: { all: [
    { id: 1, name: '07:15 · Yumurta — 6 adet', slot: 'kahvalti', kcal: 432 },
    { id: 2, name: '13:00 · Makarna — 300 g', slot: 'ogle', kcal: 500 },
    { id: 3, name: '13:00 · Zeytinyağı — 1 yk', slot: 'ogle', kcal: 90 },
    { id: 4, name: '19:30 · Tavuk', slot: 'aksam', kcal: 300 },
    { id: 5, name: 'Saatsiz kalem', slot: 'atistirma', kcal: 50 } ] } }];
  data.diet.activePlanId = 7; delete data.ogunBekci;
  data.diet.days[today()] = { meals: [], water: 0 }; })()`);
const durum = (saat) => E(`bugunOgunleri(${hm(saat)}).map(g => g.saat + ':' + g.durum)`);

describe('öğün durumları', () => {
  test('saatsiz kalem yok; geçmiş / bekliyor / gelecek doğru', () => {
    kur();
    assert.deepStrictEqual(durum('06:00'), ['07:15:gelecek', '13:00:gelecek', '19:30:gelecek']);
    assert.deepStrictEqual(durum('13:20'), ['07:15:gecti', '13:00:bekliyor', '19:30:gelecek']);
    assert.deepStrictEqual(durum('22:00'), ['07:15:gecti', '13:00:gecti', '19:30:bekliyor']);
  });
  test('işaret ve pencere kaydı "tamam" sayılır, atla ayrı', () => {
    kur();
    A.evalIn("data.ogunBekci = { tarih: today(), g: { '07:15': { d: 'yedi' }, '19:30': { d: 'atla' } } }");
    A.evalIn("data.diet.days[today()].meals.push({ name: 'tost', at: '12:40' })");
    assert.deepStrictEqual(durum('20:00'), ['07:15:tamam', '13:00:tamam', '19:30:atla']);
  });
});

describe('kart (DOM)', () => {
  const el = () => A.window.document.getElementById('bugunOgun');
  test('bekleyen öğünde soru + Yedim/Atladım, sayaç', () => {
    kur();
    A.evalIn("data.ogunBekci = { tarih: today(), g: { '07:15': { d: 'yedi' } } }");
    A.evalIn(`(function(){ const D = Date; const sabit = new D(D.now()); sabit.setHours(13, 20, 0, 0);
      window.__D = D; Date = class extends D { constructor(...a) { return a.length ? new D(...a) : new D(sabit); } static now() { return sabit.getTime(); } };
      renderBugunOgun(); Date = window.__D; })()`);
    assert.strictEqual(el().style.display, '');
    assert.match(el().textContent, /1\/3 bugün/);
    assert.match(el().textContent, /13:00 · Öğle — yedin mi\?/);
    assert.match(el().textContent, /Makarna, Zeytinyağı/);
    assert.ok(el().querySelector('button[data-a="yedim"][data-s="13:00"]'));
    assert.ok(el().classList.contains('bekliyor'));
    assert.deepStrictEqual(A.errors, []);
  });
  test('Yedim düğmesi → kayıt yazılır, kart tazelenir', async () => {
    A.evalIn("_moduleLoads.ajan = Promise.resolve()");
    el().querySelector('button[data-a="yedim"]').click();
    await new Promise(r => setTimeout(r, 30));
    const m = E("(data.diet.days[today()].meals || []).map(x => x.bekci)");
    assert.deepStrictEqual(m, ['13:00', '13:00']);
    assert.strictEqual(A.evalIn("data.ogunBekci.g['13:00'].d"), 'yedi');
    A.evalIn("ogunSheetKapat()");
  });
  test('🔒 planda saatli öğün yoksa kart gizli', () => {
    kur();
    A.evalIn("data.diet.plans[0].meals.all = [{ id: 9, name: 'Yumurta', slot: 'kahvalti' }]; renderBugunOgun()");
    assert.strictEqual(el().style.display, 'none');
  });
});

describe('ayarlar.js yer tutucuları', () => {
  const ui = readText('ui.js'), ay = readText('ayarlar.js');
  const tutucular = [...ui.matchAll(/^function (\w+)\(\) \{ return _lz\('ayarlar', '(\w+)', arguments\); \}/gm)];
  test('her yer tutucunun gerçeği ayarlar.js\'te', () => {
    assert.ok(tutucular.length >= 8, 'yer tutucu sayısı ' + tutucular.length);
    for (const [, ad, ad2] of tutucular) {
      assert.strictEqual(ad, ad2);
      assert.match(ay, new RegExp('^function ' + ad + '\\(', 'm'), ad + ' ayarlar.js\'te yok');
    }
  });
  test('modül yüklenince yer tutucular ezilir (gerçek fonksiyon çalışır)', () => {
    for (const [, ad] of tutucular) {
      assert.ok(!/_lz\(/.test(String(A.window[ad])), ad + ' hâlâ yer tutucu');
    }
  });
  test('taşınan kod ui.js\'te kopya olarak kalmadı', () => {
    for (const ad of ['runGlobalSearch', 'renderStorageInfo', 'renderCalendarSync', 'gsGoTask', 'createCalendarLink']) {
      assert.ok(!new RegExp('^function ' + ad + '\\([^)]*\\) \\{\\r?\\n', 'm').test(ui), ad + ' ui.js\'te hâlâ gövdesiyle duruyor');
    }
  });
});

describe('KAPI', () => {
  test('asistan.html kart yeri, ui.js açılış kancası, ajanYenile tazeler', () => {
    assert.match(readText('asistan.html'), /<div id="bugunOgun" style="display:none;"><\/div>/);
    const ui = readText('ui.js');
    assert.match(ui, /loadModule\('ogun'\)\.then\(\(\) => bugunBaslat\(\)\)/);
    assert.match(readText('ajan.js'), /if \(typeof renderBugunOgun === 'function'\) renderBugunOgun\(\);/);
  });
});

describe('worker — akşam öğün satırı + Pazar tek push', () => {
  const vm = require('vm');
  const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
  const BLOK = W.slice(W.indexOf('// 🍽️ ÖĞÜN BEKÇİSİ (17 Eki 2026)'), W.indexOf('// 🍽️ ÖĞÜN BEKÇİSİ SONU'));
  const ev = /function buildEvening\(data\) \{[\s\S]*?\n\}\n/.exec(W)[0];
  const ctx = { console, Date, JSON, Math, String, Array, Object, Number, encodeURIComponent,
    trToday: () => '2026-10-17', trDate: () => '2026-10-18', suggestMitForTomorrow: () => [] };
  vm.createContext(ctx);
  vm.runInContext(BLOK + '\n' + ev + '\nthis.EV = buildEvening;', ctx);
  const plan = { activePlanId: 1, plans: [{ id: 1, weekly: false, meals: { all: [
    { name: '07:15 · Yumurta', slot: 'kahvalti' }, { name: '13:00 · Makarna', slot: 'ogle' }, { name: '19:30 · Tavuk', slot: 'aksam' }] } }] };
  test('akşam özeti: işaret + pencere kaydı sayılır', () => {
    const data = { tasks: [], diet: Object.assign({ days: { '2026-10-17': { meals: [{ name: 'tost', at: '12:50' }] } } }, plan),
      ogunBekci: { tarih: '2026-10-17', g: { '07:15': { d: 'yedi' }, '19:30': { d: 'atla' } } } };
    assert.match(ctx.EV(data).message, /🍽️ Öğün: 2\/3 işaretli/);
  });
  test('plan saatsizse satır yok', () => {
    assert.doesNotMatch(ctx.EV({ tasks: [], diet: { days: {} } }).message, /Öğün:/);
  });
  test('Pazar 21:00: weekly tek push, sağlık içinde; health ayrı zincir yok', () => {
    const sch = W.slice(W.indexOf('async scheduled(event, env, ctx)'));
    assert.doesNotMatch(sch.slice(0, 4000), /runCronJob\(env, 'weekly'\)\.then\(\(\) => runCronJob\(env, 'health'\)\)/);
    assert.match(W, /case 'weekly': \{[\s\S]{0,900}buildHealthWeekly\(env, u\.data\)[\s\S]{0,300}sağlık analizin hazır/);
    assert.match(W, /case 'health':   payload = await buildHealthWeekly/);   // elle tetik kalır
  });
});

describe('hızlı giriş — "Farklı yedim" / "Bir şey yedim" (18 Eki)', () => {
  const el = () => A.window.document.getElementById('bugunOgun');
  const ogunler = () => E('(data.diet.days[today()].meals || []).map(x => [x.name, x.kcal, x.bekci || null, x.slot])');
  test('parçalama: virgül, ve, ile, +', () => {
    assert.deepStrictEqual(E("bugunParcala('2 yumurta, 1 simit ve 1 bardak ayran + muz ile çay')"), ['2 yumurta', '1 simit', '1 bardak ayran', 'muz', 'çay']);
  });
  test('öğün için kayıt: bilinenler yazılır, bilinmeyen yazılmaz, öğün "yedi" olur', () => {
    kur();
    A.evalIn('_moduleLoads.foods = Promise.resolve(); _moduleLoads.ajan = Promise.resolve()');
    const n = A.evalIn("bugunKaydet('13:00', '2 yumurta, 1 simit, zxqw uydurma')");
    assert.strictEqual(n, 2);
    assert.deepStrictEqual(ogunler(), [['Yumurta ×2', 144, '13:00', 'ogle'], ['Simit', 352, '13:00', 'ogle']]);
    assert.strictEqual(A.evalIn("data.ogunBekci.g['13:00'].d"), 'yedi');
    assert.deepStrictEqual(durum('13:30').slice(1, 2), ['13:00:tamam']);
  });
  test('🔒 hiçbir parça tanınmazsa kayıt yok', () => {
    kur();
    assert.strictEqual(A.evalIn("bugunKaydet(null, 'zxqw, qqqq')"), 0);
    assert.deepStrictEqual(ogunler(), []);
  });
  test('serbest kayıt (öğünsüz): işaret değişmez', () => {
    kur();
    A.evalIn("bugunKaydet(null, '1 muz')");
    assert.strictEqual(ogunler().length, 1);
    assert.strictEqual(A.evalIn('JSON.stringify((data.ogunBekci || {}).g || {})'), '{}');
  });
  test('kart: bekleyen öğünde "Farklı yedim" → giriş kutusu + canlı önizleme', async () => {
    kur();
    A.evalIn(`(function(){ const D = Date; const sabit = new D(D.now()); sabit.setHours(13, 20, 0, 0);
      window.__D = D; Date = class extends D { constructor(...a) { return a.length ? new D(...a) : new D(sabit); } static now() { return sabit.getTime(); } };
      renderBugunOgun(); Date = window.__D; })()`);
    el().querySelector('button[data-a="farkli"]').click();
    const girdi = A.window.document.getElementById('boGirdi');
    assert.ok(girdi, 'giriş kutusu yok');
    assert.match(el().textContent, /13:00 öğününde ne yedin\?/);
    girdi.value = '3 yumurta, zxqw';
    A.evalIn('bugunOnizle()');
    await new Promise(r => setTimeout(r, 20));
    const oz = A.window.document.getElementById('boOniz').textContent;
    assert.match(oz, /Yumurta ×3\s*216 kcal/);
    assert.match(oz, /zxqw — bulunamadı/);
    el().querySelector('button[data-a="vazgec"]').click();
    assert.ok(!A.window.document.getElementById('boGirdi'));
    assert.deepStrictEqual(A.errors, []);
  });
});
