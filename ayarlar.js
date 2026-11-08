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
  renderSaglikTani();    // 25 Eki: kısayol teşhisi
  renderHareketAyar();   // 25 Eki: Ayarlar açılınca hareket molası satırı (aynı anda çizilir)
  ayarGrupla();          // 8 Kas: satırları 5 açılır gruba taşı
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
    el.innerHTML = '<button class="small secondary" onclick="createCalendarLink()"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Takvim bağlantısı oluştur</button>';
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
    '<button class="small ghost" onclick="resetCalendarLink()">Bağlantıyı sıfırla</button>';
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

// ============================================================
// 💪 HAREKET MOLASI AYARI (25 Eki 2026) — Ayarlar'da "Depolama"nın üstüne enjekte edilir
// (asistan.html ilk yükleme bütçesinde — satır eklenmez). Aç/kapat + hareket başı aç/kapat + adet +
// son 7 gün. Bildirimleri worker atar (runHareket); burası yalnız data.hareketAyar yazar.
// ============================================================
// Hareket tablosu TEK yerde: ogun.js HAREKET_TUR_I (worker ikizi). Burada kopyası yok.
function renderHareketAyar() {
  const ref = document.getElementById('storageInfo');
  const satir = ref && ref.closest('.settings-row');
  if (!satir) return;
  if (typeof HAREKET_TUR_I === 'undefined') { loadModule('ogun').then(() => renderHareketAyar()).catch(() => {}); return; }
  let el = document.getElementById('hareketAyarRow');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hareketAyarRow';
    el.className = 'settings-row';
    satir.parentNode.insertBefore(el, satir);
    if (typeof ayarGrupla === 'function') ayarGrupla();
    el.addEventListener('click', ev => {
      const b = ev.target.closest('button[data-h]');
      if (!b) return;
      const ay = data.hareketAyar || (data.hareketAyar = {});
      const tur = b.dataset.tur, T = HAREKET_TUR_I[tur];
      if (b.dataset.h === 'ac') ay.kapali = !ay.kapali;
      else if (!T) return;
      else if (b.dataset.h === 'sec') ay.kapat = Object.assign({}, ay.kapat, { [tur]: !(ay.kapat && ay.kapat[tur]) });
      else {
        const yeni = Math.max(T.min, Math.min(T.tavan, hareketAdetI(tur) + (b.dataset.h === 'arti' ? T.adim : -T.adim)));
        ay.adet = Object.assign({}, ay.adet, { [tur]: yeni });
      }
      save(); renderHareketAyar();
    });
  }
  const ay = data.hareketAyar || {};
  const kapat = ay.kapat || {};
  const log = data.hareketLog || {};
  const bas = shiftDateStr(today(), -6);
  let set = 0; const top = {};
  Object.keys(log).forEach(g => {
    if (g < bas) return;
    set += log[g].set || 0;
    Object.keys(HAREKET_TUR_I).forEach(t => { if (log[g][t]) top[t] = (top[t] || 0) + log[g][t]; });
  });
  const ozet = Object.keys(top).map(t => top[t] + ' ' + HAREKET_TUR_I[t].ad).join(' · ');
  const adetSatir = (tur) => {
    const T = HAREKET_TUR_I[tur], acik = !kapat[tur];
    return '<div class="ha-adet' + (acik ? '' : ' ha-kapali') + '"><span>' + escapeHtml(T.ad.charAt(0).toUpperCase() + T.ad.slice(1)) + '</span>' +
      '<button class="small secondary" data-h="sec" data-tur="' + tur + '">' + (acik ? 'Açık' : 'Kapalı') + '</button>' +
      (acik ? '<button class="small secondary" data-h="eksi" data-tur="' + tur + '" aria-label="azalt">−</button>' +
        '<b>' + hareketAdetI(tur) + '</b>' +
        '<button class="small secondary" data-h="arti" data-tur="' + tur + '" aria-label="artır">+</button>' : '') + '</div>';
  };
  el.innerHTML = '<label>Hareket molası</label>' +
    '<div class="settings-help">Evdeki boş saatlerinde günde 1-3 kez kısa hareket bildirimi; her molada farklı hareket. Bildirime dokun = yaptım. ' +
    'Antrenman günü o bölge dinlenir (üst vücut günü şınav/barfiks gelmez, bacak günü squat/hamle gelmez). Adet her 6 sette bir kendiliğinden artar. Barın yoksa barfiksi kapat.</div>' +
    '<button class="small' + (ay.kapali ? '' : ' secondary') + '" data-h="ac">' + (ay.kapali ? 'Aç' : 'Hepsini kapat') + '</button>' +
    (ay.kapali ? '' : Object.keys(HAREKET_TUR_I).map(adetSatir).join('')) +
    '<div class="settings-help">Son 7 gün: ' + (set ? set + ' set · ' + ozet : 'henüz kayıt yok') + '</div>';
  if (!document.getElementById('hareketAyarStil')) {
    const st = document.createElement('style');
    st.id = 'hareketAyarStil';
    st.textContent = '.ha-adet{display:flex;align-items:center;gap:8px;margin-top:8px}.ha-adet span{flex:1}' +
      '.ha-adet button{min-width:44px;min-height:44px}.ha-adet b{min-width:28px;text-align:center;font-variant-numeric:tabular-nums}' +
      '.ha-kapali span{opacity:.55}';
    document.head.appendChild(st);
  }
}

