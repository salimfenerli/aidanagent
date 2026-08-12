// ============ BORSA ============
// data.watchlist = [{ symbol, ySymbol, market, name, price, prevClose, changePct, currency,
//                     alarmAbove, alarmBelow, lastAlertedAbove, lastAlertedBelow, qty, cost, fetchedAt, error }]
const STOCKS_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/stocks';
const STOCK_HISTORY_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/stock-history';
const STOCK_ANALYSIS_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/stock-analysis';
const PF_TECHNICAL_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/portfolio-technical';
const STOCK_NEWS_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/stock-news';
const STOCK_FUND_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/stock-fundamentals';
let _stockChartIdx = null;
let _stockChartRange = '1mo';
let _stockChartPayload = null;
let _stockChartMode = 'line';   // 'line' | 'candle' — modal grafik tipi
let _stockChartFib = false;     // Fibonacci overlay açık mı
let _stockNewsLoaded = false;   // haber sekmesi bu açılışta çekildi mi
let _stockNewsItems = [];       // [{title,publisher,link,time}] — AI özet için
let _stockFundLoaded = false;   // temel veri bu açılışta çekildi mi
let _stockFundData = null;      // {trailingPE, priceToBook, ...}
let _stockBuffett = null;       // son hesaplanan Buffett skoru (AI faktlarına da gider)
let _stockDeepFin = null;       // İş Yatırım 10 yıllık veri durumu (BIST kartı)
// Teknik analiz sadece hisselerde (BIST + ABD) anlamlı — döviz/kripto'da panel gizli
const TA_MARKETS = new Set(['bist', 'abd']);

let selectedMarket = 'bist';
const MARKET_PLACEHOLDERS = {
  bist:   'THYAO, GARAN, ASELS, TUPRS',
  abd:    'AAPL, TSLA, NVDA, MSFT',
  fx:     'USDTRY, EURUSD, GBPTRY',
  crypto: 'BTC, ETH, BNB, SOL',
};

function selectMarket(m) {
  selectedMarket = m;
  document.querySelectorAll('.market-chip').forEach(el => el.classList.toggle('active', el.dataset.market === m));
  const inp = document.getElementById('stockSymInput');
  if (inp) inp.placeholder = MARKET_PLACEHOLDERS[m] || '';
}

// Kullanıcı girişini Yahoo Finance sembolüne çevirir
function toYahooSymbol(sym, market) {
  const s = sym.trim().toUpperCase();
  switch (market) {
    case 'bist':
      return (s.includes('.') || s.includes('=') || s.includes('-')) ? s : s + '.IS';
    case 'abd':
      return s; // AAPL, TSLA — Yahoo'da suffix yok
    case 'fx':
      return s.endsWith('=X') ? s : s + '=X'; // USDTRY → USDTRY=X
    case 'crypto':
      return s.includes('-') ? s : s + '-USD'; // BTC → BTC-USD
    default:
      return s;
  }
}

// Eski watchlist ögeleri (ySymbol alanı yoksa) için geriye dönük fallback
function legacyYSymbol(w) {
  if (w.ySymbol) return w.ySymbol;
  const s = (w.symbol || '').trim().toUpperCase();
  if (s.includes('.') || s.includes('=') || s.includes('-')) return s;
  return s + '.IS'; // eski BIST girişleri .IS'siz kaydedilmişti
}

function addStock() {
  const inp = document.getElementById('stockSymInput');
  const raw = (inp.value || '').trim().toUpperCase().replace(/[^A-Z0-9.=-]/g, '');
  if (!raw) return;
  const market = selectedMarket || 'bist';
  const ySymbol = toYahooSymbol(raw, market);
  data.watchlist = data.watchlist || [];
  if (data.watchlist.some(w => w.symbol === raw)) {
    showToast(`${raw} zaten listede`, 'info', 2000);
    inp.value = '';
    return;
  }
  data.watchlist.unshift({
    symbol: raw, ySymbol, market,
    name: raw, price: null, prevClose: null, changePct: null, currency: 'TRY',
    alarmAbove: null, alarmBelow: null, alarmPctDown: null, lastAlertedAbove: false, lastAlertedBelow: false, lastAlertedPct: false,
    qty: null, cost: null,
    fetchedAt: null, error: null
  });
  inp.value = '';
  save();
  renderStocks();
  refreshStocks(); // hemen fiyat çek
}

function removeStock(sym) {
  data.watchlist = (data.watchlist || []).filter(w => w.symbol !== sym);
  save();
  renderStocks();
}

async function setStockAlarm(sym) {
  const w = (data.watchlist || []).find(x => x.symbol === sym);
  if (!w) return;
  const cur = w.price != null ? ` (şu an ${formatStockPrice(w.price)})` : '';
  const above = await aidanPrompt(`${sym} — üst alarm`, `Bu fiyatın ÜSTÜNE çıkınca haber ver${cur}. Boş = alarm yok.`, w.alarmAbove != null ? String(w.alarmAbove) : '');
  if (above === null) return; // iptal
  const below = await aidanPrompt(`${sym} — alt alarm`, `Bu fiyatın ALTINA inince haber ver. Boş = alarm yok.`, w.alarmBelow != null ? String(w.alarmBelow) : '');
  if (below === null) return;
  const pctDown = await aidanPrompt(`${sym} — günlük düşüş alarmı`, `Bugün yüzde kaç DÜŞERSE haber vereyim? Örn: 5 = %5 düşüş. Boş = kapalı.`, w.alarmPctDown != null ? String(w.alarmPctDown) : '');
  if (pctDown === null) return;
  const parseNum = (s) => {
    s = (s || '').trim().replace(',', '.');
    if (!s) return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };
  w.alarmAbove = parseNum(above);
  w.alarmBelow = parseNum(below);
  w.alarmPctDown = parseNum(pctDown);
  w.lastAlertedAbove = false;
  w.lastAlertedBelow = false;
  w.lastAlertedPct = false;
  save();
  renderStocks();
  if (w.alarmAbove != null || w.alarmBelow != null || w.alarmPctDown != null) {
    showToast(`${sym} alarmı kuruldu`, 'success', 2500);
  } else {
    showToast(`${sym} alarmı kapatıldı`, 'info', 2000);
  }
}

function formatStockPrice(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function refreshStocks() {
  const wl = data.watchlist || [];
  if (!wl.length) { renderStocks(); return; }
  const btn = document.getElementById('stocksRefreshBtn');
  if (btn) btn.classList.add('spinning');
  try {
    if (!window._supa || !window._user) {
      showToast('Fiyatlar için bulut girişi gerekli — Ayarlar → giriş yap', 'warning', 4000);
      return;
    }
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum yok');
    // Her hisse için display (kullanıcı görmesi) + yahoo (API) sembol çifti gönder
    const entries = wl.map(w => ({ display: w.symbol, yahoo: legacyYSymbol(w) }));
    const r = await fetch(STOCKS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ entries }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('hata ' + r.status));
    const bySym = {};
    (j.quotes || []).forEach(q => { bySym[q.symbol] = q; }); // q.symbol = display sembolü
    wl.forEach(w => {
      const q = bySym[w.symbol];
      if (!q) return;
      if (q.error) { w.error = q.error; return; }
      w.error = null;
      w.name = q.name || w.name;
      w.price = q.price;
      w.prevClose = q.prevClose;
      w.changePct = q.changePct;
      w.currency = q.currency || w.currency;
      w.fetchedAt = j.at || Date.now();
    });
    recordPortfolioSnapshot(); // güncel fiyatlarla bugünün portföy değerini kaydet
    save();
    renderStocks();
  } catch (e) {
    showToast('Borsa güncellenemedi: ' + e.message, 'error', 4000);
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

// Bugünün portföy değerini geçmişe kaydet (para birimi başına value+cost). Upsert by date.
function recordPortfolioSnapshot() {
  const holdings = (data.watchlist || []).filter(w => w.qty != null && w.qty > 0 && w.cost != null);
  if (!holdings.length) return;
  const byCur = {};
  let anyPrice = false;
  for (const w of holdings) {
    const cur = w.currency || 'TRY';
    if (!byCur[cur]) byCur[cur] = { value: 0, cost: 0 };
    byCur[cur].cost += w.qty * w.cost;
    if (w.price != null) { byCur[cur].value += w.qty * w.price; anyPrice = true; }
    else byCur[cur].value += w.qty * w.cost; // fiyat yoksa maliyetle (nötr)
  }
  if (!anyPrice) return; // hiç fiyat yoksa anlamsız snapshot alma
  const d = today();
  data.portfolioHistory = data.portfolioHistory || [];
  const existing = data.portfolioHistory.find(s => s.date === d);
  if (existing) existing.byCur = byCur;
  else data.portfolioHistory.push({ date: d, byCur });
  data.portfolioHistory.sort((a, b) => a.date < b.date ? -1 : 1);
  if (data.portfolioHistory.length > 180) data.portfolioHistory = data.portfolioHistory.slice(-180);
  // not: save() çağıran taraf yapar
}

function stocksUpdatedLabel() {
  const wl = data.watchlist || [];
  const times = wl.map(w => w.fetchedAt).filter(Boolean);
  if (!times.length) return 'Henüz güncellenmedi';
  const latest = Math.max(...times);
  const min = Math.floor((Date.now() - latest) / 60000);
  if (min < 1) return 'Az önce güncellendi';
  if (min < 60) return `${min} dk önce güncellendi`;
  const d = new Date(latest);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} güncellendi`;
}

// BIST dışı piyasalar için küçük bayrak/sembol rozeti (BIST için gösterilmez, varsayılan zaten o)
function marketBadge(market) {
  const map = { abd: '🇺🇸', fx: '$', crypto: '₿' };
  return map[market] ? `<span class="stock-market-badge">${map[market]}</span>` : '';
}

// Piyasa açık mı? (cihaz saati TR varsayımı — uygulama geneliyle tutarlı)
// BIST 10-18 hafta içi · ABD 16:30-23:00 hafta içi · Döviz hafta içi · Kripto 7/24
function isMarketOpen(market, now) {
  now = now || new Date();
  const day = now.getDay();            // 0=Pazar .. 6=Cumartesi
  const wd = day >= 1 && day <= 5;     // hafta içi
  const hm = now.getHours() * 60 + now.getMinutes();
  if (market === 'crypto') return true;
  if (market === 'fx') return wd;
  if (market === 'abd') return wd && hm >= 16 * 60 + 30 && hm < 23 * 60;
  return wd && hm >= 10 * 60 && hm < 18 * 60; // bist (varsayılan)
}

// Watchlist'teki piyasalara göre açık/kapalı/kısmen rozeti
function marketStatusBadge() {
  const wl = data.watchlist || [];
  if (!wl.length) return '';
  const markets = [...new Set(wl.map(w => w.market || 'bist'))];
  const openCount = markets.filter(m => isMarketOpen(m)).length;
  if (openCount === markets.length) return `<span class="mkt-status open">🟢 Piyasa açık</span>`;
  if (openCount === 0) return `<span class="mkt-status closed">🔴 Piyasa kapalı</span>`;
  return `<span class="mkt-status partial">🟡 Kısmen açık</span>`;
}

// Etiket + rozet metnini ağ çağrısı yapmadan tazele (canlı his)
function updateStocksMeta() {
  const upd = document.getElementById('stocksUpdated');
  if (upd) upd.textContent = stocksUpdatedLabel();
  const ms = document.getElementById('marketStatus');
  if (ms) ms.innerHTML = marketStatusBadge();
}

function renderStocks() {
  const list = document.getElementById('stocksList');
  const upd = document.getElementById('stocksUpdated');
  if (!list) return;
  const wl = data.watchlist || [];
  updateStocksMeta();
  renderPortfolioSummary();
  renderPortfolioPie();
  renderPortfolioHistory();
  renderPortfolioRisk();
  renderBist100Compare();
  renderScreener();
  renderTradeJournal();
  const _hasHoldings = (data.watchlist || []).some(w => w.qty != null && w.qty > 0 && w.cost != null);
  const _hasTaHoldings = (data.watchlist || []).some(w =>
    w.qty != null && w.qty > 0 && w.cost != null && TA_MARKETS.has(w.market || 'bist')
  );
  const _cb = document.getElementById('pfCommentBtn');
  if (_cb) _cb.style.display = _hasHoldings ? 'flex' : 'none';
  const _tb = document.getElementById('pfTechBtn');
  if (_tb) _tb.style.display = _hasTaHoldings ? 'flex' : 'none';
  if (wl.length === 0) {
    list.innerHTML = '<div class="stocks-empty">Henüz hisse yok.<br>Yukarıdan BIST kodu ekle (örn THYAO).<br>Fiyatını gör, pozisyon gir, alarm kur</div>';
    return;
  }
  list.innerHTML = wl.map((w, idx) => {
    const dir = w.changePct == null ? 'flat' : (w.changePct > 0 ? 'up' : (w.changePct < 0 ? 'down' : 'flat'));
    const cardDir = dir === 'flat' ? '' : dir;
    const sign = w.changePct == null ? '' : (w.changePct > 0 ? '+' : '');
    const alarmBadges = [];
    if (w.alarmAbove != null) alarmBadges.push(`<span class="stock-alarm-badge">▲ ${formatStockPrice(w.alarmAbove)}</span>`);
    if (w.alarmBelow != null) alarmBadges.push(`<span class="stock-alarm-badge">▼ ${formatStockPrice(w.alarmBelow)}</span>`);
    if (w.alarmPctDown != null) alarmBadges.push(`<span class="stock-alarm-badge">▼ %${w.alarmPctDown}</span>`);

    // Pozisyon (holding) — adet + ortalama maliyet
    let positionHtml = '';
    if (w.qty != null && w.qty > 0 && w.cost != null) {
      const costBasis = w.qty * w.cost;
      let plHtml = '';
      if (w.price != null) {
        const value = w.qty * w.price;
        const pl = value - costBasis;
        const plPct = costBasis > 0 ? (pl / costBasis) * 100 : 0;
        const pdir = pl > 0 ? 'up' : (pl < 0 ? 'down' : 'flat');
        const psign = pl > 0 ? '+' : '';
        plHtml = `
          <div class="stock-position-pl ${pdir}">
            <div class="stock-position-pl-val">${psign}${formatStockPrice(pl)} ${escapeHtml(w.currency||'TL')}</div>
            <div class="stock-position-pl-pct">${psign}${plPct.toFixed(2)}% · ${formatStockPrice(value)}</div>
          </div>`;
      }
      positionHtml = `
        <div class="stock-position">
          <div class="stock-position-info"><b>${formatLot(w.qty)}</b> adet × <b>${formatStockPrice(w.cost)}</b> maliyet</div>
          ${plHtml}
        </div>`;
    }

    return `
      <div class="stock-card ${cardDir}" onclick="openStockChart(${idx})" title="Grafiği aç">
        <div class="stock-card-top">
          <div>
            <div class="stock-sym">${escapeHtml(w.symbol)}${marketBadge(w.market)}</div>
            <div class="stock-name">${escapeHtml(w.name || '')}</div>
          </div>
          <div class="stock-price-wrap">
            <div class="stock-price">${w.price != null ? formatStockPrice(w.price) + ' <span style="font-size:0.7em;color:var(--text-faint);">' + escapeHtml(w.currency||'') + '</span>' : '—'}</div>
            ${w.changePct != null ? `<div class="stock-change ${dir}">${sign}${w.changePct.toFixed(2)}%</div>` : ''}
          </div>
        </div>
        ${w.error ? `<div class="stock-err">${escapeHtml(w.error)} — kod doğru mu?</div>` : ''}
        ${positionHtml}
        <div class="stock-card-bottom">
          ${alarmBadges.join('')}
          <div class="stock-actions" onclick="event.stopPropagation()">
            <button class="pos" onclick="setPosition('${w.symbol}')" title="Pozisyon (adet + maliyet)"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>${w.qty != null && w.qty > 0 ? 'Pozisyon' : 'Pozisyon ekle'}</button>
            <button onclick="setStockAlarm('${w.symbol}')" title="Alarm kur"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>Alarm</button>
            <button class="del" onclick="removeStock('${w.symbol}')" title="Listeden çıkar"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function formatLot(n) {
  if (n == null) return '—';
  // Tam sayıysa ondalık gösterme
  return Number.isInteger(n) ? String(n) : Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 4 });
}

// ===== 📓 İŞLEM GÜNLÜĞÜ (v7-114) — süreç + disiplin, sinyal DEĞİL =====
// data.trades = [{id, symbol, market, side:'long'|'short', entry, stop, target, qty,
//   reason, emotion, note, opened, status:'open'|'closed', exit, closed, pnl, r}]  (son 200)
// Al/sat tavsiyesi ve fiyat tahmini YOK — sadece kendi işlemini kaydet + veriyle gör.
const TJ_SETUPS = { kirilim: 'Kırılım', pullback: 'Geri çekilme', trend: 'Trend', temel: 'Temel/haber', diger: 'Diğer' };
const TJ_EMOTIONS = { plan: 'Plana uygun', sakin: 'Sakin', fomo: 'FOMO', intikam: 'İntikam' };
let _tj = { side: 'long', reason: null, emotion: null };

function ensureTrades() { data.trades = data.trades || []; return data.trades; }

// Hisse başına risk (giriş-stop mesafesi)
function tradeRiskPerShare(t) {
  if (t.stop == null || t.entry == null) return null;
  const d = Math.abs(t.entry - t.stop);
  return d > 0 ? d : null;
}
// Planlanan risk/ödül oranı
function tradeRR(t) {
  const rps = tradeRiskPerShare(t);
  if (rps == null || t.target == null) return null;
  return Math.round((Math.abs(t.target - t.entry) / rps) * 100) / 100;
}
// Kapanışta pnl + R katı
function computeTradeClose(t, exit) {
  const dir = t.side === 'short' ? -1 : 1;
  const rps = tradeRiskPerShare(t);
  const pnl = (t.qty != null && t.qty > 0) ? Math.round((exit - t.entry) * dir * t.qty * 100) / 100 : null;
  const r = (rps != null) ? Math.round(((exit - t.entry) * dir / rps) * 100) / 100 : null;
  return { pnl, r };
}
function isTradeWin(t) {
  if (t.r != null) return t.r > 0;
  if (t.pnl != null) return t.pnl > 0;
  return null;
}
function tradeStats() {
  const closed = ensureTrades().filter(t => t.status === 'closed');
  const withR = closed.filter(t => t.r != null);
  const wins = closed.filter(t => isTradeWin(t) === true).length;
  const decided = closed.filter(t => isTradeWin(t) !== null).length;
  const winRate = decided ? Math.round((wins / decided) * 100) : null;
  const avgR = withR.length ? Math.round((withR.reduce((a, t) => a + t.r, 0) / withR.length) * 100) / 100 : null;
  // En iyi setup (ort. R, min 2 işlem)
  const bySetup = {};
  withR.forEach(t => { const k = t.reason || 'diger'; (bySetup[k] = bySetup[k] || []).push(t.r); });
  let bestSetup = null, bestAvg = -Infinity;
  for (const k in bySetup) { if (bySetup[k].length >= 2) { const a = bySetup[k].reduce((x, y) => x + y, 0) / bySetup[k].length; if (a > bestAvg) { bestAvg = a; bestSetup = k; } } }
  // En kötü duygu (win rate, min 2 işlem)
  const byEmo = {};
  closed.filter(t => isTradeWin(t) !== null && t.emotion).forEach(t => { (byEmo[t.emotion] = byEmo[t.emotion] || []).push(isTradeWin(t) ? 1 : 0); });
  let worstEmo = null, worstRate = Infinity;
  for (const k in byEmo) { if (byEmo[k].length >= 2) { const a = byEmo[k].reduce((x, y) => x + y, 0) / byEmo[k].length; if (a < worstRate) { worstRate = a; worstEmo = k; } } }
  return { count: closed.length, winRate, avgR, bestSetup, bestAvg, worstEmo, worstRate: worstEmo ? Math.round(worstRate * 100) : null };
}
// Bugün açılan işlem sayısı (overtrading uyarısı)
function tradesOpenedToday() {
  const t = today();
  return ensureTrades().filter(x => (x.opened || '').slice(0, 10) === t).length;
}
// Son ardışık kapanan işlemlerde kayıp serisi
function tradeLossStreak() {
  const closed = ensureTrades().filter(t => t.status === 'closed' && isTradeWin(t) !== null)
    .sort((a, b) => (a.closed || '') < (b.closed || '') ? 1 : -1);
  let s = 0;
  for (const t of closed) { if (isTradeWin(t) === false) s++; else break; }
  return s;
}

function fmtR(r) { return (r > 0 ? '+' : '') + r + 'R'; }

function renderTradeJournal() {
  const el = document.getElementById('tradeJournal');
  if (!el) return;
  ensureTrades();
  const open = data.trades.filter(t => t.status === 'open');
  const closed = data.trades.filter(t => t.status === 'closed').sort((a, b) => (a.closed || '') < (b.closed || '') ? 1 : -1);
  const st = tradeStats();

  let statsHtml = '';
  if (st.count > 0) {
    const bits = [];
    if (st.winRate != null) bits.push(`<div class="tj-stat"><span class="tj-stat-v">%${st.winRate}</span><span class="tj-stat-l">isabet</span></div>`);
    if (st.avgR != null) bits.push(`<div class="tj-stat"><span class="tj-stat-v ${st.avgR >= 0 ? 'up' : 'down'}">${fmtR(st.avgR)}</span><span class="tj-stat-l">ort. R</span></div>`);
    bits.push(`<div class="tj-stat"><span class="tj-stat-v">${st.count}</span><span class="tj-stat-l">işlem</span></div>`);
    let insight = '';
    if (st.bestSetup) insight += `<div class="tj-insight">En iyi setup: <b>${TJ_SETUPS[st.bestSetup] || st.bestSetup}</b> (${fmtR(Math.round(st.bestAvg * 100) / 100)})</div>`;
    if (st.worstEmo && st.worstRate != null) insight += `<div class="tj-insight warn">En çok kaybettiren: <b>${TJ_EMOTIONS[st.worstEmo] || st.worstEmo}</b> (%${st.worstRate} isabet)</div>`;
    statsHtml = `<div class="tj-stats">${bits.join('')}</div>${insight}`;
  }

  let openHtml = '';
  if (open.length) {
    openHtml = open.map(t => {
      const rr = tradeRR(t);
      const arrow = t.side === 'short' ? '▼ Short' : '▲ Long';
      return `<div class="tj-row open">
        <div class="tj-row-main">
          <span class="tj-sym">${escapeHtml(t.symbol)}</span>
          <span class="tj-side ${t.side}">${arrow}</span>
        </div>
        <div class="tj-row-meta">Giriş ${formatStockPrice(t.entry)} · Stop ${t.stop != null ? formatStockPrice(t.stop) : '—'}${t.target != null ? ' · Hedef ' + formatStockPrice(t.target) : ''}${rr != null ? ' · R/R ' + rr : ''}</div>
        <div class="tj-row-actions">
          <button class="tj-close-btn" onclick="closeTradePrompt(${t.id})">Kapat</button>
          <button class="tj-del-btn" onclick="deleteTrade(${t.id})" title="Sil">✕</button>
        </div>
      </div>`;
    }).join('');
  }

  let closedHtml = '';
  if (closed.length) {
    closedHtml = `<details class="tj-closed-wrap"><summary>Kapanan işlemler (${closed.length})</summary>` +
      closed.slice(0, 12).map(t => {
        const w = isTradeWin(t);
        const cls = w === true ? 'win' : (w === false ? 'loss' : '');
        const rTxt = t.r != null ? fmtR(t.r) : '';
        const pnlTxt = t.pnl != null ? `${t.pnl > 0 ? '+' : ''}${formatStockPrice(t.pnl)}` : '';
        return `<div class="tj-row closed ${cls}">
          <div class="tj-row-main"><span class="tj-sym">${escapeHtml(t.symbol)}</span><span class="tj-side ${t.side}">${t.side === 'short' ? 'S' : 'L'}</span>${t.reason ? `<span class="tj-tag">${TJ_SETUPS[t.reason] || t.reason}</span>` : ''}</div>
          <div class="tj-row-res ${cls}">${rTxt}${pnlTxt ? ' · ' + pnlTxt : ''}</div>
          <button class="tj-del-btn" onclick="deleteTrade(${t.id})" title="Sil">✕</button>
        </div>`;
      }).join('') + `</details>`;
  }

  el.innerHTML = `
    <div class="tj-head">
      <span class="tj-title"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z" fill="none"/><path d="M4 9h16M9 4v16"/></svg> İşlem Günlüğü</span>
      <button class="tj-add" onclick="openTradeModal()">+ İşlem aç</button>
    </div>
    ${statsHtml}
    ${openHtml}
    ${closedHtml}
    ${!open.length && !closed.length ? '<div class="tj-empty">Henüz işlem yok. Bir pozisyon açmadan önce "+ İşlem aç" ile kaydet — giriş, stop, neden ve duygu. Zamanla neyin işe yaradığını veriyle görürsün.</div>' : ''}
  `;
}

