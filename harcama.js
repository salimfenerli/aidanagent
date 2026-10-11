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
const HRC_KAT_SIRA = ['yemek', 'ulasim', 'okul', 'spor', 'giyim', 'eglence', 'diger'];   // çip sırası: en sık önce
const HRC_AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const HRC_GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

let _hrcAy = null;      // gösterilen ay 'YYYY-MM' (null = bu ay)
let _hrcSayac = 0;      // aynı ms'de iki kayıt → id çakışmasın
let _hrcGun = null;     // giriş günü 'YYYY-MM-DD' (null = bugün)
let _hrcSecKat = '';    // elle seçilen kategori ('' = otomatik)
let _hrcDuzen = null;   // düzenlenen kaydın id'si
let _hrcTaslak = '';    // kutudaki yazı — çip dokunuşunda kaybolmasın
let _hrcSikList = [];   // ekrandaki sık kullanılanlar (indeksle çağrılır)

(function hrcStyle() {
  if (document.getElementById('hrcStyle')) return;
  const st = document.createElement('style');
  st.id = 'hrcStyle';
  st.textContent = '.hrc-inner{padding:0 14px 14px;display:flex;flex-direction:column;gap:12px}' +
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
    '.hrc-limit{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--text-muted)}.hrc-limit input{width:110px}' +
    '.hrc-giris{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--border-soft);border-radius:12px;background:var(--bg)}' +
    '.hrc-giris.duzen{border-color:var(--accent)}.hrc-giris-h{font-size:12.5px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center}' +
    '.hrc-in{width:100%;font-size:17px;min-height:48px}' +
    '.hrc-prev{display:flex;flex-direction:column;gap:2px;font-size:13px;color:var(--text-muted)}.hrc-prev:empty{display:none}' +
    '.hrc-pv b{color:var(--text);font-variant-numeric:tabular-nums}.hrc-pv.bad{color:var(--warning)}' +
    '.hrc-chips{display:flex;gap:6px;flex-wrap:wrap}' +
    '.hrc-chip{min-height:44px;padding:0 14px;border-radius:22px;border:1px solid var(--border-soft);background:var(--bg-elev);color:var(--text-muted);font-size:14px;font-weight:500;cursor:pointer}' +
    '.hrc-chip[aria-pressed=true]{background:var(--accent-soft);color:var(--text);border-color:var(--accent)}' +
    'input.hrc-chip{padding:0 10px;max-width:150px}input.hrc-chip[aria-pressed=false]{color:var(--text-faint)}' +
    '.hrc-sik .hrc-chip{color:var(--text)}.hrc-sik .hrc-chip b{font-variant-numeric:tabular-nums;margin-right:4px}' +
    '.hrc-lbl{font-size:11.5px;color:var(--text-faint);margin-bottom:-2px}' +
    '.hrc-save{width:100%;min-height:48px;font-size:15px}.hrc-save-row{display:flex;gap:6px}.hrc-save-row .hrc-save{flex:1}' +
    '.hrc-item-t{flex:1;min-width:0;min-height:44px;display:flex;align-items:center;flex-wrap:wrap;gap:0 6px;text-align:left;background:none;border:0;padding:0;color:var(--text);font:inherit;font-size:14px;cursor:pointer}' +
    '.hrc-item-t small{margin-left:0}';
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

// "85 yemek, 40 otobüs" → iki parça. Rakamlar ARASINDAKİ virgül ondalıktır
// (85,50 · 1.250,75); "yemek,40" ya da "85, 40" ayırıcıdır. ; + yeni satır ve
// "… ve 40 …" de ayırır.
function hrcBol(metin) {
  const s = String(metin == null ? '' : metin).slice(0, 600);
  const parca = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const ayir = c === '\n' || c === ';' || c === '+' ||
      (c === ',' && !(/\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || '')));
    if (ayir) { parca.push(cur); cur = ''; } else cur += c;
  }
  parca.push(cur);
  const out = [];
  parca.forEach(p => p.split(/\s+ve\s+(?=\d)/i).forEach(x => { x = x.trim(); if (x) out.push(x); }));
  return out.slice(0, 20);
}

