// ============================================================
// BORSA — paylasilan yardimcilar + veri katmani
// ============================================================
// 14 Agu 2026: borsa Aidan'dan ayrildi. Bu dosya, stocks.js'in Aidan
// cekirdeginden kullandigi 11 fonksiyonun tasinmis halidir. Davranis
// AYNEN korundu (kopyala-uyarla degil, birebir tasima) — cunku stocks.js'in
// 4466 satiri bu fonksiyonlarin tam olarak boyle davranmasina gore yazildi
// ve aylardir teste bagli.
//
// ⚠️ SATIR SONU: borsa/ klasorunde TUM dosyalar LF. (Aidan tarafinda
// styles.css LF, digerleri CRLF — iki proje karismasin diye burada tek kural.)
// ============================================================

// ---- HTML kacisi. stocks.js 89 yerde cagiriyor; ilk yuklenen dosyada,
//      ilk kullanimdan ONCE tanimli olmali (Aidan'da bu bir kez kaza sonucu
//      ui.js'te kalmis ve sessiz bomba olmustu).
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---- onclick="fn('...')" gibi IKI KATMANLI baglam icin.
// ⚠️ Burada escapeHtml TEK BASINA YETMEZ ve bu ince bir hata:
// escapeHtml tirnagi &#39; yapar, ama tarayici oznitelik degerini JS'e
// vermeden ONCE entity'leri cozer — &#39; tekrar ' olur ve JS dizesinden
// disari cikilir. Once JS dizesi icin kacir (\' ve \\), SONRA HTML icin.
// (14 Agu 2026 denetiminde bulundu: sembol adi setPosition/removeStock/
//  setStockAlarm/screenAddToWatchlist onclick'lerine HAM giriyordu. Sembol
//  kullanicidan ve portfoy gorseli OCR'indan — yani AI ciktisindan — gelir.)
function jsArg(s) {
  return escapeHtml(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

// ---- Yerel (Turkiye) tarih. toISOString() UTC dondurdugu icin 00:00-03:00
//      arasi bir onceki gunu veriyordu. Tum tarih uretimi buradan gecer.
function isoLocal(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function today() { return isoLocal(new Date()); }

// ---- Kullanici talimatlari: AI yorumlarina eklenir. Worker sistem
//      promptunun SONUNA koyar ve guvenlik kurallarini EZEMEZ (worker
//      tarafinda instructionsBlock icinde acikca yazili ve teste bagli).
const AI_INSTR_MAX = 2000;
function aiInstructions() {
  const t = (data && data.settings && data.settings.instructions) || '';
  return String(t).slice(0, AI_INSTR_MAX).trim();
}

// ============ VERI ============
// ⚠️ localStorage anahtari 'aidanborsa' — Aidan'in 'aidan' anahtarindan AYRI.
// Iki uygulama ayni tarayicida yan yana calisabilsin diye.
const LS_KEY = 'aidanborsa';

let data = {};
try { data = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (_) { data = {}; }
ensureShape();

function ensureShape() {
  data.watchlist        = data.watchlist        || [];
  data.trades           = data.trades           || [];
  data.portfolioHistory = data.portfolioHistory || [];
  data.screen           = data.screen           || null;
  data.settings         = data.settings         || {};
  if (!Array.isArray(data.watchlist)) data.watchlist = [];
  if (!Array.isArray(data.trades)) data.trades = [];
  if (!Array.isArray(data.portfolioHistory)) data.portfolioHistory = [];
}

// Depolama tavani: tarayici ~5 MB ve KARAKTER sayar (byte degil).
const LS_LIMIT_CHARS = 5 * 1024 * 1024;
const LS_WARN_PCT = 70;

function pruneOldData(aggressive) {
  const keepHist = aggressive ? 90 : 180;
  const cut = isoLocal(new Date(Date.now() - keepHist * 86400000));
  if (Array.isArray(data.portfolioHistory)) {
    data.portfolioHistory = data.portfolioHistory.filter(h => h && h.date >= cut);
  }
  // Kapali islemler: son 200 (acik islemlere ASLA dokunma — yasi ne olursa olsun)
  if (Array.isArray(data.trades)) {
    const open = data.trades.filter(t => t && t.status !== 'closed');
    const closed = data.trades.filter(t => t && t.status === 'closed')
      .sort((a, b) => (b.closed || 0) - (a.closed || 0))
      .slice(0, aggressive ? 100 : 200);
    data.trades = open.concat(closed);
  }
}

function saveLocal() {
  let json;
  try { json = JSON.stringify(data); } catch (e) { console.warn('serialize', e); return; }
  try {
    localStorage.setItem(LS_KEY, json);
  } catch (e) {
    // Kota doldu: once agresif buda, sonra TEK tekrar dene. Istisna disari sizmaz.
    try {
      pruneOldData(true);
      localStorage.setItem(LS_KEY, JSON.stringify(data));
      showToast('Depolama doldu — eski kayitlar budandi', 'warning', 5000);
      return;
    } catch (e2) {
      showToast('Depolama dolu, kaydedilemedi. Ayarlar > Veri > Yedek indir.', 'error', 7000);
      return;
    }
  }
  checkDataSize(json);
}

let _sizeWarned = false;
function checkDataSize(json) {
  const pct = Math.round((json.length / LS_LIMIT_CHARS) * 100);
  if (pct < LS_WARN_PCT || _sizeWarned) return;
  _sizeWarned = true;   // oturumda tek uyari — ADHD'de tekrar eden bildirim korlestiriyor
  showToast('Depolama %' + pct + ' dolu', 'warning', 5000);
}

function dataSizeReport() {
  let json = '{}';
  try { json = JSON.stringify(data); } catch (_) {}
  const parts = Object.keys(data).map(k => {
    let n = 0;
    try { n = JSON.stringify(data[k]).length; } catch (_) {}
    return { key: k, chars: n };
  }).sort((a, b) => b.chars - a.chars);
  return { chars: json.length, pct: Math.round((json.length / LS_LIMIT_CHARS) * 100), parts };
}

// stocks.js'in her degisiklikten sonra cagirdigi tek fonksiyon.
function save() {
  saveLocal();
  markLocalDirty();   // sync.js — bulut henuz yazilmadi isareti
  schedulePush();     // sync.js — 1.5 sn sonra buluta yaz
}

// ============ TOAST ============
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  const close = () => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  };
  setTimeout(close, duration);
  toast.addEventListener('click', close);
}

// ============ PROMPT MODALI ============
let _inputModalResolve = null;

function aidanPrompt(title, label, defaultValue = '', multiline = false) {
  return new Promise(resolve => {
    document.getElementById('inputModalTitle').textContent = title;
    document.getElementById('inputModalLabel').textContent = label;
    const input = document.getElementById('inputModalInput');
    const textarea = document.getElementById('inputModalTextarea');
    if (multiline) {
      input.style.display = 'none';
      textarea.style.display = 'block';
      textarea.value = defaultValue;
      setTimeout(() => textarea.focus(), 100);
    } else {
      input.style.display = 'block';
      textarea.style.display = 'none';
      input.value = defaultValue;
      setTimeout(() => { input.focus(); input.select(); }, 100);
    }
    _inputModalResolve = resolve;
    document.getElementById('inputModal').classList.add('active');
  });
}

function resolveInputModal() {
  const input = document.getElementById('inputModalInput');
  const textarea = document.getElementById('inputModalTextarea');
  const val = (textarea.style.display !== 'none' ? textarea.value : input.value);
  document.getElementById('inputModal').classList.remove('active');
  if (_inputModalResolve) _inputModalResolve(val);
  _inputModalResolve = null;
}

function cancelInputModal() {
  document.getElementById('inputModal').classList.remove('active');
  if (_inputModalResolve) _inputModalResolve(null);
  _inputModalResolve = null;
}

document.addEventListener('keydown', e => {
  const im = document.getElementById('inputModal');
  if (!im || !im.classList.contains('active')) return;
  if (e.key === 'Enter') {
    const textarea = document.getElementById('inputModalTextarea');
    if (textarea.style.display !== 'none' && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    resolveInputModal();
  } else if (e.key === 'Escape') {
    cancelInputModal();
  }
});

// ============ GRAFIK YARDIMCILARI ============
// SVG donut — stroke-dasharray teknigi (segments: [{val,color}])
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

// Basit line chart (portfoy gecmisi — TA overlay yok)
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

// Basit SVG sparkline — son >= ilk ise yesil, degilse kirmizi
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

// Secilen fotografi canvas ile kucult, jpeg base64 dondur — yukleme kucuk kalsin
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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('gorsel acilamadi')); };
    img.src = url;
  });
}
