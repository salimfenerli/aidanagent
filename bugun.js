/**
 * bugun.js — Ana ekran "Bugün" öğün kartı (18 Eki 2026, Faz 2). TEMBEL modül.
 *
 * NEDEN: Salim öğün unutuyordu; plan saatleri, öğün hatırlatıcısı (worker) ve
 * günlük menü vardı ama ANA EKRANDA "şimdi ne yiyorum / yedim mi" yoktu —
 * görmek için Diyet sekmesine gitmek gerekiyordu. Faz 2 "tek Bugün ekranı":
 * şu an kartının altında sıradaki öğün + bugün kaç öğün işaretlendi + tek
 * dokunuşla Yedim / Atladım.
 *
 * Kurallar (worker öğün bekçisiyle AYNI):
 *  - saat PLAN kalem adındaki "HH:MM · " önekinden; önek yoksa kart çizilmez
 *  - öğün "tamam" = Yedim/Atladım işareti (data.ogunBekci) ya da o öğün
 *    penceresinde girilmiş kayıt (saatten 60 dk önce → sonraki öğünden 30 dk önce)
 *  - "bekliyor" = saati geçti, işaret yok, sıradaki öğün henüz başlamadı
 * Yedim / Atladım → ajan.js ogunBekciAksiyon (aynı kayıt yolu, Geri al dahil).
 *
 * ⚠️ Yeni modul eklersen 7 yer: LAZY_MODULES · sw.js ASSETS · deploy INCLUDE ·
 *    Actions paths · .gitattributes · package.json check · tests/07 + 13 listeleri.
 */
const BUGUN_SAAT_RE = /^\s*(\d{1,2}):(\d{2})\s*·\s*/;
const BUGUN_OGUN_AD = { kahvalti: 'Kahvaltı', ogle: 'Öğle', aksam: 'Akşam', ara: 'Ara öğün', atistirma: 'Ara öğün' };
let _bugunZamanlayici = null;

(function bugunStil() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function' || !document.head || document.getElementById('bugunStil')) return;
  const st = document.createElement('style');
  st.id = 'bugunStil';
  st.textContent =
    '.bugun-ogun{background:var(--bg-elev);border:1px solid var(--border-soft);border-radius:var(--radius,14px);padding:12px 14px;margin:-4px 0 14px}' +
    '.bugun-ogun.bekliyor{border-color:var(--warning);background:var(--warning-soft)}' +
    '.bo-head{display:flex;justify-content:space-between;align-items:center;font-size:.74em;color:var(--text-muted);letter-spacing:.02em}' +
    '.bo-say{font-variant-numeric:tabular-nums}' +
    '.bo-ana{margin-top:6px;font-weight:600;color:var(--text)}' +
    '.bo-kalem{font-size:.86em;color:var(--text-muted);margin-top:2px;line-height:1.4}' +
    '.bo-btns{display:flex;gap:8px;margin-top:10px}.bo-btns button{flex:1;min-height:44px}' +
    '.bo-sonra{font-size:.8em;color:var(--text-faint);margin-top:8px}' +
    '.bo-link{background:none;border:0;padding:0;margin-top:8px;min-height:44px;color:var(--text-muted);font:inherit;font-size:.86em;cursor:pointer}' +
    '.bo-girdi{width:100%;box-sizing:border-box;margin-top:8px;min-height:44px;font-size:16px}' +
    '.bo-oniz{margin-top:6px}.bo-oz{display:flex;justify-content:space-between;gap:10px;font-size:.86em;padding:3px 0;color:var(--text)}' +
    '.bo-oz b{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}.bo-oz.bilinmiyor{color:var(--warning)}' +
    '.bo-oz.toplam{border-top:1px solid var(--border-soft);margin-top:4px;padding-top:6px;color:var(--text-muted)}';
  document.head.appendChild(st);
})();

