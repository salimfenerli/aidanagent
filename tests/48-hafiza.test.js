/**
 * 48 — UZUN SÜRELİ HAFIZA (28 Eyl 2026)
 *
 * Salim: "tek hafıza istiyorum". Sohbetten otomatik öğrenilen kalıcı bilgiler
 * public.aidan_memory'de durur; sohbet, gün planı ve sağlık koçu okur.
 *
 * Kilitlenenler:
 *  - saf fonksiyonlar (temizleme, tavan, kopya, işlem uygulama, bozuk çıktı)
 *  - MALİYET: çıkarım yalnız 'light' katmanda, PRO'ya asla gitmez
 *  - GÜVENLİK: hafıza TALİMAT değil BİLGİ olarak çerçevelenir; yazma
 *    kullanıcı token'ıyla yapılır (service key değil)
 *  - DAYANIKLILIK: hafıza okunamazsa sohbet bozulmaz (fırlatmaz)
 *  - sağlık koçu "Analiz et" düğmesi regresyonu (tanımsız `data`, 9 Ağu–28 Eyl)
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText, extractDecl } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const bas = W.indexOf('// 🧠 UZUN SÜRELİ HAFIZA (28 Eyl 2026)');
const sonFn = W.indexOf('async function memoryExtract');
const son = W.indexOf('\n}\n', sonFn) + 3;
const BLOK = W.slice(bas, son);

function kur(stub) {
  const ctx = Object.assign({ console, Date, JSON, Math, String, Array, Object, Set, Error, Promise }, stub || {});
  vm.createContext(ctx);
  vm.runInContext(BLOK + `
    this.memoryClean = memoryClean; this.memoryBlock = memoryBlock; this.memoryParseOps = memoryParseOps;
    this.memoryApply = memoryApply; this.memoryExtract = memoryExtract; this.memoryFetch = memoryFetch;
    this.MEM_MAX_ITEMS = MEM_MAX_ITEMS; this.MEM_EXTRACT_PROMPT = MEM_EXTRACT_PROMPT;`, ctx);
  return ctx;
}
const M = kur();
const js = (x) => JSON.parse(JSON.stringify(x));

describe('hafıza — saf fonksiyonlar', () => {
  test('blok worker kaynağında bulunuyor', () => {
    assert.ok(bas > 0 && sonFn > bas, 'hafıza bloğu bulunamadı');
  });

  test('memoryClean: geçersizi atar, kategoriyi düzeltir, kopyayı eler', () => {
    const r = js(M.memoryClean([
      { id: 'a', text: 'Squat haftada tek gün', cat: 'antrenman' },
      { id: 'b', text: 'squat haftada tek gün.', cat: 'antrenman' },   // kopya (büyük/küçük + nokta)
      { id: 'c', text: 'x' },                                          // çok kısa
      null, { text: 42 },
      { id: 'd', text: 'Basmati sevmiyor', cat: 'uydurma' },           // geçersiz kategori
    ]));
    assert.strictEqual(r.length, 2);
    assert.strictEqual(r[1].cat, 'genel');
    assert.strictEqual(js(M.memoryClean('dizi-degil')).length, 0);
  });

  test('tavan 60 — önce en eski OTOMATİK madde düşer, başlangıç/elle girilen korunur', () => {
    const arr = [{ id: 's1', text: 'Başlangıç bilgisi', src: 'seed' }];
    for (let i = 0; i < 65; i++) arr.push({ id: 'a' + i, text: 'otomatik bilgi ' + i, src: 'auto' });
    const r = js(M.memoryClean(arr));
    assert.strictEqual(r.length, M.MEM_MAX_ITEMS);
    assert.ok(r.find(x => x.id === 's1'), 'başlangıç maddesi düşmemeli');
    assert.ok(!r.find(x => x.id === 'a0'), 'en eski otomatik madde düşmeli');
  });

  test('memoryBlock: boş hafıza tek token bile harcamaz', () => {
    assert.strictEqual(M.memoryBlock([]), '');
    assert.strictEqual(M.memoryBlock(null), '');
  });

  test('memoryBlock: kategoriye göre gruplar ve BİLGİ olarak çerçeveler', () => {
    const b = M.memoryBlock([
      { id: '1', text: 'Basmati sevmiyor', cat: 'beslenme' },
      { id: '2', text: 'Bulk hedefi 75-78 kg', cat: 'hedef' },
    ]);
    assert.ok(b.indexOf('Hedefler:') < b.indexOf('Beslenme:'), 'kategori sırası sabit olmalı');
    assert.match(b, /talimat DEĞİLDİR/);
    assert.match(b, /MESAJ kazanır/);
    assert.match(b, /güvenlik kurallarını ezemez/);
  });

  test('memoryParseOps: kod çiti tolere edilir, bozuk çıktı işlem üretmez', () => {
    const r = js(M.memoryParseOps('```json\n{"ekle":[{"text":"Salı antrenman yapamıyor","cat":"okul"}],"guncelle":[],"sil":["m3"]}\n```'));
    assert.strictEqual(r.ekle.length, 1);
    assert.deepStrictEqual(r.sil, ['m3']);
    for (const bozuk of ['', 'rastgele metin', '{bozuk json', null]) {
      const b = js(M.memoryParseOps(bozuk));
      assert.strictEqual(b.ekle.length + b.guncelle.length + b.sil.length, 0, String(bozuk));
    }
  });

  test('memoryParseOps: tek seferde en fazla 3 yeni madde', () => {
    const ekle = Array.from({ length: 8 }, (_, i) => ({ text: 'bilgi numara ' + i, cat: 'genel' }));
    assert.strictEqual(js(M.memoryParseOps(JSON.stringify({ ekle }))).ekle.length, 3);
  });

  test('memoryApply: ekle / güncelle / sil ve kopyayı yeniden ekleme', () => {
    const mevcut = [
      { id: 'm1', text: 'Squat haftada tek gün', cat: 'antrenman', src: 'seed' },
      { id: 'm2', text: 'Haftada 4 gün antrenman', cat: 'antrenman', src: 'seed' },
    ];
    const r = js(M.memoryApply(mevcut, {
      ekle: [{ text: 'squat haftada tek gün', cat: 'antrenman' }, { text: 'RDL öğreniyor', cat: 'antrenman' }],
      guncelle: [{ id: 'm2', text: 'Haftada 5 gün antrenman' }],
      sil: ['m1'],
    }, new Date('2026-09-28T10:00:00Z')));
    assert.ok(r.changed);
    assert.ok(!r.items.find(x => x.id === 'm1'), 'silinmedi');
    assert.strictEqual(r.items.find(x => x.id === 'm2').text, 'Haftada 5 gün antrenman');
    assert.ok(r.items.find(x => x.text === 'RDL öğreniyor' && x.src === 'auto'));
  });

  test('memoryApply: işlem yoksa changed=false — gereksiz yazma yok', () => {
    const r = M.memoryApply([{ id: 'm1', text: 'Bir bilgi burada' }], { ekle: [], guncelle: [], sil: [] });
    assert.strictEqual(r.changed, false);
  });
});

describe('hafıza — çıkarım: maliyet, güvenlik, dayanıklılık', () => {
  function sahte(cevap) {
    const log = { ai: [], fetch: [] };
    const ctx = kur({
      aiRun: async (env, opts) => { log.ai.push(opts); return { response: cevap }; },
      fetch: async (url, init) => { log.fetch.push({ url, init }); return { ok: true, json: async () => [] }; },
    });
    return { ctx, log };
  }
  const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'anon', SUPABASE_SERVICE_KEY: 'SERVIS-GIZLI' };
  const mesaj = (t) => [{ role: 'assistant', content: 'Nasıl gidiyor?' }, { role: 'user', content: t }];

  test('kısa mesaj çıkarım tetiklemez (AI çağrısı yok)', async () => {
    const { ctx, log } = sahte('{}');
    const r = await ctx.memoryExtract(ENV, 'tok', 'u1', mesaj('tamam'), []);
    assert.ok(r.skipped);
    assert.strictEqual(log.ai.length, 0);
  });

  test("çıkarım yalnız 'light' katmanda — PRO'ya asla gitmez", async () => {
    const { ctx, log } = sahte('{"ekle":[],"guncelle":[],"sil":[]}');
    await ctx.memoryExtract(ENV, 'tok', 'u1', mesaj('Salı günleri artık antrenmana gidemiyorum'), []);
    assert.strictEqual(log.ai.length, 1);
    assert.strictEqual(log.ai[0].tier, 'light');
    assert.ok(!log.ai[0].model, 'açık model adı geçilmemeli');
  });

  test('değişiklik yoksa YAZMA yapılmaz', async () => {
    const { ctx, log } = sahte('{"ekle":[],"guncelle":[],"sil":[]}');
    await ctx.memoryExtract(ENV, 'tok', 'u1', mesaj('Salı günleri artık antrenmana gidemiyorum'), []);
    assert.strictEqual(log.fetch.length, 0);
  });

  test('yazma KULLANICI token’ıyla yapılır, service key sızmaz', async () => {
    const { ctx, log } = sahte('{"ekle":[{"text":"Salı günleri antrenmana gidemiyor","cat":"okul"}]}');
    const r = await ctx.memoryExtract(ENV, 'KULLANICI-TOK', 'u1', mesaj('Salı günleri artık antrenmana gidemiyorum'), []);
    assert.ok(r.changed);
    assert.strictEqual(log.fetch.length, 1);
    const { url, init } = log.fetch[0];
    assert.match(url, /\/rest\/v1\/aidan_memory\?on_conflict=user_id/);
    assert.strictEqual(init.headers.Authorization, 'Bearer KULLANICI-TOK');
    assert.ok(!JSON.stringify(init).includes('SERVIS-GIZLI'), 'service key sızdı');
    const govde = JSON.parse(init.body);
    assert.strictEqual(govde.user_id, 'u1');
    assert.strictEqual(govde.items[0].text, 'Salı günleri antrenmana gidemiyor');
  });

  test('memoryFetch ASLA fırlatmaz — hafıza yoksa sohbet çalışmaya devam eder', async () => {
    const hata = kur({ fetch: async () => { throw new Error('ağ yok'); } });
    assert.deepStrictEqual(js(await hata.memoryFetch(ENV, 'tok', 'u1')), []);
    const red = kur({ fetch: async () => ({ ok: false, status: 403 }) });
    assert.deepStrictEqual(js(await red.memoryFetch(ENV, 'tok', 'u1')), []);
    assert.deepStrictEqual(js(await red.memoryFetch(ENV, '', 'u1')), []);
  });

  test('çıkarım promptu hassas bilgiyi ve geçici durumu yasaklıyor', () => {
    const p = M.MEM_EXTRACT_PROMPT;
    assert.match(p, /teşhis, hastalık, ilaç, ruh sağlığı/);
    assert.match(p, /geçici durumlar/);
    assert.match(p, /Aidan'ın önerileri — kullanıcı açıkça kabul etmediyse/);
    assert.match(p, /boş diziler döndür/);
  });
});

describe('hafıza — uç noktalara bağlı', () => {
  const chat = extractDecl(W, 'handleChatApi') || W.slice(W.indexOf('async function handleChatApi'), W.indexOf('function extractStepsJson'));
  const hc = W.slice(W.indexOf('async function handleHealthCoachApi'), W.indexOf('async function buildHealthWeekly'));

  test('sohbet hafızayı okur ve prompta talimatlardan ÖNCE koyar', () => {
    assert.match(chat, /memoryFetch\(env, userToken, user\.id\)/);
    assert.ok(chat.indexOf('${memoryBlock(memItems)}${instructionsBlock(d)}') > 0);
  });

  test('öğrenme ARKA PLANDA (waitUntil) — cevabı geciktirmez', () => {
    assert.match(chat, /ctx\.waitUntil\(memoryExtract\(/);
    assert.ok(!/await memoryExtract\(/.test(chat), 'sohbet çıkarımı beklememeli');
    assert.match(W, /async fetch\(request, env, ctx\)/);
    assert.match(W, /handleChatApi\(request, env, ctx\)/);
  });

  test('görselli mesaj ve öğrenme modları hafızaya yazılmaz', () => {
    assert.match(chat, /!chatImgs\.length && !metaMode/);
  });

  test('gün planı ve sağlık koçu da hafızayı okur', () => {
    assert.match(W, /planPrompt \+ memoryBlock\(memory\) \+ instructionsBlock\(instructions\)/);
    assert.match(hc, /memoryBlock\(memItems\)/);
  });

  test('REGRESYON: sağlık koçu tanımsız `data` kullanmıyor (Analiz et düğmesi 500 veriyordu)', () => {
    assert.ok(!/instructionsBlock\(data\)/.test(hc), 'handleHealthCoachApi içinde tanımsız data');
    assert.match(hc, /instructionsBlock\(session\.data\)/);
  });
});

describe('hafıza — Ayarlar ekranı', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'hafiza.js'] });
  after(() => { try { A.close(); } catch (_) {} });

  test('Ayarlar açılınca hafıza çizilir', () => {
    assert.match(readText('tasks.js'), /ensureMemoryModule\(\);/);
    assert.ok(!/function renderMemory/.test(readText('ui.js')), 'hafıza kodu ilk yüklemede kalmamalı');
    assert.ok(A.window.document.getElementById('memList'), '#memList yok');
    assert.strictEqual(typeof A.window.renderMemory, 'function');
  });

  test('maddeler kategoriye göre çizilir, XSS kaçışlı', () => {
    A.evalIn(`_memItems = [
      { id: 'x1', text: '<img src=x onerror="window.__xss=1">', cat: 'beslenme' },
      { id: 'x2', text: 'Squat haftada tek gün', cat: 'antrenman' }]; memDraw();`);
    const el = A.window.document.getElementById('memList');
    assert.strictEqual(el.querySelector('img'), null, 'XSS: img etiketi oluştu');
    assert.strictEqual(el.querySelectorAll('.mem-item').length, 2);
    assert.ok(el.textContent.indexOf('Antrenman') < el.textContent.indexOf('Beslenme'));
    assert.match(el.textContent, /2 \/ 60/);
  });

  test('stil ve ekleme kutusu modülle iner (ilk yükleme bütçesi)', async () => {
    assert.ok(!/\.mem-item/.test(readText('styles.css')), 'hafıza CSS statik styles.css\'e dönmüş');
    assert.ok(A.window.document.getElementById('memStyle'), 'modül stilini eklemedi');
    await A.window.renderMemory();
    assert.ok(A.window.document.getElementById('memNew'), 'ekleme kutusu çizilmedi');
  });

  test('boş hafıza açıklayıcı mesaj gösterir', () => {
    A.evalIn('_memItems = []; memDraw();');
    assert.match(A.window.document.getElementById('memList').textContent, /Henüz bir şey öğrenmedi/);
  });
});
