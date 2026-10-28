/**
 * ayarlar.js — Ayarlar sekmesinin ve global aramanın kodu (18 Eki 2026). TEMBEL modül.
 *
 * NEDEN: ilk yükleme bütçesi (13-lazy) 185 KB'ın 184,96'sına dayanmıştı; "Bugün"
 * ekranı ve sonraki her ana ekran işi yer bekliyordu. Buradaki kod yalnız Ayarlar
 * sekmesi açılınca ya da arama düğmesine basılınca gerekiyor — kritik yolda işi yok.
 * İçerik: bildirim geçmişi, takvim aboneliği (ICS), depolama çubuğu, geri sayım
 * yönetimi, global arama. ui.js'te aynı adlı YER TUTUCULAR var (`_lz`): ilk çağrıda
 * bu modülü indirir; modül inince buradaki gerçek tanımlar onları ezer.
 *
 * ⚠️ Yeni modul eklersen 7 yer: LAZY_MODULES · sw.js ASSETS · deploy INCLUDE ·
 *    Actions paths · .gitattributes · package.json check · tests/07 + 13 listeleri.
 */
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
  return `${GUN_KISA[d.getDay()]} ${hhmm}`;
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

// ===== DEPOLAMA BILGISI (8 Agu 2026) =====
// Tum veri tek JSON blob'da; tarayici tavani ~5 MB. Eskiden bu sayi hicbir
// yerde gorunmuyordu — kota dolana kadar sessizdi, dolunca da is bozuluyordu.
// Ayarlar sekmesi acilinca hesaplanir (her save'de degil: JSON.stringify pahali).
const STORAGE_ETIKET = {
  tasks: 'Görevler', chat: 'Sohbet', notes: 'Kayıtlar', diet: 'Diyet günlüğü',
  hevy: 'Antrenman', sleep: 'Uyku', journal: 'Günlük',
  pushLog: 'Bildirim geçmişi', dumps: 'Zihin boşalt', reminders: 'Hatırlatıcılar',
  coach: 'Sağlık koçu', templates: 'Şablonlar', settings: 'Ayarlar', dayPlan: 'Gün planı',
};

function renderStorageInfo() {
  const bar = document.querySelector('.storage-bar');
  const fill = document.getElementById('storageFill');
  const info = document.getElementById('storageInfo');
  const parts = document.getElementById('storageParts');
  if (!fill || !info) return;
  const r = dataSizeReport();
  fill.style.width = Math.min(100, r.pct) + '%';
  if (bar) {
    bar.classList.toggle('warn', r.pct >= LS_WARN_PCT && r.pct < LS_ALARM_PCT);
    bar.classList.toggle('alarm', r.pct >= LS_ALARM_PCT);
  }
  const kalan = fmtBytes(Math.max(0, LS_LIMIT_CHARS - r.chars));
  info.textContent = fmtBytes(r.chars) + ' kullanılıyor · %' + r.pct +
    ' dolu · ' + kalan + ' boş' +
    (r.pct >= LS_ALARM_PCT ? ' — yedek al, eski kayıtları temizle.'
     : r.pct >= LS_WARN_PCT ? ' — göz kulak ol.' : '');
  if (!parts) return;
  parts.innerHTML = r.parts.slice(0, 8).map(x =>
    '<div class="sp-row"><span>' + escapeHtml(STORAGE_ETIKET[x.key] || x.key) +
    '</span><b>' + fmtBytes(x.chars) + '</b></div>').join('') ||
    '<div class="sp-row"><span>Henüz veri yok</span></div>';
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
    el.innerHTML = '<button class="small" onclick="createCalendarLink()"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Takvim bağlantısı oluştur</button>';
    return;
  }
  el.innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">' +
      '<input type="text" id="calUrlField" readonly value="' + escapeHtml(url) + '" style="flex:1;font-size:12px;">' +
      '<button class="small" onclick="copyCalendarUrl()"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Kopyala</button>' +
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
  showToast('Takvim bağlantın hazır — kopyala, iPhone Takvim\'e abone ol', 'success', 4000);
}

function resetCalendarLink() {
  data.settings = data.settings || {};
  data.settings.calendarToken = genCalendarToken();
  save();
  renderCalendarSync();
  showToast('Yeni bağlantı üretildi — eski abonelik durur, yenisini ekle', 'info', 4000);
}

async function copyCalendarUrl() {
  const url = calendarUrl();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Kopyalandı', 'success', 2000);
  } catch (e) {
    const f = document.getElementById('calUrlField');
    if (f) { f.select(); document.execCommand('copy'); showToast('Kopyalandı', 'success', 2000); }
  }
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
  if (!date) { showToast('Tarih seç', 'warning', 3000); return; }
  data.countdowns = data.countdowns || [];
  data.countdowns.push({ id: Date.now(), label, date });
  document.getElementById('countdownLabel').value = '';
  document.getElementById('countdownDate').value = '';
  save();
  renderCountdowns();
  renderCountdownManage();
  showToast(`"${label}" eklendi`, 'success', 2500);
}

function deleteCountdown(id) {
  data.countdowns = (data.countdowns || []).filter(x => x.id !== id);
  save();
  renderCountdowns();
  renderCountdownManage();
  showToast('Geri sayım silindi', 'info', 2500);
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
  // school.js tembel: panel dolmadan kaydirmak bos kutuya goturur.
  if (ss) {
    ss.open = true;
    Promise.resolve(typeof ensureSchoolModule === 'function' ? ensureSchoolModule() : null)
      .then(() => setTimeout(() => ss.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80));
  }
}
