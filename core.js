
// ============ VERİ ============
let data = JSON.parse(localStorage.getItem('aidan') || '{}');
data.tasks = data.tasks || [];
data.dumps = data.dumps || [];
data.pushLog = data.pushLog || [];
data.journal = data.journal || [];
data.reminders = data.reminders || [];  // sabit hatırlatıcılar (ilaç/su/ders) — Worker 15dk cron push'lar
data.watchlist = data.watchlist || [];
data.portfolioHistory = data.portfolioHistory || [];  // [{date:'YYYY-MM-DD', byCur:{TRY:{value,cost}}}]
data.pomoToday = data.pomoToday || { date: today(), count: 0 };
data.settings = data.settings || {};
if (data.lastWeeklyView === undefined) data.lastWeeklyView = null;
data.templates = data.templates || [];
// Gün planı — saat saat bloklar. Sadece BUGÜN için; tarih değişince temizlenir.
data.dayPlan = data.dayPlan || { date: today(), blocks: [] };
if (data.dayPlan.date !== today()) data.dayPlan = { date: today(), blocks: [] };
if (data.pomoToday.date !== today()) data.pomoToday = { date: today(), count: 0 };
ensureDiet();  // diyet sekmesi veri yapısı (kalori/su günlüğü + kilo trendi)

// Geriye uyumluluk: eski görevlere yeni alanlar ekle
data.tasks.forEach(t => {
  if (t.priority === undefined) t.priority = 'normal';
  if (t.due === undefined) t.due = null;
  if (t.estimateMin === undefined) t.estimateMin = null;
  if (t.actualMin === undefined) t.actualMin = null;
  if (t.repeat === undefined) t.repeat = null;
  if (t.category === undefined) t.category = null;
  if (t.doneDate === undefined) t.doneDate = null;
  if (t.mitDate === undefined) t.mitDate = null;
  if (t.reminderTime === undefined) t.reminderTime = null;
  if (t.lastReminded === undefined) t.lastReminded = null;
  if (t.seriesId === undefined) t.seriesId = null;
  if (t.seriesName === undefined) t.seriesName = null;
  if (t.seriesIndex === undefined) t.seriesIndex = null;
  if (t.seriesTotal === undefined) t.seriesTotal = null;
  if (t.postponeCount === undefined) t.postponeCount = 0;   // kaç kez ertelendi (farkındalık nudge için)
  if (t.nudgeDismissed === undefined) t.nudgeDismissed = false;
});

function today() { return new Date().toISOString().slice(0,10); }
function save() {
  localStorage.setItem('aidan', JSON.stringify(data));
  if (window._supa && window._user) schedulePush();
}

// Diyet veri yapısını garanti et (init + bulut pull + realtime sync hepsi çağırır)
// data.diet = { kcalGoal, waterGoal, days:{ 'YYYY-MM-DD':{meals:[{id,slot,name,kcal}], water} }, weights:[{date,kg}] }
function ensureDiet() {
  data.diet = data.diet || {};
  const d = data.diet;
  if (d.kcalGoal === undefined) d.kcalGoal = 2000;   // günlük kalori hedefi
  if (d.waterGoal === undefined) d.waterGoal = 8;    // (eski) bardak — geriye uyumluluk
  if (d.waterGoalL === undefined) d.waterGoalL = 2.5; // günlük su hedefi (litre)
  d.days = d.days || {};
  d.weights = d.weights || [];
  d.plan = d.plan || [];   // diyet programı (her gün aynı şablon): [{id, slot, name, kcal}]
  // Makro hedefleri — kcal hedefinden türetilen varsayılan (protein %25, karb %50, yağ %25)
  if (d.proteinGoal === undefined) d.proteinGoal = Math.round((d.kcalGoal || 2000) * 0.25 / 4);
  if (d.carbGoal === undefined) d.carbGoal = Math.round((d.kcalGoal || 2000) * 0.50 / 4);
  if (d.fatGoal === undefined) d.fatGoal = Math.round((d.kcalGoal || 2000) * 0.25 / 9);
  d.freqHidden = d.freqHidden || [];
  d.freqPinned = d.freqPinned || [];
  d.recentFoods = d.recentFoods || [];
}
// Seçili diyet günü (varsayılan bugün). _dietDate ile geçmiş günlere gezilir.
let _dietDate = null;
function dietKey() { return _dietDate || today(); }
function dietDay(create = true) {
  ensureDiet();
  const k = dietKey();
  if (!data.diet.days[k]) {
    if (!create) return { meals: [], waterL: 0 };
    data.diet.days[k] = { meals: [], water: 0 };
  }
  return data.diet.days[k];
}
// Tarih gezinme
function shiftDateStr(dateStr, delta) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
function dietDateShift(delta) {
  const next = shiftDateStr(dietKey(), delta);
  if (next > today()) return;          // gelecek yok
  _dietDate = (next === today()) ? null : next;
  renderDiet();
}
function dietDateToday() { _dietDate = null; renderDiet(); }
function renderDietDateNav() {
  const lbl = document.getElementById('dietDateLabel');
  const nextBtn = document.getElementById('dietDateNext');
  if (!lbl) return;
  const k = dietKey(), t = today();
  let text;
  if (k === t) text = 'Bugün';
  else if (k === shiftDateStr(t, -1)) text = 'Dün';
  else text = new Date(k + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
  lbl.textContent = text;
  if (nextBtn) nextBtn.disabled = (k === t);
}

// ===== DİYET render + handler =====
const MEAL_SLOTS = { kahvalti: 'Kahvaltı', ogle: 'Öğle', aksam: 'Akşam', atistirma: 'Atıştırma' };

function renderDiet() {
  ensureDiet();
  renderDietDateNav();
  const d = data.diet, day = dietDay(false);
  // Kalori toplamı + ring
  const totalKcal = day.meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
  const goal = d.kcalGoal || 2000;
  const left = goal - totalKcal;
  const numEl = document.getElementById('dietKcalNum');
  numEl.textContent = left;
  numEl.classList.toggle('over', left < 0);
  document.getElementById('dietKcalSub').textContent = 'kalan kcal';
  const cgEl = document.getElementById('calGoal'); if (cgEl) cgEl.textContent = goal;
  const cfEl = document.getElementById('calFood'); if (cfEl) cfEl.textContent = totalKcal;
  const r = 52, circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, goal ? totalKcal / goal : 0));
  const fg = document.getElementById('dietRingFg');
  fg.style.strokeDasharray = circ.toFixed(1);
  fg.style.strokeDashoffset = (circ * (1 - pct)).toFixed(1);
  fg.classList.toggle('over', totalKcal > goal);
  // Alt bölümler
  renderDietPlan();
  renderWater();
  renderDiary();
  renderFrequentMeals();
  renderWeightTrend();
  renderSupplements();
  renderMacroBars();
  // Hedef inputları
  const gk = document.getElementById('goalKcal'); if (gk) gk.value = d.kcalGoal;
  const gw = document.getElementById('goalWater'); if (gw) gw.value = (d.waterGoalL || 2.5);
  const gp = document.getElementById('goalProtein'); if (gp) gp.value = d.proteinGoal;
  const gc = document.getElementById('goalCarb'); if (gc) gc.value = d.carbGoal;
  const gf = document.getElementById('goalFat'); if (gf) gf.value = d.fatGoal;
}

// --- Su ---
// Litre format: 1.5 -> "1,5" (Turkce gosterim). Sondaki sifir atilir.
function fmtL(n) { return (Math.round((Number(n) || 0) * 100) / 100).toString().replace('.', ','); }
function renderWater() {
  const d = data.diet, day = dietDay(false);
  const goal = d.waterGoalL || 2.5, cur = Math.round((day.waterL || 0) * 100) / 100;
  document.getElementById('waterMeta').textContent = fmtL(cur) + ' / ' + fmtL(goal) + ' L';
  document.getElementById('waterFill').style.width = Math.min(100, goal ? (cur / goal * 100) : 0).toFixed(0) + '%';
}
function addWaterL(delta) { const day = dietDay(); day.waterL = Math.max(0, Math.round(((day.waterL || 0) + delta) * 100) / 100); save(); renderDiet(); }
function setWaterL() {
  const el = document.getElementById('waterSet');
  const v = parseFloat((el.value || '').replace(',', '.'));
  if (isNaN(v) || v < 0) { showToast('Geçerli litre gir (örn. 1,5)', 'info'); el.focus(); return; }
  const day = dietDay(); day.waterL = Math.min(20, Math.round(v * 100) / 100);
  el.value = ''; save(); renderDiet();
}

