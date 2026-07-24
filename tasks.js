// ============ TAB ============
function showTab(name, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(name).classList.add('active');
  if (btn) btn.classList.add('active');
  else { const _dt = document.querySelector(`[data-tab="${name}"]`); if (_dt) _dt.classList.add('active'); }
  // Borsa modu: borsa sekmesi açıkken body.stocks-mode → tam ekran terminal hissi
  document.body.classList.toggle('stocks-mode', name === 'stocks');
  if (name === 'stocks') tickStocksModeHeader();
  // Sekme değişiminde hamburger drawer'ı kapat (açık kalmasın)
  const _sm = document.getElementById('stocksMenu');
  if (_sm) { _sm.classList.remove('open'); document.getElementById('stocksMenuBackdrop').classList.remove('open'); }
  // Global app-bar başlığı + drawer aktif vurgusu + global drawer'ı kapat
  syncAppHeader(name);
  toggleAppMenu(false);
  if (name === 'settings') {
    updateEstimateStats();
    renderNotifSettings();
    renderMuteState();
    renderFixedReminders();
    renderCountdownManage();
    loadInviteSection();
    renderCalendarSync();
    // Yedek details açıldığında otomatik yükle (bir kez bağlanır)
    const bd = document.getElementById('backupDetails');
    if (bd && !bd._hooked) {
      bd._hooked = true;
      bd.addEventListener('toggle', () => { if (bd.open) loadBackupList(); });
    }
  }
  if (name === 'tasks') { renderCountdowns(); renderSchool(); if (typeof renderDailyScore === 'function') renderDailyScore(); }
  if (name === 'chat') { renderChatMessages(); setTimeout(() => { const ci = document.getElementById('chatInput'); if (ci) ci.focus(); }, 60); }
  if (name === 'plan') renderDayPlan();
  if (name === 'diet') { _dietDate = null; renderDiet(); }
  // Borsa sekmesinden çıkınca canlı güncellemeyi durdur (batarya/kota)
  if (name !== 'stocks') stopStockAutoRefresh();
  if (name === 'stocks') {
    renderStocks();
    // Sekme açılınca taze fiyat çek (son 15 sn'de çekildiyse atla — çift istek olmasın)
    const wl = data.watchlist || [];
    const latest = Math.max(0, ...wl.map(w => w.fetchedAt || 0));
    if (wl.length && (Date.now() - latest > 15000)) refreshStocks();
    startStockAutoRefresh(); // sekme açıkken gün içi canlı güncelle
  }
}

// Borsa sekmesi açıkken gün içi otomatik fiyat güncelleme (60 sn).
// Sayfa gizliyse (telefon kilitli / başka uygulama) atlar — pil + kota dostu.
let _stockAutoTimer = null, _stockTick = 0;
function startStockAutoRefresh() {
  stopStockAutoRefresh();
  _stockTick = 0;
  updateStocksMeta();                                  // anında rozet/etiket
  tickStocksModeHeader();                              // borsa modu üst başlığı (saat + piyasa durumu)
  _stockAutoTimer = setInterval(() => {
    if (document.hidden) return;                       // sayfa görünmüyorsa boşa çekme
    if (!document.getElementById('stocks').classList.contains('active')) { stopStockAutoRefresh(); return; }
    updateStocksMeta();                                // her 20sn etiket+rozet canlı (ağ yok)
    _stockTick++;
    if (_stockTick % 3 === 0 && (data.watchlist || []).length) refreshStocks(); // 60sn'de bir ağ
  }, 20000);
  // Borsa modu saat — saniyelik canlı, sadece borsa sekmesi açıkken çalışır
  _stocksHeaderTimer = setInterval(() => {
    if (document.hidden) return;
    if (!document.body.classList.contains('stocks-mode')) { clearInterval(_stocksHeaderTimer); _stocksHeaderTimer = null; return; }
    tickStocksModeHeader();
  }, 1000);
}
function stopStockAutoRefresh() {
  if (_stockAutoTimer) { clearInterval(_stockAutoTimer); _stockAutoTimer = null; }
  if (_stocksHeaderTimer) { clearInterval(_stocksHeaderTimer); _stocksHeaderTimer = null; }
}

// Borsa modu hamburger menüsü — drawer aç/kapa + sekmeye çıkış
function toggleStocksMenu(open) {
  const m = document.getElementById('stocksMenu');
  const bd = document.getElementById('stocksMenuBackdrop');
  if (!m || !bd) return;
  const want = open !== undefined ? open : !m.classList.contains('open');
  m.classList.toggle('open', want);
  bd.classList.toggle('open', want);
}
function exitStocksTo(name) {
  toggleStocksMenu(false);
  showTab(name, document.querySelector(`[data-tab="${name}"]`));
}

// ===== Global app-bar (her sekme borsa gibi tam ekran) =====
const APP_TAB_TITLES = { tasks: 'Görevler', plan: 'Plan', focus: 'Odak', stocks: 'Borsa', diet: 'Diyet', chat: "Aidan'a sor", settings: 'Ayarlar' };
// Global drawer'dan sekme seçimi
function navTo(name) {
  toggleAppMenu(false);
  showTab(name, document.querySelector(`[data-tab="${name}"]`));
}
// Global hamburger drawer aç/kapa
function toggleAppMenu(open) {
  const m = document.getElementById('appMenu');
  const bd = document.getElementById('appMenuBackdrop');
  if (!m || !bd) return;
  const want = open !== undefined ? open : !m.classList.contains('open');
  m.classList.toggle('open', want);
  bd.classList.toggle('open', want);
}
// Üst başlığı ve drawer'daki aktif sekmeyi güncelle
function syncAppHeader(name) {
  const t = document.getElementById('appHeaderTitle');
  if (t) t.textContent = (APP_TAB_TITLES[name] || 'Aidan');
  document.querySelectorAll('#appMenu button[data-nav]').forEach(b =>
    b.classList.toggle('active', b.dataset.nav === name));
}
// App-bar saati — saniyelik canlı (borsa modunda kendi saati var, orada atla)
function tickAppHeaderClock() {
  const el = document.getElementById('appHeaderClock');
  if (!el) return;
  const n = new Date();
  el.textContent = String(n.getHours()).padStart(2,'0') + ':' +
                   String(n.getMinutes()).padStart(2,'0') + ':' +
                   String(n.getSeconds()).padStart(2,'0');
}
// Tam-ekran modunu aç + ilk başlığı/sayacı kur
document.body.classList.add('app-mode');
syncAppHeader('tasks');
tickAppHeaderClock();
setInterval(() => { if (!document.hidden) tickAppHeaderClock(); }, 1000);

// Borsa modu üst başlığı — saniyelik saat + bugünün adı + BIST/ABD durumu kompakt rozeti
let _stocksHeaderTimer = null;
function tickStocksModeHeader() {
  const clk = document.getElementById('stocksModeClock');
  const dt = document.getElementById('stocksModeDate');
  if (!clk || !dt) return;
  const now = new Date();
  const HH = String(now.getHours()).padStart(2, '0');
  const MM = String(now.getMinutes()).padStart(2, '0');
  const SS = String(now.getSeconds()).padStart(2, '0');
  clk.textContent = `${HH}:${MM}:${SS}`;
  const dayName = now.toLocaleDateString('tr-TR', { weekday: 'long' });
  // Watchlist'teki tek tek piyasaları izle — BIST/ABD aktif mi
  const wl = data.watchlist || [];
  const seen = new Set(wl.map(w => w.market || 'bist').filter(m => m === 'bist' || m === 'abd'));
  const chips = [];
  if (seen.has('bist')) chips.push({ label: 'BIST', open: isMarketOpen('bist', now) });
  if (seen.has('abd'))  chips.push({ label: 'NYSE', open: isMarketOpen('abd', now) });
  if (!chips.length) chips.push({ label: 'BIST', open: isMarketOpen('bist', now) });
  const chipHtml = chips.map(c => `<span class="stocks-mode-mkt ${c.open ? 'open' : 'closed'}">${c.label} ${c.open ? '●' : '○'}</span>`).join('');
  dt.innerHTML = `<span>${escapeHtml(dayName)}</span>${chipHtml}`;
}
// Sayfa tekrar görünür olunca (kilidi açınca): borsayı tazele + pomodoro'yu gerçek zamana eşitle
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (document.getElementById('stocks').classList.contains('active') && (data.watchlist || []).length) refreshStocks();
  if (running) tickTimer(); // arka planda interval durmuş olabilir → kalan süreyi anında düzelt
});