// Son 60 günde en az 2 kez girilen (aynı not + aynı tutar) kalemler — tek dokunuş.
function hrcSik(liste, bugun, n) {
  const t = new Date(bugun + 'T12:00:00');
  t.setDate(t.getDate() - 60);
  const sinir = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  const g = {};
  for (const h of (Array.isArray(liste) ? liste : [])) {
    if (!h || !h.not || !(h.tl > 0) || !h.d || h.d < sinir) continue;
    const k = String(h.not).toLocaleLowerCase('tr').trim() + '|' + h.tl;
    if (!g[k]) g[k] = { tl: h.tl, not: h.not, kat: h.kat || 'diger', adet: 0, son: '' };
    g[k].adet++;
    if (h.d > g[k].son) g[k].son = h.d;
  }
  return Object.keys(g).map(k => g[k]).filter(x => x.adet >= 2)
    .sort((a, b) => (b.adet - a.adet) || (a.son < b.son ? 1 : a.son > b.son ? -1 : 0))
    .slice(0, n || 4).map(x => ({ tl: x.tl, not: x.not, kat: x.kat, adet: x.adet }));
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

  h += '<div class="hrc-giris" id="hrcGiris"></div>';

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
    h += '<div class="settings-help">' + (buAy ? 'Bu ay henüz harcama yok. Yukarıya "85 öğle yemeği" gibi yaz, Kaydet\'e bas. Birden çok harcamayı virgülle ayır: "85 yemek, 40 otobüs".' : 'Bu ayda kayıt yok.') + '</div>';
  } else {
    const gunler = {};
    ayKayit.forEach(x => { (gunler[x.d] = gunler[x.d] || []).push(x); });
    Object.keys(gunler).forEach(d => {
      const g = gunler[d];
      const top = g.reduce((s, x) => s + x.tl, 0);
      const dt = new Date(d + 'T12:00:00');
      const ad = hrcGunAd(d, bugun);
      h += '<div class="hrc-day"><div class="hrc-day-h"><span>' + escapeHtml(ad) + '</span><span>' + hrcTL(top) + '</span></div>';
      g.forEach(x => {
        const xid = escapeHtml(String(x.id));
        h += '<div class="hrc-item"><button type="button" class="hrc-item-t" aria-label="Düzenle" data-id="' + xid + '" onclick="hrcDuzenle(this.dataset.id)">' +
          escapeHtml(x.not || HRC_KAT_AD[x.kat] || 'Harcama') +
          '<small>' + escapeHtml(HRC_KAT_AD[x.kat] || 'Diğer') + '</small></button><b>' + hrcTL(x.tl) + '</b>' +
          '<button class="small secondary" aria-label="Sil" data-id="' + escapeHtml(String(x.id)) + '" onclick="hrcSil(this.dataset.id)">✕</button></div>';
      });
      h += '</div>';
    });
  }

  h += '<label class="hrc-limit">Aylık limit (isteğe bağlı) <input type="text" inputmode="decimal" id="hrcLimit" placeholder="örn. 3000" value="' +
    (limit ? escapeHtml(String(limit)) : '') + '" onchange="hrcLimitKaydet(this.value)"> ₺</label>';

  el.innerHTML = h;
  hrcGirisCiz();
  const badge = document.getElementById('hrcBadge');
  if (badge) badge.textContent = o.toplam > 0 && buAy ? hrcTL(o.toplam) : '';
}

