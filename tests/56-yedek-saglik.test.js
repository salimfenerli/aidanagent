/**
 * 56 — YEDEK EKLERİ + HEALTH AUTO EXPORT (6 Eki 2026)
 *
 * Salim: "yedekleme olsun" + "Google Health'ten uygulamaya veri geçişi —
 * kısayoldan yapması zor". Ölçüm: data.sleep ve data.health 0 kayıt —
 * Kısayol yolu hiç çalışmamıştı.
 *
 * Kilitlenenler:
 *  - haftalık yedek hafıza + hedefleri de içerir, ek okunamazsa ana yedek düşmez
 *  - içe aktarımda yedek eki blob'a girmez
 *  - HAE biçimi: toplu / parça uyku, birim çevirisi (kJ, lb), günlük toplam/ortalama
 *  - doğrulama mevcut srvUpsert* sınırlarından geçer (saçma değer kayda girmez)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText, extractDecl } = require('./helpers/src');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const ctx = { Math, Number, String, Object, Array, isFinite, JSON };
vm.createContext(ctx);
vm.runInContext(['haeToItems', 'SRV_AY', 'srvTarih', 'srvBodyNum', 'srvClock', 'srvZamanlar', 'srvUykuParca', 'srvSleepHours', 'srvUpsertSleep', 'srvUpsertHealth', 'srvUpsertBody']
  .map(n => extractDecl(W, n)).join('\n') + '\nthis.tarih = srvTarih; this.saat = srvClock; this.hae = haeToItems; this.S = srvUpsertSleep; this.H = srvUpsertHealth; this.B = srvUpsertBody; this.U = srvUykuParca;', ctx);
const js = (x) => JSON.parse(JSON.stringify(x));

const ORNEK = { data: { metrics: [
  { name: 'step_count', units: 'count', data: [
    { date: '2026-10-05 10:00:00 +0300', qty: 4000 }, { date: '2026-10-05 18:00:00 +0300', qty: 5120 }] },
  { name: 'active_energy', units: 'kJ', data: [{ date: '2026-10-05 00:00:00 +0300', qty: 2092 }] },
  { name: 'resting_heart_rate', units: 'count/min', data: [{ date: '2026-10-05 00:00:00 +0300', qty: 57 }, { date: '2026-10-05 12:00:00 +0300', qty: 59 }] },
  { name: 'heart_rate_variability', units: 'ms', data: [{ date: '2026-10-05 03:00:00 +0300', qty: 71.26 }] },
  { name: 'sleep_analysis', units: 'hr', data: [{ date: '2026-10-05 00:00:00 +0300', totalSleep: 7.42, inBed: 8.1,
    sleepStart: '2026-10-04 23:40:00 +0300', sleepEnd: '2026-10-05 07:05:00 +0300' }] },
  { name: 'weight_body_mass', units: 'lb', data: [{ date: '2026-10-05 07:10:00 +0300', qty: 152 }] },
  { name: 'body_fat_percentage', units: '%', data: [{ date: '2026-10-05 07:10:00 +0300', qty: 15.5 }] },
] } };

describe('Health Auto Export biçimi', () => {
  test('günlük toplam / ortalama / birim çevirisi', () => {
    const r = js(ctx.hae(ORNEK));
    assert.strictEqual(r.items.length, 1);
    const g = r.items[0];
    assert.strictEqual(g.date, '2026-10-05');
    assert.strictEqual(g.steps, 9120, 'adım toplanır');
    assert.strictEqual(g.kcalOut, 500, '2092 kJ = 500 kcal');
    assert.strictEqual(g.rhr, 58, 'nabız ortalaması');
    assert.strictEqual(g.hrv, 71.3);
    assert.strictEqual(g.hours, 7.42);
    assert.strictEqual(r.weights[0].kg.toFixed(1), '68.9', 'lb → kg');
    assert.strictEqual(r.weights[0].fat, 15.5);
  });
  test('uyku uyanılan güne yazılır, saatler mevcut doğrulamadan geçer', () => {
    const it = js(ctx.hae(ORNEK)).items[0];
    const data = {};
    const s = js(ctx.S(data, it));
    assert.strictEqual(s.bedtime, '23:40');
    assert.strictEqual(s.wake, '07:05');
    assert.strictEqual(s.hours, 7.42);
    const h = js(ctx.H(data, it));
    assert.strictEqual(h.steps, 9120);
  });
  test('parça parça uyku: uyanık/yatakta sayılmaz, en erken yatış / en geç kalkış', () => {
    const r = js(ctx.hae({ data: { metrics: [{ name: 'sleep_analysis', units: 'hr', data: [
      { startDate: '2026-10-05 23:30:00 +0300', endDate: '2026-10-06 02:00:00 +0300', value: 'Core', qty: 2.5 },
      { startDate: '2026-10-06 02:00:00 +0300', endDate: '2026-10-06 02:20:00 +0300', value: 'Awake', qty: 0.33 },
      { startDate: '2026-10-06 02:20:00 +0300', endDate: '2026-10-06 06:50:00 +0300', value: 'Deep', qty: 4.5 },
    ] }] } }));
    const g = r.items[0];
    assert.strictEqual(g.date, '2026-10-06');
    assert.strictEqual(g.hours, 7);
    assert.match(g.bedtime, /23:30/);
    assert.match(g.wake, /06:50/);
  });
  test('🔒 saçma değer kayda GİRMEZ (mevcut sınırlar)', () => {
    const r = js(ctx.hae({ data: { metrics: [{ name: 'resting_heart_rate', units: 'count/min', data: [{ date: '2026-10-05 00:00:00 +0300', qty: 400 }] }] } }));
    assert.strictEqual(ctx.H({}, r.items[0]), null);
  });
  test('HAE değilse null (eski Kısayol biçimi aynen çalışır)', () => {
    for (const b of [{}, { items: [] }, { date: '2026-10-05', hours: 7 }, null, { data: {} }]) assert.strictEqual(ctx.hae(b), null);
  });
  test('uç HAE\'yi otomatik tanır, tartıyı da yazar, secret zorunlu kalır', () => {
    const h = W.slice(W.indexOf('async function handleHealthApi('), W.indexOf('async function handleBodyApi('));
    assert.match(h, /const hae = haeToItems\(body\);/);
    assert.match(h, /srvUpsertBody\(data\.diet, w\)/);
    assert.match(h, /given !== env\.WEBHOOK_SECRET/);
  });
});

describe('tek kısayol — ham tarih/saat metni (7 Eki 2026)', () => {
  test('tarih: ISO, TR kısa/uzun ay, EN, nokta biçimi; tanınmazsa null', () => {
    const t = ctx.tarih;
    assert.strictEqual(t('2026-10-07'), '2026-10-07');
    assert.strictEqual(t('7 Eki 2026 07:05'), '2026-10-07');
    assert.strictEqual(t('7 Ekim 2026'), '2026-10-07');
    assert.strictEqual(t('28 Ağustos 2026'), '2026-08-28');
    assert.strictEqual(t('3 Şubat 2027'), '2027-02-03');
    assert.strictEqual(t('Oct 7, 2026 at 7:05 AM'), '2026-10-07');
    assert.strictEqual(t('07.10.2026'), '2026-10-07');
    for (const x of ['', null, 'dün', '2026-13-40', '7 Xyz 2026']) assert.strictEqual(t(x), null, String(x));
  });
  test('saat: 24 saat, 12 saat (AM/PM), tam damga', () => {
    assert.strictEqual(ctx.saat('7 Eki 2026 23:40'), '23:40');
    assert.strictEqual(ctx.saat('Oct 6, 2026 at 11:40 PM'), '23:40');
    assert.strictEqual(ctx.saat('12:15 AM'), '00:15');
    assert.strictEqual(ctx.saat('2026-10-06 07:05:00 +0300'), '07:05');
  });
  test('uç: tartı yalnız kendi tarihiyle (kgDate) yazılır, değişmeyen gönderim blob\'a YAZILMAZ', () => {
    const h = W.slice(W.indexOf('async function handleHealthApi('), W.indexOf('async function handleBodyApi('));
    assert.match(h, /const kd = srvTarih\(it\.kgDate\);\n\s+if \(kd\)/);
    assert.match(h, /if \(degisti\) await saveAidan\(env, data, session\);/);
    assert.match(h, /srvTarih\(it\.date\) \|\| srvTarih\(it\.wake\) \|\| trToday\(\)/);
  });
});

describe('uyku parçaları (8 Eki — tek parça 23:00 / kalkış boş geliyordu)', () => {
  // Apple Sağlık bir geceyi parçalar: Yatakta (uyku programı) + evreler + gece uyanması.
  const GECE = {
    bedtime: ['7 Eki 2026 23:00', '8 Eki 2026 00:40', '8 Eki 2026 03:10', '8 Eki 2026 03:20', '8 Eki 2026 07:05'].join('\n'),
    wake:    ['8 Eki 2026 07:30', '8 Eki 2026 03:10', '8 Eki 2026 03:20', '8 Eki 2026 07:05', '8 Eki 2026 07:30'].join('\n'),
    stage:   ['Yatakta', 'Çekirdek', 'Uyanık', 'Derin', 'Uyanık'].join('\n'),
  };
  test('yatış = ilk uyuma, kalkış = son uyuma, süre = uyunan dakikalar, tarih = uyanılan gün', () => {
    assert.deepStrictEqual(js(ctx.U(GECE)), { bedtime: '00:40', wake: '07:05', hours: 6.25, date: '2026-10-08' });
  });
  test('dizi de olur; çakışan parçalar iki kez sayılmaz', () => {
    const r = js(ctx.U({ bedtime: ['2026-10-07 23:30', '2026-10-08 00:00'], wake: ['2026-10-08 06:30', '2026-10-08 06:00'], stage: ['Uykuda', 'Çekirdek'] }));
    assert.deepStrictEqual(r, { bedtime: '23:30', wake: '06:30', hours: 7, date: '2026-10-08' });
  });
  test('yalnız SON gece: dünkü gece ve öğle uykusu karışmaz', () => {
    const r = js(ctx.U({
      bedtime: ['6 Eki 2026 23:50', '8 Eki 2026 00:10'].join('\n'),
      wake: ['7 Eki 2026 07:00', '8 Eki 2026 07:10'].join('\n'),
      stage: 'Çekirdek\nÇekirdek' }));
    assert.deepStrictEqual(r, { bedtime: '00:10', wake: '07:10', hours: 7, date: '2026-10-08' });
  });
  test('evre yoksa: yatakta kalınan aralık (süre saatlerden hesaplanır)', () => {
    const r = js(ctx.U({ bedtime: 'Oct 7, 2026 at 11:40 PM\nOct 8, 2026 at 3:00 AM', wake: 'Oct 8, 2026 at 3:00 AM\nOct 8, 2026 at 7:05 AM' }));
    assert.deepStrictEqual(r, { bedtime: '23:40', wake: '07:05', hours: null, date: '2026-10-08' });
    const d = {}; ctx.S(d, Object.assign({}, r));
    assert.strictEqual(js(d).sleep[0].hours, 7.42);
  });
  test('tek değer → null (eski kısayol yolu aynen çalışır); boş/çöp → null', () => {
    assert.strictEqual(ctx.U({ bedtime: '7 Eki 2026 23:40', wake: '8 Eki 2026 07:05' }), null);
    assert.strictEqual(ctx.U({ rhr: 60 }), null);
    assert.strictEqual(ctx.U({ bedtime: 'x\ny', wake: 'a\nb' }), null);
  });
  test('uç parçaları birleştirip SONRA tarihi seçer', () => {
    const h = W.slice(W.indexOf('async function handleHealthApi('), W.indexOf('async function handleBodyApi('));
    assert.match(h, /const uy = srvUykuParca\(it\);[^\n]*\n\s+if \(uy\) it = Object\.assign\(\{\}, it, uy\);/);
    assert.ok(h.indexOf('srvUykuParca(it)') < h.indexOf('srvTarih(it.date)'));
  });
});

describe('yedek ekleri', () => {
  test('haftalık yedek hafıza + hedefleri içerir; ek okunamazsa yedek düşmez', () => {
    const run = W.slice(W.indexOf('async function runBackup('), W.indexOf('async function runBackup(') + 1500);
    assert.match(run, /Object\.assign\(\{\}, u\.data, \{ __yedekEk: ek \}\)/);
    const ek = W.slice(W.indexOf('async function yedekEk('), W.indexOf('async function runBackup('));
    assert.match(ek, /memoryFetchForCron\(env, u\)/);
    assert.match(ek, /aidan_goals\?user_id=eq\./);
    assert.ok((ek.match(/catch \(_\) \{\}/g) || []).length >= 2, 'ek okuması fırlatabilir');
  });
  test('içe aktarımda yedek eki blob\'a girmez', () => {
    assert.match(readText('ui.js'), /delete imported\.__yedekEk;/);
  });
});
