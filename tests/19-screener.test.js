/**
 * 19 — BIST TEMEL TARAMA (11 Agu 2026)
 *
 * NEDEN BU DOSYA VAR: tarama, kullaniciya "bunlara bak" diyen bir liste uretiyor.
 * Hatasi sessizdir — yanlis elenen hisse hic gorunmez, yanlis geceni ise dogru
 * sanilir. Buffett skorunda oldugu gibi her kural burada kilitlenir.
 *
 * En kritik sozlesmeler:
 *   1. Veri yoksa UYDURMA — eksik oran atlanir, kapsama dusukse skor null.
 *   2. Zarar eden / likit olmayan hisse hic PUANLANMAZ (kapi, skor degil).
 *   3. Siralama DETERMINISTIK — ayni girdi ayni cikti, rastgelelik yok.
 *   4. "Buffett skoru yok" ile "Buffett skoru dusuk" AYNI SEY DEGILDIR.
 *   5. AI siralamaya karismaz; tavsiye/kehanet/deger yargisi yasaklari yerinde.
 */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load');
const { readText, readRaw } = require('./helpers/src');

// jsdom yuklemesi pahali — TEK ornek acilir (09-buffett kalibi, `after` ile kapanir)
const A = loadApp({ seed: {} });
const W = A.window;
after(() => { try { A.close(); } catch (_) {} });

// ⚠️ core.js'te `data` top-level let — window'a YAZILMAZ. Testte dolayli eval
// ile canli referans alinir (tarayicidaki global lexical scope davranisi).
function D() { return A.evalIn('data'); }

const SRC = readText('stocks.js');
const WK = readText('aidan-worker/worker.js');

// ——— Saglikli bir tarama satiri (Yahoo quote normalize edilmis hali) ———
function row(over = {}) {
  return Object.assign({
    symbol: 'TEST', ySymbol: 'TEST.IS', name: 'Test A.S.', currency: 'TRY',
    price: 100, changePct: 1.2,
    marketCap: 50e9,
    trailingPE: 5, priceToBook: 2.5, bookValue: 40,
    eps: 20, dividendYield: 0.06,
    volume: 5e6, avgVolume: 4e6,   // 4e6 * 100 = 400 mn TL ciro
  }, over);
}

// ============================================================
// Turetilmis ROE — cebirsel ozdeslik
// ============================================================
test('turetilmis ROE = PD/DD ÷ F/K (ozdeslik)', () => {
  assert.strictEqual(W.screenRoe(row({ priceToBook: 2.5, trailingPE: 5 })), 0.5);
  assert.ok(Math.abs(W.screenRoe(row({ priceToBook: 1.2, trailingPE: 6 })) - 0.2) < 1e-9);
});

test('ROE negatif/sifir/eksik girdide null doner — uydurma yok', () => {
  for (const o of [{ trailingPE: 0 }, { trailingPE: -4 }, { priceToBook: 0 },
                   { priceToBook: null }, { trailingPE: null }, { trailingPE: NaN }]) {
    assert.strictEqual(W.screenRoe(row(o)), null, JSON.stringify(o));
  }
});

// ============================================================
// Hijyen kapilari — bunlar SKOR degil, KAPI
// ============================================================
test('saglikli satir kapidan gecer', () => {
  assert.strictEqual(W.screenHygiene(row()).ok, true);
});

test('zarar eden hisse hic puanlanmaz', () => {
  const h = W.screenHygiene(row({ trailingPE: -8 }));
  assert.strictEqual(h.ok, false);
  assert.strictEqual(h.why, 'loss');
  // ve rank asamasinda da listeye giremez
  const r = W.screenRank([row({ trailingPE: -8 })], { hurdlePct: 35 });
  assert.strictEqual(r.passed.length, 0);
});

test('likidite kapisi: dusuk hacimli hisse elenir', () => {
  // 1000 lot * 100 TL = 100.000 TL/gun — esik 20 mn
  const h = W.screenHygiene(row({ avgVolume: 1000 }));
  assert.strictEqual(h.ok, false);
  assert.strictEqual(h.why, 'illiquid');
});

test('mikro sirket elenir, buyuk sirket gecer', () => {
  assert.strictEqual(W.screenHygiene(row({ marketCap: 1e8 })).why, 'small');
  assert.strictEqual(W.screenHygiene(row({ marketCap: 5e9 })).ok, true);
});