/** Bugünün öğün grupları: [{saat, dk, slot, kalemler, durum}] — durum: tamam | atla | bekliyor | gelecek | gecti */
function bugunOgunleri(simdiDk) {
  const tarih = today();
  const list = typeof planMealsForDate === 'function' ? planMealsForDate(tarih) : [];
  const map = {};
  for (const m of list) {
    const x = BUGUN_SAAT_RE.exec((m && m.name) || '');
    if (!x || +x[1] > 23 || +x[2] > 59) continue;
    const saat = String(+x[1]).padStart(2, '0') + ':' + x[2];
    const g = map[saat] || (map[saat] = { saat, dk: +x[1] * 60 + +x[2], slot: m.slot || 'atistirma', kalemler: [] });
    if (m.slot && m.slot !== 'atistirma') g.slot = m.slot;
    const ad = String(m.name).replace(BUGUN_SAAT_RE, '').split(' — ')[0].trim();
    if (ad && g.kalemler.indexOf(ad) < 0) g.kalemler.push(ad);
  }
  const gruplar = Object.keys(map).map(k => map[k]).sort((a, b) => a.dk - b.dk);
  const ob = (data.ogunBekci && data.ogunBekci.tarih === tarih && data.ogunBekci.g) || {};
  const day = (data.diet && data.diet.days && data.diet.days[tarih]) || {};
  const hm = (s) => { const k = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return k ? +k[1] * 60 + +k[2] : -1; };
  gruplar.forEach((g, i) => {
    const sonraki = gruplar[i + 1] ? gruplar[i + 1].dk : null;
    const isaret = (ob[g.saat] || {}).d;
    const kayitli = (day.meals || []).some(m => m && (m.bekci === g.saat ||
      (hm(m.at) >= g.dk - 60 && hm(m.at) < (sonraki != null ? sonraki - 30 : 1440))));
    if (isaret === 'atla') g.durum = 'atla';
    else if (isaret === 'yedi' || kayitli) g.durum = 'tamam';
    else if (simdiDk < g.dk) g.durum = 'gelecek';
    else if (sonraki == null || simdiDk < sonraki) g.durum = 'bekliyor';
    else g.durum = 'gecti';
  });
  return gruplar;
}

// ⚠️ 18 Eki 2026 — HIZLI GİRİŞ. Salim: "yediklerimi nasıl gireceğim, kolaylaştıralım".
// Plandan farklı bir şey yiyince kayıt 3-4 adımdı (Diyet → yemek ekle → ara → seç,
// ya da sohbet → Uygula). Artık kartta TEK SATIR: "2 yumurta, 1 simit, ayran" →
// her parça öğün çözücüsünden (ajanYemekCoz → foods.js; AI YOK, ücretsiz, anında)
// kaloriyle önizlenir, Kaydet tek dokunuş. Bulunamayan parça kalorisiz yazılmaz,
// "bulunamadı" diye gösterilir (makrosu bilinmeyen kaleme makro yazılmaz).
// Bir öğün için girildiyse o öğün de "yendi" işaretlenir → hatırlatma susar.
let _bugunForm = null;   // { saat: 'HH:MM' | null, metin }
let _bugunOnizTimer = null;

/** "2 yumurta, 1 simit ve ayran" → parçalar. Saf. */
function bugunParcala(metin) {
  return String(metin || '').split(/,|;|\+|\n|\s+ve\s+|\s+ile\s+/i).map(x => x.trim()).filter(x => x.length >= 2).slice(0, 12);
}

/** Parçaları çözer (foods.js + ajan.js inmiş olmalı): [{girdi, name, kcal, protein, carb, fat, bilinmiyor}] */
function bugunCoz(metin) {
  return bugunParcala(metin).map(g => Object.assign({ girdi: g }, ajanYemekCoz(g)));
}

function bugunOnizHtml(liste) {
  if (!liste.length) return '';
  let k = 0, p = 0;
  const satir = liste.map(x => {
    if (x.kcal == null) return '<div class="bo-oz bilinmiyor">' + escapeHtml(x.girdi) + ' — bulunamadı, kaydedilmez</div>';
    k += x.kcal; p += x.protein || 0;
    return '<div class="bo-oz"><span>' + escapeHtml(x.name) + '</span><b>' + x.kcal + ' kcal</b></div>';
  }).join('');
  return satir + (k ? '<div class="bo-oz toplam"><span>Toplam</span><b>' + Math.round(k) + ' kcal · ' + Math.round(p) + ' g protein</b></div>' : '');
}

