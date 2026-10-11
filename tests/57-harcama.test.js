/**
 * 57 — HARCAMA TAKİBİ (11 Eki 2026)
 *
 * Salim: "aylık harcamaları yazabileyim — bugün şu kadar harcadım diye gireyim".
 *
 * Kilitlenenler:
 *  - tutar Türk biçiminde çözülür (85 · 85,50 · 1.250 · 1.250,75), saçma tutar reddedilir
 *  - kategori kodla atanır (AI yok), "dün" kelimesi tarihi bir gün geri alır
 *  - ay özeti: kıyas geçen ayın AYNI gün aralığıyla (adil), tahmin ≥5 gün geçince
 *  - KAPI: panel açılınca modül iner; Ekle düğmesi data.harcama'ya yazar ve save() çağırır
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const SRC = readText('harcama.js').replace(/\r\n/g, '\n');
// Saf yardımcılar: stil IIFE'si document ister → saf kısmı ayır.
const saf = SRC.slice(0, SRC.indexOf('(function hrcStyle()')) +
  SRC.slice(SRC.indexOf('/* ---------- saf yardımcılar'), SRC.indexOf('/* ---------- ekran'));
const ctx = { Math, Number, String, Object, Array, isFinite, parseFloat, Date };
vm.createContext(ctx);
vm.runInContext(saf + '\nthis.sayi = hrcSayi; this.ayr = hrcAyristir; this.kat = hrcKategori; this.ozet = hrcOzet; this.kay = hrcAyKaydir;', ctx);
const js = (x) => JSON.parse(JSON.stringify(x));

describe('tutar ve metin', () => {
  test('Türk biçimi: virgül ondalık, nokta binlik', () => {
    assert.strictEqual(ctx.sayi('85'), 85);
    assert.strictEqual(ctx.sayi('85,50'), 85.5);
    assert.strictEqual(ctx.sayi('1.250'), 1250);
    assert.strictEqual(ctx.sayi('1.250,75'), 1250.75);
    assert.strictEqual(ctx.sayi('12.5'), 12.5);
    assert.strictEqual(ctx.sayi('kahve 45 tl'), 45);
  });
  test('🔒 saçma tutar reddedilir (0, eksi işaretsiz yok, tavan üstü, sayı yok)', () => {
    for (const x of ['', null, 'kahve', '0', '0,00', '250000']) assert.strictEqual(ctx.sayi(x), null, String(x));
  });
  test('ayrıştırma: tutar + not, TL/₺/lira atılır, "dün" yakalanır', () => {
    assert.deepStrictEqual(js(ctx.ayr('85 öğle yemeği')), { tl: 85, not: 'öğle yemeği', dun: false });
    assert.deepStrictEqual(js(ctx.ayr('kahve 45,50 TL')), { tl: 45.5, not: 'kahve', dun: false });
    assert.deepStrictEqual(js(ctx.ayr('dün 120₺ sinema')), { tl: 120, not: 'sinema', dun: true });
    assert.strictEqual(ctx.ayr('sadece yazı'), null);
  });
  test('kategori kodla: ilk eşleşen kazanır, bilinmeyen → diğer', () => {
    assert.strictEqual(ctx.kat('öğle yemeği'), 'yemek');
    assert.strictEqual(ctx.kat('Bursakart dolum'), 'ulasim');
    assert.strictEqual(ctx.kat('protein bar'), 'spor', 'spor yemekten önce bakılır');
    assert.strictEqual(ctx.kat('matematik test kitabı'), 'okul');
    assert.strictEqual(ctx.kat('sinema'), 'eglence');
    assert.strictEqual(ctx.kat('hediye'), 'diger');
    assert.strictEqual(ctx.kat(''), 'diger');
  });
});

describe('ay özeti', () => {
  const L = [
    { id: 1, d: '2026-10-01', tl: 100, kat: 'yemek' },
    { id: 2, d: '2026-10-10', tl: 50, kat: 'ulasim' },
    { id: 3, d: '2026-10-10', tl: 30, kat: 'yemek' },
    { id: 4, d: '2026-09-05', tl: 90, kat: 'yemek' },
    { id: 5, d: '2026-09-25', tl: 500, kat: 'giyim' },      // geçen ayın 10'undan SONRA — kıyasa girmez
    { id: 6, d: '2026-08-05', tl: 999, kat: 'diger' },      // iki ay önce — hiç girmez
  ];
  test('bu ay: toplam, günlük ort., adil kıyas, kategori sırası', () => {
    const o = js(ctx.ozet(L, '2026-10', '2026-10-10'));
    assert.strictEqual(o.toplam, 180);
    assert.strictEqual(o.gun, 10);
    assert.strictEqual(o.ortalama, 18);
    assert.strictEqual(o.onceki, 90, 'geçen ayın yalnız ilk 10 günü');
    assert.strictEqual(o.fark, 90);
    assert.strictEqual(o.tahmin, Math.round(180 / 10 * 31));
    assert.deepStrictEqual(o.kat, [{ k: 'yemek', tl: 130 }, { k: 'ulasim', tl: 50 }]);
  });
  test('geçmiş ay: tam ay kıyası, tahmin yok', () => {
    const o = js(ctx.ozet(L, '2026-09', '2026-10-10'));
    assert.strictEqual(o.toplam, 590);
    assert.strictEqual(o.gun, 30);
    assert.strictEqual(o.onceki, 999);
    assert.strictEqual(o.tahmin, null);
  });
  test('ilk 4 günde tahmin üretilmez (gürültü); boş liste çökmez', () => {
    assert.strictEqual(ctx.ozet(L, '2026-10', '2026-10-04').tahmin, null);
    const o = js(ctx.ozet(undefined, '2026-10', '2026-10-10'));
    assert.strictEqual(o.toplam, 0);
    assert.deepStrictEqual(o.kat, []);
  });
  test('ay kaydırma yıl sınırını geçer', () => {
    assert.strictEqual(ctx.kay('2026-01', -1), '2025-12');
    assert.strictEqual(ctx.kay('2026-12', 1), '2027-01');
  });
});

describe('KAPI — panel ve Ekle düğmesi gerçekten yazıyor', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'harcama.js'] });
  after(() => A.close());
  const doc = A.window.document;

  test('panel Görevler sekmesinde, açılınca harcama modülünü indirir', () => {
    const s = doc.getElementById('hrcSection');
    assert.ok(s && s.closest('#tasks, [id^=tab], .tab-content, main'), 'panel sayfada');
    assert.match(s.getAttribute('ontoggle'), /loadModule\('harcama'\)\.then\(function\(\)\{renderHarcama\(\)\}\)/);
    assert.strictEqual(A.evalIn("LAZY_MODULES.harcama"), '/harcama.js');
  });

  test('"85 öğle yemeği" + Ekle → data.harcama + save + ekranda', () => {
    A.evalIn('renderHarcama()');
    let kaydedildi = 0;
    const eskiSave = A.evalIn('save');
    A.window.save = function () { kaydedildi++; return eskiSave.apply(this, arguments); };
    A.evalIn('save = window.save');
    doc.getElementById('hrcText').value = '85 öğle yemeği';
    doc.querySelector('#hrcInner button[onclick="hrcEkle()"]').click();
    const L = JSON.parse(JSON.stringify(A.evalIn('data.harcama')));
    assert.strictEqual(L.length, 1);
    assert.strictEqual(L[0].tl, 85);
    assert.strictEqual(L[0].kat, 'yemek');
    assert.strictEqual(L[0].d, A.evalIn('today()'));
    assert.ok(kaydedildi >= 1, 'save() çağrılmalı (buluta gitsin)');
    assert.match(doc.getElementById('hrcInner').textContent, /öğle yemeği/);
    assert.match(doc.getElementById('hrcBadge').textContent, /85/);
  });

  test('"dün" yazınca dünün tarihine; gelecek tarih bugüne çekilir', () => {
    doc.getElementById('hrcText').value = 'dün 40 kahve';
    A.evalIn('hrcEkle()');
    const L = JSON.parse(JSON.stringify(A.evalIn('data.harcama')));
    assert.strictEqual(L[L.length - 1].d, A.evalIn('shiftDateStr(today(), -1)'));
    doc.getElementById('hrcDate').value = '2099-01-01';
    doc.getElementById('hrcText').value = '10 su';
    A.evalIn('hrcEkle()');
    assert.strictEqual(A.evalIn('data.harcama[data.harcama.length-1].d'), A.evalIn('today()'));
  });

  test('tutarsız giriş kayıt üretmez', () => {
    const n = A.evalIn('data.harcama.length');
    doc.getElementById('hrcText').value = 'kahve';
    A.evalIn('hrcEkle()');
    assert.strictEqual(A.evalIn('data.harcama.length'), n);
  });

  test('aylık limit kaydedilir, çizimde kullanılır', () => {
    A.evalIn("hrcLimitKaydet('1.000')");
    assert.strictEqual(A.evalIn('data.settings.harcamaLimit'), 1000);
    assert.match(doc.getElementById('hrcInner').textContent, /Limitin %\d+'i kullanıldı/);
  });

  test('kullanıcı metni kaçışlı (XSS yok)', () => {
    doc.getElementById('hrcText').value = '5 <img src=x onerror=alert(1)>';
    A.evalIn('hrcEkle()');
    assert.ok(!doc.querySelector('#hrcInner img'), 'ham HTML ekrana girmemeli');
  });
});
