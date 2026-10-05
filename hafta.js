/**
 * hafta.js — Haftam: okul + spor + beslenme + uyku TEK resimde (5 Eki 2026). TEMBEL.
 *
 * Salim: "hayatımın ana odakları okul, spor, beslenme — bunları bir bütün olarak
 * inceleyip programlamalı". Çekirdek (hfGun / hfCakismalar / hfPlanBloklari)
 * worker.js ile BİREBİR İKİZ: ödev dağıtımı (school.js), sohbet ajanı, gün planı
 * ve sabah brifingi aynı hesabı kullanır.
 *
 * ⚠️ Yeni modul eklersen 7 yer: LAZY_MODULES · sw.js ASSETS · deploy INCLUDE ·
 *    Actions paths · .gitattributes · package.json check · tests/07 + 13 listeleri.
 */
// ===== HAFTA ÇEKİRDEĞİ (5 Eki 2026) — hafta.js ↔ worker.js İKİZ =====
// Okul + kurs + sabit program + antrenman + uyku + sınav TEK yerden hesaplanır.
// Önceden takvim iki yerdeydi: diyet/antrenman `diet.nut.duzen`'i, gün planı /
// ödev dağıtımı / sohbet ajanı `fixedSchedule`'ı okuyordu → ödev dağıtıcı
// okulun 19:00'da bittiğini, o akşam antrenman olduğunu bilmiyordu.
// ⚠️ SAF: global okumaz (parametre `d`). İki dosyaya da AYNI yaz (54-hafta).
// Öncelik (Salim, 5 Eki — varsayılan): OKUL > UYKU > ANTRENMAN.
const HAFTA_KURAL = {
  hazirlikDk: 30,       // okul/kurs çıkışı → sonraki iş (PROGRAM_DUZEN.hazirlikDk ile aynı)
  yatisOncesiDk: 60,    // yatıştan önceki son saat ödev/antrenman için sayılmaz (uyku)
  serbestBas: 600,      // okulsuz gün 10:00'da başlar
  odevPayi: 0.6,        // boş zamanın en fazla %60'ı ödev (yemek, dinlenme payı kalır)
  odevTavan: 180,       // günde en fazla 3 saat ödev
  varsayilanSeans: 1020,
  varsayilanDk: 60,
  dovusDk: 90,
  gecBitisPayi: 120,    // antrenman yatıştan 2 saat önce bitmeli (akşam yemeği + uyku)
  varsayilanGorevDk: 30,
  tekrarDkDers: 20,     // haftalık sınavda ders başına önceki akşam tekrar
  tekrarDkSinav: 45,    // tek seferlik (yazılı) sınav başına önceki akşam tekrar
  hafifOran: 0.6,       // "hafiflet" seansı ~%60 süre, ağır set yok
  azUykuPay: 1.5,       // hedef uykudan 1.5 saat az = az uyku
};

function hfDk(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return (h < 24 && mi < 60) ? h * 60 + mi : null;
}