test('F/K ve PD/DD tavanlari kapi olarak calisir', () => {
  assert.strictEqual(W.screenHygiene(row({ trailingPE: 90 })).why, 'expensive');
  assert.strictEqual(W.screenHygiene(row({ priceToBook: 12, trailingPE: 5 })).why, 'rich');
});

test('fiyati gelmeyen sembol veri-yok kapisindan doner', () => {
  assert.strictEqual(W.screenHygiene(row({ price: null })).why, 'nodata');
  assert.strictEqual(W.screenHygiene(row({ price: 0 })).why, 'nodata');
});

// ============================================================
// On skor
// ============================================================
test('yuksek ROE + dusuk F/K yuksek skor alir', () => {
  // F/K 3, PD/DD 1,8 -> turetilmis ROE %60, engelin (%35) 1,7 kati
  const s = W.screenPreScore(row({ trailingPE: 3, priceToBook: 1.8, dividendYield: 0.12 }), 35);
  assert.ok(s.score >= 70, `beklenen >=70, gelen ${s.score}`);
  assert.strictEqual(s.coverage, 1);
});

test('engel oraninin cok altinda ROE dusuk skor alir', () => {
  const s = W.screenPreScore(row({ trailingPE: 30, priceToBook: 1.5, dividendYield: null }), 35);
  assert.ok(s.score != null && s.score < 40, `beklenen <40, gelen ${s.score}`);
});

test('skor her zaman 0-100 arasinda kalir', () => {
  for (const h of [1, 10, 35, 120]) {
    for (const o of [{}, { trailingPE: 0.5 }, { priceToBook: 0.1 }, { dividendYield: 0.9 }]) {
      const s = W.screenPreScore(row(o), h);
      if (s && s.score != null) assert.ok(s.score >= 0 && s.score <= 100, `${h} ${JSON.stringify(o)} -> ${s.score}`);
    }
  }
});

test('engel orani yukselince ayni hisse dusuk skor alir (hurdle gercekten etkiliyor)', () => {
  const r = row({ trailingPE: 8, priceToBook: 2 });
  const lo = W.screenPreScore(r, 10).score;
  const hi = W.screenPreScore(r, 60).score;
  assert.ok(lo > hi, `engel yukselince skor dusmeli: %10 -> ${lo}, %60 -> ${hi}`);
});

test('temettu verisi yoksa kriter ATLANIR, 0 puan sayilmaz', () => {
  const withDiv = W.screenPreScore(row({ dividendYield: 0.0001 }), 35).score;
  const noDiv = W.screenPreScore(row({ dividendYield: null }), 35).score;
  assert.ok(noDiv > withDiv,
    `veri yok (${noDiv}) sifira yakin temettuden (${withDiv}) daha kotu puanlanmamali`);
  const s = W.screenPreScore(row({ dividendYield: null }), 35);
  assert.ok(s.coverage < 1 && s.coverage >= 0.6, `kapsama ${s.coverage}`);
  assert.strictEqual(s.parts.find(p => p.key === 'div').score, null);
});

test('kapsama %60 altinda skor null doner + gerekce yazar', () => {
  // F/K ve PD/DD yoksa 4.0+3.0+2.0 = 9/10 aglirlik duser -> kapsama 0.1
  const s = W.screenPreScore(row({ trailingPE: null, priceToBook: null }), 35);
  assert.strictEqual(s.score, null);
  assert.ok(s.reason && s.reason.length > 10, 'gerekce metni yok');
});

test('agirlik sozlesmesi: 4 kriter, toplam 10', () => {
  const s = W.screenPreScore(row(), 35);
  assert.strictEqual(s.parts.length, 4);
  assert.strictEqual(s.parts.reduce((a, p) => a + p.weight, 0), 10);
  // ⚠️ vm baglamindan donen dizide deepStrictEqual KULLANMA (farkli realm, prototip esitlenmez)
  assert.strictEqual(s.parts.map(p => p.key).join(','), 'roe,ey,pb,div');
});