// ============ ZAMAN TAHMİN DOĞRULUĞU (ADHD self-awareness) ============
function updateEstimateStats() {
  const el = document.getElementById('estimateStats');
  if (!el) return;
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dones = data.tasks.filter(t => t.done && t.doneDate && t.doneDate >= thirtyAgo);
  const withBoth = dones.filter(t => t.estimateMin && t.actualMin);

  if (withBoth.length < 3) {
    el.innerHTML = `Henüz yeterli veri yok (${withBoth.length}/3 görev ölçülmüş).<br>
      Odak sekmesinde pomodoro ile görev yaptıkça Aidan tahmin ↔ gerçek farkını ölçer.`;
    return;
  }

  const totalEst = withBoth.reduce((s, t) => s + t.estimateMin, 0);
  const totalAct = withBoth.reduce((s, t) => s + t.actualMin, 0);
  const avgEst = Math.round(totalEst / withBoth.length);
  const avgAct = Math.round(totalAct / withBoth.length);
  const ratio = (totalAct / totalEst).toFixed(1);

  const accurate = withBoth.filter(t => {
    const tolerance = Math.max(5, t.estimateMin * 0.2);
    return Math.abs(t.actualMin - t.estimateMin) <= tolerance;
  }).length;
  const accuratePct = Math.round((accurate / withBoth.length) * 100);

  let comment;
  if (ratio >= 1.5) comment = '⏰ Görevler tahminden uzun sürüyor — daha geniş tahmin etmeyi dene.';
  else if (ratio <= 0.7) comment = 'Hızlısın — tahminlerini biraz artırabilirsin.';
  else comment = 'Tahminlerin gerçeğe yakın — iyi gidiyorsun.';

  el.innerHTML = `
    <b>${withBoth.length}</b> görev ölçülmüş — ortalama tahmin <b>${avgEst}dk</b> → gerçek <b>${avgAct}dk</b> (<b>${ratio}x</b>).<br>
    Tahminlerinin <b>%${accuratePct}</b>'ı doğru (±20% içinde).<br>
    ${comment}
  `;
}

// ============ GÖREV ŞABLONLARI ============
// Ortak görev objesi üreteci — şablonlar ve diğer ekleme noktaları için
function makeTask(opts = {}) {
  return {
    id: opts.id || Date.now(),
    text: opts.text || '',
    done: false, doneDate: null,
    subtasks: opts.subtasks || [],
    created: timeStr(),
    priority: opts.priority || 'normal',
    category: opts.category || null,
    due: opts.due || null,
    estimateMin: opts.estimateMin || null,
    actualMin: null,
    repeat: opts.repeat || null,
    reminderTime: opts.reminderTime || null,
    lastReminded: null,
    mitDate: null,
    seriesId: null, seriesName: null, seriesIndex: null, seriesTotal: null, notes: null
  };
}

const BUILTIN_TEMPLATES = [
  { id: 'tpl-sinav', name: 'Sınav haftası', emoji: '', builtin: true, tasks: [
    { text: 'Konuları listele ve böl', category: 'odev', estimateMin: 15 },
    { text: 'Özet/not çıkar', category: 'odev', estimateMin: 45 },
    { text: 'Soru çöz', category: 'odev', estimateMin: 60 },
    { text: 'Deneme sınavı yap', category: 'odev', estimateMin: 90 },
    { text: 'Yanlışları gözden geçir', category: 'odev', estimateMin: 30 },
  ]},
  { id: 'tpl-odev-oturum', name: 'Ödev oturumu', emoji: '', builtin: true, tasks: [
    { text: 'Telefonu başka odaya koy', category: 'kisisel', estimateMin: 1 },
    { text: '25 dk odaklan (pomodoro)', category: 'odev', estimateMin: 25 },
    { text: '5 dk mola — su iç, uzan', category: 'kisisel', estimateMin: 5 },
  ]},
  { id: 'tpl-ev', name: 'Ev toparlama', emoji: '', builtin: true, tasks: [
    { text: 'Bulaşıkları yık', category: 'ev', estimateMin: 15 },
    { text: 'Çamaşır koy', category: 'ev', estimateMin: 5 },
    { text: 'Odayı topla', category: 'ev', estimateMin: 15 },
    { text: 'Çöpü at', category: 'ev', estimateMin: 5 },
  ]},
  { id: 'tpl-sabah', name: 'Sabah başlangıç', emoji: '', builtin: true, tasks: [
    { text: 'Su iç + kahvaltı', category: 'kisisel', estimateMin: 15 },
    { text: 'Bugünün 3\'ünü seç (MIT)', category: 'kisisel', estimateMin: 5 },
    { text: 'En zor işi ilk yap', category: 'kisisel', estimateMin: 30 },
  ]},
];

function getAllTemplates() {
  return [...BUILTIN_TEMPLATES, ...(data.templates || [])];
}

function openTemplateModal() {
  renderTemplateList();
  document.getElementById('templateModal').classList.add('active');
}
function closeTemplateModal() {
  document.getElementById('templateModal').classList.remove('active');
}

function renderTemplateList() {
  const el = document.getElementById('templateList');
  el.innerHTML = getAllTemplates().map(tpl => {
    const delBtn = tpl.builtin ? '' :
      `<button class="tpl-del" onclick="event.stopPropagation(); deleteTemplate('${tpl.id}')" title="Şablonu sil"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>`;
    return `
      <div class="tpl-card" onclick="applyTemplate('${tpl.id}')">
        <span class="tpl-emoji">${tpl.emoji || ''}</span>
        <div class="tpl-info">
          <div class="tpl-name">${escapeHtml(tpl.name)}</div>
          <div class="tpl-sub">${tpl.tasks.length} görev${tpl.builtin ? '' : ' · senin şablonun'}</div>
        </div>
        ${delBtn}
      </div>`;
  }).join('');
}

function applyTemplate(tplId) {
  const tpl = getAllTemplates().find(t => t.id === tplId);
  if (!tpl) return;
  const base = Date.now();
  // Sırayı koru: ters çevirip unshift → ilk görev en üstte kalır
  tpl.tasks.slice().reverse().forEach((tt, i) => {
    data.tasks.unshift(makeTask({ ...tt, id: base + i }));
  });
  save(); renderTasks();
  closeTemplateModal();
  showToast(`"${tpl.name}" — ${tpl.tasks.length} görev eklendi`, 'success', 3000);
}

async function createTemplate() {
  const name = await aidanPrompt('Yeni şablon', 'Şablona bir isim ver (örn "Spor günü")', '');
  if (name === null || !name.trim()) return;
  const lines = await aidanPrompt(`"${name.trim()}" şablonu`, 'Her satıra bir görev yaz:', '', true);
  if (lines === null) return;
  const tasks = lines.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ text }));
  if (tasks.length === 0) { showToast('En az bir görev yaz', 'warning'); return; }
  data.templates.push({ id: 'tpl-user-' + Date.now(), name: name.trim(), emoji: '', builtin: false, tasks });
  save();
  renderTemplateList();
  showToast(`"${name.trim()}" kaydedildi (${tasks.length} görev)`, 'success', 3000);
}

function deleteTemplate(tplId) {
  data.templates = data.templates.filter(t => t.id !== tplId);
  save();
  renderTemplateList();
  showToast('Şablon silindi', 'info', 2000);
}

// ============ GÖREVLER ============
// Hızlı yakalama — sadece metin, sonra düşün
function quickCaptureKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    quickCaptureSubmit();
  } else if (e.key === 'Escape') {
    document.getElementById('quickCapture').value = '';
    document.getElementById('quickCapture').blur();
  }
}

// Web Speech API — tarayıcıda Türkçe sesli giriş (iOS Safari 14.5+, Chrome, Edge)
let _speechRec = null;
function quickCaptureMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('Bu tarayıcı sesli girişi desteklemiyor. Safari/Chrome güncel olmalı.', 'warning', 4500);
    return;
  }
  const inp = document.getElementById('quickCapture');
  const btn = document.getElementById('quickCaptureMic');
  const origPlaceholder = inp.placeholder;
  // Zaten kayıt yapıyorsa: durdur
  if (_speechRec) {
    try { _speechRec.stop(); } catch (e) {}
    return;
  }
  const rec = new SR();
  rec.lang = 'tr-TR';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  _speechRec = rec;

  const cleanup = () => {
    if (btn) btn.classList.remove('recording');
    inp.placeholder = origPlaceholder;
    _speechRec = null;
  };

  rec.onstart = () => {
    if (btn) btn.classList.add('recording');
    inp.placeholder = 'Dinliyorum... (tekrar bas: durdur)';
    inp.value = '';
    inp.focus();
  };
  rec.onresult = (e) => {
    let final = '', interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    inp.value = (final || interim).trim();
  };
  rec.onerror = (e) => {
    cleanup();
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      showToast('Mikrofon izni reddedildi. Site ayarlarından açabilirsin.', 'warning', 4500);
    } else if (e.error === 'no-speech') {
      showToast('Ses duyulmadı, tekrar dene', 'info', 2500);
    } else if (e.error !== 'aborted') {
      showToast('Sesli giriş hatası: ' + e.error, 'warning', 3500);
    }
  };
  rec.onend = () => {
    cleanup();
    // Otomatik göndermiyoruz — Salim Enter ile onaylasın (yanlış kelime olabilir)
    if (inp.value.trim()) inp.focus();
  };

  try {
    rec.start();
  } catch (err) {
    cleanup();
    showToast('Mikrofon başlatılamadı: ' + (err.message || err), 'error', 3500);
  }
}

