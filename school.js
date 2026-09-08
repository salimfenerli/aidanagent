/**
 * school.js — ÖDEV PAKETİ (6 Eyl 2026, v7-176)
 *
 * NEDEN VAR: okuldan haftalık ödev listesi geliyor ve uygulamada onu günlere
 * bölen bir yüzey YOKTU. Dağıtım motoru (`planSeriesDays`) ve seri sistemi
 * (rozet, ilerleme, "yeniden dengele", silme) çoktan yazılmıştı; seriyi KURAN
 * tek yerel yol `/tekrar` komutuydu (aralıklı tekrar, sabit aralıklar).
 * Haftalık ödev için tek yol AI hızlı yakalamaydı — bulut girişi + ağ + AI
 * şart. Yani en sık yapılacak okul işi, en kırılgan yola bağlıydı.
 *
 * ⚠️ BU MODÜL AI KULLANMAZ. Dağıtım deterministik ve offline; uçakta da,
 * bulut girişi yokken de çalışır. `fetch` yasağı teste bağlı.
 *
 * ⚠️ TEMBEL MODÜL. İlk yükleme bütçesi 185 KB ve pay 0.7 KB'ye inmişti;
 * bu blok statik olsaydı bütçe aşılırdı. Yalnız "Ödev paketi" düğmesine
 * basınca iniyor (core.js → loadModule('school')).
 *
 * DAĞITIM KURALI — `planSeriesDays`ten neden FARKLI:
 * O fonksiyon parçaları takvime EŞİT ARALIKLA serpiyor ve günün mevcut
 * yükünü hiç görmüyor. Ödev listesinde asıl soru "kaç gün var" değil
 * "hangi gün ne kadar boş". Burada LPT (en uzun iş önce) + gerçek gün yükü
 * kullanılıyor: her ödev, o an en az dolu güne konuyor. Eşitlikte ERKEN gün
 * kazanıyor — son güne yığmak ödevin tamamını teslim gecesine bırakmaktır.
 */

// Süresi yazılmamış ödevin varsayılan ağırlığı. Sıfır saymak yanlış olurdu:
// süresiz ödevler görünmez ağırlık yapıp bir günü sessizce doldururdu.
const HW_DEFAULT_MIN = 30;
// Okul günü için makul tavan. Aşan gün kırmızı gösteriliyor ama ENGELLENMİYOR
// — bazen hafta gerçekten dolu; kullanıcıya yalan söylemek yerine uyarıyoruz.
const HW_DAY_CAP_MIN = 120;
const HW_MAX_LINES = 40;

let _hwPlan = null;      // { days:[{date, items:[...], min}], sinir, uyari }
let _hwSeriesName = '';

/** Bir günün MEVCUT yükü: o güne due, bitmemiş görevlerin tahmini süresi. */
function hwDayLoad(dateISO) {
  return (data.tasks || [])
    .filter(t => !t.done && t.due === dateISO)
    .reduce((s, t) => s + (t.estimateMin || HW_DEFAULT_MIN), 0);
}

/** start..end arası çalışılabilir günler. */
function hwWorkDays(startISO, endISO, skipWeekends) {
  const out = [];
  let d = startISO;
  let guard = 0;
  while (d <= endISO && guard++ < 400) {
    const dow = new Date(d + 'T00:00:00').getDay();
    if (!(skipWeekends && (dow === 0 || dow === 6))) out.push(d);
    d = shiftDateStr(d, 1);
  }
  // Aralıkta yalnız hafta sonu varsa hafta sonunu kabul et: aksi halde
  // "gün yok" deyip kullanıcıyı çıkışsız bırakırdık.
  if (!out.length) {
    d = startISO; guard = 0;
    while (d <= endISO && guard++ < 400) { out.push(d); d = shiftDateStr(d, 1); }
  }
  return out;
}

