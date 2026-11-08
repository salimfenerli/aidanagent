/**
 * 74 — ODAK SEKMESİ KALDIRILDI + ALT GEZİNME BEYAZ KUTU (8 Kas 2026)
 *
 * Salim: "odak kısmını kaldıralım, kullanmıyorum" + "alttaki sekmelere tıklayınca bembeyaz oluyor".
 * - Odak'a giden hiçbir düğme yok (üst sekme, alt gezinme, menü, görev kartı Başla/2 dk,
 *   plan bloğu, aktif görev bandı); showTab('focus') görevlere döner. Panel yalnız
 *   pomodoro motorunun id'leri için DOM'da, gizli.
 * - iOS dokunuştan sonra :hover yapışık kalır → genel `button:hover` dolu zemini YALNIZ
 *   (hover: hover) cihazlarda. Yoksa arka planı none olan alt gezinme düğmesi beyaz kalıyordu.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

describe('Odak sekmesi kaldırıldı', () => {
  const A = loadApp();
  after(() => A.close());
  const doc = A.window.document;

  test('hiçbir gezinme düğmesi Odak\'a gitmiyor', () => {
    assert.strictEqual(doc.querySelector('[data-tab="focus"], [data-nav="focus"], [data-bnav="focus"]'), null);
    const html = readText('asistan.html');
    assert.doesNotMatch(html, /onclick="showTab\('focus'/);
    assert.doesNotMatch(html, /navTo\('focus'\)/);
  });

  test('showTab(\'focus\') görevlere döner, panel gizli', () => {
    A.window.showTab('focus');
    assert.ok(doc.getElementById('tasks').classList.contains('active'));
    assert.ok(!doc.getElementById('focus').classList.contains('active'));
    assert.ok(doc.getElementById('focus').hasAttribute('hidden'));
  });

  test('görev kartı ve plan bloğunda sayaç başlatan düğme yok', () => {
    assert.doesNotMatch(readText('ui.js'), /onclick="startTaskNow\(/);
    assert.doesNotMatch(readText('tasks.js'), /onclick="focusPlanBlock\(/);
    assert.doesNotMatch(readText('tasks.js'), /showTab\('focus', document/);
  });

  test('öneri kabul = Bugünün 3\'üne al (sayaç yok)', () => {
    A.evalIn("data.tasks = [{ id: 901, text: 'deneme', done: false }]; _suggestedTaskId = 901; acceptSuggestion(false)");
    assert.strictEqual(A.evalIn("data.tasks[0].mitDate === today()"), true);
    assert.strictEqual(A.evalIn("currentFocusTaskId"), null);
  });

  test('tanıtım adımlarında Odak yok', () => {
    assert.doesNotMatch(readText('ui.js'), /title: 'Odak \(Pomodoro\)'/);
    assert.doesNotMatch(readText('onboarding.js'), /title: 'Odak modu'/);
  });
});

describe('alt gezinme: yapışık hover beyaz kutu', () => {
  test('genel button:hover yalnız (hover: hover) içinde', () => {
    const css = readText('styles.css');
    const ciplak = css.split('\n').filter(l => /^\s*button:hover\s*\{/.test(l));
    assert.deepStrictEqual(ciplak, [], 'medya sorgusuz button:hover: ' + ciplak.join(' | '));
    assert.match(css, /@media \(hover: hover\) \{ button:hover \{ background: var\(--accent-hover\)/);
  });
});
