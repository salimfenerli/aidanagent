/**
 * 09 — BUFFETT SKORU (8 Agu 2026)
 *
 * NEDEN: bu skor AI'a "fakt" olarak gidiyor. Sayi yanlissa AI akici ama YANLIS
 * bir temel analiz anlatir — hata sessizdir. Teknik uyum skorunda oldugu gibi
 * her kural burada kilitlenir.
 *
 * Kritik davranis: veri yoksa UYDURMA. Eksik kriter atlanir, kapsama %50'nin
 * altina duserse skor null doner.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load');
const { readText } = require('./helpers/src');

// ——— Aylik fiyat serisi: 2021-01'den bugune, p0'dan p1'e duz artis ———
function prices(p0, p1) {
  const t = [], c = [];
  const start = Date.UTC(2021, 0, 1) / 1000;
  const n = 66;
  for (let i = 0; i < n; i++) {
    t.push(start + i * 30 * 86400);
    c.push(p0 + (p1 - p0) * (i / (n - 1)));
  }
  return { t, c };
}

// ——— Saglikli sirket: yuksek ROE, dusuk borc, istikrarli marj, nakde donen kar ———
function fund(over = {}, yearOver = {}) {
  const years = [2025, 2024, 2023, 2022].map((y, i) => Object.assign({
    year: y,
    revenue: 1000 - i * 60,
    netIncome: 200 - i * 15,      // yeniden eskiye azalan => her yil bir oncekini gecmis
    equity: 800,
    longTermDebt: 100, shortDebt: 50, cash: 100,
    dna: 50, capex: -80, dividendsPaid: -50, opCashFlow: 240 - i * 15,
    totalLiab: 400, totalAssets: 1200, retainedEarnings: 500,
    grossProfit: 400, operatingIncome: 250,
  }, yearOver));
  return Object.assign({
    currency: 'USD', marketCap: 2000, sharesOutstanding: 100,
    priceHistory: prices(10, 25), years,
  }, over);
}

// jsdom yuklemesi ~30 sn surer — TEK ORNEK acilir, tum testler paylasir.
const A = loadApp({ seed: {} });
const W = A.window;
process.on('exit', () => { try { A.close(); } catch {} });

function app() { return A; }
function score(f, h = 10) { return W.buffettScore(f, h); }

// DOM testleri icin temiz kap
function mountCard() {
  const old = W.document.getElementById('buffettCard');
  if (old) old.parentNode.removeChild(old);
  const oldG = W.document.getElementById('stockFundGrid');
  if (oldG) oldG.parentNode.removeChild(oldG);
  W.document.body.insertAdjacentHTML('beforeend',
    '<div id="buffettCard"></div><div id="stockFundGrid"></div>');
  return W.document.getElementById('buffettCard');
}

// ============================================================
// Skor uclari
// ============================================================
test('saglikli sirket yuksek skor alir', () => {
  const r = score(fund());
  assert.ok(r.score >= 75, `beklenen >=75, gelen ${r.score}`);
  assert.strictEqual(r.label, 'güçlü kalite');
  assert.strictEqual(r.coverage, 1, 'tam veride kapsama 1 olmali');
});

test('kotu sirket dusuk skor alir', () => {
  const bad = fund({ marketCap: 40000, priceHistory: prices(10, 11) }, {
    netIncome: -40, equity: 200, longTermDebt: 900, shortDebt: 300, cash: 10,
    revenue: 4000, opCashFlow: 5, capex: -300, dna: 60, dividendsPaid: 0,
  });
  const r = score(bad);
  assert.ok(r.score != null && r.score < 35, `beklenen <35, gelen ${r.score}`);
  assert.ok(r.flags.length >= 1, 'zarar + borc bayrak uretmeliydi');
});

test('skor her zaman 0-100 arasinda', () => {
  for (const h of [1, 10, 35, 120]) {
    const r = score(fund(), h);
    assert.ok(r.score >= 0 && r.score <= 100, `hurdle ${h} -> ${r.score}`);
  }
});

// ============================================================
// Veri yoksa uydurma
// ============================================================
test('2 yildan az tablo -> skor null, gerekce var', () => {
  const r = score(fund({ years: [{ year: 2025, netIncome: 100, equity: 500 }] }));
  assert.strictEqual(r.score, null);
  assert.ok(r.reason && r.reason.length > 10, 'gerekce metni yok');
});

test('kapsama %50 altinda -> skor null (uydurma puan yok)', () => {
  // Sadece yil + ciro var: ROE/borc/dolar/owner/deger hepsi duser
  const thin = {
    currency: 'TRY', years: [
      { year: 2025, revenue: 1000 }, { year: 2024, revenue: 900 },
      { year: 2023, revenue: 800 }, { year: 2022, revenue: 700 },
    ],
  };
  const r = score(thin, 35);
  assert.strictEqual(r.score, null);
  assert.ok(r.coverage < 0.5, `kapsama ${r.coverage}`);
});

test('eksik kriter atlanir ama digerleri hesaplanir', () => {
  const noCash = fund({}, { opCashFlow: null }); // owner + value duser
  const r = score(noCash);
  const owner = r.parts.find(p => p.key === 'owner');
  const roe = r.parts.find(p => p.key === 'roe');
  assert.strictEqual(owner.score, null, 'nakit akis yokken owner puanlanmamali');
  assert.ok(roe.score > 0, 'ROE hala hesaplanmali');
  assert.ok(r.score != null, 'kalan kriterler kapsamayi tutuyorsa skor gelmeli');
});

test('bozuk girdi cokmez', () => {
    assert.strictEqual(W.buffettScore(null, 10), null);
  assert.strictEqual(W.buffettScore(undefined, 10), null);
  assert.ok(W.buffettScore({}, 10).score === null);
  assert.ok(W.buffettScore({ years: 'bozuk' }, 10).score === null);
});

// ============================================================
// 1 Dolar Testi
// ============================================================
test('1 Dolar Testi oranini dogru hesaplar', () => {
  // yilda 200-50=150 ... 4 yil toplam: 200+185+170+155 = 710, temettu 4x50=200
  // tutulan = 510 / 100 hisse = 5,10 · fiyat artisi 2022-01'den bugune
  const r = score(fund());
  const d = r.dollar;
  assert.ok(d, 'dollar detayi dolmali');
  assert.strictEqual(d.retainedPerShare, 5.1);
  const expected = Math.round((d.gainPerShare / d.retainedPerShare) * 100) / 100;
  assert.strictEqual(d.ratio, expected, 'oran = fiyat artisi / tutulan kar');
  assert.ok(d.p1 > d.p0, 'fiyat artmis olmali');
});

test('tutulan kar yoksa 1 Dolar Testi ATLANIR (sifir puan degil)', () => {
  const r = score(fund({}, { netIncome: 50, dividendsPaid: -60 })); // hepsi dagitilmis
  const p = r.parts.find(x => x.key === 'dollar');
  assert.strictEqual(p.score, null, 'uygulanamayan test 0 puan olarak sayilmamali');
  assert.match(p.note, /uygulanamaz|birikmi/i);
});

test('tutulan kar degere donusmemisse bayrak kalkar', () => {
  const r = score(fund({ priceHistory: prices(10, 11) })); // fiyat neredeyse sabit
  const p = r.parts.find(x => x.key === 'dollar');
  assert.ok(p.score < 0.3, `zayif donusumde dusuk puan bekleniyordu: ${p.score}`);
  assert.ok(r.flags.some(f => /1 Dolar/i.test(f)), 'basarisiz test bayrak uretmeli');
});

test('hisse adedi yoksa test atlanir', () => {
  const r = score(fund({ sharesOutstanding: null }));
  assert.strictEqual(r.parts.find(x => x.key === 'dollar').score, null);
});

// ============================================================
// Borc + ROE etkilesimi
// ============================================================
test('net borc nakit dusulerek hesaplanir', () => {
  const r = score(fund());               // borc 150, nakit 100, ozsermaye 800
  assert.strictEqual(r.debtToEquity, 0.06, 'net borc/ozsermaye = 50/800');
});

test('kaldiracla sisirilmis ROE iskonto edilir', () => {
  const lev = fund({}, { longTermDebt: 1200, shortDebt: 400, cash: 0, equity: 800 });
  const plain = score(fund());
  const r = score(lev);
  const a = plain.parts.find(p => p.key === 'roe').score;
  const b = r.parts.find(p => p.key === 'roe').score;
  assert.ok(b < a, 'yuksek borcta ROE puani dusmeliydi');
  assert.match(r.parts.find(p => p.key === 'roe').note, /iskonto/i);
});

test('zarar eden yil ROE istikrarini kirar ve bayrak uretir', () => {
  const r = score(fund({}, { netIncome: -10 }));
  assert.ok(r.parts.find(p => p.key === 'roe').score < 0.4);
  assert.ok(r.flags.some(f => /negatif/i.test(f)));
});

// ============================================================
// Engel orani (hurdle)
// ============================================================
test('engel orani yukseldikce ayni ROE daha az puan alir', () => {
  const low = score(fund(), 10).parts.find(p => p.key === 'roe').score;
  const high = score(fund(), 35).parts.find(p => p.key === 'roe').score;
  assert.ok(high < low, `hurdle 35'te puan dusmeliydi (${high} vs ${low})`);
});

test('buffettHurdle ayarlardan okunur, yoksa para birimi varsayilani', () => {
    assert.strictEqual(W.buffettHurdle('TRY'), 35);
  assert.strictEqual(W.buffettHurdle('USD'), 10);
  A.evalIn('data.settings = data.settings || {}; data.settings.buffettHurdle = { TRY: 45 };');
  assert.strictEqual(W.buffettHurdle('TRY'), 45);
  assert.strictEqual(W.buffettHurdle('USD'), 10, 'override sadece o para birimini etkilemeli');
  A.evalIn('data.settings.buffettHurdle = { TRY: 999 };');
  assert.strictEqual(W.buffettHurdle('TRY'), 35, 'sacma deger varsayilana donmeli');
});

test('TRY borc esigi USD esiginden sikidir', () => {
  const f = fund({}, { longTermDebt: 500, shortDebt: 100, cash: 0 }); // D/E = 0,75
  const usd = score(f, 10).parts.find(p => p.key === 'debt').score;
  const tryv = score(Object.assign(fund({ currency: 'TRY' }, { longTermDebt: 500, shortDebt: 100, cash: 0 })), 35)
    .parts.find(p => p.key === 'debt').score;
  assert.ok(tryv < usd, 'ayni borc TR esiginde daha cok puan kaybettirmeli');
});

// ============================================================
// Owner earnings
// ============================================================
test('owner earnings bakim capexini amortismanla sinirlar', () => {
  // capex 80, dna 50 -> bakim 50 -> oe = opCashFlow 240 - 50 = 190; ni 200 -> 0,95x
  const r = score(fund());
  // capex 80 > dna 50 -> bakim capex 50 ile sinirli (tamami degil)
  assert.ok(r.oeQuality > 0.9 && r.oeQuality < 1, `oeQuality ${r.oeQuality}`);
  assert.ok(r.parts.find(p => p.key === 'owner').score > 0.8);
});

test('kar nakde donmuyorsa puan duser ve bayrak kalkar', () => {
  const r = score(fund({}, { opCashFlow: 60 })); // oe = 10, ni = 200 -> 0,05x
  assert.ok(r.parts.find(p => p.key === 'owner').score < 0.2);
  assert.ok(r.flags.some(f => /nakde/i.test(f)));
});

test('TRY enflasyon muhasebesi notu sadece TRY icin eklenir', () => {
  const t = score(fund({ currency: 'TRY' }), 35);
  const u = score(fund({ currency: 'USD' }), 10);
  assert.ok(t.flags.some(f => /enflasyon/i.test(f)));
  assert.ok(!u.flags.some(f => /enflasyon/i.test(f)));
});

// ============================================================
// Agirliklar / sozlesme
// ============================================================
test('7 kriter ve toplam agirlik 11,5 sabit', () => {
  const r = score(fund());
  assert.strictEqual(r.parts.length, 7);
  const tot = r.parts.reduce((s, p) => s + p.weight, 0);
  assert.strictEqual(tot, 11.5);
  // jsdom realm'inden gelen dizi — reference-equal olmaz, string olarak karsilastir
  const keys = r.parts.map(p => p.key).sort().join(',');
  assert.strictEqual(keys, 'debt,dollar,margin,owner,roe,stability,value');
});

// ============================================================
// DOM — kart cizimi + XSS
// ============================================================
test('kart cizilir, skor ve kriter dokumu DOM a girer', () => {
    mountCard();
  W.renderStockFundamentals(fund(), { currency: 'USD' });
  const html = W.document.getElementById('buffettCard').innerHTML;
  assert.match(html, /Buffett skoru/);
  assert.match(html, /bf-bar/);
  assert.match(html, /Kriter d/);
  assert.match(html, /1 Dolar Testi/);
  assert.match(html, /FAVÖK|EBITDA/, 'reddedilen olcutler notu gorunmeli');
  assert.deepStrictEqual(A.errors, []);
});

test('skor hesaplanamayinca kart gerekceyi gosterir', () => {
    mountCard();
  W.renderStockFundamentals({ currency: 'TRY', years: [] }, { currency: 'TRY' });
  const html = W.document.getElementById('buffettCard').innerHTML;
  assert.match(html, /hesaplanamad/i);
  assert.ok(!/NaN|undefined/.test(html), 'bos veride NaN/undefined sizmamali');
});

test('sirket adi/notu HTML olarak enjekte edilemez', () => {
    const evil = fund({ currency: '<img src=x onerror=alert(1)>' });
  mountCard();
  W.renderStockFundamentals(evil, {});
  const html = W.document.getElementById('buffettCard').innerHTML;
  assert.ok(!/<img/i.test(html), 'ham HTML sizdi');
  assert.ok(/&lt;img/i.test(html), 'kacisli hali bulunmali');
});

// ============================================================
// AI sozlesmesi — facts + worker prompt
// ============================================================
test('facts icine buffett blogu girer ve sayi uydurma alani yok', () => {
    mountCard();
  W.renderStockFundamentals(fund(), { currency: 'USD' });
  const bf = W.buildStockAnalysisFacts(
    { current: 100, macd: {}, stoch: {}, bb: {}, sr: {}, pivots: {}, obv: {} },
    { currency: 'USD' }
  ).buffett;
  assert.ok(bf, 'facts.buffett bos');
  assert.ok(bf.score > 0);
  assert.ok(Array.isArray(bf.parts) && bf.parts.length === 7);
  assert.ok(bf.parts.every(p => 'pts' in p && 'max' in p && 'note' in p));
  assert.strictEqual(bf.hurdlePct, 10);
});

test('worker prompt sozlesmesi: Buffett kurallari + yasaklar duruyor', () => {
  const w = readText('aidan-worker/worker.js');
  assert.ok(w.includes('BUFFETT KATMANI'), 'bfRules prompt bloku yok');
  assert.ok(/ASLA YENİDEN HESAPLAMA/.test(w), 'AI yeniden hesaplamamali kurali yok');
  assert.ok(/FAVÖK\/EBITDA'ya dayanma/.test(w), 'EBITDA reddi kurali yok');
  assert.ok(/beta\/oynaklığı "risk" diye sunma/.test(w), 'beta reddi kurali yok');
  assert.ok(/analist hedefini kanıt sayma/.test(w), 'analist reddi kurali yok');
  assert.ok(/"Ucuz\/pahalı", "iyi şirket\/kötü yatırım", "al\/sat" YİNE YASAK/.test(w), 'tavsiye yasagi gevsemis');
  assert.ok(w.includes("String(body.mode || 'ta') === 'fund'"), 'temel analiz modu yok');
});

test('worker /stock-fundamentals mali tablo modullerini istiyor', () => {
  const w = readText('aidan-worker/worker.js');
  assert.ok(w.includes('incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory'));
  assert.ok(w.includes('function buildFundYears('), 'yil normalizasyonu yok');
  // Temettu iki kez sayilmasin: adjclose degil close kullanilmali
  assert.ok(/Array\.isArray\(cl\) && cl\.some\(v => v != null\)\) \? cl : adj/.test(w),
    '1 Dolar Testi temettu-duzeltilmemis seri kullanmali');
});

test('heavy maliyet kilidi korunuyor (stock-analysis)', () => {
  const w = readText('aidan-worker/worker.js');
  assert.ok(/tier: aiTierForUser\(env, user, 'heavy'\)/.test(w), 'kullanici tetiklemeli cagri kilitsiz kalmis');
});

// ============================================================
// Impeccable CSS denetimi
// ============================================================
test('buffett CSS Impeccable kurallarina uyuyor', () => {
  const css = readText('styles.css');
  const i = css.indexOf('BUFFETT SKORU');
  assert.ok(i > 0, 'CSS blogu yok');
  const block = css.slice(i);
  assert.ok(!/border-left:\s*[2-9]/.test(block), 'yan-serit kenarlik yasak');
  assert.ok(!/border-right:\s*[2-9]/.test(block), 'yan-serit kenarlik yasak');
  assert.ok(!/linear-gradient|backdrop-filter/.test(block), 'gradyan/glass yasak');
  assert.ok(!/#fff\b|#ffffff\b|#000\b|#000000\b/.test(block), 'saf siyah/beyaz yasak');
  assert.ok(/prefers-reduced-motion/.test(block), 'reduced-motion alternatifi zorunlu');
  assert.ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(block), 'ease-out hareket bekleniyor');
});

test('styles.css LF, js dosyalari CRLF kaldi', () => {
  const fs = require('fs'), path = require('path');
  const root = path.resolve(__dirname, '..');
  assert.ok(!fs.readFileSync(path.join(root, 'styles.css')).includes(0x0d), 'styles.css LF olmali');
  for (const f of ['stocks.js', 'aidan-worker/worker.js', 'asistan.html', 'sw.js']) {
    assert.ok(fs.readFileSync(path.join(root, f)).includes(0x0d), f + ' CRLF olmali');
  }
});
