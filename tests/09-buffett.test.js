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
const { test, after } = require('node:test');
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

// jsdom yuklemesi pahali — TEK ORNEK acilir, tum testler paylasir.
const A = loadApp({ seed: {} });
const W = A.window;

// ⚠️ 8 Agu 2026: burada `process.on('exit', ...)` vardi ve DOSYA HIC BITMIYORDU.
// Uygulama yuklenirken setInterval kuruyor (saat, borsa yenileme...). jsdom
// penceresi kapanmadikca bu timer'lar Node'un event loop'unu ayakta tutar;
// tum testler gectikten sonra bile process asili kalir, `exit` olayi da hicbir
// zaman tetiklenmez — yani temizlik kendi kosulunu bekliyordu (deadlock).
// Diger test dosyalari her testte `app.close()` cagirdigi icin bu ortaya cikmadi.
// Cozum: node:test'in `after` kancasi — testler bitince pencere kapanir.
after(() => { try { A.close(); } catch (_) {} });

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
    // Tutarli kotu sirket: faaliyet kari da dusuk olmali (yoksa ROIC yapay yuksek
    // cikar — ROIC finansman ONCESI olculur, borc yukunu gormez).
    grossProfit: 300, operatingIncome: 20,
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
test('operasyonel set: 11 kriter, toplam agirlik 16 sabit', () => {
  const r = score(fund());
  assert.strictEqual(r.parts.length, 11);
  const tot = r.parts.reduce((s, p) => s + p.weight, 0);
  assert.strictEqual(tot, 16);
  // jsdom realm'inden gelen dizi — reference-equal olmaz, string olarak karsilastir
  const keys = r.parts.map(p => p.key).sort().join(',');
  assert.strictEqual(keys, 'debt,dilution,dollar,inflation,margin,moat,mos,owner,roe,roic,stability');
});

