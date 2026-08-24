/**
 * 26 — SAGLIK UCU (/health) · Apple Saglik -> iOS Kisayol -> Aidan
 *
 * 🔴 NEDEN VAR: Fitbit verisi Aidan'a bir API'den degil, bir KISAYOLDAN gelir.
 * Kisayol her seyi METIN yollar, saatleri bazen tam ISO damgasi olarak yollar
 * ve sessizce bozulur. Tarti ucunda (/body) bu tuzaklarin hepsi tek tek
 * yasandi; ayni tuzaklar burada tekrar yasanmasin diye kilitleniyor.
 *
 * Kilitlenen sozlesme:
 *  1. Kisayol bicimleri: "6,8" metni, "7:05", tam ISO damgasi
 *  2. Fitbit'in "uyunan sure"si yatis->kalkis farkini EZER (uyanik dakikalar)
 *  3. Insan disi degerler sessizce duser, kayda girmez
 *  4. Elle girilen `quality` uzerine null YAZILMAZ
 *  5. data.sleep sekli/sirasi/tavani core.js logSleep() ile AYNI kalir
 *  6. Ayni gune ikinci POST kayit cogaltmaz (upsert)
 *  7. Ucun yazdigi veri sleepDebtSrv'ye DOGRUDAN akar — asil kazanc bu
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { readText, extractDecl } = require('./helpers/src');

const WK = readText('aidan-worker/worker.js');
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Worker'in saf yardimcilarini izole calistir (fetch/env yok, sadece veri). */
function loadSrv() {
  const adlar = ['srvBodyNum', 'srvClock', 'srvSleepHours', 'srvUpsertSleep',
    'srvUpsertHealth', 'trDate', 'sleepDebtSrv'];
  const parcalar = adlar.map((ad) => {
    const src = extractDecl(WK, ad);
    assert.ok(src, ad + ' bulunamadi — /health ucu silinmis ya da yeniden adlandirilmis');
    return src;
  });
  const f = new Function('TR_OFFSET_MS',
    parcalar.join('\n') + '\nreturn { ' + adlar.join(', ') + ' };');
  return f(TR_OFFSET_MS);
}
const S = loadSrv();

/** TR takvimine gore gun kaydirmasi (testin kendi saat dilimi tuzagina dusmemesi icin). */
const gun = (kaydir) =>
  new Date(Date.now() + TR_OFFSET_MS + kaydir * 86400000).toISOString().slice(0, 10);

describe('Kisayol veri bicimleri', () => {
  test('tam ISO damgasindan saat cikarilir', () => {
    // Kisayol "Saglik Ornegi Ayrintilari"ni cogu zaman tarih+saat olarak verir
    assert.strictEqual(S.srvClock('2026-08-22T23:40:00+03:00'), '23:40');
  });

  test('tek haneli saat sifir-dolgulanir', () => {
    assert.strictEqual(S.srvClock('7:05'), '07:05');
  });

  test('gecersiz saat null doner (kayda girmez)', () => {
    assert.strictEqual(S.srvClock('99:99'), null);
    assert.strictEqual(S.srvClock(''), null);
    assert.strictEqual(S.srvClock(null), null);
  });

  test('virgullu ondalik metin sayiya cevrilir', () => {
    // Kisayol Turkce yerelde "6,8" yollar — parseFloat bunu 6 okur, veri bozulurdu
    const d = {};
    assert.strictEqual(S.srvUpsertSleep(d, { date: '2026-08-23', hours: '6,8' }).hours, 6.8);
  });
});

