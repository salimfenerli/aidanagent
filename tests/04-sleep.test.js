/**
 * 04 — UYKU BORCU ALGORITMASI (v7-118)
 *
 * Duz toplam DEGIL: ustel agirlikli iki-surec modeli.
 *   D = max(0, D*0.85 + contrib)
 * Asimetrik: fazla uyku aciği 1:1 kapatmaz (PAYBACK 0.5). 0 tabani var.
 *
 * Ayrica: core.js `sleepDebt()` ile worker.js `sleepDebtSrv()` ikizlerinin
 * ayni girdide ayni sayiyi uretmesi RASTGELE senaryolarla dogrulanir —
 * cron raporunun PWA'dan farkli sayi soylemesi gecmiste yasanmis bir hataydi.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { loadApp, iso } = require('./helpers/load');
const { readText, extractDecl } = require('./helpers/src');

/** Uyku kayitlariyla uygulamayi yukle, sleepDebt() dondur. */
function debtFor(sleep, targetH = 8) {
  const app = loadApp({ seed: { sleep, settings: { sleepGoal: { targetH, wake: '07:00' } } } });
  assert.deepStrictEqual(app.errors, [], 'yukleme hatasi');
  const out = app.window.sleepDebt();
  app.close();
  return out;
}

/** worker.js'teki sleepDebtSrv'yi izole calistir (ikiz karsilastirmasi icin). */
function makeSrv() {
  const src = extractDecl(readText('aidan-worker/worker.js'), 'sleepDebtSrv');
  assert.ok(src, 'sleepDebtSrv bulunamadi');
  const ctx = vm.createContext({
    // Worker TR saatine gore gun uretir; test tarafinda ayni gunleri vermesi icin
    // yerel gun hesabiyla hizalanir (ikizlik girdisi ayni gun anahtarlari olmali).
    trDate: (n = 0) => iso(n),
    Math, Object, Date, JSON,
  });
  vm.runInContext(src + '\nglobalThis.__srv = sleepDebtSrv;', ctx);
  return ctx.__srv;
}

describe('uyku borcu — algoritma davranisi', () => {
  test('hedefte uyunan gecelerde borc yok', () => {
    const s = [];
    for (let i = 0; i < 14; i++) s.push({ date: iso(-i), hours: 8, quality: 'good' });
    assert.strictEqual(debtFor(s).debt, 0);
  });

  test('duz toplam DEGIL — ustel erime uygulanir', () => {
    // 14 gece 6 saat (acik 2sa/gece). Duz toplam 28 olurdu.
    const s = [];
    for (let i = 0; i < 14; i++) s.push({ date: iso(-i), hours: 6, quality: 'ok' });
    const d = debtFor(s).debt;
    assert.ok(d > 8 && d < 14, 'beklenen ~13 civari (duz toplam 28 degil), gelen: ' + d);
  });

  test('borc negatife inmez (uyku bankasi YOK)', () => {
    const s = [];
    for (let i = 0; i < 14; i++) s.push({ date: iso(-i), hours: 11, quality: 'good' });
    assert.strictEqual(debtFor(s).debt, 0);
  });

  test('fazla uyku aciği 1:1 kapatmaz (asimetrik geri odeme)', () => {
    // Bir gece 4sa (acik 4), ertesi gece 10sa (fazla 2 -> yarim verimle 1 oder)
    const s = [
      { date: iso(-1), hours: 4, quality: 'bad' },
      { date: iso(0), hours: 10, quality: 'good' },
    ];
    const d = debtFor(s).debt;
    assert.ok(d > 1.5, '10 saatlik gece 4 saatlik gecenin borcunu silmemeli, gelen: ' + d);
  });

  test('gecelik acik tavani +4 saat', () => {
    const tek = debtFor([{ date: iso(0), hours: 1, quality: 'bad' }]).debt;   // acik 7 -> 4'e kirpilir
    assert.strictEqual(tek, 4);
  });

  test('gecelik kredi tavani -2 saat (yarim verimle -1)', () => {
    const s = [
      { date: iso(-1), hours: 4, quality: 'bad' },   // D = 4
      { date: iso(0), hours: 16, quality: 'good' },  // kredi -8 -> -2 kirp -> *0.5 = -1
    ];
    // D = max(0, 4*0.85 - 1) = 2.4
    assert.strictEqual(debtFor(s).debt, 2.4);
  });

  test('kayitsiz gece "iyi uyudu" sayilmaz, sadece erime uygulanir', () => {
    const s = [{ date: iso(-3), hours: 4, quality: 'bad' }];   // 3 gun once, sonrasi bos
    const r = debtFor(s);
    assert.ok(r.missing >= 3, 'kayitsiz geceler sayilmali, missing: ' + r.missing);
    assert.ok(r.debt > 0 && r.debt < 4, 'sadece erimis olmali, gelen: ' + r.debt);
    assert.strictEqual(r.nights, 1);
  });

  test('bantlar: temiz / hafif / belirgin / agir', () => {
    const app = loadApp({ seed: null });
    const b = app.window.sleepDebtBand;
    assert.strictEqual(b(0), 'clear');
    assert.strictEqual(b(1.9), 'clear');
    assert.strictEqual(b(2), 'mild');
    assert.strictEqual(b(4.9), 'mild');
    assert.strictEqual(b(5), 'high');
    assert.strictEqual(b(8.9), 'high');
    assert.strictEqual(b(9), 'severe');
    app.close();
  });

  test('kalite->saat modeli yetersiz veride TAHMIN URETMEZ', () => {
    // 8 orneğin altinda sabit katsayi uydurulmamali
    const s = [];
    for (let i = 0; i < 5; i++) s.push({ date: iso(-i), hours: 7, quality: 'ok' });
    s.push({ date: iso(-6), quality: 'bad' });   // saatsiz
    const r = debtFor(s);
    assert.strictEqual(r.modeled, false, 'yetersiz veride model kurulmamali');
    assert.strictEqual(r.est, 0, 'tahmin uretilmemeli');
  });

  test('yeterli veride kalite->saat modeli kurulur ve saatsiz gece hesaba girer', () => {
    const s = [];
    for (let i = 2; i < 12; i++) s.push({ date: iso(-i), hours: i % 2 ? 5 : 8, quality: i % 2 ? 'bad' : 'good' });
    s.push({ date: iso(0), quality: 'bad' });    // saatsiz — modelden tahmin edilmeli
    const r = debtFor(s);
    assert.strictEqual(r.modeled, true);
    assert.ok(r.est >= 1, 'saatsiz gece tahminle hesaba girmeli');
  });
});