test('bozuk girdi NaN sizdirmaz', () => {
  for (const o of [{ trailingPE: NaN }, { priceToBook: Infinity }, { marketCap: NaN },
                   { dividendYield: NaN }, { avgVolume: Infinity }]) {
    const s = W.screenPreScore(row(o), 35);
    if (s && s.score != null) assert.ok(Number.isFinite(s.score), JSON.stringify(o) + ' -> ' + s.score);
  }
  assert.strictEqual(W.screenPreScore(null, 35), null);
});

// ============================================================
// Siralama / eleme
// ============================================================
test('rank: skora gore siralar, elenenleri sebebiyle sayar', () => {
  const r = W.screenRank([
    row({ symbol: 'IYI', trailingPE: 3.5, priceToBook: 1.3 }),
    row({ symbol: 'ORTA', trailingPE: 12, priceToBook: 2.4 }),
    row({ symbol: 'ZARAR', trailingPE: -3 }),
    row({ symbol: 'KUCUK', marketCap: 1e7 }),
  ], { hurdlePct: 35 });
  assert.strictEqual(r.passed.map(x => x.symbol).join(','), 'IYI,ORTA');
  assert.strictEqual(r.scanned, 4);
  assert.strictEqual(r.dropped, 2);
  assert.strictEqual(r.dropCounts.loss, 1);
  assert.strictEqual(r.dropCounts.small, 1);
});

test('siralama DETERMINISTIK — esit skorda alfabetik, tekrar calistirinca ayni', () => {
  const rows = [row({ symbol: 'ZZZ' }), row({ symbol: 'AAA' }), row({ symbol: 'MMM' })];
  const a = W.screenRank(rows, { hurdlePct: 35 }).passed.map(x => x.symbol);
  const b = W.screenRank(rows.slice().reverse(), { hurdlePct: 35 }).passed.map(x => x.symbol);
  assert.strictEqual(a.join(','), 'AAA,MMM,ZZZ');
  assert.strictEqual(a.join(','), b.join(','), 'girdi sirasi sonucu degistirmemeli');
});

test('rank bos/bozuk girdide patlamaz', () => {
  for (const inp of [[], null, undefined, [null, undefined, {}]]) {
    const r = W.screenRank(inp, { hurdlePct: 35 });
    assert.ok(Array.isArray(r.passed));
  }
});

test('screenSort buffett modunda skorsuzleri EN ALTA atar (iki olcek karismaz)', () => {
  const list = [
    { symbol: 'A', preScore: 90, buffett: { score: 30 } },
    { symbol: 'B', preScore: 50, buffett: { score: 80 } },
    { symbol: 'C', preScore: 95, buffett: { score: null } },
    { symbol: 'D', preScore: 60, buffett: null },
  ];
  assert.strictEqual(W.screenSort(list, 'buffett').map(x => x.symbol).join(','), 'B,A,C,D');
  assert.strictEqual(W.screenSort(list, 'pre').map(x => x.symbol).join(','), 'C,A,D,B');
});

test('screenWeakest en dusuk puanli kriterleri dondurur', () => {
  const bf = { parts: [
    { label: 'ROE', weight: 2, score: 0.9 },
    { label: 'Borc', weight: 2, score: 0.1 },
    { label: 'Marj', weight: 1.5, score: 0.4 },
    { label: 'Yok', weight: 1, score: null },
  ] };
  const w = W.screenWeakest(bf, 2);
  assert.strictEqual(w.length, 2);
  assert.ok(w[0].startsWith('Borc'), w[0]);
  assert.ok(w[1].startsWith('Marj'), w[1]);
  assert.strictEqual(W.screenWeakest(null, 2).length, 0);
});

// ============================================================
// Evren
// ============================================================
test('BIST evreni makul buyuklukte ve sadece gecerli sembol icerir', () => {
  const u = A.evalIn('BIST_UNIVERSE');
  assert.ok(u.length >= 80 && u.length <= 120, `evren ${u.length}`);
  assert.strictEqual(new Set(u).size, u.length, 'tekrar eden sembol var');
  for (const s of u) assert.match(s, /^[A-Z0-9]{3,6}$/, s);
});

