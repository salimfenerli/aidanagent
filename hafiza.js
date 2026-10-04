/**
 * hafiza.js — Ayarlar > Hafıza ekranı (28 Eyl 2026). TEMBEL modül.
 *
 * NEDEN AYRI DOSYA: ilk yükleme bütçesi 185 KB ve ekran yalnız Ayarlar'da
 * açılıyor. ui.js'e yazılınca bütçe 186 KB oldu; eşik yükseltilmedi, kod
 * kritik yoldan çıkarıldı. Kapı: tasks.js ensureMemoryModule().
 *
 * Veri public.aidan_memory'de (aidan_data blob'unda DEĞİL): worker sohbetten
 * sonra yazar, burada yalnız görülür / silinir / elle eklenir.
 * ⚠️ Yeni modul eklersen 6 yer: LAZY_MODULES · sw.js ASSETS · deploy INCLUDE ·
 *    Actions paths · .gitattributes · tests/13-lazy + 07-hygiene listeleri.
 */
// ===== Hafıza (28 Eyl 2026) — Aidan'ın sohbetten öğrendikleri =====
// Ayrı tablo (public.aidan_memory): worker sohbetten sonra yazar, burada yalnız
// görülür / silinir / elle eklenir. aidan_data blob'una girmez → senkron çakışması yok.
const MEM_CAT_AD = { hedef: 'Hedefler', antrenman: 'Antrenman', beslenme: 'Beslenme',
  okul: 'Okul ve düzen', borsa: 'Borsa', tercih: 'Tercihler', genel: 'Genel' };
// Stil burada: styles.css statik yüklenir ve ilk yükleme bütçesine sayılır;
// ekran yalnız Ayarlar'da açıldığı için CSS de modülle birlikte iner.
(function memStyle() {
  if (document.getElementById('memStyle')) return;
  const st = document.createElement('style');
  st.id = 'memStyle';
  st.textContent = '.mem-list{display:flex;flex-direction:column;gap:6px}' +
    '.mem-cat{margin-top:8px;font-size:12.5px;font-weight:600;color:var(--text-muted,#a9abb3)}' +
    '.mem-item{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:12px;' +
    'border:1px solid var(--border,#2a2c35);background:var(--surface-2,#1b1c23);font-size:14px;line-height:1.5;color:var(--text,#e5e1d9)}' +
    '.mem-item span{flex:1}' +
    '.mem-del{position:relative;flex:none;background:none;border:0;padding:0 2px;color:var(--text-muted,#a9abb3);font-size:13px;cursor:pointer}' +
    '.mem-del::after{content:"";position:absolute;inset:-12px}' +
    '.mem-add{display:flex;gap:8px;margin-top:10px}' +
    '.mem-add input{flex:1;min-width:0}';
  document.head.appendChild(st);
})();
let _memItems = [];
async function renderMemory() {
  const slot = document.getElementById('memAddSlot');
  // Ekleme kutusu da modülle iner (asistan.html ilk yükleme bütçesine sayılır).
  if (slot && !slot.firstChild) {
    slot.innerHTML = '<input type="text" id="memNew" maxlength="200" placeholder="Elle ekle: örn. Salı günleri antrenman yapamıyorum"'
      + ' onkeydown="if(event.key===\'Enter\')memAdd()"><button class="small" onclick="memAdd()">Ekle</button>';
  }
  const el = document.getElementById('memList');
  if (!el) return;
  if (!window._supa) await supaReady();
  if (!window._supa || !window._user) {
    el.innerHTML = '<div class="settings-help">Hafıza için bulut girişi gerekli.</div>';
    return;
  }
  const { data: row, error } = await window._supa.from('aidan_memory')
    .select('items').eq('user_id', window._user.id).maybeSingle();
  if (error) { el.innerHTML = '<div class="settings-help">Hafıza okunamadı: ' + escapeHtml(error.message) + '</div>'; return; }
  _memItems = (row && Array.isArray(row.items)) ? row.items : [];
  memDraw();
}
function memDraw() {
  const el = document.getElementById('memList');
  if (!el) return;
  if (!_memItems.length) {
    el.innerHTML = '<div class="settings-help">Henüz bir şey öğrenmedi. Sohbette kendinden bahsettikçe dolar.</div>';
    return;
  }
  let h = '';
  Object.keys(MEM_CAT_AD).forEach(c => {
    const grup = _memItems.filter(x => (MEM_CAT_AD[x.cat] ? x.cat : 'genel') === c);
    if (!grup.length) return;
    h += '<div class="mem-cat">' + MEM_CAT_AD[c] + '</div>';
    grup.forEach(x => {
      h += '<div class="mem-item"><span>' + escapeHtml(x.text) + '</span>' +
        '<button class="mem-del" aria-label="Sil" data-id="' + escapeHtml(String(x.id)) +
        '" onclick="memDelete(this.dataset.id)">✕</button></div>';
    });
  });
  h += '<div class="instr-count">' + _memItems.length + ' / 60</div>';
  el.innerHTML = h;
}
async function memSave(items) {
  const { error } = await window._supa.from('aidan_memory').upsert(
    { user_id: window._user.id, items, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) { showToast('Hafıza kaydedilemedi: ' + error.message, 'error', 4000); return false; }
  return true;
}
async function memDelete(id) {
  const yeni = _memItems.filter(x => String(x.id) !== String(id));
  if (await memSave(yeni)) { _memItems = yeni; memDraw(); showToast('Silindi — Aidan bunu artık bilmiyor.', 'success', 2500); }
}
async function memAdd() {
  const inp = document.getElementById('memNew');
  const text = inp ? inp.value.trim().slice(0, 200) : '';
  if (text.length < 3 || !window._supa || !window._user) return;
  const yeni = _memItems.concat([{ id: 'u' + Date.now().toString(36), text, cat: 'genel', at: today(), src: 'user' }]).slice(-60);
  if (await memSave(yeni)) { _memItems = yeni; inp.value = ''; memDraw(); }
}

// ============================================================
// AYARLAR TEMBEL EKLERİ (5 Eki 2026) — ui.js'ten TAŞINDI.
// ⚠️ Neden: sohbet ajanı ilk yüklemeyi 186 KB'ye çıkardı (bütçe 185).
// Davet kodları ve bulut yedek listesi YALNIZ Ayarlar'da görünüyor ve bu
// modül zaten Ayarlar açılınca iniyor. Çağrı yerleri typeof ile korunuyor.
// ============================================================
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
      const usedLine = used ? `<div class="countdown-row-meta">✓ kullanıldı · ${new Date(c.used_at).toLocaleDateString('tr-TR')}</div>` : '<div class="countdown-row-meta">kullanılmadı</div>';
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
    showToast(`${j.code} — kopyalayıp arkadaşına yolla`, 'success', 4500);
    await refreshInviteList();
  } catch (e) { showToast('Hata: ' + e.message, 'warning', 3500); }
}

function copyInviteCode(code) {
  navigator.clipboard.writeText(code).then(
    () => showToast(`${code} kopyalandı`, 'success', 2000),
    () => showToast('Kopyalama başarısız', 'warning', 2500)
  );
}

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
          <button class="small secondary" onclick="downloadBackup(${r.id}, '${isoLocal(d)}')" title="JSON indir">İndir</button>
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
