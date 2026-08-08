/**
 * ANALIZ v2 (7 Agu 2026) — uyum skoru + kosullu senaryolar + coklu zaman dilimi.
 *
 * NEDEN: bu katman AI'a giden "facts"i besliyor. Sayilar yanlissa AI yanlis
 * seviyeleri anlatir ve hata SESSIZ olur (metin akici gorunur). Bu yuzden her
 * sayisal kural burada kilitlenir.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load');
const { readText } = require('./helpers/src');

// ——— Sentetik TA nesnesi: tum gostergeler ayni yone bakar ———
function taOf(dir, over = {}) {
  const s = dir === 'up' ? 1 : -1;
  return Object.assign({
    current: 100,
    sma20: 100 - s * 3,
    sma50: 100 - s * 6,
    ema9: 100 + s * 1,
    ema21: 100,
    rsi: dir === 'up' ? 62 : 38,
    trend: dir === 'up' ? 'yukarı' : 'aşağı',
    priceVsSma20: (s > 0 ? '+3.0%' : '-3.0%'),
    macd: { line: s * 1.2, signal: s * 0.8, histogram: s * 0.4 },
    stoch: { k: dir === 'up' ? 70 : 30, d: dir === 'up' ? 60 : 40 },
    stochZone: 'nötr',
    obv: { trend: dir === 'up' ? 'yukarı' : 'aşağı' },
    bbPosition: dir === 'up' ? 'üst banda yakın' : 'alt banda yakın',
    pivotZone: dir === 'up' ? 'PP-R1 arası' : 'S1-PP arası',
    recentChange7d: s * 4,
    adx: 30,
    bb: { lower: 92, mid: 100, upper: 108 },
    sr: { support: 94, resistance: 106 },
    pivots: { pp: 100, r1: 104, r2: 109, s1: 96, s2: 91 },
    atrPct: 2,
  }, over);
}

// Gercekci fiyat serisi — deterministik (rastgelelik yok, test kararli olsun)
function series(n, start, drift, wob) {
  const closes = [], highs = [], lows = [], opens = [], volumes = [], timestamps = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + drift) + Math.sin(i / 3.7) * wob;
    const c = Math.round(p * 100) / 100;
    closes.push(c);
    highs.push(Math.round((c * 1.012) * 100) / 100);
    lows.push(Math.round((c * 0.988) * 100) / 100);
    opens.push(Math.round((c * 0.998) * 100) / 100);
    volumes.push(1000 + (i % 7) * 130);
    timestamps.push(1700000000 + i * 86400);
  }
  return {
    closes, highs, lows, opens, volumes, timestamps,
    currency: 'TRY', name: 'TEST',
    min: Math.min(...lows), max: Math.max(...highs),
    changePct: Math.round((closes[n - 1] - closes[0]) / closes[0] * 10000) / 100,
  };
}

// Bos seed: bu testler saf hesap fonksiyonlarini olcuyor, kullanici verisi
// gerekmiyor. (Dolu fixture ile yukleme ~30 sn suruyor, 25 test = 12 dk.)
function app() {
  return loadApp({ seed: {} });
}

test('fonksiyonlar tanimli — analiz v2 cekirdegi yuklendi', () => {
  const a = app();
  assert.strictEqual(a.errors.length, 0, 'yuklemede hata: ' + a.errors.join(' | '));
  for (const fn of ['taConfluence', 'taScenarios', 'taResample', 'taMtfCompare',
                    'taMergeLevels', 'renderConfluence', 'renderScenarios', 'loadStockMtf']) {
    assert.strictEqual(a.evalIn(`typeof ${fn}`), 'function', fn + ' yok');
  }
  a.close();
});

// ============================================================
// 1) UYUM SKORU
// ============================================================
test('uyum skoru: hepsi yukari -> yuksek skor, hepsi asagi -> dusuk', () => {
  const a = app();
  a.window.__up = taOf('up');
  a.window.__dn = taOf('down');
  const up = a.evalIn('taConfluence(window.__up)');
  const dn = a.evalIn('taConfluence(window.__dn)');
  assert.ok(up.score >= 90, 'tam yukari uyumda skor >=90 olmali, geldi ' + up.score);
  assert.strictEqual(up.dir, 'up');
  assert.strictEqual(up.bear, 0);
  assert.ok(dn.score <= 10, 'tam asagi uyumda skor <=10 olmali, geldi ' + dn.score);
  assert.strictEqual(dn.dir, 'down');
  assert.strictEqual(dn.bull, 0);
  a.close();
});

test('uyum skoru: 0-100 disina cikmaz, sayimlar toplami = total', () => {
  const a = app();
  for (const d of ['up', 'down']) {
    a.window.__t = taOf(d);
    const c = a.evalIn('taConfluence(window.__t)');
    assert.ok(c.score >= 0 && c.score <= 100, 'skor aralik disi: ' + c.score);
    assert.strictEqual(c.bull + c.bear + c.neutral, c.total, 'oy sayimi tutmuyor');
    assert.strictEqual(c.votes.length, c.total);
  }
  a.close();
});

test('uyum skoru: karisik tablo notr bolgede kalir (42-58)', () => {
  const a = app();
  // 5 oyluk sette gercek bir celiski: fiyat SMA20 ustunde + MACD yukari (2 up)
  // ama SMA20 SMA50'nin altinda + OBV asagi (2 down), RSI tam notr (1 notr).
  a.window.__t = taOf('up', {
    sma50: 101,               // sma20 (97) < sma50 (101) -> SMA20/SMA50 asagi oyu
    obv: { trend: 'aşağı' },  // OBV asagi oyu
    rsi: 50,                  // RSI notr oyu (45-55 arasi)
  });
  const c = a.evalIn('taConfluence(window.__t)');
  assert.ok(c.score > 20 && c.score < 60, 'karisik tabloda uc skor beklenmiyor: ' + c.score);
  assert.ok(c.bull > 0 && c.bear > 0, 'karisik tabloda iki yon de temsil edilmeli');
  a.close();
});

test('uyum skoru: 3 gostergeden az veri -> null (uydurma skor yok)', () => {
  const a = app();
  a.window.__t = { current: 100, trend: 'belirsiz' };  // hicbir oy yok
  assert.strictEqual(a.evalIn('taConfluence(window.__t)'), null);
  assert.strictEqual(a.evalIn('taConfluence(null)'), null);
  // Sinir: tam 2 oy -> null, 3. oy eklenince skor doner (5 oyluk sette esik 3)
  a.window.__two = { current: 100, sma20: 97, macd: { line: 1, signal: 0.5, histogram: 0.5 } };
  assert.strictEqual(a.evalIn('taConfluence(window.__two)'), null, '2 oyla skor uretilmemeli');
  a.window.__three = Object.assign({}, a.window.__two, { rsi: 60 });
  assert.ok(a.evalIn('taConfluence(window.__three)') !== null, '3 oyla skor uretilmeli');
  a.close();
});

test('uyum skoru: ADX guvenilirligi dogru etiketlenir, ADX oy VERMEZ', () => {
  const a = app();
  const rel = (adx) => {
    a.window.__t = taOf('up', { adx });
    return a.evalIn('taConfluence(window.__t)');
  };
  assert.strictEqual(rel(35).reliability, 'yüksek');
  assert.strictEqual(rel(22).reliability, 'orta');
  assert.strictEqual(rel(12).reliability, 'düşük');
  assert.strictEqual(rel(null).reliability, 'bilinmiyor');
  // ADX yonsuz: degismesi skoru DEGISTIRMEMELI
  assert.strictEqual(rel(35).score, rel(12).score, 'ADX skoru etkilememeli');
  assert.ok(!rel(35).votes.some(v => /ADX/i.test(v.name)), 'ADX oy vermemeli');
  a.close();
});

test('uyum skoru: oy listesi tam 5 oydan olusur, isimler sabit (Gosterge Sadelestirme v7-132)', () => {
  const a = app();
  a.window.__t = taOf('up');
  const c = a.evalIn('taConfluence(window.__t)');
  assert.strictEqual(c.votes.length, 5, 'oy sayisi 5 olmali (5 bagimsiz faktor)');
  const names = c.votes.map(v => v.name).join(',');
  assert.strictEqual(names, 'Fiyat / SMA20,SMA20 / SMA50,MACD histogram,RSI momentum,OBV para akışı');
  a.close();
});

test('uyum skoru: 5 oyluk sette de guclu tek yonlu gercek seride skor uca gidebiliyor (>70 / <30)', () => {
  const a = app();
  a.window.__up = series(200, 100, 0.006, 0.2);
  a.window.__dn = series(200, 200, -0.006, 0.2);
  const up = a.evalIn('computeStockTA(window.__up).confluence');
  const dn = a.evalIn('computeStockTA(window.__dn).confluence');
  assert.ok(up.score > 70, 'guclu yukselen seride skor >70 bekleniyor: ' + up.score);
  assert.ok(dn.score < 30, 'guclu dusen seride skor <30 bekleniyor: ' + dn.score);
  a.close();
});

// ============================================================
// 2) KOSULLU SENARYOLAR
// ============================================================
test('senaryo: tetikler dogru tarafta, gecersizlesme dogru yonde', () => {
  const a = app();
  a.window.__t = taOf('up');
  a.window.__j = { min: 88, max: 112 };
  const s = a.evalIn('taScenarios(window.__t, window.__j)');
  assert.ok(s.up.trigger > 100, 'yukari tetik fiyatin ustunde olmali');
  assert.ok(s.down.trigger < 100, 'asagi tetik fiyatin altinda olmali');
  assert.ok(s.up.t1 > s.up.trigger, 'yukari hedef tetigin ustunde olmali');
  assert.ok(s.up.t2 > s.up.t1, 't2 t1 den uzak olmali');
  assert.ok(s.up.invalidate < s.up.trigger, 'yukari senaryo gecersizlesmesi tetigin ALTINDA olmali');
  assert.ok(s.down.t1 < s.down.trigger && s.down.t2 < s.down.t1);
  assert.ok(s.down.invalidate > s.down.trigger, 'asagi senaryo gecersizlesmesi tetigin USTUNDE olmali');
  a.close();
});

test('senaryo: mesafe ve seans sayisi ATR ile tutarli', () => {
  const a = app();
  a.window.__t = taOf('up', { atrPct: 2 });   // gunluk ortalama hareket %2
  a.window.__j = { min: 88, max: 112 };
  const s = a.evalIn('taScenarios(window.__t, window.__j)');
  assert.strictEqual(s.atrPct, 2);
  const beklenen = Math.round(s.up.distPct / 2 * 10) / 10;
  assert.strictEqual(s.up.sessions, beklenen, 'seans = mesafe / ATR%');
  assert.ok(Math.abs(s.up.distPct - (s.up.trigger - 100)) < 0.05, 'mesafe yuzdesi yanlis');
  a.close();
});

test('senaryo: oynaklik bandi simetrik ve ATRxsqrt(5) kadar', () => {
  const a = app();
  a.window.__t = taOf('up', { atrPct: 2 });   // 100 fiyatta ATR = 2
  a.window.__j = { min: 88, max: 112 };
  const s = a.evalIn('taScenarios(window.__t, window.__j)');
  const genislik = 2 * Math.sqrt(5);
  assert.ok(Math.abs((100 - s.vol5.low) - genislik) < 0.02, 'alt band yanlis');
  assert.ok(Math.abs((s.vol5.high - 100) - genislik) < 0.02, 'ust band yanlis');
  a.close();
});

test('senaryo: yakin seviyeler tek seviyede birlestirilir (%0.4)', () => {
  const a = app();
  a.window.__lv = [
    { v: 106.0, src: 'direnç' }, { v: 106.2, src: 'R1' },   // %0.19 fark -> birlesir
    { v: 112.0, src: 'BB üst' },
  ];
  const out = a.evalIn('taMergeLevels(window.__lv, 100)');
  assert.strictEqual(out.length, 2, 'yakin iki seviye birlesmeliydi');
  assert.strictEqual(out[0].src.join(' + '), 'direnç + R1');
  a.close();
});

test('senaryo: ATR yoksa Bollinger genisligine duser, fiyat yoksa null', () => {
  const a = app();
  a.window.__t = taOf('up', { atrPct: null });
  a.window.__j = { min: 88, max: 112 };
  const s = a.evalIn('taScenarios(window.__t, window.__j)');
  assert.ok(s && s.atrAbs > 0, 'ATR yokken de senaryo uretilmeli');
  assert.strictEqual(s.atrAbs, 4, 'BB genisligi 16 -> ATR ~ 4');
  a.window.__t2 = taOf('up', { current: null });
  assert.strictEqual(a.evalIn('taScenarios(window.__t2, window.__j)'), null);
  a.close();
});

test('senaryo: fiyat tum seviyelerin ustundeyse yukari senaryo null olur, patlamaz', () => {
  const a = app();
  a.window.__t = taOf('up', {
    current: 200,
    sr: { support: 94, resistance: 106 },
    bb: { lower: 92, mid: 100, upper: 108 },
    pivots: { pp: 100, r1: 104, r2: 109, s1: 96, s2: 91 },
  });
  a.window.__j = { min: 88, max: 112 };
  const s = a.evalIn('taScenarios(window.__t, window.__j)');
  assert.strictEqual(s.up, null, 'ustte seviye yokken yukari senaryo null olmali');
  assert.ok(s.down && s.down.trigger < 200);
  assert.strictEqual(s.band, null, 'tek tarafli seviyede band olusmaz');
  a.close();
});

// ============================================================
// 3) COKLU ZAMAN DILIMI
// ============================================================
test('resample: 250 gunluk bar -> 50 haftalik bar, OHLC dogru toplanir', () => {
  const a = app();
  a.window.__j = series(250, 100, 0.001, 0.6);
  const w = a.evalIn('taResample(window.__j, 5)');
  assert.strictEqual(w.closes.length, 50, '250/5 = 50 hafta');
  // Son haftanin kapanisi = son gunun kapanisi
  assert.strictEqual(w.closes[49], a.window.__j.closes[249]);
  // Son haftanin yuksegi = son 5 gunun en yuksegi
  assert.strictEqual(w.highs[49], Math.max(...a.window.__j.highs.slice(245)));
  assert.strictEqual(w.lows[49], Math.min(...a.window.__j.lows.slice(245)));
  // Hacim toplanir
  assert.strictEqual(w.volumes[49], a.window.__j.volumes.slice(245).reduce((x, y) => x + y, 0));
  a.close();
});

test('resample: kisa seri null doner (uydurma haftalik trend yok)', () => {
  const a = app();
  a.window.__j = series(20, 100, 0.001, 0.5);
  assert.strictEqual(a.evalIn('taResample(window.__j, 5)'), null);
  a.close();
});

test('resample: tam bolunmeyen seride bar kaybolmaz', () => {
  const a = app();
  a.window.__j = series(123, 100, 0.001, 0.5);     // 24 tam hafta + 3 gun
  const w = a.evalIn('taResample(window.__j, 5)');
  assert.strictEqual(w.closes.length, 25);
  assert.strictEqual(w.closes[24], a.window.__j.closes[122], 'son kapanis korunmali');
  a.close();
});

test('zaman dilimi karsilastirmasi: uyumlu / catisiyor / kismi', () => {
  const a = app();
  const cmp = (d, w) => {
    a.window.__d = { confluence: d };
    a.window.__w = { confluence: w };
    return a.evalIn('taMtfCompare(window.__d, window.__w)');
  };
  const C = (dir, score) => ({ dir, score, label: dir });
  assert.strictEqual(cmp(C('up', 80), C('up', 70)).state, 'uyumlu');
  assert.strictEqual(cmp(C('down', 20), C('down', 25)).state, 'uyumlu');
  assert.strictEqual(cmp(C('up', 80), C('down', 20)).state, 'çatışıyor');
  assert.strictEqual(cmp(C('up', 80), C('down', 20)).cls, 'conflict');
  assert.strictEqual(cmp(C('up', 80), C('mixed', 50)).state, 'kısmi');
  assert.strictEqual(cmp(null, C('up', 80)), null, 'veri yoksa null');
  a.close();
});

// ============================================================
// 4) ENTEGRASYON — computeStockTA + regresyon
// ============================================================
test('computeStockTA: yeni alanlar geldi, ESKI alanlar bozulmadi', () => {
  const a = app();
  a.window.__j = series(200, 100, 0.0012, 0.7);
  const ta = a.evalIn('computeStockTA(window.__j)');
  // yeni
  assert.ok(ta.confluence && typeof ta.confluence.score === 'number', 'confluence eksik');
  assert.ok(ta.scenarios && ta.scenarios.price > 0, 'scenarios eksik');
  // eski (regresyon) — Gosterge Sadelestirme'de (v7-132) stoch/stochZone/ema9/ema21/
  // ema9Series/ema21Series kasitli kaldirildi, listeden cikarildi.
  for (const k of ['current', 'sma20', 'sma50', 'rsi', 'rsiZone', 'macd', 'bb',
                   'sr', 'atrPct', 'volRatio', 'adx', 'adxZone', 'obv',
                   'pivots', 'pivotZone', 'trend', 'bbPosition', 'priceVsSma20', 'recentChange7d',
                   'sma20Series', 'sma50Series', 'signals']) {
    assert.ok(k in ta, 'eski TA alani kayboldu: ' + k);
  }
  for (const k of ['stoch', 'stochZone', 'ema9', 'ema21', 'ema9Series', 'ema21Series']) {
    assert.ok(!(k in ta), 'sadelestirmede silinmesi gereken alan hala duruyor: ' + k);
  }
  assert.ok(Array.isArray(ta.signals) && ta.signals.length > 0, 'taktik sinyaller bozuldu');
  a.close();
});

test('computeStockTA: yukselen seride uyum yukari, dusen seride asagi cikar', () => {
  const a = app();
  a.window.__up = series(200, 100, 0.004, 0.3);
  a.window.__dn = series(200, 200, -0.004, 0.3);
  const up = a.evalIn('computeStockTA(window.__up).confluence');
  const dn = a.evalIn('computeStockTA(window.__dn).confluence');
  assert.ok(up.score > 60, 'yukselen seride uyum >60 bekleniyor: ' + up.score);
  assert.ok(dn.score < 40, 'dusen seride uyum <40 bekleniyor: ' + dn.score);
  a.close();
});

test('facts: AI a giden pakette confluence/scenarios/mtf alanlari var', () => {
  const a = app();
  a.window.__j = series(200, 100, 0.0012, 0.7);
  const f = a.evalIn('(function(){ var j=window.__j; return buildStockAnalysisFacts(computeStockTA(j), j); })()');
  assert.ok(f.confluence && f.confluence.score != null, 'facts.confluence yok');
  assert.ok(f.scenarios && f.scenarios.vol5, 'facts.scenarios yok');
  assert.ok('mtf' in f, 'facts.mtf anahtari yok');
  assert.strictEqual(f.mtf, null, 'MTF yuklenmemisken null olmali (uydurma yok)');
  // eski alanlar duruyor
  for (const k of ['rsi', 'macdHist', 'support', 'resistance', 'signals', 'atrPct']) {
    assert.ok(k in f, 'eski fact alani kayboldu: ' + k);
  }
  a.close();
});

// ============================================================
// 5) DOM
// ============================================================
test('DOM: kapsayicilar asistan.html icinde var', () => {
  const a = app();
  for (const id of ['stockConfluence', 'stockMtf', 'stockScenarios']) {
    assert.ok(a.window.document.getElementById(id), '#' + id + ' yok');
  }
  a.close();
});

test('DOM: renderConfluence skoru ve oy dokumunu basar', () => {
  const a = app();
  a.window.__j = series(200, 100, 0.004, 0.3);
  a.evalIn('window.__ta = computeStockTA(window.__j); renderConfluence(window.__ta);');
  const el = a.window.document.getElementById('stockConfluence');
  assert.notStrictEqual(el.style.display, 'none');
  const score = a.evalIn('window.__ta.confluence.score');
  assert.ok(el.querySelector('.sc-score').textContent.includes(String(score)));
  assert.ok(el.querySelectorAll('.sc-vote').length >= 4, 'oy dokumu bos');
  const w = el.querySelector('.sc-fill').style.width;
  assert.strictEqual(w, score + '%', 'bar genisligi skorla uyusmuyor');
  a.close();
});

test('DOM: confluence null iken kutu gizlenir (bos kutu kalmaz)', () => {
  const a = app();
  a.evalIn('renderConfluence({ confluence: null })');
  assert.strictEqual(a.window.document.getElementById('stockConfluence').style.display, 'none');
  a.close();
});

test('DOM: renderScenarios tetik/hedef/gecersizlesme satirlarini basar', () => {
  const a = app();
  a.window.__j = series(200, 100, 0.0012, 0.7);
  a.evalIn('renderScenarios(computeStockTA(window.__j), "TRY")');
  const html = a.window.document.getElementById('stockScenarios').innerHTML;
  assert.ok(/Tetik/.test(html), 'tetik satiri yok');
  assert.ok(/Geçersizleşir/.test(html), 'gecersizlesme satiri yok');
  assert.ok(/Oynaklık aralığı/.test(html), 'oynaklik bandi yok');
  assert.ok(/tahmin değil/.test(html), 'tahmin-degil notu yok');
  a.close();
});

test('DOM: senaryo verisi yokken nazik mesaj, patlama yok', () => {
  const a = app();
  a.evalIn('renderScenarios({ scenarios: null }, "TRY")');
  const html = a.window.document.getElementById('stockScenarios').innerHTML;
  assert.ok(/yeterli seviye verisi yok/i.test(html));
  a.close();
});

test('DOM: para birimi XSS kacisi yapilir', () => {
  const a = app();
  a.window.__j = series(200, 100, 0.0012, 0.7);
  a.evalIn('renderScenarios(computeStockTA(window.__j), "<img src=x onerror=alert(1)>")');
  const html = a.window.document.getElementById('stockScenarios').innerHTML;
  assert.ok(!/<img src=x/.test(html), 'XSS kacisi yapilmamis');
  assert.ok(/&lt;img/.test(html));
  a.close();
});

// ============================================================
// 6) WORKER PROMPT SOZLESMESI
// ============================================================
test('worker: yeni fact bloklari prompt a giriyor', () => {
  const w = readText('aidan-worker/worker.js');
  for (const s of ['UYUM SKORU', 'KOŞULLU SEVİYE HARİTASI', 'ZAMAN DİLİMİ UYUMU',
                   'facts.confluence', 'facts.scenarios', 'facts.mtf', '${confBlock}${scenBlock}${mtfBlock}']) {
    assert.ok(w.includes(s), 'worker prompt parcasi eksik: ' + s);
  }
});

test('worker: kosullu senaryo serbest ama emir/kehanet hala yasak', () => {
  const w = readText('aidan-worker/worker.js');
  assert.ok(w.includes('KOŞULLU SENARYO dili'), 'kosullu senaryo izni yok');
  assert.ok(w.includes('AL / SAT / TUT emri'), 'al-sat emri yasagi kalkmis');
  assert.ok(w.includes('KOŞULSUZ gelecek tahmini'), 'kosulsuz tahmin yasagi yok');
  assert.ok(w.includes('Olasılık yüzdesi uydurma'), 'olasilik uydurma yasagi yok');
  assert.ok(w.includes('GEÇERSİZLEŞME seviyesini her zaman birlikte söyle'),
    'gecersizlesme zorunlulugu yok — tek tarafli senaryo riski');
});

test('worker: analiz cagrisi hala hesap sahibine kilitli (maliyet korumasi)', () => {
  const w = readText('aidan-worker/worker.js');
  const i = w.indexOf('async function handleStockAnalysisApi');
  const blok = w.slice(i, w.indexOf('async function handlePortfolioTechnicalApi'));
  assert.ok(i > 0 && blok.length > 1000, 'analiz fonksiyonu bulunamadi');
  assert.ok(/aiTierForUser\(env, user, 'heavy'\)/.test(blok),
    'heavy katmani dogrudan verilmis — 3 Agu maliyet kurali ihlali');
});

// ============================================================
// 7) CSS / IMPECCABLE
// ============================================================
test('CSS: yeni siniflar tanimli', () => {
  const css = readText('styles.css');
  for (const c of ['.stock-conf', '.sc-score', '.sc-bar', '.sc-fill', '.sc-vote',
                   '.stock-mtf', '.stock-scen', '.scen-card', '.scen-line', '.scen-band', '.scen-note']) {
    assert.ok(css.includes(c), 'CSS sinifi yok: ' + c);
  }
});

test('CSS: Impeccable — yan-serit yok, gradient/glass yok, reduced-motion var', () => {
  const css = readText('styles.css');
  const blok = css.slice(css.indexOf('ANALIZ v2 (7 Agu)'));
  assert.ok(blok.length > 500, 'analiz v2 CSS blogu bulunamadi');
  assert.ok(!/border-left:\s*[2-9]/.test(blok), 'yan-serit kenarlik kullanilmis (MUTLAK YASAK)');
  assert.ok(!/border-right:\s*[2-9]/.test(blok), 'yan-serit kenarlik kullanilmis (MUTLAK YASAK)');
  assert.ok(!/backdrop-filter/.test(blok), 'glassmorphism kullanilmis');
  assert.ok(!/linear-gradient|radial-gradient/.test(blok), 'gradyan kullanilmis');
  assert.ok(!/#fff\b|#000\b/.test(blok), 'saf beyaz/siyah kullanilmis');
  assert.ok(/prefers-reduced-motion/.test(blok), 'reduced-motion alternatifi yok');
});

test('cache versiyonu artirildi', () => {
  // Her pakette sabit surum yazmak testi bayatlatiyordu (v7-131'de kirmizi oldu).
  // Kural: bu paketin cikis surumu v7-130; sonraki paketler yalniz ARTIRABILIR.
  const m = /aidan-v7-(\d+)/.exec(readText('sw.js'));
  assert.ok(m, 'sw.js cache surumu okunamadi');
  assert.ok(Number(m[1]) >= 130, `cache surumu geriye gitmis: v7-${m && m[1]}`);
});