/**
 * LPT dağıtımı. items sırası KORUNMAZ (bilinçli: ödevler bağımsız);
 * çıktıdaki her gün kendi içinde giriş sırasına göre sıralanır ki liste
 * kullanıcının yazdığı düzenle okunabilsin.
 */
function hwSpread(items, days) {
  const yuk = {}; days.forEach(d => { yuk[d] = hwDayLoad(d); });
  const yerlesim = {}; days.forEach(d => { yerlesim[d] = []; });
  const sirali = items.map((it, i) => ({ it, i }))
    .sort((a, b) => ((b.it.estimateMin || HW_DEFAULT_MIN) - (a.it.estimateMin || HW_DEFAULT_MIN)) || (a.i - b.i));
  for (const { it, i } of sirali) {
    // Satırda tarih varsa dağıtıma girmez — kullanıcı açıkça gün söylemiş.
    let hedef = (it.due && days.includes(it.due)) ? it.due : null;
    if (!hedef) {
      hedef = days[0];
      for (const d of days) if (yuk[d] < yuk[hedef]) hedef = d;   // eşitlikte erken gün
    }
    yuk[hedef] += (it.estimateMin || HW_DEFAULT_MIN);
    yerlesim[hedef].push({ it, i });
  }
  const plan = days.map(d => ({
    date: d,
    min: yuk[d],
    items: yerlesim[d].sort((a, b) => a.i - b.i).map(x => x.it),
  }));
  return hwFixSeq(plan);
}

/**
 * ⚠️ PARCALAR KRONOLOJIK SIRADA OLMALI. LPT esit boyutlu parcalari gun
 * yukune gore dagitiyor; sonuc "(4/4) yarin, (1/4) persembe" oluyordu —
 * yani 4. parca 1. parcadan once. Parcalarin boyutu ESIT oldugu icin
 * aralarinda yer degistirmek gun yukunu DEGISTIRMEZ; yalniz sira duzelir.
 */
function hwFixSeq(plan) {
  const yuvalar = [];   // { gunIdx, itemIdx }
  plan.forEach((g, gi) => g.items.forEach((it, ii) => { if (it.seq) yuvalar.push({ gi, ii }); }));
  if (yuvalar.length < 2) return plan;
  const parcalar = yuvalar.map(y => plan[y.gi].items[y.ii]).sort((a, b) => a.seq - b.seq);
  yuvalar.forEach((y, k) => { plan[y.gi].items[y.ii] = parcalar[k]; });
  return plan;
}

/** Metin bloğunu ödev kalemlerine çevirir; her satır parseQuickInput'tan geçer. */
function hwParseLines(raw, parca) {
  const satirlar = String(raw || '').split('\n')
    .map(s => s.replace(/^\s*[-*•\d]+[.)]?\s*/, '').trim())
    .filter(Boolean)
    .slice(0, HW_MAX_LINES);
  let items = satirlar.map(s => {
    const p = parseQuickInput(s);
    return {
      text: p.text, estimateMin: p.estimateMin, category: p.category || 'odev',
      priority: p.priority || 'normal', due: p.due, reminderTime: p.reminderTime,
    };
  });
  // TEK ödev + parça sayısı: "40 soru" gibi büyük bir işi bölmek. Süre de
  // bölünüyor; bilinmiyorsa parça başına varsayılan kalıyor.
  const n = Math.max(1, Math.min(12, parseInt(parca, 10) || 1));
  if (items.length === 1 && n > 1) {
    const t = items[0];
    const her = t.estimateMin ? Math.max(5, Math.round(t.estimateMin / n)) : null;
    items = Array.from({ length: n }, (_, i) => Object.assign({}, t, {
      text: `${t.text} (${i + 1}/${n})`, estimateMin: her,
      due: null,          // parçaların tarihi dağıtımdan gelir
      seq: i + 1,         // kronolojik sıra zorunlu — bkz. hwFixSeq
    }));
  }
  return items;
}