function hrcGunAd(d, bugun) {
  if (d === bugun) return 'Bugün';
  if (d === shiftDateStr(bugun, -1)) return 'Dün';
  const dt = new Date(d + 'T12:00:00');
  return dt.getDate() + ' ' + HRC_AY[dt.getMonth()].slice(0, 3) + ' ' + HRC_GUN[dt.getDay()];
}
function hrcSeciliGun() {
  const b = today();
  const g = /^\d{4}-\d{2}-\d{2}$/.test(_hrcGun || '') ? _hrcGun : b;
  return g > b ? b : g;   // gelecek tarihe harcama yazılmaz
}
function hrcTutarMetin(tl) { return String(tl).replace('.', ','); }

/** Giriş kutusu: yazı + canlı önizleme + gün/kategori çipleri + Kaydet + sık kullanılanlar. */
function hrcGirisCiz() {
  const el = document.getElementById('hrcGiris');
  if (!el) return;
  const bugun = today(), dun = shiftDateStr(bugun, -1), g = hrcSeciliGun();
  const duz = _hrcDuzen != null ? hrcListe().find(x => String(x.id) === String(_hrcDuzen)) : null;
  if (_hrcDuzen != null && !duz) _hrcDuzen = null;
  el.classList.toggle('duzen', !!duz);
  const gunKayit = hrcListe().filter(x => x && x.d === g);
  const gunTop = gunKayit.reduce((t, x) => t + x.tl, 0);
  const basildi = (v) => ' aria-pressed="' + (v ? 'true' : 'false') + '"';
  let h = '<div class="hrc-giris-h"><span>' + (duz ? 'Düzenleniyor' : escapeHtml(hrcGunAd(g, bugun)) + ' toplam: <b>' + hrcTL(gunTop) + '</b>' +
    (gunKayit.length ? ' · ' + gunKayit.length + ' kalem' : '')) + '</span></div>';
  h += '<input type="text" class="hrc-in" id="hrcText" maxlength="600" enterkeyhint="done" autocomplete="off" autocapitalize="off"' +
    ' placeholder="' + (duz ? 'Tutar ve not' : '85 öğle yemeği, 40 otobüs') + '" value="' + escapeHtml(_hrcTaslak) + '"' +
    ' oninput="_hrcTaslak=this.value;hrcOnizle()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();hrcEkle()}">';
  h += '<div class="hrc-prev" id="hrcPrev" aria-live="polite"></div>';
  h += '<div class="hrc-lbl">Gün</div><div class="hrc-chips">' +
    '<button type="button" class="hrc-chip"' + basildi(g === bugun) + ' onclick="hrcGunSec(\'bugun\')">Bugün</button>' +
    '<button type="button" class="hrc-chip"' + basildi(g === dun) + ' onclick="hrcGunSec(\'dun\')">Dün</button>' +
    '<input type="date" class="hrc-chip" id="hrcDate" aria-label="Başka gün" max="' + bugun + '" value="' + g + '"' +
    basildi(g !== bugun && g !== dun) + ' onchange="hrcGunSec(this.value)"></div>';
  h += '<div class="hrc-lbl">Kategori</div><div class="hrc-chips">' +
    '<button type="button" class="hrc-chip"' + basildi(!_hrcSecKat) + ' onclick="hrcKatSec(\'\')">Otomatik</button>' +
    HRC_KAT_SIRA.map(k => '<button type="button" class="hrc-chip" data-k="' + k + '"' + basildi(_hrcSecKat === k) +
      ' onclick="hrcKatSec(this.dataset.k)">' + escapeHtml(HRC_KAT_AD[k]) + '</button>').join('') + '</div>';
  h += '<div class="hrc-save-row"><button type="button" class="hrc-save" id="hrcKaydet" onclick="hrcEkle()">Kaydet</button>' +
    (duz ? '<button type="button" class="hrc-save secondary" onclick="hrcVazgec()">Vazgeç</button>' : '') + '</div>';
  _hrcSikList = duz ? [] : hrcSik(hrcListe(), bugun, 4);
  if (_hrcSikList.length) {
    h += '<div class="hrc-lbl">Sık kullanılanlar — dokun, ' + escapeHtml(hrcGunAd(g, bugun).toLocaleLowerCase('tr')) + ' eklensin</div><div class="hrc-chips hrc-sik">' +
      _hrcSikList.map((x, i) => '<button type="button" class="hrc-chip" data-i="' + i + '" onclick="hrcSikEkle(+this.dataset.i)"><b>' +
        hrcTL(x.tl) + '</b>' + escapeHtml(x.not) + '</button>').join('') + '</div>';
  }
  el.innerHTML = h;
  hrcOnizle();
}

