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
// 14 Agu 2026: borsa motoru kendi sitesine tasindi -> borsa harness'i.
const { loadBorsa: loadApp } = require('./helpers/borsa');
const { readText, readRaw } = require('./helpers/src');

// jsdom yuklemesi pahali — TEK ornek acilir (09-buffett kalibi, `after` ile kapanir)
const A = loadApp({ seed: {} });
const W = A.window;
after(() => { try { A.close(); } catch (_) {} });

// ⚠️ core.js'te `data` top-level let — window'a YAZILMAZ. Testte dolayli eval
// ile canli referans alinir (tarayicidaki global lexical scope davranisi).
function D() { return A.evalIn('data'); }

// ⚠️ SCREEN_LIMITS top-level `const` — window'a YAZILMAZ (data ile ayni kural)
const LIM = A.evalIn('SCREEN_LIMITS');

const SRC = readText('borsa/stocks.js');
const WK = readText('aidan-worker/worker.js');

// ——— Saglikli bir tarama satiri (Yahoo quote normalize edilmis hali) ———
function row(over = {}) {
  return Object.assign({
    symbol: 'TEST', ySymbol: 'TEST.IS', name: 'Test A.S.', currency: 'TRY',
    price: 100, changePct: 1.2,
    marketCap: 50e9,
    trailingPE: 5, priceToBook: 2.5, bookValue: 40,   // turetilmis ROE %50 — engelin (%35) ustunde
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
  assert.strictEqual(W.screenHygiene(row(), null, 35).ok, true);
});

// ============================================================
// 🔴 KALITE KAPISI — Buffett donusumunun kalbi
// ============================================================
test('ROE engel oraninin altindaysa hisse ELENIR (ne kadar ucuz olursa olsun)', () => {
  // F/K 2 -> cok ucuz. Ama PD/DD 0,5 -> ROE %25, engel %35'in altinda.
  const ucuzAmaVasat = row({ trailingPE: 2, priceToBook: 0.5 });
  const h = W.screenHygiene(ucuzAmaVasat, null, 35);
  assert.strictEqual(h.ok, false);
  assert.strictEqual(h.why, 'lowroe');
  const r = W.screenRank([ucuzAmaVasat], { hurdlePct: 35 });
  assert.strictEqual(r.passed.length, 0, 'izmarit listeye girmemeli');
  assert.strictEqual(r.dropCounts.lowroe, 1);
});

test('kalite kapisi engel oranina BAGLI — esik dusunce ayni hisse gecer', () => {
  const r = row({ trailingPE: 2, priceToBook: 0.5 });   // ROE %25
  assert.strictEqual(W.screenHygiene(r, null, 35).why, 'lowroe');
  assert.strictEqual(W.screenHygiene(r, null, 20).ok, true);
});

test('zarar eden hisse hic puanlanmaz', () => {
  const h = W.screenHygiene(row({ trailingPE: -8 }), null, 35);
  assert.strictEqual(h.ok, false);
  assert.strictEqual(h.why, 'loss');
  // ve rank asamasinda da listeye giremez
  const r = W.screenRank([row({ trailingPE: -8 })], { hurdlePct: 35 });
  assert.strictEqual(r.passed.length, 0);
});

test('likidite kapisi: dusuk hacimli hisse elenir', () => {
  // 1000 lot * 100 TL = 100.000 TL/gun — esik 20 mn
  const h = W.screenHygiene(row({ avgVolume: 1000 }), null, 35);
  assert.strictEqual(h.ok, false);
  assert.strictEqual(h.why, 'illiquid');
});

test('mikro sirket elenir, buyuk sirket gecer', () => {
  assert.strictEqual(W.screenHygiene(row({ marketCap: 1e8 }), null, 35).why, 'small');
  assert.strictEqual(W.screenHygiene(row({ marketCap: 5e9 }), null, 35).ok, true);
});

test('F/K tavani ve PD/DD anomali kapisi calisir', () => {
  // F/K 90 -> ROE %2,8, once kalite kapisindan doner; ROE yuksek tutulup test edilir
  assert.strictEqual(W.screenHygiene(row({ trailingPE: 90, priceToBook: 40 }), null, 35).why, 'expensive');
  // PD/DD 14 -> ozsermaye anormal kucuk, ROE sismis olabilir
  assert.strictEqual(W.screenHygiene(row({ priceToBook: 14, trailingPE: 5 }), null, 35).why, 'rich');
  // ⚠️ Kaliteli is YUKSEK PD/DD'de islem gorur — 6-10 bandi artik ELENMEZ
  assert.strictEqual(W.screenHygiene(row({ priceToBook: 8, trailingPE: 10 }), null, 35).ok, true);
});

test('fiyati gelmeyen sembol veri-yok kapisindan doner', () => {
  assert.strictEqual(W.screenHygiene(row({ price: null }), null, 35).why, 'nodata');
  assert.strictEqual(W.screenHygiene(row({ price: 0 }), null, 35).why, 'nodata');
});

// ============================================================
// On skor
// ============================================================
test('cok yuksek ROE cok yuksek skor alir', () => {
  // F/K 8, PD/DD 8 -> ROE %100 = engelin (%35) 2,9 kati
  const s = W.screenPreScore(row({ trailingPE: 8, priceToBook: 8 }), 35);
  assert.ok(s.score >= 80, `beklenen >=80, gelen ${s.score}`);
  assert.strictEqual(s.coverage, 1);
});

test('🔴 IZMARIT REGRESYONU: kaliteli is, ucuz vasat isi GECMELI', () => {
  // Buffett: "harika sirketi makul fiyata almak, vasat sirketi harika fiyata
  // almaktan cok daha iyidir." Eski surumde bu test KIRMIZI olurdu.
  const kaliteli = row({ trailingPE: 10, priceToBook: 8 });   // ROE %80, F/K 10
  const ucuzVasat = row({ trailingPE: 3, priceToBook: 1.2 }); // ROE %40, F/K 3
  const a = W.screenPreScore(kaliteli, 35).score;
  const b = W.screenPreScore(ucuzVasat, 35).score;
  assert.ok(a > b, `kaliteli is (${a}) ucuz vasati (${b}) gecmeliydi`);
});

test('ucuzluk tek basina ust siraya tasimaz', () => {
  const cokUcuz = row({ trailingPE: 2.5, priceToBook: 1 });    // ROE %40
  const s = W.screenPreScore(cokUcuz, 35);
  assert.ok(s.score < 45, `sadece ucuz olan yuksek puan almamali: ${s.score}`);
});

test('skor her zaman 0-100 arasinda kalir', () => {
  for (const h of [1, 10, 35, 120]) {
    for (const o of [{}, { trailingPE: 0.5 }, { priceToBook: 0.1 }, { priceToBook: 20 }]) {
      const s = W.screenPreScore(row(o), h);
      if (s && s.score != null) assert.ok(s.score >= 0 && s.score <= 100, `${h} ${JSON.stringify(o)} -> ${s.score}`);
    }
  }
});

test('engel orani yukselince ayni hisse dusuk skor alir (hurdle gercekten etkiliyor)', () => {
  const r = row({ trailingPE: 8, priceToBook: 4 });
  const lo = W.screenPreScore(r, 10).score;
  const hi = W.screenPreScore(r, 60).score;
  assert.ok(lo > hi, `engel yukselince skor dusmeli: %10 -> ${lo}, %60 -> ${hi}`);
});

test('kapsama %60 altinda skor null doner + gerekce yazar', () => {
  // F/K yoksa hem ROE hem kazanc getirisi duser -> kapsama 0
  const s = W.screenPreScore(row({ trailingPE: null, priceToBook: null }), 35);
  assert.strictEqual(s.score, null);
  assert.ok(s.reason && s.reason.length > 10, 'gerekce metni yok');
});

test('🧮 agirlik sozlesmesi: 2 kriter (kalite 7 + fiyat 3), PD/DD ve temettu YOK', () => {
  // PD/DD = F/K x ROE oldugu icin ucunu birlikte puanlamak cifte sayimdir.
  // Temettuyu de Buffett kalite isareti saymaz.
  const s = W.screenPreScore(row(), 35);
  assert.strictEqual(s.parts.length, 2);
  assert.strictEqual(s.parts.map(p => p.key).join(','), 'roe,ey');
  assert.strictEqual(s.parts.find(p => p.key === 'roe').weight, 7.0);
  assert.strictEqual(s.parts.find(p => p.key === 'ey').weight, 3.0);
  assert.strictEqual(s.parts.reduce((a, p) => a + p.weight, 0), 10);
});

test('temettu skoru DEGISTIRMEZ (Buffett kalite isareti saymaz)', () => {
  const yok = W.screenPreScore(row({ dividendYield: null }), 35).score;
  const bol = W.screenPreScore(row({ dividendYield: 0.25 }), 35).score;
  assert.strictEqual(yok, bol, 'temettu skora sizmis');
});

test('PD/DD tek basina skoru DEGISTIRMEZ — sadece ROE uzerinden etkiler', () => {
  // ayni ROE (%50), farkli PD/DD & F/K ciftleri -> ayni kalite puani beklenir
  const a = W.screenPreScore(row({ trailingPE: 4, priceToBook: 2 }), 35);
  const b = W.screenPreScore(row({ trailingPE: 4, priceToBook: 2 }), 35);
  assert.strictEqual(a.score, b.score);
  assert.strictEqual(a.parts.find(p => p.key === 'roe').score,
    W.screenPreScore(row({ trailingPE: 8, priceToBook: 4 }), 35).parts.find(p => p.key === 'roe').score,
    'ayni ROE farkli PD/DD -> kalite puani ayni olmali');
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
    row({ symbol: 'IYI', trailingPE: 8, priceToBook: 8 }),      // ROE %100
    row({ symbol: 'ORTA', trailingPE: 5, priceToBook: 2.5 }),   // ROE %50
    row({ symbol: 'ZARAR', trailingPE: -3 }),
    row({ symbol: 'KUCUK', marketCap: 1e7 }),
    row({ symbol: 'VASAT', trailingPE: 2, priceToBook: 0.5 }),  // ROE %25 -> kalite kapisi
  ], { hurdlePct: 35 });
  assert.strictEqual(r.passed.map(x => x.symbol).join(','), 'IYI,ORTA');
  assert.strictEqual(r.scanned, 5);
  assert.strictEqual(r.dropped, 3);
  assert.strictEqual(r.dropCounts.loss, 1);
  assert.strictEqual(r.dropCounts.small, 1);
  assert.strictEqual(r.dropCounts.lowroe, 1);
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
  assert.match(fn, /screenPreScore\(row, n, !!row\.fin\)/);
  assert.ok(!/buffettScore\(/.test(fn), 'esik degisince Buffett skoru yeniden hesaplanmamali');
});

