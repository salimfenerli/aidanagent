/**
 * hedefler.js — Görevler > Hedefler paneli (4 Eki 2026). TEMBEL modül.
 *
 * Muse karşılaştırması adım 2: HEDEF odaklı arka plan ajanı.
 * Veri public.aidan_goals'ta (aidan_data blob'unda DEĞİL). Worker'ın hedef
 * ajanı her akşam 19:30'da öneri yazar; burada ONAYLANIR → görev data.tasks'a
 * goalId ile eklenir. Worker görev EKLEMEZ (onay kapısı + senkron çakışması yok).
 *
 * ⚠️ Yeni modul eklersen 6 yer: LAZY_MODULES · sw.js ASSETS · deploy INCLUDE ·
 *    Actions paths · .gitattributes · tests/13-lazy + 07-hygiene listeleri.
 */
const GOAL_THINK_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/goal-think';
const GOAL_UI_MAX = 5;
const GOAL_DURUM_AD = { yolunda: 'Yolunda', geride: 'Geride', risk: 'Risk', belirsiz: 'Belirsiz' };

// Stil modülle iner — styles.css ilk yükleme bütçesine sayılır.
(function goalStyle() {
  if (document.getElementById('goalStyle')) return;
  const st = document.createElement('style');
  st.id = 'goalStyle';
  st.textContent = '.goal-inner{padding:0 14px 14px;display:flex;flex-direction:column;gap:10px}' +
    '.goal-card{border:1px solid var(--border,#2a2c35);border-radius:12px;padding:12px;background:var(--bg,#0c0d11)}' +
    '.goal-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.goal-title{font-weight:600;font-size:15px;color:var(--text,#e5e1d9);flex:1;min-width:0}' +
    '.goal-chip{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:20px;background:var(--accent-soft,rgba(226,226,226,.12));color:var(--text-muted,#9a9389)}' +
    '.goal-chip.yolunda{color:var(--success,#5cbf7a)}.goal-chip.geride{color:var(--warning,#e5a117)}.goal-chip.risk{color:var(--danger,#ea5a52)}' +
    '.goal-meta{font-size:12.5px;color:var(--text-muted,#9a9389);margin-top:4px}' +
    '.goal-note{font-size:14px;line-height:1.5;margin-top:8px;color:var(--text,#e5e1d9)}' +
    '.goal-q{font-size:13.5px;margin-top:6px;color:var(--warning,#e5a117)}' +
    '.goal-prop{display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;border-radius:10px;background:var(--bg-elev,#131419);border:1px dashed var(--border,#2f323c)}' +
    '.goal-prop span{flex:1;font-size:14px;line-height:1.4}.goal-prop small{display:block;color:var(--text-muted,#9a9389);font-size:12px}' +
    '.goal-prop button{flex:none;min-width:36px;min-height:36px}' +
    '.goal-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}' +
    '.goal-add{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border-soft,rgba(255,255,255,.07));padding-top:10px}' +
    '.goal-add-row{display:flex;gap:6px}.goal-add-row input{flex:1;min-width:0}';
  document.head.appendChild(st);
})();

let _goals = [];
const _goalBusy = {};

