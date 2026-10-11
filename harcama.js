/**
 * harcama.js — Görevler > Harcamalar paneli (11 Eki 2026). TEMBEL modül.
 *
 * Salim: "aylık harcamaları yazabileyim — bugün şu kadar harcadım diye gireyim".
 * Veri: data.harcama = [{id, d:'YYYY-MM-DD', tl, not, kat}] (aidan_data blob'u —
 * yalnız PWA yazar, worker yazmaz → senkron çakışması yok, haftalık yedeğe girer).
 * AI YOK: tutar + kategori kodla ayrılır (sayıyı kod hesaplar, maliyet sıfır).
 * Panel <details> açılınca iner (asistan.html ontoggle) — ilk yükleme bütçesi dolu.
 *
 * ⚠️ Yeni modul = 7 yer: LAZY_MODULES · sw.js ASSETS · deploy INCLUDE ·
 *    Actions paths · .gitattributes · package.json check · tests/13-lazy + 07-hygiene.
 */
const HRC_MAX_TL = 100000;      // tek kalemde bundan büyüğü yazım hatasıdır
const HRC_MAX_ADET = 3000;      // ~2 yıl günlük kayıt; blob şişmesin
const HRC_KAT = [
  // Sıra önemli: ilk eşleşen kazanır ("protein bar" → Spor, yemekten önce bakılır).
  ['ulasim', 'Ulaşım', ['otobüs', 'otobus', 'metro', 'taksi', 'dolmuş', 'dolmus', 'bursakart', 'kart dolum', 'akbil', 'benzin', 'uber', 'martı', 'scooter', 'tren', 'bisiklet']],
  ['okul', 'Okul', ['kitap', 'defter', 'kalem', 'kırtasiye', 'kirtasiye', 'fotokopi', 'dershane', 'kurs', 'deneme', 'yayın', 'test kitab', 'okul']],
  ['spor', 'Spor', ['spor', 'salon', 'gym', 'protein', 'kreatin', 'eldiven', 'forma', 'antrenman', 'kick', 'boks', 'güreş']],
  ['giyim', 'Giyim', ['tişört', 'tisort', 'pantolon', 'ayakkabı', 'ayakkabi', 'mont', 'kıyafet', 'kiyafet', 'giyim', 'çorap', 'corap', 'şort', 'hoodie', 'ceket', 'parfüm', 'parfum']],
  ['eglence', 'Eğlence', ['sinema', 'oyun', 'steam', 'netflix', 'spotify', 'konser', 'abonelik', 'film', 'bowling', 'playstation', 'ps plus', 'discord', 'youtube', 'chess.com', 'satranç']],
  ['yemek', 'Yemek', ['yemek', 'kahve', 'çay', 'döner', 'doner', 'simit', 'market', 'kantin', 'öğle', 'kahvaltı', 'burger', 'pizza', 'tost', 'su ', 'içecek', 'cips', 'çikolata', 'restoran', 'lahmacun', 'pide', 'kebap', 'yemeksepeti', 'getir', 'atıştırma', 'kola', 'meyve', 'süt', 'tavuk', 'et ']],
];
const HRC_KAT_AD = HRC_KAT.reduce((o, k) => { o[k[0]] = k[1]; return o; }, { diger: 'Diğer' });
const HRC_AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const HRC_GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

let _hrcAy = null;      // gösterilen ay 'YYYY-MM' (null = bu ay)
let _hrcSayac = 0;      // aynı ms'de iki kayıt → id çakışmasın

