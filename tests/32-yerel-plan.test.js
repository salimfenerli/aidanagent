/**
 * 32 — YEREL GÜN PLANLAYICI (6 Eyl 2026)
 *
 * NEDEN: `planMyDay` bulut girişi + ağ + AI istiyordu. Uygulamanın en çok
 * reklam edilen işi — "günü saat saat bloklara böl, zaman körlüğüne karşı" —
 * girişsizken, uçakta, worker kotası dolduğunda ya da Gemini 429 verdiğinde
 * HİÇ çalışmıyordu: fonksiyon bir uyarı gösterip çıkıyordu. Günlük
 * kullanılacak bir uygulamada asıl akışın dış servise bağlı olması kabul
 * edilemez.
 *
 * BU DOSYANIN SÖZLEŞMELERİ:
 * - Yerel planlayıcı AĞA ÇIKMAZ ve deterministiktir.
 * - SABİT PROGRAM HER ZAMAN KAZANIR: okul/antrenman saatinin üstüne blok
 *   yazılmaz (AI yolunda da aynı kural var, orada filtreyle sağlanıyor).
 * - GEÇMİŞ SAATE BLOK KONMAZ: saat 15'te "08:00 matematik" yazmak plana
 *   olan güveni bitirir.
 * - SIRA: MIT → acil → gecikmiş → bugün teslim → yakın tarihli → tarihsiz.
 * - AI BAŞARISIZ OLURSA GÜN PLANSIZ KALMAZ (yerel plana düşer) ama hata
 *   YUTULMAZ — kullanıcı neden düştüğünü görür.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, SCRIPTS, ROOT } = require('./helpers/load');

const A = loadApp({ scripts: [...SCRIPTS, 'school.js'] });
const W = A.window;
W.Element.prototype.scrollIntoView = function () {};
after(() => { try { A.close(); } catch (_) {} });

const veri = () => A.evalIn('data');
const bugun = () => A.evalIn('today()');
const yarin = () => A.evalIn('tomorrowStr()');
const dk = (hm) => A.evalIn(`hmToMin('${hm}')`);

/** Temiz bir dunya kurar: pencere, sabit program, gorevler. */
function kur({ from = '08:00', to = '22:00', fixed = [], tasks = [] } = {}) {
  const d = veri();
  d.settings = d.settings || {};
  d.settings.planFrom = from; d.settings.planTo = to;
  d.fixedSchedule = fixed;
  d.tasks = tasks.map((t, i) => A.evalIn(
    `makeTask(${JSON.stringify(Object.assign({ text: 'gorev' + i }, t))})`));
  d.tasks.forEach((t, i) => { if (tasks[i].mitDate) t.mitDate = tasks[i].mitDate; });
  d.dayPlan = { date: bugun(), blocks: [] };
  return d;
}

describe('sozlesme: ag yok, kapi var', () => {
  test('yerel planlayici fetch KULLANMIYOR', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tasks.js'), 'utf8');
    const bas = src.indexOf('YEREL GÜN PLANLAYICI');
    const son = src.indexOf('async function planMyDay');
    assert.ok(bas > 0 && son > bas, 'yerel planlayici blogu bulunamadi');
    assert.ok(!/\bfetch\s*\(/.test(src.slice(bas, son)), 'yerel planlayici aga cikiyor');
  });

  test('"Yarini planla" dugmesi HTML\'de var', () => {
    const html = fs.readFileSync(path.join(ROOT, 'asistan.html'), 'utf8');
    assert.ok(/onclick="planTomorrow\(\)"/.test(html), 'yarini planla dugmesi yok — motor var kapi yok');
  });

  test('planMyDay giris yoksa yerel plana DUSUYOR (uyarip cikmiyor)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tasks.js'), 'utf8');
    const blok = src.slice(src.indexOf('async function planMyDay'), src.indexOf('async function planMyDay') + 1400);
    assert.ok(/!window\._supa \|\| !window\._user[\s\S]{0,400}planLocalDay/.test(blok),
      'giris yokken hala uyarip cikiyor');
  });

  test('AI hatasinda yerel plana dusuyor ama hata SOYLENIYOR', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tasks.js'), 'utf8');
    const i = src.indexOf('async function planMyDay');
    const blok = src.slice(i, src.indexOf('\n}', src.indexOf('} catch (e) {', i)));
    assert.ok(/planLocalDay\(today\(\)\)/.test(blok), 'AI hatasinda yerel plana dusmuyor');
    assert.ok(/showToast\([^)]*e\.message/.test(blok), 'hata yutuluyor — kullanici sebebi gormeli');
  });
});