describe('uyku kaydi', () => {
  test('gece yarisi gecisi dogru hesaplanir', () => {
    const d = {};
    const r = S.srvUpsertSleep(d, { date: '2026-08-23', bedtime: '23:40', wake: '07:10' });
    assert.strictEqual(r.hours, 7.5);
    assert.strictEqual(r.bedtime, '23:40');
  });

  test('acik `hours` yatis->kalkis farkini EZER', () => {
    // Fitbit'in bildirdigi sure uyanik kalinan dakikalari dusuyor; saat farkindan
    // kisadir ve DOGRU olan odur. Turetilmis deger onun uzerine yazarsa uyku
    // borcu her gece oldugundan iyimser cikar.
    const d = {};
    const r = S.srvUpsertSleep(d, { date: '2026-08-23', bedtime: '23:40', wake: '07:10', hours: 6.8 });
    assert.strictEqual(r.hours, 6.8);
  });

  test('16 saatten uzun uyku reddedilir (hatali giris)', () => {
    assert.strictEqual(S.srvSleepHours('06:00', '23:30'), null);
  });

  test('elle girilen `quality` uzerine null yazilmaz', () => {
    const d = { sleep: [{ date: '2026-08-23', bedtime: null, wake: null, hours: null, quality: 'bad' }] };
    const r = S.srvUpsertSleep(d, { date: '2026-08-23', hours: 6.8 });
    assert.strictEqual(r.quality, 'bad', 'Kisayol POST\'u kullanicinin kalite girisini sildi');
    assert.strictEqual(r.hours, 6.8);
  });

  test('sekil/sira/tavan core.js logSleep() ile ayni', () => {
    // PWA yeni->eski sirali ve 60 kayitlik bir dizi bekliyor. Worker farkli
    // siralarsa PWA'daki "dun gece" karti yanlis geceyi gosterir.
    const d = {};
    for (let i = 0; i < 70; i++) {
      S.srvUpsertSleep(d, { date: new Date(Date.UTC(2026, 3, 1) + i * 86400000).toISOString().slice(0, 10), hours: 7 });
    }
    assert.strictEqual(d.sleep.length, 60, '60 kayit tavani core.js ile uyusmuyor');
    assert.ok(d.sleep[0].date > d.sleep[59].date, 'sira yeni->eski degil');
    assert.deepStrictEqual(
      Object.keys(d.sleep[0]).sort(),
      ['bedtime', 'date', 'hours', 'quality', 'src', 'wake'],
      'kayit sekli degismis — PWA tarafi bu alanlari okuyor');
  });
});

describe('gunluk saglik metrikleri', () => {
  test('insan disi deger sessizce duser, digerleri kaydedilir', () => {
    const d = {};
    const r = S.srvUpsertHealth(d, { date: '2026-08-23', steps: 9120, rhr: 5, hrv: 74, kcalOut: 620 });
    assert.strictEqual(r.steps, 9120);
    assert.strictEqual(r.rhr, undefined, '5 bpm dinlenme nabzi kayda girdi');
    assert.strictEqual(r.hrv, 74);
  });

  test('hicbir alan gecerli degilse kayit acilmaz', () => {
    const d = {};
    assert.strictEqual(S.srvUpsertHealth(d, { date: '2026-08-23', steps: 999999 }), null);
    assert.ok(!d.health || !d.health.length, 'bos kayit olusturuldu');
  });

  test('ayni gune ikinci POST kayit cogaltmaz', () => {
    // Kisayol elle de tetiklenebiliyor (kilit ekrani butonu) — gunde birkac kez
    // gelmesi normal. Her tetik yeni satir acsaydi 120 tavani gunlerce degil
    // saatlerce dayanirdi.
    const d = {};
    S.srvUpsertHealth(d, { date: '2026-08-23', steps: 5000 });
    S.srvUpsertHealth(d, { date: '2026-08-23', steps: 9120 });
    assert.strictEqual(d.health.length, 1);
    assert.strictEqual(d.health[0].steps, 9120);
  });
});

describe('ucun cikisi analize baglaniyor', () => {
  test('/health verisi sleepDebtSrv tarafindan okunabiliyor', () => {
    // Asil kazanc: uyku borcu motoru zaten yaziliydi, elle giris bekliyordu.
    // Bu test o baglantinin kopmadigini kilitler.
    const d = {};
    for (let i = 0; i < 7; i++) S.srvUpsertSleep(d, { date: gun(-i), hours: 6 });
    const out = S.sleepDebtSrv(d, 8);
    assert.strictEqual(out.nights, 7, 'yazilan geceler borc penceresine girmedi');
    assert.ok(out.debt > 0, 'hedefin 2 saat altinda 7 gece borc uretmedi');
  });

  test('uc yalnizca sleep + health yazar (yetki tavani)', () => {
    // Secret sizarsa yapilabilecek en kotu sey sahte uyku/adim kaydi olmali.
    // Gorev, diyet ya da portfoy yazimi bu ucta ASLA olmamali.
    // extractDecl `async function`i tanimiyor — 06-security ile ayni dilimleme
    const bas = WK.indexOf('async function handleHealthApi');
    assert.ok(bas > 0, 'handleHealthApi bulunamadi');
    const bit = WK.indexOf('\nasync function', bas + 10);
    const blok = WK.slice(bas, bit > 0 ? bit : WK.length);
    for (const yasak of ['data.tasks', 'data.diet', 'data.portfolioHistory', 'data.settings']) {
      assert.ok(!blok.includes(yasak),
        '/health ucu ' + yasak + ' alanina yaziyor — yetki tavani asilmis');
    }
    assert.ok(/WEBHOOK_SECRET/.test(blok), 'secret kontrolu yok');
  });
});