test('agirlik dagilimi Buffett sirasinda: kalite > fiyat', () => {
  const r = score(fund());
  const w = k => r.parts.find(p => p.key === k).weight;
  const kalite = w('roe') + w('roic') + w('moat') + w('margin') + w('inflation') + w('owner') + w('stability');
  const fiyat = w('mos');
  assert.strictEqual(kalite, 10.5, 'kalite agirligi 10,5 olmali');
  assert.ok(kalite > fiyat * 3, 'kalite, fiyatin en az 3 kati agirlikta olmali (Buffett sirasi)');
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
  assert.ok(Array.isArray(bf.parts) && bf.parts.length === 11);
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

// ============================================================
// TAM BUFFETT UYUMU (12 Agu 2026) — kurum tipi, ROIC, moat,
// enflasyon dayanikliligi, seyreltme, guvenlik payi
// ============================================================
// Ozel yil dizisi kurucusu — fixture'in her yila AYNI degeri yazan
// yapisi bu testlerin cogunda yetmiyor (buyume/seyreltme senaryolari).
function mkYears(rows) {
  return rows.map(r => Object.assign({
    revenue: 1000, netIncome: 100, grossProfit: 400, operatingIncome: 200,
    equity: 800, totalAssets: 1200, totalLiab: 400,
    longTermDebt: 100, shortDebt: 50, cash: 100, retainedEarnings: 500,
    dna: 50, capex: -80, dividendsPaid: -20, opCashFlow: 150,
  }, r));
}
function mk(over, rows) {
  return Object.assign({
    currency: 'USD', marketCap: 2000, sharesOutstanding: 100,
    priceHistory: prices(10, 25), years: mkYears(rows || [
      { year: 2025 }, { year: 2024 }, { year: 2023 }, { year: 2022 },
    ]),
  }, over || {});
}
const part = (r, k) => r.parts.find(p => p.key === k);

// ——— Kurum tipi tespiti ———
test('kurum tipi: BIST banka sembolu listeden yakalanir', () => {
  const r = score(mk({ ySymbol: 'GARAN.IS', currency: 'TRY' }), 35);
  assert.strictEqual(r.kind, 'financial');
  assert.match(r.kindSrc, /sembol listesi/);
});

test('kurum tipi: Yahoo sektoru banka der', () => {
  const r = score(mk({ ySymbol: 'XYZ', sector: 'Financial Services' }));
  assert.strictEqual(r.kind, 'financial');
  assert.match(r.kindSrc, /Yahoo/);
});

test('kurum tipi: sektor yokken BILANCO SEKLI bankayi yakalar', () => {
  // Bankanin imzasi: cok kaldiracli + varlik devir hizi cok dusuk + capex yok
  const r = score(mk({ ySymbol: 'ZZZ' }, [
    { year: 2025, totalAssets: 10000, equity: 1000, revenue: 900, capex: -5 },
    { year: 2024, totalAssets: 9000, equity: 950, revenue: 800, capex: -5 },
  ]));
  assert.strictEqual(r.kind, 'financial');
  assert.match(r.kindSrc, /bilan/);
});

test('kurum tipi: GYO ve holding ayri isaretlenir, ikisi de operasyonel set kullanir', () => {
  const g = score(mk({ ySymbol: 'EKGYO.IS', currency: 'TRY' }), 35);
  const h = score(mk({ ySymbol: 'KCHOL.IS', currency: 'TRY' }), 35);
  assert.strictEqual(g.kind, 'reit');
  assert.strictEqual(h.kind, 'holding');
  // Operasyonel setin imzasi: borc ve 1 Dolar Testi kriterleri VAR
  for (const r of [g, h]) {
    assert.ok(part(r, 'debt'), 'operasyonel sette borc kriteri olmali');
    assert.ok(part(r, 'dollar'), 'operasyonel sette 1 Dolar Testi olmali');
  }
  assert.ok(g.flags.some(f => /GYO/.test(f)), 'GYO yapisi uyarisi bekleniyor');
  assert.ok(h.flags.some(f => /[Hh]olding/.test(f)), 'holding uyarisi bekleniyor');
});

test('normal sirket bankaya benzemez (yanlis pozitif korumasi)', () => {
  assert.strictEqual(score(mk({ ySymbol: 'FROTO.IS', currency: 'TRY' }), 35).kind, 'operating');
});

// ——— Banka kriter seti ———
test('banka seti: 8 kriter, toplam agirlik 12,5', () => {
  const r = score(mk({ ySymbol: 'AKBNK.IS', currency: 'TRY' }, [
    { year: 2025, totalAssets: 10000, equity: 1000, revenue: 900, capex: -5 },
    { year: 2024, totalAssets: 9000, equity: 900, revenue: 800, capex: -5 },
    { year: 2023, totalAssets: 8000, equity: 800, revenue: 700, capex: -5 },
  ]), 35);
  assert.strictEqual(r.parts.length, 8);
  assert.strictEqual(r.parts.reduce((s, p) => s + p.weight, 0), 12.5);
  assert.strictEqual(r.parts.map(p => p.key).sort().join(','),
    'bvg,dilution,efficiency,leverage,mos,roa,roe,stability');
});

test('banka setinde borc / owner earnings / capex / 1 Dolar Testi KASITLI YOK', () => {
  const r = score(mk({ ySymbol: 'GARAN.IS', currency: 'TRY' }, [
    { year: 2025, totalAssets: 10000, equity: 1000, revenue: 900, capex: -5 },
    { year: 2024, totalAssets: 9000, equity: 900, revenue: 800, capex: -5 },
  ]), 35);
  for (const k of ['debt', 'owner', 'dollar', 'inflation', 'moat', 'roic']) {
    assert.strictEqual(part(r, k), undefined, k + ' bankada bulunmamali');
  }
  assert.ok(part(r, 'roa') && part(r, 'leverage') && part(r, 'bvg'), 'banka kriterleri olmali');
});

test('banka: kredi kalitesi kor noktasi HER ZAMAN bayrak olarak yazilir', () => {
  const r = score(mk({ ySymbol: 'YKBNK.IS', currency: 'TRY' }, [
    { year: 2025, totalAssets: 10000, equity: 1000, revenue: 900, capex: -5 },
    { year: 2024, totalAssets: 9000, equity: 900, revenue: 800, capex: -5 },
  ]), 35);
  assert.ok(r.flags.some(f => /takipteki kredi/i.test(f)), 'NPL kor noktasi soylenmelidir');
  assert.ok(r.flags.some(f => /KASITLI olarak girmedi/i.test(f)), 'eksik kriterlerin sebebi yazilmali');
});

test('banka: yuksek kaldirac dusuk puan + bayrak uretir', () => {
  const lo = score(mk({ ySymbol: 'AKBNK.IS', currency: 'TRY' }, [
    { year: 2025, totalAssets: 7000, equity: 1000, revenue: 900, capex: -5 },
    { year: 2024, totalAssets: 6500, equity: 950, revenue: 800, capex: -5 },
  ]), 35);
  const hi = score(mk({ ySymbol: 'AKBNK.IS', currency: 'TRY' }, [
    { year: 2025, totalAssets: 20000, equity: 1000, revenue: 900, capex: -5 },
    { year: 2024, totalAssets: 19000, equity: 950, revenue: 800, capex: -5 },
  ]), 35);
  assert.ok(part(lo, 'leverage').score > part(hi, 'leverage').score, 'dusuk kaldirac daha iyi puan almali');
  assert.ok(hi.flags.some(f => /[Kk]aldıraç yüksek/.test(f)), '20x kaldiracta bayrak bekleniyor');
});

test('banka guvenlik payi: hak edilen PD/DD = ROE / engel orani', () => {
  // ROE = 200/1000 = %20 · engel %10 → hak edilen PD/DD = 2,0×
  // Gercek PD/DD 1,0 → guvenlik payi = 1 − 1/2 = %50
  const r = score(mk({ ySymbol: 'BANKX', sector: 'Financial Services', priceToBook: 1.0 }, [
    { year: 2025, totalAssets: 10000, equity: 1000, netIncome: 200, revenue: 900, capex: -5 },
    { year: 2024, totalAssets: 10000, equity: 1000, netIncome: 200, revenue: 900, capex: -5 },
  ]), 10);
  assert.strictEqual(r.justifiedPB, 2);
  assert.strictEqual(r.mos, 0.5);
  assert.strictEqual(part(r, 'mos').score, 1, 'PD/DD hak edilenin yarisiysa tam puan');
});

// ——— ROIC ———
test('ROIC kaldiractan arindirir: borc artinca ROIC duser, ROE dusmez', () => {
  const az = score(mk({}, [
    { year: 2025, equity: 800, longTermDebt: 0, shortDebt: 0, cash: 0, netIncome: 160, operatingIncome: 200 },
    { year: 2024, equity: 800, longTermDebt: 0, shortDebt: 0, cash: 0, netIncome: 160, operatingIncome: 200 },
  ]));
  const cok = score(mk({}, [
    { year: 2025, equity: 800, longTermDebt: 2400, shortDebt: 0, cash: 0, netIncome: 160, operatingIncome: 200 },
    { year: 2024, equity: 800, longTermDebt: 2400, shortDebt: 0, cash: 0, netIncome: 160, operatingIncome: 200 },
  ]));
  assert.strictEqual(az.roe, cok.roe, 'ROE borctan etkilenmemeli (ayni kar, ayni ozsermaye)');
  assert.ok(cok.roic < az.roic * 0.4, 'ROIC borcla belirgin dusmeli');
});

test('ROE >> ROIC ise "kaldiractan geliyor" bayragi kalkar', () => {
  const r = score(mk({}, [
    { year: 2025, equity: 100, longTermDebt: 900, shortDebt: 0, cash: 0, netIncome: 40, operatingIncome: 60 },
    { year: 2024, equity: 100, longTermDebt: 900, shortDebt: 0, cash: 0, netIncome: 40, operatingIncome: 60 },
  ]));
  assert.ok(r.flags.some(f => /kaldıra[cç]/i.test(f) && /ROIC/.test(f)), "kaldirac uyarisi bekleniyor");
});

// ——— Moat / brut marj ———
test('REGRESYON: surekli DUSUK ama istikrarli brut marj yuksek puan ALMAZ', () => {
  // Eski formulde istikrar TOPLANIYORDU: %10 sabit marj 0,42 puan aliyordu.
  // Surekli dusuk marj moat'in YOKLUGUNUN kanitidir — istikrar carpan olmali.
  const zayif = score(mk({}, [
    { year: 2025, revenue: 1000, grossProfit: 100 }, { year: 2024, revenue: 1000, grossProfit: 100 },
    { year: 2023, revenue: 1000, grossProfit: 100 }, { year: 2022, revenue: 1000, grossProfit: 100 },
  ]));
  assert.ok(part(zayif, 'moat').score < 0.15, `dusuk marj yuksek puan aldi: ${part(zayif, 'moat').score}`);
  const guclu = score(mk({}, [
    { year: 2025, revenue: 1000, grossProfit: 400 }, { year: 2024, revenue: 1000, grossProfit: 400 },
    { year: 2023, revenue: 1000, grossProfit: 400 }, { year: 2022, revenue: 1000, grossProfit: 400 },
  ]));
  assert.ok(part(guclu, 'moat').score > 0.7, 'yuksek ve istikrarli marj yuksek puan almali');
});

test('ayni marj seviyesinde DALGALI olan, istikrarli olandan az puan alir', () => {
  const duz = score(mk({}, [
    { year: 2025, revenue: 1000, grossProfit: 300 }, { year: 2024, revenue: 1000, grossProfit: 300 },
    { year: 2023, revenue: 1000, grossProfit: 300 }, { year: 2022, revenue: 1000, grossProfit: 300 },
  ]));
  const dalgali = score(mk({}, [
    { year: 2025, revenue: 1000, grossProfit: 300 }, { year: 2024, revenue: 1000, grossProfit: 480 },
    { year: 2023, revenue: 1000, grossProfit: 120 }, { year: 2022, revenue: 1000, grossProfit: 300 },
  ]));
  assert.ok(part(duz, 'moat').score > part(dalgali, 'moat').score, 'dalgalanma cezalandirilmali');
});

test('emtia benzeri is bayrak uretir (dusuk + dalgali marj)', () => {
  const r = score(mk({}, [
    { year: 2025, revenue: 1000, grossProfit: 60 }, { year: 2024, revenue: 1000, grossProfit: 220 },
    { year: 2023, revenue: 1000, grossProfit: 40 }, { year: 2022, revenue: 1000, grossProfit: 180 },
  ]));
  assert.ok(r.flags.some(f => /emtia/i.test(f)), 'emtia bayragi bekleniyor');
});

// ——— Enflasyon dayanikliligi ———
test('sermaye HAFIF is, sermaye YOGUN isten yuksek puan alir', () => {
  const hafif = score(mk({}, [
    { year: 2025, revenue: 2000, capex: -20, totalAssets: 1000 },
    { year: 2024, revenue: 1900, capex: -20, totalAssets: 1000 },
  ]));
  const yogun = score(mk({}, [
    { year: 2025, revenue: 2000, capex: -600, totalAssets: 8000 },
    { year: 2024, revenue: 1900, capex: -560, totalAssets: 8000 },
  ]));
  assert.ok(part(hafif, 'inflation').score > part(yogun, 'inflation').score + 0.3,
    'sermaye yogunlugu belirgin fark yaratmali');
  assert.ok(yogun.flags.some(f => /[Ss]ermaye yoğun/.test(f)), 'sermaye yogunluk bayragi bekleniyor');
});

test('ENFLASYON NOTRLUGU: tum nominal seriyi sisirmek skoru DEGISTIRMEZ', () => {
  // Bu paketin en kritik testi. Kriter capex/ciro, ciro/varlik ve iki buyume
  // oraninin FARKI uzerine kurulu — ucu de enflasyonda sadelesmeli.
  const real = [
    { year: 2025, revenue: 1200, netIncome: 140, totalAssets: 1400, capex: -70 },
    { year: 2024, revenue: 1100, netIncome: 125, totalAssets: 1320, capex: -66 },
    { year: 2023, revenue: 1000, netIncome: 110, totalAssets: 1250, capex: -60 },
    { year: 2022, revenue: 900, netIncome: 95, totalAssets: 1180, capex: -55 },
  ];
  const pi = 0.45; // %45 yillik enflasyon
  const nominal = real.map((r, i) => {
    const f = Math.pow(1 + pi, 3 - i); // en yeni yil en cok sisirilir
    return Object.assign({}, r, {
      revenue: r.revenue * f, netIncome: r.netIncome * f,
      totalAssets: r.totalAssets * f, capex: r.capex * f,
    });
  });
  const a = part(score(mk({}, real)), 'inflation').score;
  const b = part(score(mk({}, nominal)), 'inflation').score;
  assert.ok(Math.abs(a - b) < 1e-9, `enflasyon skoru kaydirdi: ${a} vs ${b}`);
});

test('ortalamada ZARAR eden sirket "enflasyona dayanikli" sayilmaz (tavan)', () => {
  const r = score(mk({}, [
    { year: 2025, revenue: 2000, netIncome: -100, capex: -20, totalAssets: 1000 },
    { year: 2024, revenue: 1900, netIncome: -90, capex: -20, totalAssets: 1000 },
  ]));
  assert.ok(part(r, 'inflation').score <= 0.4, 'zarar edende tavan uygulanmali');
  assert.match(part(r, 'inflation').note, /tavan/);
});

test('GYO da enflasyon kriteri BILINCLI atlanir (uydurma puan yok)', () => {
  const r = score(mk({ ySymbol: 'EKGYO.IS', currency: 'TRY' }), 35);
  const p = part(r, 'inflation');
  assert.strictEqual(p.score, null);
  assert.match(p.note, /GYO/);
});

// ——— Guvenlik payi ———
test('guvenlik payi matematigi: icsel deger = normalize sahip kari / engel orani', () => {
  // OE = opCashFlow − min(|capex|, dna) = 150 − 50 = 100 · ciro 1000 → marj %10
  // normalize OE = 0,10 × 1000 = 100 · engel %10 → icsel deger 1000
  // piyasa degeri 500 → guvenlik payi = 1 − 500/1000 = %50
  const r = score(mk({ marketCap: 500 }), 10);
  assert.strictEqual(r.intrinsic, 1000);
  assert.strictEqual(r.mos, 0.5);
  assert.strictEqual(part(r, 'mos').score, 1);
});

test('piyasa degeri icsel degerin ustundeyse guvenlik payi negatif + bayrak', () => {
  const r = score(mk({ marketCap: 2500 }), 10);
  assert.ok(r.mos < 0);
  assert.ok(r.flags.some(f => /[Gg]üvenlik payı YOK/.test(f)));
});

test('engel orani yukselince icsel deger duser (iskonto oraninin isi)', () => {
  const a = score(mk({ marketCap: 500 }), 10).intrinsic;
  const b = score(mk({ marketCap: 500 }), 20).intrinsic;
  assert.ok(b < a, 'iskonto orani artinca icsel deger dusmeli');
  assert.strictEqual(b, 500);
});

test('ortalamada negatif sahip karinda icsel deger HESAPLANMAZ (uydurma yok)', () => {
  const r = score(mk({}, [
    { year: 2025, opCashFlow: -200, capex: -80, dna: 50 },
    { year: 2024, opCashFlow: -180, capex: -80, dna: 50 },
  ]));
  const p = part(r, 'mos');
  assert.strictEqual(p.score, null);
  assert.match(p.note, /negatif/);
  assert.strictEqual(r.mos, undefined);
});

test('guvenlik payi notunda SIFIR BUYUME varsayimi acikca yazili', () => {
  assert.match(part(score(mk({ marketCap: 500 }), 10), 'mos').note, /SIFIR büyüme/);
});

// ——— Seyreltme ———
test('sermaye artirimi yakalanir, geri alim odullendirilir', () => {
  // Ozsermaye 800 → 4000 buyumus ama tutulan kar bunu aciklamiyor → dis kaynak
  const seyrelen = score(mk({}, [
    { year: 2025, equity: 4000, netIncome: 100, dividendsPaid: -20 },
    { year: 2024, equity: 3000, netIncome: 100, dividendsPaid: -20 },
    { year: 2023, equity: 800, netIncome: 100, dividendsPaid: -20 },
  ]));
  assert.ok(part(seyrelen, 'dilution').score < 0.2, 'buyuk sermaye artirimi cezalandirilmali');
  assert.ok(seyrelen.flags.some(f => /[Ss]ermaye artırımı/.test(f)));
  // Temel fixture: ozsermaye sabit ama kar tutulmus → geri alim imzasi
  const geriAlim = score(mk({}));
  assert.strictEqual(part(geriAlim, 'dilution').score, 1);
  assert.match(part(geriAlim, 'dilution').note, /geri alım/);
});

test('TRY esigi daha genis — enflasyon muhasebesi yanlis alarm uretmesin', () => {
  const rows = [
    { year: 2025, equity: 1400, netIncome: 100, dividendsPaid: 0 },
    { year: 2024, equity: 1100, netIncome: 100, dividendsPaid: 0 },
    { year: 2023, equity: 800, netIncome: 100, dividendsPaid: 0 },
  ];
  const usd = part(score(mk({ currency: 'USD' }, rows), 10), 'dilution').score;
  const tryS = part(score(mk({ currency: 'TRY' }, rows), 35), 'dilution').score;
  assert.ok(tryS > usd, 'TRY esigi daha musamahali olmali');
  assert.match(part(score(mk({ currency: 'TRY' }, rows), 35), 'dilution').note, /enflasyon muhasebesi/);
});

// ——— Dayaniklilik ———
test('bozuk / eksik veride hicbir kriterde NaN sizmaz', () => {
  const bozuk = [
    mk({ marketCap: null, sharesOutstanding: null, priceHistory: null }, [
      { year: 2025, revenue: 0, netIncome: null, equity: 0, totalAssets: 0, grossProfit: null,
        operatingIncome: null, capex: null, dna: null, opCashFlow: null, dividendsPaid: null },
      { year: 2024, revenue: null, netIncome: NaN, equity: -50, totalAssets: null },
    ]),
    mk({ ySymbol: 'GARAN.IS', currency: 'TRY', priceToBook: 0 }, [
      { year: 2025, equity: 0, totalAssets: 0, netIncome: null, revenue: 0, operatingIncome: null },
      { year: 2024, equity: null, totalAssets: NaN, netIncome: null, revenue: null },
    ]),
  ];
  for (const f of bozuk) {
    for (const h of [10, 35]) {
      const r = score(f, h);
      assert.ok(r && typeof r === 'object');
      assert.ok(r.score === null || (isFinite(r.score) && r.score >= 0 && r.score <= 100), 'skor NaN olmamali');
      for (const p of r.parts) {
        assert.ok(p.score === null || isFinite(p.score), `${p.key} NaN sizdirdi`);
        assert.ok(!/NaN|Infinity|undefined/.test(String(p.note || '')), `${p.key} notunda NaN: ${p.note}`);
      }
    }
  }
});

test('kapsama %50 altina duserse banka setinde de skor null doner', () => {
  const r = score(mk({ ySymbol: 'GARAN.IS', currency: 'TRY', priceToBook: null }, [
    { year: 2025, equity: null, totalAssets: null, netIncome: null, revenue: null, operatingIncome: null, dividendsPaid: null },
    { year: 2024, equity: null, totalAssets: null, netIncome: null, revenue: null, operatingIncome: null, dividendsPaid: null },
  ]), 35);
  assert.strictEqual(r.score, null);
  assert.match(r.reason, /uydurma|veri yok/i);
});

test('deterministik: ayni girdi her zaman ayni skor', () => {
  const f = mk({ ySymbol: 'GARAN.IS', currency: 'TRY' });
  const a = score(f, 35), b = score(f, 35);
  assert.strictEqual(a.score, b.score);
  assert.strictEqual(a.parts.map(p => `${p.key}:${p.score}`).join('|'),
    b.parts.map(p => `${p.key}:${p.score}`).join('|'));
});

// ——— Facts sozlesmesi ———
test('kurum tipi ve guvenlik payi facts icine girer', () => {
  mountCard();
  W.renderStockFundamentals(mk({ ySymbol: 'GARAN.IS', currency: 'TRY', priceToBook: 1.2 }), { currency: 'TRY' });
  const ta = { current: 1, sr: {}, macd: {}, bb: {}, pivots: {}, obv: {}, signals: [] };
  const bf = W.buildStockAnalysisFacts(ta, { currency: 'TRY' }).buffett;
  assert.ok(bf, 'buffett blogu olmali');
  assert.strictEqual(bf.kind, 'financial');
  assert.ok(bf.kindLabel && /banka/i.test(bf.kindLabel));
  assert.ok('mos' in bf && 'roic' in bf && 'leverage' in bf, 'yeni alanlar sozlesmede olmali');
});

// ——— DOM ———
test('banka kartinda kurum tipi rozeti ve ayri-set aciklamasi cizilir', () => {
  mountCard();
  W.renderStockFundamentals(mk({ ySymbol: 'AKBNK.IS', currency: 'TRY', priceToBook: 1.1 }, [
    { year: 2025, totalAssets: 10000, equity: 1000, netIncome: 200, revenue: 900, capex: -5 },
    { year: 2024, totalAssets: 9500, equity: 900, netIncome: 180, revenue: 850, capex: -5 },
    { year: 2023, totalAssets: 9000, equity: 800, netIncome: 160, revenue: 800, capex: -5 },
  ]), { currency: 'TRY' });
  const html = W.document.getElementById('buffettCard').innerHTML;
  assert.match(html, /bf-kind/);
  assert.match(html, /banka/i);
  assert.match(html, /1 Dolar Testi/, 'neden eksik olduklari yazilmali');
});

test('guvenlik payi seridi cizilir ve sifir buyume varsayimini yazar', () => {
  mountCard();
  W.renderStockFundamentals(mk({ marketCap: 500 }), { currency: 'USD' });
  const html = W.document.getElementById('buffettCard').innerHTML;
  assert.match(html, /bf-mos/);
  assert.match(html, /Güvenlik payı/);
  assert.match(html, /sıfır büyüme/);
});

test('kurum tipi kaynagi HTML e kacisli girer (XSS)', () => {
  mountCard();
  W.renderStockFundamentals(mk({
    ySymbol: 'XX', sector: 'Financial Services', industry: '<img src=x onerror=alert(1)>',
  }), { currency: 'USD' });
  const html = W.document.getElementById('buffettCard').innerHTML;
  assert.ok(!/<img src=x/.test(html), 'ham HTML sizdi');
});

// ——— Worker sozlesmesi ———
test('worker prompt: iki kriter seti, sifir buyume ve banka kor noktasi ogretiliyor', () => {
  const w = readText('aidan-worker/worker.js');
  assert.ok(/İKİ AYRI KRİTER SETİ/.test(w), 'iki set ogretisi yok');
  assert.ok(/KURUM TİPİ/.test(w), 'kurum tipi prompt a girmiyor');
  assert.ok(/BÜYÜME SIFIR VARSAYILDI/.test(w), 'sifir buyume uyarisi yok');
  assert.ok(/takipteki kredi/.test(w), 'banka kor noktasi yok');
  assert.ok(/ROIC/.test(w) && /1977/.test(w), 'ROIC ve enflasyon tezi ogretilmeli');
  // Tavsiye yasaklari GEVSEMEDI
  assert.ok(/güvenlik payı POZİTİF olsa bile/i.test(w) || /güvenlik payı pozitif olsa BİLE/i.test(w),
    'pozitif guvenlik payi "ucuz" demeye izin vermemeli');
  assert.ok(/hedef fiyat DEĞİLDİR/.test(w), 'icsel deger hedef fiyat degildir uyarisi yok');
});

test('worker: banka skoru sanayi skoruyla karsilastirilmasin kurali var', () => {
  const w = readText('aidan-worker/worker.js');
  assert.ok(/AYNI ÖLÇEK DEĞİLDİR/.test(w), 'iki setin olcegi ayni degil kurali yok');
});

// ——— CSS ———
test('yeni kurum-tipi / guvenlik-payi CSS i Impeccable uyumlu', () => {
  const css = readText('styles.css');
  const i = css.indexOf('Kurum tipi rozeti');
  assert.ok(i > 0, 'yeni CSS blogu yok');
  const block = css.slice(i);
  assert.ok(/\.bf-kind/.test(block) && /\.bf-mos/.test(block) && /\.scr-kind/.test(block));
  assert.ok(!/border-left:\s*[2-9]/.test(block) && !/border-right:\s*[2-9]/.test(block), 'yan-serit yasak');
  assert.ok(!/linear-gradient|backdrop-filter/.test(block), 'gradyan/glass yasak');
  assert.ok(!/#fff\b|#ffffff\b|#000\b|#000000\b/.test(block), 'saf siyah/beyaz yasak');
  assert.ok(/prefers-reduced-motion/.test(block), 'reduced-motion zorunlu');
  assert.ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(block), 'ease-out bekleniyor');
});

test('KANIT: naif "CAGR farki" yontemi enflasyonda SAPARDI, oran yontemi sapmaz', () => {
  // v7-147'deki ayni ders: nominal bilesik buyume (1+g_reel)(1+π) oldugu icin
  // iki CAGR'in FARKI (1+π) ile olceklenir — sadelesmez. Bu test, secilen ORAN
  // formunun neden zorunlu oldugunu sayiyla gosterir.
  const cagr = (yeni, eski, n) => Math.pow(yeni / eski, 1 / n) - 1;
  const niY = 140, niE = 95, asY = 1400, asE = 1180, n = 3;
  const pi = 0.45, f = Math.pow(1 + pi, n);

  const gNiR = cagr(niY, niE, n), gAsR = cagr(asY, asE, n);
  const gNiN = cagr(niY * f, niE, n), gAsN = cagr(asY * f, asE, n);

  // Naif: fark — enflasyonla BUYUR
  const farkR = gNiR - gAsR, farkN = gNiN - gAsN;
  assert.ok(Math.abs(farkN - farkR) > 0.02, 'naif farkin saptigi gosterilmeliydi');
  assert.ok(Math.abs(farkN - farkR * (1 + pi)) < 1e-9, 'sapma tam olarak (1+π) katidir');

  // Secilen yontem: buyume carpanlarinin orani — TAM sadelesir
  const oranR = (1 + gNiR) / (1 + gAsR), oranN = (1 + gNiN) / (1 + gAsN);
  assert.ok(Math.abs(oranN - oranR) < 1e-12, 'oran yontemi enflasyondan bagimsiz olmali');
});

test('kaynakta CAGR FARKI degil ORANI kullanildigi kilitli', () => {
  const src = readText('stocks.js');
  const i = src.indexOf('ENFLASYON DAYANIKLILIGI');
  assert.ok(i > 0);
  const block = src.slice(i, i + 3000);
  assert.ok(/\(1 \+ niC\) \/ \(1 \+ asC\)/.test(block), 'buyume carpanlarinin orani kullanilmali');
  assert.ok(!/gap = niC - asC/.test(block), 'CAGR farki geri gelmemeli (enflasyonda sapar)');
});
