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

// SVG donut chart — stroke-dasharray tekniği (segments: [{val,color}])
function donutChart(segments, size) {
  size = size || 140;
  const r = size / 2 - 11;
  const cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.val, 0) || 1;
  let offset = 0;
  const arcs = segments.map(seg => {
    const len = (seg.val / total) * C;
    const c = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="13" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
    return c;
  }).join('');
  return `<svg class="pf-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${arcs}</svg>`;
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
    const ts = t.toISOString().slice(0, 10);
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

function renderStockFundamentals(d, w) {
  const grid = document.getElementById('stockFundGrid');
  if (!grid) return;
  if (!d) { grid.innerHTML = '<div class="stock-chart-loading">Veri yok.</div>'; return; }
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
      body: JSON.stringify({ summarize: true, symbol: w ? w.symbol : '', headlines }),
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

// ——— Yeni indikatörler (Haz 13) ———
// Stochastic %K (lookback) + %D (k SMA) — momentum osilatörü, RSI'a alternatif
// %K = ((C - LL) / (HH - LL)) * 100 — son lookback periyodu içinde fiyatın konumu
function taStoch(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
  if (closes.length < kPeriod + dPeriod) return null;
  const kArr = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const hs = highs.slice(i - kPeriod + 1, i + 1).filter(v => v != null);
    const ls = lows.slice(i - kPeriod + 1, i + 1).filter(v => v != null);
    if (!hs.length || !ls.length) { kArr.push(null); continue; }
    const hh = Math.max(...hs), ll = Math.min(...ls), c = closes[i];
    kArr.push(hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100);
  }
  const kLast = kArr[kArr.length - 1];
  const kValid = kArr.slice(-dPeriod).filter(v => v != null);
  if (kLast == null || kValid.length < dPeriod) return null;
  const dLast = kValid.reduce((a, b) => a + b, 0) / kValid.length;
  return { k: Math.round(kLast * 10) / 10, d: Math.round(dLast * 10) / 10 };
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
  // EMA9 / EMA21 — kısa vade hızlı tepkili ortalamalar (trader klasiği)
  const ema9Series = taEmaSeries(closes, 9);
  const ema21Series = taEmaSeries(closes, 21);
  const ema9 = ema9Series.length ? ema9Series[ema9Series.length - 1] : null;
  const ema21 = ema21Series.length ? ema21Series[ema21Series.length - 1] : null;
  const rsi = taRsi(closes, 14);
  const macd = taMacd(closes);
  const bb = taBollinger(closes, 20, 2);
  const sr = taSupportResistance(closes, highs, lows, 20);
  const atrPct = taAtrPct(highs, lows, closes, 14);
  const stoch = taStoch(highs, lows, closes, 14, 3);
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
  // Stochastic + ADX zone etiketleri
  const stochZone = stoch == null ? '—' : (stoch.k >= 80 ? 'aşırı alım' : stoch.k <= 20 ? 'aşırı satım' : 'nötr');
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
    current, sma20, sma50, ema9, ema21, rsi, macd, bb, bbPosition, volRatio, sr, trend,
    stoch, stochZone, adx, adxZone, obv, pivots, pivotZone,
  });
  return {
    current, sma20, sma50, ema9, ema21, rsi, rsiZone: taRsiZone(rsi), macd, bb, sr, atrPct, volRatio,
    stoch, stochZone, adx, adxZone, obv, pivots, pivotZone,
    trend, bbPosition, priceVsSma20, recentChange7d,
    sma20Series, sma50Series, ema9Series, ema21Series, signals,
    changePct: j.changePct, min: j.min, max: j.max,
  };
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
  const emaCross = ta.ema9 != null && ta.ema21 != null
    ? (ta.ema9 > ta.ema21 ? 'EMA9 ↑' : 'EMA9 ↓')
    : '—';
  const stochCls = ta.stoch == null ? '' : (ta.stoch.k >= 80 ? 'warn' : ta.stoch.k <= 20 ? 'down' : '');
  const adxCls = ta.adx == null ? '' : (ta.adx >= 25 ? 'up' : ta.adx >= 20 ? 'warn' : '');
  const obvCls = ta.obv == null ? '' : (ta.obv.trend === 'yukarı' ? 'up' : ta.obv.trend === 'aşağı' ? 'down' : '');
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
    ema9: ta.ema9 != null ? Math.round(ta.ema9 * 100) / 100 : null,
    ema21: ta.ema21 != null ? Math.round(ta.ema21 * 100) / 100 : null,
    priceVsSma20: ta.priceVsSma20,
    rsi: ta.rsi,
    rsiZone: ta.rsiZone,
    stochK: ta.stoch?.k ?? null,
    stochD: ta.stoch?.d ?? null,
    stochZone: ta.stochZone,
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
  };
}