// PWA AI — quick capture metnini Worker /ai'ye yollar, AI akıllı görev(ler) ekler (tarih/kategori/seri çıkarır)
const AI_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/ai';
async function quickCaptureAI() {
  const inp = document.getElementById('quickCapture');
  const text = inp.value.trim();
  if (!text) { showToast('Önce yaz, sonra bas — örn "salı matematik sınavı, 3 güne böl"', 'info', 4000); return; }
  if (!window._supa || !window._user) {
    showToast('AI için bulut girişi gerekli — Ayarlar → giriş yap', 'warning', 4500);
    return;
  }
  const btn = document.getElementById('quickCaptureAI');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum bulunamadı, tekrar giriş yap');
    const r = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ text }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('sunucu hatası ' + r.status));
    inp.value = '';
    showToast(j.reply || 'Tamam', 'success', 5500);
    // Worker Supabase'e yazdıysa realtime sync getirir; garanti için kısa süre sonra pull + render
    if (j.changed) {
      setTimeout(() => { if (typeof manualPull === 'function') manualPull(); else renderTasks(); }, 700);
    }
  } catch (e) {
    showToast('AI hatası: ' + e.message, 'error', 4500);
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

// AI görev bölücü — var olan görevi küçük adımlara böler (Worker /split → alt görev)
const SPLIT_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/split';
async function aiSplitTask(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  if (!window._supa || !window._user) {
    showToast('AI için bulut girişi gerekli — Ayarlar → giriş yap', 'warning', 4000);
    return;
  }
  showToast('Adımlara bölünüyor…', 'info', 2500);
  try {
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum bulunamadı, tekrar giriş yap');
    const r = await fetch(SPLIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ text: t.text }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('sunucu hatası ' + r.status));
    const steps = (j.steps || []).map(s => (s || '').trim()).filter(Boolean);
    if (!steps.length) { showToast('AI adım üretemedi — elle ekleyebilirsin', 'warning', 4000); return; }
    t.subtasks = t.subtasks || [];
    steps.forEach(s => t.subtasks.push({ text: s, done: false }));
    if (t.done) { t.done = false; t.doneDate = null; } // adım eklenince görev yeniden aktif
    save(); renderTasks();
    showToast(`${steps.length} adıma bölündü`, 'success', 3000);
  } catch (e) {
    showToast('Bölünemedi: ' + e.message, 'error', 4000);
  }
}

// ===== Gün Planlayıcı =====
const PLAN_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/plan';
let _editingBlockId = null;

