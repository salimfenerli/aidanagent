/**
 * 50 — HAFIZA HER YERDE + SIKIŞTIRMA (4 Eki 2026)
 *
 * Salim: Meta Muse karşılaştırması → "ortak hafıza" adım 1.
 * 28 Eyl'de hafıza yalnız sohbet / elle plan / sağlık koçundaydı. Sabah
 * brifingi, haftalık özet, gece otomatik planı, borsa yorumları, diyet ve
 * program kurulumu hafızayı GÖRMÜYORDU.
 *
 * Kilitlenenler:
 *  - kapsam: her uç yalnız işine yarayan kategorileri görür (borsa ≠ diyet)
 *  - cron okuyucu service key / eski token yolunu seçer, ASLA fırlatmaz
 *  - sıkıştırma yalnız 'auto' maddeleri birleştirir; seed/user DOKUNULMAZ
 *  - sıkıştırma 'light' katmanda, yalnız hafıza büyüdüğünde çalışır
 *  - hafıza talimattan ÖNCE gelir (talimat en sonda — 16-instructions ile uyumlu)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const bas = W.indexOf('// 🧠 UZUN SÜRELİ HAFIZA (28 Eyl 2026)');
const sonFn = W.indexOf('async function memoryExtract');
const BLOK = W.slice(bas, W.indexOf('\n}\n', sonFn) + 3);

function kur(stub) {
  const ctx = Object.assign({ console, Date, JSON, Math, String, Array, Object, Set, Map, Error, Promise }, stub || {});
  vm.createContext(ctx);
  vm.runInContext(BLOK + `
    this.memoryBlock = memoryBlock; this.memoryCompactApply = memoryCompactApply; this.memoryCompact = memoryCompact;
    this.memoryFetchForCron = memoryFetchForCron; this.memoryExtract = memoryExtract;
    this.MEM_SCOPE = MEM_SCOPE; this.MEM_COMPACT_AT = MEM_COMPACT_AT; this.MEM_MAX_ITEMS = MEM_MAX_ITEMS;
    this.MEM_COMPACT_PROMPT = MEM_COMPACT_PROMPT;`, ctx);
  return ctx;
}
const js = (x) => JSON.parse(JSON.stringify(x));
const fn = (ad) => {
  const a = W.indexOf('async function ' + ad + '(');
  assert.ok(a > 0, ad + ' yok');
  const m = /\n(async )?function /.exec(W.slice(a + 10));
  return W.slice(a, a + 10 + m.index);
};

const ORNEK = [
  { id: 'b1', text: 'BIMAS uzun pozisyonda', cat: 'borsa' },
  { id: 'd1', text: 'Basmati sevmiyor', cat: 'beslenme' },
  { id: 'h1', text: 'Koç Üniversitesi hedefi', cat: 'hedef' },
  { id: 'a1', text: 'Squat haftada tek gün', cat: 'antrenman' },
];

describe('kapsam — her uç kendi kategorilerini görür', () => {
  const M = kur();
  test('borsa kapsamı beslenme bilgisini taşımaz', () => {
    const b = M.memoryBlock(ORNEK, M.MEM_SCOPE.borsa);
    assert.match(b, /BIMAS/);
    assert.match(b, /Koç/);
    assert.ok(!/Basmati|Squat/.test(b), 'borsa promptuna alakasız bilgi sızdı');
  });
  test('beslenme kapsamı borsa bilgisini taşımaz', () => {
    const b = M.memoryBlock(ORNEK, M.MEM_SCOPE.beslenme);
    assert.match(b, /Basmati/);
    assert.ok(!/BIMAS/.test(b));
  });
  test('kapsam verilmezse hepsi gider (sohbet — eski davranış)', () => {
    const b = M.memoryBlock(ORNEK);
    for (const k of ['BIMAS', 'Basmati', 'Koç', 'Squat']) assert.ok(b.includes(k), k);
  });
  test('kapsamda madde yoksa boş dize — token harcanmaz', () => {
    assert.strictEqual(M.memoryBlock([{ id: 'x', text: 'Basmati sevmiyor', cat: 'beslenme' }], M.MEM_SCOPE.borsa), '');
  });
  test('her kapsam geçerli kategori kullanıyor', () => {
    const gecerli = ['hedef', 'antrenman', 'beslenme', 'okul', 'borsa', 'tercih', 'genel'];
    for (const [ad, cats] of Object.entries(M.MEM_SCOPE)) {
      for (const c of cats) assert.ok(gecerli.includes(c), ad + ': ' + c);
    }
  });
});

describe('bağlantılar — hafızayı artık gören uçlar', () => {
  const UCLAR = [
    ['handleJournalApi', 'gun'],
    ['handlePortfolioCommentApi', 'borsa'],
    ['handleStockAnalysisApi', 'borsa'],
    ['handlePortfolioTechnicalApi', 'borsa'],
    ['handleSuggestApi', 'gun'],
    ['handleDietPlanApi', 'beslenme'],
    ['handleProgramCfgApi', 'antrenman'],
  ];
  for (const [ad, kapsam] of UCLAR) {
    test(ad + ' hafızayı kullanıcı token’ıyla okur, ' + kapsam + ' kapsamıyla verir', () => {
      const g = fn(ad);
      assert.match(g, /memoryFetch\(env, userToken, user\.id\)/);
      assert.ok(g.includes('memoryBlock(memItems, MEM_SCOPE.' + kapsam + ')'), 'kapsam yanlış/eksik');
      const mi = g.indexOf('memoryBlock(memItems'), ii = g.indexOf('instructionsBlock(', mi);
      if (ii > 0) assert.ok(mi < ii, 'hafıza talimattan SONRA geliyor');
    });
  }
  test('sabah brifingi + haftalık özet cron’da hafızayı görür', () => {
    assert.match(W, /buildMorningAi\(env, u\.data, autoSetMorningMit\(u\.data\), await memoryFetchForCron\(env, u\)\)/);
    assert.match(W, /buildWeekly\(env, u\.data, await memoryFetchForCron\(env, u\)\)/);
    assert.match(fn('buildMorningAi'), /memoryBlock\(memory, MEM_SCOPE\.gun\) \+ instructionsBlock\(data\)/);
    assert.match(fn('buildWeekly'), /memoryBlock\(memory, MEM_SCOPE\.gun\)/);
  });
  test('gece otomatik planı hafızayı görür', () => {
    assert.match(fn('runAutoPlanForUser'), /memory: await memoryFetchForCron\(env, u\)/);
  });
  test('⚠️ splitPrompt (JSON sözleşmesi) hafıza ALMIYOR', () => {
    assert.ok(!/memoryBlock/.test(fn('handleSplitApi')));
  });
});

describe('cron okuyucu — memoryFetchForCron', () => {
  const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'anon', SUPABASE_SERVICE_KEY: 'SERVIS-ANAHTARI-UZUN-12345' };
  test('service key varsa onunla okur', async () => {
    const log = [];
    const M = kur({ hasServiceKey: () => true, fetch: async (url, init) => { log.push({ url, init }); return { ok: true, json: async () => [{ items: ORNEK }] }; } });
    const r = js(await M.memoryFetchForCron(ENV, { userId: 'u1' }));
    assert.strictEqual(r.length, 4);
    assert.match(log[0].url, /aidan_memory\?user_id=eq\.u1/);
    assert.strictEqual(log[0].init.headers.Authorization, 'Bearer ' + ENV.SUPABASE_SERVICE_KEY);
  });
  test('service key yoksa eski tek-kullanıcı token’ı', async () => {
    const log = [];
    const M = kur({ hasServiceKey: () => false, fetch: async (url, init) => { log.push(init); return { ok: true, json: async () => [] }; } });
    await M.memoryFetchForCron(ENV, { userId: 'u1', _legacyToken: 'ESKI-TOK' });
    assert.strictEqual(log[0].headers.Authorization, 'Bearer ESKI-TOK');
  });
  test('ASLA fırlatmaz — brifing hafızasız da gider', async () => {
    const M = kur({ hasServiceKey: () => true, fetch: async () => { throw new Error('ağ yok'); } });
    assert.deepStrictEqual(js(await M.memoryFetchForCron(ENV, { userId: 'u1' })), []);
    const R = kur({ hasServiceKey: () => true, fetch: async () => ({ ok: false, status: 500 }) });
    assert.deepStrictEqual(js(await R.memoryFetchForCron(ENV, { userId: 'u1' })), []);
    assert.deepStrictEqual(js(await R.memoryFetchForCron(ENV, null)), []);
  });
});

describe('sıkıştırma — memoryCompactApply', () => {
  const M = kur();
  const T = new Date('2026-10-04T10:00:00Z');
  const L = [
    { id: 'a1', text: 'Squat haftada tek gün', cat: 'antrenman', src: 'auto' },
    { id: 'a2', text: 'Squat pazartesi yapıyor', cat: 'antrenman', src: 'auto' },
    { id: 'a3', text: 'Basmati sevmiyor', cat: 'beslenme', src: 'auto' },
    { id: 's1', text: 'Bulk hedefi var', cat: 'hedef', src: 'seed' },
    { id: 'u1', text: 'Salı antrenman yok', cat: 'antrenman', src: 'user' },
  ];
  test('aynı kategorideki auto maddeler birleşir', () => {
    const r = js(M.memoryCompactApply(L, '{"birlestir":[{"ids":["a1","a2"],"text":"Squat haftada tek gün, pazartesi yapıyor","cat":"antrenman"}]}', T));
    assert.strictEqual(r.merged, 2);
    assert.strictEqual(r.items.length, 4);
    assert.ok(!r.items.find(x => x.id === 'a1' || x.id === 'a2'));
    const y = r.items.find(x => x.text.startsWith('Squat haftada tek gün, pazartesi'));
    assert.strictEqual(y.src, 'auto');
    assert.strictEqual(y.cat, 'antrenman');
  });
  test('🔒 seed/user maddeler birleştirilemez', () => {
    const r = js(M.memoryCompactApply(L, '{"birlestir":[{"ids":["a1","u1"],"text":"birleşik","cat":"antrenman"},{"ids":["s1","a3"],"text":"birleşik 2","cat":"hedef"}]}', T));
    assert.strictEqual(r.merged, 0);
    assert.ok(r.items.find(x => x.id === 'u1') && r.items.find(x => x.id === 's1'));
  });
  test('farklı kategoriler karışmaz', () => {
    const r = js(M.memoryCompactApply(L, '{"birlestir":[{"ids":["a1","a3"],"text":"karışık","cat":"genel"}]}', T));
    assert.strictEqual(r.merged, 0);
  });
  test('uydurma id, tek maddelik grup, aynı maddenin iki kez kullanımı reddedilir', () => {
    const r = js(M.memoryCompactApply(L, JSON.stringify({ birlestir: [
      { ids: ['a1', 'yok'], text: 'x tek', cat: 'antrenman' },
      { ids: ['a1', 'a2'], text: 'ilk grup birleşti', cat: 'antrenman' },
      { ids: ['a2', 'a1'], text: 'ikinci kez', cat: 'antrenman' },
    ] }), T));
    assert.strictEqual(r.merged, 2);
    assert.strictEqual(r.items.filter(x => x.cat === 'antrenman').length, 2); // birleşik + u1
  });
  test('bozuk çıktı = değişiklik yok', () => {
    for (const raw of ['', null, 'metin', '{bozuk', '{"birlestir":"dizi-degil"}']) {
      const r = js(M.memoryCompactApply(L, raw, T));
      assert.strictEqual(r.merged, 0, String(raw));
      assert.strictEqual(r.items.length, 5);
    }
  });
  test('eşik tavanın altında — silme devreye girmeden birleştirme çalışır', () => {
    assert.ok(M.MEM_COMPACT_AT < M.MEM_MAX_ITEMS);
  });
});

describe('sıkıştırma — maliyet ve tetik', () => {
  const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'anon' };
  const dolu = (n) => Array.from({ length: n }, (_, i) => ({ id: 'a' + i, text: 'otomatik bilgi numara ' + i, cat: 'genel', src: 'auto' }));
  test('eşiğin altında model çağrılmaz', async () => {
    let n = 0;
    const M = kur({ aiRun: async () => { n++; return { response: '{}' }; } });
    await M.memoryCompact(ENV, dolu(10));
    assert.strictEqual(n, 0);
  });
  test("eşikte 'light' katman, açık model adı yok", async () => {
    const log = [];
    const M = kur({ aiRun: async (e, o) => { log.push(o); return { response: '{"birlestir":[]}' }; } });
    await M.memoryCompact(ENV, dolu(M.MEM_COMPACT_AT));
    assert.strictEqual(log.length, 1);
    assert.strictEqual(log[0].tier, 'light');
    assert.ok(!log[0].model);
  });
  test('model patlarsa liste aynen döner (fırlatmaz)', async () => {
    const M = kur({ aiRun: async () => { throw new Error('503'); } });
    const r = js(await M.memoryCompact(ENV, dolu(M.MEM_COMPACT_AT)));
    assert.strictEqual(r.items.length, M.MEM_COMPACT_AT);
    assert.strictEqual(r.merged, 0);
  });
  test('memoryExtract: değişiklik yoksa sıkıştırma da yok (tek model çağrısı)', async () => {
    let n = 0;
    const M = kur({ aiRun: async () => { n++; return { response: '{"ekle":[],"guncelle":[],"sil":[]}' }; }, fetch: async () => ({ ok: true }) });
    const msgs = [{ role: 'user', content: 'Salı günleri artık antrenmana gidemiyorum' }];
    await M.memoryExtract(ENV, 'tok', 'u1', msgs, dolu(55));
    assert.strictEqual(n, 1);
  });
  test('memoryExtract: büyüyüp eşiği geçince birleştirilmiş hâli yazar', async () => {
    const yazilan = [];
    let n = 0;
    const M = kur({
      aiRun: async () => (++n === 1
        ? { response: '{"ekle":[{"text":"Salı günleri antrenmana gidemiyor","cat":"okul"}]}' }
        : { response: '{"birlestir":[{"ids":["a0","a1","a2"],"text":"üç bilgi birleşti","cat":"genel"}]}' }),
      fetch: async (url, init) => { yazilan.push(JSON.parse(init.body)); return { ok: true }; },
    });
    const msgs = [{ role: 'user', content: 'Salı günleri artık antrenmana gidemiyorum' }];
    const r = await M.memoryExtract(ENV, 'tok', 'u1', msgs, dolu(M.MEM_COMPACT_AT));
    assert.strictEqual(n, 2);
    assert.strictEqual(r.merged, 3);
    assert.strictEqual(yazilan.length, 1, 'tek yazma');
    assert.strictEqual(yazilan[0].items.length, M.MEM_COMPACT_AT + 1 - 3 + 1);
    assert.ok(yazilan[0].items.find(x => x.text === 'Salı günleri antrenmana gidemiyor'), 'yeni bilgi kayboldu');
  });
  test('sıkıştırma promptu bilgi uydurmayı yasaklıyor', () => {
    const p = kur().MEM_COMPACT_PROMPT;
    assert.match(p, /Yeni bilgi ekleme/);
    assert.match(p, /AYNI kategoride/);
  });
});
