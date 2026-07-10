// ============ ODAK GÖREV SEÇİCİ (Odak sekmesinden görev bağla) ============
function openFocusPick() {
  renderFocusPick();
  document.getElementById('focusPickModal').classList.add('active');
}
function closeFocusPick() {
  document.getElementById('focusPickModal').classList.remove('active');
}
function renderFocusPick() {
  const el = document.getElementById('focusPickList');
  if (!el) return;
  const td = today();
  const active = (data.tasks || []).filter(t => !t.done);
  // MIT / acil / gecikmiş / hatırlatmalı önce
  const score = t => (t.mitDate === td ? 1000 : 0) + (t.priority === 'urgent' ? 100 : 0) +
    ((t.due && t.due <= td) ? 50 : 0) + (t.reminderTime ? 10 : 0);
  active.sort((a, b) => score(b) - score(a));
  if (!active.length) {
    el.innerHTML = '<div class="focuspick-empty">Bitmemiş görev yok <br>Serbest çalışmak için kapat, ▶️ Başla\'ya bas.</div>';
    return;
  }
  const catE = { odev: '', ders: '', ev: '', kisisel: '' };
  el.innerHTML = active.slice(0, 30).map(t => {
    const mit = t.mitDate === td ? '' : '';
    const meta = t.actualMin ? `<span class="fp-est">bugüne dek ${t.actualMin}dk</span>`
      : (t.estimateMin ? `<span class="fp-est">~${t.estimateMin}dk</span>` : '');
    return `<button class="focuspick-item ${currentFocusTaskId === t.id ? 'current' : ''}" onclick="bindFocusTask(${t.id})">
      <span class="fp-cat">${catE[t.category] || '•'}</span>
      <span class="fp-text">${mit}${escapeHtml(t.text)}</span>
      ${meta}
    </button>`;
  }).join('');
}
function bindFocusTask(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  currentFocusTaskId = id;
  // focusStartTime'a dokunma — ▶️ Başla'ya basınca startTimer başlatır
  const focusEl = document.getElementById('focusTask');
  if (focusEl) {
    focusEl.innerHTML = '' + escapeHtml(t.text) +
      ' <button class="focus-unbind" onclick="event.stopPropagation(); dropFocusTask()" title="Bağı kaldır">✕</button>';
    focusEl.classList.remove('empty');
  }
  updateActiveTaskBanner();
  closeFocusPick();
  showToast('Odak görevin hazır — ▶️ Başla', 'success', 2500);
}

// ============ FİLTRE ============
let _taskFilter = localStorage.getItem('aidan_filter') || 'all';

function setFilter(f, btn) {
  _taskFilter = f;
  localStorage.setItem('aidan_filter', f);
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else {
    const target = document.querySelector(`[data-filter="${f}"]`);
    if (target) target.classList.add('active');
  }
  renderTasks();
}

function initFilter() {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  const target = document.querySelector(`[data-filter="${_taskFilter}"]`);
  if (target) target.classList.add('active');
  else { _taskFilter = 'all'; document.querySelector('[data-filter="all"]').classList.add('active'); }
}

// 7+ gün önce bitmiş görev = arşivlik (ana görünümde gizlenir, "Bitenler"de arşiv bölümünde)
function isArchivedDone(t) {
  if (!t.done || !t.doneDate) return false;
  const d = new Date(); d.setDate(d.getDate() - 7);
  return t.doneDate < d.toISOString().slice(0, 10);
}

function filterTasks(tasks) {
  const ts = today();
  let filtered;
  switch (_taskFilter) {
    case 'today':
      filtered = tasks.filter(t => !t.done && (
        t.mitDate === ts ||
        t.priority === 'urgent' ||
        (t.due && t.due <= ts) ||
        !t.due
      ));
      break;
    case 'urgent':
      filtered = tasks.filter(t => !t.done && t.priority === 'urgent');
      break;
    case 'odev':
    case 'ders':
    case 'ev':
    case 'kisisel':
      filtered = tasks.filter(t => !t.done && t.category === _taskFilter);
      break;
    case 'done':
      filtered = tasks.filter(t => t.done);
      break;
    default:
      // Ana görünüm: eski bitenler (7+ gün) gizli — temiz kalsın (arşiv "Bitenler"de)
      filtered = tasks.filter(t => !isArchivedDone(t));
  }
  // Arama uygula
  const searchEl = document.getElementById('taskSearch');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  if (q) {
    filtered = filtered.filter(t =>
      t.text.toLowerCase().includes(q) ||
      (t.subtasks && t.subtasks.some(s => s.text.toLowerCase().includes(q)))
    );
  }
  return filtered;
}

function updateFilterCounts() {
  const ts = today();
  const total = data.tasks.length;
  const todayCount = data.tasks.filter(t => !t.done && (
    t.mitDate === ts || t.priority === 'urgent' || (t.due && t.due <= ts) || !t.due
  )).length;
  const setCnt = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n > 0 ? n : ''; };
  setCnt('cnt-all', total);
  setCnt('cnt-today', todayCount);
  setCnt('cnt-urgent', data.tasks.filter(t => !t.done && t.priority === 'urgent').length);
  setCnt('cnt-odev', data.tasks.filter(t => !t.done && t.category === 'odev').length);
  setCnt('cnt-ders', data.tasks.filter(t => !t.done && t.category === 'ders').length);
  setCnt('cnt-ev', data.tasks.filter(t => !t.done && t.category === 'ev').length);
  setCnt('cnt-kisisel', data.tasks.filter(t => !t.done && t.category === 'kisisel').length);
  setCnt('cnt-done', data.tasks.filter(t => t.done).length);
}

// ============ TOAST & MODAL ============
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
  // Tıklayınca kapat
  toast.addEventListener('click', () => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  });
}

// Undo toast — mesaj + "Geri al" butonu, 5sn timeout
function showUndoToast(message, onUndo, duration = 5000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast info';
  const inner = document.createElement('div');
  inner.className = 'toast-undo';
  const msg = document.createElement('span');
  msg.textContent = message;
  const btn = document.createElement('button');
  btn.className = 'undo-btn';
  btn.textContent = 'Geri al';
  inner.appendChild(msg);
  inner.appendChild(btn);
  toast.appendChild(inner);
  container.appendChild(toast);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  };
  const timer = setTimeout(close, duration);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(timer);
    close();
    try { onUndo(); } catch (err) { console.error('Undo failed', err); }
  });
}

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

// Klavye kısayolu: "/" → quick capture'a odaklan
document.addEventListener('keydown', e => {
  if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const qc = document.getElementById('quickCapture');
    if (qc) {
      e.preventDefault();
      qc.focus();
      qc.select();
    }
  }
});

// Enter ile gönder (textarea hariç — orada Ctrl+Enter)
document.addEventListener('keydown', e => {
  if (!document.getElementById('inputModal').classList.contains('active')) return;
  if (e.key === 'Enter') {
    const textarea = document.getElementById('inputModalTextarea');
    if (textarea.style.display !== 'none' && !e.ctrlKey && !e.metaKey) return; // textarea'da normal Enter newline
    e.preventDefault();
    resolveInputModal();
  } else if (e.key === 'Escape') {
    cancelInputModal();
  }
});

// ============ ŞU AN NE YAPAYIM? ============
let _suggestedTaskId = null;
let _recentSuggestions = [];
let _currentEnergy = null;

function suggestTask(energy = _currentEnergy) {
  _currentEnergy = energy;
  const pending = data.tasks.filter(t => !t.done);
  if (pending.length === 0) {
    alert('Tüm görevlerini bitirmişsin!\n\nYeni görev ekle veya dinlen. Bonus her şey hediye. ');
    return;
  }

  const todayStr = today();

  // Enerjiye göre havuzu daralt — ADHD enerji dalgasına uy. Boş kalırsa tüm havuza düş.
  let pool = pending;
  if (energy === 'low') {
    const easy = pending.filter(t => !t.estimateMin || t.estimateMin <= 20);
    if (easy.length) pool = easy;
  } else if (energy === 'high') {
    const hard = pending.filter(t => (t.estimateMin && t.estimateMin >= 30) || t.priority === 'urgent' || (t.due && t.due <= todayStr));
    if (hard.length) pool = hard;
  }

  const buckets = [
    { reason: 'Bugünün 3\'ünden', tasks: pool.filter(t => t.mitDate === todayStr) },
    { reason: 'Acil görevin var', tasks: pool.filter(t => t.priority === 'urgent' && t.mitDate !== todayStr) },
    { reason: '⏰ Bunu geçirme — son gün bugün', tasks: pool.filter(t => t.due === todayStr && t.priority !== 'urgent' && t.mitDate !== todayStr) },
    { reason: 'Bu zaten gecikti', tasks: pool.filter(t => t.due && t.due < todayStr && t.mitDate !== todayStr && t.priority !== 'urgent') },
    { reason: 'Kısa bir şey: bunu yap', tasks: pool.filter(t => t.estimateMin && t.estimateMin <= 15 && !t.mitDate && t.priority !== 'urgent' && (!t.due || t.due > todayStr)) },
    { reason: 'Rastgele bir şey', tasks: pool.filter(t => !t.mitDate && t.priority !== 'urgent' && (!t.due || t.due > todayStr)) }
  ];

  // Düşük enerjide: önce kısa işi öne al (kolay kazanım = momentum)
  if (energy === 'low') buckets.unshift(buckets.splice(4, 1)[0]);

  let selected = null, reason = '';
  for (const b of buckets) {
    if (b.tasks.length > 0) {
      // Son 5 öneride olmayanları tercih et
      const fresh = b.tasks.filter(t => !_recentSuggestions.includes(t.id));
      const candidatePool = fresh.length > 0 ? fresh : b.tasks;
      selected = candidatePool[Math.floor(Math.random() * candidatePool.length)];
      reason = b.reason;
      break;
    }
  }

  if (!selected) {
    // Hiç filtre eşleşmediyse havuzdan rastgele
    selected = pool[Math.floor(Math.random() * pool.length)];
    reason = 'Bunu deneyebilirsin';
  }

  // Enerji ipucu — seçilmişse reason'a ekle
  if (energy === 'low') reason = 'Düşük enerji · ' + reason;
  else if (energy === 'high') reason = 'Yüksek enerji · ' + reason;

  // Enerji butonlarının aktif halini güncelle
  document.querySelectorAll('#energyRow .energy-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.energy === energy);
  });

  _suggestedTaskId = selected.id;
  _recentSuggestions.push(selected.id);
  if (_recentSuggestions.length > 5) _recentSuggestions.shift();

  document.getElementById('suggestReason').textContent = reason;
  document.getElementById('suggestTaskText').textContent = selected.text;

  const meta = [];
  if (selected.priority === 'urgent') meta.push('ACİL');
  if (selected.category) {
    const cat = { odev: 'Ödev', ders: 'Özel Ders', ev: 'Ev', kisisel: 'Kişisel' };
    if (cat[selected.category]) meta.push(cat[selected.category]);
  }
  if (selected.estimateMin) meta.push(`⏱️ ${selected.estimateMin} dk`);
  if (selected.due === todayStr) meta.push('Bugün son gün');
  else if (selected.due && selected.due < todayStr) meta.push('Gecikti');

  document.getElementById('suggestMeta').innerHTML =
    meta.map(m => `<span class="badge">${escapeHtml(m)}</span>`).join('');

  document.getElementById('suggestModal').classList.add('active');
}

function acceptSuggestion(fiveMinMode) {
  if (!_suggestedTaskId) return;
  const id = _suggestedTaskId;
  closeSuggestModal();
  startTaskNow(id, fiveMinMode);
}

// AI "Sen ne yapayım?" — context'i AI'a yollar, kişisel öneri çeker.
// Modal zaten açık olmalı (energy seçilmiş). AI fail olursa local seçim kalır.
async function aiSuggestTask() {
  const btn = document.getElementById('aiSuggestBtn');
  if (!btn) return;
  const energy = _currentEnergy || 'mid';
  const todayStr = today();
  const pending = (data.tasks || []).filter(t => !t.done).slice(0, 40);
  if (!pending.length) { showToast('Aktif görev yok', 'info', 2500); return; }

  // Görev özetleri (token tasarrufu için sade)
  const taskSummaries = pending.map(t => {
    const ageDays = t.created ? Math.floor((Date.now() - new Date(t.created).getTime()) / 86400000) : 0;
    return {
      id: t.id,
      text: (t.text || '').slice(0, 80),
      priority: t.priority || 'normal',
      category: t.category || null,
      estimateMin: t.estimateMin || null,
      mit: t.mitDate === todayStr,
      dueToday: t.due === todayStr,
      dueTomorrow: t.due === todayDate(1),
      overdue: t.due && t.due < todayStr,
      ageDays,
    };
  });

  const doneToday = (data.tasks || []).filter(t => t.done && t.doneDate === todayStr).length;
  const pomoToday = (data.pomoToday && data.pomoToday.date === todayStr) ? (data.pomoToday.count || 0) : 0;
  const hour = new Date().getHours();

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'düşünüyor…';

  try {
    const token = await getSupaToken();
    if (!token) { showToast('Önce Supabase\'e giriş yap', 'warning', 3000); btn.disabled = false; btn.textContent = originalText; return; }

    const r = await fetch(SUGGEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ energy, hour, doneToday, pomoToday, tasks: taskSummaries }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.taskId) {
      showToast('AI öneri üretemedi — mevcut seçim kalıyor', 'warning', 3000);
      btn.disabled = false; btn.textContent = originalText; return;
    }

    const selected = (data.tasks || []).find(t => t.id === j.taskId);
    if (!selected) {
      showToast('AI bulduğu görev yok — listeyi yenile', 'warning', 3000);
      btn.disabled = false; btn.textContent = originalText; return;
    }

    // Modal'ı AI sonucuyla güncelle (modal zaten açık)
    _suggestedTaskId = selected.id;
    _recentSuggestions.push(selected.id);
    if (_recentSuggestions.length > 5) _recentSuggestions.shift();

    document.getElementById('suggestReason').textContent = '' + (j.reason || 'AI önerisi');
    document.getElementById('suggestTaskText').textContent = selected.text;

    const meta = [];
    if (selected.priority === 'urgent') meta.push('ACİL');
    if (selected.category) {
      const cat = { odev: 'Ödev', ders: 'Özel Ders', ev: 'Ev', kisisel: 'Kişisel' };
      if (cat[selected.category]) meta.push(cat[selected.category]);
    }
    if (selected.estimateMin) meta.push(`⏱️ ${selected.estimateMin} dk`);
    if (selected.due === todayStr) meta.push('Bugün son gün');
    else if (selected.due && selected.due < todayStr) meta.push('Gecikti');
    document.getElementById('suggestMeta').innerHTML = meta.map(m => `<span class="badge">${escapeHtml(m)}</span>`).join('');
  } catch (e) {
    showToast('Hata: ' + e.message, 'warning', 3500);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// today() bugün, todayDate(+1) yarın için yardımcı
function todayDate(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function closeSuggestModal() {
  document.getElementById('suggestModal').classList.remove('active');
  _suggestedTaskId = null;
  _currentEnergy = null;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSuggestModal();
});

function sortTasks(tasks) {
  const priorityOrder = { urgent: 0, normal: 1, low: 2 };
  const todayStr = today();
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    // MIT (Bugünün 3'ü) en üstte
    const aMit = a.mitDate === todayStr ? 0 : 1;
    const bMit = b.mitDate === todayStr ? 0 : 1;
    if (aMit !== bMit) return aMit - bMit;
    const pa = priorityOrder[a.priority] ?? 1;
    const pb = priorityOrder[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return b.id - a.id;
  });
}

