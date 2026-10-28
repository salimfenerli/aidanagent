/**
<<<<<<< HEAD
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
=======
 * bugun.js — Görevler sekmesinin TEPESİ: tek "Bugün" kartı (13 Eki 2026, Faz 2). TEMBEL modül.
 *
 * Değerlendirme (11 Eki): Görevler sekmesi 3,2 ekran / 105 düğmeydi; "Şu an ne yapayım?"
 * ikinci ekrandaydı, sohbet (tek giriş kapısı) yalnız hamburger menüdeydi. ADHD için ilk
 * ekran TEK soruya cevap vermeli: "şimdi ne var, sırada ne var?".
 *
 * Kart: ŞU AN / SIRADA (Haftam çekirdeği hfGun + gün planı blokları — kendi takvim
 * hesabı YOK) · bugün: ödev, antrenman, öğün, harcama, uyku · "Aidan'a yaz / Günü kapat"
 * (sohbet = tek giriş kapısı) + "Şu an ne yapayım?".
 * Eski kalabalık SİLİNMEZ: saat kartı, 6'lı kutular, istatistik, doluluk, akşam özeti
 * en alttaki "Ayrıntılar"a TAŞINIR (id'ler aynı → mevcut çizim kodu çalışmaya devam eder).
 *
 * ⚠️ Yeni modul = 7 yer: LAZY_MODULES · sw.js ASSETS · deploy INCLUDE · Actions paths ·
 *    .gitattributes · package.json check · tests/07-hygiene + 13-lazy.
 */
const BUGUN_AKSAM_DK = 18 * 60;   // bu saatten sonra ana düğme "Günü kapat"

(function bugunStyle() {
  if (document.getElementById('bugunStyle')) return;
  const st = document.createElement('style');
  st.id = 'bugunStyle';
  st.textContent = '.bg-kart{border:1px solid var(--border-soft);border-radius:var(--radius);background:var(--bg-elev);padding:16px;margin-bottom:12px;display:flex;flex-direction:column;gap:12px}' +
    '.bg-ust{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:var(--text-muted)}.bg-ust b{font-size:15px;color:var(--text)}' +
    '.bg-simdi{display:grid;grid-template-columns:64px 1fr;gap:6px 10px;align-items:baseline}' +
    '.bg-etiket{font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--text-faint)}' +
    '.bg-simdi-ad{font-size:18px;font-weight:600;color:var(--text);line-height:1.3}.bg-simdi-ad small{display:block;font-size:13px;font-weight:400;color:var(--text-muted)}' +
    '.bg-sira{font-size:15px;color:var(--text)}.bg-sira small{color:var(--text-muted);margin-left:6px}' +
    '.bg-satirlar{display:flex;flex-direction:column;border-top:1px solid var(--border-soft);padding-top:8px}' +
    '.bg-satir{display:flex;justify-content:space-between;gap:10px;min-height:32px;align-items:center;font-size:14px}' +
    '.bg-satir span:first-child{color:var(--text-muted)}.bg-satir span:last-child{color:var(--text);text-align:right;font-variant-numeric:tabular-nums}' +
    '.bg-satir.uyari span:last-child{color:var(--warning)}' +
    '.bg-dugmeler{display:flex;gap:8px}.bg-dugmeler button{flex:1;min-height:48px;font-size:15px}' +
    '#bugunAyrinti{margin-top:16px}#bugunAyrinti>summary{cursor:pointer;color:var(--text-muted);font-size:14px;padding:10px 0;min-height:44px}';
  document.head.appendChild(st);
})();

/* ---------- saf hesap (test edilir) ---------- */

function bgHM(dk) { const v = ((Math.round(dk) % 1440) + 1440) % 1440; return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); }
function bgDk(hm) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; }

/**
 * Günün özeti. gunFn = hfGun (Haftam çekirdeği); yoksa yalnız gün planı blokları kullanılır.
 * simdiDk parametre (saate bağlı test yazma kuralı).
 */
