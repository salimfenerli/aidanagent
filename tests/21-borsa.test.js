/**
 * BORSA SITESI — ayrilma sozlesmesi (14 Agu 2026)
 *
 * Bu dosyanin isi tek cumleyle: borsa sitesi Aidan OLMADAN calisiyor mu?
 * En degerli testler asagidaki iki sinif:
 *   1) YALNIZ borsa dosyalariyla yukleme — Aidan cekirdegine kalan bir bagimlilik
 *      varsa (escapeHtml, showToast, lastNightSleep gibi) burada kirmizi olur.
 *      Aidan'in kendi test ortaminda bu GORUNMEZ, cunku orada hepsi tanimli.
 *   2) Veri izolasyonu — iki uygulama ayni tarayicida yan yana calisiyor;
 *      localStorage anahtarlari veya senkron bayraklari cakisirsa biri
 *      digerinin verisini sessizce ezer.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadBorsa, fixture, readBorsa, BORSA, ROOT, SCRIPTS } = require('./helpers/borsa');

const BORSA_JS = ['shared.js', 'stocks.js', 'sync.js', 'app.js'];
const BORSA_FILES = BORSA_JS.concat(['index.html', 'styles.css', 'sw.js', 'manifest.webmanifest', '_headers', '_redirects']);

// ============================================================
describe('acilis — Aidan olmadan ayakta mi', () => {

  test('dolu veriyle calisma zamani hatasi YOK', () => {
    const app = loadBorsa();
    assert.deepStrictEqual(app.errors, [], 'acilista hata: ' + app.errors.join(' | '));
    app.close();
  });

  test('BOS veriyle de calisir (ilk acilis)', () => {
    const app = loadBorsa({ seed: null });
    assert.deepStrictEqual(app.errors, [], 'bos veride hata: ' + app.errors.join(' | '));
    app.close();
  });

  test('bozuk JSON localStorage uygulamayi comertmez', () => {
    const { JSDOM, VirtualConsole } = require('jsdom');
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => errors.push((e.detail && e.detail.message) || e.message));
    const dom = new JSDOM(readBorsa('index.html'),
      { runScripts: 'dangerously', url: 'https://aidanborsa.pages.dev/', virtualConsole: vc });
    const w = dom.window;
    w.fetch = () => new Promise(() => {});
    w.navigator.serviceWorker = { register: () => new Promise(() => {}) };
    w.localStorage.setItem('aidanborsa', '{bozuk json');
    for (const f of SCRIPTS) {
      const s = w.document.createElement('script');
      s.textContent = readBorsa(f);
      w.document.body.appendChild(s);
    }
    assert.deepStrictEqual(errors, [], 'bozuk veride hata: ' + errors.join(' | '));
    // Sekil onarilmis olmali
    assert.ok(Array.isArray(w.eval('data.watchlist')), 'watchlist dizi degil');
    w.close();
  });

  test('paylasilan yardimcilarin HEPSI tanimli (stocks.js bunlara bagli)', () => {
    const app = loadBorsa();
    for (const fn of ['escapeHtml', 'showToast', 'aidanPrompt', 'aiInstructions', 'isoLocal',
                      'today', 'donutChart', 'lineChart', 'sparkline', 'resizeImageToDataUrl',
                      'save', 'saveLocal', 'getSupaToken', 'supaReady', 'markLocalDirty', 'schedulePush']) {
      assert.strictEqual(app.evalIn(`typeof ${fn}`), 'function', fn + ' tanimli degil');
    }
    assert.strictEqual(app.evalIn('typeof data'), 'object', 'data yok');
    app.close();
  });

  test('Aidan-ozel global HICBIRI aranmiyor', () => {
    // Bu adlar Aidan'da var, borsa sitesinde YOK. Kodda kalmis bir cagri
    // "sessiz olu dal" (typeof korumaliysa) ya da cokme (degilse) demektir.
    // ⚠️ Yorumlar ONCE atilir — aksi halde "showTab('stocks')" gecen bir
    // aciklama satiri testi yanlislikla kirmiziya cevirir (ilk yazimda oldu).
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const src = BORSA_JS.map(f => strip(readBorsa(f))).join('\n');
    for (const g of ['lastNightSleep', 'renderTasks', 'ensureDiet', 'showTab', 'loadModule',
                     'renderDayPlan', 'renderDiet', 'moduleLoaded', 'chatPush', 'pruneChatThumbs']) {
      assert.ok(!new RegExp('\\b' + g + '\\s*\\(').test(src), 'Aidan fonksiyonu hala cagriliyor: ' + g);
    }
  });
});

// ============================================================
describe('render — ekranlar gercekten doluyor', () => {

  test('izleme listesi satirlari cizildi', () => {
    const app = loadBorsa();
    const html = app.window.document.getElementById('stocksList').innerHTML;
    assert.ok(html.includes('THYAO'), 'THYAO yok');
    assert.ok(html.includes('GARAN'), 'GARAN yok');
    assert.ok(html.includes('AAPL'), 'AAPL yok');
    app.close();
  });

  test('portfoy ozeti + pasta + gecmis gorunur (pozisyon varken)', () => {
    const app = loadBorsa();
    const d = app.window.document;
    assert.notStrictEqual(d.getElementById('portfolioSummary').style.display, 'none', 'portfoy ozeti gizli');
    assert.ok(d.getElementById('portfolioSummary').innerHTML.length > 50, 'portfoy ozeti bos');
    app.close();
  });

  test('pozisyon yoksa portfoy panelleri gizli kalir', () => {
    const seed = fixture();
    seed.watchlist = seed.watchlist.map(w => ({ ...w, qty: null, cost: null }));
    const app = loadBorsa({ seed });
    assert.strictEqual(app.window.document.getElementById('portfolioSummary').style.display, 'none');
    app.close();
  });

  test('islem gunlugu istatistikleri cizildi', () => {
    const app = loadBorsa();
    const html = app.window.document.getElementById('tradeJournal').innerHTML;
    assert.ok(html.length > 100, 'islem gunlugu bos');
    assert.ok(/THYAO|AAPL|GARAN/.test(html), 'islem satiri yok');
    app.close();
  });

  test('tarama bolumu son sonucu gosterir', () => {
    const app = loadBorsa();
    const html = app.window.document.getElementById('screenerSection').innerHTML;
    assert.ok(html.length > 100, 'tarama bolumu bos');
    assert.ok(html.includes('scrRows'), 'tarama satir kabi yok');
    app.close();
  });

  test('ust bar saat + piyasa rozeti yaziyor', () => {
    const app = loadBorsa();
    const d = app.window.document;
    assert.match(d.getElementById('stocksModeClock').textContent, /^\d{2}:\d{2}:\d{2}$/, 'saat formati yanlis');
    assert.ok(/BIST|NYSE/.test(d.getElementById('stocksModeDate').innerHTML), 'piyasa rozeti yok');
    app.close();
  });

  test('XSS: gorunen metinde etiket olusmaz', () => {
    const app = loadBorsa();
    const d = app.window.document;
    assert.strictEqual(d.querySelectorAll('#stocksList script').length, 0, 'script dugumu olustu');
    assert.strictEqual(d.querySelectorAll('#stocksList img').length, 0, 'img dugumu olustu');
    const html = d.getElementById('stocksList').innerHTML;
    assert.ok(html.includes('&lt;img'), 'kacis uygulanmamis');
    app.close();
  });

  test('XSS: sembol onclick icindeki JS dizesinden KACAMAZ', () => {
    // Asil tehlike burasi: onclick="setPosition('SEMBOL')" iki katmanli baglam.
    // escapeHtml tek basina yetmez (tarayici &#39; entity'sini JS'ten ONCE
    // cozer ve dizeden cikilir). Tirnak iceren bir sembolle dogrulaniyor.
    const seed = fixture();
    seed.watchlist = [{ symbol: "A');alert(1);//", ySymbol: 'X', market: 'bist', price: 1, prevClose: 1, changePct: 0, currency: 'TRY' }];
    const app = loadBorsa({ seed });
    // Metin eslestirmek yerine GERCEKTEN tiklat: tek kanit budur. Kacis
    // dogruysa payload dizenin ICINDE kalir, alert calismaz ve fonksiyon
    // sembolu bozulmamis alir.
    app.evalIn('window.__hit = 0; window.alert = function(){ window.__hit++; };' +
               'window.__got = null; window.setPosition = function(s){ window.__got = s; };' +
               'window.removeStock = function(){}; window.setStockAlarm = function(){};');
    const btns = [...app.window.document.querySelectorAll('#stocksList button[onclick]')];
    assert.ok(btns.length >= 3, 'buton bulunamadi');
    btns.forEach(b => b.click());
    assert.strictEqual(app.window.__hit, 0, 'XSS calisti — JS dizesinden cikildi');
    assert.strictEqual(app.window.__got, "A');alert(1);//", 'sembol bozuldu (kacis geri cozulmuyor)');
    app.close();
  });

  test('jsArg tek basina escapeHtml ile ayni sey DEGIL (regresyon kilidi)', () => {
    const app = loadBorsa();
    const raw = "o'brien";
    assert.strictEqual(app.evalIn(`escapeHtml("o'brien")`), 'o&#39;brien');
    assert.strictEqual(app.evalIn(`jsArg("o'brien")`), 'o\\&#39;brien', 'jsArg once JS icin kacirmiyor');
    assert.strictEqual(app.evalIn(`jsArg("a\\\\b")`), 'a\\\\b', 'ters bolu kacirilmamis');
    assert.strictEqual(app.evalIn('jsArg(null)'), '');
    app.close();
  });

  test('renderAll() ikinci kez cagrilinca patlamaz (idempotent)', () => {
    const app = loadBorsa();
    app.evalIn('renderAll(); renderAll();');
    assert.deepStrictEqual(app.errors, [], app.errors.join(' | '));
    app.close();
  });
});

// ============================================================
describe('veri izolasyonu — Aidan ile ayni tarayicida', () => {

  test("localStorage anahtari 'aidanborsa' (Aidan'in 'aidan' anahtarina DOKUNMAZ)", () => {
    const app = loadBorsa();
    app.window.localStorage.setItem('aidan', JSON.stringify({ tasks: [{ id: 9, text: 'aidan gorevi' }] }));
    app.evalIn('save()');
    const aidan = JSON.parse(app.window.localStorage.getItem('aidan'));
    assert.strictEqual(aidan.tasks.length, 1, "Aidan'in verisi bozuldu");
    assert.strictEqual(aidan.tasks[0].text, 'aidan gorevi');
    assert.ok(app.window.localStorage.getItem('aidanborsa'), 'borsa verisi yazilmadi');
    app.close();
  });

  test("senkron bayraklari 'borsa_' onekli", () => {
    const src = readBorsa('sync.js');
    assert.ok(src.includes("'borsa_syncRev'"), 'syncRev anahtari borsa_ onekli degil');
    assert.ok(src.includes("'borsa_dirty'"), 'dirty anahtari borsa_ onekli degil');
    assert.ok(src.includes("'borsa_conflictBackup'"), 'yedek anahtari borsa_ onekli degil');
    // Aidan'in anahtarlari HIC gecmemeli
    for (const k of ['aidan_syncRev', 'aidan_dirty', 'aidan_conflictBackup', 'aidan_lastPush']) {
      assert.ok(!src.includes(k), "Aidan'in senkron anahtari kullaniliyor: " + k);
    }
  });

  test('bulut tablosu aidan_stocks (aidan_data DEGIL)', () => {
    const src = readBorsa('sync.js');
    assert.ok(src.includes("SUPA_TABLE = 'aidan_stocks'"), 'tablo adi yanlis');
    assert.ok(!/from\(['"]aidan_data['"]\)/.test(src), "aidan_data'ya yaziliyor!");
    // realtime kanali da ayri olmali, yoksa iki uygulama ayni kanalda carpisir
    assert.ok(src.includes("'borsa-sync-'"), 'realtime kanal adi ayrisdirilmamis');
  });

  test('save() hem yerele yazar hem kirli isaretler hem push planlar', () => {
    const app = loadBorsa();
    app.window.localStorage.removeItem('borsa_dirty');
    app.evalIn('data.watchlist.push({symbol:"TEST",ySymbol:"TEST.IS",market:"bist",currency:"TRY"}); save();');
    assert.strictEqual(app.window.localStorage.getItem('borsa_dirty'), '1', 'kirli bayragi konmadi');
    const saved = JSON.parse(app.window.localStorage.getItem('aidanborsa'));
    assert.ok(saved.watchlist.some(w => w.symbol === 'TEST'), 'yerele yazilmadi');
    app.close();
  });

  test('revMs sunucu/yerel format farkini yutar (sahte cakisma korumasi)', () => {
    const app = loadBorsa();
    const a = app.evalIn("revMs('2026-08-14T10:00:00.000Z')");
    const b = app.evalIn("revMs('2026-08-14T10:00:00+00:00')");
    assert.strictEqual(a, b, 'ayni an iki formatta farkli okundu → her pull sahte cakisma sayardi');
    assert.strictEqual(app.evalIn("revMs('')"), 0);
    assert.strictEqual(app.evalIn("revMs(null)"), 0);
    app.close();
  });

  test('syncSummary iki tarafi karsilastirilabilir ozetler', () => {
    const app = loadBorsa();
    const s = app.evalIn('syncSummary(data)');
    assert.match(s, /\d+ izleme/, 'izleme sayisi yok');
    assert.match(s, /\d+ pozisyon/, 'pozisyon sayisi yok');
    assert.match(s, /\d+ islem/, 'islem sayisi yok');
    assert.strictEqual(app.evalIn('syncSummary(null)'), '0 izleme (0 pozisyon) - 0 islem kaydi');
    app.close();
  });
});

// ============================================================
describe('budama ve depolama', () => {

  test('pruneOldData ACIK islemlere yasi ne olursa olsun dokunmaz', () => {
    const seed = fixture();
    seed.trades.push({ id: 99, symbol: 'ESKI', side: 'long', status: 'open', opened: '2020-01-01' });
    const app = loadBorsa({ seed });
    app.evalIn('pruneOldData(true)');
    const ids = app.evalIn('data.trades.map(t=>t.id).join(",")');
    assert.ok(ids.split(',').includes('99'), 'acik islem budandi — kabul edilemez');
    app.close();
  });

  test('pruneOldData eski portfoy gecmisini kirpar', () => {
    const seed = fixture();
    seed.portfolioHistory.push({ date: '2020-01-01', byCur: { TRY: { value: 1, cost: 1 } } });
    const app = loadBorsa({ seed });
    app.evalIn('pruneOldData(false)');
    assert.ok(!app.evalIn('data.portfolioHistory.map(h=>h.date).join(",")').includes('2020-01-01'),
      'eski gecmis kalmis');
    app.close();
  });

  test('dataSizeReport buyukten kucuge siralar ve NaN sizdirmaz', () => {
    const app = loadBorsa();
    const rep = app.evalIn('JSON.stringify(dataSizeReport())');
    const r = JSON.parse(rep);
    assert.ok(r.chars > 0 && Number.isFinite(r.pct), 'olcum bozuk');
    for (let i = 1; i < r.parts.length; i++) {
      assert.ok(r.parts[i - 1].chars >= r.parts[i].chars, 'siralama bozuk');
      assert.ok(Number.isFinite(r.parts[i].chars), 'NaN sizdi');
    }
    app.close();
  });
});

// ============================================================
describe('mimari sozlesme', () => {

  test('index.html script sirasi harness ile AYNI', () => {
    const html = readBorsa('index.html');
    const order = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(m => m[1]);
    assert.deepStrictEqual(order, SCRIPTS,
      'script sirasi degisti — harness gercek yuklemeyi temsil etmiyor demektir');
  });

  test('shared.js ILK yuklenir (escapeHtml ilk kullanimdan once tanimli olmali)', () => {
    const html = readBorsa('index.html');
    const order = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(m => m[1]);
    assert.strictEqual(order[0], 'shared.js',
      'shared.js ilk degil — 8 Agu 2026 escapeHtml kazasinin aynisi olur');
  });

  test('sw.js ASSETS listesi gercek dosyalarla ortusur (404 = bolum hic acilmaz)', () => {
    const sw = readBorsa('sw.js');
    const assets = [...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(Boolean);
    for (const a of assets) {
      if (a === 'index.html' || a === '') continue;
      assert.ok(fs.existsSync(path.join(BORSA, a)), 'sw.js olmayan dosyayi cache liyor: ' + a);
    }
    for (const f of BORSA_JS.concat(['styles.css'])) {
      assert.ok(sw.includes("'./" + f + "'"), 'sw.js ASSETS icinde eksik: ' + f);
    }
  });

  test('borsa/ dosyalarinin HICBIRI .gitignore tarafindan yok sayilmiyor', () => {
    // 🔴 14 Agu 2026 — GERCEK OLAY. .gitignore'da eski bir `app.js` satiri vardi
    // (2 ay once silinen kok dosyasi icin). Git'te EGIK CIZGISIZ desen HER
    // klasordeki o isimle eslesir → `borsa/app.js` hic push edilmedi.
    // Sonuc: CI 28 saniyede "dosya yok" ile dustu, site yayina cikmadi.
    // Bu test o sinifi kalici olarak kapatir: siteye yeni bir dosya eklenip
    // adi tesadufen bir gitignore desenine uyarsa BURADA kirmizi olur, canlida
    // "sayfa bos" olarak degil.
    const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    const patterns = gi.split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && !l.startsWith('!'));

    const toRe = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$');

    const ignored = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'borsa'))) {
      for (const p0 of patterns) {
        const p = p0.replace(/\/$/, '');
        if (p.includes('/')) continue;          // yola bagli desen: taban adiyla eslesmez
        if (toRe(p).test(f)) ignored.push(`borsa/${f}  <-- .gitignore: "${p0}"`);
      }
    }
    assert.deepStrictEqual(ignored, [],
      'Bu dosyalar git tarafindan yok sayiliyor, yani PUSH EDILMIYOR:\n  ' + ignored.join('\n  '));
  });

  test('borsa/ deploy listesi ile gercek dosyalar ortusuyor', () => {
    // Deploy scriptindeki liste eksikse site 404'lerle yayina cikar (sessiz).
    const dep = fs.readFileSync(path.join(ROOT, 'borsa-pages-deploy.py'), 'utf8');
    const listed = [...dep.matchAll(/\("([^"]+)",\s*"\/[^"]*"\)/g)].map(m => m[1]);
    for (const f of BORSA_JS.concat(['index.html', 'styles.css', 'sw.js', 'manifest.webmanifest'])) {
      assert.ok(listed.includes(f), 'deploy listesinde eksik: ' + f);
    }
    for (const f of listed) {
      assert.ok(fs.existsSync(path.join(BORSA, f)), 'deploy listesinde olmayan dosya: ' + f);
    }
  });

  test('borsa dosyalarinda satir sonu LF (klasor kurali)', () => {
    for (const f of BORSA_FILES) {
      const b = fs.readFileSync(path.join(BORSA, f));
      assert.strictEqual(b.includes(Buffer.from('\r\n')), false, 'CRLF bulundu: ' + f);
    }
  });

  test('motorun genel yuzeyi eksiksiz (index.html ve modallar bunlari cagiriyor)', () => {
    // ⚠️ Bu test once "Aidan'daki stocks.js ile ayni mi" diye bakiyordu; o dosya
    // artik YOK (tasima tamamlandi). Kalici sozlesme sudur: index.html'deki
    // onclick'ler ve app.js bu adlari cagiriyor — biri kaybolursa dugme sessizce
    // olur (konsola hata basar ama ekranda hicbir sey olmaz).
    const app = loadBorsa();
    const GEREKLI = [
      // izleme listesi + portfoy
      'renderStocks', 'refreshStocks', 'addStock', 'removeStock', 'selectMarket',
      'setStockAlarm', 'setPosition', 'recordPortfolioSnapshot', 'updateStocksMeta',
      'renderPortfolioSummary', 'renderPortfolioPie', 'renderPortfolioHistory', 'renderPortfolioRisk',
      'renderBist100Compare', 'isMarketOpen',
      // grafik + teknik analiz
      'openStockChart', 'closeStockChart', 'setStockView', 'loadStockHistory',
      'setChartMode', 'toggleFib', 'computeStockTA', 'taConfluence', 'taScenarios',
      // temel analiz
      'buffettScore', 'loadStockFundamentals', 'setBuffettHurdle',
      // tarama
      'renderScreener', 'runScreener', 'setScreenSort', 'screenAddToWatchlist',
      // islem gunlugu
      'renderTradeJournal', 'openTradeModal', 'saveTradeModal', 'closeTradePrompt', 'deleteTrade',
      // AI + gorsel
      'aiStockAnalysis', 'aiScreenComment', 'openPfTechModal', 'handlePortfolioPhoto',
      'confirmPortfolioImport',
    ];
    const eksik = GEREKLI.filter(f => app.evalIn(`typeof ${f}`) !== 'function');
    assert.deepStrictEqual(eksik, [], 'motorda eksik fonksiyon: ' + eksik.join(', '));
    app.close();
  });

  test('index.html onclick larinin HEPSI tanimli (olu dugme yok)', () => {
    const html = readBorsa('index.html');
    // `onclick="if(event.target...)"` gibi kaliplar da eslesiyor — anahtar
    // sozcukleri ele (typeof 'if' sozdizimi hatasi verir, testi yaniltir).
    const KEYWORD = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof', 'new', 'function', 'catch']);
    const cagrilan = new Set([...html.matchAll(/on(?:click|change|input|keydown)="([a-zA-Z_$][\w$]*)\(/g)]
      .map(m => m[1]).filter(f => !KEYWORD.has(f)));
    assert.ok(cagrilan.size > 15, 'onclick taramasi bos dondu: ' + cagrilan.size);
    const app = loadBorsa();
    const olu = [...cagrilan].filter(f => app.evalIn(`typeof ${f}`) !== 'function');
    assert.deepStrictEqual(olu, [], 'HTML tanimsiz fonksiyon cagiriyor: ' + olu.join(', '));
    app.close();
  });

  test('CSP borsa icin gerekli tek dis baglantiya izin verir', () => {
    const h = readBorsa('_headers');
    assert.ok(h.includes('aidan-pusher.fenerlisalim04.workers.dev'), 'worker connect-src yok');
    assert.ok(h.includes('*.supabase.co'), 'supabase connect-src yok');
    assert.ok(h.includes("frame-ancestors 'none'"), 'clickjacking korumasi yok');
    // Aidan'a ozgu, borsada gereksiz izin tasinmamali
    assert.ok(!h.includes('openfoodfacts'), 'gereksiz izin tasinmis (openfoodfacts)');
    assert.ok(!h.includes('microphone=(self)'), 'gereksiz mikrofon izni');
  });

  test('manifest ayri uygulama olarak kurulur (Aidan ile ayni scope DEGIL)', () => {
    const m = JSON.parse(readBorsa('manifest.webmanifest'));
    assert.strictEqual(m.name, 'Borsa');
    assert.strictEqual(m.scope, './');
    assert.notStrictEqual(m.theme_color, '#0a0b0f', 'Aidan temasi kopyalanmis');
  });
});

// ============================================================
describe('Impeccable tasarim denetimi', () => {
  const css = readBorsa('styles.css');

  test('yan-serit accent kenarlik YOK (tam kenar + tint kurali)', () => {
    // 2px+ renkli border-left/right yasak. 1px notrler serbest.
    const bad = [...css.matchAll(/border-(?:left|right)\s*:\s*([^;]+);/g)]
      .map(m => m[1].trim())
      .filter(v => /^([3-9]|\d{2,})px/.test(v) && !/transparent|none/.test(v));
    assert.deepStrictEqual(bad, [], 'yan-serit kenarlik bulundu: ' + bad.join(' | '));
  });

  test('glassmorphism (backdrop-filter blur) YOK', () => {
    assert.ok(!/backdrop-filter\s*:\s*[^;]*blur/.test(css), 'backdrop blur bulundu');
  });

  test('gradient-text YOK', () => {
    assert.ok(!/-webkit-text-fill-color\s*:\s*transparent/.test(css), 'gradient text bulundu');
  });

  test('ozel scrollbar YOK (standart affordance yeniden icat edilmez)', () => {
    assert.ok(!css.includes('::-webkit-scrollbar'), 'ozel scrollbar bulundu');
  });

  test('prefers-reduced-motion karsiligi var', () => {
    assert.ok(css.includes('prefers-reduced-motion'), 'reduced-motion bloku yok');
  });

  test('saf siyah/beyaz zemin yok (renkler tonlu)', () => {
    const root = css.slice(css.lastIndexOf(':root'));
    assert.ok(!/--bg:\s*#000\b|--bg:\s*#000000\b/.test(root), 'saf siyah zemin');
    assert.ok(!/--text:\s*#fff\b|--text:\s*#ffffff\b/.test(root), 'saf beyaz metin');
  });

  test('vurgu rengi yesil/kirmizi DEGIL (o ikisi yon anlamina ayrildi)', () => {
    const root = css.slice(css.lastIndexOf(':root'));
    const m = root.match(/--accent:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(m, '--accent tanimli degil');
    const [r, g, b] = [1, 3, 5].map(i => parseInt(m[1].substr(i, 2), 16));
    assert.ok(!(g > r + 30 && g > b + 30), 'vurgu yesil tonunda — yukselis rengiyle cakisiyor');
    assert.ok(!(r > g + 30 && r > b + 30), 'vurgu kirmizi tonunda — dusus rengiyle cakisiyor');
  });

  test('Aidan amber paleti sizmadi', () => {
    for (const amber of ['#f5a524', '245,165,36', '#1c1206', '#ffb43a']) {
      assert.ok(!css.includes(amber), 'Aidan amber degeri kalmis: ' + amber);
    }
  });

  test('palet bloku EN SONDA (5 ayri :root var, sonuncusu kazanir)', () => {
    const last = css.lastIndexOf(':root');
    const m = css.slice(last).match(/--accent:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(m && m[1].toLowerCase() === '#4d8df0',
      'son :root borsa paleti degil — Aidan tokenlari geri geliyor');
  });
});

// ============================================================
describe('worker CORS — iki origin', () => {
  const worker = fs.readFileSync(path.join(ROOT, 'aidan-worker', 'worker.js'), 'utf8');

  test('allowlist her iki siteyi de icerir', () => {
    assert.ok(worker.includes("'https://aidanapp.pages.dev'"), 'Aidan origin yok');
    assert.ok(worker.includes("'https://aidanborsa.pages.dev'"), 'Borsa origin yok');
  });

  test('sabit origin kalmadi — hepsi allowOrigin(request)', () => {
    assert.ok(!worker.includes("'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev'"),
      'sabit origin kalmis — borsa istekleri tarayicida bloklanir');
    const n = (worker.match(/'Access-Control-Allow-Origin': allowOrigin\(request\)/g) || []).length;
    assert.ok(n >= 27, 'beklenen sayida cors blogu donusmemis: ' + n);
  });

  test("Vary: Origin her cors blogunda (onbellek yanlis origin servis etmesin)", () => {
    const allow = (worker.match(/'Access-Control-Allow-Origin': allowOrigin\(request\)/g) || []).length;
    const vary = (worker.match(/'Vary': 'Origin'/g) || []).length;
    assert.strictEqual(allow, vary, 'Vary sayisi allow sayisiyla eslesmiyor');
  });

  test('allowOrigin rastgele origin YANSITMAZ (aksi halde her siteye izin olurdu)', () => {
    const fn = new Function('request', worker.match(/const ALLOWED_ORIGINS = \[[\s\S]*?\n\}/)[0] + '\nreturn allowOrigin(request);');
    const mk = o => ({ headers: { get: () => o } });
    assert.strictEqual(fn(mk('https://aidanborsa.pages.dev')), 'https://aidanborsa.pages.dev');
    assert.strictEqual(fn(mk('https://aidanapp.pages.dev')), 'https://aidanapp.pages.dev');
    assert.strictEqual(fn(mk('https://kotu-site.example')), 'https://aidanapp.pages.dev', 'yabanci origin yansitildi!');
    assert.strictEqual(fn(mk('')), 'https://aidanapp.pages.dev');
    assert.strictEqual(fn({ headers: null }), 'https://aidanapp.pages.dev', 'header yokken patliyor');
  });
});
