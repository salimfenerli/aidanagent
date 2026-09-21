/**
 * 42 — SERBEST METIN -> ANTRENMAN AYARI (19 Eyl 2026)
 *
 * Salim: "programi yapay zeka verdigimiz kurallara gore yazsa daha iyi olmaz mi"
 * Cevap: AI program YAZMAZ, AYARI doldurur. Aradaki fark test edilebilirlik:
 * ayar sonlu bir alan kumesi, program degil.
 *
 * Bu dosya AI ile motor arasindaki BEYAZ LISTEYI kilitler. Buradaki her test
 * "model sacmaladi" senaryosudur: modelin uydurmasi en fazla "uygulanmadi"
 * satiri uretmeli, ASLA motora gecersiz ayar sokmamali.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function motor(veri) {
  const ctx = {
    console, Date, Math, JSON, Number, String, Array, Object, Promise, RegExp,
    isFinite, setTimeout, clearTimeout,
    document: { getElementById: () => null },
    escapeHtml: (s) => String(s), save() {}, showToast() {},
    today: () => '2026-09-19',
    shiftDateStr: (d, n) => d,
    GUN_KISA: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
    data: veri || {}, aidanPrompt: () => Promise.resolve(null),
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8') +
    '\n;globalThis.__SABIT = { PROGRAM_GOALS, PROGRAM_LIMITS, PROGRAM_MUSCLES, PROGRAM_PLACES };', ctx);
  return Object.assign(ctx, ctx.__SABIT);
}
const M = motor({});
const SRC = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8');
const WK = fs.readFileSync(path.join(ROOT, 'aidan-worker/worker.js'), 'utf8');

/** Temiz kurulum nesnesi — her test kendi kopyasiyla calisir. */
function kurulum() {
  return {
    goal: 'kas', strengthDays: 3, sessionMin: 60, places: ['gym'],
    fightDays: [], avoid: [], bwMax: {}, istek: '',
    duzen: { okul: {}, antrenman: '17:00' },
  };
}

describe('Beyaz liste: gecerli ayarlar uygulanir', () => {
  test('hedef, gun, sure, yer, dovus gunu, bolge', () => {
    const s = kurulum();
    const r = M.progCfgUygula({
      goal: 'atletik', strengthDays: 4, sessionMin: 75,
      places: ['gym', 'home'], fightDays: [2, 4], avoid: ['knee'],
    }, s);
    assert.strictEqual(s.goal, 'atletik');
    assert.strictEqual(s.strengthDays, 4);
    assert.strictEqual(s.sessionMin, 75);
    assert.strictEqual(String(s.places), 'gym,home');
    assert.strictEqual(String(s.fightDays), '2,4');
    assert.ok(r.uygulanan.length >= 5);
  });

  test('okul saati ve antrenman saati yazilir', () => {
    const s = kurulum();
    M.progCfgUygula({ okul: { '2': { bas: '9:00', bit: '19:00' } }, antrenman: '18:00' }, s);
    assert.strictEqual(JSON.stringify(s.duzen.okul['2']), JSON.stringify({ bas: '09:00', bit: '19:00' }));
    assert.strictEqual(s.duzen.antrenman, '18:00');
  });

  test('YAZILMAYAN ALAN DEGISMEZ — AI’in sessizligi ayar silmemeli', () => {
    const s = kurulum();
    s.fightDays = [3, 6]; s.avoid = ['neck'];
    M.progCfgUygula({ sessionMin: 45 }, s);
    assert.strictEqual(String(s.fightDays), '3,6');
    assert.strictEqual(String(s.avoid), 'neck');
    assert.strictEqual(s.goal, 'kas');
    assert.strictEqual(s.strengthDays, 3);
  });
});