async function aiStockAnalysis() {
  if (!_stockChartPayload) return;
  const btn = document.getElementById('stockTaAiBtn');
  const resEl = document.getElementById('stockTaAiResult');
  btn.disabled = true;
  resEl.style.display = 'block';
  resEl.textContent = 'AI teknik yorum hazırlanıyor…';
  try {
    const token = window._supa ? (await window._supa.auth.getSession()).data.session?.access_token : null;
    if (!token) throw new Error('giriş yapılmamış');
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
        facts,
        newsHeadlines,
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
    if (ta.stoch != null) {
      const sCls = ta.stoch.k >= 80 ? 'warn' : ta.stoch.k <= 20 ? 'down' : '';
      badges.push(`<span class="pf-tech-badge ${sCls}">Stoch ${ta.stoch.k.toFixed(0)}</span>`);
    }
    if (ta.bbPosition && ta.bbPosition !== '—') {
      const bbCls = ta.bbPosition.includes('üst') ? 'warn' : ta.bbPosition.includes('alt') ? 'down' : '';
      badges.push(`<span class="pf-tech-badge ${bbCls}">BB: ${escapeHtml(ta.bbPosition)}</span>`);
    }
    badges.push(`<span class="pf-tech-badge">trend ${escapeHtml(ta.trend)}</span>`);
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
      body: JSON.stringify({ items: _pfTechItems }),
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

// Basit line chart (sparkline/portföy geçmişi için — TA overlay yok)
function lineChart(values, isDown) {
  if (!values || values.length < 2) return '';
  const w = 420, h = 140, padX = 8, padY = 10;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const pts = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * (w - 2 * padX);
    const y = padY + (1 - (v - min) / range) * (h - 2 * padY);
    return [x, y];
  });
  const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${pts[pts.length-1][0].toFixed(1)},${(h-padY).toFixed(1)} L${pts[0][0].toFixed(1)},${(h-padY).toFixed(1)} Z`;
  const up = values[values.length - 1] >= values[0];
  const color = up ? '#34c759' : '#ef4444';
  const fillId = 'lc-fill-' + (up ? 'u' : 'd');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${fillId}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${fillId})" stroke="none"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// Basit SVG sparkline — değer dizisinden tek çizgi (son ≥ ilk → yeşil, değilse kırmızı)
function sparkline(values) {
  if (!values || values.length < 2) return '';
  const w = 300, h = 46, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const up = values[values.length - 1] >= values[0];
  const color = up ? '#34c759' : '#ef4444';
  return `<svg class="pf-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ====== Görselden portföy (AI vision) ======
const PORTFOLIO_IMAGE_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/portfolio-image';
let _pfImportHoldings = []; // AI'nın bulduğu + kullanıcının düzenlediği geçici liste

// Seçilen fotoğrafı canvas ile küçült (max kenar 1280px), jpeg base64 döndür — yükleme küçük kalsın
function resizeImageToDataUrl(file, maxSide = 1100, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        const scale = maxSide / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('görsel açılamadı')); };
    img.src = url;
  });
}

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

function addTask() {
  const text = document.getElementById('taskInput').value.trim();
  if (!text) return;
  const task = {
    id: Date.now(),
    text,
    done: false,
    doneDate: null,
    subtasks: [],
    created: timeStr(),
    priority: document.getElementById('taskPriority').value,
    category: document.getElementById('taskCategory').value || null,
    due: document.getElementById('taskDue').value || null,
    estimateMin: parseInt(document.getElementById('taskEstimate').value) || null,
    actualMin: null,
    repeat: document.getElementById('taskRepeatNew').value || null,
    reminderTime: document.getElementById('taskReminder').value || null,
    lastReminded: null,
    mitDate: null,
    seriesId: null,
    seriesName: null,
    seriesIndex: null,
    seriesTotal: null,
    notes: null
  };
  data.tasks.push(task);
  document.getElementById('taskInput').value = '';
  document.getElementById('taskDue').value = '';
  document.getElementById('taskEstimate').value = '';
  document.getElementById('taskPriority').value = 'normal';
  document.getElementById('taskCategory').value = '';
  document.getElementById('taskRepeatNew').value = '';
  document.getElementById('taskReminder').value = '';
  save(); renderTasks();
}