describe('sabit program ve pencere', () => {
  test('sabit blogun UZERINE yazmiyor', () => {
    kur({
      fixed: [{ id: 1, label: 'Okul', days: [0, 1, 2, 3, 4, 5, 6], start: '08:30', end: '15:00', enabled: true }],
      tasks: [{ text: 'a', estimateMin: 60 }, { text: 'b', estimateMin: 60 }, { text: 'c', estimateMin: 60 }],
    });
    const r = W.planLocalBlocks(yarin());
    const okul = r.blocks.find(b => b.label === 'Okul');
    assert.ok(okul, 'sabit blok plana girmedi');
    for (const b of r.blocks) {
      if (b.kind === 'fixed') continue;
      assert.ok(dk(b.end) <= dk(okul.start) || dk(b.start) >= dk(okul.end),
        `${b.start}-${b.end} sabit blogun uzerine yazdi`);
    }
  });

  test('pencere disina blok konmuyor', () => {
    kur({ from: '09:00', to: '12:00', tasks: [{ text: 'a', estimateMin: 30 }, { text: 'b', estimateMin: 30 }, { text: 'c', estimateMin: 30 }] });
    const r = W.planLocalBlocks(yarin());
    for (const b of r.blocks) {
      assert.ok(dk(b.start) >= dk('09:00') && dk(b.end) <= dk('12:00'), `${b.start}-${b.end} pencere disinda`);
    }
  });

  test('BUGUNU planlarken gecmis saate blok konmuyor', () => {
    kur({ from: '00:05', to: '23:55', tasks: [{ text: 'a', estimateMin: 30 }, { text: 'b', estimateMin: 30 }] });
    const r = W.planLocalBlocks(bugun());
    const simdi = dk(A.evalIn('nowHM()'));
    for (const b of r.blocks) {
      if (b.kind === 'fixed') continue;
      assert.ok(dk(b.start) >= simdi - 5, `${b.start} gecmiste (simdi ${A.evalIn('nowHM()')})`);
    }
  });

  test('bloklar CAKISMIYOR ve aralarinda nefes var', () => {
    kur({ tasks: Array.from({ length: 5 }, (_, i) => ({ text: 'i' + i, estimateMin: 30 })) });
    const r = W.planLocalBlocks(yarin());
    const s = r.blocks.slice().sort((a, b) => dk(a.start) - dk(b.start));
    for (let i = 1; i < s.length; i++) {
      assert.ok(dk(s[i].start) >= dk(s[i - 1].end), `${s[i - 1].end} ile ${s[i].start} cakisiyor`);
    }
  });
});

describe('sira ve sure', () => {
  test('MIT ilk sirada', () => {
    kur({ tasks: [
      { text: 'sonra', estimateMin: 30 },
      { text: 'mit isi', estimateMin: 30, mitDate: yarin() },
      { text: 'acil is', estimateMin: 30, priority: 'urgent' },
    ] });
    const r = W.planLocalBlocks(yarin());
    const ilk = r.blocks.filter(b => b.kind !== 'fixed')[0];
    assert.strictEqual(ilk.label, 'mit isi');
  });

  test('acil, tarihsizden once gelir', () => {
    kur({ tasks: [{ text: 'tarihsiz', estimateMin: 30 }, { text: 'acil is', estimateMin: 30, priority: 'urgent' }] });
    const r = W.planLocalBlocks(yarin());
    const adlar = r.blocks.filter(b => b.kind !== 'fixed').map(b => b.label);
    assert.ok(adlar.indexOf('acil is') < adlar.indexOf('tarihsiz'), adlar.join(' > '));
  });

  test('gecikmis is plana giriyor (her gun ertelenen is kaybolmasin)', () => {
    kur({ tasks: [{ text: 'gecikmis', estimateMin: 30, due: A.evalIn('shiftDateStr(today(), -4)') }, { text: 'yeni', estimateMin: 30 }] });
    const r = W.planLocalBlocks(yarin());
    const adlar = r.blocks.filter(b => b.kind !== 'fixed').map(b => b.label);
    assert.ok(adlar.includes('gecikmis'), 'gecikmis is plana girmedi');
    assert.ok(adlar.indexOf('gecikmis') < adlar.indexOf('yeni'));
  });

  test('cok gunluk is gune BOLUNUYOR', () => {
    // 3 gun sonra teslim, 120 dk: bugun 120 dk calismak plani da gunu de bozar.
    kur({ tasks: [{ text: 'uzun odev', estimateMin: 120, due: A.evalIn('shiftDateStr(today(), 3)') }] });
    const r = W.planLocalBlocks(yarin());
    const b = r.blocks.find(x => x.label === 'uzun odev');
    const sure = dk(b.end) - dk(b.start);
    assert.ok(sure < 120, 'is bolunmedi: ' + sure);
    assert.ok(sure >= 20, 'is fazla bolundu: ' + sure);
  });

  test('blok suresi 15-60 dk arasinda tutuluyor', () => {
    kur({ tasks: [{ text: 'devasa', estimateMin: 300 }, { text: 'minik', estimateMin: 3 }] });
    const r = W.planLocalBlocks(yarin());
    for (const b of r.blocks.filter(x => x.kind !== 'fixed')) {
      const sure = dk(b.end) - dk(b.start);
      assert.ok(sure >= 15 && sure <= 60, `${b.label}: ${sure} dk`);
    }
  });

  test('bitmis gorev planlanmiyor', () => {
    const d = kur({ tasks: [{ text: 'bitti' }, { text: 'duruyor' }] });
    d.tasks[0].done = true;
    const r = W.planLocalBlocks(yarin());
    assert.ok(!r.blocks.some(b => b.label === 'bitti'), 'bitmis gorev plana girdi');
  });

  test('gun 8 bloktan uzun olmuyor', () => {
    kur({ tasks: Array.from({ length: 20 }, (_, i) => ({ text: 'i' + i, estimateMin: 15 })) });
    const r = W.planLocalBlocks(yarin());
    assert.ok(r.blocks.filter(b => b.kind !== 'fixed').length <= 8, 'plan liste haline geldi');
  });
});

