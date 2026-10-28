/**
 * 62 — FAZ 3: GÜNDE 2 BİLDİRİM (13 Eki 2026)
 *
 * Eskiden günde 4 push (08 sabah · 09 deadline · 12 öğle · 21 akşam), Pazar 4+.
 * Salim'in derdi elle giriş → akşamki tek bildirim SOHBETİ açar (tek giriş kapısı).
 *
 * Kilitlenenler:
 *  - cron: 09:00 deadline ve 12:00 öğle push'u YOK; son tarihler sabah mesajında
 *  - 21:00 "Günü kapat" → url /?ac=sohbet, metni kod kurar (AI yok), kayıtsız alanları söyler
 *  - Pazar: haftalık görev push'u yok, sağlık raporu SESSİZ (kaydedilir, push yok) → tek koç push'u
 *  - KAPI: /?ac=sohbet ve SW 'AC' mesajı sohbet panelini açar
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText, extractDecl } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const ctx = { Math, Number, String, Array, Object, JSON };
vm.createContext(ctx);
vm.runInContext(['sabahSonTarihSatiri', 'buildGunuKapat'].map(n => extractDecl(W, n)).join('\n') +
  '\nthis.S = sabahSonTarihSatiri; this.G = buildGunuKapat;', ctx);
const js = (x) => JSON.parse(JSON.stringify(x));
const B = '2026-10-13', Y = '2026-10-14';

describe('cron takvimi', () => {
  const sch = W.slice(W.indexOf('async scheduled('), W.indexOf('// allSettled'));
  test('09:00 deadline ve 12:00 öğle push\'u yok', () => {
    assert.ok(!/at\(9, 0\)/.test(sch));
    assert.ok(!/at\(12, 0\)/.test(sch));
    assert.ok(!/runCronJob\(env, 'evening'\)/.test(sch));
  });
  test('21:00 Günü kapat; Pazar tek bildirim (haftalık görev push\'u yok, sağlık sessiz)', () => {
    assert.match(sch, /at\(21, 0\)\) jobs\.push\(\s*runCronJob\(env, 'gunukapat'\)/);
    assert.ok(!/runCronJob\(env, 'weekly'\)/.test(sch));
    assert.match(sch, /runCronJob\(env, 'health', \{ sessiz: true \}\)[\s\S]{0,120}runHaftaOzet\(env\)/);
  });
  test('sessiz mod push atmaz ama kaydeder', () => {
    const r = W.slice(W.indexOf('async function runCronJob('), W.indexOf('function logPush('));
    assert.match(r, /if \(!sessiz\) \{\s*await sendPushToAll/);
    assert.match(r, /saveUserData\(env, u\.userId, u\.data\)/);
  });
  test('sabah mesajı son tarihleri taşır', () => {
    assert.match(W, /const sonTarih = sabahSonTarihSatiri\(u\.data, trToday\(\), trDate\(1\)\);/);
  });
});

describe('metinler (kod kurar)', () => {
  const D = {
    tasks: [
      { text: 'Mat', due: B }, { text: 'Fizik', due: Y }, { text: 'Kimya', due: Y }, { text: 'Bio', due: Y }, { text: 'Tarih', due: Y },
      { text: 'Bitti', due: B, done: true, doneDate: B, mitDate: B }, { text: 'MIT2', mitDate: B },
    ],
    diet: { days: { [B]: { meals: [{ kcal: 500 }] } } },
    harcama: [{ d: '2026-10-12', tl: 50 }],
  };
  test('sabah satırı: bugün + yarın, 3\'ten fazlası sayılır', () => {
    assert.strictEqual(ctx.S(D, B, Y), '🔥 Bugün son gün: Mat\n⏰ Yarın son gün: Fizik, Kimya, Bio +1');
    assert.strictEqual(ctx.S({}, B, Y), '');
  });
  test('Günü kapat: sayılar, kayıtsız alanlar, sohbet bağlantısı', () => {
    const p = js(ctx.G(D, B, Y));
    assert.strictEqual(p.title, '🌙 Günü kapat');
    assert.strictEqual(p.url, '/?ac=sohbet');
    assert.match(p.message, /Bugün 1 iş bitti · Bugünün 3'ü 1\/2/);
    assert.match(p.message, /Kayıtsız: harcama, uyku\./);
    assert.match(p.message, /Yarın son gün: Fizik, Kimya \+2/);
  });
  test('her şey kayıtlıysa eksik demez; boş veride çökmez', () => {
    const p = js(ctx.G({ diet: { days: { [B]: { meals: [{}] } } }, harcama: [{ d: B, tl: 1 }], sleep: [{ date: B, hours: 7 }] }, B, Y));
    assert.match(p.message, /Kayıtlar tamam/);
    assert.match(js(ctx.G(null, B, Y)).message, /Kayıtsız: öğün, harcama, uyku/);
  });
});

describe('KAPI — bildirim sohbeti açar', () => {
  test('SW açık uygulamaya AC mesajı yollar', () => {
    const sw = readText('sw.js');
    assert.match(sw, /postMessage\(\{ type: 'AC', ac: ac\[1\] \}\)/);
  });
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'hafta.js', 'bugun.js'] });
  after(() => A.close());
  test('pushAc(\'sohbet\') sohbet panelini açar', async () => {
    A.evalIn("_moduleLoads.bugun = Promise.resolve(); pushAc('sohbet')");
    await new Promise(r => setTimeout(r, 30));
    assert.ok(A.window.document.getElementById('chat').classList.contains('active'));
  });
});
