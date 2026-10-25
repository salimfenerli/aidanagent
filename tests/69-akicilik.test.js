/**
 * 69 — AKICILIK (20 Eki 2026)
 *
 * Salim: "ui iyileştirelim, uygulama daha smooth olsun". Telefon boyutunda ölçüldü:
 *  - görev yakalama çubuğu + kısayollar + bildirim bandı HER sekmede ilk ekranın ~%30'u
 *  - öğün kartı 1,2 sn sonra gelip "Bugünün 3'ü"nü aşağı itiyordu
 *  - Diyet modülü inerken boş iskelet görünüp sonra tüm sekme zıplıyordu (kayma 0.48)
 *  - sekme değişince sayfa eski kaydırma konumunda kalıyordu
 * Kilitlenenler: sekmeye özel üst alan (body[data-tab]), yükleme sırasında iskelet gizli,
 * sekme geçişinde başa dönüş + kısa belirme (reduced-motion'da yok), öğün kartı gecikmesiz.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const css = readText('styles.css');
const A = loadApp();
after(() => A.close());
const doc = A.window.document;

describe('sekmeye özel üst alan', () => {
  test('body başlangıçta tasks, sekme değişince güncellenir', () => {
    assert.strictEqual(doc.body.dataset.tab, 'tasks');
    A.evalIn("showTab('plan', document.querySelector('[data-tab=plan]'))");
    assert.strictEqual(doc.body.dataset.tab, 'plan');
    A.evalIn("showTab('tasks', document.querySelector('[data-tab=tasks]'))");
    assert.strictEqual(doc.body.dataset.tab, 'tasks');
  });
  test('CSS: yakalama çubuğu, kısayollar, bildirim bandı yalnız Görevler\'de', () => {
    for (const sec of ['.quick-capture', '.quick-actions', '#notifBanner']) {
      assert.ok(css.includes('body[data-tab]:not([data-tab="tasks"]) ' + sec), sec);
    }
  });
  test('sekme değişince başa kaydırır', () => {
    const se = doc.scrollingElement || doc.documentElement;
    se.scrollTop = 500;
    A.evalIn("showTab('plan', document.querySelector('[data-tab=plan]'))");
    assert.strictEqual(se.scrollTop, 0);
    A.evalIn("showTab('tasks', document.querySelector('[data-tab=tasks]'))");
  });
});

describe('zıplama yok', () => {
  test('modül inerken panel "yukleniyor": iskelet gizli, çubuk sabit; bitince kalkar', () => {
    A.evalIn("setModuleLoading('diet', true)");
    const p = doc.getElementById('diet');
    assert.ok(p.classList.contains('yukleniyor'));
    assert.ok(p.querySelector('.mod-loading'));
    A.evalIn("setModuleLoading('diet', false)");
    assert.ok(!p.classList.contains('yukleniyor'));
    assert.ok(!p.querySelector('.mod-loading'));
    A.evalIn("setModuleLoading('diet', false, 'nutrition')");   // hata: çubuk görünür, iskelet gizli değil
    assert.ok(!p.classList.contains('yukleniyor'));
    assert.match(p.querySelector('.mod-loading').textContent, /yuklenemedi/);
    A.evalIn("setModuleLoading('diet', false)");
  });
  test('CSS: yükleme iskeleti gizli + çubuk mutlak konumda', () => {
    assert.match(css, /\.panel\.yukleniyor > :not\(\.mod-loading\) \{ visibility: hidden; \}/);
    assert.match(css, /\.panel\.yukleniyor > \.mod-loading \{ position: absolute;/);
  });
  test('öğün kartı ilk çizimle birlikte (gecikme yok)', () => {
    assert.match(readText('ui.js'), /loadModule\('ogun'\)\.then\(\(\) => bugunBaslat\(\)\)\.catch\(\(\) => \{\}\);\r?\n\}, 0\);/);
  });
  test('sekme belirmesi kısa ve reduced-motion\'da kapalı', () => {
    assert.match(css, /\.panel\.active \{ animation: panelGir 180ms/);
    assert.match(css, /prefers-reduced-motion: reduce\) \{ \.panel\.active \{ animation: none; \} \}/);
  });
});
