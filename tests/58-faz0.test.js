/**
 * 58 — FAZ 0 TEMİZLİK (11 Eki 2026)
 *
 * Salim'in verisinde 10 açık görevin 7'si tanıtım turunun örnek görevleriydi
 * (3 cihaz → 3 kopya); gün planı onları "Bugünün 3'ü" seçiyordu. Ayrıca 390px'te
 * hızlı giriş düğmesi ekrandan taşıyordu. Borsa Aidan'dan çıktı.
 *
 * Kilitlenenler:
 *  - tanıtım turu veriye GÖREV YAZMAZ (örnek görev düğmesi yok)
 *  - hızlı giriş kutusu daralabilir (min-width:0), başlık body padding'inden fazla taşmaz
 *  - borsa: cron'da fiyat alarmı / portföy özeti yok, blob'daki eski kopya init'te atılır
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

describe('tanıtım turu veriye yazmaz', () => {
  const src = readText('onboarding.js');
  test('örnek görev ekleme yolu yok', () => {
    assert.ok(!/makeTask\s*\(/.test(src), 'onboarding.js görev üretmemeli');
    assert.ok(!/Örnek görevlerle/.test(src));
    assert.ok(!/data\.tasks\.push/.test(src));
  });
  test('KAPI: tur bitince görev listesi boş kalır', () => {
    const A = loadApp({ seed: null, scripts: ['core.js', 'tasks.js', 'ui.js', 'onboarding.js'] });
    try {
      A.evalIn("try { localStorage.removeItem('aidan_onboarded') } catch (_) {}");
      A.evalIn('maybeShowOnboarding()');
      A.evalIn('finishOnboard(true)');   // eski çağrı biçimi de görev eklememeli
      assert.strictEqual(A.evalIn('data.tasks.length'), 0);
      assert.strictEqual(A.evalIn("localStorage.getItem('aidan_onboarded')"), '1');
    } finally { A.close(); }
  });
});

describe('390px taşma', () => {
  const css = readText('styles.css');
  test('hızlı giriş kutusu daralabilir', () => {
    const kural = css.slice(css.indexOf('.quick-capture input {'), css.indexOf('}', css.indexOf('.quick-capture input {')));
    assert.match(kural, /min-width:\s*0/);
  });
  test('≤600px\'te başlık body padding\'i (14px) kadar taşar, fazlası değil', () => {
    const m = /@media \(max-width: 600px\) \{\s*body \{ padding: 16px 14px 96px; \}\s*\.app-header \{ margin-left: -14px; margin-right: -14px; \}/.exec(css);
    assert.ok(m, 'mobil başlık marjı body padding\'iyle eşleşmeli');
  });
});

describe('borsa Aidan\'dan çıktı', () => {
  const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
  const sch = W.slice(W.indexOf('async scheduled('), W.indexOf('async scheduled(') + 12000);
  test('cron fiyat alarmı / portföy özeti çalıştırmaz', () => {
    assert.ok(sch.indexOf('async scheduled(') >= 0 || W.indexOf('scheduled(') > 0);
    assert.ok(!/jobs\.push\(runStockCheck\(env\)\)/.test(W), 'fiyat alarmı cron\'da olmamalı');
    assert.ok(!/jobs\.push\(runPortfolioSummary\(env\)\)/.test(W), 'portföy özeti cron\'da olmamalı');
  });
  test('sohbet kimliğinde borsa yok, güvenlik kuralı duruyor', () => {
    assert.ok(!/borsada işlem yapıyor/.test(W));
    assert.match(W, /"al\/sat\/tut" yatırım tavsiyesi VERME/);
  });
  test('KAPI: blob\'daki eski borsa kopyası açılışta atılır', () => {
    const { fixture } = require('./helpers/load');
    const seed = fixture();
    seed.watchlist = [{ sym: 'TUPRS' }]; seed.trades = []; seed.portfolioHistory = [{ date: '2026-10-01' }];
    const A = loadApp({ seed, scripts: ['core.js'] });
    after(() => A.close());
    assert.strictEqual(A.evalIn('typeof data.watchlist'), 'undefined');
    assert.strictEqual(A.evalIn('typeof data.trades'), 'undefined');
    assert.strictEqual(A.evalIn('typeof data.portfolioHistory'), 'undefined');
  });
});