// ===== Modal =====
function openHomework() {
  const m = document.getElementById('homeworkModal');
  if (!m) return;
  const dl = document.getElementById('hwDeadline');
  // Varsayılan son tarih: bu haftanın cuması; cuma/hafta sonu ise gelecek cuma.
  if (dl && !dl.value) {
    let d = today(), guard = 0;
    do { d = shiftDateStr(d, 1); } while (new Date(d + 'T00:00:00').getDay() !== 5 && guard++ < 9);
    dl.value = d;
  }
  m.classList.add('active');
  hwPreview();
  setTimeout(() => { const t = document.getElementById('hwText'); if (t) t.focus(); }, 60);
}
function closeHomework() {
  const m = document.getElementById('homeworkModal');
  if (m) m.classList.remove('active');
  _hwPlan = null;
}

function hwPreview() {
  const el = document.getElementById('hwPreview'); if (!el) return;
  const raw = (document.getElementById('hwText') || {}).value || '';
  const parca = (document.getElementById('hwParca') || {}).value || 1;
  const son = (document.getElementById('hwDeadline') || {}).value || '';
  const skipWe = !!(document.getElementById('hwSkipWeekend') || {}).checked;
  const bugunDe = !!(document.getElementById('hwToday') || {}).checked;

  const items = hwParseLines(raw, parca);
  if (!items.length) {
    _hwPlan = null;
    el.innerHTML = '<div class="hw-empty">Her satıra bir ödev yaz. Süre ve tarih yazarsan onlar da okunur — <b>"matematik 45dk"</b>, <b>"çarşamba fizik testi"</b>.</div>';
    hwSyncBtn(); return;
  }
  if (!son) { _hwPlan = null; el.innerHTML = '<div class="hw-empty">Son tarih seç.</div>'; hwSyncBtn(); return; }

  const bas = bugunDe ? today() : shiftDateStr(today(), 1);
  if (son < bas) {
    _hwPlan = null;
    el.innerHTML = `<div class="hw-empty">Son tarih ${bugunDe ? 'bugünden' : 'yarından'} önce olamaz.</div>`;
    hwSyncBtn(); return;
  }
  const days = hwWorkDays(bas, son, skipWe);
  const plan = hwSpread(items, days);
  _hwPlan = { days: plan, items };

  const dolu = plan.filter(d => d.items.length);
  const asan = plan.filter(d => d.min > HW_DAY_CAP_MIN).length;
  const toplam = items.reduce((s, it) => s + (it.estimateMin || HW_DEFAULT_MIN), 0);

  el.innerHTML =
    `<div class="hw-sum">${items.length} ödev · ${dolu.length} güne · toplam ~${toplam} dk` +
      (asan ? ` · <span class="hw-warn">${asan} gün ${HW_DAY_CAP_MIN} dk'yı aşıyor</span>` : '') + '</div>' +
    dolu.map(d => {
      const gunAd = fmtDayLabel ? fmtDayLabel(d.date) : d.date;
      return `<div class="hw-day${d.min > HW_DAY_CAP_MIN ? ' over' : ''}">` +
        `<div class="hw-day-head"><span>${escapeHtml(gunAd)}</span><span class="hw-day-min">${d.min} dk</span></div>` +
        d.items.map(it => `<div class="hw-item">${escapeHtml(it.text)}${it.estimateMin ? ` <span class="hw-item-min">${it.estimateMin} dk</span>` : ''}</div>`).join('') +
        '</div>';
    }).join('');
  hwSyncBtn();
}
function hwSyncBtn() {
  const b = document.getElementById('hwAddBtn');
  if (b) b.disabled = !(_hwPlan && _hwPlan.items && _hwPlan.items.length);
}

/** Gün etiketi: "Bugün" / "Yarın" / "Pzt 8 Eyl". */
function fmtDayLabel(iso) {
  const t = today();
  if (iso === t) return 'Bugün';
  if (iso === shiftDateStr(t, 1)) return 'Yarın';
  const d = new Date(iso + 'T00:00:00');
  const g = GUN_KISA[d.getDay()];
  const ay = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][d.getMonth()];
  return `${g} ${d.getDate()} ${ay}`;
}

