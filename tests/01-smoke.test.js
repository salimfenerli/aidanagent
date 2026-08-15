/**
 * 01 — BASLATMA DUMANI (en kritik test dosyasi)
 *
 * 6 Agustos 2026: core.js sayfa yuklenirken TDZ ReferenceError firlatti
 * (`CHAT_PRUNE_DAYS` tanimindan once kullanilmis). Sonuc: chat dahil hicbir
 * buton calismadi. `node --check` temizdi — sozdizimi dogruydu, hata calisma
 * zamanindaydi. Bu dosya o sinifi kalici olarak kilitler.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, fixture } = require('./helpers/load');

describe('baslatma dumani', () => {
  test('4 modul BOS veriyle hatasiz yuklenir', () => {
    const app = loadApp({ seed: null });
    assert.deepStrictEqual(app.errors, [], 'bos state yuklemesinde calisma zamani hatasi');
    app.close();
  });

  test('4 modul GERCEKCI veriyle hatasiz yuklenir', () => {
    // Bos state yeterli DEGIL: 6 Agustos bug'i sadece data.chat doluyken
    // tetikleniyordu. Gercekci fixture olmadan o bug yine kacardi.
    const app = loadApp();
    assert.deepStrictEqual(app.errors, [], 'gercekci veri yuklemesinde calisma zamani hatasi');
    app.close();
  });

  test('bozuk/eksik alanlarla dolu veride de yuklenir', () => {
    const app = loadApp({
      seed: {
        tasks: [null, { id: 1 }, { id: 2, text: 'ok', subtasks: null }],
        chat: [null, { role: 'user' }, 'bozuk-string'],
        notes: null,
        sleep: [{ date: 'gecersiz' }, null],
        diet: { days: { 'abc': null }, weights: [null, { date: null }] },
        watchlist: [null, {}],
        trades: 'dizi-degil',
        reminders: [null],
        settings: null,
      },
    });
    assert.deepStrictEqual(app.errors, [], 'bozuk veri yuklemeyi comertmemeli');
    app.close();
  });

  test('init sirasinda cagrilan fonksiyonlarin sabitleri ONCE tanimli (TDZ nobeti)', () => {
    // Sabotaj: CHAT_PRUNE_DAYS tanimini dosyanin en altina tasi.
    // Bu 6 Agustos bug'inin birebir yeniden uretimidir; test YAKALAMALI.
    const app = loadApp({
      transform: {
        'core.js': (src) => {
          const decl = 'const CHAT_PRUNE_DAYS = 60;';
          assert.ok(src.includes(decl), 'sabotaj hedefi bulunamadi — testi guncelle');
          return src.replace(decl, '') + '\n' + decl + '\n';
        },
      },
      scripts: ['core.js'],
    });
    assert.ok(
      app.errors.some((e) => /CHAT_PRUNE_DAYS|before initialization/i.test(e)),
      'TDZ nobeti calismiyor: sabote edilmis core.js hata uretmedi, ' +
      'yani bu test gercek bir regresyonu da yakalayamaz'
    );
    app.close();
  });

  test('kritik global fonksiyonlar tanimli', () => {
    const app = loadApp();
    const w = app.window;
    const gerekli = [
      'today', 'isoLocal', 'shiftDateStr', 'save', 'saveLocal', 'pruneOldData',
      'ensureChat', 'chatPush', 'ensureNotes', 'noteAutoTitle',
      'ensureSleep', 'logSleep', 'sleepDebt', 'badSleepStreak',
      'escapeHtml', 'chatFormat', 'renderChatMessages',
      'hcBuildFacts', 'hcHevyStats', 'hcNutritionStats', 'hcWeightTrend',
    ];
    const eksik = gerekli.filter((f) => typeof w[f] !== 'function');
    assert.deepStrictEqual(eksik, [], 'eksik global fonksiyon');
    app.close();
  });

  test('init sonrasi lexical sabitler erisilebilir', () => {
    const app = loadApp();
    assert.strictEqual(app.evalIn('CHAT_KEEP'), 60);
    assert.strictEqual(app.evalIn('CHAT_PRUNE_DAYS'), 60);
    assert.strictEqual(app.evalIn('typeof lastUserActivity'), 'number');
    app.close();
  });

  test('sekme degistirme tum sekmelerde patlamaz (+ bilinmeyen ad)', () => {
    const app = loadApp();
    const w = app.window;
    assert.strictEqual(typeof w.showTab, 'function');
    // 14 Agu 2026: 'stocks' sekmesi kalkti. 'stocks' yine deneniyor — AMA
    // artik cokmemesi, gorevlere donmesi bekleniyor (eski yer imi senaryosu).
    for (const t of ['tasks', 'plan', 'focus', 'diet', 'chat', 'settings', 'stocks']) {
      try { w.showTab(t); } catch (e) { assert.fail('showTab("' + t + '") patladi: ' + e.message); }
    }
    assert.deepStrictEqual(app.errors, []);
    app.close();
  });
});
