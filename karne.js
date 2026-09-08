/**
 * karne.js — HAFTALIK KARNE (6 Eyl 2026'da ui.js'ten tasindi)
 *
 * ⚠️ NEDEN TEMBEL: 193 satir, yalniz "Karne" dugmesinden aciliyor. Her
 * acilista inip ayristiriliyordu. `recordDoneHour` ui.js'te KALDI cunku
 * gorev bitince cagriliyor — o gercekten kritik yolda.
 *
 * ⚠️ `openKarneModal` ui.js'te bir KAPI: modulu indirip `karneOpen()`
 * cagiriyor. Modal HTML'i asistan.html'de duruyor (statik), yalniz motor
 * tembel — modal acilma sinifi 'active' olarak kaliyor (25-gorsel-dil).
 */

// ============ HAFTALIK KARNE (istediğinde aç — Karne butonu) ============
let _karneWeek = 'this'; // 'this' | 'last'
const KARNE_CAT = { odev: 'Ödev', ders: 'Özel Ders', ev: 'Ev', kisisel: 'Kişisel', kategorisiz: '• Diğer' };
const KARNE_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const KARNE_DAYS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

// Pazartesi ISO'sundan o haftanın 7 gün dizisini üretir (öğlen demirli → UTC kayması yok)
function daysOfWeekIso(mondayIso) {
  const out = [];
  const base = new Date(mondayIso + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(isoLocal(d));
  }
  return out;
}

// iso tarihinden 1 gün öncesi (öğlen demirli → UTC kayması yok)
function prevDayIso(iso) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return isoLocal(d);
}


// En verimli saat aralığını hesapla. Yeterli veri yoksa (toplam < 6) null döner.
function bestHourInfo() {
  const hs = data.hourStats || {};
  let total = 0;
  const arr = new Array(24).fill(0);
  for (let h = 0; h < 24; h++) { const c = hs[String(h)] || 0; arr[h] = c; total += c; }
  if (total < 6) return { ready: false, total };
  let bestStart = 0, bestSum = -1;
  for (let h = 0; h < 24; h++) {
    const sum = arr[h] + arr[(h + 1) % 24];
    if (sum > bestSum) { bestSum = sum; bestStart = h; }
  }
  const end = (bestStart + 2) % 24;
  const pad = n => String(n).padStart(2, '0');
  const label = `${pad(bestStart)}:00–${pad(end)}:00`;
  let part = '';
  if (bestStart >= 5 && bestStart < 12) part = 'sabah';
  else if (bestStart >= 12 && bestStart < 17) part = 'öğleden sonra';
  else if (bestStart >= 17 && bestStart < 22) part = 'akşam';
  else part = 'gece';
  return { ready: true, total, label, part, count: bestSum };
}

function karneStats(weeksAgo) {
  const start = getMondayIso(weeksAgo * 7);
  // Haftanın sonu: bu hafta → bugün; geçmiş hafta → bir sonraki pazartesiden önceki gün (o haftanın pazarı)
  const end = weeksAgo === 0 ? today() : prevDayIso(getMondayIso((weeksAgo - 1) * 7));
  const tasks = data.tasks || [];
  const done = tasks.filter(t => t.doneDate && t.doneDate >= start && t.doneDate <= end);
  const byCat = {};
  done.forEach(t => { const c = t.category || 'kategorisiz'; byCat[c] = (byCat[c] || 0) + 1; });
  const dayIsos = daysOfWeekIso(start);
  const byDayArr = dayIsos.map(iso => done.filter(t => t.doneDate === iso).length);
  const mitDone = done.filter(t => t.mitDate && t.mitDate >= start && t.mitDate <= end).length;
  let focusMin = 0;
  done.forEach(t => { if (t.actualMin) focusMin += t.actualMin; });
  return { start, end, done: done.length, byCat, dayIsos, byDayArr, mitDone, focusMin };
}

function karneOpen() {
  _karneWeek = 'this';
  renderKarne();
  document.getElementById('karneModal').classList.add('active');
}
function closeKarneModal() {
  document.getElementById('karneModal').classList.remove('active');
}
function setKarneWeek(w) { _karneWeek = w; renderKarne(); }