function bugunFormAc(saat) {
  _bugunForm = { saat: saat || null, metin: '' };
  renderBugunOgun();
  Promise.all([loadModule('foods'), loadModule('ajan')]).catch(() => {});
  setTimeout(() => { const i = document.getElementById('boGirdi'); if (i) i.focus(); }, 50);
}

function bugunOnizle() {
  const i = document.getElementById('boGirdi'), o = document.getElementById('boOniz');
  if (!i || !o || !_bugunForm) return;
  _bugunForm.metin = i.value;
  Promise.all([loadModule('foods'), loadModule('ajan')]).then(() => { o.innerHTML = bugunOnizHtml(bugunCoz(i.value)); }).catch(() => {});
}

/** Kaydet: bilinen parçalar bugünün kaydına; öğün için girildiyse o öğün 'yedi'. Dönen = yazılan kayıt sayısı. */
function bugunKaydet(saat, metin) {
  const liste = bugunCoz(metin).filter(x => x.kcal != null);
  if (!liste.length) { showToast('Tanınan yiyecek yok — farklı yaz (örn. "2 yumurta")', 'warning', 3500); return 0; }
  ensureDiet();
  const t = today();
  const gun = data.diet.days[t] || (data.diet.days[t] = { meals: [], water: 0 });
  gun.meals = gun.meals || [];
  const grup = saat ? bugunOgunleri(0).find(g => g.saat === saat) : null;
  const slot = grup ? (grup.slot === 'ara' ? 'atistirma' : grup.slot) : ajanOgunVarsayilan(t);
  const at = typeof mealNow === 'function' ? mealNow() : null;
  const kayit = liste.map((x, i) => ({ id: Date.now() + i, slot, name: x.name, kcal: x.kcal, protein: x.protein, carb: x.carb, fat: x.fat,
    at, src: 'hizli', bekci: grup ? grup.saat : undefined }));
  gun.meals.push(...kayit);
  let eskiIsaret;
  if (grup) {
    const st = ogunDurum();
    eskiIsaret = st[grup.saat] ? Object.assign({}, st[grup.saat]) : null;
    st[grup.saat] = Object.assign({}, eskiIsaret, { d: 'yedi' });
  }
  save();
  _bugunForm = null;
  renderBugunOgun();
  if (typeof ajanYenile === 'function') ajanYenile();
  const geri = () => {
    const ids = new Set(kayit.map(x => x.id));
    const g = data.diet.days[t]; if (g) g.meals = (g.meals || []).filter(e => !ids.has(e.id));
    if (grup) { const st = ogunDurum(); if (eskiIsaret) st[grup.saat] = eskiIsaret; else delete st[grup.saat]; }
    save(); renderBugunOgun(); if (typeof ajanYenile === 'function') ajanYenile();
  };
  const k = Math.round(kayit.reduce((a, x) => a + (x.kcal || 0), 0));
  const mesaj = kayit.length + ' kalem kaydedildi · ' + k + ' kcal';
  if (typeof showUndoToast === 'function') showUndoToast(mesaj, geri); else showToast(mesaj, 'success');
  return kayit.length;
}

function bugunFormHtml() {
  const f = _bugunForm;
  const baslik = f.saat ? escapeHtml(f.saat) + ' öğününde ne yedin?' : 'Ne yedin?';
  return '<div class="bo-ana">' + baslik + '</div>' +
    '<input id="boGirdi" class="bo-girdi" type="text" autocomplete="off" enterkeyhint="done" ' +
    'placeholder="örn. 2 yumurta, 1 simit, 1 bardak ayran" value="' + escapeHtml(f.metin || '') + '">' +
    '<div id="boOniz" class="bo-oniz"></div>' +
    '<div class="bo-btns"><button class="small" data-a="kaydet">Kaydet</button><button class="small secondary" data-a="vazgec">Vazgeç</button></div>';
}