function dueLabel(due) {
  if (!due) return '';
  const d = new Date(due);
  const t = new Date(today());
  const diff = Math.round((d - t) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)} gün gecikti`, cls: 'due-today' };
  if (diff === 0) return { text: 'Bugün son gün!', cls: 'due-today' };
  if (diff === 1) return { text: 'Yarın', cls: 'due-soon' };
  if (diff <= 3) return { text: `${diff} gün kaldı`, cls: 'due-soon' };
  return { text: `${due}`, cls: '' };
}

function taskAgeDays(t) {
  if (!t.created) return 0;
  // 'tr-TR locale string' biçimini parse et
  const m = t.created.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  let createdMs;
  if (m) {
    createdMs = new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  } else {
    createdMs = new Date(t.created).getTime();
  }
  if (isNaN(createdMs)) return 0;
  return Math.floor((Date.now() - createdMs) / 86400000);
}

function renderTaskItem(t) {
  const todayStr = today();
  const isMit = t.mitDate === todayStr;
  const isActive = !t.done && currentFocusTaskId === t.id;
  const cls = [
    t.done ? 'done' : '',
    t.priority === 'urgent' ? 'urgent' : '',
    t.priority === 'low' ? 'low' : '',
    t.category ? 'cat-' + t.category : '',
    isMit ? 'mit' : '',
    isActive ? 'active-focus' : ''
  ].filter(x => x).join(' ');
  const due = dueLabel(t.due);
  const age = t.done ? 0 : taskAgeDays(t);
  const showAge = !t.done && age >= 5 && !t.repeat;
  return `
    <div class="task-row">
    <div class="task ${cls}" data-id="${t.id}">
      <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTask(${t.id})">
      <div style="flex:1;">
        <div class="task-text">${isMit ? '<svg class="icon fill" viewBox="0 0 24 24" aria-hidden="true" style="color:var(--accent);vertical-align:-0.16em;margin-right:5px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' : ''}${escapeHtml(t.text)}</div>
        ${t.notes ? `<div class="task-notes">${escapeHtml(t.notes)}</div>` : ''}
        ${(!t.done && (t.postponeCount || 0) >= 3 && !t.nudgeDismissed) ? `<div class="postpone-nudge" onclick="postponeNudge(${t.id})">${t.postponeCount} kez ertelendi · dokun, kolaylaştıralım </div>` : ''}
        <div class="task-meta">
          ${t.priority === 'urgent' ? '<span class="badge" style="background:#ff5555;color:white;">ACİL</span>' : ''}
          ${t.category ? `<span class="badge">${({odev:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',ders:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',ev:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',kisisel:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'})[t.category]||''}${({odev:'Ödev',ders:'Özel Ders',ev:'Ev',kisisel:'Kişisel'})[t.category] || t.category}</span>` : ''}
          ${due ? `<span class="badge ${due.cls}">${due.text}</span>` : ''}
          ${t.estimateMin ? `<span class="badge">⏱️ ${t.estimateMin}dk</span>` : ''}
          ${t.actualMin ? (() => {
            if (t.estimateMin) {
              const d = t.actualMin - t.estimateMin;
              const dt = d === 0 ? 'tam isabet' : (d > 0 ? `+${d}dk` : `${d}dk`);
              return `<span class="badge" title="Gerçek odak süresi vs tahminin">✓ ${t.actualMin}dk · tahmin ${t.estimateMin} (${dt})</span>`;
            }
            return `<span class="badge">✓ ${t.actualMin}dk sürdü</span>`;
          })() : ''}
          ${t.repeat ? `<span class="badge">${({daily:'Günlük',weekly:'Haftalık',weekdays:'Hafta içi',weekends:'Hafta sonu'})[t.repeat] || t.repeat}</span>` : ''}
          ${t.reminderTime ? `<span class="badge" style="background:rgba(245,165,36,0.15);color:var(--accent);border-color:rgba(245,165,36,0.3);">${t.reminderTime}</span>` : ''}
          ${showAge ? `<span class="badge" style="background:rgba(210,153,34,0.12);color:var(--warning);border-color:rgba(210,153,34,0.3);" title="Bu görev ${age} gündür duruyor — bitirebilir misin yoksa silmeli mi?"> ${age}g</span>` : ''}
          ${t.seriesId ? (() => { const sp = seriesProgress(t.seriesId); return `<span class="badge series-badge" title="${escapeHtml(t.seriesName||'Seri')}" onclick="event.stopPropagation(); showSeries('${t.seriesId}')">${escapeHtml((t.seriesName||'Seri').slice(0,18))} ${sp.done}/${sp.total}</span>`; })() : ''}
        </div>
        ${t.subtasks && t.subtasks.length ? `
        <div class="subtasks">
          ${t.subtasks.map((s,i) => `
            <div class="subtask">
              <input type="checkbox" ${s.done?'checked':''} onchange="toggleSub(${t.id},${i})">
              <span style="${s.done?'text-decoration:line-through;opacity:0.5':''}; flex:1;">${escapeHtml(s.text)}</span>
              <button class="subtask-del" onclick="deleteSubtask(${t.id},${i})" title="Sil">×</button>
            </div>
          `).join('')}
          <button class="subtask-add" onclick="addSubtask(${t.id})">+ alt adım</button>
        </div>
        ` : ''}
      </div>
      <div class="task-actions">
        <button class="small ${isMit ? 'mit-on' : 'secondary'}" onclick="toggleMit(${t.id})" title="${isMit ? 'Bugünün 3\'ünden çıkar' : 'Bugünün 3\'üne ekle'}" aria-label="${isMit ? 'MIT' : 'MIT yap'}"><svg class="icon${isMit ? ' fill' : ''}" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>
        <button class="small" onclick="startTaskNow(${t.id}, false)" title="Şimdi başla — odak moduna geçer" aria-label="Başla"><svg class="icon fill" viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg></button>
        ${t.done || !t.estimateMin || t.estimateMin <= 5 ? '' : `<button class="small secondary" onclick="startTaskNow(${t.id}, true)" title="Sadece 2 dakika dene — başlamanın altın kuralı" aria-label="2 dakika dene"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>2dk</button>`}
        ${t.done ? '' : `<button class="small secondary" onclick="postponeTask(${t.id})" title="Ertele — başka güne kaydır" aria-label="Ertele"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>`}
        ${t.done ? '' : `<button class="small secondary" onclick="addSubtask(${t.id})" title="Alt adım ekle" aria-label="Alt adım ekle"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg></button>`}
        ${t.done ? '' : `<button class="small secondary" onclick="aiSplitTask(${t.id})" title="AI ile küçük adımlara böl" aria-label="AI ile böl"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg></button>`}
        <button class="small secondary" onclick="editTask(${t.id})" title="Düzenle" aria-label="Düzenle"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
        <button class="small danger" onclick="deleteTask(${t.id})" title="Sil" aria-label="Sil"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </div>
    </div>
    </div>
  `;
}

function renderTasks() {
  if (typeof renderDailyScore === 'function') renderDailyScore();
  const list = document.getElementById('taskList');
  const sorted = sortTasks(filterTasks(data.tasks));
  const todayStr = today();

  if (sorted.length === 0) {
    const emptyMsg = _taskFilter === 'all'
      ? 'Henüz görev yok. Yukarıdan ekle 👆'
      : 'Bu filtreye uyan görev yok. <a href="#" onclick="setFilter(\'all\', null); return false;" style="color:var(--accent);">Hepsini göster</a>';
    list.innerHTML = '<div class="empty">' + emptyMsg + '</div>';
  } else if (_taskFilter === 'all') {
    // İki gruba böl: Şimdi (bugün üzerinde çalışılabilir) ve Sonra (gelecek tarihli)
    const simdi = sorted.filter(t => t.done || !t.due || t.due <= todayStr || t.priority === 'urgent' || t.mitDate === todayStr);
    const sonra = sorted.filter(t => !t.done && t.due && t.due > todayStr && t.priority !== 'urgent' && t.mitDate !== todayStr);
    let html = '';
    if (simdi.length > 0) html += simdi.map(renderTaskItem).join('');
    if (sonra.length > 0) {
      html += `
        <details style="margin-top: 14px;">
          <summary style="cursor:pointer; padding: 10px 14px; background: var(--bg-elev); border-radius: 8px; border: 1px solid var(--border-soft); color: var(--text-muted); font-size: 0.88em; user-select: none;">
            Sonraki günler (${sonra.length})
          </summary>
          <div style="margin-top: 6px;">
            ${sonra.map(renderTaskItem).join('')}
          </div>
        </details>
      `;
    }
    list.innerHTML = html;
  } else if (_taskFilter === 'done') {
    // Bitenler: son 7 gün üstte, daha eskiler katlanır "Arşiv" bölümünde
    const recent = sorted.filter(t => !isArchivedDone(t));
    const archived = sorted.filter(t => isArchivedDone(t));
    let html = recent.map(renderTaskItem).join('');
    if (archived.length > 0) {
      html += `
        <details style="margin-top: 14px;">
          <summary style="cursor:pointer; padding: 10px 14px; background: var(--bg-elev); border-radius: 8px; border: 1px solid var(--border-soft); color: var(--text-muted); font-size: 0.88em; user-select: none;">
            Arşiv · 7+ gün önce bitenler (${archived.length})
          </summary>
          <div style="margin-top: 6px;">
            ${archived.map(renderTaskItem).join('')}
          </div>
        </details>
      `;
    }
    list.innerHTML = html;
  } else {
    list.innerHTML = sorted.map(renderTaskItem).join('');
  }

  const total = data.tasks.length;
  const done = data.tasks.filter(t => t.done).length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statLeft').textContent = total - done;
  renderMit();
  renderCapacity();
  renderEveningSummary();
  renderWeeklyInsight();
  renderDumps();
  updateFilterCounts();
  updateActiveTaskBanner();
  // Swipe gestures: render'dan sonra her task'a touch handler bağla
  document.querySelectorAll('.task[data-id]').forEach(el => {
    if (el._swipeAttached) return;
    const id = parseInt(el.dataset.id);
    if (id) { attachSwipe(el, id); el._swipeAttached = true; }
  });
}

// Sağa swipe = toggleTask (tamamla, undo'lu) · Sola swipe = deleteTask (sil, undo'lu)
const SWIPE_CHECK_ICON = '<svg class="icon fill" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SWIPE_TRASH_ICON = '<svg class="icon" viewBox="0 0 24 24" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

function attachSwipe(taskEl, taskId) {
  let startX = 0, startY = 0, dx = 0, dy = 0;
  let axis = null;
  let bg = null;
  const THRESHOLD = 80;

  const ensureBg = () => {
    if (!bg) {
      bg = document.createElement('div');
      bg.className = 'task-swipe-bg';
      // bg, .task-row içine sibling olarak girer — task translate edince sabit kalır
      const row = taskEl.parentElement;
      if (row && row.classList.contains('task-row')) row.insertBefore(bg, taskEl);
      else taskEl.insertBefore(bg, taskEl.firstChild); // fallback
    }
    return bg;
  };

  const reset = () => {
    taskEl.style.transform = '';
    taskEl.classList.remove('swiping');
    taskEl.classList.add('snap-back');
    setTimeout(() => taskEl.classList.remove('snap-back'), 260);
    if (bg) { bg.remove(); bg = null; }
    axis = null; dx = 0; dy = 0;
  };

  taskEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    // Action butonlarına ya da checkbox'a tıklarken swipe başlatma — onların kendi handler'ı var
    const target = e.target;
    if (target && target.closest('button, input, a, .badge.series-badge')) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    dx = 0; dy = 0; axis = null;
    taskEl.classList.remove('snap-back');
  }, { passive: true });

  taskEl.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1 || startX === 0 && startY === 0) return;
    const t = e.touches[0];
    dx = t.clientX - startX;
    dy = t.clientY - startY;

    if (axis === null) {
      if (Math.abs(dx) + Math.abs(dy) < 8) return;
      // Yatay hareket dikeyin 1.3 katından fazlaysa yatay swipe; aksi halde dikey scroll için bırak
      axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
      if (axis === 'x') taskEl.classList.add('swiping');
    }

    if (axis !== 'x') return;
    e.preventDefault();

    // Threshold'dan sonra direnç (Apple Mail tarzı)
    let visible = dx;
    if (Math.abs(dx) > THRESHOLD * 1.8) {
      const overflow = Math.abs(dx) - THRESHOLD * 1.8;
      visible = Math.sign(dx) * (THRESHOLD * 1.8 + overflow * 0.4);
    }
    taskEl.style.transform = `translateX(${visible}px)`;

    const b = ensureBg();
    const active = Math.abs(dx) > THRESHOLD;
    if (dx > 0) {
      b.className = 'task-swipe-bg right';
      b.innerHTML = SWIPE_CHECK_ICON + `<span>${active ? 'Tamamla ✓' : 'Tamamla'}</span>`;
    } else {
      b.className = 'task-swipe-bg left';
      b.innerHTML = `<span>${active ? '✗ Sil' : 'Sil'}</span>` + SWIPE_TRASH_ICON;
    }
    b.style.opacity = Math.min(1, Math.abs(dx) / THRESHOLD);
  }, { passive: false });

  const endHandler = () => {
    if (axis === 'x' && Math.abs(dx) > THRESHOLD) {
      // Aksiyon — re-render zaten taskEl'i yok edecek, animasyon kaba ama undo toast var
      if (dx > 0) {
        if (typeof toggleTask === 'function') toggleTask(taskId);
      } else {
        if (typeof deleteTask === 'function') deleteTask(taskId);
      }
    } else {
      reset();
    }
  };
  taskEl.addEventListener('touchend', endHandler);
  taskEl.addEventListener('touchcancel', reset);
}

// ============ HAFTALIK INSIGHT (Pazartesi açılınca otomatik) ============
function getISOWeekStr(d) {
  const date = new Date(d);
  date.setHours(0,0,0,0);
  // Pazartesi = 1 ... Pazar = 7
  const day = (date.getDay() + 6) % 7 + 1;
  date.setDate(date.getDate() + 4 - day);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2,'0')}`;
}
function getMondayIso(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const day = (d.getDay() + 6) % 7; // Pazartesi=0, Pazar=6
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0,10);
}

function renderWeeklyInsight() {
  const el = document.getElementById('weeklyInsight');
  if (!el) return;
  const todayD = new Date();
  const dayOfWeek = (todayD.getDay() + 6) % 7; // Pzt=0, Sal=1, ... Paz=6
  const thisWeekISO = getISOWeekStr(todayD);

  // Sadece Pzt/Sal/Çar göster; sonraki günlerde kapanır
  if (dayOfWeek > 2) { el.style.display = 'none'; return; }
  // Daha önce bu hafta görüntüleyip kapattıysa: gösterme
  if (data.lastWeeklyView === thisWeekISO) { el.style.display = 'none'; return; }

  // Geçen haftanın aralığı: önceki pazartesi → önceki pazar
  const thisMon = getMondayIso(0);
  const lastMon = getMondayIso(7);
  const lastSun = getMondayIso(1);

  const doneLast = data.tasks.filter(t => t.doneDate && t.doneDate >= lastMon && t.doneDate <= lastSun);
  // Hiç görev bitmediyse insight'a değmez — gizle
  if (doneLast.length === 0) { el.style.display = 'none'; return; }

  // Bu hafta — karşılaştırma için
  const doneThis = data.tasks.filter(t => t.doneDate && t.doneDate >= thisMon);

  // Top category
  const catLabels = { odev: 'Ödev', ders: 'Özel Ders', ev: 'Ev', kisisel: 'Kişisel' };
  const byCat = {};
  doneLast.forEach(t => {
    const c = t.category || 'kategorisiz';
    byCat[c] = (byCat[c] || 0) + 1;
  });
  const topCat = Object.entries(byCat).sort((a,b) => b[1]-a[1])[0];

  // En verimli gün
  const byDay = {};
  doneLast.forEach(t => { byDay[t.doneDate] = (byDay[t.doneDate]||0) + 1; });
  const topDayEntry = Object.entries(byDay).sort((a,b) => b[1]-a[1])[0];
  let topDayLabel = '';
  if (topDayEntry && topDayEntry[1] >= 2) {
    const dn = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'][new Date(topDayEntry[0]).getDay()];
    topDayLabel = `${dn} (${topDayEntry[1]})`;
  }

  // MIT bitiş
  const mitDoneLast = doneLast.filter(t => t.mitDate && t.mitDate === t.doneDate).length;

  // Gecikmiş bekleyen (şu an)
  const todayStr = today();
  const overdueCount = data.tasks.filter(t => !t.done && t.due && t.due < todayStr).length;

  // Bir cümle pattern note
  let note = '';
  if (topDayLabel) note = `En verimli günün: ${topDayLabel}. Bu hafta da o gün için zor şeyleri sakla.`;
  else if (mitDoneLast >= 3) note = `${mitDoneLast} MIT bitirdin — bu güzel ritm.`;
  else if (topCat) note = `En çok ${catLabels[topCat[0]] || topCat[0]}'da çalıştın.`;
  else note = 'Yeni hafta, yeni başlangıç. ';

  const compare = doneThis.length === 0 ? '' :
    (doneThis.length >= doneLast.length ? ` · Bu hafta zaten <b>${doneThis.length}</b> tane biten var ` : '');

  el.innerHTML = `
    <button class="wi-close" onclick="closeWeeklyInsight()" aria-label="Kapat">×</button>
    <div class="wi-title">Geçen hafta özetin</div>
    <div class="wi-stats">
      <span class="wi-stat"><b>${doneLast.length}</b> görev bitti</span>
      ${mitDoneLast ? `<span class="wi-stat"><b>${mitDoneLast}</b> MIT</span>` : ''}
      ${topCat ? `<span class="wi-stat">${catLabels[topCat[0]] || topCat[0]} (${topCat[1]})</span>` : ''}
      ${overdueCount ? `<span class="wi-stat" style="color:var(--warning,#e5a117);">${overdueCount} gecikmiş bekliyor</span>` : ''}
    </div>
    <div class="wi-note">${note}${compare}</div>
  `;
  el.style.display = 'block';
}

function closeWeeklyInsight() {
  const el = document.getElementById('weeklyInsight');
  if (el) el.style.display = 'none';
  data.lastWeeklyView = getISOWeekStr(new Date());
  save();
}

// ============ HAFTALIK KARNE (istediğinde aç — Karne butonu) ============
let _karneWeek = 'this'; // 'this' | 'last'
const KARNE_CAT = { odev: 'Ödev', ders: 'Özel Ders', ev: 'Ev', kisisel: 'Kişisel', kategorisiz: '• Diğer' };
const KARNE_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const KARNE_DAYS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