// ---- Modal ----
function tjPick(field, val, btn) {
  _tj[field] = val;
  const sib = btn.parentNode.children;
  for (const c of sib) c.classList.toggle('sel', c === btn);
  if (field === 'side') updateTradePreview();
}
function updateTradePreview() {
  const g = id => { const v = parseFloat((document.getElementById(id).value || '').replace(',', '.')); return isFinite(v) ? v : null; };
  const entry = g('tmEntry'), stop = g('tmStop'), target = g('tmTarget'), qty = g('tmQty');
  const el = document.getElementById('tmPreview');
  if (!el) return;
  if (entry == null || stop == null) { el.innerHTML = '<span class="tm-prev-hint">Giriş + stop gir → risk/ödül hesaplansın</span>'; return; }
  const rps = Math.abs(entry - stop);
  if (rps <= 0) { el.innerHTML = '<span class="tm-prev-hint">Stop girişe eşit olamaz</span>'; return; }
  const bits = [`Hisse başı risk: <b>${formatStockPrice(rps)}</b>`];
  if (qty != null && qty > 0) bits.push(`Toplam risk: <b>${formatStockPrice(rps * qty)}</b>`);
  if (target != null) {
    const rr = Math.round((Math.abs(target - entry) / rps) * 100) / 100;
    const good = rr >= 2;
    bits.push(`Risk/Ödül: <b class="${good ? 'up' : (rr < 1 ? 'down' : '')}">${rr}</b>${rr < 1 ? ' (ödül riskten küçük)' : ''}`);
  }
  el.innerHTML = bits.join(' · ');
}
function openTradeModal() {
  _tj = { side: 'long', reason: null, emotion: null };
  ['tmEntry', 'tmStop', 'tmTarget', 'tmQty', 'tmNote'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  const symEl = document.getElementById('tmSymbol'); if (symEl) symEl.value = '';
  // datalist doldur (watchlist sembolleri)
  const dl = document.getElementById('tmSymList');
  if (dl) dl.innerHTML = (data.watchlist || []).map(w => `<option value="${escapeHtml(w.symbol)}">`).join('');
  // chip reset
  document.querySelectorAll('#tmSideChips .tm-chip').forEach(c => c.classList.toggle('sel', c.dataset.v === 'long'));
  document.querySelectorAll('#tmReasonChips .tm-chip, #tmEmotionChips .tm-chip').forEach(c => c.classList.remove('sel'));
  // disiplin uyarısı
  const warn = document.getElementById('tmWarn');
  const opened = tradesOpenedToday(), streak = tradeLossStreak();
  let msg = '';
  const _slBad = (typeof lastNightSleep === 'function') && (function () { const s = lastNightSleep(); return s && (s.quality === 'bad' || (s.hours != null && s.hours < 6)); })();
  if (streak >= 3) msg = `Son ${streak} işlem zararlı — bir mola iyi gelebilir. Bu işlem kuralına uyuyor mu?`;
  else if (opened >= 3) msg = `Bugün zaten ${opened} işlem açtın — bu bir plan mı, yoksa hırs mı?`;
  else if (_slBad) msg = `Dün az/kötü uyudun — yorgunken karar kalitesi düşer, aceleci/impulsif işlemlere dikkat.`;
  if (warn) { warn.textContent = msg; warn.style.display = msg ? 'block' : 'none'; }
  updateTradePreview();
  const m = document.getElementById('tradeModal'); if (m) m.classList.add('active');
}
function closeTradeModal() { const m = document.getElementById('tradeModal'); if (m) m.classList.remove('active'); }
function saveTradeModal() {
  const num = id => { const v = parseFloat((document.getElementById(id).value || '').replace(',', '.')); return isFinite(v) ? v : null; };
  const symbol = (document.getElementById('tmSymbol').value || '').trim().toUpperCase();
  const entry = num('tmEntry'), stop = num('tmStop'), target = num('tmTarget'), qty = num('tmQty');
  if (!symbol) { showToast('Sembol gir (örn THYAO)', 'warning', 2500); return; }
  if (entry == null) { showToast('Giriş fiyatı gir', 'warning', 2500); return; }
  if (stop == null) { showToast('Stop gir — risksiz işlem yok', 'warning', 2800); return; }
  if (stop === entry) { showToast('Stop girişe eşit olamaz', 'warning', 2500); return; }
  const wl = (data.watchlist || []).find(w => w.symbol === symbol);
  ensureTrades();
  data.trades.unshift({
    id: Date.now(), symbol, market: wl ? wl.market : null, side: _tj.side,
    entry, stop, target, qty,
    reason: _tj.reason, emotion: _tj.emotion,
    note: (document.getElementById('tmNote').value || '').trim() || null,
    opened: new Date().toISOString(), status: 'open',
    exit: null, closed: null, pnl: null, r: null,
  });
  data.trades = data.trades.slice(0, 200);
  save(); closeTradeModal(); renderTradeJournal();
  showToast(`${symbol} işlemi açıldı — iyi şanslar, kuralına sadık kal`, 'success', 2600);
}
async function closeTradePrompt(id) {
  const t = ensureTrades().find(x => x.id === id);
  if (!t) return;
  const exIn = await aidanPrompt(`${t.symbol} — çıkış fiyatı`, `Pozisyonu kapattığın fiyat. Giriş ${formatStockPrice(t.entry)}, stop ${t.stop != null ? formatStockPrice(t.stop) : '—'}.`, '');
  if (exIn === null) return;
  const exit = parseFloat((exIn || '').trim().replace(',', '.'));
  if (!isFinite(exit) || exit <= 0) { showToast('Geçersiz fiyat', 'warning', 2500); return; }
  const { pnl, r } = computeTradeClose(t, exit);
  t.status = 'closed'; t.exit = exit; t.closed = new Date().toISOString(); t.pnl = pnl; t.r = r;
  save(); renderTradeJournal();
  const res = r != null ? fmtR(r) : (pnl != null ? (pnl > 0 ? '+' : '') + formatStockPrice(pnl) : '');
  showToast(`${t.symbol} kapandı: ${res}`, r != null && r < 0 ? 'info' : 'success', 3000);
}
function deleteTrade(id) {
  ensureTrades();
  data.trades = data.trades.filter(x => x.id !== id);
  save(); renderTradeJournal();
  showToast('İşlem silindi', 'info', 1800);
}

// Adet + ortalama maliyet gir → pozisyon
async function setPosition(sym) {
  const w = (data.watchlist || []).find(x => x.symbol === sym);
  if (!w) return;
  const qtyIn = await aidanPrompt(`${sym} — kaç adet?`, `Elindeki lot/adet sayısı. Boş = pozisyonu kaldır.`, w.qty != null ? String(w.qty) : '');
  if (qtyIn === null) return; // iptal
  const qtyStr = (qtyIn || '').trim().replace(',', '.');
  if (!qtyStr) {
    // Pozisyonu kaldır
    w.qty = null; w.cost = null;
    save(); renderStocks();
    showToast(`${sym} pozisyonu kaldırıldı`, 'info', 2000);
    return;
  }
  const qty = parseFloat(qtyStr);
  if (!isFinite(qty) || qty <= 0) { showToast('Geçersiz adet', 'warning', 2500); return; }
  const costIn = await aidanPrompt(`${sym} — ortalama maliyet`, `Ortalama alış fiyatın (lot başı TL).`, w.cost != null ? String(w.cost) : '');
  if (costIn === null) return;
  const cost = parseFloat((costIn || '').trim().replace(',', '.'));
  if (!isFinite(cost) || cost <= 0) { showToast('Geçersiz maliyet', 'warning', 2500); return; }
  w.qty = qty; w.cost = cost;
  save(); renderStocks();
  showToast(`${sym}: ${formatLot(qty)} adet × ${formatStockPrice(cost)}`, 'success', 3000);
}

// Toplam portföy özeti — sadece pozisyonu olan + fiyatı gelmiş hisseler
// ABD/döviz/kripto eklendiğinden beri portföy birden çok para biriminde olabilir → para birimine göre grupla
function renderPortfolioRisk() {
  const el = document.getElementById('portfolioRiskPanel');
  if (!el) return;
  const holdings = (data.watchlist || []).filter(w => w.qty != null && w.qty > 0 && w.price != null);
  if (holdings.length === 0) { el.style.display = 'none'; el.innerHTML = ''; return; }
  // mutasyonsuz satır listesi
  const rows = holdings.map(w => {
    const cur = w.currency || 'TRY';
    const value = w.qty * w.price;
    const stop = (w.alarmBelow != null && w.alarmBelow < w.price) ? w.alarmBelow : w.price * 0.92;
    return { sym: w.symbol, cur, value, risk: w.qty * (w.price - stop), market: w.market || 'bist' };
  });
  const byCur = {};
  const markets = new Set();
  rows.forEach(r => {
    if (!byCur[r.cur]) byCur[r.cur] = { value: 0, risk: 0 };
    byCur[r.cur].value += r.value; byCur[r.cur].risk += r.risk;
    markets.add(r.market);
  });
  let topW = null, topRisk = null;
  rows.forEach(r => {
    const wt = byCur[r.cur].value > 0 ? r.value / byCur[r.cur].value * 100 : 0;
    if (!topW || wt > topW.wt) topW = { sym: r.sym, wt: Math.round(wt * 10) / 10 };
    if (!topRisk || r.risk > topRisk.risk) topRisk = { sym: r.sym, risk: r.risk, cur: r.cur };
  });
  el.style.display = 'block';
  const curLabel = c => c === 'TRY' ? 'TL' : c;
  const f = v => formatStockPrice(v);
  const chips = Object.keys(byCur).map(cur => {
    const g = byCur[cur];
    const pct = g.value > 0 ? Math.round(g.risk / g.value * 1000) / 10 : 0;
    return `<span class="pfr-chip">${escapeHtml(curLabel(cur))}: <b class="down">−${f(g.risk)}</b> <span class="pfr-mut">%${pct.toLocaleString('tr-TR')}</span></span>`;
  }).join('');
  const concWarn = topW && topW.wt > 25;
  const divWarn = holdings.length < 3;
  let html = `<div class="pfr-title">Portföy riski</div>`;
  html += `<div class="pfr-row"><span class="pfr-lbl">Tüm stop'lar tetiklenirse</span><span class="pfr-chips">${chips}</span></div>`;
  if (topW) html += `<div class="pfr-note${concWarn ? ' warn' : ''}">En yoğun: <b>${escapeHtml(topW.sym)}</b> · portföyün %${topW.wt.toLocaleString('tr-TR')}'i${concWarn ? ' — yoğunlaşma riski' : ''}</div>`;
  if (topRisk) html += `<div class="pfr-note">En çok riske açık: <b>${escapeHtml(topRisk.sym)}</b> · ${f(topRisk.risk)} ${escapeHtml(curLabel(topRisk.cur))}</div>`;
  html += `<div class="pfr-note${divWarn ? ' warn' : ''}">${holdings.length} pozisyon · ${markets.size} piyasa${divWarn ? ' — az çeşitlendirme' : ''}</div>`;
  html += `<p class="pfr-disc">Stop = kurduğun alt alarm; yoksa varsayılan %8. Para birimleri ayrı (kur farkı karıştırılmaz).</p>`;
  el.innerHTML = html;
}

function renderPortfolioSummary() {
  const el = document.getElementById('portfolioSummary');
  if (!el) return;
  const holdings = (data.watchlist || []).filter(w => w.qty != null && w.qty > 0 && w.cost != null);
  if (holdings.length === 0) { el.style.display = 'none'; return; }

  const byCur = {};
  for (const w of holdings) {
    const cur = w.currency || 'TRY';
    if (!byCur[cur]) byCur[cur] = { cost: 0, value: 0, count: 0, pricedCount: 0 };
    const g = byCur[cur];
    g.cost += w.qty * w.cost;
    g.count++;
    if (w.price != null) { g.value += w.qty * w.price; g.pricedCount++; }
    else { g.value += w.qty * w.cost; } // fiyat yoksa maliyetle say (nötr)
  }
  const currencies = Object.keys(byCur);
  el.style.display = 'block';

  if (currencies.length === 1) {
    // Tek para birimi — eski büyük kart görünümü
    const cur = currencies[0];
    const g = byCur[cur];
    const pl = g.value - g.cost;
    const plPct = g.cost > 0 ? (pl / g.cost) * 100 : 0;
    const pdir = pl > 0 ? 'up' : (pl < 0 ? 'down' : 'flat');
    const psign = pl > 0 ? '+' : '';
    const curLabel = cur === 'TRY' ? 'TL' : cur;
    el.innerHTML = `
      <div class="pf-label">Portföy değeri</div>
      <div class="pf-value">${formatStockPrice(g.value)} <span style="font-size:0.5em;color:var(--text-faint);font-weight:600;">${escapeHtml(curLabel)}</span></div>
      <div class="pf-pl ${pdir}">${psign}${formatStockPrice(pl)} ${escapeHtml(curLabel)} · ${psign}${plPct.toFixed(2)}%</div>
      <div class="pf-sub">
        <span>Maliyet: <b>${formatStockPrice(g.cost)} ${escapeHtml(curLabel)}</b></span>
        <span><b>${g.count}</b> pozisyon${g.pricedCount < g.count ? ` · ${g.count - g.pricedCount} fiyat bekliyor` : ''}</span>
      </div>
    `;
    return;
  }

  // Birden çok para birimi — her biri ayrı satır (toplam karıştırılmaz, kur farkı yanıltır)
  const rows = currencies.map(cur => {
    const g = byCur[cur];
    const pl = g.value - g.cost;
    const plPct = g.cost > 0 ? (pl / g.cost) * 100 : 0;
    const pdir = pl > 0 ? 'up' : (pl < 0 ? 'down' : 'flat');
    const psign = pl > 0 ? '+' : '';
    const curLabel = cur === 'TRY' ? 'TL' : cur;
    return `
      <div class="pf-cur-row">
        <span class="pf-cur-label">${escapeHtml(curLabel)}</span>
        <span class="pf-cur-val">${formatStockPrice(g.value)}</span>
        <span class="pf-cur-pl ${pdir}">${psign}${formatStockPrice(pl)} · ${psign}${plPct.toFixed(2)}%</span>
        <span class="pf-cur-count">${g.count} pozisyon</span>
      </div>`;
  }).join('');
  el.innerHTML = `
    <div class="pf-label">Portföy · ${holdings.length} pozisyon (${currencies.length} para birimi)</div>
    <div class="pf-multi">${rows}</div>
  `;
}


// Portföy dağılımı — baskın para biriminde hisse bazlı % donut (kur karıştırmaz)
function renderPortfolioPie() {
  const el = document.getElementById('portfolioPie');
  if (!el) return;
  const holdings = (data.watchlist || []).filter(w => w.qty != null && w.qty > 0 && w.cost != null);
  if (holdings.length < 2) { el.style.display = 'none'; return; } // tek pozisyonda pasta anlamsız
  // Para birimine göre grupla, baskın olanı (en yüksek değer) seç
  const byCur = {};
  for (const w of holdings) {
    const cur = w.currency || 'TRY';
    const val = (w.price != null ? w.price : w.cost) * w.qty;
    (byCur[cur] = byCur[cur] || []).push({ sym: w.symbol, val });
  }
  let cur = null, maxV = -1;
  for (const c in byCur) { const sum = byCur[c].reduce((s, x) => s + x.val, 0); if (sum > maxV) { maxV = sum; cur = c; } }
  let items = byCur[cur].filter(x => x.val > 0).sort((a, b) => b.val - a.val);
  if (items.length < 2) { el.style.display = 'none'; return; }
  const total = items.reduce((s, x) => s + x.val, 0);
  // 8'den fazlaysa ilk 7 + "Diğer"
  if (items.length > 8) {
    const rest = items.slice(7).reduce((s, x) => s + x.val, 0);
    items = items.slice(0, 7).concat([{ sym: 'Diğer', val: rest }]);
  }
  const PIE_COLORS = ['#5aa2ff', '#36d058', '#ffc640', '#ff8a5c', '#42c6ff', '#2dd4bf', '#ff6b9d', '#a3e635'];
  const segs = items.map((x, i) => ({ sym: x.sym, val: x.val, color: PIE_COLORS[i % PIE_COLORS.length], pct: x.val / total * 100 }));
  const lbl = cur === 'TRY' ? 'TL' : cur;
  const legend = segs.map(s => `
    <div class="pf-pie-leg-item">
      <span class="pf-pie-dot" style="background:${s.color}"></span>
      <span class="pf-pie-leg-sym">${escapeHtml(s.sym)}</span>
      <span class="pf-pie-leg-pct">${s.pct.toFixed(1)}%</span>
    </div>`).join('');
  const others = Object.keys(byCur).length > 1 ? ` <span class="pf-pie-cur">(+${Object.keys(byCur).length - 1} diğer para birimi)</span>` : '';
  el.style.display = 'block';
  el.innerHTML = `
    <div class="pf-pie-head"><span>Dağılım${others}</span><span class="pf-pie-cur">${escapeHtml(lbl)}</span></div>
    <div class="pf-pie-wrap">
      ${donutChart(segs, 140)}
      <div class="pf-pie-legend">${legend}</div>
    </div>
  `;
}

// Portföy değer geçmişi — sparkline + dün/hafta/ay yüzde değişim (baskın para birimi)
function renderPortfolioHistory() {
  const el = document.getElementById('portfolioHistory');
  if (!el) return;
  const hist = (data.portfolioHistory || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const holdings = (data.watchlist || []).filter(w => w.qty != null && w.qty > 0 && w.cost != null);
  if (hist.length < 2 || !holdings.length) { el.style.display = 'none'; return; }

  // Baskın para birimi = en güncel snapshot'ta en yüksek değerli olan (genelde TRY)
  const last = hist[hist.length - 1];
  let cur = null, maxV = -1;
  for (const c in (last.byCur || {})) { if (last.byCur[c].value > maxV) { maxV = last.byCur[c].value; cur = c; } }
  if (!cur) { el.style.display = 'none'; return; }

  const series = hist.filter(s => s.byCur && s.byCur[cur]).map(s => ({ date: s.date, value: s.byCur[cur].value }));
  if (series.length < 2) { el.style.display = 'none'; return; }
  const lbl = cur === 'TRY' ? 'TL' : cur;
  const latest = series[series.length - 1].value;

  // N gün önceki tarihe en yakın (<=) snapshot'a göre değişim %
  const changeFrom = (daysAgo) => {
    const t = new Date(); t.setDate(t.getDate() - daysAgo);
    const ts = isoLocal(t);
    let past = null;
    for (let i = series.length - 1; i >= 0; i--) { if (series[i].date <= ts) { past = series[i]; break; } }
    if (!past || past.value <= 0) return null;
    return (latest - past.value) / past.value * 100;
  };
  const prev = series[series.length - 2];
  const dayChg = (prev && prev.value > 0) ? (latest - prev.value) / prev.value * 100 : null;
  const weekChg = changeFrom(7);
  const monthChg = changeFrom(30);

  const chip = (label, pct) => {
    if (pct == null) return `<span class="pf-hist-chip"><i>${label}</i> <b class="flat">—</b></span>`;
    const d = pct > 0 ? 'up' : (pct < 0 ? 'down' : 'flat'); const s = pct > 0 ? '+' : '';
    return `<span class="pf-hist-chip"><i>${label}</i> <b class="${d}">${s}${pct.toFixed(1)}%</b></span>`;
  };
  el.style.display = 'block';
  el.innerHTML = `
    <div class="pf-hist-head"><span>Portföy geçmişi</span><span class="pf-hist-cur">${escapeHtml(lbl)} · ${series.length} gün</span></div>
    ${sparkline(series.map(s => s.value))}
    <div class="pf-hist-stats">${chip('Dün', dayChg)}${chip('Hafta', weekChg)}${chip('Ay', monthChg)}</div>
  `;
}

// Portföyün BIST100 (XU100) endeksine karşı performansı.
// Sadece baskın para birimi TRY ise anlamlı — portföyün kendi geçmiş penceresindeki
// getirisini, aynı dönemdeki XU100 getirisiyle kıyaslar. Yeni endpoint yok: /stock-history XU100.IS ile.
let _bist100Cache = null;  // {span, portfolioPct, ts} — sekme her render'da tekrar fetch etmesin
async function renderBist100Compare() {
  const el = document.getElementById('bist100Compare');
  if (!el) return;
  const hist = (data.portfolioHistory || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const holdings = (data.watchlist || []).filter(w => w.qty != null && w.qty > 0 && w.cost != null);
  if (hist.length < 2 || !holdings.length) { el.style.display = 'none'; return; }

  // Baskın para birimi TRY mi?
  const last = hist[hist.length - 1];
  let cur = null, maxV = -1;
  for (const c in (last.byCur || {})) { if (last.byCur[c].value > maxV) { maxV = last.byCur[c].value; cur = c; } }
  if (cur !== 'TRY') { el.style.display = 'none'; return; }

  const series = hist.filter(s => s.byCur && s.byCur.TRY).map(s => ({ date: s.date, value: s.byCur.TRY.value }));
  if (series.length < 2) { el.style.display = 'none'; return; }
  const firstDate = series[0].date;
  const firstVal = series[0].value;
  const lastVal = series[series.length - 1].value;
  if (firstVal <= 0) { el.style.display = 'none'; return; }
  const portfolioPct = (lastVal - firstVal) / firstVal * 100;

  const spanDays = Math.round((Date.parse(last.date) - Date.parse(firstDate)) / 86400000) || 1;
  const range = spanDays <= 25 ? '1mo' : (spanDays <= 80 ? '3mo' : '6mo');

  el.style.display = 'block';
  el.innerHTML = `<div class="bist100-head">BIST100'e karşı</div><div class="bist100-loading">Endeks getirisi çekiliyor…</div>`;

  let xuPct = null, xuErr = null;
  try {
    const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
    if (!token) throw new Error('giriş yok');
    const r = await fetch(STOCK_HISTORY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ ySymbol: 'XU100.IS', range }),
    });
    if (!r.ok) throw new Error('endeks alınamadı');
    const j = await r.json();
    const ts = j.timestamps || [], cl = j.closes || [];
    if (cl.length < 2) throw new Error('endeks verisi yetersiz');
    // Portföy başlangıç tarihine en yakın (>=) endeks kapanışını bul → aynı pencere
    const firstTs = Date.parse(firstDate) / 1000;
    let startIdx = 0;
    for (let i = 0; i < ts.length; i++) { if (ts[i] >= firstTs) { startIdx = i; break; } }
    const startClose = cl[startIdx], endClose = cl[cl.length - 1];
    if (startClose > 0) xuPct = (endClose - startClose) / startClose * 100;
  } catch (e) { xuErr = e.message; }

  const pctStr = p => (p > 0 ? '+' : '') + p.toFixed(1) + '%';
  const cls = p => p > 0 ? 'up' : (p < 0 ? 'down' : 'flat');
  const spanLbl = spanDays >= 60 ? `${Math.round(spanDays / 30)} ay` : `${spanDays} gün`;

  if (xuPct == null) {
    el.innerHTML = `<div class="bist100-head">BIST100'e karşı</div>
      <div class="bist100-loading">Endeks getirisi alınamadı${xuErr ? ' (' + escapeHtml(xuErr) + ')' : ''}.</div>`;
    return;
  }
  const diff = portfolioPct - xuPct;
  const verdict = diff >= 0
    ? `Son ${spanLbl}'de portföyün endeksi <b class="up">${pctStr(diff)}</b> geçti`
    : `Son ${spanLbl}'de portföyün endeksin <b class="down">${pctStr(Math.abs(diff))}</b> gerisinde`;
  el.innerHTML = `
    <div class="bist100-head">BIST100'e karşı <span class="bist100-span">son ${escapeHtml(spanLbl)}</span></div>
    <div class="bist100-rows">
      <div class="bist100-row"><span>Portföyün</span><b class="${cls(portfolioPct)}">${pctStr(portfolioPct)}</b></div>
      <div class="bist100-row"><span>BIST100 (XU100)</span><b class="${cls(xuPct)}">${pctStr(xuPct)}</b></div>
    </div>
    <div class="bist100-verdict">${verdict}</div>
    <p class="bist100-note">Portföy değer geçmişinin başından bugüne — yatırım tavsiyesi değildir.</p>
  `;
}

// Tek hisse mini grafik (modal) — Yahoo geçmiş veriden line chart
function openStockChart(idx) {
  const wl = data.watchlist || [];
  const w = wl[idx];
  if (!w) return;
  _stockChartIdx = idx;
  _stockChartRange = '1mo';
  _stockChartMode = 'line';
  _stockChartFib = false;
  const taOk = TA_MARKETS.has(w.market || 'bist');
  document.getElementById('stockChartSym').textContent = w.symbol + (w.market && w.market !== 'bist' ? ` · ${({abd:'🇺🇸',fx:'$',crypto:'₿'})[w.market]||''}` : '');
  document.getElementById('stockChartName').textContent = w.name || '';
  document.getElementById('stockChartPrice').innerHTML = w.price != null
    ? formatStockPrice(w.price) + ` <span style="font-size:0.72em;color:var(--text-faint);">${escapeHtml(w.currency||'')}</span>`
    : '—';
  const pctEl = document.getElementById('stockChartPct');
  if (w.changePct != null) {
    const d = w.changePct > 0 ? 'up' : (w.changePct < 0 ? 'down' : 'flat');
    const s = w.changePct > 0 ? '+' : '';
    pctEl.className = 'pct ' + d;
    pctEl.textContent = `${s}${w.changePct.toFixed(2)}% bugün`;
  } else { pctEl.className = 'pct flat'; pctEl.textContent = ''; }
  // Aktif range butonu
  document.querySelectorAll('#stockChartRanges button').forEach(b => {
    b.classList.toggle('active', b.dataset.range === '1mo');
  });
  // Chart modes: sadece hisse piyasalarında göster (döviz/kripto için TA az anlamlı)
  document.getElementById('stockChartModes').style.display = taOk ? 'flex' : 'none';
  document.querySelectorAll('#stockChartModes button[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === 'line');
  });
  const fibBtn = document.getElementById('stockChartFibBtn');
  if (fibBtn) fibBtn.classList.remove('fib-on');
  document.getElementById('stockChartArea').innerHTML = '<div class="stock-chart-loading">Yükleniyor…</div>';
  document.getElementById('stockChartStats').style.display = 'none';
  document.getElementById('stockChartLegend').style.display = 'none';
  document.getElementById('stockTaPanel').style.display = 'none';
  document.getElementById('stockTaAiResult').style.display = 'none';
  document.getElementById('stockTaAiResult').textContent = '';
  _stockChartPayload = null;
  // Haber sekmesini sıfırla, varsayılan Grafik görünümü
  _stockNewsLoaded = false;
  _stockNewsItems = [];
  _stockFundLoaded = false;
  _stockFundData = null;
  setStockView('chart');
  document.getElementById('stockChartModal').classList.add('active');
  loadStockHistory('1mo');
}

function closeStockChart() {
  document.getElementById('stockChartModal').classList.remove('active');
  _stockChartIdx = null;
  _stockChartPayload = null;
  _stockNewsLoaded = false;
  _stockNewsItems = [];
  _stockFundLoaded = false;
  _stockFundData = null;
  _stockBuffett = null;
}

// Grafik ↔ Haberler görünüm geçişi
function setStockView(view) {
  document.querySelectorAll('#stockChartViews button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  document.getElementById('stockChartView').style.display = view === 'chart' ? 'block' : 'none';
  document.getElementById('stockNewsView').style.display = view === 'news' ? 'block' : 'none';
  document.getElementById('stockFundView').style.display = view === 'fund' ? 'block' : 'none';
  if (view === 'news' && !_stockNewsLoaded) loadStockNews();
  if (view === 'fund' && !_stockFundLoaded) loadStockFundamentals();
}

async function loadStockFundamentals() {
  if (_stockChartIdx == null) return;
  const w = (data.watchlist || [])[_stockChartIdx];
  if (!w) return;
  _stockFundLoaded = true;
  const grid = document.getElementById('stockFundGrid');
  grid.innerHTML = '<div class="stock-chart-loading">Yükleniyor…</div>';
  try {
    const ySymbol = w.ySymbol || legacyYSymbol(w);
    const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
    if (!token) throw new Error('giriş yapılmamış');
    const r = await fetch(STOCK_FUND_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ ySymbol, symbol: w.symbol }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `http ${r.status}`); }
    _stockFundData = await r.json();
    renderStockFundamentals(_stockFundData, w);
  } catch (e) {
    _stockFundLoaded = false; // tekrar denenebilsin
    grid.innerHTML = `<div class="stock-chart-loading">Temel veri alınamadı: ${escapeHtml(e.message)}</div>`;
  }
}

// ——— Buffett skoru kartı (temel analiz paneli başı) ———
function bfCls(v) { return v >= 0.7 ? 'good' : (v >= 0.45 ? 'mid' : 'bad'); }

function renderBuffettCard(el, bf, d) {
  if (!el) return;
  if (!bf) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'block';
  const tr = n => n.toLocaleString('tr-TR');
  const cur = escapeHtml(String(bf.currency || ''));
  const hurBtn = `<button type="button" class="bf-hurdle" onclick="setBuffettHurdle()">engel oranı %${tr(bf.hurdlePct)} · değiştir</button>`;
  // Kurum tipi rozeti — HANGİ kriter setinin uygulandığı kullanıcıya açıkça yazılır.
  // Banka setinde borç/owner-earnings/1-dolar satırları kasıtlı yoktur; rozet
  // olmasaydı kullanıcı eksik satırları "veri gelmemiş" sanardı.
  const kindBadge = bf.kind
    ? `<span class="bf-kind ${escapeHtml(bf.kind)}" title="${escapeHtml('tespit: ' + (bf.kindSrc || '—'))}">${escapeHtml(bf.kindLabel || bf.kind)}</span>`
    : '';

  if (bf.score == null) {
    el.innerHTML = `<div class="bf-head"><div class="bf-title">Buffett skoru ${kindBadge}</div><div class="bf-na">hesaplanamadı</div></div>
      <div class="bf-meta">${escapeHtml(bf.reason || 'Veri yetersiz.')} ${hurBtn}</div>
      ${bf.parts && bf.parts.length ? bfRows(bf) : ''}
      <p class="bf-note">Yahoo, BIST hisselerinde mali tabloları her zaman vermiyor. ABD hisselerinde bu skor genelde dolu gelir.</p>`;
    return;
  }

  const cls = bf.score >= 70 ? 'good' : (bf.score >= 45 ? 'mid' : 'bad');
  const flags = (bf.flags || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  // Güvenlik payı şeridi — Buffett'in value tenet'i tek bakışta görünsün.
  // ⚠️ SIFIR büyüme varsayımı burada da yazılı: %35 iskontoda büyüme varsaymak
  // hassasiyet tiyatrosudur, kullanıcı neyin varsayıldığını bilmeli.
  let mosHtml = '';
  if (bf.mos != null && isFinite(bf.mos)) {
    const mcls = bf.mos >= 0.33 ? 'good' : (bf.mos >= 0 ? 'mid' : 'bad');
    const w = Math.max(2, Math.min(100, Math.round((bf.mos + 0.5) * 100)));
    mosHtml = `<div class="bf-mos ${mcls}">
      <div class="bf-mos-top"><span>Güvenlik payı</span><b>${tr(Math.round(bf.mos * 1000) / 10)}%</b></div>
      <div class="bf-mos-bar"><i class="${mcls}" style="width:${w}%"></i></div>
      <div class="bf-mos-note">${bf.kind === 'financial'
        ? `Hak edilen PD/DD ${tr(bf.justifiedPB ?? 0)}× · gerçek ${tr(bf.priceToBook ?? 0)}×`
        : `İçsel değer tahmini ${bf.intrinsic != null ? tr(Math.round(bf.intrinsic / 1e6)) + ' mn' : '—'} ${cur}`} · sıfır büyüme varsayımı, iskonto = engel oranı</div>
    </div>`;
  }
  el.innerHTML = `
    <div class="bf-head">
      <div>
        <div class="bf-title">Buffett skoru ${kindBadge}</div>
        <div class="bf-label ${cls}">${escapeHtml(bf.label)}</div>
      </div>
      <div class="bf-score ${cls}">${tr(bf.score)}<span>/100</span></div>
    </div>
    <div class="bf-bar"><i class="${cls}" style="width:${Math.max(2, Math.min(100, bf.score))}%"></i></div>
    <div class="bf-meta">${tr(bf.years)} yıllık tablo · veri kapsamı %${tr(Math.round(bf.coverage * 100))}${cur ? ' · ' + cur : ''} ${hurBtn}</div>
    ${bfDeepFinHtml()}
    ${mosHtml}
    ${bfRows(bf)}
    ${flags ? `<ul class="bf-flags">${flags}</ul>` : ''}
    <p class="bf-note">${bf.kind === 'financial'
      ? 'Bu bir <b>banka/finans</b> kuruluşu — ayrı kriter seti uygulandı. Borç/özsermaye, Owner Earnings, capex ve 1 Dolar Testi bankada anlamlı olmadığı için kasıtlı olarak girmedi; yerine varlık kârlılığı, kaldıraç ve defter değeri büyümesi ölçüldü (Buffett\'in 1990 Wells Fargo mektubundaki çerçeve).'
      : 'Kalite ağırlığın <b>üçte ikisidir</b>, fiyat üçte biri — Buffett sırası: "harika bir şirketi makul fiyata almak, vasat bir şirketi harika fiyata almaktan çok daha iyidir."'}
      FAVÖK (EBITDA), beta/oynaklık, analist hedefleri ve teknik göstergeler bu skora <b>kasıtlı olarak girmez</b> — Buffett dördünü de reddeder. Skor tarafsız bir kalite ölçüsüdür, al/sat sinyali değildir.</p>`;
}

// 🇹🇷 Veri derinliği şeridi — kullanıcı skorun KAÇ YILDAN çıktığını ve
// verinin NEREDEN geldiğini görmeli. Sessiz kaynak değişimi kabul edilemez.
function bfDeepFinHtml() {
  const s = _stockDeepFin;
  if (!s) return '';
  if (s.pending) return `<div class="bf-deep pending">10 yıllık mali tablo aranıyor (İş Yatırım)…</div>`;
  if (!s.ok) {
    return `<div class="bf-deep na">10 yıllık veri alınamadı — skor Yahoo'nun 4 yılıyla hesaplandı.
      <span class="bf-deep-why">${escapeHtml(String(s.reason || ''))}</span></div>`;
  }
  const tr = n => n.toLocaleString('tr-TR');
  const grp = s.group === 'XI_29' ? 'sanayi tablosu (XI_29)' : `banka tablosu (${s.group})`;
  // Teşhis: hangi kalemler eşleşmedi — canlıda alan adı değişirse burada görünür
  const un = (s.diag && Array.isArray(s.diag.unmatchedSample)) ? s.diag.unmatchedSample : [];
  const diag = un.length
    ? `<details class="bf-deep-diag"><summary>Eşleşmeyen kalemler (${tr(un.length)})</summary>
        <div>${un.map(x => escapeHtml(String(x))).join(' · ')}</div></details>` : '';
  return `<div class="bf-deep good">
    <b>${tr(s.total)} yıllık tablo</b> — İş Yatırım'dan ${tr(s.added)} yıl eklendi${s.filled ? `, ${tr(s.filled)} eksik alan tamamlandı` : ''} · ${escapeHtml(grp)}
    <span class="bf-deep-why">birim ölçeği ölçüldü: ×${tr(s.scale)} (Yahoo ile çakışan yıldan)</span>${diag}
  </div>`;
}

function bfRows(bf) {
  const tr = n => n.toLocaleString('tr-TR');
  const rows = (bf.parts || []).map(p => {
    if (p.score == null) {
      return `<div class="bf-row skip">
        <div class="bf-row-top"><span class="bf-row-lbl">${escapeHtml(p.label)}</span><span class="bf-row-pts">veri yok</span></div>
        <div class="bf-row-note">${escapeHtml(p.note || '')}</div></div>`;
    }
    const pts = Math.round(p.score * p.weight * 10) / 10;
    const c = bfCls(p.score);
    return `<div class="bf-row">
      <div class="bf-row-top"><span class="bf-row-lbl">${escapeHtml(p.label)}</span><span class="bf-row-pts ${c}">${tr(pts)} / ${tr(p.weight)} puan</span></div>
      <div class="bf-row-bar"><i class="${c}" style="width:${Math.max(2, Math.round(p.score * 100))}%"></i></div>
      <div class="bf-row-note">${escapeHtml(p.note || '')}</div></div>`;
  }).join('');
  return `<details class="bf-details"><summary>Kriter dökümü — hangi maddeden kırık aldı</summary>${rows}</details>`;
}

// Engel oranı (hurdle rate) — TR'de mevduat/tahvil nominal getirisi ana rakip
async function setBuffettHurdle() {
  const cur = (_stockBuffett && _stockBuffett.currency) || 'TRY';
  const now = buffettHurdle(cur);
  const v = await aidanPrompt(
    'Engel oranı (' + cur + ')',
    'Şirketin aşması gereken yıllık getiri, % olarak. TR için mevduat/tahvil faizini yaz — %15 ROE, %37 mevduat varken iyi değildir.',
    String(now)
  );
  if (v == null) return;
  const n = Number(String(v).replace(',', '.').replace('%', '').trim());
  if (!isFinite(n) || n <= 0 || n >= 200) { showToast('Geçerli bir yüzde gir (1-199)', 'error'); return; }
  data.settings = data.settings || {};
  if (!data.settings.buffettHurdle || typeof data.settings.buffettHurdle !== 'object') data.settings.buffettHurdle = {};
  data.settings.buffettHurdle[String(cur).toUpperCase()] = n;
  save();
  if (_stockFundData) {
    const w = (data.watchlist || [])[_stockChartIdx] || {};
    renderStockFundamentals(_stockFundData, w);
  }
  showToast(`${cur} engel oranı %${n} yapıldı`, 'success');
}

// ============================================================
// 🇹🇷 İŞ YATIRIM 10 YILLIK MALİ TABLO — Yahoo'nun 4 yılını derinleştirir
// ============================================================
// Buffett 10 YILLIK tutarlı geçmiş ister; Yahoo BIST'te 4 yıl veriyor.
// Bu katman yalnızca TEK HİSSE KARTINDA çalışır (taramada değil — resmî
// olmayan uç, 25 sembollük tarama IP engeli riski taşır).
//
// 🔴 SESSİZ ARIZA YOK / SESSİZ BOZULMA YOK: uç patlarsa kart Yahoo'nun 4 yılıyla
// aynen çalışmaya devam eder, rozet "Yahoo · 4 yıl" der. Hiçbir şey kaybolmaz.
const STOCK_BIST_FIN_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/bist-financials';
// Bellekte tutulur, localStorage'a YAZILMAZ — 10 yıl × ~16 alan × sembol
// başına veri blob'u şişirirdi. Worker zaten 24 saat cache'liyor.
const _isyCache = {};
let _isyReq = 0;

// Parasal alanlar — ölçek çarpanı YALNIZCA bunlara uygulanır
const ISY_MONEY_FIELDS = ['revenue', 'grossProfit', 'operatingIncome', 'netIncome',
  'incomeBeforeTax', 'incomeTaxExpense', 'totalAssets', 'totalLiab', 'equity',
  'cash', 'retainedEarnings', 'opCashFlow', 'capex', 'dna', 'dividendsPaid',
  'shortDebt', 'longDebt'];

// 🔬 BİRİM OTOMATİK TESPİTİ — tahmin DEĞİL, ölçüm.
// İş Yatırım genelde "bin TL" döner, Yahoo tam TL. Yanlış çarpan oranları
// bozmaz (marj/ROE sadeleşir) ama piyasa değeri ↔ içsel değer karşılaştırmasını
// tamamen bozar. Sabit bir çarpan varsaymak yerine ÇAKIŞAN yıldan ölçülür:
// aynı yılın aynı kalemi iki kaynakta karşılaştırılır, oran 10'un kuvvetine
// yuvarlanır. Oran tutarsızsa ölçek `null` döner ve veri KULLANILMAZ.
function isyDetectScale(isyYears, yahooYears) {
  const cand = ['revenue', 'totalAssets', 'equity', 'netIncome'];
  const ratios = [];
  for (const iy of (isyYears || [])) {
    const yy = (yahooYears || []).find(y => y && y.year === iy.year);
    if (!yy) continue;
    for (const f of cand) {
      const a = iy[f], v = yy[f];
      if (a == null || v == null || !isFinite(a) || !isFinite(v)) continue;
      if (Math.abs(a) < 1 || Math.abs(v) < 1) continue;
      ratios.push(Math.abs(v / a));
    }
  }
  if (!ratios.length) return { scale: null, reason: 'Yahoo ile çakışan yıl bulunamadı — ölçek ölçülemedi' };
  const med = bfMedian(ratios);
  if (!(med > 0)) return { scale: null, reason: 'ölçek oranı geçersiz' };
  const scale = Math.pow(10, Math.round(Math.log10(med)));
  // Güven kontrolü: medyan, yuvarlanan değerden %25'ten fazla sapıyorsa iki
  // kaynak aynı şeyi ölçmüyor demektir (farklı konsolidasyon, düzeltme vb.)
  if (Math.abs(med / scale - 1) > 0.25) {
    return { scale: null, reason: `iki kaynak tutarsız (oran ${bfR(med, 3)}) — veri kullanılmadı` };
  }
  return { scale, samples: ratios.length, med: bfR(med, 4) };
}

// Yahoo yılları OLDUĞU GİBİ kalır (birimi bilinen, aylardır test edilen kaynak).
// İş Yatırım yılları ölçekle çarpılır ve:
//   · Yahoo'da OLMAYAN yıllar → doğrudan eklenir (asıl kazanç: 10 yıla çıkmak)
//   · Yahoo'da OLAN yıllar → Yahoo kazanır, yalnızca EKSİK alanlar tamamlanır
//     (Yahoo BIST'te capex/amortisman/temettüyü sık sık atlar)
function isyMergeYears(yahooYears, isyYears, scale) {
  const out = (Array.isArray(yahooYears) ? yahooYears : []).map(y => Object.assign({ src: 'yahoo' }, y));
  const byYear = {};
  for (const y of out) byYear[y.year] = y;
  let added = 0, filled = 0;
  for (const iy of (Array.isArray(isyYears) ? isyYears : [])) {
    if (!iy || !isFinite(iy.year)) continue;
    const scaled = { year: iy.year, src: 'isyatirim' };
    for (const f of ISY_MONEY_FIELDS) {
      if (iy[f] == null || !isFinite(iy[f])) continue;
      scaled[f] = iy[f] * scale;
    }
    // İş Yatırım borcu kısa/uzun ayırıyor; motor longTermDebt bekliyor
    if (scaled.longDebt != null) { scaled.longTermDebt = scaled.longDebt; delete scaled.longDebt; }
    const ex = byYear[iy.year];
    if (!ex) { out.push(scaled); byYear[iy.year] = scaled; added++; continue; }
    for (const f of Object.keys(scaled)) {
      if (f === 'year' || f === 'src') continue;
      if (ex[f] == null && scaled[f] != null) { ex[f] = scaled[f]; filled++; }
    }
  }
  out.sort((a, b) => b.year - a.year);
  return { years: out, added, filled };
}

// Kartı 10 yıllık veriyle YENİDEN çizer. Yahoo çizimini BEKLETMEZ —
// kart önce 4 yılla görünür, derin veri gelince kendini tazeler.
async function loadBistDeepFinancials(d, w) {
  if (!d || !w || w.market !== 'bist') return;
  const sym = String(w.symbol || '').toUpperCase().replace(/\.IS$/, '');
  if (!/^[A-Z0-9]{2,10}$/.test(sym)) return;
  const req = ++_isyReq;
  let res = _isyCache[sym];
  if (!res) {
    try {
      const token = await getSupaToken();
      if (!token) return;
      const r = await fetch(STOCK_BIST_FIN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ symbol: sym, years: 10 }),
      });
      if (!r.ok) throw new Error('http ' + r.status);
      res = await r.json();
      _isyCache[sym] = res;
    } catch (e) {
      _isyCache[sym] = { ok: false, error: e.message };
      res = _isyCache[sym];
    }
  }
  // Kullanıcı başka hisseye geçtiyse bayat sonucu ekrana basma
  if (req !== _isyReq || !_stockFundData || _stockFundData !== d) return;
  if (!res || !res.ok || !Array.isArray(res.years) || !res.years.length) {
    _stockDeepFin = { ok: false, reason: (res && res.error) || 'veri gelmedi' };
    renderBuffettCard(document.getElementById('buffettCard'), _stockBuffett, d);
    return;
  }
  const det = isyDetectScale(res.years, d.years);
  if (det.scale == null) {
    // 🔴 ÖLÇEK BİLİNMİYORSA VERİ KULLANILMAZ. Yanlış çarpanla birleştirmek
    // içsel değeri 1000 kat şişirir/küçültür — sessiz ve ölümcül bir hata.
    _stockDeepFin = { ok: false, reason: det.reason, group: res.group };
    renderBuffettCard(document.getElementById('buffettCard'), _stockBuffett, d);
    return;
  }
  const m = isyMergeYears(d.years, res.years, det.scale);
  d.years = m.years;
  _stockDeepFin = {
    ok: true, group: res.group, scale: det.scale, added: m.added, filled: m.filled,
    total: m.years.length, kind: res.kind, diag: res.diag || null,
  };
  // Skoru YENİDEN hesapla — artık 10 yıllık pencereden bakıyor
  _stockBuffett = buffettScore(d, buffettHurdle(d.currency || w.currency));
  renderBuffettCard(document.getElementById('buffettCard'), _stockBuffett, d);
}