test('kullanicinin kendi BIST hisseleri evrene eklenir, worker tavani asilmaz', () => {
  D().watchlist = [
    { symbol: 'XXXTEST', market: 'bist' },   // evrende yok
    { symbol: 'AAPL', market: 'us' },        // BIST degil, girmemeli
    { symbol: 'THYAO', market: 'bist' },     // zaten evrende, tekrar etmemeli
  ];
  const u = W.screenUniverse();
  assert.ok(u.includes('THYAO'));
  assert.ok(!u.includes('AAPL'), 'ABD hissesi BIST taramasina girmemeli');
  assert.strictEqual(new Set(u).size, u.length);
  assert.ok(u.length <= 120, 'worker SCREEN_MAX_SYMBOLS tavani asildi');
  D().watchlist = [];
});

// ============================================================
// DOM render + XSS
// ============================================================
function mount() {
  const old = W.document.getElementById('screenerSection');
  if (old) old.parentNode.removeChild(old);
  W.document.body.insertAdjacentHTML('beforeend', '<section id="screenerSection"></section>');
  return W.document.getElementById('screenerSection');
}

test('tarama yapilmadan once bilgi metni cizilir, satir yok', () => {
  const el = mount();
  D().screen = null;
  W.renderScreener();
  assert.ok(el.innerHTML.includes('BIST temel tarama'));
  assert.strictEqual(W.document.getElementById('scrRows'), null);
});

test('sonuc satirlari cizilir, skor ve Buffett rozeti gorunur', () => {
  const el = mount();
  D().screen = {
    at: Date.now(), hurdlePct: 35, scanned: 100, dropped: 88,
    dropCounts: { loss: 40, illiquid: 48 },
    rows: [
      Object.assign(row({ symbol: 'AAA' }), { preScore: 82, roe: 0.5, turnover: 4e8,
        buffett: { score: 71, label: 'güçlü kalite', weak: ['Borç (0,4/2)'] } }),
      Object.assign(row({ symbol: 'BBB' }), { preScore: 55, roe: 0.2, turnover: 2e8,
        buffett: { score: null, label: 'yetersiz veri', reason: 'mali tablo gelmedi', weak: [] } }),
    ],
  };
  W.renderScreener();
  const h = el.innerHTML;
  assert.ok(h.includes('AAA') && h.includes('BBB'));
  assert.ok(h.includes('82') && h.includes('Buffett 71/100'));
  assert.ok(/Buffett skoru yok/.test(h), '"skor yok" ile "skor dusuk" ayrilmali');
  assert.ok(h.includes('Elenen'), 'elenen dokumu gorunmeli');
});

test('kullanicidan gelen metin KACISLI basilir (XSS)', () => {
  const el = mount();
  D().screen = {
    at: Date.now(), hurdlePct: 35, scanned: 1, dropped: 0, dropCounts: {},
    rows: [Object.assign(row({ symbol: 'XSS', name: '<img src=x onerror=alert(1)>' }),
      { preScore: 60, roe: 0.3, turnover: 1e8,
        buffett: { score: null, label: '<script>bad</script>', reason: '"><b>x', weak: ['<i>w</i>'] } })],
  };
  W.renderScreener();
  assert.strictEqual(el.querySelectorAll('img, script').length, 0, 'ham HTML enjekte oldu');
  assert.ok(el.innerHTML.includes('&lt;img'), 'kacis uygulanmamis');
});

test('AI yorumu kacisli basilir ve satir sonlari korunur', () => {
  const el = mount();
  D().screen = { at: Date.now(), hurdlePct: 35, rows: [
    Object.assign(row(), { preScore: 60, roe: 0.3, turnover: 1e8, buffett: null })],
    comment: 'birinci satir\n<b>ikinci</b>' };
  W.renderScreener();
  const box = W.document.getElementById('scrComment');
  assert.ok(box && box.innerHTML.includes('<br>'), 'satir sonu korunmadi');
  assert.strictEqual(box.querySelectorAll('b').length, 0, 'HTML kacisi yok');
});

test('renderStocks tarama bolumunu de cizer (baglanti kopmasin)', () => {
  assert.match(SRC, /function renderStocks\(\)[\s\S]{0,600}renderScreener\(\)/,
    'renderScreener renderStocks icinden cagrilmiyor');
});