// Pazartesi ISO'sundan o haftanın 7 gün dizisini üretir (öğlen demirli → UTC kayması yok)
function daysOfWeekIso(mondayIso) {
  const out = [];
  const base = new Date(mondayIso + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// iso tarihinden 1 gün öncesi (öğlen demirli → UTC kayması yok)
function prevDayIso(iso) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// weeksAgo: 0 = bu hafta, 1 = geçen hafta, 2 = önceki hafta...
// Görev bitince o saatin sayacını artır — data.hourStats = {0..23: count}.
// Zamanla dolan histogram; "en verimli saatin" analizini besler.
function recordDoneHour() {
  data.hourStats = data.hourStats || {};
  const h = new Date().getHours();
  data.hourStats[String(h)] = (data.hourStats[String(h)] || 0) + 1;
}

// En verimli saat aralığını hesapla. Yeterli veri yoksa (toplam < 6) null döner.
function bestHourInfo() {
  const hs = data.hourStats || {};
  let total = 0;
  const arr = new Array(24).fill(0);
  for (let h = 0; h < 24; h++) { const c = hs[String(h)] || 0; arr[h] = c; total += c; }
  if (total < 6) return { ready: false, total };
  let bestStart = 0, bestSum = -1;
  for (let h = 0; h < 24; h++) {
    const sum = arr[h] + arr[(h + 1) % 24];
    if (sum > bestSum) { bestSum = sum; bestStart = h; }
  }
  const end = (bestStart + 2) % 24;
  const pad = n => String(n).padStart(2, '0');
  const label = `${pad(bestStart)}:00–${pad(end)}:00`;
  let part = '';
  if (bestStart >= 5 && bestStart < 12) part = 'sabah';
  else if (bestStart >= 12 && bestStart < 17) part = 'öğleden sonra';
  else if (bestStart >= 17 && bestStart < 22) part = 'akşam';
  else part = 'gece';
  return { ready: true, total, label, part, count: bestSum };
}

function karneStats(weeksAgo) {
  const start = getMondayIso(weeksAgo * 7);
  // Haftanın sonu: bu hafta → bugün; geçmiş hafta → bir sonraki pazartesiden önceki gün (o haftanın pazarı)
  const end = weeksAgo === 0 ? today() : prevDayIso(getMondayIso((weeksAgo - 1) * 7));
  const tasks = data.tasks || [];
  const done = tasks.filter(t => t.doneDate && t.doneDate >= start && t.doneDate <= end);
  const byCat = {};
  done.forEach(t => { const c = t.category || 'kategorisiz'; byCat[c] = (byCat[c] || 0) + 1; });
  const dayIsos = daysOfWeekIso(start);
  const byDayArr = dayIsos.map(iso => done.filter(t => t.doneDate === iso).length);
  const mitDone = done.filter(t => t.mitDate && t.mitDate >= start && t.mitDate <= end).length;
  let focusMin = 0;
  done.forEach(t => { if (t.actualMin) focusMin += t.actualMin; });
  return { start, end, done: done.length, byCat, dayIsos, byDayArr, mitDone, focusMin };
}

function openKarneModal() {
  _karneWeek = 'this';
  renderKarne();
  document.getElementById('karneModal').classList.add('active');
}
function closeKarneModal() {
  document.getElementById('karneModal').classList.remove('active');
}
function setKarneWeek(w) { _karneWeek = w; renderKarne(); }

function renderKarne() {
  const el = document.getElementById('karneBody');
  if (!el) return;
  const which = _karneWeek;
  const weeksAgo = which === 'last' ? 1 : 0;
  const s = karneStats(weeksAgo);
  const other = karneStats(weeksAgo + 1); // gösterilen haftadan bir önceki hafta

  const tabs = `
    <div class="krn-tabs">
      <button class="krn-tab ${which === 'this' ? 'active' : ''}" onclick="setKarneWeek('this')">Bu hafta</button>
      <button class="krn-tab ${which === 'last' ? 'active' : ''}" onclick="setKarneWeek('last')">Geçen hafta</button>
    </div>`;

  // Hiç biten yoksa: nazik boş durum
  if (s.done === 0) {
    const msg = which === 'this'
      ? 'Hafta yeni başladı — ilk görevi bitirince burası dolmaya başlar. '
      : 'Geçen hafta kayıt yok. Sorun değil, önemli olan bugün. ';
    el.innerHTML = tabs + `<div class="krn-empty">${msg}</div>`;
    return;
  }

  // Karşılaştırma
  let cmp = '';
  const diff = s.done - other.done;
  if (other.done > 0 || s.done > 0) {
    if (diff > 0) cmp = `<span class="krn-cmp up">↑ ${diff} fazla</span>`;
    else if (diff < 0) cmp = `<span class="krn-cmp down">↓ ${-diff} az</span>`;
    else cmp = `<span class="krn-cmp flat">= aynı</span>`;
  }
  const cmpNote = which === 'this' ? 'geçen haftaya göre' : 'önceki haftaya göre';

  // Gün gün bar grafik
  const maxDay = Math.max(1, ...s.byDayArr);
  const todayIso = today();
  const bars = s.byDayArr.map((c, i) => {
    const h = c ? Math.max(8, Math.round((c / maxDay) * 100)) : 3;
    const isToday = which === 'this' && s.dayIsos[i] === todayIso;
    return `<div class="krn-bar-col">
      <div class="krn-bar-val">${c || ''}</div>
      <div class="krn-bar ${isToday ? 'today' : ''}" style="height:${h}%;"></div>
      <div class="krn-bar-day ${isToday ? 'today' : ''}">${KARNE_DAYS[i]}</div>
    </div>`;
  }).join('');

  // En verimli gün (2+ biten)
  const maxVal = Math.max(...s.byDayArr);
  const maxIdx = s.byDayArr.indexOf(maxVal);
  const topDay = maxVal >= 2 ? KARNE_DAYS_FULL[maxIdx] : '';

  // Kategori dağılımı
  const catEntries = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...catEntries.map(e => e[1]));
  const catRows = catEntries.map(([k, v]) => `
    <div class="krn-cat-row">
      <span class="krn-cat-lbl">${KARNE_CAT[k] || k}</span>
      <span class="krn-cat-track"><span class="krn-cat-fill" style="width:${Math.round(v / maxCat * 100)}%;"></span></span>
      <span class="krn-cat-num">${v}</span>
    </div>`).join('');

  // Nazik kapanış cümlesi
  let note;
  if (topDay) note = `En verimli günün <b>${topDay}</b> oldu. Zor işleri o güne saklamak işe yarıyor olabilir.`;
  else if (s.mitDone >= 3) note = `<b>${s.mitDone}</b> MIT bitirmişsin — net odak, güzel ritim. `;
  else if (diff > 0) note = `Önceki haftadan <b>${diff}</b> görev fazla. Yükseliştesin `;
  else note = 'Her biten görev bir kazanç. Kendine iyi davran. ';

  // Alt farkındalık (anlık durum)
  const overdue = (data.tasks || []).filter(t => !t.done && t.due && t.due < todayIso).length;
  const stuck = (data.tasks || []).filter(t => !t.done && (t.postponeCount || 0) >= 3).length;
  let footer = '';
  if (overdue || stuck) {
    footer = `<div class="krn-footer">
      ${overdue ? `<span>${overdue} gecikmiş bekliyor</span>` : ''}
      ${stuck ? `<span>${stuck} çok ertelenmiş</span>` : ''}
    </div>`;
  }

  el.innerHTML = tabs + `
    <div class="krn-hero">
      <div class="krn-big">${s.done}</div>
      <div class="krn-big-lbl">görev bitti${cmp ? `<br>${cmp} <span class="krn-cmp-note">${cmpNote}</span>` : ''}</div>
    </div>
    <div class="krn-chart">${bars}</div>
    <div class="krn-statline">
      ${s.mitDone ? `<span class="krn-pill">${s.mitDone} MIT</span>` : ''}
      ${s.focusMin ? `<span class="krn-pill">~${Math.round(s.focusMin)} dk odak</span>` : ''}
      ${catEntries[0] ? `<span class="krn-pill">${KARNE_CAT[catEntries[0][0]] || catEntries[0][0]}</span>` : ''}
    </div>
    ${catRows ? `<div class="krn-section-lbl">Kategori dağılımı</div><div class="krn-cats">${catRows}</div>` : ''}
    ${bestHourBlock()}
    <div class="krn-note">${note}</div>
    ${footer}
  `;
}

// En verimli saat kartı (tüm zaman histogramından). Karnede kategori dağılımının altında.
function bestHourBlock() {
  const bh = bestHourInfo();
  if (!bh.ready) {
    const need = 6 - (bh.total || 0);
    return `<div class="krn-besthour building">⏰ En verimli saatin: <b>${need} görev daha</b> bitince ortaya çıkar (veri birikiyor).</div>`;
  }
  return `<div class="krn-besthour">
    <div class="krn-besthour-icon">⏰</div>
    <div class="krn-besthour-txt">En çok <b>${bh.label}</b> arası (${bh.part}) iş bitiriyorsun.<br>
      <span class="krn-besthour-sub">Zor görevleri bu saate koymayı dene.</span></div>
  </div>`;
}

// ============ DİYET KARNESİ (haftalık / aylık özet) ============
let _dietKarnePeriod = 'week'; // 'week' | 'month'
const DKRN_WD = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function dietKarneStats(period) {
  ensureDiet();
  const days = data.diet.days || {};
  const span = period === 'month' ? 30 : 7;
  const t = today();
  const isos = [];
  for (let i = span - 1; i >= 0; i--) isos.push(shiftDateStr(t, -i));
  const goal = data.diet.kcalGoal || 2000;
  const wGoal = data.diet.waterGoalL || 2.5;
  let loggedDays = 0, kcalSum = 0, kcalDays = 0;
  let pSum = 0, cSum = 0, fSum = 0, macroDays = 0;
  let waterSum = 0, waterDays = 0, underGoal = 0, overGoal = 0;
  const daily = [];
  isos.forEach(iso => {
    const day = days[iso];
    const meals = (day && day.meals) ? day.meals : [];
    const logged = meals.length > 0;
    const kcal = meals.reduce((sm, m) => sm + (Number(m.kcal) || 0), 0);
    let p = 0, c = 0, f = 0;
    meals.forEach(m => { p += Number(m.protein) || 0; c += Number(m.carb) || 0; f += Number(m.fat) || 0; });
    const waterL = day ? (Number(day.waterL) || 0) : 0;
    if (logged) {
      loggedDays++;
      if (kcal > 0) { kcalSum += kcal; kcalDays++; if (kcal <= goal) underGoal++; else overGoal++; }
      if (p || c || f) { pSum += p; cSum += c; fSum += f; macroDays++; }
    }
    if (waterL > 0) { waterSum += waterL; waterDays++; }
    daily.push({ iso, kcal, logged });
  });
  const weights = (data.diet.weights || []).filter(w => w.date >= isos[0] && w.date <= t).sort((a, b) => a.date < b.date ? -1 : 1);
  const wFirst = weights[0] || null, wLast = weights[weights.length - 1] || null;
  return {
    period, span, isos, daily, goal, wGoal, loggedDays,
    avgKcal: kcalDays ? Math.round(kcalSum / kcalDays) : 0, kcalDays,
    avgP: macroDays ? Math.round(pSum / macroDays) : 0,
    avgC: macroDays ? Math.round(cSum / macroDays) : 0,
    avgF: macroDays ? Math.round(fSum / macroDays) : 0,
    proteinGoal: data.diet.proteinGoal || 0, carbGoal: data.diet.carbGoal || 0, fatGoal: data.diet.fatGoal || 0,
    avgWater: waterDays ? Math.round(waterSum / waterDays * 100) / 100 : 0, waterDays,
    underGoal, overGoal, weights, weightLast: wLast,
    weightDiff: (wFirst && wLast && wFirst !== wLast) ? +(wLast.kg - wFirst.kg).toFixed(1) : (wLast ? 0 : null),
  };
}

function openDietKarne() { _dietKarnePeriod = 'week'; renderDietKarne(); document.getElementById('dietKarneModal').classList.add('active'); }
function closeDietKarne() { document.getElementById('dietKarneModal').classList.remove('active'); }
function setDietKarnePeriod(p) { _dietKarnePeriod = p; renderDietKarne(); }

function renderDietKarne() {
  const el = document.getElementById('dietKarneBody');
  if (!el) return;
  const period = _dietKarnePeriod;
  const isMonth = period === 'month';
  const s = dietKarneStats(period);
  const tabs = `
    <div class="krn-tabs">
      <button class="krn-tab ${period === 'week' ? 'active' : ''}" onclick="setDietKarnePeriod('week')">Bu hafta</button>
      <button class="krn-tab ${isMonth ? 'active' : ''}" onclick="setDietKarnePeriod('month')">Bu ay</button>
    </div>`;
  if (s.loggedDays === 0) {
    el.innerHTML = tabs + `<div class="krn-empty">${isMonth ? 'Son 30 günde' : 'Bu hafta'} henüz öğün kaydı yok. Yemek ekleyince karne dolmaya başlar.</div>`;
    return;
  }
  const maxK = Math.max(s.goal, ...s.daily.map(d => d.kcal), 1);
  const todayIso = today();
  const bars = s.daily.map(d => {
    const h = d.kcal ? Math.max(6, Math.round(d.kcal / maxK * 100)) : 2;
    const over = d.kcal > s.goal;
    const isToday = d.iso === todayIso;
    const cls = (!d.logged ? 'empty' : (over ? 'over' : '')) + (isToday ? ' today' : '');
    const wd = isMonth ? '' : DKRN_WD[new Date(d.iso + 'T12:00:00').getDay()];
    const val = (!isMonth && d.kcal) ? Math.round(d.kcal) : '';
    return `<div class="dkrn-bar-col${isMonth ? ' m' : ''}">
      ${isMonth ? '' : `<div class="krn-bar-val">${val}</div>`}
      <div class="dkrn-bar ${cls}" style="height:${h}%;" title="${d.iso}: ${Math.round(d.kcal)} kcal"></div>
      ${isMonth ? '' : `<div class="krn-bar-day ${isToday ? 'today' : ''}">${wd}</div>`}
    </div>`;
  }).join('');
  const adh = s.kcalDays ? Math.round(s.underGoal / s.kcalDays * 100) : 0;
  const macroRows = [
    ['Protein', s.avgP, s.proteinGoal, '#5aa2ff'],
    ['Karbonhidrat', s.avgC, s.carbGoal, '#f5a524'],
    ['Yağ', s.avgF, s.fatGoal, '#e0726e'],
  ].map(row => {
    const name = row[0], val = row[1], gl = row[2], col = row[3];
    const pct = gl ? Math.min(100, Math.round(val / gl * 100)) : 0;
    return `<div class="krn-cat-row">
      <span class="krn-cat-lbl">${name}</span>
      <span class="krn-cat-track"><span class="krn-cat-fill" style="width:${pct}%; background:${col};"></span></span>
      <span class="krn-cat-num">${val}g</span>
    </div>`;
  }).join('');
  let weightBlock = '';
  if (s.weightDiff !== null && s.weightLast) {
    const dir = s.weightDiff > 0 ? 'wt-up' : (s.weightDiff < 0 ? 'wt-down' : '');
    const sign = s.weightDiff > 0 ? '+' : '';
    const spark = s.weights.length >= 2 ? sparkline(s.weights.map(w => w.kg)) : '';
    weightBlock = `<div class="krn-section-lbl">Kilo</div>
      <div class="dkrn-weight">
        <div class="dkrn-weight-spark">${spark}</div>
        <div class="dkrn-weight-meta">${s.weightLast.kg} kg <span class="${dir}">${sign}${s.weightDiff} kg</span></div>
      </div>`;
  }
  let note;
  if (adh >= 70 && s.kcalDays >= 3) note = `Kayıtlı günlerin <b>%${adh}</b>'inde kalori hedefinin altında kaldın — istikrarlı gidiyorsun.`;
  else if (s.weightDiff !== null && s.weightDiff < 0) note = `Bu dönem <b>${Math.abs(s.weightDiff)} kg</b> verdin. Trend lehine.`;
  else if (s.loggedDays >= (isMonth ? 20 : 5)) note = `<b>${s.loggedDays}</b> gün kayıt tuttun — takip etmek işin yarısı.`;
  else note = `Her kayıt bir farkındalık. <b>${s.loggedDays}</b> gün loglamışsın, devam.`;
  el.innerHTML = tabs + `
    <div class="krn-hero">
      <div class="krn-big">${s.avgKcal}</div>
      <div class="krn-big-lbl">ortalama günlük kcal<br><span class="krn-cmp-note">hedef ${s.goal} · ${s.kcalDays} gün kayıt</span></div>
    </div>
    <div class="dkrn-chart${isMonth ? ' month' : ''}">${bars}</div>
    <div class="krn-statline">
      <span class="krn-pill">${s.loggedDays} gün kayıt</span>
      ${s.kcalDays ? `<span class="krn-pill">%${adh} hedefte</span>` : ''}
      ${s.waterDays ? `<span class="krn-pill">~${fmtL(s.avgWater)} L/gün su</span>` : ''}
    </div>
    ${macroRows ? `<div class="krn-section-lbl">Ortalama makro (g/gün)</div><div class="krn-cats">${macroRows}</div>` : ''}
    ${weightBlock}
    <div class="krn-note">${note}</div>
  `;
}

function renderEveningSummary() {
  const box = document.getElementById('eveningSummary');
  if (!box) return;
  const ts = today();
  const hour = new Date().getHours();
  // 19:00+ sonra göster, ya da bittiği halde gün içinde 5+ görev bittiyse de göster
  const doneToday = data.tasks.filter(t => t.done && t.doneDate === ts);
  const dismissedKey = `eveningSummaryDismissed:${ts}`;
  const dismissed = sessionStorage.getItem(dismissedKey) === '1';
  const shouldShow = !dismissed && (hour >= 19 || doneToday.length >= 5);
  if (!shouldShow) {
    box.classList.remove('active');
    return;
  }
  box.classList.add('active');

  const mit = data.tasks.filter(t => t.mitDate === ts);
  const mitDone = mit.filter(t => t.done).length;
  const pomo = (data.pomoToday && data.pomoToday.date === ts) ? (data.pomoToday.count || 0) : 0;
  const totalActualMin = doneToday.reduce((s, t) => s + (t.actualMin || 0), 0);

  // Vibe seçimi
  let title;
  if (doneToday.length === 0 && pomo === 0) {
    title = 'Bugün için iyiyiz. Yarın yeni bir gün — kendine yumuşak ol ';
  } else if (mit.length > 0 && mitDone === mit.length) {
    title = 'Bugünün MIT\'ini tamamen bitirdin. Bonus her şey hediye.';
  } else if (doneToday.length >= 5) {
    title = 'Bugün üretken bir gündü — bak neler bitirmişsin:';
  } else {
    title = 'Bugünün özeti — başardığını gör:';
  }
  document.getElementById('eveningTitle').textContent = title;

  const statsParts = [];
  statsParts.push(`<span>✅ <b>${doneToday.length}</b> görev</span>`);
  if (mit.length > 0) statsParts.push(`<span><b>${mitDone}/${mit.length}</b> MIT</span>`);
  if (pomo > 0) statsParts.push(`<span><b>${pomo}</b> seans</span>`);
  if (totalActualMin > 0) {
    const h = Math.floor(totalActualMin / 60), m = totalActualMin % 60;
    statsParts.push(`<span>⏱️ <b>${h > 0 ? h + 'sa ' : ''}${m}dk</b> odaklanma</span>`);
  }
  document.getElementById('eveningStats').innerHTML = statsParts.join('');

  const listEl = document.getElementById('eveningList');
  if (doneToday.length === 0) {
    listEl.innerHTML = '<div class="evening-empty">Bugün henüz bir şey bitmemiş — sorun yok. Yarın yeni bir gün.</div>';
  } else {
    listEl.innerHTML = doneToday.slice(0, 12).map(t =>
      `<div class="evening-line">${escapeHtml(t.text)}${t.actualMin ? ` <span style="opacity:0.7;">(${t.actualMin}dk)</span>` : ''}</div>`
    ).join('');
    if (doneToday.length > 12) {
      listEl.innerHTML += `<div class="evening-line" style="opacity:0.6;">… ve ${doneToday.length - 12} tane daha</div>`;
    }
  }
}

function dismissEveningSummary() {
  const ts = today();
  sessionStorage.setItem(`eveningSummaryDismissed:${ts}`, '1');
  document.getElementById('eveningSummary').classList.remove('active');
}

// Bugün için planlanan toplam tahmini dk — doluluk göstergesi
function renderCapacity() {
  const bar = document.getElementById('capacityBar');
  if (!bar) return;
  const ts = today();
  const todayTasks = data.tasks.filter(t => !t.done && (t.due === ts || t.mitDate === ts));
  const withEstimate = todayTasks.filter(t => t.estimateMin);
  if (todayTasks.length === 0) {
    bar.classList.remove('active', 'full', 'over');
    return;
  }
  const totalMin = withEstimate.reduce((s, t) => s + (t.estimateMin || 0), 0);
  // Verimli ADHD günü kapasitesi: 4 saat odaklanma (=240dk). Bunu üst sınır kabul ediyoruz.
  const CAP = 240;
  const pct = Math.min(200, Math.round((totalMin / CAP) * 100));
  bar.classList.add('active');
  bar.classList.toggle('full', pct >= 80 && pct < 105);
  bar.classList.toggle('over', pct >= 105);
  const hours = Math.floor(totalMin / 60), mins = totalMin % 60;
  document.getElementById('capacityLabel').textContent =
    (hours > 0 ? hours + 'sa ' : '') + mins + 'dk';
  document.getElementById('capacityPct').textContent = pct + '%';
  document.getElementById('capacityFill').style.width = Math.min(100, pct) + '%';
  const noEstimate = todayTasks.length - withEstimate.length;
  let hint;
  if (pct >= 105) hint = 'Fazla yüklendin. Bir kısmını "Ertele" ile yarına atmayı düşün.';
  else if (pct >= 80) hint = '🟠 Dolu bir gün. Önce MIT 3\'ünü bitir, diğerleri bonus.';
  else if (pct >= 40) hint = '🟢 Dengeli gün. Tek tek halledersin.';
  else if (totalMin === 0 && noEstimate > 0) hint = 'ℹ️ Tahmin yok — görevlere "dk" yaz, doluluk gözüksün.';
  else hint = 'Hafif gün. Bonus iş alabilirsin ya da dinlen.';
  if (noEstimate > 0 && totalMin > 0) hint += ` (${noEstimate} görev tahminsiz)`;
  document.getElementById('capacityHint').textContent = hint;
}

// MIT için akıllı skor — Worker'daki ile aynı mantık
function scoreTaskForMit(t) {
  const todayStr = today();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0,10); })();
  let score = 0;
  if (t.due) {
    if (t.due < todayStr) score += 150;
    else if (t.due === todayStr) score += 100;
    else if (t.due === tomorrow) score += 50;
    else {
      const days = Math.max(1, Math.round((new Date(t.due) - new Date(todayStr)) / 86400000));
      if (days <= 7) score += Math.max(10, 40 - days * 4);
    }
  }
  if (t.priority === 'urgent') score += 60;
  if (t.priority === 'low') score -= 15;
  if (t.estimateMin) {
    if (t.estimateMin <= 30) score += 20;
    else if (t.estimateMin <= 60) score += 15;
    else if (t.estimateMin > 120) score -= 10;
  }
  if (t.reminderTime) score += 12;
  if (t.category === 'odev') score += 8;
  if (t.category === 'ders') score += 12;
  const age = taskAgeDays(t);
  if (age >= 5 && age <= 30) score += 15;
  if (t.seriesId) score += 10;
  return score;
}

