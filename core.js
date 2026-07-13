
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
  // Çoklu + haftalık plan modeli (eski tek 'plan' migrate edilir)
  if (!d.plans) {
    const mm = emptyPlanMeals();
    if (d.plan.length) mm.all = d.plan.map(pp => ({ id: pp.id || (Date.now() + Math.floor(Math.random() * 1e5)), slot: pp.slot || 'kahvalti', name: pp.name, kcal: pp.kcal != null ? pp.kcal : null, protein: pp.protein != null ? pp.protein : null, carb: pp.carb != null ? pp.carb : null, fat: pp.fat != null ? pp.fat : null }));
    d.plans = [{ id: Date.now(), name: 'Planım', weekly: false, meals: mm }];
    d.activePlanId = d.plans[0].id;
  }
  if (d.activePlanId == null && (d.plans || []).length) d.activePlanId = d.plans[0].id;
  // Makro hedefleri — kcal hedefinden türetilen varsayılan (protein %25, karb %50, yağ %25)
  if (d.proteinGoal === undefined) d.proteinGoal = Math.round((d.kcalGoal || 2000) * 0.25 / 4);
  if (d.carbGoal === undefined) d.carbGoal = Math.round((d.kcalGoal || 2000) * 0.50 / 4);
  if (d.fatGoal === undefined) d.fatGoal = Math.round((d.kcalGoal || 2000) * 0.25 / 9);
  d.freqHidden = d.freqHidden || [];
  d.freqPinned = d.freqPinned || [];
  d.recentFoods = d.recentFoods || [];
  d.customFoods = d.customFoods || [];  // kendi besinlerim: [{id,name,unit,kcal,protein,carb,fat}]
  d.recipes = d.recipes || [];          // öğün paketi/tarif: [{id,name,slot,items:[{name,kcal,protein,carb,fat}]}]
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
  renderRecipes();
  renderFrequentMeals();
  renderWeightTrend();
  renderSupplements();
  renderMacroBars();
  renderMacroDonut();
  // Hedef inputları
  const gk = document.getElementById('goalKcal'); if (gk) gk.value = d.kcalGoal;
  const gw = document.getElementById('goalWater'); if (gw) gw.value = (d.waterGoalL || 2.5);
  const gp = document.getElementById('goalProtein'); if (gp) gp.value = d.proteinGoal;
  const gc = document.getElementById('goalCarb'); if (gc) gc.value = d.carbGoal;
  const gf = document.getElementById('goalFat'); if (gf) gf.value = d.fatGoal;
  renderCalcInputs();
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
// Opsiyonel makro inputu oku (boş→null, virgül ondalık kabul).
function _optMacro(id) {
  const el = document.getElementById(id);
  if (!el || el.value === '') return null;
  const v = parseFloat(String(el.value).replace(',', '.'));
  return (isFinite(v) && v >= 0) ? Math.round(v) : null;
}
function addMeal() {
  const nameEl = document.getElementById('mealName'), kcalEl = document.getElementById('mealKcal');
  const name = (nameEl.value || '').trim();
  if (!name) { showToast('Ne yediğini yaz', 'info'); nameEl.focus(); return; }
  const kcal = kcalEl.value !== '' ? Math.max(0, parseInt(kcalEl.value, 10) || 0) : null;
  const day = dietDay();
  const pm = _pendingMacros || {};
  // Elle girilen makro (P/K/Y) varsa AI/öneri makrosunu geçersiz kılar
  const mP = _optMacro('mealP'), mC = _optMacro('mealC'), mF = _optMacro('mealF');
  const anyManual = mP != null || mC != null || mF != null;
  const protein = anyManual ? mP : (pm.protein != null ? pm.protein : null);
  const carb = anyManual ? mC : (pm.carb != null ? pm.carb : null);
  const fat = anyManual ? mF : (pm.fat != null ? pm.fat : null);
  day.meals.push({ id: Date.now(), slot: _mealSlot, name, kcal, protein, carb, fat });
  // Elle girilen besin bir daha sorulmasin diye 'kendi besinlerim'e otomatik kaydet (ad ile dedupe)
  let _autoSaved = false;
  if (kcal != null) {
    if (!data.diet.customFoods) data.diet.customFoods = [];
    const _low = name.toLocaleLowerCase('tr');
    const _ex = data.diet.customFoods.find(c => String(c.name || '').toLocaleLowerCase('tr') === _low);
    if (_ex) { _ex.kcal = kcal; _ex.protein = protein; _ex.carb = carb; _ex.fat = fat; }
    else data.diet.customFoods.push({ id: Date.now() + 1, name, unit: 'porsiyon', kcal, protein, carb, fat });
    _autoSaved = true;
  }
  _pendingMacros = null;
  const _mp = document.getElementById('macroPending'); if (_mp) _mp.textContent = '';
  const _mr = document.getElementById('macroResult'); if (_mr) _mr.innerHTML = '';
  nameEl.value = ''; kcalEl.value = '';
  ['mealP', 'mealC', 'mealF'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  save(); renderDiet(); renderCustomManage(); closeFoodModal(); nameEl.focus();
  showToast(_autoSaved ? (name + ' eklendi \u00b7 besinlerine kaydedildi') : (name + ' eklendi'), 'success');
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

// --- Hedef hesaplayıcı (Mifflin-St Jeor BMR → TDEE → amaç + makro) ---
let _calcSex = 'male', _calcGoal = 'keep';
function selectCalcSex(s, btn) { _calcSex = s; btn.parentElement.querySelectorAll('.slot-chip').forEach(c => c.classList.remove('active')); btn.classList.add('active'); }
function selectCalcGoal(g, btn) { _calcGoal = g; btn.parentElement.querySelectorAll('.slot-chip').forEach(c => c.classList.remove('active')); btn.classList.add('active'); }
// Calc inputlarını kayıttan/son kilodan doldur (renderDiet çağırır)
function renderCalcInputs() {
  ensureDiet();
  const c = data.diet.calc || {};
  if (c.sex) { _calcSex = c.sex; document.querySelectorAll('#calcSexChips .slot-chip').forEach(b => b.classList.toggle('active', b.dataset.sex === c.sex)); }
  if (c.goal) { _calcGoal = c.goal; document.querySelectorAll('#calcGoalChips .slot-chip').forEach(b => b.classList.toggle('active', b.dataset.goal === c.goal)); }
  const setv = (id, v) => { const e = document.getElementById(id); if (e && v != null && e.value === '') e.value = v; };
  setv('calcAge', c.age); setv('calcHeight', c.height);
  const lastKg = (data.diet.weights || []).slice(-1)[0];
  setv('calcWeight', c.weight != null ? c.weight : (lastKg ? lastKg.kg : null));
  const act = document.getElementById('calcActivity');
  if (act && c.activity) act.value = c.activity;
  else if (act && !act.value) act.value = '1.55';
}
function calcGoals() {
  ensureDiet();
  const age = parseInt(document.getElementById('calcAge').value, 10);
  const cm = parseFloat((document.getElementById('calcHeight').value || '').replace(',', '.'));
  const kg = parseFloat((document.getElementById('calcWeight').value || '').replace(',', '.'));
  const act = parseFloat(document.getElementById('calcActivity').value) || 1.55;
  if (!(age >= 10 && age <= 100) || !(cm >= 120 && cm <= 230) || !(kg >= 30 && kg <= 300)) {
    showToast('Yaş, boy ve kiloyu doğru gir', 'info'); return;
  }
  // Mifflin-St Jeor
  const bmr = Math.round(10 * kg + 6.25 * cm - 5 * age + (_calcSex === 'male' ? 5 : -161));
  const tdee = Math.round(bmr * act);
  let kcal = tdee;
  if (_calcGoal === 'lose') kcal = Math.max(Math.round(bmr * 1.1), tdee - 500);   // BMR'nin çok altına inme
  else if (_calcGoal === 'gain') kcal = tdee + 350;
  // Makro: protein 1.8 g/kg, yağ kcal'in %25'i, kalan karbonhidrat
  const protein = Math.round(1.8 * kg);
  const fat = Math.round(kcal * 0.25 / 9);
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  data.diet.calc = { sex: _calcSex, age, height: cm, weight: kg, activity: String(act), goal: _calcGoal };
  save();
  const goalLbl = _calcGoal === 'lose' ? 'kilo ver' : (_calcGoal === 'gain' ? 'kilo al' : 'koru');
  const el = document.getElementById('calcResult');
  if (el) el.innerHTML =
    `<div class="calc-out"><b>${kcal} kcal/gün</b> <span class="calc-sub">(${goalLbl} · BMR ${bmr}, TDEE ${tdee})</span></div>` +
    `<div class="calc-out-macros">Protein ${protein}g · Karb ${carb}g · Yağ ${fat}g</div>` +
    `<button class="small primary" onclick="applyCalcGoals(${kcal},${protein},${carb},${fat})">Bu hedefleri uygula</button>`;
}
function applyCalcGoals(kcal, protein, carb, fat) {
  ensureDiet();
  data.diet.kcalGoal = kcal; data.diet.proteinGoal = protein; data.diet.carbGoal = carb; data.diet.fatGoal = fat;
  save(); renderDiet();
  showToast('Hedefler güncellendi', 'success');
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
// ===== Öğün planı — çoklu plan + haftalık (güne göre) + net porsiyon =====
const PLAN_DAYS = [
  { k: 'all', t: 'Her gün' }, { k: 'pzt', t: 'Pzt' }, { k: 'sal', t: 'Sal' }, { k: 'car', t: 'Çar' },
  { k: 'per', t: 'Per' }, { k: 'cum', t: 'Cum' }, { k: 'cmt', t: 'Cmt' }, { k: 'paz', t: 'Paz' }
];
const _DAY_KEYS = ['paz', 'pzt', 'sal', 'car', 'per', 'cum', 'cmt']; // getDay(): 0=Paz..6=Cmt
function emptyPlanMeals() { return { all: [], pzt: [], sal: [], car: [], per: [], cum: [], cmt: [], paz: [] }; }
function dayKeyOf(dateKey) {
  const a = (dateKey || dietKey()).split('-').map(Number);
  return _DAY_KEYS[new Date(a[0], a[1] - 1, a[2]).getDay()];
}
function activePlan() {
  ensureDiet();
  const d = data.diet;
  let p = (d.plans || []).find(x => x.id === d.activePlanId);
  if (!p) { p = (d.plans || [])[0]; if (p) d.activePlanId = p.id; }
  return p || null;
}
// Belirli tarih için planlı öğünler: her gün + (haftalıksa) o günün kovası
function planMealsForDate(dateKey) {
  const p = activePlan(); if (!p) return [];
  const out = (p.meals.all || []).slice();
  if (p.weekly) out.push(...(p.meals[dayKeyOf(dateKey)] || []));
  return out;
}
let _planEditDay = 'all';
function selectPlanEditDay(k) { _planEditDay = k; renderPlanEditor(); }
function switchPlan(id) { ensureDiet(); data.diet.activePlanId = id; _planEditDay = 'all'; save(); renderDiet(); }
function togglePlanWeekly(on) { const p = activePlan(); if (!p) return; p.weekly = !!on; if (!on) _planEditDay = 'all'; save(); renderDiet(); }
function newPlan() {
  aidanPrompt('Yeni plan', 'Plan adı (örn. Cut, Bulk)', '', false).then(name => {
    name = (name || '').trim(); if (!name) return;
    ensureDiet();
    const pl = { id: Date.now(), name, weekly: false, meals: emptyPlanMeals() };
    data.diet.plans.push(pl); data.diet.activePlanId = pl.id; _planEditDay = 'all';
    save(); renderDiet();
  });
}
function renamePlan() {
  const p = activePlan(); if (!p) return;
  aidanPrompt('Planı yeniden adlandır', 'Ad', p.name, false).then(name => {
    name = (name || '').trim(); if (!name) return; p.name = name; save(); renderDiet();
  });
}
function deletePlan() {
  ensureDiet(); const d = data.diet;
  if ((d.plans || []).length <= 1) { showToast('En az bir plan kalmalı', 'info'); return; }
  const p = activePlan(); if (!p) return;
  d.plans = d.plans.filter(x => x.id !== p.id); d.activePlanId = d.plans[0].id; _planEditDay = 'all';
  save(); renderDiet(); showToast('Plan silindi', 'success');
}
function renderPlanEditor() {
  const host = document.getElementById('planEditor'); if (!host) return;
  ensureDiet();
  const d = data.diet, p = activePlan();
  let h = '<div class="plan-picker">';
  (d.plans || []).forEach(pl => { h += `<button class="plan-pick-chip${pl.id === d.activePlanId ? ' active' : ''}" onclick="switchPlan(${pl.id})">${escapeHtml(pl.name)}</button>`; });
  h += `<button class="plan-pick-add" onclick="newPlan()" title="Yeni plan" aria-label="Yeni plan">＋</button></div>`;
  if (p) {
    h += `<div class="plan-tools"><label class="plan-weekly"><input type="checkbox" ${p.weekly ? 'checked' : ''} onchange="togglePlanWeekly(this.checked)"> Haftalık (güne göre)</label>`;
    h += `<button class="small ghost" onclick="renamePlan()">Ad</button>`;
    if ((d.plans || []).length > 1) h += `<button class="small ghost" onclick="deletePlan()">Sil</button>`;
    h += `</div>`;
    if (p.weekly) {
      h += '<div class="plan-day-chips">' + PLAN_DAYS.map(dd => `<button class="day-chip${_planEditDay === dd.k ? ' active' : ''}" onclick="selectPlanEditDay('${dd.k}')">${dd.t}</button>`).join('') + '</div>';
    } else { _planEditDay = 'all'; }
    const bucket = p.meals[_planEditDay] || [];
    let bl = '';
    Object.keys(MEAL_SLOTS).forEach(slot => {
      const items = bucket.filter(x => x.slot === slot); if (!items.length) return;
      bl += `<div class="meal-group"><div class="meal-group-head">${MEAL_SLOTS[slot]}</div>`;
      items.forEach(it => {
        const mt = (it.protein != null || it.carb != null || it.fat != null) ? ` · P${it.protein || 0} K${it.carb || 0} Y${it.fat || 0}` : '';
        bl += `<div class="plan-item"><span class="plan-name">${escapeHtml(it.name)}</span><span class="meal-kcal-tag">${it.kcal != null ? it.kcal + ' kcal' : ''}${mt}</span><button class="meal-del" onclick="removePlanMeal(${it.id})" title="Sil" aria-label="Sil">✕</button></div>`;
      });
      bl += '</div>';
    });
    h += `<div class="plan-bucket">${bl || '<div class="diet-empty">Bu güne öğün eklenmedi.</div>'}</div>`;
  }
  host.innerHTML = h;
}

function renderDietPlan() {
  ensureDiet();
  renderPlanEditor();
  const p = activePlan();
  const el = document.getElementById('planList'), meta = document.getElementById('planMeta');
  if (!el) return;
  if (!p) { el.innerHTML = '<div class="diet-empty">Henüz plan yok.</div>'; if (meta) meta.textContent = ''; return; }
  const planned = planMealsForDate(dietKey());
  if (!planned.length) {
    el.innerHTML = '<div class="diet-empty">Bugün için planlı öğün yok. "Planı düzenle" ile ekle ya da diyetisyen kağıdını okut.</div>';
    if (meta) meta.textContent = p.name; return;
  }
  const day = dietDay(false);
  const eatenIds = new Set((day.meals || []).filter(m => m.planId != null).map(m => m.planId));
  const eatenN = planned.filter(x => eatenIds.has(x.id)).length;
  const totalK = planned.reduce((s, x) => s + (Number(x.kcal) || 0), 0);
  if (meta) meta.textContent = `${p.name} · ${eatenN}/${planned.length} yendi${totalK ? ` · ${totalK} kcal` : ''}`;
  let html = '';
  Object.keys(MEAL_SLOTS).forEach(slot => {
    const items = planned.filter(x => x.slot === slot);
    if (!items.length) return;
    html += `<div class="meal-group"><div class="meal-group-head">${MEAL_SLOTS[slot]}</div>`;
    items.forEach(it => {
      const eaten = eatenIds.has(it.id);
      const mt = (it.protein != null || it.carb != null || it.fat != null) ? ` · P${it.protein || 0} K${it.carb || 0} Y${it.fat || 0}` : '';
      html += `<div class="plan-item${eaten ? ' eaten' : ''}">` +
        `<button class="plan-check${eaten ? ' on' : ''}" onclick="togglePlanEaten(${it.id})" title="${eaten ? 'işareti kaldır' : 'yedim'}" aria-label="yedim">${eaten ? '✓' : ''}</button>` +
        `<span class="plan-name">${escapeHtml(it.name)}</span>` +
        `<span class="meal-kcal-tag">${it.kcal != null ? it.kcal + ' kcal' : ''}${mt}</span>` +
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
  ensureDiet(); const p = activePlan(); if (!p) return;
  const bucket = p.weekly ? _planEditDay : 'all';
  p.meals[bucket] = p.meals[bucket] || [];
  p.meals[bucket].push({ id: Date.now() + Math.floor(Math.random() * 1000), slot: _planSlot, name, kcal, protein: _optMacro('planP'), carb: _optMacro('planC'), fat: _optMacro('planF') });
  nameEl.value = ''; kcalEl.value = '';
  ['planP', 'planC', 'planF'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  save(); renderDiet(); nameEl.focus();
}

function removePlanMeal(id) {
  ensureDiet(); const p = activePlan(); if (!p) return;
  Object.keys(p.meals).forEach(k => { p.meals[k] = (p.meals[k] || []).filter(x => x.id !== id); });
  const day = dietDay(); day.meals = (day.meals || []).filter(m => m.planId !== id);
  save(); renderDiet();
}

// 'yedim' işareti: planlı yemeği bugünün öğün loguna ekle/çıkar
function togglePlanEaten(planId) {
  ensureDiet();
  const p = planMealsForDate(dietKey()).find(x => x.id === planId);
  if (!p) return;
  const day = dietDay();
  const idx = day.meals.findIndex(m => m.planId === planId);
  if (idx >= 0) day.meals.splice(idx, 1);
  else day.meals.push({ id: Date.now(), slot: p.slot, name: p.name, kcal: p.kcal, protein: p.protein != null ? p.protein : null, carb: p.carb != null ? p.carb : null, fat: p.fat != null ? p.fat : null, planId });
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
  ensureDiet(); const p = activePlan(); if (!p) { closeDietPlanImport(); return; }
  const bucket = p.weekly ? _planEditDay : 'all'; p.meals[bucket] = p.meals[bucket] || [];
  let added = 0;
  for (const it of _dpImportItems) {
    const name = (it.name || '').trim(); if (!name) continue;
    p.meals[bucket].push({ id: Date.now() + Math.floor(Math.random() * 100000), slot: it.slot || 'atistirma', name, kcal: (it.kcal != null ? it.kcal : null), protein: null, carb: null, fat: null });
    added++;
  }
  closeDietPlanImport(); save(); renderDiet();
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
  const bd = multi ? `<div class="macro-note">${j.items.map(it => `${escapeHtml(it.name)} · ${it.kcal} kcal${(it.source === 'usda' || it.source === 'curated') ? '' : ' (tahmin)'}`).join('  +  ')}</div>` : '';
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
  renderCustomManage();
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
    sc.src = '/html5-qrcode.min.js';  // self-host (jsdelivr yerine, CSP tam kapali)
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
    if (!p) {
      // OFF'ta yoksa akış kopmasın: doğrudan "Elle" sekmesine geç, ada odaklan
      if (st) st.textContent = 'Bu barkod veritabanında yok (' + code + ').';
      foodModalTab('elle');
      const nm = document.getElementById('mealName');
      if (nm) { nm.value = ''; setTimeout(() => nm.focus(), 80); }
      showToast('Barkod bulunamadı — elle ekleyebilirsin', 'info');
      return;
    }
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
    // Marka/paket icin Open Food Facts + jenerik/coklu icin AI — PARALEL
    const offProm = offSearch(q).catch(() => []);
    const aiProm = (async () => {
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
      return j;
    })().catch(e => ({ __err: e.message }));
    const [offRes, aiJson] = await Promise.all([offProm, aiProm]);
    renderSearchResults(q, offRes, aiJson);
    pushRecentFood(q);
  })();
}
// OFF (marka/paket) + AI (jenerik/coklu) sonuclarini tek listede goster.
// Marka urunleri ambalaj makrosuyla (per-100g, gram porsiyon) gelir; AI satiri adet/porsiyon.
function renderSearchResults(q, offRes, aiJson) {
  const out = document.getElementById('foodSearchResults');
  const fp = document.getElementById('foodPortion'); if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }
  const qn = (typeof trNorm === 'function') ? trNorm(q) : q.toLowerCase();
  const qwords = qn.split(/\s+/).filter(w => w.length > 2);
  // OFF: makrosu olan + sorguyla alakali (ad/marka sorgu kelimesini icersin) ilk 6
  const off = (offRes || []).filter(p => {
    if (!p || p.kcal100 == null) return false;
    if (!qwords.length) return true;
    const nm = (typeof trNorm === 'function') ? trNorm((p.name || '') + ' ' + (p.brand || '')) : ((p.name || '') + ' ' + (p.brand || '')).toLowerCase();
    return qwords.some(w => nm.includes(w));
  }).slice(0, 6);
  _foodResults = off; // pickFood(i) bunu indeksler
  let html = '';
  if (off.length) {
    html += '<div class="freq-head">Paket / marka</div><div class="food-results">' +
      off.map((p, i) => `<button class="food-result" onclick="pickFood(${i})"><span class="food-result-name">${escapeHtml(p.name)}${p.brand ? ` <span class="food-result-brand">${escapeHtml(p.brand)}</span>` : ''}</span><span class="food-result-kcal">${Math.round(p.kcal100)} kcal/100g</span></button>`).join('') +
      '</div>';
  }
  const base = aiJson && !aiJson.__err && (aiJson.ai || aiJson.db);
  if (base && base.kcal != null) {
    _aiFood = {
      name: q, kcal: base.kcal, protein: base.protein, carb: base.carb, fat: base.fat,
      multi: !!(aiJson.items && aiJson.items.length > 1), items: aiJson.items || [], source: aiJson.source
    };
    _aiFood._srcLbl = aiJson.source === 'usda' ? 'Veritabanı' : (aiJson.source === 'mixed' ? 'Veritabanı + AI' : (_aiFood.multi ? 'Toplam' : 'AI tahmini'));
    _aiFood._bd = _aiFood.multi ? `<div class="macro-note">${_aiFood.items.map(it => `${escapeHtml(it.name)} · ${it.kcal} kcal${(it.source === 'usda' || it.source === 'curated') ? '' : ' (tahmin)'}`).join('  +  ')}</div>` : '';
    html += '<div class="freq-head">Jenerik / hesap</div><div class="food-results">' +
      `<button class="food-result" onclick="pickAiRow()"><span class="food-result-name">${escapeHtml(q)} <span class="food-result-brand">${_aiFood._srcLbl}</span></span><span class="food-result-kcal">${base.kcal} kcal</span></button>` +
      '</div>';
  }
  if (!html) { out.innerHTML = '<div class="diet-empty">Sonuç yok. "Elle" sekmesinden kalori girebilirsin.</div>'; return; }
  out.innerHTML = html;
  // Marka eslesme yoksa tek AI sonucunu otomatik ac (hizli ekleme)
  if (!off.length && base && base.kcal != null) pickAiRow();
}
function pickAiRow() {
  if (!_aiFood) return;
  showAiPortion(_aiFood.name, _aiFood._srcLbl || '', _aiFood._bd || '');
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
  const bd = _aiFood.multi ? `<div class="macro-note">${_aiFood.items.map(it => `${escapeHtml(it.name)} · ${it.kcal} kcal${(it.source === 'usda' || it.source === 'curated') ? '' : ' (tahmin)'}`).join('  +  ')}</div>` : '';
  showAiPortion(q, srcLbl, bd);
}
// Ortak porsiyon/adet arayüzü (AI sonucu + kişisel hafıza ikisi de kullanır)
// Çoklu yemek (zaten miktarlı, ör "4 yumurta 2 ekmek") → adet çarpanı GİZLENİR (çift sayım önlenir),
// tek jenerik besinde (ör "yumurta") adet çarpanı kalır.
function showAiPortion(q, srcLbl, bd) {
  const out = document.getElementById('foodSearchResults'); if (out) out.innerHTML = '';
  const fl = document.getElementById('foodLocal'); if (fl) fl.innerHTML = '';
  const fp = document.getElementById('foodPortion');
  fp.style.display = 'block';
  const multi = !!(_aiFood && _aiFood.multi);
  const qtyRow = multi
    ? '<div class="portion-note">Yazdığın miktarlar zaten hesaba katıldı — aşağıdaki toplam eklenir.</div>'
    : `<div class="portion-row"><label>Adet / porsiyon</label><input id="aiQty" type="number" inputmode="decimal" value="1" min="0.25" step="0.25" oninput="updateAiPreview()"></div>`;
  fp.innerHTML = `<div class="portion-pick">${escapeHtml(q)} <span class="ai-src">${srcLbl}</span></div>` +
    (bd || '') + qtyRow +
    `<div class="portion-preview" id="aiPreview"></div>` +
    `<button class="portion-add" onclick="addAiFood()">${MEAL_SLOTS[_mealSlot] || 'Öğün'}'e ekle</button>`;
  updateAiPreview();
  fp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// ===== Kişisel öğrenen besin DB — geçmişte loglanan yemeklerden anlık lokal eşleşme =====
function foodMemoryMatches(q, limit) {
  ensureDiet();
  const nq = trNorm(q);
  if (nq.length < 2) return [];
  const days = data.diet.days || {}, map = new Map();
  for (const dk of Object.keys(days).sort()) {
    for (const m of (days[dk].meals || [])) {
      const name = String(m.name || '').trim();
      if (!name || !trNorm(name).includes(nq)) continue;
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
let _foodInputTimer = null, _localMatches = [], _seedMatches = [], _customMatches = [], _pickQty = null;
function onFoodSearchInput() { clearTimeout(_foodInputTimer); _foodInputTimer = setTimeout(renderLocalMatches, 180); }
function renderLocalMatches() {
  const el = document.getElementById('foodLocal'); if (!el) return;
  const raw = (document.getElementById('foodSearchInput').value || '').trim();
  // '2 dilim ekmek' → miktar 2 + çekirdek 'ekmek'; miktar seçilen besinin adedine önyüklenir
  const parsed = parseFoodQuery(raw);
  _pickQty = parsed.qty;
  const q = (parsed.core && parsed.core.length >= 2) ? parsed.core : raw;
  _customMatches = customFoodMatches(q, 6);
  const customNames = new Set(_customMatches.map(m => m.name.toLocaleLowerCase('tr')));
  _localMatches = foodMemoryMatches(q, 6).filter(m => !customNames.has(m.name.toLocaleLowerCase('tr')));
  const personalNames = new Set([...customNames, ..._localMatches.map(m => m.name.toLocaleLowerCase('tr'))]);
  _seedMatches = seedFoodMatches(q, 10).filter(sf => !personalNames.has(sf.n.toLocaleLowerCase('tr')));
  let html = '';
  if (_customMatches.length) {
    html += '<div class="freq-head">Kendi besinlerim</div><div class="food-results">' +
      _customMatches.map((m, i) => `<button class="food-result" onclick="pickCustomFood(${i})"><span class="food-result-name">${escapeHtml(m.name)}${m.unit ? ` <span class="food-result-brand">${escapeHtml(m.unit)}</span>` : ''}</span><span class="food-result-kcal">${m.kcal} kcal</span></button>`).join('') +
      '</div>';
  }
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

// ===== Kendi besinlerim (özel besin kaydı) =====
function customFoodMatches(q, limit) {
  ensureDiet();
  q = (q || '').trim().toLocaleLowerCase('tr');
  const list = data.diet.customFoods || [];
  const nq = trNorm(q);
  const arr = nq.length < 2 ? list.slice() : list.filter(c => trNorm(c.name).includes(nq));
  return arr.slice(0, limit || 6);
}
function pickCustomFood(i) {
  const m = _customMatches[i]; if (!m) return;
  _aiFood = { name: m.name, kcal: m.kcal, protein: m.protein, carb: m.carb, fat: m.fat, multi: false, items: [], source: 'custom' };
  showAiPortion(m.name, 'Kendi besinim' + (m.unit ? ' · ' + m.unit : ''), '');
  applyPickQty();
}
// Elle formundaki ad/kcal/makroları kalıcı "kendi besinim" olarak kaydet (bugüne EKLEMEZ)
function saveCustomFood() {
  ensureDiet();
  const name = (document.getElementById('mealName').value || '').trim();
  if (!name) { showToast('Önce besin adını yaz', 'info'); document.getElementById('mealName').focus(); return; }
  const kcalEl = document.getElementById('mealKcal');
  const kcal = kcalEl.value !== '' ? Math.max(0, parseInt(kcalEl.value, 10) || 0) : null;
  if (kcal == null) { showToast('Kalori gir (1 porsiyon için)', 'info'); kcalEl.focus(); return; }
  const rec = { id: Date.now(), name, unit: 'porsiyon', kcal, protein: _optMacro('mealP'), carb: _optMacro('mealC'), fat: _optMacro('mealF') };
  const low = name.toLocaleLowerCase('tr');
  const ex = data.diet.customFoods.find(c => String(c.name || '').toLocaleLowerCase('tr') === low);
  if (ex) { ex.kcal = rec.kcal; ex.protein = rec.protein; ex.carb = rec.carb; ex.fat = rec.fat; }
  else data.diet.customFoods.push(rec);
  save();
  renderCustomManage();
  showToast(name + ' besinlerine kaydedildi', 'success');
}
function deleteCustomFood(id) {
  ensureDiet();
  data.diet.customFoods = data.diet.customFoods.filter(c => c.id !== id);
  save(); renderCustomManage(); renderLocalMatches();
}
function renderCustomManage() {
  const el = document.getElementById('customFoodList'); if (!el) return;
  ensureDiet();
  const list = data.diet.customFoods || [];
  if (!list.length) { el.innerHTML = '<div class="diet-empty">Henüz özel besin yok. Yukarıya ad + kcal (+makro) yazıp "Besinime kaydet" de.</div>'; return; }
  el.innerHTML = list.map(c => {
    const macro = (c.protein != null || c.carb != null || c.fat != null) ? ` · P${c.protein || 0} K${c.carb || 0} Y${c.fat || 0}` : '';
    return `<div class="meal-item"><span class="meal-name">${escapeHtml(c.name)}</span><span class="meal-kcal-tag">${c.kcal} kcal${macro}</span><button class="meal-del" onclick="deleteCustomFood(${c.id})" title="Sil" aria-label="Sil">✕</button></div>`;
  }).join('');
}

// ===== Tariflerim / öğün paketleri (bir günün öğünlerini tek pakete kaydet, tek tıkla ekle) =====
let _recipeEdit = false;
function toggleRecipeEdit() { _recipeEdit = !_recipeEdit; renderRecipes(); }
async function saveRecipeFromDay() {
  ensureDiet();
  const day = dietDay(false);
  if (!day.meals.length) { showToast('Önce bu güne öğün ekle, sonra paket olarak kaydet', 'info'); return; }
  const name = await aidanPrompt('Tarif / öğün paketi', 'İsim (örn. Kahvaltım)', '');
  if (!name || !name.trim()) return;
  const items = day.meals.map(m => ({
    slot: m.slot, name: m.name,
    kcal: m.kcal != null ? m.kcal : null,
    protein: m.protein != null ? m.protein : null,
    carb: m.carb != null ? m.carb : null,
    fat: m.fat != null ? m.fat : null,
  }));
  data.diet.recipes.push({ id: Date.now(), name: name.trim(), items });
  save(); renderRecipes();
  showToast(name.trim() + ' kaydedildi (' + items.length + ' öğün)', 'success');
}
function addRecipe(id) {
  ensureDiet();
  const rec = data.diet.recipes.find(r => r.id === id);
  if (!rec) return;
  const day = dietDay(true);
  const base = Date.now();
  rec.items.forEach((it, k) => {
    day.meals.push({
      id: base + k, slot: it.slot || 'atistirma', name: it.name,
      kcal: it.kcal != null ? it.kcal : null,
      protein: it.protein != null ? it.protein : null,
      carb: it.carb != null ? it.carb : null,
      fat: it.fat != null ? it.fat : null,
    });
  });
  save(); renderDiet();
  showToast(rec.name + ' eklendi (' + rec.items.length + ' öğün)', 'success');
}
function deleteRecipe(id) {
  ensureDiet();
  data.diet.recipes = data.diet.recipes.filter(r => r.id !== id);
  save(); renderRecipes();
}
function renderRecipes() {
  const el = document.getElementById('recipeList'); if (!el) return;
  ensureDiet();
  const list = data.diet.recipes || [];
  if (!list.length) { el.innerHTML = '<div class="diet-empty">Henüz paket yok. Bir güne öğünlerini ekle, sonra "Bu günü kaydet" ile tek pakette topla — ertesi gün tek dokunuşla eklersin.</div>'; _recipeEdit = false; return; }
  const head = `<div class="freq-head">Dokun → bugüne ekle <button class="freq-editbtn" onclick="toggleRecipeEdit()">${_recipeEdit ? 'bitti' : 'düzenle'}</button></div>`;
  const chips = list.map(r => {
    const kcal = r.items.reduce((s, it) => s + (Number(it.kcal) || 0), 0);
    if (_recipeEdit) {
      return `<span class="freq-chip-edit"><span class="freq-chip-name">${escapeHtml(r.name)} · ${r.items.length} öğün</span><button class="freq-hide" onclick="deleteRecipe(${r.id})" title="Sil">✕</button></span>`;
    }
    return `<button class="freq-chip" onclick="addRecipe(${r.id})" title="Bugüne ekle">${escapeHtml(r.name)}${kcal ? ` · ${kcal} kcal` : ''}</button>`;
  }).join('');
  el.innerHTML = head + '<div class="freq-chips">' + chips + '</div>';
}
function pickPersonalFood(i) {
  const m = _localMatches[i]; if (!m) return;
  _aiFood = { name: m.name, kcal: m.kcal, protein: m.protein, carb: m.carb, fat: m.fat, multi: false, items: [], source: 'memory' };
  showAiPortion(m.name, 'Hafızandan', '');
  applyPickQty();
}
// ===== Temel Türk besinleri tohumu (birim başına yaklaşık değerler; n=ad, u=birim, k=kcal, p/c/f=makro) =====
const TURK_FOODS = [
  // --- Kahvaltı / süt ürünleri / yağlar ---
  { n: 'Yumurta', u: 'adet', k: 72, p: 6, c: 0, f: 5 },
  { n: 'Haşlanmış yumurta', u: 'adet', k: 72, p: 6, c: 0, f: 5 },
  { n: 'Omlet', u: '2 yumurta', k: 220, p: 13, c: 2, f: 17 },
  { n: 'Menemen', u: 'porsiyon', k: 220, p: 12, c: 10, f: 15 },
  { n: 'Sucuklu yumurta', u: 'porsiyon', k: 320, p: 18, c: 2, f: 26 },
  { n: 'Beyaz peynir', u: 'dilim', k: 75, p: 5, c: 1, f: 6 },
  { n: 'Kaşar peyniri', u: 'dilim', k: 110, p: 7, c: 1, f: 9 },
  { n: 'Lor peyniri', u: 'kaşık', k: 30, p: 4, c: 1, f: 1 },
  { n: 'Labne', u: 'kaşık', k: 60, p: 2, c: 1, f: 6 },
  { n: 'Krem peynir', u: 'kaşık', k: 50, p: 1, c: 1, f: 5 },
  { n: 'Yoğurt', u: 'kase', k: 120, p: 11, c: 9, f: 4 },
  { n: 'Süzme yoğurt', u: 'kase', k: 150, p: 16, c: 8, f: 6 },
  { n: 'Süt', u: 'bardak', k: 122, p: 6, c: 9, f: 7 },
  { n: 'Ayran', u: 'bardak', k: 76, p: 6, c: 5, f: 3 },
  { n: 'Tereyağı', u: 'kaşık', k: 72, p: 0, c: 0, f: 8 },
  { n: 'Zeytinyağı', u: 'kaşık', k: 119, p: 0, c: 0, f: 14 },
  { n: 'Bal', u: 'kaşık', k: 64, p: 0, c: 17, f: 0 },
  { n: 'Reçel', u: 'kaşık', k: 50, p: 0, c: 13, f: 0 },
  { n: 'Pekmez', u: 'kaşık', k: 50, p: 0, c: 13, f: 0 },
  { n: 'Tahin', u: 'kaşık', k: 90, p: 3, c: 3, f: 8 },
  { n: 'Kaymak', u: 'kaşık', k: 90, p: 1, c: 1, f: 9 },
  { n: 'Zeytin', u: '5 adet', k: 25, p: 0, c: 0, f: 3 },
  { n: 'Ekmek', u: 'dilim', k: 66, p: 2, c: 13, f: 1 },
  { n: 'Tam buğday ekmek', u: 'dilim', k: 69, p: 3, c: 12, f: 1 },
  { n: 'Simit', u: 'adet', k: 280, p: 9, c: 52, f: 4 },
  { n: 'Poğaça', u: 'adet', k: 250, p: 5, c: 28, f: 13 },
  { n: 'Açma', u: 'adet', k: 270, p: 6, c: 35, f: 12 },
  { n: 'Su böreği', u: 'dilim', k: 250, p: 8, c: 24, f: 13 },
  { n: 'Sigara böreği', u: 'adet', k: 90, p: 3, c: 8, f: 5 },
  { n: 'Gözleme', u: 'adet', k: 300, p: 10, c: 38, f: 12 },
  { n: 'Tost', u: 'adet', k: 300, p: 13, c: 30, f: 14 },
  { n: 'Yulaf ezmesi', u: 'porsiyon', k: 150, p: 5, c: 27, f: 3 },
  { n: 'Mısır gevreği', u: 'kase', k: 150, p: 3, c: 33, f: 1 },
  { n: 'Granola', u: 'porsiyon', k: 200, p: 5, c: 30, f: 7 },
  // --- Çorbalar ---
  { n: 'Mercimek çorbası', u: 'kase', k: 150, p: 8, c: 22, f: 3 },
  { n: 'Ezogelin çorbası', u: 'kase', k: 160, p: 7, c: 24, f: 4 },
  { n: 'Tavuk çorbası', u: 'kase', k: 120, p: 8, c: 12, f: 4 },
  { n: 'Domates çorbası', u: 'kase', k: 130, p: 4, c: 18, f: 5 },
  { n: 'Yayla çorbası', u: 'kase', k: 140, p: 6, c: 16, f: 6 },
  { n: 'İşkembe çorbası', u: 'kase', k: 180, p: 12, c: 8, f: 11 },
  { n: 'Çorba', u: 'kase', k: 120, p: 5, c: 15, f: 4 },
  // --- Et / tavuk / balık ---
  { n: 'Tavuk göğsü', u: 'porsiyon', k: 250, p: 47, c: 0, f: 6 },
  { n: 'Tavuk but', u: 'porsiyon', k: 290, p: 38, c: 0, f: 15 },
  { n: 'Tavuk şiş', u: 'porsiyon', k: 260, p: 40, c: 4, f: 9 },
  { n: 'Tavuk döner', u: 'porsiyon', k: 240, p: 28, c: 6, f: 11 },
  { n: 'Et döner', u: 'porsiyon', k: 320, p: 26, c: 4, f: 22 },
  { n: 'İskender', u: 'porsiyon', k: 650, p: 35, c: 45, f: 36 },
  { n: 'Adana kebap', u: 'porsiyon', k: 480, p: 32, c: 6, f: 36 },
  { n: 'Urfa kebap', u: 'porsiyon', k: 430, p: 33, c: 6, f: 30 },
  { n: 'Şiş kebap', u: 'porsiyon', k: 350, p: 38, c: 4, f: 20 },
  { n: 'Köfte', u: 'adet', k: 70, p: 5, c: 1, f: 5 },
  { n: 'İzgara köfte', u: 'porsiyon', k: 320, p: 26, c: 6, f: 21 },
  { n: 'Dana bonfile', u: 'porsiyon', k: 280, p: 46, c: 0, f: 10 },
  { n: 'Dana kıyma', u: 'porsiyon', k: 280, p: 26, c: 0, f: 19 },
  { n: 'Kuzu pirzola', u: 'porsiyon', k: 350, p: 30, c: 0, f: 25 },
  { n: 'Kavurma', u: 'porsiyon', k: 320, p: 28, c: 1, f: 23 },
  { n: 'Somon', u: 'porsiyon', k: 280, p: 40, c: 0, f: 13 },
  { n: 'Levrek', u: 'porsiyon', k: 200, p: 38, c: 0, f: 5 },
  { n: 'Çupra', u: 'porsiyon', k: 220, p: 38, c: 0, f: 7 },
  { n: 'Hamsi tava', u: 'porsiyon', k: 300, p: 28, c: 8, f: 17 },
  { n: 'Ton balığı', u: 'kutu', k: 90, p: 20, c: 0, f: 1 },
  { n: 'Hindi eti', u: 'porsiyon', k: 220, p: 40, c: 0, f: 6 },
  { n: 'Sosis', u: 'adet', k: 110, p: 5, c: 2, f: 9 },
  { n: 'Sucuk', u: 'dilim', k: 35, p: 2, c: 0, f: 3 },
  { n: 'Salam', u: 'dilim', k: 35, p: 2, c: 0, f: 3 },
  { n: 'Tavuk nugget', u: 'adet', k: 50, p: 3, c: 3, f: 3 },
  { n: 'Schnitzel', u: 'porsiyon', k: 380, p: 30, c: 22, f: 19 },
  // --- Tahıl / baklagil / makarna ---
  { n: 'Pilav', u: 'porsiyon', k: 200, p: 4, c: 44, f: 1 },
  { n: 'Bulgur pilavı', u: 'porsiyon', k: 170, p: 5, c: 34, f: 1 },
  { n: 'Sebzeli bulgur', u: 'porsiyon', k: 180, p: 5, c: 33, f: 3 },
  { n: 'Makarna', u: 'porsiyon', k: 260, p: 9, c: 52, f: 2 },
  { n: 'Kremalı makarna', u: 'porsiyon', k: 380, p: 11, c: 50, f: 15 },
  { n: 'Mantı', u: 'porsiyon', k: 330, p: 14, c: 45, f: 10 },
  { n: 'Erişte', u: 'porsiyon', k: 250, p: 8, c: 45, f: 4 },
  { n: 'Nohut', u: 'porsiyon', k: 230, p: 12, c: 38, f: 4 },
  { n: 'Etli nohut', u: 'porsiyon', k: 280, p: 16, c: 35, f: 9 },
  { n: 'Kuru fasulye', u: 'porsiyon', k: 250, p: 14, c: 40, f: 3 },
  { n: 'Etli kuru fasulye', u: 'porsiyon', k: 300, p: 18, c: 38, f: 9 },
  { n: 'Mercimek yemeği', u: 'porsiyon', k: 200, p: 12, c: 32, f: 3 },
  // --- Sebze yemekleri ---
  { n: 'Zeytinyağlı fasulye', u: 'porsiyon', k: 150, p: 4, c: 18, f: 8 },
  { n: 'Türlü', u: 'porsiyon', k: 160, p: 5, c: 20, f: 7 },
  { n: 'İmambayıldı', u: 'porsiyon', k: 180, p: 3, c: 16, f: 12 },
  { n: 'Karnıyarık', u: 'porsiyon', k: 280, p: 12, c: 18, f: 18 },
  { n: 'Yaprak sarma', u: 'adet', k: 40, p: 1, c: 6, f: 2 },
  { n: 'Biber dolması', u: 'adet', k: 120, p: 4, c: 16, f: 5 },
  { n: 'Ispanak yemeği', u: 'porsiyon', k: 130, p: 6, c: 12, f: 6 },
  { n: 'Mücver', u: 'adet', k: 80, p: 2, c: 6, f: 5 },
  { n: 'Musakka', u: 'porsiyon', k: 250, p: 12, c: 16, f: 15 },
  // --- Salata / patates ---
  { n: 'Çoban salata', u: 'porsiyon', k: 60, p: 2, c: 8, f: 3 },
  { n: 'Mevsim salata', u: 'porsiyon', k: 50, p: 2, c: 7, f: 2 },
  { n: 'Domates', u: 'adet', k: 22, p: 1, c: 5, f: 0 },
  { n: 'Salatalık', u: 'adet', k: 15, p: 1, c: 3, f: 0 },
  { n: 'Haşlanmış patates', u: 'adet', k: 130, p: 3, c: 30, f: 0 },
  { n: 'Patates kızartması', u: 'porsiyon', k: 320, p: 4, c: 40, f: 16 },
  { n: 'Avokado', u: 'yarım', k: 110, p: 1, c: 6, f: 10 },
  // --- Meyveler ---
  { n: 'Muz', u: 'adet', k: 105, p: 1, c: 27, f: 0 },
  { n: 'Elma', u: 'adet', k: 78, p: 0, c: 21, f: 0 },
  { n: 'Portakal', u: 'adet', k: 62, p: 1, c: 15, f: 0 },
  { n: 'Mandalina', u: 'adet', k: 40, p: 1, c: 10, f: 0 },
  { n: 'Armut', u: 'adet', k: 100, p: 1, c: 27, f: 0 },
  { n: 'Üzüm', u: 'kase', k: 100, p: 1, c: 26, f: 0 },
  { n: 'Çilek', u: 'kase', k: 50, p: 1, c: 12, f: 0 },
  { n: 'Karpuz', u: 'dilim', k: 85, p: 2, c: 21, f: 0 },
  { n: 'Kavun', u: 'dilim', k: 60, p: 1, c: 14, f: 0 },
  { n: 'Kiraz', u: 'kase', k: 90, p: 2, c: 22, f: 0 },
  { n: 'Şeftali', u: 'adet', k: 60, p: 1, c: 15, f: 0 },
  { n: 'Kayısı', u: 'adet', k: 17, p: 0, c: 4, f: 0 },
  { n: 'İncir', u: 'adet', k: 40, p: 0, c: 10, f: 0 },
  { n: 'Nar', u: 'adet', k: 105, p: 2, c: 26, f: 0 },
  { n: 'Kivi', u: 'adet', k: 45, p: 1, c: 11, f: 0 },
  // --- Kuruyemiş / atıştırma ---
  { n: 'Fındık', u: '10 adet', k: 95, p: 2, c: 3, f: 9 },
  { n: 'Badem', u: '10 adet', k: 70, p: 3, c: 2, f: 6 },
  { n: 'Ceviz', u: '2 yarım', k: 52, p: 1, c: 1, f: 5 },
  { n: 'Antep fıstığı', u: 'avuç', k: 160, p: 6, c: 8, f: 13 },
  { n: 'Yer fıstığı', u: 'avuç', k: 170, p: 7, c: 5, f: 14 },
  { n: 'Leblebi', u: 'avuç', k: 120, p: 7, c: 20, f: 2 },
  { n: 'Kuru üzüm', u: 'avuç', k: 85, p: 1, c: 22, f: 0 },
  { n: 'Kuru kayısı', u: 'adet', k: 20, p: 0, c: 5, f: 0 },
  { n: 'Hurma', u: 'adet', k: 20, p: 0, c: 5, f: 0 },
  // --- Tatlılar / atıştırmalık ---
  { n: 'Baklava', u: 'dilim', k: 330, p: 5, c: 40, f: 17 },
  { n: 'Künefe', u: 'porsiyon', k: 400, p: 9, c: 45, f: 20 },
  { n: 'Sütlaç', u: 'kase', k: 220, p: 6, c: 38, f: 5 },
  { n: 'Kazandibi', u: 'porsiyon', k: 230, p: 6, c: 40, f: 5 },
  { n: 'Dondurma', u: 'top', k: 90, p: 2, c: 12, f: 4 },
  { n: 'Kek', u: 'dilim', k: 240, p: 4, c: 35, f: 10 },
  { n: 'Kurabiye', u: 'adet', k: 70, p: 1, c: 9, f: 4 },
  { n: 'Lokum', u: 'adet', k: 50, p: 0, c: 13, f: 0 },
  { n: 'Tahin helva', u: 'dilim', k: 250, p: 6, c: 25, f: 15 },
  { n: 'Profiterol', u: 'porsiyon', k: 350, p: 6, c: 38, f: 19 },
  { n: 'Çikolata', u: 'parça', k: 55, p: 1, c: 6, f: 3 },
  { n: 'Çikolatalı gofret', u: 'adet', k: 120, p: 2, c: 14, f: 7 },
  { n: 'Bisküvi', u: 'adet', k: 40, p: 1, c: 6, f: 2 },
  { n: 'Kraker', u: 'adet', k: 15, p: 0, c: 2, f: 1 },
  { n: 'Patlamış mısır', u: 'kase', k: 120, p: 3, c: 20, f: 4 },
  { n: 'Cips', u: 'paket', k: 160, p: 2, c: 15, f: 10 },
  // --- Fast food / sokak ---
  { n: 'Döner (ekmek arası)', u: 'adet', k: 450, p: 25, c: 45, f: 20 },
  { n: 'Tavuk dürüm', u: 'adet', k: 400, p: 26, c: 42, f: 14 },
  { n: 'Pizza', u: 'dilim', k: 285, p: 12, c: 36, f: 10 },
  { n: 'Hamburger', u: 'adet', k: 350, p: 17, c: 30, f: 18 },
  { n: 'Lahmacun', u: 'adet', k: 250, p: 11, c: 30, f: 9 },
  { n: 'Kıymalı pide', u: 'porsiyon', k: 600, p: 26, c: 70, f: 24 },
  { n: 'Kumpir', u: 'adet', k: 550, p: 14, c: 70, f: 24 },
  { n: 'Tantuni', u: 'porsiyon', k: 380, p: 24, c: 38, f: 14 },
  { n: 'Çiğ köfte dürüm', u: 'adet', k: 250, p: 7, c: 48, f: 3 },
  { n: 'Midye dolma', u: 'adet', k: 25, p: 1, c: 4, f: 1 },
  { n: 'Tavuk kanat', u: 'adet', k: 90, p: 8, c: 1, f: 6 },
  // --- İçecekler ---
  { n: 'Çay', u: 'bardak', k: 2, p: 0, c: 0, f: 0 },
  { n: 'Türk kahvesi', u: 'fincan', k: 5, p: 0, c: 1, f: 0 },
  { n: 'Filtre kahve', u: 'fincan', k: 5, p: 0, c: 1, f: 0 },
  { n: 'Latte', u: 'bardak', k: 120, p: 6, c: 10, f: 6 },
  { n: 'Cappuccino', u: 'bardak', k: 80, p: 4, c: 8, f: 4 },
  { n: 'Kola', u: 'kutu', k: 139, p: 0, c: 35, f: 0 },
  { n: 'Kola (light)', u: 'kutu', k: 1, p: 0, c: 0, f: 0 },
  { n: 'Meyve suyu', u: 'bardak', k: 90, p: 0, c: 22, f: 0 },
  { n: 'Limonata', u: 'bardak', k: 100, p: 0, c: 25, f: 0 },
  { n: 'Soda', u: 'şişe', k: 0, p: 0, c: 0, f: 0 },
  { n: 'Su', u: 'bardak', k: 0, p: 0, c: 0, f: 0 },
  { n: 'Şalgam', u: 'bardak', k: 20, p: 1, c: 4, f: 0 },
  { n: 'Milkshake', u: 'bardak', k: 280, p: 8, c: 42, f: 9 },
  { n: 'Enerji içeceği', u: 'kutu', k: 110, p: 0, c: 28, f: 0 },
  { n: 'Bira', u: 'şişe', k: 150, p: 1, c: 13, f: 0 },
  { n: 'Şarap', u: 'kadeh', k: 120, p: 0, c: 4, f: 0 },
  { n: 'Rakı', u: 'kadeh', k: 130, p: 0, c: 0, f: 0 },
  { n: 'Şeker', u: 'küp', k: 12, p: 0, c: 3, f: 0 },
  { n: 'Sahanda yumurta', u: 'adet', k: 110, p: 7, c: 1, f: 9 },
  { n: 'Çılbır', u: 'porsiyon', k: 260, p: 14, c: 8, f: 18 },
  { n: 'Tulum peyniri', u: 'dilim', k: 90, p: 6, c: 1, f: 7 },
  { n: 'Dil peyniri', u: 'dilim', k: 80, p: 6, c: 1, f: 6 },
  { n: 'Çökelek', u: 'porsiyon', k: 70, p: 10, c: 3, f: 2 },
  { n: 'Kefir', u: 'bardak', k: 100, p: 6, c: 9, f: 4 },
  { n: 'Bazlama', u: 'dilim', k: 150, p: 4, c: 30, f: 2 },
  { n: 'Krep', u: 'adet', k: 130, p: 4, c: 18, f: 5 },
  { n: 'Pankek', u: 'adet', k: 90, p: 3, c: 15, f: 2 },
  { n: 'Waffle', u: 'adet', k: 220, p: 5, c: 30, f: 9 },
  { n: 'Yumurta akı', u: 'adet', k: 17, p: 4, c: 0, f: 0 },
  { n: 'Chia puding', u: 'kase', k: 200, p: 6, c: 22, f: 9 },
  { n: 'Müsli', u: 'kase', k: 210, p: 6, c: 38, f: 5 },
  { n: 'Kahvaltı tabağı', u: 'porsiyon', k: 450, p: 18, c: 30, f: 28 },
  { n: 'Peynirli börek', u: 'dilim', k: 250, p: 8, c: 24, f: 13 },
  { n: 'Tarhana çorbası', u: 'kase', k: 120, p: 5, c: 20, f: 2 },
  { n: 'Mantar çorbası', u: 'kase', k: 110, p: 3, c: 12, f: 6 },
  { n: 'Düğün çorbası', u: 'kase', k: 150, p: 6, c: 12, f: 8 },
  { n: 'Brokoli çorbası', u: 'kase', k: 100, p: 4, c: 11, f: 5 },
  { n: 'Şehriye çorbası', u: 'kase', k: 110, p: 4, c: 20, f: 2 },
  { n: 'Tavuk pirzola', u: 'porsiyon', k: 220, p: 28, c: 2, f: 11 },
  { n: 'Tavuk sote', u: 'porsiyon', k: 240, p: 26, c: 8, f: 11 },
  { n: 'Et sote', u: 'porsiyon', k: 300, p: 28, c: 8, f: 17 },
  { n: 'Ciğer tava', u: 'porsiyon', k: 250, p: 24, c: 10, f: 12 },
  { n: 'Kokoreç', u: 'porsiyon', k: 330, p: 18, c: 6, f: 26 },
  { n: 'Köri tavuk', u: 'porsiyon', k: 320, p: 27, c: 12, f: 18 },
  { n: 'Kuzu tandır', u: 'porsiyon', k: 380, p: 30, c: 2, f: 28 },
  { n: 'Beyti kebap', u: 'porsiyon', k: 420, p: 28, c: 18, f: 26 },
  { n: 'Çöp şiş', u: 'şiş', k: 70, p: 7, c: 1, f: 4 },
  { n: 'Etli ekmek', u: 'dilim', k: 230, p: 11, c: 26, f: 9 },
  { n: 'Karides', u: 'porsiyon', k: 150, p: 25, c: 3, f: 4 },
  { n: 'Kalamar tava', u: 'porsiyon', k: 230, p: 18, c: 16, f: 11 },
  { n: 'Midye tava', u: 'porsiyon', k: 260, p: 12, c: 24, f: 13 },
  { n: 'Balık ızgara', u: 'porsiyon', k: 200, p: 26, c: 0, f: 10 },
  { n: 'Uskumru', u: 'porsiyon', k: 260, p: 24, c: 0, f: 18 },
  { n: 'Palamut', u: 'porsiyon', k: 230, p: 25, c: 0, f: 14 },
  { n: 'Tavuk haşlama', u: 'porsiyon', k: 180, p: 30, c: 0, f: 6 },
  { n: 'Kinoa', u: 'porsiyon', k: 180, p: 6, c: 32, f: 3 },
  { n: 'Kahverengi pilav', u: 'porsiyon', k: 215, p: 5, c: 45, f: 2 },
  { n: 'Tam buğday makarna', u: 'porsiyon', k: 200, p: 8, c: 40, f: 2 },
  { n: 'Kuskus', u: 'porsiyon', k: 180, p: 6, c: 36, f: 1 },
  { n: 'Fırın makarna', u: 'porsiyon', k: 330, p: 14, c: 38, f: 13 },
  { n: 'Lazanya', u: 'porsiyon', k: 380, p: 18, c: 36, f: 18 },
  { n: 'Mercimek köftesi', u: 'adet', k: 45, p: 2, c: 7, f: 1 },
  { n: 'Falafel', u: 'adet', k: 55, p: 2, c: 6, f: 3 },
  { n: 'Humus', u: 'porsiyon', k: 180, p: 6, c: 18, f: 10 },
  { n: 'Kısır', u: 'porsiyon', k: 200, p: 5, c: 34, f: 5 },
  { n: 'Noodle', u: 'porsiyon', k: 240, p: 7, c: 38, f: 7 },
  { n: 'İçli köfte', u: 'adet', k: 120, p: 5, c: 14, f: 5 },
  { n: 'Lahmacun dürüm', u: 'adet', k: 260, p: 12, c: 32, f: 9 },
  { n: 'Brokoli', u: 'porsiyon', k: 55, p: 4, c: 8, f: 1 },
  { n: 'Karnabahar', u: 'porsiyon', k: 50, p: 3, c: 8, f: 1 },
  { n: 'Kabak yemeği', u: 'porsiyon', k: 120, p: 3, c: 12, f: 7 },
  { n: 'Bezelye yemeği', u: 'porsiyon', k: 160, p: 7, c: 22, f: 5 },
  { n: 'Enginar', u: 'porsiyon', k: 90, p: 3, c: 15, f: 2 },
  { n: 'Pırasa yemeği', u: 'porsiyon', k: 110, p: 3, c: 14, f: 5 },
  { n: 'Lahana sarma', u: 'adet', k: 45, p: 2, c: 7, f: 1 },
  { n: 'Közlenmiş patlıcan', u: 'porsiyon', k: 90, p: 2, c: 10, f: 5 },
  { n: 'Sebze sote', u: 'porsiyon', k: 130, p: 4, c: 16, f: 6 },
  { n: 'Etli kabak', u: 'porsiyon', k: 180, p: 12, c: 12, f: 9 },
  { n: 'Roka salata', u: 'porsiyon', k: 60, p: 2, c: 5, f: 4 },
  { n: 'Sezar salata', u: 'porsiyon', k: 280, p: 12, c: 12, f: 20 },
  { n: 'Ton balıklı salata', u: 'porsiyon', k: 220, p: 20, c: 10, f: 11 },
  { n: 'Yeşil salata', u: 'porsiyon', k: 70, p: 2, c: 7, f: 4 },
  { n: 'Patates püresi', u: 'porsiyon', k: 180, p: 3, c: 24, f: 8 },
  { n: 'Fırın patates', u: 'porsiyon', k: 160, p: 3, c: 30, f: 3 },
  { n: 'Tatlı patates', u: 'porsiyon', k: 150, p: 2, c: 32, f: 1 },
  { n: 'Ananas', u: 'dilim', k: 50, p: 0, c: 13, f: 0 },
  { n: 'Mango', u: 'adet', k: 100, p: 1, c: 25, f: 0 },
  { n: 'Böğürtlen', u: 'kase', k: 45, p: 1, c: 10, f: 0 },
  { n: 'Yaban mersini', u: 'kase', k: 60, p: 1, c: 14, f: 0 },
  { n: 'Greyfurt', u: 'adet', k: 80, p: 1, c: 20, f: 0 },
  { n: 'Erik', u: 'adet', k: 30, p: 0, c: 8, f: 0 },
  { n: 'Vişne', u: 'kase', k: 60, p: 1, c: 15, f: 0 },
  { n: 'Ahududu', u: 'kase', k: 55, p: 1, c: 12, f: 1 },
  { n: 'Limon', u: 'adet', k: 17, p: 0, c: 5, f: 0 },
  { n: 'Kaju', u: 'avuç', k: 160, p: 5, c: 9, f: 13 },
  { n: 'Ay çekirdeği', u: 'avuç', k: 165, p: 6, c: 7, f: 14 },
  { n: 'Kabak çekirdeği', u: 'avuç', k: 150, p: 9, c: 4, f: 13 },
  { n: 'Karışık kuruyemiş', u: 'avuç', k: 170, p: 5, c: 8, f: 14 },
  { n: 'Protein bar', u: 'adet', k: 200, p: 20, c: 20, f: 7 },
  { n: 'Granola bar', u: 'adet', k: 120, p: 3, c: 20, f: 4 },
  { n: 'Meyveli yoğurt', u: 'kase', k: 150, p: 6, c: 24, f: 4 },
  { n: 'Protein tozu', u: 'ölçek', k: 120, p: 24, c: 3, f: 2 },
  { n: 'Revani', u: 'dilim', k: 290, p: 4, c: 48, f: 9 },
  { n: 'Şekerpare', u: 'adet', k: 150, p: 2, c: 26, f: 5 },
  { n: 'Tulumba', u: 'adet', k: 120, p: 1, c: 20, f: 4 },
  { n: 'Aşure', u: 'kase', k: 250, p: 5, c: 52, f: 4 },
  { n: 'Güllaç', u: 'porsiyon', k: 200, p: 4, c: 38, f: 5 },
  { n: 'Supangle', u: 'kase', k: 260, p: 5, c: 36, f: 11 },
  { n: 'Trileçe', u: 'dilim', k: 320, p: 6, c: 42, f: 15 },
  { n: 'Magnolia', u: 'kase', k: 280, p: 5, c: 40, f: 12 },
  { n: 'Cheesecake', u: 'dilim', k: 350, p: 7, c: 32, f: 22 },
  { n: 'Brownie', u: 'adet', k: 280, p: 4, c: 38, f: 14 },
  { n: 'Tiramisu', u: 'porsiyon', k: 300, p: 6, c: 34, f: 16 },
  { n: 'Muffin', u: 'adet', k: 260, p: 4, c: 36, f: 11 },
  { n: 'Donut', u: 'adet', k: 260, p: 4, c: 34, f: 13 },
  { n: 'İrmik helvası', u: 'porsiyon', k: 280, p: 4, c: 46, f: 10 },
  { n: 'Ekmek kadayıfı', u: 'porsiyon', k: 320, p: 5, c: 58, f: 9 },
  { n: 'Sushi', u: 'porsiyon', k: 250, p: 9, c: 38, f: 6 },
  { n: 'Wrap', u: 'adet', k: 350, p: 18, c: 36, f: 15 },
  { n: 'Club sandviç', u: 'porsiyon', k: 480, p: 24, c: 42, f: 24 },
  { n: 'Sandviç', u: 'adet', k: 300, p: 12, c: 36, f: 12 },
  { n: 'Sosisli sandviç', u: 'adet', k: 330, p: 12, c: 32, f: 18 },
  { n: 'Kaşarlı pide', u: 'porsiyon', k: 520, p: 22, c: 60, f: 20 },
  { n: 'Kuşbaşılı pide', u: 'porsiyon', k: 560, p: 28, c: 58, f: 24 },
  { n: 'Sucuklu pide', u: 'porsiyon', k: 580, p: 24, c: 58, f: 28 },
  { n: 'Cheeseburger', u: 'adet', k: 450, p: 24, c: 36, f: 24 },
  { n: 'Tavuk burger', u: 'adet', k: 420, p: 24, c: 38, f: 19 },
  { n: 'Balık ekmek', u: 'adet', k: 350, p: 20, c: 38, f: 13 },
  { n: 'Çiğ köfte', u: 'porsiyon', k: 180, p: 5, c: 35, f: 2 },
  { n: 'Smoothie', u: 'bardak', k: 180, p: 4, c: 38, f: 2 },
  { n: 'Yeşil çay', u: 'bardak', k: 2, p: 0, c: 0, f: 0 },
  { n: 'Bitki çayı', u: 'bardak', k: 2, p: 0, c: 0, f: 0 },
  { n: 'Sıcak çikolata', u: 'bardak', k: 190, p: 6, c: 28, f: 7 },
  { n: 'Salep', u: 'bardak', k: 180, p: 5, c: 32, f: 4 },
  { n: 'Boza', u: 'bardak', k: 160, p: 2, c: 34, f: 1 },
  { n: 'Soğuk kahve', u: 'bardak', k: 120, p: 4, c: 16, f: 5 },
  { n: 'Americano', u: 'fincan', k: 10, p: 0, c: 2, f: 0 },
  { n: 'Espresso', u: 'fincan', k: 5, p: 0, c: 1, f: 0 },
  { n: 'Bubble tea', u: 'bardak', k: 250, p: 2, c: 50, f: 4 },
  { n: 'Maden suyu', u: 'şişe', k: 0, p: 0, c: 0, f: 0 },
  // === Genisletme (Tem 2026) — yaygin Turk yemekleri, per-porsiyon ===
  { n: 'Sahanda sucuk', u: 'porsiyon', k: 300, p: 14, c: 2, f: 26 },
  { n: 'Peynirli omlet', u: 'porsiyon', k: 260, p: 16, c: 2, f: 20 },
  { n: 'Kaygana', u: 'porsiyon', k: 200, p: 7, c: 16, f: 12 },
  { n: 'Bal kaymak', u: 'porsiyon', k: 330, p: 4, c: 22, f: 25 },
  { n: 'Sucuklu tost', u: 'adet', k: 350, p: 15, c: 30, f: 19 },
  { n: 'Karışık tost', u: 'adet', k: 380, p: 17, c: 30, f: 22 },
  { n: 'Yumurtalı ekmek', u: 'porsiyon', k: 240, p: 10, c: 22, f: 12 },
  { n: 'Pişi', u: 'adet', k: 110, p: 3, c: 14, f: 5 },
  { n: 'Lavaş', u: 'adet', k: 150, p: 5, c: 30, f: 2 },
  { n: 'Yufka', u: 'adet', k: 100, p: 3, c: 20, f: 1 },
  { n: 'Ramazan pidesi', u: 'dilim', k: 130, p: 4, c: 26, f: 2 },
  { n: 'Mısır ekmeği', u: 'dilim', k: 90, p: 2, c: 18, f: 1 },
  { n: 'Sebze çorbası', u: 'kase', k: 90, p: 3, c: 14, f: 3 },
  { n: 'Paça çorbası', u: 'kase', k: 180, p: 14, c: 3, f: 12 },
  { n: 'Analı kızlı', u: 'kase', k: 210, p: 9, c: 28, f: 7 },
  { n: 'Balık çorbası', u: 'kase', k: 120, p: 12, c: 8, f: 5 },
  { n: 'Hünkar beğendi', u: 'porsiyon', k: 380, p: 24, c: 18, f: 24 },
  { n: 'Tas kebabı', u: 'porsiyon', k: 340, p: 26, c: 14, f: 20 },
  { n: 'Orman kebabı', u: 'porsiyon', k: 350, p: 24, c: 18, f: 21 },
  { n: 'Güveç', u: 'porsiyon', k: 300, p: 20, c: 16, f: 17 },
  { n: 'Saç kavurma', u: 'porsiyon', k: 360, p: 28, c: 8, f: 24 },
  { n: 'Ali nazik', u: 'porsiyon', k: 390, p: 22, c: 14, f: 27 },
  { n: 'Çökertme kebabı', u: 'porsiyon', k: 520, p: 26, c: 40, f: 28 },
  { n: 'Testi kebabı', u: 'porsiyon', k: 380, p: 26, c: 16, f: 24 },
  { n: 'Cağ kebabı', u: 'porsiyon', k: 300, p: 24, c: 2, f: 22 },
  { n: 'Patlıcan kebabı', u: 'porsiyon', k: 360, p: 20, c: 16, f: 24 },
  { n: 'Yoğurtlu kebap', u: 'porsiyon', k: 480, p: 26, c: 35, f: 26 },
  { n: 'Kadınbudu köfte', u: 'porsiyon', k: 330, p: 20, c: 14, f: 22 },
  { n: 'İzmir köfte', u: 'porsiyon', k: 320, p: 20, c: 14, f: 20 },
  { n: 'Terbiyeli köfte', u: 'porsiyon', k: 300, p: 18, c: 14, f: 18 },
  { n: 'Etli patates', u: 'porsiyon', k: 280, p: 14, c: 22, f: 15 },
  { n: 'Etli bamya', u: 'porsiyon', k: 190, p: 11, c: 14, f: 10 },
  { n: 'Kapuska', u: 'porsiyon', k: 210, p: 11, c: 18, f: 11 },
  { n: 'Lahana yemeği', u: 'porsiyon', k: 190, p: 10, c: 16, f: 10 },
  { n: 'Köfte ekmek', u: 'porsiyon', k: 420, p: 20, c: 40, f: 20 },
  { n: 'Tavuklu pilav', u: 'porsiyon', k: 420, p: 24, c: 50, f: 12 },
  { n: 'Nohutlu pilav', u: 'porsiyon', k: 380, p: 10, c: 58, f: 11 },
  { n: 'İç pilav', u: 'porsiyon', k: 340, p: 6, c: 54, f: 11 },
  { n: 'Şehriyeli pilav', u: 'porsiyon', k: 320, p: 6, c: 56, f: 8 },
  { n: 'Perde pilavı', u: 'porsiyon', k: 520, p: 16, c: 60, f: 24 },
  { n: 'Zeytinyağlı barbunya', u: 'porsiyon', k: 180, p: 8, c: 22, f: 7 },
  { n: 'Zeytinyağlı pırasa', u: 'porsiyon', k: 140, p: 3, c: 18, f: 7 },
  { n: 'Kuru bamya', u: 'porsiyon', k: 150, p: 5, c: 18, f: 7 },
  { n: 'Semizotu yemeği', u: 'porsiyon', k: 130, p: 5, c: 12, f: 7 },
  { n: 'Kereviz yemeği', u: 'porsiyon', k: 120, p: 3, c: 16, f: 6 },
  { n: 'Bakla yemeği', u: 'porsiyon', k: 160, p: 8, c: 20, f: 6 },
  { n: 'Barbunya pilaki', u: 'porsiyon', k: 190, p: 9, c: 24, f: 7 },
  { n: 'Şakşuka', u: 'porsiyon', k: 190, p: 3, c: 14, f: 14 },
  { n: 'Patlıcan kızartması', u: 'porsiyon', k: 240, p: 3, c: 16, f: 19 },
  { n: 'Kabak kızartması', u: 'porsiyon', k: 180, p: 3, c: 14, f: 13 },
  { n: 'Biber kızartması', u: 'porsiyon', k: 160, p: 2, c: 10, f: 13 },
  { n: 'Fırında sebze', u: 'porsiyon', k: 180, p: 5, c: 22, f: 8 },
  { n: 'Karnabahar kızartma', u: 'porsiyon', k: 190, p: 5, c: 16, f: 12 },
  { n: 'Börülce yemeği', u: 'porsiyon', k: 170, p: 9, c: 24, f: 5 },
  { n: 'Fava', u: 'porsiyon', k: 180, p: 9, c: 22, f: 6 },
  { n: 'Piyaz', u: 'porsiyon', k: 220, p: 8, c: 22, f: 12 },
  { n: 'Haydari', u: 'porsiyon', k: 120, p: 4, c: 4, f: 10 },
  { n: 'Acılı ezme', u: 'porsiyon', k: 80, p: 2, c: 8, f: 5 },
  { n: 'Patlıcan salatası', u: 'porsiyon', k: 150, p: 2, c: 10, f: 11 },
  { n: 'Rus salatası', u: 'porsiyon', k: 220, p: 3, c: 18, f: 15 },
  { n: 'Cacık', u: 'kase', k: 80, p: 4, c: 6, f: 4 },
  { n: 'Közlenmiş biber', u: 'porsiyon', k: 70, p: 2, c: 8, f: 3 },
  { n: 'Balık buğulama', u: 'porsiyon', k: 200, p: 26, c: 4, f: 9 },
  { n: 'Karides güveç', u: 'porsiyon', k: 240, p: 22, c: 10, f: 12 },
  { n: 'Alabalık', u: 'porsiyon', k: 180, p: 24, c: 0, f: 9 },
  { n: 'Sardalya', u: 'porsiyon', k: 200, p: 24, c: 0, f: 11 },
  { n: 'İstavrit tava', u: 'porsiyon', k: 230, p: 22, c: 8, f: 12 },
  { n: 'Lüfer', u: 'porsiyon', k: 180, p: 23, c: 0, f: 9 },
  { n: 'Kızarmış tavuk', u: 'porsiyon', k: 320, p: 22, c: 14, f: 20 },
  { n: 'Çıtır tavuk', u: 'porsiyon', k: 300, p: 20, c: 18, f: 16 },
  { n: 'Et dürüm', u: 'dürüm', k: 480, p: 24, c: 44, f: 22 },
  { n: 'Adana dürüm', u: 'dürüm', k: 520, p: 24, c: 44, f: 26 },
  { n: 'Nachos', u: 'porsiyon', k: 350, p: 8, c: 38, f: 18 },
  { n: 'Quesadilla', u: 'porsiyon', k: 400, p: 18, c: 34, f: 21 },
  { n: 'Burrito', u: 'porsiyon', k: 450, p: 20, c: 50, f: 18 },
  { n: 'Taco', u: 'adet', k: 200, p: 9, c: 18, f: 10 },
  { n: 'Kadayıf', u: 'porsiyon', k: 400, p: 6, c: 50, f: 20 },
  { n: 'Şöbiyet', u: 'porsiyon', k: 420, p: 7, c: 40, f: 27 },
  { n: 'Kalburabastı', u: 'adet', k: 170, p: 2, c: 26, f: 7 },
  { n: 'Lokma', u: 'porsiyon', k: 300, p: 4, c: 46, f: 11 },
  { n: 'Höşmerim', u: 'porsiyon', k: 340, p: 10, c: 34, f: 18 },
  { n: 'Katmer', u: 'porsiyon', k: 420, p: 9, c: 40, f: 26 },
  { n: 'Cezerye', u: 'adet', k: 90, p: 1, c: 16, f: 3 },
  { n: 'Pişmaniye', u: 'porsiyon', k: 230, p: 2, c: 40, f: 7 },
  { n: 'Kabak tatlısı', u: 'porsiyon', k: 220, p: 2, c: 44, f: 4 },
  { n: 'Ayva tatlısı', u: 'porsiyon', k: 200, p: 1, c: 48, f: 2 },
  { n: 'İncir tatlısı', u: 'porsiyon', k: 240, p: 3, c: 48, f: 5 },
  { n: 'Muhallebi', u: 'porsiyon', k: 180, p: 4, c: 32, f: 4 },
  { n: 'Keşkül', u: 'porsiyon', k: 220, p: 5, c: 34, f: 7 },
  { n: 'Tavuk göğsü tatlısı', u: 'porsiyon', k: 200, p: 6, c: 34, f: 4 },
  { n: 'Kemalpaşa tatlısı', u: 'porsiyon', k: 280, p: 5, c: 50, f: 7 },
  { n: 'Vezir parmağı', u: 'porsiyon', k: 320, p: 4, c: 48, f: 13 },
  { n: 'Şıra', u: 'bardak', k: 120, p: 1, c: 30, f: 0 },
  { n: 'Hoşaf', u: 'kase', k: 120, p: 1, c: 30, f: 0 },
  { n: 'Komposto', u: 'kase', k: 110, p: 1, c: 28, f: 0 },
  { n: 'Nescafe (sütlü)', u: 'fincan', k: 70, p: 3, c: 9, f: 2 },
  { n: 'Kestane', u: 'porsiyon', k: 200, p: 3, c: 44, f: 1 },
  { n: 'Grissini', u: 'porsiyon', k: 120, p: 4, c: 22, f: 2 },
  { n: 'Fıstık ezmesi', u: 'kaşık', k: 95, p: 4, c: 3, f: 8 },
  { n: 'Fındık kreması', u: 'kaşık', k: 100, p: 1, c: 11, f: 6 },
  { n: 'Kuru incir', u: 'adet', k: 50, p: 0, c: 12, f: 0 },
  { n: 'Kuru erik', u: 'adet', k: 20, p: 0, c: 5, f: 0 },
  { n: 'Trabzon hurması', u: 'adet', k: 120, p: 1, c: 31, f: 0 },
  { n: 'Ayva', u: 'adet', k: 60, p: 0, c: 15, f: 0 },
  { n: 'Dut', u: 'porsiyon', k: 60, p: 1, c: 14, f: 0 },
  { n: 'Kızılcık', u: 'porsiyon', k: 50, p: 1, c: 12, f: 0 },
  // === Genisletme (Tem 2026, 2) — ekmek cesitleri + yaygin kahvaltilik ===
  { n: 'Kepekli ekmek', u: 'dilim', k: 65, p: 3, c: 12, f: 1 },
  { n: 'Çavdar ekmeği', u: 'dilim', k: 65, p: 2, c: 12, f: 1 },
  { n: 'Tost ekmeği', u: 'dilim', k: 75, p: 2, c: 14, f: 1 },
  { n: 'Sandviç ekmeği', u: 'adet', k: 200, p: 7, c: 38, f: 2 },
  { n: 'Hamburger ekmeği', u: 'adet', k: 160, p: 5, c: 28, f: 3 },
  { n: 'Baget ekmek', u: 'dilim', k: 70, p: 2, c: 14, f: 1 },
  { n: 'Pita ekmeği', u: 'adet', k: 165, p: 5, c: 33, f: 1 },
  { n: 'Kruvasan', u: 'adet', k: 230, p: 5, c: 26, f: 12 },
  { n: 'Glutensiz ekmek', u: 'dilim', k: 70, p: 1, c: 13, f: 2 },
  { n: 'Ekşi mayalı ekmek', u: 'dilim', k: 70, p: 3, c: 13, f: 1 },
  { n: 'Kakaolu fındık kreması', u: 'kaşık', k: 100, p: 1, c: 11, f: 6 },
  { n: 'Yulaf sütü', u: 'bardak', k: 90, p: 2, c: 16, f: 2 },
  { n: 'Badem sütü', u: 'bardak', k: 40, p: 1, c: 3, f: 3 },
  { n: 'Çiğ köfte (bol)', u: 'porsiyon', k: 250, p: 7, c: 48, f: 3 },
  { n: 'Peynirli poğaça', u: 'adet', k: 260, p: 7, c: 28, f: 13 },
  { n: 'Zeytinli poğaça', u: 'adet', k: 250, p: 5, c: 30, f: 12 },
  { n: 'Çikolatalı kek', u: 'dilim', k: 280, p: 4, c: 38, f: 13 },
  { n: 'Yumurtalı sandviç', u: 'adet', k: 320, p: 15, c: 34, f: 13 },
];
// Türkçe diakritik-duyarsız normalize (kofte→kofte=köfte, doner→döner). Hızlı yazımda eşleşsin.
function trNorm(str) {
  return String(str || '').toLocaleLowerCase('tr')
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u').trim();
}
// Miktar+birim kelimeleri (trNorm edilmiş halleriyle) — arama sorgusundan ayıklamak için
const _FOOD_UNITS = ['dilim', 'adet', 'tane', 'bardak', 'kase', 'kasik', 'porsiyon', 'avuc', 'tabak', 'top', 'kutu', 'sise', 'fincan', 'durum', 'parca', 'kup', 'paket', 'olcek', 'kadeh', 'dal', 'yaprak', 'lokma', 'kasede'];
const _FOOD_WORDNUM = { yarim: 0.5, ceyrek: 0.25, bucuk: 1.5, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, yirmi: 20 };
// Sorgudan baştaki miktar (rakam veya 'yarım/iki/üç'...) + birim kelimelerini ayıkla: '2 dilim ekmek' -> {qty:2, core:'ekmek'}
function parseFoodQuery(q) {
  let words = trNorm(q).split(/\s+/).filter(Boolean);
  let qty = null;
  // sadece baştaki kelime miktar olabilir (yemek adındaki sayıları bozmasın)
  if (words.length > 1) {
    const w0 = words[0];
    if (/^[0-9]+([.,][0-9]+)?$/.test(w0)) { qty = Number(w0.replace(',', '.')); words = words.slice(1); }
    else if (_FOOD_WORDNUM[w0] != null) { qty = _FOOD_WORDNUM[w0]; words = words.slice(1); }
  }
  // birim kelimelerini çıkar (kalan çekirdek terim)
  const kept = words.filter(w => !_FOOD_UNITS.includes(w));
  return { qty: (qty && qty > 0) ? qty : null, core: kept.join(' ').trim() };
}
// Temel besin DB araması — diakritik-duyarsız + alaka sıralı (tam > baş > kelime-başı > içerir).
function seedFoodMatches(q, limit) {
  const nq = parseFoodQuery(q).core;
  if (nq.length < 2) return [];
  const scored = [];
  for (const f of TURK_FOODS) {
    const nn = trNorm(f.n);
    let score = -1;
    if (nn === nq) score = 100;
    else if (nn.startsWith(nq)) score = 80;
    else if (nn.split(/\s+/).some(w => w.startsWith(nq))) score = 60;
    else if (nn.includes(nq)) score = 40;
    if (score >= 0) scored.push({ f, score });
  }
  scored.sort((a, b) => b.score - a.score || a.f.n.length - b.f.n.length);
  return scored.slice(0, limit || 10).map(x => x.f);
}
function pickSeedFood(i) {
  const sf = _seedMatches[i]; if (!sf) return;
  _aiFood = { name: sf.n, kcal: sf.k, protein: sf.p, carb: sf.c, fat: sf.f, multi: false, items: [], source: 'seed' };
  showAiPortion(sf.n, 'Temel · ' + sf.u, '');
  applyPickQty();
}
// Aramada yazılan miktarı ('2 dilim ekmek' → 2) seçilen besinin adet kutusuna önyükle
function applyPickQty() {
  if (!_pickQty || _pickQty <= 0) return;
  const el = document.getElementById('aiQty');
  if (el) { el.value = _pickQty; updateAiPreview(); }
}
function _aiQtyVal() { const el = document.getElementById('aiQty'); if (!el) return 1; const v = Number(el.value); return (isFinite(v) && v > 0) ? v : 0; }
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
  const supps = (data.reminders || []).filter(r => r.kind === 'supp').sort((a, b) => (a.time || a.startTime || '').localeCompare(b.time || b.startTime || ''));
  const meta = document.getElementById('suppMeta');
  const t = today();
  if (meta) meta.textContent = supps.length ? `${supps.filter(r => suppTakenOn(r, t)).length}/${supps.length} alındı` : '';
  if (!supps.length) { el.innerHTML = '<div class="diet-empty">Henüz takviye yok. Aşağıdan ekle — saatinde bildirim gelir.</div>'; return; }
  el.innerHTML = supps.map(r => {
    const taken = suppTakenOn(r, t);
    const timeStr = r.mode === 'interval' ? `${r.startTime}–${r.endTime}` : (r.time || '–');
    const daysStr = (r.days === 'weekdays' ? 'Hafta içi' : 'Her gün') + (r.mode === 'interval' ? ` · ${suppEveryLabel(+r.everyMin || 60)}` : '');
    return `<div class="supp-item${r.enabled === false ? ' off' : ''}${taken ? ' taken' : ''}">` +
      `<button class="supp-check${taken ? ' on' : ''}" onclick="markSuppTaken(${r.id})" title="${taken ? 'işareti kaldır' : 'aldım'}" aria-label="aldım">${taken ? '✓' : ''}</button>` +
      `<span class="supp-time">${escapeHtml(timeStr)}</span>` +
      `<span class="supp-name">${escapeHtml(r.label || '')}${suppLast7(r)}</span>` +
      `<span class="supp-days">${daysStr}</span>` +
      `<input type="checkbox" ${r.enabled !== false ? 'checked' : ''} onchange="toggleSupplement(${r.id})" aria-label="Aç/kapa">` +
      `<button class="supp-del" onclick="deleteSupplement(${r.id})" aria-label="Sil">✕</button></div>`;
  }).join('');
}
let _suppMode = 'single';
function setSuppMode(m) {
  _suppMode = m;
  const bs = document.getElementById('suppModeSingle'), bi = document.getElementById('suppModeInterval');
  if (bs) bs.classList.toggle('active', m === 'single');
  if (bi) bi.classList.toggle('active', m === 'interval');
  const rs = document.getElementById('suppSingleRow'), ri = document.getElementById('suppIntervalRow');
  if (rs) rs.style.display = (m === 'single') ? '' : 'none';
  if (ri) ri.style.display = (m === 'interval') ? '' : 'none';
}
function suppEveryLabel(m) { return m === 30 ? "30 dk'da bir" : m === 60 ? 'saatte bir' : `${Math.round(m / 60)} saatte bir`; }
function addSupplement() {
  const name = (document.getElementById('suppName').value || '').trim();
  const days = document.getElementById('suppDays').value;
  if (!name) { showToast('Takviye adı yaz', 'info'); return; }
  data.reminders = data.reminders || [];
  if (_suppMode === 'interval') {
    // Aralıklı mod: uyku düzeni değişkenken tek saat yerine aralık + periyot
    const start = document.getElementById('suppStart').value;
    const end = document.getElementById('suppEnd').value;
    const every = +document.getElementById('suppEvery').value || 60;
    if (!start || !end) { showToast('Başlangıç ve bitiş saati seç', 'info'); return; }
    if (start === end) { showToast('Başlangıç ve bitiş aynı olamaz', 'info'); return; }
    data.reminders.push({ id: Date.now(), label: name, mode: 'interval', startTime: start, endTime: end, everyMin: every, days, enabled: true, lastFired: null, kind: 'supp' });
    document.getElementById('suppStart').value = ''; document.getElementById('suppEnd').value = '';
    showToast(`${start}–${end} arası ${suppEveryLabel(every)} — ${name} kuruldu`, 'success');
  } else {
    const time = document.getElementById('suppTime').value;
    if (!time) { showToast('Saat seç', 'info'); return; }
    data.reminders.push({ id: Date.now(), label: name, time, days, enabled: true, lastFired: null, kind: 'supp' });
    document.getElementById('suppTime').value = '';
    showToast(`${time} — ${name} kuruldu`, 'success');
  }
  document.getElementById('suppName').value = '';
  save(); renderSupplements();
  if (typeof renderFixedReminders === 'function') renderFixedReminders();
}
function toggleSupplement(id) { const r = (data.reminders || []).find(x => x.id === id); if (!r) return; r.enabled = (r.enabled === false); save(); renderSupplements(); }
function deleteSupplement(id) {
  data.reminders = (data.reminders || []).filter(x => x.id !== id);
  save(); renderSupplements();
  if (typeof renderFixedReminders === 'function') renderFixedReminders();
  showToast('Takviye silindi', 'info');
}
// "Aldım" artık geçmiş tutar: takenLog[] son 30 gün — uyum şeridi + sabah "dün özeti" bundan okur.
// takenDate eski tek-günlük alan, geriye uyumluluk için senkron tutulur.
function suppTakenOn(r, d) { return (r.takenLog || []).includes(d) || r.takenDate === d; }
function markSuppTaken(id) {
  const r = (data.reminders || []).find(x => x.id === id); if (!r) return;
  const t = today();
  r.takenLog = r.takenLog || [];
  if (r.takenDate && !r.takenLog.includes(r.takenDate)) r.takenLog.push(r.takenDate);
  if (r.takenLog.includes(t)) { r.takenLog = r.takenLog.filter(d => d !== t); r.takenDate = null; }
  else { r.takenLog.push(t); r.takenDate = t; }
  r.takenLog.sort();
  if (r.takenLog.length > 30) r.takenLog = r.takenLog.slice(-30);
  save(); renderSupplements();
}
// Son 7 gün uyum şeridi — nötr gösterim (streak DEĞİL): dolu=alındı, boş=alınmadı, soluk=kapsam dışı
// (hafta içi takviyesinde hafta sonu + takviye eklenmeden önceki günler sayılmaz)
function suppLast7(r) {
  const created = r.id ? new Date(r.id).toISOString().slice(0, 10) : null;
  let out = '';
  for (let i = 6; i >= 0; i--) {
    const d = shiftDateStr(today(), -i);
    const dow = new Date(d + 'T12:00:00').getDay();
    const na = (created && d < created) || (r.days === 'weekdays' && (dow === 0 || dow === 6));
    out += `<span class="supp-dot${na ? ' na' : (suppTakenOn(r, d) ? ' on' : '')}"${i === 0 ? ' data-today="1"' : ''}></span>`;
  }
  return `<span class="supp-dots" title="son 7 gün">${out}</span>`;
}

// ===== Loglanan öğünü düzenle =====
let _editMealId = null, _editMealSlot = 'kahvalti';
function editMeal(id) {
  const day = dietDay(false); const m = (day.meals || []).find(x => x.id === id); if (!m) return;
  _editMealId = id; _editMealSlot = m.slot || 'kahvalti';
  document.getElementById('editMealName').value = m.name || '';
  document.getElementById('editMealKcal').value = (m.kcal != null ? m.kcal : '');
  document.getElementById('editMealP').value = (m.protein != null ? m.protein : '');
  document.getElementById('editMealC').value = (m.carb != null ? m.carb : '');
  document.getElementById('editMealF').value = (m.fat != null ? m.fat : '');
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
  m.protein = _optMacro('editMealP'); m.carb = _optMacro('editMealC'); m.fat = _optMacro('editMealF');
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
  let p = 0, c = 0, f = 0, noMacroKcal = 0;
  day.meals.forEach(m => {
    p += Number(m.protein) || 0; c += Number(m.carb) || 0; f += Number(m.fat) || 0;
    if (m.protein == null && m.carb == null && m.fat == null) noMacroKcal += Number(m.kcal) || 0;
  });
  const rows = [
    ['Protein', Math.round(p), d.proteinGoal || 0, '#5aa2ff'],
    ['Karbonhidrat', Math.round(c), d.carbGoal || 0, '#f5a524'],
    ['Yağ', Math.round(f), d.fatGoal || 0, '#e0726e'],
  ];
  const el = document.getElementById('macroBars');
  if (!el) return;
  const gap = noMacroKcal > 0
    ? `<div class="macro-gap-note">≈${noMacroKcal} kcal makro bilgisi olmadan girildi — çubuklar eksik olabilir. Yemeği "Ara" sekmesinden seçersen makrolar da gelir.</div>`
    : '';
  el.innerHTML = rows.map(([name, val, gl, col]) => {
    const pct = gl ? Math.min(100, Math.round(val / gl * 100)) : 0;
    const over = gl && val > gl;
    return `<div class="macro-bar">
      <div class="macro-bar-top"><span class="macro-bar-name">${name}</span><span class="macro-bar-val${over ? ' over' : ''}">${val} / ${gl} g</span></div>
      <div class="macro-bar-track"><span class="macro-bar-fill" style="width:${pct}%; background:${col}"></span></div>
    </div>`;
  }).join('') + gap;
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


// ===== Makro donut + kalan makro (pro görsel) =====
function renderMacroDonut() {
  const host = document.getElementById('macroDonut'); if (!host) return;
  ensureDiet();
  const d = data.diet, day = dietDay(false);
  let p = 0, c = 0, f = 0, eatenK = 0;
  (day.meals || []).forEach(m => {
    p += Number(m.protein) || 0; c += Number(m.carb) || 0; f += Number(m.fat) || 0;
    eatenK += Number(m.kcal) || 0;
  });
  p = Math.round(p); c = Math.round(c); f = Math.round(f); eatenK = Math.round(eatenK);
  const kP = p * 4, kC = c * 4, kF = f * 9, macroK = kP + kC + kF;
  if (macroK <= 0 && eatenK <= 0) { host.style.display = 'none'; host.innerHTML = ''; return; }
  host.style.display = 'flex';
  // Merkez sayı = kalori halkasındaki YENEN kcal (halka ile birebir tutar). Makro-kcal ile
  // yenen arasındaki fark (lif/alkol veya makrosuz girilen öğün) "Diğer" dilimi olur.
  const total = eatenK > 0 ? eatenK : macroK;
  const other = Math.max(0, total - macroK);
  const segs = [
    { val: kP, color: '#5aa2ff' },
    { val: kC, color: '#f5a524' },
    { val: kF, color: '#e0726e' },
    { val: other, color: '#3a3d46' },
  ].filter(x => x.val > 0);
  const pc = v => macroK ? Math.round(v / macroK * 100) : 0;
  const rem = (goal, val) => { const r = (goal || 0) - val; return r >= 0 ? r + 'g kaldı' : (-r) + 'g fazla'; };
  const donut = (typeof donutChart === 'function') ? donutChart(segs, 104) : '';
  const otherRow = other > 0
    ? `<div class="mdl-row"><span class="mdl-dot" style="background:#3a3d46"></span><span class="mdl-name">Diğer</span><span class="mdl-pct">${other} kcal</span><span class="mdl-rem">lif/makrosuz</span></div>`
    : '';
  host.innerHTML =
    `<div class="macro-donut-svg">${donut}<div class="macro-donut-center"><span class="mdc-num">${total}</span><span class="mdc-lbl">kcal</span></div></div>` +
    `<div class="macro-donut-legend">` +
      `<div class="mdl-row"><span class="mdl-dot" style="background:#5aa2ff"></span><span class="mdl-name">Protein</span><span class="mdl-pct">%${pc(kP)}</span><span class="mdl-rem">${rem(d.proteinGoal, p)}</span></div>` +
      `<div class="mdl-row"><span class="mdl-dot" style="background:#f5a524"></span><span class="mdl-name">Karb</span><span class="mdl-pct">%${pc(kC)}</span><span class="mdl-rem">${rem(d.carbGoal, c)}</span></div>` +
      `<div class="mdl-row"><span class="mdl-dot" style="background:#e0726e"></span><span class="mdl-name">Yağ</span><span class="mdl-pct">%${pc(kF)}</span><span class="mdl-rem">${rem(d.fatGoal, f)}</span></div>` +
      otherRow +
    `</div>`;
}

// ===== Gün/öğün kopyala (loglama friction'ını bitirir) =====
function copyPrevDay() {
  ensureDiet();
  const prev = shiftDateStr(dietKey(), -1);
  const src = (data.diet.days[prev] && data.diet.days[prev].meals) || [];
  if (!src.length) { showToast('Önceki gün için kayıt yok', 'info'); return; }
  const day = dietDay();
  let n = 0;
  src.forEach(m => {
    day.meals.push({ id: Date.now() + Math.floor(Math.random() * 10000) + n, slot: m.slot, name: m.name, kcal: m.kcal, protein: m.protein != null ? m.protein : null, carb: m.carb != null ? m.carb : null, fat: m.fat != null ? m.fat : null });
    n++;
  });
  save(); renderDiet(); showToast(n + ' öğün önceki günden kopyalandı', 'success');
}
function copyMealToNextDay() {
  if (_editMealId == null) return;
  ensureDiet();
  const day = dietDay(false); const m = (day.meals || []).find(x => x.id === _editMealId);
  if (!m) { closeMealEdit(); return; }
  const nextKey = shiftDateStr(dietKey(), 1);
  if (!data.diet.days[nextKey]) data.diet.days[nextKey] = { meals: [], water: 0 };
  data.diet.days[nextKey].meals = data.diet.days[nextKey].meals || [];
  data.diet.days[nextKey].meals.push({ id: Date.now() + Math.floor(Math.random() * 10000), slot: m.slot, name: m.name, kcal: m.kcal, protein: m.protein != null ? m.protein : null, carb: m.carb != null ? m.carb : null, fat: m.fat != null ? m.fat : null });
  save(); closeMealEdit(); showToast('Ertesi güne kopyalandı', 'success');
}