// ============================================================
// Mimari sozlesmeler
// ============================================================
test('tarama motoru AI cagirmiyor — sadece izinli 3 uc nokta', () => {
  // stocks.js zaten borsa uclarina baglaniyor; tarama YENI bir AI ucu ACMAMALI.
  const block = SRC.slice(SRC.indexOf('BIST TEMEL TARAMA'));
  const urls = block.match(/https:\/\/[^'"`\s]+/g) || [];
  for (const u of urls) {
    assert.ok(/\/stock-screen$/.test(u) || /workers\.dev$/.test(u),
      'tarama blogunda beklenmeyen uc nokta: ' + u);
  }
  // skor fonksiyonlarinda fetch olmamali (deterministik olmali)
  for (const fn of ['screenPreScore', 'screenHygiene', 'screenRank', 'screenRoe', 'screenSort']) {
    assert.ok(!/fetch\(/.test(String(W[fn])), fn + ' icinde fetch var — motor deterministik kalmali');
  }
});

test('kademe 2 mevcut buffettScore\'u kullanir, yeni skor motoru yazilmamis', () => {
  assert.match(SRC, /screenDeepStage[\s\S]{0,900}buffettScore\(/);
  assert.strictEqual(typeof W.buffettScore, 'function');
});

test('deep asamada hata sessiz gecmez — kullaniciya "veri alinamadi" yazilir', () => {
  const fn = String(W.screenDeepStage);
  assert.match(fn, /catch[\s\S]{0,200}buffett\s*=\s*\{[\s\S]{0,120}score:\s*null/);
});

test('worker tavani ile PWA tavani ayni', () => {
  assert.match(WK, /SCREEN_MAX_SYMBOLS\s*=\s*120/);
  const lim = A.evalIn('SCREEN_LIMITS');
  assert.strictEqual(lim.maxSymbols, 120);
});

test('engel orani her zaman TRY yazar — setBuffettHurdle() cagirmaz', () => {
  // setBuffettHurdle o an acik olan GRAFIGIN para birimini duzenler. US hissesine
  // bakildiktan sonra tarama esigi degistirilseydi USD esigi degisirdi (sessiz hata).
  const fn = String(W.setScreenHurdle);
  assert.ok(!/setBuffettHurdle\(/.test(fn), 'tarama esigi grafik esigine bagli kalmis');
  assert.match(fn, /buffettHurdle\('TRY'\)/);
  assert.match(fn, /buffettHurdle\.TRY = n/);
  // esik degisince on skorlar yeniden hesaplanmali, Buffett skoru DOKUNULMAZ
  assert.match(fn, /screenPreScore\(row, n\)/);
  assert.ok(!/buffettScore\(/.test(fn), 'esik degisince Buffett skoru yeniden hesaplanmamali');
});

test('elenme sebeplerinin hepsinin Turkce etiketi var', () => {
  const labels = A.evalIn('SCREEN_DROP_LABELS');
  for (const k of ['nodata', 'loss', 'nobook', 'small', 'illiquid', 'expensive', 'rich']) {
    assert.ok(labels[k] && labels[k].length > 3, 'etiket yok: ' + k);
  }
});

// ============================================================
// Worker sozlesmesi
// ============================================================
test('worker /stock-screen rotasi kayitli ve auth ariyor', () => {
  assert.match(WK, /url\.pathname === '\/stock-screen'/);
  const fn = WK.slice(WK.indexOf('async function handleStockScreenApi'),
    WK.indexOf('async function screenCommentReply'));
  assert.match(fn, /verifyUser\(env, userToken\)/);
  assert.match(fn, /unauthorized/);
});

test('worker HIC eleme/siralama yapmiyor — sayiyi PWA hesaplar', () => {
  const fn = WK.slice(WK.indexOf('const SCREEN_MAX_SYMBOLS'), WK.indexOf('async function screenCommentReply'));
  // yorum satirlari mimariyi ANLATIYOR, kod degil — ayikla
  const code = fn.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/\.sort\(/.test(code), 'worker siralama yapiyor');
  assert.ok(!/preScore|buffettScore|screenPreScore/.test(code), 'worker skor hesapliyor');
});

test('temettu verimi her zaman ORANA cevrilir (yuzde/oran karisikligi)', () => {
  const fn = WK.slice(WK.indexOf('function screenDivYield'), WK.indexOf('function screenNum'));
  assert.match(fn, /v > 1 \? v \/ 100 : v/);
  assert.match(fn, /f > 0 && f < 1/, 'olcek disi deger reddedilmeli');
});

test('AI yorumu sadece kullanici tetiklerse ve sahibe kilitli (maliyet)', () => {
  const fn = WK.slice(WK.indexOf('async function handleStockScreenApi'),
    WK.indexOf('async function screenCommentReply'));
  assert.match(fn, /if \(body\.comment\)[\s\S]{0,200}allowUser\(env, user\)/);
  assert.match(WK.slice(WK.indexOf('async function screenCommentReply')),
    /aiTierForUser\(env, user, 'heavy'\)/);
});

test('AI prompt yasaklari: tavsiye, siralama, deger yargisi, uydurma sayi', () => {
  const fnStart = WK.indexOf('async function screenCommentReply');
  const pStart = WK.indexOf('const sysPrompt =', fnStart);
  const p = WK.slice(pStart, WK.indexOf('const userMsg =', pStart));
  assert.match(p, /MUTLAK YASAK/);
  for (const kural of ['AL / SAT / TUT', 'yeniden sıralama', 'UYDURMA', 'İngilizce']) {
    assert.ok(p.includes(kural), 'prompt kurali eksik: ' + kural);
  }
  assert.match(p, /"Alınacak hisse listesi" DEĞİLDİR/, 'liste bir alim listesi degildir uyarisi promptta yok');
  // Filtrenin sinirlari kullaniciya ogretilmeli
  assert.match(p, /enflasyon muhasebesi/);
  assert.match(p, /tek yıllıktır/);
});

test('AI prompt kullanici talimatlarini SONDA aliyor (guvenlik sirasi)', () => {
  assert.match(WK.slice(WK.indexOf('async function screenCommentReply')),
    /content: sysPrompt \+ instructionsBlock\(body\.instructions\)/);
});

// ============================================================
// Arayuz dururlugu + Impeccable
// ============================================================
test('UI kullaniciya "bu bir alim listesi degil" diyor', () => {
  const el = mount();
  D().screen = null;
  W.renderScreener();
  assert.match(el.innerHTML, /alım listesi değildir/);
  assert.match(el.innerHTML, /ROE\* = PD\/DD ÷ F\/K/);
});

test('Impeccable: yan-serit yok, gradient yok, glass yok, reduced-motion var', () => {
  const css = readText('styles.css');
  const blk = css.slice(css.indexOf('BIST TEMEL TARAMA'));
  assert.ok(blk.length > 500, 'tarama CSS blogu bulunamadi');
  assert.ok(!/border-left:\s*[2-9]/.test(blk), 'yan-serit kenarlik yasak');
  assert.ok(!/border-right:\s*[2-9]/.test(blk), 'yan-serit kenarlik yasak');
  assert.ok(!/linear-gradient|radial-gradient/.test(blk), 'gradient yasak');
  assert.ok(!/backdrop-filter/.test(blk), 'glassmorphism yasak');
  assert.ok(!/#fff\b|#ffffff\b|#000\b|#000000\b/i.test(blk), 'saf siyah/beyaz yasak');
  assert.ok(/prefers-reduced-motion/.test(blk), 'reduced-motion alternatifi yok');
  assert.ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(blk), 'ease-out egrisi kullanilmali');
});

test('styles.css LF, stocks.js ve worker.js CRLF kalmis', () => {
  const css = readRaw('styles.css');
  assert.ok(!css.includes(Buffer.from('\r\n')), 'styles.css CRLF sizmis');
  for (const f of ['stocks.js', 'aidan-worker/worker.js', 'asistan.html']) {
    const b = readRaw(f);
    const lf = (b.toString('binary').match(/\n/g) || []).length;
    const crlf = (b.toString('binary').match(/\r\n/g) || []).length;
    assert.strictEqual(lf, crlf, f + ' EOL karismis');
  }
});

test('yeni dosya yok — tarama stocks.js icinde, deploy zinciri degismedi', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '..');
  assert.ok(!fs.existsSync(path.join(root, 'screener.js')),
    'ayri dosya olusturulmus — sw.js/deploy.py/Actions paths guncellenmeli');
  assert.ok(readText('sw.js').includes('stocks.js'), 'stocks.js SW cache listesinde olmali');
});