function goalHelp(t) { return '<div class="settings-help">' + escapeHtml(t) + '</div>'; }
function goalAgent(g) {
  const a = (g && g.agent && typeof g.agent === 'object') ? g.agent : {};
  return {
    note: a.note || '', status: a.status || '', question: a.question || '',
    proposals: Array.isArray(a.proposals) ? a.proposals : [],
    rejected: Array.isArray(a.rejected) ? a.rejected : [],
    history: Array.isArray(a.history) ? a.history : [],
    lastRun: a.lastRun || '', nextRun: a.nextRun || '', manualAt: a.manualAt || '',
  };
}
function goalDaysLeft(deadline) {
  if (!deadline) return null;
  const a = new Date(today() + 'T12:00:00'), b = new Date(deadline + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}
function goalProgress(g) {
  const bagli = ((typeof data !== 'undefined' && data.tasks) || []).filter(t => t.goalId && String(t.goalId) === String(g.id));
  return { done: bagli.filter(t => t.done).length, total: bagli.length };
}
function goalPendingCount() {
  return _goals.reduce((n, g) => n + goalAgent(g).proposals.filter(p => p.status === 'pending').length, 0);
}

async function renderGoals() {
  const el = document.getElementById('goalInner');
  if (!el) return;
  if (!window._supa) await supaReady();
  if (!window._supa || !window._user) { el.innerHTML = goalHelp('Hedefler için bulut girişi gerekli.'); return; }
  const { data: rows, error } = await window._supa.from('aidan_goals').select('*')
    .eq('user_id', window._user.id).neq('status', 'done').order('created_at', { ascending: true });
  if (error) { el.innerHTML = goalHelp('Hedefler okunamadı: ' + error.message); return; }
  _goals = rows || [];
  goalDraw();
  // Push bildirimi /#hedefler ile açar → paneli açıp göster.
  if (location.hash === '#hedefler') {
    const d = document.getElementById('goalSection');
    if (d) { d.open = true; try { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {} }
  }
}

function goalDraw() {
  const el = document.getElementById('goalInner');
  if (!el) return;
  const badge = document.getElementById('goalBadge');
  const bekleyen = goalPendingCount();
  if (badge) badge.textContent = bekleyen ? bekleyen + ' öneri' : (_goals.length ? String(_goals.length) : '');
  let h = '';
  if (!_goals.length) {
    h += goalHelp('Bir hedef koy. Aidan her akşam 19:30\'da bakar, sana küçük adımlar önerir; onaylarsan görevlerine ekler.');
  }
  _goals.forEach(g => {
    const a = goalAgent(g);
    const id = escapeHtml(String(g.id));
    const kalan = goalDaysLeft(g.deadline);
    const pr = goalProgress(g);
    const meta = [];
    if (g.deadline) meta.push(kalan < 0 ? Math.abs(kalan) + ' gün geçti' : kalan === 0 ? 'son gün bugün' : kalan + ' gün kaldı');
    if (pr.total) meta.push(pr.done + '/' + pr.total + ' adım bitti');
    if (g.status === 'paused') meta.push('duraklatıldı');
    h += '<div class="goal-card"><div class="goal-head"><div class="goal-title">' + escapeHtml(g.title) + '</div>';
    if (a.status) h += '<span class="goal-chip ' + escapeHtml(a.status) + '">' + escapeHtml(GOAL_DURUM_AD[a.status] || a.status) + '</span>';
    h += '</div>';
    if (meta.length) h += '<div class="goal-meta">' + escapeHtml(meta.join(' · ')) + '</div>';
    if (a.note) h += '<div class="goal-note">' + escapeHtml(a.note) + '</div>';
    else if (g.status === 'active') h += '<div class="goal-meta">Aidan henüz bakmadı — bu akşam 19:30\'da ilk adımları önerecek.</div>';
    if (a.question) h += '<div class="goal-q">❓ ' + escapeHtml(a.question) + '</div>';
    a.proposals.filter(p => p.status === 'pending').forEach(p => {
      const pid = escapeHtml(String(p.id));
      const alt = [p.min ? '~' + p.min + ' dk' : '', p.due ? p.due.split('-').reverse().slice(0, 2).join('.') : ''].filter(Boolean).join(' · ');
      h += '<div class="goal-prop"><span>' + escapeHtml(p.text) + (alt ? '<small>' + escapeHtml(alt) + '</small>' : '') + '</span>' +
        '<button class="small" aria-label="Onayla — görevlere ekle" data-g="' + id + '" data-p="' + pid + '" onclick="goalAccept(this.dataset.g,this.dataset.p)">✓</button>' +
        '<button class="small secondary" aria-label="Reddet" data-g="' + id + '" data-p="' + pid + '" onclick="goalReject(this.dataset.g,this.dataset.p)">✕</button></div>';
    });
    h += '<div class="goal-actions">';
    if (g.status === 'active') h += '<button class="small" data-g="' + id + '" onclick="goalThinkNow(this.dataset.g)"' + (_goalBusy[g.id] ? ' disabled' : '') + '>' + (_goalBusy[g.id] ? 'Düşünüyor…' : 'Şimdi düşün') + '</button>';
    h += '<button class="small secondary" data-g="' + id + '" onclick="goalSetStatus(this.dataset.g,\'' + (g.status === 'paused' ? 'active' : 'paused') + '\')">' + (g.status === 'paused' ? 'Sürdür' : 'Duraklat') + '</button>';
    h += '<button class="small secondary" data-g="' + id + '" onclick="goalSetStatus(this.dataset.g,\'done\')">Tamamlandı</button>';
    h += '<button class="small secondary" aria-label="Sil" data-g="' + id + '" onclick="goalDelete(this.dataset.g)">Sil</button>';
    h += '</div></div>';
  });
  if (_goals.length < GOAL_UI_MAX) {
    h += '<div class="goal-add">' +
      '<input type="text" id="goalNewTitle" maxlength="120" placeholder="Hedef: örn. Ocak sonuna kadar ELO 2000">' +
      '<input type="text" id="goalNewWhy" maxlength="300" placeholder="Neden önemli? (isteğe bağlı)">' +
      '<div class="goal-add-row"><input type="date" id="goalNewDate" aria-label="Son tarih"><button class="small" onclick="goalAdd()">Hedef ekle</button></div></div>';
  } else {
    h += goalHelp('En fazla ' + GOAL_UI_MAX + ' hedef — odak dağılmasın. Birini bitir ya da sil.');
  }
  el.innerHTML = h;
}

async function goalPersistAgent(g) {
  const { error } = await window._supa.from('aidan_goals')
    .update({ agent: g.agent, updated_at: new Date().toISOString() }).eq('id', g.id);
  if (error) { showToast('Kaydedilemedi: ' + error.message, 'error', 4000); return false; }
  return true;
}

async function goalAdd() {
  const t = document.getElementById('goalNewTitle');
  const w = document.getElementById('goalNewWhy');
  const d = document.getElementById('goalNewDate');
  const title = t ? t.value.trim().slice(0, 120) : '';
  if (title.length < 3) { showToast('Hedefi birkaç kelimeyle yaz.', 'warning'); return; }
  if (!window._supa || !window._user) return;
  if (_goals.length >= GOAL_UI_MAX) return;
  const row = { user_id: window._user.id, title, why: (w && w.value.trim().slice(0, 300)) || null, deadline: (d && d.value) || null };
  const { data: ins, error } = await window._supa.from('aidan_goals').insert(row).select().single();
  if (error) { showToast('Hedef eklenemedi: ' + error.message, 'error', 4000); return; }
  _goals.push(ins);
  goalDraw();
  showToast('Hedef eklendi — Aidan ilk adımları düşünüyor…', 'success', 2500);
  goalThinkNow(ins.id);   // ilk değer hemen gelsin, 19:30'u bekletme
}

async function goalThinkNow(id) {
  const g = _goals.find(x => String(x.id) === String(id));
  if (!g || _goalBusy[g.id]) return;
  _goalBusy[g.id] = true; goalDraw();
  try {
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum bulunamadı, tekrar giriş yap');
    const r = await fetch(GOAL_THINK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ goalId: g.id }),
    });
    if (r.status === 429) throw new Error('az önce düşündüm, 2 dakika sonra tekrar dene');
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.agent) throw new Error(j.error || ('hata ' + r.status));
    g.agent = j.agent;
    const n = goalAgent(g).proposals.filter(p => p.status === 'pending').length;
    showToast(n ? n + ' adım önerdim — onaylarsan görevlerine eklerim.' : 'Baktım — şimdilik yeni adım yok.', 'success', 3000);
  } catch (e) {
    showToast('Hedef ajanı: ' + e.message, 'error', 4000);
  } finally {
    delete _goalBusy[g.id]; goalDraw();
  }
}

