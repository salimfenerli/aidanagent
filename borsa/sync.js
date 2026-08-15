// ============================================================
// BORSA — Supabase kimlik + bulut senkronu
// ============================================================
// Tablo: public.aidan_stocks  (Aidan'in aidan_data'sindan AYRI satir)
//
// ⚠️ Cakisma korumasi Aidan'dan BIREBIR tasindi. Sebep: eski Aidan davranisi
// "bulut yereli kosulsuz ezsin" idi ve iPhone + PC birlikte kullanildigi icin
// bu SESSIZ VERI KAYBI demekti. Borsa verisi (islem gunlugu, portfoy maliyeti)
// yeniden uretilemez — ayni hatayi burada tekrarlamak daha pahali olurdu.
//
// Karar matrisi:
//   bulut ayni + temiz  -> hicbir sey
//   bulut ayni + kirli  -> YERELI push et
//   bulut yeni + temiz  -> uygula (yine de yedekle)
//   bulut yeni + kirli  -> CAKISMA, kullaniciya sor
// Ezilen taraf HER durumda yedeklenir.
// ============================================================

const CONFIG_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/config';
const SUPA_TABLE = 'aidan_stocks';

// ⚠️ Anahtarlar 'borsa_' onekli — Aidan ayni tarayicida kendi anahtarlarini
// kullaniyor, ikisi birbirinin senkron durumunu ezmemeli.
const SYNC_REV_KEY    = 'borsa_syncRev';
const SYNC_DIRTY_KEY  = 'borsa_dirty';
const SYNC_BACKUP_KEY = 'borsa_conflictBackup';

let _pulling = false, _pushing = false, _pushTimer = null;
let _loginInitUserId = null, _syncChannel = null;

// ---- kirli/surum izleme ----
function markLocalDirty() { try { localStorage.setItem(SYNC_DIRTY_KEY, '1'); } catch (_) {} }
function isLocalDirty()   { try { return localStorage.getItem(SYNC_DIRTY_KEY) === '1'; } catch (_) { return false; } }
function clearLocalDirty(){ try { localStorage.removeItem(SYNC_DIRTY_KEY); } catch (_) {} }
function getSyncRev()     { try { return localStorage.getItem(SYNC_REV_KEY) || ''; } catch (_) { return ''; } }
function setSyncRev(rev)  { try { localStorage.setItem(SYNC_REV_KEY, rev || ''); } catch (_) {} }
// Sunucu formati (mikrosaniye/offset) yerelde sakladigimizdan farkli yazilabilir -> ms'e indir.
// Bu olmadan her pull SAHTE cakisma sayardi.
function revMs(v) { const t = Date.parse(v || ''); return isNaN(t) ? 0 : t; }

function backupBeforeOverwrite(side, obj) {
  try { localStorage.setItem(SYNC_BACKUP_KEY, JSON.stringify({ at: Date.now(), side, data: obj })); }
  catch (_) {}   // kota doluysa yedek atlanir, ana akis bozulmaz
}

function syncSummary(d) {
  d = d || {};
  const wl = (d.watchlist || []).length;
  const pos = (d.watchlist || []).filter(w => w && w.qty > 0).length;
  const tr = (d.trades || []).length;
  return wl + ' izleme (' + pos + ' pozisyon) - ' + tr + ' islem kaydi';
}

function restoreConflictBackup() {
  let raw; try { raw = localStorage.getItem(SYNC_BACKUP_KEY); } catch (_) { raw = null; }
  if (!raw) { showToast('Geri alinacak cakisma yedegi yok', 'info', 3000); return; }
  let snap; try { snap = JSON.parse(raw); } catch (_) { showToast('Yedek okunamadi', 'error', 3000); return; }
  if (!snap || !snap.data) { showToast('Yedek bos', 'error', 3000); return; }
  const when = new Date(snap.at || Date.now()).toLocaleString('tr-TR');
  if (!confirm('Cakisma yedegini geri yukle\n\n' + when + ' tarihli kayit:\n' + syncSummary(snap.data) +
               '\n\nSu andaki veri bununla degistirilecek. Devam?')) return;
  backupBeforeOverwrite('pre-restore', data);   // geri almanin da geri almasi olsun
  data = snap.data;
  ensureShape();
  save();
  renderAll();
  showToast('Yedek geri yuklendi', 'success', 4000);
}

// ============ SUPABASE KUTUPHANESI (tembel) ============
// 205 KB — kritik yolda olmamali. Sayfa once cizilir, kutuphane arkadan iner.
let _libPromise = null;
function loadSupabaseLib() {
  if (window.supabase) return Promise.resolve();
  if (_libPromise) return _libPromise;
  _libPromise = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'supabase.js';
    sc.onload = () => res();
    sc.onerror = () => { _libPromise = null; rej(new Error('supabase yuklenemedi')); };
    document.head.appendChild(sc);
  });
  return _libPromise;
}