/** Yazdıkça ne kaydedileceğini gösterir — kaydetmeden önce hata görünür. */
function hrcParcalar() {
  const ok = [], bad = [];
  hrcBol(_hrcTaslak).forEach(p => { const r = hrcAyristir(p); if (r) ok.push(r); else bad.push(p); });
  return { ok, bad };
}
function hrcOnizle() {
  const pv = document.getElementById('hrcPrev');
  const btn = document.getElementById('hrcKaydet');
  const { ok, bad } = hrcParcalar();
  const g = hrcSeciliGun(), bugun = today();
  if (pv) {
    pv.innerHTML = ok.map(r => '<div class="hrc-pv"><b>' + hrcTL(r.tl) + '</b> · ' +
      escapeHtml(HRC_KAT_AD[_hrcSecKat || hrcKategori(r.not)] || 'Diğer') + (r.not ? ' — ' + escapeHtml(r.not) : '') +
      (r.dun && g === bugun ? ' · dün' : '') + '</div>').join('') +
      bad.map(p => '<div class="hrc-pv bad">"' + escapeHtml(p.slice(0, 40)) + '" — tutar yok</div>').join('');
  }
  if (btn) {
    const top = ok.reduce((t, r) => t + r.tl, 0);
    btn.disabled = !ok.length || (_hrcDuzen != null && ok.length !== 1);
    btn.textContent = _hrcDuzen != null ? (ok.length > 1 ? 'Düzenlerken tek harcama' : 'Güncelle')
      : ok.length > 1 ? ok.length + ' harcama kaydet · ' + hrcTL(top)
      : ok.length ? 'Kaydet · ' + hrcTL(top) : 'Kaydet';
  }
}