test('elenme sebeplerinin hepsinin Turkce etiketi var', () => {
  const labels = A.evalIn('SCREEN_DROP_LABELS');
  for (const k of ['nodata', 'loss', 'nobook', 'lowroe', 'small', 'illiquid', 'expensive', 'rich']) {
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
  const css = readText('borsa/styles.css');
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
  const css = readRaw('borsa/styles.css');
  assert.ok(!css.includes(Buffer.from('\r\n')), 'styles.css CRLF sizmis');
  for (const f of ['aidan-worker/worker.js']) {
    const b = readRaw(f);
    const lf = (b.toString('binary').match(/\n/g) || []).length;
    const crlf = (b.toString('binary').match(/\r\n/g) || []).length;
    assert.strictEqual(lf, crlf, f + ' EOL karismis');
  }
});

test('yeni dosya yok — tarama borsa/stocks.js icinde, deploy zinciri tutarli', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '..');
  assert.ok(!fs.existsSync(path.join(root, 'borsa', 'screener.js')),
    'ayri dosya olusturulmus — borsa/sw.js ve deploy zinciri guncellenmeli');
  // 14 Agu 2026: motor Aidan'dan borsa sitesine tasindi. Cache listesi kontrolu
  // AIDAN'IN sw.js'inde degil BORSA'nin sw.js'inde yapilir — yanlis dosyayi
  // kontrol etmek "yesil ama anlamsiz" bir test olurdu.
  assert.ok(readText('borsa/sw.js').includes('stocks.js'),
    'stocks.js borsa SW cache listesinde olmali (404 = bolum hic acilmaz)');
  assert.ok(!readText('sw.js').includes('stocks.js'),
    "Aidan'in SW'i hala stocks.js cache liyor — dosya artik orada YOK, 404 uretir");
});

