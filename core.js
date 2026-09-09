// ===== TEMBEL MODUL YUKLEYICI (9 Agu 2026) =====
// Borsa (44 KB gzip) ve antrenman programi (11 KB) ilk yuklemede INMEZ;
// sekmesi ilk acildiginda gelir. html5-qrcode'da kanitlanmis kalip.
// Ayni modul iki kez indirilmez — soz (promise) onbelleklenir.
// ⚠️ Yeni modul eklersen 5 yeri guncelle: LAZY_MODULES · sw.js ASSETS ·
//    aidan-pages-deploy.py INCLUDE · Actions paths · tests/07-hygiene.
// stocks/program: SEKME acilinca iner (showTab).
// supabase: init'te iner ama <script> etiketi DEGIL — 50 KB gzip'i kritik
// yoldan cikarir. Ilk cizim beklemez; auth birkac yuz ms sonra oturur.
const LAZY_MODULES = { program: '/program.js',
  nutrition: '/nutrition.js', health: '/health.js', supabase: '/supabase.js',
  foods: '/foods.js', school: '/school.js', onboarding: '/onboarding.js', karne: '/karne.js' };
const _moduleLoads = {};
function moduleLoaded(name) { return !!(_moduleLoads[name] && _moduleLoads[name]._done); }
function loadModule(name) {
  const src = LAZY_MODULES[name];
  if (!src) return Promise.reject(new Error('bilinmeyen modul: ' + name));
  if (_moduleLoads[name]) return _moduleLoads[name];
  const p = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = src;
    sc.onload = () => { p._done = true; res(); };
    sc.onerror = () => { _moduleLoads[name] = null; rej(new Error(name + ' yuklenemedi')); };
    document.head.appendChild(sc);
  });
  _moduleLoads[name] = p;
  return p;
}

// escapeHtml — HTML enjeksiyonuna karsi TEK savunma hatti.
// ⚠️ 8 Agu 2026: tanim ui.js'teydi ama core.js/tasks.js/stocks.js 145 yerde
// cagiriyordu. Calisiyor olmasinin tek sebebi ui.js'in EN SON yuklenmesiydi —
// yani kaza. core.js init sirasinda render eden bir kod yazilsaydi
// 'escapeHtml is not defined' ile 6 Agu TDZ cokusunun aynisi yasanirdi.
// Artik ilk yuklenen dosyada, ilk kullanimdan once tanimli.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Tek renk kaynagi styles.css. SVG sunum ozniteliginde var() guvenilir degil,
// oraya gercek deger yazilir; inline style'da dogrudan var(--token) gecer.
function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) { return fallback; }
}

// Kullanici talimatlari — Ayarlar > Talimatlar. TUM prose ureten AI cagrilarina
// eklenir; worker sistem promptunun sonuna koyar. ⚠️ Guvenlik kurallarini EZEMEZ
// (worker tarafinda instructionsBlock icinde acikca yaziyor ve teste bagli).
// Makine sozlesmeli cagrilara (JSON donduren /split, /food-macros, OCR) GONDERILMEZ —
// usluba dair talimat oradaki cikti sozlesmesini bozar.
const AI_INSTR_MAX = 2000;
function aiInstructions() {
  const t = (data && data.settings && data.settings.instructions) || '';
  return String(t).slice(0, AI_INSTR_MAX).trim();
}

// Sohbet ayarları (pruneOldData başlangıçta çağrıldığı için en üstte olmalı - TDZ hatası kaynağıydı)
const CHAT_KEEP = 60;                      // saklanan mesaj sayısı (~30 KB tavan)
const CHAT_PRUNE_DAYS = 60;                // bundan eski mesajlar budanır

// ============ VERİ ============
let data = JSON.parse(localStorage.getItem('aidan') || '{}');
data.tasks = data.tasks || [];
data.dumps = data.dumps || [];
data.pushLog = data.pushLog || [];
data.journal = data.journal || [];
data.reminders = data.reminders || [];  // sabit hatırlatıcılar (ilaç/su/ders) — Worker 15dk cron push'lar
// NOT (14 Agu 2026): watchlist/portfolioHistory/trades borsa sitesine tasindi
// (public.aidan_stocks). Aidan blob'undaki ESKI kopyalar SILINMEDI — yeni site
// canlida dogrulanana kadar geri donus yolu acik kalsin diye. Artik hicbir
// Aidan kodu okumuyor; dogrulama sonrasi tek satirlik temizlikle atilabilir.
// SAGLAMLIK: bozuk senkron/birlesme sonucu diziye null ya da string sizabiliyor.
// Eskiden tek bir null gorev init'teki geriye-uyumluluk dongusunu comertip
// TUM uygulamayi olduruyordu (6 Agu TDZ hatasiyla ayni sinif: veri -> tam olum).
// Bu yuzden nesne bekleyen her dizi basta suzulur.
['tasks','dumps','pushLog','journal','reminders','chat','notes','sleep','templates']
  .forEach(function (k) {
    if (!Array.isArray(data[k])) { if (data[k] !== undefined) data[k] = []; return; }
    data[k] = data[k].filter(function (x) { return x && typeof x === 'object'; });
  });
data.pomoToday = data.pomoToday || { date: today(), count: 0 };
data.settings = data.settings || {};
if (data.lastWeeklyView === undefined) data.lastWeeklyView = null;
data.templates = data.templates || [];
// Gün planı — saat saat bloklar. Sadece BUGÜN için; tarih değişince temizlenir.
data.dayPlan = data.dayPlan || { date: today(), blocks: [] };
if (data.dayPlan.date !== today()) data.dayPlan = { date: today(), blocks: [] };
if (data.pomoToday.date !== today()) data.pomoToday = { date: today(), count: 0 };
ensureDiet();  // diyet sekmesi veri yapısı (kalori/su günlüğü + kilo trendi)
pruneOldData();  // 180 günden eski bitmiş görev + diyet günü (günde bir kez)

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