function suggestMitTasks(limit = 3) {
  const candidates = data.tasks.filter(t => !t.done && t.mitDate !== today());
  if (!candidates.length) return [];
  const scored = candidates
    .map(t => ({ t, score: scoreTaskForMit(t) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const out = [];
  const usedCats = new Set();
  for (const { t } of scored) {
    if (out.length >= limit) break;
    if (out.length < 2 && t.category && usedCats.has(t.category)) continue;
    out.push(t);
    if (t.category) usedCats.add(t.category);
  }
  if (out.length < limit) {
    for (const { t } of scored) {
      if (out.length >= limit) break;
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

function renderMit() {
  const todayStr = today();
  const mitTasks = data.tasks.filter(t => t.mitDate === todayStr);
  const doneCount = mitTasks.filter(t => t.done).length;
  const countEl = document.getElementById('mitCount');
  const listEl = document.getElementById('mitList');
  if (!countEl || !listEl) return;
  countEl.textContent = doneCount + '/3';
  if (mitTasks.length === 0) {
    const suggestions = suggestMitTasks(3);
    if (suggestions.length === 0) {
      listEl.innerHTML = '<div class="mit-empty">Bugün için 3 öncelik seç — görev kartındaki ☆ butonuna bas</div>';
      return;
    }
    const sugHtml = suggestions.map(t => {
      const extras = [];
      const dl = t.due ? dueLabel(t.due) : '';
      if (dl && dl.text) extras.push(dl.text);
      if (t.priority === 'urgent') extras.push('🔴 acil');
      if (t.estimateMin) extras.push(`${t.estimateMin}dk`);
      const tail = extras.length ? `<span class="mit-sug-meta">${extras.join(' · ')}</span>` : '';
      return `
        <div class="mit-suggestion" onclick="acceptMitSuggestion(${t.id})">
          <span class="mit-sug-icon">＋⭐</span>
          <span class="mit-sug-text">${escapeHtml(t.text)}</span>
          ${tail}
        </div>
      `;
    }).join('');
    listEl.innerHTML = `
      <div class="mit-empty" style="margin-bottom:8px;">Bugünün önerisi (tıkla, ⭐'la):</div>
      ${sugHtml}
    `;
    return;
  }
  listEl.innerHTML = mitTasks.map(t => `
    <div class="mit-item ${t.done ? 'done' : ''}" onclick="toggleTask(${t.id})" title="${t.done ? 'Geri aç' : 'Bitti olarak işaretle'}">
      <span class="mit-check">${t.done ? '✅' : '⬜'}</span>
      <span>${escapeHtml(t.text)}</span>
    </div>
  `).join('');
}

function acceptMitSuggestion(id) {
  toggleMit(id);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Tekrarlı görevleri yeni günde reset et
function checkRepeatingTasks() {
  let changed = false;
  const todayStr = today();
  const dayOfWeek = new Date(todayStr).getDay(); // 0=Pazar, 1-5=Hafta içi, 6=Cumartesi
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  data.tasks.forEach(t => {
    if (!t.done || !t.doneDate || t.doneDate === todayStr) return;

    let shouldReset = false;
    if (t.repeat === 'daily') {
      shouldReset = true;
    } else if (t.repeat === 'weekdays') {
      shouldReset = isWeekday;
    } else if (t.repeat === 'weekends') {
      shouldReset = isWeekend;
    } else if (t.repeat === 'weekly') {
      const diff = Math.round((new Date(todayStr) - new Date(t.doneDate)) / 86400000);
      shouldReset = diff >= 7;
    }

    if (shouldReset) {
      t.done = false;
      t.doneDate = null;
      t.subtasks.forEach(s => s.done = false);
      changed = true;
    }
  });
  if (changed) save();
}

// ============ POMODORO ============
let timerSec = 25*60, workMin = 25, breakMin = 5, isBreak = false, timerInt = null, running = false;
let totalSec = 25*60;
let timerEndTime = null; // ms cinsinden bitiş anı — timestamp bazlı, telefon kilitliyken bile doğru

// === Pomodoro persistence ===
// PWA bellekten atılırsa (swipe-kapatma) timer sıfırlanmasın — state'i localStorage'a yaz,
// sayfa açılınca restore et. Seans uzakta bitmişse pomoCount + actualMin yine de işlenir.
const TIMER_KEY = 'aidan_timer';
function saveTimerState() {
  try {
    const s = {
      running, isBreak, workMin, breakMin, totalSec, timerSec,
      timerEndTime, currentFocusTaskId, focusStartTime,
      savedAt: Date.now(),
    };
    localStorage.setItem(TIMER_KEY, JSON.stringify(s));
  } catch {}
}
function clearTimerState() {
  try { localStorage.removeItem(TIMER_KEY); } catch {}
}
function restoreTimerState() {
  let s;
  try { s = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null'); } catch { s = null; }
  if (!s || typeof s !== 'object') return;
  workMin = s.workMin || 25;
  breakMin = s.breakMin || 5;
  isBreak = !!s.isBreak;
  totalSec = s.totalSec || (workMin * 60);
  currentFocusTaskId = s.currentFocusTaskId || null;
  focusStartTime = s.focusStartTime || null;

  if (s.running && s.timerEndTime) {
    const remainMs = s.timerEndTime - Date.now();
    if (remainMs > 0) {
      // Aktif seans hâlâ devam ediyor — interval'i yeniden başlat
      timerEndTime = s.timerEndTime;
      timerSec = Math.max(0, Math.round(remainMs / 1000));
      running = true;
      timerInt = setInterval(tickTimer, 250);
      updateTimerDisplay();
      updateActiveTaskBanner && updateActiveTaskBanner();
      return;
    }
    // Seans uzakta bitti — counter + actualMin işle, "yokken bitti" notify
    running = false;
    timerEndTime = null;
    if (!isBreak) {
      data.pomoToday = data.pomoToday || { date: today(), count: 0 };
      if (data.pomoToday.date !== today()) data.pomoToday = { date: today(), count: 0 };
      data.pomoToday.count++;
      logFocusDay();
      if (currentFocusTaskId) {
        const ft = (data.tasks || []).find(x => x.id === currentFocusTaskId);
        if (ft) ft.actualMin = (ft.actualMin || 0) + workMin;
      }
      const cnt = document.getElementById('pomoCount');
      if (cnt) cnt.textContent = data.pomoToday.count;
      save();
      setTimeout(() => notify('Seans yokken bitti', `${workMin}dk işlendi — pomoCount +1${currentFocusTaskId ? ' · süre göreve yazıldı' : ''}`), 800);
    }
    timerSec = workMin * 60;
    totalSec = workMin * 60;
    isBreak = false;
    focusStartTime = null;
    clearTimerState();
    updateTimerDisplay();
    return;
  }
  // Duraklı state — kalan süreyi göster, running:false
  if (!s.running && s.timerSec != null && s.timerSec < totalSec) {
    timerSec = s.timerSec;
    running = false;
    updateTimerDisplay();
  }
}

// 🎧 Odak seansı günlük logu — data.focusDays{'YYYY-MM-DD':n}, son 60 gün.
// pomoToday sadece bugünü tutar; sabah "dün özeti" dünü buradan okur.
function logFocusDay() {
  data.focusDays = data.focusDays || {};
  const t = today();
  data.focusDays[t] = (data.focusDays[t] || 0) + 1;
  const keys = Object.keys(data.focusDays).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete data.focusDays[k];
}

function updateTimerDisplay() {
  const m = Math.floor(timerSec/60), s = timerSec%60;
  const txt = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const timerEl = document.getElementById('timer');
  const ring = document.getElementById('timerRing');
  const subEl = document.getElementById('timerSub');
  timerEl.textContent = txt;
  timerEl.classList.toggle('break', isBreak);
  ring.classList.toggle('break', isBreak);
  ring.classList.toggle('running', running);
  ring.classList.toggle('paused', !running && timerSec < totalSec);
  document.getElementById('timerStatus').textContent =
    !running && timerSec === totalSec ? 'Hazır' :
    !running ? '⏸️ Durakta' :
    isBreak ? 'Mola zamanı' : 'Çalışma zamanı';
  if (subEl) subEl.textContent = isBreak ? 'mola' : (running ? 'odak' : 'dakika');
  const pct = ((totalSec - timerSec) / totalSec) * 100;
  ring.style.setProperty('--p', pct + '%');
  document.title = running ? `${txt} ${isBreak ? '' : '🎧'} Aidan` : 'Aidan - ADHD Asistanım';
}

function startTimer() {
  if (running) return;
  running = true;
  if (!isBreak && !focusStartTime) focusStartTime = Date.now();
  // Kalan süreyle bitiş anını kur — telefon kilitlense bile gerçek zaman akar
  timerEndTime = Date.now() + timerSec * 1000;
  updateTimerDisplay();
  timerInt = setInterval(tickTimer, 250); // 250ms: telefon açılınca anında yakalar
  saveTimerState();
}

// Her tick'te kalan süreyi GERÇEK zamandan hesapla (sayaç azaltma değil) — arka planda da doğru
function tickTimer() {
  if (!running) return;
  timerSec = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
  if (timerSec <= 0) {
    clearInterval(timerInt);
    running = false;
    timerSec = 0;
    if (!isBreak) {
      data.pomoToday.count++;
      logFocusDay();
      // Aktif görev varsa, pomodoro süresini actualMin'e ekle
      if (currentFocusTaskId) {
        const ft = data.tasks.find(x => x.id === currentFocusTaskId);
        if (ft) {
          ft.actualMin = (ft.actualMin || 0) + workMin;
          focusStartTime = Date.now(); // sayacı sıfırla
        }
      }
      save();
      document.getElementById('pomoCount').textContent = data.pomoToday.count;
      notify('Seans bitti!', 'Harika iş! Şimdi ' + breakMin + ' dk mola.');
      isBreak = true;
      timerSec = breakMin * 60;
      totalSec = breakMin * 60;
      updateActiveTaskBanner();
      renderTasks();
    } else {
      notify('Mola bitti!', 'Hadi devam, ' + workMin + ' dk daha.');
      isBreak = false;
      timerSec = workMin * 60;
      totalSec = workMin * 60;
      focusStartTime = Date.now();
    }
    playBeep();
    clearTimerState();
  }
  updateTimerDisplay();
}

function pauseTimer() {
  // Duraklatırken kalan süreyi gerçek zamandan kesinleştir
  if (running && timerEndTime) timerSec = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
  clearInterval(timerInt);
  running = false;
  timerEndTime = null;
  updateTimerDisplay();
  saveTimerState();
}

function resetTimer(keepFocus) {
  clearInterval(timerInt);
  running = false;
  timerEndTime = null;
  isBreak = false;
  timerSec = workMin * 60;
  totalSec = workMin * 60;
  if (!keepFocus) {
    focusStartTime = null;
    currentFocusTaskId = null;
    const focusEl = document.getElementById('focusTask');
    if (focusEl) {
      focusEl.innerHTML = 'Bir görev seç ya da serbest çalış';
      focusEl.classList.add('empty');
    }
    updateActiveTaskBanner();
  }
  updateTimerDisplay();
  document.title = 'Aidan - ADHD Asistanım';
  clearTimerState();
}

// Preset değişince bağlı görev kopmasın (sadece Sıfırla tam temizler)
function setTimer(w, b) {
  workMin = w; breakMin = b;
  resetTimer(true);
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 800; o.type = 'sine';
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

function playDoneChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5 — major chord
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'triangle';
      o.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.08;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.22, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
      o.start(t0); o.stop(t0 + 0.5);
    });
  } catch(e) {}
}

// Konfeti patlat — element koordinatından
function confettiBurst(originEl) {
  try {
    const rect = originEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = ['#3fb950', '#6366f1', '#d29922', '#c084fc', '#58a6ff', '#f85149'];
    const burst = document.createElement('div');
    burst.className = 'confetti-burst';
    burst.style.left = cx + 'px';
    burst.style.top = cy + 'px';
    for (let i = 0; i < 16; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.background = colors[i % colors.length];
      const angle = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.4;
      const dist = 60 + Math.random() * 90;
      piece.style.setProperty('--x', Math.cos(angle) * dist + 'px');
      piece.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      piece.style.animationDelay = (Math.random() * 0.06) + 's';
      burst.appendChild(piece);
    }
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 1300);
  } catch(e) {}
}

// "Bugün +N" sayaç pop-up
function showDoneCounter() {
  const todayStr = today();
  const doneToday = data.tasks.filter(t => t.done && t.doneDate === todayStr).length;
  if (!doneToday) return;
  const el = document.createElement('div');
  el.className = 'done-counter';
  el.textContent = '+' + doneToday;
  el.style.left = '50%';
  el.style.top = '40%';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

function celebrateDone(taskId) {
  // Görev kartını bul, üzerine kutlama
  const card = document.querySelector(`[onchange="toggleTask(${taskId})"]`)?.closest('.task')
              || document.querySelector(`[onclick*="toggleTask(${taskId})"]`)?.closest('.mit-item');
  if (card) {
    card.classList.add('just-done');
    confettiBurst(card);
    setTimeout(() => card.classList.remove('just-done'), 700);
  }
  playDoneChime();
  showDoneCounter();
}

// ============ AYARLAR ============
function saveSettings() {
  save();
}
function saveDisplayName() {
  const v = (document.getElementById('displayName').value || '').trim().slice(0, 24);
  data.settings.displayName = v;
  save();
  if (v) showToast(`✅ Bundan sonra Aidan sana "${v}" diye sesleniyor`, 'success', 3500);
}

function loadSettings() {
  document.getElementById('supaUrl').value = data.settings.supaUrl || '';
  document.getElementById('supaKey').value = data.settings.supaKey || '';
  const dn = document.getElementById('displayName');
  if (dn) dn.value = data.settings.displayName || '';
  if (data.settings.supaUrl && data.settings.supaKey) {
    initSupabase();
  } else {
    // Settings'te credentials yok — Worker'dan public config'i çek, otomatik bağlan
    autoConnectFromConfig();
  }
}

// Yeni kullanıcılar için: Aidan'ın public Supabase credentials'ını Worker'dan çek + bağlan.
// Anon key zaten publishable, RLS koruyor — kod-içine gömmek yerine Worker'dan ki tek noktadan yönetilsin.
async function autoConnectFromConfig() {
  try {
    const r = await fetch(CONFIG_ENDPOINT);
    if (!r.ok) { renderAuthBox(); renderWelcome(); return; }
    const cfg = await r.json();
    if (!cfg.supaUrl || !cfg.supaKey) { renderAuthBox(); renderWelcome(); return; }
    data.settings.supaUrl = cfg.supaUrl;
    data.settings.supaKey = cfg.supaKey;
    localStorage.setItem('aidan', JSON.stringify(data));
    // Settings ekranını da güncelle (gizliyse de field'lar dolsun)
    const su = document.getElementById('supaUrl');
    const sk = document.getElementById('supaKey');
    if (su) su.value = cfg.supaUrl;
    if (sk) sk.value = cfg.supaKey;
    initSupabase();
  } catch (e) {
    console.warn('autoConnect fail', e.message);
    renderAuthBox();
    renderWelcome();
  }
}

// Login yoksa görevler ekranını gizleyen büyük karşılama overlay'i.
// Login olunca gizlenir (onAuthStateChange tarafından kaldırılır).
function renderWelcome() {
  if (window._user) { hideWelcome(); return; }
  let ov = document.getElementById('welcomeOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'welcomeOverlay';
    ov.className = 'welcome-overlay';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-logo">☁️</div>
      <h1 class="welcome-title">Aidan</h1>
      <div class="welcome-form">
        <input type="email" id="wEmail" placeholder="email@adres.com" autocomplete="email">
        <input type="password" id="wPassword" placeholder="şifre (en az 8 karakter)" autocomplete="current-password">
        <div id="wInviteRow" style="display:none;">
          <input type="text" id="wCode" placeholder="Davet kodu (AIDAN-XXXXXXXX)" style="text-transform:uppercase; letter-spacing:0.04em;">
          <div class="welcome-hint">Davet kodu olmadan yeni hesap açılmaz.</div>
        </div>
        <div class="welcome-actions">
          <button class="welcome-btn primary" onclick="welcomeLogin()">Giriş Yap</button>
          <button class="welcome-btn ghost" onclick="welcomeToggleSignup()">Yeni Hesap</button>
        </div>
        <div id="wSignupRow" style="display:none; margin-top:8px;">
          <button class="welcome-btn primary wide" onclick="welcomeSignup()">✅ Kayıt Ol (davet koduyla)</button>
        </div>
        <div id="wStatus" class="welcome-status"></div>
      </div>
    </div>
  `;
  ov.style.display = 'flex';
}

function hideWelcome() {
  const ov = document.getElementById('welcomeOverlay');
  if (ov) ov.style.display = 'none';
}

function welcomeToggleSignup() {
  const row = document.getElementById('wInviteRow');
  const btnRow = document.getElementById('wSignupRow');
  const open = row.style.display === 'none';
  row.style.display = open ? 'block' : 'none';
  btnRow.style.display = open ? 'block' : 'none';
  if (open) document.getElementById('wCode').focus();
}

function welcomeStatus(msg, color) {
  const el = document.getElementById('wStatus');
  if (el) { el.textContent = msg; el.style.color = color || 'var(--text-muted)'; }
}

async function welcomeLogin() {
  if (!window._supa) { welcomeStatus('Bağlantı kurulamadı, sayfayı yenile.', '#ff5555'); return; }
  const email = document.getElementById('wEmail').value.trim();
  const password = document.getElementById('wPassword').value;
  if (!email || !password) { welcomeStatus('Email ve şifre gerekli.', '#ffb86c'); return; }
  welcomeStatus('⏳ Giriş yapılıyor…', '#8be9fd');
  const { error } = await window._supa.auth.signInWithPassword({ email, password });
  if (error) welcomeStatus('❌ ' + error.message, '#ff5555');
  else welcomeStatus('✅ Giriş başarılı', '#50fa7b');
  // onAuthStateChange handler hideWelcome çağırır
}

async function welcomeSignup() {
  if (!window._supa) { welcomeStatus('Bağlantı kurulamadı.', '#ff5555'); return; }
  const email = document.getElementById('wEmail').value.trim();
  const password = document.getElementById('wPassword').value;
  const code = (document.getElementById('wCode').value || '').trim().toUpperCase();
  if (!email || !email.includes('@')) { welcomeStatus('Geçerli email gir.', '#ffb86c'); return; }
  if (password.length < 8) { welcomeStatus('Şifre en az 8 karakter olmalı.', '#ffb86c'); return; }
  if (!code) { welcomeStatus('Davet kodu gerekli (AIDAN-XXXXXXXX).', '#ffb86c'); return; }
  welcomeStatus('⏳ Davet kodu doğrulanıyor…', '#8be9fd');
  try {
    const r = await fetch(SIGNUP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, code }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { welcomeStatus('❌ ' + (j.error || `signup ${r.status}`), '#ff5555'); return; }
    welcomeStatus('✅ Hesap oluştu, giriş yapılıyor…', '#50fa7b');
    const { error } = await window._supa.auth.signInWithPassword({ email, password });
    if (error) welcomeStatus('Kayıt OK ama giriş başarısız: ' + error.message, '#ffb86c');
  } catch (e) {
    welcomeStatus('❌ ' + e.message, '#ff5555');
  }
}

// Onboarding tur — 5 adımlı, atlanabilir, kayıt sonrası ilk girişte gösterilir
const TOUR_STEPS = [
  {
    emoji: '',
    title: 'Aidan\'a hoş geldin',
    body: 'ADHD beyninle birlikte yürüyen bir asistan. Görev, odak, borsa, hatırlatma — hepsi tek yerde.<br><br>5 küçük ipucuyla seni hızlıca tanıştıracağım.',
  },
  {
    emoji: '',
    title: 'Quick Capture',
    body: 'Üst bardaki kutu. Aklına geleni 2 saniyede yaz, <code>Enter</code> bas.<br><br><b>AI butonu</b> tarih/saat de tanır: <code>"yarın 14:00 dişçi"</code> → otomatik görev. <b>🎙️</b> ile sesli de yazabilirsin.',
  },
  {
    emoji: '⭐',
    title: 'Bugünün 3\'ü (MIT)',
    body: 'Günde <b>en fazla 3 öncelik</b>. Daha fazlası beynini dağıtır.<br><br>Görev kartındaki butonuna bas → üste sabit kutuya çıkar. Bittiğinde tıkla, konfeti patlar ',
  },
  {
    emoji: '🎧',
    title: 'Odak (Pomodoro)',
    body: '<b>Odak</b> sekmesi → 25 dk çalış, 5 dk mola. Telefonu kilitli bile olsa doğru sayar.<br><br>Bir görev seçersen geçen süre otomatik o göreve yazılır — sonra "tahmin vs gerçek" görürsün.',
  },
  {
    emoji: '🔔',
    title: 'Bildirim aç',
    body: '<b>Ayarlar → Bu cihazda bildirim al</b> bas. Sabah brifing, akşam özet, hatırlatma — telefonun kilitli ekranına düşer.<br><br>Hazırsın Hadi ilk görevini ekle!',
  },
];

let _tourStep = 0;
function startOnboarding() {
  _tourStep = 0;
  renderTour();
}

function renderTour() {
  let ov = document.getElementById('tourOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'tourOverlay';
    ov.className = 'tour-overlay';
    document.body.appendChild(ov);
  }
  const step = TOUR_STEPS[_tourStep];
  const isLast = _tourStep === TOUR_STEPS.length - 1;
  const isFirst = _tourStep === 0;
  const dots = TOUR_STEPS.map((_, i) => {
    const cls = i === _tourStep ? 'active' : (i < _tourStep ? 'done' : '');
    return `<span class="tour-dot ${cls}"></span>`;
  }).join('');
  ov.innerHTML = `
    <div class="tour-card">
      <div class="tour-progress">${dots}</div>
      <div class="tour-emoji">${step.emoji}</div>
      <h2 class="tour-title">${step.title}</h2>
      <div class="tour-body">${step.body}</div>
      <div class="tour-actions">
        <button class="tour-skip" onclick="finishOnboarding()">Atla</button>
        <div class="tour-nav">
          ${isFirst ? '' : '<button class="tour-btn" onclick="prevTourStep()">← Geri</button>'}
          ${isLast
            ? '<button class="tour-btn primary" onclick="finishOnboarding()">Başla</button>'
            : '<button class="tour-btn primary" onclick="nextTourStep()">İleri →</button>'}
        </div>
      </div>
    </div>
  `;
  ov.style.display = 'flex';
}

function nextTourStep() {
  if (_tourStep < TOUR_STEPS.length - 1) { _tourStep++; renderTour(); }
  else finishOnboarding();
}
function prevTourStep() {
  if (_tourStep > 0) { _tourStep--; renderTour(); }
}
function finishOnboarding() {
  const ov = document.getElementById('tourOverlay');
  if (ov) ov.style.display = 'none';
  data.settings.onboardingDone = true;
  save();
  showToast('İyi günler! Bir şey takılırsa Ayarlar\'a bak.', 'success', 4000);
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aidan-yedek-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============ OTOMATİK YEDEKLER (Supabase aidan_backups) ============
// Worker haftada bir snapshot atar. PWA listele + JSON indir.
let _backupCache = null; // id → data (indirme için, listeyle birlikte gelir)
async function loadBackupList() {
  const el = document.getElementById('backupList');
  if (!el) return;
  if (!window._supa || !window._user) {
    el.innerHTML = '<div class="fixedrem-empty">Önce Supabase\'e giriş yap.</div>';
    return;
  }
  el.innerHTML = '<div class="fixedrem-empty">Yükleniyor…</div>';
  try {
    const { data: rows, error } = await window._supa
      .from('aidan_backups')
      .select('id, snapshot_at, data')
      .order('snapshot_at', { ascending: false })
      .limit(12);
    if (error) {
      const msg = String(error.message || error);
      // Tablo yok → Salim'e nazik talimat
      if (/relation .* does not exist|aidan_backups/i.test(msg) && /not exist|404/i.test(msg) || error.code === '42P01') {
        el.innerHTML = '<div class="fixedrem-empty">Tablo henüz yok. Supabase → SQL Editor\'da <code>aidan_backups</code> SQL\'ini çalıştırdıktan sonra Pazartesi 03:00\'tan itibaren yedek alınır.</div>';
        return;
      }
      throw error;
    }
    if (!rows || !rows.length) {
      el.innerHTML = '<div class="fixedrem-empty">Henüz yedek yok. Worker ilk Pazartesi 03:00 TR\'de yazar (manuel test için <code>?type=backup&secret=...</code>).</div>';
      return;
    }
    _backupCache = {};
    rows.forEach(r => { _backupCache[r.id] = r.data; });
    el.innerHTML = rows.map(r => {
      const d = new Date(r.snapshot_at);
      const dateStr = d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
      const taskCount = Array.isArray(r.data?.tasks) ? r.data.tasks.length : 0;
      const keyCount = Object.keys(r.data || {}).length;
      return `
        <div class="countdown-row">
          <div class="countdown-row-info">
            <div class="countdown-row-label">${escapeHtml(dateStr)}</div>
            <div class="countdown-row-meta">${taskCount} görev · ${keyCount} alan</div>
          </div>
          <button class="small secondary" onclick="downloadBackup(${r.id}, '${d.toISOString().slice(0,10)}')" title="JSON indir">İndir</button>
        </div>
      `;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="fixedrem-empty">${escapeHtml(String(e.message || e))}</div>`;
  }
}

function downloadBackup(id, dateLabel) {
  const data = _backupCache && _backupCache[id];
  if (!data) { showToast('Yedek bulunamadı — listeyi yenile', 'warning', 3000); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aidan-backup-${dateLabel || 'snapshot'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!confirm('Mevcut verilerin üzerine yazılacak. Devam?')) return;
      data = imported;
      save();
      location.reload();
    } catch (err) { alert('Hatalı dosya: ' + err.message); }
  };
  reader.readAsText(file);
}
function resetAll() {
  if (!confirm('TÜM verilerin silinecek. Emin misin?')) return;
  if (!confirm('Gerçekten emin misin? Bu geri alınamaz.')) return;
  localStorage.removeItem('aidan');
  location.reload();
}

// ============ ZAMAN KÖRLÜĞÜ ÜST BAR ============
function updateAppSubtitle() {
  const sub = document.getElementById('appSubtitle');
  const hero = document.getElementById('dateHero');
  if (!sub) return;
  const now = new Date();
  const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const dayStr = `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]}`;
  const todayStr = today();
  const tasks = data.tasks || [];
  const active = tasks.filter(t => !t.done).length;
  const doneToday = tasks.filter(t => t.doneDate === todayStr).length;
  const mit = tasks.filter(t => t.mitDate === todayStr);
  const mitDone = mit.filter(t => t.done).length;
  // Date hero: big day + date
  if (hero) hero.textContent = dayStr;
  // Subtitle: mood + summary (without redundant date)
  let mood = '';
  const hour = now.getHours();
  if (hour < 6) mood = 'sessiz gece';
  else if (hour < 12) mood = 'yeni başlangıç';
  else if (hour < 18) mood = 'gün ortası';
  else mood = 'akşam toparlanma';
  let parts = [mood];
  if (mit.length > 0) parts.push(`${mitDone}/${mit.length}`);
  if (doneToday > 0) parts.push(`✅ ${doneToday} bitti`);
  if (active === 0 && doneToday === 0) parts = ['sakin bir gün'];
  sub.textContent = parts.join(' · ');
}

let _nextReminder = null; // "Şu an" kartı + topbar paylaşır (tickNow saniyelik okur)
function updateTopbar() {
  updateAppSubtitle();
  const now = new Date();
  document.getElementById('tbClock').textContent =
    String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

  // Sıradaki hatırlatma — bugünün reminderTime'lı görevleri arasında en yakını
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let nextR = null, nextDiff = Infinity;
  (data.tasks || []).forEach(t => {
    if (t.done || !t.reminderTime) return;
    const [h, m] = t.reminderTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return;
    const rMin = h * 60 + m;
    if (rMin < nowMin) return; // bugün geçti
    const diff = rMin - nowMin;
    if (diff < nextDiff) { nextDiff = diff; nextR = t; }
  });
  _nextReminder = nextR; // "Şu an" kartı saniyelik geri sayım için kullanır
  if (nextR) {
    const txt = nextDiff < 60 ? nextDiff + ' dk' : Math.floor(nextDiff/60) + 'sa ' + (nextDiff%60) + 'dk';
    document.getElementById('tbNext').textContent = (nextR.text || '').slice(0, 18) + ' · ' + txt;
  } else {
    document.getElementById('tbNext').textContent = '—';
  }

  // Kesintisiz çalışma: son aktiviteden 5dk+ geçtiyse "—" göster (idle)
  const sinceActivity = Date.now() - lastUserActivity;
  let focusMin;
  if (sinceActivity > IDLE_RESET_MS) {
    document.getElementById('tbFocus').textContent = '—';
    focusMin = 0;
  } else {
    focusMin = Math.floor((Date.now() - focusStreakStart) / 60000);
    document.getElementById('tbFocus').textContent =
      focusMin < 60 ? focusMin + ' dk' : Math.floor(focusMin/60) + 'sa ' + (focusMin%60) + 'dk';
  }

}
setInterval(updateTopbar, 10000);
updateTopbar();

// ============ ZAMAN KÖRLÜĞÜ "ŞU AN" KARTI (saniyelik canlı) ============
function tickNow() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const tb = document.getElementById('tbClock');
  if (tb) tb.textContent = hh + ':' + mm;
  const nc = document.getElementById('nowClock');
  if (nc) nc.innerHTML = hh + ':' + mm + '<span class="now-sec">:' + ss + '</span>';

  // Günün ritmi: 07:00–23:00 aktif gün penceresi, ne kadarı geçti / kaldı
  const startMin = 7 * 60, endMin = 23 * 60;
  let pct = (nowMin - startMin) / (endMin - startMin);
  pct = Math.max(0, Math.min(1, pct));
  const fill = document.getElementById('nowDayFill');
  if (fill) fill.style.width = Math.round(pct * 100) + '%';
  const dl = document.getElementById('nowDayLabel');
  if (dl) {
    if (nowMin < startMin) dl.textContent = 'güne hazırlan ';
    else if (nowMin >= endMin) dl.textContent = 'gün bitti, dinlenmeyi hak ettin ';
    else {
      const left = endMin - nowMin;
      const ltxt = left < 60 ? left + ' dk' : Math.floor(left / 60) + 'sa ' + (left % 60) + 'dk';
      dl.textContent = 'aktif güne ~' + ltxt + ' kaldı';
    }
  }

  // Yaklaşan hatırlatma (2 saat içinde) — saniyelik geri sayım, 15 dk altı acil
  const nn = document.getElementById('nowNext');
  if (nn) {
    let show = false;
    if (_nextReminder && _nextReminder.reminderTime) {
      const [h, m] = _nextReminder.reminderTime.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const diff = (h * 60 + m) - nowMin;
        if (diff >= 0 && diff <= 120) {
          const txt = diff < 60 ? diff + ' dk' : Math.floor(diff / 60) + 'sa ' + (diff % 60) + 'dk';
          nn.innerHTML = '⏰ ' + txt + ' sonra: ' + escapeHtml((_nextReminder.text || '').slice(0, 24)) +
            ' <span style="opacity:.7">(' + _nextReminder.reminderTime + ')</span>';
          nn.classList.toggle('urgent', diff <= 15);
          show = true;
        }
      }
    }
    nn.style.display = show ? '' : 'none';
  }
}
setInterval(tickNow, 1000);
tickNow();

// ============ SYNC STATUS DOT ============
function updateSyncDot() {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  if (!window._supa || !window._user) {
    dot.className = 'sync-dot offline';
    dot.title = 'Yerel mod — bulut bağlı değil. Ayarlar\'dan giriş yap.';
    return;
  }
  const last = parseInt(localStorage.getItem('aidan_lastPush') || '0', 10);
  if (!last) {
    dot.className = 'sync-dot slow';
    dot.title = 'Bulut bağlı, henüz senkron yok';
    return;
  }
  const ageSec = Math.round((Date.now() - last) / 1000);
  const ageLabel = ageSec < 60 ? ageSec + ' sn önce'
    : ageSec < 3600 ? Math.round(ageSec/60) + ' dk önce'
    : Math.round(ageSec/3600) + ' sa önce';
  if (ageSec < 90) {
    dot.className = 'sync-dot ok';
    dot.title = `Senkron — son: ${ageLabel}`;
  } else if (ageSec < 600) {
    dot.className = 'sync-dot slow';
    dot.title = `Bekliyor — son: ${ageLabel}`;
  } else {
    dot.className = 'sync-dot offline';
    dot.title = `Uzun süredir push yok — son: ${ageLabel}`;
  }
}
setInterval(updateSyncDot, 5000);
updateSyncDot();

// ============ RUTİN + GÖREV HATIRLATMA KONTROL ============
function isMutedNow() {
  const m = data.settings && data.settings.muteUntil;
  if (!m) return false;
  return Date.now() < m;
}
setInterval(() => {
  if (isMutedNow()) return;
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const todayStr = today();
  let changed = false;
  data.tasks.forEach(t => {
    if (t.done) return;
    if (!t.reminderTime || t.reminderTime !== hhmm) return;
    if (t.lastReminded === todayStr) return;
    t.lastReminded = todayStr;
    changed = true;
    notify('Görev hatırlatması', t.text, { tag: 'reminder-' + t.id });
    playBeep();
  });
  if (changed) save();
}, 30000);

// ============ BİLDİRİM SUSTUR ============
function muteFor(minutes) {
  data.settings = data.settings || {};
  data.settings.muteUntil = Date.now() + minutes * 60000;
  save();
  renderMuteState();
  const until = new Date(data.settings.muteUntil);
  const hhmm = String(until.getHours()).padStart(2,'0') + ':' + String(until.getMinutes()).padStart(2,'0');
  showToast(`Bildirimler ${hhmm}'e kadar susuyor`, 'info', 3500);
}
function muteUnset() {
  if (data.settings) data.settings.muteUntil = null;
  save();
  renderMuteState();
  showToast('Bildirimler tekrar açık', 'success', 2500);
}
function renderMuteState() {
  const el = document.getElementById('muteState');
  if (!el) return;
  if (isMutedNow()) {
    const until = new Date(data.settings.muteUntil);
    const hhmm = String(until.getHours()).padStart(2,'0') + ':' + String(until.getMinutes()).padStart(2,'0');
    el.innerHTML = `
      <div style="color:var(--warning,#e5a117);">Şu an susmuş — ${hhmm}'e kadar</div>
      <button class="small" style="margin-top:6px;" onclick="muteUnset()">Aç</button>
    `;
  } else {
    el.innerHTML = `
      <div style="color:var(--text-muted);font-size:0.85em;margin-bottom:6px;">Görev hatırlatmalarını + sesleri kısa süre sustur.</div>
      <button class="small secondary" onclick="muteFor(60)">1 saat</button>
      <button class="small secondary" onclick="muteFor(180)">3 saat</button>
      <button class="small secondary" onclick="muteFor(480)">Bugün (8sa)</button>
    `;
  }
}

// ============ BİLDİRİM ============
// PWA'da (özellikle iOS Safari) `new Notification()` çalışmaz — SW üzerinden göndermek lazım.

// VAPID public key — background push için (private key Worker secret'ta). Açıkta olması güvenli.
const VAPID_PUBLIC_KEY = 'BLDDq-zIRkPMlVLlceD_P8HThl1AszV6EzWY4caDvoAG5e3NiY8YUf1D6KMHOfZBJ-0WM5Ab06KKfFvLuBZV4v8';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Bu cihazı background push'a kaydet — subscription data.settings.pushSubs'a yazılır, Supabase'e sync olur
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push API desteklenmiyor (eski iOS / tarayıcı)');
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    savePushSub(sub);
    return true;
  } catch (e) {
    console.warn('Push subscribe başarısız:', e);
    return false;
  }
}

