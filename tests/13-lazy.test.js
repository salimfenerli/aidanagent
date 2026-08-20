/**
 * 13 — TEMBEL MODUL YUKLEME (9 Agu 2026)
 *
 * NEDEN: ilk yuklemede 8 dosya / ~302 KB gzip iniyordu. Bunun 55 KB'i
 * (stocks.js 44 + program.js 11) kullanicinin O AN acmadigi iki sekmeye aitti.
 * Artik sekmesi ilk acildiginda iniyorlar (html5-qrcode'da kanitlanmis kalip).
 *
 * Ayni pakette stocks.js COZULDU: dosya sadece borsa degildi — icinde
 * toggleTask/deleteTask/editTask gibi TEMEL GOREV fonksiyonlari ve
 * donutChart/sparkline/resizeImageToDataUrl gibi PAYLASILAN yardimcilar
 * duruyordu. Onlar durdukca stocks.js tembel yuklenemezdi: varsayilan sekme
 * (Gorevler) acilirken cagrilirlardi ve 8 Agu escapeHtml olayinin aynisi
 * yasanirdi — "not defined" ile tum uygulama olurdu.
 *
 * Bu dosya iki seyi kilitler:
 *   1) Tembel yukleme sozlesmesi (kim ne zaman iner, iki kez inmez, hata gorunur)
 *   2) Cozulen bagimliliklar geri yapismaz (regresyon kilidi)
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { readText, ROOT } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const html = readText('asistan.html');
const core = readText('core.js');
const tasks = readText('tasks.js');
// 14 Agu 2026: borsa motoru kendi sitesine tasindi. Asagidaki regresyon
// kilitleri hala anlamli: paylasilan yardimcilar ve gorev fonksiyonlari
// motora GERI kaymamali (kaysalar Aidan'da ayni isim iki kez tanimlanirdi).
const stocks = readText('borsa/stocks.js');
const css = readText('styles.css');

// ---------------------------------------------------------------------------
describe('tembel yukleme sozlesmesi', () => {
  test('stocks.js, program.js ve supabase.js <script> etiketiyle GELMIYOR', () => {
    const src = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    for (const m of ['stocks.js', 'program.js', 'supabase.js']) {
      assert.ok(!src.some((s) => s.replace(/^\//, '') === m),
        m + ' hala statik script etiketiyle yukleniyor — tembel yukleme kazanci yok');
    }
  });

  test('core.js hala statik ve ILK yukleniyor', () => {
    // loadModule core.js'te tanimli; core.js kendisi tembel olamaz (yumurta-tavuk).
    const src = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''));
    for (const m of ['core.js', 'tasks.js', 'ui.js']) {
      assert.ok(src.includes(m), m + ' statik yuklenmeli');
    }
    assert.ok(src.indexOf('core.js') < src.indexOf('tasks.js'), 'core.js tasks.js\'ten once gelmeli');
    assert.ok(src.indexOf('tasks.js') < src.indexOf('ui.js'), 'tasks.js ui.js\'ten once gelmeli');
  });

  test('loadModule + LAZY_MODULES core.js\'in EN USTUNDE (TDZ korumasi)', () => {
    const lazyIdx = core.indexOf('const LAZY_MODULES');
    assert.ok(lazyIdx !== -1, 'LAZY_MODULES yok');
    assert.ok(/function loadModule\s*\(/.test(core), 'loadModule yok');
    // 6 Agu 2026 TDZ cokusunun dersi: init sirasinda calisan koddan ONCE tanimli olmali.
    const dataIdx = core.indexOf('let data = JSON.parse');
    assert.ok(dataIdx !== -1, 'core.js init blogu bulunamadi');
    assert.ok(lazyIdx < dataIdx,
      'LAZY_MODULES init blogundan SONRA tanimli — const hoisting yok, TDZ ile comer');
  });

  test('showTab async ve modulu await ediyor', () => {
    assert.ok(/async function showTab\s*\(/.test(tasks),
      'showTab async degil — await loadModule calismaz, render modulden ONCE kosar');
    const govde = tasks.slice(tasks.indexOf('async function showTab'));
    const son = govde.indexOf('\n}');
    const blok = govde.slice(0, son);
    assert.ok(/loadModule\(/.test(blok) && /await /.test(blok), 'showTab modulu beklemiyor');
    // Diyet render'i modul yuklendikten SONRA cagrilmali
    assert.ok(blok.indexOf('loadModule(') < blok.indexOf('renderProgram()'),
      'renderProgram modul yuklenmeden cagriliyor — "not defined" ile patlar');
    // Diyet sekmesi IKI modul ister (program + nutrition)
    assert.ok(/'program', 'nutrition'/.test(blok), 'diyet sekmesi beslenme modulunu yuklemiyor');
  });

  test('LAZY_MODULES tam olarak program + nutrition + supabase', () => {
    const blok = /const LAZY_MODULES = \{([\s\S]*?)\};/.exec(core);
    assert.ok(blok, 'LAZY_MODULES okunamadi');
    const anahtarlar = [...blok[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(anahtarlar, ['nutrition', 'program', 'supabase'],
      'modul listesi degisti — sw.js/deploy.py/Actions paths da guncellendi mi?');
  });
});

// ---------------------------------------------------------------------------
describe('cozulen bagimliliklar (regresyon kilidi)', () => {
  // Bunlar stocks.js'te durdugu surece tembel yukleme MUMKUN DEGIL.
  // Geri tasinirlarsa uygulama varsayilan sekmede oluru gorur.

  const PAYLASILAN = ['donutChart', 'lineChart', 'sparkline', 'resizeImageToDataUrl'];
  const GOREV = ['addTask', 'toggleTask', 'deleteTask', 'editTask', 'addSubtask',
    'deleteSubtask', 'toggleSub', 'toggleMit', 'postponeTask', 'startTaskNow', 'splitTask'];

  for (const fn of PAYLASILAN) {
    test('paylasilan yardimci ' + fn + ' core.js\'te (stocks.js\'te DEGIL)', () => {
      assert.ok(new RegExp('function ' + fn + '\\s*\\(').test(core),
        fn + ' core.js\'te tanimli olmali — core/ui de cagiriyor, borsa sekmesi acilmadan');
      assert.ok(!new RegExp('function ' + fn + '\\s*\\(').test(stocks),
        fn + ' stocks.js\'te yeniden tanimli — ayni isim iki kez');
    });
  }

  for (const fn of GOREV) {
    test('gorev fonksiyonu ' + fn + ' tasks.js\'te (stocks.js\'te DEGIL)', () => {
      assert.ok(new RegExp('(async )?function ' + fn + '\\s*\\(').test(tasks),
        fn + ' tasks.js\'te olmali — Gorevler varsayilan sekme, borsa modulu beklemez');
      assert.ok(!new RegExp('(async )?function ' + fn + '\\s*\\(').test(stocks),
        fn + ' stocks.js\'te kaldi — tembel yukleme onu erisilemez yapar');
    });
  }

  test('erken dosyalar (core/tasks/ui) stocks.js fonksiyonunu KORUMASIZ cagirmiyor', () => {
    // Borsa sekmesi acilmadan cagrilabilecek her yol ya modul yuklendikten sonra
    // olmali ya da typeof/moduleLoaded ile korunmali.
    const stockFns = new Set([...stocks.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)\(/gm)]
      .map((m) => m[1]));
    const ui = readText('ui.js');
    const ihlal = [];
    for (const [dosya, src] of [['core.js', core], ['ui.js', ui]]) {
      for (const fn of stockFns) {
        const re = new RegExp('[^\\w.$]' + fn + '\\s*\\(', 'g');
        if (re.test(src)) ihlal.push(dosya + ' -> ' + fn);
      }
    }
    assert.deepStrictEqual(ihlal, [],
      'core.js/ui.js tembel modulun fonksiyonunu cagiriyor — borsa sekmesi acilmadan calisirsa "not defined"');
  });

  test('visibilitychange handler borsa fonksiyonu cagirmiyor (14 Agu 2026)', () => {
    // Borsa ayri siteye tasindi. Bu handler'da bir refreshStocks cagrisi kalirsa
    // kilit her acildiginda "not defined" ile patlar — sessiz degil, gurultulu bir
    // hata, ama yine de her seferinde.
    const blok = tasks.slice(tasks.indexOf("addEventListener('visibilitychange'"));
    const kesit = blok.slice(0, 400);
    assert.ok(!/refreshStocks|renderStocks|watchlist/.test(kesit),
      'visibilitychange hala borsaya dokunuyor — borsa Aidan\'da YOK');
  });
});

// ---------------------------------------------------------------------------
describe('calisma zamani davranisi', () => {
  const A = loadApp({ seed: {} });
  const W = A.window;
  after(() => { try { A.close(); } catch (_) {} });

  test('loadModule bilinmeyen modulde reddediyor', async () => {
    await assert.rejects(() => W.loadModule('yokboyle'), /bilinmeyen modul/);
  });

  test('ayni modul iki kez INDIRILMEZ (soz onbellegi)', () => {
    // jsdom script indirmez; sozun ayni nesne oldugunu dogrulamak yeterli —
    // asil koruma "iki <script> etiketi eklenmesin" davranisi.
    const once = W.document.querySelectorAll('script[src="/program.js"]').length;
    const p1 = W.loadModule('program');
    const p2 = W.loadModule('program');
    assert.strictEqual(p1, p2, 'ikinci cagri yeni indirme baslatti — modul iki kez iner');
    const sonra = W.document.querySelectorAll('script[src="/program.js"]').length;
    assert.strictEqual(sonra - once, 1, 'birden fazla <script> etiketi eklendi');
    p1.catch(() => {});
  });

  test('moduleLoaded yuklenmemis modul icin false', () => {
    assert.strictEqual(W.moduleLoaded('nutrition'), false);
  });

  test('setModuleLoading iskelet gosterir ve temizler', () => {
    const panel = W.document.getElementById('diet');
    W.setModuleLoading('diet', true);
    assert.ok(panel.querySelector('.mod-loading'), 'iskelet eklenmedi');
    assert.match(panel.querySelector('.mod-loading').textContent, /yukleniyor/i);
    W.setModuleLoading('diet', false);
    assert.strictEqual(panel.querySelector('.mod-loading'), null, 'iskelet kaldirilmadi');
  });

  test('yukleme hatasi SESSIZ kalmiyor — tekrar dene cikiyor', () => {
    const panel = W.document.getElementById('diet');
    W.setModuleLoading('diet', false, 'stocks');
    const el = panel.querySelector('.mod-loading');
    assert.ok(el, 'hata durumunda iskelet yok — kullanici bos ekran gorur');
    assert.ok(/Tekrar dene/.test(el.innerHTML), 'tekrar deneme yolu yok');
    assert.ok(el.querySelector('.mod-loading-dot.err'), 'hata noktasi yok');
    W.setModuleLoading('diet', false);
  });

  test('iskelet XSS kacisi — sekme adi HTML olarak yorumlanmiyor', () => {
    // setModuleLoading tab adini onclick icine koyuyor; ad sabit listeden gelir
    // ama sozlesmeyi yine de kilitle.
    const panel = W.document.getElementById('diet');
    W.setModuleLoading('diet', false, 'stocks');
    const el = panel.querySelector('.mod-loading');
    assert.ok(!/<img|<script/i.test(el.innerHTML), 'iskelette beklenmedik etiket');
    W.setModuleLoading('diet', false);
  });
});

// ---------------------------------------------------------------------------
// ⚠️ BU PAKETIN EN DEGERLI TESTI.
// Diger tum test dosyalari 5 modulu BIRLIKTE yukler — yani tembel yuklemeden
// once ve sonra ayni ortami gorurler. Gercek kullanicinin ilk aciliski ise
// SADECE core+tasks+ui'dir. Bir gorev fonksiyonu ya da paylasilan yardimci
// yanlislikla stocks.js'e geri kayarsa, kirmizi olacak TEK yer burasi.
describe('GERCEK ilk yukleme — tembel moduller YOKKEN', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js'] });
  const W = A.window;
  after(() => { try { A.close(); } catch (_) {} });

  test('uygulama hatasiz aciliyor', () => {
    assert.deepStrictEqual(A.errors, [],
      'tembel modul olmadan acilis patliyor — 6 Agu TDZ cokusunun ayni sinifi');
  });

  test('varsayilan sekme (Gorevler) render oldu', () => {
    assert.ok(W.document.getElementById('tasks').classList.contains('active'));
    assert.ok(W.document.getElementById('taskList'), 'gorev listesi yok');
  });

  test('tum gorev fonksiyonlari cagrilabilir', () => {
    const eksik = ['addTask', 'toggleTask', 'deleteTask', 'editTask', 'addSubtask',
      'deleteSubtask', 'toggleSub', 'toggleMit', 'postponeTask', 'startTaskNow', 'splitTask']
      .filter((f) => typeof W[f] !== 'function');
    assert.deepStrictEqual(eksik, [],
      'gorev fonksiyonu tembel modulde kalmis — Gorevler sekmesi borsayi indirmeyi bekler');
  });

  test('paylasilan yardimcilar cagrilabilir', () => {
    const eksik = ['escapeHtml', 'isoLocal', 'sparkline', 'lineChart', 'donutChart',
      'resizeImageToDataUrl', 'loadModule', 'moduleLoaded', 'setModuleLoading']
      .filter((f) => typeof W[f] !== 'function');
    assert.deepStrictEqual(eksik, [], 'paylasilan yardimci tembel modulde kalmis');
  });

  test('tembel modul fonksiyonlari HENUZ tanimsiz (gercekten tembel)', () => {
    assert.strictEqual(typeof W.renderProgram, 'undefined', 'program.js zaten yuklenmis');
    assert.strictEqual(typeof W.renderNutrition, 'undefined', 'nutrition.js zaten yuklenmis');
    // Borsa artik Aidan'da YOK — hicbir kosulda tanimli olmamali
    assert.strictEqual(typeof W.renderStocks, 'undefined', 'borsa kodu Aidan\'a geri sizmis');
  });

  test('gorev ekle -> tamamla akisi calisiyor', () => {
    W.document.getElementById('taskInput').value = 'tembel yukleme testi';
    W.addTask();
    const t = (A.evalIn('data.tasks') || []).find((x) => x.text === 'tembel yukleme testi');
    assert.ok(t, 'gorev eklenemedi');
    W.toggleTask(t.id);
    assert.strictEqual(t.done, true, 'gorev tamamlanamadi');
    W.deleteTask(t.id);
  });

  test('sekme gecisleri patlamiyor', async () => {
    for (const s of ['focus', 'settings', 'plan', 'chat', 'tasks']) {
      await W.showTab(s);
      assert.ok(W.document.getElementById(s).classList.contains('active'), s + ' acilmadi');
    }
    assert.deepStrictEqual(A.errors, [], 'sekme gecisinde hata');
  });

  test('diyet sekmesi: modul inerken iskelet gosterilir, uygulama COKMEZ', () => {
    const p = W.showTab('diet');
    if (p && p.catch) p.catch(() => {});
    const el = W.document.querySelector('#diet .mod-loading');
    assert.ok(el, 'modul inerken kullanici bos ekran goruyor');
    assert.match(el.textContent, /yukleniyor/i);
    assert.deepStrictEqual(A.errors, [], 'diyet sekmesine gecerken hata olustu');
  });
});

// ---------------------------------------------------------------------------
describe('ilk yukleme butcesi', () => {
  const zlib = require('node:zlib');
  const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(ROOT, f))).length;

  test('statik yuklenen toplam <= 260 KB gzip', () => {
    const statik = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
      .map((m) => m[1].replace(/^\//, ''))
      .filter((f) => !/^https?:/.test(f));
    const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
      .map((m) => m[1].replace(/^\//, '')).filter((f) => !/^https?:/.test(f));
    const toplam = [...statik, ...css, 'asistan.html']
      .filter((f) => fs.existsSync(path.join(ROOT, f)))
      .reduce((a, f) => a + gz(f), 0);
    const kb = Math.round(toplam / 1024);
    // 20 Agu 2026: 215 -> 216. Sebep uretim degil TEMIZLIK: 79 sabit hex
    // token'a cevrildi ('#ff5555' -> 'hata') ve durum kutulari escapeHtml'den
    // geciyor. Karsiliginda olu GECE (v10) :root katmani (1.1 KB) silindi ve
    // satir ici stiller sinifa tasindi; net fark +1.2 KB gzip.
    // ⚠️ Bu esik AGIR BAGIMLILIK icin var. Yeni bir kutuphane statik eklenip
    // esik yukseltilerek gecirilmemeli — o durumda tembel yukleme dogru cevap.
    //
    // 20 Agu 2026 (ikinci paket): esik 216 -> 215'e GERI dondu. Diyet karnesi
    // (10.7 KB kaynak) ui.js'ten nutrition.js'e tasindi; karne yalnizca Diyet
    // sekmesinden acilabiliyor ve o sekme zaten nutrition.js'i bekliyor, yani
    // kritik yolda durmasinin karsiligi yoktu. Kazanilan yer yeni ozelliklere
    // harcandi ve esik yine de dusuruldu — dogru yon bu.
    assert.ok(kb <= 215,
      `ilk yukleme ${kb} KB gzip — butce 215 KB. Yeni agir bagimlilik statik eklendi mi?`);
  });

  test('tembel moduller butceye DAHIL DEGIL (gercekten ayrildilar)', () => {
    const statik = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''));
    for (const m of ['program.js', 'supabase.js', 'nutrition.js']) {
      assert.ok(!statik.includes(m), m + ' hala statik');
    }
    assert.ok(gz('program.js') + gz('supabase.js') + gz('nutrition.js') > 80 * 1024,
      'tembel moduller beklenenden kucuk — dogru dosyalar mi olculuyor?');
  });

  test('kritik istek sayisi 5 ya da alti', () => {
    const n = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].length +
      [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
        .filter((m) => !/^https?:/.test(m[1])).length;
    assert.ok(n <= 5, n + ' kritik istek — tembel yukleme kazanci geri aliniyor');
  });
});

// ---------------------------------------------------------------------------
// supabase.js auth/senkron/catisma mantiginin tabani — en hassas alt sistem.
// Tembel yuklendigi icin "kutuphane inmeden tetiklenen yol" senaryosu kritik.
describe('supabase tembel yukleme', () => {
  test('supaReady ve _supaReady sozlesmesi var', () => {
    const ui = readText('ui.js');
    assert.ok(/async function supaReady\(/.test(ui), 'supaReady yok');
    assert.ok(/window\._supaReady = _initSupabaseAsync\(\)/.test(ui),
      'initSupabase baslatma sozunu saklamiyor — bekleyen yol neyi bekleyecek?');
  });

  test('getSupaToken kutuphane inmeden "oturum yok" DEMEZ', () => {
    const ui = readText('ui.js');
    const i = ui.indexOf('async function getSupaToken(');
    const blok = ui.slice(i, i + 300);
    assert.ok(/await supaReady\(\)/.test(blok),
      'getSupaToken beklemiyor — ilk saniyelerde her AI cagrisi oturum hatasi verir');
  });

  test('giris yollari da bekliyor', () => {
    const ui = readText('ui.js');
    const n = (ui.match(/!\(await supaReady\(\)\)/g) || []).length;
    assert.ok(n >= 4, 'sadece ' + n + ' giris/senkron yolu bekliyor');
  });

  test('save() hala kirli isaretliyor (push kacsa bile veri kaybolmaz)', () => {
    const core = readText('core.js');
    const i = core.indexOf('function save()');
    const blok = core.slice(i, i + 220);
    assert.ok(/markLocalDirty/.test(blok),
      'save kirli isaretlemiyor — kutuphane inmeden yapilan degisiklik hic push edilmez');
  });

  test('initSupabase asenkron ve loadModule kullaniyor', () => {
    const ui = readText('ui.js');
    assert.ok(/await loadModule\('supabase'\)/.test(ui), 'supabase tembel indirilmiyor');
    assert.ok(!/window\.supabase\.createClient/.test(ui.slice(0, ui.indexOf('_initSupabaseAsync'))),
      'createClient tembel yuklemeden ONCE cagriliyor');
  });
});

// ---------------------------------------------------------------------------
describe('Impeccable — iskelet stili', () => {
  const blok = css.slice(css.indexOf('.mod-loading'));
  const kesit = blok.slice(0, 1600);

  test('yan-serit kenarlik YOK (mutlak yasak)', () => {
    assert.ok(!/border-(left|right)\s*:\s*[2-9]/.test(kesit), 'yan-serit accent kenarlik kullanilmis');
    assert.ok(/border:\s*1px/.test(kesit), 'tam kenar yok');
  });

  test('gradient / glass / glow yok', () => {
    assert.ok(!/gradient|backdrop-filter|box-shadow:[^;]*glow/i.test(kesit));
  });

  test('ease-out gecis + prefers-reduced-motion alternatifi var', () => {
    assert.ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(kesit), 'ease-out (quart) kullanilmamis');
    assert.ok(/prefers-reduced-motion/.test(kesit), 'reduced-motion alternatifi yok');
  });

  test('saf siyah/beyaz yok', () => {
    assert.ok(!/#fff\b|#ffffff\b|#000\b|#000000\b/i.test(kesit), 'saf renk kullanilmis');
  });

  test('styles.css hala LF (tek LF dosyasi)', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'styles.css'));
    assert.strictEqual(raw.indexOf(Buffer.from('\r\n')), -1, 'styles.css CRLF bulasmis');
  });
});