function hrcGunSec(v) {
  const b = today();
  _hrcGun = v === 'bugun' ? null : v === 'dun' ? shiftDateStr(b, -1) : (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
  hrcGirisCiz();
}
function hrcKatSec(k) {
  _hrcSecKat = (k && HRC_KAT_AD[k]) ? k : '';
  hrcGirisCiz();
}
function hrcOdak() {
  const i = document.getElementById('hrcText');
  if (i) { try { i.focus({ preventScroll: true }); } catch (_) { i.focus(); } }
}
function hrcYeniId() { return Date.now() * 10 + (_hrcSayac++ % 10); }
function hrcBudama(L) {
  if (L.length > HRC_MAX_ADET) { L.sort((a, b) => (a.d < b.d ? -1 : 1)); L.splice(0, L.length - HRC_MAX_ADET); }
}
function hrcGeriAlToast(mesaj, geriAl) {
  if (typeof showUndoToast === 'function') showUndoToast(mesaj, geriAl, 5000);
  else showToast(mesaj, 'success', 2000);
}

function hrcEkle() {
  const inp = document.getElementById('hrcText');
  if (inp) _hrcTaslak = inp.value;
  const { ok, bad } = hrcParcalar();
  if (!ok.length) { showToast('Tutarı yaz — örn. "85 öğle yemeği"', 'warning', 3000); return; }
  const bugun = today(), g = hrcSeciliGun();
  const L = hrcListe();

  if (_hrcDuzen != null) {                       // DÜZENLEME: tek kayıt güncellenir
    if (ok.length !== 1) { showToast('Düzenlerken tek harcama yaz.', 'warning'); return; }
    const x = L.find(e => String(e.id) === String(_hrcDuzen));
    if (!x) { hrcVazgec(); return; }
    const r = ok[0];
    x.tl = r.tl; x.not = r.not; x.d = r.dun && g === bugun ? shiftDateStr(bugun, -1) : g;
    x.kat = _hrcSecKat || hrcKategori(r.not);
    save();
    _hrcDuzen = null; _hrcTaslak = ''; _hrcSecKat = ''; _hrcGun = null;
    _hrcAy = hrcAyKey(x.d) === hrcAyKey(bugun) ? null : hrcAyKey(x.d);
    renderHarcama();
    showToast('Güncellendi', 'success', 1800);
    return;
  }

  const yeni = ok.map(r => ({
    id: hrcYeniId(), d: r.dun && g === bugun ? shiftDateStr(bugun, -1) : g,
    tl: r.tl, not: r.not, kat: _hrcSecKat || hrcKategori(r.not),
  }));
  yeni.forEach(x => L.push(x));
  hrcBudama(L);
  save();
  _hrcTaslak = bad.join(', ');                   // tutarsız parça kutuda kalır, düzeltilsin
  _hrcSecKat = '';
  const ilk = yeni[0].d;
  _hrcAy = hrcAyKey(ilk) === hrcAyKey(bugun) ? null : hrcAyKey(ilk);
  renderHarcama();
  hrcOdak();
  const top = yeni.reduce((t, x) => t + x.tl, 0);
  const idler = yeni.map(x => String(x.id));
  hrcGeriAlToast((yeni.length > 1 ? yeni.length + ' harcama · ' : (HRC_KAT_AD[yeni[0].kat] || 'Diğer') + ' · ') + hrcTL(top) + ' kaydedildi', () => {
    data.harcama = hrcListe().filter(x => idler.indexOf(String(x.id)) < 0);
    save(); renderHarcama();
  });
  if (bad.length) showToast(bad.length + ' parçada tutar yok — kutuda bıraktım', 'warning', 3500);
}

function hrcSikEkle(i) {
  const s = _hrcSikList[i];
  if (!s) return;
  const x = { id: hrcYeniId(), d: hrcSeciliGun(), tl: s.tl, not: s.not, kat: s.kat || hrcKategori(s.not) };
  const L = hrcListe();
  L.push(x); hrcBudama(L);
  save();
  renderHarcama();
  hrcGeriAlToast(hrcTL(x.tl) + ' ' + x.not + ' eklendi', () => {
    data.harcama = hrcListe().filter(e => String(e.id) !== String(x.id));
    save(); renderHarcama();
  });
}

function hrcDuzenle(id) {
  const x = hrcListe().find(e => String(e.id) === String(id));
  if (!x) return;
  _hrcDuzen = x.id;
  _hrcTaslak = hrcTutarMetin(x.tl) + (x.not ? ' ' + x.not : '');
  _hrcGun = x.d;
  _hrcSecKat = x.kat || '';
  hrcGirisCiz();
  const el = document.getElementById('hrcGiris');
  if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {} }
  hrcOdak();
}
function hrcVazgec() {
  _hrcDuzen = null; _hrcTaslak = ''; _hrcSecKat = ''; _hrcGun = null;
  hrcGirisCiz();
}

/** Sil: onay penceresi yerine 5 sn "Geri al" — yanlış dokunuş geri dönülebilir. */
function hrcSil(id) {
  const L = hrcListe();
  const i = L.findIndex(x => String(x.id) === String(id));
  if (i < 0) return;
  const [x] = L.splice(i, 1);
  if (String(_hrcDuzen) === String(x.id)) { _hrcDuzen = null; _hrcTaslak = ''; }
  save();
  renderHarcama();
  hrcGeriAlToast('"' + (x.not || 'Harcama') + '" silindi', () => {
    hrcListe().push(x); save(); renderHarcama();
  });
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