function hwAdd() {
  // ⚠️ PLANI ONCE KOPYALA: closeHomework() _hwPlan'i null yapiyor ve asagida
  // toast/geri-al hala ona bakiyordu — "Cannot read properties of null".
  const plan = _hwPlan;
  if (!plan || !plan.items.length) return;
  const ad = ((document.getElementById('hwName') || {}).value || '').trim()
    || ('Ödev paketi · ' + fmtDayLabel(today()));
  const sid = 'hw-' + Date.now();
  const toplam = plan.items.length;
  let sira = 0;
  const yeni = [];
  for (const gun of plan.days) {
    for (const it of gun.items) {
      sira++;
      const t = makeTask({
        text: it.text, due: gun.date, category: it.category,
        estimateMin: it.estimateMin, priority: it.priority, reminderTime: it.reminderTime,
      });
      // ⚠️ makeTask id'yi Date.now() ile veriyor: aynı ms'de 10 görev üretince
      // HEPSİ aynı id alır ve tamamla/sil yanlış kaydı vurur.
      t.id = Date.now() * 100 + sira;
      t.seriesId = sid; t.seriesName = ad;
      t.seriesIndex = sira; t.seriesTotal = toplam;
      data.tasks.push(t);
      yeni.push(t.id);
    }
  }
  save();
  if (typeof renderTasks === 'function') renderTasks();
  closeHomework();
  const geriAl = () => {
    const kume = new Set(yeni);
    data.tasks = (data.tasks || []).filter(t => !kume.has(t.id));
    save(); if (typeof renderTasks === 'function') renderTasks();
  };
  const mesaj = `${toplam} ödev ${plan.days.filter(d => d.items.length).length} güne dağıtıldı`;
  if (typeof showUndoToast === 'function') showUndoToast(mesaj, geriAl, 6000);
  else showToast(mesaj, 'success');
  // Seri modalı zaten ilerleme/yeniden dengeleme/silme sunuyor — paketi
  // kurduktan sonra oraya düşmek "ne oldu" sorusunu tek adımda cevaplıyor.
  if (typeof showSeries === 'function') setTimeout(() => showSeries(sid), 350);
}

// ============================================================
// OKUL BLOĞU — 6 Eyl 2026'da ui.js'ten BURAYA TAŞINDI.
// ⚠️ Neden: ödev paketi eklenince ilk yükleme 185.4 KB'ye çıktı ve bütçe
// 185. Doğru cevap eşiği yükseltmek değil BORÇ ÖDEMEKTİ. Bu blok yalnız
// Görevler sekmesindeki KAPALI `<details id="schoolSection">` panelinden ve
// bir de global aramadan görünüyor; kritik yolda hiçbir işi yoktu.
// ⚠️ Çağrı yerleri artık `typeof renderSchool === 'function'` ile korunuyor
// (tasks.js showTab + ui.js açılış) — modül inmeden çağrılırsa sessizce
// bekliyor, inince panel doluyor.
// Ödev paketi ile aynı dosyada olması tesadüf değil: ikisi de OKUL alanı.
// ============================================================

// ============ OKUL (ders programı + sınavlar) ============
// data.school = { timetable:{'1'..'5':[dersler]}, exams:[{id,subject,date,topics}] }
// Ödevler ayrı: mevcut görev sisteminde (Ödev/Özel Ders kategorileri) kalır.
const SCHOOL_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const SCHOOL_DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'];

function ensureSchool() {
  if (!data.school) data.school = { timetable: {}, exams: [] };
  if (!data.school.timetable) data.school.timetable = {};
  if (!data.school.exams) data.school.exams = [];
  return data.school;
}

// JS getDay: 0=Paz..6=Cmt. Program anahtarı 1..5 (Pzt..Cuma). Hafta sonu → null.
function todaySchoolKey() {
  const d = new Date().getDay();
  return (d >= 1 && d <= 5) ? String(d) : null;
}