function initSupabase() {
  window._supaReady = _initSupabaseAsync();
  return window._supaReady;
}

async function _initSupabaseAsync() {
  const url = data.settings.supaUrl;
  const key = data.settings.supaKey;
  if (!url || !key) return;
  try { await loadSupabaseLib(); }
  catch (e) { setSyncStatus('Supabase kutuphanesi yuklenemedi (internet?)'); return; }
  if (!window.supabase) { setSyncStatus('Supabase kutuphanesi yuklenemedi'); return; }

  try { window._supa = window.supabase.createClient(url, key); }
  catch (e) { setSyncStatus('Baglanti hatasi: ' + e.message); return; }

  window._supa.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      window._user = session.user;
      onLoginSuccess();
    } else {
      window._user = null;
      _loginInitUserId = null;
      renderAuthBox();
    }
  });

  const { data: { session } } = await window._supa.auth.getSession();
  if (session && session.user) { window._user = session.user; onLoginSuccess(); }
  else renderAuthBox();
}

/**
 * Kutuphane inerken tetiklenen her yol buradan gecer. Olmasaydi: acilista
 * hemen "AI yorum"a basilsa getSupaToken null doner ve kullanici hesabi
 * gayet acikken "oturum bulunamadi" hatasi alirdi.
 * Baslatma hic yapilmadiysa (credentials yok) HEMEN doner — asili kalmaz.
 */
async function supaReady() {
  if (window._supa) return true;
  if (window._supaReady) { try { await window._supaReady; } catch (_) {} }
  return !!window._supa;
}

// stocks.js'in AI/worker cagrilari bunu kullanir.
async function getSupaToken() {
  if (!window._supa && !(await supaReady())) return null;
  const { data: s } = await window._supa.auth.getSession();
  return (s && s.session && s.session.access_token) || null;
}

async function autoConnectFromConfig() {
  try {
    const r = await fetch(CONFIG_ENDPOINT);
    if (!r.ok) { renderAuthBox(); return; }
    const cfg = await r.json();
    if (!cfg.supaUrl || !cfg.supaKey) { renderAuthBox(); return; }
    data.settings.supaUrl = cfg.supaUrl;
    data.settings.supaKey = cfg.supaKey;
    saveLocal();
    initSupabase();
  } catch (e) {
    console.warn('autoConnect fail', e.message);
    renderAuthBox();
  }
}

async function onLoginSuccess() {
  renderAuthBox();
  // Token yenilemede / tekrar eden SIGNED_IN olaylarinda agir init'i TEKRARLAMA.
  if (_loginInitUserId === (window._user && window._user.id)) return;
  _loginInitUserId = window._user.id;
  setSyncStatus('Giris basarili: ' + window._user.email + '\nVeriler esitleniyor...');
  await pullFromCloud();
  subscribeToCloud();
  renderAll();
}

// ============ CEKME ============
async function pullFromCloud() {
  if (!window._supa || !window._user) return;
  _pulling = true;
  try {
    const { data: row, error } = await window._supa
      .from(SUPA_TABLE).select('*').eq('user_id', window._user.id).maybeSingle();

    if (error) { setSyncStatus('Cekme hatasi: ' + error.message); _pulling = false; return; }

    if (row && row.data) {
      const remoteRev = row.updated_at || '';
      const dirty = isLocalDirty();
      const remoteChanged = revMs(remoteRev) > revMs(getSyncRev());

      // 1) Bulut en son biraktigimiz halde
      if (!remoteChanged) {
        if (dirty) { await pushToCloudNow(); setSyncStatus('Bu cihazdaki degisiklikler buluta yazildi.'); }
        else setSyncStatus('Zaten guncel.');
        _pulling = false;
        return;
      }
      // 2) IKI TARAF DA degismis -> sessizce ezme, sor
      if (dirty) {
        backupBeforeOverwrite('local', data);
        const keepLocal = confirm(
          'Esitleme cakismasi\n\n' +
          'Bu cihazda ve baska bir cihazda ayni anda degisiklik yapilmis.\n\n' +
          'BU CIHAZ : ' + syncSummary(data) + '\n' +
          'BULUT    : ' + syncSummary(row.data) + '\n\n' +
          'Tamam  = bu cihazdakini koru (bulut ezilir)\n' +
          'Iptal  = buluttakini al (Ayarlar > Veri > cakisma yedeginden geri alinabilir)'
        );
        if (keepLocal) {
          await pushToCloudNow();
          setSyncStatus('Bu cihazdaki veri korundu ve buluta yazildi.');
          _pulling = false;
          return;
        }
      } else {
        // 3) Sadece bulut degismis -> guvenle uygula, yine de yedekle
        backupBeforeOverwrite('local', data);
      }

      data = row.data;
      ensureShape();
      saveLocal();
      renderAll();
      setSyncRev(row.updated_at || '');
      clearLocalDirty();
      setSyncStatus('Buluttan veri cekildi.');
    } else {
      // Bulutta veri yok — yereli yukle
      await pushToCloudNow();
      setSyncStatus('Ilk veri buluta yuklendi. Artik esitleniyor.');
    }
  } catch (e) {
    setSyncStatus('' + e.message);
  }
  _pulling = false;
}

