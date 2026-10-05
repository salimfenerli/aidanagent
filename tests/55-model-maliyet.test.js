/**
 * 55 — MODEL KARARI + AI MALİYET SAYACI (5 Eki 2026)
 *
 * Salim: "kullanılacak AI modeline karar verelim". Bulgu: varsayılan PRO adı
 * 'gemini-3.5-pro' Google'da YOKTU → her PRO isteği 404 alıp sessizce ücretsiz
 * modele düşüyordu. Flash 'gemini-3.5-flash' legacy ve 2 kat pahalıydı.
 *
 * Kilitlenenler:
 *  - PRO = gemini-3.1-pro-preview, Flash = gemini-3.8-flash
 *  - maliyet usageMetadata'dan ÖLÇÜLÜR (girdi + çıktı + DÜŞÜNME token'ı)
 *  - bilinmeyen model ucuz gösterilmez (Pro fiyatıyla sayılır)
 *  - sayaç asla fırlatmaz; tablo yalnız sınırlı RPC ile yazılır
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText, extractDecl } = require('./helpers/src');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const ctx = { Math, Number, String };
vm.createContext(ctx);
vm.runInContext(['AI_FIYAT', 'AI_FIYAT_BILINMEYEN', 'aiCostOf'].map(n => extractDecl(W, n)).join('\n') + '\nthis.aiCostOf = aiCostOf;', ctx);

describe('model kararı', () => {
  test('varsayılanlar: Flash 3.8, Pro 3.1 preview (3.5-pro YOK)', () => {
    assert.match(W, /const GEMINI_MODEL_DEFAULT = 'gemini-3\.8-flash';/);
    assert.match(W, /const GEMINI_MODEL_PRO_DEFAULT = 'gemini-3\.1-pro-preview';/);
    assert.ok(!/'gemini-3\.5-pro'/.test(W), 'var olmayan model adı kodda kaldı');
  });
  test('hedef ajanı PRO alır (model kilidiyle)', () => {
    const g = W.slice(W.indexOf('async function goalThink('), W.indexOf('function goalHeadersService'));
    assert.match(g, /model: t === 'heavy' \? geminiModelPro\(env\) : undefined/);
  });
});

describe('maliyet sayacı', () => {
  test('düşünme token\'ı ÇIKIŞA sayılır', () => {
    const c = ctx.aiCostOf('gemini-3.1-pro-preview', { promptTokenCount: 1000000, candidatesTokenCount: 500000, thoughtsTokenCount: 500000 });
    assert.strictEqual(c.in, 1000000);
    assert.strictEqual(c.out, 1000000);
    assert.strictEqual(c.usd, 14);   // 1M × $2 + 1M × $12
  });
  test('Flash 3.8 fiyatı; "models/" öneki tolere edilir', () => {
    assert.strictEqual(ctx.aiCostOf('models/gemini-3.8-flash', { promptTokenCount: 2000, candidatesTokenCount: 1000 }).usd, 0.00525);
  });
  test('bilinmeyen model ucuz GÖSTERİLMEZ (Pro fiyatı)', () => {
    assert.strictEqual(ctx.aiCostOf('gizemli-model', { promptTokenCount: 1e6 }).usd, 2);
  });
  test('bozuk usage → 0, çökmez', () => {
    for (const u of [null, undefined, {}, { promptTokenCount: 'x' }]) assert.strictEqual(ctx.aiCostOf('gemini-3.8-flash', u).usd, 0);
  });
  test('aiRun her yanıtı ölçer, sayaç asla fırlatmaz, yazma RPC ile', () => {
    const ai = W.slice(W.indexOf('async function aiRun('), W.indexOf('// Zaman yardımcıları'));
    assert.match(ai, /await aiCostLog\(env, usedModel, out\.usage\);/);
    assert.match(ai, /await aiCostLog\(env, usedModel, o3\.usage\);/);
    const log = extractDecl(W, 'aiCostLog') || W.slice(W.indexOf('async function aiCostLog'), W.indexOf('async function aiCostLog') + 1500);
    assert.match(log, /try \{/);
    assert.match(log, /catch \(_\) \{\}/);
    assert.match(log, /\/rest\/v1\/rpc\/ai_cost_add/);
  });
  test('Ayarlar: maliyet kutusu hafiza.js içinde (ilk yükleme bütçesine girmez)', () => {
    assert.match(readText('hafiza.js'), /async function renderAiCost\(\)/);
    assert.ok(!/renderAiCost/.test(readText('ui.js')));
  });
});
