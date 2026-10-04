/**
 * 53 — SOHBET AJANI (5 Eki 2026)
 *
 * Salim: "muse tarzı — okuldan haftalık ödev, özel ders hocası da veriyor,
 * onları düzenleyebilsin; gemini pro'yu aktif kullan".
 * Sohbet artık araç çağırır (odev_plani, gorev_ekle, gorev_tamamla,
 * gorev_ertele). Worker eylemleri TEMİZLER ve döndürür; PWA (ajan.js) kart
 * çizer, kullanıcı Uygula'ya basınca uygular.
 *
 * Kilitlenenler:
 *  - ONAY KAPISI: worker blob'a yazmaz; kart basılmadan veri değişmez
 *  - temizleyici: uydurma görev id'si, geçmiş/geçersiz tarih, aşırı süre düşer
 *  - PRO yalnız sahibe, günlük tavanla; sayaç okunamazsa tavan dolu sayılır
 *  - ödev dağıtımı school.js'teki AYNI motor; bölünmüş ödevin parçaları kronolojik
 *  - XSS kaçışı, geri al
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const bas = W.indexOf('// 🤖 SOHBET AJANI (5 Eki 2026)');
const son = W.indexOf('// 🤖 SOHBET AJANI SONU');
const BLOK = W.slice(bas, son);

function kur(stub) {
  const ctx = Object.assign({ console, Date, JSON, Math, String, Array, Object, Set, Map, Error, Promise, Number, isNaN },
    { memHeaders: (e, t) => ({ Authorization: 'Bearer ' + t }) }, stub || {});
  vm.createContext(ctx);
  vm.runInContext(BLOK + `
    this.agentSanitizeActions = agentSanitizeActions; this.agentContext = agentContext;
    this.chatProUsed = chatProUsed; this.AGENT_TOOLS = AGENT_TOOLS; this.AGENT_PROMPT = AGENT_PROMPT;
    this.CHAT_PRO_DAILY = CHAT_PRO_DAILY;`, ctx);
  return ctx;
}
const js = (x) => JSON.parse(JSON.stringify(x));
const BUGUN = '2026-10-05';
const fnSlice = (ad) => {
  const i = W.indexOf('async function ' + ad + '(');
  const j = W.indexOf('\nasync function ', i + 30);
  return W.slice(i, j);
};

describe('ajan — temizleyici', () => {
  const M = kur();
  test('blok worker kaynağında', () => assert.ok(bas > 0 && son > bas));

  test('odev_plani: ders adı eklenir, süre/tarih sınırlanır, parça 1-6', () => {
    const a = js(M.agentSanitizeActions([{ name: 'odev_plani', arguments: {
      kaynak: 'ozel_ders', son_tarih: '2026-10-09', baslik: 'Mat özel ders',
      odevler: [
        { ders: 'Matematik', text: '3 test çöz', dk: 45 },
        { ders: 'Fizik', text: 'Fizik soru bankası s.12', dk: 9999, tarih: '2026-10-01', parca: 40 },
        { text: 'x' },
      ] } }], { today: BUGUN, taskIds: [] }));
    assert.strictEqual(a.length, 1);
    const p = a[0];
    assert.strictEqual(p.type, 'odev_plani');
    assert.strictEqual(p.kaynak, 'ozel_ders');
    assert.strictEqual(p.sonTarih, '2026-10-09');
    assert.strictEqual(p.items.length, 2);
    assert.strictEqual(p.items[0].text, 'Matematik: 3 test çöz');
    assert.strictEqual(p.items[1].text, 'Fizik soru bankası s.12', 'ders adı zaten varsa tekrar eklenmez');
    assert.strictEqual(p.items[1].dk, null, '9999 dk kabul edilmez');
    assert.strictEqual(p.items[1].tarih, null, 'geçmiş tarih kabul edilmez');
    assert.strictEqual(p.items[1].parca, 1, '40 parça kabul edilmez');
  });

  test('🔒 uydurma görev id\'si için eylem ÜRETİLMEZ', () => {
    const a = js(M.agentSanitizeActions([
      { name: 'gorev_tamamla', arguments: { gorev_id: '999' } },
      { name: 'gorev_tamamla', arguments: { gorev_id: '[1759600000000]' } },
      { name: 'gorev_ertele', arguments: { gorev_id: '1759600000000', yeni_tarih: 'yarın' } },
      { name: 'gorev_ertele', arguments: { gorev_id: '1759600000000', yeni_tarih: '2026-10-07' } },
    ], { today: BUGUN, taskIds: [1759600000000] }));
    assert.deepStrictEqual(a.map(x => x.type), ['gorev_tamamla', 'gorev_ertele']);
    assert.strictEqual(a[1].tarih, '2026-10-07');
  });

  test('geçersiz tarih biçimleri, bilinmeyen araç, en fazla 5 eylem', () => {
    const calls = [{ name: 'sil_her_seyi', arguments: {} }];
    for (let i = 0; i < 8; i++) calls.push({ name: 'gorev_ekle', arguments: { text: 'görev ' + i, tarih: '2026-02-30', kategori: 'uydurma', dk: 3 } });
    const a = js(M.agentSanitizeActions(calls, { today: BUGUN, taskIds: [] }));
    assert.strictEqual(a.length, 5);
    assert.ok(a.every(x => x.type === 'gorev_ekle' && x.tarih === null && x.kategori === null && x.dk === null));
    assert.deepStrictEqual(js(M.agentSanitizeActions(null, { today: BUGUN })), []);
  });

  test('bağlam: bugün+gün adı, açık görev [id], ders programı, özel ders', () => {
    const c = M.agentContext({
      tasks: [{ id: 11, text: 'Tarih ödevi', due: '2026-10-07', estimateMin: 30 }, { id: 12, text: 'bitti', done: true }],
      school: { timetable: { '2': ['Matematik', 'Fizik'] } },
      fixedSchedule: [{ label: 'Mat özel ders', days: [4], start: '17:00', end: '19:00', enabled: true }],
    }, BUGUN);
    assert.match(c, /BUGÜN: 2026-10-05 Pazartesi/);
    assert.match(c, /\[11\] Tarih ödevi \(son: 2026-10-07\) ~30dk/);
    assert.ok(!/bitti/.test(c));
    assert.match(c, /Sal: Matematik, Fizik/);
    assert.match(c, /Mat özel ders Per 17:00-19:00/);
  });

  test('prompt: onay kapısı dili, uydurma yasağı, tek paket', () => {
    const p = M.AGENT_PROMPT;
    assert.match(p, /"ekledim" DEME/);
    assert.match(p, /UYDURMA/);
    assert.match(p, /TEK "odev_plani"/);
    assert.deepStrictEqual(js(M.AGENT_TOOLS.map(t => t.name)), ['odev_plani', 'gorev_ekle', 'gorev_tamamla', 'gorev_ertele']);
  });
});

describe('ajan — PRO bütçesi ve bağlantılar', () => {
  const ENV = { SUPABASE_URL: 'https://x.supabase.co' };
  test('sayaç okunamazsa tavan DOLU sayılır (fatura güvenli taraf)', async () => {
    const A = kur({ fetch: async () => { throw new Error('ağ'); } });
    assert.strictEqual(await A.chatProUsed(ENV, 't', 'u', BUGUN), A.CHAT_PRO_DAILY);
    const B = kur({ fetch: async () => ({ ok: false }) });
    assert.strictEqual(await B.chatProUsed(ENV, 't', 'u', BUGUN), B.CHAT_PRO_DAILY);
    const C = kur({ fetch: async () => ({ ok: true, json: async () => [{ pro_calls: 7 }] }) });
    assert.strictEqual(await C.chatProUsed(ENV, 't', 'u', BUGUN), 7);
  });
  const chat = fnSlice('handleChatApi');
  test('🔒 sohbet ucu blob\'a YAZMAZ, eylemleri döndürür', () => {
    assert.ok(!/saveUserData|saveUserDataForApi|saveAidan/.test(chat));
    assert.match(chat, /return jsonCors\(\{ reply, actions,/);
  });
  test('sayaç yalnız GERÇEKTEN PRO kullanıldıysa artar; PRO modeli açıkça istenir', () => {
    assert.match(chat, /const proModel = tier === 'heavy' \? geminiModelPro\(env\) : undefined;/);
    assert.match(chat, /const usedPro = !!proModel && r\.model === proModel;/);
    assert.match(chat, /if \(usedPro\) await chatProCount\(/);
  });
  test('meta-öğrenme modunda araç yok', () => {
    assert.match(chat, /const agentOn = !metaMode;/);
    assert.match(chat, /tools: agentOn \? AGENT_TOOLS : undefined/);
  });
});

describe('ajan.js — Uygula kartları (PWA)', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'school.js', 'ajan.js'] });
  after(() => { try { A.close(); } catch (_) {} });
  const kurSohbet = (actions) => A.evalIn(`data.chat = [{ role: 'user', content: 'ödevler' }, { role: 'assistant', content: 'Hazırladım', actions: ${JSON.stringify(actions)} }]; renderChatMessages(); renderChatActions();`);

  test('tembel modül, ilk yüklemede yok', () => {
    assert.match(readText('core.js'), /ajan: '\/ajan\.js'/);
    assert.ok(!/<script[^>]+ajan\.js/.test(readText('asistan.html')));
    assert.ok(!/\.ajan-card/.test(readText('styles.css')));
  });

  test('ödev planı: kart çizilir, Uygula basılmadan görev EKLENMEZ, XSS kaçışlı', () => {
    const once = A.evalIn('data.tasks.length');
    kurSohbet([{ type: 'odev_plani', kaynak: 'okul', baslik: '<img src=x onerror=1>', sonTarih: null, haftaSonu: false, bugun: false,
      items: [{ text: 'Matematik: 3 test', dk: 45, tarih: null, parca: 1 }, { text: 'Edebiyat: kompozisyon', dk: 60, tarih: null, parca: 1 }] }]);
    const box = A.window.document.querySelector('.chat-ajan');
    assert.ok(box && box.querySelector('.ajan-card'), 'kart çizilmedi');
    assert.strictEqual(box.querySelector('img'), null, 'XSS');
    assert.match(box.textContent, /2 iş/);
    assert.strictEqual(A.evalIn('data.tasks.length'), once, 'onaysız görev eklendi');
  });

  test('Uygula: seri olarak eklenir, kategori okul=odev, tarih yarından itibaren', async () => {
    const once = A.evalIn('data.tasks.length');
    await A.evalIn('ajanApply(1, 0)');
    assert.strictEqual(A.evalIn('data.tasks.length'), once + 2);
    const yeni = A.evalIn('JSON.stringify(data.tasks.slice(-2))');
    const t = JSON.parse(yeni);
    assert.ok(t.every(x => x.seriesId && x.category === 'odev' && x.due > A.evalIn('today()')));
    assert.notStrictEqual(t[0].id, t[1].id, 'aynı id');
    assert.strictEqual(A.evalIn('data.chat[1].actions[0].status'), 'applied');
    await A.evalIn('ajanApply(1, 0)');
    assert.strictEqual(A.evalIn('data.tasks.length'), once + 2, 'ikinci basış tekrar eklememeli');
  });

  test('özel ders → kategori "ders"; bölünmüş ödevin parçaları kronolojik', async () => {
    kurSohbet([{ type: 'odev_plani', kaynak: 'ozel_ders', baslik: 'Mat', sonTarih: A.evalIn('shiftDateStr(today(), 6)'), haftaSonu: true, bugun: true,
      items: [{ text: 'Soru bankası', dk: 120, tarih: null, parca: 4 }, { text: 'Deneme', dk: 90, tarih: null, parca: 3 }] }]);
    await A.evalIn('ajanApply(1, 0)');
    const t = JSON.parse(A.evalIn('JSON.stringify(data.tasks.slice(-7))'));
    assert.ok(t.every(x => x.category === 'ders'));
    for (const ad of ['Soru bankası', 'Deneme']) {
      const p = t.filter(x => x.text.startsWith(ad)).sort((a, b) => a.due.localeCompare(b.due) || a.seriesIndex - b.seriesIndex);
      const sira = p.map(x => Number(/\((\d+)\//.exec(x.text)[1]));
      assert.deepStrictEqual(sira, [...sira].sort((a, b) => a - b), ad + ' parçaları kronolojik değil: ' + sira.join(','));
    }
  });

  test('tamamla / ertele / vazgeç', async () => {
    A.evalIn(`data.tasks.push(makeTask({ text: 'Fizik ödevi', due: today() })); data.tasks[data.tasks.length-1].id = 4242;`);
    kurSohbet([{ type: 'gorev_ertele', gorevId: '4242', tarih: '2099-01-01' }, { type: 'gorev_tamamla', gorevId: '4242' }, { type: 'gorev_ekle', text: 'Kitap al', tarih: null, dk: null, kategori: null, acil: false }]);
    await A.evalIn('ajanApply(1, 0)');
    assert.strictEqual(A.evalIn('data.tasks.find(t => t.id === 4242).due'), '2099-01-01');
    await A.evalIn('ajanApply(1, 1)');
    assert.strictEqual(A.evalIn('data.tasks.find(t => t.id === 4242).done'), true);
    const once = A.evalIn('data.tasks.length');
    A.evalIn('ajanDismiss(1, 2)');
    await A.evalIn('ajanApply(1, 2)');
    assert.strictEqual(A.evalIn('data.tasks.length'), once, 'vazgeçilen eylem uygulanmamalı');
    assert.strictEqual(A.evalIn('data.chat[1].actions[2].status'), 'dismissed');
  });
});