// Saat (HH:MM) ↔ dakika çevirici yardımcıları
function hmToMin(hm) { const [h, m] = (hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function minToHM(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; const h = Math.floor(min / 60), m = min % 60; return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
function nowHM() { const n = new Date(); return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); }

// Uyanık pencere: kayıtlıysa onu, değilse şimdi(30dk'ya yuvarlı, min 08:00) → 22:00
function planWindow() {
  const dp = data.dayPlan || {};
  const st = data.settings || {};
  // Pencere ayarlarda KALICI tutulur — dayPlan her gun sifirlaniyor, worker'in
  // sabah otomatik plani da bu ayari okuyor (worker: st.planFrom / st.planTo).
  let from = dp.windowFrom || st.planFrom, to = dp.windowTo || st.planTo;
  if (!from) { const nm = hmToMin(nowHM()); from = minToHM(Math.max(8 * 60, Math.ceil(nm / 30) * 30)); }
  if (!to) to = '22:00';
  return { from, to };
}
function savePlanWindow() {
  const f = document.getElementById('planFrom').value || null;
  const t = document.getElementById('planTo').value || null;
  data.dayPlan.windowFrom = f;
  data.dayPlan.windowTo = t;
  // Ayarlara da yaz — yarin sabah worker otomatik planlarken bu pencereyi kullanir
  data.settings = data.settings || {};
  data.settings.planFrom = f;
  data.settings.planTo = t;
  save();
}

// Plan yarin icin de kurulabilir (aksam 21:00 cron'u yarini planlar).
// Bu yuzden dayPlan sadece bugun VE yarin disindaki tarihlerde sifirlanir.
function tomorrowStr() {
  const d = new Date(today() + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function planIsTomorrow() { return (data.dayPlan || {}).date === tomorrowStr(); }

// Gecikmis bloklar: baslangici gecmis, bitmemis, sabit olmayan (bugunun planinda)
function latePlanBlocks() {
  if (planIsTomorrow()) return [];
  const nowM = hmToMin(nowHM());
  return (data.dayPlan.blocks || []).filter(b => b && !b.done && b.kind !== 'fixed' && hmToMin(b.end) <= nowM);
}

function renderDayPlan() {
  const dpDate = (data.dayPlan || {}).date;
  if (dpDate !== today() && dpDate !== tomorrowStr()) {
    archivePlanDay(data.dayPlan);   // gun degisti — eski plani ogrenme verisine yaz
    data.dayPlan = { date: today(), blocks: [] };
    save();
  }
  renderPlanInsight();
  const isTom = planIsTomorrow();
  const sub = document.getElementById('planSub');
  if (sub) sub.textContent = isTom
    ? 'Yarının planı hazır — bu gece düzeltebilirsin, sabah seni bekliyor olacak.'
    : 'Günü saat saat bloklara böl — zaman körlüğüne karşı.';
  const w = planWindow();
  const pf = document.getElementById('planFrom'), pt = document.getElementById('planTo');
  if (pf) pf.value = w.from;
  if (pt) pt.value = w.to;
  const tl = document.getElementById('planTimeline');
  if (!tl) return;
  const blocks = (data.dayPlan.blocks || []).slice().sort((a, b) => hmToMin(a.start) - hmToMin(b.start));
  if (!blocks.length) {
    tl.innerHTML = '<div class="plan-empty">Günün henüz boş.<br>Görevlerin varsa <b>Günümü planla</b>\'ya bas — Aidan saat saat doldursun.<br>Ya da <b>＋ Blok ekle</b> ile elle kur.</div>';
    return;
  }
  const nowM = isTom ? -1 : hmToMin(nowHM());
  let html = '';

  // Gecikme uyarisi — plan bozuldugunda terk edilmesin diye tek tikla toparlama
  const late = latePlanBlocks();
  if (late.length) {
    html += `<div class="plan-late">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <div class="pl-body"><b>${late.length} blok gecikti</b><span>Plan bozuldu diye günü bırakma — kalanı şu andan itibaren yeniden dizeyim.</span></div>
      <button class="pl-btn" onclick="shiftPlanRemaining()">Yeniden diz</button>
    </div>`;
  }

  blocks.forEach((b, i) => {
    const s = hmToMin(b.start), e = hmToMin(b.end);
    const isNow = nowM >= s && nowM < e && !b.done;
    const isLate = !isTom && !b.done && b.kind !== 'fixed' && e <= nowM;
    if (i > 0) { const gap = s - hmToMin(blocks[i - 1].end); if (gap >= 15) html += `<div class="plan-gap">⌄ ${gap} dk boşluk</div>`; }
    const kind = b.kind || 'task';
    const linked = b.taskId ? (data.tasks || []).find(t => t.id === b.taskId) : null;
    const dur = e > s ? (e - s) : 0;
    html += `<div class="plan-block kind-${kind} ${isNow ? 'now' : ''} ${b.done ? 'done' : ''} ${isLate ? 'late' : ''}" id="planBlock-${b.id}">
      <button class="pb-check" onclick="togglePlanBlock(${b.id})" title="Bitti olarak işaretle">${b.done ? '✓' : ''}</button>
      <div class="pb-time"><span>${b.start}</span><span class="pb-end">${b.end}</span></div>
      <div class="pb-body">
        <div class="pb-label">${escapeHtml(b.label || '(boş)')}</div>
        <div class="pb-meta">${isNow ? '<span class="pb-now-tag">● şu an</span>' : ''}${isLate ? '<span class="pb-late-tag">gecikti</span>' : ''}<span>${dur} dk</span>${b.fixedId ? '<span>sabit program</span>' : (linked ? '<span>görev</span>' : '')}</div>
      </div>
      <div class="pb-actions">
        ${kind === 'task' && linked ? `<button onclick="focusPlanBlock(${b.taskId})" title="Bu göreve odaklan"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg></button>` : ''}
        <button onclick="editPlanBlock(${b.id})" title="Düzenle"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
        <button onclick="deletePlanBlock(${b.id})" title="Sil"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
      </div>
    </div>`;
  });
  tl.innerHTML = html;
}

function fillPlanTaskSelect(sel) {
  const open = (data.tasks || []).filter(t => !t.done);
  sel.innerHTML = '<option value="">— görev bağlama —</option>' +
    open.map(t => `<option value="${t.id}">${escapeHtml(t.text).slice(0, 50)}</option>`).join('');
}
function addPlanBlock() {
  _editingBlockId = null;
  document.getElementById('planBlockTitle').textContent = 'Blok ekle';
  document.getElementById('pbmLabel').value = '';
  const sel = document.getElementById('pbmTask'); fillPlanTaskSelect(sel); sel.value = '';
  const blocks = (data.dayPlan.blocks || []).slice().sort((a, b) => hmToMin(a.start) - hmToMin(b.start));
  const start = blocks.length ? blocks[blocks.length - 1].end : planWindow().from;
  document.getElementById('pbmStart').value = start;
  document.getElementById('pbmEnd').value = minToHM(hmToMin(start) + 30);
  document.getElementById('pbmKind').value = 'task';
  document.getElementById('planBlockModal').classList.add('active');
}
function editPlanBlock(id) {
  const b = (data.dayPlan.blocks || []).find(x => x.id === id);
  if (!b) return;
  _editingBlockId = id;
  document.getElementById('planBlockTitle').textContent = 'Bloğu düzenle';
  document.getElementById('pbmLabel').value = b.label || '';
  const sel = document.getElementById('pbmTask'); fillPlanTaskSelect(sel); sel.value = b.taskId || '';
  document.getElementById('pbmStart').value = b.start;
  document.getElementById('pbmEnd').value = b.end;
  document.getElementById('pbmKind').value = b.kind || 'task';
  document.getElementById('planBlockModal').classList.add('active');
}
// Görev seçilince başlığı + tahmini süreden bitiş saatini otomatik doldur
function pbmTaskChange() {
  const id = Number(document.getElementById('pbmTask').value);
  if (!id) return;
  const t = (data.tasks || []).find(x => x.id === id);
  if (!t) return;
  document.getElementById('pbmLabel').value = t.text;
  document.getElementById('pbmKind').value = 'task';
  if (t.estimateMin) {
    const s = hmToMin(document.getElementById('pbmStart').value);
    document.getElementById('pbmEnd').value = minToHM(s + t.estimateMin);
  }
}
function savePlanBlock() {
  const label = document.getElementById('pbmLabel').value.trim();
  const start = document.getElementById('pbmStart').value;
  const end = document.getElementById('pbmEnd').value;
  const kind = document.getElementById('pbmKind').value;
  const taskId = Number(document.getElementById('pbmTask').value) || null;
  if (!label) { showToast('Bir başlık yaz', 'warning'); return; }
  if (!start || !end) { showToast('Saatleri gir', 'warning'); return; }
  if (hmToMin(end) <= hmToMin(start)) { showToast('Bitiş başlangıçtan sonra olmalı', 'warning'); return; }
  if (_editingBlockId) {
    const b = data.dayPlan.blocks.find(x => x.id === _editingBlockId);
    if (b) { b.label = label; b.start = start; b.end = end; b.kind = kind; b.taskId = taskId; }
  } else {
    data.dayPlan.blocks.push({ id: Date.now() + Math.floor(Math.random() * 1000), label, start, end, kind, taskId, done: false });
  }
  save(); closePlanBlock(); renderDayPlan();
}
function closePlanBlock() { document.getElementById('planBlockModal').classList.remove('active'); _editingBlockId = null; }
function deletePlanBlock(id) { data.dayPlan.blocks = (data.dayPlan.blocks || []).filter(x => x.id !== id); save(); renderDayPlan(); }
function togglePlanBlock(id) { const b = (data.dayPlan.blocks || []).find(x => x.id === id); if (!b) return; b.done = !b.done; save(); renderDayPlan(); }
function focusPlanBlock(taskId) { bindFocusTask(taskId); showTab('focus', document.querySelector('[data-tab=focus]')); }
function clearDayPlan() {
  if (!(data.dayPlan.blocks || []).length) { showToast('Plan zaten boş', 'info'); return; }
  if (!confirm(planIsTomorrow() ? 'Yarının tüm planını sil?' : 'Bugünün tüm planını sil?')) return;
  data.dayPlan.blocks = []; save(); renderDayPlan();
  showToast('Plan temizlendi', 'info');
}

// ============ PLANLAMA ZEKASI (worker'daki ikizinin frontend eşi) ============
// dayPlan üzerine yazılmadan önce arşivlenir → sonraki planlar bu veriyle kurulur.

function daysBetweenDates(a, b) {
  const da = Date.parse(a + 'T12:00:00Z'), db = Date.parse(b + 'T12:00:00Z');
  if (isNaN(da) || isNaN(db)) return null;
  return Math.round((db - da) / 86400000);
}

// s=start e=end k=kind d=done c=kategori — kompakt, son 21 gün
function archivePlanDay(dp) {
  if (!dp || !dp.date || !(dp.blocks || []).length) return;
  data.planHistory = data.planHistory || [];
  if (data.planHistory.some(h => h.date === dp.date)) return;
  const tasks = data.tasks || [];
  const trained = ((data.hevy && data.hevy.workouts) || []).some(w => w.date === dp.date);
  data.planHistory.push({
    date: dp.date,
    w: trained || undefined,   // antrenman günü mü — planlayıcı bunu öğrenir
    blocks: dp.blocks.map(b => {
      const t = b.taskId ? tasks.find(x => x.id === b.taskId) : null;
      return { s: b.start, e: b.end, k: b.kind || 'task', d: !!b.done, c: (t && t.category) || null };
    }),
  });
  data.planHistory = data.planHistory.slice(-21);
}

// Gerçek veriden planlama profili: saat dilimi tutturma oranı, süre sapması,
// günlük gerçekçi kapasite, en çok kaçan kategori.
function planProfile() {
  const hist = (data.planHistory || []).slice(-14);
  const buckets = { sabah: { t: 0, d: 0 }, ogle: { t: 0, d: 0 }, aksam: { t: 0, d: 0 } };
  const catMiss = {};
  const perDay = [];
  const gym = { t: 0, d: 0 }, rest = { t: 0, d: 0 };   // antrenman günü vs normal gün
  for (const h of hist) {
    let dn = 0;
    for (const b of (h.blocks || [])) {
      if (b.k === 'break' || b.k === 'fixed') continue;
      const hm = hmToMin(b.s);
      const key = hm < 720 ? 'sabah' : hm < 1020 ? 'ogle' : 'aksam';
      buckets[key].t++;
      const b2 = h.w ? gym : rest;
      b2.t++;
      if (b.d) { buckets[key].d++; b2.d++; dn++; }
      else if (b.c) catMiss[b.c] = (catMiss[b.c] || 0) + 1;
    }
    perDay.push(dn);
  }
  const finished = (data.tasks || []).filter(t => t && t.done && t.estimateMin > 0 && t.actualMin > 0).slice(-30);
  let ratio = null;
  if (finished.length >= 3) {
    const rs = finished.map(t => t.actualMin / t.estimateMin).sort((a, b) => a - b);
    const mid = Math.floor(rs.length / 2);
    ratio = rs.length % 2 ? rs[mid] : (rs[mid - 1] + rs[mid]) / 2;
    ratio = Math.min(3, Math.max(0.5, ratio));
  }
  const avgDone = perDay.length ? perDay.reduce((a, b) => a + b, 0) / perDay.length : null;
  return { days: hist.length, buckets, catMiss, ratio, avgDone, gym, rest };
}

const CAT_TR = { odev: 'ödev', ders: 'özel ders', ev: 'ev işi', kisisel: 'kişisel' };

function profileLines(prof) {
  if (!prof || prof.days < 3) return '';
  const out = [];
  const rate = b => (b.t >= 3 ? Math.round((b.d / b.t) * 100) : null);
  const parts = [];
  const rs = rate(prof.buckets.sabah), ro = rate(prof.buckets.ogle), ra = rate(prof.buckets.aksam);
  if (rs !== null) parts.push(`sabah %${rs}`);
  if (ro !== null) parts.push(`öğleden sonra %${ro}`);
  if (ra !== null) parts.push(`akşam %${ra}`);
  if (parts.length) out.push(`- Blok tamamlama oranı: ${parts.join(' · ')}. DÜŞÜK oranlı saat dilimine ağır/uzun iş KOYMA.`);
  if (prof.ratio && Math.abs(prof.ratio - 1) > 0.15) {
    out.push(prof.ratio > 1
      ? `- Süre tahminleri gerçekte ~${prof.ratio.toFixed(1)} kat uzuyor. Süreler BU KATSAYIYLA DÜZELTİLDİ — tekrar uzatma.`
      : `- İşler tahminden hızlı bitiyor (~${prof.ratio.toFixed(1)} kat). Süreler zaten düzeltildi.`);
  }
  if (prof.avgDone !== null && prof.avgDone > 0) {
    const cap = Math.max(2, Math.round(prof.avgDone) + 1);
    out.push(`- Günde ortalama ${prof.avgDone.toFixed(1)} çalışma bloğu bitiriyor. En fazla ${cap} çalışma bloğu koy.`);
  }
  const worst = Object.entries(prof.catMiss).sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 3) {
    out.push(`- En çok kaçırdığı kategori: "${CAT_TR[worst[0]] || worst[0]}" (${worst[1]} blok). Günün EN İYİ saatine, KISA bloklar halinde koy.`);
  }
  const g = prof.gym, rr = prof.rest;
  if (g && rr && g.t >= 4 && rr.t >= 4) {
    const gr = g.d / g.t, rrr = rr.d / rr.t;
    if (rrr - gr >= 0.15) {
      out.push(`- Antrenman yaptığı günlerde tamamlama oranı düşüyor (%${Math.round(gr * 100)} vs %${Math.round(rrr * 100)}). BUGÜN ANTRENMAN GÜNÜ ise daha AZ ve daha KISA blok koy.`);
    }
  }
  return out.length ? `\n\n📊 GEÇMİŞ VERİSİ (son ${prof.days} gün — ölçüldü):\n${out.join('\n')}` : '';
}

// Hevy sadece GEÇMİŞİ verir — gelecek programı bilmez. Haftalık desene bakarız:
// son 3 haftanın aynı gününde antrenman varsa bugün de muhtemelen antrenman günü.
function gymDayLine(forDate) {
  const ws = ((data.hevy || {}).workouts) || [];
  if (ws.length < 4) return '';
  const dayIdx = new Date(forDate + 'T12:00:00').getDay();
  let hits = 0;
  for (let k = 1; k <= 3; k++) {
    const d = shiftDateStr(forDate, -7 * k);
    if (ws.some(w => w.date === d)) hits++;
  }
  if (hits < 2) return '';
  const names = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  return `

💪 Son 3 haftanın ${hits}'inde ${names[dayIdx]} günü antrenman yapıldı — bugün büyük ihtimalle ANTRENMAN GÜNÜ. Günü hafiflet, antrenman için ~90 dk boşluk bırak.`;
}

function deadlineLines(forDate) {
  const cds = (data.countdowns || [])
    .map(c => ({ label: c.label, d: daysBetweenDates(forDate, c.date) }))
    .filter(x => x.d !== null && x.d >= 0 && x.d <= 14)
    .sort((a, b) => a.d - b.d).slice(0, 5);
  if (!cds.length) return '';
  const lines = cds.map(c => `- ${c.label}: ${c.d === 0 ? 'BUGÜN' : c.d === 1 ? 'YARIN' : c.d + ' gün kaldı'}`);
  return `\n\n⏳ YAKLAŞAN SINAV / TESLİM:\n${lines.join('\n')}\nBu tarihlere hazırlık gerektiren görevleri güne ÖNCE koy.`;
}

// 😴 Dün geceki uyku → bugünün planına enerji ipucu (sadece bugün için bilinir)
function sleepLine(forDate) {
  if (forDate !== today() || typeof lastNightSleep !== 'function') return '';
  const sl = lastNightSleep();
  if (!sl) return '';
  const bad = sl.quality === 'bad' || (sl.hours != null && sl.hours < 6);
  const great = sl.quality === 'good' && (sl.hours == null || sl.hours >= 7.5);
  const hStr = sl.hours != null ? fmtSleepHours(sl.hours) + ' ' : '';
  if (bad) {
    const bstreak = (typeof badSleepStreak === 'function') ? badSleepStreak() : 1;
    const extra = bstreak >= 2 ? ` Bu ${bstreak}. kötü gece üst üste — toparlanma öncelikli, gün çok hafif olsun.` : '';
    return `\n\n😴 Bu kişi dün gece ${hStr}kötü/az uyudu — enerji düşük. Bugün daha AZ ve KISA blok koy, ağır işi en verimli saate al, güne fazladan 20-30 dk tampon bırak. Zorlamayan bir gün kur.${extra}`;
  }
  if (great) return `\n\n😴 Bu kişi dün gece iyi dinlendi — enerji yüksek. Zorlu/derin işleri güne rahatça koyabilirsin.`;
  return '';
}

// Plan panelinde "Aidan neye göre planlıyor" şeffaflık satırı
function renderPlanInsight() {
  const el = document.getElementById('planInsight');
  if (!el) return;
  const p = planProfile();
  if (p.days < 3) {
    el.innerHTML = `<span class="pi-learn">Aidan planlarını izliyor — ${p.days}/3 gün. 3 günden sonra senin gerçek hızına ve verimli saatlerine göre planlamaya başlayacak.</span>`;
    return;
  }
  const bits = [];
  if (p.ratio && Math.abs(p.ratio - 1) > 0.15) bits.push(`süreler ${p.ratio.toFixed(1)}×`);
  if (p.avgDone !== null) bits.push(`günde ~${p.avgDone.toFixed(1)} blok`);
  const best = [['sabah', p.buckets.sabah], ['öğleden sonra', p.buckets.ogle], ['akşam', p.buckets.aksam]]
    .filter(([, b]) => b.t >= 3).sort((a, b) => (b[1].d / b[1].t) - (a[1].d / a[1].t))[0];
  if (best) bits.push(`en iyi: ${best[0]}`);
  el.innerHTML = `<span class="pi-on">Son ${p.days} günün verisiyle planlanıyor${bits.length ? ' · ' + bits.join(' · ') : ''}</span>`;
}

// ============ SABİT PROGRAM + PLAN TOPARLAMA + BLOK AKSİYONLARI ============

// data.fixedSchedule = [{id, label, days:[0..6 JS getDay], start, end, enabled}]
// Okul / özel ders / antrenman gibi HER HAFTA aynı olan bloklar. AI bunların
// etrafına plan kurar, üzerlerine yazmaz. Worker'daki fixedBlocksFor'un eşi.
function fixedBlocksForDate(dateStr) {
  const dayIdx = new Date(dateStr + 'T12:00:00').getDay();
  return (data.fixedSchedule || [])
    .filter(f => f && f.enabled !== false && Array.isArray(f.days) && f.days.includes(dayIdx)
      && hmToMin(f.start) >= 0 && hmToMin(f.end) > hmToMin(f.start))
    .map((f, k) => ({
      id: Date.now() + 900000 + k,
      label: (f.label || 'Sabit').slice(0, 100),
      start: f.start, end: f.end,
      kind: 'fixed', taskId: null, done: false, fixedId: f.id,
    }))
    .sort((a, b) => hmToMin(a.start) - hmToMin(b.start));
}
function blocksOverlap(a, b) {
  return hmToMin(a.start) < hmToMin(b.end) && hmToMin(b.start) < hmToMin(a.end);
}

// Bir bloğu yerleştirebileceğin ilk boş başlangıç — sabit bloklara çarpmaz.
// Sığmıyorsa -1 döner (pencere bitti).
function nextFreeStart(cursor, dur, fixedList, winEnd) {
  let c = cursor, guard = 0;
  while (guard++ < 200) {
    const clash = fixedList.find(f => c < hmToMin(f.end) && hmToMin(f.start) < c + dur);
    if (!clash) break;
    c = hmToMin(clash.end);
  }
  return (c + dur > winEnd) ? -1 : c;
}

// 🔁 Plan toparlama — ADHD'de planın ölme sebebi "bir blok kaçtı, gerisi çöp" hissi.
// Kural tabanlı (AI YOK, anında): biten + sabit bloklar yerinde kalır, kalan
// hareketli bloklar ŞU ANDAN itibaren sırayla yeniden dizilir. Sığmayan düşer.
function shiftPlanRemaining(silent) {
  if (planIsTomorrow()) { showToast('Bu yarının planı — kaydırmaya gerek yok', 'info', 3000); return; }
  const all = (data.dayPlan.blocks || []).slice().sort((a, b) => hmToMin(a.start) - hmToMin(b.start));
  if (!all.length) { showToast('Plan boş', 'info'); return; }

  const nowM0 = hmToMin(nowHM());
  const fixedList = all.filter(b => b.kind === 'fixed');
  // Şu an üzerinde çalışılan bloğu YERİNDE bırak — tam ortasında yerini değiştirme
  const inProg = all.find(b => b.kind !== 'fixed' && !b.done && hmToMin(b.start) <= nowM0 && nowM0 < hmToMin(b.end));
  const keep = all.filter(b => b.kind === 'fixed' || b.done || b === inProg);
  const movable = all.filter(b => keep.indexOf(b) === -1);
  if (!movable.length) { showToast('Kaydırılacak blok yok — hepsi bitmiş', 'success', 3000); return; }

  const winEnd = hmToMin(planWindow().to);
  // Şu anı 5 dk yukarı yuvarla — "14:07'de başla" demek yerine 14:10
  let cursor = Math.ceil(Math.max(nowM0, inProg ? hmToMin(inProg.end) : nowM0) / 5) * 5;
  const dur = x => Math.max(5, hmToMin(x.end) - hmToMin(x.start));
  const remaining = movable.slice();
  const placed = [];
  let guard = 0;

  // Boşluk doldurmalı yerleştirme: sabit bloktan önce 40 dk boşluk kaldıysa
  // ve sıradaki blok sığmıyorsa, sığan bir SONRAKİ bloğu oraya koyar.
  // Sıra mümkün olduğunca korunur — sadece sığmayan atlanır, boşluk ziyan olmaz.
  while (remaining.length && guard++ < 300) {
    if (cursor >= winEnd) break;
    const nextFixed = fixedList.find(f => hmToMin(f.start) >= cursor);
    const gapEnd = nextFixed ? Math.min(hmToMin(nextFixed.start), winEnd) : winEnd;
    const idx = remaining.findIndex(x => cursor + dur(x) <= gapEnd);
    if (idx === -1) {
      if (!nextFixed) break;                  // pencere bitti, kalanlar düşer
      cursor = hmToMin(nextFixed.end);        // bu boşluğa hiçbiri sığmadı, sabiti atla
      continue;
    }
    const b = remaining.splice(idx, 1)[0];
    const d = dur(b);
    b.start = minToHM(cursor);
    b.end = minToHM(cursor + d);
    b.pinged = false;                          // yeni saatinde tekrar bildirim gelsin
    placed.push(b);
    cursor += d;
  }
  const dropped = remaining;

  data.dayPlan.blocks = keep.concat(placed).sort((a, b) => hmToMin(a.start) - hmToMin(b.start));
  save(); renderDayPlan();
  if (!silent) {
    const msg = dropped.length
      ? `${placed.length} blok kaydırıldı · ${dropped.length} tanesi güne sığmadı`
      : `${placed.length} blok şu andan itibaren yeniden dizildi`;
    showToast(msg, dropped.length ? 'warning' : 'success', 4000);
  }
  return { placed: placed.length, dropped: dropped.length };
}

// Tek bloğu ertele — sonrasındaki hareketli bloklar çarpışırsa onlar da kayar
function snoozeBlock(id, mins) {
  const blocks = (data.dayPlan.blocks || []).slice().sort((a, b) => hmToMin(a.start) - hmToMin(b.start));
  const b = blocks.find(x => String(x.id) === String(id));
  if (!b) return false;
  const shift = mins || 15;
  const fixedList = blocks.filter(x => x.kind === 'fixed');
  const winEnd = hmToMin(planWindow().to);
  const dur = Math.max(5, hmToMin(b.end) - hmToMin(b.start));
  const st = nextFreeStart(hmToMin(b.start) + shift, dur, fixedList, winEnd);
  if (st < 0) { showToast('Bu blok güne sığmıyor — yarına bırak ya da kısalt', 'warning', 4000); return false; }
  b.start = minToHM(st); b.end = minToHM(st + dur); b.pinged = false;

  // Kaskad: sonraki hareketli bloklar çakışıyorsa onları da it
  let cursor = st + dur;
  for (const x of blocks) {
    if (x === b || x.kind === 'fixed' || x.done) continue;
    if (hmToMin(x.start) < cursor) {
      const d = Math.max(5, hmToMin(x.end) - hmToMin(x.start));
      const ns = nextFreeStart(cursor, d, fixedList, winEnd);
      if (ns < 0) continue;
      x.start = minToHM(ns); x.end = minToHM(ns + d); x.pinged = false;
      cursor = ns + d;
    }
  }
  data.dayPlan.blocks = blocks.sort((a, b2) => hmToMin(a.start) - hmToMin(b2.start));
  save(); renderDayPlan();
  showToast(`Blok ${shift} dk ertelendi → ${b.start}`, 'info', 3000);
  return true;
}

// 🔔 Bildirimden gelen aksiyon (sw.js → postMessage ya da /?blk=..&act=..)
// iOS PWA bildirim butonlarını göstermez → orada act='open' gelir, plan sekmesi açılıp blok vurgulanır.
function handleBlockAction(blockId, action) {
  const b = (data.dayPlan.blocks || []).find(x => String(x.id) === String(blockId));
  if (!b) { showToast('Blok bulunamadı — plan değişmiş olabilir', 'warning', 3500); return; }
  if (action === 'done') {
    if (!b.done) { b.done = true; save(); }
    showToast(`✓ ${b.label}`, 'success', 3000);
    showTab('plan', document.querySelector('[data-tab=plan]'));
    return;
  }
  if (action === 'snooze') { snoozeBlock(b.id, 15); showTab('plan', document.querySelector('[data-tab=plan]')); return; }
  if (action === 'start') {
    if (b.taskId) { focusPlanBlock(b.taskId); return; }
    showTab('focus', document.querySelector('[data-tab=focus]'));
    return;
  }
  // 'open' ya da bilinmeyen — plan sekmesini aç, bloğu vurgula
  showTab('plan', document.querySelector('[data-tab=plan]'));
  setTimeout(() => {
    const el = document.getElementById('planBlock-' + b.id);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2000); }
  }, 200);
}

// Uygulama acilisinda URL'den (/?blk=..&act=..) ve calisirken SW mesajindan gelir
function initBlockActionBridge() {
  try {
    const q = new URLSearchParams(location.search);
    const blk = q.get('blk');
    if (blk) {
      const act = q.get('act') || 'open';
      setTimeout(() => handleBlockAction(blk, act), 400);
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) {}
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', ev => {
      const d = ev && ev.data;
      if (d && d.type === 'BLOCK_ACTION' && d.blockId) handleBlockAction(d.blockId, d.action || 'open');
    });
  }
}