function renderStockFundamentals(d, w) {
  const grid = document.getElementById('stockFundGrid');
  const bfEl = document.getElementById('buffettCard');
  if (!grid) return;
  if (!d) {
    grid.innerHTML = '<div class="stock-chart-loading">Veri yok.</div>';
    _stockBuffett = null;
    _stockDeepFin = null;
    if (bfEl) { bfEl.innerHTML = ''; bfEl.style.display = 'none'; }
    return;
  }
  // Buffett skoru — sayıyı PWA hesaplar, AI uydurmaz (teknik uyum skoruyla aynı kalıp)
  _stockBuffett = buffettScore(d, buffettHurdle(d.currency || w.currency));
  renderBuffettCard(bfEl, _stockBuffett, d);
  // 🇹🇷 BIST'te 10 yıllık derin veriyi ARKA PLANDA çek — çizimi BEKLETMEZ.
  // Gelirse skor 10 yıllık pencereden yeniden hesaplanır; gelmezse kart
  // Yahoo'nun 4 yılıyla aynen kalır (sessiz bozulma yok).
  if (w && w.market === 'bist') {
    _stockDeepFin = { pending: true };
    loadBistDeepFinancials(d, w);
  } else _stockDeepFin = null;
  const cur = d.currency || w.currency || '';
  const c = cur ? ' ' + cur : '';
  const tr = n => n.toLocaleString('tr-TR');
  const num = (v, dec = 2) => (v == null || !isFinite(v)) ? '—' : tr(Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec));
  const pct = v => (v == null || !isFinite(v)) ? '—' : tr(Math.round(v * 1000) / 10) + '%';
  const big = v => {
    if (v == null || !isFinite(v)) return '—';
    if (Math.abs(v) >= 1e9) return tr(Math.round(v / 1e8) / 10) + ' Mr';
    if (Math.abs(v) >= 1e6) return tr(Math.round(v / 1e5) / 10) + ' Mn';
    return tr(Math.round(v));
  };
  const gcls = v => v == null ? '' : (v > 0 ? 'up' : (v < 0 ? 'down' : ''));
  // analist hedef → potansiyel %
  let tSub = 'analist hedefi';
  if (d.targetMean != null && w.price != null && w.price > 0) {
    const up = Math.round((d.targetMean - w.price) / w.price * 1000) / 10;
    tSub = `${up > 0 ? '+' : ''}${tr(up)}% potansiyel`;
  }
  const recMap = { strong_buy: 'Güçlü Al', buy: 'Al', outperform: 'Endeks üstü', hold: 'Tut', underperform: 'Endeks altı', sell: 'Sat', strong_sell: 'Güçlü Sat' };
  const recCls = { strong_buy: 'up', buy: 'up', outperform: 'up', hold: '', underperform: 'down', sell: 'down', strong_sell: 'down' };
  const cells = [
    { lbl: 'F/K', val: num(d.trailingPE), sub: 'fiyat/kazanç', cls: '' },
    { lbl: 'İleri F/K', val: num(d.forwardPE), sub: 'beklenen', cls: '' },
    { lbl: 'PD/DD', val: num(d.priceToBook), sub: 'piyasa/defter', cls: '' },
    { lbl: 'Temettü verimi', val: pct(d.dividendYield), sub: 'yıllık', cls: d.dividendYield ? 'up' : '' },
    { lbl: 'Piyasa değeri', val: big(d.marketCap), sub: cur, cls: '' },
    { lbl: 'HBK (EPS)', val: num(d.eps), sub: 'hisse başı kâr', cls: '' },
    { lbl: 'Net kâr marjı', val: pct(d.profitMargins), sub: 'kârlılık', cls: gcls(d.profitMargins) },
    { lbl: 'Özsermaye kârlılığı', val: pct(d.returnOnEquity), sub: 'ROE', cls: gcls(d.returnOnEquity) },
    { lbl: 'Borç/Özsermaye', val: num(d.debtToEquity, 0), sub: 'kaldıraç', cls: (d.debtToEquity != null && d.debtToEquity > 150) ? 'warn' : '' },
    { lbl: 'Ciro büyümesi', val: pct(d.revenueGrowth), sub: 'yıllık', cls: gcls(d.revenueGrowth) },
    { lbl: 'Kâr büyümesi', val: pct(d.earningsGrowth), sub: 'yıllık', cls: gcls(d.earningsGrowth) },
    { lbl: 'Analist hedefi', val: d.targetMean != null ? num(d.targetMean) + c : '—', sub: tSub, cls: '' },
    { lbl: 'Analist görüşü', val: d.recommendation ? (recMap[d.recommendation] || d.recommendation) : '—', sub: d.numAnalysts ? d.numAnalysts + ' analist' : '', cls: d.recommendation ? (recCls[d.recommendation] || '') : '' },
  ];
  grid.innerHTML = cells.map(ce => `<div class="stock-ta-cell ${ce.cls}"><div class="lbl">${ce.lbl}</div><div class="val">${escapeHtml(String(ce.val))}</div><div class="sub">${escapeHtml(String(ce.sub || ''))}</div></div>`).join('');
}

async function loadStockNews() {
  if (_stockChartIdx == null) return;
  const w = (data.watchlist || [])[_stockChartIdx];
  if (!w) return;
  _stockNewsLoaded = true;
  const listEl = document.getElementById('stockNewsList');
  const aiBtn = document.getElementById('stockNewsAiBtn');
  const aiRes = document.getElementById('stockNewsAiResult');
  aiRes.style.display = 'none';
  aiRes.textContent = '';
  aiBtn.disabled = true;
  listEl.innerHTML = '<div class="stock-chart-loading">Yükleniyor…</div>';
  try {
    const ySymbol = w.ySymbol || legacyYSymbol(w);
    const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
    if (!token) throw new Error('giriş yapılmamış');
    const r = await fetch(STOCK_NEWS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ ySymbol, symbol: w.symbol }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || `http ${r.status}`);
    }
    const j = await r.json();
    _stockNewsItems = Array.isArray(j.news) ? j.news : [];
    if (!_stockNewsItems.length) {
      listEl.innerHTML = '<div class="stock-chart-loading">Bu hisse için güncel haber bulunamadı. BIST hisselerinde haber az olabilir — ABD/kripto sembollerinde daha zengin.</div>';
      return;
    }
    listEl.innerHTML = _stockNewsItems.map((n, i) => {
      const when = n.time ? relTimeFromUnix(n.time) : '';
      return `<a class="stock-news-item" href="${escapeHtml(n.link)}" target="_blank" rel="noopener noreferrer">
        <div class="sn-title"><span class="sn-sent" id="snSent${i}" title="analiz ediliyor…"></span>${escapeHtml(n.title)}</div>
        <div class="sn-meta">${escapeHtml(n.publisher || '')}${when ? ' · ' + when : ''}</div>
      </a>`;
    }).join('');
    aiBtn.disabled = false;
    loadNewsSentiment();
  } catch (e) {
    listEl.innerHTML = `<div class="stock-chart-loading">${escapeHtml(e.message)}</div>`;
  }
}

async function loadNewsSentiment() {
  const items = _stockNewsItems || [];
  if (!items.length) return;
  try {
    const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
    if (!token) return;
    const headlines = items.map(n => n.title).slice(0, 12);
    const r = await fetch(STOCK_NEWS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ sentiment: true, headlines }),
    });
    if (!r.ok) return;
    const j = await r.json().catch(() => ({}));
    const sents = Array.isArray(j.sentiments) ? j.sentiments : [];
    const MAP = { pos: { c: 'pos', t: 'Olumlu' }, neg: { c: 'neg', t: 'Olumsuz' }, neu: { c: 'neu', t: 'Nötr' } };
    sents.forEach((s, i) => {
      const el = document.getElementById('snSent' + i);
      if (!el) return;
      const m = MAP[s] || MAP.neu;
      el.classList.add('sn-sent-' + m.c);
      el.title = m.t;
    });
  } catch (e) { /* sessiz — nokta gri kalır */ }
}

async function aiStockNews() {
  if (!_stockNewsItems.length) return;
  const w = (data.watchlist || [])[_stockChartIdx];
  const btn = document.getElementById('stockNewsAiBtn');
  const resEl = document.getElementById('stockNewsAiResult');
  btn.disabled = true;
  resEl.style.display = 'block';
  resEl.textContent = 'AI haber özeti hazırlanıyor…';
  try {
    const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
    if (!token) throw new Error('giriş yapılmamış');
    const headlines = _stockNewsItems.map(n => n.title).slice(0, 12);
    const r = await fetch(STOCK_NEWS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ summarize: true, symbol: w ? w.symbol : '', headlines, instructions: aiInstructions() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `http ${r.status}`);
    resEl.textContent = j.summary || 'Özet üretilemedi.';
  } catch (e) {
    resEl.textContent = '' + e.message;
  }
  btn.disabled = false;
}

// Unix saniye → "3 saat önce" / "dün" gibi Türkçe göreli zaman
function relTimeFromUnix(sec) {
  if (!sec || !isFinite(sec)) return '';
  const diff = Date.now() - sec * 1000;
  if (diff < 0) return 'az önce';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return mins + ' dk önce';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' saat önce';
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'dün';
  if (days < 30) return days + ' gün önce';
  const months = Math.floor(days / 30);
  if (months < 12) return months + ' ay önce';
  return Math.floor(months / 12) + ' yıl önce';
}

async function loadStockHistory(range) {
  if (_stockChartIdx == null) return;
  const w = (data.watchlist || [])[_stockChartIdx];
  if (!w) return;
  _stockChartRange = range;
  document.querySelectorAll('#stockChartRanges button').forEach(b => {
    b.classList.toggle('active', b.dataset.range === range);
  });
  const area = document.getElementById('stockChartArea');
  const stats = document.getElementById('stockChartStats');
  const legend = document.getElementById('stockChartLegend');
  const taPanel = document.getElementById('stockTaPanel');
  area.innerHTML = '<div class="stock-chart-loading">Yükleniyor…</div>';
  stats.style.display = 'none';
  legend.style.display = 'none';
  taPanel.style.display = 'none';
  document.getElementById('stockTaAiResult').style.display = 'none';
  try {
    const ySymbol = w.ySymbol || legacyYSymbol(w);
    const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
    if (!token) throw new Error('giriş yapılmamış');
    const r = await fetch(STOCK_HISTORY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ ySymbol, range }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || `http ${r.status}`);
    }
    const j = await r.json();
    if (!j.closes || j.closes.length < 2) throw new Error('yetersiz veri');
    const ta = computeStockTA(j);
    _stockChartPayload = { j, ta, symbol: w.symbol, range };
    redrawStockChart();
    legend.style.display = ta.sma20 != null ? 'flex' : 'none';
    const cur = j.currency || w.currency || '';
    const dir = j.changePct == null ? 'flat' : (j.changePct > 0 ? 'up' : (j.changePct < 0 ? 'down' : 'flat'));
    const ds = j.changePct == null ? '' : (j.changePct > 0 ? '+' : '');
    const rangeLabel = { '1mo': '1 ay', '3mo': '3 ay', '6mo': '6 ay', '1y': '1 yıl' }[range] || range;
    stats.style.display = 'flex';
    stats.innerHTML = `
      <span>Min <b>${formatStockPrice(j.min)} ${escapeHtml(cur)}</b></span>
      <span class="${dir}" style="color:${dir==='up'?'#34c759':dir==='down'?'#ef4444':'var(--text-muted)'};">${rangeLabel}: <b>${ds}${(j.changePct||0).toFixed(2)}%</b></span>
      <span>Max <b>${formatStockPrice(j.max)} ${escapeHtml(cur)}</b></span>
    `;
    // TA paneli: sadece hisselerde (BIST/ABD) göster — döviz/kripto'da boş bırak
    const taOk = TA_MARKETS.has(w.market || 'bist');
    const _ftb = document.getElementById('stockFundTabBtn');
    if (_ftb) _ftb.style.display = taOk ? '' : 'none';
    if (taOk) {
      renderStockTA(ta, cur);
      renderStockRisk(ta, w, cur);
      loadStockMtf(w, range, j);
      taPanel.style.display = 'block';
      document.getElementById('stockTaAiBtn').disabled = false;
    } else {
      taPanel.style.display = 'none';
    }
  } catch (e) {
    area.innerHTML = `<div class="stock-chart-loading">${escapeHtml(e.message)}</div>`;
  }
}

// Chart mode (Çizgi / Mum) — payload aynı, sadece yeniden çiz
function setChartMode(mode) {
  if (mode !== 'line' && mode !== 'candle') return;
  _stockChartMode = mode;
  document.querySelectorAll('#stockChartModes button[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  redrawStockChart();
}

// Fibonacci geri çekilme overlay toggle
function toggleFib() {
  _stockChartFib = !_stockChartFib;
  const btn = document.getElementById('stockChartFibBtn');
  if (btn) btn.classList.toggle('fib-on', _stockChartFib);
  redrawStockChart();
}

// Payload'tan yeniden çiz — mode + fib state'ine göre
function redrawStockChart() {
  if (!_stockChartPayload) return;
  const { j, ta } = _stockChartPayload;
  const area = document.getElementById('stockChartArea');
  const fib = _stockChartFib ? computeFibLevels(j) : null;
  if (_stockChartMode === 'candle' && j.opens && j.highs && j.lows) {
    area.innerHTML = candleChartTA(j, ta, fib);
  } else {
    area.innerHTML = lineChartTA(j.closes, ta, fib);
  }
}

// Fibonacci geri çekilme seviyeleri — trend yönüne göre
// Yukarı trend: 0% = en yüksek, 100% = en düşük (zirveden geri çekilme)
// Aşağı trend: 0% = en düşük, 100% = en yüksek (dipten geri yükselme)
function computeFibLevels(j) {
  const closes = j.closes || [];
  if (closes.length < 5) return null;
  const highs = (j.highs || closes).filter(v => v != null);
  const lows = (j.lows || closes).filter(v => v != null);
  if (!highs.length || !lows.length) return null;
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  if (high <= low) return null;
  const isUp = closes[closes.length - 1] >= closes[0];
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const range = high - low;
  return {
    isUp, high, low,
    levels: ratios.map(r => ({
      ratio: r,
      label: (r * 100).toFixed(1).replace(/\.0$/, '') + '%',
      price: Math.round((isUp ? high - range * r : low + range * r) * 100) / 100,
    })),
  };
}

// ——— Teknik analiz hesapları (saf JS, harici lib yok) ———
function taSma(arr, period) {
  if (!arr || arr.length < period) return null;
  let s = 0;
  for (let i = arr.length - period; i < arr.length; i++) s += arr[i];
  return Math.round((s / period) * 100) / 100;
}

function taSmaSeries(arr, period) {
  const out = new Array(arr.length).fill(null);
  for (let i = period - 1; i < arr.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += arr[j];
    out[i] = s / period;
  }
  return out;
}

function taEmaSeries(arr, period) {
  const out = new Array(arr.length).fill(null);
  if (arr.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += arr[i];
  let ema = sum / period;
  out[period - 1] = ema;
  const k = 2 / (period + 1);
  for (let i = period; i < arr.length; i++) {
    ema = arr[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

function taRsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 10) / 10;
}

function taMacd(closes) {
  if (closes.length < 35) return null;
  const e12 = taEmaSeries(closes, 12);
  const e26 = taEmaSeries(closes, 26);
  const macdLine = closes.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
  const macdVals = macdLine.filter(v => v != null);
  if (macdVals.length < 9) return null;
  const sigSeries = taEmaSeries(macdVals, 9);
  const line = macdVals[macdVals.length - 1];
  const signal = sigSeries[sigSeries.length - 1];
  if (line == null || signal == null) return null;
  return {
    line: Math.round(line * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round((line - signal) * 100) / 100,
  };
}

function taBollinger(closes, period = 20, mult = 2) {
  const mid = taSma(closes, period);
  if (mid == null) return null;
  const slice = closes.slice(-period);
  const variance = slice.reduce((a, v) => a + (v - mid) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return {
    mid,
    upper: Math.round((mid + mult * std) * 100) / 100,
    lower: Math.round((mid - mult * std) * 100) / 100,
  };
}

function taAtrPct(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i] ?? closes[i];
    const l = lows[i] ?? closes[i];
    const prev = closes[i - 1];
    trs.push(Math.max(h - l, Math.abs(h - prev), Math.abs(l - prev)));
  }
  if (trs.length < period) return null;
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  const last = closes[closes.length - 1];
  return last > 0 ? Math.round((atr / last) * 10000) / 100 : null;
}

// ADX (14) — trend gücü. <20 trendsiz/yatay, 20-25 zayıf, 25-50 güçlü, >50 çok güçlü trend.
// +DI / -DI yön sinyalleri kullanılır ama gücün netliği ADX'tir.
function taAdx(highs, lows, closes, period = 14) {
  if (closes.length < period * 2 + 1) return null;
  const tr = [], plusDM = [], minusDM = [];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i], l = lows[i], ph = highs[i - 1], pl = lows[i - 1], pc = closes[i - 1];
    if ([h, l, ph, pl, pc].some(v => v == null)) { tr.push(0); plusDM.push(0); minusDM.push(0); continue; }
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const up = h - ph, dn = pl - l;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
  }
  if (tr.length < period * 2) return null;
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let pSum = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let mSum = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  const dxArr = [];
  for (let i = period; i < tr.length; i++) {
    atr = atr - atr / period + tr[i];
    pSum = pSum - pSum / period + plusDM[i];
    mSum = mSum - mSum / period + minusDM[i];
    if (atr <= 0) { dxArr.push(0); continue; }
    const pdi = (pSum / atr) * 100;
    const mdi = (mSum / atr) * 100;
    const sum = pdi + mdi;
    dxArr.push(sum > 0 ? (Math.abs(pdi - mdi) / sum) * 100 : 0);
  }
  if (dxArr.length < period) return null;
  let adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxArr.length; i++) {
    adx = (adx * (period - 1) + dxArr[i]) / period;
  }
  return Math.round(adx * 10) / 10;
}

// OBV (On-Balance Volume) — kümülatif hacim, fiyatla aynı yönde olmalı (diverjans uyarısı)
// Sadece son değeri değil, son 10 vs önceki 10 ortalamasını kıyaslayıp trend etiketi de döner.
function taObv(closes, volumes) {
  if (!volumes || volumes.length !== closes.length || closes.length < 5) return null;
  let obv = 0;
  const series = [0];
  for (let i = 1; i < closes.length; i++) {
    const v = volumes[i] != null && isFinite(volumes[i]) ? volumes[i] : 0;
    if (closes[i] > closes[i - 1]) obv += v;
    else if (closes[i] < closes[i - 1]) obv -= v;
    series.push(obv);
  }
  const tail = series.slice(-10), head = series.slice(-20, -10);
  let trend = 'belirsiz';
  if (tail.length >= 5 && head.length >= 5) {
    const t = tail.reduce((a, b) => a + b, 0) / tail.length;
    const h = head.reduce((a, b) => a + b, 0) / head.length;
    const abs = Math.max(Math.abs(t), Math.abs(h), 1);
    const diff = (t - h) / abs;
    if (diff > 0.05) trend = 'yukarı';
    else if (diff < -0.05) trend = 'aşağı';
    else trend = 'yatay';
  }
  return { value: Math.round(obv), trend };
}

// Klasik Pivot Points — son tam günün H/L/C'sinden bugünün PP/R1/R2/S1/S2'si
function taPivots(highs, lows, closes) {
  const i = closes.length - 2;  // son tam gün (son index = bugün, oluşum dünden gelir)
  if (i < 0) return null;
  const h = highs[i], l = lows[i], c = closes[i];
  if (h == null || l == null || c == null) return null;
  const pp = (h + l + c) / 3;
  const round = v => Math.round(v * 100) / 100;
  return {
    pp: round(pp),
    r1: round(2 * pp - l),
    s1: round(2 * pp - h),
    r2: round(pp + (h - l)),
    s2: round(pp - (h - l)),
  };
}

function taSupportResistance(closes, highs, lows, lookback = 20) {
  const n = Math.min(lookback, closes.length);
  const cSlice = closes.slice(-n);
  const hSlice = (highs && highs.length >= n) ? highs.slice(-n) : cSlice;
  const lSlice = (lows && lows.length >= n) ? lows.slice(-n) : cSlice;
  return {
    support: Math.round(Math.min(...lSlice.filter(v => v != null)) * 100) / 100,
    resistance: Math.round(Math.max(...hSlice.filter(v => v != null)) * 100) / 100,
  };
}

function taTrend(closes) {
  if (closes.length < 5) return 'belirsiz';
  const recent = closes.slice(-Math.min(10, closes.length));
  const first = recent[0], last = recent[recent.length - 1];
  const chg = first > 0 ? ((last - first) / first) * 100 : 0;
  if (chg > 2) return 'yukarı';
  if (chg < -2) return 'aşağı';
  return 'yatay';
}

function taRsiZone(rsi) {
  if (rsi == null) return '—';
  if (rsi >= 70) return 'aşırı alım bölgesi';
  if (rsi <= 30) return 'aşırı satım bölgesi';
  return 'nötr bölge';
}

function computeStockTA(j) {
  const closes = j.closes || [];
  const highs = j.highs || closes;
  const lows = j.lows || closes;
  const volumes = j.volumes || [];
  const current = closes[closes.length - 1];
  const sma20 = taSma(closes, 20);
  const sma50 = taSma(closes, 50);
  const rsi = taRsi(closes, 14);
  const macd = taMacd(closes);
  const bb = taBollinger(closes, 20, 2);
  const sr = taSupportResistance(closes, highs, lows, 20);
  const atrPct = taAtrPct(highs, lows, closes, 14);
  const adx = taAdx(highs, lows, closes, 14);
  const obv = taObv(closes, volumes);
  const pivots = taPivots(highs, lows, closes);
  let volRatio = null;
  if (volumes.length >= 10) {
    const valid = volumes.filter(v => v != null && v > 0);
    if (valid.length >= 5) {
      const avg = valid.slice(0, -1).reduce((a, b) => a + b, 0) / (valid.length - 1);
      const last = valid[valid.length - 1];
      if (avg > 0) volRatio = Math.round((last / avg) * 100) / 100;
    }
  }
  let recentChange7d = null;
  if (closes.length >= 8) {
    const prev = closes[closes.length - 8];
    if (prev > 0) recentChange7d = Math.round(((current - prev) / prev) * 10000) / 100;
  }
  let bbPosition = '—';
  if (bb && current != null && bb.upper > bb.lower) {
    const pct = ((current - bb.lower) / (bb.upper - bb.lower)) * 100;
    if (pct >= 85) bbPosition = 'üst banda yakın';
    else if (pct <= 15) bbPosition = 'alt banda yakın';
    else bbPosition = 'orta bölge';
  }
  let priceVsSma20 = '—';
  if (sma20 && current) {
    const d = ((current - sma20) / sma20) * 100;
    priceVsSma20 = (d >= 0 ? '+' : '') + d.toFixed(1) + '%';
  }
  // ADX zone etiketi
  const adxZone = adx == null ? '—' : (adx >= 50 ? 'çok güçlü trend' : adx >= 25 ? 'güçlü trend' : adx >= 20 ? 'zayıf trend' : 'yatay/trendsiz');
  // Pivot konumu — fiyat hangi pivot seviyesinde
  let pivotZone = '—';
  if (pivots && current != null) {
    if (current >= pivots.r2) pivotZone = 'R2 üstünde';
    else if (current >= pivots.r1) pivotZone = 'R1-R2 arası';
    else if (current >= pivots.pp) pivotZone = 'PP-R1 arası';
    else if (current >= pivots.s1) pivotZone = 'S1-PP arası';
    else if (current >= pivots.s2) pivotZone = 'S2-S1 arası';
    else pivotZone = 'S2 altında';
  }
  const sma20Series = taSmaSeries(closes, 20);
  const sma50Series = taSmaSeries(closes, 50);
  const trend = taTrend(closes);
  const signals = buildTacticalSignals({
    current, sma20, sma50, rsi, macd, bb, bbPosition, volRatio, sr, trend,
    adx, adxZone, obv, pivots, pivotZone,
  });
  const out = {
    current, sma20, sma50, rsi, rsiZone: taRsiZone(rsi), macd, bb, sr, atrPct, volRatio,
    adx, adxZone, obv, pivots, pivotZone,
    trend, bbPosition, priceVsSma20, recentChange7d,
    sma20Series, sma50Series, signals,
    changePct: j.changePct, min: j.min, max: j.max,
  };
  // Analiz v2 — uyum skoru + kosullu senaryolar (lokal, kural tabanli)
  out.confluence = taConfluence(out);
  out.scenarios = taScenarios(out, j);
  return out;
}

function buildTacticalSignals(ta) {
  const out = [];
  if (ta.rsi != null) {
    if (ta.rsi >= 70) out.push(`RSI ${ta.rsi} — aşırı alım bölgesinde`);
    else if (ta.rsi <= 30) out.push(`RSI ${ta.rsi} — aşırı satım bölgesinde`);
    else out.push(`RSI ${ta.rsi} — nötr bölgede`);
  }
  if (ta.adx != null) {
    out.push(`ADX ${ta.adx} — ${ta.adxZone}`);
  }
  if (ta.sma20 != null && ta.sma50 != null) {
    if (ta.sma20 > ta.sma50) out.push('SMA20 > SMA50 — kısa vade ortalama uzun vadenin üstünde (altın kesişim bölgesi)');
    else if (ta.sma20 < ta.sma50) out.push('SMA20 < SMA50 — kısa vade ortalama uzun vadenin altında (ölüm kesişim bölgesi)');
  } else if (ta.sma20 != null && ta.current) {
    out.push(ta.current >= ta.sma20 ? 'Fiyat SMA20 üzerinde' : 'Fiyat SMA20 altında');
  }
  if (ta.macd) {
    out.push(ta.macd.histogram >= 0
      ? `MACD histogram pozitif (${ta.macd.histogram}) — momentum yukarı eğilimli`
      : `MACD histogram negatif (${ta.macd.histogram}) — momentum aşağı eğilimli`);
  }
  if (ta.volRatio != null && ta.volRatio >= 1.4) {
    out.push(`Hacim ortalamanın ${ta.volRatio}× üzerinde — hareketli seans`);
  } else if (ta.volRatio != null && ta.volRatio <= 0.6) {
    out.push(`Hacim düşük (${ta.volRatio}× ortalama) — sakin seans`);
  }
  if (ta.sr && ta.current) {
    const nearSup = ta.sr.support && Math.abs(ta.current - ta.sr.support) / ta.current < 0.02;
    const nearRes = ta.sr.resistance && Math.abs(ta.current - ta.sr.resistance) / ta.current < 0.02;
    if (nearSup) out.push(`Destek ${ta.sr.support} seviyesine yakın`);
    if (nearRes) out.push(`Direnç ${ta.sr.resistance} seviyesine yakın`);
  }
  return out.slice(0, 10);
}

