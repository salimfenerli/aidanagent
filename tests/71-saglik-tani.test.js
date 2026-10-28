/**
 * 71 — SAĞLIK GÖNDERİM TEŞHİSİ (25 Eki 2026)
 *
 * Salim: kısayol "kuruldu ama çalışmıyor"; veri 8 Eki'den beri yoktu ve nedeni
 * ekran görüntüsü olmadan görülemiyordu. /health artık son gönderimin sonucunu ve
 * BOŞ gelen alanları data.saglikTani'ye yazar; Ayarlar tek cümleyle ne yapılacağını söyler.
 *
 * Kilitlenenler:
 *  - hangi grup (uyku/nabız/adım/tartı) dolu geldi doğru sayılır; boş metin = gelmedi
 *  - blob yalnız durum değişince / yeni günde yazılır ('guncel' = 'kaydedildi' sayılır)
 *  - uç: boş/geçersiz gönderimde de iz bırakır; secret kontrolü hâlâ önce
 *  - Ayarlar metni: hiç yok / eski / boş / tamam ayrımı
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const BLOK = W.slice(W.indexOf('// 🩺 SAĞLIK GÖNDERİM TEŞHİSİ'), W.indexOf('async function handleHealthApi('));
const ctx = { Date, JSON, String, Object, TR_OFFSET_MS: 3 * 3600 * 1000 };
vm.createContext(ctx);
vm.runInContext(BLOK + '\nthis.O = saglikTaniOlustur; this.Y = saglikTaniYaz;', ctx);
const js = (x) => JSON.parse(JSON.stringify(x));

describe('worker teşhis', () => {
  test('boş metin = gelmedi; dolu alan grubu işaretlenir', () => {
    const t = js(ctx.O([{ kg: '', bedtime: '', wake: ' ', rhr: '58', stage: '' }], null, [], 'kaydedildi'));
    assert.deepStrictEqual(t.gelen, { uyku: false, nabiz: true, tarti: false, adim: false });
    assert.strictEqual(t.format, 'kisayol');
    assert.match(t.tarih, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(t.saat, /^\d{2}:\d{2}$/);
    const h = js(ctx.O([{ steps: 5000, hours: 7 }], { items: [] }, [{ kg: 70 }], 'kaydedildi'));
    assert.deepStrictEqual(h.gelen, { uyku: true, nabiz: false, tarti: true, adim: true });
    assert.strictEqual(h.format, 'hae');
  });
  test('yazım yalnız durum değişince; guncel = kaydedildi', () => {
    const d = {};
    const a = ctx.O([{ rhr: 60 }], null, [], 'kaydedildi');
    assert.strictEqual(ctx.Y(d, a), true);
    assert.strictEqual(ctx.Y(d, ctx.O([{ rhr: 61 }], null, [], 'guncel')), false);
    assert.strictEqual(ctx.Y(d, ctx.O([{ rhr: 61, bedtime: '23:00', wake: '07:00' }], null, [], 'guncel')), true);
    const eski = Object.assign({}, d.saglikTani, { tarih: '2026-01-01' }); d.saglikTani = eski;
    assert.strictEqual(ctx.Y(d, ctx.O([{ rhr: 61, bedtime: '23:00', wake: '07:00' }], null, [], 'guncel')), true, 'yeni gün yazılmalı');
  });
  test('uç: secret önce, boş ve geçersiz gönderimde iz, başarıda iz', () => {
    const h = W.slice(W.indexOf('async function handleHealthApi('), W.indexOf('async function handleBodyApi('));
    assert.ok(h.indexOf('given !== env.WEBHOOK_SECRET') < h.indexOf('saglikTaniYaz'));
    for (const s of ["'bos'", "'gecersiz'", "degisti ? 'kaydedildi' : 'guncel'"]) assert.ok(h.includes(s), s);
    assert.ok(!/data\.settings/.test(h));
  });
});

describe('Ayarlar metni', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'ayarlar.js'] });
  after(() => A.close());
  const M = (d) => JSON.parse(A.evalIn('JSON.stringify(saglikTaniMetni(' + JSON.stringify(d) + ", '2026-10-25'))"));
  test('hiç teşhis yok: son veri tarihiyle "otomasyon/anahtar"', () => {
    const r = M({ health: [{ date: '2026-10-07' }, { date: '2026-10-08' }], sleep: [] });
    assert.strictEqual(r.durum, 'yok');
    assert.match(r.metin, /17 gün önce/);
    assert.match(r.metin, /gizli anahtar/);
    assert.match(M({}).metin, /hiç gelmedi/);
  });
  test('eski / boş / kısmi / tamam', () => {
    const t = (o) => Object.assign({ tarih: '2026-10-25', saat: '14:30', format: 'kisayol', sonuc: 'kaydedildi', gelen: { uyku: true, nabiz: true, adim: false, tarti: false } }, o);
    assert.strictEqual(M({ saglikTani: t({ tarih: '2026-10-20' }) }).durum, 'eski');
    const bos = M({ saglikTani: t({ sonuc: 'gecersiz', gelen: { uyku: false, nabiz: false } }) });
    assert.strictEqual(bos.durum, 'bos');
    assert.match(bos.metin, /uyku ve nabız BOŞ/);
    assert.match(bos.metin, /Kısayollar: izinleri aç/);
    assert.strictEqual(M({ saglikTani: t({ gelen: { uyku: true, nabiz: false } }) }).durum, 'kismi');
    const ok = M({ saglikTani: t({}) });
    assert.strictEqual(ok.durum, 'ok');
    assert.match(ok.metin, /bugün 14:30/);
  });
  test('satır Depolama\'nın üstünde, metin kaçışlı', () => {
    const doc = A.window.document;
    if (!doc.getElementById('storageInfo')) { const x = doc.createElement('div'); x.className = 'settings-row'; x.innerHTML = '<div id="storageInfo"></div>'; doc.body.appendChild(x); }
    const r = doc.getElementById('storageInfo').closest('.settings-row');
    A.evalIn("data.saglikTani = null; data.health = []; data.sleep = []; renderSaglikTani()");
    const el = doc.getElementById('saglikTaniRow');
    assert.ok(el && /hiç gelmedi/.test(el.textContent));
    assert.strictEqual(el.nextElementSibling, r);
    assert.match(readText('ayarlar.js'), /renderSaglikTani\(\);\s+\/\/ 25 Eki/);
  });
});