function bugunOzet(d, tarih, simdiDk, gunFn, yarinTarih) {
  d = d || {};
  const g = typeof gunFn === 'function' ? gunFn(d, tarih) : null;
  // Bloklar: Haftam (okul/kurs/sabit/antrenman/sınav) + bugünün gün planı blokları (görev zamanları)
  const bloklar = [];
  if (g) g.bloklar.forEach(b => bloklar.push({ ad: b.label, bas: b.bas, bit: b.bit, tur: b.tur }));
  const plan = d.dayPlan && d.dayPlan.date === tarih ? (d.dayPlan.blocks || []) : [];
  plan.forEach(b => {
    const bas = bgDk(b.start), bit = bgDk(b.end);
    if (bas == null || bit == null || bit <= bas) return;
    // Haftam'la aynı saatte çakışan plan bloğu tekrar yazılmaz (okul iki kez görünmesin)
    if (bloklar.some(x => x.bas === bas && x.bit === bit)) return;
    bloklar.push({ ad: String(b.title || b.text || b.label || 'Plan').slice(0, 60), bas, bit, tur: 'plan', done: !!b.done });
  });
  bloklar.sort((a, b) => a.bas - b.bas || a.bit - b.bit);
  const yatis = g && g.yatis != null ? g.yatis : null;

  let simdi = bloklar.find(b => b.bas <= simdiDk && simdiDk < b.bit && !b.done) || null;
  let sirada = bloklar.find(b => b.bas > simdiDk && !b.done) || null;
  let siradaYarin = false;
  if (!sirada && yatis != null && yatis > simdiDk) sirada = { ad: 'Uyku', bas: yatis, tur: 'uyku' };
  if (!sirada && typeof gunFn === 'function' && yarinTarih) {
    const y = gunFn(d, yarinTarih);
    const ilk = (y.bloklar || []).slice().sort((a, b) => a.bas - b.bas)[0];
    if (ilk) { sirada = { ad: ilk.label, bas: ilk.bas, tur: ilk.tur }; siradaYarin = true; }
  }
  const uykuSaati = !simdi && yatis != null && (simdiDk >= yatis || (g && g.kalk != null && simdiDk < g.kalk));

  // Ödev: bugün teslim + gecikmiş, bitmemiş
  const acik = (d.tasks || []).filter(t => t && !t.done && t.due && t.due <= tarih);
  const odev = { n: acik.length, dk: acik.reduce((s, t) => s + (Number(t.estimateMin) || 30), 0), gecikmis: acik.filter(t => t.due < tarih).length };
  // Öğün
  const gun = (d.diet && d.diet.days && d.diet.days[tarih]) || { meals: [] };
  const kcal = (gun.meals || []).reduce((s, m) => s + (m && m.kcal > 0 ? m.kcal : 0), 0);
  const kcalHedef = (d.diet && d.diet.kcalGoal) || null;
  // Harcama
  const harcama = (Array.isArray(d.harcama) ? d.harcama : []).filter(h => h && h.d === tarih && h.tl > 0).reduce((s, h) => s + h.tl, 0);
  // Uyku (dün gece = uyanılan gün bugün)
  const uykuK = (Array.isArray(d.sleep) ? d.sleep : []).find(s => s && s.date === tarih && s.hours > 0);
  // Antrenman (program günü, Haftam'dan)
  const ant = g && g.antrenman ? { ad: g.antrenman.ad, bas: g.antrenman.bas, agir: !!g.antrenman.agir } : null;
  return {
    simdi, sirada, siradaYarin, uykuSaati, odev, kcal, kcalHedef,
    harcama: Math.round(harcama * 100) / 100, uyku: uykuK ? uykuK.hours : null, antrenman: ant,
    sinav: g ? (g.sinav || []) : [],
    // 25 Eki: hareket molası (worker data.hareket'i günün başında kurar)
    hareket: (d.hareket && d.hareket.tarih === tarih && d.hareket.n) ? {
      n: d.hareket.n,
      set: Object.keys(d.hareket.yap || {}).length,
    } : null,
  };
}

/* ---------- ekran ---------- */