// AI: görevleri + uyanık pencereyi → saat saat plan (Worker /plan)
async function planMyDay() {
  if (!window._supa || !window._user) { showToast('AI için bulut girişi gerekli — Ayarlar → giriş yap', 'warning', 4000); return; }
  const open = (data.tasks || []).filter(t => !t.done);
  if (!open.length) { showToast('Planlanacak görev yok — önce görev ekle', 'info', 3500); return; }
  const w = planWindow();
  // AI'ya kompakt, index referanslı liste (sayı uydurmasın diye süreler net)
  const _prof0 = planProfile();
  const tasksForAi = open.slice(0, 20).map((t, i) => {
    // Gerçekçi süre: tahmini ölçülen sapmayla çarp, 5 dk'ya yuvarla
    let min = t.estimateMin || null;
    if (min && _prof0.ratio) min = Math.max(10, Math.round((min * _prof0.ratio) / 5) * 5);
    // Çok günlük iş: son tarihe kalan güne böl → bugün ne kadar çalışmalı
    let todayShare = null;
    if (min && t.due) {
      const dl = daysBetweenDates(today(), t.due);
      if (dl !== null && dl > 0) {
        const sh = Math.max(20, Math.round(min / (dl + 1) / 5) * 5);
        if (sh < min) todayShare = sh;
      }
    }
    return {
      i,
      text: t.text.slice(0, 80),
      min: todayShare || min,
      full: todayShare ? min : null,
      pri: t.priority === 'urgent' ? 'acil' : 'normal',
      mit: t.mitDate === today(),
      due: t.due || null,
      cat: t.category || null,
    };
  });
  if (data.dayPlan && data.dayPlan.date && data.dayPlan.date !== today()) archivePlanDay(data.dayPlan);
  const prof = planProfile();
  const insight = profileLines(prof) + deadlineLines(today()) + gymDayLine(today()) + sleepLine(today());
  const fixed = fixedBlocksForDate(today());
  const btn = document.getElementById('planAiBtn');
  if (btn) btn.disabled = true;
  showToast('Günün planlanıyor… 10-15 sn sürebilir', 'info', 4000);
  try {
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum bulunamadı, tekrar giriş yap');
    const r = await fetch(PLAN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        tasks: tasksForAi, from: w.from, to: w.to, now: nowHM(),
        busy: fixed.map(f => ({ label: f.label, start: f.start, end: f.end })),
        insight,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('sunucu hatası ' + r.status));
    const raw = j.blocks || [];
    if (!raw.length) { showToast('AI plan üretemedi — elle ekleyebilirsin', 'warning', 4000); return; }
    const mapped = raw.map(b => {
      const ti = (b.task === 0 || b.task) ? Number(b.task) : null;
      const linked = (ti !== null && open[ti]) ? open[ti] : null;
      return {
        id: Date.now() + Math.floor(Math.random() * 100000),
        label: (b.label || '').toString().slice(0, 100) || (linked ? linked.text : 'Blok'),
        start: b.start, end: b.end,
        kind: b.kind || (linked ? 'task' : 'custom'),
        taskId: linked ? linked.id : null,
        done: false,
      };
    }).filter(b => b.start && b.end && hmToMin(b.end) > hmToMin(b.start));
    // AI talimata ragmen sabit saate blok koyduysa at — sabit program her zaman kazanir
    const clean = fixed.length ? mapped.filter(b => !fixed.some(f => blocksOverlap(b, f))) : mapped;
    const all = fixed.concat(clean).sort((a, b) => hmToMin(a.start) - hmToMin(b.start));
    data.dayPlan = { date: today(), blocks: all, windowFrom: w.from, windowTo: w.to };
    save(); renderDayPlan();
    showToast(`Günün planlandı — ${all.length} blok${fixed.length ? ` (${fixed.length} sabit)` : ''}`, 'success', 3500);
  } catch (e) {
    showToast('Planlanamadı: ' + e.message, 'error', 4500);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// AI portföy yorumu — sayıları PWA hesaplar (uydurma yok), AI sadece betimler
const PF_COMMENT_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/portfolio-comment';
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
  document.getElementById('pfCommentBody').textContent = 'Aidan portföyüne bakıyor…';
  document.getElementById('pfCommentModal').classList.add('active');
}
function closePfComment() { document.getElementById('pfCommentModal').classList.remove('active'); }
async function aiCommentPortfolio() {
  const facts = buildPortfolioFacts();
  if (!facts) { showToast('Önce pozisyon ekle (adet + maliyet)', 'warning', 3500); return; }
  if (!window._supa || !window._user) { showToast('AI için bulut girişi gerekli — Ayarlar → giriş yap', 'warning', 4000); return; }
  openPfComment();
  try {
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum bulunamadı, tekrar giriş yap');
    const r = await fetch(PF_COMMENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ facts }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('sunucu hatası ' + r.status));
    document.getElementById('pfCommentBody').textContent = j.comment || 'Yorum üretilemedi.';
  } catch (e) {
    document.getElementById('pfCommentBody').textContent = 'Yorum alınamadı: ' + e.message;
  }
}