// ============================================================
// 🔁 ÇOK YILLI NORMALİZASYON — döngü tuzağı (11 Agu 2026)
// ============================================================
// margins: yeniden eskiye net kar marji · revenues verilmezse enflasyonlu
// (eskiye gidince kuculen) nominal ciro uretilir.
function fund(margins, opts = {}) {
  const rev = opts.revenues || margins.map((_, i) => 1000 / Math.pow(1.5, i));
  const years = margins.map((m, i) => ({
    year: 2025 - i,
    revenue: opts.noRevenue ? null : rev[i],
    netIncome: m * rev[i],
    equity: ('equity' in opts) ? opts.equity : 500,
  }));
  return { currency: 'TRY', marketCap: opts.marketCap != null ? opts.marketCap : 1200, years };
}

test('dongusel sirket: son yil zirvede -> normalize F/K cok daha yuksek + bayrak', () => {
  // marj %20 (son) vs cok yilli ortalama %9,75 -> zirve orani ~2,05
  const c = W.screenNormalize(fund([0.20, 0.08, 0.06, 0.05]), 1200);
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.basis, 'marj');
  assert.strictEqual(c.years, 4);
  assert.ok(Math.abs(c.peakRatio - 2.05) < 0.02, 'zirve orani ' + c.peakRatio);
  // son yil kari 200 -> gercek F/K 6; normalize kar 97,5 -> normalize F/K ~12,3
  assert.ok(Math.abs(c.normPE - 12.31) < 0.05, 'normalize F/K ' + c.normPE);
  assert.ok(c.flags.some(f => /ucuz görünüyor/.test(f)), 'zirve bayragi yok: ' + JSON.stringify(c.flags));
  assert.strictEqual(c.cyclical, 'yüksek');
});