describe('uygulama ve sinir durumlar', () => {
  test('planTomorrow YARINA yaziyor, bugunku plani bozmadan', () => {
    kur({ tasks: [{ text: 'a', estimateMin: 30 }, { text: 'b', estimateMin: 30 }] });
    W.planTomorrow();
    const d = veri();
    assert.strictEqual(d.dayPlan.date, yarin());
    assert.ok(d.dayPlan.blocks.length >= 2);
  });

  test('gorev yoksa sebep soyleniyor, plan uydurulmuyor', () => {
    kur({ tasks: [] });
    const r = W.planLocalBlocks(yarin());
    assert.strictEqual(r.sebep, 'gorev-yok');
    assert.strictEqual(r.blocks.filter(b => b.kind !== 'fixed').length, 0);
  });

  test('sabit program pencereyi doldurduysa sabitler YINE de yaziliyor', () => {
    // Okul/antrenman gorunmezse kullanici "plan bos" saniyor.
    kur({
      from: '09:00', to: '17:00',
      fixed: [{ id: 1, label: 'Okul', days: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '17:00', enabled: true }],
      tasks: [{ text: 'a', estimateMin: 30 }],
    });
    const r = W.planLocalBlocks(yarin());
    assert.strictEqual(r.sebep, 'yer-yok');
    assert.ok(r.blocks.some(b => b.label === 'Okul'), 'sabit program da kayboldu');
  });

  test('ayni girdi ayni plani uretiyor (deterministik)', () => {
    const g = { from: '09:00', to: '18:00', tasks: [{ text: 'a', estimateMin: 30 }, { text: 'b', estimateMin: 45 }, { text: 'c', estimateMin: 20 }] };
    kur(g);
    const bir = W.planLocalBlocks(yarin()).blocks.map(b => `${b.start}-${b.end}:${b.label}`).join('|');
    kur(g);
    const iki = W.planLocalBlocks(yarin()).blocks.map(b => `${b.start}-${b.end}:${b.label}`).join('|');
    assert.strictEqual(bir, iki);
  });

  test('uretilen bloklar renderDayPlan\'in bekledigi ALANLARA sahip', () => {
    // 🔴 6 Eyl 2026: test fixture'i `from`/`to` yaziyordu, render `start`/`end`
    // okuyor — plan sekmesi her testte "undefinedundefined" ciziyordu ve
    // kimse fark etmedi. Uretilen blogun sozlesmesi artik kilitli.
    kur({ tasks: [{ text: 'a', estimateMin: 30 }] });
    const r = W.planLocalBlocks(yarin());
    for (const b of r.blocks) {
      for (const alan of ['id', 'label', 'start', 'end', 'kind']) {
        assert.ok(b[alan] !== undefined && b[alan] !== null, `blokta ${alan} yok`);
      }
      assert.ok(/^\d{2}:\d{2}$/.test(b.start) && /^\d{2}:\d{2}$/.test(b.end), 'saat bicimi bozuk');
      assert.ok(dk(b.end) > dk(b.start), 'bitis baslangictan once');
    }
    assert.strictEqual(new Set(r.blocks.map(b => b.id)).size, r.blocks.length, 'blok id catismasi');
  });
});