// ============ 🎓 CLASSROOM GÖRSELİNDEN ÖDEV — AI vision → son tarihli görev ============
// Okul hesabı OAuth/takvim beslemesine kapalı → görsel köprüsü (borsa portföy-görsel deseni).
const CLASSROOM_IMAGE_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/classroom-image';
let _clImportItems = [];

async function handleClassroomPhoto(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;
  if (!window._supa || !window._user) { showToast('Önce Ayarlar → bulut girişi yap', 'warning', 4000); return; }
  openClassroomImport();
  setClImportStatus('Görsel hazırlanıyor…');
  try {
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum yok');

    // Sayfalarca ödev → birden fazla ekran görüntüsü; her birini oku, sonuçları birleştir
    const all = [];
    let firstEmpty = null;
    for (let idx = 0; idx < files.length; idx++) {
      setClImportStatus(files.length > 1
        ? `Aidan ödevleri okuyor… (${idx + 1}/${files.length}) — 10-15 sn/görsel, sabret`
        : 'Aidan ödevleri okuyor… 10-15 sn sürebilir, sabret');
      const dataUrl = await resizeImageToDataUrl(files[idx]);
      const r = await fetch(CLASSROOM_IMAGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ image: dataUrl }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || ('hata ' + r.status));
      const items = Array.isArray(j.items) ? j.items : [];
      if (!items.length && !firstEmpty) firstEmpty = j;
      all.push(...items);
    }

    // Çakışan ödevleri (aynı başlık+tarih) tek satıra indir — görseller üst üste binebilir
    const merged = mergeClassroomItems(all);
    if (!merged.length) {
      let dbg = '';
      if (firstEmpty && firstEmpty.aiError) dbg = `\n\n(AI hatası: ${firstEmpty.aiError})`;
      else if (firstEmpty && firstEmpty.raw) dbg = `\n\n(AI cevabı: ${String(firstEmpty.raw).slice(0, 200)})`;
      setClImportStatus('Görsel(ler)de ödev bulamadım. Ödev/yapılacaklar listesinin net bir görüntüsünü dene.' + dbg, true);
      return;
    }
    _clImportItems = merged;
    renderClImportList();
  } catch (e) {
    setClImportStatus('Okuma başarısız: ' + e.message, true);
  }
}

// Çoklu görsel: aynı ödev (başlık+tarih) birden çok görselde çıkarsa tek satıra indir.
// Aynı başlık farklı tarihle iki kez varsa ikisi de kalır (farklı ödev sayılır).
function mergeClassroomItems(list) {
  const seen = new Map();
  const norm = s => (s || '').trim().toLowerCase();
  for (const it of list) {
    const title = (it && it.title || '').trim();
    if (!title) continue;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(it.due || '') ? it.due : null;
    const key = norm(title) + '|' + (due || '');
    if (!seen.has(key)) { seen.set(key, { title, due, course: (it.course || '').trim() || null }); continue; }
    const cur = seen.get(key);
    if (!cur.course && it.course) cur.course = (it.course || '').trim() || null; // eksik ders bilgisini doldur
  }
  return Array.from(seen.values());
}

function setClImportStatus(msg, isError) {
  const el = document.getElementById('classroomImportStatus');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
}

function openClassroomImport() {
  _clImportItems = [];
  document.getElementById('classroomImportList').innerHTML = '';
  document.getElementById('classroomImportActions').style.display = 'none';
  document.getElementById('classroomImportModal').classList.add('active');
}

function closeClassroomImport() {
  document.getElementById('classroomImportModal').classList.remove('active');
  _clImportItems = [];
}

