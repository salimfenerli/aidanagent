/**
 * 28 — SAGLIK GECMISI ICE AKTARIM (30 Agu 2026)
 *
 * NEDEN VAR: /health ucu GUNLUK akis icin (Kisayol her sabah tek gun yollar).
 * Gecmis veri icin ikinci bir kapi acildi — dosyadan toplu yukleme. Iki kapi
 * ayni veriye yaziyor, dolayisiyla AYNI KURALLARA tabi olmali; yoksa bir gunun
 * kaydi kaynagina gore degisir ve bunu kimse fark etmez.
 *
 * Kilitlenen sozlesme:
 *  1. Dogrulama araliklari worker'daki srvUpsert* ile BIREBIR ayni
 *  2. CSV sutunlari sabit siraya gore degil BASLIGA gore eslesir
 *  3. Apple Saglik XML: adim/enerji TOPLANIR, nabiz/HRV son olcum
 *  4. Uyanik uyku kayitlari sayilmaz
 *  5. Aralik disi deger sessizce gecmez — dusurulur ve sayilir
 *  6. Ayni gune ikinci yukleme kayit cogaltmaz, mevcut alani SILMEZ
 *  7. Ice aktarim AGA CIKMAZ (secret gerektirmez) — bu bir tasarim karari
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { readText, extractDecl } = require('./helpers/src');

const HL = readText('health.js');
const WK = readText('aidan-worker/worker.js');

/** health.js'i butunuyle calistir — HL_SUTUN gibi regex iceren sabitleri
    parca parca cikarmak kirilgan (extractDecl regex literalinde takiliyor). */
const vm = require('node:vm');
function load() {
  const store = { sleep: [], health: [] };
  const ctx = {
    console, Date, Math, JSON, Number, String, Array, Object, Promise, isFinite,
    parseFloat, parseInt, RegExp,
    document: { getElementById: () => null },
    data: store, save() {}, showToast() {},
    escapeHtml: (x) => String(x),
    today: () => '2026-08-30',
  };
  vm.createContext(ctx);
  // csvSplitLine core.js'te; ice aktarim onu cagiriyor (health.js sonra yuklenir)
  vm.runInContext(extractDecl(readText('core.js'), 'csvSplitLine'), ctx);
  vm.runInContext(readText('health.js') +
    '\n;globalThis.__H = { hlNum, hlClock, hlSleepHours, hlDate, HL_SUTUN, HL_HK,' +
    ' hlParseCsv, hlParseAppleXml, hlParse, hlUpsertSleep, hlUpsertHealth };', ctx);
  return { M: ctx.__H, store };
}