async function splitTask() {
  const text = document.getElementById('taskInput').value.trim();
  if (!text) { showToast('Önce büyük görevi yaz, sonra "Böl" bas.', 'warning'); return; }
  const parts = await aidanPrompt(
    `"${text}" görevini böl`,
    'Her satıra bir adım yaz:',
    "1. adım\n2. adım\n3. adım",
    true
  );
  if (parts === null || !parts.trim()) return;
  const subs = parts.split('\n').map(s => s.trim()).filter(s => s).map(s => ({ text: s, done: false }));
  if (subs.length === 0) return;
  data.tasks.push({
    id: Date.now(), text, done: false, doneDate: null, subtasks: subs, created: timeStr(),
    priority: document.getElementById('taskPriority').value,
    category: document.getElementById('taskCategory').value || null,
    due: document.getElementById('taskDue').value || null,
    estimateMin: parseInt(document.getElementById('taskEstimate').value) || null,
    actualMin: null,
    repeat: document.getElementById('taskRepeatNew').value || null,
    reminderTime: document.getElementById('taskReminder').value || null,
    lastReminded: null,
    mitDate: null,
    seriesId: null,
    seriesName: null,
    seriesIndex: null,
    seriesTotal: null
  });
  document.getElementById('taskInput').value = '';
  document.getElementById('taskReminder').value = '';
  save(); renderTasks();
  showToast(`Görev ${subs.length} adıma bölündü`, 'success');
}

function toggleTask(id) {
  const t = data.tasks.find(x => x.id === id);
  const wasDone = t.done;
  const oldDoneDate = t.doneDate;
  const oldActualMin = t.actualMin;
  t.done = !t.done;
  t.doneDate = t.done ? today() : null;
  const justFinished = t.done && !wasDone;

  if (t.done && t.estimateMin && currentFocusTaskId === id && focusStartTime) {
    // Focus modunda otomatik ölç
    const elapsed = Math.round((Date.now() - focusStartTime) / 60000);
    t.actualMin = elapsed;
    const diff = elapsed - t.estimateMin;
    setTimeout(() => {
      if (diff > 5) showToast(`Tahmin ${t.estimateMin}dk, gerçek ${elapsed}dk — ${diff}dk fazla`, 'info', 4000);
      else if (diff < -5) showToast(`${elapsed}dk'da bitti — tahminden hızlı! `, 'success', 4000);
      else showToast(`${elapsed}dk — tahmin neredeyse tam`, 'success', 4000);
    }, 200);
  }

  // MIT kutlaması: bugünün 3'ünü tamamladıysa
  let mitFullCelebration = false;
  if (t.done && t.mitDate === today()) {
    const mit = data.tasks.filter(x => x.mitDate === today());
    const mitDone = mit.filter(x => x.done).length;
    if (mit.length === 3 && mitDone === 3) {
      mitFullCelebration = true;
    }
  }

  if (justFinished && typeof recordDoneHour === 'function') recordDoneHour();

  save(); renderTasks();

  // Done dopamine — DOM güncellendikten sonra
  if (justFinished) {
    setTimeout(() => celebrateDone(id), 30);
    // Undo: yanlışlıkla bittiyse 5sn geri alma şansı
    const preview = (t.text || '').slice(0, 28);
    showUndoToast(`"${preview}" bitti`, () => {
      const tt = data.tasks.find(x => x.id === id);
      if (!tt) return;
      tt.done = false;
      tt.doneDate = oldDoneDate;
      tt.actualMin = oldActualMin;
      save(); renderTasks();
      showToast('Geri alındı', 'info', 2000);
    });
  }
  if (mitFullCelebration) {
    setTimeout(() => {
      // Daha büyük kutlama: birden çok konfeti
      const stats = document.querySelector('.stats') || document.querySelector('.mit-box');
      if (stats) {
        confettiBurst(stats);
        setTimeout(() => confettiBurst(stats), 200);
        setTimeout(() => confettiBurst(stats), 400);
      }
      showToast('Bugünün 3\'ünü TAMAMLADIN! Bonus her şey hediye. ', 'success', 7000);
    }, 500);
  }
}