function renderStockTA(ta, cur) {
  const grid = document.getElementById('stockTaGrid');
  const sigEl = document.getElementById('stockTaSignals');
  const fmt = v => v == null ? '—' : (typeof v === 'number' ? formatStockPrice(v) : v);
  const adxCls = ta.adx == null ? '' : (ta.adx >= 25 ? 'up' : ta.adx >= 20 ? 'warn' : '');
  const cells = [
    { lbl: 'RSI (14)', val: ta.rsi != null ? ta.rsi.toFixed(1) : '—', sub: ta.rsiZone, cls: ta.rsi != null ? (ta.rsi >= 70 ? 'warn' : (ta.rsi <= 30 ? 'down' : '')) : '' },
    { lbl: 'ADX (14)', val: ta.adx != null ? ta.adx.toFixed(1) : '—', sub: ta.adxZone, cls: adxCls },
    { lbl: 'SMA 20', val: fmt(ta.sma20), sub: ta.priceVsSma20, cls: ta.sma20 != null && ta.current >= ta.sma20 ? 'up' : (ta.sma20 != null ? 'down' : '') },
    { lbl: 'SMA 50', val: fmt(ta.sma50), sub: cur, cls: '' },
    { lbl: 'MACD', val: ta.macd ? ta.macd.histogram.toFixed(2) : '—', sub: ta.macd ? `çizgi ${ta.macd.line}` : 'yetersiz veri', cls: ta.macd && ta.macd.histogram >= 0 ? 'up' : 'down' },
    { lbl: 'ATR %', val: ta.atrPct != null ? ta.atrPct + '%' : '—', sub: 'volatilite', cls: ta.atrPct > 3 ? 'warn' : '' },
    { lbl: 'Destek', val: fmt(ta.sr?.support), sub: '20 periyot', cls: '' },
    { lbl: 'Direnç', val: fmt(ta.sr?.resistance), sub: '20 periyot', cls: '' },
    { lbl: 'Hacim', val: ta.volRatio != null ? ta.volRatio + '×' : '—', sub: 'son/ort', cls: ta.volRatio >= 1.4 ? 'warn' : '' },
  ];
  grid.innerHTML = cells.map(c => `
    <div class="stock-ta-cell ${c.cls}">
      <div class="lbl">${c.lbl}</div>
      <div class="val">${escapeHtml(String(c.val))}</div>
      <div class="sub">${escapeHtml(String(c.sub || ''))}</div>
    </div>
  `).join('');
  sigEl.innerHTML = (ta.signals || []).map(s => {
    const cls = /üstünde|pozitif|altın|yukarı|aşırı alım/i.test(s) ? 'up'
      : /altında|negatif|ölüm|aşağı|aşırı satım/i.test(s) ? 'down'
      : /Hacim ortalamanın|üst banda|Direnç/i.test(s) ? 'warn' : '';
    return `<span class="stock-ta-sig ${cls}">${escapeHtml(s)}</span>`;
  }).join('') || '<span class="stock-ta-sig">Yeterli veri yok — 3 ay veya 6 ay dene</span>';
  renderConfluence(ta);
  renderScenarios(ta, cur);
}

// ============================================================
// ANALIZ v2 (7 Agu) — uyum skoru + kosullu senaryolar + coklu zaman dilimi
// Hepsi LOKAL ve kural tabanli ($0, AI yok). Tahmin URETMEZ:
// "su seviyenin ustunde gunluk kapanis olursa su bolge teknik olarak gundeme
// gelir" biciminde KOSULLU seviye haritasi cikarir + gecersizlesme seviyesi verir.
// ============================================================

// ——— 1) Uyum skoru: gostergelerin kaci ayni yone bakiyor ———
// Eskiden 12 oy vardi; denetimde ağırlıkça %78'inin (9/12) aynı şeyi ölçtüğü
// görüldü — hepsi son dönem fiyat serisinin farklı yumuşatmaları (Trend,
// EMA9/21, MACD sıfır çizgisi, Stochastic, Bollinger konumu, Pivot konumu,
// Son 7 periyot hepsi "fiyat son zamanda nereye gitti" sorusunu tekrar
// tekrar soruyordu). Sonuç "uyum" değil, tek bir momentum sinyalinin 9 farklı
// kılıkta oy kullanmasıydı — skor yanıltıcı biçimde yüksek/düşük çıkabiliyordu.
// Şimdi 5 oy, HER BİRİ BAĞIMSIZ bir faktörü ölçüyor:
//   Fiyat / SMA20   → konum (fiyat kısa ortalamaya göre nerede)
//   SMA20 / SMA50   → ana yön (kısa vade uzun vadenin neresinde)
//   MACD histogram  → momentumun DEĞİŞİMİ (ivme, konum değil)
//   RSI momentum    → aşırılık (aşırı alım/satım bölgesi)
//   OBV para akışı  → hacim onayı (fiyat hareketinin arkasında para var mı)
// Her gosterge +1 (yukari) / -1 (asagi) / 0 (notr) oy verir, agirlikli ortalama.
// ADX oy VERMEZ — yonsuzdur; skorun guvenilirligini nitelemekte kullanilir.
function taConfluence(ta) {
  if (!ta) return null;
  const votes = [];
  const add = (name, w, v, note) => { if (v === 0 || v === 1 || v === -1) votes.push({ name, w, v, note: note || '' }); };
  const cmp = (a, b) => (a == null || b == null) ? null : (a > b ? 1 : a < b ? -1 : 0);

  add('Fiyat / SMA20', 1.5, cmp(ta.current, ta.sma20), ta.priceVsSma20);
  add('SMA20 / SMA50', 2, cmp(ta.sma20, ta.sma50),
      ta.sma20 != null && ta.sma50 != null ? (ta.sma20 > ta.sma50 ? 'kısa vade üstte' : ta.sma20 < ta.sma50 ? 'kısa vade altta' : 'eşit') : '');
  add('MACD histogram', 1.5, ta.macd ? (ta.macd.histogram > 0 ? 1 : ta.macd.histogram < 0 ? -1 : 0) : null,
      ta.macd ? String(ta.macd.histogram) : '');
  add('RSI momentum', 1, ta.rsi == null ? null : (ta.rsi >= 55 ? 1 : ta.rsi <= 45 ? -1 : 0),
      ta.rsi == null ? '' : String(Math.round(ta.rsi)));
  add('OBV para akışı', 1, ta.obv ? (ta.obv.trend === 'yukarı' ? 1 : ta.obv.trend === 'aşağı' ? -1 : 0) : null,
      ta.obv ? ta.obv.trend : '');

  if (votes.length < 3) return null;
  const wSum = votes.reduce((a, b) => a + b.w, 0);
  const net = votes.reduce((a, b) => a + b.w * b.v, 0);
  const score = Math.max(0, Math.min(100, Math.round(50 + 50 * net / wSum)));
  const bull = votes.filter(v => v.v > 0).length;
  const bear = votes.filter(v => v.v < 0).length;
  const neutral = votes.filter(v => v.v === 0).length;
  let label, dir;
  if (score >= 72) { label = 'güçlü yukarı uyum'; dir = 'up'; }
  else if (score >= 58) { label = 'yukarı eğilimli'; dir = 'up'; }
  else if (score > 42) { label = 'karışık / kararsız'; dir = 'mixed'; }
  else if (score > 28) { label = 'aşağı eğilimli'; dir = 'down'; }
  else { label = 'güçlü aşağı uyum'; dir = 'down'; }
  const reliability = ta.adx == null ? 'bilinmiyor' : ta.adx >= 25 ? 'yüksek' : ta.adx >= 20 ? 'orta' : 'düşük';
  return { score, label, dir, bull, bear, neutral, total: votes.length, reliability, adx: ta.adx, votes };
}

// ——— 2) Kosullu senaryolar: seviye haritasi + gecersizlesme ———
// Aday seviyeler: 20 periyot destek/direnc, klasik pivotlar, Bollinger bantlari,
// donem min/max. %0.4 icinde olanlar tek seviyeye birlestirilir (grafikte ayni cizgi).
function taMergeLevels(list, price) {
  const clean = list.filter(x => x && x.v != null && isFinite(x.v) && x.v > 0);
  const out = [];
  clean.sort((a, b) => a.v - b.v);
  clean.forEach(x => {
    const last = out[out.length - 1];
    if (last && Math.abs(x.v - last.v) / price < 0.004) { if (!last.src.includes(x.src)) last.src.push(x.src); }
    else out.push({ v: Math.round(x.v * 100) / 100, src: [x.src] });
  });
  return out;
}

function taScenarios(ta, j) {
  const price = ta && ta.current;
  if (price == null || !(price > 0)) return null;
  // ATR mutlak degeri — yoksa Bollinger genisliginin 1/4'u, o da yoksa fiyatin %2'si
  let atrAbs = null;
  if (ta.atrPct != null && ta.atrPct > 0) atrAbs = price * ta.atrPct / 100;
  else if (ta.bb && ta.bb.upper > ta.bb.lower) atrAbs = (ta.bb.upper - ta.bb.lower) / 4;
  else atrAbs = price * 0.02;
  const atrPct = Math.round(atrAbs / price * 10000) / 100;

  const cand = [
    { v: ta.sr && ta.sr.resistance, src: 'direnç' }, { v: ta.sr && ta.sr.support, src: 'destek' },
    { v: ta.pivots && ta.pivots.r1, src: 'R1' }, { v: ta.pivots && ta.pivots.r2, src: 'R2' },
    { v: ta.pivots && ta.pivots.s1, src: 'S1' }, { v: ta.pivots && ta.pivots.s2, src: 'S2' },
    { v: ta.pivots && ta.pivots.pp, src: 'PP' },
    { v: ta.bb && ta.bb.upper, src: 'BB üst' }, { v: ta.bb && ta.bb.lower, src: 'BB alt' },
    { v: j && j.max, src: 'dönem zirvesi' }, { v: j && j.min, src: 'dönem dibi' },
  ];
  const all = taMergeLevels(cand, price);
  const above = all.filter(x => x.v > price * 1.001);
  const below = all.filter(x => x.v < price * 0.999).reverse();

  const round = v => Math.round(v * 100) / 100;
  const distPct = v => Math.round(Math.abs(v - price) / price * 10000) / 100;
  // Tetige kac ortalama seansta ulasilir — mesafe / gunluk ortalama hareket (ATR)
  const sessions = v => atrPct > 0 ? Math.round(distPct(v) / atrPct * 10) / 10 : null;

  const mk = (dir, lv, next) => {
    if (!lv) return null;
    const sign = dir === 'up' ? 1 : -1;
    const t1 = next ? next.v : round(lv.v + sign * 1.5 * atrAbs);
    const t2 = round(lv.v + sign * 3 * atrAbs);
    return {
      dir,
      trigger: lv.v,
      triggerSrc: lv.src.join(' + '),
      distPct: distPct(lv.v),
      sessions: sessions(lv.v),
      t1: round(t1),
      t1Src: next ? next.src.join(' + ') : 'ATR×1.5',
      t2,
      invalidate: round(lv.v - sign * 1 * atrAbs),
    };
  };

  const up = mk('up', above[0], above[1]);
  const down = mk('down', below[0], below[1]);

  const band = (above[0] && below[0]) ? {
    low: below[0].v, high: above[0].v,
    widthPct: Math.round((above[0].v - below[0].v) / price * 10000) / 100,
  } : null;

  // Oynaklik bandi — ATR×sqrt(gun). Tahmin degil: gecmis oynakligin istatistiksel araligi.
  const vol5 = { low: round(price - atrAbs * Math.sqrt(5)), high: round(price + atrAbs * Math.sqrt(5)) };

  return { price, atrAbs: round(atrAbs), atrPct, up, down, band, vol5, levelsUp: above.slice(0, 3), levelsDown: below.slice(0, 3) };
}

// ——— 3) Coklu zaman dilimi: gunluk bar -> haftalik bar ———
// Sondan geriye 5'erli gruplar (son hafta yarim olsa da kullanilir).
function taResample(j, size) {
  const cl = (j && j.closes) || [];
  if (cl.length < size * 8) return null;
  const hi = j.highs || cl, lo = j.lows || cl, op = j.opens || cl, vo = j.volumes || [];
  const out = { closes: [], highs: [], lows: [], opens: [], volumes: [], timestamps: [], currency: j.currency, name: j.name };
  for (let end = cl.length; end > 0; end -= size) {
    const s = Math.max(0, end - size);
    const cs = cl.slice(s, end).filter(v => v != null);
    if (!cs.length) continue;
    const hs = hi.slice(s, end).filter(v => v != null);
    const ls = lo.slice(s, end).filter(v => v != null);
    const vs = vo.slice(s, end).filter(v => v != null);
    out.closes.unshift(cs[cs.length - 1]);
    out.opens.unshift((op.slice(s, end).filter(v => v != null))[0] ?? cs[0]);
    out.highs.unshift(hs.length ? Math.max(...hs) : cs[cs.length - 1]);
    out.lows.unshift(ls.length ? Math.min(...ls) : cs[cs.length - 1]);
    out.volumes.unshift(vs.length ? vs.reduce((a, b) => a + b, 0) : null);
    out.timestamps.unshift((j.timestamps || [])[end - 1] ?? null);
  }
  if (out.closes.length < 8) return null;
  out.min = Math.round(Math.min(...out.lows) * 100) / 100;
  out.max = Math.round(Math.max(...out.highs) * 100) / 100;
  const f = out.closes[0], l = out.closes[out.closes.length - 1];
  out.changePct = f > 0 ? Math.round((l - f) / f * 10000) / 100 : 0;
  return out;
}

// Gunluk ile haftalik uyum skorlarini karsilastirir.
function taMtfCompare(daily, weekly) {
  const d = daily && daily.confluence, w = weekly && weekly.confluence;
  if (!d || !w) return null;
  let state, cls, text;
  if (d.dir === 'mixed' || w.dir === 'mixed') {
    state = 'kısmi'; cls = 'mixed';
    text = 'bir zaman dilimi kararsız — tek başına zayıf sinyal';
  } else if (d.dir === w.dir) {
    state = 'uyumlu'; cls = d.dir;
    text = d.dir === 'up'
      ? 'kısa vade ve ana eğilim aynı yönde — göstergeler birbirini destekliyor'
      : 'kısa vade ve ana eğilim aynı yönde (aşağı) — göstergeler birbirini destekliyor';
  } else {
    state = 'çatışıyor'; cls = 'conflict';
    text = 'kısa vade ile ana eğilim ters yönde — bu dönemlerde yanlış sinyal oranı yükselir';
  }
  return {
    state, cls, text,
    daily: { score: d.score, label: d.label },
    weekly: { score: w.score, label: w.label },
  };
}

// ——— Render: uyum skoru ———
function renderConfluence(ta) {
  const el = document.getElementById('stockConfluence');
  if (!el) return;
  const c = ta && ta.confluence;
  if (!c) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const cls = c.dir === 'up' ? 'up' : c.dir === 'down' ? 'down' : 'mixed';
  const relNote = {
    'yüksek': `ADX ${c.adx} — piyasa trendli, uyum sinyali daha anlamlı`,
    'orta': `ADX ${c.adx} — trend yeni kuruluyor, uyum sinyali orta güçte`,
    'düşük': `ADX ${c.adx} — piyasa yatay, uyum sinyali zayıf (yatay piyasada göstergeler sık yanıltır)`,
    'bilinmiyor': 'ADX hesaplanamadı — sinyal gücü niteliği bilinmiyor',
  }[c.reliability];
  el.innerHTML = `
    <div class="sc-head">
      <span class="sc-score ${cls}">${c.score}</span>
      <div class="sc-txt">
        <div class="sc-label">${escapeHtml(c.label)}</div>
        <div class="sc-sub">${c.bull} gösterge yukarı · ${c.bear} aşağı · ${c.neutral} nötr — toplam ${c.total}</div>
      </div>
    </div>
    <div class="sc-bar"><span class="sc-fill ${cls}" style="width:${c.score}%"></span><i class="sc-mid"></i></div>
    <div class="sc-rel">${escapeHtml(relNote)}</div>
    <details class="sc-det"><summary>Oy dökümü (${c.total} gösterge)</summary>
      <div class="sc-votes">${c.votes.map(v => `<span class="sc-vote ${v.v > 0 ? 'up' : v.v < 0 ? 'down' : ''}">${escapeHtml(v.name)} ${v.v > 0 ? '↑' : v.v < 0 ? '↓' : '·'}${v.note ? ` <i>${escapeHtml(v.note)}</i>` : ''}</span>`).join('')}</div>
    </details>`;
}

// ——— Render: kosullu senaryolar ———
function renderScenarios(ta, cur) {
  const el = document.getElementById('stockScenarios');
  if (!el) return;
  const s = ta && ta.scenarios;
  if (!s || (!s.up && !s.down)) { el.innerHTML = '<span class="stock-ta-sig">Senaryo için yeterli seviye verisi yok — 3 ay veya 1 yıl dene</span>'; return; }
  const f = v => formatStockPrice(v);
  const c = escapeHtml(cur || '');
  const card = (sc, title) => {
    if (!sc) return '';
    const sess = sc.sessions != null ? ` ≈ ${sc.sessions} ortalama seans` : '';
    return `
    <div class="scen-card ${sc.dir}">
      <div class="scen-h"><span class="scen-dot"></span>${title}</div>
      <div class="scen-line"><b>Tetik</b> günlük kapanış <u>${f(sc.trigger)} ${c}</u> ${sc.dir === 'up' ? 'üstünde' : 'altında'} <i>(${escapeHtml(sc.triggerSrc)} · %${sc.distPct} uzakta${sess})</i></div>
      <div class="scen-line"><b>Sonraki seviyeler</b> ${f(sc.t1)} <i>(${escapeHtml(sc.t1Src)})</i> → ${f(sc.t2)} <i>(ATR×3)</i></div>
      <div class="scen-line"><b>Geçersizleşir</b> fiyat ${f(sc.invalidate)} ${sc.dir === 'up' ? 'altına dönerse' : 'üstüne dönerse'} — tetik yanlış çıkmış demektir</div>
    </div>`;
  };
  const bandLine = s.band
    ? `<div class="scen-band"><b>Sıkışma bandı</b> ${f(s.band.low)} – ${f(s.band.high)} ${c} <i>(genişlik %${s.band.widthPct})</i></div>` : '';
  const volLine = `<div class="scen-band"><b>Oynaklık aralığı (5 seans)</b> ${f(s.vol5.low)} – ${f(s.vol5.high)} ${c} <i>(ATR×√5 — geçmiş oynaklığın istatistiksel bandı, tahmin değil)</i></div>`;
  el.innerHTML = card(s.up, 'Yukarı senaryo') + card(s.down, 'Aşağı senaryo') + bandLine + volLine +
    `<div class="scen-note">Bunlar tahmin değil, koşullu seviye haritasıdır: tetik gerçekleşmezse senaryo başlamaz.</div>`;
}

// ——— Coklu zaman dilimi: 1y veriyi haftaliga cevirip gunlukle karsilastir ———
let _stockMtf = null;
const _stockMtfCache = {};   // ySymbol -> {at, j}
let _stockMtfReq = 0;

async function loadStockMtf(w, range, jCur) {
  const el = document.getElementById('stockMtf');
  if (!el) return;
  _stockMtf = null;
  el.style.display = 'none';
  const req = ++_stockMtfReq;
  const sym = w.symbol;
  try {
    const ySymbol = w.ySymbol || legacyYSymbol(w);
    let j1y = null;
    if (range === '1y' && jCur && (jCur.closes || []).length >= 60) j1y = jCur;
    else {
      const cached = _stockMtfCache[ySymbol];
      if (cached && Date.now() - cached.at < 30 * 60 * 1000) j1y = cached.j;
      else {
        const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
        if (!token) return;
        const r = await fetch(STOCK_HISTORY_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ ySymbol, range: '1y' }),
        });
        if (!r.ok) return;
        j1y = await r.json();
        _stockMtfCache[ySymbol] = { at: Date.now(), j: j1y };
      }
    }
    if (req !== _stockMtfReq) return;                       // kullanici araligi degistirdi
    if (!_stockChartPayload || _stockChartPayload.symbol !== sym) return;
    const jw = taResample(j1y, 5);
    if (!jw) return;
    const weekly = computeStockTA(jw);
    const cmp = taMtfCompare(_stockChartPayload.ta, weekly);
    if (!cmp) return;
    _stockMtf = { weekly, cmp };
    el.style.display = 'block';
    el.className = 'stock-mtf ' + cmp.cls;
    el.innerHTML = `<b>Zaman dilimi uyumu — ${escapeHtml(cmp.state)}</b>
      <span>Günlük: ${escapeHtml(cmp.daily.label)} (${cmp.daily.score}) · Haftalık: ${escapeHtml(cmp.weekly.label)} (${cmp.weekly.score})</span>
      <span class="mtf-txt">${escapeHtml(cmp.text)}</span>`;
  } catch {}
}

// ——— Risk / stop-loss önerisi (Tem 11) ———
// Mevcut TA'dan (ATR + destek/direnç) stop + hedef + R:R türetir. Kural tabanlı, AI yok.
function taStopSuggestion(ta, w) {
  const price = ta && ta.current;
  if (price == null || price <= 0) return null;
  const out = { price };
  // ATR tabanlı stop — 2×ATR volatilite payı
  if (ta.atrPct != null && ta.atrPct > 0) {
    const atrAbs = price * ta.atrPct / 100;
    const v = price - 2 * atrAbs;
    if (v > 0) out.atrStop = Math.round(v * 100) / 100;
  }
  // Destek tabanlı stop — 20 periyot desteğin %1 altı
  const sup = ta.sr && ta.sr.support;
  if (sup != null && sup > 0 && sup < price) out.supStop = Math.round(sup * 0.99 * 100) / 100;
  // Öneri seçimi: destek makul mesafedeyse yapı-tabanlı, değilse ATR, o da yoksa sabit %8
  const supRisk = out.supStop != null ? (price - out.supStop) / price : null;
  let stop, reason;
  if (out.supStop != null && supRisk > 0 && supRisk <= 0.12) { stop = out.supStop; reason = '20 periyot desteğin %1 altı'; }
  else if (out.atrStop != null && out.atrStop < price) { stop = out.atrStop; reason = '2×ATR volatilite payı'; }
  else if (out.supStop != null) { stop = out.supStop; reason = 'destek altı (geniş)'; }
  else { stop = Math.round(price * 0.92 * 100) / 100; reason = 'sabit %8 (veri az)'; }
  out.stop = stop;
  out.reason = reason;
  out.riskPct = Math.round((price - stop) / price * 10000) / 100;
  // Hedef: 2:1 R:R
  out.target = Math.round((price + 2 * (price - stop)) * 100) / 100;
  // En yakın dirence göre gerçekçilik kontrolü
  const res = ta.sr && ta.sr.resistance;
  if (res != null && res > price && (price - stop) > 0) {
    out.resTarget = res;
    out.resRR = Math.round((res - price) / (price - stop) * 100) / 100;
  }
  // Pozisyon varsa para cinsinden risk
  if (w && w.qty != null && w.qty > 0) out.moneyRisk = Math.round(w.qty * (price - stop) * 100) / 100;
  return out;
}

// Aynı para birimindeki portföy değeri (pozisyon boyutu için sermaye tabanı)
function riskPortfolioValue(cur) {
  let v = 0;
  (data.watchlist || []).forEach(w => {
    if ((w.currency || 'TRY') === cur && w.qty != null && w.qty > 0 && w.price != null) v += w.qty * w.price;
  });
  return v;
}

// Risk-tabanlı pozisyon boyutu: adet = (sermaye × risk%) ÷ (giriş − stop)
function riskPositionSize(price, stop, cur) {
  const capital = riskPortfolioValue(cur);
  if (!(capital > 0) || price == null || stop == null || price <= stop) return { capital, none: true };
  const riskPct = (data.settings && data.settings.riskPct) || 1.5;
  const riskBudget = capital * riskPct / 100;
  const perShare = price - stop;
  const shares = Math.floor(riskBudget / perShare);
  if (shares <= 0) return { capital, riskPct, riskBudget: Math.round(riskBudget * 100) / 100, shares: 0, tooSmall: true };
  const posValue = shares * price;
  return { capital, riskPct, riskBudget: Math.round(riskBudget * 100) / 100, shares,
           posValue: Math.round(posValue * 100) / 100, weightPct: Math.round(posValue / capital * 1000) / 10 };
}

// Risk yüzdesini değiştir + paneli yeniden çiz
function setRiskPct(pct) {
  if (!data.settings) data.settings = {};
  data.settings.riskPct = pct;
  save();
  if (_stockChartPayload && _stockChartIdx != null) {
    const w = (data.watchlist || [])[_stockChartIdx];
    const cur = _stockChartPayload.j.currency || (w && w.currency) || '';
    renderStockRisk(_stockChartPayload.ta, w, cur);
  }
}

function renderStockRisk(ta, w, cur) {
  const el = document.getElementById('stockRiskPanel');
  if (!el) return;
  const s = taStopSuggestion(ta, w);
  if (!s) { el.innerHTML = '<div class="rk-empty">Stop önerisi için yeterli veri yok.</div>'; return; }
  const c = cur ? ' ' + escapeHtml(cur) : '';
  const f = v => formatStockPrice(v);
  let html = `
    <div class="rk-grid">
      <div class="rk-box stop">
        <div class="rk-lbl">Önerilen stop</div>
        <div class="rk-val">${f(s.stop)}${c}</div>
        <div class="rk-sub">▼ %${s.riskPct} · ${escapeHtml(s.reason)}</div>
      </div>
      <div class="rk-box target">
        <div class="rk-lbl">Hedef (2:1)</div>
        <div class="rk-val">${f(s.target)}${c}</div>
        <div class="rk-sub">risk-ödül 1:2</div>
      </div>
    </div>`;
  if (s.resTarget != null) {
    const dar = s.resRR < 1.5;
    html += `<div class="rk-note${dar ? ' warn' : ''}">En yakın direnç <b>${f(s.resTarget)}${c}</b> — oraya kadar R:R <b>${s.resRR}</b>${dar ? ' · dar, dikkat' : ''}</div>`;
  }
  if (s.moneyRisk != null) {
    html += `<div class="rk-note">Bu pozisyonda riskin: <b>${f(s.moneyRisk)}${c}</b> (${formatLot(w.qty)} adet × stop mesafesi)</div>`;
  }
  // Pozisyon boyutu önerisi (risk-tabanlı)
  const ps = riskPositionSize(s.price, s.stop, cur);
  const rp = (data.settings && data.settings.riskPct) || 1.5;
  const chips = [1, 1.5, 2, 3].map(pp => `<button type="button" class="rk-chip${pp === rp ? ' on' : ''}" onclick="setRiskPct(${pp})">%${pp}</button>`).join('');
  html += `<div class="rk-size"><div class="rk-size-head"><span>Önerilen pozisyon</span><span class="rk-chips">${chips}</span></div>`;
  if (ps.shares > 0) {
    html += `<div class="rk-size-main">${formatLot(ps.shares)} adet al</div>`;
    html += `<div class="rk-size-sub">Riskin <b>${f(ps.riskBudget)}${c}</b> (sermayenin %${ps.riskPct}) · pozisyon ${f(ps.posValue)}${c} · portföyün %${ps.weightPct}'i</div>`;
    if (ps.weightPct > 25) html += `<div class="rk-note warn" style="margin-top:6px;">Bu pozisyon portföyünün %${ps.weightPct}'i — tek hissede yoğunlaşma, dikkat.</div>`;
    html += `<div class="rk-size-cap">Sermaye = ${escapeHtml(cur || '')} portföy değerin (${f(ps.capital)}${c}); nakit dahil değil.</div>`;
  } else if (ps.tooSmall) {
    html += `<div class="rk-size-sub">Risk bütçen (${f(ps.riskBudget)}${c}) 1 lotluk stop riskinden küçük — sermaye ya da risk % artmalı.</div>`;
  } else {
    html += `<div class="rk-size-sub">Pozisyon boyutu için ${escapeHtml(cur || 'bu para biriminde')} portföy değerin gerekiyor — o para biriminde açık pozisyonun yok.</div>`;
  }
  html += `</div>`;
  const alts = [];
  if (s.atrStop != null) alts.push(`ATR: ${f(s.atrStop)}`);
  if (s.supStop != null) alts.push(`destek: ${f(s.supStop)}`);
  if (alts.length) html += `<div class="rk-alts">Alternatif stop → ${alts.join(' · ')}</div>`;
  html += `<button type="button" class="rk-alarm-btn" onclick="setStopAlarm(${s.stop})">Bu stop'u alt alarm yap</button>`;
  html += `<p class="rk-disc">Öneri; yatırım tavsiyesi değildir. Stop'u kendi planına göre ayarla.</p>`;
  el.innerHTML = html;
}

// Önerilen stop'u mevcut alarm altyapısına bağla — alt eşiği geç, cron push kırılınca haber verir
function setStopAlarm(stop) {
  if (_stockChartIdx == null) return;
  const w = (data.watchlist || [])[_stockChartIdx];
  if (!w) return;
  w.alarmBelow = stop;
  w.lastAlertedBelow = false;
  save();
  renderStocks();
  showToast(`${w.symbol}: ${formatStockPrice(stop)} altına inince bildirim gelecek`, 'success', 3000);
}

// ============================================================
// BUFFETT SKORU — temel analiz karsiligi (teknik uyum skorunun esi)
// ============================================================
// Kaynak ayrimi: 1 Dolar Testi + Owner Earnings dogrudan Buffett'in mektuplarindan;
// sayisal esikler yorumculardan damitildi (Buffett rakam vermez, tarz verir).
// KASITLI OLARAK DISARIDA: FAVOK/EBITDA (Buffett acikca reddediyor), beta/volatilite,
// analist hedefi, "duzeltilmis" kar, tum teknik gostergeler.
// ---
// Skor 0-100, agirlikli. Veri gelmeyen kriter ATLANIR (uydurma puan yok),
// kapsama orani ayrica raporlanir; kapsama %50'nin altindaysa skor null doner.

const BUFFETT_HURDLE_DEFAULT = { TRY: 35, USD: 10, EUR: 8, GBP: 8 };

function bfClamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
function bfLin(v, lo, hi) { return (hi === lo) ? 0 : bfClamp01((v - lo) / (hi - lo)); }
function bfMedian(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function bfR(v, d) { return (v == null || !isFinite(v)) ? null : Math.round(v * Math.pow(10, d)) / Math.pow(10, d); }

// Engel orani (hurdle rate) — Buffett'in "sermaye maliyetinin ustunde" olcusunun TR karsiligi.
// TR'de %15 ROE iyi degil: mevduat/tahvil nominal getirisi cok yuksek.
function buffettHurdle(cur) {
  const c = String(cur || 'TRY').toUpperCase();
  const ov = (typeof data !== 'undefined' && data.settings) ? data.settings.buffettHurdle : null;
  if (ov && typeof ov === 'object') {
    const v = Number(ov[c]);
    if (isFinite(v) && v > 0 && v < 200) return v;
  }
  return BUFFETT_HURDLE_DEFAULT[c] != null ? BUFFETT_HURDLE_DEFAULT[c] : 10;
}

// ============================================================
// KURUM TIPI — hangi kriter seti uygulanacak
// ============================================================
// 🔴 NEDEN SART: banka tasarimi geregi 8-10 KAT kaldiracli calisir. Operasyonel
// sirkette dogru olan "borc/ozsermaye dusuk olsun" kriteri bankaya YAPISAL
// olarak 0 verir; owner earnings, capex ve 1 Dolar Testi bankada anlamsizdir.
// Buffett banka ALIR (Wells Fargo 1990, American Express, Bank of America) ama
// BASKA olculerle okur: varlik karliligi, kaldirac, defter degeri buyumesi.
// Tek kriter seti bankalari ya haksiz eler ya da haksiz gecirir — ikisi de hata.
const BF_KIND_LABEL = {
  operating: 'operasyonel şirket',
  financial: 'banka / finans',
  reit: 'gayrimenkul yatırım ortaklığı',
  holding: 'holding',
};

// ⚠️ ELLE BAKILAN LISTELER — Yahoo, BIST'te assetProfile.sector'u sik sik BOS
// dondurur; o yuzden sembol listesi ILK katmandir. Liste eksikse Yahoo sektoru,
// o da yoksa bilanco sekli devreye girer (3 katman, sirayla).
const BF_FIN_SYMBOLS = ['AKBNK', 'ALBRK', 'AGESA', 'ANHYT', 'ANSGR', 'A1CAP', 'GARAN', 'GARFA',
  'GLBMD', 'HALKB', 'ICBCT', 'INFO', 'ISCTR', 'ISFIN', 'ISMEN', 'KLNMA', 'LIDFA', 'OSMEN',
  'QNBFB', 'QNBTR', 'RAYSG', 'SEKFK', 'SKBNK', 'TSKB', 'TURSG', 'VAKBN', 'VAKFN', 'YKBNK'];
const BF_REIT_SYMBOLS = ['AKFGY', 'EKGYO', 'ZRGYO'];
const BF_HOLDING_SYMBOLS = ['AGHOL', 'ALARK', 'BRYAT', 'DOHOL', 'ECILC', 'GLYHO', 'IPEKE', 'KCHOL', 'SAHOL'];
const BF_FIN_IND_RE = /bank|insurance|capital market|asset management|credit service|mortgage|financial (conglomerate|credit)|brokerage/i;
const BF_REIT_IND_RE = /reit|real estate/i;
// Emtia tipi is: fiyati sirket degil PIYASA belirler. Buffett: "emtia satan bir
// iste en aptal rakibinden cok daha zeki olamazsin."
const BF_COMMODITY_RE = /steel|iron|aluminum|copper|gold|silver|coal|marine shipping|oil & gas|refin|agricultural inputs|fertilizer|paper|lumber|commodity chemical|building materials|cement/i;
// Buffett'in acikca uzak durdugu is kollari (yorum degil, mektuplarindan)
const BF_AVOID_RE = /airline|airport service|gold|silver|biotech|shell compan/i;

// 🔴 TMS 29 (IAS 29) ENFLASYON MUHASEBESI SINIRI.
// Turkiye'de 2023 yil sonundan itibaren uygulaniyor: parasal olmayan kalemler
// (ozsermaye, maddi duran varlik, stok) yeniden ifade ediliyor, parasal
// pozisyon kar/zarari gelir tablosuna giriyor.
// ⚠️ ASIL SONUC — hangi hesap bozulur, hangisi bozulmaz:
//   · YIL ICI oranlar (marj, ROE, ROA, capex/ciro, varlik devir hizi) GUVENLI:
//     pay ve payda ayni yilin satin alma gucundedir, oran sadelesir.
//   · YILLAR ARASI karsilastirmalar (trend, bilesik buyume, 1 Dolar Testi'nin
//     tuttugu kar toplami) GUVENILMEZ: 2022 ve oncesi baska bir para birimidir.
// Bu yuzden seviye/medyan hesaplari TUM yillari kullanir, karsilastirma
// hesaplari yalnizca SINIR SONRASI yillari kullanir (yeterliyse).
const BF_TR_RESTATE_YEAR = 2023;

function bfBaseSymbol(f) {
  const s = String((f && (f.ySymbol || f.symbol)) || '').toUpperCase();
  return s.replace(/\.[A-Z]+$/, '');
}

function bfKind(f) {
  const sym = bfBaseSymbol(f);
  const sec = String((f && f.sector) || '').trim().toUpperCase();
  const ind = String((f && f.industry) || '');
  // 1) Elle bakilan sembol listesi (BIST'te en guvenilir katman)
  if (BF_FIN_SYMBOLS.indexOf(sym) >= 0) return { kind: 'financial', src: 'sembol listesi' };
  if (BF_REIT_SYMBOLS.indexOf(sym) >= 0 || /GYO$/.test(sym)) return { kind: 'reit', src: 'sembol listesi' };
  if (BF_HOLDING_SYMBOLS.indexOf(sym) >= 0 || /HOL$/.test(sym)) return { kind: 'holding', src: 'sembol listesi' };
  // 2) Yahoo sektor / sanayi kolu
  if (sec === 'FINANCIAL SERVICES' || BF_FIN_IND_RE.test(ind)) return { kind: 'financial', src: 'Yahoo sektör' };
  if (sec === 'REAL ESTATE' || BF_REIT_IND_RE.test(ind)) return { kind: 'reit', src: 'Yahoo sektör' };
  // 3) Bilanco sekli — son care. Banka imzasi: cok kaldiracli + varlik devir
  // hizi cok dusuk + capex yok denecek kadar az. Ucu BIRDEN tutmali.
  const ys = (Array.isArray(f && f.years) ? f.years : []);
  const y0 = ys.filter(y => y && y.equity > 0 && y.totalAssets > 0)[0];
  if (y0) {
    const lev = y0.totalAssets / y0.equity;
    const turn = (y0.revenue != null && y0.revenue > 0) ? y0.revenue / y0.totalAssets : null;
    const ci = (y0.revenue != null && y0.revenue > 0 && y0.capex != null) ? Math.abs(y0.capex) / y0.revenue : null;
    if (lev > 6 && turn != null && turn < 0.25 && (ci == null || ci < 0.03)) {
      return { kind: 'financial', src: 'bilanço şekli (kaldıraç ' + bfR(lev, 1) + '×, devir hızı ' + bfR(turn, 2) + ')' };
    }
  }
  return { kind: 'operating', src: sec ? 'Yahoo sektör' : 'varsayılan' };
}

// ——— ortak kucuk yardimcilar ———
function bfAvg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function bfPct(v, d) { return (v == null || !isFinite(v)) ? '—' : ('%' + bfR(v * 100, d == null ? 1 : d)); }
function bfBig(v) {
  if (v == null || !isFinite(v)) return '—';
  const s = v < 0 ? '-' : '', a = Math.abs(v);
  if (a >= 1e9) return s + bfR(a / 1e9, 1) + ' mlr';
  if (a >= 1e6) return s + bfR(a / 1e6, 1) + ' mn';
  return s + bfR(a, 0);
}
// Bilesik yillik buyume — ikisi de POZITIF olmali, yoksa oran anlamsiz
function bfCagr(newest, oldest, years) {
  if (newest == null || oldest == null || !isFinite(newest) || !isFinite(oldest)) return null;
  if (newest <= 0 || oldest <= 0 || years <= 0) return null;
  return Math.pow(newest / oldest, 1 / years) - 1;
}

// ——— TMS 29 sinir katmani ———
// Yillar arasi KARSILASTIRMA yapacak her hesap bunu cagirir. Sinir sonrasinda
// en az 2 yil varsa yalnizca onlari dondurur; yoksa tum seriyi dondurur ama
// `warn` isaretiyle — o zaman hesap yapilir, hesabin guvenilmezligi yazilir.
function bfSafeSpan(ys, isTRY) {
  if (!isTRY) return { rows: ys, cross: false, warn: false };
  const after = ys.filter(y => y.year >= BF_TR_RESTATE_YEAR);
  const before = ys.filter(y => y.year < BF_TR_RESTATE_YEAR);
  const cross = after.length > 0 && before.length > 0;
  if (!cross) return { rows: ys, cross: false, warn: false };
  if (after.length >= 2) return { rows: after, cross: true, warn: false };
  return { rows: ys, cross: true, warn: true };
}
const BF_TMS29_NOTE = ' · ⚠️ TMS 29: karşılaştırma yalnızca 2023 ve sonrası yıllarla yapıldı (2022 ve öncesi farklı satın alma gücü)';
const BF_TMS29_WARN = ' · ⚠️ TMS 29 sınırını geçiyor, 2023 sonrası tek yıl var — bu karşılaştırma GÜVENİLMEZ';

// ——— Borc/ozsermaye ———
function bfDebtInfo(f, ys) {
  const b0 = ys.find(y => y.equity != null && y.equity > 0) || null;
  let de = null, netDe = null, deSrc = null;
  if (b0 && (b0.longTermDebt != null || b0.shortDebt != null)) {
    const debt = (b0.longTermDebt || 0) + (b0.shortDebt || 0);
    de = debt / b0.equity; deSrc = 'bilanço ' + b0.year;
    if (b0.cash != null) netDe = Math.max(0, debt - b0.cash) / b0.equity;
  } else if (b0 && f.totalDebt != null) {
    de = f.totalDebt / b0.equity; deSrc = 'toplam borç';
    if (f.totalCash != null) netDe = Math.max(0, f.totalDebt - f.totalCash) / b0.equity;
  } else if (f.debtToEquity != null && isFinite(f.debtToEquity)) {
    de = f.debtToEquity / 100; deSrc = 'Yahoo oran';
  }
  return { de, netDe, deSrc, use: netDe != null ? netDe : de };
}

// ——— Efektif vergi orani ———
// Yasal oran yerine sirketin GERCEKTEN odedigi oran. Tesvikli/serbest bolge
// sirketinde fark buyuk olur ve ROIC'i dogrudan etkiler. Veri yoksa yasal orana
// duser; sacma degerler (negatif vergi, %60 ustu) disarida birakilir.
function bfTaxRate(ys, isTRY) {
  const rates = [];
  for (const y of ys) {
    if (y.incomeBeforeTax == null || y.incomeTaxExpense == null) continue;
    if (!(y.incomeBeforeTax > 0)) continue;
    const t = Math.abs(y.incomeTaxExpense) / y.incomeBeforeTax;
    if (isFinite(t) && t >= 0 && t <= 0.60) rates.push(t);
  }
  const statutory = isTRY ? 0.25 : 0.21;
  if (!rates.length) return { rate: statutory, src: 'yasal oran (efektif veri yok)' };
  const m = bfMedian(rates);
  return { rate: m, src: `efektif oran, ${rates.length} yıl medyanı` };
}

// ——— Kar istikrari ———
function bfStabilityPart(ys) {
  const nis = ys.filter(y => y.netIncome != null).map(y => y.netIncome);
  if (nis.length < 3) return { score: null, note: 'En az 3 yıllık kâr serisi gerekli.' };
  const posN = nis.filter(v => v > 0).length;
  const pos = posN / nis.length;
  let up = 0;
  for (let i = nis.length - 1; i > 0; i--) if (nis[i - 1] > nis[i]) up++;
  const upR = up / (nis.length - 1);
  let sc = 0.5 * pos + 0.5 * upR;
  if (nis.some(v => v <= 0)) sc = Math.min(sc, 0.5);
  return { score: sc, note: `${posN}/${nis.length} yıl kârlı · ${up}/${nis.length - 1} yıl bir önceki yılı geçmiş` };
}

// ——— Sermaye artirimi / seyreltme ———
// 🧮 MUHASEBE OZDESLIGI: ozsermaye yalnizca ① tutulan kar ② dis sermaye ile
// buyur. Yahoo gecmis hisse adedi vermiyor — uydurmak yerine bilancodan turet.
function bfDilutionPart(ys, isTRY) {
  const eqY = ys.filter(y => y.equity != null && isFinite(y.equity));
  if (eqY.length < 2) return { score: null, note: 'Özsermaye serisi yetersiz — seyreltme ölçülemedi.' };
  const oldest = eqY[eqY.length - 1];
  const eqNew = eqY[0].equity, eqOld = oldest.equity;
  if (!(eqOld > 0)) return { score: null, note: 'En eski yıl özsermayesi pozitif değil — oran hesaplanamaz.' };
  const span = ys.filter(y => y.year > oldest.year && y.netIncome != null);
  if (!span.length) return { score: null, note: 'Karşılaştırılacak yıl aralığı yok.' };
  const retained = span.reduce((s, y) => s + y.netIncome - Math.abs(y.dividendsPaid || 0), 0);
  const issuance = (eqNew - eqOld) - retained;
  const ratio = issuance / eqOld;
  // TR esigi BILINCLI genis: TMS 29 ozsermayeyi sermaye artirimi olmadan da yukari yazar.
  const lo = isTRY ? 0.15 : 0.0, hi = isTRY ? 0.80 : 0.40;
  const sc = 1 - bfLin(ratio, lo, hi);
  let note = `Özsermaye ${bfBig(eqOld)} → ${bfBig(eqNew)} · aynı dönemde tutulan kâr ${bfBig(retained)} → dış kaynak ${bfPct(ratio)}`;
  let flag = null;
  if (ratio < -0.05) note += ' · fark NEGATİF: geri alım / sermaye iadesi işareti (Buffett bunu sever)';
  else if (ratio > hi) flag = `Sermaye artırımıyla büyümüş görünüyor (özsermayenin ${bfPct(ratio)} kadarı tutulan kârla açıklanmıyor) — mevcut ortağın payı seyrelir.`;
  if (isTRY) note += ' · ⚠️ TMS 29 özsermayeyi sermaye artırımı olmadan da yukarı yazar, TR eşiği geniş tutuldu';
  return { score: sc, note, flag };
}

// ——— SERMAYE DAGITIMI RASYONELLIGI (Buffett 1984 mektubu) ———
// 🔴 YONETIM KALITESININ OLCULEBILIR TEK PARCASI. Buffett'in kurali nettir:
// "Tutulan her 1 dolar, en az 1 dolar piyasa degeri yaratacaksa TUTULMALI;
// yaratmayacaksa DAGITILMALI." Yani karar, sirketin sermayeye kazandirdigi
// getirinin engel oranini asip asmadigina baglidir:
//   · getiri ENGELIN USTUNDE → kar tutulmali (dagitmak deger yakar)
//   · getiri ENGELIN ALTINDA → kar dagitilmali (tutmak deger yakar)
// Durustlugu, seffafligi ve "kurumsal zorlama"ya direnci OLCULEMEZ — bu kriter
// yonetim kalitesinin tamami degil, sayiya donen tek yuzudur.
function bfCapAllocPart(ys, ret, hur) {
  const rows = ys.filter(y => y.netIncome != null && y.netIncome > 0 && y.dividendsPaid != null);
  if (!rows.length || ret == null || !isFinite(ret)) {
    return { score: null, note: 'Temettü verisi ya da sermaye getirisi gelmedi — dağıtım kararı değerlendirilemedi.' };
  }
  const payouts = rows.map(y => bfClamp01(Math.abs(y.dividendsPaid) / y.netIncome));
  const payout = bfMedian(payouts);
  const above = ret >= hur;
  const sc = above ? bfClamp01(1 - payout * 0.6) : bfClamp01(0.3 + 0.7 * payout);
  const note = above
    ? `Sermaye getirisi ${bfPct(ret)} engelin (${bfPct(hur, 0)}) ÜSTÜNDE → kâr tutulmalı · dağıtım oranı ${bfPct(payout)} (${rows.length} yıl)`
    : `Sermaye getirisi ${bfPct(ret)} engelin (${bfPct(hur, 0)}) ALTINDA → kâr dağıtılmalı · dağıtım oranı ${bfPct(payout)} (${rows.length} yıl)`;
  const flag = (!above && payout < 0.3)
    ? `Sermaye dağıtımı sorunlu: şirket engel oranının altında getiri üretirken kârı dağıtmıyor, elde tutuyor. Buffett 1984: bu durumda tutulan her lira değer yakar.`
    : null;
  return { score: sc, note, flag };
}

// ============================================================
// A) OPERASYONEL SIRKET SETI — 13 kriter, toplam agirlik 18.0
// ============================================================
// Agirlik dagilimi Buffett sirasindadir: KALITE 11.5 (%64) · sermaye dagitimi
// 3.0 · guvenlik 1.5 · FIYAT 2.0.
function bfScoreOperating(ctx) {
  const f = ctx.f, ys = ctx.ys, hur = ctx.hur, isTRY = ctx.isTRY, kind = ctx.kind;
  const parts = [], flags = [], extra = {};
  const add = (key, label, weight, score, note) => parts.push({ key, label, weight, score, note });
  const dbg = bfDebtInfo(f, ys);
  const deUse = dbg.use;
  // Yillar arasi karsilastirmalarin kullanacagi guvenli pencere (TMS 29)
  const span = bfSafeSpan(ys, isTRY);
  const cmpRows = span.rows;
  const cmpNote = span.cross ? (span.warn ? BF_TMS29_WARN : BF_TMS29_NOTE) : '';
  if (span.cross) {
    flags.push('TMS 29 uyarısı: mali tablo serisi 2023 enflasyon muhasebesi sınırını geçiyor. 2022 ve öncesi farklı satın alma gücüyle yazıldı — yıl içi oranlar (marj, ROE) güvenli, ama TREND ve BİLEŞİK BÜYÜME hesapları bu yüzden' + (span.warn ? ' GÜVENİLMEZ (sınır sonrası tek yıl var).' : ' yalnızca 2023 sonrası yıllarla yapıldı.'));
  }

  // --- 1) ROE seviyesi + istikrari (1.5) ---
  const roes = ys.filter(y => y.netIncome != null && y.equity != null && y.equity > 0)
    .map(y => y.netIncome / y.equity);
  let roeMean = null;
  if (roes.length >= 2) {
    roeMean = bfAvg(roes);
    const above = roes.filter(v => v >= hur * 0.8).length;
    const anyNeg = roes.some(v => v < 0);
    let cons = above / roes.length;
    if (anyNeg) cons = Math.min(cons, 0.3);
    let sc = 0.6 * bfLin(roeMean / hur, 0.7, 1.6) + 0.4 * cons;
    let lev = '';
    if (deUse != null && deUse > (isTRY ? 1.0 : 1.5) && sc > 0) { sc *= 0.7; lev = ' · borçla şişirilmiş (iskonto uygulandı)'; }
    add('roe', 'Özsermaye kârlılığı (ROE)', 1.5, bfClamp01(sc),
      `Ort. ${bfPct(roeMean)} · ${above}/${roes.length} yıl engelin (${bfPct(hur, 0)}) üzerinde${anyNeg ? ' · zarar eden yıl var' : ''}${lev}`);
    if (anyNeg) flags.push('Dönem içinde özsermaye kârlılığı negatif olan yıl var.');
    extra.roe = bfR(roeMean, 4);
  } else add('roe', 'Özsermaye kârlılığı (ROE)', 1.5, null, 'Yıllık özsermaye/net kâr verisi yetersiz.');

  // --- 2) ROIC — kaldiractan ARINDIRILMIS gercek is getirisi (2.0) ---
  const tax = bfTaxRate(ys, isTRY);
  const roics = [];
  for (const y of ys) {
    if (y.operatingIncome == null || y.equity == null || y.equity <= 0) continue;
    const invested = y.equity + ((y.longTermDebt || 0) + (y.shortDebt || 0)) - (y.cash || 0);
    if (!(invested > 0)) continue;
    roics.push(y.operatingIncome * (1 - tax.rate) / invested);
  }
  let roicMean = null;
  if (roics.length >= 2) {
    roicMean = bfAvg(roics);
    const above = roics.filter(v => v >= hur).length;
    const sc = 0.65 * bfLin(roicMean / hur, 0.8, 1.8) + 0.35 * (above / roics.length);
    add('roic', 'Yatırılan sermaye getirisi (ROIC)', 2.0, bfClamp01(sc),
      `Ort. ${bfPct(roicMean)} · engel ${bfPct(hur, 0)} · ${above}/${roics.length} yıl engelin üstünde · vergi ${bfPct(tax.rate, 0)} (${tax.src}) · borç kaldıracından arındırılmış`);
    extra.roic = bfR(roicMean, 4);
    extra.taxRate = bfR(tax.rate, 3);
    if (roeMean != null && roicMean > 0 && roeMean > roicMean * 1.6) {
      flags.push('ROE, ROIC\'in belirgin üstünde — kârlılığın önemli kısmı borç kaldıracından geliyor, işin kendisinden değil.');
    }
  } else add('roic', 'Yatırılan sermaye getirisi (ROIC)', 2.0, null, 'Faaliyet kârı ya da yatırılan sermaye verisi yetersiz.');

  // --- 3) Fiyatlama gucu / brut marj (1.5) ---
  const gms = ys.filter(y => y.grossProfit != null && y.revenue != null && y.revenue > 0)
    .map(y => y.grossProfit / y.revenue);
  const gmsCmp = cmpRows.filter(y => y.grossProfit != null && y.revenue != null && y.revenue > 0)
    .map(y => y.grossProfit / y.revenue);
  let gmMed = null, gmCommodity = false;
  if (gms.length >= 2) {
    const med = bfMedian(gms); gmMed = med;
    const spread = Math.max.apply(null, gms) - Math.min.apply(null, gms);
    // Trend YILLAR ARASI bir karsilastirmadir → guvenli pencere kullanilir
    const trend = gmsCmp.length >= 2 ? (gmsCmp[0] - gmsCmp[gmsCmp.length - 1]) : 0;
    // 🔴 ISTIKRAR TOPLAMA DEGIL CARPANDIR — surekli dusuk marj moat'in
    // YOKLUGUNUN kanitidir, "istikrarli" diye puan alamaz.
    const stab = 1 - bfClamp01(spread / 0.25);
    let sc = bfLin(med, 0.15, 0.45) * (0.7 + 0.3 * stab) + 0.12 * (bfLin(trend, -0.05, 0.05) - 0.5);
    let cmt = '';
    if (med < 0.20 && spread > 0.08) {
      gmCommodity = true;
      sc = Math.min(sc, 0.35);
      cmt = ' · EMTİA BENZERİ: marj hem düşük hem dalgalı';
      flags.push('Fiyatlama gücü zayıf: brüt marj hem düşük hem dalgalı — emtia tipi iş. Buffett: "emtia satan bir işte en aptal rakibinden çok daha zeki olamazsın."');
    }
    add('moat', 'Fiyatlama gücü (brüt marj)', 1.5, bfClamp01(sc),
      `Medyan ${bfPct(med)} · dalgalanma ${bfR(spread * 100, 1)} puan · trend ${trend >= 0 ? '+' : ''}${bfR(trend * 100, 1)} puan${cmt}${gmsCmp.length >= 2 ? cmpNote : ''}`);
    extra.grossMargin = bfR(med, 4);
  } else add('moat', 'Fiyatlama gücü (brüt marj)', 1.5, null, 'Brüt kâr verisi gelmedi (Yahoo BIST\'te sık atlar).');

  // --- 4) Net kar marji (1.0) ---
  const mgs = ys.filter(y => y.netIncome != null && y.revenue != null && y.revenue > 0)
    .map(y => y.netIncome / y.revenue);
  const mgsCmp = cmpRows.filter(y => y.netIncome != null && y.revenue != null && y.revenue > 0)
    .map(y => y.netIncome / y.revenue);
  let mgMed = null;
  if (mgs.length >= 2) {
    const med = bfMedian(mgs); mgMed = med;
    const spread = Math.max.apply(null, mgs) - Math.min.apply(null, mgs);
    const trend = mgsCmp.length >= 2 ? (mgsCmp[0] - mgsCmp[mgsCmp.length - 1]) : 0;
    const stab = 1 - bfClamp01(spread / 0.20);
    const sc = bfClamp01(bfLin(med, 0.02, 0.20) * (0.7 + 0.3 * stab) + 0.12 * (bfLin(trend, -0.05, 0.05) - 0.5));
    add('margin', 'Net kâr marjı', 1.0, sc,
      `Medyan ${bfPct(med)} · dalgalanma ${bfR(spread * 100, 1)} puan · trend ${trend >= 0 ? '+' : ''}${bfR(trend * 100, 1)} puan`);
  } else add('margin', 'Net kâr marjı', 1.0, null, 'Yıllık ciro/net kâr verisi yetersiz.');

  // --- 5) CEMBER / IS TIPI (1.0) — circle of competence ---
  // ⚠️ ETIKET TEK BASINA KARAR VERMEZ. Sektor bir ONYARGI verir, ceza yalnizca
  // RAKAMLAR da onayladiginda agirlasir (dusuk + dalgali brut marj). Kanit,
  // etiketin onundedir — aksi halde tek bir Yahoo etiketi skoru belirlerdi.
  const ind = String(f.industry || '');
  const sec = String(f.sector || '');
  if (!ind && !sec && kind === 'operating') {
    add('circle', 'Çember / iş tipi', 1.0, null, 'Sektör bilgisi gelmedi — iş tipi değerlendirilemedi.');
  } else {
    let sc = 1, why = [];
    if (BF_AVOID_RE.test(ind)) { sc -= 0.5; why.push('Buffett\'in açıkça uzak durduğu iş kolu'); }
    if (BF_COMMODITY_RE.test(ind)) {
      sc -= 0.25; why.push('emtia tipi sektör');
      if (gmCommodity) { sc -= 0.25; why.push('rakamlar da onaylıyor: brüt marj düşük ve dalgalı'); }
    } else if (gmCommodity) { sc -= 0.2; why.push('sektör etiketi emtia demese de marj yapısı emtia gibi'); }
    if (kind === 'holding') { sc -= 0.25; why.push('holding: konsolide tablo azınlık paylarını karıştırır, iş tek bir şey değil'); }
    if (kind === 'reit') { sc -= 0.15; why.push('GYO: kâr yeniden değerlemeden ağır etkilenir'); }
    add('circle', 'Çember / iş tipi', 1.0, bfClamp01(sc),
      (why.length ? why.join(' · ') : 'Anlaşılır, tek bir işi olan şirket görünümü') + (ind ? ` · ${ind}` : ''));
    if (BF_AVOID_RE.test(ind)) flags.push(`Buffett bu iş kolundan (${ind}) açıkça uzak durdu — çemberin dışı sayılır.`);
    if (BF_COMMODITY_RE.test(ind)) flags.push(`Sektör emtia tipi (${ind}) — satış fiyatını şirket değil piyasa belirler, fiyatlama gücü yapısal olarak sınırlıdır.`);
  }

  // --- 6) Borcsuzluk (1.5) ---
  if (deUse != null && isFinite(deUse)) {
    const dLo = isTRY ? 0.30 : 0.50, dHi = isTRY ? 1.00 : 2.00;
    add('debt', 'Borç / Özsermaye', 1.5, 1 - bfLin(deUse, dLo, dHi),
      `${dbg.netDe != null ? 'Net borç' : 'Borç'}/özsermaye ${bfR(deUse, 2)}× (${dbg.deSrc}) · ${isTRY ? 'TR eşiği 0,30–1,00 — yüksek faizde borç öldürücü' : 'eşik 0,50–2,00'}`);
    if (deUse > (isTRY ? 1.0 : 2.0)) flags.push('Borç/özsermaye eşiğin üstünde — yüksek faiz ortamında kırılgan.');
    extra.debtToEquity = bfR(deUse, 2);
  } else add('debt', 'Borç / Özsermaye', 1.5, null, 'Borç verisi gelmedi.');

  // --- 7) ENFLASYON DAYANIKLILIGI (2.0) — Buffett 1977 ---
  // "How Inflation Swindles the Equity Investor": yuksek enflasyonda ayakta
  // kalan sirket, buyumek icin AGIR sermaye harcamayan sirkettir.
  // 🧮 capex/ciro ve ciro/varlik birer ORANDIR → enflasyon sadelesir.
  // ⚠️ Ucuncu bilesende FARK DEGIL ORAN kullanilir: nominal bilesik buyume
  // (1+g_reel)(1+π) oldugu icin iki CAGR'in FARKI (1+π) ile olceklenir,
  // sadelesmez. Buyume CARPANLARININ ORANI ise tam sadelesir. Teste bagli.
  if (kind === 'reit') {
    add('inflation', 'Enflasyon dayanıklılığı', 2.0, null,
      'GYO yapısında sermaye harcaması gayrimenkul alımının kendisidir — bu kriter yapısal olarak anlamsız, bilinçli atlandı.');
  } else {
    const sub = [];
    const ciArr = ys.filter(y => y.capex != null && y.revenue != null && y.revenue > 0).map(y => Math.abs(y.capex) / y.revenue);
    const atArr = ys.filter(y => y.totalAssets != null && y.totalAssets > 0 && y.revenue != null && y.revenue > 0).map(y => y.revenue / y.totalAssets);
    let ciMed = null, atMed = null, gap = null;
    if (ciArr.length) { ciMed = bfMedian(ciArr); sub.push({ w: 0.4, v: 1 - bfLin(ciMed, 0.03, 0.15) }); }
    if (atArr.length) { atMed = bfMedian(atArr); sub.push({ w: 0.3, v: bfLin(atMed, 0.4, 1.5) }); }
    // Buyume karsilastirmasi → TMS 29 guvenli penceresi
    const niY = cmpRows.filter(y => y.netIncome != null), asY = cmpRows.filter(y => y.totalAssets != null && y.totalAssets > 0);
    if (niY.length >= 2 && asY.length >= 2) {
      const nSpan = Math.max(1, niY[0].year - niY[niY.length - 1].year);
      const niC = bfCagr(niY[0].netIncome, niY[niY.length - 1].netIncome, nSpan);
      const asC = bfCagr(asY[0].totalAssets, asY[asY.length - 1].totalAssets, Math.max(1, asY[0].year - asY[asY.length - 1].year));
      if (niC != null && asC != null) { gap = (1 + niC) / (1 + asC) - 1; sub.push({ w: 0.3, v: bfLin(gap, -0.06, 0.06) }); }
    }
    if (sub.length) {
      const wt = sub.reduce((a, s) => a + s.w, 0);
      let sc = sub.reduce((a, s) => a + s.v * s.w, 0) / wt;
      // 🔴 SERMAYE HAFIF OLMAK, PARA KAZANMAYAN BIR IS ICIN AVANTAJ DEGILDIR.
      let capNote = '';
      if (mgMed != null && mgMed <= 0) { sc = Math.min(sc, 0.4); capNote = ' · ⚠️ ortalamada zarar edildiği için tavan uygulandı'; }
      const bits = [];
      if (ciMed != null) bits.push(`Sermaye harcaması cironun ${bfPct(ciMed)}'i`);
      if (atMed != null) bits.push(`varlık devir hızı ${bfR(atMed, 2)}×`);
      if (gap != null) bits.push(`kâr, varlıklardan yılda ${bfR(gap * 100, 1)} puan ${gap >= 0 ? 'HIZLI' : 'YAVAŞ'} büyüyor (büyüme çarpanlarının oranı)${cmpNote}`);
      add('inflation', 'Enflasyon dayanıklılığı', 2.0, bfClamp01(sc), bits.join(' · ') + ' · orana dayalı, enflasyondan bağımsız' + capNote);
      extra.capexIntensity = bfR(ciMed, 4);
      if (ciMed != null && ciMed > 0.15) {
        flags.push(`Sermaye yoğun iş: cironun ${bfPct(ciMed)}'i yatırıma gidiyor. Buffett 1977: yüksek enflasyonda bu tip şirket kârını hissedara değil, yenileme yatırımına öder.`);
      }
    } else add('inflation', 'Enflasyon dayanıklılığı', 2.0, null, 'Capex / varlık / ciro serisi gelmedi.');
  }

  // --- 8) Owner Earnings kalitesi (1.5) ---
  // OE ≈ isletme nakit akisi − bakim capex'i (bakim ≈ min(capex, amortisman))
  // ⚠️ Greenwald'in "buyume capex'ini ciro artisindan tahmin et" yontemi
  // BILEREK KULLANILMADI: %35 enflasyonda ciro artisi nominaldir, buyume capex'i
  // sistematik olarak yuksek cikar, bakim capex'i dusuk cikar ve sahip kari
  // OLDUGUNDAN IYI gorunur. min(capex, amortisman) daha muhafazakardir.
  const oeY = ys.filter(y => y.opCashFlow != null && y.capex != null && y.dna != null && y.netIncome != null)
    .map(y => ({ year: y.year, oe: y.opCashFlow - Math.min(Math.abs(y.capex), Math.abs(y.dna)), ni: y.netIncome }));
  let oeQ = null;
  if (oeY.length >= 1) {
    const qs = oeY.filter(o => o.ni > 0).map(o => o.oe / o.ni);
    if (qs.length) {
      oeQ = bfAvg(qs);
      add('owner', 'Owner Earnings kalitesi', 1.5, bfLin(oeQ, 0.4, 1.0),
        `Sahip kârı / muhasebe kârı ort. ${bfR(oeQ, 2)}× · ${oeQ < 0.7 ? 'kâr büyük ölçüde kâğıt üzerinde' : 'kâr nakde dönüşüyor'}`);
      if (oeQ < 0.5) flags.push('Muhasebe kârı nakde dönüşmüyor (owner earnings net kârın çok altında).');
      extra.oeQuality = bfR(oeQ, 2);
    } else add('owner', 'Owner Earnings kalitesi', 1.5, null, 'Kârlı yıl yok — oran hesaplanamadı.');
  } else add('owner', 'Owner Earnings kalitesi', 1.5, null, 'Nakit akış tablosu (işletme akışı / capex / amortisman) gelmedi.');

  // --- 9) 1 Dolar Testi (1.5) ---
  // ⚠️ Tutulan karlarin TOPLAMI yillar arasi bir birikimdir → TMS 29 sinirini
  // gecerse farkli satin alma guclerini toplamis oluruz. Guvenli pencere.
  let dollar = null;
  const shares = (f.sharesOutstanding != null && f.sharesOutstanding > 0) ? f.sharesOutstanding : null;
  const ph = f.priceHistory;
  const niD = cmpRows.filter(y => y.netIncome != null);
  if (shares && ph && Array.isArray(ph.t) && Array.isArray(ph.c) && ph.t.length >= 2 && niD.length >= 2) {
    const oldestYear = niD[niD.length - 1].year;
    const t0 = Date.UTC(oldestYear, 0, 1) / 1000;
    let i0 = -1;
    for (let i = 0; i < ph.t.length; i++) { if (ph.t[i] >= t0) { i0 = i; break; } }
    const divKnown = niD.some(y => y.dividendsPaid != null);
    const retained = niD.reduce((s, y) => s + y.netIncome - Math.abs(y.dividendsPaid || 0), 0);
    const retPerShare = retained / shares;
    if (i0 >= 0 && i0 < ph.c.length - 1 && retPerShare > 0) {
      const p0 = ph.c[i0], p1 = ph.c[ph.c.length - 1];
      const gain = p1 - p0, ratio = gain / retPerShare;
      dollar = { years: niD.length, from: oldestYear, p0: bfR(p0, 2), p1: bfR(p1, 2),
        retainedPerShare: bfR(retPerShare, 2), gainPerShare: bfR(gain, 2), ratio: bfR(ratio, 2), divKnown };
      add('dollar', '1 Dolar Testi', 1.5, bfLin(ratio, 0, 2.0),
        `Tutulan her 1 birim kâr ${bfR(ratio, 2)} birim piyasa değeri yarattı (${oldestYear}'den beri) · tutulan ${bfR(retPerShare, 2)} vs fiyat artışı ${bfR(gain, 2)}${divKnown ? '' : ' · temettü verisi yok, tutulan kâr yüksek tahmin edilmiş olabilir'}${span.cross ? cmpNote : ''}`);
      if (ratio < 1) flags.push('1 Dolar Testi başarısız: tutulan kâr piyasa değerine dönüşmemiş — sermaye dağıtımı zayıf.');
    } else if (retPerShare <= 0) {
      add('dollar', '1 Dolar Testi', 1.5, null, 'Dönemde net birikmiş kâr yok (zarar ya da tümü temettü) — test uygulanamaz.');
    } else add('dollar', '1 Dolar Testi', 1.5, null, 'Fiyat geçmişi mali tablo dönemini kapsamıyor.');
  } else add('dollar', '1 Dolar Testi', 1.5, null, 'Hisse adedi veya fiyat geçmişi gelmedi.');

  // --- 10) Kar istikrari (1.0) ---
  const st = bfStabilityPart(ys);
  add('stability', 'Kâr istikrarı', 1.0, st.score, st.note);

  // --- 11) Sermaye dagitimi rasyonelligi (1.0) — Buffett 1984 ---
  const ca = bfCapAllocPart(ys, roicMean != null ? roicMean : roeMean, hur);
  add('capalloc', 'Sermaye dağıtımı rasyonelliği', 1.0, ca.score, ca.note);
  if (ca.flag) flags.push(ca.flag);

  // --- 12) Sermaye artirimi / seyreltme (0.5) ---
  const dil = bfDilutionPart(ys, isTRY);
  add('dilution', 'Sermaye artırımı / seyreltme', 0.5, dil.score, dil.note);
  if (dil.flag) flags.push(dil.flag);

  // --- 13) GUVENLIK PAYI (2.0) — Buffett'in value tenet'i ---
  // Icsel deger = normalize owner earnings ÷ engel orani. SIFIR BUYUME.
  // ⚠️ NEDEN BUYUME TERIMI YOK: %35 iskonto oraninda kucuk bir g degisikligi
  // sonucu savurur (g=0 → g=0.10 icsel degeri %40 buyutur). Buyume varsaymak
  // hassasiyet TIYATROSUDUR. Buffett'in kendi cercevesi zaten muhafazakardir:
  // isi, kuponu sahip kari olan bir tahvil gibi fiyatla.
  // 🧮 Normalize OE = (cok yilli MEDYAN OE marji) × SON yilin cirosu — marj bir
  // orandir, enflasyon sadelesir; sonuc bugunun parasiyla cikar.
  const oeM = ys.filter(y => y.opCashFlow != null && y.capex != null && y.dna != null && y.revenue != null && y.revenue > 0)
    .map(y => (y.opCashFlow - Math.min(Math.abs(y.capex), Math.abs(y.dna))) / y.revenue);
  const revNewRow = ys.find(y => y.revenue != null && y.revenue > 0);
  if (oeM.length >= 2 && revNewRow && f.marketCap != null && f.marketCap > 0) {
    const m = bfMedian(oeM);
    const oeNorm = m * revNewRow.revenue;
    if (oeNorm > 0) {
      const iv = oeNorm / hur;
      const mos = 1 - (f.marketCap / iv);
      add('mos', 'Güvenlik payı (içsel değer iskontosu)', 2.0, bfLin(mos, -0.25, 0.50),
        `İçsel değer ≈ ${bfBig(iv)} · piyasa değeri ${bfBig(f.marketCap)} → güvenlik payı ${bfPct(mos)} · normalize sahip kârı ${bfBig(oeNorm)} (marj medyanı ${bfPct(m)}) · SIFIR büyüme, iskonto = engel oranı ${bfPct(hur, 0)}`);
      extra.intrinsic = Math.round(iv);
      extra.mos = bfR(mos, 3);
      if (mos < 0) flags.push('Güvenlik payı YOK: piyasa değeri, sıfır büyüme varsayımıyla hesaplanan içsel değerin üstünde.');
      else if (mos >= 0.33) flags.push(`Güvenlik payı belirgin: içsel değere göre ${bfPct(mos)} iskontolu işlem görüyor (sıfır büyüme varsayımıyla).`);
    } else {
      add('mos', 'Güvenlik payı (içsel değer iskontosu)', 2.0, null,
        'Çok yıllı ortalama sahip kârı negatif — içsel değer hesaplanmaz. Ortalamada nakit yakan şirket "ucuz" değildir.');
    }
  } else add('mos', 'Güvenlik payı (içsel değer iskontosu)', 2.0, null, 'Nakit akış serisi ya da piyasa değeri yetersiz — içsel değer uydurulmadı.');

  if (kind === 'holding') flags.push('Holding yapısı: konsolide tablo bağlı ortaklıkları ve azınlık paylarını karıştırır — ROE, marj ve owner earnings olduğundan farklı görünebilir. Buffett holdinge parça parça bakar.');
  if (kind === 'reit') flags.push('GYO yapısı: kâr amortisman ve yeniden değerlemeden ağır etkilenir; net kâr yerine nakit akışına bakılmalıdır.');
  return { parts, flags, extra, dollar };
}

// ============================================================
// B) BANKA / FINANS SETI — 9 kriter, toplam agirlik 13.5
// ============================================================
// Kaynak: Buffett'in 1990 Wells Fargo mektubu + AmEx/BofA gerekcesi.
// Bankada olculen sey FARKLIDIR:
//   · verimlilik ROE degil ROA'dir (ROE kaldiracla istenildigi kadar sisirilir)
//   · risk borc/ozsermaye degil VARLIK/OZSERMAYE kaldiracidir (mevduat "borc"
//     degil hammaddedir; tehlike varliklarin bozulmasidir)
//   · deger olcusu iskontolu nakit akisi degil PD/DD'dir
// Bu sette borc/ozsermaye, owner earnings, capex ve 1 Dolar Testi KASITLI YOK.
function bfScoreFinancial(ctx) {
  const f = ctx.f, ys = ctx.ys, hur = ctx.hur, isTRY = ctx.isTRY;
  const parts = [], flags = [], extra = {};
  const add = (key, label, weight, score, note) => parts.push({ key, label, weight, score, note });
  const span = bfSafeSpan(ys, isTRY);
  const cmpRows = span.rows;
  const cmpNote = span.cross ? (span.warn ? BF_TMS29_WARN : BF_TMS29_NOTE) : '';
  if (span.cross) {
    flags.push('TMS 29 uyarısı: seri 2023 enflasyon muhasebesi sınırını geçiyor. Bankada özsermaye ve kâr yeniden ifadeden ağır etkilenir — yıl içi oranlar (ROA, ROE) güvenli, defter değeri BÜYÜMESİ' + (span.warn ? ' GÜVENİLMEZ.' : ' yalnızca 2023 sonrasıyla hesaplandı.'));
  }

  // --- 1) ROA — bankada ASIL verimlilik olcusu (2.0) ---
  const roas = ys.filter(y => y.netIncome != null && y.totalAssets != null && y.totalAssets > 0)
    .map(y => y.netIncome / y.totalAssets);
  const roaLo = isTRY ? 0.010 : 0.006, roaHi = isTRY ? 0.035 : 0.018;
  if (roas.length >= 2) {
    const med = bfMedian(roas);
    const above = roas.filter(v => v >= roaLo).length;
    add('roa', 'Varlık kârlılığı (ROA)', 2.0, bfClamp01(0.7 * bfLin(med, roaLo, roaHi) + 0.3 * (above / roas.length)),
      `Medyan ${bfPct(med, 2)} · ${above}/${roas.length} yıl eşiğin (${bfPct(roaLo, 2)}) üstünde · Buffett 1990 Wells Fargo: %1,25 ROA "mükemmel" sayılır${isTRY ? ' · TR eşiği nominal enflasyona göre yukarı çekildi' : ''}`);
    extra.roa = bfR(med, 5);
  } else add('roa', 'Varlık kârlılığı (ROA)', 2.0, null, 'Net kâr / toplam varlık serisi yetersiz.');

  // --- 2) ROE (2.0) — bankada kaldirac ISKONTOSU YOK, kaldirac yapisaldir ---
  const roes = ys.filter(y => y.netIncome != null && y.equity != null && y.equity > 0)
    .map(y => y.netIncome / y.equity);
  let roeMean = null;
  if (roes.length >= 2) {
    roeMean = bfAvg(roes);
    const above = roes.filter(v => v >= hur * 0.8).length;
    const anyNeg = roes.some(v => v < 0);
    let cons = above / roes.length;
    if (anyNeg) cons = Math.min(cons, 0.3);
    add('roe', 'Özsermaye kârlılığı (ROE)', 2.0, bfClamp01(0.6 * bfLin(roeMean / hur, 0.7, 1.6) + 0.4 * cons),
      `Ort. ${bfPct(roeMean)} · ${above}/${roes.length} yıl engelin (${bfPct(hur, 0)}) üzerinde · bankada kaldıraç yapısaldır, iskonto uygulanmadı`);
    if (anyNeg) flags.push('Dönem içinde zarar eden yıl var.');
    extra.roe = bfR(roeMean, 4);
  } else add('roe', 'Özsermaye kârlılığı (ROE)', 2.0, null, 'Yıllık özsermaye/net kâr verisi yetersiz.');

  // --- 3) Kaldirac: varlik / ozsermaye (2.0) ---
  // Buffett 1990: "20:1 varlik/ozsermaye oraninda varliklarin sadece %5'i
  // bozulursa ozsermaye TAMAMEN silinir." Bankada asil risk budur.
  const levs = ys.filter(y => y.totalAssets != null && y.equity != null && y.equity > 0)
    .map(y => y.totalAssets / y.equity);
  if (levs.length >= 1) {
    const med = bfMedian(levs);
    add('leverage', 'Kaldıraç (varlık / özsermaye)', 2.0, 1 - bfLin(med, 6, 14),
      `${bfR(med, 1)}× · Buffett 1990: 20× kaldıraçta varlıkların %5'i bozulursa özsermaye tamamen silinir · düşük kaldıraç = düşük ROE ama dayanıklı banka`);
    extra.leverage = bfR(med, 2);
    if (med > 12) flags.push(`Kaldıraç yüksek (${bfR(med, 1)}×): varlıkların yalnızca %${bfR(100 / med, 1)}'i bozulsa özsermaye silinir.`);
  } else add('leverage', 'Kaldıraç (varlık / özsermaye)', 2.0, null, 'Toplam varlık / özsermaye verisi gelmedi.');

  // --- 4) Defter degeri buyumesi (1.5) — TMS 29 guvenli penceresi ---
  const eqY = cmpRows.filter(y => y.equity != null && y.equity > 0);
  if (eqY.length >= 2) {
    const nSpan = Math.max(1, eqY[0].year - eqY[eqY.length - 1].year);
    const g = bfCagr(eqY[0].equity, eqY[eqY.length - 1].equity, nSpan);
    if (g != null) {
      add('bvg', 'Defter değeri büyümesi', 1.5, bfLin(g / hur, 0.5, 1.3),
        `Yıllık bileşik ${bfPct(g)} (${nSpan} yıl) · engel oranı ${bfPct(hur, 0)}${cmpNote}`);
      extra.bvCagr = bfR(g, 4);
    } else add('bvg', 'Defter değeri büyümesi', 1.5, null, 'Özsermaye serisi pozitif değil — bileşik büyüme hesaplanamaz.');
  } else add('bvg', 'Defter değeri büyümesi', 1.5, null, 'Karşılaştırma için en az 2 yıllık özsermaye verisi gerekli (TMS 29 sınırı sonrası).');

  // --- 5) Faaliyet verimliligi (1.0) ---
  const effs = ys.filter(y => y.operatingIncome != null && y.revenue != null && y.revenue > 0)
    .map(y => y.operatingIncome / y.revenue);
  if (effs.length >= 2) {
    const med = bfMedian(effs);
    add('efficiency', 'Faaliyet verimliliği', 1.0, bfLin(med, 0.20, 0.55),
      `Faaliyet kârı / gelir medyanı ${bfPct(med)} · Buffett Wells Fargo\'da maliyet disiplinini açıkça övmüştü`);
  } else add('efficiency', 'Faaliyet verimliliği', 1.0, null, 'Faaliyet kârı / gelir serisi gelmedi.');

  // --- 6) Kar istikrari (1.5) ---
  const st = bfStabilityPart(ys);
  add('stability', 'Kâr istikrarı', 1.5, st.score, st.note);

  // --- 7) Sermaye dagitimi rasyonelligi (1.0) — Buffett 1984 ---
  const ca = bfCapAllocPart(ys, roeMean, hur);
  add('capalloc', 'Sermaye dağıtımı rasyonelliği', 1.0, ca.score, ca.note);
  if (ca.flag) flags.push(ca.flag);

  // --- 8) Seyreltme (0.5) ---
  const dil = bfDilutionPart(ys, isTRY);
  add('dilution', 'Sermaye artırımı / seyreltme', 0.5, dil.score, dil.note);
  if (dil.flag) flags.push(dil.flag);

  // --- 9) GUVENLIK PAYI: PD/DD vs HAK EDILEN PD/DD (2.0) ---
  // 🧮 Bir banka ozsermayesi uzerinden ROE kazaniyorsa ve bu getiri r oraniyla
  // iskonto ediliyorsa, defterinin HAK ETTIGI kat = ROE ÷ r'dir (sifir buyume,
  // sonsuz vade). Bankada iskontolu nakit akisi anlamsizdir.
  const pb = (f.priceToBook != null && isFinite(f.priceToBook) && f.priceToBook > 0) ? f.priceToBook : null;
  if (pb != null && roeMean != null && roeMean > 0) {
    const just = roeMean / hur;
    const mos = 1 - (pb / just);
    add('mos', 'Güvenlik payı (PD/DD vs hak edilen)', 2.0, bfLin(mos, -0.25, 0.50),
      `Hak edilen PD/DD ≈ ${bfR(just, 2)}× (ROE ${bfPct(roeMean)} ÷ engel ${bfPct(hur, 0)}) · gerçek PD/DD ${bfR(pb, 2)}× → güvenlik payı ${bfPct(mos)}`);
    extra.justifiedPB = bfR(just, 2);
    extra.priceToBook = bfR(pb, 2);
    extra.mos = bfR(mos, 3);
    if (mos < 0) flags.push('Güvenlik payı YOK: PD/DD, mevcut kârlılığın hak ettiği katın üstünde.');
  } else add('mos', 'Güvenlik payı (PD/DD vs hak edilen)', 2.0, null, 'PD/DD ya da ROE gelmedi — hak edilen kat hesaplanamadı.');

  flags.push('⚠️ Bu modelin en büyük kör noktası: takipteki kredi oranı, karşılık yeterliliği ve sermaye yeterlilik rasyosu (SYR) Yahoo verisinde YOK. Bir banka bu üçü bozulurken kâğıt üstünde hâlâ kârlı görünür.');
  flags.push('Borç/özsermaye, Owner Earnings, capex ve 1 Dolar Testi bankada anlamlı olmadığı için bu skora KASITLI olarak girmedi.');
  return { parts, flags, extra, dollar: null };
}

// ============================================================
// Ortak kapanis — kapsama, toplam, etiket
// ============================================================
function bfFinalize(r, base, ctx) {
  const parts = r.parts, flags = r.flags;
  const totW = parts.reduce((s, p) => s + p.weight, 0);
  const have = parts.filter(p => p.score != null);
  const haveW = have.reduce((s, p) => s + p.weight, 0);
  const coverage = totW ? haveW / totW : 0;
  const out = Object.assign({
    parts, flags, coverage: bfR(coverage, 2), dollar: r.dollar || null,
  }, base, r.extra || {});
  if (coverage < 0.5) {
    out.score = null;
    out.label = 'yetersiz veri';
    out.reason = 'Kriterlerin yarısından fazlası için veri yok — skor üretmek uydurma olurdu.';
    return out;
  }
  const raw = have.reduce((s, p) => s + p.score * p.weight, 0) / haveW;
  out.score = Math.round(bfClamp01(raw) * 100);
  const ladder = ['filtreden geçmiyor', 'zayıf', 'karışık', 'iyi', 'güçlü kalite'];
  let idx = out.score >= 75 ? 4 : out.score >= 60 ? 3 : out.score >= 45 ? 2 : out.score >= 30 ? 1 : 0;
  // 🔴 YIL SAYISI TAVANI — Buffett 10 YILLIK istikrar ister; Yahoo genelde 4
  // veriyor. Skor kendi icinde durust (eksik kriter zaten atlaniyor) ama
  // ETIKET asiri iddia etmemeli: 3 yillik pencereden "guclu kalite" denmez.
  // ⚠️ TAVAN 4 YILDA BASLAMAZ, 4 YIL YAHOO'NUN PRATIK USTU SINIRIDIR. Herkesi
  // veri kaynaginin sinirindan cezalandirmak bilgi eklemez, sadece tum olcegi
  // asagi kaydirir ve en ust etiketi olu koda cevirir. Tavan yalnizca gercekten
  // KISA pencerede (2-3 yil) uygulanir; 10 yil ideali her durumda not dusulur.
  const n = base.years;
  let cap = null;
  if (n < 3) cap = 2;        // en fazla "karisik"
  else if (n < 4) cap = 3;   // en fazla "iyi"
  if (cap != null && idx > cap) {
    idx = cap;
    flags.push(`Etiket sınırlandı: yalnızca ${n} yıllık tablo var. Buffett 10 yıllık tutarlı geçmiş ister — bu skor çok kısa bir pencereden bakıyor.`);
    out.labelCapped = true;
  } else if (n < 6) {
    flags.push(`Veri derinliği sınırı: ${n} yıllık tablo var, Buffett 10 yıllık tutarlı geçmiş ister. İstikrar kriterleri bu pencereden ölçüldü — Yahoo daha fazlasını vermiyor.`);
  }
  out.label = ladder[idx];
  return out;
}

// f = /stock-fundamentals cevabi · hurdlePct = nominal engel orani (%)
function buffettScore(f, hurdlePct) {
  if (!f || typeof f !== 'object') return null;
  const hur = (isFinite(hurdlePct) && hurdlePct > 0) ? hurdlePct / 100 : 0.10;
  const cur = String(f.currency || 'TRY').toUpperCase();
  const isTRY = cur === 'TRY';
  const ys = (Array.isArray(f.years) ? f.years : []).filter(y => y && isFinite(y.year))
    .sort((a, b) => b.year - a.year); // yeniden eskiye
  const k = bfKind(f);
  const base = {
    hurdlePct: Math.round(hur * 1000) / 10, years: ys.length, currency: cur,
    kind: k.kind, kindLabel: BF_KIND_LABEL[k.kind] || k.kind, kindSrc: k.src,
    sector: f.sector || null, industry: f.industry || null,
  };
  if (ys.length < 2) {
    return Object.assign({ score: null, label: 'yetersiz veri', parts: [], flags: [], coverage: 0,
      reason: 'Yahoo bu sembol için yıllık mali tablo döndürmedi (BIST hisselerinde sık).' }, base);
  }
  const ctx = { f, ys, hur, cur, isTRY, kind: k.kind };
  const r = k.kind === 'financial' ? bfScoreFinancial(ctx) : bfScoreOperating(ctx);
  if (isTRY) r.flags.push('BIST notu: 2023 sonrası enflasyon muhasebesi (TMS 29) net kârı ve özsermayeyi çarpıtır — yıl içi oranlara, Owner Earnings ve ROIC satırlarına daha çok güven.');
  return bfFinalize(r, base, ctx);
}

function buildStockAnalysisFacts(ta, j) {
  return {
    currency: j.currency || '',
    current: ta.current,
    min: j.min,
    max: j.max,
    changePct: j.changePct ?? 0,
    trend: ta.trend,
    sma20: ta.sma20,
    sma50: ta.sma50,
    priceVsSma20: ta.priceVsSma20,
    rsi: ta.rsi,
    rsiZone: ta.rsiZone,
    adx: ta.adx,
    adxZone: ta.adxZone,
    macdLine: ta.macd?.line ?? null,
    macdSignal: ta.macd?.signal ?? null,
    macdHist: ta.macd?.histogram ?? null,
    bbLower: ta.bb?.lower ?? null,
    bbMid: ta.bb?.mid ?? null,
    bbUpper: ta.bb?.upper ?? null,
    bbPosition: ta.bbPosition,
    support: ta.sr?.support ?? null,
    resistance: ta.sr?.resistance ?? null,
    atrPct: ta.atrPct,
    volRatio: ta.volRatio,
    obvTrend: ta.obv?.trend ?? null,
    pivotPP: ta.pivots?.pp ?? null,
    pivotR1: ta.pivots?.r1 ?? null,
    pivotS1: ta.pivots?.s1 ?? null,
    pivotR2: ta.pivots?.r2 ?? null,
    pivotS2: ta.pivots?.s2 ?? null,
    pivotZone: ta.pivotZone,
    recentChange7d: ta.recentChange7d,
    signals: ta.signals || [],
    // Analiz v2 — PWA hesaplar, AI uydurmaz
    confluence: ta.confluence ? {
      score: ta.confluence.score, label: ta.confluence.label,
      bull: ta.confluence.bull, bear: ta.confluence.bear, neutral: ta.confluence.neutral,
      total: ta.confluence.total, reliability: ta.confluence.reliability,
    } : null,
    scenarios: ta.scenarios ? {
      atrPct: ta.scenarios.atrPct,
      up: ta.scenarios.up, down: ta.scenarios.down,
      band: ta.scenarios.band, vol5: ta.scenarios.vol5,
    } : null,
    mtf: (_stockMtf && _stockMtf.cmp) ? {
      state: _stockMtf.cmp.state,
      dailyScore: _stockMtf.cmp.daily.score, dailyLabel: _stockMtf.cmp.daily.label,
      weeklyScore: _stockMtf.cmp.weekly.score, weeklyLabel: _stockMtf.cmp.weekly.label,
    } : null,
    // Buffett katmanı — temel analiz; PWA hesaplar, AI yeniden hesaplamaz
    buffett: _stockBuffett ? {
      score: _stockBuffett.score,
      label: _stockBuffett.label,
      hurdlePct: _stockBuffett.hurdlePct,
      coverage: _stockBuffett.coverage,
      years: _stockBuffett.years,
      currency: _stockBuffett.currency,
      reason: _stockBuffett.reason || null,
      // Kurum tipi — AI'a HANGI kriter setinin uygulandığını söyler; banka
      // setinde borç/owner-earnings/1-dolar satırları KASITLI yoktur.
      kind: _stockBuffett.kind || null,
      kindLabel: _stockBuffett.kindLabel || null,
      kindSrc: _stockBuffett.kindSrc || null,
      sector: _stockBuffett.sector || null,
      industry: _stockBuffett.industry || null,
      oeQuality: _stockBuffett.oeQuality ?? null,
      debtToEquity: _stockBuffett.debtToEquity ?? null,
      roic: _stockBuffett.roic ?? null,
      grossMargin: _stockBuffett.grossMargin ?? null,
      capexIntensity: _stockBuffett.capexIntensity ?? null,
      taxRate: _stockBuffett.taxRate ?? null,
      labelCapped: _stockBuffett.labelCapped || false,
      roa: _stockBuffett.roa ?? null,
      leverage: _stockBuffett.leverage ?? null,
      bvCagr: _stockBuffett.bvCagr ?? null,
      justifiedPB: _stockBuffett.justifiedPB ?? null,
      mos: _stockBuffett.mos ?? null,
      intrinsic: _stockBuffett.intrinsic ?? null,
      dollar: _stockBuffett.dollar || null,
      flags: _stockBuffett.flags || [],
      parts: (_stockBuffett.parts || []).map(p => ({
        label: p.label,
        pts: p.score == null ? null : Math.round(p.score * p.weight * 10) / 10,
        max: p.weight,
        note: p.note || '',
      })),
    } : null,
  };
}

async function aiStockAnalysis(mode) {
  const isFund = mode === 'fund';
  if (!_stockChartPayload) return;
  const btn = document.getElementById(isFund ? 'stockFundAiBtn' : 'stockTaAiBtn');
  const resEl = document.getElementById(isFund ? 'stockFundAiResult' : 'stockTaAiResult');
  btn.disabled = true;
  resEl.style.display = 'block';
  resEl.textContent = isFund ? 'AI temel yorum hazırlanıyor…' : 'AI teknik yorum hazırlanıyor…';
  try {
    const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
    if (!token) throw new Error('giriş yapılmamış');
    // Temel yorumda Buffett skoru şart — panel açılmadan basıldıysa sessizce çek
    if (isFund && !_stockFundData) { await loadStockFundamentals(); }
    const facts = buildStockAnalysisFacts(_stockChartPayload.ta, _stockChartPayload.j);
    // Haber katmanı (teknik + hikaye): açık sekmeden varsa onu kullan, yoksa sessizce çek
    let newsHeadlines = [];
    try {
      if (_stockNewsLoaded && _stockNewsItems.length) {
        newsHeadlines = _stockNewsItems.slice(0, 10).map(n => ({ title: n.title, time: n.time || null }));
      } else {
        const w = (data.watchlist || [])[_stockChartIdx];
        if (w) {
          const ySymbol = w.ySymbol || legacyYSymbol(w);
          const nr = await fetch(STOCK_NEWS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ ySymbol, symbol: w.symbol }),
          });
          if (nr.ok) { const nj = await nr.json(); if (Array.isArray(nj.news)) newsHeadlines = nj.news.slice(0, 10).map(n => ({ title: n.title, time: n.time || null })); }
        }
      }
    } catch {}
    const r = await fetch(STOCK_ANALYSIS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        symbol: _stockChartPayload.symbol,
        range: _stockChartPayload.range,
        mode: isFund ? 'fund' : 'ta',
        facts,
        newsHeadlines,
        instructions: aiInstructions(),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `http ${r.status}`);
    resEl.textContent = j.analysis || 'Yorum üretilemedi.';
  } catch (e) {
    resEl.textContent = '' + e.message;
  }
  btn.disabled = false;
}

