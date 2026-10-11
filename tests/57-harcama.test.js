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
vm.runInContext(saf + '\nthis.sayi = hrcSayi; this.ayr = hrcAyristir; this.kat = hrcKategori; this.ozet = hrcOzet; this.kay = hrcAyKaydir; this.bol = hrcBol; this.sik = hrcSik;', ctx);
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

describe('çoklu giriş ve sık kullanılanlar (11 Eki — giriş geliştirmesi)', () => {
  test('virgül/noktalı virgül/+/yeni satır/"ve" ayırır; rakam arası virgül ONDALIK kalır', () => {
    assert.deepStrictEqual(js(ctx.bol('85 yemek, 40 otobüs')), ['85 yemek', '40 otobüs']);
    assert.deepStrictEqual(js(ctx.bol('85 yemek,40 otobüs')), ['85 yemek', '40 otobüs']);
    assert.deepStrictEqual(js(ctx.bol('85,50 kahve; 1.250,75 telefon')), ['85,50 kahve', '1.250,75 telefon']);
    assert.deepStrictEqual(js(ctx.bol('20 su + 15 simit\n30 kola')), ['20 su', '15 simit', '30 kola']);
    assert.deepStrictEqual(js(ctx.bol('85 yemek ve 40 otobüs')), ['85 yemek', '40 otobüs']);
    assert.deepStrictEqual(js(ctx.bol('çay ve simit 30')), ['çay ve simit 30'], '"ve"den sonra rakam yoksa bölünmez');
    assert.deepStrictEqual(js(ctx.bol('  ,, ')), []);
  });
  test('sık: son 60 günde ≥2 kez aynı not+tutar; çok tekrarlanan önce', () => {
    const L = [
      { d: '2026-10-10', tl: 85, not: 'Öğle yemeği', kat: 'yemek' },
      { d: '2026-10-09', tl: 85, not: 'öğle yemeği', kat: 'yemek' },
      { d: '2026-10-08', tl: 85, not: 'öğle yemeği', kat: 'yemek' },
      { d: '2026-10-10', tl: 40, not: 'otobüs', kat: 'ulasim' },
      { d: '2026-10-01', tl: 40, not: 'otobüs', kat: 'ulasim' },
      { d: '2026-10-05', tl: 150, not: 'sinema', kat: 'eglence' },      // tek sefer
      { d: '2026-07-01', tl: 25, not: 'kahve', kat: 'yemek' },          // 60 günden eski
      { d: '2026-07-02', tl: 25, not: 'kahve', kat: 'yemek' },
      { d: '2026-10-03', tl: 10, kat: 'diger' }, { d: '2026-10-04', tl: 10, kat: 'diger' },  // notsuz
    ];
    const r = js(ctx.sik(L, '2026-10-11', 4));
    assert.deepStrictEqual(r.map(x => x.not + ':' + x.tl + ':' + x.adet), ['Öğle yemeği:85:3', 'otobüs:40:2']);
    assert.deepStrictEqual(js(ctx.sik(undefined, '2026-10-11')), []);
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

  const yaz = (v) => { const i = doc.getElementById('hrcText'); i.value = v; i.dispatchEvent(new A.window.Event('input')); };
  const L = () => JSON.parse(JSON.stringify(A.evalIn('data.harcama')));

  test('"85 öğle yemeği" + Kaydet → data.harcama + save + ekranda', () => {
    A.evalIn('renderHarcama()');
    let kaydedildi = 0;
    const eskiSave = A.evalIn('save');
    A.window.save = function () { kaydedildi++; return eskiSave.apply(this, arguments); };
    A.evalIn('save = window.save');
    yaz('85 öğle yemeği');
    assert.match(doc.getElementById('hrcPrev').textContent, /85 ₺ · Yemek — öğle yemeği/, 'canlı önizleme');
    assert.match(doc.getElementById('hrcKaydet').textContent, /Kaydet · 85 ₺/);
    doc.getElementById('hrcKaydet').click();
    assert.strictEqual(L().length, 1);
    assert.strictEqual(L()[0].tl, 85);
    assert.strictEqual(L()[0].kat, 'yemek');
    assert.strictEqual(L()[0].d, A.evalIn('today()'));
    assert.ok(kaydedildi >= 1, 'save() çağrılmalı (buluta gitsin)');
    assert.match(doc.getElementById('hrcInner').textContent, /öğle yemeği/);
    assert.match(doc.getElementById('hrcBadge').textContent, /85/);
    assert.strictEqual(doc.getElementById('hrcText').value, '', 'kutu boşalır');
  });

  test('tek seferde çoklu giriş; tutarsız parça kutuda KALIR', () => {
    const n = L().length;
    yaz('40 otobüs, 150 sinema, kahve');
    assert.match(doc.getElementById('hrcKaydet').textContent, /2 harcama kaydet · 190 ₺/);
    assert.match(doc.getElementById('hrcPrev').textContent, /"kahve" — tutar yok/);
    doc.getElementById('hrcKaydet').click();
    const l = L();
    assert.strictEqual(l.length, n + 2);
    assert.deepStrictEqual(l.slice(-2).map(x => x.kat), ['ulasim', 'eglence']);
    assert.strictEqual(doc.getElementById('hrcText').value, 'kahve');
    yaz('');
  });

  test('Dün çipi ve "dün" kelimesi; gelecek tarih bugüne çekilir', () => {
    A.evalIn("hrcGunSec('dun')");
    assert.strictEqual(doc.querySelector('#hrcGiris [onclick="hrcGunSec(\'dun\')"]').getAttribute('aria-pressed'), 'true');
    yaz('20 su'); doc.getElementById('hrcKaydet').click();
    assert.strictEqual(L().pop().d, A.evalIn('shiftDateStr(today(), -1)'));
    A.evalIn("hrcGunSec('bugun')");
    yaz('dün 40 kahve'); A.evalIn('hrcEkle()');
    assert.strictEqual(L().pop().d, A.evalIn('shiftDateStr(today(), -1)'));
    A.evalIn("hrcGunSec('2099-01-01')");
    yaz('10 su'); A.evalIn('hrcEkle()');
    assert.strictEqual(L().pop().d, A.evalIn('today()'));
    A.evalIn("hrcGunSec('bugun')");
  });

  test('kategori çipi tüm partiye uygulanır, sonra otomatiğe döner', () => {
    A.evalIn("hrcKatSec('okul')");
    yaz('30 kahve, 50 kitap'); A.evalIn('hrcEkle()');
    assert.deepStrictEqual(L().slice(-2).map(x => x.kat), ['okul', 'okul']);
    assert.strictEqual(A.evalIn('_hrcSecKat'), '');
  });

  test('sık kullanılanlar tek dokunuşla ekler', () => {
    yaz('85 öğle yemeği'); A.evalIn('hrcEkle()');      // 2. kez → sık listesine girer
    const btn = doc.querySelector('#hrcGiris .hrc-sik .hrc-chip');
    assert.ok(btn, 'sık kullanılan çip görünmeli');
    assert.match(btn.textContent, /85 ₺öğle yemeği/);
    const n = L().length;
    btn.click();
    assert.strictEqual(L().length, n + 1);
    assert.strictEqual(L().pop().not, 'öğle yemeği');
  });

  test('satıra dokun → düzenle → Güncelle (yeni kayıt AÇILMAZ)', () => {
    const x = L().find(e => e.not === 'sinema');
    const n = L().length;
    doc.querySelector('.hrc-item-t[data-id="' + x.id + '"]').click();
    assert.strictEqual(doc.getElementById('hrcText').value, '150 sinema');
    assert.match(doc.getElementById('hrcKaydet').textContent, /Güncelle/);
    yaz('120,50 sinema');
    doc.getElementById('hrcKaydet').click();
    assert.strictEqual(L().length, n);
    assert.strictEqual(L().find(e => e.id === x.id).tl, 120.5);
    assert.strictEqual(A.evalIn('_hrcDuzen'), null);
  });

  test('sil → onay penceresi YOK, Geri al geri getirir', () => {
    const x = L()[0];
    let geriAl = null;
    A.window.showUndoToast = (m, fn) => { geriAl = fn; };
    A.evalIn('showUndoToast = window.showUndoToast');
    A.window.confirm = () => { throw new Error('confirm çağrılmamalı'); };
    A.evalIn('hrcSil(' + JSON.stringify(String(x.id)) + ')');
    assert.ok(!L().some(e => e.id === x.id));
    assert.strictEqual(typeof geriAl, 'function');
    geriAl();
    assert.ok(L().some(e => e.id === x.id));
  });

  test('tutarsız giriş kayıt üretmez', () => {
    const n = L().length;
    yaz('kahve');
    assert.ok(doc.getElementById('hrcKaydet').disabled);
    A.evalIn('hrcEkle()');
    assert.strictEqual(L().length, n);
    yaz('');
  });

  test('aylık limit kaydedilir, çizimde kullanılır', () => {
    A.evalIn("hrcLimitKaydet('1.000')");
    assert.strictEqual(A.evalIn('data.settings.harcamaLimit'), 1000);
    assert.match(doc.getElementById('hrcInner').textContent, /Limitin %\d+'i kullanıldı/);
  });

  test('kullanıcı metni kaçışlı (XSS yok)', () => {
    yaz('5 <img src=x onerror=alert(1)>');
    assert.ok(!doc.querySelector('#hrcPrev img'), 'önizleme de kaçışlı');
    A.evalIn('hrcEkle()');
    assert.ok(!doc.querySelector('#hrcInner img'), 'ham HTML ekrana girmemeli');
  });
});