function toggleSub(tid, idx) {
  const t = data.tasks.find(x => x.id === tid);
  t.subtasks[idx].done = !t.subtasks[idx].done;
  if (t.subtasks.every(s => s.done)) {
    if (!t.done && typeof recordDoneHour === 'function') recordDoneHour();
    t.done = true;
    t.doneDate = today();
  }
  save(); renderTasks();
}

function deleteTask(id) {
  const idx = data.tasks.findIndex(x => x.id === id);
  if (idx < 0) return;
  const taskCopy = JSON.parse(JSON.stringify(data.tasks[idx]));
  data.tasks.splice(idx, 1);
  save(); renderTasks();
  const preview = (taskCopy.text || '').slice(0, 30);
  showUndoToast(`"${preview}" silindi`, () => {
    data.tasks.splice(Math.min(idx, data.tasks.length), 0, taskCopy);
    save(); renderTasks();
    showToast('Geri yüklendi', 'success', 2000);
  });
}

async function postponeTask(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t || t.done) return;
  closePostponeMenu();
  const menu = document.createElement('div');
  menu.id = 'postponeMenu';
  menu.className = 'postpone-menu';
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0,10); })();
  const in3 = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0,10); })();
  const nextWeek = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0,10); })();
  menu.innerHTML = `
    <div class="postpone-title">"${escapeHtml((t.text||'').slice(0,40))}" ertele</div>
    <button onclick="applyPostpone(${id}, '${tomorrow}')">⏭️ Yarın</button>
    <button onclick="applyPostpone(${id}, '${in3}')">+3 gün</button>
    <button onclick="applyPostpone(${id}, '${nextWeek}')">Haftaya</button>
    <button onclick="applyPostponePick(${id})">Tarih seç</button>
    <button class="secondary" onclick="closePostponeMenu()">İptal</button>
  `;
  document.body.appendChild(menu);
  setTimeout(() => menu.classList.add('open'), 10);
  // Dışarı tıklayınca kapat
  setTimeout(() => {
    document.addEventListener('click', _postponeOutsideClick, { once: true });
  }, 100);
}

function _postponeOutsideClick(e) {
  if (!e.target.closest('#postponeMenu')) closePostponeMenu();
}

function closePostponeMenu() {
  const m = document.getElementById('postponeMenu');
  if (m) m.remove();
}

function applyPostpone(id, dateIso) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  const oldDue = t.due;
  t.due = dateIso;
  t.postponeCount = (t.postponeCount || 0) + 1; // erteleme farkındalığı için say
  // Yarına atıldıysa bugünün MIT'inden çıkar
  if (t.mitDate === today() && dateIso !== today()) t.mitDate = null;
  save();
  renderTasks();
  closePostponeMenu();
  const fmt = new Date(dateIso).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
  showToast(`${fmt}'e ertelendi · sorun değil `, 'success');
}

async function applyPostponePick(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  closePostponeMenu();
  const inp = await aidanPrompt('Tarih seç', 'YYYY-MM-DD veya "salı", "yarın":', t.due || '');
  if (inp === null) return;
  const parsed = parseDateInput(inp.trim());
  if (!parsed) { showToast('Tarih anlaşılamadı', 'warning'); return; }
  applyPostpone(id, parsed);
}