describe('uyku — chip-only gece bug regresyonu', () => {
  test('sadece kalite girilen geceler hesaptan DUSMEZ (yeterli model varsa)', () => {
    // Eski bug: hours=null olan gece tum hesaplardan atilinca borc surekli 0
    // gorunuyor, AI'a "UYKU: kayit yok" gidiyordu.
    const s = [];
    for (let i = 3; i < 13; i++) s.push({ date: iso(-i), hours: i % 2 ? 5 : 8, quality: i % 2 ? 'bad' : 'good' });
    for (let i = 0; i < 3; i++) s.push({ date: iso(-i), quality: 'bad' });  // 3 gece chip-only
    const r = debtFor(s);
    assert.ok(r.debt > 0, 'chip-only geceler borca girmeli, gelen: ' + r.debt);
    assert.ok(r.est >= 3, 'ucu de tahminle sayilmali, est: ' + r.est);
  });

  test('badSleepStreak: TEK gun kayit boslugu seriyi bozmaz', () => {
    // Eski bug: eksik gunde break -> 5 gecelik kotu seri 2 gorunuyordu
    const s = [
      { date: iso(0), quality: 'bad', hours: 5 },
      { date: iso(-1), quality: 'bad', hours: 5 },
      // iso(-2) YOK — tek boslu
      { date: iso(-3), quality: 'bad', hours: 5 },
      { date: iso(-4), quality: 'bad', hours: 5 },
    ];
    const app = loadApp({ seed: { sleep: s, settings: {} } });
    assert.strictEqual(app.window.badSleepStreak(), 4, 'tek gun boslugu seriyi kesmemeli');
    app.close();
  });

  test('badSleepStreak: 2 ardisik boskuk seriyi keser', () => {
    const s = [
      { date: iso(0), quality: 'bad', hours: 5 },
      // iso(-1), iso(-2) YOK
      { date: iso(-3), quality: 'bad', hours: 5 },
    ];
    const app = loadApp({ seed: { sleep: s, settings: {} } });
    assert.strictEqual(app.window.badSleepStreak(), 1);
    app.close();
  });
});

describe('uyku borcu — PWA <-> Worker ikiz esitligi', () => {
  test('200 rastgele senaryoda core.js ve worker.js ayni borcu uretir', () => {
    const srv = makeSrv();
    // Deterministik psodo-rastgele (basarisizlik yeniden uretilebilsin)
    let seed = 20260806;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    const senaryolar = [];
    for (let n = 0; n < 200; n++) {
      const sleep = [];
      const gece = 1 + Math.floor(rnd() * 16);
      for (let i = 0; i < gece; i++) {
        if (rnd() < 0.2) continue;                          // kayitsiz gece
        const q = ['bad', 'ok', 'good'][Math.floor(rnd() * 3)];
        const saatVar = rnd() < 0.75;
        sleep.push({
          date: iso(-i),
          quality: q,
          hours: saatVar ? Math.round((2 + rnd() * 10) * 100) / 100 : null,
        });
      }
      senaryolar.push({ sleep, target: [7, 7.5, 8, 8.5, 9][Math.floor(rnd() * 5)] });
    }

    // Tek jsdom penceresi, veri degistirilerek yeniden hesaplanir (hiz icin)
    const app = loadApp({ seed: { sleep: [], settings: {} } });
    const w = app.window;
    // `let data` lexical — window'da degil; dolayli eval ile referans alinir
    const d = app.evalIn('data');
    let kontrol = 0;
    for (const s of senaryolar) {
      d.sleep = s.sleep;
      d.settings.sleepGoal = { targetH: s.target, wake: '07:00' };
      const pwa = w.sleepDebt();
      const wk = srv({ sleep: s.sleep }, s.target);
      assert.strictEqual(pwa.debt, wk.debt,
        'IKIZ KAYMASI (borc): ' + JSON.stringify(s));
      assert.strictEqual(pwa.band, wk.band, 'IKIZ KAYMASI (bant): ' + JSON.stringify(s));
      assert.strictEqual(pwa.nights, wk.nights, 'IKIZ KAYMASI (gece): ' + JSON.stringify(s));
      assert.strictEqual(pwa.est, wk.est, 'IKIZ KAYMASI (tahmin): ' + JSON.stringify(s));
      assert.strictEqual(pwa.modeled, wk.modeled, 'IKIZ KAYMASI (model): ' + JSON.stringify(s));
      kontrol++;
    }
    app.close();
    assert.strictEqual(kontrol, 200);
  });
});