// AI sonuçları düzenlenebilir satır — başlık + son tarih (vision hata yapabilir, kullanıcı düzeltsin)
function renderClImportList() {
  setClImportStatus(`${_clImportItems.length} ödev buldum. Kontrol et, düzelt, ekle`);
  const list = document.getElementById('classroomImportList');
  list.innerHTML = _clImportItems.map((it, i) => `
    <div class="cl-import-row">
      <input class="cl-imp-title" value="${escapeHtml(it.title || '')}" oninput="updateClImport(${i},'title',this.value)" placeholder="Ödev adı">
      <div class="cl-imp-bot">
        <label>Son tarih<input class="cl-imp-due" type="date" value="${escapeHtml(it.due || '')}" onchange="updateClImport(${i},'due',this.value)"></label>
        <input class="cl-imp-course" value="${escapeHtml(it.course || '')}" oninput="updateClImport(${i},'course',this.value)" placeholder="Ders (opsiyonel)">
        <button class="cl-imp-del" onclick="removeClImport(${i})" title="Çıkar" aria-label="Çıkar">✕</button>
      </div>
    </div>
  `).join('');
  document.getElementById('classroomImportActions').style.display = 'flex';
}

function updateClImport(i, field, val) {
  if (!_clImportItems[i]) return;
  if (field === 'due') _clImportItems[i].due = /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
  else _clImportItems[i][field] = val;
}

function removeClImport(i) {
  _clImportItems.splice(i, 1);
  if (!_clImportItems.length) {
    setClImportStatus('Liste boş. İptal et ya da yeni görsel dene.', true);
    document.getElementById('classroomImportActions').style.display = 'none';
    document.getElementById('classroomImportList').innerHTML = '';
    return;
  }
  renderClImportList();
}

// Onaylanan ödevleri görev olarak ekle — aynı başlık+tarih varsa atla (tekrar görüntüde çift olmasın)
function confirmClassroomImport() {
  const norm = s => (s || '').trim().toLowerCase();
  const active = (data.tasks || []).filter(x => !x.done);
  let added = 0, dup = 0;
  for (const it of _clImportItems) {
    const title = (it.title || '').trim();
    if (!title) continue;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(it.due || '') ? it.due : null;
    const exists = active.some(x => norm(x.text) === norm(title) && (x.due || null) === due);
    if (exists) { dup++; continue; }
    const task = makeTask({ text: title, due, category: 'odev', priority: 'normal' });
    const course = (it.course || '').trim();
    if (course) task.notes = course;
    data.tasks.push(task);
    added++;
  }
  save(); renderTasks();
  closeClassroomImport();
  if (added) showToast(`${added} ödev görevlere eklendi${dup ? ` · ${dup} zaten vardı` : ''}`, 'success', 3800);
  else showToast(dup ? `Hepsi zaten görevlerinde (${dup})` : 'Ödev eklenmedi', 'info', 3000);
}