// Akıllı quick-capture parser — AI'ya gitmeden tarih/saat/kategori/öncelik/süreyi tespit eder.
// "yarın 14:00 dişçi" -> { text:'dişçi', due:yarın, reminderTime:14:00, category:'kisisel' }
function parseQuickInput(raw) {
  let text = ' ' + raw + ' ';
  const detected = [];
  const today = new Date();
  const isoDate = (d) => d.toISOString().slice(0, 10);
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
  // 0=Pazar (JS), 1=Pzt ... 6=Cmt
  const trDays = { 'pazartesi':1, 'salı':2, 'sali':2, 'çarşamba':3, 'carsamba':3, 'çarsamba':3, 'perşembe':4, 'persembe':4, 'cuma':5, 'cumartesi':6, 'pazar':0,
                   'pzt':1, 'çar':3, 'car':3, 'per':4, 'cum':5, 'cmt':6, 'paz':0 };
  // 'sal' kısaltması "salı" için kullanılır ama isim olabilir — ayrı bir liste
  const trDaysShort = { 'sal':2 };

  let due = null, reminderTime = null, category = null, priority = null, estimateMin = null;

  // --- TARİH ---
  if (/(^|\s)bugün(\s|$)/i.test(text)) { due = isoDate(today); text = text.replace(/(^|\s)bugün(\s|$)/i, ' '); detected.push('bugün'); }
  else if (/(^|\s)yarın(\s|$)/i.test(text)) { due = addDays(1); text = text.replace(/(^|\s)yarın(\s|$)/i, ' '); detected.push('yarın'); }
  else if (/(^|\s)(öbürgün|ertesi gün)(\s|$)/i.test(text)) { due = addDays(2); text = text.replace(/(^|\s)(öbürgün|ertesi gün)(\s|$)/i, ' '); detected.push('öbürgün'); }
  else if (/(^|\s)haftaya(\s|$)/i.test(text)) { due = addDays(7); text = text.replace(/(^|\s)haftaya(\s|$)/i, ' '); detected.push('haftaya'); }
  else if (/(^|\s)hafta\s*sonu(\s|$)/i.test(text)) {
    const wd = today.getDay(); const diff = ((6 - wd + 7) % 7) || 7;
    due = addDays(diff); text = text.replace(/(^|\s)hafta\s*sonu(\s|$)/i, ' '); detected.push('hafta sonu');
  } else {
    const ng = text.match(/(^|\s)(\d+)\s*gün(?:e|den|ün)?\s*(sonra|içinde|içerisinde)\b/i);
    if (ng) { const n = parseInt(ng[2]); due = addDays(n); text = text.replace(ng[0], ' '); detected.push(`${n} gün sonra`); }
  }
  if (!due) {
    for (const [name, num] of Object.entries(trDays)) {
      const re = new RegExp(`(^|\\s)${name}(\\s|$)`, 'i');
      if (re.test(text)) {
        let diff = ((num - today.getDay()) + 7) % 7;
        if (diff === 0) diff = 7;
        due = addDays(diff); text = text.replace(re, ' '); detected.push(`${name}`); break;
      }
    }
  }
  if (!due) {
    for (const [name, num] of Object.entries(trDaysShort)) {
      const re = new RegExp(`(^|\\s)${name}(\\s|$)`, 'i');
      if (re.test(text)) {
        let diff = ((num - today.getDay()) + 7) % 7;
        if (diff === 0) diff = 7;
        due = addDays(diff); text = text.replace(re, ' '); detected.push(`${name}`); break;
      }
    }
  }
  if (!due) {
    // DD.MM[.YYYY] veya DD/MM[/YYYY] — dikkat: saat HH.MM ile karışmasın → 12'den büyük 2.kısım = ay olamaz
    const dm = text.match(/(^|\s)(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?(\s|$)/);
    if (dm) {
      const d = parseInt(dm[2]), mo = parseInt(dm[3]);
      let y = dm[4] ? parseInt(dm[4]) : today.getFullYear();
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        due = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        text = text.replace(dm[0], ' '); detected.push(`${due.slice(5)}`);
      }
    }
  }

  // --- SAAT ---
  const tm = text.match(/(^|\s)(\d{1,2}):(\d{2})(\s|$)/) || text.match(/(^|\s)(\d{1,2})\.(\d{2})(\s|$)/);
  if (tm) {
    const h = parseInt(tm[2]), m = parseInt(tm[3]);
    if (h <= 23 && m <= 59) {
      reminderTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      text = text.replace(tm[0], ' '); detected.push(`${reminderTime}`);
    }
  }
  if (!reminderTime) {
    const periods = [
      { re: /(^|\s)akşam\s*(\d{1,2})(\s|$)/i, addPm: true, label: 'akşam' },
      { re: /(^|\s)öğle(?:n)?\s*(\d{1,2})(\s|$)/i, addPm: true, label: 'öğlen' },
      { re: /(^|\s)sabah\s*(\d{1,2})(\s|$)/i, addPm: false, label: 'sabah' },
      { re: /(^|\s)gece\s*(\d{1,2})(\s|$)/i, addPm: true, label: 'gece' },
      { re: /(^|\s)ikindi\s*(\d{1,2})(\s|$)/i, addPm: true, label: 'ikindi' },
    ];
    for (const p of periods) {
      const mm = text.match(p.re);
      if (mm) {
        let h = parseInt(mm[2]);
        if (p.addPm && h < 12) h += 12;
        if (h <= 23) {
          reminderTime = `${String(h).padStart(2,'0')}:00`;
          text = text.replace(mm[0], ' '); detected.push(`${p.label} ${mm[2]}`); break;
        }
      }
    }
  }
  if (!reminderTime) {
    const sm = text.match(/(^|\s)saat\s*(\d{1,2})(\s|$)/i) || text.match(/(^|\s)(\d{1,2})['']?(?:de|da|te|ta)(\s|$)/i);
    if (sm) {
      const h = parseInt(sm[2]);
      if (h >= 0 && h <= 23) {
        reminderTime = `${String(h).padStart(2,'0')}:00`;
        text = text.replace(sm[0], ' '); detected.push(`${reminderTime}`);
      }
    }
  }
  if (!reminderTime) {
    const standalone = { 'sabah': '09:00', 'öğle': '12:00', 'öğlen': '12:00', 'ikindi': '16:00', 'akşam': '19:00', 'gece': '22:00' };
    for (const [name, time] of Object.entries(standalone)) {
      const re = new RegExp(`(^|\\s)${name}(\\s|$)`, 'i');
      if (re.test(text)) {
        reminderTime = time;
        text = text.replace(re, ' '); detected.push(`${name}`); break;
      }
    }
  }

  // --- SÜRE TAHMİNİ ---
  let em = text.match(/(^|\s)(\d+)\s*(?:saat|sa|h)\s*(\d+)\s*(?:dakika|dk|min)(\s|$)/i);
  if (em) {
    estimateMin = parseInt(em[2]) * 60 + parseInt(em[3]);
    text = text.replace(em[0], ' '); detected.push(`⏱ ${estimateMin}dk`);
  } else {
    em = text.match(/(^|\s)(\d+(?:[.,]\d+)?)\s*(?:saat|sa|hour|hr)(\s|$)/i);
    if (em) {
      estimateMin = Math.round(parseFloat(em[2].replace(',', '.')) * 60);
      text = text.replace(em[0], ' '); detected.push(`⏱ ${estimateMin}dk`);
    } else {
      em = text.match(/(^|\s)(\d+)\s*(?:dakika|dk|min)(\s|$)/i);
      if (em) {
        estimateMin = parseInt(em[2]);
        text = text.replace(em[0], ' '); detected.push(`⏱ ${estimateMin}dk`);
      }
    }
  }

  // Saat HH:MM bulunduysa, yetim "öğlen/sabah/akşam" kelimelerini de temizle
  if (reminderTime) {
    text = text.replace(/(^|\s)(sabah|öğle|öğlen|ikindi|akşam|gece)(\s|$)/gi, ' ');
  }

  // BOUNDARY helper: JS `\b` Türkçe karakter sonunda kırılır (ş, ı, ö, ü, ç, ğ).
  // (?:^|[\s,.!?]) ... (?=[\s,.!?]|$) — açık delimiter ile her dilde çalışır.
  const word = (alts) => new RegExp(`(?:^|[\\s,.!?])(${alts})(?=[\\s,.!?]|$)`, 'i');

  // --- ÖNCELİK (saf öncelik kelimeleri başlıktan silinir — ACİL rozeti zaten gösterir) ---
  const priRe = word('acil|acele|hemen|asap|ivedi');
  if (priRe.test(text)) {
    priority = 'urgent'; text = text.replace(priRe, ' '); detected.push('acil');
  }

  // --- KATEGORİ (text'ten silmiyoruz — anahtar kelime başlığın anlamını taşıyor) ---
  if (word('sınav|sinav|ders|matematik|fizik|kimya|tarih|edebiyat|coğrafya|cografya|biyoloji|ödev|odev|test|deneme|konu|özet|ozet|çalış|calis|oku|kitap|sayfa').test(text)) {
    category = 'odev'; detected.push('ödev');
  } else if (word('ev|temizlik|çamaşır|camasir|bulaşık|bulasik|yemek|yatak|banyo|toparla|süpür|supur|mutfak|piknik|alışveriş|alisveris').test(text)) {
    category = 'ev'; detected.push('ev');
  } else if (word('doktor|dişçi|disci|spor|yürüyüş|yuruyus|koş|kos|gym|randevu|berber|kuaför|kuafor|banka').test(text)) {
    category = 'kisisel'; detected.push('kişisel');
  }

  // Temizlik
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/^(ve|da|de|ki)\s+/i, '').replace(/\s+(ve|da|de|ki)$/i, '').trim();

  return {
    text: text || raw.trim(),
    due, reminderTime, category, priority, estimateMin,
    detected
  };
}