function hfSaat(dk) {
  const v = ((Math.round(dk) % 1440) + 1440) % 1440;
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

function hfEkle(tarih, n) {
  return new Date(Date.parse(tarih + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

/** Bir günün tam resmi: bloklar, antrenman, uyku penceresi, boş dakika, ödev kapasitesi, sınav. */
function hfGun(d, tarih) {
  const K = HAFTA_KURAL;
  const dow = new Date(tarih + 'T12:00:00Z').getUTCDay();
  const duzen = (d && d.diet && d.diet.nut && d.diet.nut.duzen) || {};
  const bloklar = [];
  const ekle = (tur, label, bas, bit) => {
    if (bas != null && bit != null && bit > bas) bloklar.push({ tur, label, bas, bit });
  };
  const okul = duzen.okul && duzen.okul[String(dow)];
  if (okul) ekle('okul', 'Okul', hfDk(okul.bas), hfDk(okul.bit));
  const kurs = duzen.ders && duzen.ders[String(dow)];
  if (kurs) ekle('ders', 'Ek ders / kurs', hfDk(kurs.bas), hfDk(kurs.bit));
  // 5 Eki 2026 — HAFTALIK SINAV (Salim: her Salı/Perşembe 17:25-19:05 okulda).
  // Rutin: her hafta tekrarlar → sınav haftası / ağır antrenman alarmı ÜRETMEZ
  // (her hafta çalan alarm gürültüdür); önceki akşama TEKRAR süresi ayırır.
  const hs = (d && d.school && d.school.haftalikSinav) || {};
  const bugunHs = hs[String(dow)];
  if (bugunHs && Array.isArray(bugunHs.dersler) && bugunHs.dersler.length) {
    ekle('sinav', 'Sınav: ' + bugunHs.dersler.slice(0, 6).join(', '), hfDk(bugunHs.bas), hfDk(bugunHs.bit));
  }
  const disari = () => bloklar.filter(x => x.tur === 'okul' || x.tur === 'ders' || x.tur === 'sinav');
  for (const f of ((d && d.fixedSchedule) || [])) {
    if (!f || f.enabled === false || !Array.isArray(f.days) || f.days.indexOf(dow) < 0) continue;
    const b = hfDk(f.start), e = hfDk(f.end);
    if (b == null || e == null || e <= b) continue;
    // Okul/kurs bloğunun İÇİNDE kalan sabit blok aynı şeyin kopyasıdır.
    if (disari().some(x => b >= x.bas && e <= x.bit)) continue;
    ekle('sabit', String(f.label || 'Sabit').slice(0, 40), b, e);
  }
  let antrenman = null;
  const p = d && d.program;
  const sablon = (p && Array.isArray(p.days)) ? p.days : [];
  // HAFTALIK AYAR (Haftam'dan "hafiflet / dinlenmeye al / kaydır"): şablon
  // (program.days) DEĞİŞMEZ, yalnız o TARİH etkilenir. Beslenme gün tipi,
  // gün planı ve brifing de bu hesaptan okur → hepsi aynı anda uyar.
  const ayarlar = (p && p.ayarlar && typeof p.ayarlar === 'object') ? p.ayarlar : {};
  const ayar = ayarlar[tarih] || null;
  let g = sablon.find(x => x && x.dow === dow) || null;
  if (ayar && (ayar.mod === 'dinlen' || ayar.mod === 'kaydir')) g = null;
  if (!g) {
    for (const k in ayarlar) {
      const a = ayarlar[k];
      if (!a || a.mod !== 'kaydir' || a.hedef !== tarih) continue;
      const kaynak = sablon.find(x => x && x.dow === new Date(k + 'T12:00:00Z').getUTCDay());
      if (kaynak) { g = Object.assign({}, kaynak, { bas: null }); break; }
    }
  }
  const hafif = !!(g && ayar && ayar.mod === 'hafif');
  if (g) {
    const dovus = g.type === 'fight';
    antrenman = { tip: dovus ? 'dovus' : 'guc', ad: String(g.name || (dovus ? 'Dövüş antrenmanı' : 'Antrenman')).slice(0, 40), agir: (dovus || !!g.agirBacak) && !hafif, hafif, bas: null, bit: null, dk: 0 };
    if (hafif) antrenman.ad = (antrenman.ad + ' (hafif)').slice(0, 48);
    const dovusBlok = dovus ? bloklar.find(x => x.tur === 'sabit' && /kick|boks|dövüş|dovus|mma|muay|güreş|gures|bjj|jiu/i.test(x.label)) : null;
    if (dovusBlok) {
      dovusBlok.tur = 'antrenman';
      antrenman.bas = dovusBlok.bas; antrenman.bit = dovusBlok.bit;
    } else {
      const cikis = disari().reduce((m, x) => Math.max(m, x.bit), -1);
      let bas = hfDk(g.bas);
      if (bas == null) {
        bas = hfDk(duzen.antrenman);
        if (bas == null) bas = K.varsayilanSeans;
        if (cikis >= 0 && bas < cikis + K.hazirlikDk) bas = cikis + K.hazirlikDk;
      }
      antrenman.bas = bas;
      antrenman.bit = bas + Math.round((dovus ? K.dovusDk : (Number(g.hedefDk) || K.varsayilanDk)) * (hafif ? K.hafifOran : 1));
      ekle('antrenman', antrenman.ad, antrenman.bas, antrenman.bit);
    }
    antrenman.dk = antrenman.bit - antrenman.bas;
  }
  bloklar.sort((a, b) => a.bas - b.bas);
  const sg = (d && d.settings && d.settings.sleepGoal) || {};
  let kalk = hfDk(sg.wake);
  if (kalk == null) kalk = hfDk(duzen.kalk);
  if (kalk == null) kalk = 420;
  const uykuDk = Math.round((Number(sg.targetH) || 8) * 60);
  const yatis = kalk - uykuDk + (kalk - uykuDk < 0 ? 1440 : 0);
  const cikisSon = disari().reduce((m, x) => Math.max(m, x.bit), -1);
  const pBas = cikisSon >= 0 ? cikisSon + K.hazirlikDk : K.serbestBas;
  const pBit = yatis - K.yatisOncesiDk;
  let dolu = 0;
  for (const b of bloklar) dolu += Math.max(0, Math.min(b.bit, pBit) - Math.max(b.bas, pBas));
  const bosDk = Math.max(0, pBit - pBas - dolu);
  const sinav = (((d && d.school && d.school.exams) || []).filter(e => e && e.date === tarih))
    .map(e => String(e.subject || 'Sınav').slice(0, 40));
  // Yarının sınavları için bu akşam tekrar — ödev kapasitesinden DÜŞER (ikisi de okul işi).
  const yarin = hfEkle(tarih, 1);
  const yarinHs = hs[String((dow + 1) % 7)];
  const tDers = (yarinHs && Array.isArray(yarinHs.dersler)) ? yarinHs.dersler.slice(0, 6).map(x => String(x).slice(0, 30)) : [];
  const tSinav = (((d && d.school && d.school.exams) || []).filter(e => e && e.date === yarin)).map(e => String(e.subject || 'Sınav').slice(0, 40));
  const tekrarDk = tDers.length * K.tekrarDkDers + tSinav.length * K.tekrarDkSinav;
  const hamKap = Math.min(K.odevTavan, Math.round(bosDk * K.odevPayi));
  return {
    tarih, dow, bloklar, antrenman, kalk, yatis,
    pencere: { bas: pBas, bit: pBit }, bosDk,
    hamKap,
    odevKap: Math.max(0, hamKap - tekrarDk),
    tekrar: tekrarDk ? { dk: tekrarDk, dersler: tDers.concat(tSinav) } : null,
    sinav,
  };
}

/** O güne tarihli, bitmemiş görevlerin toplam tahmini süresi. */
function hfOdevYuk(d, tarih) {
  return (((d && d.tasks) || []).filter(t => t && !t.done && t.due === tarih))
    .reduce((s, t) => s + (Number(t.estimateMin) || HAFTA_KURAL.varsayilanGorevDk), 0);
}

/**
 * Çapraz kurallar — okul, antrenman, ödev yükü, uyku AYNI terazide.
 * seviye: yuksek | orta | bilgi. Kod kuralıdır, AI'a bırakılmaz.
 */
function hfCakismalar(d, bas, n) {
  const K = HAFTA_KURAL;
  const out = [];
  const gunler = [];
  for (let i = 0; i < n; i++) gunler.push(hfGun(d, hfEkle(bas, i)));
  const sinavSay = gunler.reduce((s, g) => s + g.sinav.length, 0);
  if (sinavSay >= 2) {
    out.push({ tarih: bas, kod: 'sinav-haftasi', seviye: 'orta',
      mesaj: 'Bu dönemde ' + sinavSay + ' sınav var.',
      oneri: 'Antrenman günlerini koru ama hacmi ~%30 düşür (her harekette 1 set eksik). Yatış saatini kaydırma.' });
  }
  for (const g of gunler) {
    const yarin = hfGun(d, hfEkle(g.tarih, 1));
    const sinavlar = g.sinav.concat(yarin.sinav);
    if (g.antrenman && g.antrenman.agir && sinavlar.length) {
      out.push({ tarih: g.tarih, kod: 'sinav-agir', seviye: 'yuksek',
        mesaj: (g.sinav.length ? 'Bugün' : 'Yarın') + ' ' + sinavlar[0] + ' sınavı var; ' + g.antrenman.ad + ' ağır bir seans.',
        oneri: 'Okul önce: seansı hafiflet (yarı hacim, ağır set yok) ya da dinlenmeye al. Sınav sonrası güne kaydırabilirsin.',
        eylemler: ['hafif', 'dinlen', 'kaydir'] });
    }
    if (g.tarih === bas && g.antrenman && g.antrenman.agir) {
      const uy = ((d && d.sleep) || []).find(s => s && s.date === g.tarih);
      const hedefH = Number(((d && d.settings && d.settings.sleepGoal) || {}).targetH) || 8;
      const az = uy && ((uy.hours != null && Number(uy.hours) < hedefH - K.azUykuPay) || (uy.hours == null && uy.quality === 'bad'));
      if (az) {
        out.push({ tarih: g.tarih, kod: 'az-uyku', seviye: 'yuksek',
          mesaj: 'Dün gece ' + (uy.hours != null ? uy.hours + ' saat' : 'kötü') + ' uyudun; bugün ' + g.antrenman.ad + ' ağır bir seans.',
          oneri: 'Uyku önce: seansı hafiflet — az uykuyla ağır set hem sakatlık riski hem düşük kazanım.',
          eylemler: ['hafif', 'dinlen'] });
      }
    }
    const yuk = hfOdevYuk(d, g.tarih);
    if (yuk > g.odevKap && yuk > 0) {
      out.push({ tarih: g.tarih, kod: 'odev-asim', seviye: yuk > g.odevKap + 60 ? 'yuksek' : 'orta',
        mesaj: 'Ödev yükü ' + yuk + ' dk, o gün ödeve ayrılabilecek zaman ~' + g.odevKap + ' dk.',
        oneri: 'Bir kısmını daha önceki, boş bir güne al.',
        eylemler: ['dengele'] });
    }
    if (g.antrenman && g.antrenman.bit > g.yatis - K.gecBitisPayi) {
      out.push({ tarih: g.tarih, kod: 'gec-antrenman', seviye: 'orta',
        mesaj: 'Antrenman ' + hfSaat(g.antrenman.bit) + "'te bitiyor, hedef yatış " + hfSaat(g.yatis) + '.',
        oneri: 'Uyku önce: seansı kısalt ya da başka güne al. Her hafta tekrarlıyorsa programı yeniden kur.',
        eylemler: ['hafif', 'kaydir', 'yeniden'] });
    }
    if (g.tekrar) {
      const kalan = g.hamKap - yuk;
      out.push(kalan < g.tekrar.dk
        ? { tarih: g.tarih, kod: 'tekrar-sigmiyor', seviye: 'orta',
            mesaj: 'Yarınki sınavlar (' + g.tekrar.dersler.join(', ') + ') için ~' + g.tekrar.dk + ' dk tekrar gerekiyor, ödevden sonra kalan ~' + Math.max(0, kalan) + ' dk.',
            oneri: 'Okul önce: bu akşamki ödevin bir kısmını önceki güne al ya da antrenmanı hafiflet.',
            eylemler: g.antrenman ? ['dengele', 'hafif'] : ['dengele'] }
        : { tarih: g.tarih, kod: 'tekrar', seviye: 'bilgi',
            mesaj: 'Yarınki sınavlar için ~' + g.tekrar.dk + ' dk tekrar: ' + g.tekrar.dersler.join(', ') + '.',
            oneri: 'Ders başına kısa tekrar — kendini test et, okuyup geçme.' });
    }
    if (g.sinav.length) {
      out.push({ tarih: g.tarih, kod: 'sinav-gunu', seviye: 'bilgi',
        mesaj: g.sinav.join(', ') + ' sınavı.',
        oneri: 'Kahvaltıyı atlama; önceki akşam hedef yatış saatinde yat.' });
    }
  }
  return out;
}

/** Beslenme gün tipi — haftalık ayar dahil (dinlenmeye alınan gün 'rest', kaydırılan hedef gün antrenman). */
function hfGunTipi(d, tarih) {
  const a = hfGun(d, tarih).antrenman;
  if (!a) return 'rest';
  return a.tip === 'dovus' ? 'fight' : 'strength';
}

/** Gün planı için okul/kurs/antrenman blokları (sabit program blokları zaten ayrıca geliyor). */
function hfPlanBloklari(d, tarih) {
  return hfGun(d, tarih).bloklar
    .filter(b => b.tur !== 'sabit')
    .map(b => ({ label: b.label, start: hfSaat(b.bas), end: hfSaat(b.bit), kind: 'fixed', tur: b.tur }));
}
// ===== HAFTA ÇEKİRDEĞİ SONU =====

// ===== HAFTAM PANELİ (5 Eki 2026) =====
const HAFTA_GUN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const HAFTA_SEVIYE_AD = { yuksek: 'Önemli', orta: 'Dikkat', bilgi: 'Not' };

(function haftaStyle() {
  if (document.getElementById('haftaStyle')) return;
  const st = document.createElement('style');
  st.id = 'haftaStyle';
  st.textContent = '.hafta-inner{padding:0 14px 14px;display:flex;flex-direction:column;gap:8px}' +
    '.hafta-gun{border:1px solid var(--border,#2f323c);border-radius:12px;padding:10px 12px;background:var(--bg,#0c0d11)}' +
    '.hafta-gun.bugun{border-color:var(--text-muted,#9a9389)}' +
    '.hafta-gh{display:flex;justify-content:space-between;gap:8px;font-weight:600;font-size:14px;color:var(--text,#e5e1d9)}' +
    '.hafta-gh small{font-weight:500;color:var(--text-muted,#9a9389)}' +
    '.hafta-sat{font-size:13px;line-height:1.5;color:var(--text-muted,#9a9389);margin-top:4px}' +
    '.hafta-sat b{color:var(--text,#e5e1d9);font-weight:600}' +
    '.hafta-uy{margin-top:6px;padding:7px 10px;border-radius:10px;font-size:13px;line-height:1.45;background:var(--bg-elev,#131419);border:1px solid var(--border,#2f323c)}' +
    '.hafta-uy .sv{font-weight:700;margin-right:6px}.hafta-uy.yuksek .sv{color:var(--danger,#ea5a52)}.hafta-uy.orta .sv{color:var(--warning,#e5a117)}.hafta-uy.bilgi .sv{color:var(--text-muted,#9a9389)}' +
    '.hafta-uy small{display:block;color:var(--text-muted,#9a9389);margin-top:2px}' +
    '.hafta-not{font-size:12.5px;color:var(--text-muted,#9a9389)}' +
    '.hafta-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.hafta-btns button{min-height:34px}' +
    '.hafta-koc{border:1px solid var(--border,#2f323c);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.55;color:var(--text,#e5e1d9)}' +
    '.hafta-koc b{display:block;margin-bottom:4px}';
  document.head.appendChild(st);
})();

function haftaGunAd(tarih, i) {
  if (i < 0) { const t = today(); i = tarih === t ? 0 : (tarih === hfEkle(t, 1) ? 1 : 9); }
  if (i === 0) return 'Bugün';
  if (i === 1) return 'Yarın';
  const p = tarih.split('-');
  return HAFTA_GUN[new Date(tarih + 'T12:00:00').getDay()] + ' ' + Number(p[2]) + '.' + p[1];
}

const HAFTA_EYLEM_AD = { hafif: 'Hafiflet', dinlen: 'Dinlenmeye al', kaydir: 'Başka güne al', yeniden: 'Programı yeniden kur', dengele: 'Ödevleri dengele' };

function haftaUyariHtml(c) {
  const btn = (c.eylemler || []).map(e => '<button class="small secondary" data-t="' + escapeHtml(c.tarih) + '" data-e="' + escapeHtml(e) +
    '" onclick="haftaEylem(this.dataset.t, this.dataset.e)">' + escapeHtml(HAFTA_EYLEM_AD[e] || e) + '</button>').join('');
  return '<div class="hafta-uy ' + escapeHtml(c.seviye) + '"><span class="sv">' + escapeHtml(HAFTA_SEVIYE_AD[c.seviye] || '') + '</span>' +
    escapeHtml(c.mesaj) + '<small>' + escapeHtml(c.oneri) + '</small>' +
    (btn ? '<div class="hafta-btns">' + btn + '</div>' : '') + '</div>';
}

// ===== EYLEMLER (5 Eki 2026) — "hepsi birbirine baksın" =====
// Haftam yalnız uyarmıyor, DÜZELTİYOR. Antrenman ayarı program.ayarlar[tarih]'e
// yazılır (şablon değişmez); hafta çekirdeği okuduğu için beslenme gün tipi,
// gün planı, brifing ve sohbet ajanı AYNI ANDA uyar. Her eylem geri alınabilir.
function haftaAyarlar() {
  if (!data.program || typeof data.program !== 'object') return null;
  const a = (data.program.ayarlar && typeof data.program.ayarlar === 'object') ? data.program.ayarlar : {};
  const sinir = hfEkle(today(), -14);
  Object.keys(a).forEach(k => { if (k < sinir) delete a[k]; });   // eski ayarlar birikmesin
  data.program.ayarlar = a;
  return a;
}

/** Seansı taşımak için en uygun gün: ±3 gün, antrenmansız, ertesi gün sınav/tekrar olmayan, en boş. */
function haftaKaydirHedef(tarih) {
  const bugun = today();
  let en = null, enBos = -1;
  for (const k of [1, 2, 3, -1, -2]) {
    const t = hfEkle(tarih, k);
    if (t < bugun) continue;
    const g = hfGun(data, t);
    if (g.antrenman || g.tekrar || g.sinav.length) continue;
    if (g.bosDk > enBos) { en = t; enBos = g.bosDk; }
  }
  return en;
}

/** Aşan günün ödevini ÖNCEKİ günlere alır (son tarihi geçirmez). Taşınan görev sayısını döndürür. */
function haftaDengele(tarih) {
  const bugun = today();
  const g = hfGun(data, tarih);
  let fazla = hfOdevYuk(data, tarih) - g.odevKap;
  const gorevler = (data.tasks || []).filter(t => t && !t.done && t.due === tarih)
    .sort((a, b) => (a.estimateMin || 30) - (b.estimateMin || 30));
  const tasinan = [];
  for (const t of gorevler) {
    if (fazla <= 0) break;
    const dk = t.estimateMin || HAFTA_KURAL.varsayilanGorevDk;
    let hedef = null, enBos = -1;
    for (let k = 1; k <= 6; k++) {
      const x = hfEkle(tarih, -k);
      if (x < bugun) break;
      const bos = hfGun(data, x).odevKap - hfOdevYuk(data, x);
      if (bos >= dk && bos > enBos) { hedef = x; enBos = bos; }
    }
    if (!hedef) continue;
    tasinan.push({ t, eski: t.due });
    t.due = hedef;
    fazla -= dk;
  }
  return tasinan;
}

async function haftaEylem(tarih, eylem) {
  if (eylem === 'yeniden') {
    if (typeof showTab === 'function') await showTab('diet', document.querySelector('[data-tab=diet]'));
    if (typeof openProgramSetup === 'function') openProgramSetup();
    return;
  }
  if (eylem === 'dengele') {
    const tasinan = haftaDengele(tarih);
    if (!tasinan.length) { showToast('Önceki günlerde yer yok — o günün antrenmanını hafifletmeyi dene.', 'warning', 4000); return; }
    save(); if (typeof renderTasks === 'function') renderTasks(); renderHafta();
    const geri = () => { tasinan.forEach(x => { x.t.due = x.eski; }); save(); if (typeof renderTasks === 'function') renderTasks(); renderHafta(); };
    if (typeof showUndoToast === 'function') showUndoToast(tasinan.length + ' görev öne alındı', geri, 6000);
    return;
  }
  const a = haftaAyarlar();
  if (!a) { showToast('Önce antrenman programı kur', 'warning'); return; }
  let mesaj;
  if (eylem === 'kaydir') {
    const hedef = haftaKaydirHedef(tarih);
    if (!hedef) { showToast('Yakın günlerde uygun gün yok — hafifletmeyi dene.', 'warning', 4000); return; }
    a[tarih] = { mod: 'kaydir', hedef, at: today() };
    mesaj = 'Seans ' + haftaGunAd(hedef, -1) + ' gününe alındı';
  } else if (eylem === 'hafif' || eylem === 'dinlen') {
    a[tarih] = { mod: eylem, at: today() };
    mesaj = eylem === 'hafif' ? 'Seans hafifletildi (~%60 süre, ağır set yok)' : 'Dinlenme gününe alındı';
  } else return;
  save(); renderHafta();
  if (typeof renderProgram === 'function') { try { renderProgram(); } catch (_) {} }
  const geri = () => { delete a[tarih]; save(); renderHafta(); if (typeof renderProgram === 'function') { try { renderProgram(); } catch (_) {} } };
  if (typeof showUndoToast === 'function') showUndoToast(mesaj, geri, 6000);
  else showToast(mesaj, 'success');
}

function renderHafta() {
  const el = document.getElementById('haftaInner');
  if (!el || typeof data === 'undefined') return;
  const bas = today();
  const cak = hfCakismalar(data, bas, 7);
  const onemli = cak.filter(c => c.seviye !== 'bilgi').length;
  const badge = document.getElementById('haftaBadge');
  if (badge) badge.textContent = onemli ? onemli + ' çakışma' : '';
  const duzenVar = !!(data.diet && data.diet.nut && data.diet.nut.duzen && data.diet.nut.duzen.okul);
  let h = '';
  if (!duzenVar) h += '<div class="hafta-not">Okul saatlerini Diyet → Günlük düzen bölümüne girersen boş zaman ve ödev kapasitesi gerçek düzenine göre hesaplanır.</div>';
  // Haftalık Pro koç (Pazar 20:00, worker) — son 8 gün içindeyse en üstte.
  const koc = data.haftaKoc;
  if (koc && koc.metin && koc.at && koc.at >= hfEkle(bas, -8)) {
    h += '<div class="hafta-koc"><b>Haftalık koç · ' + escapeHtml(koc.at) + '</b>' + escapeHtml(koc.metin).replace(/\n/g, '<br>') + '</div>';
  }
  const genel = cak.filter(c => c.kod === 'sinav-haftasi');
  genel.forEach(c => { h += haftaUyariHtml(c); });
  for (let i = 0; i < 7; i++) {
    const t = hfEkle(bas, i);
    const g = hfGun(data, t);
    const yuk = hfOdevYuk(data, t);
    const satir = [];
    g.bloklar.forEach(b => {
      if (b.tur === 'antrenman') return;
      satir.push(escapeHtml(b.label) + ' ' + hfSaat(b.bas) + '–' + hfSaat(b.bit));
    });
    if (g.antrenman) satir.push('<b>' + escapeHtml(g.antrenman.ad) + '</b> ' + hfSaat(g.antrenman.bas) + '–' + hfSaat(g.antrenman.bit) + (g.antrenman.agir ? ' · ağır' : ''));
    if (g.sinav.length) satir.push('<b>Sınav: ' + escapeHtml(g.sinav.join(', ')) + '</b>');
    h += '<div class="hafta-gun' + (i === 0 ? ' bugun' : '') + '"><div class="hafta-gh"><span>' + escapeHtml(haftaGunAd(t, i)) + '</span>' +
      '<small>ödev ' + yuk + ' / ~' + g.odevKap + ' dk · yatış ' + hfSaat(g.yatis) + '</small></div>' +
      (satir.length ? '<div class="hafta-sat">' + satir.join(' · ') + '</div>' : '<div class="hafta-sat">Serbest gün</div>') +
      cak.filter(c => c.tarih === t && c.kod !== 'sinav-haftasi').map(haftaUyariHtml).join('') +
      '</div>';
  }
  el.innerHTML = h;
  if (location.hash === '#hafta') {
    const d = document.getElementById('haftaSection');
    if (d) { d.open = true; try { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {} }
  }
}
