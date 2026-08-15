/**
 * Borsa sitesi test yukleyicisi — borsa/index.html'i jsdom'da gercek script
 * sirasiyla ayaga kaldirir.
 *
 * NEDEN AYRI HARNESS: Aidan'in load.js'i asistan.html'i ve 5 modulu birlikte
 * yukluyor. Borsa ayri bir site; ayni ortami paylassaydi "stocks.js hala Aidan
 * cekirdegine bagli" sinifi bir regresyon GORUNMEZ olurdu — cunku o ortamda
 * escapeHtml/showToast zaten tanimli olurdu. Burasi borsa'yi YALNIZ kendi
 * dosyalariyla yukler; eksik bir bagimlilik varsa test kirmizi olur.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const BORSA = path.join(ROOT, 'borsa');
// index.html'deki <script defer> sirasi ile AYNI olmali (bkz. asagidaki sozlesme testi)
const SCRIPTS = ['shared.js', 'stocks.js', 'sync.js', 'app.js'];

function readBorsa(file) {
  return fs.readFileSync(path.join(BORSA, file), 'utf8');
}

function iso(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Gercekci borsa verisi — her ekranin dokundugu alan temsil edilir. */
function fixture() {
  return {
    watchlist: [
      { symbol: 'THYAO', ySymbol: 'THYAO.IS', market: 'bist', name: 'Turk Hava Yollari',
        price: 312.5, prevClose: 305, changePct: 2.46, currency: 'TRY', qty: 40, cost: 280, fetchedAt: Date.now() - 60000 },
      { symbol: 'GARAN', ySymbol: 'GARAN.IS', market: 'bist', name: 'Garanti BBVA',
        price: 128.4, prevClose: 130.1, changePct: -1.31, currency: 'TRY', qty: 100, cost: 119, fetchedAt: Date.now() - 60000 },
      { symbol: 'AAPL', ySymbol: 'AAPL', market: 'abd', name: 'Apple Inc.',
        price: 232.1, prevClose: 235, changePct: -1.23, currency: 'USD', qty: 3, cost: 210, alarmAbove: 250, fetchedAt: Date.now() - 60000 },
      { symbol: 'USDTRY', ySymbol: 'USDTRY=X', market: 'fx', price: 41.2, prevClose: 41.0, changePct: 0.49, currency: 'TRY' },
      // XSS: kullanici sembol alanina ne yazarsa yazsin kacilmali
      { symbol: '<img src=x onerror=alert(1)>', ySymbol: 'XSS', market: 'bist', name: '<script>alert(2)</script>', price: 1, prevClose: 1, changePct: 0, currency: 'TRY' },
    ],
    trades: [
      { id: 31, symbol: 'THYAO', market: 'bist', side: 'long', entry: 300, stop: 290, target: 330, qty: 20,
        reason: 'kirilim', emotion: 'plan', opened: iso(-5), status: 'closed', exit: 325, closed: iso(-3), pnl: 500, r: 2.5 },
      { id: 32, symbol: 'AAPL', market: 'abd', side: 'short', entry: 240, stop: 248, target: 220, qty: 2,
        reason: 'temel', emotion: 'fomo', opened: iso(-1), status: 'open' },
      { id: 33, symbol: 'GARAN', market: 'bist', side: 'long', entry: 120, stop: 114, target: 140, qty: 50,
        reason: 'geri', emotion: 'sakin', opened: iso(-9), status: 'closed', exit: 114, closed: iso(-8), pnl: -300, r: -1 },
    ],
    portfolioHistory: [
      { date: iso(-2), byCur: { TRY: { value: 12100, cost: 11200 } } },
      { date: iso(-1), byCur: { TRY: { value: 12500, cost: 11200 } } },
    ],
    screen: {
      at: Date.now() - 3600000, hurdlePct: 35, scanned: 103, dropped: 80,
      dropCounts: { lowroe: 40, illiquid: 20, smallcap: 20 },
      rows: [
        { symbol: 'THYAO', preScore: 72, normScore: 66, pe: 8.2, pb: 1.4, roe: 0.17, mcap: 4.3e11, bf: { score: 61 } },
        { symbol: 'GARAN', preScore: 65, normScore: 70, pe: 5.1, pb: 1.1, roe: 0.22, mcap: 5.2e11, fin: true },
      ],
      comment: '', deepAt: Date.now() - 3600000,
    },
    settings: { buffettHurdle: { TRY: 35 }, riskPct: 1.5, instructions: '' },
  };
}

/**
 * @param {object} opts
 *   opts.seed    — localStorage'a yazilacak veri (default: fixture()). null = bos.
 *   opts.scripts — yuklenecek dosyalar (default: index.html sirasi).
 */
function loadBorsa(opts = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push((e.detail && e.detail.message) || e.message));

  const dom = new JSDOM(readBorsa('index.html'), {
    runScripts: 'dangerously',
    url: 'https://aidanborsa.pages.dev/',
    virtualConsole: vc,
  });
  const w = dom.window;

  // Ag yok: istek gitmesin, promise'ler ASLA cozulmesin (cozulurse jsdom
  // kapandiktan sonra callback patlar ve gercek hatayi gizler).
  const pending = () => new Promise(() => {});
  w.fetch = pending;
  w.navigator.serviceWorker = {
    register: pending, getRegistrations: () => Promise.resolve([]),
    ready: pending(), controller: null, addEventListener() {}, removeEventListener() {},
  };
  if (!w.caches) {
    w.caches = { open: pending, keys: () => Promise.resolve([]), delete: () => Promise.resolve(true), match: pending };
  }
  if (!w.URL.createObjectURL) w.URL.createObjectURL = () => 'blob:x';
  if (!w.URL.revokeObjectURL) w.URL.revokeObjectURL = () => {};

  const seed = opts.seed === undefined ? fixture() : opts.seed;
  if (seed) w.localStorage.setItem('aidanborsa', JSON.stringify(seed));

  for (const f of (opts.scripts || SCRIPTS)) {
    const s = w.document.createElement('script');
    s.textContent = readBorsa(f);
    w.document.body.appendChild(s);
  }

  // jsdom, string'den kurulan belgede readyState'i 'loading' birakir ve
  // DOMContentLoaded'i bu senkron akista ATMAZ. app.js'in boot()'u tarayicidaki
  // dogru davranisi yapip o olayi bekledigi icin, olay atilmazsa HICBIR SEY
  // render edilmez ve testler "ekran bos" der. Tarayicinin yaptigini burada
  // elle yapiyoruz — uygulama kodu degistirilmemeli.
  if (w.document.readyState === 'loading') {
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  }

  return {
    window: w,
    errors,
    // Top-level const/let window'a yazilmaz — dolayli eval ile global lexical
    // scope'tan okunur (tarayicidaki davranisin aynisi).
    evalIn: (code) => w.eval(code),
    close: () => w.close(),
  };
}

module.exports = { loadBorsa, fixture, readBorsa, iso, BORSA, ROOT, SCRIPTS };
