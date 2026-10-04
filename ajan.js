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
    '.ajan-done.off{color:var(--text-muted,#9a9389)}';
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
function ajanGun(iso) { return typeof fmtDayLabel === 'function' ? fmtDayLabel(iso) : iso; }

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
  const gerekOkul = [...slots].some(s => { const m = chat[+s.dataset.i]; return m && (m.actions || []).some(a => a.type === 'odev_plani' && (a.status || 'pending') === 'pending'); });
  if (gerekOkul && typeof hwSpread !== 'function') {
    // Ödev motoru school.js'te; önce o insin, sonra tekrar çiz.
    Promise.all([loadModule('school'), loadModule('hafta').catch(() => {})]).then(renderChatActions).catch(() => {});
  }
  slots.forEach(s => {
    const mi = +s.dataset.i, m = chat[mi];
    s.innerHTML = (m && Array.isArray(m.actions)) ? m.actions.map((a, ai) => ajanCard(mi, ai, a)).join('') : '';
  });
}

async function ajanApply(mi, ai) {
  const m = ensureChat()[mi];
  const a = m && m.actions && m.actions[ai];
  if (!a || (a.status || 'pending') !== 'pending') return;
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
    if (!t || t.done) { showToast('Görev artık açık değil', 'warning'); return; }
    a.status = 'applied';
    toggleTask(t.id);          // konfeti, kayıt, çizim — normal tamamlama yolu
    renderChatActions();
    return;
  } else if (a.type === 'gorev_ertele') {
    const t = ajanTask(a.gorevId);
    if (!t || t.done) { showToast('Görev artık açık değil', 'warning'); return; }
    const eski = t.due;
    t.due = a.tarih; t.postponeCount = (t.postponeCount || 0) + 1;
    mesaj = 'Ertelendi: ' + ajanGun(a.tarih);
    geriAl = () => { t.due = eski; t.postponeCount = Math.max(0, (t.postponeCount || 1) - 1); a.status = 'pending'; save(); renderTasks(); renderChatActions(); };
  } else return;
  a.status = 'applied';
  save(); if (typeof renderTasks === 'function') renderTasks();
  renderChatActions();
  if (typeof showUndoToast === 'function' && geriAl) showUndoToast(mesaj, geriAl, 6000);
  else showToast(mesaj, 'success');
}

function ajanDismiss(mi, ai) {
  const m = ensureChat()[mi];
  const a = m && m.actions && m.actions[ai];
  if (!a || (a.status || 'pending') !== 'pending') return;
  a.status = 'dismissed';
  save(); renderChatActions();
}