function savePushSub(sub) {
  const json = sub.toJSON();
  if (!json || !json.endpoint) return;
  data.settings = data.settings || {};
  data.settings.pushSubs = data.settings.pushSubs || [];
  const entry = {
    endpoint: json.endpoint,
    keys: json.keys,
    ua: (navigator.userAgent || '').slice(0, 80),
    added: today()
  };
  const idx = data.settings.pushSubs.findIndex(s => s.endpoint === json.endpoint);
  if (idx >= 0) data.settings.pushSubs[idx] = entry;
  else data.settings.pushSubs.push(entry);
  save();
}

function askNotif() {
  if (!('Notification' in window)) {
    showToast('Bu cihaz bildirimi desteklemiyor', 'warning');
    return;
  }
  Notification.requestPermission().then(async p => {
    const banner = document.getElementById('notifBanner');
    if (p === 'granted') {
      if (banner) banner.style.display = 'none';
      notify('✅ Aidan hazır!', 'Hatırlatmalar artık bildirim olarak gelecek.');
      showToast('Bildirimler açıldı', 'success');
      // Telefon kapalıyken de bildirim için background push'a kaydol
      const ok = await subscribeToPush();
      if (ok) showToast('Bu cihaz kayıt edildi — Aidan kapalıyken de bildirim gelir', 'success', 4000);
    } else if (p === 'denied') {
      showToast('Bildirim izni reddedildi. Telefon ayarlarından açabilirsin.', 'warning', 5000);
    }
    renderNotifSettings();
  });
}

// SW üzerinden bildirim — PWA ve iOS uyumlu. Fallback olarak window Notification.
function notify(title, body, opts = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notifOptions = {
    body,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: opts.tag || 'aidan-' + Date.now(),
    renotify: true,
    data: { url: opts.url || '/', taskId: opts.taskId || null },
    ...opts
  };
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, notifOptions).catch(() => {
        // Son çare: window Notification (masaüstü)
        try { new Notification(title, notifOptions); } catch (e) {}
      });
    });
  } else {
    try { new Notification(title, notifOptions); } catch (e) {}
  }
}

// Ayarlar ekranında bildirim durumunu göster
function renderNotifSettings() {
  const el = document.getElementById('notifSettings');
  if (!el) return;
  if (!('Notification' in window)) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:0.85em;">Bu cihaz bildirimi desteklemiyor.</div>`;
    return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    const subCount = (data.settings && data.settings.pushSubs || []).length;
    const pushLine = subCount > 0
      ? `<div style="color:var(--text-muted);font-size:0.85em;margin-top:4px;">${subCount} cihaz kayıtlı — Aidan kapalıyken de bildirim gelir</div>`
      : `<div style="color:var(--text-muted);font-size:0.85em;margin-top:4px;">Bu cihaz henüz arka plan bildirimine kayıtlı değil</div>
         <button class="small secondary" style="margin-top:6px;" onclick="enablePushHere()">Bu cihazı kaydet</button>`;
    el.innerHTML = `
      <div style="color:var(--success);">✅ Bildirimler açık</div>
      ${pushLine}
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
        <button class="small" onclick="testNotif()">Test bildirimi gönder</button>
        <button class="small secondary" onclick="resubscribePush()">Push'u sıfırla</button>
      </div>
      <div style="color:var(--text-muted);font-size:0.78em;margin-top:6px;">Sıfırla = telefonu kapalıyken bildirim gelmiyorsa subscription'ı yenile.</div>
    `;
  } else if (perm === 'denied') {
    el.innerHTML = `
      <div style="color:var(--danger);">❌ Bildirim reddedildi</div>
      <div style="color:var(--text-muted);font-size:0.85em;margin-top:4px;">Telefonda Ayarlar → Safari → Bildirimler'den açabilirsin.</div>
    `;
  } else {
    el.innerHTML = `
      <button class="small" onclick="askNotif()">Bildirimleri aç</button>
      <div style="color:var(--text-muted);font-size:0.85em;margin-top:4px;">Görev saatleri geldiğinde Aidan sana hatırlatır.</div>
    `;
  }
  renderPushLog();
}

// Bildirim geçmişi — Worker'ın gönderdiği push'ları gösterir (data.pushLog)
function pushLogRelTime(when) {
  const diff = Date.now() - when;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk önce`;
  const d = new Date(when);
  const todayMid = new Date(); todayMid.setHours(0,0,0,0);
  const itemMid = new Date(when); itemMid.setHours(0,0,0,0);
  const dayDiff = Math.round((todayMid - itemMid) / 86400000);
  const hhmm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  if (dayDiff === 0) return `bugün ${hhmm}`;
  if (dayDiff === 1) return `dün ${hhmm}`;
  const names = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
  return `${names[d.getDay()]} ${hhmm}`;
}

function renderPushLog() {
  const list = document.getElementById('pushlogList');
  const badge = document.getElementById('pushlogBadge');
  if (!list) return;
  const log = data.pushLog || [];
  if (badge) badge.textContent = log.length ? String(log.length) : '';
  if (log.length === 0) {
    list.innerHTML = '<div class="pushlog-empty">Henüz bildirim gelmedi.<br>Sabah/öğle/akşam brifingleri burada birikir.</div>';
    return;
  }
  list.innerHTML = log.map(e => `
    <div class="pushlog-item">
      <div class="pushlog-item-title"><span>${escapeHtml(e.title || 'Aidan')}</span><span class="pushlog-item-when">${pushLogRelTime(e.when)}</span></div>
      ${e.body ? `<div class="pushlog-item-body">${escapeHtml(e.body)}</div>` : ''}
    </div>
  `).join('');
}

// ============ SABİT HATIRLATICILAR (ilaç/su/ders) ============
// Liste data.reminders[]'da durur, Supabase'e sync olur; saati gelince Worker (15dk cron) push atar.
function renderFixedReminders() {
  const el = document.getElementById('fixedRemindersList');
  if (!el) return;
  const rems = (data.reminders || []).filter(r => r.kind !== 'supp');
  if (!rems.length) {
    el.innerHTML = '<div class="fixedrem-empty">Henüz sabit hatırlatıcın yok — aşağıdan ekle.</div>';
    return;
  }
  const sorted = [...rems].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  el.innerHTML = sorted.map(r => `
    <div class="fixedrem-item ${r.enabled === false ? 'off' : ''}">
      <input type="checkbox" ${r.enabled !== false ? 'checked' : ''} onchange="toggleFixedReminder(${r.id})" aria-label="Aç/kapa">
      <span class="fixedrem-time">${escapeHtml(r.time || '–')}</span>
      <span class="fixedrem-label">${escapeHtml(r.label || '')}</span>
      <span class="fixedrem-days">${r.days === 'weekdays' ? 'Hafta içi' : 'Her gün'}</span>
      <button class="fixedrem-del" onclick="deleteFixedReminder(${r.id})" aria-label="Sil">✕</button>
    </div>
  `).join('');
}

function addFixedReminder() {
  const label = document.getElementById('fixedRemLabel').value.trim();
  const time = document.getElementById('fixedRemTime').value;
  const days = document.getElementById('fixedRemDays').value;
  if (!label) { showToast('Bir isim yaz — örn. "İlacını al" ', 'warning', 3000); return; }
  if (!time) { showToast('Saat seç ⏰', 'warning', 3000); return; }
  data.reminders = data.reminders || [];
  data.reminders.push({ id: Date.now(), label, time, days, enabled: true, lastFired: null });
  document.getElementById('fixedRemLabel').value = '';
  document.getElementById('fixedRemTime').value = '';
  save();
  renderFixedReminders();
  showToast(`⏰ ${time} — "${label}" kuruldu`, 'success', 3000);
}

function toggleFixedReminder(id) {
  const r = (data.reminders || []).find(x => x.id === id);
  if (!r) return;
  r.enabled = (r.enabled === false);
  save();
  renderFixedReminders();
}

function deleteFixedReminder(id) {
  data.reminders = (data.reminders || []).filter(x => x.id !== id);
  save();
  renderFixedReminders();
  showToast('Hatırlatıcı silindi', 'info', 2500);
}

// ============ 📅 TAKVİM SENKRONU (ICS abonelik) ============
// Görevleri (due) + geri sayımları iOS/Google takvimine tek yönlü abone feed.
// Worker /calendar.ics?token= endpoint'i data.settings.calendarToken ile eşler.
const CALENDAR_ICS_BASE = 'https://aidan-pusher.fenerlisalim04.workers.dev/calendar.ics';

function genCalendarToken() {
  const a = new Uint8Array(18);
  (window.crypto || crypto).getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

function calendarUrl() {
  const tok = data.settings && data.settings.calendarToken;
  return tok ? CALENDAR_ICS_BASE + '?token=' + tok : '';
}

function renderCalendarSync() {
  const el = document.getElementById('calendarSyncBox');
  if (!el) return;
  if (!window._user) {
    el.innerHTML = '<div class="fixedrem-empty">Önce Supabase\'e giriş yap — bağlantı hesabına özel.</div>';
    return;
  }
  const url = calendarUrl();
  if (!url) {
    el.innerHTML = '<button class="small" onclick="createCalendarLink()">🔗 Takvim bağlantısı oluştur</button>';
    return;
  }
  el.innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">' +
      '<input type="text" id="calUrlField" readonly value="' + escapeHtml(url) + '" style="flex:1;font-size:12px;">' +
      '<button class="small" onclick="copyCalendarUrl()">📋 Kopyala</button>' +
    '</div>' +
    '<details style="margin-bottom:8px;">' +
      '<summary style="cursor:pointer;font-size:13px;">iPhone\'a nasıl eklerim?</summary>' +
      '<ol style="margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.6;">' +
        '<li>Yukarıdaki bağlantıyı <b>Kopyala</b>\'ya bas.</li>' +
        '<li>iPhone → <b>Ayarlar</b> → <b>Takvim</b> → <b>Hesaplar</b>.</li>' +
        '<li><b>Hesap Ekle</b> → <b>Diğer</b> → <b>Abone Olunan Takvim Ekle</b>.</li>' +
        '<li>Bağlantıyı <b>yapıştır</b> → <b>İleri</b> → <b>Kaydet</b>.</li>' +
        '<li>Görevlerin Takvim uygulamasında görünür.</li>' +
      '</ol>' +
      '<div class="settings-help">Google Takvim: calendar.google.com → Diğer takvimler → URL\'den → bağlantıyı yapıştır.</div>' +
    '</details>' +
    '<button class="small" onclick="resetCalendarLink()">Bağlantıyı sıfırla</button>';
}

function createCalendarLink() {
  data.settings = data.settings || {};
  if (!data.settings.calendarToken) data.settings.calendarToken = genCalendarToken();
  save();
  renderCalendarSync();
  showToast('📅 Takvim bağlantın hazır — kopyala, iPhone Takvim\'e abone ol', 'success', 4000);
}

function resetCalendarLink() {
  data.settings = data.settings || {};
  data.settings.calendarToken = genCalendarToken();
  save();
  renderCalendarSync();
  showToast('🔄 Yeni bağlantı üretildi — eski abonelik durur, yenisini ekle', 'info', 4000);
}

async function copyCalendarUrl() {
  const url = calendarUrl();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    showToast('📋 Kopyalandı', 'success', 2000);
  } catch (e) {
    const f = document.getElementById('calUrlField');
    if (f) { f.select(); document.execCommand('copy'); showToast('📋 Kopyalandı', 'success', 2000); }
  }
}

// ============ GERİ SAYIMLAR (sınav/teslim) ============
// data.countdowns[] = [{id, label, date:'YYYY-MM-DD'}]. Görevler tabında üst kart,
// Ayarlar'da yönet. Zaman körlüğüne karşı: iri "X gün kaldı" rakamı.
function daysUntilCountdown(dateStr) {
  if (!dateStr) return null;
  // Hem target hem bugün lokal gece yarısı → tam 24h diff, DST'ye dayanıklı
  const parts = String(dateStr).split('-').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) return null;
  const target = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  return Math.round((target - todayMid.getTime()) / 86400000);
}

function formatTrDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

// ============ 🧩 GÜNLÜK SKOR (modüller arası: MIT + kalori + su + odak) ============
// Görevler tabının üstünde tek satır kart — dört modülün bugünkü durumu. Veri yoksa gizli.
function renderDailyScore() {
  if (typeof renderAidanNote === 'function') renderAidanNote();
  const el = document.getElementById('dailyScore');
  if (!el) return;
  const t = today();
  const mit = (data.tasks || []).filter(x => x.mitDate === t);
  const mitDone = mit.filter(x => x.done).length;
  const d = data.diet || {};
  const day = (d.days || {})[t] || { meals: [], waterL: 0 };
  const kcal = (day.meals || []).reduce((s, m) => s + (+m.kcal || 0), 0);
  const kcalGoal = d.kcalGoal || 2000;
  const waterL = day.waterL || 0;
  const waterGoal = d.waterGoalL || 2.5;
  const pomo = (data.pomoToday && data.pomoToday.date === t) ? (data.pomoToday.count || 0) : 0;
  // Takviye: bugüne uyan aktifler (hafta içi olanlar hafta sonu sayılmaz)
  const dow = new Date(t + 'T12:00:00').getDay();
  const supps = (data.reminders || []).filter(r => r.kind === 'supp' && r.enabled !== false && !(r.days === 'weekdays' && (dow === 0 || dow === 6)));
  const suppTaken = supps.filter(r => (r.takenLog || []).includes(t) || r.takenDate === t).length;
  if (!mit.length && !kcal && !waterL && !pomo && !supps.length) { el.innerHTML = ''; return; }
  const items = [
    { label: 'MIT', val: mit.length ? `${mitDone}/${mit.length}` : '–', on: mit.length > 0 && mitDone >= mit.length },
    { label: kcal ? `/${kcalGoal} kcal` : 'kcal', val: kcal ? String(kcal) : '–', on: kcal > 0 && kcal <= kcalGoal },
    { label: 'su (L)', val: waterL ? String(Math.round(waterL * 100) / 100).replace('.', ',') : '–', on: waterL >= waterGoal },
    { label: 'odak', val: pomo ? `${pomo} seans` : '–', on: pomo > 0 }
  ];
  if (supps.length) items.push({ label: 'takviye', val: `${suppTaken}/${supps.length}`, on: suppTaken >= supps.length });
  el.innerHTML = `<div class="score-card">` + items.map(i =>
    `<div class="score-item${i.on ? ' on' : ''}"><span class="score-val">${i.val}</span><span class="score-label">${i.label}</span></div>`
  ).join('') + `</div>`;
}

// ============ 🔗 AIDAN'IN NOTU — çapraz-modül tek dürtü ============
// Skor kartı SAYI verir; bu satır o sayıları OKUYUP en önemli tek şeyi söyler (ADHD: tek şeye indir).
// Yerel + kural tabanlı (AI maliyeti yok, anında). Suçlamayan dil. Sen halledince not sonrakine kayar.
// Öncelik sırasıyla ilk eşleşen döner — en kritik sinyal üste çıkar.
function suppMissedStreak(r) {
  // Dünden geriye: o güne planlıysa (gün filtresi + oluşturma sonrası) ve alınmadıysa ardışık say.
  const created = r.id ? new Date(r.id).toISOString().slice(0, 10) : null;
  let streak = 0;
  for (let i = 1; i <= 10; i++) {
    const d = shiftDateStr(today(), -i);
    if (created && d < created) break;
    const dow = new Date(d + 'T12:00:00').getDay();
    if (r.days === 'weekdays' && (dow === 0 || dow === 6)) continue; // planlı değil
    if (typeof suppTakenOn === 'function' ? suppTakenOn(r, d) : ((r.takenLog || []).includes(d) || r.takenDate === d)) break;
    streak++;
  }
  return streak;
}

function aidanNoteLine() {
  const t = today();
  const hour = new Date().getHours();
  const tasks = data.tasks || [];
  const active = tasks.filter(x => !x.done);

  // 1. Gecikmiş ACİL görev — en kritik
  const overdue = active.filter(x => x.priority === 'urgent' && x.due && x.due < t);
  if (overdue.length) return { tone: 'urgent', text: `${overdue.length} acil görev gecikti — birini seç, 2dk dene ya da ertele` };

  // 2. Yaklaşan geri sayım (sınav/teslim) ≤ 2 gün
  const cds = (data.countdowns || []).map(c => ({ label: c.label, d: daysUntilCountdown(c.date) }))
    .filter(c => c.d != null && c.d >= 0 && c.d <= 2).sort((a, b) => a.d - b.d);
  if (cds.length) {
    const c = cds[0]; const when = c.d === 0 ? 'bugün' : (c.d === 1 ? 'yarın' : '2 gün sonra');
    return { tone: 'warn', text: `${c.label || 'Yaklaşan tarih'} ${when} — hazırlık zamanı` };
  }

  // 3. MIT seçili ama öğleden sonra hâlâ hiç bitmemiş
  const mit = tasks.filter(x => x.mitDate === t);
  const mitDone = mit.filter(x => x.done).length;
  if (mit.length && mitDone === 0 && hour >= 13 && hour < 20)
    return { tone: 'info', text: `Bugünün 3'ü duruyor, henüz başlamadın — birini seç, 2dk dene` };

  // 4. Takviye 3+ gündür atlanıyor
  const supps = (data.reminders || []).filter(r => r.kind === 'supp' && r.enabled !== false);
  for (const r of supps) {
    if (suppMissedStreak(r) >= 3) return { tone: 'warn', text: `${r.label} son 3+ gündür işaretlenmedi — bugün almayı unutma` };
  }

  // 5. Akşam + su hedefinin yarısının altında
  const day = ((data.diet || {}).days || {})[t] || {};
  const waterL = day.waterL || 0, waterGoal = (data.diet || {}).waterGoalL || 2.5;
  if (hour >= 18 && hour < 23 && waterL > 0 && waterL < waterGoal * 0.5)
    return { tone: 'info', text: `Su hedefinin yarısındasın — akşam bitmeden birkaç bardak` };

  // 6. Öğleden sonra + odak seansı yok ama bitmemiş MIT var
  const pomo = (data.pomoToday && data.pomoToday.date === t) ? (data.pomoToday.count || 0) : 0;
  if (hour >= 11 && hour < 20 && pomo === 0 && mit.length && mitDone < mit.length)
    return { tone: 'info', text: `Bugün hiç odak seansı yok — 25 dk kur, MIT'e otur` };

  // 7. Çok ertelenen görev
  const stuck = active.filter(x => (x.postponeCount || 0) >= 3 && !x.nudgeDismissed);
  if (stuck.length) return { tone: 'warn', text: `"${(stuck[0].text || '').slice(0, 30)}" çok ertelendi — küçük adımlara bölelim mi?` };

  // 8. Her şey yolunda (akşam) — nadir pozitif
  if (hour >= 18 && mit.length && mitDone >= mit.length && waterL >= waterGoal)
    return { tone: 'good', text: `Bugünü topladın — 3'ü tamam, su tamam. İyi iş.` };

  return null;
}