(function hrcStyle() {
  if (document.getElementById('hrcStyle')) return;
  const st = document.createElement('style');
  st.id = 'hrcStyle';
  st.textContent = '.hrc-inner{padding:0 14px 14px;display:flex;flex-direction:column;gap:12px}' +
    '.hrc-add{display:flex;flex-direction:column;gap:6px}.hrc-row{display:flex;gap:6px}.hrc-row>*{min-width:0}' +
    '.hrc-row input[type=text]{flex:1}.hrc-row input[type=date]{flex:1}.hrc-row select{flex:1}.hrc-row button{flex:none;min-height:44px}' +
    '.hrc-nav{display:flex;align-items:center;gap:8px}.hrc-nav b{flex:1;text-align:center;font-size:15px}' +
    '.hrc-nav button{min-width:44px;min-height:44px}' +
    '.hrc-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}' +
    '.hrc-stat{border:1px solid var(--border-soft);border-radius:10px;padding:10px;background:var(--bg)}' +
    '.hrc-stat small{display:block;font-size:11.5px;color:var(--text-muted)}.hrc-stat b{font-size:16px;font-variant-numeric:tabular-nums}' +
    '.hrc-note{font-size:13px;color:var(--text-muted)}.hrc-note.uyari{color:var(--warning)}.hrc-note.asim{color:var(--danger)}' +
    '.hrc-bar{height:6px;border-radius:3px;background:var(--border-soft);overflow:hidden}.hrc-bar>i{display:block;height:100%;background:var(--accent)}' +
    '.hrc-bar.uyari>i{background:var(--warning)}.hrc-bar.asim>i{background:var(--danger)}' +
    '.hrc-kat{display:grid;grid-template-columns:72px 1fr auto;align-items:center;gap:8px;font-size:13px}' +
    '.hrc-kat span:last-child{font-variant-numeric:tabular-nums;color:var(--text-muted)}' +
    '.hrc-day{border-top:1px solid var(--border-soft);padding-top:8px}' +
    '.hrc-day-h{display:flex;justify-content:space-between;font-size:12.5px;color:var(--text-muted);margin-bottom:4px}' +
    '.hrc-item{display:flex;align-items:center;gap:8px;min-height:44px}.hrc-item span{flex:1;font-size:14px;min-width:0;overflow-wrap:anywhere}' +
    '.hrc-item small{color:var(--text-muted);font-size:11.5px;margin-left:6px}.hrc-item b{font-variant-numeric:tabular-nums}' +
    '.hrc-item button{min-width:36px;min-height:36px}' +
    '.hrc-limit{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--text-muted)}.hrc-limit input{width:110px}';
  document.head.appendChild(st);
})();

/* ---------- saf yardımcılar (test edilir) ---------- */

// "85", "85,50", "1.250", "1.250,75", "12.5" → sayı. Türk biçimi öncelikli.
function hrcSayi(s) {
  const m = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/.exec(String(s == null ? '' : s));
  if (!m) return null;
  let t = m[1];
  if (/\.\d{3}(?:,|$)/.test(t)) t = t.replace(/\./g, '');   // binlik nokta
  t = t.replace(',', '.');
  const n = Math.round(parseFloat(t) * 100) / 100;
  return (isFinite(n) && n > 0 && n <= HRC_MAX_TL) ? n : null;
}

// "85 öğle yemeği" → {tl:85, not:'öğle yemeği', dun:false}
function hrcAyristir(metin) {
  const ham = String(metin == null ? '' : metin).trim().slice(0, 140);
  const tl = hrcSayi(ham);
  if (tl == null) return null;
  const dun = /(^|\s)dün(\s|$)/i.test(ham);
  const not = ham
    .replace(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/, ' ')
    .replace(/₺|\b(tl|lira)\b/gi, ' ')
    .replace(/(^|\s)dün(?=\s|$)/i, ' ')
    .replace(/\s+/g, ' ').trim();
  return { tl, not: not.slice(0, 80), dun };
}

function hrcKategori(not) {
  const s = ' ' + String(not || '').toLocaleLowerCase('tr') + ' ';
  for (const [k, , kelimeler] of HRC_KAT) if (kelimeler.some(w => s.indexOf(w) >= 0)) return k;
  return 'diger';
}