function renderKarne() {
  const el = document.getElementById('karneBody');
  if (!el) return;
  const which = _karneWeek;
  const weeksAgo = which === 'last' ? 1 : 0;
  const s = karneStats(weeksAgo);
  const other = karneStats(weeksAgo + 1); // gösterilen haftadan bir önceki hafta

  const tabs = `
    <div class="krn-tabs">
      <button class="krn-tab ${which === 'this' ? 'active' : ''}" onclick="setKarneWeek('this')">Bu hafta</button>
      <button class="krn-tab ${which === 'last' ? 'active' : ''}" onclick="setKarneWeek('last')">Geçen hafta</button>
    </div>`;

  // Hiç biten yoksa: nazik boş durum
  if (s.done === 0) {
    const msg = which === 'this'
      ? 'Hafta yeni başladı — ilk görevi bitirince burası dolmaya başlar. '
      : 'Geçen hafta kayıt yok. Sorun değil, önemli olan bugün. ';
    el.innerHTML = tabs + `<div class="krn-empty">${msg}</div>`;
    return;
  }

  // Karşılaştırma
  let cmp = '';
  const diff = s.done - other.done;
  if (other.done > 0 || s.done > 0) {
    if (diff > 0) cmp = `<span class="krn-cmp up">↑ ${diff} fazla</span>`;
    else if (diff < 0) cmp = `<span class="krn-cmp down">↓ ${-diff} az</span>`;
    else cmp = `<span class="krn-cmp flat">= aynı</span>`;
  }
  const cmpNote = which === 'this' ? 'geçen haftaya göre' : 'önceki haftaya göre';

  // Gün gün bar grafik
  const maxDay = Math.max(1, ...s.byDayArr);
  const todayIso = today();
  const bars = s.byDayArr.map((c, i) => {
    const h = c ? Math.max(8, Math.round((c / maxDay) * 100)) : 3;
    const isToday = which === 'this' && s.dayIsos[i] === todayIso;
    return `<div class="krn-bar-col">
      <div class="krn-bar-val">${c || ''}</div>
      <div class="krn-bar ${isToday ? 'today' : ''}" style="height:${h}%;"></div>
      <div class="krn-bar-day ${isToday ? 'today' : ''}">${KARNE_DAYS[i]}</div>
    </div>`;
  }).join('');

  // En verimli gün (2+ biten)
  const maxVal = Math.max(...s.byDayArr);
  const maxIdx = s.byDayArr.indexOf(maxVal);
  const topDay = maxVal >= 2 ? KARNE_DAYS_FULL[maxIdx] : '';

  // Kategori dağılımı
  const catEntries = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...catEntries.map(e => e[1]));
  const catRows = catEntries.map(([k, v]) => `
    <div class="krn-cat-row">
      <span class="krn-cat-lbl">${KARNE_CAT[k] || k}</span>
      <span class="krn-cat-track"><span class="krn-cat-fill" style="width:${Math.round(v / maxCat * 100)}%;"></span></span>
      <span class="krn-cat-num">${v}</span>
    </div>`).join('');

  // Nazik kapanış cümlesi
  let note;
  if (topDay) note = `En verimli günün <b>${topDay}</b> oldu. Zor işleri o güne saklamak işe yarıyor olabilir.`;
  else if (s.mitDone >= 3) note = `<b>${s.mitDone}</b> MIT bitirmişsin — net odak, güzel ritim. `;
  else if (diff > 0) note = `Önceki haftadan <b>${diff}</b> görev fazla. Yükseliştesin `;
  else note = 'Her biten görev bir kazanç. Kendine iyi davran. ';

  // Alt farkındalık (anlık durum)
  const overdue = (data.tasks || []).filter(t => !t.done && t.due && t.due < todayIso).length;
  const stuck = (data.tasks || []).filter(t => !t.done && (t.postponeCount || 0) >= 3).length;
  let footer = '';
  if (overdue || stuck) {
    footer = `<div class="krn-footer">
      ${overdue ? `<span>${overdue} gecikmiş bekliyor</span>` : ''}
      ${stuck ? `<span>${stuck} çok ertelenmiş</span>` : ''}
    </div>`;
  }

  el.innerHTML = tabs + `
    <div class="krn-hero">
      <div class="krn-big">${s.done}</div>
      <div class="krn-big-lbl">görev bitti${cmp ? `<br>${cmp} <span class="krn-cmp-note">${cmpNote}</span>` : ''}</div>
    </div>
    <div class="krn-chart">${bars}</div>
    <div class="krn-statline">
      ${s.mitDone ? `<span class="krn-pill">${s.mitDone} MIT</span>` : ''}
      ${s.focusMin ? `<span class="krn-pill">~${Math.round(s.focusMin)} dk odak</span>` : ''}
      ${catEntries[0] ? `<span class="krn-pill">${KARNE_CAT[catEntries[0][0]] || catEntries[0][0]}</span>` : ''}
    </div>
    ${catRows ? `<div class="krn-section-lbl">Kategori dağılımı</div><div class="krn-cats">${catRows}</div>` : ''}
    ${bestHourBlock()}
    <div class="krn-note">${note}</div>
    ${footer}
  `;
}

// En verimli saat kartı (tüm zaman histogramından). Karnede kategori dağılımının altında.
function bestHourBlock() {
  const bh = bestHourInfo();
  if (!bh.ready) {
    const need = 6 - (bh.total || 0);
    return `<div class="krn-besthour building">${icon('saat')} En verimli saatin: <b>${need} görev daha</b> bitince ortaya çıkar (veri birikiyor).</div>`;
  }
  return `<div class="krn-besthour">
    <div class="krn-besthour-icon">${icon('saat')}</div>
    <div class="krn-besthour-txt">En çok <b>${bh.label}</b> arası (${bh.part}) iş bitiriyorsun.<br>
      <span class="krn-besthour-sub">Zor görevleri bu saate koymayı dene.</span></div>
  </div>`;
}