function renderAidanNote() {
  const el = document.getElementById('aidanNote');
  if (!el) return;
  const note = aidanNoteLine();
  if (!note) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.className = 'aidan-note ' + note.tone;
  el.innerHTML = `<span class="an-icon"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg></span><span class="an-text">${escapeHtml(note.text)}</span>`;
}

function renderCountdowns() {
  const el = document.getElementById('countdownList');
  if (!el) return;
  const list = (data.countdowns || []).slice()
    .map(c => ({ ...c, days: daysUntilCountdown(c.date) }))
    .filter(c => c.days != null)
    // Geçmişe ait olanları 7 gün boyunca göster (sınavı kaçırdıysan hâlâ "geçti" bilgisi versin)
    .filter(c => c.days >= -7)
    .sort((a, b) => a.days - b.days);
  if (!list.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = list.map(c => {
    let cls = '';
    if (c.days < 0) cls = 'past';
    else if (c.days <= 3) cls = 'urgent';
    else if (c.days <= 10) cls = 'warn';
    const bigNum = c.days < 0 ? 'Geçti' : String(c.days);
    const suffix = c.days < 0
      ? `${Math.abs(c.days)} gün önce`
      : (c.days === 0 ? 'BUGÜN' : (c.days === 1 ? 'gün kaldı' : 'gün kaldı'));
    return `
      <div class="countdown-card ${cls}">
        <div class="countdown-days">${bigNum}<span class="countdown-days-suffix">${suffix}</span></div>
        <div class="countdown-info">
          <div class="countdown-label-row">⏳ ${escapeHtml(c.label || 'Tarih')}</div>
          <div class="countdown-date">${formatTrDate(c.date)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderCountdownManage() {
  const el = document.getElementById('countdownManageList');
  if (!el) return;
  const list = (data.countdowns || []).slice()
    .map(c => ({ ...c, days: daysUntilCountdown(c.date) }))
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  if (!list.length) {
    el.innerHTML = '<div class="fixedrem-empty">Henüz geri sayım yok — sınav/teslim tarihi ekle.</div>';
    return;
  }
  el.innerHTML = list.map(c => {
    const dayStr = c.days == null ? '—' : (c.days < 0 ? `${Math.abs(c.days)} gün önce` : (c.days === 0 ? 'bugün' : `${c.days} gün`));
    return `
      <div class="countdown-row">
        <div class="countdown-row-info">
          <div class="countdown-row-label">${escapeHtml(c.label || '')}</div>
          <div class="countdown-row-meta">${formatTrDate(c.date)} · ${dayStr}</div>
        </div>
        <button class="del-btn" onclick="deleteCountdown(${c.id})" title="Sil">✕</button>
      </div>
    `;
  }).join('');
}

function addCountdown() {
  const label = document.getElementById('countdownLabel').value.trim();
  const date = document.getElementById('countdownDate').value;
  if (!label) { showToast('Bir isim yaz — örn. "Tarih sınavı" ', 'warning', 3000); return; }
  if (!date) { showToast('Tarih seç ⏳', 'warning', 3000); return; }
  data.countdowns = data.countdowns || [];
  data.countdowns.push({ id: Date.now(), label, date });
  document.getElementById('countdownLabel').value = '';
  document.getElementById('countdownDate').value = '';
  save();
  renderCountdowns();
  renderCountdownManage();
  showToast(`⏳ "${label}" eklendi`, 'success', 2500);
}

function deleteCountdown(id) {
  data.countdowns = (data.countdowns || []).filter(x => x.id !== id);
  save();
  renderCountdowns();
  renderCountdownManage();
  showToast('Geri sayım silindi', 'info', 2500);
}

// ============ OKUL (ders programı + sınavlar) ============
// data.school = { timetable:{'1'..'5':[dersler]}, exams:[{id,subject,date,topics}] }
// Ödevler ayrı: mevcut görev sisteminde (Ödev/Özel Ders kategorileri) kalır.
const SCHOOL_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const SCHOOL_DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'];

function ensureSchool() {
  if (!data.school) data.school = { timetable: {}, exams: [] };
  if (!data.school.timetable) data.school.timetable = {};
  if (!data.school.exams) data.school.exams = [];
  return data.school;
}

// JS getDay: 0=Paz..6=Cmt. Program anahtarı 1..5 (Pzt..Cuma). Hafta sonu → null.
function todaySchoolKey() {
  const d = new Date().getDay();
  return (d >= 1 && d <= 5) ? String(d) : null;
}

// ============ 🎓 CLASSROOM GÖRSELİNDEN ÖDEV — AI vision → son tarihli görev ============
// Okul hesabı OAuth/takvim beslemesine kapalı → görsel köprüsü (borsa portföy-görsel deseni).
const CLASSROOM_IMAGE_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/classroom-image';
let _clImportItems = [];

async function handleClassroomPhoto(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!window._supa || !window._user) { showToast('Önce Ayarlar → bulut girişi yap', 'warning', 4000); return; }
  openClassroomImport();
  setClImportStatus('Görsel hazırlanıyor…');
  try {
    const dataUrl = await resizeImageToDataUrl(file);
    setClImportStatus('Aidan ödevleri okuyor… 10-15 sn sürebilir, sabret');
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum yok');
    const r = await fetch(CLASSROOM_IMAGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ image: dataUrl }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('hata ' + r.status));
    const items = Array.isArray(j.items) ? j.items : [];
    if (!items.length) {
      let dbg = '';
      if (j.aiError) dbg = `\n\n(AI hatası: ${j.aiError})`;
      else if (j.raw) dbg = `\n\n(AI cevabı: ${String(j.raw).slice(0, 200)})`;
      setClImportStatus('Görselde ödev bulamadım. Ödev/yapılacaklar listesinin net bir görüntüsünü dene.' + dbg, true);
      return;
    }
    _clImportItems = items;
    renderClImportList();
  } catch (e) {
    setClImportStatus('Okuma başarısız: ' + e.message, true);
  }
}

function setClImportStatus(msg, isError) {
  const el = document.getElementById('classroomImportStatus');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
}

function openClassroomImport() {
  _clImportItems = [];
  document.getElementById('classroomImportList').innerHTML = '';
  document.getElementById('classroomImportActions').style.display = 'none';
  document.getElementById('classroomImportModal').classList.add('active');
}

function closeClassroomImport() {
  document.getElementById('classroomImportModal').classList.remove('active');
  _clImportItems = [];
}

// AI sonuçları düzenlenebilir satır — başlık + son tarih (vision hata yapabilir, kullanıcı düzeltsin)
function renderClImportList() {
  setClImportStatus(`${_clImportItems.length} ödev buldum. Kontrol et, düzelt, ekle 👇`);
  const list = document.getElementById('classroomImportList');
  list.innerHTML = _clImportItems.map((it, i) => `
    <div class="cl-import-row">
      <input class="cl-imp-title" value="${escapeHtml(it.title || '')}" oninput="updateClImport(${i},'title',this.value)" placeholder="Ödev adı">
      <div class="cl-imp-bot">
        <label>Son tarih<input class="cl-imp-due" type="date" value="${escapeHtml(it.due || '')}" onchange="updateClImport(${i},'due',this.value)"></label>
        <input class="cl-imp-course" value="${escapeHtml(it.course || '')}" oninput="updateClImport(${i},'course',this.value)" placeholder="Ders (opsiyonel)">
        <button class="cl-imp-del" onclick="removeClImport(${i})" title="Çıkar" aria-label="Çıkar">✕</button>
      </div>
    </div>
  `).join('');
  document.getElementById('classroomImportActions').style.display = 'flex';
}

function updateClImport(i, field, val) {
  if (!_clImportItems[i]) return;
  if (field === 'due') _clImportItems[i].due = /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
  else _clImportItems[i][field] = val;
}

function removeClImport(i) {
  _clImportItems.splice(i, 1);
  if (!_clImportItems.length) {
    setClImportStatus('Liste boş. İptal et ya da yeni görsel dene.', true);
    document.getElementById('classroomImportActions').style.display = 'none';
    document.getElementById('classroomImportList').innerHTML = '';
    return;
  }
  renderClImportList();
}

// Onaylanan ödevleri görev olarak ekle — aynı başlık+tarih varsa atla (tekrar görüntüde çift olmasın)
function confirmClassroomImport() {
  const norm = s => (s || '').trim().toLowerCase();
  const active = (data.tasks || []).filter(x => !x.done);
  let added = 0, dup = 0;
  for (const it of _clImportItems) {
    const title = (it.title || '').trim();
    if (!title) continue;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(it.due || '') ? it.due : null;
    const exists = active.some(x => norm(x.text) === norm(title) && (x.due || null) === due);
    if (exists) { dup++; continue; }
    const task = makeTask({ text: title, due, category: 'odev', priority: 'normal' });
    const course = (it.course || '').trim();
    if (course) task.notes = course;
    data.tasks.push(task);
    added++;
  }
  save(); renderTasks();
  closeClassroomImport();
  if (added) showToast(`${added} ödev görevlere eklendi${dup ? ` · ${dup} zaten vardı` : ''}`, 'success', 3800);
  else showToast(dup ? `Hepsi zaten görevlerinde (${dup})` : 'Ödev eklenmedi', 'info', 3000);
}

function renderSchool() {
  const s = ensureSchool();
  const key = todaySchoolKey();
  // Bugünün dersleri
  const todayEl = document.getElementById('schoolToday');
  if (todayEl) {
    const lessons = key ? (s.timetable[key] || []) : [];
    if (!key) todayEl.innerHTML = '<span class="school-today-empty">Bugün hafta sonu — ders yok.</span>';
    else if (!lessons.length) todayEl.innerHTML = '<span class="school-today-empty">Bugüne ders girilmemiş — programı düzenle.</span>';
    else todayEl.innerHTML = '<span class="school-today-lbl">Bugün:</span> ' +
      lessons.map(l => `<span class="school-chip">${escapeHtml(l)}</span>`).join('');
  }
  // Haftalık program grid
  const gridEl = document.getElementById('schoolGrid');
  if (gridEl) {
    gridEl.innerHTML = SCHOOL_DAYS.map((name, i) => {
      const k = String(i + 1);
      const lessons = s.timetable[k] || [];
      const chips = lessons.length
        ? lessons.map(l => `<span class="school-gchip">${escapeHtml(l)}</span>`).join('')
        : '<span class="school-gempty">—</span>';
      return `<div class="school-gcol ${k === key ? 'today' : ''}">
        <div class="school-gday">${SCHOOL_DAYS_SHORT[i]}</div>
        <div class="school-gchips">${chips}</div>
      </div>`;
    }).join('');
  }
  // Sınavlar
  const examEl = document.getElementById('schoolExams');
  if (examEl) {
    const list = (s.exams || []).slice()
      .map(e => ({ ...e, days: daysUntilCountdown(e.date) }))
      .filter(e => e.days == null || e.days >= -3)
      .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
    if (!list.length) examEl.innerHTML = '<div class="school-exam-empty">Yaklaşan sınav yok.</div>';
    else examEl.innerHTML = list.map(e => {
      let cls = '';
      if (e.days != null) { if (e.days < 0) cls = 'past'; else if (e.days <= 3) cls = 'urgent'; else if (e.days <= 10) cls = 'warn'; }
      const dstr = e.days == null ? '' : (e.days < 0 ? 'geçti' : (e.days === 0 ? 'BUGÜN' : `${e.days} gün`));
      return `<div class="school-exam ${cls}">
        <div class="school-exam-days">${dstr}</div>
        <div class="school-exam-info">
          <div class="school-exam-subj">${escapeHtml(e.subject || 'Sınav')}</div>
          <div class="school-exam-meta">${formatTrDate(e.date)}${e.topics ? ' · ' + escapeHtml(e.topics) : ''}</div>
        </div>
        <button class="del-btn" onclick="deleteExam(${e.id})" title="Sil">✕</button>
      </div>`;
    }).join('');
  }
  // Rozet: bugünün ders sayısı + yaklaşan sınav (7 gün)
  const badge = document.getElementById('schoolBadge');
  if (badge) {
    const lc = key ? (s.timetable[key] || []).length : 0;
    const soon = (s.exams || []).filter(e => { const d = daysUntilCountdown(e.date); return d != null && d >= 0 && d <= 7; }).length;
    const bits = [];
    if (lc) bits.push(`${lc} ders`);
    if (soon) bits.push(`${soon} sınav`);
    badge.textContent = bits.length ? bits.join(' · ') : '';
  }
}

function openTimetable() {
  const s = ensureSchool();
  for (let i = 1; i <= 5; i++) {
    const inp = document.getElementById('ttDay' + i);
    if (inp) inp.value = (s.timetable[String(i)] || []).join(', ');
  }
  document.getElementById('timetableModal').classList.add('active');
}
function closeTimetable() {
  document.getElementById('timetableModal').classList.remove('active');
}
function saveTimetable() {
  const s = ensureSchool();
  for (let i = 1; i <= 5; i++) {
    const inp = document.getElementById('ttDay' + i);
    if (!inp) continue;
    const lessons = inp.value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 12);
    if (lessons.length) s.timetable[String(i)] = lessons;
    else delete s.timetable[String(i)];
  }
  save();
  renderSchool();
  closeTimetable();
  showToast('Ders programı kaydedildi', 'success', 2500);
}

function addExam() {
  const s = ensureSchool();
  const subj = document.getElementById('examSubject').value.trim();
  const date = document.getElementById('examDate').value;
  const topics = document.getElementById('examTopics').value.trim();
  if (!subj) { showToast('Ders adı yaz — örn. "Matematik"', 'warning', 3000); return; }
  if (!date) { showToast('Sınav tarihi seç', 'warning', 3000); return; }
  s.exams.push({ id: Date.now(), subject: subj, date, topics });
  document.getElementById('examSubject').value = '';
  document.getElementById('examDate').value = '';
  document.getElementById('examTopics').value = '';
  save();
  renderSchool();
  showToast(`"${subj}" sınavı eklendi`, 'success', 2500);
}
function deleteExam(id) {
  const s = ensureSchool();
  s.exams = (s.exams || []).filter(x => x.id !== id);
  save();
  renderSchool();
  showToast('Sınav silindi', 'info', 2000);
}

// ============ GLOBAL ARAMA ============
function trLower(s) { return (s == null ? '' : String(s)).toLocaleLowerCase('tr-TR'); }

function openSearchModal() {
  const i = document.getElementById('globalSearchInput');
  if (i) i.value = '';
  runGlobalSearch();
  document.getElementById('searchModal').classList.add('active');
  setTimeout(() => { if (i) i.focus(); }, 60);
}
function closeSearchModal() {
  document.getElementById('searchModal').classList.remove('active');
}
function gsMatch(q, ...fields) { return fields.some(f => f && trLower(f).includes(q)); }

function runGlobalSearch() {
  const el = document.getElementById('globalSearchResults');
  if (!el) return;
  const raw = (document.getElementById('globalSearchInput').value || '').trim();
  const q = trLower(raw);
  if (q.length < 2) { el.innerHTML = '<div class="gsearch-hint">En az 2 harf yaz…</div>'; return; }
  const groups = [];
  const tasks = (data.tasks || []).filter(t => gsMatch(q, t.text, t.notes)).slice(0, 8);
  if (tasks.length) groups.push({ title: 'Görevler', items: tasks.map(t => ({ label: t.text, sub: t.done ? 'bitti' : (t.due ? ('son: ' + t.due) : ''), onclick: `gsGoTask(${t.id})` })) });
  const dumps = (data.dumps || []).filter(d => gsMatch(q, d.text)).slice(0, 6);
  if (dumps.length) groups.push({ title: 'Zihin boşalt', items: dumps.map(d => ({ label: d.text, sub: '', onclick: "gsGo('tasks')" })) });
  const jr = (data.journal || []).filter(j => gsMatch(q, j.text, j.reflection)).slice(0, 5);
  if (jr.length) groups.push({ title: 'Günlük', items: jr.map(j => ({ label: (j.text || j.reflection || '').slice(0, 70), sub: j.date || '', onclick: "gsGo('tasks')" })) });
  const meals = [];
  const dd = (data.diet && data.diet.days) || {};
  Object.keys(dd).sort().reverse().forEach(dt => {
    (dd[dt].meals || []).forEach(m => { if (gsMatch(q, m.name)) meals.push({ label: m.name, sub: dt + (m.kcal ? (' · ' + m.kcal + ' kcal') : ''), onclick: "gsGo('diet')" }); });
  });
  if (meals.length) groups.push({ title: 'Besin', items: meals.slice(0, 6) });
  const stk = (data.watchlist || []).filter(w => gsMatch(q, w.symbol, w.name)).slice(0, 6);
  if (stk.length) groups.push({ title: 'Borsa', items: stk.map(w => ({ label: w.symbol + (w.name ? (' · ' + w.name) : ''), sub: w.price != null ? String(w.price) : '', onclick: "gsGo('stocks')" })) });
  const school = (data.school || {});
  const exams = (school.exams || []).filter(e => gsMatch(q, e.subject, e.topics)).slice(0, 5);
  if (exams.length) groups.push({ title: 'Sınavlar', items: exams.map(e => ({ label: e.subject, sub: (e.date || '') + (e.topics ? (' · ' + e.topics) : ''), onclick: "gsGoSchool()" })) });

  if (!groups.length) { el.innerHTML = '<div class="gsearch-hint">Sonuç yok.</div>'; return; }
  el.innerHTML = groups.map(g =>
    `<div class="gsearch-group"><div class="gsearch-group-title">${g.title}</div>` +
    g.items.map(it => `<div class="gsearch-item" onclick="${it.onclick}"><div class="gsearch-item-label">${escapeHtml(it.label || '')}</div>${it.sub ? `<div class="gsearch-item-sub">${escapeHtml(it.sub)}</div>` : ''}</div>`).join('') +
    `</div>`
  ).join('');
}

function gsGo(tab) { closeSearchModal(); showTab(tab, document.querySelector(`[data-tab="${tab}"]`)); }
function gsGoTask(id) {
  closeSearchModal();
  showTab('tasks', document.querySelector('[data-tab="tasks"]'));
  const t = (data.tasks || []).find(x => x.id === id);
  const si = document.getElementById('taskSearch');
  if (si && t) { si.value = (t.text || '').slice(0, 24); renderTasks(); }
}
function gsGoSchool() {
  closeSearchModal();
  showTab('tasks', document.querySelector('[data-tab="tasks"]'));
  const ss = document.getElementById('schoolSection');
  if (ss) { ss.open = true; renderSchool(); setTimeout(() => ss.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }
}

// ============ ONBOARDING (ilk açılış turu) ============
const ONBOARD_STEPS = [
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>', title: 'Aidan\'a hoş geldin', body: 'Görev, odak, okul, borsa ve diyet — hepsi tek yerde. ADHD beynine göre: sade, parçalı, baskısız.' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', title: 'Bugünün 3\'ü', body: 'Günde en fazla 3 önemli iş seç. Gerisi listede bekler, seni dağıtmaz. Bittikçe üstünü çiz.' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>', title: 'Okul & sınavlar', body: 'Görevler sekmesindeki "Okul" panelinde ders programın ve sınav geri sayımların durur. Ödevleri görev olarak eklersin.' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1v-6a9 9 0 0 1 18 0v6a1 1 0 0 1-1 1h-2a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>', title: 'Odak modu', body: 'Dağıldığında 25 dk odak sayacı başlat — telefon kilitliyken bile doğru sayar. İlk adımı at, gerisi gelir.' },
];
let _obStep = 0;

function maybeShowOnboarding() {
  try {
    if (localStorage.getItem('aidan_onboarded')) return;
    if ((data.tasks || []).length > 0) { localStorage.setItem('aidan_onboarded', '1'); return; }
  } catch (e) { return; }
  _obStep = 0;
  renderOnboard();
  const m = document.getElementById('onboardModal');
  if (m) m.classList.add('active');
}

function renderOnboard() {
  const last = _obStep === ONBOARD_STEPS.length - 1;
  const st = ONBOARD_STEPS[_obStep];
  const body = document.getElementById('onboardBody');
  if (body) body.innerHTML = `<div class="onboard-icon">${st.icon}</div><div class="onboard-title">${st.title}</div><div class="onboard-text">${st.body}</div>`;
  const dots = document.getElementById('onboardDots');
  if (dots) dots.innerHTML = ONBOARD_STEPS.map((_, i) => `<span class="onboard-dot ${i === _obStep ? 'active' : ''}"></span>`).join('');
  const act = document.getElementById('onboardActions');
  if (act) {
    if (!last) act.innerHTML = `<button class="secondary" onclick="finishOnboard(false)">Geç</button><button onclick="obNext()">Devam →</button>`;
    else act.innerHTML = `<button class="secondary" onclick="finishOnboard(false)">Boş başla</button><button onclick="finishOnboard(true)">Örnek görevlerle başla</button>`;
  }
}
function obNext() { if (_obStep < ONBOARD_STEPS.length - 1) { _obStep++; renderOnboard(); } }

function finishOnboard(addSamples) {
  try { localStorage.setItem('aidan_onboarded', '1'); } catch (e) {}
  const m = document.getElementById('onboardModal');
  if (m) m.classList.remove('active');
  if (addSamples && typeof makeTask === 'function') {
    const t1 = makeTask({ text: 'Matematik ödevini bitir', category: 'odev', priority: 'urgent', estimateMin: 30 });
    t1.mitDate = today();
    const t2 = makeTask({ text: 'Odayı topla', category: 'ev', estimateMin: 15 });
    const t3 = makeTask({ text: '10 dakika kitap oku', category: 'kisisel', estimateMin: 10 });
    data.tasks = data.tasks || [];
    data.tasks.push(t1, t2, t3);
    save();
    renderTasks();
    showToast('3 örnek görev eklendi — istediğini sil ya da düzenle', 'success', 4000);
  } else {
    showToast('Hazırsın — üstteki kutuya ilk görevini yaz', 'info', 3500);
  }
}

function testNotif() {
  notify('Test bildirimi', 'Aidan hatırlatma sistemi çalışıyor.', { tag: 'aidan-test' });
}

async function enablePushHere() {
  const ok = await subscribeToPush();
  if (ok) showToast('Bu cihaz kaydedildi', 'success', 3000);
  else showToast('Kayıt başarısız — PWA olarak ana ekrana ekli mi?', 'warning', 4000);
  renderNotifSettings();
}

// Push subscription stale ise (ör. SW push handler eklenmeden önce subscribe olunmuşsa)
// unsubscribe + pushSubs temizle + fresh subscribe yapar.
async function resubscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Bu cihaz push desteklemiyor', 'warning', 3000);
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      const oldEndpoint = existing.endpoint;
      await existing.unsubscribe();
      // pushSubs listesinden eski endpoint'i sil
      if (data.settings && Array.isArray(data.settings.pushSubs)) {
        data.settings.pushSubs = data.settings.pushSubs.filter(s => s.endpoint !== oldEndpoint);
      }
    }
    const ok = await subscribeToPush();
    if (ok) {
      showToast('Push sıfırlandı + yeniden kayıt edildi', 'success', 4000);
    } else {
      showToast('Yeniden kayıt başarısız', 'warning', 4000);
    }
  } catch (e) {
    showToast('Sıfırlama hatası: ' + (e && e.message || e), 'warning', 4000);
  }
  renderNotifSettings();
}

if ('Notification' in window && Notification.permission === 'default') {
  const banner = document.getElementById('notifBanner');
  if (banner) banner.style.display = 'block';
}
// İzin zaten verilmişse, sayfa açılışında subscription'ı tazele (cihaz kaydı eksikse tamamla)
if ('Notification' in window && Notification.permission === 'granted') {
  setTimeout(() => subscribeToPush(), 2500);
}

// ============ SUPABASE BULUT SENKRONU ============
window._supa = null;
window._user = null;
let _pushTimer = null;
let _pulling = false;
let _pushing = false;

function showSupaStatus(msg, color) {
  const el = document.getElementById('supaStatus');
  if (el) el.innerHTML = `<div style="background:${color};color:#1e1e2e;padding:10px;border-radius:8px;font-size:0.9em;white-space:pre-wrap;">${msg}</div>`;
}

function renderAuthBox() {
  const el = document.getElementById('supaAuthBox');
  if (!window._supa) { el.innerHTML = ''; return; }
  if (window._user) {
    el.innerHTML = `
      <div style="background:#50fa7b;color:#1e1e2e;padding:12px;border-radius:8px;">
        ✅ Giriş yapıldı: <b>${window._user.email}</b><br>
        <button class="small danger" style="margin-top:8px;" onclick="logoutUser()">Çıkış yap</button>
        <button class="small" style="margin-top:8px;background:#bd93f9;color:white;" onclick="manualPull()">Şimdi senkronize et</button>
      </div>
    `;
  } else {
    el.innerHTML = `
      <div style="background:#2a2a3e;padding:12px;border-radius:8px;">
        <b>📧 Email + Şifre:</b><br>
        <input type="email" id="loginEmail" placeholder="email@adres.com" style="width:100%;max-width:300px;margin:6px 0;display:block;">
        <input type="password" id="loginPassword" placeholder="şifre (en az 8 karakter)" style="width:100%;max-width:300px;margin:6px 0;display:block;">
        <div id="inviteRow" style="display:none;">
          <input type="text" id="inviteCode" placeholder="Davet kodu (AIDAN-XXXX)" style="width:100%;max-width:300px;margin:6px 0;display:block;text-transform:uppercase;font-variant-numeric:tabular-nums;letter-spacing:0.04em;">
          <div style="font-size:0.78em;color:#aaa;margin-top:2px;">Davet kodu olmayanın kaydı kabul edilmez.</div>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
          <button class="small secondary" onclick="signInUser()">Giriş Yap</button>
          <button class="small" onclick="toggleSignupForm()">Yeni Hesap</button>
        </div>
        <div id="signupRow" style="display:none;margin-top:6px;">
          <button class="small" onclick="signUpUser()" style="width:100%;">✅ Kayıt Ol (davet koduyla)</button>
        </div>
        <div style="font-size:0.85em;color:#888;margin-top:6px;">İlk kez: Davet kodun varsa "Yeni Hesap" bas.<br>Hesabın varsa: "Giriş Yap".<br>Aynı email/şifre tüm cihazlarda.</div>
      </div>
    `;
  }
}

function toggleSignupForm() {
  const row = document.getElementById('inviteRow');
  const btnRow = document.getElementById('signupRow');
  const opening = row.style.display === 'none';
  row.style.display = opening ? 'block' : 'none';
  btnRow.style.display = opening ? 'block' : 'none';
  if (opening) document.getElementById('inviteCode').focus();
}

const CONFIG_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/config';
const SUGGEST_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/suggest';
const SIGNUP_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/signup';
const INVITE_CREATE_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/invite/create';
const INVITE_LIST_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/invite/list';

async function getSupaToken() {
  if (!window._supa) return null;
  const { data } = await window._supa.auth.getSession();
  return data?.session?.access_token || null;
}

async function loadInviteSection() {
  const sec = document.getElementById('inviteSection');
  const locked = document.getElementById('inviteLocked');
  if (!sec || !locked) return;
  if (!window._user) { sec.style.display = 'none'; locked.style.display = 'block'; return; }
  // Login varsa bölümü göster, listeyi yükle
  sec.style.display = 'block';
  locked.style.display = 'none';
  await refreshInviteList();
}

async function refreshInviteList() {
  const list = document.getElementById('inviteList');
  if (!list) return;
  const token = await getSupaToken();
  if (!token) { list.innerHTML = '<div class="fixedrem-empty">Önce giriş yap.</div>'; return; }
  list.innerHTML = '<div class="fixedrem-empty">Yükleniyor…</div>';
  try {
    const r = await fetch(INVITE_LIST_ENDPOINT, { headers: { 'Authorization': `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { list.innerHTML = `<div class="fixedrem-empty">${escapeHtml(j.error || 'liste başarısız')}</div>`; return; }
    if (!j.tableExists) {
      list.innerHTML = '<div class="fixedrem-empty"><code>invite_codes</code> tablosu yok. Supabase SQL Editor\'da çalıştır (CLAUDE.md\'de SQL var).</div>';
      return;
    }
    if (!j.codes || !j.codes.length) {
      list.innerHTML = '<div class="fixedrem-empty">Henüz davet kodu üretmedin. Yukarıdaki butonla başla.</div>';
      return;
    }
    list.innerHTML = j.codes.map(c => {
      const used = !!c.used_by;
      const created = new Date(c.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
      const usedLine = used ? `<div class="countdown-row-meta">✓ kullanıldı · ${new Date(c.used_at).toLocaleDateString('tr-TR')}</div>` : '<div class="countdown-row-meta">🟢 kullanılmadı</div>';
      const noteLine = c.note ? `<div class="countdown-row-meta">${escapeHtml(c.note)}</div>` : '';
      return `
        <div class="countdown-row" style="opacity:${used ? 0.6 : 1};">
          <div class="countdown-row-info">
            <div class="countdown-row-label" style="font-family: monospace; letter-spacing: 0.04em;">${escapeHtml(c.code)}</div>
            ${noteLine}
            <div class="countdown-row-meta">${created}</div>
            ${usedLine}
          </div>
          ${!used ? `<button class="small secondary" onclick="copyInviteCode('${c.code}')" title="Kopyala"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>` : ''}
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div class="fixedrem-empty">${escapeHtml(e.message)}</div>`;
  }
}

async function createInvite() {
  const token = await getSupaToken();
  if (!token) { showToast('Önce giriş yap', 'warning', 2500); return; }
  const note = document.getElementById('inviteNote').value.trim();
  try {
    const r = await fetch(INVITE_CREATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ note }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      showToast(j.error || `kod üretilemedi (${r.status})`, 'warning', 4000);
      return;
    }
    document.getElementById('inviteNote').value = '';
    showToast(`✅ ${j.code} — kopyalayıp arkadaşına yolla`, 'success', 4500);
    await refreshInviteList();
  } catch (e) { showToast('Hata: ' + e.message, 'warning', 3500); }
}

function copyInviteCode(code) {
  navigator.clipboard.writeText(code).then(
    () => showToast(`${code} kopyalandı`, 'success', 2000),
    () => showToast('Kopyalama başarısız', 'warning', 2500)
  );
}

async function signUpUser() {
  if (!window._supa) { showSupaStatus('Önce Supabase\'e bağlan.', '#ffb86c'); return; }
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const code = (document.getElementById('inviteCode')?.value || '').trim().toUpperCase();
  if (!email || !email.includes('@')) { showSupaStatus('Geçerli email gir.', '#ffb86c'); return; }
  if (password.length < 8) { showSupaStatus('Şifre en az 8 karakter olmalı.', '#ffb86c'); return; }
  if (!code) { showSupaStatus('Davet kodu gerekli (AIDAN-XXXXXXXX).', '#ffb86c'); return; }

  showSupaStatus('⏳ Davet kodu doğrulanıyor, hesap oluşturuluyor...', '#8be9fd');
  try {
    const r = await fetch(SIGNUP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, code }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      showSupaStatus('❌ ' + (j.error || `signup ${r.status}`), '#ff5555');
      return;
    }
    // Confirm-email kapalıysa session geldi — direkt login. Açıksa email doğrula mesajı.
    if (j.session) {
      showSupaStatus('✅ Hesap oluştu — giriş yapılıyor…', '#50fa7b');
      const { error } = await window._supa.auth.signInWithPassword({ email, password });
      if (error) showSupaStatus('Kayıt OK ama otomatik giriş başarısız: ' + error.message, '#ffb86c');
    } else {
      showSupaStatus('✅ Hesap oluştu. Email doğrulaması gerekiyorsa kutuna bak. Yoksa "Giriş Yap" bas.', '#50fa7b');
    }
  } catch (e) {
    showSupaStatus('❌ ' + e.message, '#ff5555');
  }
}

async function signInUser() {
  if (!window._supa) { showSupaStatus('Önce Supabase\'e bağlan.', '#ffb86c'); return; }
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { showSupaStatus('Email ve şifre gerekli.', '#ffb86c'); return; }

  showSupaStatus('⏳ Giriş yapılıyor...', '#8be9fd');
  const {error} = await window._supa.auth.signInWithPassword({email, password});
  if (error) {
    showSupaStatus('❌ Hata: ' + error.message + '\n\nHesabın yok mu? "Hesap Oluştur" bas.', '#ff5555');
  } else {
    showSupaStatus('✅ Giriş başarılı!', '#50fa7b');
  }
}

function connectSupabase() {
  let url = document.getElementById('supaUrl').value.trim();
  let key = document.getElementById('supaKey').value.trim();
  // Sık yapılan hataları otomatik temizle
  url = url.replace(/\/rest\/v1\/?$/, ''); // /rest/v1 kaldır
  url = url.replace(/\/auth\/v1\/?$/, ''); // /auth/v1 kaldır
  url = url.replace(/\/+$/, ''); // sondaki / kaldır
  if (!url || !key) { showSupaStatus('URL ve key gerekli.', '#ffb86c'); return; }
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    showSupaStatus('URL https://xxxxx.supabase.co formatında olmalı.', '#ffb86c');
    return;
  }
  // Temizlenmiş halini geri yaz
  document.getElementById('supaUrl').value = url;
  document.getElementById('supaKey').value = key;
  data.settings.supaUrl = url;
  data.settings.supaKey = key;
  localStorage.setItem('aidan', JSON.stringify(data));
  initSupabase();
}

function disconnectSupabase() {
  if (!confirm('Bulut bağlantısını kes? Veriler bilgisayarında kalır ama artık senkronize olmaz.')) return;
  if (window._supa && window._user) window._supa.auth.signOut();
  data.settings.supaUrl = '';
  data.settings.supaKey = '';
  localStorage.setItem('aidan', JSON.stringify(data));
  window._supa = null;
  window._user = null;
  renderAuthBox();
  showSupaStatus('🔌 Bağlantı kesildi.', '#6272a4');
}

function initSupabase() {
  const url = data.settings.supaUrl;
  const key = data.settings.supaKey;
  if (!url || !key) return;
  if (!window.supabase) { showSupaStatus('❌ Supabase kütüphanesi yüklenemedi (internet?).', '#ff5555'); return; }

  try {
    window._supa = window.supabase.createClient(url, key);
  } catch(e) {
    showSupaStatus('❌ Bağlantı hatası: ' + e.message, '#ff5555');
    return;
  }

  showSupaStatus('✅ Supabase\'e bağlandı. Email ile giriş yap.', '#50fa7b');

  window._supa.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      window._user = session.user;
      hideWelcome();
      onLoginSuccess();
    } else {
      window._user = null;
      _loginInitUserId = null;
      renderAuthBox();
      renderWelcome();
    }
  });

  window._supa.auth.getSession().then(({data: {session}}) => {
    if (session && session.user) {
      window._user = session.user;
      hideWelcome();
      onLoginSuccess();
    } else {
      renderAuthBox();
      renderWelcome();
    }
  });
}

