/**
 * 03 — SAAT DILIMI (v7-119'un en kritik duzeltmesi)
 *
 * Eski `today()` UTC donduruyordu. Turkiye UTC+3 oldugu icin 00:00-03:00
 * arasinda PWA bir ONCEKI gunu "bugun" saniyordu: 01:00'de bitirilen gorev
 * dune yaziliyor, gece yarisindan sonraki uyku yanlis geceye gidiyor,
 * Worker (trToday) ile PWA farkli gun soyluyordu.
 *
 * KALICI KURAL: yeni kodda `new Date().toISOString().slice(0,10)` ASLA
 * kullanilmaz — isoLocal(d) / today() / shiftDateStr() kullanilir.
 * Bu kural 07-hygiene.test.js icinde de statik olarak kilitlidir.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load');
const { readText } = require('./helpers/src');

const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
/** worker.js'teki trToday ile ayni mantik (referans olarak yeniden yazildi). */
function trTodayAt(ms) {
  return new Date(ms + TR_OFFSET_MS).toISOString().slice(0, 10);
}

describe('saat dilimi', () => {
  test('worker.js TR ofseti hala 3 saat', () => {
    // Bu deger degisirse (ornegin yaz saati donerse) ikizlik testi de guncellenmeli
    assert.match(readText('aidan-worker/worker.js'), /TR_OFFSET_MS\s*=\s*3\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  test('isoLocal yerel gunu verir, UTC kaymasi YOK', () => {
    const app = loadApp({ seed: null });
    const isoLocal = app.window.isoLocal;

    // Yerel saatle gece yarisindan hemen sonra: UTC'ye gore gun geride olabilir
    const geceYarisi = new Date(2026, 7, 6, 0, 30, 0);   // 6 Agustos 2026, 00:30 yerel
    assert.strictEqual(isoLocal(geceYarisi), '2026-08-06',
      'gece yarisindan sonra bir onceki gunu veriyor — v7-119 bug\'i geri gelmis');

    // Gun sonuna hemen once
    const gunSonu = new Date(2026, 7, 6, 23, 45, 0);
    assert.strictEqual(isoLocal(gunSonu), '2026-08-06');

    // Ay donumu
    assert.strictEqual(isoLocal(new Date(2026, 7, 31, 23, 59, 0)), '2026-08-31');
    assert.strictEqual(isoLocal(new Date(2026, 8, 1, 0, 1, 0)), '2026-09-01');

    // Yil donumu
    assert.strictEqual(isoLocal(new Date(2026, 11, 31, 23, 59, 0)), '2026-12-31');
    assert.strictEqual(isoLocal(new Date(2027, 0, 1, 0, 1, 0)), '2027-01-01');

    // Artik gun
    assert.strictEqual(isoLocal(new Date(2028, 1, 29, 12, 0, 0)), '2028-02-29');
    app.close();
  });

  test('today() bugunun yerel gunu', () => {
    const app = loadApp({ seed: null });
    const simdi = new Date();
    const beklenen = new Date(simdi.getTime() - simdi.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
    assert.strictEqual(app.window.today(), beklenen);
    app.close();
  });

  test('shiftDateStr gun/ay/yil sinirlarinda dogru', () => {
    const app = loadApp({ seed: null });
    const s = app.window.shiftDateStr;
    assert.strictEqual(s('2026-08-06', 1), '2026-08-07');
    assert.strictEqual(s('2026-08-06', -1), '2026-08-05');
    assert.strictEqual(s('2026-08-31', 1), '2026-09-01');
    assert.strictEqual(s('2026-09-01', -1), '2026-08-31');
    assert.strictEqual(s('2026-12-31', 1), '2027-01-01');
    assert.strictEqual(s('2027-01-01', -1), '2026-12-31');
    assert.strictEqual(s('2028-02-28', 1), '2028-02-29');   // artik yil
    assert.strictEqual(s('2027-02-28', 1), '2027-03-01');   // artik olmayan
    assert.strictEqual(s('2026-08-06', 0), '2026-08-06');
    assert.strictEqual(s('2026-08-06', -180), '2026-02-07');
    app.close();
  });

  test('PWA isoLocal ile Worker trToday gunun 1440 dakikasinda da AYNI gunu verir', () => {
    // TZ=Europe/Istanbul altinda ikisi ayni gunu soylemek ZORUNDA; aksi halde
    // cron'un yazdigini PWA baska gune okur (v7-119'da yasanan sessiz kayma).
    const tz = process.env.TZ;
    if (tz !== 'Europe/Istanbul') {
      // CI'da TZ zorlanir; yerel makinede farkliysa test anlamsizdir
      assert.ok(true, 'TZ Europe/Istanbul degil (' + tz + '), karsilastirma atlandi');
      return;
    }
    const app = loadApp({ seed: null });
    const isoLocal = app.window.isoLocal;
    const taban = Date.UTC(2026, 7, 6, 0, 0, 0);   // gun boyunca her dakika
    let fark = 0;
    for (let m = 0; m < 1440; m++) {
      const ms = taban + m * 60000;
      if (isoLocal(new Date(ms)) !== trTodayAt(ms)) fark++;
    }
    app.close();
    assert.strictEqual(fark, 0, fark + ' dakikada PWA ve Worker farkli gun soyluyor');
  });
});