function renderBugunOgun() {
  const el = document.getElementById('bugunOgun');
  if (!el) return;
  const n = new Date();
  const gruplar = bugunOgunleri(n.getHours() * 60 + n.getMinutes());
  if (!gruplar.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const tamam = gruplar.filter(g => g.durum === 'tamam').length;
  const bekleyen = gruplar.find(g => g.durum === 'bekliyor');
  const gelecek = gruplar.find(g => g.durum === 'gelecek');
  const kalem = (g) => escapeHtml(g.kalemler.slice(0, 4).join(', ') + (g.kalemler.length > 4 ? ' …' : ''));
  const ad = (g) => escapeHtml(g.saat + ' · ' + (BUGUN_OGUN_AD[g.slot] || 'Öğün'));
  let h = '<div class="bo-head"><span>ÖĞÜN</span><span class="bo-say">' + tamam + '/' + gruplar.length + ' bugün</span></div>';
  if (_bugunForm) {
    h += bugunFormHtml();
  } else if (bekleyen) {
    h += '<div class="bo-ana">' + ad(bekleyen) + ' — yedin mi?</div><div class="bo-kalem">' + kalem(bekleyen) + '</div>' +
      '<div class="bo-btns"><button class="small" data-a="yedim" data-s="' + bekleyen.saat + '">Yedim</button>' +
      '<button class="small secondary" data-a="farkli" data-s="' + bekleyen.saat + '">Farklı yedim</button>' +
      '<button class="small secondary" data-a="atla" data-s="' + bekleyen.saat + '">Atladım</button></div>';
    if (gelecek) h += '<div class="bo-sonra">Sonra: ' + ad(gelecek) + '</div>';
  } else {
    h += gelecek
      ? '<div class="bo-ana">Sıradaki: ' + ad(gelecek) + '</div><div class="bo-kalem">' + kalem(gelecek) + '</div>'
      : '<div class="bo-ana">' + (tamam === gruplar.length ? 'Bugünün öğünleri tamam' : 'Bugünün öğün saatleri bitti') + '</div>';
    h += '<button class="bo-link" data-a="serbest">+ Bir şey yedim</button>';
  }
  el.className = 'bugun-ogun' + (bekleyen && !_bugunForm ? ' bekliyor' : '');
  el.innerHTML = h;
  el.style.display = '';
  if (_bugunForm) {
    const i = document.getElementById('boGirdi');
    if (i) {
      i.addEventListener('input', () => { clearTimeout(_bugunOnizTimer); _bugunOnizTimer = setTimeout(bugunOnizle, 250); });
      i.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); bugunFormKaydet(); } });
      if (_bugunForm.metin) bugunOnizle();
    }
  }
  if (!el._bagli) {
    el._bagli = true;
    // Değer onclick'e gömülmez (CLAUDE.md kuralı) — data-* + tek dinleyici
    el.addEventListener('click', ev => {
      const b = ev.target.closest('button[data-a]');
      if (!b) return;
      const s = b.dataset.s, a = b.dataset.a;
      if (a === 'farkli') return bugunFormAc(s);
      if (a === 'serbest') return bugunFormAc(null);
      if (a === 'vazgec') { _bugunForm = null; return renderBugunOgun(); }
      if (a === 'kaydet') return bugunFormKaydet();
      loadModule('ajan').then(() => { ogunBekciAksiyon(s, a); renderBugunOgun(); }).catch(() => {});
    });
  }
}

function bugunFormKaydet() {
  const i = document.getElementById('boGirdi');
  if (!i || !_bugunForm) return;
  const saat = _bugunForm.saat, metin = i.value;
  Promise.all([loadModule('foods'), loadModule('ajan')]).then(() => bugunKaydet(saat, metin)).catch(() => showToast('Bağlantı yok — tekrar dene', 'warning'));
}

/** Dakikada bir tazele (sayfa görünürken); saat ilerledikçe "bekliyor" kendiliğinden düşer. Form açıkken dokunmaz. */
function bugunBaslat() {
  renderBugunOgun();
  if (_bugunZamanlayici) return;
  _bugunZamanlayici = setInterval(() => { if (!document.hidden && !_bugunForm) renderBugunOgun(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !_bugunForm) renderBugunOgun(); });
}