async function logoutUser() {
  if (!window._supa) return;
  await window._supa.auth.signOut();
  showSupaStatus('Çıkış yapıldı. Veriler bilgisayarında durmaya devam ediyor.', '#6272a4');
}

let _loginInitUserId = null, _syncChannel = null;
async function onLoginSuccess() {
  renderAuthBox();
  // Token yenileme / tekrar eden SIGNED_IN olaylarinda agir init'i TEKRARLAMA.
  // (Aksi halde her ~dakika pullFromCloud + subscribeToCloud calisiyor; realtime
  //  kanali zaten abone oldugu icin 'after subscribe()' hatasi atiyordu.)
  if (_loginInitUserId === (window._user && window._user.id)) return;
  _loginInitUserId = window._user.id;
  showSupaStatus('✅ Giriş başarılı: ' + window._user.email + '\n⏳ Veriler eşitleniyor...', '#50fa7b');
  await pullFromCloud();
  subscribeToCloud();
  // Yeni user'a 5 adımlı tur — bir kez gösterilir
  if (!data.settings.onboardingDone) {
    setTimeout(() => startOnboarding(), 600);
  }
}

async function pullFromCloud() {
  if (!window._supa || !window._user) return;
  _pulling = true;
  try {
    const {data: row, error} = await window._supa
      .from('aidan_data')
      .select('*')
      .eq('user_id', window._user.id)
      .maybeSingle();

    if (error) {
      showSupaStatus('Çekme hatası: ' + error.message + '\n(Tablo yok mu? SQL\'i çalıştırdın mı?)', '#ff5555');
      _pulling = false;
      return;
    }

    if (row && row.data) {
      // Bulutta veri var — yereli onunla değiştir
      const remoteData = row.data;
      data = remoteData;
      // Eski alanları ekle
      data.tasks = data.tasks || [];
      data.dumps = data.dumps || [];
      data.settings = data.settings || {};
      data.pomoToday = data.pomoToday || { date: today(), count: 0 };
      data.dayPlan = data.dayPlan || { date: today(), blocks: [] };
      ensureDiet();
      localStorage.setItem('aidan', JSON.stringify(data));
      // Yenilemeden re-render et (aktif sekmeyi koru)
      renderTasks();
      if (document.getElementById('plan').classList.contains('active')) renderDayPlan();
      if (document.getElementById('diet').classList.contains('active')) renderDiet();
            document.getElementById('pomoCount').textContent = data.pomoToday.count;
      showSupaStatus('✅ Buluttan veri çekildi.', '#50fa7b');
    } else {
      // Bulutta veri yok — yereli yükle
      await pushToCloudNow();
      showSupaStatus('✅ İlk veri buluta yüklendi. Artık eşitleniyor.', '#50fa7b');
    }
  } catch(e) {
    showSupaStatus('❌ ' + e.message, '#ff5555');
  }
  _pulling = false;
}