// ============ YAZMA ============
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
    const { data: saved, error } = await window._supa
      .from(SUPA_TABLE)
      .upsert({ user_id: window._user.id, data: data, updated_at: now.toISOString() },
              { onConflict: 'user_id' })
      .select('updated_at').maybeSingle();
    if (error) console.warn('Push hata:', error);
    else {
      // Surumu SUNUCUNUN yazdigi degerden al — yerel ISO ile server formati
      // farkli olursa her pull sahte cakisma sayardi.
      setSyncRev((saved && saved.updated_at) || now.toISOString());
      clearLocalDirty();
    }
  } catch (e) { console.warn('Push hata:', e); }
  setTimeout(() => { _pushing = false; }, 3000);   // echo icin kisa grace period
}

// ============ CANLI (realtime) ============
function subscribeToCloud() {
  if (!window._supa || !window._user) return;
  try { if (_syncChannel) window._supa.removeChannel(_syncChannel); } catch (_) {}
  _syncChannel = window._supa.channel('borsa-sync-' + window._user.id)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: SUPA_TABLE,
      filter: 'user_id=eq.' + window._user.id
    }, payload => {
      if (_pulling || _pushing) return;                    // kendi echo'muz
      if (!payload.new || !payload.new.data) return;
      const rtRev = payload.new.updated_at || '';
      if (revMs(rtRev) <= revMs(getSyncRev())) return;     // eski/ayni surum
      if (JSON.stringify(payload.new.data) === JSON.stringify(data)) { setSyncRev(rtRev); return; }
      // Yerelde gonderilmemis degisiklik varsa sessizce ezme — once yedekle, haber ver
      if (isLocalDirty()) {
        backupBeforeOverwrite('local', data);
        showToast('Baska cihazdan guncelleme geldi (eskisi yedeklendi)', 'info', 5000);
      }
      data = payload.new.data;
      ensureShape();
      saveLocal();
      setSyncRev(rtRev);
      clearLocalDirty();
      renderAll();
    })
    .subscribe();
}

// ============ GIRIS EKRANI ============
function setSyncStatus(msg) {
  const el = document.getElementById('bxSyncStatus');
  if (el) el.textContent = msg || '';
}

function renderAuthBox() {
  const box = document.getElementById('bxAuthBox');
  const bar = document.getElementById('bxAuthBar');
  if (!box) return;

  if (window._user) {
    box.innerHTML =
      '<div class="bx-auth-who">Giris yapildi: <b>' + escapeHtml(window._user.email || '') + '</b></div>' +
      '<div class="bx-auth-row"><button type="button" class="bx-mini-btn" onclick="logoutUser()">Cikis yap</button>' +
      '<button type="button" class="bx-mini-btn" onclick="pullFromCloud()">Simdi esitle</button></div>';
    if (bar) bar.style.display = 'none';
    return;
  }

  box.innerHTML =
    '<input type="email" id="bxEmail" class="modal-input" placeholder="E-posta" autocomplete="username">' +
    '<input type="password" id="bxPass" class="modal-input" placeholder="Sifre" autocomplete="current-password">' +
    '<div class="bx-auth-row">' +
      '<button type="button" class="bx-mini-btn" onclick="loginUser()">Giris yap</button>' +
    '</div>';
  if (bar) {
    bar.style.display = '';
    bar.innerHTML = '<b>Giris yapilmadi.</b> Veriler yalniz bu cihazda duruyor — telefon ve bilgisayar arasinda esitlenmesi icin giris yap.' +
      ' <button type="button" class="bx-mini-btn" onclick="openSettings()">Giris</button>';
  }
}

async function loginUser() {
  if (!(await supaReady())) { setSyncStatus('Baglanti hazir degil, bir saniye sonra tekrar dene.'); return; }
  const email = (document.getElementById('bxEmail') || {}).value || '';
  const pass  = (document.getElementById('bxPass')  || {}).value || '';
  if (!email || !pass) { setSyncStatus('E-posta ve sifre gerekli.'); return; }
  setSyncStatus('Giris yapiliyor...');
  const { error } = await window._supa.auth.signInWithPassword({ email: email.trim(), password: pass });
  if (error) setSyncStatus('Giris basarisiz: ' + error.message);
}

async function logoutUser() {
  if (!window._supa) return;
  await window._supa.auth.signOut();
  setSyncStatus('Cikis yapildi. Veriler bu cihazda durmaya devam ediyor.');
}