// ============================================================
// Portföy teknik özet — pozisyonlu hisselerin TA snapshot'u + AI taktik
// ============================================================
let _pfTechItems = [];   // [{symbol, range, facts}] — AI'a yollanacak hazır liste

function closePfTechModal() {
  document.getElementById('pfTechModal').classList.remove('active');
  _pfTechItems = [];
}

async function openPfTechModal() {
  const positions = (data.watchlist || []).filter(w =>
    w.qty != null && w.qty > 0 && w.cost != null && TA_MARKETS.has(w.market || 'bist')
  );
  const listEl = document.getElementById('pfTechList');
  const statusEl = document.getElementById('pfTechStatus');
  const aiBtn = document.getElementById('pfTechAiBtn');
  const aiRes = document.getElementById('pfTechAiResult');
  _pfTechItems = [];
  aiBtn.disabled = true;
  aiRes.style.display = 'none';
  aiRes.textContent = '';
  listEl.innerHTML = '';
  if (positions.length === 0) {
    statusEl.textContent = 'Teknik analiz için pozisyon (adet + maliyet girilmiş BIST/ABD hissesi) gerekli.';
    document.getElementById('pfTechModal').classList.add('active');
    return;
  }
  statusEl.textContent = `${positions.length} hisse için 3 aylık veri çekiliyor…`;
  document.getElementById('pfTechModal').classList.add('active');

  const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
  if (!token) {
    statusEl.textContent = 'Önce Supabase girişi gerekli.';
    return;
  }

  const range = '3mo';
  // Paralel TA çekimi — her hisse için /stock-history + computeStockTA
  const results = await Promise.all(positions.map(async w => {
    const ySymbol = w.ySymbol || legacyYSymbol(w);
    try {
      const r = await fetch(STOCK_HISTORY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ySymbol, range }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        return { w, error: e.error || `http ${r.status}` };
      }
      const j = await r.json();
      if (!j.closes || j.closes.length < 5) return { w, error: 'yetersiz veri' };
      const ta = computeStockTA(j);
      const facts = buildStockAnalysisFacts(ta, j);
      return { w, j, ta, facts };
    } catch (e) {
      return { w, error: e.message };
    }
  }));

  // Render satırlar + items
  listEl.innerHTML = results.map(rs => {
    const w = rs.w;
    if (rs.error) {
      return `<div class="pf-tech-row err">
        <div class="pf-tech-sym">${escapeHtml(w.symbol)} <span class="px">—</span></div>
        <div class="pf-tech-badges"><span class="pf-tech-badge">${escapeHtml(rs.error)}</span></div>
      </div>`;
    }
    const ta = rs.ta;
    const dir = ta.trend === 'yukarı' ? 'up' : ta.trend === 'aşağı' ? 'down' : 'flat';
    const badges = [];
    if (ta.rsi != null) {
      const cls = ta.rsi >= 70 ? 'warn' : ta.rsi <= 30 ? 'down' : '';
      badges.push(`<span class="pf-tech-badge ${cls}">RSI ${ta.rsi.toFixed(1)}</span>`);
    }
    if (ta.sma20 != null && ta.current != null) {
      const above = ta.current >= ta.sma20;
      badges.push(`<span class="pf-tech-badge ${above ? 'up' : 'down'}">SMA20 ${above ? '↑' : '↓'}</span>`);
    }
    if (ta.sma20 != null && ta.sma50 != null) {
      const cross = ta.sma20 > ta.sma50;
      badges.push(`<span class="pf-tech-badge ${cross ? 'up' : 'down'}">SMA20${cross ? '>' : '<'}SMA50</span>`);
    }
    if (ta.macd) {
      badges.push(`<span class="pf-tech-badge ${ta.macd.histogram >= 0 ? 'up' : 'down'}">MACD ${ta.macd.histogram >= 0 ? '+' : ''}${ta.macd.histogram}</span>`);
    }
    if (ta.adx != null) {
      const cls = ta.adx >= 25 ? 'up' : (ta.adx >= 20 ? 'warn' : '');
      badges.push(`<span class="pf-tech-badge ${cls}">ADX ${ta.adx.toFixed(0)}</span>`);
    }
    if (ta.bbPosition && ta.bbPosition !== '—') {
      const bbCls = ta.bbPosition.includes('üst') ? 'warn' : ta.bbPosition.includes('alt') ? 'down' : '';
      badges.push(`<span class="pf-tech-badge ${bbCls}">BB: ${escapeHtml(ta.bbPosition)}</span>`);
    }
    badges.push(`<span class="pf-tech-badge">trend ${escapeHtml(ta.trend)}</span>`);
    if (ta.confluence) {
      const cCls = ta.confluence.dir === 'up' ? 'up' : ta.confluence.dir === 'down' ? 'down' : 'warn';
      badges.push(`<span class="pf-tech-badge ${cCls}">uyum ${ta.confluence.score}</span>`);
    }
    _pfTechItems.push({ symbol: w.symbol, range, facts: rs.facts });
    return `<div class="pf-tech-row ${dir}">
      <div class="pf-tech-sym">${escapeHtml(w.symbol)} <span class="px">${formatStockPrice(ta.current)} ${escapeHtml(rs.j.currency || w.currency || '')}</span></div>
      <div class="pf-tech-badges">${badges.join('')}</div>
    </div>`;
  }).join('');

  if (_pfTechItems.length === 0) {
    statusEl.textContent = 'Hiçbir hisse için veri çekilemedi.';
  } else {
    statusEl.textContent = `${_pfTechItems.length} hisse için teknik özet hazır. AI taktik yorumu için butona bas`;
    aiBtn.disabled = false;
  }
}