function bgSaat(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
function bgSimdiDk() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

function renderBugun() {
  const el = document.getElementById('bugunKart');
  if (!el) return;
  if (typeof hfGun !== 'function') { loadModule('hafta').then(renderBugun).catch(() => {}); }
  bugunDuzenle();
  const t = today(), dk = bgSimdiDk();
  const o = bugunOzet(data, t, dk, typeof hfGun === 'function' ? hfGun : null, shiftDateStr(t, 1));
  const gunAd = new Date(t + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  // Saat üst başlıkta zaten var (app-header) — kartta tekrar YOK
  let h = '<div class="bg-ust"><b>' + escapeHtml(gunAd) + '</b></div>';

  // ŞU AN / SIRADA
  h += '<div class="bg-simdi"><span class="bg-etiket">ŞU AN</span><div class="bg-simdi-ad">';
  if (o.simdi) h += escapeHtml(o.simdi.ad) + '<small>' + bgHM(o.simdi.bit) + '\'e kadar · ' + Math.max(0, o.simdi.bit - dk) + ' dk kaldı</small>';
  else if (o.uykuSaati) h += 'Uyku saati<small>Ekranı bırak — yarın için en iyi iş bu</small>';
  else h += 'Serbest zaman' + (o.odev.n ? '<small>' + o.odev.n + ' ödev bekliyor — birini şimdi bitir</small>' : '<small>Planda bir şey yok</small>');
  h += '</div>';
  if (o.sirada) {
    h += '<span class="bg-etiket">SIRADA</span><div class="bg-sira">' + escapeHtml(o.sirada.ad) + '<small>' + (o.siradaYarin ? 'yarın ' : '') + bgHM(o.sirada.bas) +
      (!o.siradaYarin && o.sirada.bas > dk ? ' · ' + bugunSure(o.sirada.bas - dk) + ' sonra' : '') + '</small></div>';
  }
  h += '</div>';

  // Bugün satırları — yalnız anlamlı olanlar
  const satir = (ad, deger, uyari) => '<div class="bg-satir' + (uyari ? ' uyari' : '') + '"><span>' + ad + '</span><span>' + deger + '</span></div>';
  let s = '';
  if (o.sinav.length) s += satir('Sınav', escapeHtml(o.sinav.join(', ')), true);
  s += satir('Ödev', o.odev.n ? o.odev.n + ' iş · ~' + o.odev.dk + ' dk' + (o.odev.gecikmis ? ' · ' + o.odev.gecikmis + ' gecikmiş' : '') : 'bugün teslim yok', o.odev.gecikmis > 0);
  if (o.antrenman) s += satir('Antrenman', escapeHtml(o.antrenman.ad) + ' · ' + bgHM(o.antrenman.bas));
  s += satir('Öğün', o.kcal ? o.kcal + (o.kcalHedef ? ' / ' + o.kcalHedef : '') + ' kcal' : 'kayıt yok');
  if (o.harcama) s += satir('Harcama', (typeof ajanTL === 'function' ? ajanTL(o.harcama) : o.harcama + ' ₺'));
  if (o.hareket) s += satir('Hareket', o.hareket.set + '/' + o.hareket.n + ' mola');
  s += satir('Uyku', o.uyku ? bgSaat(o.uyku) + ' saat' : 'girilmedi');
  h += '<div class="bg-satirlar">' + s + '</div>';

  // Düğmeler: sohbet = tek giriş kapısı (artık menüde saklı değil)
  const aksam = dk >= BUGUN_AKSAM_DK;
  h += '<div class="bg-dugmeler">' +
    '<button onclick="bugunSohbet()">' + (aksam ? 'Günü kapat' : 'Aidan\'a yaz') + '</button>' +
    '<button class="secondary" onclick="suggestTask()">Şu an ne yapayım?</button></div>';
  el.className = 'bg-kart';
  el.innerHTML = h;
}

/** Sohbeti açar; akşam "günü kapat" kalıbını ipucu olarak gösterir (yazı dayatmaz). */
function bugunSohbet() {
  if (typeof navTo === 'function') navTo('chat'); else showTab('chat', document.querySelector('[data-tab=chat]'));
  const inp = document.getElementById('chatInput');
  if (!inp) return;
  inp.placeholder = bgSimdiDk() >= BUGUN_AKSAM_DK
    ? 'Bugün ne oldu? Örn: matematiği bitirdim, 85 yemek, 40 otobüs, akşam tavuk pilav'
    : 'Ne oldu / ne lazım? Örn: 40 otobüs, öğlen mercimek, fiziği bitirdim';
  setTimeout(() => { try { inp.focus(); } catch (_) {} }, 80);
}

/**
 * Bir kerelik yerleşim: Bugün kartı + Bugünün 3'ü en üstte; eski kalabalık en alttaki
 * "Ayrıntılar"a taşınır (silinmez, id'ler korunur).
 */
const BUGUN_TASI = ['nowCard', 'dailyScore', 'aidanNote', 'sleepCard', 'weeklyInsight', 'capacityBar', 'eveningSummary'];
function bugunDuzenle() {
  const tasks = document.getElementById('tasks');
  const kart = document.getElementById('bugunKart');
  if (!tasks || !kart || document.getElementById('bugunAyrinti')) return;
  // Bugünün 3'ü kartın hemen altına (öğün kartı varsa onun altına — ogun.js, 19 Eki)
  const mit = tasks.querySelector('.mit-box');
  if (mit) (document.getElementById('bugunOgun') || kart).after(mit);
  const det = document.createElement('details');
  det.id = 'bugunAyrinti';
  det.innerHTML = '<summary>Ayrıntılar — günün ritmi, istatistikler, akşam özeti</summary>';
  const tasinacak = BUGUN_TASI.map(id => document.getElementById(id)).filter(Boolean);
  // Başlık + Toplam/Bitti/Kaldı kutuları + eski "Şu an ne yapayım?" satırı (düğme artık kartta)
  const h2 = [...tasks.children].find(c => c.tagName === 'H2');
  const stats = tasks.querySelector(':scope > .stats');
  const aksiyon = tasks.querySelector(':scope > .action-row');
  [h2, stats, aksiyon].forEach(x => { if (x) tasinacak.push(x); });
  tasinacak.forEach(x => det.appendChild(x));
  tasks.appendChild(det);
}

// Görev listesi her çizildiğinde kart da güncel kalsın (renderTasks ui.js'te — sarmalanır, değiştirilmez)
(function bugunBagla() {
  if (typeof renderTasks === 'function' && !renderTasks.__bugun) {
    const eski = renderTasks;
    const yeni = function () { const r = eski.apply(this, arguments); try { renderBugun(); } catch (_) {} return r; };
    yeni.__bugun = true;
    renderTasks = yeni;   // eslint-disable-line no-global-assign
  }
  // ŞU AN / SIRADA dakika dakika ilerlesin (yalnız sekme açıkken)
  setInterval(() => { const p = document.getElementById('tasks'); if (p && p.classList.contains('active') && !document.hidden) renderBugun(); }, 60000);
})();

// 25 Eki 2026 — GÖREV KARTI: telefonda 7 eylem ikonu gizli (styles.css "DÜZEN"); karta
// dokununca açılır, başka karta dokununca öncekisi kapanır. Düğme/onay kutusu/rozet
// dokunuşları karışmaz. Kaydırma (tamamla/sil) ayrı, dokunuş sayılmaz.
if (!window._gorevKartDokun) {
  window._gorevKartDokun = true;
  document.addEventListener('click', (ev) => {
    const kart = ev.target.closest && ev.target.closest('.task');
    if (!kart || ev.target.closest('button, input, a, label, .badge, .subtask, .postpone-nudge')) return;
    const acik = kart.classList.contains('acik');
    document.querySelectorAll('.task.acik').forEach(k => k.classList.remove('acik'));
    if (!acik) kart.classList.add('acik');
  });
}

/** 25 Eki: "362 dk sonra" → "6 sa 2 dk sonra" (dakika sayısı okunmuyordu). */
function bugunSure(m) { const h = Math.floor(m / 60), d = m % 60; return h ? h + ' sa' + (d ? ' ' + d + ' dk' : '') : d + ' dk'; }
>>>>>>> 3e2e26f6345638f0806ef09ac9bd0f1b252c5648