function schedulePush() {
  if (_pulling) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(pushToCloudNow, 1500);
}

async function pushToCloudNow() {
  if (!window._supa || !window._user) return;
  _pushing = true;
  try {
    const now = new Date();
    const {error} = await window._supa
      .from('aidan_data')
      .upsert({
        user_id: window._user.id,
        data: data,
        updated_at: now.toISOString()
      }, { onConflict: 'user_id' });
    if (error) console.warn('Push hata:', error);
    else localStorage.setItem('aidan_lastPush', String(now.getTime()));
  } catch(e) { console.warn('Push hata:', e); }
  // Echo'yu görmezden gelmek için kısa grace period
  setTimeout(() => { _pushing = false; }, 3000);
}

function subscribeToCloud() {
  if (!window._supa || !window._user) return;
  // Ayni isimli kanal zaten aboneyse .on() 'after subscribe()' hatasi verir — once temizle.
  try { if (_syncChannel) window._supa.removeChannel(_syncChannel); } catch (_) {}
  _syncChannel = window._supa.channel('aidan-sync-' + window._user.id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'aidan_data',
      filter: 'user_id=eq.' + window._user.id
    }, payload => {
      // Kendi push'umuzun echo'sunu görmezden gel
      if (_pulling || _pushing) return;
      if (!payload.new || !payload.new.data) return;
      // Veri gerçekten farklı mı?
      const remoteJson = JSON.stringify(payload.new.data);
      const localJson = JSON.stringify(data);
      if (remoteJson === localJson) return;
      // Diğer cihazdan gelmiş — sayfa yenilemeden uygula
      data = payload.new.data;
      // Eski alanlar eksikse default ekle
      data.tasks = data.tasks || [];
      data.dumps = data.dumps || [];
      data.settings = data.settings || {};
      data.pomoToday = data.pomoToday || { date: today(), count: 0 };
      data.dayPlan = data.dayPlan || { date: today(), blocks: [] };
      ensureDiet();
      localStorage.setItem('aidan', JSON.stringify(data));
      // Sekmeyi koruyarak yeniden render et
      renderTasks();
      if (document.getElementById('diet').classList.contains('active')) renderDiet();
      if (document.getElementById('plan').classList.contains('active')) renderDayPlan();
            showSupaStatus('Diğer cihazdan güncelleme alındı.', '#bd93f9');
    })
    .subscribe();
}

async function manualPull() {
  showSupaStatus('⏳ Veriler çekiliyor...', '#8be9fd');
  await pullFromCloud();
}

// ============ SERİ (Ödev grupları) ============
let _activeSeriesId = null;

function seriesProgress(seriesId) {
  if (!seriesId) return { done: 0, total: 0 };
  const items = data.tasks.filter(t => t.seriesId === seriesId);
  return { done: items.filter(t => t.done).length, total: items.length };
}

function showSeries(seriesId) {
  const items = data.tasks.filter(t => t.seriesId === seriesId)
    .sort((a, b) => (a.seriesIndex || 0) - (b.seriesIndex || 0));
  if (items.length === 0) { showToast('Seri bulunamadı', 'warning'); return; }
  _activeSeriesId = seriesId;
  const sp = seriesProgress(seriesId);
  const name = items[0].seriesName || 'Seri';
  const allDone = sp.done === sp.total;
  document.getElementById('seriesModalTitle').textContent = '' + name;
  document.getElementById('seriesModalProgress').textContent =
    `${sp.done}/${sp.total} bitti${allDone ? ' — Tamamlandı! ' : ''}`;
  const todayStr = today();
  const listHtml = items.map(t => {
    const dueStr = t.due ? new Date(t.due).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
    const isOverdue = !t.done && t.due && t.due < todayStr;
    return `
      <div style="padding:10px 12px; background:var(--bg-elev); border-radius:7px; border:1px solid ${isOverdue ? 'var(--danger)' : 'var(--border-soft)'}; display:flex; gap:10px; align-items:center;">
        <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTask(${t.id}); showSeries('${seriesId}')" style="width:18px;height:18px;">
        <div style="flex:1;">
          <div style="${t.done ? 'text-decoration:line-through; opacity:0.5;' : ''} font-size:0.92em;">${escapeHtml(t.text)}</div>
          <div style="font-size:0.75em; color:${isOverdue ? 'var(--danger)' : 'var(--text-muted)'}; margin-top:2px;">${isOverdue ? 'Geçti · ' : ''}${dueStr}${t.estimateMin ? ' · ⏱️ ' + t.estimateMin + 'dk' : ''}</div>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('seriesModalList').innerHTML = listHtml;
  // Tamamen bittiyse rebalance butonunu gizle
  const rb = document.getElementById('seriesRebalanceBtn');
  if (rb) rb.style.display = allDone ? 'none' : '';
  document.getElementById('seriesModal').classList.add('active');
}

function closeSeriesModal() {
  document.getElementById('seriesModal').classList.remove('active');
  _activeSeriesId = null;
}

// Lokal tarihi ISO formatına çevir (UTC kayması olmadan)
function localISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Verilen gün aralığına `count` adet görevi dağıt. skipWeekends ise Cmt/Paz atla.
// startISO ve endISO dahil. Yeterli iş günü yoksa endISO'da yığ.
function planSeriesDays(startISO, endISO, count, skipWeekends) {
  const start = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  if (end < start) return Array(count).fill(endISO);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay(); // 0=Paz, 6=Cmt
    if (skipWeekends && (dow === 0 || dow === 6)) continue;
    days.push(localISO(d));
  }
  if (days.length === 0) {
    // Sadece hafta sonu varsa weekend'leri kabul et
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(localISO(d));
    }
  }
  if (count <= 0) return [];
  if (count === 1) return [days[days.length - 1]];
  if (days.length >= count) {
    const step = (days.length - 1) / (count - 1);
    return Array.from({ length: count }, (_, i) => days[Math.round(i * step)]);
  }
  // Yeterli gün yok — kalanları son güne yığ
  const out = [...days];
  while (out.length < count) out.push(days[days.length - 1]);
  return out;
}

async function rebalanceSeriesFromModal() {
  const sid = _activeSeriesId;
  if (!sid) return;
  const items = data.tasks.filter(t => t.seriesId === sid)
    .sort((a, b) => (a.seriesIndex || 0) - (b.seriesIndex || 0));
  if (items.length === 0) return;
  const undone = items.filter(t => !t.done);
  if (undone.length === 0) { showToast('Bu seri zaten bitmiş', 'info'); return; }

  // Mevcut son tarihi göster
  const lastDue = items.map(t => t.due).filter(Boolean).sort().reverse()[0] || today();
  const name = items[0].seriesName || 'Seri';

  const newDeadlineRaw = await aidanPrompt(
    `"${name}" yeniden dengele`,
    `${undone.length} bitmemiş parça kaldı. Yeni son tarih?`,
    lastDue
  );
  if (newDeadlineRaw === null) return;
  const newDeadline = parseDateInput(newDeadlineRaw.trim());
  if (!newDeadline) { showToast('Tarih anlaşılamadı', 'warning'); return; }
  if (newDeadline < today()) { showToast('Son tarih geçmişte olamaz', 'warning'); return; }

  const skipWeekends = confirm('Hafta sonlarını (Cmt-Paz) atlayalım mı?\n\nTamam = Evet, atla\nİptal = Hayır, hafta sonu da plan yap');

  // Yarından başla (bugün için yeni iş eklemek baskı yapar)
  const startDate = today();
  const days = planSeriesDays(startDate, newDeadline, undone.length, skipWeekends);

  undone.forEach((t, i) => {
    t.due = days[i] || newDeadline;
    // Geçmişte MIT'lendiyse temizle (yeniden planda eski MIT anlamsız)
    if (t.mitDate && t.mitDate < today()) t.mitDate = null;
  });

  save();
  renderTasks();
  showSeries(sid);
  showToast(`✅ ${undone.length} parça yeniden dağıtıldı (${newDeadline})`, 'success');
}

async function deleteSeriesFromModal() {
  const sid = _activeSeriesId;
  if (!sid) return;
  const items = data.tasks.filter(t => t.seriesId === sid);
  if (items.length === 0) return;
  const name = items[0].seriesName || 'Seri';
  if (!confirm(`"${name}" serisindeki ${items.length} görevi silelim mi?\n\nBitmiş olanlar da silinir.`)) return;
  data.tasks = data.tasks.filter(t => t.seriesId !== sid);
  save();
  renderTasks();
  closeSeriesModal();
  showToast(`"${name}" serisi silindi`, 'success');
}

// Esnek tarih parse: 'YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM', 'yarın', 'salı', 'haftaya'
function parseDateInput(s) {
  if (!s) return null;
  s = String(s).trim().toLowerCase();
  if (!s) return null;
  if (s === 'bugün' || s === 'bugun' || s === 'today') return today();
  if (s === 'yarın' || s === 'yarin' || s === 'tomorrow') {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (s === 'haftaya' || s === 'next week') {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  const dayMap = { 'pazartesi':1, 'salı':2, 'sali':2, 'çarşamba':3, 'carsamba':3, 'perşembe':4, 'persembe':4, 'cuma':5, 'cumartesi':6, 'pazar':0 };
  for (const [name, dow] of Object.entries(dayMap)) {
    if (s.includes(name)) {
      const todayDow = new Date().getDay();
      let diff = (dow - todayDow + 7) % 7;
      if (diff === 0) diff = 7;
      if (s.includes('gelecek') || s.includes('haftaya')) diff = ((dow - todayDow + 7) % 7) + 7;
      const d = new Date(); d.setDate(d.getDate() + diff);
      return d.toISOString().slice(0, 10);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\.\/-](\d{1,2})(?:[\.\/-](\d{2,4}))?$/);
  if (m) {
    let [_, d, mo, y] = m;
    if (!y) y = new Date().getFullYear();
    if (y.length === 2) y = '20' + y;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  return null;
}

// ============ TAKVİM MODAL ============
const calState = { year: null, month: null, selected: null };

function openCalendarModal() {
  const now = new Date();
  calState.year = now.getFullYear();
  calState.month = now.getMonth();
  calState.selected = today();
  renderCalendar();
  document.getElementById('calendarModal').classList.add('active');
}

function closeCalendarModal() {
  document.getElementById('calendarModal').classList.remove('active');
}

function calMonthShift(delta) {
  calState.month += delta;
  if (calState.month < 0) { calState.month = 11; calState.year--; }
  if (calState.month > 11) { calState.month = 0; calState.year++; }
  renderCalendar();
}

function renderCalendar() {
  const { year, month, selected } = calState;
  const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  document.getElementById('calMonthLabel').textContent = `${monthNames[month]} ${year}`;

  const todayStr = today();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  let leading = firstDay.getDay() - 1; // Sunday=0 → -1, Monday=1 → 0
  if (leading < 0) leading = 6;

  // Görevleri tarihe göre grupla (due tarihi)
  const tasksByDate = {};
  (data.tasks || []).forEach(t => {
    if (!t.due) return;
    (tasksByDate[t.due] = tasksByDate[t.due] || []).push(t);
  });

  const cells = [];
  for (let i = 0; i < leading; i++) cells.push('<div class="cal-day cal-empty"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selected;
    const dayTasks = tasksByDate[dateStr] || [];
    const cats = [...new Set(dayTasks.map(t => t.category).filter(Boolean))].slice(0, 4);
    const dotsHtml = cats.length
      ? `<div class="cal-dots">${cats.map(c => `<div class="cal-dot cat-${c}"></div>`).join('')}</div>`
      : '<div class="cal-dots"></div>';
    const cls = ['cal-day'];
    if (isToday) cls.push('cal-today');
    if (isSelected) cls.push('cal-selected');
    cells.push(`<div class="${cls.join(' ')}" onclick="selectCalDay('${dateStr}')">${d}${dotsHtml}</div>`);
  }
  document.getElementById('calGrid').innerHTML = cells.join('');
  renderCalDayPanel();
}

function selectCalDay(dateStr) {
  calState.selected = dateStr;
  renderCalendar();
}

function renderCalDayPanel() {
  const dateStr = calState.selected;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dayNames = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const titleEl = document.getElementById('calDayTitle');
  const isToday = dateStr === today();
  titleEl.textContent = `${isToday ? '' : ''}${d} ${monthNames[m-1]} · ${dayNames[dt.getDay()]}`;

  const dayTasks = (data.tasks || []).filter(t => t.due === dateStr);
  const catEmoji = { odev: '', ders: '', ev: '', kisisel: '' };
  const listEl = document.getElementById('calDayList');

  if (dayTasks.length === 0) {
    listEl.innerHTML = '<div class="cal-day-empty">Bu güne deadline yok</div>';
    return;
  }

  // Önce bitmemiş, sonra bitmiş; öncelik → acil önde
  dayTasks.sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    const pa = a.priority === 'urgent' ? 0 : 1;
    const pb = b.priority === 'urgent' ? 0 : 1;
    return pa - pb;
  });

  listEl.innerHTML = dayTasks.map(t => {
    const cat = t.category ? (catEmoji[t.category] || '🏷️') : '·';
    const time = t.reminderTime ? ` <span style="color:var(--text-muted)">· ${t.reminderTime}</span>` : '';
    const urgent = t.priority === 'urgent' ? '' : '';
    return `<div class="cal-day-item ${t.done ? 'done' : ''}">
      <span class="cal-day-cat">${cat}</span>
      <span style="flex:1">${urgent}${escapeHtml(t.text)}${time}</span>
    </div>`;
  }).join('');
}

// ============ AKTİF GÖREV (Şu an çalışıyorsun) ============
function updateActiveTaskBanner() {
  const banner = document.getElementById('activeTaskBanner');
  if (!banner) return;
  if (!currentFocusTaskId) {
    banner.classList.remove('show');
    return;
  }
  const t = data.tasks.find(x => x.id === currentFocusTaskId);
  if (!t || t.done) {
    currentFocusTaskId = null;
    focusStartTime = null;
    banner.classList.remove('show');
    return;
  }
  banner.classList.add('show');
  document.getElementById('activeTaskName').textContent = t.text;
  const sessionMin = focusStartTime ? Math.floor((Date.now() - focusStartTime) / 60000) : 0;
  const totalMin = (t.actualMin || 0) + sessionMin;
  const left = (t.estimateMin && t.estimateMin > totalMin) ? ` · ${t.estimateMin - totalMin}dk hedef` : '';
  document.getElementById('activeTaskElapsed').textContent = `⏱ ${totalMin}dk${left}`;
}

function completeFocusTask() {
  if (!currentFocusTaskId) return;
  const t = data.tasks.find(x => x.id === currentFocusTaskId);
  if (!t) return;
  // Devam eden seans varsa actualMin'e ekle
  if (focusStartTime && !t.done) {
    const elapsedMin = Math.floor((Date.now() - focusStartTime) / 60000);
    if (elapsedMin > 0) t.actualMin = (t.actualMin || 0) + elapsedMin;
  }
  const taskId = currentFocusTaskId;
  // Odak temizle (pomodoro durdurmadan — kullanıcı isterse devam etsin)
  currentFocusTaskId = null;
  focusStartTime = null;
  updateActiveTaskBanner();
  // Görevi bitir (toggleTask zaten save + renderTasks çağırır)
  toggleTask(taskId);
}

function dropFocusTask() {
  if (currentFocusTaskId && focusStartTime) {
    const t = data.tasks.find(x => x.id === currentFocusTaskId);
    if (t) {
      const elapsedMin = Math.floor((Date.now() - focusStartTime) / 60000);
      if (elapsedMin > 0) {
        t.actualMin = (t.actualMin || 0) + elapsedMin;
        save();
      }
    }
  }
  currentFocusTaskId = null;
  focusStartTime = null;
  const focusEl = document.getElementById('focusTask');
  if (focusEl) {
    focusEl.innerHTML = 'Bir görev seç ya da serbest çalış';
    focusEl.classList.add('empty');
  }
  updateActiveTaskBanner();
  renderTasks();
  showToast('Odak temizlendi', 'info', 1800);
}

// Her dakika banner güncelle (geçen süre takibi için)
setInterval(updateActiveTaskBanner, 30000);

// ============ PWA: Service Worker Kaydı ============
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.log('SW kaydı başarısız (dosyadan açılıyorsa normal):', e.message));
  });

  // SW yeni sürüm aktifleştiğinde otomatik yenile (sadece bir kez)
  let _swReloaded = sessionStorage.getItem('_swReloaded') === '1';
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SW_UPDATED' && !_swReloaded) {
      _swReloaded = true;
      sessionStorage.setItem('_swReloaded', '1');
      showToast('Aidan güncellendi, yeniden yükleniyor...', 'info');
      setTimeout(() => window.location.reload(), 800);
    }
  });

  // Sayfa açıldığında SW'ye yeni sürüm var mı diye kontrol et
  navigator.serviceWorker.ready.then(reg => {
    if (reg && reg.update) reg.update();
  });
}

// ============ iOS KLAVYE HANDLER ============
// iOS PWA klasik problemi: klavye açılınca focused input klavyenin altında kalıyor, sayfa kendiliğinden
// kaydırmıyor. 1) focusin'de input'u görünür yap. 2) visualViewport ile klavye yüksekliğini CSS var'a yaz —
// position:fixed (postpone-menu vs) elementler klavye üstüne kayar.
(() => {
  let _focusScrollTimer = null;
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el || !(el.matches && el.matches('input, textarea, [contenteditable="true"]'))) return;
    // iOS klavyesinin yerleşmesini bekle, sonra elementi görüş alanına getir
    clearTimeout(_focusScrollTimer);
    _focusScrollTimer = setTimeout(() => {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
    }, 320);
  });

  // Klavye yüksekliği = window.innerHeight - visualViewport.height (klavye açıkken aradaki fark)
  if (window.visualViewport) {
    const updateKb = () => {
      const kb = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
      document.documentElement.style.setProperty('--kb-h', kb + 'px');
    };
    window.visualViewport.addEventListener('resize', updateKb);
    window.visualViewport.addEventListener('scroll', updateKb);
    updateKb();
  }
})();

// ============ İLK RENDER ============
loadSettings();
initFilter();
checkRepeatingTasks();
renderTasks();
document.getElementById('pomoCount').textContent = data.pomoToday.count;
updateTimerDisplay();
restoreTimerState();
renderCountdowns();
renderSchool();
maybeShowOnboarding();

// ============ AIDAN'A SOR — sohbet / düşünme ortağı ============
const CHAT_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/chat';
let _chatHistory = [];      // [{role:'user'|'assistant', content}]
let _chatBusy = false;

// Textarea otomatik büyüme (max ~5 satır)
function chatAutoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

function chatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

// Öneri chip'ine basınca input'a yaz + gönder
function chatSuggest(text) {
  const inp = document.getElementById('chatInput');
  if (inp) inp.value = text;
  sendChat();
}

function clearChat() {
  _chatHistory = [];
  renderChatMessages();
}

// HTML escape + basit markdown (kalın, satır sonu, madde) → güvenli render
function chatFormat(text) {
  let h = escapeHtml(text);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  h = h.replace(/^[\s]*[-*•]\s+(.+)$/gm, '<span class="chat-li">• $1</span>');
  h = h.replace(/\n/g, '<br>');
  return h;
}

function renderChatMessages() {
  const box = document.getElementById('chatMessages');
  const empty = document.getElementById('chatEmpty');
  if (!box) return;
  if (!_chatHistory.length && !_chatBusy) {
    if (empty) empty.style.display = 'flex';
    box.querySelectorAll('.chat-msg, .chat-typing').forEach(n => n.remove());
    return;
  }
  if (empty) empty.style.display = 'none';
  box.querySelectorAll('.chat-msg, .chat-typing').forEach(n => n.remove());
  _chatHistory.forEach(m => {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (m.role === 'user' ? 'me' : 'ai');
    div.innerHTML = m.role === 'user' ? escapeHtml(m.content).replace(/\n/g, '<br>') : chatFormat(m.content);
    box.appendChild(div);
  });
  if (_chatBusy) {
    const t = document.createElement('div');
    t.className = 'chat-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    box.appendChild(t);
  }
  box.scrollTop = box.scrollHeight;
}

async function sendChat() {
  if (_chatBusy) return;
  const inp = document.getElementById('chatInput');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  const token = await getSupaToken();
  if (!token) { showToast('Önce Ayarlar' + String.fromCharCode(39) + 'dan giriş yap', 'error'); return; }
  inp.value = '';
  chatAutoGrow(inp);
  _chatHistory.push({ role: 'user', content: text });
  _chatBusy = true;
  renderChatMessages();
  try {
    const r = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ messages: _chatHistory.slice(-12) }),
    });
    const j = await r.json().catch(() => ({}));
    _chatBusy = false;
    if (!r.ok || !j.reply) {
      _chatHistory.push({ role: 'assistant', content: 'Bir sorun oldu (' + (j.error || ('http ' + r.status)) + '). Tekrar dener misin?' });
    } else {
      _chatHistory.push({ role: 'assistant', content: j.reply });
    }
    renderChatMessages();
  } catch (e) {
    _chatBusy = false;
    _chatHistory.push({ role: 'assistant', content: 'Bağlantı kurulamadı. İnternetini kontrol et.' });
    renderChatMessages();
  }
}