async function aiPortfolioTechnical() {
  if (!_pfTechItems.length) return;
  const btn = document.getElementById('pfTechAiBtn');
  const resEl = document.getElementById('pfTechAiResult');
  btn.disabled = true;
  resEl.style.display = 'block';
  resEl.textContent = 'Aidan portföyünün teknik durumuna bakıyor…';
  try {
    const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
    if (!token) throw new Error('giriş yapılmamış');
    const r = await fetch(PF_TECHNICAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ items: _pfTechItems, instructions: aiInstructions() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `http ${r.status}`);
    resEl.textContent = j.summary || 'Özet üretilemedi.';
  } catch (e) {
    resEl.textContent = '' + e.message;
  }
  btn.disabled = false;
}

// Grafik + SMA20/SMA50 overlay + opsiyonel Fibonacci seviyeleri
function lineChartTA(values, ta, fib) {
  if (!values || values.length < 2) return '';
  const w = 420, h = 140, padX = 8, padY = 10;
  const allVals = [...values];
  if (ta.sma20Series) ta.sma20Series.forEach(v => { if (v != null) allVals.push(v); });
  if (ta.sma50Series) ta.sma50Series.forEach(v => { if (v != null) allVals.push(v); });
  if (fib) fib.levels.forEach(l => allVals.push(l.price));
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const range = (max - min) || 1;
  const toY = v => padY + (1 - (v - min) / range) * (h - 2 * padY);
  const toXY = (v, i) => [padX + (i / (values.length - 1)) * (w - 2 * padX), toY(v)];
  const pts = values.map((v, i) => toXY(v, i));
  const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${pts[pts.length-1][0].toFixed(1)},${(h-padY).toFixed(1)} L${pts[0][0].toFixed(1)},${(h-padY).toFixed(1)} Z`;
  const up = values[values.length - 1] >= values[0];
  const color = up ? '#34c759' : '#ef4444';
  const fillId = 'lc-fill-' + (up ? 'u' : 'd');
  const seriesPath = (series, stroke, dash) => {
    if (!series) return '';
    let d = '';
    for (let i = 0; i < series.length; i++) {
      if (series[i] == null) continue;
      const [x, y] = toXY(series[i], i);
      d += (d ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    if (!d) return '';
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"${dashAttr}/>`;
  };
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${fillId}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${fillId})" stroke="none"/>
    ${fibOverlay(fib, padX, w, toY)}
    ${seriesPath(ta.sma50Series, '#5aa2ff', '4,3')}
    ${seriesPath(ta.sma20Series, '#ffc640', '')}
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// Candlestick (mum) grafiği + SMA overlay + opsiyonel Fib — Yahoo OHLC verisinden
function candleChartTA(j, ta, fib) {
  const opens = j.opens || [], highs = j.highs || [], lows = j.lows || [], closes = j.closes || [];
  if (closes.length < 2 || opens.length !== closes.length) return lineChartTA(closes, ta, fib);
  const w = 420, h = 140, padX = 8, padY = 10;
  const n = closes.length;
  const allVals = [];
  for (let i = 0; i < n; i++) {
    if (highs[i] != null) allVals.push(highs[i]);
    if (lows[i] != null) allVals.push(lows[i]);
  }
  if (ta.sma20Series) ta.sma20Series.forEach(v => { if (v != null) allVals.push(v); });
  if (ta.sma50Series) ta.sma50Series.forEach(v => { if (v != null) allVals.push(v); });
  if (fib) fib.levels.forEach(l => allVals.push(l.price));
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const range = (max - min) || 1;
  const toY = v => padY + (1 - (v - min) / range) * (h - 2 * padY);
  const innerW = w - 2 * padX;
  // Bar genişliği: dar — wick + body sığsın
  const slot = innerW / n;
  const bw = Math.max(1.2, Math.min(slot * 0.7, 9));
  const xOf = i => padX + slot * (i + 0.5);
  let candles = '';
  for (let i = 0; i < n; i++) {
    const o = opens[i], c = closes[i], hi = highs[i], lo = lows[i];
    if (o == null || c == null || hi == null || lo == null) continue;
    const x = xOf(i);
    const up = c >= o;
    const col = up ? '#34c759' : '#ef4444';
    const yH = toY(hi), yL = toY(lo);
    const yT = toY(Math.max(o, c)), yB = toY(Math.min(o, c));
    const bodyH = Math.max(1, yB - yT);
    candles += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${yH.toFixed(1)}" y2="${yL.toFixed(1)}" stroke="${col}" stroke-width="1"/>`;
    candles += `<rect x="${(x - bw / 2).toFixed(1)}" y="${yT.toFixed(1)}" width="${bw.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${col}" opacity="${up ? 0.9 : 1}"/>`;
  }
  const seriesPath = (series, stroke, dash) => {
    if (!series) return '';
    let d = '';
    for (let i = 0; i < series.length; i++) {
      if (series[i] == null) continue;
      const x = xOf(i), y = toY(series[i]);
      d += (d ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    if (!d) return '';
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"${dashAttr}/>`;
  };
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    ${fibOverlay(fib, padX, w, toY)}
    ${candles}
    ${seriesPath(ta.sma50Series, '#5aa2ff', '4,3')}
    ${seriesPath(ta.sma20Series, '#ffc640', '')}
  </svg>`;
}

// Fibonacci yatay seviye çizgileri + sağ köşede % etiketi — line/candle ikisinde de kullanılır
function fibOverlay(fib, padX, w, toY) {
  if (!fib) return '';
  const palette = ['#9ca3af', '#ffc640', '#34c759', '#5aa2ff', '#2dd4bf', '#ec4899', '#9ca3af'];
  return fib.levels.map((lv, i) => {
    const y = toY(lv.price);
    const col = palette[i] || '#9ca3af';
    return `<line x1="${padX}" x2="${w - padX}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${col}" stroke-width="0.6" stroke-dasharray="2,3" opacity="0.65"/>
      <text x="${w - padX - 2}" y="${(y - 1.5).toFixed(1)}" text-anchor="end" fill="${col}" font-size="7" font-family="ui-monospace,Menlo,monospace" opacity="0.85">${lv.label}</text>`;
  }).join('');
}



// ====== Görselden portföy (AI vision) ======
const PORTFOLIO_IMAGE_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/portfolio-image';
let _pfImportHoldings = []; // AI'nın bulduğu + kullanıcının düzenlediği geçici liste


async function handlePortfolioPhoto(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = ''; // aynı dosya(lar) tekrar seçilebilsin
  if (!files.length) return;

  if (!window._supa || !window._user) {
    showToast('Önce Ayarlar → bulut girişi yap', 'warning', 4000);
    return;
  }
  // Modalı aç, "okunuyor" göster
  openPortfolioImport();
  setPfImportStatus('Görsel hazırlanıyor…');

  try {
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum yok');

    // Her görseli sırayla oku, sonuçları birleştir (birden fazla ekran görüntüsü seçilebilir)
    const all = [];
    let firstEmpty = null;
    for (let idx = 0; idx < files.length; idx++) {
      setPfImportStatus(files.length > 1
        ? `Aidan görselleri okuyor… (${idx + 1}/${files.length}) — 10-15 sn/görsel, sabret`
        : 'Aidan görseli okuyor… 10-15 sn sürebilir, sabret');
      const dataUrl = await resizeImageToDataUrl(files[idx]);
      const r = await fetch(PORTFOLIO_IMAGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ image: dataUrl }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || ('hata ' + r.status));
      const holdings = Array.isArray(j.holdings) ? j.holdings : [];
      if (!holdings.length && !firstEmpty) firstEmpty = j; // ilk boş görselin debug'ı
      all.push(...holdings);
    }

    // Aynı hisse birden çok görselde çıkarsa tek satırda birleştir (eksik alanları doldur)
    const merged = mergePortfolioHoldings(all);
    if (!merged.length) {
      let dbg = '';
      if (firstEmpty && firstEmpty.aiError) dbg = `\n\n(AI hatası: ${firstEmpty.aiError})`;
      else if (firstEmpty && firstEmpty.raw) dbg = `\n\n(AI cevabı: ${String(firstEmpty.raw).slice(0, 200)})`;
      setPfImportStatus('Görsel(ler)de hisse bulamadım Daha net bir portföy ekranı dene, ya da manuel ekle.' + dbg, true);
      return;
    }
    _pfImportHoldings = merged;
    renderPfImportList();
  } catch (e) {
    setPfImportStatus('Okuma başarısız: ' + e.message, true);
  }
}

// Çoklu görsel: aynı sembol birden çok kez gelirse tek satırda birleştir.
// İlk görülen tutulur; sonrakiler yalnız EKSİK alanları (qty/cost/price/market) doldurur.
function mergePortfolioHoldings(list) {
  const bySym = new Map();
  for (const h of list) {
    const sym = (h.symbol || '').trim().toUpperCase();
    if (!sym) continue;
    if (!bySym.has(sym)) { bySym.set(sym, { ...h, symbol: sym }); continue; }
    const cur = bySym.get(sym);
    if (cur.qty == null && h.qty != null) cur.qty = h.qty;
    if (cur.cost == null && h.cost != null) cur.cost = h.cost;
    if (cur.price == null && h.price != null) cur.price = h.price;
    if (!cur.market && h.market) cur.market = h.market;
  }
  return Array.from(bySym.values());
}

function setPfImportStatus(msg, isError) {
  const el = document.getElementById('portfolioImportStatus');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
}

let _pfImportSync = false; // "portfoyu fotografla degistir" modu (satilanlari kaldir)

function openPortfolioImport() {
  _pfImportHoldings = [];
  _pfImportSync = false;
  document.getElementById('portfolioImportList').innerHTML = '';
  document.getElementById('portfolioImportActions').style.display = 'none';
  const syncRow = document.getElementById('pfImportSyncRow');
  if (syncRow) syncRow.style.display = 'none';
  const syncChk = document.getElementById('pfImportSync');
  if (syncChk) syncChk.checked = false;
  document.getElementById('portfolioImportModal').classList.add('active');
}

function togglePfImportSync(on) {
  _pfImportSync = !!on;
  const btn = document.getElementById('pfImportConfirmBtn');
  if (btn) btn.textContent = _pfImportSync ? '\ud83d\udd04 Portfoyu yenile' : '\u2705 Portfoye ekle';
}

function closePortfolioImport() {
  document.getElementById('portfolioImportModal').classList.remove('active');
  _pfImportHoldings = [];
}

// AI sonuçlarını düzenlenebilir satırlar olarak göster (vision hata yapabilir → kullanıcı düzeltsin)
function renderPfImportList() {
  setPfImportStatus(`${_pfImportHoldings.length} varlık buldum. Kontrol et, düzelt, ekle`);
  const list = document.getElementById('portfolioImportList');
  const marketOpts = [['bist','🇹🇷'],['abd','🇺🇸'],['fx','$'],['crypto','₿']];
  list.innerHTML = _pfImportHoldings.map((h, i) => `
    <div class="pf-import-row">
      <div class="pf-imp-top">
        <input class="pf-imp-sym" value="${escapeHtml(h.symbol || '')}" oninput="updatePfImport(${i},'symbol',this.value)" autocapitalize="characters" placeholder="KOD">
        <select class="pf-imp-mkt" onchange="updatePfImport(${i},'market',this.value)">
          ${marketOpts.map(([v,e]) => `<option value="${v}" ${h.market===v?'selected':''}>${e}</option>`).join('')}
        </select>
        <button class="pf-imp-del" onclick="removePfImport(${i})" title="Çıkar">✕</button>
      </div>
      <div class="pf-imp-bot">
        <label>Adet<input class="pf-imp-qty" type="number" inputmode="decimal" placeholder="—" value="${h.qty != null ? h.qty : ''}" oninput="updatePfImport(${i},'qty',this.value)"></label>
        <label>Alım fiyatı<input class="pf-imp-cost" type="number" inputmode="decimal" placeholder="—" value="${h.cost != null ? h.cost : ''}" oninput="updatePfImport(${i},'cost',this.value)"></label>
        <label>Son fiyat<input class="pf-imp-price" type="number" inputmode="decimal" placeholder="—" value="${h.price != null ? h.price : ''}" oninput="updatePfImport(${i},'price',this.value)"></label>
      </div>
    </div>
  `).join('');
  document.getElementById('portfolioImportActions').style.display = 'flex';
  const syncRow = document.getElementById('pfImportSyncRow');
  if (syncRow) syncRow.style.display = 'flex';
}

function updatePfImport(i, field, val) {
  if (!_pfImportHoldings[i]) return;
  if (field === 'symbol') _pfImportHoldings[i].symbol = val.toUpperCase().replace(/[^A-Z0-9.=-]/g, '');
  else if (field === 'market') _pfImportHoldings[i].market = val;
  else { // qty / cost / price
    const n = parseFloat(String(val).replace(',', '.'));
    _pfImportHoldings[i][field] = isFinite(n) && n > 0 ? n : null;
  }
}

function removePfImport(i) {
  _pfImportHoldings.splice(i, 1);
  if (!_pfImportHoldings.length) { setPfImportStatus('Liste boş. İptal et ya da yeni görsel dene.', true); document.getElementById('portfolioImportActions').style.display='none'; document.getElementById('portfolioImportList').innerHTML=''; return; }
  renderPfImportList();
}

// Onaylanan varlıkları watchlist'e ekle/güncelle
function confirmPortfolioImport() {
  data.watchlist = data.watchlist || [];
  let added = 0, updated = 0;
  for (const h of _pfImportHoldings) {
    const sym = (h.symbol || '').trim().toUpperCase();
    if (!sym) continue;
    const market = h.market || 'bist';
    const existing = data.watchlist.find(w => w.symbol === sym);
    if (existing) {
      if (h.qty != null) existing.qty = h.qty;
      if (h.cost != null) existing.cost = h.cost;
      // market/ySymbol eksikse tamamla (eski kayıt olabilir)
      if (!existing.ySymbol) { existing.ySymbol = toYahooSymbol(sym, market); existing.market = market; }
      updated++;
    } else {
      data.watchlist.unshift({
        symbol: sym, ySymbol: toYahooSymbol(sym, market), market,
        name: sym,
        // AI son fiyatı okuduysa geçici göster (Yahoo yenileyene kadar kâr/zarar hemen çıksın)
        price: h.price != null ? h.price : null, prevClose: null, changePct: null, currency: 'TRY',
        alarmAbove: null, alarmBelow: null, alarmPctDown: null, lastAlertedAbove: false, lastAlertedBelow: false, lastAlertedPct: false,
        qty: h.qty != null ? h.qty : null, cost: h.cost != null ? h.cost : null,
        fetchedAt: null, error: null,
      });
      added++;
    }
  }
  // "Yenile" modu: fotografta olmayan pozisyonlar satilmis sayilir -> pozisyonu kaldir (karti izleme olarak birak)
  let removed = 0;
  if (_pfImportSync) {
    const importedSyms = new Set(_pfImportHoldings.map(h => (h.symbol || '').trim().toUpperCase()).filter(Boolean));
    for (const w of data.watchlist) {
      const isHolding = w.qty != null && w.qty > 0 && w.cost != null;
      if (isHolding && !importedSyms.has(w.symbol)) {
        w.qty = null; w.cost = null; // pozisyon kalkti, hisse izleme listesinde kalir
        removed++;
      }
    }
  }
  save();
  renderStocks();
  refreshStocks(); // fiyatları hemen çek
  closePortfolioImport();
  const msg = _pfImportSync
    ? `Portfoy yenilendi · ${added} eklendi, ${updated} güncellendi${removed ? `, ${removed} satildi (kaldirildi)` : ''}`
    : `${added} eklendi${updated ? `, ${updated} güncellendi` : ''}`;
  showToast(msg, 'success', 3800);
}

// ============================================================
// 🔎 BIST TEMEL TARAMA — "alınacak hisse bulma" filtresi (Ağu 2026)
// ============================================================
// ⚠️ NE OLDUĞU / NE OLMADIĞI: bu bir MEKANİK ELEME. Çıkan liste bir alım
// listesi DEĞİLDİR, sıralama bir tercih sırası DEĞİLDİR. Kod hiçbir yerde
// "al/sat" demez; UI'da ve AI prompt'unda bu sınır ayrıca yazılıdır.
//
// 🔴 İKİ KADEME (mimarinin özü):
//   Kademe 1 — TÜM evren tek Yahoo isteğinde taranır (/stock-screen). Sadece
//     toplu quote'ta gelen oranlar: F/K, PD/DD, temettü, piyasa değeri, hacim.
//   Kademe 2 — hayatta kalan ilk N hisseye MEVCUT buffettScore() çalıştırılır
//     (/stock-fundamentals, sembol başına 1 istek). Yeni skor motoru YAZILMADI.
//
// NEDEN böyle: mali tablo isteği sembol başınadır; 100 hisse için 100 istek eder
// ve Cloudflare ücretsiz planın 50 subrequest sınırını aşar. Ucuz kademe geniş
// eler, pahalı kademe dar doğrular.
//
// 🚫 AI ÇAĞRISI YOK — eleme ve skor tamamen kural tabanlı ve deterministik.
// AI yalnız kullanıcı düğmeye basarsa ve yalnız ÇIKAN TABLOYU ANLATMAK için
// çağrılır; sıralamaya karışmaz. (program.js'teki kalıbın aynısı.)
const STOCK_SCREEN_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/stock-screen';

// Tarama evreni — BIST'in likit ana gövdesi (BIST 100 ağırlıklı).
// ⚠️ ELLE BAKILAN LİSTE: endeks 3 ayda bir değişir. Endeksten çıkmış bir sembol
// zarar vermez (Yahoo veri döndürmezse taramadan sessizce düşer), ama yeni giren
// bir hisse buraya eklenmedikçe taranmaz. Kullanıcının kendi BIST izleme
// listesindeki semboller her taramada bu listeye OTOMATİK eklenir.
const BIST_UNIVERSE = [
  'AEFES', 'AGHOL', 'AGROT', 'AKBNK', 'AKCNS', 'AKFGY', 'AKSA', 'AKSEN', 'ALARK', 'ALBRK',
  'ALFAS', 'ANSGR', 'ARCLK', 'ARDYZ', 'ASELS', 'ASTOR', 'BERA', 'BFREN', 'BIMAS', 'BINHO',
  'BRSAN', 'BRYAT', 'BTCIM', 'CANTE', 'CCOLA', 'CIMSA', 'CWENE', 'DAPGM', 'DOAS', 'DOHOL',
  'EBEBK', 'ECILC', 'EGEEN', 'EKGYO', 'ENERY', 'ENJSA', 'ENKAI', 'EREGL', 'EUPWR', 'FROTO',
  'GARAN', 'GENIL', 'GESAN', 'GUBRF', 'GWIND', 'HALKB', 'HEKTS', 'IPEKE', 'ISCTR', 'ISMEN',
  'IZMDC', 'KARSN', 'KAYSE', 'KCAER', 'KCHOL', 'KLSER', 'KMPUR', 'KONTR', 'KONYA', 'KOZAA',
  'KOZAL', 'KRDMD', 'MAVI', 'MGROS', 'MIATK', 'MPARK', 'ODAS', 'OTKAR', 'OYAKC', 'PENTA',
  'PETKM', 'PGSUS', 'QUAGR', 'REEDR', 'SAHOL', 'SASA', 'SDTTR', 'SISE', 'SKBNK', 'SMRTG',
  'SOKM', 'TABGD', 'TAVHL', 'TCELL', 'THYAO', 'TKFEN', 'TMSN', 'TOASO', 'TSKB', 'TTKOM',
  'TTRAK', 'TUKAS', 'TUPRS', 'TURSG', 'ULKER', 'VAKBN', 'VESBE', 'VESTL', 'YEOTK', 'YKBNK',
  'YYLGD', 'ZOREN', 'ZRGYO',
];

// Hijyen eşikleri — bunlar SKOR değil, KAPIDIR. Altında kalan hisse hiç puanlanmaz.
const SCREEN_LIMITS = {
  minMarketCap: 2e9,    // 2 milyar TL — mikro şirkette tek haber fiyatı savurur
  minTurnover: 20e6,    // günlük ort. 20 mn TL işlem — likit olmayanda çıkış yoktur
  maxPE: 40,            // bunun üstünde kazanç getirisi engel oranı yanında anlamsız
  // ⚠️ PD/DD artik UCUZLUK olcusu degil, ANOMALI kapisi. PD/DD = F/K × ROE
  // oldugu icin yuksek PD/DD tek basina kotu degildir (kaliteli is yuksek
  // PD/DD'de islem gorur). Ama ozsermaye anormal kuculdugunde (agresif geri
  // alim, birikmis zarar) ROE yapay olarak sisar ve hisse kalite kapisindan
  // haksiz yere gecer — bu tavan onu keser.
  maxPB: 12,
  deepCount: 25,        // 2. kademede kaç hisseye gerçek Buffett skoru çalışsın
  listCount: 15,        // ekranda kaç satır gösterilsin
  maxSymbols: 120,      // worker tavanıyla aynı
  // 🏦 Bankalar ROE kapısını ATLAR (aşağıdaki gerekçe) — ama yüksek ROE'li
  // sanayi şirketleri tarafından derin aşamadan tamamen dışlanmasınlar diye
  // kendi kotaları var.
  finQuota: 6,
  // 🛟 KIYI PAYI: yalnızca tek yıllık ROE kapısından KIL PAYI dönen hisseler.
  // Kapı tek yıla bakar; geçici olarak bastırılmış bir yıl gerçekten iyi bir
  // şirketi eleyebilir. Bunlar mali tabloya sorulur, kararı çok yıllı veri verir.
  edgeQuota: 8,
  edgeBand: 0.70,       // engel oranının %70'i ve üstü "kıyı" sayılır
};

const SCREEN_DROP_LABELS = {
  nodata: 'veri gelmedi',
  loss: 'zarar ediyor / kâr verisi yok',
  nobook: 'defter değeri yok',
  lowroe: 'özsermaye kârlılığı engel oranının altında',
  small: 'piyasa değeri eşiğin altında',
  illiquid: 'işlem hacmi düşük',
  expensive: 'F/K tavanın üstünde',
  rich: 'PD/DD anormal — özsermaye çok küçük, ROE şişmiş olabilir',
};

// ——— Kademe 1'de banka tespiti ———
// ⚠️ Toplu quote SEKTÖR DÖNDÜRMEZ; kademe 1'de elimizdeki tek ipucu semboldür.
// buffettScore'un kullandığı listenin aynısı kullanılır (tek kaynak).
function screenIsFinancial(r) {
  const s = String((r && r.symbol) || '').toUpperCase().replace(/\.IS$/, '');
  return BF_FIN_SYMBOLS.indexOf(s) >= 0;
}

// ——— Türetilmiş ROE ———
// PD/DD ÷ F/K = (Fiyat/Defter) × (Kazanç/Fiyat) = Kazanç/Defter = ROE.
// Cebirsel bir ÖZDEŞLİK, tahmin değil. Ama TEK YILLIKTIR — Buffett çok yıllı
// istikrar ister; o yüzden bu sadece ön eleme kriteri, kademe 2'nin yerini tutmaz.
function screenRoe(r) {
  if (!r) return null;
  const pe = r.trailingPE, pb = r.priceToBook;
  if (pe == null || pb == null || !isFinite(pe) || !isFinite(pb) || pe <= 0 || pb <= 0) return null;
  return pb / pe;
}

// Günlük ortalama işlem hacmi (TL) — likidite kapısı
function screenTurnover(r) {
  if (!r || r.price == null || r.avgVolume == null) return null;
  if (!isFinite(r.price) || !isFinite(r.avgVolume) || r.price <= 0 || r.avgVolume <= 0) return null;
  return r.price * r.avgVolume;
}

// Kapı kontrolü — {ok:true} ya da {ok:false, why:'kod'}
// 🔴 KALITE KAPISI (hurdlePct) Buffett donusumunun kalbi: sermayesini engel
// oraninin uzerinde calistiramayan sirket ne kadar ucuz olursa olsun ELENIR.
// Eskiden bu bir skor kriteriydi ve ucuz-ama-vasat sirketler listeyi dolduruyordu.
function screenHygiene(r, lim, hurdlePct) {
  const L = Object.assign({}, SCREEN_LIMITS, lim || {});
  const hur = (isFinite(hurdlePct) && hurdlePct > 0) ? hurdlePct / 100 : 0.35;
  if (!r || r.price == null || !isFinite(r.price) || r.price <= 0) return { ok: false, why: 'nodata' };
  if (r.trailingPE == null || !isFinite(r.trailingPE) || r.trailingPE <= 0) return { ok: false, why: 'loss' };
  if (r.priceToBook == null || !isFinite(r.priceToBook) || r.priceToBook <= 0) return { ok: false, why: 'nobook' };
  const roe = screenRoe(r);
  const fin = screenIsFinancial(r);
  // 🔴 BANKA YALNIZCA ROE KAPISINI ATLAR — bu bir muafiyet değil, ölçüm
  // imkânsızlığı. Bankanın ROE'si tasarımı gereği 8-10 kat kaldıraçla şişer;
  // kademe 1'de toplam varlık verisi OLMADIĞI için bu kaldıracı arındırmak
  // matematiksel olarak mümkün değil. Sanayi şirketiyle aynı eşiği uygulamak
  // bankayı haksız GEÇİRİR, keyfî bir çarpan uydurmak da sayı üretmek olurdu.
  // Doğru çözüm: kararı ölçebilen yere bırak — banka kademe 2'ye gider, orada
  // ROA ve varlık/özsermaye kaldıracıyla düzgün puanlanır.
  // ⚠️ DİĞER KAPILAR BANKAYA DA UYGULANIR (büyüklük, likidite, F/K, PD/DD).
  // İlk yazımda banka erken `ok` dönüyordu ve o kapıları da atlıyordu — test
  // yakaladı. Erken dönüş YOK, sadece bu kapı koşullu.
  if (!fin && (roe == null || roe < hur)) {
    // Kıl payı kalanlar ayrı işaretlenir (kıyı payı kurtarma şeridi)
    const edge = roe != null && roe >= hur * L.edgeBand;
    return { ok: false, why: 'lowroe', edge };
  }
  if (r.marketCap == null || !isFinite(r.marketCap) || r.marketCap < L.minMarketCap) return { ok: false, why: 'small' };
  const to = screenTurnover(r);
  if (to == null || to < L.minTurnover) return { ok: false, why: 'illiquid' };
  if (r.trailingPE > L.maxPE) return { ok: false, why: 'expensive' };
  if (r.priceToBook > L.maxPB) return { ok: false, why: 'rich' };
  return { ok: true, fin };
}

// ——— KALİTE SKORU (0-100) — kademe 1 ———
// 🔴 BUFFETT SIRASI: önce iş kalitesi, SONRA fiyat. Eski sürüm ucuzluğu
// ödüllendiriyordu (F/K + PD/DD + temettü = ağırlığın %60'ı) ve derin
// aşamaya en UCUZ 10 hisse gidiyordu — yani izmarit. Buffett bunu bıraktı:
// "Harika bir şirketi makul fiyata almak, vasat bir şirketi harika fiyata
// almaktan çok daha iyidir."
//
// 🧮 PD/DD VE TEMETTÜ SKORDAN ÇIKARILDI — sebep matematiksel, keyfi değil:
//   PD/DD = F/K × ROE
// Üçünü birlikte puanlamak AYNI bilgiyi iki kez saymaktır; yüksek ROE'ye puan
// verip yüksek PD/DD'yi cezalandırmak birbirini götürür ve kaliteli şirketi
// sistematik olarak aşağı iter. Bağımsız iki boyut vardır: KALİTE (ROE) ve
// FİYAT (F/K). Skor sadece bu ikisini kullanır.
// Temettü de çıktı: Buffett'e göre yüksek getiriyle yeniden yatırım yapabilen
// şirket kâr DAĞITMAMALIDIR (Berkshire hiç temettü ödemedi). Temettü verimi
// kartta bilgi olarak durur, puana girmez.
//
// Veri gelmeyen kriter ATLANIR ve paydadan da düşer (buffettScore kalıbı).
// Kapsama %60 altına düşerse skor null — UYDURMA YOK.
function screenPreScore(r, hurdlePct, isFin) {
  if (!r) return null;
  const hur = (isFinite(hurdlePct) && hurdlePct > 0) ? hurdlePct / 100 : 0.35;
  // 🏦 BANKADA AGIRLIK YER DEGISTIRIR — keyfi degil, olculebilirlik gerekcesi:
  // kademe 1'de bankanin kaldiracli ROE'si ARINDIRILAMAZ (toplam varlik yok),
  // yani ROE burada guvenilmez bir kalite olcusudur. Kazanc getirisi ise
  // kaldiractan bagimsizdir — fiyat, kaldiracla sismez. Bu yuzden bankada
  // agirlik olculebilir boyuta kayar; kalite kararini kademe 2 verir.
  const wRoe = isFin ? 4.0 : 7.0, wEy = isFin ? 6.0 : 3.0;
  const parts = [];
  const add = (key, label, weight, score, note) => parts.push({ key, label, weight, score, note });
  const pct = v => (v == null || !isFinite(v)) ? '—' : ('%' + (Math.round(v * 1000) / 10));

  // 1) İŞ KALİTESİ — özsermaye kârlılığı (Buffett'in ana filtresi)
  // Engel oranı zaten KAPI olduğu için puanlama 1,0 katından başlar ve
  // 2,5 katında dolar: "engeli geçmek" yetmez, ne kadar aştığı önemlidir.
  const roe = screenRoe(r);
  if (roe != null) {
    add('roe', 'İş kalitesi — özsermaye kârlılığı', wRoe, bfLin(roe / hur, 1.0, 2.5),
      `${pct(roe)} · engel oranı ${pct(hur)} · engelin ${bfR(roe / hur, 2)} katı · PD/DD ÷ F/K ile türetildi, TEK yıllıktır${isFin ? ' · ⚠️ banka: bu ROE kaldıraçla şişer, kademe 1\'de arındırılamaz' : ''}`);
  } else {
    add('roe', 'İş kalitesi — özsermaye kârlılığı', wRoe, null, 'F/K veya PD/DD gelmedi.');
  }

  // 2) FİYAT MAKUL MU — kazanç getirisi (ucuzluk YARIŞI değil, makullük kontrolü)
  if (r.trailingPE != null && isFinite(r.trailingPE) && r.trailingPE > 0) {
    const ey = 1 / r.trailingPE;
    add('ey', 'Fiyat makul mü — kazanç getirisi', wEy, bfLin(ey / hur, 0.15, 0.5),
      `${pct(ey)} · F/K ${bfR(r.trailingPE, 1)} · engel oranının ${bfR(ey / hur, 2)} katı${isFin ? ' · bankada bu ölçü kaldıraçtan bağımsızdır' : ''}`);
  } else {
    add('ey', 'Fiyat makul mü — kazanç getirisi', wEy, null, 'F/K gelmedi.');
  }

  const used = parts.filter(p => p.score != null);
  const wTot = parts.reduce((a, p) => a + p.weight, 0);
  const wUse = used.reduce((a, p) => a + p.weight, 0);
  const coverage = wTot > 0 ? wUse / wTot : 0;
  if (coverage < 0.6) {
    return { score: null, parts, coverage: Math.round(coverage * 100) / 100, roe,
      reason: 'Yahoo bu sembol için yeterli oran döndürmedi.' };
  }
  const raw = used.reduce((a, p) => a + p.score * p.weight, 0) / wUse;
  return {
    score: Math.round(bfClamp01(raw) * 100),
    parts, roe,
    coverage: Math.round(coverage * 100) / 100,
  };
}

// ——— Tüm evreni ele + sırala ———
// Deterministik: eşit skorda sembol adı alfabetik kazanır (rastgelelik YOK).
function screenRank(rows, opts) {
  const o = opts || {};
  const hur = (isFinite(o.hurdlePct) && o.hurdlePct > 0) ? o.hurdlePct : 35;
  const lim = Object.assign({}, SCREEN_LIMITS, o.limits || {});
  const passed = [], edge = [], dropCounts = {};
  const mkRow = (r, ps, extra) => Object.assign({}, r, {
    preScore: ps.score, preParts: ps.parts, roe: ps.roe,
    turnover: screenTurnover(r), buffett: null,
  }, extra || {});
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const fin = screenIsFinancial(r);
    const h = screenHygiene(r, lim, hur);
    if (!h.ok) {
      dropCounts[h.why] = (dropCounts[h.why] || 0) + 1;
      // 🛟 Kıyı payı: SADECE ROE kapısından kıl payı dönenler ayrı tutulur.
      // Elenmiş sayılırlar (dökümde görünürler) ama mali tabloya sorulurlar.
      if (h.edge) {
        const ps = screenPreScore(r, hur, fin);
        if (ps && ps.score != null) edge.push(mkRow(r, ps, { fin, edge: true }));
      }
      continue;
    }
    const ps = screenPreScore(r, hur, fin);
    if (!ps || ps.score == null) { dropCounts.nodata = (dropCounts.nodata || 0) + 1; continue; }
    passed.push(mkRow(r, ps, { fin }));
  }
  const byScore = (a, b) => (b.preScore - a.preScore) || String(a.symbol).localeCompare(String(b.symbol), 'tr');
  passed.sort(byScore);
  edge.sort(byScore);
  const scanned = Array.isArray(rows) ? rows.length : 0;
  return {
    passed, edge, dropCounts, scanned,
    dropped: scanned - passed.length,
    hurdlePct: hur,
  };
}

// ——— Derin aşamaya KİM gidecek ———
// Saf fonksiyon (teste bağlı). Üç kaynak, sırayla:
//   ① banka kotası — bankalar ROE kapısını atladığı için kademe 1 skorları
//     sanayi şirketlerininkiyle aynı ölçekte değil; kota olmasa yüksek ROE'li
//     sanayi hisseleri onları tamamen dışarıda bırakırdı
//   ② genel sıra — kademe 1 skoruna göre kalan slotlar
//   ③ kıyı payı — tek yıllık kapıdan kıl payı dönenler, ayrı kota
// Kademe 1 skoru burada SADECE "kime mali tablo okunacak"ı seçer; nihai sırayı
// gerçek Buffett skoru belirler.
function screenSelectDeep(res, limits) {
  const L = Object.assign({}, SCREEN_LIMITS, limits || {});
  const passed = Array.isArray(res && res.passed) ? res.passed : [];
  const edge = Array.isArray(res && res.edge) ? res.edge : [];
  const out = [], seen = new Set();
  const push = r => {
    const k = String(r.symbol || '');
    if (!k || seen.has(k)) return false;
    seen.add(k); out.push(r); return true;
  };
  let n = 0;
  for (const r of passed) { if (n >= L.finQuota) break; if (r.fin && push(r)) n++; }
  for (const r of passed) { if (out.length >= L.deepCount) break; push(r); }
  let e = 0;
  for (const r of edge) { if (e >= L.edgeQuota) break; if (push(r)) e++; }
  return out;
}

// ——— Buffett skoruna göre sıralama ———
// Skoru OLMAYAN hisse listenin altına ayrı grupta düşer — iki farklı ölçeği
// aynı sıralamaya karıştırmak yanıltıcı olurdu.
function screenSort(list, mode) {
  const arr = (Array.isArray(list) ? list : []).slice();
  const alpha = (a, b) => String(a.symbol).localeCompare(String(b.symbol), 'tr');
  const byPre = (a, b) => (b.preScore - a.preScore) || alpha(a, b);
  if (mode !== 'buffett' && mode !== 'norm') { arr.sort(byPre); return arr; }
  const key = mode === 'buffett'
    ? (x => (x.buffett && x.buffett.score != null) ? x.buffett.score : null)
    : (x => (x.normScore != null && isFinite(x.normScore)) ? x.normScore : null);
  arr.sort((a, b) => {
    const x = key(a), y = key(b);
    if (x == null && y == null) return byPre(a, b);
    if (x == null) return 1;
    if (y == null) return -1;
    return (y - x) || alpha(a, b);
  });
  return arr;
}

// Buffett kriter dökümünden en zayıf 2 madde (AI'a ve karta gider)
function screenWeakest(bf, n) {
  if (!bf || !Array.isArray(bf.parts)) return [];
  return bf.parts.filter(p => p && p.score != null)
    .sort((a, b) => a.score - b.score)
    .slice(0, n || 2)
    .map(p => `${p.label} (${Math.round(p.score * p.weight * 10) / 10}/${p.weight})`);
}

// ============================================================
// 🔁 ÇOK YILLI NORMALİZASYON — döngü tuzağı kapatıcı (11 Agu 2026)
// ============================================================
// SORUN: F/K ve türetilmiş ROE SON 12 AYA bakar. Döngüsel şirket (demir-çelik,
// rafineri, petrokimya) kâr ZİRVESİNDEYKEN F/K 3 gösterir ve taramadan birinci
// çıkar. Ertesi yıl kâr yarıya iner, F/K fiyat hiç düşmeden 6 olur. Değer
// yatırımcısının en klasik tuzağı budur ve tek yıllık bir filtre onu GÖREMEZ.
//
// 🔴 NEDEN "ORTALAMA KÂR" ALMIYORUZ: TL'de 4 yılın nominal kârını toplayıp
// bölmek anlamsızdır — 2022'nin 100 TL'si ile 2025'in 100 TL'si aynı para
// değildir, enflasyon ortalamayı sistematik olarak AŞAĞI çeker ve her şirket
// yapay olarak "döngü zirvesinde" görünür.
//
// ✅ ÇÖZÜM — ORAN tabanlı normalizasyon (enflasyondan bagimsiz):
//     normalize kâr = (çok yıllı ORTALAMA net kâr marjı) × (SON yılın cirosu)
// Marj bir orandır, enflasyon payda ve pay'da birlikte büyüdüğü için sadeleşir.
// Sonuç bugünün parasıyla ifade edilir; piyasa değeriyle doğrudan bölünebilir.
// Ciro gelmezse ROE tabanına düşer: ortalama ROE × son özsermaye. O da yoksa
// null döner — UYDURMA YOK.
const SCREEN_CYCLE = {
  minYears: 3,        // 2 yil "cevrim" degildir; altinda hesap yapilmaz
  peakHigh: 1.5,      // son yil ortalamanin %50 ustunde -> zirve uyarisi
  peakLow: 0.6,       // son yil ortalamanin %40 altinda -> dip uyarisi
  cvMid: 0.25,        // degisim katsayisi bantlari
  cvHigh: 0.50,
};

function scrMean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function scrStdev(a) {
  if (a.length < 2) return null;
  const m = scrMean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
}

// f = /stock-fundamentals cevabi · marketCap = tarama satirindan (daha taze)
function screenNormalize(f, marketCap) {
  if (!f || typeof f !== 'object') return null;
  const ys = (Array.isArray(f.years) ? f.years : [])
    .filter(y => y && isFinite(y.year))
    .sort((a, b) => b.year - a.year);   // yeniden eskiye
  if (ys.length < SCREEN_CYCLE.minYears) {
    return { ok: false, years: ys.length, reason: `Çok yıllı hesap için en az ${SCREEN_CYCLE.minYears} yıl gerekli, ${ys.length} yıl geldi.` };
  }

  const mc = (marketCap != null && isFinite(marketCap) && marketCap > 0)
    ? marketCap
    : ((f.marketCap != null && isFinite(f.marketCap) && f.marketCap > 0) ? f.marketCap : null);

  // ——— Taban 1: net kâr marjı (tercih edilen) ———
  const marg = ys.filter(y => y.revenue != null && isFinite(y.revenue) && y.revenue > 0
    && y.netIncome != null && isFinite(y.netIncome))
    .map(y => ({ year: y.year, v: y.netIncome / y.revenue, base: y.revenue }));

  // ——— Taban 2: ROE (ciro gelmezse) ———
  const roes = ys.filter(y => y.equity != null && isFinite(y.equity) && y.equity > 0
    && y.netIncome != null && isFinite(y.netIncome))
    .map(y => ({ year: y.year, v: y.netIncome / y.equity, base: y.equity }));

  let src = null, basis = null;
  if (marg.length >= SCREEN_CYCLE.minYears) { src = marg; basis = 'marj'; }
  else if (roes.length >= SCREEN_CYCLE.minYears) { src = roes; basis = 'roe'; }
  else {
    return { ok: false, years: ys.length,
      reason: 'Yıllık ciro/özsermaye verisi çok yıllı hesaba yetmedi.' };
  }

  const vals = src.map(x => x.v);
  const avg = scrMean(vals);
  const last = src[0].v;                 // en yeni yil
  const lastBase = src[0].base;          // son yilin cirosu / ozsermayesi
  const sd = scrStdev(vals);

  // Degisim katsayisi — donguselligin siddeti. Ortalama 0'a yakinsa anlamsiz
  // buyur, o yuzden mutlak degerle korunur ve tabani var.
  const cv = (sd != null && Math.abs(avg) > 1e-9) ? sd / Math.abs(avg) : null;
  const cyclical = cv == null ? null
    : (cv < SCREEN_CYCLE.cvMid ? 'düşük' : (cv < SCREEN_CYCLE.cvHigh ? 'orta' : 'yüksek'));

  // Zirve orani — son yil ortalamanin kac kati. >1 kar sisik, <1 kar bastirilmis.
  const peakRatio = (avg != null && Math.abs(avg) > 1e-9) ? last / avg : null;

  // Normalize kâr: ORTALAMA oran × SON yilin tabani (bugunun parasiyla)
  const normEarnings = (avg != null && lastBase != null) ? avg * lastBase : null;

  // Ortalama zarar eden sirket "ucuz" degildir — normPE hesaplanmaz, bayrak kalkar.
  let normPE = null, note = null;
  if (normEarnings != null && normEarnings > 0 && mc != null) {
    normPE = mc / normEarnings;
  } else if (normEarnings != null && normEarnings <= 0) {
    note = 'Çok yıllı ortalamada şirket kâr etmiyor — son yılın kârı istisna.';
  }

  const flags = [];
  if (peakRatio != null && peakRatio >= SCREEN_CYCLE.peakHigh) {
    flags.push(`Son yıl ${basis === 'marj' ? 'kâr marjı' : 'özsermaye kârlılığı'} çok yıllı ortalamanın ${Math.round(peakRatio * 100 - 100)}% üstünde — F/K olduğundan ucuz görünüyor.`);
  }
  if (peakRatio != null && peakRatio <= SCREEN_CYCLE.peakLow) {
    flags.push(`Son yıl ${basis === 'marj' ? 'kâr marjı' : 'özsermaye kârlılığı'} ortalamanın ${Math.round(100 - peakRatio * 100)}% altında — F/K olduğundan pahalı görünüyor.`);
  }
  if (cyclical === 'yüksek') flags.push('Kâr geçmişi çok dalgalı — tek yıla bakmak yanıltır.');
  if (note) flags.push(note);

  return {
    ok: true, basis, years: src.length,
    avgRate: bfR(avg, 4), lastRate: bfR(last, 4),
    peakRatio: bfR(peakRatio, 2),
    cv: bfR(cv, 2), cyclical,
    normEarnings, normPE: bfR(normPE, 2),
    flags,
  };
}

// Aynı skor fonksiyonu, ÇOK YILLI girdi.
// screenPreScore ROE'yi PD/DD ÷ F/K ile turetiyor; F/K yerine normalize F/K
// verince turetilen ROE de otomatik olarak cok yilli ortalamaya donuyor
// (PD/DD ÷ normF/K = defter basina normalize kar = ortalama ROE). Yani tek
// satirlik degisiklikle butun skor cok yilli hale geliyor — ayri formul YOK.
function screenNormScore(row, cyc, hurdlePct) {
  // Banka agirligi burada da korunur (screenPreScore ile ayni sozlesme)
  if (!row || !cyc || !cyc.ok || cyc.normPE == null || !(cyc.normPE > 0)) return null;
  const s = screenPreScore(Object.assign({}, row, { trailingPE: cyc.normPE }), hurdlePct, !!(row && row.fin));
  return (s && s.score != null) ? s.score : null;
}

// ============================================================
// Tarama akışı
// ============================================================
let _screenBusy = false;
// Varsayilan GERCEK Buffett skoru — kademe 1 sadece "kime mali tablo okunacak"
// sorusunu cevaplar, nihai sirayi mali tablo belirler.
let _screenSort = 'buffett';

function ensureScreen() {
  if (!data.screen || typeof data.screen !== 'object') data.screen = {};
  if (!Array.isArray(data.screen.rows)) data.screen.rows = [];
  return data.screen;
}

// Evren = sabit liste + kullanıcının kendi BIST izleme listesi (tekrarsız)
function screenUniverse() {
  const set = new Set(BIST_UNIVERSE);
  for (const w of (data.watchlist || [])) {
    if (!w || w.market !== 'bist' || !w.symbol) continue;
    const s = String(w.symbol).toUpperCase().replace(/\.IS$/, '');
    if (/^[A-Z0-9]{2,10}$/.test(s)) set.add(s);
  }
  return Array.from(set).slice(0, SCREEN_LIMITS.maxSymbols);
}

function setScreenStatus(msg, isError) {
  const el = document.getElementById('scrStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
  el.style.display = msg ? 'block' : 'none';
}

async function runScreener() {
  if (_screenBusy) return;
  _screenBusy = true;
  const btn = document.getElementById('scrRunBtn');
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  const hur = buffettHurdle('TRY');
  try {
    const token = await getSupaToken();
    if (!token) throw new Error('giriş yapılmamış');

    const symbols = screenUniverse();
    setScreenStatus(`${symbols.length} hisse taranıyor…`);
    const r = await fetch(STOCK_SCREEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ symbols: symbols.map(s => s + '.IS') }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `http ${r.status}`); }
    const j = await r.json();
    const rows = Array.isArray(j.rows) ? j.rows : [];
    if (!rows.length) throw new Error('Yahoo veri döndürmedi, birazdan tekrar dene');

    const res = screenRank(rows, { hurdlePct: hur });
    // 🔴 Kademe 1'in TEK isi "kime mali tablo okunacak"i secmektir; nihai sirayi
    // gercek Buffett skoru belirler. Secim banka kotasi + genel sira + kiyi payi
    // seklinde yapilir (screenSelectDeep). HEPSI saklanir; ekranda listCount (15)
    // satir gosterilir ama siralama tamami uzerinden yapilir.
    const top = screenSelectDeep(res, SCREEN_LIMITS);

    const sc = ensureScreen();
    sc.at = Date.now();
    sc.hurdlePct = hur;
    sc.scanned = res.scanned;
    sc.dropped = res.dropped;
    sc.dropCounts = res.dropCounts;
    sc.edgeCount = top.filter(r => r.edge).length;
    sc.finCount = top.filter(r => r.fin).length;
    sc.asked = symbols.length;
    sc.rows = top;
    sc.comment = null;
    save();
    _screenSort = 'buffett';
    renderScreener();

    // ——— Kademe 2: ilk N hisseye mevcut Buffett skoru ———
    setScreenStatus(`Mali tablolar okunuyor — ${top.length} hisse, bu biraz sürer…`);
    await screenDeepStage(top, token);
    sc.rows = top;
    sc.deepAt = Date.now();
    save();
    setScreenStatus('');
    renderScreener();
  } catch (e) {
    setScreenStatus('Tarama yapılamadı: ' + e.message, true);
  } finally {
    _screenBusy = false;
    if (btn) { btn.disabled = false; btn.classList.remove('busy'); }
  }
}

// Sembol başına /stock-fundamentals + buffettScore. 3'lü kuyruk — Yahoo'yu
// aynı anda 10 istekle dövmek 429/403 getirir.
async function screenDeepStage(list, token) {
  const queue = list.slice();
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift();
      if (!row) continue;
      try {
        const r = await fetch(STOCK_FUND_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ ySymbol: row.ySymbol, symbol: row.symbol }),
        });
        if (!r.ok) throw new Error(`http ${r.status}`);
        const d = await r.json();
        // Cok yilli normalizasyon — dongu tuzagi kontrolu (ayni istekten bedava)
        const cyc = screenNormalize(d, row.marketCap);
        row.cycle = cyc;
        row.normScore = screenNormScore(row, cyc, buffettHurdle('TRY'));
        const bf = buffettScore(d, buffettHurdle(d.currency || 'TRY'));
        row.buffett = bf ? {
          score: bf.score, label: bf.label, coverage: bf.coverage,
          years: bf.years, reason: bf.reason || null, weak: screenWeakest(bf, 2),
          // Kurum tipi listede de gösterilir: banka satırı FARKLI kriter setiyle
          // puanlandı, iki skoru birebir aynı ölçek sanmak yanıltıcı olur.
          kind: bf.kind || null, kindLabel: bf.kindLabel || null, mos: bf.mos ?? null,
        } : { score: null, label: 'yetersiz veri', reason: 'skor üretilemedi', weak: [] };
      } catch (e) {
        // ⚠️ Sessiz geçme — kullanıcı "skor yok" ile "skor kötü" arasını GÖRMELİ
        row.buffett = { score: null, label: 'veri alınamadı', reason: e.message, weak: [] };
      }
      renderScreenRows();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

function setScreenSort(mode) {
  _screenSort = (mode === 'buffett' || mode === 'norm') ? mode : 'pre';
  renderScreener();
}

// ⚠️ setBuffettHurdle() KULLANILMAZ: o, o an acik olan hisse grafiginin para
// birimine gore duzenler (US hissesine bakildiysa USD esigini degistirir).
// Tarama her zaman BIST = TRY'dir, esik dogrudan TRY'ye yazilir.
async function setScreenHurdle() {
  const now = buffettHurdle('TRY');
  const v = await aidanPrompt(
    'Engel oranı (TRY)',
    'Bir şirketin aşması gereken yıllık getiri, % olarak. Mevduat/tahvil faizini yaz — %15 ROE, mevduat %37 iken iyi değildir.',
    String(now)
  );
  if (v == null) return;
  const n = Number(String(v).replace(',', '.').replace('%', '').trim());
  if (!isFinite(n) || n <= 0 || n >= 200) { showToast('Geçerli bir yüzde gir (1-199)', 'error'); return; }
  data.settings = data.settings || {};
  if (!data.settings.buffettHurdle || typeof data.settings.buffettHurdle !== 'object') data.settings.buffettHurdle = {};
  data.settings.buffettHurdle.TRY = n;

  // Ekrandaki liste bayat kalmasin — on skorlar yeni esikle yeniden hesaplanir.
  // (Buffett skoru yeniden hesaplanmaz: mali tablo istegi gerektirir, yeniden tara.)
  const sc = data.screen;
  if (sc && Array.isArray(sc.rows) && sc.rows.length) {
    for (const row of sc.rows) {
      // ⚠️ `row.fin` GECIRILMELI — yoksa banka satiri yeniden hesaplandiginda
      // sanayi agirligina (7/3) doner ve skor sessizce degisir.
      const ps = screenPreScore(row, n, !!row.fin);
      if (ps && ps.score != null) { row.preScore = ps.score; row.preParts = ps.parts; }
      // normalize skor da ayni esige bagli — bayat kalmasin (mali tablo istegi GEREKMEZ,
      // cycle zaten kayitli; sadece Buffett skoru yeniden tarama ister)
      if (row.cycle) row.normScore = screenNormScore(row, row.cycle, n);
    }
    sc.hurdlePct = n;
  }
  save();
  renderScreener();
  showToast(`Engel oranı %${n} yapıldı`, 'success');
}

function screenAddToWatchlist(sym) {
  const s = String(sym || '').toUpperCase().replace(/\.IS$/, '');
  if (!/^[A-Z0-9]{2,10}$/.test(s)) return;
  data.watchlist = data.watchlist || [];
  if (data.watchlist.some(w => w && String(w.symbol).toUpperCase() === s && w.market === 'bist')) {
    showToast(`${s} zaten listende`, 'info');
    return;
  }
  data.watchlist.push({ symbol: s, ySymbol: s + '.IS', market: 'bist', name: s });
  save();
  renderStocks();   // renderScreener() zaten bunun icinden cagriliyor
  showToast(`${s} izleme listesine eklendi`, 'success');
  refreshStocks();
}

// ============================================================
// AI yorumu — tabloyu ANLATIR, sıralamaya karışmaz
// ============================================================
async function aiScreenComment() {
  const sc = data.screen;
  if (!sc || !Array.isArray(sc.rows) || !sc.rows.length) return;
  const btn = document.getElementById('scrAiBtn');
  const box = document.getElementById('scrComment');
  if (btn) btn.disabled = true;
  if (box) { box.style.display = 'block'; box.innerHTML = '<div class="scr-loading">Aidan tabloyu okuyor…</div>'; }
  try {
    const token = await getSupaToken();
    if (!token) throw new Error('giriş yapılmamış');
    const results = sc.rows.slice(0, 12).map(r => ({
      symbol: r.symbol, name: r.name, preScore: r.preScore,
      trailingPE: r.trailingPE, priceToBook: r.priceToBook,
      roe: r.roe, dividendYield: r.dividendYield,
      normScore: r.normScore != null ? r.normScore : null,
      cycle: (r.cycle && r.cycle.ok) ? {
        basis: r.cycle.basis, years: r.cycle.years, normPE: r.cycle.normPE,
        avgRate: r.cycle.avgRate, lastRate: r.cycle.lastRate,
        peakRatio: r.cycle.peakRatio, cyclical: r.cycle.cyclical,
      } : null,
      buffett: r.buffett || null,
    }));
    const r = await fetch(STOCK_SCREEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        comment: true, results,
        hurdlePct: sc.hurdlePct || buffettHurdle('TRY'),
        scanned: sc.scanned, dropped: sc.dropped,
        instructions: (typeof aiInstructions === 'function') ? aiInstructions() : '',
      }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `http ${r.status}`); }
    const j = await r.json();
    sc.comment = j.comment || '';
    save();
    renderScreenComment();
  } catch (e) {
    if (box) box.innerHTML = `<div class="scr-loading">Yorum alınamadı: ${escapeHtml(e.message)}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderScreenComment() {
  const box = document.getElementById('scrComment');
  const sc = data.screen;
  if (!box) return;
  if (!sc || !sc.comment) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';
  box.innerHTML = `<div class="scr-comment-head">Aidan'ın okuması</div>
    <div class="scr-comment-body">${escapeHtml(sc.comment).replace(/\n/g, '<br>')}</div>`;
}

// ============================================================
// Render
// ============================================================
function scrCls(v) { return v >= 70 ? 'good' : (v >= 45 ? 'mid' : 'bad'); }

function screenRowHtml(r, i) {
  const tr = n => n.toLocaleString('tr-TR');
  const num = (v, d) => (v == null || !isFinite(v)) ? '—' : tr(Math.round(v * Math.pow(10, d)) / Math.pow(10, d));
  const pct = v => (v == null || !isFinite(v)) ? '—' : '%' + tr(Math.round(v * 1000) / 10);
  const big = v => {
    if (v == null || !isFinite(v)) return '—';
    if (Math.abs(v) >= 1e9) return tr(Math.round(v / 1e8) / 10) + ' Mr';
    if (Math.abs(v) >= 1e6) return tr(Math.round(v / 1e5) / 10) + ' Mn';
    return tr(Math.round(v));
  };
  const cls = scrCls(r.preScore);
  const bf = r.buffett;
  let bfHtml = '<span class="scr-bf pending">Buffett skoru bekliyor</span>';
  if (bf) {
    bfHtml = bf.score == null
      ? `<span class="scr-bf na" title="${escapeHtml(String(bf.reason || ''))}">Buffett skoru yok — ${escapeHtml(String(bf.label || 'veri gelmedi'))}</span>`
      : `<span class="scr-bf ${scrCls(bf.score)}">Buffett ${tr(bf.score)}/100 · ${escapeHtml(String(bf.label || ''))}</span>`;
  }
  // Kurum tipi rozeti — banka/GYO/holding FARKLI kriter setiyle puanlandı.
  // Rozet olmasa iki skoru birebir aynı ölçek sanmak yanıltıcı olurdu.
  const kindHtml = (bf && bf.kind && bf.kind !== 'operating')
    ? `<span class="scr-kind ${escapeHtml(String(bf.kind))}">${escapeHtml(String(bf.kindLabel || bf.kind))} · ayrı kriter seti</span>` : '';
  const mosHtml = (bf && bf.mos != null && isFinite(bf.mos))
    ? `<span class="scr-mos ${bf.mos >= 0.33 ? 'good' : (bf.mos >= 0 ? 'mid' : 'bad')}">güvenlik payı ${pct(bf.mos)}</span>` : '';
  // 🛟 Kıyı payı rozeti — bu satır tek yıllık ROE kapısından KIL PAYI döndü,
  // kararı mali tabloya sorduk. Kullanıcı bunun normal bir "geçen" satır
  // olmadığını görmeli.
  const edgeHtml = r.edge
    ? `<span class="scr-edge">kıyı payı — tek yıllık kapıdan geçemedi, mali tabloya soruldu</span>` : '';
  const weak = (bf && Array.isArray(bf.weak) && bf.weak.length)
    ? `<div class="scr-weak">En zayıf: ${bf.weak.map(w => escapeHtml(String(w))).join(' · ')}</div>` : '';

  // ——— Cok yilli katman ———
  const cy = r.cycle;
  const cyOk = !!(cy && cy.ok);
  // ⚠️ On skor ile normalize skor ARASINDAKI FARK asil sinyaldir: buyuk negatif
  // fark = son yilin kari sisik, tek yila bakan skor hisseyi olduğundan iyi
  // gosteriyor demektir. Bu yuzden ikisi YAN YANA gosterilir, biri digerinin
  // yerini almaz.
  let normHtml = '';
  if (r.normScore != null && isFinite(r.normScore)) {
    const d = r.normScore - r.preScore;
    const dCls = d <= -15 ? 'bad' : (d >= 15 ? 'good' : '');
    normHtml = `<div class="scr-norm ${dCls}">Çok yıllı skor <b>${tr(r.normScore)}</b>
      <span class="scr-delta">${d > 0 ? '+' : ''}${tr(d)}</span>
      <span class="scr-cyc">${cyOk ? escapeHtml(cy.years + ' yıl · dalgalanma ' + (cy.cyclical || '—')) : ''}</span></div>`;
  } else if (cy && !cy.ok) {
    normHtml = `<div class="scr-norm na">Çok yıllı skor yok — ${escapeHtml(String(cy.reason || 'veri yetersiz'))}</div>`;
  } else if (cyOk) {
    normHtml = `<div class="scr-norm na">Çok yıllı skor yok — ortalamada kâr üretilmiyor</div>`;
  }
  const cyFlags = (cyOk && Array.isArray(cy.flags) && cy.flags.length)
    ? `<div class="scr-cflags">${cy.flags.map(f => `<div>${escapeHtml(String(f))}</div>`).join('')}</div>` : '';

  const cells = [
    ['F/K', num(r.trailingPE, 1)],
    ['Normalize F/K', cyOk && cy.normPE != null ? num(cy.normPE, 1) : '—'],
    ['PD/DD', num(r.priceToBook, 2)],
    ['ROE* (son yıl)', pct(r.roe)],
    ['Ort. ROE / marj', cyOk ? pct(cy.avgRate) + (cy.basis === 'marj' ? ' marj' : '') : '—'],
    ['Temettü', pct(r.dividendYield)],
    ['Piyasa değeri', big(r.marketCap)],
    ['Günlük hacim', big(r.turnover)],
  ].map(([l, v]) => `<div class="scr-cell"><span class="lbl">${l}</span><span class="val">${escapeHtml(String(v))}</span></div>`).join('');

  return `<div class="scr-row">
    <div class="scr-row-top">
      <div class="scr-rank">${i + 1}</div>
      <div class="scr-id">
        <div class="scr-sym">${escapeHtml(String(r.symbol || ''))}</div>
        <div class="scr-name">${escapeHtml(String(r.name || ''))}</div>
      </div>
      <div class="scr-score ${cls}">${tr(r.preScore)}<span>/100</span></div>
    </div>
    <div class="scr-bar"><i class="${cls}" style="width:${Math.max(2, Math.min(100, r.preScore))}%"></i></div>
    ${normHtml}
    <div class="scr-cells">${cells}</div>
    ${edgeHtml}
    <div class="scr-row-foot">${bfHtml}${mosHtml}${kindHtml}
      <button type="button" class="scr-add" onclick="screenAddToWatchlist('${escapeHtml(String(r.symbol || ''))}')">Listeme ekle</button>
    </div>
    ${weak}${cyFlags}
  </div>`;
}

function renderScreenRows() {
  const el = document.getElementById('scrRows');
  if (!el) return;
  const sc = data.screen;
  // Saklanan satır sayısı deepCount (25); ekranda listCount (15) gösterilir.
  // Sıralama ÖNCE tüm 25 üzerinden yapılır — kırpma en sonda.
  const rows = (sc && Array.isArray(sc.rows))
    ? screenSort(sc.rows, _screenSort).slice(0, SCREEN_LIMITS.listCount) : [];
  el.innerHTML = rows.length
    ? rows.map((r, i) => screenRowHtml(r, i)).join('')
    : '<div class="scr-empty">Filtreden geçen hisse yok. Engel oranını düşürmeyi deneyebilirsin.</div>';
}

function renderScreener() {
  const el = document.getElementById('screenerSection');
  if (!el) return;
  const sc = data.screen;
  const tr = n => n.toLocaleString('tr-TR');
  const hur = (sc && sc.hurdlePct) || buffettHurdle('TRY');
  const has = !!(sc && Array.isArray(sc.rows) && sc.rows.length);

  const when = (sc && sc.at)
    ? new Date(sc.at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  const dropList = (sc && sc.dropCounts)
    ? Object.keys(sc.dropCounts).sort((a, b) => sc.dropCounts[b] - sc.dropCounts[a])
        .map(k => `<li>${escapeHtml(SCREEN_DROP_LABELS[k] || k)}: <b>${tr(sc.dropCounts[k])}</b></li>`).join('')
    : '';

  el.innerHTML = `
    <div class="scr-head">
      <div class="scr-head-txt">
        <div class="scr-title">BIST temel tarama</div>
        <div class="scr-sub">${when ? escapeHtml(when) + ' · ' : ''}${sc && sc.scanned ? tr(sc.scanned) + ' hisse tarandı · ' : ''}engel oranı %${tr(hur)}</div>
      </div>
      <button type="button" class="scr-run" id="scrRunBtn" onclick="runScreener()">${has ? 'Yeniden tara' : 'Tara'}</button>
    </div>
    <div class="scr-status" id="scrStatus" style="display:none;"></div>
    ${has ? `
    <div class="scr-tools">
      <div class="scr-sortby">
        <button type="button" class="${_screenSort === 'buffett' ? 'active' : ''}" onclick="setScreenSort('buffett')">Buffett skoru</button>
        <button type="button" class="${_screenSort === 'norm' ? 'active' : ''}" onclick="setScreenSort('norm')">Çok yıllı kalite</button>
        <button type="button" class="${_screenSort === 'pre' ? 'active' : ''}" onclick="setScreenSort('pre')">Son yıl kalite</button>
      </div>
      <button type="button" class="scr-hurdle" onclick="setScreenHurdle()">engel oranı %${tr(hur)} · değiştir</button>
    </div>
    <div class="scr-rows" id="scrRows"></div>
    ${dropList ? `<details class="scr-drop"><summary>Elenen ${tr(sc.dropped || 0)} hisse — hangi kapıdan döndü</summary><ul>${dropList}</ul></details>` : ''}
    <button type="button" class="scr-ai" id="scrAiBtn" onclick="aiScreenComment()">Aidan bu tabloyu anlatsın</button>
    <div class="scr-comment" id="scrComment" style="display:none;"></div>
    ` : `<p class="scr-intro">BIST'in likit ana gövdesini <b>Buffett sırasıyla</b> eler: <b>önce iş kalitesi, sonra fiyat</b>. Özsermayesini engel oranının üzerinde çalıştıramayan şirket ne kadar ucuz olursa olsun elenir. Kalan en kaliteli ${SCREEN_LIMITS.deepCount} hissenin çok yıllı mali tablosu okunur: gerçek Buffett skoru (borç, marj istikrarı, sahip kârı, 1 Dolar Testi) + <b>döngü kontrolü</b>.</p>`}
    <p class="scr-note"><b>Bu bir alım listesi değildir.</b> Mekanik bir filtrenin çıktısıdır; sıralama tercih sırası değil, formülün sonucudur. Sıralama <b>kalite önce, fiyat sonra</b> mantığındadır: ucuzluk tek başına puan kazandırmaz. PD/DD ve temettü verimi <b>skora girmez</b> — PD/DD = F/K × ROE olduğu için üçünü birlikte puanlamak aynı bilgiyi iki kez saymak olurdu, temettüyü de Buffett bir kalite işareti saymaz. ROE* = PD/DD ÷ F/K ile türetilmiştir ve <b>son 12 aya</b> aittir; <b>Çok yıllı skor</b> aynı formülü çok yıllı ortalama kârlılıkla çalıştırır — aradaki fark döngü sinyalidir. TRY'de 2023 sonrası enflasyon muhasebesi net kârı çarpıtır — oranları buna göre oku. Veriler Yahoo Finance'tan, gecikmeli ve eksik olabilir.</p>`;

  if (has) { renderScreenRows(); renderScreenComment(); }
}
