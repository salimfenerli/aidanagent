/**
 * 64 — SOHBETTEN SABİT PROGRAM (14 Eki 2026)
 *
 * Salim: "sohbete yazdığımı tak diye programa koyuyordu, öyle istemiyorum — anlayıp
 * özümseyip kaydetsin, AI'dan yararlanayım". Akış: model ANLAR (program_kaydet), kod
 * DOĞRULAR (agentSanitizeActions), kart ETKİYİ gösterir (hfGun önce/sonra), Uygula yazar.
 *
 * Kilitlenenler:
 *  - 🔒 tür beyaz listede, gün 0-6 ya da Türkçe ad, saat HH:MM, başlangıç < bitiş; eksikse eylem YOK
 *  - prompt: kısaltma açılır, belirsiz saatte SORAR, zaten kayıtlıysa araç çağırmaz, tek seferlik → gorev_ekle
 *  - bağlam: KAYITLI PROGRAM (okul + ek ders adlarıyla) modele gider
 *  - okul → duzen.okul, ders → duzen.ders (ad ile), dövüş/sabit → fixedSchedule; aynı ad üzerine yazar
 *  - KAPI: kart antrenman kaymasını + ödev süresini + çakışmayı gösterir; Uygula yazar, Geri al geri alır
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const BLOK = W.slice(W.indexOf('// 🤖 SOHBET AJANI (5 Eki 2026)'), W.indexOf('// 🤖 SOHBET AJANI SONU'));
const ctx = { console, Date, JSON, Math, String, Array, Object, Set, Map, Error, Promise, Number, isNaN, memHeaders: () => ({}) };
vm.createContext(ctx);
vm.runInContext(BLOK + '\nthis.S = agentSanitizeActions; this.C = agentContext; this.P = AGENT_PROMPT; this.T = AGENT_TOOLS;', ctx);
const js = (x) => JSON.parse(JSON.stringify(x));
const S = (calls) => js(ctx.S(calls, { today: '2026-10-14', taskIds: [] }));
const P = (args) => S([{ name: 'program_kaydet', arguments: args }]);

describe('temizleyici', () => {
  test('anlaşılmış program geçer; Türkçe gün adları çözülür, Pzt→Paz sıralı', () => {
    assert.deepStrictEqual(P({ islem: 'ekle', tur: 'ders', ad: 'Matematik dersi', gunler: [3, 1], bas: '17:30', bit: '18:30' }),
      [{ type: 'program_kaydet', islem: 'ekle', tur: 'ders', ad: 'Matematik dersi', gunler: [1, 3], bas: '17:30', bit: '18:30' }]);
    assert.deepStrictEqual(P({ islem: 'ekle', tur: 'dovus', ad: 'Kickboks', gunler: ['Cumartesi', 'çar', 0], bas: '15.00', bit: '17:00' })[0].gunler, [3, 6, 0]);
  });
  test('🔒 bozuk saat / ters aralık / gün yok / tür dışı / adsız sabit → eylem YOK', () => {
    const k = { islem: 'ekle', tur: 'ders', ad: 'X', gunler: [1], bas: '17:30', bit: '18:30' };
    assert.deepStrictEqual(P(Object.assign({}, k, { bit: '17:00' })), []);
    assert.deepStrictEqual(P(Object.assign({}, k, { bas: '25:00' })), []);
    assert.deepStrictEqual(P(Object.assign({}, k, { gunler: [9, 'yarın'] })), []);
    assert.deepStrictEqual(P(Object.assign({}, k, { tur: 'sinav' })), []);
    assert.deepStrictEqual(P(Object.assign({}, k, { tur: 'sabit', ad: '' })), []);
  });
  test('silme saat istemez; okul adı taşımaz', () => {
    assert.deepStrictEqual(P({ islem: 'sil', tur: 'ders', ad: 'Kurs', gunler: [3] })[0], { type: 'program_kaydet', islem: 'sil', tur: 'ders', ad: 'Kurs', gunler: [3], bas: null, bit: null });
    assert.strictEqual(P({ islem: 'ekle', tur: 'okul', ad: 'okul', gunler: [6], bas: '09:00', bit: '14:00' })[0].ad, '');
  });
});

describe('model ne biliyor / ne yapması isteniyor', () => {
  test('araç tanımlı; prompt anlamayı, sormayı ve tekrar kaydetmemeyi ister', () => {
    assert.ok(ctx.T.some(t => t.name === 'program_kaydet'));
    assert.match(ctx.P, /SABİT PROGRAM[^\n]*program_kaydet/);
    assert.match(ctx.P, /belirsizse ARAÇ ÇAĞIRMA, tek cümleyle sor/);
    assert.match(ctx.P, /aynısı zaten kayıtlıysa araç çağırma/);
    assert.match(ctx.P, /Tek seferlik olay[^\n]*gorev_ekle/);
  });
  test('bağlamda KAYITLI PROGRAM (okul + adlı ek ders) var', () => {
    const c = ctx.C({ diet: { nut: { duzen: { okul: { 1: { bas: '09:00', bit: '17:00' } }, ders: { 1: { bas: '17:30', bit: '18:30', ad: 'Matematik dersi' } } } } } }, '2026-10-14');
    assert.match(c, /KAYITLI PROGRAM — OKUL: Pzt 09:00-17:00/);
    assert.match(c, /KAYITLI PROGRAM — EK DERS\/KURS: Pzt Matematik dersi 17:30-18:30/);
  });
});

describe('KAPI — kart etkiyi gösterir, Uygula yazar, Geri al geri alır', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'hafta.js', 'ajan.js'] });
  after(() => A.close());
  const doc = A.window.document;
  const kur = (actions) => {
    A.evalIn('data.chat = data.chat || []');
    A.window.__acts = actions;
    A.evalIn("data.chat.push({ role: 'assistant', content: 'Hazırladım', actions: window.__acts })");
    const mi = A.evalIn('ensureChat().length - 1');
    const slot = doc.createElement('div'); slot.className = 'chat-ajan'; slot.dataset.i = String(mi);
    doc.body.appendChild(slot);
    A.evalIn('renderChatActions()');
    return { mi, slot };
  };
  A.evalIn(`ensureDiet(); data.diet.nut = { duzen: { okul: { '1': { bas: '09:00', bit: '17:00' }, '3': { bas: '09:00', bit: '17:00' } }, antrenman: '17:00' } };
    data.program = { days: [{ dow: 1, name: 'Alt Vücut A', type: 'strength' }] }; data.fixedSchedule = [];`);

  test('ders: kart antrenman kaymasını ve ödev süresini gösterir; Uygula duzen.ders\'e adıyla yazar; Geri al siler', async () => {
    const { mi, slot } = kur([{ type: 'program_kaydet', islem: 'ekle', tur: 'ders', ad: 'Matematik dersi', gunler: [1, 3], bas: '17:30', bit: '18:30' }]);
    const t = slot.textContent;
    assert.match(t, /Programa ekle: Matematik dersi/);
    assert.match(t, /Pzt, Çar · 17:30-18:30 · her hafta/);
    assert.match(t, /Pzt Alt Vücut A \d\d:\d\d → 19:00/);
    assert.match(t, /Çar ödeve kalan süre \d+ → \d+ dk/);
    await A.evalIn('ajanApply(' + mi + ', 0, true)').then(g => { A.window.__geri = g; });
    assert.strictEqual(A.evalIn("data.diet.nut.duzen.ders['3'].ad"), 'Matematik dersi');
    assert.strictEqual(A.evalIn("data.diet.nut.duzen.ders['1'].bas"), '17:30');
    A.evalIn('window.__geri()');
    assert.strictEqual(A.evalIn("typeof (data.diet.nut.duzen.ders || {})['1']"), 'undefined');
    assert.strictEqual(A.evalIn("data.diet.nut.duzen.okul['1'].bit"), '17:00', 'geri alma okulu bozmaz');
  });

  test('çakışma uyarısı: okul saatine konan program işaretlenir', () => {
    const { slot } = kur([{ type: 'program_kaydet', islem: 'ekle', tur: 'sabit', ad: 'Satranç kulübü', gunler: [3], bas: '16:00', bit: '18:00' }]);
    assert.match(slot.textContent, /Çar Okul 09:00-17:00 ile çakışıyor/);
  });

  test('dövüş/sabit fixedSchedule\'a; aynı ad üzerine yazar, sil gün çıkarır', () => {
    const uyg = (a) => A.evalIn('ajanProgUygula(data, ' + JSON.stringify(a) + ')');
    uyg({ islem: 'ekle', tur: 'dovus', ad: 'Kickboks', gunler: [3, 6], bas: '19:00', bit: '20:30' });
    uyg({ islem: 'ekle', tur: 'dovus', ad: 'Kickboks', gunler: [6], bas: '15:00', bit: '17:00' });   // Cmt saati değişti
    let fs = JSON.parse(A.evalIn('JSON.stringify(data.fixedSchedule)'));
    assert.deepStrictEqual(fs.map(f => [f.label, f.days, f.start]), [['Kickboks', [3], '19:00'], ['Kickboks', [6], '15:00']]);
    uyg({ islem: 'ekle', tur: 'dovus', ad: 'Antrenman salonu', gunler: [2], bas: '19:00', bit: '20:00' });
    assert.ok(A.evalIn("data.fixedSchedule.some(f => f.label === 'Dövüş: Antrenman salonu')"), 'dövüş adı hfGun kuralına uyar');
    uyg({ islem: 'sil', tur: 'dovus', ad: 'Kickboks', gunler: [3] });
    fs = JSON.parse(A.evalIn('JSON.stringify(data.fixedSchedule)'));
    assert.deepStrictEqual(fs.filter(f => f.label === 'Kickboks').map(f => f.days), [[6]]);
  });
});

describe('KAPI — program değişince hazır gün planı bayat kalmaz (14 Eki gerçek hata)', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'hafta.js', 'ajan.js'] });
  after(() => A.close());
  test('bugünün planı yeniden kurulur, Geri al eski planı getirir; bitmiş blok varsa dokunulmaz', async () => {
    A.evalIn(`ensureDiet(); data.diet.nut = { duzen: { antrenman: '17:00' } }; data.fixedSchedule = [];
      data.program = { days: [{ dow: new Date(today() + 'T12:00:00').getDay(), name: 'Dövüş antrenmanı', type: 'fight' }] };
      data.dayPlan = { date: today(), blocks: [{ id: 1, label: 'Dövüş antrenmanı', start: '17:30', end: '19:00', kind: 'fixed' }] };
      window.__a = { type: 'program_kaydet', islem: 'ekle', tur: 'ders', ad: 'Matematik dersi', gunler: [new Date(today() + 'T12:00:00').getDay()], bas: '17:30', bit: '18:30' };
      data.chat = [{ role: 'assistant', content: 'x', actions: [window.__a] }];`);
    const geri = await A.evalIn('ajanApply(0, 0, true)');
    const bloklar = JSON.parse(A.evalIn('JSON.stringify(data.dayPlan.blocks)'));
    assert.ok(bloklar.some(b => /Matematik dersi/.test(b.label) && b.start === '17:30'), JSON.stringify(bloklar));
    assert.ok(!bloklar.some(b => /Dövüş/.test(b.label) && b.start === '17:30'), 'dövüş 17:30\'da kalmamalı');
    geri();
    assert.strictEqual(A.evalIn('data.dayPlan.blocks[0].start'), '17:30');
    assert.strictEqual(A.evalIn('data.dayPlan.blocks.length'), 1);
    A.evalIn("data.dayPlan.blocks[0].done = true");
    assert.strictEqual(A.evalIn('ajanProgPlanYenile(window.__a)'), false);
  });
});