function renderSchool() {
  const s = ensureSchool();
  const key = todaySchoolKey();
  // Bugünün dersleri
  const todayEl = document.getElementById('schoolToday');
  if (todayEl) {
    const lessons = key ? (s.timetable[key] || []) : [];
    if (!key) todayEl.innerHTML = '<span class="school-today-empty">Bugün hafta sonu — ders yok.</span>';
    else if (!lessons.length) todayEl.innerHTML = '<span class="school-today-empty">Bugüne ders girilmemiş — programı düzenle.</span>';
    else todayEl.innerHTML = '<span class="school-today-lbl">Bugün:</span> ' +
      lessons.map(l => `<span class="school-chip">${escapeHtml(l)}</span>`).join('');
  }
  // Haftalık program grid
  const gridEl = document.getElementById('schoolGrid');
  if (gridEl) {
    gridEl.innerHTML = SCHOOL_DAYS.map((name, i) => {
      const k = String(i + 1);
      const lessons = s.timetable[k] || [];
      const chips = lessons.length
        ? lessons.map(l => `<span class="school-gchip">${escapeHtml(l)}</span>`).join('')
        : '<span class="school-gempty">—</span>';
      return `<div class="school-gcol ${k === key ? 'today' : ''}">
        <div class="school-gday">${SCHOOL_DAYS_SHORT[i]}</div>
        <div class="school-gchips">${chips}</div>
      </div>`;
    }).join('');
  }
  // Sınavlar
  const examEl = document.getElementById('schoolExams');
  if (examEl) {
    const list = (s.exams || []).slice()
      .map(e => ({ ...e, days: daysUntilCountdown(e.date) }))
      .filter(e => e.days == null || e.days >= -3)
      .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
    if (!list.length) examEl.innerHTML = '<div class="school-exam-empty">Yaklaşan sınav yok.</div>';
    else examEl.innerHTML = list.map(e => {
      let cls = '';
      if (e.days != null) { if (e.days < 0) cls = 'past'; else if (e.days <= 3) cls = 'urgent'; else if (e.days <= 10) cls = 'warn'; }
      const dstr = e.days == null ? '' : (e.days < 0 ? 'geçti' : (e.days === 0 ? 'BUGÜN' : `${e.days} gün`));
      return `<div class="school-exam ${cls}">
        <div class="school-exam-days">${dstr}</div>
        <div class="school-exam-info">
          <div class="school-exam-subj">${escapeHtml(e.subject || 'Sınav')}</div>
          <div class="school-exam-meta">${formatTrDate(e.date)}${e.topics ? ' · ' + escapeHtml(e.topics) : ''}</div>
        </div>
        <button class="del-btn" onclick="deleteExam(${e.id})" title="Sil">✕</button>
      </div>`;
    }).join('');
  }
  // Rozet: bugünün ders sayısı + yaklaşan sınav (7 gün)
  const badge = document.getElementById('schoolBadge');
  if (badge) {
    const lc = key ? (s.timetable[key] || []).length : 0;
    const soon = (s.exams || []).filter(e => { const d = daysUntilCountdown(e.date); return d != null && d >= 0 && d <= 7; }).length;
    const bits = [];
    if (lc) bits.push(`${lc} ders`);
    if (soon) bits.push(`${soon} sınav`);
    badge.textContent = bits.length ? bits.join(' · ') : '';
  }
}

function openTimetable() {
  const s = ensureSchool();
  for (let i = 1; i <= 5; i++) {
    const inp = document.getElementById('ttDay' + i);
    if (inp) inp.value = (s.timetable[String(i)] || []).join(', ');
  }
  document.getElementById('timetableModal').classList.add('active');
}
function closeTimetable() {
  document.getElementById('timetableModal').classList.remove('active');
}
function saveTimetable() {
  const s = ensureSchool();
  for (let i = 1; i <= 5; i++) {
    const inp = document.getElementById('ttDay' + i);
    if (!inp) continue;
    const lessons = inp.value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 12);
    if (lessons.length) s.timetable[String(i)] = lessons;
    else delete s.timetable[String(i)];
  }
  save();
  renderSchool();
  closeTimetable();
  showToast('Ders programı kaydedildi', 'success', 2500);
}

function addExam() {
  const s = ensureSchool();
  const subj = document.getElementById('examSubject').value.trim();
  const date = document.getElementById('examDate').value;
  const topics = document.getElementById('examTopics').value.trim();
  if (!subj) { showToast('Ders adı yaz — örn. "Matematik"', 'warning', 3000); return; }
  if (!date) { showToast('Sınav tarihi seç', 'warning', 3000); return; }
  s.exams.push({ id: Date.now(), subject: subj, date, topics });
  document.getElementById('examSubject').value = '';
  document.getElementById('examDate').value = '';
  document.getElementById('examTopics').value = '';
  save();
  renderSchool();
  showToast(`"${subj}" sınavı eklendi`, 'success', 2500);
}
function deleteExam(id) {
  const s = ensureSchool();
  s.exams = (s.exams || []).filter(x => x.id !== id);
  save();
  renderSchool();
  showToast('Sınav silindi', 'info', 2000);
}
