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
  const disari = () => bloklar.filter(x => x.tur === 'okul' || x.tur === 'ders');
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
  const g = (p && Array.isArray(p.days)) ? p.days.find(x => x && x.dow === dow) : null;
  if (g) {
    const dovus = g.type === 'fight';
    antrenman = { tip: dovus ? 'dovus' : 'guc', ad: String(g.name || (dovus ? 'Dövüş antrenmanı' : 'Antrenman')).slice(0, 40), agir: dovus || !!g.agirBacak, bas: null, bit: null, dk: 0 };
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
      antrenman.bit = bas + (dovus ? K.dovusDk : (Number(g.hedefDk) || K.varsayilanDk));
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
  return {
    tarih, dow, bloklar, antrenman, kalk, yatis,
    pencere: { bas: pBas, bit: pBit }, bosDk,
    odevKap: Math.min(K.odevTavan, Math.round(bosDk * K.odevPayi)),
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
        oneri: 'Okul önce: seansı hafiflet (yarı hacim, ağır set yok) ya da dinlenmeye al. Sınav sonrası güne kaydırabilirsin.' });
    }
    const yuk = hfOdevYuk(d, g.tarih);
    if (yuk > g.odevKap && yuk > 0) {
      out.push({ tarih: g.tarih, kod: 'odev-asim', seviye: yuk > g.odevKap + 60 ? 'yuksek' : 'orta',
        mesaj: 'Ödev yükü ' + yuk + ' dk, o gün ödeve ayrılabilecek zaman ~' + g.odevKap + ' dk.',
        oneri: 'Bir kısmını daha boş bir güne kaydır — sohbette "ödevleri dengele" de.' });
    }
    if (g.antrenman && g.antrenman.bit > g.yatis - K.gecBitisPayi) {
      out.push({ tarih: g.tarih, kod: 'gec-antrenman', seviye: 'orta',
        mesaj: 'Antrenman ' + hfSaat(g.antrenman.bit) + "'te bitiyor, hedef yatış " + hfSaat(g.yatis) + '.',
        oneri: 'Uyku önce: akşam yemeğinin büyük kısmını antrenmandan önce ye ya da seansı kısalt.' });
    }
    if (g.sinav.length) {
      out.push({ tarih: g.tarih, kod: 'sinav-gunu', seviye: 'bilgi',
        mesaj: g.sinav.join(', ') + ' sınavı.',
        oneri: 'Kahvaltıyı atlama; önceki akşam hedef yatış saatinde yat.' });
    }
  }
  return out;
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
    '.hafta-not{font-size:12.5px;color:var(--text-muted,#9a9389)}';
  document.head.appendChild(st);
})();

function haftaGunAd(tarih, i) {
  if (i === 0) return 'Bugün';
  if (i === 1) return 'Yarın';
  const p = tarih.split('-');
  return HAFTA_GUN[new Date(tarih + 'T12:00:00').getDay()] + ' ' + Number(p[2]) + '.' + p[1];
}

function haftaUyariHtml(c) {
  return '<div class="hafta-uy ' + escapeHtml(c.seviye) + '"><span class="sv">' + escapeHtml(HAFTA_SEVIYE_AD[c.seviye] || '') + '</span>' +
    escapeHtml(c.mesaj) + '<small>' + escapeHtml(c.oneri) + '</small></div>';
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