/** Onay: öneri GÖREV olur (goalId ile) — ajan sonraki turda tamamlanıp tamamlanmadığını görür. */
async function goalAccept(gid, pid) {
  const g = _goals.find(x => String(x.id) === String(gid));
  if (!g) return;
  const a = goalAgent(g);
  const p = a.proposals.find(x => String(x.id) === String(pid) && x.status === 'pending');
  if (!p) return;
  const task = {
    id: Date.now(), text: String(p.text).slice(0, 200), done: false, doneDate: null, subtasks: [], created: timeStr(),
    priority: 'normal', category: null, due: p.due || null, estimateMin: p.min || null, actualMin: null,
    repeat: null, reminderTime: null, lastReminded: null, mitDate: null,
    seriesId: null, seriesName: null, seriesIndex: null, seriesTotal: null, notes: null,
    goalId: String(g.id), goalTitle: String(g.title).slice(0, 120),
  };
  data.tasks.push(task);
  save(); if (typeof renderTasks === 'function') renderTasks();
  p.status = 'accepted'; p.taskId = task.id;
  g.agent = a;
  goalDraw();
  await goalPersistAgent(g);
  showToast('Görevlere eklendi ✓', 'success', 2000);
}

async function goalReject(gid, pid) {
  const g = _goals.find(x => String(x.id) === String(gid));
  if (!g) return;
  const a = goalAgent(g);
  const p = a.proposals.find(x => String(x.id) === String(pid) && x.status === 'pending');
  if (!p) return;
  p.status = 'rejected';
  a.rejected = a.rejected.concat([p.text]).slice(-20);   // ajan bunu bir daha önermez
  g.agent = a;
  goalDraw();
  await goalPersistAgent(g);
}

async function goalSetStatus(id, status) {
  const g = _goals.find(x => String(x.id) === String(id));
  if (!g || ['active', 'paused', 'done'].indexOf(status) < 0) return;
  const { error } = await window._supa.from('aidan_goals').update({ status, updated_at: new Date().toISOString() }).eq('id', g.id);
  if (error) { showToast('Güncellenemedi: ' + error.message, 'error', 4000); return; }
  if (status === 'done') { _goals = _goals.filter(x => x !== g); showToast('Tebrikler — hedef tamamlandı 🎉', 'success', 3000); }
  else g.status = status;
  goalDraw();
}

async function goalDelete(id) {
  const g = _goals.find(x => String(x.id) === String(id));
  if (!g) return;
  if (!confirm('"' + g.title + '" hedefi silinsin mi? Eklenen görevler silinmez.')) return;
  const { error } = await window._supa.from('aidan_goals').delete().eq('id', g.id);
  if (error) { showToast('Silinemedi: ' + error.message, 'error', 4000); return; }
  _goals = _goals.filter(x => x !== g);
  goalDraw();
}