describe('dogrulama araliklari worker ile ayni', () => {
  test('uyku ve saglik alanlarinin sinirlari birebir', () => {
    const sleepSrv = extractDecl(WK, 'srvUpsertSleep');
    const healthSrv = extractDecl(WK, 'srvUpsertHealth');
    const sleepCli = extractDecl(HL, 'hlUpsertSleep');
    const healthCli = extractDecl(HL, 'hlUpsertHealth');
    // Sayisal sinirlari cikar: fn(entry.alan, min, max, dec)
    const sinirlar = (src) => (src.match(/\.(\w+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(\d)/g) || [])
      .map((s) => s.replace(/\s+/g, '')).sort();
    assert.deepStrictEqual(sinirlar(sleepCli), sinirlar(sleepSrv),
      'uyku araliklari kaymis — ayni gun iki kapidan farkli kaydedilir');
    assert.deepStrictEqual(sinirlar(healthCli), sinirlar(healthSrv),
      'saglik araliklari kaymis');
  });

  test('insan disi degerler dusurulur', () => {
    const { M } = load();
    assert.strictEqual(M.hlNum(250, 30, 130, 0), null, 'nabiz 250 kabul edildi');
    assert.strictEqual(M.hlNum(1, 30, 130, 0), null);
    assert.strictEqual(M.hlNum(58, 30, 130, 0), 58);
    assert.strictEqual(M.hlNum(20, 0.5, 16, 2), null, '20 saat uyku kabul edildi');
    assert.strictEqual(M.hlNum('6,8', 0.5, 16, 2), 6.8, 'virgullu ondalik okunmadi');
  });
});

describe('CSV', () => {
  test('sutunlar BASLIGA gore eslesir, siraya gore degil', () => {
    const { M } = load();
    const csv = [
      'HRV;Adım;Tarih;Dinlenme Nabzı;Uyku Süresi',
      '62;9120;2026-08-25;58;7,5',
      '55;10400;26.08.2026;61;6,8',
    ].join('\n');
    const r = M.hlParseCsv(csv);
    assert.ok(!r.err, r.err);
    assert.strictEqual(r.rows.length, 2);
    assert.strictEqual(r.rows[0].date, '2026-08-25');
    assert.strictEqual(r.rows[1].date, '2026-08-26', 'GG.AA.YYYY tarihi okunmadi');
    assert.strictEqual(r.rows[0].rhr, '58');
    assert.strictEqual(r.rows[0].hrv, '62');
  });

  test('tarih sutunu yoksa acikca soyler', () => {
    const { M } = load();
    const r = M.hlParseCsv('Adım,Nabız\n9120,58');
    assert.ok(r.err && /tarih/i.test(r.err), 'sessizce bos donuyor');
  });

  test('taninan olcum sutunu yoksa acikca soyler', () => {
    const { M } = load();
    const r = M.hlParseCsv('Tarih,Not\n2026-08-25,merhaba');
    assert.ok(r.err && /tan[iı]nmad/i.test(r.err));
  });

  test('okunamayan satir SESSIZCE gecmez, sayilir', () => {
    const { M } = load();
    const r = M.hlParseCsv('Tarih,Adım\n2026-08-25,9120\nbozuk satir,x\n2026-08-26,8000');
    assert.strictEqual(r.rows.length, 2);
    assert.strictEqual(r.atlanan, 1, 'atlanan satir sayilmiyor');
  });
});

describe('Apple Saglik XML', () => {
  const xml = `<?xml version="1.0"?>
<HealthData>
 <Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-08-25 08:10:00 +0300" endDate="2026-08-25 08:20:00 +0300" value="1200"/>
 <Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-08-25 18:00:00 +0300" endDate="2026-08-25 18:30:00 +0300" value="4300"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate="2026-08-25 06:00:00 +0300" endDate="2026-08-25 06:00:00 +0300" value="58"/>
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" startDate="2026-08-25 06:00:00 +0300" endDate="2026-08-25 06:00:00 +0300" value="62.4"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-08-24 23:40:00 +0300" endDate="2026-08-25 07:10:00 +0300" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-08-25 03:00:00 +0300" endDate="2026-08-25 03:12:00 +0300" value="HKCategoryValueSleepAnalysisAwake"/>
</HealthData>`;

  test('adim TOPLANIR, nabiz/HRV tek olcum', () => {
    const { M } = load();
    const r = M.hlParseAppleXml(xml);
    assert.ok(!r.err, r.err);
    const g = r.rows.find((x) => x.date === '2026-08-25');
    assert.ok(g, '25 Agustos kaydi yok');
    assert.strictEqual(g.steps, 5500, 'adim parcalari toplanmadi');
    assert.strictEqual(g.rhr, 58);
    assert.strictEqual(g.hrv, 62.4);
  });

  test('uyku UYANDIGIN gune yazilir, uyanik kayitlari sayilmaz', () => {
    const { M } = load();
    const g = M.hlParseAppleXml(xml).rows.find((x) => x.date === '2026-08-25');
    assert.strictEqual(g.bedtime, '23:40', 'yatis saati yanlis');
    assert.strictEqual(g.wake, '07:10', 'kalkis saati yanlis — uyanik kaydi karismis olabilir');
  });

  test('bicim uzantidan degil ICERIKTEN anlasilir', () => {
    const { M } = load();
    assert.strictEqual(M.hlParse(xml).bicim, 'Apple Sağlık XML');
    assert.strictEqual(M.hlParse('Tarih,Adım\n2026-08-25,9120').bicim, 'CSV');
  });
});

describe('upsert — birlestirir, silmez', () => {
  test('ayni gune ikinci yukleme kayit cogaltmaz', () => {
    const { M, store } = load();
    M.hlUpsertHealth({ date: '2026-08-25', steps: 9120 });
    M.hlUpsertHealth({ date: '2026-08-25', rhr: 58 });
    assert.strictEqual(store.health.length, 1, 'ayni gun icin iki kayit olustu');
    assert.strictEqual(store.health[0].steps, 9120, 'ilk yuklemedeki alan silinmis');
    assert.strictEqual(store.health[0].rhr, 58);
  });

  test('elle girilen quality uzerine null YAZILMAZ', () => {
    const { M, store } = load();
    store.sleep.push({ date: '2026-08-25', quality: 'good', hours: null, bedtime: null, wake: null });
    M.hlUpsertSleep({ date: '2026-08-25', hours: 7.5 });
    assert.strictEqual(store.sleep[0].quality, 'good', 'elle girilen kalite ezildi');
    assert.strictEqual(store.sleep[0].hours, 7.5);
  });

  test('hicbir gecerli alan yoksa kayit ACILMAZ', () => {
    const { M, store } = load();
    assert.strictEqual(M.hlUpsertHealth({ date: '2026-08-25', rhr: 250 }), null);
    assert.strictEqual(store.health.length, 0, 'bos kayit olusturuldu');
  });

  test('saat farkindan sure turetilir, gece yarisi asilir', () => {
    const { M } = load();
    assert.strictEqual(M.hlSleepHours('23:40', '07:10'), 7.5);
    assert.strictEqual(M.hlSleepHours('01:00', '09:00'), 8);
  });
});

describe('tasarim karari: ice aktarim aga CIKMAZ', () => {
  test('ice aktarim yolunda fetch / secret yok', () => {
    const src = extractDecl(HL, 'importHealthFile') + extractDecl(HL, 'hlParse') +
      extractDecl(HL, 'hlParseCsv') + extractDecl(HL, 'hlParseAppleXml');
    assert.ok(!/fetch\s*\(/.test(src), 'ice aktarim aga cikiyor — dosya tarayicida kalmali');
    assert.ok(!/X-Aidan-Secret|WEBHOOK_SECRET/.test(src),
      'ice aktarim secret istiyor — yerel dosya icin gereksiz, sizma yuzeyi');
  });
});
