// ============================================================
// BORSA — acilis, render orkestrasyonu, ust bar, ayarlar
// ============================================================
// 14 Agu 2026: Aidan'da bu isi ui.js/tasks.js'teki showTab('stocks') dali
// yapiyordu. Burada tek sayfa var, yani "sekme acildi" olayi = acilisin
// kendisi. Cagri SIRASI Aidan'daki ile ayni tutuldu (once cizim, sonra ag).
// ============================================================

const PF_COMMENT_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/portfolio-comment';

// ============ TOPLU RENDER ============
// Buluttan veri gelince / cakisma cozulunce her seyi yeniden ciz.
// stocks.js'in render fonksiyonlari birbirini cagirmiyor — sira burada.
function renderAll() {
  try { renderStocks(); } catch (e) { console.warn('renderStocks', e); }
  try { renderTradeJournal(); } catch (e) { console.warn('renderTradeJournal', e); }
  try { renderScreener(); } catch (e) { console.warn('renderScreener', e); }
  try { renderBist100Compare(); } catch (e) { console.warn('renderBist100Compare', e); }
  tickHeader();
}

// ============ UST BAR: canli saat + piyasa durumu ============
function tickHeader() {
  const clk = document.getElementById('stocksModeClock');
  const dt = document.getElementById('stocksModeDate');
  if (!clk || !dt) return;
  const now = new Date();
  const HH = String(now.getHours()).padStart(2, '0');
  const MM = String(now.getMinutes()).padStart(2, '0');
  const SS = String(now.getSeconds()).padStart(2, '0');
  clk.textContent = `${HH}:${MM}:${SS}`;
  const dayName = now.toLocaleDateString('tr-TR', { weekday: 'long' });
  const wl = data.watchlist || [];
  const seen = new Set(wl.map(w => w.market || 'bist').filter(m => m === 'bist' || m === 'abd'));
  const chips = [];
  if (seen.has('bist')) chips.push({ label: 'BIST', open: isMarketOpen('bist', now) });
  if (seen.has('abd')) chips.push({ label: 'NYSE', open: isMarketOpen('abd', now) });
  if (!chips.length) chips.push({ label: 'BIST', open: isMarketOpen('bist', now) });
  const chipHtml = chips.map(c => `<span class="stocks-mode-mkt ${c.open ? 'open' : 'closed'}">${c.label} ${c.open ? '●' : '○'}</span>`).join('');
  dt.innerHTML = `<span>${escapeHtml(dayName)}</span>${chipHtml}`;
}

// ============ CANLI FIYAT ============
// Sayfa gizliyse (telefon kilitli / baska uygulama) AG ISTEGI ATMA — pil + kota.
let _autoTimer = null, _tick = 0, _headerTimer = null;

function startAutoRefresh() {
  stopAutoRefresh();
  _tick = 0;
  updateStocksMeta();
  _autoTimer = setInterval(() => {
    if (document.hidden) return;
    updateStocksMeta();                       // 20 sn'de bir etiket/rozet (ag YOK)
    _tick++;
    if (_tick % 3 === 0 && (data.watchlist || []).length) refreshStocks();   // 60 sn'de bir ag
  }, 20000);
  _headerTimer = setInterval(() => { if (!document.hidden) tickHeader(); }, 1000);
}

function stopAutoRefresh() {
  if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
  if (_headerTimer) { clearInterval(_headerTimer); _headerTimer = null; }
}

// Kilidi acinca / sekmeye donunce taze fiyat
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  tickHeader();
  if ((data.watchlist || []).length) refreshStocks();
});

// ============ AI PORTFOY YORUMU ============
// (Aidan'da tasks.js'teydi — borsaya ait oldugu icin buraya tasindi.)
function buildPortfolioFacts() {
  const holdings = (data.watchlist || []).filter(w => w.qty != null && w.qty > 0 && w.cost != null);
  if (!holdings.length) return null;
  const byCur = {};
  for (const w of holdings) {
    const cur = w.currency || 'TRY';
    const px = (w.price != null ? w.price : w.cost);
    const value = px * w.qty, cost = w.cost * w.qty;
    (byCur[cur] = byCur[cur] || { items: [], value: 0, cost: 0 });
    byCur[cur].items.push({ sym: w.symbol, value, dayPct: w.changePct, plPct: w.cost > 0 ? (px - w.cost) / w.cost * 100 : null });
    byCur[cur].value += value; byCur[cur].cost += cost;
  }
  const lines = [`Portföy: ${holdings.length} pozisyon, ${Object.keys(byCur).length} para birimi.`];
  for (const cur in byCur) {
    const g = byCur[cur], lbl = cur === 'TRY' ? 'TL' : cur;
    const plPct = g.cost > 0 ? (g.value - g.cost) / g.cost * 100 : 0;
    lines.push(`${lbl} tarafı: toplam değer ${Math.round(g.value)} ${lbl}, kar/zarar ${plPct >= 0 ? '+' : ''}${plPct.toFixed(1)}%.`);
    g.items.sort((a, b) => b.value - a.value).forEach(it => {
      const pct = g.value > 0 ? it.value / g.value * 100 : 0;
      const p = [`${lbl} portföyünün %${pct.toFixed(1)}'i`];
      if (it.dayPct != null) p.push(`bugün ${it.dayPct >= 0 ? '+' : ''}${it.dayPct.toFixed(1)}%`);
      if (it.plPct != null) p.push(`toplam ${it.plPct >= 0 ? '+' : ''}${it.plPct.toFixed(1)}%`);
      lines.push(`  - ${it.sym}: ${p.join(', ')}`);
    });
  }
  return lines.join('\n');
}

