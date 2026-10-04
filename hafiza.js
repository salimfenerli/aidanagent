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