function quickCaptureSubmit() {
  const inp = document.getElementById('quickCapture');
  const raw = inp.value.trim();
  if (!raw) return;
  const p = parseQuickInput(raw);
  const task = {
    id: Date.now(),
    text: p.text,
    done: false,
    doneDate: null,
    subtasks: [],
    created: timeStr(),
    priority: p.priority || 'normal',
    category: p.category,
    due: p.due,
    estimateMin: p.estimateMin,
    actualMin: null,
    repeat: null,
    reminderTime: p.reminderTime,
    lastReminded: null,
    mitDate: null,
    seriesId: null,
    seriesName: null,
    seriesIndex: null,
    seriesTotal: null,
    notes: null
  };
  data.tasks.unshift(task);
  inp.value = '';
  save();
  renderTasks();
  const head = `${p.text.slice(0, 40)}${p.text.length > 40 ? '…' : ''}`;
  const suffix = p.detected.length ? `\n${p.detected.join(' · ')}` : '';
  showToast(head + suffix, 'success', p.detected.length ? 3500 : 2200);
}

// ============ ZİHİN BOŞALT (BRAIN DUMP) ============
// data.dumps = [{ text, when }]  — when = benzersiz epoch ms (çakışmada +1)
let _lastDumpWhen = 0;
function uniqueDumpWhen() {
  let w = Date.now();
  if (w <= _lastDumpWhen) w = _lastDumpWhen + 1; // aynı ms'de çakışma → benzersizle
  _lastDumpWhen = w;
  return w;
}
function addDump() {
  const inp = document.getElementById('braindumpInput');
  const text = inp.value.trim();
  if (!text) return;
  data.dumps = data.dumps || [];
  data.dumps.unshift({ text, when: uniqueDumpWhen() });
  inp.value = '';
  save();
  renderDumps();
  showToast('Kafandan çıktı', 'success', 1800);
}