describe('Model sacmalarsa: ayar bozulmaz, sebep yazilir', () => {
  test('bilinmeyen hedef uygulanmaz', () => {
    const s = kurulum();
    const r = M.progCfgUygula({ goal: 'crossfit-ninja' }, s);
    assert.strictEqual(s.goal, 'kas');
    assert.ok(r.atlanan.some(x => /hedef/i.test(x)));
  });

  test('tavan ustu gun sayisi KIRPILIR ve bu yazilir (sessiz kirpma degil)', () => {
    const s = kurulum();
    const r = M.progCfgUygula({ strengthDays: 9 }, s);
    assert.strictEqual(s.strengthDays, M.PROGRAM_LIMITS.maxStrengthDays);
    assert.ok(r.uygulanan.some(x => /tavan/i.test(x)), 'kirpma soylenmemis: ' + JSON.stringify(r));
  });

  test('0 / negatif gun sayisi uygulanmaz', () => {
    const s = kurulum();
    const r = M.progCfgUygula({ strengthDays: 0 }, s);
    assert.strictEqual(s.strengthDays, 3);
    assert.ok(r.atlanan.length);
  });

  test('ara deger seans suresi en yakin secenege oturur', () => {
    const s = kurulum();
    M.progCfgUygula({ sessionMin: 50 }, s);
    assert.strictEqual(s.sessionMin, 45);
    const s2 = kurulum();
    M.progCfgUygula({ sessionMin: 200 }, s2);
    assert.strictEqual(s2.sessionMin, 90);
  });

  test('taninmayan yer ELENIR ama sessizce degil', () => {
    const s = kurulum();
    const r = M.progCfgUygula({ places: ['home', 'uzay-istasyonu'] }, s);
    assert.strictEqual(String(s.places), 'home');
    assert.ok(r.atlanan.some(x => /yer/i.test(x)), 'eleme sessiz kalmis');
  });

  test('gecersiz dovus gunu TAMAMEN reddedilir (yarim uygulama yok)', () => {
    const s = kurulum();
    s.fightDays = [3];
    const r = M.progCfgUygula({ fightDays: [2, 11] }, s);
    assert.strictEqual(String(s.fightDays), '3', 'yarim liste uygulanmis');
    assert.ok(r.atlanan.length);
  });

  test('taninmayan bolge adi atlanir', () => {
    const s = kurulum();
    const r = M.progCfgUygula({ avoid: ['core', 'ruh-hali'] }, s);
    assert.strictEqual(String(s.avoid), 'core');
    assert.ok(r.atlanan.some(x => /bölge/i.test(x)));
  });

  test('bozuk okul saati yazilmaz (bitis <= baslangic, gecersiz gun)', () => {
    const s = kurulum();
    const r = M.progCfgUygula({ okul: { '2': { bas: '19:00', bit: '09:00' }, '9': { bas: '09:00', bit: '16:00' } } }, s);
    assert.strictEqual(Object.keys(s.duzen.okul).length, 0);
    assert.strictEqual(r.atlanan.length, 2);
  });

  test('cop girdi cokmez', () => {
    const s = kurulum();
    for (const cop of [null, undefined, 'metin', 42, [], { ayar: 1 }]) {
      const r = M.progCfgUygula(cop, s);
      assert.ok(r && Array.isArray(r.uygulanan) && Array.isArray(r.atlanan));
    }
    assert.strictEqual(s.goal, 'kas');
  });
});

describe('Istek kutusu KALICI (v7-187 hatasinin aynisi olmasin)', () => {
  test('metin data.progIstek’e yazilir ve tavanda kirpilir', () => {
    const M2 = motor({});
    M2.progAiIstekKaydet('haftada 4 gün, kickboks salı perşembe');
    assert.strictEqual(M2.data.progIstek, 'haftada 4 gün, kickboks salı perşembe');
    M2.progAiIstekKaydet('x'.repeat(2000));
    assert.strictEqual(M2.data.progIstek.length, 800);
  });

  test('kutu KAYITLI metinden cizilir — yeniden cizim metni yemez', () => {
    // Diyette tam olarak bu eksikti: textarea yalniz DOM'da duruyordu.
    assert.ok(/id="progAiReq"[\s\S]{0,400}escapeHtml\(s\.istek \|\| ''\)/.test(SRC),
      'kutu kayitli istekten cizilmiyor');
    assert.ok(/oninput="progAiIstekKaydet\(this\.value\)"/.test(SRC), 'oninput kaydi yok');
    assert.ok(/istek: \(typeof data === 'object' && data && data\.progIstek\)/.test(SRC),
      'kurulum acilirken kayitli istek yuklenmiyor');
  });
});

describe('Yetki siniri: AI ayar cevirir, program yazmaz', () => {
  test('worker prompt’u hareket/set/tekrar secmeyi acikca yasakliyor', () => {
    const bas = WK.indexOf('async function handleProgramCfgApi');
    const govde = WK.slice(bas, bas + 9000);
    assert.ok(bas > 0, 'uc yok');
    assert.ok(/program YAZMIYORSUN/.test(govde));
    assert.ok(/SEÇMİYORSUN/.test(govde), 'hareket secme yasagi promptta yok');
    assert.ok(/uygulanamayan/.test(govde), 'yapilamayan istek alani yok');
  });

  test('AI yolu buildProgram cagirmiyor — programi kullanici kurar', () => {
    const bas = SRC.indexOf('async function progAiCfgYaz(');
    const govde = SRC.slice(bas, SRC.indexOf('\n}', bas));
    assert.ok(bas > 0 && !/buildProgram\(/.test(govde));
    // saveProgramSetup ise kurar — dugme akisi korunuyor.
    assert.ok(/function saveProgramSetup\(\)[\s\S]{0,800}buildProgram\(/.test(SRC));
  });
});
