/**
 * 70 — HAREKET MOLASI (25 Eki 2026)
 *
 * Salim: "evde spor için bi anda gelen 'yat şınav çek' bildirimi, ben tamam diye
 * işaretliyim ve takip etsin".
 *
 * Kilitlenenler:
 *  - saatler deterministik, evdeki pencere içinde, blokların 20 dk yakınına düşmez, aralar ≥60 dk
 *  - antrenman günü 2, değilse 3; üst vücut günü squat
 *  - ilk ping tek kez, "20 dk sonra" tek tekrar, yapılan/kapalı → ping yok
 *  - 🔒 16 yaş: set başı adet tavanı aşılmaz, günde en fazla 3 set
 *  - istemci: dokun = kaydet, Geri al, 6 sette bir +1, ikiz sabitler aynı
 *  - KAPI: scheduled() çağırır, push hareket alanını taşır, sw.js + tasks.js köprüsü, Bugün kartı, Ayarlar satırı, Günü kapat
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const BLOK = W.slice(W.indexOf('// 💪 HAREKET MOLASI (25 Eki 2026)'), W.indexOf('// 💪 HAREKET MOLASI SONU'));
const js = (x) => JSON.parse(JSON.stringify(x));
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// hfGun taklidi: pencere 15:00-22:30, kurs 17:00-18:30; antrenman isteğe bağlı
const ctx = { console, Date, JSON, Math, String, Array, Object, Number };
vm.createContext(ctx);
vm.runInContext(BLOK + `
this.GUN = { antrenman: null };
function hfGun(d, tarih) {
  const b = [{ bas: 17 * 60, bit: 18 * 60 + 30 }];
  if (GUN.antrenman) b.push({ bas: 19 * 60 + 30, bit: 20 * 60 + 30 });
  return { pencere: { bas: 15 * 60, bit: 22 * 60 + 30 }, bloklar: b, antrenman: GUN.antrenman };
}
this.S = hareketSaatleri; this.D = hareketDue; this.P = hareketPayload; this.O = hareketOzet; this.T = hareketTuru; this.A = hareketAdet; this.TUR = HAREKET_TUR;`, ctx);

const TARIH = '2026-10-26';
const veri = () => ({ program: { days: [{ name: 'Üst A', odak: ['chest', 'triceps'] }, { name: 'Alt A', odak: ['quads'] }] } });

describe('saatler', () => {
  test('deterministik, pencere içinde, bloktan uzak, aralar ≥60 dk, 3 adet', () => {
    ctx.GUN.antrenman = null;
    const a = js(ctx.S(veri(), TARIH)), b = js(ctx.S(veri(), TARIH));
    assert.deepStrictEqual(a, b);
    assert.ok(a.length >= 2 && a.length <= 3, a.join(','));
    a.forEach(dk => {
      assert.ok(dk >= 15 * 60 && dk <= 22 * 60 + 30, 'pencere ' + dk);
      assert.ok(dk <= 17 * 60 - 20 || dk >= 18 * 60 + 30 + 20, 'kurs yakını ' + dk);
      assert.strictEqual(dk % 5, 0);
    });
    for (let i = 1; i < a.length; i++) assert.ok(a[i] - a[i - 1] >= 60);
  });
  test('farklı gün farklı saat (rastgele görünür)', () => {
    const g = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map(t => js(ctx.S(veri(), t)).join(','));
    assert.ok(new Set(g).size > 1);
  });
  test('antrenman günü en fazla 2 + antrenmana yakın değil; üst vücut → squat, alt → şınav', () => {
    ctx.GUN.antrenman = { ad: 'Üst A' };
    const a = js(ctx.S(veri(), TARIH));
    assert.ok(a.length <= 2);
    a.forEach(dk => assert.ok(dk <= 19 * 60 + 10 || dk >= 20 * 60 + 50, 'antrenman yakını ' + dk));
    assert.strictEqual(ctx.T(veri(), TARIH), 'squat');
    ctx.GUN.antrenman = { ad: 'Alt A' };
    assert.strictEqual(ctx.T(veri(), TARIH), 'sinav');
    ctx.GUN.antrenman = null;
    assert.strictEqual(ctx.T(veri(), TARIH), 'sinav');
  });
});

describe('due + 16 yaş kilidi', () => {
  test('ilk ping tek kez, tekrar tek kez, yapılan susar', () => {
    ctx.GUN.antrenman = null;
    const d = veri();
    ctx.D(d, TARIH, 0);
    const s0 = d.hareket.saatler[0];
    assert.deepStrictEqual(js(ctx.D(d, TARIH, s0)), [{ i: 0, tur: 'ilk' }]);
    assert.deepStrictEqual(js(ctx.D(d, TARIH, s0 + 2)), []);
    d.hareket.e[0] = s0 + 20;
    assert.deepStrictEqual(js(ctx.D(d, TARIH, s0 + 20)), [{ i: 0, tur: 'tekrar' }]);
    assert.deepStrictEqual(js(ctx.D(d, TARIH, s0 + 21)), []);
    d.hareket.yap[1] = 10;
    assert.deepStrictEqual(js(ctx.D(d, TARIH, d.hareket.saatler[1])), []);
  });
  test('kapalıysa ping yok; yeni gün durumu sıfırlar', () => {
    const d = veri(); d.hareketAyar = { kapali: true };
    assert.deepStrictEqual(js(ctx.D(d, TARIH, 16 * 60)), []);
    const e = veri(); e.hareket = { tarih: '2026-10-20', saatler: [1], gon: [0], yap: { 0: 5 } };
    ctx.D(e, TARIH, 0);
    assert.strictEqual(e.hareket.tarih, TARIH);
    assert.deepStrictEqual(js(e.hareket.yap), {});
  });
  test('🔒 adet tavanı ve günde ≤3 set', () => {
    const d = veri(); d.hareketAyar = { adet: { sinav: 500, squat: -4 } };
    assert.strictEqual(ctx.A(d, 'sinav'), ctx.TUR.sinav.tavan);
    assert.strictEqual(ctx.A(d, 'squat'), ctx.TUR.squat.baslangic);
    ['2026-10-26', '2026-10-31', '2026-11-01'].forEach(t => assert.ok(js(ctx.S(veri(), t)).length <= 3));
  });
  test('payload: dokun = yaptım, url + hareket alanı; Günü kapat özeti', () => {
    const d = veri(); ctx.D(d, TARIH, 0);
    const p = js(ctx.P(d, { i: 1, tur: 'ilk' }));
    assert.match(p.message, /Yere yat, 10 şınav çek/);
    assert.strictEqual(p.url, '/?hareket=1');
    assert.strictEqual(p.hareket, '1');
    d.hareket.yap = { 0: 10, 2: 11 };
    assert.match(ctx.O(d, TARIH), /2\/\d · 21 şınav/);
  });
});

describe('KAPI (worker + sw + köprü)', () => {
  test('scheduled runHareket, push data.hareket, Günü kapat satırı', () => {
    assert.match(W, /jobs\.push\(runHareket\(env\)\)/);
    assert.match(W, /hareket: payload\.hareket \|\| null/);
    assert.match(W, /hareketOzet/);
  });
  test('sw.js ve tasks.js köprüsü', () => {
    const sw = readText('sw.js'), t = readText('tasks.js');
    assert.match(sw, /hareket/);
    assert.match(sw, /type: 'HAREKET'/);
    assert.match(t, /q\.get\('hareket'\)/);
    assert.match(t, /loadModule\('ogun'\)\.then\(\(\) => hareketAksiyon/);
  });
  test('ikiz sabitler: worker HAREKET_TUR ↔ ogun.js HAREKET_TUR_I ↔ ayarlar.js', () => {
    const A2 = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'ayarlar.js', 'ogun.js'] });
    try {
      const I = JSON.parse(A2.evalIn('JSON.stringify(HAREKET_TUR_I)'));
      const Y = JSON.parse(A2.evalIn('JSON.stringify(HAREKET_AYAR_TUR)'));
      for (const k of ['sinav', 'squat']) {
        assert.strictEqual(I[k].baslangic, ctx.TUR[k].baslangic);
        assert.strictEqual(I[k].tavan, ctx.TUR[k].tavan);
        assert.strictEqual(Y[k].vars, ctx.TUR[k].baslangic);
        assert.strictEqual(Y[k].max, ctx.TUR[k].tavan);
      }
    } finally { A2.close(); }
  });
});

describe('istemci (ogun.js + ayarlar.js)', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'ayarlar.js', 'ogun.js', 'bugun.js'] });
  after(() => A.close());
  const E = (c) => JSON.parse(JSON.stringify(A.evalIn(c)));
  const kur = () => A.evalIn(`(function(){ data.hareket = { tarih: today(), n: 3, tur: 'sinav', saatler: [960, 1080, 1260], gon: [0], yap: {}, e: {}, es: {} };
    delete data.hareketLog; delete data.hareketAyar; })()`);
  test('dokun = kaydet; ikinci dokunuş çift saymaz', () => {
    kur();
    A.evalIn("hareketAksiyon('0', 'open')");
    assert.strictEqual(E('data.hareket.yap[0]'), 10);
    assert.deepStrictEqual(E('data.hareketLog[today()]'), { set: 1, sinav: 10 });
    A.evalIn("hareketAksiyon('0', 'yaptim')");
    assert.strictEqual(E('data.hareketLog[today()].set'), 1);
  });
  test('"sonra" kaydetmez, tekrar saati yazar; başka günün molası reddedilir', () => {
    kur();
    A.evalIn("hareketAksiyon('1', 'sonra')");
    assert.strictEqual(E('data.hareket.yap[1] == null'), true);
    assert.strictEqual(E('typeof data.hareket.e[1]'), 'number');
    A.evalIn("data.hareket.tarih = '2020-01-01'; hareketAksiyon('2', 'open')");
    assert.strictEqual(E('data.hareket.yap[2] == null'), true);
  });
  test('6 sette bir +1, tavanı aşmaz; Geri al hepsini geri alır', () => {
    kur();
    A.evalIn("data.hareketAyar = { setSay: { sinav: 5 } }; hareketAksiyon('0', 'open')");
    assert.strictEqual(E('data.hareketAyar.adet.sinav'), 11);
    kur();
    A.evalIn("data.hareketAyar = { setSay: { sinav: 11 }, adet: { sinav: 25 } }; hareketAksiyon('0', 'open')");
    assert.strictEqual(E('data.hareketAyar.adet.sinav'), 25);
    kur();
    A.evalIn(`window.__geri = null; const _u = showUndoToast; showUndoToast = (m, f) => { window.__geri = f; };
      data.hareketAyar = { setSay: { sinav: 5 } }; hareketAksiyon('0', 'open'); showUndoToast = _u; window.__geri();`);
    assert.strictEqual(E('data.hareket.yap[0] == null'), true);
    assert.strictEqual(E('data.hareketLog[today()].set'), 0);
    assert.deepStrictEqual(E('data.hareketAyar'), { setSay: { sinav: 5 } });
  });
  test('Bugün kartı satırı', () => {
    kur();
    A.evalIn("data.hareket.yap = { 0: 10 }");
    assert.deepStrictEqual(E('bugunOzet(data, today(), 600).hareket'), { n: 3, tur: 'sinav', set: 1, adet: 10 });
  });
  test('Ayarlar satırı: Depolama\'nın üstünde, +/− ve Kapat', () => {
    kur();
    const doc = A.window.document;
    if (!doc.getElementById('storageInfo')) {
      const r = doc.createElement('div'); r.className = 'settings-row';
      r.innerHTML = '<div id="storageInfo"></div>'; doc.body.appendChild(r);
    }
    A.evalIn('renderHareketAyar()');
    const el = doc.getElementById('hareketAyarRow');
    assert.ok(el);
    assert.strictEqual(el.nextElementSibling, doc.getElementById('storageInfo').closest('.settings-row'));
    el.querySelector('button[data-h="arti"][data-tur="sinav"]').click();
    assert.strictEqual(E('data.hareketAyar.adet.sinav'), 11);
    doc.getElementById('hareketAyarRow').querySelector('button[data-h="ac"]').click();
    assert.strictEqual(E('data.hareketAyar.kapali'), true);
    assert.match(doc.getElementById('hareketAyarRow').textContent, /Aç/);
  });
});
