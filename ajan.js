/**
 * ajan.js — Sohbet ajanının "Uygula" kartları (5 Eki 2026). TEMBEL modül.
 *
 * Worker (/chat) araç çağrılarını temizleyip `actions` olarak döndürür; bu
 * modül her eylemi kart olarak çizer. ⚠️ ONAY KAPISI: kullanıcı "Uygula"ya
 * basmadan HİÇBİR şey değişmez. Ödev planı school.js'teki AYNI LPT motoruyla
 * (hwWorkDays + hwSpread) dağıtılır — ödev paketi modalıyla tek kural.
 *
 * Plan UYGULAMA anında yeniden hesaplanır: kart dün çizildiyse bugünün
 * yüküyle dağıtılır, "bugün" kaymaz.
 *
 * 11 Eki 2026 — TEK GİRİŞ KAPISI (Faz 1): harcama_ekle · ogun_ekle · uyku_kaydet ·
 * kilo_kaydet. SAYI KODLA: öğün kalorisi foods.js besin veritabanından (modelin
 * sayısı hiç gelmez), harcama kategorisi harcama.js'ten, kilo sınırı upsertBody'den.
 * Bir mesajda 2+ bekleyen eylem varsa "Hepsini uygula" tek dokunuş + tek Geri al.
 *
 * ⚠️ Yeni modul eklersen 7 yer: LAZY_MODULES · sw.js ASSETS · deploy INCLUDE ·
 *    Actions paths · .gitattributes · package.json check · tests/07 + 13 listeleri.
 */
const AJAN_DEFAULT_MIN = 30;
const AJAN_DAY_CAP = 120;

(function ajanStyle() {
  if (document.getElementById('ajanStyle')) return;
  const st = document.createElement('style');
  st.id = 'ajanStyle';
  st.textContent = '.chat-ajan{display:flex;flex-direction:column;gap:8px;margin-top:10px}' +
    '.ajan-card{border:1px solid var(--border,#2f323c);border-radius:12px;padding:10px 12px;background:var(--bg-elev,#131419)}' +
    '.ajan-head{font-weight:600;font-size:14px;color:var(--text,#e5e1d9)}' +
    '.ajan-sub{font-size:12.5px;color:var(--text-muted,#9a9389);margin-top:2px}' +
    '.ajan-day{margin-top:8px}.ajan-day-h{display:flex;justify-content:space-between;font-size:12.5px;font-weight:600;color:var(--text-muted,#9a9389)}' +
    '.ajan-day.over .ajan-day-h span:last-child{color:var(--warning,#e5a117)}' +
    '.ajan-it{font-size:13.5px;line-height:1.45;padding-left:10px;color:var(--text,#e5e1d9)}' +
    '.ajan-btns{display:flex;gap:8px;margin-top:10px}.ajan-btns button{min-height:36px}' +
    '.ajan-done{margin-top:8px;font-size:12.5px;font-weight:600;color:var(--success,#5cbf7a)}' +
    '.ajan-done.off{color:var(--text-muted,#9a9389)}' +
    '.ajan-all{width:100%;min-height:44px}' +
    '.ajan-sub.uyari{color:var(--warning,#e5a117)}' +
    '.ogun-sheet{position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:900;max-width:480px;margin:0 auto}' +
    '.ogun-sheet .ajan-btns button{flex:1;min-height:44px}';
  document.head.appendChild(st);
})();

/** Bu haftanın cuması; cuma/hafta sonu ise gelecek cuma (ödev paketi modalıyla aynı varsayılan). */
function ajanDefaultDeadline() {
  let d = today(), guard = 0;
  do { d = shiftDateStr(d, 1); } while (new Date(d + 'T00:00:00').getDay() !== 5 && guard++ < 9);
  return d;
}

/** Eylemin ödev kalemlerini görev kalemlerine çevirir; "parca" büyük ödevi kronolojik parçalara böler. */
function ajanItems(a) {
  const kat = a.kaynak === 'ozel_ders' ? 'ders' : 'odev';
  const out = [];
  (a.items || []).forEach((it, gi) => {
    const n = Math.max(1, Math.min(6, parseInt(it.parca, 10) || 1));
    const dk = it.dk || null;
    if (n === 1) { out.push({ text: it.text, estimateMin: dk, category: kat, priority: 'normal', due: it.tarih || null }); return; }
    const her = dk ? Math.max(5, Math.round(dk / n)) : null;
    // ⚠️ `seq` KULLANILMAZ: hwFixSeq tüm seq'li kalemleri tek grup sayıp
    // yer değiştirir; iki farklı boyutlu bölünmüş ödevde gün yükünü bozar.
    // Grup içi sıra ajanFixParts ile düzeltilir (grup içi parçalar eşit boyutlu).
    for (let i = 0; i < n; i++) {
      out.push({ text: `${it.text} (${i + 1}/${n})`, estimateMin: her, category: kat, priority: 'normal', due: null, grp: gi, part: i + 1 });
    }
  });
  return out;
}

/** Her bölünmüş ödevin parçalarını kendi içinde kronolojik sıraya koyar. Gün yükü değişmez. */
function ajanFixParts(plan) {
  const gruplar = {};
  plan.forEach((g, di) => g.items.forEach((it, ii) => { if (it.grp != null) (gruplar[it.grp] = gruplar[it.grp] || []).push({ di, ii }); }));
  Object.values(gruplar).forEach(yuva => {
    const parca = yuva.map(y => plan[y.di].items[y.ii]).sort((x, y) => x.part - y.part);
    yuva.forEach((y, k) => { plan[y.di].items[y.ii] = parca[k]; });
  });
  return plan;
}