function deleteDump(when) {
  data.dumps = (data.dumps || []).filter(d => d.when !== when);
  save();
  renderDumps();
}

function dumpToTask(when) {
  const d = (data.dumps || []).find(x => x.when === when);
  if (!d) return;
  // Akıllı parser'dan geçir — tarih/saat/kategori yakalasın
  const p = parseQuickInput(d.text);
  const task = makeTask({
    text: p.text, priority: p.priority || 'normal', category: p.category,
    due: p.due, estimateMin: p.estimateMin, reminderTime: p.reminderTime
  });
  data.tasks.unshift(task);
  data.dumps = (data.dumps || []).filter(x => x.when !== when);
  save();
  renderTasks();
  const suffix = p.detected.length ? `\n${p.detected.join(' · ')}` : '';
  showToast(`Göreve çevrildi: ${p.text.slice(0, 30)}${suffix}`, 'success', 3000);
}

function dumpRelTime(when) {
  const diff = Date.now() - when;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'dün';
  return `${d} gün önce`;
}

function renderDumps() {
  const list = document.getElementById('braindumpList');
  const badge = document.getElementById('braindumpBadge');
  if (!list) return;
  const dumps = data.dumps || [];
  if (badge) badge.textContent = dumps.length ? String(dumps.length) : '';
  if (dumps.length === 0) {
    list.innerHTML = '<div class="braindump-empty">Henüz bir şey yok — kafanı boşalt </div>';
    return;
  }
  list.innerHTML = dumps.map(d => `
    <div class="braindump-item">
      <div class="braindump-item-text">${escapeHtml(d.text)}<div class="braindump-item-when">${dumpRelTime(d.when)}</div></div>
      <div class="braindump-item-actions">
        <button class="to-task" onclick="dumpToTask(${d.when})" title="Göreve çevir" aria-label="Göreve çevir"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></button>
        <button class="del" onclick="deleteDump(${d.when})" title="Sil" aria-label="Sil"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>
  `).join('');
}

// Brain dump için sesli giriş — quickCaptureMic'in dump versiyonu
function dumpVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('Bu tarayıcı sesli girişi desteklemiyor.', 'warning', 4000);
    return;
  }
  const inp = document.getElementById('braindumpInput');
  const btn = document.getElementById('braindumpMic');
  if (_speechRec) { try { _speechRec.stop(); } catch (e) {} return; }
  const rec = new SR();
  rec.lang = 'tr-TR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  _speechRec = rec;
  const origPh = inp.placeholder;
  const cleanup = () => { if (btn) btn.classList.remove('recording'); inp.placeholder = origPh; _speechRec = null; };
  rec.onstart = () => { if (btn) btn.classList.add('recording'); inp.placeholder = 'Dinliyorum...'; inp.value = ''; inp.focus(); };
  rec.onresult = (e) => {
    let final = '', interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    inp.value = (final || interim).trim();
  };
  rec.onerror = (e) => {
    cleanup();
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') showToast('Mikrofon izni reddedildi.', 'warning', 4000);
    else if (e.error === 'no-speech') showToast('Ses duyulmadı, tekrar dene', 'info', 2500);
  };
  rec.onend = () => { cleanup(); if (inp.value.trim()) inp.focus(); };
  try { rec.start(); } catch (err) { cleanup(); showToast('Mikrofon başlatılamadı', 'error', 3000); }
}

// ============ AKŞAM GÜNLÜĞÜ ============
// data.journal = [{ date:'YYYY-MM-DD', text, reflection, when }]
const JOURNAL_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/journal';

function openJournalModal() {
  document.getElementById('journalModal').classList.add('active');
  const ta = document.getElementById('journalText');
  // Bugün zaten yazdıysa onu yükle (üzerine yaz)
  const todayEntry = (data.journal || []).find(j => j.date === today());
  ta.value = todayEntry ? todayEntry.text : '';
  const refEl = document.getElementById('journalReflection');
  if (todayEntry && todayEntry.reflection) {
    refEl.style.display = 'block';
    refEl.classList.remove('loading');
    refEl.innerHTML = `<div class="journal-reflection-label">Aidan</div>${escapeHtml(todayEntry.reflection)}`;
  } else {
    refEl.style.display = 'none';
    refEl.innerHTML = '';
  }
  renderJournalHistory();
  setTimeout(() => ta.focus(), 100);
}

function closeJournalModal() {
  document.getElementById('journalModal').classList.remove('active');
  if (_speechRec) { try { _speechRec.stop(); } catch (e) {} }
}

// Bugünün girişini kaydet/güncelle (reflection opsiyonel)
function upsertJournal(text, reflection) {
  data.journal = data.journal || [];
  const todayStr = today();
  const existing = data.journal.find(j => j.date === todayStr);
  if (existing) {
    existing.text = text;
    if (reflection !== undefined) existing.reflection = reflection;
    existing.when = Date.now();
  } else {
    data.journal.unshift({ date: todayStr, text, reflection: reflection || null, when: Date.now() });
  }
  // Son 60 gün tut
  data.journal = data.journal.slice(0, 60);
  save();
}

function saveJournalOnly() {
  const text = document.getElementById('journalText').value.trim();
  if (!text) { showToast('Önce bir şeyler yaz', 'info', 2000); return; }
  upsertJournal(text);
  renderJournalHistory();
  showToast('Günlük kaydedildi', 'success', 2000);
}

async function submitJournal() {
  const text = document.getElementById('journalText').value.trim();
  if (!text) { showToast('Önce gününü anlat', 'info', 2500); return; }
  if (!window._supa || !window._user) {
    // Bulut yoksa AI çağrısı yapılamaz — yine de lokal kaydet
    upsertJournal(text);
    renderJournalHistory();
    showToast('Kaydedildi (AI yorum için Ayarlar → giriş yap)', 'info', 4000);
    return;
  }
  const btn = document.getElementById('journalSubmitBtn');
  const refEl = document.getElementById('journalReflection');
  btn.disabled = true; btn.textContent = 'Aidan düşünüyor...';
  refEl.style.display = 'block';
  refEl.classList.add('loading');
  refEl.innerHTML = 'Aidan gününü okuyor...';
  try {
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum yok, tekrar giriş yap');
    const r = await fetch(JOURNAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ text }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('sunucu hatası ' + r.status));
    const reflection = j.reflection || '';
    refEl.classList.remove('loading');
    refEl.innerHTML = `<div class="journal-reflection-label">Aidan</div>${escapeHtml(reflection)}`;
    upsertJournal(text, reflection);
    renderJournalHistory();
  } catch (e) {
    refEl.classList.remove('loading');
    refEl.innerHTML = `<div class="journal-reflection-label">Aidan</div>Şu an yorum yapamadım ama gününü kaydettim. (${escapeHtml(e.message)})`;
    upsertJournal(text); // AI başarısız olsa da kaydet
    renderJournalHistory();
  } finally {
    btn.disabled = false; btn.textContent = 'Aidan\'a yorumlat';
  }
}

function deleteJournal(date) {
  data.journal = (data.journal || []).filter(j => j.date !== date);
  save();
  renderJournalHistory();
}

function journalDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const todayStr = today();
  if (dateStr === todayStr) return 'Bugün';
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  if (dateStr === yd.toISOString().slice(0,10)) return 'Dün';
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const days = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function renderJournalHistory() {
  const el = document.getElementById('journalHistory');
  if (!el) return;
  const journal = (data.journal || []).filter(j => j.date !== today()); // bugünü modalın üstünde gösteriyoruz
  if (journal.length === 0) {
    el.innerHTML = '<div class="journal-empty">Geçmiş günlükler burada birikecek </div>';
    return;
  }
  el.innerHTML = journal.map(j => `
    <div class="journal-history-item">
      <button class="journal-history-del" onclick="deleteJournal('${j.date}')" title="Sil">×</button>
      <div class="journal-history-date">${journalDateLabel(j.date)}</div>
      <div class="journal-history-text">${escapeHtml(j.text)}</div>
      ${j.reflection ? `<div class="journal-history-reflection">${escapeHtml(j.reflection)}</div>` : ''}
    </div>
  `).join('');
}

function journalVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Bu tarayıcı sesli girişi desteklemiyor.', 'warning', 4000); return; }
  const ta = document.getElementById('journalText');
  const btn = document.getElementById('journalMic');
  if (_speechRec) { try { _speechRec.stop(); } catch (e) {} return; }
  const rec = new SR();
  rec.lang = 'tr-TR'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
  _speechRec = rec;
  const baseText = ta.value ? ta.value + ' ' : '';
  const cleanup = () => { if (btn) btn.classList.remove('recording'); _speechRec = null; };
  rec.onstart = () => { if (btn) btn.classList.add('recording'); ta.focus(); };
  rec.onresult = (e) => {
    let final = '', interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t + ' '; else interim += t;
    }
    ta.value = (baseText + final + interim).trim();
  };
  rec.onerror = (e) => {
    cleanup();
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') showToast('Mikrofon izni reddedildi.', 'warning', 4000);
    else if (e.error === 'no-speech') showToast('Ses duyulmadı', 'info', 2000);
  };
  rec.onend = () => { cleanup(); };
  try { rec.start(); } catch (err) { cleanup(); showToast('Mikrofon başlatılamadı', 'error', 3000); }
}