// ============================================================
// 🩺 SAĞLIK VERİSİ TEŞHİSİ (25 Eki 2026) — Ayarlar'da Depolama'nın üstüne enjekte edilir.
// Worker /health son gönderimin sonucunu data.saglikTani'ye yazar (saglikTaniOlustur).
// Burası onu + son kaydın tarihini okuyup TEK cümlelik "ne yapmalısın" üretir.
// ============================================================
const SAGLIK_GRUP_AD = { uyku: 'uyku', nabiz: 'nabız', adim: 'adım', tarti: 'tartı' };

/** Saf: durum metni. bugun = 'YYYY-MM-DD'. */
function saglikTaniMetni(d, bugun) {
  const t = d && d.saglikTani;
  const tarihler = [].concat(Array.isArray(d && d.health) ? d.health : [], Array.isArray(d && d.sleep) ? d.sleep : [])
    .map(x => x && x.date).filter(Boolean).sort();
  const sonVeri = tarihler.length ? tarihler[tarihler.length - 1] : null;
  const gunFark = (a) => Math.round((new Date(bugun + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  const tarihYaz = (a) => { const g = gunFark(a); return g <= 0 ? 'bugün' : g === 1 ? 'dün' : g + ' gün önce'; };
  if (!t) {
    return { durum: 'yok', metin: sonVeri
      ? 'Son sağlık verisi ' + tarihYaz(sonVeri) + ' geldi; o günden beri kısayol hiç ulaşmadı. Otomasyon çalışmıyor ya da kısayoldaki gizli anahtar yanlış.'
      : 'Sağlık verisi hiç gelmedi. Kısayol/otomasyon kurulu değil ya da gizli anahtar yanlış.' };
  }
  const gelen = t.gelen || {};
  const eksik = ['uyku', 'nabiz'].filter(k => !gelen[k]).map(k => SAGLIK_GRUP_AD[k]);
  const ne = Object.keys(SAGLIK_GRUP_AD).filter(k => gelen[k]).map(k => SAGLIK_GRUP_AD[k]);
  const once = 'Kısayol son ' + tarihYaz(t.tarih) + ' ' + (t.saat || '') + ' çalıştı';
  if (gunFark(t.tarih) >= 2) return { durum: 'eski', metin: once + '. O günden beri çalışmıyor → Otomasyon\'da "Çalıştırmadan Önce Sor" kapalı mı, bak.' };
  if (t.sonuc === 'bos' || t.sonuc === 'gecersiz' || eksik.length === 2) {
    return { durum: 'bos', metin: once + ' ama ' + (eksik.join(' ve ') || 'veriler') + ' BOŞ geldi → Ayarlar → Sağlık → Veri Erişimi ve Aygıtlar → Kısayollar: izinleri aç. Google Health → Apple Sağlık aktarımı da açık olmalı.' };
  }
  return { durum: eksik.length ? 'kismi' : 'ok', metin: once + ' · gelen: ' + ne.join(', ') + (eksik.length ? ' · eksik: ' + eksik.join(', ') + ' (Sağlık izni kapalı olabilir)' : '') };
}

function renderSaglikTani() {
  const ref = document.getElementById('storageInfo');
  const satir = ref && ref.closest('.settings-row');
  if (!satir) return;
  let el = document.getElementById('saglikTaniRow');
  if (!el) {
    el = document.createElement('div');
    el.id = 'saglikTaniRow';
    el.className = 'settings-row';
    satir.parentNode.insertBefore(el, document.getElementById('hareketAyarRow') || satir);
  }
  const r = saglikTaniMetni(data, today());
  el.innerHTML = '<label>Sağlık verisi (Fitbit → Apple Sağlık → Aidan)</label>' +
    '<div class="settings-help" data-durum="' + r.durum + '">' + escapeHtml(r.metin) + '</div>';
}

// ============================================================
// ⚙️ AYAR GRUPLARI (8 Kas 2026, düzen 2. tur) — Ayarlar 17 ayrı kart / ~5000 px idi.
// Satırlar 5 açılır gruba TAŞINIR (id'ler korunur, asistan.html'e satır eklenmez — ilk
// yükleme bütçesi). Grup içinde satır kart değil, ince çizgiyle ayrılır (iç içe kart yasak).
// Yeni ayar satırı eklersen AYAR_GRUPLAR'a yaz; yazmazsan grupların altında tek başına kalır.
// ============================================================
const AYAR_GRUPLAR = [
  { id: 'agBildirim', ad: 'Bildirimler', alt: 'izin, sessize alma, sabit hatırlatıcılar, hareket molası',
    ikon: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    satir: ['notifSettings', 'muteState', 'fixedRemindersList', 'hareketAyarRow'] },
  { id: 'agPlan', ad: 'Plan ve takvim', alt: 'otomatik plan, sabit program, geri sayımlar, takvim',
    ikon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    satir: ['autoPlanChk', 'fixedScheduleList', 'countdownManageList', 'calendarSyncBox', 'estimateStats'] },
  { id: 'agAi', ad: 'Aidan nasıl konuşsun', alt: 'hitap, talimatlar, hafıza',
    ikon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    satir: ['displayName', 'aiInstructions', 'memList'] },
  { id: 'agBag', ad: 'Bağlantılar', alt: 'sağlık verisi, Hevy, bulut hesabı, davet',
    ikon: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    satir: ['saglikTaniRow', 'hevyStatus', 'supaSetupBox', 'inviteSection'] },
  { id: 'agVeri', ad: 'Veri ve yedek', alt: 'indir, yükle, otomatik yedekler, depolama',
    ikon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
    satir: ['importFile', 'backupDetails', 'storageInfo'] },
];

(function ayarStil() {
  if (document.getElementById('ayarGrupStil')) return;
  const st = document.createElement('style');
  st.id = 'ayarGrupStil';
  st.textContent =
    '.ayar-grup>summary{flex-wrap:wrap;row-gap:2px}' +
    '.ayar-grup .ag-alt{flex-basis:100%;order:3;padding-left:25px;font-weight:400;font-size:12.5px;color:var(--text-muted);line-height:1.4}' +
    '.ayar-grup>summary::after{order:2}' +
    '.ayar-grup .ag-govde>.settings-row{background:none;border:0;border-radius:0;margin:0;padding:14px;border-top:1px solid var(--border-soft)}' +
    '.ayar-grup .ag-uyari{color:var(--warning)}' +
    '#agBildirim .ag-govde>.settings-row:first-child>label:first-child{display:none}' +
    '#settings details:not(.school-section):not(.pushlog-section)>summary{list-style:none;display:flex;align-items:center;gap:8px}' +
    '#settings details:not(.school-section):not(.pushlog-section)>summary::-webkit-details-marker{display:none}' +
    '#settings details:not(.school-section):not(.pushlog-section)>summary::after{content:"";width:6px;height:6px;border:solid var(--text-faint);border-width:0 2px 2px 0;transform:rotate(45deg);transition:transform 180ms ease-out}' +
    '#settings details[open]:not(.school-section)>summary::after{transform:rotate(-135deg)}' +
    '@media (prefers-reduced-motion:reduce){#settings details>summary::after{transition:none}}';
  document.head.appendChild(st);
})();

function ayarSatiri(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  return el.classList.contains('settings-row') ? el : el.closest('.settings-row');
}

function ayarGrupla() {
  const panel = document.getElementById('settings');
  if (!panel) return;
  const baslik = panel.querySelector('h2');
  let once = baslik;
  for (const g of AYAR_GRUPLAR) {
    let det = document.getElementById(g.id);
    if (!det) {
      det = document.createElement('details');
      det.id = g.id;
      det.className = 'school-section ayar-grup';
      det.innerHTML = '<summary>' + dtIcon(g.ikon) + '<span class="ag-ad">' + escapeHtml(g.ad) +
        '</span><span class="ag-alt">' + escapeHtml(g.alt) + '</span></summary><div class="ag-govde"></div>';
      if (once && once.parentNode === panel) once.after(det); else panel.prepend(det);
    }
    once = det;
    const govde = det.querySelector('.ag-govde');
    for (const s of g.satir) {
      const row = ayarSatiri(s);
      if (row && row.parentNode !== govde) govde.appendChild(row);
    }
    // Sıra sabit: grup içindeki satırları listedeki sıraya diz (geç gelen satır da yerine oturur)
    g.satir.map(ayarSatiri).filter(r => r && r.parentNode === govde).forEach(r => govde.appendChild(r));
  }
  // Tehlikeli düğme grubun EN SONUNA (yanlışlıkla dokunma)
  const veri = document.querySelector('#agVeri .ag-govde');
  const sifirla = panel.querySelector('button.danger[onclick^="resetAll"]');
  if (veri && sifirla) {
    let r = document.getElementById('ayarSifirRow');
    if (!r) { r = document.createElement('div'); r.id = 'ayarSifirRow'; r.className = 'settings-row'; }
    if (sifirla.parentNode !== r) r.appendChild(sifirla);
    veri.appendChild(r);
  }
  ayarGrupDurum();
}

// Grup başlığında sorun varsa tek satır uyarı (ör. sağlık verisi gelmiyor) — açmadan görülsün.
function ayarGrupDurum() {
  const det = document.getElementById('agBag');
  const alt = det && det.querySelector('.ag-alt');
  if (!alt) return;
  const d = typeof saglikTaniMetni === 'function' && typeof data !== 'undefined' ? saglikTaniMetni(data, today()).durum : 'ok';
  const sorun = d && d !== 'ok';
  alt.classList.toggle('ag-uyari', !!sorun);
  alt.textContent = sorun ? 'Sağlık verisi gelmiyor — aç ve bak' : AYAR_GRUPLAR[3].alt;
}