// --- Öğün ---
let _mealSlot = 'kahvalti';
function selectMealSlot(slot, btn) {
  _mealSlot = slot;
  btn.parentElement.querySelectorAll('.slot-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
}
function addMeal() {
  const nameEl = document.getElementById('mealName'), kcalEl = document.getElementById('mealKcal');
  const name = (nameEl.value || '').trim();
  if (!name) { showToast('Ne yediğini yaz', 'info'); nameEl.focus(); return; }
  const kcal = kcalEl.value !== '' ? Math.max(0, parseInt(kcalEl.value, 10) || 0) : null;
  const day = dietDay();
  const pm = _pendingMacros || {};
  day.meals.push({ id: Date.now(), slot: _mealSlot, name, kcal, protein: pm.protein != null ? pm.protein : null, carb: pm.carb != null ? pm.carb : null, fat: pm.fat != null ? pm.fat : null });
  _pendingMacros = null;
  const _mp = document.getElementById('macroPending'); if (_mp) _mp.textContent = '';
  const _mr = document.getElementById('macroResult'); if (_mr) _mr.innerHTML = '';
  nameEl.value = ''; kcalEl.value = '';
  save(); renderDiet(); closeFoodModal(); nameEl.focus();
}
function removeMeal(id) { const day = dietDay(); day.meals = day.meals.filter(m => m.id !== id); save(); renderDiet(); }
function renderMealList() {
  const day = dietDay(false), el = document.getElementById('mealList');
  if (!day.meals.length) { el.innerHTML = '<div class="diet-empty">Henüz öğün eklenmedi.</div>'; return; }
  let html = '';
  Object.keys(MEAL_SLOTS).forEach(slot => {
    const items = day.meals.filter(m => m.slot === slot);
    if (!items.length) return;
    const sub = items.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
    html += `<div class="meal-group"><div class="meal-group-head">${MEAL_SLOTS[slot]}${sub ? ` · ${sub} kcal` : ''}</div>`;
    items.forEach(m => {
      const macroTag = (m.protein != null || m.carb != null || m.fat != null) ? ` · P${m.protein || 0} K${m.carb || 0} Y${m.fat || 0}` : '';
      html += `<div class="meal-item"><span class="meal-name meal-name-edit" onclick="editMeal(${m.id})">${escapeHtml(m.name)}</span><span class="meal-kcal-tag">${m.kcal != null ? m.kcal + ' kcal' : ''}${macroTag}</span><button class="meal-del" onclick="removeMeal(${m.id})" title="Sil" aria-label="Sil">✕</button></div>`;
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

// --- Sık yediklerin (geçmişten türetilir, tek tık tekrar ekle) ---
function frequentMeals(limit = 8) {
  ensureDiet();
  const days = data.diet.days || {};
  const map = new Map();
  const keys = Object.keys(days).sort();   // eski->yeni: son görülen kcal/slot güncel kalsın
  for (const dk of keys) {
    const meals = (days[dk].meals) || [];
    for (const m of meals) {
      const name = String(m.name || '').trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase('tr');
      const e = map.get(key) || { name, count: 0, kcal: null, protein: null, carb: null, fat: null, slot: 'atistirma', last: '' };
      e.count++; e.name = name;
      if (m.kcal != null) e.kcal = m.kcal;
      if (m.protein != null) e.protein = m.protein;
      if (m.carb != null) e.carb = m.carb;
      if (m.fat != null) e.fat = m.fat;
      if (m.slot) e.slot = m.slot;
      e.last = dk;
      map.set(key, e);
    }
  }
  const hidden = data.diet.freqHidden || [], pinned = data.diet.freqPinned || [];
  return [...map.values()]
    .filter(e => !hidden.includes(e.name.toLocaleLowerCase('tr')))
    .sort((a, b) => {
      const pa = pinned.includes(a.name.toLocaleLowerCase('tr')) ? 1 : 0;
      const pb = pinned.includes(b.name.toLocaleLowerCase('tr')) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b.count - a.count || (a.last < b.last ? 1 : -1);
    }).slice(0, limit);
}
let _freqMeals = [];
let _freqEdit = false;
function toggleFreqEdit() { _freqEdit = !_freqEdit; renderFrequentMeals(); }
function renderFrequentMeals() {
  _freqMeals = frequentMeals(10);
  const el = document.getElementById('freqMeals');
  if (!el) return;
  if (!_freqMeals.length) { el.innerHTML = ''; _freqEdit = false; return; }
  const pinned = data.diet.freqPinned || [];
  const head = `<div class="freq-head">Sık yediklerin <button class="freq-editbtn" onclick="toggleFreqEdit()">${_freqEdit ? 'bitti' : 'düzenle'}</button></div>`;
  const chips = _freqMeals.map((m, i) => {
    const low = m.name.toLocaleLowerCase('tr');
    const isPin = pinned.includes(low);
    if (_freqEdit) {
      return `<span class="freq-chip-edit"><button class="freq-pin${isPin ? ' on' : ''}" onclick="pinFreq(${i})" title="Sabitle">★</button><span class="freq-chip-name">${escapeHtml(m.name)}</span><button class="freq-hide" onclick="hideFreq(${i})" title="Gizle">✕</button></span>`;
    }
    return `<button class="freq-chip${isPin ? ' pinned' : ''}" onclick="quickAddMeal(${i})" title="Ekle">${escapeHtml(m.name)}${m.kcal != null ? ` · ${m.kcal}` : ''}</button>`;
  }).join('');
  el.innerHTML = head + '<div class="freq-chips">' + chips + '</div>';
}
function hideFreq(i) {
  const m = _freqMeals[i]; if (!m) return; ensureDiet();
  const low = m.name.toLocaleLowerCase('tr');
  if (!data.diet.freqHidden.includes(low)) data.diet.freqHidden.push(low);
  data.diet.freqPinned = (data.diet.freqPinned || []).filter(x => x !== low);
  save(); renderFrequentMeals();
}
function pinFreq(i) {
  const m = _freqMeals[i]; if (!m) return; ensureDiet();
  const low = m.name.toLocaleLowerCase('tr');
  const arr = data.diet.freqPinned;
  const ix = arr.indexOf(low);
  if (ix >= 0) arr.splice(ix, 1); else arr.push(low);
  save(); renderFrequentMeals();
}
function quickAddMeal(i) {
  const m = _freqMeals[i];
  if (!m) return;
  const day = dietDay();
  day.meals.push({ id: Date.now(), slot: m.slot || _mealSlot || 'atistirma', name: m.name, kcal: (m.kcal != null ? m.kcal : null), protein: m.protein, carb: m.carb, fat: m.fat });
  save(); renderDiet(); closeFoodModal();
  showToast(m.name + ' eklendi', 'success');
}

// --- Kilo ---
function logWeight() {
  const el = document.getElementById('weightKg');
  const kg = parseFloat((el.value || '').replace(',', '.'));
  if (!kg || kg <= 0 || kg > 500) { showToast('Geçerli kilo gir', 'info'); el.focus(); return; }
  ensureDiet();
  const k = dietKey(), arr = data.diet.weights;
  const ex = arr.find(w => w.date === k);
  if (ex) ex.kg = kg; else arr.push({ date: k, kg });
  arr.sort((a, b) => a.date < b.date ? -1 : 1);
  el.value = '';
  save(); renderDiet();
  showToast('Kilo kaydedildi', 'success');
}
function renderWeightTrend() {
  const arr = (data.diet.weights || []);
  const el = document.getElementById('weightTrend'), meta = document.getElementById('weightMeta');
  if (arr.length < 2) {
    el.innerHTML = '<div class="diet-empty">En az 2 kayıt olunca trend görünür.</div>';
    meta.textContent = arr.length ? arr[arr.length - 1].kg + ' kg' : '';
    return;
  }
  const vals = arr.map(w => w.kg);
  el.innerHTML = sparkline(vals);
  const first = vals[0], last = vals[vals.length - 1], diff = +(last - first).toFixed(1);
  const sign = diff > 0 ? '+' : '';
  meta.innerHTML = `${last} kg · <span class="${diff > 0 ? 'wt-up' : (diff < 0 ? 'wt-down' : '')}">${sign}${diff} kg</span>`;
}

// --- Hedefler ---
function setDietGoals() {
  ensureDiet();
  const gk = parseInt(document.getElementById('goalKcal').value, 10);
  const gw = parseFloat((document.getElementById('goalWater').value || '').replace(',', '.'));
  if (gk > 0) data.diet.kcalGoal = gk;
  if (gw > 0) data.diet.waterGoalL = Math.min(10, Math.round(gw * 100) / 100);
  const gp = parseInt(document.getElementById('goalProtein').value, 10);
  const gc = parseInt(document.getElementById('goalCarb').value, 10);
  const gf = parseInt(document.getElementById('goalFat').value, 10);
  if (isFinite(gp) && gp >= 0) data.diet.proteinGoal = gp;
  if (isFinite(gc) && gc >= 0) data.diet.carbGoal = gc;
  if (isFinite(gf) && gf >= 0) data.diet.fatGoal = gf;
  save(); renderDiet();
}

// --- Öğün hatırlatıcısı: mevcut sabit hatırlatıcı sistemine ekler (Worker 15dk cron push'lar) ---
function addMealReminder(label, time) {
  data.reminders = data.reminders || [];
  if (data.reminders.some(r => r.label === label && r.time === time)) { showToast('Bu hatırlatıcı zaten var', 'info'); return; }
  data.reminders.push({ id: Date.now(), label, time, days: 'daily', enabled: true, lastFired: null });
  save();
  if (typeof renderFixedReminders === 'function') renderFixedReminders();
  showToast(label + ' ' + time + ' hatırlatıcısı eklendi', 'success');
}

// ===== DİYET PROGRAMI (her gün aynı şablon) =====
const DIET_PLAN_IMAGE_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/diet-plan-image';

// Planı öğüne göre gruplu göster. Her satırda 'yedim' işareti bugünün öğün loguna bağlı (kalori halkasına yansır).
function renderDietPlan() {
  ensureDiet();
  const plan = data.diet.plan || [];
  const el = document.getElementById('planList'), meta = document.getElementById('planMeta');
  if (!plan.length) {
    el.innerHTML = '<div class="diet-empty">Henüz plan yok. "Planı düzenle" ile ekle veya diyetisyen kağıdının fotoğrafını oku.</div>';
    if (meta) meta.textContent = '';
    return;
  }
  const day = dietDay(false);
  const eatenIds = new Set(day.meals.filter(m => m.planId != null).map(m => m.planId));
  const totalK = plan.reduce((s, p) => s + (Number(p.kcal) || 0), 0);
  if (meta) meta.textContent = `${eatenIds.size}/${plan.length} yendi${totalK ? ` · ${totalK} kcal` : ''}`;
  let html = '';
  Object.keys(MEAL_SLOTS).forEach(slot => {
    const items = plan.filter(p => p.slot === slot);
    if (!items.length) return;
    html += `<div class="meal-group"><div class="meal-group-head">${MEAL_SLOTS[slot]}</div>`;
    items.forEach(p => {
      const eaten = eatenIds.has(p.id);
      html += `<div class="plan-item${eaten ? ' eaten' : ''}">` +
        `<button class="plan-check${eaten ? ' on' : ''}" onclick="togglePlanEaten(${p.id})" title="${eaten ? 'işareti kaldır' : 'yedim'}" aria-label="yedim">${eaten ? '✓' : ''}</button>` +
        `<span class="plan-name">${escapeHtml(p.name)}</span>` +
        `<span class="meal-kcal-tag">${p.kcal != null ? p.kcal + ' kcal' : ''}</span>` +
        `<button class="meal-del" onclick="removePlanMeal(${p.id})" title="Sil" aria-label="Sil">✕</button>` +
        `</div>`;
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

let _planSlot = 'kahvalti';
function selectPlanSlot(slot, btn) {
  _planSlot = slot;
  btn.parentElement.querySelectorAll('.slot-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
}
function addPlanMeal() {
  const nameEl = document.getElementById('planName'), kcalEl = document.getElementById('planKcal');
  const name = (nameEl.value || '').trim();
  if (!name) { showToast('Yemek yaz', 'info'); nameEl.focus(); return; }
  const kcal = kcalEl.value !== '' ? Math.max(0, parseInt(kcalEl.value, 10) || 0) : null;
  ensureDiet();
  data.diet.plan.push({ id: Date.now(), slot: _planSlot, name, kcal });
  nameEl.value = ''; kcalEl.value = '';
  save(); renderDiet(); nameEl.focus();
}

function removePlanMeal(id) {
  ensureDiet();
  data.diet.plan = data.diet.plan.filter(p => p.id !== id);
  const day = dietDay();
  day.meals = day.meals.filter(m => m.planId !== id);   // bugünün logundan bağlı kaydı da temizle
  save(); renderDiet();
}

// 'yedim' işareti: planlı yemeği bugünün öğün loguna ekle/çıkar
function togglePlanEaten(planId) {
  ensureDiet();
  const p = (data.diet.plan || []).find(x => x.id === planId);
  if (!p) return;
  const day = dietDay();
  const idx = day.meals.findIndex(m => m.planId === planId);
  if (idx >= 0) day.meals.splice(idx, 1);
  else day.meals.push({ id: Date.now(), slot: p.slot, name: p.name, kcal: p.kcal, planId });
  save(); renderDiet();
}

// Diyetisyen kağıdı/PDF fotoğrafı → AI vision → plana ekle
async function dietPlanFromImage(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const status = document.getElementById('planPhotoStatus');
  const setS = (m) => { if (status) status.textContent = m; };
  if (!window._supa || !window._user) { setS('Önce Ayarlar → bulut girişi yap.'); return; }
  setS('Görsel hazırlanıyor…');
  try {
    const dataUrl = await resizeImageToDataUrl(file);
    setS('Aidan programı okuyor… 10-15 sn sürebilir.');
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum yok');
    const r = await fetch(DIET_PLAN_IMAGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ image: dataUrl }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('hata ' + r.status));
    const items = Array.isArray(j.items) ? j.items : [];
    if (!items.length) {
      const dbg = j.aiError ? ` (AI hatası: ${j.aiError})` : (j.raw ? ` (AI: ${String(j.raw).slice(0, 120)})` : '');
      setS('Programı okuyamadım. Daha net bir fotoğraf dene ya da elle ekle.' + dbg);
      return;
    }
    setS(`${items.length} yemek okundu — onay ekranında kontrol et, düzelt, ekle.`);
    openDietPlanImport(items);
  } catch (e) {
    setS('Okuma başarısız: ' + e.message);
  }
}

// ===== Görselden okunan programı düzelt-onayla =====
let _dpImportItems = [];
function openDietPlanImport(items) {
  _dpImportItems = (items || []).map(it => ({
    name: String(it.name || '').trim(),
    slot: it.slot || 'atistirma',
    kcal: (it.kcal != null ? it.kcal : null),
  })).filter(x => x.name);
  document.getElementById('dietPlanImportModal').classList.add('active');
  if (!_dpImportItems.length) {
    document.getElementById('dpImportStatus').textContent = 'Yemek bulunamadı. Daha net bir fotoğraf dene ya da elle ekle.';
    document.getElementById('dpImportActions').style.display = 'none';
    document.getElementById('dpImportList').innerHTML = '';
    return;
  }
  renderDpImportList();
}
function closeDietPlanImport() {
  document.getElementById('dietPlanImportModal').classList.remove('active');
  _dpImportItems = [];
}
const DP_SLOT_OPTS = [['kahvalti', 'Kahvaltı'], ['ogle', 'Öğle'], ['aksam', 'Akşam'], ['atistirma', 'Ara öğün']];
function renderDpImportList() {
  document.getElementById('dpImportStatus').textContent = `${_dpImportItems.length} yemek okundu. Yanlış olanı düzelt/sil, sonra ekle.`;
  const list = document.getElementById('dpImportList');
  list.innerHTML = _dpImportItems.map((it, i) => `
    <div class="pf-import-row">
      <div class="pf-imp-top">
        <input value="${escapeHtml(it.name || '')}" oninput="updateDpImport(${i},'name',this.value)" placeholder="yemek">
        <button class="pf-imp-del" onclick="removeDpImport(${i})" title="Çıkar" aria-label="Çıkar">✕</button>
      </div>
      <div class="pf-imp-bot">
        <label style="flex:2;">Öğün<select onchange="updateDpImport(${i},'slot',this.value)">
          ${DP_SLOT_OPTS.map(([v, t]) => `<option value="${v}" ${it.slot === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
        <label>kcal<input type="number" inputmode="numeric" placeholder="—" value="${it.kcal != null ? it.kcal : ''}" oninput="updateDpImport(${i},'kcal',this.value)"></label>
      </div>
    </div>`).join('');
  document.getElementById('dpImportActions').style.display = 'flex';
}
function updateDpImport(i, field, val) {
  if (!_dpImportItems[i]) return;
  if (field === 'name') _dpImportItems[i].name = val;
  else if (field === 'slot') _dpImportItems[i].slot = val;
  else if (field === 'kcal') { const n = parseInt(String(val).replace(/[^\d]/g, ''), 10); _dpImportItems[i].kcal = (isFinite(n) && n > 0) ? n : null; }
}
function removeDpImport(i) {
  _dpImportItems.splice(i, 1);
  if (!_dpImportItems.length) {
    document.getElementById('dpImportStatus').textContent = 'Liste boş. İptal et ya da yeni fotoğraf dene.';
    document.getElementById('dpImportActions').style.display = 'none';
    document.getElementById('dpImportList').innerHTML = '';
    return;
  }
  renderDpImportList();
}
function confirmDietPlanImport() {
  ensureDiet();
  let added = 0;
  for (const it of _dpImportItems) {
    const name = (it.name || '').trim();
    if (!name) continue;
    data.diet.plan.push({ id: Date.now() + Math.floor(Math.random() * 100000), slot: it.slot || 'atistirma', name, kcal: (it.kcal != null ? it.kcal : null) });
    added++;
  }
  closeDietPlanImport();
  save(); renderDiet();
  showToast(added + ' yemek plana eklendi', 'success');
}

// ===== Besin makro arama (veritabanı + AI tahmini) =====
const FOOD_MACROS_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/food-macros';
let _pendingMacros = null;

async function lookupMealMacros() {
  const q = (document.getElementById('mealName').value || '').trim();
  const out = document.getElementById('macroResult');
  if (!q) { showToast('Önce ne yediğini yaz', 'info'); document.getElementById('mealName').focus(); return; }
  if (!window._supa || !window._user) { out.innerHTML = '<div class="diet-empty">Önce Ayarlar → bulut girişi yap.</div>'; return; }
  out.innerHTML = '<div class="diet-empty">Aranıyor… birkaç sn.</div>';
  try {
    const { data: sess } = await window._supa.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new Error('oturum yok');
    const r = await fetch(FOOD_MACROS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ query: q }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || ('hata ' + r.status));
    renderMacroResult(j);
  } catch (e) {
    out.innerHTML = '<div class="diet-empty">Bulamadım: ' + escapeHtml(e.message) + '</div>';
  }
}

function _macroLine(m) { return `${m.kcal != null ? m.kcal + ' kcal' : '? kcal'} · P${m.protein || 0} K${m.carb || 0} Y${m.fat || 0}`; }

function renderMacroResult(j) {
  const out = document.getElementById('macroResult');
  const mk = m => ({ kcal: m.kcal != null ? m.kcal : null, protein: m.protein != null ? m.protein : null, carb: m.carb != null ? m.carb : null, fat: m.fat != null ? m.fat : null });
  const multi = !!(j.items && j.items.length > 1);
  const srcLabel = j.source === 'usda' ? 'Veritabanı' : (j.source === 'mixed' ? 'Veritabanı + AI' : (multi ? 'Toplam (AI)' : 'AI tahmini'));
  const rows = [];
  if (j.db) rows.push(`<button class="macro-opt" onclick='applyMacro(${JSON.stringify(mk(j.db))})'><span class="macro-src">Veritabanı</span><span class="macro-vals">${_macroLine(j.db)}</span></button>`);
  if (j.ai) rows.push(`<button class="macro-opt" onclick='applyMacro(${JSON.stringify(mk(j.ai))})'><span class="macro-src">${srcLabel}</span><span class="macro-vals">${_macroLine(j.ai)}</span></button>`);
  if (!rows.length) { out.innerHTML = '<div class="diet-empty">Sonuç yok, kaloriyi elle gir.</div>'; return; }
  const bd = multi ? `<div class="macro-note">${j.items.map(it => `${escapeHtml(it.name)} · ${it.kcal} kcal${it.source === 'usda' ? '' : ' (tahmin)'}`).join('  +  ')}</div>` : '';
  const note = j.grams ? `<div class="macro-note">≈ ${j.grams} g · birine dokun → otomatik dolar</div>` : '';
  out.innerHTML = rows.join('') + bd + note;
}

function applyMacro(m) {
  if (!m) return;
  if (m.kcal != null) document.getElementById('mealKcal').value = m.kcal;
  _pendingMacros = { protein: m.protein != null ? m.protein : null, carb: m.carb != null ? m.carb : null, fat: m.fat != null ? m.fat : null };
  const mp = document.getElementById('macroPending');
  if (mp) mp.textContent = `seçildi: P${m.protein || 0} K${m.carb || 0} Y${m.fat || 0}`;
  document.getElementById('macroResult').innerHTML = '';
}

// ===== FatSecret tarzı GÜNLÜK (diary) — öğüne göre bölümler + inline ekle =====
function renderDiary() {
  const day = dietDay(false);
  const el = document.getElementById('diaryList');
  if (!el) return;
  let html = '';
  Object.keys(MEAL_SLOTS).forEach(slot => {
    const items = day.meals.filter(m => m.slot === slot);
    const sub = items.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
    html += `<div class="diary-sec"><div class="diary-sec-head"><span class="diary-sec-name">${MEAL_SLOTS[slot]}</span><span class="diary-sec-kcal">${sub ? sub + ' kcal' : ''}</span></div>`;
    if (items.length) {
      html += '<div class="diary-items">';
      items.forEach(m => {
        const macroTag = (m.protein != null || m.carb != null || m.fat != null) ? ` · P${m.protein || 0} K${m.carb || 0} Y${m.fat || 0}` : '';
        html += `<div class="meal-item"><span class="meal-name meal-name-edit" onclick="editMeal(${m.id})">${escapeHtml(m.name)}</span><span class="meal-kcal-tag">${m.kcal != null ? m.kcal + ' kcal' : ''}${macroTag}</span><button class="meal-del" onclick="removeMeal(${m.id})" title="Sil" aria-label="Sil">✕</button></div>`;
      });
      html += '</div>';
    }
    html += `<button class="diary-add" onclick="openFoodModal('${slot}')"><span class="diary-add-plus">＋</span> ekle</button></div>`;
  });
  el.innerHTML = html;
}

// ===== Yemek ekleme modalı (Ara / Barkod / Elle) + Open Food Facts =====
const OFF_BASE = 'https://world.openfoodfacts.org';
let _foodResults = [];
let _foodPick = null;
let _barcodeScanner = null;
let _barcodeLibLoading = null;

function openFoodModal(slot, tab) {
  if (slot) { _mealSlot = slot; syncMealSlotChips(); }
  _foodPick = null; _foodResults = [];
  const m = document.getElementById('foodModal');
  if (!m) return;
  const slotLbl = document.getElementById('foodModalSlot');
  if (slotLbl) slotLbl.textContent = MEAL_SLOTS[_mealSlot] || '';
  const sr = document.getElementById('foodSearchResults'); if (sr) sr.innerHTML = '';
  const fl = document.getElementById('foodLocal'); if (fl) fl.innerHTML = '';
  const fsi = document.getElementById('foodSearchInput'); if (fsi) fsi.value = '';
  const fp = document.getElementById('foodPortion'); if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }
  m.classList.add('active');
  renderFrequentMeals();
  renderRecentFoods();
  foodModalTab(tab || 'ara');
}
function closeFoodModal() {
  stopBarcodeScan();
  const m = document.getElementById('foodModal');
  if (m) m.classList.remove('active');
  const sr = document.getElementById('foodSearchResults'); if (sr) sr.innerHTML = '';
  const fp = document.getElementById('foodPortion'); if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }
}
function foodModalTab(tab) {
  ['ara', 'barkod', 'elle'].forEach(t => {
    const pane = document.getElementById('foodPane-' + t);
    const btn = document.getElementById('foodTab-' + t);
    if (pane) pane.style.display = (t === tab) ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab !== 'barkod') stopBarcodeScan();
  if (tab === 'ara') { const i = document.getElementById('foodSearchInput'); if (i) setTimeout(() => i.focus(), 50); }
}
function syncMealSlotChips() {
  document.querySelectorAll('#mealSlotChips .slot-chip').forEach(c => {
    c.classList.toggle('active', c.getAttribute('data-slot') === _mealSlot);
  });
}

// --- Open Food Facts arama ---
function parseOffProduct(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  const name = (p.product_name_tr || p.product_name || '').trim();
  if (!name) return null;
  const kcal100 = n['energy-kcal_100g'] != null ? n['energy-kcal_100g'] : (n['energy-kcal'] != null ? n['energy-kcal'] : null);
  return {
    name, brand: (p.brands || '').split(',')[0].trim(), code: p.code || '',
    kcal100: kcal100 != null ? Number(kcal100) : null,
    p100: n.proteins_100g != null ? Number(n.proteins_100g) : null,
    c100: n.carbohydrates_100g != null ? Number(n.carbohydrates_100g) : null,
    f100: n.fat_100g != null ? Number(n.fat_100g) : null
  };
}
function scaleFood(p, grams) {
  const f = (Number(grams) || 0) / 100;
  const rnd = v => v != null ? Math.round(v * f) : null;
  return { kcal: rnd(p.kcal100), protein: rnd(p.p100), carb: rnd(p.c100), fat: rnd(p.f100) };
}
async function offSearch(q) {
  const url = OFF_BASE + '/cgi/search.pl?search_terms=' + encodeURIComponent(q) + '&search_simple=1&action=process&json=1&page_size=20&fields=product_name,product_name_tr,brands,nutriments,code';
  const r = await fetch(url);
  if (!r.ok) throw new Error('ağ hatası ' + r.status);
  const j = await r.json();
  return (j.products || []).map(parseOffProduct).filter(Boolean);
}
async function offBarcode(code) {
  const url = OFF_BASE + '/api/v2/product/' + encodeURIComponent(code) + '.json?fields=product_name,product_name_tr,brands,nutriments,code';
  const r = await fetch(url);
  if (!r.ok) { if (r.status === 404) return null; throw new Error('ağ hatası ' + r.status); }
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return parseOffProduct(j.product);
}
async function searchFood() {
  const q = (document.getElementById('foodSearchInput').value || '').trim();
  const out = document.getElementById('foodSearchResults');
  const fp = document.getElementById('foodPortion'); if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }
  if (!q) { document.getElementById('foodSearchInput').focus(); return; }
  out.innerHTML = '<div class="diet-empty">Aranıyor…</div>';
  try {
    _foodResults = await offSearch(q);
    if (!_foodResults.length) { out.innerHTML = '<div class="diet-empty">Sonuç yok. Farklı yaz ya da "Elle" sekmesinden ekle.</div>'; return; }
    out.innerHTML = _foodResults.map((p, i) => `<button class="food-result" onclick="pickFood(${i})"><span class="food-result-name">${escapeHtml(p.name)}${p.brand ? ` <span class="food-result-brand">${escapeHtml(p.brand)}</span>` : ''}</span><span class="food-result-kcal">${p.kcal100 != null ? Math.round(p.kcal100) + ' kcal/100g' : '—'}</span></button>`).join('');
  } catch (e) {
    out.innerHTML = '<div class="diet-empty">Arama başarısız: ' + escapeHtml(e.message) + '</div>';
  }
}
// i: arama sonucundaki index VEYA doğrudan ürün objesi (barkod akışı)
function pickFood(i) {
  const p = (typeof i === 'number') ? _foodResults[i] : i;
  if (!p) return;
  _foodPick = p;
  const por = document.getElementById('foodPortion');
  por.style.display = 'block';
  por.innerHTML = `<div class="portion-pick">${escapeHtml(p.name)}${p.brand ? ' · ' + escapeHtml(p.brand) : ''}</div>` +
    `<div class="portion-row"><label>Miktar (g)</label><input id="portionGrams" type="number" inputmode="numeric" value="100" min="1" oninput="updatePortionPreview()"></div>` +
    `<div class="portion-preview" id="portionPreview"></div>` +
    `<button class="portion-add" onclick="addPickedFood()">${MEAL_SLOTS[_mealSlot] || 'Öğün'}'e ekle</button>`;
  updatePortionPreview();
  por.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function updatePortionPreview() {
  if (!_foodPick) return;
  const g = document.getElementById('portionGrams').value;
  const sc = scaleFood(_foodPick, g);
  document.getElementById('portionPreview').innerHTML = `${sc.kcal != null ? sc.kcal + ' kcal' : '? kcal'} · P${sc.protein || 0} K${sc.carb || 0} Y${sc.fat || 0}`;
}
function addPickedFood() {
  if (!_foodPick) return;
  const g = document.getElementById('portionGrams').value;
  const sc = scaleFood(_foodPick, g);
  const day = dietDay();
  const gv = Math.round(Number(g) || 0);
  const label = _foodPick.name + (gv && gv !== 100 ? ` (${gv}g)` : '');
  day.meals.push({ id: Date.now(), slot: _mealSlot, name: label, kcal: sc.kcal, protein: sc.protein, carb: sc.carb, fat: sc.fat });
  save(); renderDiet(); closeFoodModal();
  showToast(_foodPick.name + ' eklendi', 'success');
}

// --- Barkod tarama (html5-qrcode, CDN'den tembel yüklenir) ---
function loadBarcodeLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (_barcodeLibLoading) return _barcodeLibLoading;
  _barcodeLibLoading = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
    sc.onload = () => res();
    sc.onerror = () => { _barcodeLibLoading = null; rej(new Error('tarayıcı kütüphanesi yüklenemedi')); };
    document.head.appendChild(sc);
  });
  return _barcodeLibLoading;
}
async function startBarcodeScan() {
  const st = document.getElementById('barcodeStatus');
  if (st) st.textContent = 'Kamera hazırlanıyor…';
  try {
    await loadBarcodeLib();
    if (_barcodeScanner) { try { await _barcodeScanner.stop(); } catch (e) {} _barcodeScanner = null; }
    const F = Html5QrcodeSupportedFormats;
    const fmts = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E];
    _barcodeScanner = new Html5Qrcode('barcodeReader', { formatsToSupport: fmts, verbose: false });
    await _barcodeScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 140 } },
      (txt) => { onBarcodeDecoded(txt); }, () => {});
    if (st) st.textContent = 'Barkodu çerçeveye getir.';
    const sb = document.getElementById('barcodeStartBtn'); if (sb) sb.style.display = 'none';
    const tb = document.getElementById('barcodeStopBtn'); if (tb) tb.style.display = 'inline-flex';
  } catch (e) {
    if (st) st.textContent = 'Kamera açılamadı (' + e.message + '). Barkod numarasını elle yazabilirsin.';
  }
}
async function stopBarcodeScan() {
  if (_barcodeScanner) { try { await _barcodeScanner.stop(); } catch (e) {} try { _barcodeScanner.clear(); } catch (e) {} _barcodeScanner = null; }
  const sb = document.getElementById('barcodeStartBtn'); if (sb) sb.style.display = 'inline-flex';
  const tb = document.getElementById('barcodeStopBtn'); if (tb) tb.style.display = 'none';
}
async function onBarcodeDecoded(code) {
  await stopBarcodeScan();
  lookupBarcode(code);
}
async function lookupBarcode(code) {
  code = String(code || '').trim();
  if (!code) return;
  const st = document.getElementById('barcodeStatus');
  if (st) st.textContent = 'Ürün aranıyor… (' + code + ')';
  try {
    const p = await offBarcode(code);
    if (!p) { if (st) st.textContent = 'Bu barkod veritabanında yok (' + code + '). "Elle" sekmesinden ekleyebilirsin.'; return; }
    if (st) st.textContent = 'Bulundu: ' + p.name;
    foodModalTab('ara');
    const sr = document.getElementById('foodSearchResults'); if (sr) sr.innerHTML = '';
    pickFood(p);
  } catch (e) {
    if (st) st.textContent = 'Sorgu başarısız: ' + e.message;
  }
}
function barcodeManualLookup() {
  const v = (document.getElementById('barcodeManual').value || '').trim();
  if (!v) return;
  lookupBarcode(v);
}

// ===== Ara sekmesi: USDA+AI akıllı arama (jenerik besin + adet/porsiyon) =====
let _aiFood = null;
function aiFoodSearch() {
  const q = (document.getElementById('foodSearchInput').value || '').trim();
  const out = document.getElementById('foodSearchResults');
  const fp = document.getElementById('foodPortion'); if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }
  if (!q) { document.getElementById('foodSearchInput').focus(); return; }
  if (!window._supa || !window._user) { out.innerHTML = '<div class="diet-empty">Önce Ayarlar → bulut girişi yap.</div>'; return; }
  out.innerHTML = '<div class="diet-empty">Aranıyor… birkaç sn.</div>';
  (async () => {
    try {
      const { data: sess } = await window._supa.auth.getSession();
      const token = sess && sess.session && sess.session.access_token;
      if (!token) throw new Error('oturum yok');
      const r = await fetch(FOOD_MACROS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ query: q }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || ('hata ' + r.status));
      renderAiFood(q, j);
      pushRecentFood(q);
    } catch (e) {
      out.innerHTML = '<div class="diet-empty">Bulamadım: ' + escapeHtml(e.message) + '</div>';
    }
  })();
}
function renderAiFood(q, j) {
  const out = document.getElementById('foodSearchResults');
  const base = j.ai || j.db;
  if (!base || base.kcal == null) { out.innerHTML = '<div class="diet-empty">Net sonuç yok. "Elle" sekmesinden kalori girebilirsin.</div>'; return; }
  _aiFood = {
    name: q, kcal: base.kcal, protein: base.protein, carb: base.carb, fat: base.fat,
    multi: !!(j.items && j.items.length > 1), items: j.items || [], source: j.source
  };
  const srcLbl = j.source === 'usda' ? 'Veritabanı' : (j.source === 'mixed' ? 'Veritabanı + AI' : (_aiFood.multi ? 'Toplam' : 'AI tahmini'));
  const bd = _aiFood.multi ? `<div class="macro-note">${_aiFood.items.map(it => `${escapeHtml(it.name)} · ${it.kcal} kcal${it.source === 'usda' ? '' : ' (tahmin)'}`).join('  +  ')}</div>` : '';
  showAiPortion(q, srcLbl, bd);
}
// Ortak porsiyon/adet arayüzü (AI sonucu + kişisel hafıza ikisi de kullanır)
function showAiPortion(q, srcLbl, bd) {
  const out = document.getElementById('foodSearchResults'); if (out) out.innerHTML = '';
  const fl = document.getElementById('foodLocal'); if (fl) fl.innerHTML = '';
  const fp = document.getElementById('foodPortion');
  fp.style.display = 'block';
  fp.innerHTML = `<div class="portion-pick">${escapeHtml(q)} <span class="ai-src">${srcLbl}</span></div>` +
    (bd || '') +
    `<div class="portion-row"><label>Adet / porsiyon</label><input id="aiQty" type="number" inputmode="decimal" value="1" min="0.25" step="0.25" oninput="updateAiPreview()"></div>` +
    `<div class="portion-preview" id="aiPreview"></div>` +
    `<button class="portion-add" onclick="addAiFood()">${MEAL_SLOTS[_mealSlot] || 'Öğün'}'e ekle</button>`;
  updateAiPreview();
  fp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// ===== Kişisel öğrenen besin DB — geçmişte loglanan yemeklerden anlık lokal eşleşme =====
function foodMemoryMatches(q, limit) {
  ensureDiet();
  q = (q || '').trim().toLocaleLowerCase('tr');
  if (q.length < 2) return [];
  const days = data.diet.days || {}, map = new Map();
  for (const dk of Object.keys(days).sort()) {
    for (const m of (days[dk].meals || [])) {
      const name = String(m.name || '').trim();
      if (!name || !name.toLocaleLowerCase('tr').includes(q)) continue;
      const key = name.toLocaleLowerCase('tr');
      const e = map.get(key) || { name, count: 0, kcal: null, protein: null, carb: null, fat: null };
      e.count++; e.name = name;
      if (m.kcal != null) e.kcal = m.kcal;
      if (m.protein != null) e.protein = m.protein;
      if (m.carb != null) e.carb = m.carb;
      if (m.fat != null) e.fat = m.fat;
      map.set(key, e);
    }
  }
  return [...map.values()].filter(e => e.kcal != null).sort((a, b) => b.count - a.count).slice(0, limit || 6);
}
let _foodInputTimer = null, _localMatches = [], _seedMatches = [];
function onFoodSearchInput() { clearTimeout(_foodInputTimer); _foodInputTimer = setTimeout(renderLocalMatches, 180); }
function renderLocalMatches() {
  const el = document.getElementById('foodLocal'); if (!el) return;
  const q = (document.getElementById('foodSearchInput').value || '').trim();
  _localMatches = foodMemoryMatches(q, 6);
  const personalNames = new Set(_localMatches.map(m => m.name.toLocaleLowerCase('tr')));
  _seedMatches = seedFoodMatches(q, 8).filter(sf => !personalNames.has(sf.n.toLocaleLowerCase('tr')));
  let html = '';
  if (_localMatches.length) {
    html += '<div class="freq-head">Daha önce yedin</div><div class="food-results">' +
      _localMatches.map((m, i) => `<button class="food-result" onclick="pickPersonalFood(${i})"><span class="food-result-name">${escapeHtml(m.name)}</span><span class="food-result-kcal">${m.kcal} kcal</span></button>`).join('') +
      '</div>';
  }
  if (_seedMatches.length) {
    html += '<div class="freq-head">Temel besinler</div><div class="food-results">' +
      _seedMatches.map((sf, i) => `<button class="food-result" onclick="pickSeedFood(${i})"><span class="food-result-name">${escapeHtml(sf.n)} <span class="food-result-brand">${escapeHtml(sf.u)}</span></span><span class="food-result-kcal">${sf.k} kcal</span></button>`).join('') +
      '</div>';
  }
  el.innerHTML = html;
}
function pickPersonalFood(i) {
  const m = _localMatches[i]; if (!m) return;
  _aiFood = { name: m.name, kcal: m.kcal, protein: m.protein, carb: m.carb, fat: m.fat, multi: false, items: [], source: 'memory' };
  showAiPortion(m.name, 'Hafızandan', '');
}
// ===== Temel Türk besinleri tohumu (birim başına yaklaşık değerler; n=ad, u=birim, k=kcal, p/c/f=makro) =====
const TURK_FOODS = [
  { n: 'Yumurta', u: 'adet', k: 72, p: 6, c: 0, f: 5 },
  { n: 'Beyaz peynir', u: 'dilim', k: 75, p: 5, c: 1, f: 6 },
  { n: 'Kaşar peyniri', u: 'dilim', k: 110, p: 7, c: 1, f: 9 },
  { n: 'Yoğurt', u: 'kase', k: 120, p: 11, c: 9, f: 4 },
  { n: 'Süt', u: 'bardak', k: 122, p: 6, c: 9, f: 7 },
  { n: 'Ayran', u: 'bardak', k: 76, p: 6, c: 5, f: 3 },
  { n: 'Tereyağı', u: 'kaşık', k: 72, p: 0, c: 0, f: 8 },
  { n: 'Ekmek', u: 'dilim', k: 66, p: 2, c: 13, f: 1 },
  { n: 'Tam buğday ekmek', u: 'dilim', k: 69, p: 3, c: 12, f: 1 },
  { n: 'Pilav', u: 'porsiyon', k: 200, p: 4, c: 44, f: 1 },
  { n: 'Bulgur pilavı', u: 'porsiyon', k: 170, p: 5, c: 34, f: 1 },
  { n: 'Makarna', u: 'porsiyon', k: 260, p: 9, c: 52, f: 2 },
  { n: 'Simit', u: 'adet', k: 280, p: 9, c: 52, f: 4 },
  { n: 'Poğaça', u: 'adet', k: 250, p: 5, c: 28, f: 13 },
  { n: 'Yulaf ezmesi', u: 'porsiyon', k: 150, p: 5, c: 27, f: 3 },
  { n: 'Tavuk göğsü', u: 'porsiyon', k: 250, p: 47, c: 0, f: 6 },
  { n: 'Dana bonfile', u: 'porsiyon', k: 290, p: 40, c: 0, f: 13 },
  { n: 'Köfte', u: 'adet', k: 70, p: 5, c: 1, f: 5 },
  { n: 'Somon', u: 'porsiyon', k: 280, p: 40, c: 0, f: 13 },
  { n: 'Hindi eti', u: 'porsiyon', k: 220, p: 40, c: 0, f: 6 },
  { n: 'Sucuk', u: 'dilim', k: 35, p: 2, c: 0, f: 3 },
  { n: 'Salam', u: 'dilim', k: 35, p: 2, c: 0, f: 3 },
  { n: 'Ton balığı', u: 'kutu', k: 90, p: 20, c: 0, f: 1 },
  { n: 'Mercimek çorbası', u: 'kase', k: 150, p: 8, c: 22, f: 3 },
  { n: 'Nohut', u: 'porsiyon', k: 230, p: 12, c: 38, f: 4 },
  { n: 'Kuru fasulye', u: 'porsiyon', k: 250, p: 14, c: 40, f: 3 },
  { n: 'Muz', u: 'adet', k: 105, p: 1, c: 27, f: 0 },
  { n: 'Elma', u: 'adet', k: 78, p: 0, c: 21, f: 0 },
  { n: 'Portakal', u: 'adet', k: 62, p: 1, c: 15, f: 0 },
  { n: 'Domates', u: 'adet', k: 22, p: 1, c: 5, f: 0 },
  { n: 'Salatalık', u: 'adet', k: 15, p: 1, c: 3, f: 0 },
  { n: 'Haşlanmış patates', u: 'adet', k: 130, p: 3, c: 30, f: 0 },
  { n: 'Avokado', u: 'yarım', k: 110, p: 1, c: 6, f: 10 },
  { n: 'Çikolata', u: 'parça', k: 55, p: 1, c: 6, f: 3 },
  { n: 'Bisküvi', u: 'adet', k: 40, p: 1, c: 6, f: 2 },
  { n: 'Fındık', u: '10 adet', k: 95, p: 2, c: 3, f: 9 },
  { n: 'Badem', u: '10 adet', k: 70, p: 3, c: 2, f: 6 },
  { n: 'Ceviz', u: '2 yarım', k: 52, p: 1, c: 1, f: 5 },
  { n: 'Bal', u: 'kaşık', k: 64, p: 0, c: 17, f: 0 },
  { n: 'Reçel', u: 'kaşık', k: 50, p: 0, c: 13, f: 0 },
  { n: 'Zeytin', u: '5 adet', k: 25, p: 0, c: 0, f: 3 },
  { n: 'Cips', u: 'paket', k: 160, p: 2, c: 15, f: 10 },
  { n: 'Çay', u: 'bardak', k: 2, p: 0, c: 0, f: 0 },
  { n: 'Türk kahvesi', u: 'fincan', k: 5, p: 0, c: 1, f: 0 },
  { n: 'Kola', u: 'kutu', k: 139, p: 0, c: 35, f: 0 },
  { n: 'Meyve suyu', u: 'bardak', k: 90, p: 0, c: 22, f: 0 },
  { n: 'Şeker', u: 'küp', k: 12, p: 0, c: 3, f: 0 },
  { n: 'Menemen', u: 'porsiyon', k: 220, p: 12, c: 10, f: 15 },
  { n: 'Tost', u: 'adet', k: 300, p: 13, c: 30, f: 14 },
  { n: 'Lahmacun', u: 'adet', k: 250, p: 11, c: 30, f: 9 },
  { n: 'Döner (ekmek arası)', u: 'adet', k: 450, p: 25, c: 45, f: 20 },
  { n: 'Pizza', u: 'dilim', k: 285, p: 12, c: 36, f: 10 },
  { n: 'Hamburger', u: 'adet', k: 350, p: 17, c: 30, f: 18 },
  { n: 'Çorba', u: 'kase', k: 120, p: 5, c: 15, f: 4 }
];
function seedFoodMatches(q, limit) {
  q = (q || '').trim().toLocaleLowerCase('tr');
  if (q.length < 2) return [];
  return TURK_FOODS.filter(f => f.n.toLocaleLowerCase('tr').includes(q)).slice(0, limit || 8);
}
function pickSeedFood(i) {
  const sf = _seedMatches[i]; if (!sf) return;
  _aiFood = { name: sf.n, kcal: sf.k, protein: sf.p, carb: sf.c, fat: sf.f, multi: false, items: [], source: 'seed' };
  showAiPortion(sf.n, 'Temel · ' + sf.u, '');
}
function _aiQtyVal() { const v = Number((document.getElementById('aiQty') || {}).value); return (isFinite(v) && v > 0) ? v : 0; }
function updateAiPreview() {
  if (!_aiFood) return;
  const m = _aiQtyVal();
  const k = Math.round((_aiFood.kcal || 0) * m);
  const p = Math.round((_aiFood.protein || 0) * m), c = Math.round((_aiFood.carb || 0) * m), f = Math.round((_aiFood.fat || 0) * m);
  document.getElementById('aiPreview').innerHTML = `${k} kcal · P${p} K${c} Y${f}`;
}
function addAiFood() {
  if (!_aiFood) return;
  const m = _aiQtyVal();
  if (!m) { showToast('Adet gir', 'info'); return; }
  const day = dietDay();
  const qStr = (m % 1) ? m.toString().replace('.', ',') : String(m);
  const label = _aiFood.name + (m !== 1 ? ` ×${qStr}` : '');
  day.meals.push({
    id: Date.now(), slot: _mealSlot, name: label,
    kcal: Math.round((_aiFood.kcal || 0) * m),
    protein: Math.round((_aiFood.protein || 0) * m),
    carb: Math.round((_aiFood.carb || 0) * m),
    fat: Math.round((_aiFood.fat || 0) * m)
  });
  save(); renderDiet(); closeFoodModal();
  showToast('Eklendi', 'success');
}

// ===== TAKVİYELER (push hatırlatıcı — mevcut data.reminders + Worker 15dk cron) =====
function renderSupplements() {
  const el = document.getElementById('suppList'); if (!el) return;
  const supps = (data.reminders || []).filter(r => r.kind === 'supp').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const meta = document.getElementById('suppMeta');
  const t = today();
  if (meta) meta.textContent = supps.length ? `${supps.filter(r => r.takenDate === t).length}/${supps.length} alındı` : '';
  if (!supps.length) { el.innerHTML = '<div class="diet-empty">Henüz takviye yok. Aşağıdan ekle — saatinde bildirim gelir.</div>'; return; }
  el.innerHTML = supps.map(r => {
    const taken = r.takenDate === t;
    return `<div class="supp-item${r.enabled === false ? ' off' : ''}${taken ? ' taken' : ''}">` +
      `<button class="supp-check${taken ? ' on' : ''}" onclick="markSuppTaken(${r.id})" title="${taken ? 'işareti kaldır' : 'aldım'}" aria-label="aldım">${taken ? '✓' : ''}</button>` +
      `<span class="supp-time">${escapeHtml(r.time || '–')}</span>` +
      `<span class="supp-name">${escapeHtml(r.label || '')}</span>` +
      `<span class="supp-days">${r.days === 'weekdays' ? 'Hafta içi' : 'Her gün'}</span>` +
      `<input type="checkbox" ${r.enabled !== false ? 'checked' : ''} onchange="toggleSupplement(${r.id})" aria-label="Aç/kapa">` +
      `<button class="supp-del" onclick="deleteSupplement(${r.id})" aria-label="Sil">✕</button></div>`;
  }).join('');
}
function addSupplement() {
  const name = (document.getElementById('suppName').value || '').trim();
  const time = document.getElementById('suppTime').value;
  const days = document.getElementById('suppDays').value;
  if (!name) { showToast('Takviye adı yaz', 'info'); return; }
  if (!time) { showToast('Saat seç', 'info'); return; }
  data.reminders = data.reminders || [];
  data.reminders.push({ id: Date.now(), label: name, time, days, enabled: true, lastFired: null, kind: 'supp' });
  document.getElementById('suppName').value = ''; document.getElementById('suppTime').value = '';
  save(); renderSupplements();
  if (typeof renderFixedReminders === 'function') renderFixedReminders();
  showToast(`${time} — ${name} kuruldu`, 'success');
}
function toggleSupplement(id) { const r = (data.reminders || []).find(x => x.id === id); if (!r) return; r.enabled = (r.enabled === false); save(); renderSupplements(); }
function deleteSupplement(id) {
  data.reminders = (data.reminders || []).filter(x => x.id !== id);
  save(); renderSupplements();
  if (typeof renderFixedReminders === 'function') renderFixedReminders();
  showToast('Takviye silindi', 'info');
}
function markSuppTaken(id) { const r = (data.reminders || []).find(x => x.id === id); if (!r) return; const t = today(); r.takenDate = (r.takenDate === t) ? null : t; save(); renderSupplements(); }

// ===== Loglanan öğünü düzenle =====
let _editMealId = null, _editMealSlot = 'kahvalti';
function editMeal(id) {
  const day = dietDay(false); const m = (day.meals || []).find(x => x.id === id); if (!m) return;
  _editMealId = id; _editMealSlot = m.slot || 'kahvalti';
  document.getElementById('editMealName').value = m.name || '';
  document.getElementById('editMealKcal').value = (m.kcal != null ? m.kcal : '');
  document.querySelectorAll('#editMealSlotChips .slot-chip').forEach(c => c.classList.toggle('active', c.getAttribute('data-slot') === _editMealSlot));
  document.getElementById('mealEditModal').classList.add('active');
  setTimeout(() => document.getElementById('editMealName').focus(), 50);
}
function selectEditMealSlot(slot, btn) { _editMealSlot = slot; btn.parentElement.querySelectorAll('.slot-chip').forEach(c => c.classList.remove('active')); btn.classList.add('active'); }
function closeMealEdit() { document.getElementById('mealEditModal').classList.remove('active'); _editMealId = null; }
function saveMealEdit() {
  if (_editMealId == null) return;
  const day = dietDay(); const m = (day.meals || []).find(x => x.id === _editMealId); if (!m) { closeMealEdit(); return; }
  const name = (document.getElementById('editMealName').value || '').trim();
  if (!name) { showToast('İsim boş olamaz', 'info'); return; }
  const kv = document.getElementById('editMealKcal').value;
  m.name = name; m.kcal = (kv !== '' ? Math.max(0, parseInt(kv, 10) || 0) : null); m.slot = _editMealSlot;
  save(); renderDiet(); closeMealEdit();
}
function deleteMealFromEdit() { if (_editMealId != null) removeMeal(_editMealId); closeMealEdit(); }

// ===== Kilo detay modalı =====
function openWeightDetail() {
  const arr = (data.diet.weights || []);
  const modal = document.getElementById('weightDetailModal'); if (!modal) return;
  const body = document.getElementById('weightDetailBody');
  if (!arr.length) { body.innerHTML = '<div class="diet-empty">Henüz kilo kaydı yok.</div>'; modal.classList.add('active'); return; }
  const vals = arr.map(w => w.kg);
  const min = Math.min(...vals), max = Math.max(...vals), last = vals[vals.length - 1], first = vals[0];
  const diff = +(last - first).toFixed(1), sign = diff > 0 ? '+' : '';
  const chart = arr.length >= 2 ? `<div class="wd-chart">${lineChart(vals, diff > 0)}</div>` : '<div class="diet-empty">En az 2 kayıt olunca grafik çıkar.</div>';
  const rows = [...arr].slice(-12).reverse().map(w => `<div class="wd-row"><span>${new Date(w.date + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: '2-digit' })}</span><span class="wd-kg">${w.kg} kg</span></div>`).join('');
  body.innerHTML = chart +
    `<div class="wd-stats"><div><span class="wd-num">${last}</span><span class="wd-lbl">son (kg)</span></div>` +
    `<div><span class="wd-num ${diff > 0 ? 'wt-up' : (diff < 0 ? 'wt-down' : '')}">${sign}${diff}</span><span class="wd-lbl">değişim</span></div>` +
    `<div><span class="wd-num">${min}</span><span class="wd-lbl">en düşük</span></div>` +
    `<div><span class="wd-num">${max}</span><span class="wd-lbl">en yüksek</span></div></div>` +
    `<div class="wd-list">${rows}</div>`;
  modal.classList.add('active');
}
function closeWeightDetail() { document.getElementById('weightDetailModal').classList.remove('active'); }

// ===== Son aramalar (Ara sekmesi) =====
function pushRecentFood(q) {
  q = (q || '').trim(); if (!q) return; ensureDiet();
  const low = q.toLocaleLowerCase('tr');
  data.diet.recentFoods = (data.diet.recentFoods || []).filter(x => x.toLocaleLowerCase('tr') !== low);
  data.diet.recentFoods.unshift(q);
  data.diet.recentFoods = data.diet.recentFoods.slice(0, 8);
  save(); renderRecentFoods();
}
function renderRecentFoods() {
  const el = document.getElementById('foodRecent'); if (!el) return;
  const rec = (data.diet.recentFoods || []);
  if (!rec.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="freq-head">Son aramalar</div><div class="freq-chips">' +
    rec.map(q => `<button class="freq-chip" data-q="${escapeHtml(q)}" onclick="recentFoodSearch(this.dataset.q)">${escapeHtml(q)}</button>`).join('') + '</div>';
}
function recentFoodSearch(q) { const i = document.getElementById('foodSearchInput'); if (i) { i.value = q; aiFoodSearch(); } }

function renderMacroBars() {
  const d = data.diet, day = dietDay(false);
  let p = 0, c = 0, f = 0;
  day.meals.forEach(m => { p += Number(m.protein) || 0; c += Number(m.carb) || 0; f += Number(m.fat) || 0; });
  const rows = [
    ['Protein', Math.round(p), d.proteinGoal || 0, '#5aa2ff'],
    ['Karbonhidrat', Math.round(c), d.carbGoal || 0, '#f5a524'],
    ['Yağ', Math.round(f), d.fatGoal || 0, '#e0726e'],
  ];
  const el = document.getElementById('macroBars');
  if (!el) return;
  el.innerHTML = rows.map(([name, val, gl, col]) => {
    const pct = gl ? Math.min(100, Math.round(val / gl * 100)) : 0;
    const over = gl && val > gl;
    return `<div class="macro-bar">
      <div class="macro-bar-top"><span class="macro-bar-name">${name}</span><span class="macro-bar-val${over ? ' over' : ''}">${val} / ${gl} g</span></div>
      <div class="macro-bar-track"><span class="macro-bar-fill" style="width:${pct}%; background:${col}"></span></div>
    </div>`;
  }).join('');
}
function timeStr() { return new Date().toLocaleString('tr-TR'); }

const sessionStart = Date.now();
let lastUserActivity = Date.now();
let focusStreakStart = Date.now();
const IDLE_RESET_MS = 5 * 60 * 1000; // 5 dk hareketsizlik → streak resetlenir

function markActivity() {
  const now = Date.now();
  if (now - lastUserActivity > IDLE_RESET_MS) {
    focusStreakStart = now;
  }
  lastUserActivity = now;
}
['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => {
  document.addEventListener(ev, markActivity, { passive: true });
});

