/**
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
      (!o.siradaYarin && o.sirada.bas > dk ? ' · ' + (o.sirada.bas - dk) + ' dk sonra' : '') + '</small></div>';
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
  // Bugünün 3'ü kartın hemen altına
  const mit = tasks.querySelector('.mit-box');
  if (mit) kart.after(mit);
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