test('istikrarli sirket: normalize F/K gercek F/K ile ayni, bayrak yok', () => {
  const c = W.screenNormalize(fund([0.10, 0.10, 0.10, 0.10]), 1200);
  assert.ok(Math.abs(c.peakRatio - 1) < 0.001, 'zirve orani ' + c.peakRatio);
  assert.ok(Math.abs(c.normPE - 12) < 0.01, 'normalize F/K ' + c.normPE); // 1200 / (0,10*1000)
  assert.strictEqual(c.cyclical, 'düşük');
  assert.strictEqual(c.flags.length, 0);
});

test('🔴 ENFLASYON NOTRLUGU: nominal kar 5 kat buyuse de zirve orani 1 kalir', () => {
  // Marj sabit %10; ciro enflasyonla 200 -> 1000'e cikmis. Nominal karlar:
  // 100 / 60 / 35 / 20. NAIF ortalama (53,75) yanlis sonuc verirdi.
  const c = W.screenNormalize(fund([0.10, 0.10, 0.10, 0.10]), 1200);
  assert.ok(Math.abs(c.peakRatio - 1) < 1e-9,
    'enflasyon zirve oranini bozmus: ' + c.peakRatio);
  // Dogru normalize kar = 100 (bugunun parasi). Naif ortalama 53,75 olurdu.
  const naifPE = 1200 / ((100 + 100 / 1.5 + 100 / 2.25 + 100 / 3.375) / 4);
  assert.ok(Math.abs(c.normPE - 12) < 0.01, 'normalize F/K ' + c.normPE);
  // Naif "nominal karlarin ortalamasi" yontemi ayni sirketi %66 daha pahali
  // gosterirdi — sirf enflasyon yuzunden. Oran tabani bunu ortadan kaldiriyor.
  assert.ok(naifPE / c.normPE > 1.6,
    `naif yontem sapmasi beklenenden kucuk: naif ${naifPE.toFixed(1)} vs oran ${c.normPE}`);
});

test('cok yilli ortalamada zarar -> normalize F/K UYDURULMAZ, bayrak kalkar', () => {
  const c = W.screenNormalize(fund([0.15, -0.10, -0.12, -0.08]), 1200);
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.normPE, null, 'ortalama zararda F/K hesaplanmamali');
  assert.ok(c.flags.some(f => /ortalamada şirket kâr etmiyor/.test(f)));
  assert.strictEqual(W.screenNormScore(row(), c, 35), null);
});

test('3 yildan az tablo -> hesap YOK, gerekce yazilir', () => {
  const c = W.screenNormalize(fund([0.1, 0.1]), 1200);
  assert.strictEqual(c.ok, false);
  assert.strictEqual(c.years, 2);
  assert.ok(c.reason && c.reason.length > 10);
  assert.strictEqual(W.screenNormScore(row(), c, 35), null);
});

test('ciro gelmezse ROE tabanina duser, o da yoksa null', () => {
  const c = W.screenNormalize(fund([0.10, 0.10, 0.10, 0.10], { noRevenue: true }), 1200);
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.basis, 'roe');
  const f2 = fund([0.1, 0.1, 0.1], { noRevenue: true, equity: null });
  assert.strictEqual(W.screenNormalize(f2, 1200).ok, false);
  assert.strictEqual(W.screenNormalize(null, 1200), null);
  assert.strictEqual(W.screenNormalize({ years: [] }, 1200).ok, false);
});