// ⚠️ Yerel (Türkiye) tarih. toISOString() UTC döndürdüğü için 00:00–03:00 arası
// bir önceki günü veriyordu — gece yarısından sonra yapılan her kayıt yanlış güne
// yazılıyordu ve Worker'ın trToday()'i ile çelişiyordu. Tüm tarih üretimi buradan geçer.
function isoLocal(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function today() { return isoLocal(new Date()); }
// ===== DEPOLAMA ÖLÇÜMÜ (8 Ağu 2026) =====
// Tüm veri TEK JSON blob. Budama var (180 gün / 60 mesaj / thumb tavanı) ama
// toplam boyut hiçbir yerde ölçülmüyordu — duvara çarpılana kadar sessizdi.
// Tarayıcı tavanı ~5 MB ve KARAKTER sayar (byte değil), ölçü de öyle.
const LS_LIMIT_CHARS = 5 * 1024 * 1024;
const LS_WARN_PCT = 65;    // buradan sonra günde bir kez uyar
const LS_ALARM_PCT = 85;   // buradan sonra sert uyar

// Hangi alan ne kadar yer kaplıyor — büyükten küçüğe.
function dataSizeReport(json) {
  let s;
  try { s = json || JSON.stringify(data); } catch (_) { return { chars: 0, pct: 0, parts: [] }; }
  const parts = Object.keys(data).map(k => {
    let n = 0;
    try { n = JSON.stringify(data[k]).length; } catch (_) {}
    return { key: k, chars: n };
  }).filter(x => x.chars > 0).sort((a, b) => b.chars - a.chars);
  return { chars: s.length, pct: Math.round(s.length / LS_LIMIT_CHARS * 100), parts };
}

function fmtBytes(n) {
  if (!(n > 0)) return '0 KB';
  return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
}

// saveLocal içinden çağrılır. Günde EN FAZLA bir uyarı — ADHD'de tekrar eden
// bildirim körleştirir, bu yüzden eşik aşılsa bile günde bir kez konuşur.
function checkDataSize(json) {
  const pct = Math.round(json.length / LS_LIMIT_CHARS * 100);
  if (pct < LS_WARN_PCT) return pct;
  data.settings = data.settings || {};
  const t = today();
  if (data.settings.lastSizeWarn === t) return pct;
  data.settings.lastSizeWarn = t;
  if (typeof showToast !== 'function') return pct;
  const en = (dataSizeReport(json).parts[0] || {}).key || '';
  if (pct >= LS_ALARM_PCT) {
    showToast('Depolama %' + pct + ' dolu (' + fmtBytes(json.length) + '). En büyük alan: ' + en +
      '. Ayarlar → Depolama bölümüne bak, yedek al.', 'error', 9000);
  } else {
    showToast('Depolama %' + pct + ' dolu. Ayarlar → Depolama bölümünde detay var.', 'warning', 6000);
  }
  return pct;
}

// ===== localStorage KOTA KORUMASI (v7-120) =====
// Önceden 6 yerde çıplak setItem vardı; kota dolduğunda istisna fırlatıp
// o an yapılan işlemi (görev ekleme, öğün kaydı...) sessizce bozuyordu.
function saveLocal() {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem('aidan', json);
    checkDataSize(json);   // duvara çarpmadan ÖNCE haber ver
    return true;
  } catch (e) {
    const quota = e && (e.name === 'QuotaExceededError' ||
                        e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
    if (quota) {
      // Önce agresif buda, sonra bir kez daha dene
      if (pruneOldData(true)) {
        try { localStorage.setItem('aidan', JSON.stringify(data)); return true; } catch (_) {}
      }
      if (typeof showToast === 'function')
        showToast('Depolama doldu. Eski kayıtlar budandı ama hâlâ yer yok — Ayarlar → Verileri indir ile yedek alıp sıfırla.', 'error', 9000);
    } else if (typeof showToast === 'function') {
      showToast('Kayıt hatası: ' + ((e && e.message) || e), 'error', 6000);
    }
    return false;
  }
}

// ===== VERİ BUDAMA (v7-120) =====
// data.tasks (bitmiş görevler) ve data.diet.days HİÇ budanmıyordu → blob sonsuza
// büyüyor, her save() tüm blob'u localStorage'a + Supabase'e yazıyordu.
function pruneOldData(force) {
  const PRUNE_DAYS = 180;   // fonksiyon içi: init sırasında TDZ hatası olmasın
  const t = today();
  data.settings = data.settings || {};
  if (!force && data.settings.lastPrune === t) return false;
  const cutoff = shiftDateStr(t, -PRUNE_DAYS);
  let removed = 0;
  // 1) 180 günden eski BİTMİŞ görevler (aktif görevlere dokunulmaz)
  const before = (data.tasks || []).length;
  data.tasks = (data.tasks || []).filter(x => !(x && x.done && x.doneDate && x.doneDate < cutoff));
  removed += before - data.tasks.length;
  // 2) 180 günden eski diyet günleri
  const days = (data.diet && data.diet.days) || null;
  if (days) for (const k of Object.keys(days)) if (k < cutoff) { delete days[k]; removed++; }
  // 3) 60 günden eski sohbet mesajları (kayıtlara dokunulmaz — onları kullanıcı seçti)
  if (Array.isArray(data.chat) && data.chat.length) {
    const chatCut = Date.now() - CHAT_PRUNE_DAYS * 86400000;
    const b2 = data.chat.length;
    data.chat = data.chat.filter(m => m && (!m.at || m.at >= chatCut));
    removed += b2 - data.chat.length;
  }
  data.settings.lastPrune = t;
  return removed > 0;
}

function save() {
  saveLocal();
  if (typeof markLocalDirty === 'function') markLocalDirty();
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
// ===== 😴 UYKU TAKİBİ (v7-113) — kural tabanlı, plana bağlanır =====
// data.sleep = [{date:'YYYY-MM-DD', bedtime:'HH:MM'|null, wake:'HH:MM'|null, hours:Number|null, quality:'bad'|'ok'|'good'}]
// date = UYANILAN sabah → "dün gece"nin uykusu bugüne yazılır. Son 60 gün tutulur.

// ============================================================
// SOHBET KALICILIĞI + KAYITLAR (3 Ağu 2026)
// ============================================================
// data.chat  = [{role:'user'|'assistant', content, at, local?}]  son CHAT_KEEP mesaj
// data.notes = [{id, cat, title, text, at}]  chat'ten kaydedilen cevaplar
// Sohbet buluta senkron olur (Supabase row.data) — telefon ↔ PC ortak.
const NOTE_CATS = [
  { id: 'antrenman', label: 'Antrenman' },
  { id: 'ders',      label: 'Ders' },
  { id: 'diyet',     label: 'Beslenme' },
  { id: 'genel',     label: 'Genel' },
];
function ensureChat() { if (!Array.isArray(data.chat)) data.chat = []; return data.chat; }
function ensureNotes() { if (!Array.isArray(data.notes)) data.notes = []; return data.notes; }
function chatPush(msg) {
  const arr = ensureChat();
  arr.push(Object.assign({ at: Date.now() }, msg));
  if (arr.length > CHAT_KEEP) arr.splice(0, arr.length - CHAT_KEEP);
  pruneChatThumbs();
  return arr;
}
// Sohbete eklenen fotograf kucuk resimleri (~8 KB) localStorage'i ve bulut
// senkronunu sismesin diye SADECE son CHAT_IMG_KEEP gorselli mesajda tutulur.
// Eskiler dusurulur, mesajda 'imgDropped' isareti kalir (UI rozet gosterir).
const CHAT_IMG_KEEP = 6;
function pruneChatThumbs(keep = CHAT_IMG_KEEP) {
  const arr = ensureChat();
  let seen = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i];
    if (!m || !Array.isArray(m.imgs) || !m.imgs.length) continue;
    seen++;
    if (seen > keep) { m.imgs = null; m.imgDropped = true; }
  }
}
function noteCatLabel(id) { const c = NOTE_CATS.find(x => x.id === id); return c ? c.label : 'Genel'; }
// Not başlığı: kullanıcı yazmadıysa metnin ilk anlamlı satırından türet
function noteAutoTitle(text) {
  const line = String(text || '').split('\n').map(s => s.replace(/[#*>`_-]/g, '').trim()).find(s => s.length > 3) || '';
  return line.slice(0, 60) || 'Kayıt';
}

function ensureSleep() { data.sleep = data.sleep || []; return data.sleep; }
function sleepFor(date) { return ensureSleep().find(s => s.date === date) || null; }
function hmToMinSafe(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
// Yatış→kalkış saat farkı (gece yarısını aşarsa +24). Geçersiz/aşırı ise null.
function sleepHours(bedtime, wake) {
  if (!bedtime || !wake) return null;
  const bm = hmToMinSafe(bedtime), wm = hmToMinSafe(wake);
  if (bm == null || wm == null) return null;
  let diff = wm - bm;
  if (diff <= 0) diff += 1440;          // 23:30 → 07:00 = gece yarısı geçişi
  if (diff > 16 * 60) return null;      // 16 saatten fazla = hatalı giriş
  return Math.round((diff / 60) * 100) / 100;
}
// Kaydet/güncelle (upsert). quality veya saat — en az biri anlamlı olmalı.
function logSleep(date, opts) {
  opts = opts || {};
  ensureSleep();
  const bedtime = opts.bedtime || null, wake = opts.wake || null;
  const hours = sleepHours(bedtime, wake);
  const cur = sleepFor(date);
  const quality = opts.quality || (cur && cur.quality) || null;
  const rec = { date, bedtime, wake, hours: hours != null ? hours : (cur ? cur.hours : null), quality };
  if (cur) Object.assign(cur, rec); else data.sleep.push(rec);
  data.sleep = data.sleep.filter(s => s && s.date).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 60);
  save();
}
// Son 7 gecenin ortalama saati (trend/şeffaflık için)
function sleepStats() {
  const list = ensureSleep().filter(s => s.hours != null);
  const last7 = list.filter(s => s.date >= shiftDateStr(today(), -6));
  const avg = last7.length ? last7.reduce((a, s) => a + s.hours, 0) / last7.length : null;
  return { avg, count: last7.length };
}
function lastNightSleep() { return sleepFor(today()); }
// Saat ondalığını "7s 30dk" formatına
function fmtSleepHours(h) {
  if (h == null) return '';
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return mm ? `${hh}s ${mm}dk` : `${hh}s`;
}

// ===== Uyku hedefi + trend + borç (Faz 1 · v7-116) =====
function ensureSleepGoal() {
  var s = data.settings = data.settings || {};
  s.sleepGoal = s.sleepGoal || { enabled: false, wake: '07:00', targetH: 8, leadMin: 30 };
  if (s.sleepGoal.targetH == null) s.sleepGoal.targetH = 8;
  if (s.sleepGoal.leadMin == null) s.sleepGoal.leadMin = 30;
  if (!s.sleepGoal.wake) s.sleepGoal.wake = '07:00';
  return s.sleepGoal;
}
// Son N gecenin kayıtları, tarih artan
function sleepSeries(days) {
  var from = shiftDateStr(today(), -(days - 1));
  return ensureSleep().filter(function (s) { return s && s.date >= from; })
    .slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}
// 30 gün istatistiği: hafta içi/sonu ort, en iyi/kötü gece
function sleepStats30() {
  var list = sleepSeries(30).filter(function (s) { return s.hours != null; });
  var wd = [], we = [], best = null, worst = null;
  list.forEach(function (s) {
    var dow = new Date(s.date + 'T12:00:00').getDay();
    (dow === 0 || dow === 6 ? we : wd).push(s.hours);
    if (!best || s.hours > best.hours) best = s;
    if (!worst || s.hours < worst.hours) worst = s;
  });
  var avg = function (a) { return a.length ? Math.round((a.reduce(function (x, y) { return x + y; }, 0) / a.length) * 100) / 100 : null; };
  return { count: list.length, weekdayAvg: avg(wd), weekendAvg: avg(we), best: best, worst: worst,
           overallAvg: avg(list.map(function (s) { return s.hours; })) };
}
// ===== Uyku borcu — üstel ağırlıklı, asimetrik toparlanma (v7-118) =====
// Doğrusal toplam DEĞİL. Borbély iki-süreç modelinin sadeleştirilmiş hali:
//  1) Borç sonsuza birikmez — her gün %15 doğal erir (yarı ömür ~4.3 gün).
//  2) Fazla uyku açığı 1:1 kapatmaz — ancak %50 verimle öder.
//  3) "Uyku bankası" yoktur — borç 0'ın altına inmez.
var SLEEP_DECAY = 0.85;       // günlük kalış oranı
var SLEEP_PAYBACK = 0.5;      // fazla uykunun geri ödeme verimi
var SLEEP_MAX_GAP = 4;        // tek gecede yazılabilecek en fazla açık (saat)
var SLEEP_MAX_CREDIT = 2;     // tek gecede sayılabilecek en fazla fazla uyku
var SLEEP_WINDOW = 14;        // pencere (gece)
var SLEEP_MODEL_MIN = 8;      // kişisel kalite→saat modeli için gereken örnek

// Kalite→saat modeli: SABİT KATSAYI UYDURMAZ, sadece kendi verinden öğrenir.
// Hem kalite hem saat girilmiş geceleri kalite başına medyanlar. Yetersiz veri → null.
function sleepQualityModel() {
  var both = ensureSleep().filter(function (s) { return s && s.quality && s.hours != null; });
  if (both.length < SLEEP_MODEL_MIN) return null;
  var by = { bad: [], ok: [], good: [] }, out = {}, any = false;
  both.forEach(function (s) { if (by[s.quality]) by[s.quality].push(s.hours); });
  Object.keys(by).forEach(function (q) {
    var a = by[q].slice().sort(function (x, y) { return x - y; });
    if (a.length < 2) return;                    // tek örnekten medyan çıkmaz
    var m = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
    out[q] = Math.round(m * 100) / 100; any = true;
  });
  return any ? out : null;
}
// Bir gecenin hesaba girecek saati: gerçek → kişisel tahmin → yok
function sleepResolvedHours(rec, model) {
  if (!rec) return null;
  if (rec.hours != null) return { h: rec.hours, est: false };
  if (model && rec.quality && model[rec.quality] != null) return { h: model[rec.quality], est: true };
  return null;
}
var SLEEP_BAND_LABEL = { clear: 'temiz', mild: 'hafif', high: 'belirgin', severe: 'ağır' };
function sleepDebtBand(debt) {
  return debt < 2 ? 'clear' : debt < 5 ? 'mild' : debt < 9 ? 'high' : 'severe';
}
// Hedefin 1 saat üstünde uyunursa borç "temiz" banda (<2sa) kaç gecede iner
function sleepRecoveryNights(debt) {
  if (debt < 2) return 0;
  var D = debt, n = 0, contrib = -1 * SLEEP_PAYBACK;
  while (D >= 2 && n < 21) { D = Math.max(0, D * SLEEP_DECAY + contrib); n++; }
  return D < 2 ? n : null;
}
// Uyku borcu (saat). + = borç. Kayıtsız gece "iyi uyudu" sayılmaz, sadece erime uygulanır.
function sleepDebt() {
  var target = (ensureSleepGoal().targetH) || 8;
  var model = sleepQualityModel();
  var D = 0, nights = 0, est = 0, missing = 0, started = false;
  for (var i = SLEEP_WINDOW - 1; i >= 0; i--) {          // eskiden yeniye
    var r = sleepResolvedHours(sleepFor(shiftDateStr(today(), -i)), model);
    if (!r) { if (started) { D = D * SLEEP_DECAY; missing++; } continue; }
    started = true;
    var gap = target - r.h;
    var contrib = gap > 0 ? Math.min(gap, SLEEP_MAX_GAP)
                          : Math.max(gap, -SLEEP_MAX_CREDIT) * SLEEP_PAYBACK;
    D = Math.max(0, D * SLEEP_DECAY + contrib);
    nights++; if (r.est) est++;
  }
  var debt = Math.round(D * 10) / 10;
  return { debt: debt, nights: nights, target: target, est: est, missing: missing,
           modeled: !!model, band: sleepDebtBand(debt), recoveryNights: sleepRecoveryNights(debt) };
}
// Bugünden geriye ardışık kötü/az uyku gecesi.
// Tek günlük kayıt boşluğu seriyi BOZMAZ (unutulan sabah seriyi sıfırlamamalı);
// üst üste 2 boşluk olursa dizi kopmuş sayılır.
function badSleepStreak() {
  var n = 0, gap = 0;
  for (var i = 0; i < 14; i++) {
    var s = sleepFor(shiftDateStr(today(), -i));
    if (!s || (s.quality == null && s.hours == null)) { gap++; if (gap >= 2) break; continue; }
    gap = 0;
    var bad = s.quality === 'bad' || (s.hours != null && s.hours < 6);
    if (bad) n++; else break;
  }
  return n;
}
function _minToHm(m) {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  var hh = Math.floor(m / 60), mm = m % 60;
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}
// Hedef yatış saati (lead'siz): kalkış - hedef uyku
function sleepTargetBedStr() {
  var g = ensureSleepGoal(); var wm = hmToMinSafe(g.wake); if (wm == null) return null;
  return _minToHm(wm - Math.round((g.targetH || 8) * 60));
}
// Push hatırlatıcı saati: hedef yatıştan leadMin önce
function sleepBedtimeStr() {
  var g = ensureSleepGoal(); var wm = hmToMinSafe(g.wake); if (wm == null) return null;
  return _minToHm(wm - Math.round((g.targetH || 8) * 60) - (g.leadMin || 0));
}
// data.reminders[]'a yatma push kaydını senkronla (Worker 15dk cron fırlatır — deploy gerekmez)
function syncSleepReminder() {
  data.reminders = data.reminders || [];
  var g = ensureSleepGoal();
  var idx = -1;
  for (var i = 0; i < data.reminders.length; i++) { if (data.reminders[i] && data.reminders[i].id === 'sleep-bedtime') { idx = i; break; } }
  var time = g.enabled ? sleepBedtimeStr() : null;
  if (!g.enabled || !time) { if (idx >= 0) data.reminders.splice(idx, 1); return; }
  var rec = { id: 'sleep-bedtime', kind: 'sleep', label: 'Yatma vakti yaklaşıyor', time: time, days: 'daily',
              enabled: true, lastFired: (idx >= 0 ? data.reminders[idx].lastFired : null) };
  if (idx >= 0) data.reminders[idx] = rec; else data.reminders.push(rec);
}

// Seçili diyet günü (varsayılan bugün). _dietDate ile geçmiş günlere gezilir.
let _dietDate = null;
function dietKey() { return _dietDate || today(); }
// Öğün saati damgası (v7-121). Antrenman öncesi/sonrası beslenme ve geç yeme–uyku
// ilişkisi ancak saatle analiz edilebiliyor; eski kayıtlarda yok, yenilere yazılır.
function mealNow() {
  try { return (typeof nowHM === 'function') ? nowHM() : null; } catch (e) { return null; }
}

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
  return isoLocal(d);
}
function dietDateShift(delta) {
  const next = shiftDateStr(dietKey(), delta);
  if (next > today()) return;          // gelecek yok
  _dietDate = (next === today()) ? null : next;
  renderDiet();
}
function dietDateToday() { _dietDate = null; renderDiet(); }
// Secili gunun insan okur etiketi. Yemek ekleme modali da bunu kullanir:
// gecmis bir gunde ekleme yaparken bunu GORMEZSEN yanlis gune yaziyorsun.
function dietDateLabel() {
  const k = dietKey(), t = today();
  if (k === t) return 'Bugün';
  if (k === shiftDateStr(t, -1)) return 'Dün';
  return new Date(k + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
}
function renderDietDateNav() {
  const lbl = document.getElementById('dietDateLabel');
  const nextBtn = document.getElementById('dietDateNext');
  if (!lbl) return;
  lbl.textContent = dietDateLabel();
  if (nextBtn) nextBtn.disabled = (dietKey() === today());
}

// ===== DİYET render + handler =====
const MEAL_SLOTS = { kahvalti: 'Kahvaltı', ogle: 'Öğle', aksam: 'Akşam', atistirma: 'Atıştırma' };
// ⚠️ 6 Eyl 2026 — GÜN KISALTMASI TEK KAYNAKTAN. Türkçede ilk üç harfi almak
// ÇALIŞMAZ: "Pazartesi"→"Paz" ile "Pazar"→"Paz", "Cumartesi"→"Cum" ile
// "Cuma"→"Cum" çakışıyor. program.js'in antrenman kurulum ekranındaki dövüş
// günü çipleri tam olarak böyle yazılmıştı: yedi çipin ikisi ayırt
// edilemiyordu, yani kullanıcı hangi güne bastığını göremiyordu.
// JS getDay() sırası: 0=Pazar.
const GUN_KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/**
 * ⚠️ ELLE KONMUŞ HEDEF SESSİZ KALMASIN.
 * Profil girilmemişse beslenme motoru susuyor ve günlük, geçmişte elle
 * yazılmış bir `kcalGoal`i sayıyor — hiçbir yerde "bu sayı senin verinden
 * gelmiyor" yazmadan. Gerçek veride görülen tam olarak buydu: profil yok,
 * hedef 2200 kcal elle kalmış, motor hiç çalışmamış.
 * ⚠️ Uyarı YALNIZ bugün gösteriliyor; geçmiş günü incelerken "kurulum yap"
 * demek anlamsız ve gürültü.
 */
function renderDietGoalWarn() {
  const el = document.getElementById('dietGoalWarn');
  if (!el) return;
  const bugunMu = dietKey() === today();
  const eksik = (typeof dietSetupEksik === 'function') ? dietSetupEksik() : [];
  if (!bugunMu || !eksik.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = 'Bu hedef <b>elle konmuş</b> — ' + escapeHtml(eksik.join(' ve ')) +
    ' girilmediği için motor senin verinden hesaplayamıyor. ' +
    '<button class="small" onclick="dietSetupOpen()">Kurulumu aç</button>';
}

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
  renderDietGoalWarn();
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
  // nutrition.js tembel iner; Diyet sekmesi acilmadan once yoktur.
  if (typeof renderNutOner === 'function') renderNutOner();
  if (typeof renderHevySection === 'function') renderHevySection();
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
  // Modal basligi da degismeli: "Yemek ekle · Kahvalti" yazarken Ogle'ye
  // ekliyor olmak, ekledikten SONRA fark edilen bir hataydi.
  syncFoodModalTitle();
  // Sik yedikleri de slot bazli siraliyor; slot degisince liste yenilenmeli.
  renderFrequentMeals();
}
// Baslik tek yerden: slot + (bugun degilse) gun etiketi.
// ⚠️ Gun etiketi BUGUN disinda MUTLAKA yazilir: dietDay() secili gunu
// kullaniyor, yani gecmis bir gunde acilan modal oraya yaziyor.
function syncFoodModalTitle() {
  const el = document.getElementById('foodModalSlot');
  if (!el) return;
  const gun = dietDateLabel();
  el.textContent = (MEAL_SLOTS[_mealSlot] || '') + (gun === 'Bugün' ? '' : ' · ' + gun);
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
  day.meals.push({ id: Date.now(), slot: _mealSlot, name, kcal, protein, carb, fat, at: mealNow() });
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

// --- Sık yediklerin (geçmişten türetilir, tek tık tekrar ekle) ---
/**
 * ⚠️ 6 Eyl 2026 — SLOT FARKINDALIGI EKLENDI. Liste tek ve genel idi: kahvalti
 * icin acilan modalda en ustte "Tavuk pilav" duruyordu. Artik secili ogunde
 * yenmis kalemler ONE aliniyor; slot disi kalemler listeden ATILMIYOR (yeni
 * ogunde liste bos kalir, ozellik gorunmez olurdu) yalniz arkaya dusuyor.
 */
function frequentMeals(limit = 8, slot) {
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
      const e = map.get(key) || { name, count: 0, slotCount: 0, kcal: null, protein: null, carb: null, fat: null, slot: 'atistirma', last: '' };
      e.count++; e.name = name;
      if (slot && (m.slot || 'kahvalti') === slot) e.slotCount++;
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
      // Sabitlenenlerden sonra: once BU ogunde yenenler, sonra genel siklik.
      const sa = a.slotCount > 0 ? 1 : 0, sb = b.slotCount > 0 ? 1 : 0;
      if (sa !== sb) return sb - sa;
      if (sa && b.slotCount !== a.slotCount) return b.slotCount - a.slotCount;
      return b.count - a.count || (a.last < b.last ? 1 : -1);
    }).slice(0, limit);
}
let _freqMeals = [];
let _freqEdit = false;
function toggleFreqEdit() { _freqEdit = !_freqEdit; renderFrequentMeals(); }
function renderFrequentMeals() {
  _freqMeals = frequentMeals(10, _mealSlot);
  const el = document.getElementById('freqMeals');
  if (!el) return;
  if (!_freqMeals.length) { el.innerHTML = ''; _freqEdit = false; return; }
  const pinned = data.diet.freqPinned || [];
  const slotAd = (MEAL_SLOTS[_mealSlot] || '').toLocaleLowerCase('tr');
  const baslik = slotAd ? `${slotAd} · sık yediklerin` : 'Sık yediklerin';
  const head = `<div class="freq-head">${escapeHtml(baslik)} <button class="freq-editbtn" onclick="toggleFreqEdit()">${_freqEdit ? 'bitti' : 'düzenle'}</button></div>`;
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
/**
 * ⚠️ 6 Eyl 2026 — UC HATA BIRDEN. Bu yol arama yolundaki duzeltmelerin
 * HICBIRINI almamisti:
 *  1) SLOT YANLISTI. `slot: m.slot` — kalemin GECMISTEKI slotu. "Kahvaltı"
 *     icin acilan modalda "Tavuk pilav" chip'ine basinca kayit AKSAM'a
 *     dusuyordu ve hicbir uyari cikmiyordu. Modalin basligini "Öğle · Dün"
 *     yapan duzeltmenin ayni sinifi; chip yolu atlanmisti.
 *  2) `id: Date.now()` — ayni ms'de iki ekleme catisiyor, geri alma YANLIS
 *     kaydi siliyordu (_mealId() bunun icin yazilmisti).
 *  3) Modal kapaniyor + geri alma yok. Uc chip = uc kez modal ac/kapa.
 * Cozum: kayit uretimi tek yerden — arama yolunun _quickAddFood'u.
 */
function quickAddMeal(i) {
  const m = _freqMeals[i];
  if (!m) return;
  const o = { name: m.name, kcal: (m.kcal != null ? m.kcal : null), protein: m.protein, carb: m.carb, fat: m.fat };
  if (typeof _quickAddFood === 'function') { _quickAddFood(o); return; }
  // foods.js henuz inmediyse (chip modal disinda kullanilirsa) guvenli yedek
  const day = dietDay();
  day.meals.push({ id: Date.now(), slot: _mealSlot || 'atistirma', name: o.name, kcal: o.kcal, protein: o.protein, carb: o.carb, fat: o.fat, at: mealNow() });
  save(); renderDiet(); closeFoodModal();
  showToast(m.name + ' eklendi', 'success');
}

// --- Kilo + vücut kompozisyonu (v7-122) ---
// Tartı artık sadece kilo değil: yağ oranı (fat, %) ve yağsız kütle (lean, kg) da tutulur.
// Kilo tek başına yanıltıcı — kilo sabitken yağ düşüp kas artabilir (rekompozisyon).
// src: 'manual' elle | 'health' iOS Kısayol → Apple Health | 'csv' toplu içe aktarım.
function bodyNum(v, min, max, dec) {
  if (v == null || v === '') return null;
  var n = (typeof v === 'number') ? v
    : parseFloat(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n) || n < min || n > max) return null;
  var p = Math.pow(10, dec);
  return Math.round(n * p) / p;
}
// Aynı güne ikinci kayıt gelirse ÜZERİNE YAZMAZ, alan alan birleştirir:
// sabah Kısayol yağ oranını yazdıysa akşam elle kilo girilince yağ oranı kaybolmasın.
function upsertBody(entry) {
  ensureDiet();
  if (!entry || !entry.date) return null;
  var kg = bodyNum(entry.kg, 20, 500, 1);
  var fat = bodyNum(entry.fat, 3, 70, 1);
  var lean = bodyNum(entry.lean, 10, 300, 1);
  if (kg == null && fat == null && lean == null) return null;
  var arr = data.diet.weights, ex = null;
  for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].date === entry.date) { ex = arr[i]; break; } }
  if (!ex) { ex = { date: entry.date }; arr.push(ex); }
  if (kg != null) ex.kg = kg;
  if (fat != null) ex.fat = fat;
  if (lean != null) ex.lean = lean;
  // Yağsız kütle BİRLEŞMİŞ kayıttan türetilir: sabah kilo, akşam yağ oranı ayrı
  // girildiğinde de hesaplansın (yalnız gelen veriye bakılsaydı boş kalırdı).
  else if (ex.kg != null && ex.fat != null) ex.lean = Math.round(ex.kg * (100 - ex.fat) / 100 * 10) / 10;
  ex.src = entry.src || 'manual';
  arr.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return ex;
}
function logWeight() {
  const el = document.getElementById('weightKg');
  const fe = document.getElementById('weightFat');
  const rawKg = (el.value || '').trim(), rawFat = fe ? (fe.value || '').trim() : '';
  if (!rawKg && !rawFat) { showToast('Kilo ya da yağ oranı gir', 'info'); el.focus(); return; }
  const rec = upsertBody({ date: dietKey(), kg: rawKg || null, fat: rawFat || null, src: 'manual' });
  if (!rec) { showToast('Geçerli değer gir (kilo 20-500, yağ %3-70)', 'info'); el.focus(); return; }
  el.value = ''; if (fe) fe.value = '';
  save(); renderDiet();
  showToast('Kaydedildi', 'success');
}
// Meta satırı: kilo ve yağ oranı AYRI serilerdir — biri eksikken diğeri görünmeye devam etmeli.
function weightMetaHtml(arr) {
  const kgs = arr.filter(w => w && w.kg != null), fats = arr.filter(w => w && w.fat != null);
  const part = (list, key, unit, pre) => {
    if (!list.length) return '';
    const lastV = list[list.length - 1][key];
    const head = pre + lastV + unit;
    if (list.length < 2) return head;
    const d = +(lastV - list[0][key]).toFixed(1);
    if (!d) return head;
    const cls = d > 0 ? 'wt-up' : 'wt-down';
    return `${head} <span class="${cls}">${d > 0 ? '+' : ''}${d}</span>`;
  };
  return [part(kgs, 'kg', ' kg', ''), part(fats, 'fat', ' yağ', '%')].filter(Boolean).join(' · ');
}
function renderWeightTrend() {
  const arr = (data.diet.weights || []);
  const el = document.getElementById('weightTrend'), meta = document.getElementById('weightMeta');
  const kgs = arr.filter(w => w && w.kg != null).map(w => w.kg);
  if (kgs.length < 2) {
    el.innerHTML = '<div class="diet-empty">En az 2 kayıt olunca trend görünür.</div>';
    meta.innerHTML = weightMetaHtml(arr);
    renderWeightSrc(arr);          // erken dönüşte de tazele — yoksa eski rozet ekranda kalıyordu
    return;
  }
  el.innerHTML = sparkline(kgs);
  meta.innerHTML = weightMetaHtml(arr);
  renderWeightSrc(arr);
}
// Kaynak rozeti: verinin nereden geldiği görünmezse, Kısayol sessizce durduğunda
// haftalarca fark edilmez. Son kaydın kaynağı ve tarihi açıkça yazılır.
function renderWeightSrc(arr) {
  const el = document.getElementById('weightSrcMeta');
  if (!el) return;
  const last = arr[arr.length - 1];
  if (!last) { el.textContent = ''; return; }
  const names = { manual: 'elle', health: 'Sağlık', csv: 'CSV' };
  el.textContent = arr.length + ' kayıt · son: ' + last.date + ' (' + (names[last.src] || 'elle') + ')';
}

