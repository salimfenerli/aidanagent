/**
 * 11 — DEPOLAMA OLCUMU (8 Agu 2026)
 *
 * NEDEN: tum veri TEK JSON blob'da ve tarayici tavani ~5 MB. Budama vardi ama
 * TOPLAM BOYUT hicbir yerde olculmuyordu — kota dolana kadar hicbir sinyal yok,
 * dolunca da kullanicinin o anki islemi (gorev ekleme, ogun kaydi) bozuluyordu.
 * Bu dosya "duvara carpmadan once haber ver" davranisini kilitler.
 *
 * Kritik davranis: uyari GUNDE EN FAZLA BIR KEZ. ADHD'de tekrar eden bildirim
 * korlestirir; her save'de toast atmak uyariyi degersizlestirirdi.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT } = require('./helpers/load');

// jsdom yuklemesi pahali — TEK ornek, tum testler paylasir.
// ⚠️ close() `after` icinde: process.on('exit') KULLANMA — uygulamanin
// setInterval'leri event loop'u ayakta tutar, exit hic tetiklenmez (bkz. 09).
const A = loadApp({ seed: {} });
const W = A.window;
after(() => { try { A.close(); } catch (_) {} });

function toastlariTemizle() {
  const c = W.document.getElementById('toastContainer');
  if (c) c.innerHTML = '';
}
function toastSayisi() {
  const c = W.document.getElementById('toastContainer');
  return c ? c.querySelectorAll('.toast').length : 0;
}

describe('dataSizeReport', () => {
  test('bos veride patlamaz', () => {
    const r = W.eval('dataSizeReport()');
    assert.strictEqual(typeof r.chars, 'number');
    assert.ok(r.chars > 0, 'JSON en az "{}" kadar');
    assert.ok(Array.isArray(r.parts));
  });

  test('parts buyukten kucuge sirali ve sifirlar elenmis', () => {
    W.eval('data.tasks = Array.from({length: 200}, (_,i) => ({id:i, text:"gorev ".repeat(20)+i, done:false}));');
    W.eval('data.dumps = [{text:"kisa", when:"2026-08-08"}];');
    const r = W.eval('dataSizeReport()');
    for (let i = 1; i < r.parts.length; i++) {
      assert.ok(r.parts[i - 1].chars >= r.parts[i].chars, 'siralama bozuk');
    }
    assert.ok(r.parts.every((p) => p.chars > 0), 'bos alan listede kalmis');
    assert.strictEqual(r.parts[0].key, 'tasks', 'en buyuk alan tasks olmaliydi');
  });

  test('pct 5 MB tavanina gore hesaplanir', () => {
    const r = W.eval('dataSizeReport("x".repeat(2621440))');  // tam yarisi
    assert.strictEqual(r.pct, 50);
    assert.strictEqual(W.eval('LS_LIMIT_CHARS'), 5 * 1024 * 1024);
  });

  test('bozuk (dairesel) veride NaN/exception sizmaz', () => {
    W.eval('data._dongu = {}; data._dongu.self = data._dongu; data._dongu.geri = data;');
    const r = W.eval('dataSizeReport("abc")');
    assert.strictEqual(r.chars, 3);
    assert.ok(r.parts.every((p) => Number.isFinite(p.chars)), 'NaN sizdi');
    W.eval('delete data._dongu;');
  });
});

describe('fmtBytes', () => {
  test('KB/MB esigi ve bozuk girdi', () => {
    assert.strictEqual(W.eval('fmtBytes(0)'), '0 KB');
    assert.strictEqual(W.eval('fmtBytes(null)'), '0 KB');
    assert.strictEqual(W.eval('fmtBytes(NaN)'), '0 KB');
    assert.strictEqual(W.eval('fmtBytes(2048)'), '2 KB');
    assert.strictEqual(W.eval('fmtBytes(1048576)'), '1.0 MB');
    assert.strictEqual(W.eval('fmtBytes(3670016)'), '3.5 MB');
  });
});

describe('checkDataSize — uyari politikasi', () => {
  test('esik altinda SESSIZ', () => {
    toastlariTemizle();
    W.eval('data.settings = data.settings || {}; delete data.settings.lastSizeWarn;');
    const pct = W.eval('checkDataSize("x".repeat(1048576))');  // %20
    assert.strictEqual(pct, 20);
    assert.strictEqual(toastSayisi(), 0, 'esik altinda toast atilmamali');
    assert.strictEqual(W.eval('data.settings.lastSizeWarn'), undefined,
      'esik altinda damga da atilmamali');
  });

  test('%65 ustunde uyarir, ayni gun IKINCI KEZ uyarmaz', () => {
    toastlariTemizle();
    W.eval('delete data.settings.lastSizeWarn;');
    const pct = W.eval('checkDataSize("x".repeat(Math.round(5*1024*1024*0.7)))');
    assert.strictEqual(pct, 70);
    assert.strictEqual(toastSayisi(), 1, 'ilk asimda tam 1 toast');
    assert.strictEqual(W.eval('data.settings.lastSizeWarn'), W.eval('today()'));

    W.eval('checkDataSize("x".repeat(Math.round(5*1024*1024*0.7)))');
    W.eval('checkDataSize("x".repeat(Math.round(5*1024*1024*0.9)))');
    assert.strictEqual(toastSayisi(), 1,
      'ayni gun tekrar uyardi — bildirim korlugu tam olarak bundan olusur');
  });

  test('ertesi gun tekrar uyarir', () => {
    toastlariTemizle();
    W.eval('data.settings.lastSizeWarn = "2020-01-01";');
    W.eval('checkDataSize("x".repeat(Math.round(5*1024*1024*0.9)))');
    assert.strictEqual(toastSayisi(), 1, 'yeni gunde uyari yeniden acilmali');
  });

  test('%85 ustunde toast tipi error, arasinda warning', () => {
    toastlariTemizle();
    W.eval('data.settings.lastSizeWarn = "2020-01-01";');
    W.eval('checkDataSize("x".repeat(Math.round(5*1024*1024*0.9)))');
    let t = W.document.getElementById('toastContainer').querySelector('.toast');
    assert.ok(t.className.includes('error'), 'alarm esiginde error olmali');
    assert.ok(/En b/.test(t.textContent), 'alarm mesajinda en buyuk alan yazmali');

    toastlariTemizle();
    W.eval('data.settings.lastSizeWarn = "2020-01-01";');
    W.eval('checkDataSize("x".repeat(Math.round(5*1024*1024*0.7)))');
    t = W.document.getElementById('toastContainer').querySelector('.toast');
    assert.ok(t.className.includes('warning'), 'uyari esiginde warning olmali');
    // 'warn' degil 'warning' — styles.css yalnizca .toast.warning taniyor
    assert.ok(!/\btoast warn\b/.test(t.className), 'gecersiz toast tipi (warn)');
  });
});

describe('renderStorageInfo — DOM', () => {
  function kap() {
    const old = W.document.getElementById('storageInfo');
    if (old) old.closest('.settings-row') && null;
    let host = W.document.getElementById('_storageTestHost');
    if (host) host.remove();
    host = W.document.createElement('div');
    host.id = '_storageTestHost';
    W.document.body.appendChild(host);
    return host;
  }

  test('cubuk + metin + doküm yazilir', () => {
    W.eval('renderStorageInfo()');
    const fill = W.document.getElementById('storageFill');
    const info = W.document.getElementById('storageInfo');
    assert.ok(fill, '#storageFill asistan.html\'de yok');
    assert.ok(/%$/.test(fill.style.width) || fill.style.width.endsWith('%'),
      'genislik yuzde olarak yazilmali, gelen: ' + fill.style.width);
    assert.ok(/kullan/.test(info.textContent), 'ozet metni bos');
    assert.ok(/dolu/.test(info.textContent));
    assert.ok(!/NaN|undefined/.test(info.textContent), 'metne NaN/undefined sizdi');
  });

  test('esik asilinca cubuk sinifi degisir', () => {
    const bar = W.document.querySelector('.storage-bar');
    assert.ok(bar, '.storage-bar asistan.html\'de yok');
    // kucuk veri -> ne warn ne alarm
    W.eval('data.tasks = []; data._sisme = undefined; delete data._sisme;');
    W.eval('renderStorageInfo()');
    assert.ok(!bar.classList.contains('warn') && !bar.classList.contains('alarm'));
    // sisir -> alarm
    W.eval('data._sisme = "x".repeat(Math.round(5*1024*1024*0.9));');
    W.eval('renderStorageInfo()');
    assert.ok(bar.classList.contains('alarm'), 'alarm sinifi eklenmedi');
    W.eval('delete data._sisme;');
    W.eval('renderStorageInfo()');
    assert.ok(!bar.classList.contains('alarm'), 'veri kuculunce alarm kalkmali');
  });

  test('XSS: bilinmeyen alan adi kacisla yazilir', () => {
    W.eval('data["<img src=x onerror=alert(1)>"] = "yeterince uzun bir icerik".repeat(50);');
    W.eval('renderStorageInfo()');
    const parts = W.document.getElementById('storageParts');
    assert.strictEqual(parts.querySelectorAll('img').length, 0, 'HTML enjeksiyonu gecti');
    assert.ok(parts.innerHTML.includes('&lt;img'), 'kacis uygulanmamis');
    W.eval('delete data["<img src=x onerror=alert(1)>"];');
  });

  test('turkce etiketler ham anahtar yerine gosterilir', () => {
    W.eval('data.tasks = [{id:1, text:"a".repeat(400), done:false}];');
    W.eval('renderStorageInfo()');
    const parts = W.document.getElementById('storageParts');
    assert.ok(/Görevler/.test(parts.textContent), 'tasks -> "Görevler" cevrilmeli');
  });
});

describe('saveLocal regresyonu', () => {
  test('saveLocal hala yaziyor ve true donuyor', () => {
    W.eval('data.tasks = [{id: 99, text: "kayit testi", done: false}];');
    assert.strictEqual(W.eval('saveLocal()'), true);
    const ham = W.localStorage.getItem('aidan');
    assert.ok(ham.includes('kayit testi'), 'localStorage\'a yazilmadi');
  });

  test('yazim patlarsa istisna DISARI SIZMAZ, false doner', () => {
    // jsdom'da localStorage bir Proxy — setItem'i override etmek gercekten
    // metodu degistirmiyor, storage'a "setItem" adli anahtar yaziyor. O yuzden
    // hata yolu dairesel veriyle tetiklenir: JSON.stringify try'in ICINDE patlar.
    W.eval('data._dongu = {}; data._dongu.self = data._dongu;');
    let sonuc, patladi = null;
    try { sonuc = W.eval('saveLocal()'); } catch (e) { patladi = e; }
    W.eval('delete data._dongu;');
    assert.strictEqual(patladi, null,
      'istisna cagirana sizdi — kullanicinin o anki islemi sessizce bozulur');
    assert.strictEqual(sonuc, false, 'basarisiz yazimda false donmeli');
  });

  test('checkDataSize basarisiz yazimda CAGRILMAZ', () => {
    // Yazilmayan veri icin "depolama doldu" demek yanlis sinyal olurdu.
    const core = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
    const govde = core.slice(core.indexOf('function saveLocal()'));
    const katch = govde.slice(govde.indexOf('} catch'), govde.indexOf('\n}'));
    assert.ok(!/checkDataSize/.test(katch),
      'checkDataSize catch blogunda cagriliyor — yazilamamis veri icin uyari uretir');
  });
});

describe('kaynak sozlesmesi', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');

  test('saveLocal her yazimda boyutu kontrol ediyor', () => {
    assert.ok(/localStorage\.setItem\('aidan', json\);\s*\r?\n\s*checkDataSize\(json\)/.test(core),
      'checkDataSize saveLocal icinden cagrilmiyor — olcum baglanmamis demektir');
  });

  test('JSON.stringify save basina TEK KEZ (cift maliyet yok)', () => {
    const govde = core.slice(core.indexOf('function saveLocal()'));
    const ilkTry = govde.slice(0, govde.indexOf('} catch'));
    assert.strictEqual((ilkTry.match(/JSON\.stringify\(data\)/g) || []).length, 1,
      'basarili yolda stringify birden fazla kez cagriliyor — buyuk blob\'da pahali');
  });

  test('Impeccable: yan-serit yok, reduced-motion var', () => {
    const blok = css.slice(css.indexOf('.storage-bar'));
    assert.ok(!/\.storage-bar[^{]*\{[^}]*border-(left|right):\s*[2-9]/.test(blok),
      'yan-serit kenarlik yasak (Impeccable)');
    assert.ok(!/backdrop-filter|linear-gradient/.test(blok.slice(0, 1200)),
      'glassmorphism/gradyan yasak (Impeccable)');
    assert.ok(/prefers-reduced-motion[\s\S]*storage-bar/.test(blok),
      'prefers-reduced-motion alternatifi zorunlu');
    assert.ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(blok), 'ease-out egrisi bekleniyor');
  });

  test('styles.css LF kalmis (tek basina)', () => {
    const ham = fs.readFileSync(path.join(ROOT, 'styles.css'));
    assert.ok(!ham.includes(0x0d), 'styles.css CRLF olmus — bu dosya LF kalmali');
  });
});