/** Planı ŞİMDİKİ yükle kurar (hwWorkDays + hwSpread — school.js). */
function ajanPlan(a) {
  const bas = a.bugun ? today() : shiftDateStr(today(), 1);
  let son = a.sonTarih || ajanDefaultDeadline();
  if (son < bas) son = bas;
  const items = ajanItems(a);
  const days = hwWorkDays(bas, son, !a.haftaSonu);
  return { items, son, days: ajanFixParts(hwSpread(items, days)) };
}

function ajanTask(id) {
  return (data.tasks || []).find(t => String(t.id) === String(id));
}
function ajanGun(iso) {
  if (iso === shiftDateStr(today(), -1)) return 'Dün';
  return typeof fmtDayLabel === 'function' ? fmtDayLabel(iso) : iso;
}

const AJAN_OGUN_AD = { kahvalti: 'Kahvaltı', ogle: 'Öğle', aksam: 'Akşam', atistirma: 'Atıştırma' };
const AJAN_HRC_AD = { yemek: 'Yemek', ulasim: 'Ulaşım', okul: 'Okul', spor: 'Spor', giyim: 'Giyim', eglence: 'Eğlence', diger: 'Diğer' };
const AJAN_KCAL_TAVAN = 5000;   // 38-gram-sorgusu kuralı: tek kalem 5000 kcal'i aşamaz → bilinmiyor say
function ajanTL(n) { return (Math.round(n * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺'; }
function ajanSayi(n) { return String(Math.round(n * 100) / 100).replace('.', ','); }
function ajanOgunVarsayilan(tarih) {
  if (tarih !== today()) return 'aksam';
  const h = new Date().getHours();
  return h < 11 ? 'kahvalti' : h < 16 ? 'ogle' : h < 22 ? 'aksam' : 'atistirma';
}

/**
 * "3 yumurta" → besin veritabanından ölçekli kayıt. Saf (foods.js fonksiyonlarını okur).
 * Eşleşme yoksa kalori NULL — makrosu bilinmeyen kaleme makro yazılmaz.
 */
function ajanYemekCoz(yemek) {
  const bos = { name: String(yemek || '').slice(0, 80), kcal: null, protein: null, carb: null, fat: null, bilinmiyor: true };
  if (typeof seedFoodMatches !== 'function' || typeof parseFoodQuery !== 'function') return bos;
  const pr = parseFoodQuery(yemek);
  const f = seedFoodMatches(yemek, 1)[0];
  const sc = (v, m) => (v == null ? null : Math.round(v * m));
  if (f) {
    let m = 1, ek = '';
    if (pr.gram && pr.qty > 0 && f.g > 0) { m = pr.qty / f.g; ek = ' (' + Math.round(pr.qty) + 'g)'; }
    else {
      const d = (typeof _olcuDonustur === 'function') ? _olcuDonustur(pr, f) : null;
      if (d && d.gram) { if (f.g > 0) { m = d.qty / f.g; ek = ' (' + Math.round(d.qty) + 'g)'; } }
      else if (d) { m = d.qty; }
      else if (pr.qty > 0) { m = pr.qty; }
      if (!ek && f.g > 0) ek = ' (' + Math.round(m * f.g) + 'g)';   // 25 Eki: gram esas
      else if (!ek && m !== 1) ek = ' ×' + ajanSayi(m);
    }
    const kcal = sc(f.k, m);
    if (kcal != null && kcal > AJAN_KCAL_TAVAN) return bos;
    return { name: f.n + ek, kcal, protein: sc(f.p, m), carb: sc(f.c, m), fat: sc(f.f, m), bilinmiyor: kcal == null };
  }
  const c = (typeof customFoodMatches === 'function' && trNorm(pr.core || '').length >= 2) ? customFoodMatches(yemek, 1)[0] : null;
  if (c) {
    const m = pr.qty > 0 && !pr.gram ? pr.qty : 1;
    const kcal = sc(c.kcal, m);
    if (kcal != null && kcal > AJAN_KCAL_TAVAN) return bos;
    return { name: c.name + (m !== 1 ? ' ×' + ajanSayi(m) : ''), kcal, protein: sc(c.protein, m), carb: sc(c.carb, m), fat: sc(c.fat, m), bilinmiyor: kcal == null };
  }
  return bos;
}

/* ---------- SABİT PROGRAM (14 Eki 2026) ----------
 * Salim: "yazdığımı tak diye programa koymasın, anlayıp özümseyip kaydetsin".
 * AI anlar (worker program_kaydet), kod doğrular, KART ETKİYİ gösterir (antrenman kayması,
 * ödev süresi, çakışma — hafta.js hfGun'dan, kendi takvim hesabı YOK), Uygula'yla kaydedilir.
 * okul → duzen.okul · ders → duzen.ders (beslenme öğün saatleri de bunu okur) ·
 * dovus/sabit → fixedSchedule (dövüş adı hfGun'un dövüş bloğu kuralına uyar). */
const AJAN_GUN_KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const AJAN_DOVUS_RE = /kick|boks|dövüş|dovus|mma|muay|güreş|gures|bjj|jiu/i;
function ajanAyni(x, y) { return String(x || '').trim().toLocaleLowerCase('tr') === String(y || '').trim().toLocaleLowerCase('tr'); }
function ajanProgEtiket(a) {
  if (a.tur === 'dovus') return AJAN_DOVUS_RE.test(a.ad) ? a.ad : ('Dövüş: ' + a.ad).slice(0, 40);
  return a.ad;
}
/** Saf: programı d'ye uygular (d yerinde değişir). */
function ajanProgUygula(d, a) {
  d.diet = d.diet || {}; d.diet.nut = d.diet.nut || {};
  const z = d.diet.nut.duzen || (d.diet.nut.duzen = {});
  if (a.tur === 'okul' || a.tur === 'ders') {
    const k = a.tur;
    const o = z[k] || (z[k] = {});
    const gunler = a.gunler.length ? a.gunler : Object.keys(o).map(Number);
    gunler.forEach(g => {
      const x = o[String(g)];
      if (a.islem === 'sil') { if (x && (k === 'okul' || !x.ad || ajanAyni(x.ad, a.ad))) delete o[String(g)]; }
      else o[String(g)] = k === 'okul' ? { bas: a.bas, bit: a.bit } : { bas: a.bas, bit: a.bit, ad: a.ad };
    });
    return d;
  }
  const label = ajanProgEtiket(a);
  const fs = Array.isArray(d.fixedSchedule) ? d.fixedSchedule : (d.fixedSchedule = []);
  const ayni = fs.filter(f => f && ajanAyni(f.label, label));
  const hedef = a.gunler.length ? a.gunler : [0, 1, 2, 3, 4, 5, 6];
  // Önce bu günleri aynı adlı kayıtlardan çıkar (değiştirme = üzerine yazma)
  ayni.forEach(f => { f.days = (f.days || []).filter(g => hedef.indexOf(g) < 0); });
  d.fixedSchedule = fs.filter(f => !(f && ayni.indexOf(f) >= 0 && !f.days.length));
  if (a.islem === 'ekle') {
    const es = d.fixedSchedule.find(f => f && ajanAyni(f.label, label) && f.start === a.bas && f.end === a.bit);
    if (es) es.days = es.days.concat(a.gunler).filter((g, i, s) => s.indexOf(g) === i);
    else d.fixedSchedule.push({ id: Date.now(), label, days: a.gunler.slice(), start: a.bas, end: a.bit, enabled: true, src: 'sohbet' });
  }
  return d;
}
/** Program değişince BUGÜNÜN/YARININ hazır planı bayat kalmasın (14 Eki: Çarşamba planı
 *  matematik dersi eklenmeden önce kurulmuştu, 17:30'da "Şimdi: Dövüş" bildirimi geldi).
 *  Bitmiş blok varsa dokunmaz (kullanıcının işaretlediği ilerleme silinmesin). */
function ajanProgPlanYenile(a) {
  const p = data.dayPlan;
  if (!p || !p.date || p.date < today() || typeof planLocalBlocks !== 'function') return false;
  const dow = new Date(p.date + 'T12:00:00').getDay();
  if (a.gunler.length && a.gunler.indexOf(dow) < 0) return false;
  if ((p.blocks || []).some(b => b && b.done)) return false;
  let r = null;
  try { r = planLocalBlocks(p.date); } catch (_) { return false; }
  if (!r || !Array.isArray(r.blocks) || !r.blocks.length) return false;
  p.blocks = r.blocks;
  return true;
}
function ajanSonrakiGun(dow) {
  for (let i = 0; i < 7; i++) { const t = shiftDateStr(today(), i); if (new Date(t + 'T12:00:00').getDay() === dow) return t; }
  return today();
}
/** Kartın "etkisi" satırları: önce/sonra hfGun. hafta.js yoksa boş (kart yine çalışır). */
function ajanProgEtki(a) {
  if (typeof hfGun !== 'function') return [];
  const sonra = ajanProgUygula(JSON.parse(JSON.stringify(data)), a);
  const L = [];
  const gunler = a.gunler.length ? a.gunler : [1, 2, 3, 4, 5, 6, 0];
  gunler.forEach(g => {
    const t = ajanSonrakiGun(g), x = hfGun(data, t), y = hfGun(sonra, t), gk = AJAN_GUN_KISA[g];
    if (x.antrenman && y.antrenman && x.antrenman.bas !== y.antrenman.bas) L.push({ m: gk + ' ' + x.antrenman.ad + ' ' + hfSaat(x.antrenman.bas) + ' → ' + hfSaat(y.antrenman.bas) });
    if (x.odevKap !== y.odevKap) L.push({ m: gk + ' ödeve kalan süre ' + x.odevKap + ' → ' + y.odevKap + ' dk' });
    if (a.islem === 'ekle') {
      const b = hfDk(a.bas), e = hfDk(a.bit);
      y.bloklar.filter(k => k.bas < e && k.bit > b && !(k.bas === b && k.bit === e) && !ajanAyni(k.label, ajanProgEtiket(a)))
        .forEach(k => L.push({ m: gk + ' ' + k.label + ' ' + hfSaat(k.bas) + '-' + hfSaat(k.bit) + ' ile çakışıyor', uyari: true }));
    }
  });
  return L.slice(0, 8);
}

function ajanCard(mi, ai, a) {
  const st = a.status || 'pending';
  let h = '<div class="ajan-card">';
  let ok = true;
  if (a.type === 'odev_plani') {
    const p = (typeof hwSpread === 'function') ? ajanPlan(a) : null;
    h += '<div class="ajan-head">' + escapeHtml(a.baslik) + '</div>';
    if (!p) h += '<div class="ajan-sub">Plan hazırlanıyor…</div>';
    else {
      const dolu = p.days.filter(d => d.items.length);
      const toplam = p.items.reduce((s, it) => s + (it.estimateMin || AJAN_DEFAULT_MIN), 0);
      h += '<div class="ajan-sub">' + p.items.length + ' iş · ' + dolu.length + ' gün · ~' + toplam + ' dk · son ' + escapeHtml(ajanGun(p.son)) +
        (a.kaynak === 'ozel_ders' ? ' · özel ders' : ' · okul') + '</div>';
      if (st === 'pending') dolu.forEach(d => {
        const sinir = d.kap != null ? d.kap : AJAN_DAY_CAP;   // hafta.js: gerçek boş zaman
        h += '<div class="ajan-day' + (d.min > sinir ? ' over' : '') + '"><div class="ajan-day-h"><span>' + escapeHtml(ajanGun(d.date)) +
          '</span><span>' + d.min + (d.kap != null ? ' / ~' + d.kap : '') + ' dk</span></div>' +
          d.items.map(it => '<div class="ajan-it">' + escapeHtml(it.text) + (it.estimateMin ? ' · ' + it.estimateMin + ' dk' : '') + '</div>').join('') + '</div>';
      });
    }
  } else if (a.type === 'gorev_ekle') {
    h += '<div class="ajan-head">Görev ekle: ' + escapeHtml(a.text) + '</div>';
    const alt = [a.tarih ? ajanGun(a.tarih) : 'tarihsiz', a.dk ? a.dk + ' dk' : '', a.acil ? 'acil' : ''].filter(Boolean).join(' · ');
    h += '<div class="ajan-sub">' + escapeHtml(alt) + '</div>';
  } else if (a.type === 'gorev_tamamla' || a.type === 'gorev_ertele') {
    const t = ajanTask(a.gorevId);
    ok = !!(t && !t.done);
    h += '<div class="ajan-head">' + (a.type === 'gorev_tamamla' ? 'Tamamla: ' : 'Ertele: ') + escapeHtml(t ? t.text : '(görev bulunamadı)') + '</div>';
    if (a.type === 'gorev_ertele') h += '<div class="ajan-sub">Yeni tarih: ' + escapeHtml(ajanGun(a.tarih)) + '</div>';
    if (!ok && st === 'pending') h += '<div class="ajan-sub">Bu görev artık açık değil.</div>';
  } else if (a.type === 'harcama_ekle') {
    const kat = a.kategori || (typeof hrcKategori === 'function' ? hrcKategori(a.not) : null);
    h += '<div class="ajan-head">Harcama: ' + ajanTL(a.tl) + (kat ? ' · ' + escapeHtml(AJAN_HRC_AD[kat] || 'Diğer') : '') + '</div>';
    h += '<div class="ajan-sub">' + escapeHtml([a.not, ajanGun(a.tarih)].filter(Boolean).join(' · ')) + '</div>';
  } else if (a.type === 'ogun_ekle') {
    const y = ajanYemekCoz(a.yemek);
    const ogun = a.ogun || ajanOgunVarsayilan(a.tarih);
    h += '<div class="ajan-head">' + escapeHtml(AJAN_OGUN_AD[ogun] || 'Öğün') + ': ' + escapeHtml(y.name) + '</div>';
    h += y.bilinmiyor
      ? '<div class="ajan-sub uyari">Kalori bilinmiyor — adıyla kaydedilir, Diyet\'ten düzeltebilirsin · ' + escapeHtml(ajanGun(a.tarih)) + '</div>'
      : '<div class="ajan-sub">~' + y.kcal + ' kcal' + (y.protein != null ? ' · ' + y.protein + ' g protein' : '') + ' · ' + escapeHtml(ajanGun(a.tarih)) + '</div>';
  } else if (a.type === 'uyku_kaydet') {
    h += '<div class="ajan-head">Uyku: ' + ajanSayi(a.saat) + ' saat</div>';
    h += '<div class="ajan-sub">' + escapeHtml([a.yatis && a.kalkis ? a.yatis + ' → ' + a.kalkis : '', ajanGun(a.tarih)].filter(Boolean).join(' · ')) + '</div>';
  } else if (a.type === 'program_kaydet') {
    const TUR = { okul: 'Okul saati', ders: 'Ek ders / kurs', dovus: 'Dövüş antrenmanı', sabit: 'Sabit program' };
    const ad = a.tur === 'okul' ? 'Okul' : ajanProgEtiket(a);
    h += '<div class="ajan-head">' + (a.islem === 'sil' ? 'Programdan çıkar: ' : 'Programa ekle: ') + escapeHtml(ad) + '</div>';
    h += '<div class="ajan-sub">' + escapeHtml([a.gunler.length ? a.gunler.map(g => AJAN_GUN_KISA[g]).join(', ') : 'tüm günler', a.bas ? a.bas + '-' + a.bit : '', 'her hafta', TUR[a.tur]].filter(Boolean).join(' · ')) + '</div>';
    if (st === 'pending') ajanProgEtki(a).forEach(x => { h += '<div class="ajan-sub' + (x.uyari ? ' uyari' : '') + '">' + escapeHtml(x.m) + '</div>'; });
  } else if (a.type === 'kilo_kaydet') {
    h += '<div class="ajan-head">Kilo: ' + ajanSayi(a.kg) + ' kg' + (a.yag != null ? ' · yağ %' + ajanSayi(a.yag) : '') + '</div>';
    h += '<div class="ajan-sub">' + escapeHtml(ajanGun(a.tarih)) + '</div>';
  } else {
    return '';
  }
  if (st === 'pending') {
    h += '<div class="ajan-btns"><button class="small" ' + (ok ? '' : 'disabled ') + 'onclick="ajanApply(' + mi + ',' + ai + ')">Uygula</button>' +
      '<button class="small secondary" onclick="ajanDismiss(' + mi + ',' + ai + ')">Vazgeç</button></div>';
  } else if (st === 'applied') h += '<div class="ajan-done">✓ Uygulandı</div>';
  else h += '<div class="ajan-done off">Vazgeçildi</div>';
  return h + '</div>';
}

/** Sohbetteki tüm eylem yuvalarını doldurur (renderChatMessages yuvayı bırakır). */
function renderChatActions() {
  const chat = (typeof ensureChat === 'function') ? ensureChat() : [];
  const slots = document.querySelectorAll('.chat-ajan[data-i]');
  if (!slots.length) return;
  const bekleyen = (t) => [...slots].some(s => { const m = chat[+s.dataset.i]; return m && (m.actions || []).some(a => a.type === t && (a.status || 'pending') === 'pending'); });
  if (bekleyen('odev_plani') && typeof hwSpread !== 'function') {
    // Ödev motoru school.js'te; önce o insin, sonra tekrar çiz.
    Promise.all([loadModule('school'), loadModule('hafta').catch(() => {})]).then(renderChatActions).catch(() => {});
  }
  // Öğün kalorisi besin veritabanından (foods.js) — inmeden kart "bilinmiyor" der, inince yeniden çizilir.
  if (bekleyen('ogun_ekle') && typeof seedFoodMatches !== 'function') loadModule('foods').then(renderChatActions).catch(() => {});
  if (bekleyen('harcama_ekle') && typeof hrcKategori !== 'function') loadModule('harcama').then(renderChatActions).catch(() => {});
  if (bekleyen('program_kaydet') && typeof hfGun !== 'function') loadModule('hafta').then(renderChatActions).catch(() => {});
  slots.forEach(s => {
    const mi = +s.dataset.i, m = chat[mi];
    if (!m || !Array.isArray(m.actions)) { s.innerHTML = ''; return; }
    const kalan = m.actions.filter(a => (a.status || 'pending') === 'pending').length;
    s.innerHTML = (kalan >= 2 ? '<button class="ajan-all" onclick="ajanApplyAll(' + mi + ')">Hepsini uygula (' + kalan + ')</button>' : '') +
      m.actions.map((a, ai) => ajanCard(mi, ai, a)).join('');
  });
}

/** toplu=true: toast/çizim yok, geri alma fonksiyonunu döndürür (ajanApplyAll toplar). */
async function ajanApply(mi, ai, toplu) {
  const m = ensureChat()[mi];
  const a = m && m.actions && m.actions[ai];
  if (!a || (a.status || 'pending') !== 'pending') return null;
  let mesaj = '', geriAl = null;
  if (a.type === 'odev_plani') {
    if (typeof hwSpread !== 'function') { try { await loadModule('school'); } catch (_) { showToast('Ödev motoru yüklenemedi', 'error'); return; } }
    // Kapasite (hafta.js) açılışta zaten iniyor; inmediyse BEKLEME — eşit kapasiteyle dağıt.
    if (typeof hfGun !== 'function') loadModule('hafta').catch(() => {});
    const p = ajanPlan(a);
    const sid = 'hw-' + Date.now();
    const toplam = p.items.length;
    const yeni = [];
    let sira = 0;
    p.days.forEach(g => g.items.forEach(it => {
      sira++;
      const t = makeTask({ text: it.text, due: g.date, category: it.category, estimateMin: it.estimateMin, priority: it.priority });
      t.id = Date.now() * 100 + sira;   // aynı ms'de çakışmasın (ödev paketi dersi)
      t.seriesId = sid; t.seriesName = a.baslik; t.seriesIndex = sira; t.seriesTotal = toplam;
      data.tasks.push(t); yeni.push(t.id);
    }));
    a.taskIds = yeni;
    mesaj = toplam + ' iş ' + p.days.filter(d => d.items.length).length + ' güne dağıtıldı';
    geriAl = () => { const k = new Set(yeni); data.tasks = data.tasks.filter(t => !k.has(t.id)); a.status = 'pending'; delete a.taskIds; save(); renderTasks(); renderChatActions(); };
  } else if (a.type === 'gorev_ekle') {
    const t = makeTask({ text: a.text, due: a.tarih, estimateMin: a.dk, category: a.kategori, priority: a.acil ? 'urgent' : 'normal' });
    data.tasks.push(t);
    a.taskIds = [t.id];
    mesaj = 'Görev eklendi';
    geriAl = () => { data.tasks = data.tasks.filter(x => x.id !== t.id); a.status = 'pending'; save(); renderTasks(); renderChatActions(); };
  } else if (a.type === 'gorev_tamamla') {
    const t = ajanTask(a.gorevId);
    if (!t || t.done) { if (!toplu) showToast('Görev artık açık değil', 'warning'); return null; }
    a.status = 'applied';
    toggleTask(t.id);          // konfeti, kayıt, çizim — normal tamamlama yolu
    if (!toplu) renderChatActions();
    return toplu ? () => { const x = ajanTask(a.gorevId); if (x && x.done) toggleTask(x.id); a.status = 'pending'; } : null;
  } else if (a.type === 'gorev_ertele') {
    const t = ajanTask(a.gorevId);
    if (!t || t.done) { if (!toplu) showToast('Görev artık açık değil', 'warning'); return null; }
    const eski = t.due;
    t.due = a.tarih; t.postponeCount = (t.postponeCount || 0) + 1;
    mesaj = 'Ertelendi: ' + ajanGun(a.tarih);
    geriAl = () => { t.due = eski; t.postponeCount = Math.max(0, (t.postponeCount || 1) - 1); a.status = 'pending'; save(); renderTasks(); renderChatActions(); };
  } else if (a.type === 'harcama_ekle') {
    if (typeof hrcKategori !== 'function') { try { await loadModule('harcama'); } catch (_) {} }
    if (!Array.isArray(data.harcama)) data.harcama = [];
    const kat = a.kategori || (typeof hrcKategori === 'function' ? hrcKategori(a.not) : 'diger');
    const x = { id: Date.now() * 10 + (ai % 10), d: a.tarih, tl: a.tl, not: a.not || '', kat, src: 'sohbet' };
    data.harcama.push(x);
    mesaj = ajanTL(a.tl) + ' harcama kaydedildi';
    geriAl = () => { data.harcama = (data.harcama || []).filter(e => e.id !== x.id); a.status = 'pending'; save(); ajanYenile(); };
  } else if (a.type === 'ogun_ekle') {
    if (typeof seedFoodMatches !== 'function') { try { await loadModule('foods'); } catch (_) {} }
    ensureDiet();
    const y = ajanYemekCoz(a.yemek);     // kalori UYGULAMA anında, veritabanından
    const gun = data.diet.days[a.tarih] || (data.diet.days[a.tarih] = { meals: [], water: 0 });
    gun.meals = gun.meals || [];
    const rec = { id: Date.now() + ai, slot: a.ogun || ajanOgunVarsayilan(a.tarih), name: y.name, kcal: y.kcal, protein: y.protein, carb: y.carb, fat: y.fat,
      at: a.tarih === today() && typeof mealNow === 'function' ? mealNow() : null, src: 'sohbet' };
    gun.meals.push(rec);
    mesaj = y.name + ' öğüne eklendi';
    geriAl = () => { const g = data.diet.days[a.tarih]; if (g) g.meals = (g.meals || []).filter(e => e.id !== rec.id); a.status = 'pending'; save(); ajanYenile(); };
  } else if (a.type === 'uyku_kaydet') {
    ensureSleep();
    const eski = sleepFor(a.tarih);
    const kopya = eski ? JSON.parse(JSON.stringify(eski)) : null;
    const rec = { date: a.tarih, bedtime: a.yatis || null, wake: a.kalkis || null, hours: a.saat, quality: eski ? eski.quality || null : null, src: 'sohbet' };
    if (eski) Object.assign(eski, rec); else data.sleep.push(rec);
    data.sleep = data.sleep.filter(x => x && x.date).sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 60);
    mesaj = 'Uyku kaydedildi: ' + ajanSayi(a.saat) + ' saat';
    geriAl = () => {
      data.sleep = (data.sleep || []).filter(x => x.date !== a.tarih);
      if (kopya) data.sleep.push(kopya);
      data.sleep.sort((x, y) => (x.date < y.date ? 1 : -1));
      a.status = 'pending'; save(); ajanYenile();
    };
  } else if (a.type === 'program_kaydet') {
    ensureDiet();
    const kopya = JSON.stringify({ duzen: (data.diet.nut && data.diet.nut.duzen) || null, fs: data.fixedSchedule || null, plan: data.dayPlan || null });
    ajanProgUygula(data, a);
    const planYeni = ajanProgPlanYenile(a);
    mesaj = (a.islem === 'sil' ? 'Programdan çıkarıldı' : 'Programa eklendi: ' + (a.tur === 'okul' ? 'okul saati' : ajanProgEtiket(a))) + (planYeni ? ' · plan güncellendi' : '');
    geriAl = () => {
      const k = JSON.parse(kopya);
      if (k.plan) data.dayPlan = k.plan;
      data.diet.nut = data.diet.nut || {};
      if (k.duzen) data.diet.nut.duzen = k.duzen; else delete data.diet.nut.duzen;
      if (k.fs) data.fixedSchedule = k.fs; else delete data.fixedSchedule;
      a.status = 'pending'; save(); ajanYenile();
    };
  } else if (a.type === 'kilo_kaydet') {
    ensureDiet();
    const eski = (data.diet.weights || []).find(w => w && w.date === a.tarih);
    const kopya = eski ? JSON.parse(JSON.stringify(eski)) : null;
    const rec = upsertBody({ date: a.tarih, kg: a.kg, fat: a.yag, src: 'sohbet' });   // sınırlar orada
    if (!rec) { if (!toplu) showToast('Geçersiz kilo değeri', 'warning'); return null; }
    mesaj = 'Kilo kaydedildi: ' + ajanSayi(a.kg) + ' kg';
    geriAl = () => {
      data.diet.weights = (data.diet.weights || []).filter(w => w.date !== a.tarih);
      if (kopya) { data.diet.weights.push(kopya); data.diet.weights.sort((x, y) => (x.date < y.date ? -1 : 1)); }
      a.status = 'pending'; save(); ajanYenile();
    };
  } else return null;
  a.status = 'applied';
  if (toplu) return geriAl;
  save(); ajanYenile();
  if (typeof showUndoToast === 'function' && geriAl) showUndoToast(mesaj, geriAl, 6000);
  else showToast(mesaj, 'success');
  return null;
}

/** Uygulamadan sonra açık ekranlar güncellensin (diyet/harcama paneli açıksa). */
function ajanYenile() {
  if (typeof renderTasks === 'function') renderTasks();
  renderChatActions();
  const diet = document.getElementById('diet');
  if (diet && diet.classList.contains('active') && typeof renderDiet === 'function') { try { renderDiet(); } catch (_) {} }
  const hs = document.getElementById('hrcSection');
  if (hs && hs.open && typeof renderHarcama === 'function') renderHarcama();
  if (typeof renderBugunOgun === 'function') renderBugunOgun();   // ana ekran öğün kartı
}

/** Mesajdaki tüm bekleyen eylemler — tek dokunuş, tek "Geri al". */
async function ajanApplyAll(mi) {
  const m = ensureChat()[mi];
  if (!m || !Array.isArray(m.actions)) return;
  const geriler = [];
  let n = 0;
  for (let ai = 0; ai < m.actions.length; ai++) {
    if ((m.actions[ai].status || 'pending') !== 'pending') continue;
    const g = await ajanApply(mi, ai, true);
    if (m.actions[ai].status === 'applied') n++;
    if (g) geriler.push(g);
  }
  save(); ajanYenile();
  if (!n) return;
  const hepsiniGeriAl = () => { geriler.slice().reverse().forEach(g => { try { g(); } catch (_) {} }); save(); ajanYenile(); };
  if (typeof showUndoToast === 'function') showUndoToast(n + ' kayıt uygulandı', hepsiniGeriAl, 8000);
  else showToast(n + ' kayıt uygulandı', 'success');
}

function ajanDismiss(mi, ai) {
  const m = ensureChat()[mi];
  const a = m && m.actions && m.actions[ai];
  if (!a || (a.status || 'pending') !== 'pending') return;
  a.status = 'dismissed';
  save(); renderChatActions();
}

// ============================================================
// 🍽️ ÖĞÜN BEKÇİSİ — bildirimden gelen eylem (17 Eki 2026)
// Worker (runOgunBekci) plan öğün saatinde push atar; dokunuş tasks.js
// köprüsünden buraya gelir: 'yedim' | 'ertele' | 'open' (iOS buton göstermez).
// Yedim = plandaki kalemler öğün kaydına yazılır (kalori PLANDAN, kod hesapladı)
// + bekçi o öğün için susar. Tek dokunuş, Geri al var. Durum worker'la ortak:
// data.ogunBekci = { tarih, g: { 'HH:MM': { d, n, e, es } } }.
// ============================================================
const OGUN_RE = /^\s*(\d{1,2}):(\d{2})\s*·\s*/;
let _ogunGeri = null;
function ogunNorm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m && +m[1] < 24 && +m[2] < 60 ? String(+m[1]).padStart(2, '0') + ':' + m[2] : null;
}
function ogunDurum() {
  const t = today();
  if (!data.ogunBekci || data.ogunBekci.tarih !== t) data.ogunBekci = { tarih: t, g: {} };
  if (!data.ogunBekci.g) data.ogunBekci.g = {};
  return data.ogunBekci.g;
}
function ogunKalemleri(saat) {
  const list = typeof planMealsForDate === 'function' ? planMealsForDate(today()) : [];
  return list.filter(m => { const x = OGUN_RE.exec((m && m.name) || ''); return !!x && ogunNorm(x[1] + ':' + x[2]) === saat; });
}
function ogunYedim(saat) {
  ensureDiet();
  const t = today();
  const gun = data.diet.days[t] || (data.diet.days[t] = { meals: [], water: 0 });
  gun.meals = gun.meals || [];
  const st = ogunDurum();
  const eski = st[saat] ? Object.assign({}, st[saat]) : null;
  st[saat] = Object.assign({}, eski, { d: 'yedi' });
  const at = typeof mealNow === 'function' ? mealNow() : null;
  const num = (v) => (v != null && isFinite(+v) ? +v : null);
  // Aynı öğün iki kez yazılmaz (bildirime iki kez dokunulursa)
  const yeni = gun.meals.some(m => m && m.bekci === saat) ? [] : ogunKalemleri(saat).map((m, i) => ({
    id: Date.now() + i, slot: m.slot || 'atistirma', name: m.name, kcal: num(m.kcal),
    protein: num(m.protein), carb: num(m.carb), fat: num(m.fat), at, bekci: saat, src: 'bekci' }));
  gun.meals.push(...yeni);
  save(); ajanYenile();
  return () => {
    const ids = new Set(yeni.map(x => x.id));
    const g = data.diet.days[t];
    if (g) g.meals = (g.meals || []).filter(e => !ids.has(e.id));
    const s = ogunDurum();
    if (eski) s[saat] = eski; else delete s[saat];
    save(); ajanYenile();
  };
}
function ogunErtele(saat) {
  const st = ogunDurum();
  const n = new Date();
  const e = Math.ceil((n.getHours() * 60 + n.getMinutes() + 15) / 5) * 5;   // cron 5 dk'lık
  st[saat] = Object.assign({}, st[saat], { e, es: null });
  save();
  return String(Math.floor(e / 60) % 24).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0');
}
function ogunAtla(saat) { const st = ogunDurum(); st[saat] = Object.assign({}, st[saat], { d: 'atla' }); save(); }

function ogunSheetKapat() { const el = document.getElementById('ogunSheet'); if (el) el.remove(); }
function ogunSheet(saat, html) {
  ogunSheetKapat();
  const el = document.createElement('div');
  el.id = 'ogunSheet';
  el.className = 'ajan-card ogun-sheet';
  el.setAttribute('role', 'dialog');
  el.innerHTML = html;
  // Değer onclick'e gömülmez (CLAUDE.md kuralı) — data-a + kapanış
  el.addEventListener('click', ev => { const b = ev.target.closest('button[data-a]'); if (b) ogunBekciAksiyon(saat, b.dataset.a); });
  document.body.appendChild(el);
  return el;
}
function ogunBekciAksiyon(saat, act) {
  saat = ogunNorm(saat);
  if (!saat) return;
  const kal = ogunKalemleri(saat);
  if (act === 'yedim') {
    _ogunGeri = ogunYedim(saat);
    const kcal = kal.reduce((s, m) => s + (+m.kcal || 0), 0);
    const el = ogunSheet(saat, '<div class="ajan-head">' + saat + ' öğünü işaretlendi</div><div class="ajan-sub">' +
      (kal.length ? kal.length + ' kalem kaydedildi' + (kcal ? ' · ~' + Math.round(kcal) + ' kcal' : '') : 'Hatırlatma bu öğün için sustu') +
      '</div><div class="ajan-btns"><button class="small secondary" data-a="geri">Geri al</button><button class="small" data-a="kapat">Tamam</button></div>');
    setTimeout(() => { if (el.isConnected) el.remove(); }, 8000);
    return;
  }
  if (act === 'geri') { if (_ogunGeri) { _ogunGeri(); _ogunGeri = null; } ogunSheetKapat(); showToast('Geri alındı', 'info', 2500); return; }
<<<<<<< HEAD
  if (act === 'ertele') { const s = ogunErtele(saat); ogunSheetKapat(); showToast(saat + ' öğünü — ' + s + "'te tekrar hatırlatırım", 'info', 3500); return; }
  if (act === 'atla') { ogunAtla(saat); ogunSheetKapat(); showToast(saat + ' öğünü atlandı, hatırlatma sustu', 'info', 3000); return; }
  if (act === 'kapat') { ogunSheetKapat(); return; }
  // 'open' — iOS: bildirime dokunuldu → soruyu uygulamada sor
  if ((ogunDurum()[saat] || {}).d === 'yedi') { showToast(saat + ' öğünü zaten işaretli', 'success', 2500); return; }
  const liste = kal.map(m => '<div class="ajan-it">• ' + escapeHtml(String(m.name).replace(OGUN_RE, '')) + '</div>').join('');
  ogunSheet(saat, '<div class="ajan-head">' + saat + ' öğünü — yedin mi?</div>' + (liste || '<div class="ajan-sub">Planda kalem yok</div>') +
    '<div class="ajan-btns"><button class="small" data-a="yedim">Yedim</button><button class="small secondary" data-a="ertele">15 dk sonra</button><button class="small secondary" data-a="atla">Atladım</button></div>');
=======
  // 25 Eki: dokunuşla işaretlendikten sonra "aslında yemedim" yolları — önce geri al, sonra ertele/atla
  if (act === 'geriErtele' || act === 'geriAtla') { if (_ogunGeri) { _ogunGeri(); _ogunGeri = null; } return ogunBekciAksiyon(saat, act === 'geriErtele' ? 'ertele' : 'atla'); }
  if (act === 'ertele') { const s = ogunErtele(saat); ogunSheetKapat(); showToast(saat + ' öğünü — ' + s + "'te tekrar hatırlatırım", 'info', 3500); return; }
  if (act === 'atla') { ogunAtla(saat); ogunSheetKapat(); showToast(saat + ' öğünü atlandı, hatırlatma sustu', 'info', 3000); return; }
  if (act === 'kapat') { ogunSheetKapat(); return; }
  // 'open' — iOS: bildirime dokunuldu = YEDİM (25 Eki). Soru kartı sorulunca 12 pingten 0 işaret
  // gelmişti (iki dokunuş isteyen akış yanıtsız kalıyor); hareket molasıyla aynı kural.
  // Yanlış dokunuşa karşı kart: Geri al · Henüz yemedim (15 dk) · Atladım.
  if ((ogunDurum()[saat] || {}).d === 'yedi') { showToast(saat + ' öğünü zaten işaretli', 'success', 2500); return; }
  _ogunGeri = ogunYedim(saat);
  const kcal = kal.reduce((s, m) => s + (+m.kcal || 0), 0);
  const liste = kal.map(m => '<div class="ajan-it">• ' + escapeHtml(String(m.name).replace(OGUN_RE, '')) + '</div>').join('');
  const el = ogunSheet(saat, '<div class="ajan-head">' + saat + ' öğünü — yedim olarak kaydedildi</div>' + liste +
    (kcal ? '<div class="ajan-sub">~' + Math.round(kcal) + ' kcal</div>' : '') +
    '<div class="ajan-btns"><button class="small" data-a="kapat">Tamam</button><button class="small secondary" data-a="geriErtele">Henüz yemedim</button>' +
    '<button class="small secondary" data-a="geriAtla">Atladım</button><button class="small secondary" data-a="geri">Geri al</button></div>');
  setTimeout(() => { if (el.isConnected) el.remove(); }, 15000);
>>>>>>> 3e2e26f6345638f0806ef09ac9bd0f1b252c5648
}