// Erteleme farkındalığı — çok ertelenen görev için nazik müdahale (utançsız)
function postponeNudge(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  closePostponeMenu();
  const menu = document.createElement('div');
  menu.id = 'postponeMenu';
  menu.className = 'postpone-menu';
  menu.innerHTML = `
    <div class="postpone-title">Bu görevi ${t.postponeCount} kez erteledin</div>
    <div style="font-size:0.82em;color:var(--text-muted);padding:2px 4px 10px;line-height:1.5;">Belki çok büyük ya da belirsiz geliyor. Utanç yok — birlikte kolaylaştıralım </div>
    <button onclick="nudgeSplit(${id})">Küçük adımlara böl</button>
    <button onclick="nudgeTry(${id})">Şimdi 2 dakika dene</button>
    <button class="secondary" onclick="nudgeDismiss(${id})">Tamam, böyle kalsın</button>
  `;
  document.body.appendChild(menu);
  setTimeout(() => menu.classList.add('open'), 10);
  setTimeout(() => document.addEventListener('click', _postponeOutsideClick, { once: true }), 100);
}
function nudgeSplit(id) { closePostponeMenu(); addSubtask(id); }
function nudgeTry(id) { closePostponeMenu(); startTaskNow(id, true); }
function nudgeDismiss(id) {
  const t = data.tasks.find(x => x.id === id);
  if (t) { t.nudgeDismissed = true; save(); renderTasks(); }
  closePostponeMenu();
  showToast('Tamam, baskı yok. Hazır olunca ', 'info', 2500);
}

async function addSubtask(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  const txt = await aidanPrompt('Alt görev ekle', `"${t.text}" için bir adım:`, '');
  if (txt === null) return;
  const trimmed = txt.trim();
  if (!trimmed) return;
  t.subtasks.push({ text: trimmed, done: false });
  // Eğer ana görev tamamlandıysa ve yeni subtask eklendi, ana görevi geri aç
  if (t.done) { t.done = false; t.doneDate = null; }
  save(); renderTasks();
  showToast('Alt görev eklendi', 'success');
}

async function deleteSubtask(tid, idx) {
  const t = data.tasks.find(x => x.id === tid);
  if (!t || !t.subtasks[idx]) return;
  t.subtasks.splice(idx, 1);
  save(); renderTasks();
}

async function editTask(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  const yeni = await aidanPrompt('Görev düzenle', 'Görev metni:', t.text);
  if (yeni === null) return; // iptal — notlar adımına da geçme
  const trimmed = yeni.trim();
  if (!trimmed) {
    if (confirm('Boş bıraktın. Görevi silmek mi istedin?')) {
      data.tasks = data.tasks.filter(x => x.id !== id);
      save(); renderTasks();
    }
    return;
  }
  let changed = false;
  if (trimmed !== t.text) { t.text = trimmed; changed = true; }

  // Notlar adımı (opsiyonel — boş bırakılabilir, iptal = atla)
  const notesIn = await aidanPrompt('Notlar (opsiyonel)', 'Detay, link, açıklama — boş bırakırsan not eklenmez', t.notes || '', true);
  if (notesIn !== null) {
    const n = notesIn.trim();
    const newNotes = n || null;
    if ((t.notes || null) !== newNotes) { t.notes = newNotes; changed = true; }
  }
  if (changed) { save(); renderTasks(); showToast('Görev güncellendi', 'success'); }
}

function toggleMit(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  const todayStr = today();
  if (t.mitDate === todayStr) {
    t.mitDate = null;
    showToast('Bugünün 3\'ünden çıkarıldı', 'info');
  } else {
    const currentMit = data.tasks.filter(x => x.mitDate === todayStr).length;
    if (currentMit >= 3) {
      showToast('Bugünün 3\'ü dolu! Önce birinin ★\'ını kaldır. 3 sınırı kasıtlı — odak için.', 'warning', 5000);
      return;
    }
    t.mitDate = todayStr;
    showToast('Bugünün 3\'üne eklendi', 'success');
  }
  save(); renderTasks();
}

function startTaskNow(id, quickTry) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  const mins = quickTry ? 2 : (t.estimateMin || 25);
  setTimer(mins, quickTry ? 1 : 5);  // resetTimer çağırır, currentFocusTaskId'i null'lar
  currentFocusTaskId = id;            // sonra set et
  focusStartTime = Date.now();
  const focusEl = document.getElementById('focusTask');
  focusEl.textContent = (quickTry ? 'Sadece 2 dakika dene — başlaman yeter: ' : '') + t.text;
  focusEl.classList.remove('empty');
  showTab('focus');
  setTimeout(() => startTimer(), 200);
  updateActiveTaskBanner();
  renderTasks();
  if (quickTry) showToast('2 dakika. Bitince devam edip etmeme kararını sonra ver.', 'info', 4000);
}

let currentFocusTaskId = null;
let focusStartTime = null;

