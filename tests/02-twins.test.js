/**
 * 02 — IKIZ KOD NOBETI
 *
 * ui.js (PWA) ve aidan-worker/worker.js (cron) ayni saglik analitigi cekirdegini
 * BIREBIR ayni tasimak zorunda. Elle kopyalandigi icin gecmiste kaydi: uyku
 * kurallari sadece PWA'daydi, ayni veriden iki farkli "OTOMATIK TESPITLER"
 * cikiyordu. Bu test kaymayi deploy'dan ONCE yakalar.
 *
 * Bu blogu duzenlersen IKI DOSYAYA DA yaz.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { readText, extractDecl, normalize } = require('./helpers/src');

const UI = readText('ui.js');
const WK = readText('aidan-worker/worker.js');

// ui.js ve worker.js icinde birebir ayni olmasi gereken bildirimler
const PAYLASILAN = [
  'HC_GROUP_OF', 'HC_GROUP_TR', 'HC_NAME_HINTS', 'HC_WIN',
  'hcMuscleOf', 'hcShift', 'hcDayDiff', 'hcRound', 'hcAvg',
  'hcHevyStats', 'hcNutritionStats', 'hcRegress', 'hcComposition',
  'hcWeightTrend', 'hcEnergyCheck', 'hcTrainingPatterns', 'hcBuildFacts',
  'hcSleepLines', 'hcSleepPatterns', 'hcHabitPatterns', 'hcAllPatterns',
];

describe('ikiz kod: ui.js <-> worker.js', () => {
  test('paylasilan cekirdegin her parcasi iki dosyada da VAR', () => {
    const eksik = [];
    for (const name of PAYLASILAN) {
      if (!extractDecl(UI, name)) eksik.push('ui.js: ' + name);
      if (!extractDecl(WK, name)) eksik.push('worker.js: ' + name);
    }
    assert.deepStrictEqual(eksik, [], 'paylasilan cekirdekte eksik bildirim');
  });

  for (const name of PAYLASILAN) {
    test('birebir ayni: ' + name, () => {
      const a = extractDecl(UI, name);
      const b = extractDecl(WK, name);
      assert.ok(a && b, name + ' iki dosyada da bulunamadi');
      assert.strictEqual(
        normalize(a), normalize(b),
        name + ' ui.js ile worker.js arasinda KAYMIS. Ikisini de ayni yap ' +
        '(CLAUDE.md: paylasilan cekirdek kurali).'
      );
    });
  }

  test('paylasilan cekirdek hicbir global okumaz', () => {
    // Saf olmali: girdiler parametreyle gelir. `data.` / `window.` / `localStorage`
    // sizarsa PWA ile worker farkli sonuc uretir.
    const yasak = /\b(window|document|localStorage)\b|(^|[^.\w])data\./;
    const kirli = [];
    for (const name of PAYLASILAN) {
      const src = stripComments(extractDecl(UI, name));
      if (yasak.test(src)) kirli.push(name);
    }
    assert.deepStrictEqual(kirli, [], 'paylasilan cekirdekte global sizintisi');
  });
});

// Yorum/string icindeki kelimeler yanlis alarm uretmesin
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

describe('ikiz kod: uyku borcu (core.js <-> worker.js)', () => {
  test('uyku sabitleri core.js tarafinda beklenen degerde', () => {
    // Deger degisimi kasitli olabilir ama sessiz OLMAMALI: burasi degisirse
    // worker.js'teki sleepDebtSrv sayilarini da guncellemek zorunludur
    // (davranissal esitlik testi 04-sleep.test.js icinde).
    const core = readText('core.js');
    for (const [name, val] of [['SLEEP_DECAY', '0.85'], ['SLEEP_PAYBACK', '0.5'],
                               ['SLEEP_MAX_GAP', '4'], ['SLEEP_MAX_CREDIT', '2'],
                               ['SLEEP_WINDOW', '14'], ['SLEEP_MODEL_MIN', '8']]) {
      const re = new RegExp(name + '\\s*=\\s*' + val.replace('.', '\\.') + '\\b');
      assert.ok(re.test(core), 'core.js: ' + name + ' artik ' + val + ' degil — ' +
        'worker.js sleepDebtSrv icindeki sabitleri de guncelle');
    }
  });

  test('worker tarafinda sleepDebtSrv ikizi duruyor', () => {
    assert.ok(extractDecl(WK, 'sleepDebtSrv'), 'sleepDebtSrv silinmis — cron raporu PWA ile ayni sayiyi uretmez');
    assert.ok(extractDecl(WK, 'badSleepStreakSrv'), 'badSleepStreakSrv silinmis');
    assert.ok(extractDecl(WK, 'sleepRecoveryNightsSrv'), 'sleepRecoveryNightsSrv silinmis');
  });
});