function openPfComment() {
  document.getElementById('pfCommentBody').textContent = 'Portföye bakılıyor…';
  document.getElementById('pfCommentModal').classList.add('active');
}
function closePfComment() { document.getElementById('pfCommentModal').classList.remove('active'); }

async function aiCommentPortfolio() {
  const facts = buildPortfolioFacts();
  if (!facts) { showToast('Önce pozisyon ekle (adet + maliyet)', 'warning', 3500); return; }
  if (!window._supa || !window._user) { showToast('AI için giriş gerekli — Ayarlar → giriş yap', 'warning', 4000); return; }
  openPfComment();
  try {
    const token = await getSupaToken();
    if (!token) throw new Error('oturum bulunamadı, tekrar giriş yap');
    const r = await fetch(PF_COMMENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ facts, instructions: aiInstructions() }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('sunucu hatası ' + r.status));
    document.getElementById('pfCommentBody').textContent = j.comment || 'Yorum üretilemedi.';
  } catch (e) {
    document.getElementById('pfCommentBody').textContent = 'Yorum alınamadı: ' + e.message;
  }
}

// ============ AYARLAR ============
function openSettings() {
  const t = document.getElementById('bxInstructions');
  if (t) { t.value = (data.settings && data.settings.instructions) || ''; onInstructionsInput(); }
  renderAuthBox();
  renderStorage();
  document.getElementById('settingsModal').classList.add('active');
}
function closeSettings() { document.getElementById('settingsModal').classList.remove('active'); }

function onInstructionsInput() {
  const t = document.getElementById('bxInstructions');
  const c = document.getElementById('bxInstrCount');
  if (t && c) c.textContent = t.value.length + ' / ' + AI_INSTR_MAX;
}

function saveInstructions() {
  const t = document.getElementById('bxInstructions');
  if (!t) return;
  data.settings.instructions = String(t.value || '').slice(0, AI_INSTR_MAX);
  save();
  showToast('Talimatlar kaydedildi', 'success', 2500);
}

function renderStorage() {
  const el = document.getElementById('bxStorage');
  if (!el) return;
  const rep = dataSizeReport();
  const top = rep.parts.filter(p => p.chars > 0).slice(0, 4)
    .map(p => escapeHtml(p.key) + ' ' + Math.round(p.chars / 1024) + ' KB').join(' · ');
  el.textContent = 'Depolama: %' + rep.pct + ' (' + Math.round(rep.chars / 1024) + ' KB)' + (top ? ' — ' + top : '');
}

// ============ YEDEK ============
function exportBorsaData() {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'borsa-yedek-' + today() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { showToast('Yedek oluşturulamadı: ' + e.message, 'error', 4000); }
}

function importBorsaData(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    let obj;
    try { obj = JSON.parse(rd.result); } catch (_) { showToast('Dosya okunamadı (geçerli JSON değil)', 'error', 4000); return; }
    if (!obj || typeof obj !== 'object') { showToast('Yedek boş', 'error', 3000); return; }
    if (!confirm('Yedekten yükle\n\n' + syncSummary(obj) + '\n\nŞu andaki veri bununla değiştirilecek. Devam?')) return;
    backupBeforeOverwrite('pre-import', data);   // geri alinabilir olsun
    data = obj;
    ensureShape();
    save();
    renderAll();
    showToast('Yedek yüklendi', 'success', 4000);
  };
  rd.readAsText(f);
  ev.target.value = '';
}

// ============ ACILIS ============
// Sira Aidan'daki ile ayni: once localStorage'dan CIZ (aninda gorunur),
// sonra ag (config -> supabase -> bulut verisi -> fiyatlar).
(function boot() {
  const start = () => {
    renderAll();
    startAutoRefresh();

    // Fiyatlar: son 15 sn icinde cekildiyse atla (cift istek olmasin)
    const wl = data.watchlist || [];
    const latest = Math.max(0, ...wl.map(w => w.fetchedAt || 0));
    if (wl.length && (Date.now() - latest > 15000)) refreshStocks();

    // Portfoy gunluk anlik goruntusu (grafik gecmisi icin)
    try { recordPortfolioSnapshot(); save(); } catch (e) { console.warn('snapshot', e); }

    // Kimlik + bulut — cizimi BEKLETMEZ
    autoConnectFromConfig();

    // Service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