/* ---------------- TARTI GEÇMİŞİ — CSV İÇE AKTARIM ----------------
   Xiaomi Home / Mi Fitness / Zepp Life dışa aktarımları tek bir standart
   kullanmıyor: ayraç virgül ya da noktalı virgül olabiliyor, tarih 4 ayrı
   biçimde gelebiliyor, sütun başlıkları TR/EN karışık. Bu yüzden sütunlar
   sabit sıraya göre DEĞİL, başlıktaki anahtar kelimeye göre eşleştirilir.
   Eşleşmeyen satır sessizce ATLANIR ve sayısı kullanıcıya bildirilir —
   sessizce yanlış veri almak, eksik veri almaktan kötüdür.              */
function csvSplitLine(line, sep) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}
// 'YYYY-MM-DD' üretir. Ham toISOString KULLANILMAZ (UTC kayması bug'ı, v7-119).
function bodyCsvDate(raw) {
  var s = String(raw || '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
  if (m) {
    var a = +m[1], bb = +m[2];
    // Belirsiz durumda (ikisi de <=12) Türkiye biçimi varsayılır: gün.ay.yıl
    var day = a, mon = bb;
    if (a <= 12 && bb > 12) { day = bb; mon = a; }
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return m[3] + '-' + ('0' + mon).slice(-2) + '-' + ('0' + day).slice(-2);
  }
  return null;
}
function parseBodyCsv(text) {
  var lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
  if (lines.length < 2) return { rows: [], skipped: 0, err: 'Dosyada veri satırı yok.' };
  // Ayraç: başlık satırında en çok geçen aday
  var seps = [',', ';', '\t'], sep = ',', best = -1;
  for (var i = 0; i < seps.length; i++) {
    var c = lines[0].split(seps[i]).length;
    if (c > best) { best = c; sep = seps[i]; }
  }
  if (best < 2) return { rows: [], skipped: 0, err: 'Sütunlar ayrıştırılamadı — dosya CSV değil olabilir.' };
  var head = csvSplitLine(lines[0], sep).map(function (h) { return h.toLowerCase(); });
  var find = function (re, not) {
    for (var j = 0; j < head.length; j++) {
      if (re.test(head[j]) && !(not && not.test(head[j]))) return j;
    }
    return -1;
  };
  // Sıra önemli: 'body fat (kg)' gibi başlıklar kilo sütunuyla karışmasın diye
  // yağ oranı ÖNCE ve kütle birimi içerenler DIŞLANARAK aranır.
  var iFat = find(/(fat|yağ|yag)/, /(kg|mass|kütle|kutle|free|yağsız|yagsiz)/);
  var iKg = find(/(weight|kilo|ağırlık|agirlik)/, /(fat|yağ|yag|goal|hedef|target)/);
  if (iKg < 0) iKg = find(/^kg$/, null);
  var iLean = find(/(lean|fat[- ]?free|yağsız|yagsiz)/, null);
  var iDate = find(/(date|tarih|time|zaman)/, null);
  if (iDate < 0) iDate = 0;
  if (iKg < 0 && iFat < 0) return { rows: [], skipped: 0, err: 'Kilo ya da yağ oranı sütunu bulunamadı.' };

  var rows = [], skipped = 0, seen = {};
  for (var k = 1; k < lines.length; k++) {
    var cells = csvSplitLine(lines[k], sep);
    var date = bodyCsvDate(cells[iDate]);
    if (!date) { skipped++; continue; }
    var kg = iKg >= 0 ? bodyNum(cells[iKg], 20, 500, 1) : null;
    var fatRaw = iFat >= 0 ? bodyNum(cells[iFat], 0.03, 70, 3) : null;
    // Bazı dışa aktarımlar yağ oranını kesir yazar (0.18 = %18) — %3'ün altı kesir kabul edilir.
    var fat = (fatRaw != null && fatRaw < 1) ? Math.round(fatRaw * 1000) / 10 : fatRaw;
    if (fat != null && (fat < 3 || fat > 70)) fat = null;
    var lean = iLean >= 0 ? bodyNum(cells[iLean], 10, 300, 1) : null;
    if (kg == null && fat == null && lean == null) { skipped++; continue; }
    // Günde birden fazla tartım varsa SONUNCUSU kalır (dosyalar eskiden yeniye sıralı gelir)
    if (seen[date] != null) rows[seen[date]] = { date: date, kg: kg, fat: fat, lean: lean };
    else { seen[date] = rows.length; rows.push({ date: date, kg: kg, fat: fat, lean: lean }); }
  }
  return { rows: rows, skipped: skipped, err: null };
}
function importBodyCsv(e) {
  var file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (ev) {
    var res;
    try { res = parseBodyCsv(ev.target.result); }
    catch (err) { showToast('Dosya okunamadı: ' + err.message, 'danger'); return; }
    if (res.err) { showToast(res.err, 'danger'); return; }
    if (!res.rows.length) { showToast('Geçerli tartım satırı bulunamadı', 'info'); return; }
    var first = res.rows[0].date, last = res.rows[res.rows.length - 1].date;
    var withFat = res.rows.filter(function (r) { return r.fat != null; }).length;
    var msg = res.rows.length + ' tartım bulundu (' + first + ' → ' + last + ').\n' +
      withFat + ' tanesinde yağ oranı var.' +
      (res.skipped ? '\n' + res.skipped + ' satır okunamadı, atlanacak.' : '') +
      '\n\nAidan\'a eklensin mi? (aynı güne ait mevcut kayıtlar birleştirilir, silinmez)';
    if (!confirm(msg)) return;
    var added = 0;
    for (var i = 0; i < res.rows.length; i++) {
      var r = res.rows[i];
      if (upsertBody({ date: r.date, kg: r.kg, fat: r.fat, lean: r.lean, src: 'csv' })) added++;
    }
    save(); renderDiet();
    showToast(added + ' tartım eklendi', 'success');
  };
  reader.readAsText(file);
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
/**
 * 🔴 6 Eyl 2026 — KURULUM GÖMÜLÜYDU. Hedef hesaplayıcı KAPALI bir
 * `<details>` içinde ("Hedefler & öğün hatırlatıcıları"). Profil girilmeden
 * beslenme motoru hiç çalışmıyor, plan üretilmiyor ve günlük ELLE konmuş bir
 * hedefi sayıyor — üstelik bunu hiçbir yerde söylemeden.
 * Gerçek veride görülen buydu: profil yok, hedef 2200 kcal elle kalmış,
 * plan 0 satır. Motor hazır, kapı kapalıydı.
 */
function dietSetupEksik() {
  ensureDiet();
  const c = data.diet.calc || {};
  const eksik = [];
  if (!(Number(c.age) >= 10 && Number(c.age) <= 100)) eksik.push('yaş');
  if (!(Number(c.height) >= 120 && Number(c.height) <= 230)) eksik.push('boy');
  // ⚠️ KILO EKSIK SAYILMAZ: tartıdan otomatik geliyor (bkz. nutProfile).
  const kg = Number(c.weight) || ((data.diet.weights || []).filter(w => w && w.kg > 0).pop() || {}).kg;
  if (!(kg > 0)) eksik.push('kilo');
  return eksik;
}
/** Kurulum kutusunu aç, oraya kaydır ve İLK EKSİK alana odaklan. */
function dietSetupOpen() {
  const box = document.getElementById('dietSetupBox');
  if (!box) return;
  box.open = true;
  const eksik = dietSetupEksik();
  const alan = eksik.includes('yaş') ? 'calcAge' : eksik.includes('boy') ? 'calcHeight' : 'calcWeight';
  setTimeout(() => {
    try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    const el = document.getElementById(alan);
    if (el) el.focus();
  }, 80);
}

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
  // ⚠️ KILO ALANI BOSSA TARTIDAN OKU. Ekran "kilonu tartıdan alıyorum,
  // yazmana gerek yok" diyordu ama doğrulama boş kiloyu reddediyordu —
  // yani ekran bir şey vaat edip kod tersini yapıyordu.
  let kg = parseFloat((document.getElementById('calcWeight').value || '').replace(',', '.'));
  if (!(kg >= 30 && kg <= 300)) {
    const sonTarti = ((data.diet.weights || []).filter(w => w && w.kg > 0).pop() || {}).kg;
    if (sonTarti > 0) kg = sonTarti;
  }
  const act = parseFloat(document.getElementById('calcActivity').value) || 1.55;
  if (!(age >= 10 && age <= 100) || !(cm >= 120 && cm <= 230) || !(kg >= 30 && kg <= 300)) {
    const eksik = (typeof dietSetupEksik === 'function') ? dietSetupEksik() : [];
    showToast(eksik.length ? 'Eksik: ' + eksik.join(', ') : 'Yaş, boy ve kiloyu doğru gir', 'info', 4000);
    return;
  }
  data.diet.calc = { sex: _calcSex, age, height: cm, weight: kg, activity: String(act), goal: _calcGoal };
  save();
  const el = document.getElementById('calcResult');
  if (!el) return;

  // 🔴 6 Eyl 2026 — HEDEFI ARTIK BURASI BELIRLEMIYOR.
  // Onceden bu hesaplayici kendi Mifflin BMR'si + kullanicinin sectigi PAL +
  // sabit 1.8 g/kg protein ile `kcalGoal`e yaziyordu; beslenme motoru ise
  // paylasilan hcBMR'yi, GUN TIPINE gore PAL'i ve enerji mevcudiyeti tabanini
  // kullaniyor. Ayni ekranda iki farkli sayi duruyordu (olcum: 3274 vs 2899)
  // ve hangisinin gecerli oldugu hicbir yerde yazmiyordu.
  // Motor kazanir; burasi PROFIL toplar.
  const nut = (typeof nutTargets === 'function' && typeof nutDayType === 'function')
    ? nutTargets({ sex: _calcSex, age, height: cm, weight: kg },
                 nutDayType(new Date().getDay(), data.program),
                 (data.diet.nut && data.diet.nut.hedef) || (_calcGoal === 'gain' ? 'kas' : 'koru'))
    : null;

  if (nut) {
    el.innerHTML =
      `<div class="calc-out"><b>${nut.kcal} kcal</b> <span class="calc-sub">bugün · BMR ${nut.bmr}, harcama ~${nut.tdee}</span></div>` +
      `<div class="calc-out-macros">Protein ${nut.protein}g · Karb ${nut.carb}g · Yağ ${nut.fat}g</div>` +
      '<div class="calc-note">Hedefi beslenme motoru hesaplıyor: günün tipine göre (dinlenme / ağırlık / dövüş) ' +
      'değişiyor, o yüzden yukarıdaki aktivite seçimi yalnızca profil kaydı. Program kurduğunda gün tipi oradan okunuyor.</div>' +
      `<button class="small primary" onclick="applyCalcGoals()">Hedefleri güncelle</button>`;
    return;
  }

  // Motor inmediyse yedek hesap — hangi yoldan geldigi ACIKCA yaziliyor.
  const bmr = Math.round(10 * kg + 6.25 * cm - 5 * age + (_calcSex === 'male' ? 5 : -161));
  const tdee = Math.round(bmr * act);
  let kcal = tdee;
  if (_calcGoal === 'lose') kcal = Math.max(Math.round(bmr * 1.1), tdee - 500);
  else if (_calcGoal === 'gain') kcal = tdee + 350;
  const protein = Math.round(1.8 * kg);
  const fat = Math.round(kcal * 0.25 / 9);
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const goalLbl = _calcGoal === 'lose' ? 'kilo ver' : (_calcGoal === 'gain' ? 'kilo al' : 'koru');
  el.innerHTML =
    `<div class="calc-out"><b>${kcal} kcal/gün</b> <span class="calc-sub">(${goalLbl} · BMR ${bmr}, TDEE ${tdee})</span></div>` +
    `<div class="calc-out-macros">Protein ${protein}g · Karb ${carb}g · Yağ ${fat}g</div>` +
    '<div class="calc-note">Kaba hesap — beslenme motoru henüz yüklenmedi. Diyet sekmesi tam açıldığında ' +
    'hedef gün tipine göre yeniden hesaplanır.</div>' +
    `<button class="small primary" onclick="applyCalcGoals(${kcal},${protein},${carb},${fat})">Bu hedefleri uygula</button>`;
}

/**
 * Argumansiz cagrilirsa MOTOR hesabini uygular (tek kaynak); argumanlarla
 * cagrilirsa yedek hesabi. Yedek yol yalnizca nutrition.js inmemisken olusur.
 */
function applyCalcGoals(kcal, protein, carb, fat) {
  ensureDiet();
  if (kcal == null) {
    if (typeof renderNutrition === 'function') renderNutrition();   // nutSyncDietGoals iceriden yazar
    renderDiet();
    showToast('Hedefler profiline göre güncellendi', 'success');
    return;
  }
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
  else day.meals.push({ id: Date.now(), slot: p.slot, name: p.name, kcal: p.kcal, protein: p.protein != null ? p.protein : null, carb: p.carb != null ? p.carb : null, fat: p.fat != null ? p.fat : null, planId, at: mealNow() });
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
// Ad icindeki miktar ekini ("Tavuk (180g)", "Yumurta ×2") ikinci satira ayirir.
// Boylece ad okunur kalir, miktar da kaybolmaz — Stitch yerlesiminin ana fikri.
function splitMealName(name) {
  const s = String(name || '');
  let m = s.match(/^(.*?)\s*\((\d+)g\)\s*$/);
  if (m) return { ad: m[1], mik: m[2] + ' g' };
  m = s.match(/^(.*?)\s*×\s*([\d,\.]+)\s*$/);
  if (m) return { ad: m[1], mik: m[2] + ' porsiyon' };
  return { ad: s, mik: '' };
}
// Gunluk basliklarinda Stitch'in kucuk harfli adlari + ikon.
// MEAL_SLOTS'a DOKUNULMADI: o adlar dugmelerde de geciyor
// ("Ogle'ye ekle"); "ogle yemegi'e ekle" bozuk Turkce olurdu.
const DIARY_SLOT_UI = {
  kahvalti: { ad: 'kahvaltı', ikon: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>' },
  ogle: { ad: 'öğle yemeği', ikon: '<path d="M3 2v7c0 1.1.9 2 2 2h1a2 2 0 0 0 2-2V2"/><line x1="5.5" y1="2" x2="5.5" y2="11"/><line x1="5.5" y1="11" x2="5.5" y2="22"/><path d="M17 2v20"/><path d="M17 2a4 4 0 0 1 4 4v5a2 2 0 0 1-2 2h-2"/>' },
  aksam: { ad: 'akşam yemeği', ikon: '<path d="M3 11h18"/><path d="M12 11a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z"/><line x1="12" y1="4" x2="12" y2="7"/>' },
  atistirma: { ad: 'atıştırmalık', ikon: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1"/><circle cx="14" cy="9" r="1"/><circle cx="13" cy="15" r="1"/><circle cx="9" cy="15" r="1"/>' },
};
// Renkli emoji tek gorsel dili bozuyordu: bicimi isletim sistemi belirliyor
// ve monokrom palete disaridan renk siziyordu. HTML uretilen yerde ikon,
// metin kanalinda (textContent / escapeHtml) sadece kelime kaldi.
const ICON_PATHS = {
  saat: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  sure: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/>',
  kum: '<path d="M6 2h12M6 22h12"/><path d="M6 2c0 4 6 6 6 10s-6 6-6 10"/><path d="M18 2c0 4-6 6-6 10s6 6 6 10"/>',
};
function icon(ad) { return ICON_PATHS[ad] ? dtIcon(ICON_PATHS[ad]) : ''; }
function dtIcon(d) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
// Stitch'in ozet karti: kalori solda kahraman sayi, makrolar sagda kolon.
function renderDietSummaryCard(day) {
  const kcal = day.meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
  const mac = k => {
    const v = day.meals.reduce((s, m) => s + (m[k] != null ? Number(m[k]) : 0), 0);
    const kayit = day.meals.some(m => m[k] != null);
    return kayit ? Math.round(v) + 'g' : '—';
  };
  return '<div class="dt-sum">' +
    `<div class="dt-sum-main"><span class="dt-sum-lab">kalori</span>` +
      `<span class="dt-sum-num">${kcal.toLocaleString('tr-TR')}</span></div>` +
    '<div class="dt-sum-macros">' +
      `<div class="dt-sum-cell"><span class="dt-sum-clab">pro</span><span class="dt-sum-cval">${mac('protein')}</span></div>` +
      `<div class="dt-sum-cell"><span class="dt-sum-clab">yağ</span><span class="dt-sum-cval">${mac('fat')}</span></div>` +
      `<div class="dt-sum-cell"><span class="dt-sum-clab">krb</span><span class="dt-sum-cval">${mac('carb')}</span></div>` +
    '</div></div>';
}
function renderDiary() {
  const day = dietDay(false);
  const el = document.getElementById('diaryList');
  if (!el) return;
  const k = dietKey();
  const bas = (k === today()) ? 'bugün' : k;
  let html = `<h2 class="dt-day-title">${escapeHtml(bas)}</h2>` + renderDietSummaryCard(day);
  Object.keys(MEAL_SLOTS).forEach(slot => {
    const items = day.meals.filter(m => m.slot === slot);
    const sub = items.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
    const ui = DIARY_SLOT_UI[slot] || { ad: MEAL_SLOTS[slot], ikon: '' };
    html += '<section class="dt-sec">' +
      `<div class="dt-sec-head"><span class="dt-sec-name">${dtIcon(ui.ikon)}${escapeHtml(ui.ad)}</span>` +
      `<span class="dt-sec-kcal">${sub ? sub : ''}</span></div>`;
    html += '<div class="dt-card">';
    if (items.length) {
      items.forEach(m => {
        const sp = splitMealName(m.name);
        const macro = (m.protein != null || m.carb != null || m.fat != null)
          ? `P${_mShow(m.protein)} · K${_mShow(m.carb)} · Y${_mShow(m.fat)}` : '';
        const alt = [sp.mik, macro].filter(Boolean).join('  ·  ');
        html += '<div class="dt-row">' +
          `<button class="dt-row-main" onclick="editMeal(${m.id})">` +
            `<span class="dt-row-name">${escapeHtml(sp.ad)}</span>` +
            (alt ? `<span class="dt-row-sub">${escapeHtml(alt)}</span>` : '') +
          '</button>' +
          `<span class="dt-row-kcal">${m.kcal != null ? m.kcal : '—'}</span>` +
          `<button class="dt-row-del" onclick="removeMeal(${m.id})" aria-label="Sil">✕</button>` +
        '</div>';
      });
    }
    html += `<button class="dt-add" onclick="openFoodModal('${slot}')">＋ ekle</button>`;
    html += '</div></section>';
  });
  el.innerHTML = html;
}

// ===== Yemek ekleme modalı (Ara / Barkod / Elle) + Open Food Facts =====
const OFF_BASE = 'https://world.openfoodfacts.org';
let _foodResults = [];
let _foodPick = null;
let _barcodeScanner = null;
let _barcodeLibLoading = null;

// ===== Yemek ekleme modali + kisisel besin katmani -> foods.js (tembel) =====
// openFoodModal / arama / porsiyon editoru / barkod / kendi besinlerim /
// tarifler / takviyeler / ogun duzenleme 2 Eyl 2026'da foods.js'e tasindi
// (48.6 KB kaynak, 14 KB gzip). Hepsi Diyet sekmesine ozel; buradaki
// cagrilar (renderDiet, renderDiary) zaten yalniz o sekmede calisiyor.
// trNorm() de oraya gitti — core.js'te baska kullanicisi yoktu.

function renderMacroBars() {
  const d = data.diet, day = dietDay(false);
  let p = 0, c = 0, f = 0, noMacroKcal = 0;
  day.meals.forEach(m => {
    p += Number(m.protein) || 0; c += Number(m.carb) || 0; f += Number(m.fat) || 0;
    if (m.protein == null && m.carb == null && m.fat == null) noMacroKcal += Number(m.kcal) || 0;
  });
  const rows = [
    ['Protein', Math.round(p), d.proteinGoal || 0, 'var(--macro-pro)'],
    ['Karbonhidrat', Math.round(c), d.carbGoal || 0, 'var(--macro-carb)'],
    ['Yağ', Math.round(f), d.fatGoal || 0, 'var(--macro-fat)'],
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
    { val: kP, color: 'var(--macro-pro)' },
    { val: kC, color: 'var(--macro-carb)' },
    { val: kF, color: 'var(--macro-fat)' },
    { val: other, color: 'var(--macro-other)' },
  ].filter(x => x.val > 0);
  const pc = v => macroK ? Math.round(v / macroK * 100) : 0;
  const rem = (goal, val) => { const r = (goal || 0) - val; return r >= 0 ? r + 'g kaldı' : (-r) + 'g fazla'; };
  const donut = (typeof donutChart === 'function') ? donutChart(segs, 104) : '';
  const otherRow = other > 0
    ? `<div class="mdl-row"><span class="mdl-dot" style="background:var(--macro-other)"></span><span class="mdl-name">Diğer</span><span class="mdl-pct">${other} kcal</span><span class="mdl-rem">lif/makrosuz</span></div>`
    : '';
  host.innerHTML =
    `<div class="macro-donut-svg">${donut}<div class="macro-donut-center"><span class="mdc-num">${total}</span><span class="mdc-lbl">kcal</span></div></div>` +
    `<div class="macro-donut-legend">` +
      `<div class="mdl-row"><span class="mdl-dot" style="background:var(--macro-pro)"></span><span class="mdl-name">Protein</span><span class="mdl-pct">%${pc(kP)}</span><span class="mdl-rem">${rem(d.proteinGoal, p)}</span></div>` +
      `<div class="mdl-row"><span class="mdl-dot" style="background:var(--macro-carb)"></span><span class="mdl-name">Karb</span><span class="mdl-pct">%${pc(kC)}</span><span class="mdl-rem">${rem(d.carbGoal, c)}</span></div>` +
      `<div class="mdl-row"><span class="mdl-dot" style="background:var(--macro-fat)"></span><span class="mdl-name">Yağ</span><span class="mdl-pct">%${pc(kF)}</span><span class="mdl-rem">${rem(d.fatGoal, f)}</span></div>` +
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
    day.meals.push({ id: Date.now() + Math.floor(Math.random() * 10000) + n, slot: m.slot, name: m.name, kcal: m.kcal, protein: m.protein != null ? m.protein : null, carb: m.carb != null ? m.carb : null, fat: m.fat != null ? m.fat : null, at: mealNow() });
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

// ===== PAYLASILAN YARDIMCILAR ===== stocks.js'ten tasindi (9 Agu 2026, tembel yukleme paketi) =====

// SVG donut chart — stroke-dasharray tekniği (segments: [{val,color}])
function donutChart(segments, size) {
  size = size || 140;
  const r = size / 2 - 11;
  const cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.val, 0) || 1;
  let offset = 0;
  const arcs = segments.map(seg => {
    const len = (seg.val / total) * C;
    const c = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="13" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
    return c;
  }).join('');
  return `<svg class="pf-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${arcs}</svg>`;
}

// Basit line chart (sparkline/portföy geçmişi için — TA overlay yok)
function lineChart(values, isDown) {
  if (!values || values.length < 2) return '';
  const w = 420, h = 140, padX = 8, padY = 10;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const pts = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * (w - 2 * padX);
    const y = padY + (1 - (v - min) / range) * (h - 2 * padY);
    return [x, y];
  });
  const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${pts[pts.length-1][0].toFixed(1)},${(h-padY).toFixed(1)} L${pts[0][0].toFixed(1)},${(h-padY).toFixed(1)} Z`;
  const up = values[values.length - 1] >= values[0];
  const color = up ? cssVar('--success', '#5cbf7a') : cssVar('--danger', '#ff4444');
  const fillId = 'lc-fill-' + (up ? 'u' : 'd');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${fillId}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${fillId})" stroke="none"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// Basit SVG sparkline — değer dizisinden tek çizgi (son ≥ ilk → yeşil, değilse kırmızı)
function sparkline(values) {
  if (!values || values.length < 2) return '';
  const w = 300, h = 46, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const up = values[values.length - 1] >= values[0];
  const color = up ? cssVar('--success', '#5cbf7a') : cssVar('--danger', '#ff4444');
  return `<svg class="pf-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Seçilen fotoğrafı canvas ile küçült (max kenar 1280px), jpeg base64 döndür — yükleme küçük kalsın
function resizeImageToDataUrl(file, maxSide = 1100, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        const scale = maxSide / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('görsel açılamadı')); };
    img.src = url;
  });
}