function hrcAyKey(d) { return String(d).slice(0, 7); }
function hrcAyKaydir(ay, n) {
  let [y, m] = ay.split('-').map(Number);
  m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
  return y + '-' + String(m).padStart(2, '0');
}
function hrcAyGun(ay) { const [y, m] = ay.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function hrcTL(n) { return (Math.round(n * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺'; }

/**
 * Ay özeti — sayıyı kod hesaplar. bugun parametre (saate bağlı test yazma).
 * Kıyas ADİL: içinde bulunulan ayda geçen ayın AYNI gün aralığına bakılır.
 */
function hrcOzet(liste, ay, bugun) {
  const L = Array.isArray(liste) ? liste : [];
  const buAy = hrcAyKey(bugun) === ay;
  const gunSiniri = buAy ? Number(bugun.slice(8, 10)) : hrcAyGun(ay);
  const oncekiAy = hrcAyKaydir(ay, -1);
  let toplam = 0, onceki = 0;
  const kat = {};
  for (const h of L) {
    if (!h || !h.d || !(h.tl > 0)) continue;
    const a = hrcAyKey(h.d);
    if (a === ay) { toplam += h.tl; kat[h.kat || 'diger'] = (kat[h.kat || 'diger'] || 0) + h.tl; }
    else if (a === oncekiAy && Number(h.d.slice(8, 10)) <= gunSiniri) onceki += h.tl;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    toplam: r2(toplam), gun: gunSiniri, ortalama: r2(toplam / Math.max(1, gunSiniri)),
    onceki: r2(onceki), fark: r2(toplam - onceki),
    // Ay sonu tahmini yalnız bu ay ve en az 5 gün geçmişse (erken tahmin gürültü)
    tahmin: buAy && gunSiniri >= 5 ? Math.round(toplam / gunSiniri * hrcAyGun(ay)) : null,
    kat: Object.keys(kat).map(k => ({ k, tl: r2(kat[k]) })).sort((a, b) => b.tl - a.tl),
  };
}

/* ---------- ekran ---------- */

function hrcListe() {
  if (!Array.isArray(data.harcama)) data.harcama = [];
  return data.harcama;
}

function renderHarcama() {
  const el = document.getElementById('hrcInner');
  if (!el) return;
  const bugun = today();
  const ay = _hrcAy || hrcAyKey(bugun);
  const buAy = ay === hrcAyKey(bugun);
  const o = hrcOzet(hrcListe(), ay, bugun);
  const limit = Number((data.settings || {}).harcamaLimit) || 0;
  const [y, m] = ay.split('-').map(Number);
  let h = '';

  h += '<div class="hrc-add">' +
    '<div class="hrc-row"><input type="text" id="hrcText" maxlength="140" enterkeyhint="done" autocomplete="off" placeholder="Örn. 85 öğle yemeği" onkeydown="if(event.key===\'Enter\')hrcEkle()"></div>' +
    '<div class="hrc-row"><input type="date" id="hrcDate" aria-label="Tarih" value="' + bugun + '" max="' + bugun + '">' +
    '<select id="hrcKat" aria-label="Kategori"><option value="">Otomatik</option>' +
    Object.keys(HRC_KAT_AD).map(k => '<option value="' + k + '">' + escapeHtml(HRC_KAT_AD[k]) + '</option>').join('') +
    '</select><button class="small" onclick="hrcEkle()">Ekle</button></div></div>';

  h += '<div class="hrc-nav"><button class="small secondary" aria-label="Önceki ay" onclick="hrcAyGit(-1)">‹</button>' +
    '<b>' + HRC_AY[m - 1] + ' ' + y + '</b>' +
    '<button class="small secondary" aria-label="Sonraki ay" onclick="hrcAyGit(1)"' + (buAy ? ' disabled' : '') + '>›</button></div>';

  h += '<div class="hrc-sum">' +
    '<div class="hrc-stat"><small>' + (buAy ? 'Bu ay' : 'Toplam') + '</small><b>' + hrcTL(o.toplam) + '</b></div>' +
    '<div class="hrc-stat"><small>Günlük ort.</small><b>' + hrcTL(o.ortalama) + '</b></div>' +
    '<div class="hrc-stat"><small>' + (o.tahmin != null ? 'Ay sonu' : 'Geçen ay') + '</small><b>' + (o.tahmin != null ? '~' + hrcTL(o.tahmin) : hrcTL(o.onceki)) + '</b></div></div>';

  if (o.onceki > 0) {
    const yon = o.fark > 0 ? 'fazla' : 'az';
    h += '<div class="hrc-note">' + (buAy ? 'Geçen ayın ilk ' + o.gun + ' gününe göre ' : 'Geçen aya göre ') +
      (o.fark === 0 ? 'aynı' : hrcTL(Math.abs(o.fark)) + ' ' + yon) + '.</div>';
  }

  if (limit > 0) {
    const oran = o.toplam / limit;
    const cls = oran >= 1 ? 'asim' : oran >= 0.8 ? 'uyari' : '';
    h += '<div class="hrc-bar ' + cls + '"><i style="width:' + Math.min(100, Math.round(oran * 100)) + '%"></i></div>' +
      '<div class="hrc-note ' + cls + '">' + (oran >= 1
        ? 'Limit ' + hrcTL(o.toplam - limit) + ' aşıldı.'
        : 'Limitin %' + Math.round(oran * 100) + '\'i kullanıldı · kalan ' + hrcTL(limit - o.toplam) +
          (buAy && o.tahmin != null && o.tahmin > limit ? ' · bu hızla ay sonunda limiti aşarsın' : '')) + '</div>';
  }

  if (o.kat.length) {
    h += '<div>' + o.kat.map(k => '<div class="hrc-kat"><span>' + escapeHtml(HRC_KAT_AD[k.k] || k.k) + '</span>' +
      '<div class="hrc-bar"><i style="width:' + Math.round(k.tl / o.toplam * 100) + '%"></i></div>' +
      '<span>' + hrcTL(k.tl) + '</span></div>').join('') + '</div>';
  }

  const ayKayit = hrcListe().filter(x => x && x.d && hrcAyKey(x.d) === ay)
    .sort((a, b) => (a.d === b.d ? b.id - a.id : (a.d < b.d ? 1 : -1)));
  if (!ayKayit.length) {
    h += '<div class="settings-help">' + (buAy ? 'Bu ay henüz harcama yok. Yukarıya "85 öğle yemeği" gibi yaz, Ekle\'ye bas.' : 'Bu ayda kayıt yok.') + '</div>';
  } else {
    const gunler = {};
    ayKayit.forEach(x => { (gunler[x.d] = gunler[x.d] || []).push(x); });
    Object.keys(gunler).forEach(d => {
      const g = gunler[d];
      const top = g.reduce((s, x) => s + x.tl, 0);
      const dt = new Date(d + 'T12:00:00');
      const ad = d === bugun ? 'Bugün' : d === shiftDateStr(bugun, -1) ? 'Dün' : dt.getDate() + ' ' + HRC_AY[dt.getMonth()].slice(0, 3) + ' ' + HRC_GUN[dt.getDay()];
      h += '<div class="hrc-day"><div class="hrc-day-h"><span>' + escapeHtml(ad) + '</span><span>' + hrcTL(top) + '</span></div>';
      g.forEach(x => {
        h += '<div class="hrc-item"><span>' + escapeHtml(x.not || HRC_KAT_AD[x.kat] || 'Harcama') +
          '<small>' + escapeHtml(HRC_KAT_AD[x.kat] || 'Diğer') + '</small></span><b>' + hrcTL(x.tl) + '</b>' +
          '<button class="small secondary" aria-label="Sil" data-id="' + escapeHtml(String(x.id)) + '" onclick="hrcSil(this.dataset.id)">✕</button></div>';
      });
      h += '</div>';
    });
  }

  h += '<label class="hrc-limit">Aylık limit (isteğe bağlı) <input type="text" inputmode="decimal" id="hrcLimit" placeholder="örn. 3000" value="' +
    (limit ? escapeHtml(String(limit)) : '') + '" onchange="hrcLimitKaydet(this.value)"> ₺</label>';

  el.innerHTML = h;
  const badge = document.getElementById('hrcBadge');
  if (badge) badge.textContent = o.toplam > 0 && buAy ? hrcTL(o.toplam) : '';
}

function hrcEkle() {
  const inp = document.getElementById('hrcText');
  const r = hrcAyristir(inp && inp.value);
  if (!r) { showToast('Tutarı yaz — örn. "85 öğle yemeği"', 'warning', 3000); return; }
  const dEl = document.getElementById('hrcDate');
  const bugun = today();
  let d = (dEl && /^\d{4}-\d{2}-\d{2}$/.test(dEl.value)) ? dEl.value : bugun;
  if (d > bugun) d = bugun;
  if (r.dun && d === bugun) d = shiftDateStr(bugun, -1);
  const kEl = document.getElementById('hrcKat');
  const kat = (kEl && kEl.value && HRC_KAT_AD[kEl.value]) ? kEl.value : hrcKategori(r.not);
  const L = hrcListe();
  L.push({ id: Date.now() * 10 + (_hrcSayac++ % 10), d, tl: r.tl, not: r.not, kat });
  if (L.length > HRC_MAX_ADET) { L.sort((a, b) => (a.d < b.d ? -1 : 1)); L.splice(0, L.length - HRC_MAX_ADET); }
  save();
  _hrcAy = hrcAyKey(d) === hrcAyKey(bugun) ? null : hrcAyKey(d);
  renderHarcama();
  const yeni = document.getElementById('hrcText');
  if (yeni) yeni.focus();
  showToast(hrcTL(r.tl) + ' · ' + (HRC_KAT_AD[kat] || 'Diğer') + ' eklendi', 'success', 2000);
}

function hrcSil(id) {
  const L = hrcListe();
  const i = L.findIndex(x => String(x.id) === String(id));
  if (i < 0) return;
  if (!confirm('"' + (L[i].not || 'Harcama') + ' — ' + hrcTL(L[i].tl) + '" silinsin mi?')) return;
  L.splice(i, 1);
  save();
  renderHarcama();
}

function hrcAyGit(n) {
  const bu = hrcAyKey(today());
  const yeni = hrcAyKaydir(_hrcAy || bu, n);
  _hrcAy = yeni >= bu ? null : yeni;
  renderHarcama();
}

function hrcLimitKaydet(v) {
  const n = String(v || '').trim() === '' ? 0 : hrcSayi(v);
  if (n == null) { showToast('Limit sayı olmalı — örn. 3000', 'warning'); return; }
  data.settings = data.settings || {};
  data.settings.harcamaLimit = n;
  save();
  renderHarcama();
}