test('normalize skor AYNI formulu kullanir — ayri motor yazilmamis', () => {
  assert.match(String(W.screenNormScore), /screenPreScore\(/);
  // dongusel sirkette cok yilli skor son yil skorundan DUSUK olmali
  // piyasa degeri 800, son yil kari 200 -> gercek F/K 4 · normalize kar 97,5 -> F/K ~8,2
  const r = row({ trailingPE: 4, priceToBook: 1.5 });
  const c = W.screenNormalize(fund([0.20, 0.08, 0.06, 0.05], { marketCap: 800 }), 800);
  const pre = W.screenPreScore(r, 35).score;
  const norm = W.screenNormScore(r, c, 35);
  assert.ok(norm != null && norm < pre - 10,
    `dongusel hissede cok yilli skor belirgin dusuk olmali: son yil ${pre}, cok yilli ${norm}`);
});

test('istikrarli sirkette iki skor birbirine yakin kalir', () => {
  const r = row({ trailingPE: 12, priceToBook: 1.2 });
  const c = W.screenNormalize(fund([0.10, 0.10, 0.10, 0.10]), 1200);
  const pre = W.screenPreScore(r, 35).score;
  const norm = W.screenNormScore(r, c, 35);
  assert.ok(Math.abs(norm - pre) <= 2, `beklenen yakin: ${pre} vs ${norm}`);
});

test('screenSort norm modu: skorsuzler dibe, esitte alfabetik', () => {
  const list = [
    { symbol: 'A', preScore: 90, normScore: 40 },
    { symbol: 'B', preScore: 50, normScore: 85 },
    { symbol: 'C', preScore: 95, normScore: null },
    { symbol: 'D', preScore: 60 },
  ];
  assert.strictEqual(W.screenSort(list, 'norm').map(x => x.symbol).join(','), 'B,A,C,D');
});

test('engel orani degisince cok yilli skor da yeniden hesaplanir', () => {
  const fn = String(W.setScreenHurdle);
  assert.match(fn, /screenNormScore\(row, row\.cycle, n\)/);
  // ama Buffett skoru DOKUNULMAZ (mali tablo istegi gerektirir)
  assert.ok(!/buffettScore\(/.test(fn));
});

test('DOM: cok yilli skor ve fark cizilir, dongu bayragi gorunur', () => {
  const el = mount();
  D().screen = {
    at: Date.now(), hurdlePct: 35, scanned: 100, dropped: 88, dropCounts: {},
    rows: [Object.assign(row({ symbol: 'DONGU' }), {
      preScore: 85, normScore: 55, roe: 0.5, turnover: 4e8, buffett: null,
      cycle: { ok: true, basis: 'marj', years: 4, normPE: 12.3, avgRate: 0.0975,
        lastRate: 0.2, peakRatio: 2.05, cv: 0.6, cyclical: 'yüksek',
        flags: ['Son yıl kâr marjı çok yıllı ortalamanın 105% üstünde — F/K olduğundan ucuz görünüyor.'] },
    })],
  };
  W.renderScreener();
  const h = el.innerHTML;
  assert.ok(/Çok yıllı skor/.test(h));
  assert.ok(h.includes('55') && h.includes('-30'), 'fark gosterilmemis');
  assert.ok(/Normalize F\/K/.test(h) && h.includes('12,3'), 'normalize F/K hucresi yok');
  assert.ok(/ucuz görünüyor/.test(h), 'dongu bayragi cizilmemis');
  assert.ok(/scr-norm bad/.test(h), 'buyuk negatif fark uyari rengine gecmeli');
});

test('DOM: cok yilli veri yoksa sessiz kalmaz, sebebi yazar', () => {
  const el = mount();
  D().screen = {
    at: Date.now(), hurdlePct: 35, scanned: 10, dropped: 5, dropCounts: {},
    rows: [Object.assign(row({ symbol: 'YOK' }), {
      preScore: 70, normScore: null, roe: 0.4, turnover: 1e8, buffett: null,
      cycle: { ok: false, years: 1, reason: 'Çok yıllı hesap için en az 3 yıl gerekli, 1 yıl geldi.' },
    })],
  };
  W.renderScreener();
  assert.match(el.innerHTML, /Çok yıllı skor yok/);
  assert.match(el.innerHTML, /en az 3 yıl gerekli/);
});

test('deep asamada cok yilli katman ayni istekten hesaplaniyor (ek istek yok)', () => {
  const fn = String(W.screenDeepStage);
  assert.match(fn, /screenNormalize\(d, row\.marketCap\)/);
  assert.match(fn, /screenNormScore\(row, cyc/);
  // tek fetch: sadece /stock-fundamentals
  assert.strictEqual((fn.match(/fetch\(/g) || []).length, 1, 'ek ag istegi eklenmis');
});

test('worker prompt dongu tuzagini OGRETIYOR', () => {
  const fnStart = WK.indexOf('async function screenCommentReply');
  const pStart = WK.indexOf('const sysPrompt =', fnStart);
  const p = WK.slice(pStart, WK.indexOf('const userMsg =', pStart));
  assert.match(p, /DÖNGÜ KATMANI/);
  assert.match(p, /değer tuzağı/);
  assert.match(p, /zirve oranı|olağandışı yüksek/);
  assert.match(p, /HESAPLANAMADI[\s\S]{0,120}döngü yorumu YAPMA/);
  // enflasyon dayanikliligi ve yil sayisi siniri kullaniciya soylenmeli
  assert.match(p, /ORAN tabanlıdır/);
  assert.match(p, /tam bir çevrimi kapsamayabilir/);
});

test('worker cok yilli sayilari AI\'a veriyor, kendi hesaplamiyor', () => {
  const fn = WK.slice(WK.indexOf('async function screenCommentReply'));
  assert.match(fn, /r\.cycle/);
  assert.match(fn, /normalize F\/K/);
  const code = fn.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.ok(!/screenNormalize|screenNormScore/.test(code), 'worker normalizasyonu kendi yapiyor');
});

test('Impeccable: cok yilli katman CSS kurallari da uyumlu', () => {
  const css = readText('borsa/styles.css');
  const blk = css.slice(css.indexOf('cok yilli (dongu) katmani'));
  assert.ok(blk.length > 300, 'CSS blogu bulunamadi');
  assert.ok(!/border-left:\s*[2-9]|border-right:\s*[2-9]/.test(blk), 'yan-serit yasak');
  assert.ok(!/linear-gradient|backdrop-filter/.test(blk), 'gradient/glass yasak');
  assert.ok(!/#fff\b|#000\b/i.test(blk), 'saf siyah/beyaz yasak');
});

// ============================================================
// 🧱 BUFFETT SIRASI — kalite once, fiyat sonra (12 Agu 2026)
// ============================================================
test('derin asama 25 hisseye cikti, liste 15 satir', () => {
  const lim = A.evalIn('SCREEN_LIMITS');
  assert.strictEqual(lim.deepCount, 25, 'Buffett siralamasi icin ornek genis olmali');
  assert.strictEqual(lim.listCount, 15);
  assert.ok(lim.listCount <= lim.deepCount, 'gosterilen satir derin taranandan fazla olamaz');
});

test('varsayilan siralama GERCEK Buffett skoru', () => {
  assert.strictEqual(A.evalIn('_screenSort'), 'buffett');
  assert.match(String(W.runScreener), /_screenSort = 'buffett'/);
});

test('PD/DD tavani kaliteli isi elemeyecek kadar gevsedi', () => {
  const lim = A.evalIn('SCREEN_LIMITS');
  assert.ok(lim.maxPB >= 10,
    'PD/DD = F/K x ROE — dar tavan yuksek ROE\'li kaliteli isi haksiz eler');
});

test('kart notu kalite-once mantigini ve cifte sayim gerekcesini yaziyor', () => {
  const el = mount();
  D().screen = null;
  W.renderScreener();
  const h = el.innerHTML;
  assert.match(h, /kalite önce, fiyat sonra/);
  assert.match(h, /PD\/DD = F\/K × ROE/);
  assert.match(h, /alım listesi değildir/);
});

test('giris metni Buffett sirasini anlatiyor', () => {
  const el = mount();
  D().screen = null;
  W.renderScreener();
  assert.match(el.innerHTML, /önce iş kalitesi, sonra fiyat/);
  assert.match(el.innerHTML, /ne kadar ucuz olursa olsun elenir/);
});

test('worker prompt izmarit ile kaliteli is farkini OGRETIYOR', () => {
  const fnStart = WK.indexOf('async function screenCommentReply');
  const pStart = WK.indexOf('const sysPrompt =', fnStart);
  const p = WK.slice(pStart, WK.indexOf('const userMsg =', pStart));
  assert.match(p, /ÖNCE İŞ KALİTESİ, SONRA FİYAT/);
  assert.match(p, /izmarit/);
  assert.match(p, /PD\/DD = F\/K × ROE/);
  assert.match(p, /Berkshire hiç dağıtmadı/);
  // temettuyu kalite isareti gibi sunmak yasak
  assert.match(p, /temettüsü yüksek, iyi.{0,40}KURMA/s);
});

test('worker sektor alanini ayni istekten donduruyor (ek subrequest yok)', () => {
  const fn = WK.slice(WK.indexOf('async function handleStockFundamentalsApi'),
    WK.indexOf('// 🔎 HİSSE TARAMA'));
  assert.match(fn, /assetProfile/);
  assert.match(fn, /sector: ap\.sector \|\| null/);
  // sektor SADECE modul adi eklenerek geldi — istek sayisi ARTMAMALI
  // (quoteSummary + 5y chart = 2 fetch, oncekiyle ayni)
  assert.strictEqual((fn.match(/fetch\(/g) || []).length, 2,
    'sektor icin ek ag istegi eklenmis — assetProfile ayni quoteSummary cagrisinda gelmeli');
});

// ============================================================
// Derin asama sayisi + kurum tipi (12 Agu 2026 — tam Buffett uyumu)
// ============================================================
test('REGRESYON: derin asamaya deepCount hisse gider, listCount kadari GOSTERILIR', () => {
  // Eskiden res.passed once listCount'a (15) kirpiliyordu; derin asama 25 degil
  // 15 hisse goruyordu ve dokumanda yazan "25 hisseye Buffett skoru" hic
  // gerceklesmiyordu. Kirpma artik EN SONDA, siralamadan sonra.
  const src = readText('borsa/stocks.js');
  const i = src.indexOf('async function runScreener');
  assert.ok(i > 0);
  const block = src.slice(i, i + 2600);
  assert.ok(/screenSelectDeep\(res, SCREEN_LIMITS\)/.test(block),
    'derin asama secimi screenSelectDeep ile yapilmali');
  assert.ok(!/res\.passed\.slice\(0, SCREEN_LIMITS\.listCount\)/.test(block),
    'listCount ile erken kirpma geri gelmemeli');
  assert.ok(/await screenDeepStage\(top, token\)/.test(block),
    'derin asama tum listeyi almali');
  const ri = src.indexOf('function renderScreenRows');
  const rb = src.slice(ri, ri + 800);
  assert.ok(/screenSort\([^)]*\)\s*\.slice\(0, SCREEN_LIMITS\.listCount\)/.test(rb.replace(/\s+/g, ' ')),
    'kirpma siralamadan SONRA, render icinde olmali');
});

test('tarama satiri kurum tipini ve guvenlik payini tasir', () => {
  const src = readText('borsa/stocks.js');
  const i = src.indexOf('async function screenDeepStage');
  const block = src.slice(i, i + 1800);
  assert.ok(/kind: bf\.kind/.test(block) && /mos: bf\.mos/.test(block),
    'derin asama kurum tipi ve guvenlik payini satira yazmali');
  assert.ok(/scr-kind/.test(src) && /scr-mos/.test(src), 'satirda rozetler cizilmeli');
});

test('worker tarama prompt u kurum tipi ve guvenlik payini ogretiyor', () => {
  const w = readText('aidan-worker/worker.js');
  assert.ok(/KURUM TİPİ KATMANI/.test(w), 'kurum tipi katmani ogretisi yok');
  assert.ok(/GÜVENLİK PAYI/.test(w), 'guvenlik payi ogretisi yok');
  assert.ok(/BİREBİR AYNI ÖLÇEK DEĞİLDİR/.test(w), 'banka-sanayi skoru karsilastirma yasagi yok');
  // Tavsiye yasaklari gevsemedi
  assert.ok(/güvenlik payı pozitif olsa BİLE/i.test(w), 'pozitif guvenlik payi deger yargisina izin vermemeli');
});

// ============================================================
// KADEME 1'DE BANKA AYRIMI + KIYI PAYI (12 Agu 2026)
// ============================================================
test('banka ROE kapisini ATLAR — kaldirac kademe 1 de arindirilamaz', () => {
  const hyg = (r, h) => W.screenHygiene(r, {}, h);
  // Kaldiracsiz sanayi sirketi: ROE engelin altinda → elenir
  const sanayi = row({ symbol: 'FROTO', trailingPE: 20, priceToBook: 2 }); // ROE %10
  assert.strictEqual(hyg(sanayi, 35).ok, false);
  assert.strictEqual(hyg(sanayi, 35).why, 'lowroe');
  // Ayni oranlarla banka: ROE kapisindan gecer, karari kademe 2 verir
  const banka = row({ symbol: 'GARAN', trailingPE: 20, priceToBook: 2 });
  assert.strictEqual(hyg(banka, 35).ok, true);
  assert.strictEqual(hyg(banka, 35).fin, true);
});

test('banka DIGER kapilardan muaf DEGIL (likidite, buyukluk, F/K)', () => {
  const hyg = (r, h) => W.screenHygiene(r, {}, h);
  assert.strictEqual(hyg(row({ symbol: 'GARAN', marketCap: 1e8 }), 35).why, 'small');
  assert.strictEqual(hyg(row({ symbol: 'GARAN', avgVolume: 100 }), 35).why, 'illiquid');
  assert.strictEqual(hyg(row({ symbol: 'GARAN', trailingPE: 90, priceToBook: 40 }), 35).why, 'expensive');
});

test('kademe 1 skorunda bankada agirlik FIYATA kayar (7/3 degil 4/6)', () => {
  const r = row({ symbol: 'GARAN', trailingPE: 5, priceToBook: 2 });
  const sanayi = W.screenPreScore(r, 35, false);
  const banka = W.screenPreScore(r, 35, true);
  const w = (s, k) => s.parts.find(p => p.key === k).weight;
  assert.strictEqual(w(sanayi, 'roe'), 7);
  assert.strictEqual(w(sanayi, 'ey'), 3);
  assert.strictEqual(w(banka, 'roe'), 4);
  assert.strictEqual(w(banka, 'ey'), 6);
  // Toplam agirlik iki sette de 10 — olcek kaymaz
  assert.strictEqual(sanayi.parts.reduce((a, p) => a + p.weight, 0), 10);
  assert.strictEqual(banka.parts.reduce((a, p) => a + p.weight, 0), 10);
  assert.match(banka.parts.find(p => p.key === 'roe').note, /kaldıraçla şişer/);
});

test('banka kotasi: yuksek ROE li sanayi hisseleri bankayi tamamen disari itemez', () => {
  const rows = [];
  // 30 tane cok yuksek skorlu sanayi hissesi
  for (let i = 0; i < 30; i++) {
    rows.push(row({ symbol: 'SAN' + i, ySymbol: 'SAN' + i + '.IS', trailingPE: 4, priceToBook: 8 }));
  }
  // 3 banka, daha dusuk kademe 1 skoruyla
  for (const s of ['GARAN', 'AKBNK', 'YKBNK']) {
    rows.push(row({ symbol: s, ySymbol: s + '.IS', trailingPE: 6, priceToBook: 1.2 }));
  }
  const res = W.screenRank(rows, { hurdlePct: 35 });
  const deep = W.screenSelectDeep(res, LIM);
  const banks = deep.filter(r => r.fin).map(r => r.symbol).sort().join(',');
  assert.strictEqual(banks, 'AKBNK,GARAN,YKBNK', 'uc banka da derin asamaya girmeliydi');
  assert.ok(deep.length <= LIM.deepCount + LIM.edgeQuota);
});

test('kiyi payi: kil payi elenen hisse mali tabloya sorulur, isaretlenir', () => {
  const rows = [
    // ROE %30 — engel %35'in altinda ama %70 bandinin (24,5) ustunde → kiyi
    row({ symbol: 'KIYI', ySymbol: 'KIYI.IS', trailingPE: 10, priceToBook: 3 }),
    // ROE %5 — bandin cok altinda → kiyi DEGIL, sadece elenmis
    row({ symbol: 'DIP', ySymbol: 'DIP.IS', trailingPE: 20, priceToBook: 1 }),
  ];
  const res = W.screenRank(rows, { hurdlePct: 35 });
  assert.strictEqual(res.passed.length, 0, 'ikisi de kapidan gecmemeli');
  assert.strictEqual(res.edge.map(r => r.symbol).join(','), 'KIYI');
  assert.strictEqual(res.dropCounts.lowroe, 2, 'ikisi de elenen sayisina yazilmali');
  const deep = W.screenSelectDeep(res, LIM);
  assert.strictEqual(deep.length, 1);
  assert.strictEqual(deep[0].edge, true, 'kiyi satiri isaretli olmali');
});

test('kiyi payi kotayi asamaz ve normal siranin ONUNE gecemez', () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(row({ symbol: 'OK' + i, ySymbol: 'OK' + i + '.IS', trailingPE: 5, priceToBook: 5 }));
  for (let i = 0; i < 20; i++) rows.push(row({ symbol: 'ED' + i, ySymbol: 'ED' + i + '.IS', trailingPE: 10, priceToBook: 3 }));
  const res = W.screenRank(rows, { hurdlePct: 35 });
  const deep = W.screenSelectDeep(res, LIM);
  const edges = deep.filter(r => r.edge);
  assert.strictEqual(edges.length, LIM.edgeQuota, 'kiyi kotasi kadar olmali');
  // Kiyi satirlari listenin SONUNDA
  const firstEdgeIdx = deep.findIndex(r => r.edge);
  assert.ok(deep.slice(0, firstEdgeIdx).every(r => !r.edge), 'kiyi satirlari sonda olmali');
  assert.strictEqual(firstEdgeIdx, LIM.deepCount);
});

test('screenSelectDeep deterministik ve tekrarsiz', () => {
  const rows = [];
  for (const s of ['GARAN', 'AKBNK', 'ASELS', 'BIMAS', 'FROTO']) {
    rows.push(row({ symbol: s, ySymbol: s + '.IS', trailingPE: 6, priceToBook: 3 }));
  }
  const res = W.screenRank(rows, { hurdlePct: 35 });
  const a = W.screenSelectDeep(res, LIM).map(r => r.symbol).join(',');
  const b = W.screenSelectDeep(res, LIM).map(r => r.symbol).join(',');
  assert.strictEqual(a, b, 'ayni girdi ayni cikti');
  assert.strictEqual(new Set(a.split(',')).size, a.split(',').length, 'tekrar eden sembol olmamali');
});

test('kademe 1 banka listesi buffettScore ile AYNI kaynagi kullanir', () => {
  // Iki ayri liste tutulsa biri gunceLLenir digeri unutulur — tek kaynak sart.
  const i = SRC.indexOf('function screenIsFinancial');
  assert.ok(i > 0);
  assert.ok(/BF_FIN_SYMBOLS\.indexOf/.test(SRC.slice(i, i + 400)),
    'kademe 1 kendi banka listesini tutmamali');
});

test('engel orani degisince banka agirligi KORUNUR', () => {
  const src = SRC.slice(SRC.indexOf('async function setScreenHurdle'), SRC.indexOf('async function setScreenHurdle') + 1600);
  assert.ok(/screenPreScore\(row, n, !!row\.fin\)/.test(src), 'fin bayragi gecirilmeli');
});
