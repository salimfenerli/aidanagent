/* ===================================================================
   health.js — SAGLIK ANALITIGI (tembel yuklenen modul)

   NEDEN AYRI DOSYA (30 Agu 2026, v7-171):
   Bu blok 23 Agustos'ta ui.js'e girdi ve ilk yukleme butcesini 215 -> 219 KB
   cikardi. 13-lazy'nin kendi yorumu o gun borcu yazmisti: "bu katman bir daha
   buyurse dogru cevap esigi yine yukseltmek DEGIL, hc* blogunun tamamini
   tembel bir health.js'e tasimaktir." Borc burada odendi.

   ⚠️ ESKI NOT YANLISTI. CLAUDE.md "hcInputs() -> hcAllPatterns() ANA EKRAN
   kartinda kullaniliyor, yani kritik yolda" diyordu. Degil: `healthCoachStrip`
   DIYET panelinin icinde ve `renderHealthCoach()` yalniz tasks.js'teki
   `showTab('diet')` dalindan cagriliyor — program.js/nutrition.js ile ayni
   yerden. Yani bu blok hicbir zaman ilk cizimde gerekmiyordu.

   ⚠️ PAYLASILAN CEKIRDEK: asagidaki saf fonksiyonlar aidan-worker/worker.js
   icinde BIREBIR AYNI durur. Birini degistirirsen otekini de degistir —
   tests/02-twins.test.js bu dosyayi (ui.js'i degil) worker ile karsilastirir.
   =================================================================== */

/* ===================================================================
   SAĞLIK ANALİTİĞİ ÇEKİRDEĞİ (v7-121) — PAYLAŞILAN SAF FONKSİYONLAR
   ⚠️ Bu blok ui.js ve aidan-worker/worker.js içinde BİREBİR AYNIDIR.
   Birini değiştirirsen ötekini de değiştir — ikizlik testi bunu kontrol eder.
   Hiçbir global okumaz: her girdi parametreyle gelir, çıktı deterministiktir.
   Amaç: AI'a "gittin/gitmedin" değil, ANALİZ EDİLEBİLİR veri göndermek.
   =================================================================== */

// Hevy primary_muscle_group → kaba hareket grubu (itme/çekme/bacak dengesi için)
var HC_GROUP_OF = {
  chest: 'itme', shoulders: 'itme', triceps: 'itme',
  lats: 'cekme', upper_back: 'cekme', biceps: 'cekme', traps: 'cekme', forearms: 'cekme',
  quadriceps: 'bacak', hamstrings: 'bacak', glutes: 'bacak', calves: 'bacak',
  abductors: 'bacak', adductors: 'bacak',
  abdominals: 'govde', lower_back: 'govde', neck: 'govde',
  cardio: 'kardiyo', full_body: 'tam',
};
var HC_GROUP_TR = { itme: 'itme', cekme: 'çekme', bacak: 'bacak', govde: 'gövde', kardiyo: 'kardiyo', tam: 'tüm vücut', diger: 'diğer' };

// Template haritası yoksa egzersiz adından tahmin. SIRA ÖNEMLİ:
// "leg curl" biseps kıvırmasıyla karışmasın diye bacak kalıpları önce gelir.
var HC_NAME_HINTS = [
  [/squat|leg press|lunge|hack |çömelme|bacak pres/i, 'quadriceps'],
  [/deadlift|rdl|romanian|hamstring|leg curl|arka bacak/i, 'hamstrings'],
  [/glute|hip thrust|kalça/i, 'glutes'],
  [/calf|baldır/i, 'calves'],
  [/bench|chest|göğüs|push[- ]?up|pec |fly|dip\b|dips\b/i, 'chest'],
  [/shoulder|omuz|overhead|\bohp\b|lateral raise|front raise|arnold|upright/i, 'shoulders'],
  [/tricep|triseps|pushdown|skull|kickback/i, 'triceps'],
  [/pulldown|pull[- ]?up|chin[- ]?up|\blat\b|kanat|row\b|kürek|çekiş/i, 'lats'],
  [/bicep|biseps|curl|preacher|hammer/i, 'biceps'],
  [/trap|shrug/i, 'traps'],
  [/forearm|wrist|ön kol|grip/i, 'forearms'],
  [/abs?\b|crunch|plank|karın|core|sit[- ]?up|raise leg|leg raise/i, 'abdominals'],
  [/back extension|hyperext|good morning|bel/i, 'lower_back'],
  [/run|treadmill|bike|cycl|rowing machine|cardio|koşu|kardiyo|elliptical/i, 'cardio'],
];

// Egzersizin kas grubunu bul: önce Hevy template haritası (kesin), sonra ad tahmini.
// Dönüş { muscle, group, guessed } — guessed=true ise tahmindir, güven notu düşer.
function hcMuscleOf(ex, muscleMap) {
  var name = (ex && ex.name) || '';
  var tid = ex && ex.tid;
  if (tid && muscleMap && muscleMap[tid]) {
    var m = muscleMap[tid];
    return { muscle: m, group: HC_GROUP_OF[m] || 'diger', guessed: false };
  }
  for (var i = 0; i < HC_NAME_HINTS.length; i++) {
    if (HC_NAME_HINTS[i][0].test(name)) {
      var g = HC_NAME_HINTS[i][1];
      return { muscle: g, group: HC_GROUP_OF[g] || 'diger', guessed: true };
    }
  }
  return { muscle: 'other', group: 'diger', guessed: true };
}

// --- Saf tarih yardımcıları (iki tarafta da aynı sonucu versin diye yerel) ---
function hcShift(iso, n) {
  var d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function hcDayDiff(a, b) {   // b - a, gün
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}
function hcRound(x, n) { var p = Math.pow(10, n || 0); return Math.round(x * p) / p; }
function hcAvg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

/* ---------------- ANTRENMAN İSTATİSTİĞİ ----------------
   Girdi: normalize edilmiş Hevy antrenmanları (normalizeHevyWorkout çıktısı).
   Her antrenmanda volumeKg / setCount / durationMin, her egzersizde
   {name, tid, sets, volumeKg, top:{kg,reps,e1rm}} VAR — eskiden hiç kullanılmıyordu.
   Çıktı: dönem hacmi, haftalık set, kas grubu dağılımı, haftalık hacim serisi,
          en çok çalışılan egzersizlerde e1RM eğilimi.                        */
function hcHevyStats(workouts, fromDate, toDate, muscleMap) {
  var ws = (workouts || []).filter(function (w) { return w && w.date && w.date >= fromDate && w.date <= toDate; })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  if (!ws.length) return null;

  var spanDays = hcDayDiff(fromDate, toDate) + 1;
  var weeks = Math.max(1, spanDays / 7);
  var vol = 0, sets = 0, mins = 0, guessedSets = 0;
  var byGroup = { itme: 0, cekme: 0, bacak: 0, govde: 0, kardiyo: 0, tam: 0, diger: 0 };
  var exMap = {};
  var weekVol = {};   // haftaIndex → hacim

  for (var i = 0; i < ws.length; i++) {
    var w = ws[i];
    vol += w.volumeKg || 0;
    sets += w.setCount || 0;
    mins += w.durationMin || 0;
    var wk = Math.floor(hcDayDiff(fromDate, w.date) / 7);
    weekVol[wk] = (weekVol[wk] || 0) + (w.volumeKg || 0);

    var exs = w.exercises || [];
    for (var j = 0; j < exs.length; j++) {
      var ex = exs[j];
      if (!ex) continue;
      var info = hcMuscleOf(ex, muscleMap);
      byGroup[info.group] = (byGroup[info.group] || 0) + (ex.sets || 0);
      if (info.guessed) guessedSets += ex.sets || 0;
      var key = ex.name || 'Egzersiz';
      var e = exMap[key];
      if (!e) { e = exMap[key] = { name: key, sets: 0, vol: 0, pts: [], muscle: info.muscle }; }
      e.sets += ex.sets || 0;
      e.vol += ex.volumeKg || 0;
      if (ex.top && ex.top.e1rm) e.pts.push({ date: w.date, e1rm: ex.top.e1rm });
    }
  }

  // Haftalık hacim serisi (eksik hafta = 0, antrenmansız hafta gerçek bilgidir)
  var nWeeks = Math.ceil(spanDays / 7);
  var volSeries = [];
  for (var k = 0; k < nWeeks; k++) volSeries.push(Math.round(weekVol[k] || 0));

  // Son 2 hafta vs önceki 2 hafta hacim değişimi (yeterli veri varsa)
  var volTrendPct = null;
  if (volSeries.length >= 4) {
    var recent = volSeries.slice(-2).reduce(function (s, x) { return s + x; }, 0);
    var prev = volSeries.slice(-4, -2).reduce(function (s, x) { return s + x; }, 0);
    if (prev > 0) volTrendPct = Math.round((recent - prev) / prev * 100);
  }

  // e1RM eğilimi — en çok set yapılan egzersizler, ilk yarı en iyisi vs son yarı en iyisi
  var exList = Object.keys(exMap).map(function (k2) { return exMap[k2]; })
    .sort(function (a, b) { return b.sets - a.sets; });
  var strength = [];
  for (var m = 0; m < exList.length && strength.length < 5; m++) {
    var e2 = exList[m];
    if (e2.pts.length < 4) continue;
    var pts = e2.pts.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var span = hcDayDiff(pts[0].date, pts[pts.length - 1].date);
    if (span < 21) continue;                       // 3 haftadan kısa aralıkta trend okunmaz
    var half = Math.floor(pts.length / 2);
    var firstBest = Math.max.apply(null, pts.slice(0, half).map(function (p) { return p.e1rm; }));
    var lastBest = Math.max.apply(null, pts.slice(half).map(function (p) { return p.e1rm; }));
    strength.push({
      name: e2.name,
      sessions: pts.length,
      spanDays: span,
      firstE1rm: hcRound(firstBest, 1),
      lastE1rm: hcRound(lastBest, 1),
      pct: firstBest > 0 ? Math.round((lastBest - firstBest) / firstBest * 100) : null,
    });
  }

  var pushSets = byGroup.itme, pullSets = byGroup.cekme, legSets = byGroup.bacak;
  var namedSets = pushSets + pullSets + legSets + byGroup.govde;

  return {
    sessions: ws.length,
    spanDays: spanDays,
    perWeek: hcRound(ws.length / weeks, 1),
    volumeKg: Math.round(vol),
    volPerWeek: Math.round(vol / weeks),
    sets: sets,
    setsPerWeek: hcRound(sets / weeks, 1),
    avgMin: mins && ws.length ? Math.round(mins / ws.length) : null,
    byGroup: byGroup,
    pushPullRatio: pullSets > 0 ? hcRound(pushSets / pullSets, 2) : null,
    legShare: namedSets > 0 ? Math.round(legSets / namedSets * 100) : null,
    volSeries: volSeries,
    volTrendPct: volTrendPct,
    strength: strength,
    // Kas grubu ne kadar tahmine dayanıyor — güven şeffaflığı
    guessedPct: sets > 0 ? Math.round(guessedSets / sets * 100) : 0,
    lastDate: ws[ws.length - 1].date,
    topExercises: exList.slice(0, 6).map(function (e3) { return { name: e3.name, sets: e3.sets, muscle: e3.muscle }; }),
  };
}

/* ---------------- BESLENME İSTATİSTİĞİ ----------------
   KRİTİK DÜZELTME: eskiden bir öğün girilen gün de "tam gün" sayılıp
   ortalamaya giriyordu → kcal ve protein SİSTEMATİK OLARAK DÜŞÜK çıkıyordu,
   AI da buna bakıp "yetersiz besleniyorsun" diyordu. Artık kısmi gün ayrılır. */
function hcNutritionStats(dietDays, fromDate, toDate, isTrainDay, kcalGoal) {
  var full = [], partial = [], none = 0;
  // Kısmi eşiği: 2'den az öğün VEYA hedefin yarısının altı (hedef yoksa 600 kcal)
  var minKcal = kcalGoal ? Math.max(600, Math.round(kcalGoal * 0.5)) : 600;
  var mealsTotal = 0, mealsWithProtein = 0, mealsWithTime = 0;

  for (var d = fromDate; d <= toDate; d = hcShift(d, 1)) {
    var day = (dietDays || {})[d];
    var meals = (day && day.meals) || [];
    if (!meals.length) { none++; continue; }
    var kcal = 0, protein = 0, carb = 0, fat = 0, times = [];
    for (var i = 0; i < meals.length; i++) {
      var m = meals[i];
      kcal += m.kcal || 0;
      protein += m.protein || 0;
      carb += m.carb || 0;
      fat += m.fat || 0;
      mealsTotal++;
      if (m.protein != null) mealsWithProtein++;
      if (m.at) { mealsWithTime++; times.push({ at: m.at, slot: m.slot, kcal: m.kcal || 0 }); }
    }
    var rec = {
      date: d, kcal: Math.round(kcal), protein: Math.round(protein),
      carb: Math.round(carb), fat: Math.round(fat),
      waterL: (day && day.waterL) || 0, meals: meals.length, times: times,
    };
    if (meals.length < 2 || kcal < minKcal) partial.push(rec); else full.push(rec);
  }

  if (!full.length && !partial.length) return null;
  var base = full.length ? full : partial;   // hiç tam gün yoksa kısmiden konuş, ama işaretle
  var avg = function (f) { return hcAvg(base.map(f)); };

  // Antrenman günü vs dinlenme günü — AI'ın en çok işine yarayan kesit
  var gym = base.filter(function (x) { return isTrainDay(x.date); });
  var rest = base.filter(function (x) { return !isTrainDay(x.date); });
  var split = null;
  if (gym.length >= 2 && rest.length >= 2) {
    split = {
      gymDays: gym.length, restDays: rest.length,
      gymKcal: Math.round(hcAvg(gym.map(function (x) { return x.kcal; }))),
      restKcal: Math.round(hcAvg(rest.map(function (x) { return x.kcal; }))),
      gymProtein: Math.round(hcAvg(gym.map(function (x) { return x.protein; }))),
      restProtein: Math.round(hcAvg(rest.map(function (x) { return x.protein; }))),
    };
  }

  // Geç yeme: 22:00 sonrası öğün oranı (uyku ilişkisi için — saat kaydı varsa)
  var lateDays = 0, timedDays = 0;
  for (var j = 0; j < base.length; j++) {
    if (!base[j].times.length) continue;
    timedDays++;
    var late = base[j].times.some(function (t) {
      var h = parseInt(String(t.at).slice(0, 2), 10);
      return h >= 22 || h < 4;
    });
    if (late) lateDays++;
  }

  return {
    fullDays: full.length, partialDays: partial.length, missingDays: none,
    usingPartial: !full.length,
    kcal: Math.round(avg(function (x) { return x.kcal; })),
    protein: Math.round(avg(function (x) { return x.protein; })),
    carb: Math.round(avg(function (x) { return x.carb; })),
    fat: Math.round(avg(function (x) { return x.fat; })),
    waterL: hcRound(avg(function (x) { return x.waterL; }), 1),
    mealsPerDay: hcRound(avg(function (x) { return x.meals; }), 1),
    // Makro kapsaması: kcal girilip protein girilmeyen öğün ortalamayı düşürür
    proteinCoverPct: mealsTotal ? Math.round(mealsWithProtein / mealsTotal * 100) : 0,
    timeCoverPct: mealsTotal ? Math.round(mealsWithTime / mealsTotal * 100) : 0,
    lateEatDays: timedDays >= 3 ? lateDays : null,
    timedDays: timedDays,
    split: split,
  };
}

/* ---------------- KİLO EĞİLİMİ (en küçük kareler) ----------------
   Eskiden sadece "ilk kayıt / son kayıt" vardı — gürültüye açıktı.
   Regresyon eğimi haftalık gerçek değişimi verir.                   */
// Tek seri için en küçük kareler eğimi. Kilo/yağ oranı/yağsız kütle aynı
// yöntemden geçer — biyoimpedans gürültüsünde tek ölçüm değil EĞİM anlamlıdır.
function hcRegress(pts, key) {
  var v = (pts || []).filter(function (p) { return p && p[key] != null; });
  if (v.length < 4) return null;
  var span = hcDayDiff(v[0].date, v[v.length - 1].date);
  if (span < 14) return null;                    // 2 haftadan kısa seride eğim anlamsız
  var n = v.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (var i = 0; i < n; i++) {
    var x = hcDayDiff(v[0].date, v[i].date), y = v[i][key];
    sx += x; sy += y; sxy += x * y; sxx += x * x;
  }
  var den = n * sxx - sx * sx;
  if (!den) return null;
  return {
    n: n, spanDays: span,
    first: v[0][key], last: v[n - 1][key],
    firstDate: v[0].date, lastDate: v[n - 1].date,
    perWeek: hcRound((n * sxy - sx * sy) / den * 7, 2),
    total: hcRound(v[n - 1][key] - v[0][key], 1),
  };
}
// v7-122: kilo TEK BAŞINA yanıltıcı — kilo sabitken yağ düşüp kas artabilir.
// Üç seri ayrı ayrı regres edilir; eski alan adları (slopeKgPerWeek, totalChange…)
// geriye uyumluluk için korunur, yağ/yağsız kütle alt nesne olarak eklenir.
/* ---------------- KİLO DEĞİŞİMİNİN BİLEŞİMİ (v7-123) ----------------
   "Haftada +0.40 kg" tek başına iyi mi kötü mü SÖYLEMEZ: aynı sayı kas
   kazanımı da olabilir yağlanma da. Yağ kütlesi (kg) = kilo × yağ% ; yağsız
   kütle zaten kayıtlı. İkisinin eğimi kilonun eğimini paylaştırır:
       yağ payı % = (yağ kütlesi eğimi / kilo eğimi) × 100
   Bu bir ÇIKARMA işlemi — AI'a bırakılmaz. Dil modeli regresyon eğimini her
   çalıştırmada farklı hesaplar; sağlık verisinde aynı girdiden iki farklı
   sonuç çıkması kabul edilemez. Hesap burada, YORUM AI'da.                 */
function hcComposition(kgPerWeek, fatMassPerWeek, leanPerWeek) {
  if (kgPerWeek == null || fatMassPerWeek == null) return null;
  var out = {
    kgPerWeek: kgPerWeek,
    fatMassPerWeek: fatMassPerWeek,
    leanPerWeek: leanPerWeek != null ? leanPerWeek : hcRound(kgPerWeek - fatMassPerWeek, 2),
    fatSharePct: null,
    gaining: null,
    verdict: 'sabit',
  };
  // Kilo neredeyse sabitse paylaştırma anlamsız (0'a bölme + gürültü payı
  // sonucu uçurur). O durum zaten F kuralında rekompozisyon olarak ele alınır.
  if (Math.abs(kgPerWeek) < 0.05) return out;
  out.gaining = kgPerWeek > 0;
  out.fatSharePct = Math.round(fatMassPerWeek / kgPerWeek * 100);
  // Pay NEGATİF olabilir ve bu bir hata değil: kilo alırken yağ kaybetmek
  // (en iyi durum, pay < 0) ya da kilo verirken yağ kazanmak (en kötü durum,
  // yine pay < 0). Eşikler her iki ucu da doğru tarafa düşürür.
  if (out.gaining) {
    out.verdict = out.fatSharePct >= 70 ? 'yag-agirlikli'
      : (out.fatSharePct <= 40 ? 'kas-agirlikli' : 'dengeli-alim');
  } else {
    out.verdict = out.fatSharePct <= 40 ? 'kas-kaybi'
      : (out.fatSharePct >= 70 ? 'yag-kaybi' : 'dengeli-kayip');
  }
  return out;
}

function hcWeightTrend(weights, fromDate, toDate) {
  var pts = (weights || []).filter(function (w) {
    return w && w.date && w.date >= fromDate && w.date <= toDate;
  }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (!pts.length) return null;
  var kg = hcRegress(pts, 'kg'), fat = hcRegress(pts, 'fat'), lean = hcRegress(pts, 'lean');
  if (!kg && !fat) return null;
  var base = kg || fat;
  // Yağ KÜTLESİ (kg) — oran değil. Kilo eğimini paylaştırmak için gerekli.
  // Orijinal kayıtlara YAZILMAZ, kopya seri kurulur (yoksa türetilmiş alan
  // localStorage'a ve oradan buluta sızar).
  var mpts = pts.map(function (w) {
    var fm = null;
    if (w.kg != null && w.fat != null) fm = hcRound(w.kg * w.fat / 100, 2);
    else if (w.kg != null && w.lean != null) fm = hcRound(w.kg - w.lean, 2);
    return { date: w.date, fatMass: fm };
  });
  var fatMass = hcRegress(mpts, 'fatMass');
  return {
    n: base.n, spanDays: base.spanDays,
    first: kg ? kg.first : null, last: kg ? kg.last : null,
    firstDate: base.firstDate, lastDate: base.lastDate,
    slopeKgPerWeek: kg ? kg.perWeek : null,
    totalChange: kg ? kg.total : null,
    fat: fat, lean: lean,
    fatMass: fatMass,
    comp: hcComposition(kg ? kg.perWeek : null, fatMass ? fatMass.perWeek : null, lean ? lean.perWeek : null),
  };
}

/* ---------------- ENERJİ TUTARLILIK KONTROLÜ ----------------
   "Yüksek doğruluk" burada başlıyor: loglanan kalori ile GERÇEKLEŞEN kilo
   değişimi uyuşuyor mu? Uyuşmuyorsa beslenme ortalamaları güvenilmezdir ve
   AI bunu bilmek zorunda — yoksa eksik loga tam veri muamelesi yapar.
   1 kg yağ doku ≈ 7700 kcal.                                              */
// ⚠️ TEK BMR KAYNAGI (10 Agu 2026). Once burada Mifflin, nutrition.js'te
// Schofield vardi — ayni kisi icin iki farkli sayi (16 yas/70 kg'da ~160 kcal
// fark), saglik raporu ile beslenme plani celisiyordu.
// Mifflin-St Jeor 19-78 yas araliginda dogrulanmistir; ergende sapar.
// 18 alti icin Schofield (yas gruplu) kullanilir. nutrition.js bunu cagirir.
function hcBMR(sex, age, kg, cm) {
  var erkek = sex !== 'female';
  var y = Number(age) || 0, k = Number(kg) || 0, c = Number(cm) || 0;
  if (!(k > 0)) return 0;
  // Schofield agirlik-tek denklemleri. ⚠️ BANTLAR 20 Agu 2026'DA DUZELTILDI.
  // 17.686k+658.2 Schofield'in 10-18 bandidir, kodun eski yorumundaki gibi
  // "15-17" degil; 22.706k+504.3 ise 3-10 bandi. Eskiden 10-14 yasa 3-10
  // denklemi uygulaniyordu (13 yas / 60 kg'da +148 kcal, %8.6 fazla) ve
  // kadin <15 icin yazilan 17.686k+349.0 YAYINLANMIS HICBIR denkleme
  // karsilik gelmiyordu (erkek katsayisi + uydurma sabit).
  if (y > 0 && y < 18) {
    if (y >= 10) return Math.round(erkek ? 17.686 * k + 658.2 : 13.384 * k + 692.6);
    if (y >= 3) return Math.round(erkek ? 22.706 * k + 504.3 : 20.315 * k + 485.9);
    return Math.round(erkek ? 59.512 * k - 30.4 : 58.317 * k - 31.1);
  }
  return Math.round(10 * k + 6.25 * c - 5 * y + (erkek ? 5 : -161));
}

function hcEnergyCheck(avgKcal, slopeKgPerWeek, calc) {
  if (avgKcal == null || slopeKgPerWeek == null || !calc) return null;
  var kg = Number(calc.weight), cm = Number(calc.height), age = Number(calc.age);
  var act = Number(calc.activity) || 1.55;
  if (!(kg > 0 && cm > 0 && age > 0)) return null;
  var bmr = hcBMR(calc.sex, age, kg, cm);
  var tdee = Math.round(bmr * act);
  // Enerji dengesi: günlük fazla/eksik = eğim(kg/hafta) * 7700 / 7
  var dailyBalance = slopeKgPerWeek * 7700 / 7;
  var impliedBurn = Math.round(avgKcal - dailyBalance);   // loga göre gerçek harcama
  var devPct = Math.round((impliedBurn - tdee) / tdee * 100);
  var verdict, note;
  if (devPct <= -20) {
    verdict = 'eksik-log';
    note = 'Loglanan kalori, kilo değişiminin gerektirdiğinden belirgin düşük — muhtemelen bazı öğünler girilmiyor. Kalori ve protein ortalamalarını OLDUĞUNDAN DÜŞÜK kabul et, "az yiyorsun" yorumu YAPMA.';
  } else if (devPct >= 20) {
    verdict = 'fazla-log';
    note = 'Loglanan kalori, kilo değişiminin gerektirdiğinden belirgin yüksek — porsiyonlar olduğundan büyük girilmiş ya da kilo kaydı seyrek olabilir.';
  } else {
    verdict = 'tutarli';
    note = 'Loglanan kalori ile kilo değişimi tutarlı — beslenme kayıtları güvenilir.';
  }
  return { bmr: bmr, tdee: tdee, impliedBurn: impliedBurn, devPct: devPct, verdict: verdict, note: note };
}

/* ---------------- KATMANLI ANALİZ PENCERESİ ----------------
   Tek 14 gün her şeye yetmiyordu: uyku borcu 14 günlük bir olgu ama
   antrenman progresyonu ve kilo eğilimi 2-3 ay istiyor.               */
var HC_WIN = { sleep: 14, diet: 28, train: 84, weight: 84 };

// Yeni lokal kurallar (AI'sız, $0) — antrenman/beslenme/kilo tarafı.
// healthPatterns() bunları uyku kurallarıyla birleştirip ciddiyete göre sıralar.
function hcTrainingPatterns(hev, nut, wt, energy, toDate) {
  var out = [];

  // A) Haftalık hacim düşüşü — devamlılık kaybının erken sinyali
  if (hev && hev.volTrendPct != null && hev.sessions >= 8) {
    if (hev.volTrendPct <= -25) {
      out.push({ level: 'warn', text: 'Son 2 haftada antrenman hacmin %' + Math.abs(hev.volTrendPct) + ' düştü.' });
    } else if (hev.volTrendPct >= 15) {
      out.push({ level: 'good', text: 'Antrenman hacmin son 2 haftada %' + hev.volTrendPct + ' arttı.' });
    }
  }

  // B) Kas grubu dengesizliği — itme/çekme oranı ve bacak payı
  if (hev && hev.setsPerWeek >= 6) {
    // Bir taraf TAMAMEN boşsa oran hesaplanamaz (0'a bölme) — en uç dengesizlik
    // sessizce kaybolmasın diye ayrıca yakalanır.
    if (hev.byGroup.cekme === 0 && hev.byGroup.itme >= 10) {
      out.push({ level: 'warn', text: 'Hiç çekme hareketi yok — omuz sağlığı için sırt/kanat ekle.' });
    } else if (hev.byGroup.itme === 0 && hev.byGroup.cekme >= 10) {
      out.push({ level: 'warn', text: 'Hiç itme hareketi yok — göğüs/omuz dengeyi tamamlar.' });
    } else if (hev.pushPullRatio != null && hev.pushPullRatio >= 1.8) {
      out.push({ level: 'warn', text: 'İtme setlerin çekmenin ' + hev.pushPullRatio + ' katı — omuz sağlığı için çekmeyi artır.' });
    } else if (hev.pushPullRatio != null && hev.pushPullRatio <= 0.55) {
      out.push({ level: 'warn', text: 'Çekme setlerin itmenin belirgin üstünde — dengeyi gözden geçir.' });
    }
    if (hev.legShare != null && hev.legShare < 20 && hev.sessions >= 8) {
      out.push({ level: 'warn', text: 'Setlerinin sadece %' + hev.legShare + "'i bacak — en büyük kas grubu boşta." });
    }
  }

  // C) Güç durgunluğu — en çok çalıştığın hareketlerde e1RM ilerlemiyor
  if (hev && hev.strength && hev.strength.length >= 2) {
    var flat = hev.strength.filter(function (s) { return s.pct != null && s.pct <= 1; });
    var down = hev.strength.filter(function (s) { return s.pct != null && s.pct <= -5; });
    if (down.length >= 2) {
      out.push({ level: 'warn', text: down.length + ' ana hareketinde güç geriliyor — uyku ve yeterli yemek ilk bakılacak yer.' });
    } else if (flat.length >= Math.ceil(hev.strength.length * 0.7)) {
      out.push({ level: 'warn', text: hev.strength.length + ' ana hareketin ' + flat.length + "'inde " + Math.round(hev.strength[0].spanDays / 7) + ' haftadır ilerleme yok.' });
    } else {
      var up = hev.strength.filter(function (s) { return s.pct != null && s.pct >= 5; });
      if (up.length) out.push({ level: 'good', text: up[0].name + ' ' + up[0].pct + '% arttı — program çalışıyor.' });
    }
  }

  // D) Kilo–kalori çelişkisi: kayıtlar gerçeği yansıtmıyor
  if (energy && energy.verdict === 'eksik-log') {
    out.push({ level: 'warn', text: 'Öğün kayıtların eksik görünüyor — kilo değişimin loglanan kaloriyle uyuşmuyor.' });
  }

  // E) Kısmi loglama oranı yüksekse ortalamalar zaten güvenilmez
  if (nut && (nut.partialDays + nut.missingDays) > (nut.fullDays + nut.partialDays + nut.missingDays) * 0.5) {
    out.push({ level: 'warn', text: 'Günlerin yarısından fazlasında beslenme kaydı eksik — analiz zayıf kalıyor.' });
  }

  // F) REKOMPOZİSYON — kilo sabit, yağ düşüyor, yağsız kütle korunuyor.
  // Tartıya bakan biri "hiçbir şey olmuyor" sanır; asıl ilerleme tam da budur.
  if (wt && wt.fat && wt.slopeKgPerWeek != null &&
      Math.abs(wt.slopeKgPerWeek) < 0.15 && wt.fat.perWeek <= -0.1 &&
      (!wt.lean || wt.lean.perWeek >= -0.05)) {
    out.push({ level: 'good', text: 'Kilon sabit ama yağ oranın düşüyor — tartının göstermediği ilerleme bu.' });
  }

  // G) Yağsız kütle kaybı — kalori/protein/uyku tarafında bir şey eksik demektir.
  // Kayıtlar eksikse (eksik-log) sayı zaten güvenilmez, uyarı verilmez.
  if (wt && wt.lean && wt.lean.perWeek <= -0.2 && wt.lean.spanDays >= 21 &&
      !(energy && energy.verdict === 'eksik-log')) {
    out.push({ level: 'warn', text: 'Yağsız kütlen haftada ' + Math.abs(wt.lean.perWeek) + ' kg düşüyor — yeterli yiyor ve uyuyor musun, ona bak.' });
  }

  // H) SESSİZ ARIZA TESPİTİ — tartı verisi akmayı bırakmış olabilir.
  // Kısayol/senkron durduğunda hiçbir hata görünmez; haftalarca fark edilmez.
  if (wt && toDate && wt.lastDate) {
    var wGap = hcDayDiff(wt.lastDate, toDate);
    if (wGap >= 10) out.push({ level: 'warn', text: wGap + ' gündür tartım kaydı gelmiyor — otomatik aktarım durmuş olabilir.' });
  }

  // I) KİLO DEĞİŞİMİNİN BİLEŞİMİ (v7-123) — "+0.40 kg" tek başına anlamsız:
  // aynı sayı kas kazanımı da olabilir yağlanma da. Ayrım yağ KÜTLESİ eğiminden
  // gelir. Eksik-log burada susturmaz: bileşim doğrudan tartıdan ölçülür,
  // loglanan kaloriden türetilmez — yani kayıt eksikken de geçerlidir.
  var cmp = wt && wt.comp;
  if (cmp && cmp.fatSharePct != null && wt.fatMass && wt.fatMass.spanDays >= 21) {
    // G kuralı yağsız kütle kaybını zaten mutlak eşikle uyardıysa tekrarlama.
    var lw = !!(wt.lean && wt.lean.perWeek <= -0.2 && wt.lean.spanDays >= 21);
    if (cmp.verdict === 'yag-agirlikli') {
      out.push({ level: 'warn', text: 'Aldığın kilonun %' + cmp.fatSharePct + "'i yağ — kalori fazlan gereğinden büyük görünüyor." });
    } else if (cmp.verdict === 'kas-agirlikli') {
      out.push({ level: 'good', text: 'Aldığın kilonun %' + (100 - cmp.fatSharePct) + "'i yağsız kütle — kas kazanıyorsun." });
    } else if (cmp.verdict === 'kas-kaybi' && !lw) {
      out.push({ level: 'warn', text: 'Verdiğin kilonun %' + (100 - cmp.fatSharePct) + "'i yağsız kütle — protein ve uyku ilk bakılacak yer." });
    } else if (cmp.verdict === 'yag-kaybi') {
      out.push({ level: 'good', text: 'Verdiğin kilonun %' + cmp.fatSharePct + "'i yağ — yağsız kütlen korunuyor." });
    }
  }

  return out;
}

/* ---------------- FAKT ÜRETİCİ (AI'a giden metin) ----------------
   Sayısal kısmın tamamı burada üretilir → PWA ve Worker BİREBİR aynı metni verir.
   Uyku satırları dışarıdan gelir (her taraf kendi sleepDebt ikizini kullanır).   */
/* ═══════════════════════════════════════════════════════════════════
   TOPARLANMA KATMANI — ham veriyi işlenmiş sinyale çevirir (23 Ağu 2026)
   ───────────────────────────────────────────────────────────────────
   Bevel/WHOOP tarzı skorların yaptığı tek iş: ham sayıyı KİŞİSEL TABANA
   göre normalleştirmek. "74 ms HRV" iyi mi kötü mü — cevabı yok.
   "Senin 30 günlük medyanın 68, bugün 74" — cevabı var.

   Ortalama+SD DEĞİL, medyan+MAD: tek bir hasta gün ya da geç yatılan
   gece ortalamayı kaydırır, medyanı kaydırmaz. n küçükken fark büyük.

   ⚠️ TABAN OTURMADAN SKOR ÜRETİLMEZ (ready:false). İlk iki haftada
   uydurma skor göstermek hiç göstermemekten KÖTÜDÜR — kullanıcı ona
   göre karar verir ve sayı yanlıştır. Aynı ilke: sayıyı biz hesaplarız,
   AI yorumlar; hesaplanamadıysa AI'a "hesaplanamıyor" diye gider.
   ═══════════════════════════════════════════════════════════════════ */

// Olcum gurultusu tabanlari (medyanin orani). MAD tek basina yetmiyor:
// cok duzenli bir insanda MAD kucucuk cikiyor ve 2 ms'lik FIZYOLOJIK GURULTU
// z = -1.35 gibi gorunuyor — yani hicbir sey olmadigi halde skor dusuyor.
// Bir sapma en azindan olcum gurultusu kadar buyuk degilse SINYAL DEGILDIR.
// HRV gece gece %8-10 oynar, dinlenme nabzi %2-3. Taban olcek bunun altina inmez.
var HC_BASE = { win: 30, minN: 14, noise: { hrv: 0.08, rhr: 0.03, steps: 0.15, kcalOut: 0.15 }, noiseDef: 0.05 };

// Günlük yük ağırlıkları. Değerler KEYFİ ama TUTARLI: dışarı çıkan şey
// mutlak büyüklük değil kendi 28 günlük ortalamasına ORAN, birim çarpanı
// oranın içinde sadeleşiyor. Ölçek: 10 ton ≈ 10 birim, 600 aktif kcal
// ≈ 6 birim, 8000 adım ≈ 2 birim. Kuvvet günü baskın, dinlenme gününü
// adım + kalori taşır (Hevy'ye girmeyen kickboks/koşu da böyle sayılır).
var HC_LOAD_W = { vol: 0.001, kcal: 0.01, steps: 0.00025 };

// Toparlanma katsayıları tek yerde — sihirli sayı koda dağılmasın.
var HC_REC = { base: 50, hrv: 12, rhr: 8, zCap: 2, debtK: 2.5, debtCap: 8, loadK: 20, loadCap: 15, spike: 1.3 };

function hcMedian(a) {
  if (!a || !a.length) return null;
  var s = a.slice().sort(function (x, y) { return x - y; });
  var m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* Kişisel taban çizgi: son `win` günün medyanı + MAD, ve son ölçümün
   bu tabandan kaç MAD saptığı (z). 1.4826 çarpanı MAD'ı normal dağılımda
   standart sapmayla aynı ölçeğe getirir — z değerleri okunabilir kalsın diye.
   MAD 0 çıkabilir (tüm değerler aynı); o zaman sıfıra bölmemek için
   medyanın %2'si taban ölçek olarak kullanılır. */
function hcBaseline(rows, key, today, win, minN) {
  win = win || HC_BASE.win;
  minN = minN || HC_BASE.minN;
  var from = hcShift(today, -(win - 1));
  var vals = [], last = null, lastDate = null;
  (rows || []).forEach(function (r) {
    if (!r || !r.date || r.date > today || r.date < from) return;
    var v = r[key];
    if (v == null || !isFinite(v)) return;
    vals.push(v);
    if (!lastDate || r.date > lastDate) { lastDate = r.date; last = v; }
  });
  var n = vals.length;
  if (!n) return { key: key, n: 0, ready: false, median: null, mad: null, last: null, lastDate: null, z: null, dev: null, dir: 0 };
  var med = hcMedian(vals);
  var mad = hcMedian(vals.map(function (v) { return Math.abs(v - med); }));
  var noise = HC_BASE.noise[key] != null ? HC_BASE.noise[key] : HC_BASE.noiseDef;
  var floor = med > 0 ? Math.abs(med) * noise : 1;
  var scale = Math.max(mad * 1.4826, floor);
  var ready = n >= minN;
  var z = (last != null && ready) ? hcRound((last - med) / scale, 2) : null;
  return {
    key: key, n: n, ready: ready,
    median: hcRound(med, 1), mad: hcRound(mad, 2),
    last: hcRound(last, 1), lastDate: lastDate,
    z: z, dev: hcRound(last - med, 1),
    dir: z == null ? 0 : (z > 0.7 ? 1 : z < -0.7 ? -1 : 0),
  };
}

/* Günlük yük ve akut:kronik oranı (ACWR — spor biliminde bilinen ölçü).
   7 günlük ortalama / 28 günlük ortalama. 1.5 üstü ani sıçrama, 0.8 altı
   devamlılık kaybı. Kayıtsız gün 0 yük sayılır (dinlenme gerçek bilgidir),
   o yüzden payda GÜN sayısı — kayıt sayısı değil. */
function hcLoad(workouts, health, today) {
  var byDate = {}, any = false;
  (workouts || []).forEach(function (w) {
    if (!w || !w.date || w.date > today) return;
    byDate[w.date] = (byDate[w.date] || 0) + (w.volumeKg || 0) * HC_LOAD_W.vol;
    any = true;
  });
  (health || []).forEach(function (h) {
    if (!h || !h.date || h.date > today) return;
    byDate[h.date] = (byDate[h.date] || 0) + (h.kcalOut || 0) * HC_LOAD_W.kcal + (h.steps || 0) * HC_LOAD_W.steps;
    any = true;
  });
  if (!any) return { ready: false, byDate: byDate, today: null, acute: null, chronic: null, ratio: null, band: null, days: 0 };

  var winAvg = function (n) {
    var sum = 0, seen = 0;
    for (var i = 0; i < n; i++) {
      var d = hcShift(today, -i);
      if (byDate[d] != null) { sum += byDate[d]; seen++; }
    }
    return { avg: seen ? sum / n : null, seen: seen };
  };
  var a7 = winAvg(7), c28 = winAvg(28);
  var ready = c28.seen >= HC_BASE.minN;
  var ratio = (ready && c28.avg > 0) ? hcRound(a7.avg / c28.avg, 2) : null;
  return {
    ready: ready, byDate: byDate,
    today: byDate[today] != null ? hcRound(byDate[today], 1) : null,
    acute: a7.avg == null ? null : hcRound(a7.avg, 2),
    chronic: c28.avg == null ? null : hcRound(c28.avg, 2),
    ratio: ratio, days: c28.seen,
    band: ratio == null ? null
      : ratio >= 1.5 ? 'sicrama' : ratio >= HC_REC.spike ? 'yuksek' : ratio >= 0.8 ? 'normal' : 'dusuk',
  };
}

/* Toparlanma skoru — 50 tabanından başlar, dört girdi onu iter/çeker:
     + HRV kendi tabanının üstündeyse
     + dinlenme nabzı kendi tabanının ALTINDAysa (işaret ters, düşük iyidir)
     − uyku borcu
     − akut yük kronik ortalamayı aşıyorsa
   Girdilerden herhangi birinin tabanı oturmadıysa skor ÜRETİLMEZ.
   `drivers` skorun NEDEN o değer olduğunu söyler — çıplak sayı işe yaramaz. */
function hcRecovery(inp) {
  inp = inp || {};
  var hrv = inp.hrv, rhr = inp.rhr;
  var missing = [];
  if (!hrv || !hrv.ready || hrv.z == null) missing.push('HRV tabanı');
  if (!rhr || !rhr.ready || rhr.z == null) missing.push('dinlenme nabzı tabanı');
  if (missing.length) return { ready: false, missing: missing, score: null, band: null, drivers: [], need: HC_BASE.minN };

  var cap = function (z) { return Math.max(-HC_REC.zCap, Math.min(HC_REC.zCap, z)); };
  var drivers = [];
  var s = HC_REC.base;

  var zH = cap(hrv.z);
  s += zH * HC_REC.hrv;
  if (Math.abs(zH) >= 0.7) {
    drivers.push('HRV tabanının ' + (zH > 0 ? 'üstünde' : 'altında') + ' (' + hrv.last + ' ms, taban ' + hrv.median + ')');
  }

  var zR = cap(-rhr.z);
  s += zR * HC_REC.rhr;
  if (Math.abs(zR) >= 0.7) {
    drivers.push('dinlenme nabzı tabanının ' + (zR > 0 ? 'altında' : 'üstünde') + ' (' + rhr.last + ' bpm, taban ' + rhr.median + ')');
  }

  var debt = (inp.debt && inp.debt.debt != null) ? inp.debt.debt : 0;
  if (debt > 0) {
    var dp = Math.min(debt, HC_REC.debtCap) * HC_REC.debtK;
    s -= dp;
    if (dp >= 5) drivers.push('uyku borcu ' + hcRound(debt, 1) + ' saat');
  }

  var ratio = (inp.load && inp.load.ratio != null) ? inp.load.ratio : null;
  if (ratio != null && ratio > HC_REC.spike) {
    var lp = Math.min((ratio - HC_REC.spike) * HC_REC.loadK, HC_REC.loadCap);
    s -= lp;
    if (lp >= 4) drivers.push('son 7 günün yükü 28 günlük ortalamanın ' + ratio + ' katı');
  }

  var score = Math.max(0, Math.min(100, Math.round(s)));
  return {
    ready: true, missing: [], score: score, drivers: drivers, need: HC_BASE.minN,
    band: score >= 67 ? 'iyi' : score >= 34 ? 'orta' : 'dusuk',
  };
}

/* Enerji bakiyesi — tek günün fotoğrafı değil KÜMÜLATİF hesap.
   Hedefin üstünde uyku yatırır, kronik ortalamanın üstündeki yük çeker.
   Uyku borcuyla aynı felsefe: eski günler her gün %10 siliniyor, yani
   üç hafta önceki kötü gece bugünü hâlâ cezalandırmıyor. 0 = nötr. */
function hcEnergyBank(sleep, loadByDate, chronicAvg, goalH, today, days) {
  days = days || 28;
  goalH = goalH || 8;
  var byDate = {};
  (sleep || []).forEach(function (s) { if (s && s.date && s.hours != null) byDate[s.date] = s.hours; });
  if (!Object.keys(byDate).length) return { ready: false, balance: null, band: null, days: 0 };

  var DECAY = 0.9, K = 6;
  var B = 0, seen = 0;
  for (var i = days - 1; i >= 0; i--) {
    var d = hcShift(today, -i);
    var h = byDate[d];
    var ld = loadByDate ? loadByDate[d] : null;
    if (h == null && ld == null) { B = B * DECAY; continue; }
    seen++;
    var inn = h == null ? 0 : Math.max(-2, Math.min(1.5, h - goalH));
    var out = (ld != null && chronicAvg > 0) ? Math.max(-1, Math.min(1.5, ld / chronicAvg - 1)) : 0;
    B = Math.max(-100, Math.min(100, B * DECAY + inn * K - out * K));
  }
  var bal = Math.round(B);
  return {
    ready: seen >= 7, balance: bal, days: seen,
    band: bal >= 25 ? 'dolu' : bal >= -25 ? 'dengeli' : bal >= -60 ? 'azaliyor' : 'tukenmis',
  };
}

/* Toparlanma tarafının otomatik tespitleri — hcAllPatterns bunları
   uyku/alışkanlık/antrenman kurallarıyla birleştirip ciddiyete göre sıralar. */
function hcRecoveryPatterns(inp) {
  inp = inp || {};
  var out = [];
  var rec = inp.rec, load = inp.load, bank = inp.bank, rhr = inp.rhr;
  var today = inp.today;

  // A) SESSİZ ARIZA — /body'deki 10 günlük tartı kuralının ikizi.
  //    Kısayol durduğunda haftalarca fark edilmiyordu.
  var lastH = null;
  (inp.health || []).forEach(function (h) { if (h && h.date && (!lastH || h.date > lastH)) lastH = h.date; });
  if (!lastH) {
    out.push({ level: 'warn', text: 'Sağlık verisi hiç gelmemiş — Kısayol kurulu mu?' });
  } else if (hcDayDiff(lastH, today) >= 5) {
    out.push({ level: 'warn', text: hcDayDiff(lastH, today) + ' gündür sağlık verisi gelmiyor — otomatik aktarım durmuş olabilir.' });
  }

  // B) Taban oturmadı: skor yok. Bunu SÖYLEMEK skor uydurmaktan iyidir.
  if (lastH && rec && !rec.ready) {
    out.push({ level: 'good', text: 'Toparlanma skoru için taban çizgi oluşuyor (' + rec.need + ' gün veri gerekiyor) — o zamana kadar tek iş takmaya devam etmek.' });
  }

  var dusuk = !!(rec && rec.ready && rec.band === 'dusuk');

  // C) Toparlanma uçları
  if (dusuk) {
    out.push({ level: 'danger', text: 'Toparlanma ' + rec.score + '/100' + (rec.drivers.length ? ' — ' + rec.drivers[0] : '') + '. Hacmi düşür ama hareketi tamamen bırakma.' });
  } else if (rec && rec.ready && rec.band === 'iyi') {
    out.push({ level: 'good', text: 'Toparlanma ' + rec.score + '/100 — ağır seansı bugüne almak için uygun gün.' });
  }

  // D) Yük sıçraması — sakatlık riski en çok burada birikir
  if (load && load.ready && load.band === 'sicrama') {
    out.push({ level: 'warn', text: 'Son 7 günün yükü 28 günlük ortalamanın ' + load.ratio + ' katı — ani sıçrama sakatlık riskini artırır, bu hafta hacmi sabit tut.' });
  } else if (load && load.ready && load.band === 'dusuk') {
    out.push({ level: 'warn', text: 'Son 7 günün yükü ortalamanın ' + load.ratio + ' katı — devamlılık düşmüş. Ağırlık artırmak değil, sıklığı geri getirmek gerekiyor.' });
  }

  // E) Nabız tabanın üstünde takılı (C zaten söylediyse tekrarlama)
  if (!dusuk && rhr && rhr.ready && rhr.z != null && rhr.z >= 1) {
    out.push({ level: 'warn', text: 'Dinlenme nabzı tabanının üstünde (' + rhr.last + ' bpm, taban ' + rhr.median + ') — az uyku, biriken yorgunluk ya da hastalık başlangıcı.' });
  }

  // F) Bakiye eriyor
  if (bank && bank.ready && (bank.band === 'tukenmis' || bank.band === 'azaliyor')) {
    out.push({
      level: bank.band === 'tukenmis' ? 'danger' : 'warn',
      text: 'Enerji bakiyesi ' + bank.balance + ' — girenden fazlası çıkıyor. En hızlı düzeltme bir gece erken yatmak.',
    });
  }
  return out;
}

function hcBuildFacts(ctx) {
  var L = [];
  var g = ctx.goals || {};
  L.push('HEDEFLER: uyku ' + (g.sleepH || 8) + ' saat/gece · ' + (g.kcal || '-') + ' kcal · protein ' + (g.protein || '-') + ' g · su ' + (g.waterL || '-') + ' L.');
  (ctx.sleepLines || []).forEach(function (x) { if (x) L.push(x); });

  // --- Toparlanma / yuk / enerji (Fitbit hatti) ---
  var rc = ctx.recovery, ld = ctx.load, bk = ctx.bank;
  if (rc && rc.ready) {
    L.push('TOPARLANMA: ' + rc.score + '/100 (' + rc.band + ')' + (rc.drivers.length ? ' — ' + rc.drivers.join('; ') : '') + '.');
    L.push('NOT: bu skor HRV ve dinlenme nabzının KENDİ 30 günlük tabanından sapmasıyla hesaplandı, mutlak değerle değil. YENİDEN HESAPLAMA, olduğu gibi kullan. Tek günün skoru dalgalanır — üç günlük YÖNÜ yorumla.');
  } else if (rc) {
    L.push('TOPARLANMA: henüz hesaplanamıyor — ' + rc.missing.join(' + ') + ' oluşmadı (' + rc.need + ' günlük veri gerekiyor). Bu konuda sayı UYDURMA, hiç konuşma.');
  }
  if (ld && ld.ready) {
    L.push('YÜK: bugün ' + (ld.today != null ? ld.today : '-') + ' birim; son 7 gün ortalaması ' + ld.acute + ', son 28 gün ' + ld.chronic + ', oran ' + ld.ratio + ' (' + ld.band + ').');
    L.push('NOT: yük birimi kuvvet hacmi + aktif kalori + adımın toplamıdır. Mutlak sayı anlamsız, SADECE oran okunur: 0.8-1.3 normal, 1.5 üstü ani sıçrama, 0.8 altı devamlılık kaybı.');
  }
  if (bk && bk.ready) {
    L.push('ENERJİ BAKİYESİ: ' + bk.balance + ' (' + bk.band + '), ' + bk.days + ' günlük kayıttan. Hedefin üstündeki uyku yatırır, kronik ortalamanın üstündeki yük çeker; eski günler her gün %10 siliniyor. Eksideyse çözüm önce UYKU, sonra yemek — antrenmanı artırmak değil.');
  }

  // --- Antrenman ---
  var hev = ctx.hevy;
  if (hev) {
    L.push('ANTRENMAN (son ' + hev.spanDays + ' gün): ' + hev.sessions + ' seans, haftada ' + hev.perWeek +
      (hev.avgMin ? ', ortalama ' + hev.avgMin + ' dk' : '') + '. Son antrenman ' + hev.lastDate + '.');
    L.push('Haftalık hacim ' + hcRound(hev.volPerWeek / 1000, 1) + ' ton, haftada ' + hev.setsPerWeek + ' set' +
      (hev.volTrendPct != null ? '. Son 2 haftanın hacmi önceki 2 haftaya göre %' + hev.volTrendPct : '') + '.');
    var gp = hev.byGroup;
    L.push('Set dağılımı — itme ' + gp.itme + ', çekme ' + gp.cekme + ', bacak ' + gp.bacak + ', gövde ' + gp.govde + '.' +
      (hev.pushPullRatio != null ? ' İtme/çekme oranı ' + hev.pushPullRatio + ' (dengeli aralık 0.8-1.3).' : '') +
      (hev.legShare != null ? ' Bacak payı %' + hev.legShare + '.' : ''));
    if (hev.strength.length) {
      L.push('Güç eğilimi (tahmini 1RM, ilk yarı → son yarı): ' + hev.strength.map(function (s) {
        return s.name + ' ' + s.firstE1rm + ' → ' + s.lastE1rm + ' kg (%' + (s.pct > 0 ? '+' + s.pct : s.pct) + ', ' + s.sessions + ' seans/' + s.spanDays + ' gün)';
      }).join(' | '));
    } else {
      L.push('Güç eğilimi: henüz yeterli tekrar yok (aynı hareketin 3+ hafta boyunca 4+ seansı gerekir).');
    }
    L.push('En çok çalışılan: ' + hev.topExercises.map(function (e) { return e.name + ' (' + e.sets + ' set)'; }).join(', ') + '.');
    if (hev.guessedPct >= 20) L.push('NOT: kas grubu bilgisinin %' + hev.guessedPct + "'i egzersiz adından tahmin edildi, dağılım yaklaşıktır.");
  } else {
    L.push('ANTRENMAN: son ' + HC_WIN.train + ' günde kayıt yok.');
  }

  // --- Beslenme ---
  var n = ctx.nutrition;
  if (n) {
    L.push('BESLENME (son ' + HC_WIN.diet + ' gün): ' + n.fullDays + ' tam gün, ' + n.partialDays +
      ' kısmi gün (2 öğünden az ya da çok düşük kalori — ORTALAMAYA KATILMADI), ' + n.missingDays + ' gün kayıtsız.');
    L.push((n.usingPartial ? 'Kısmi günlerin' : 'Tam günlerin') + ' ortalaması: ' + n.kcal + ' kcal, protein ' + n.protein +
      ' g, karbonhidrat ' + n.carb + ' g, yağ ' + n.fat + ' g, su ' + n.waterL + ' L, günde ' + n.mealsPerDay + ' öğün.');
    if (n.proteinCoverPct < 85) {
      L.push('DİKKAT: öğünlerin sadece %' + n.proteinCoverPct + "'inde protein değeri girilmiş — gerçek protein alımı yukarıdaki sayıdan YÜKSEK. 'Protein yetersiz' yorumu yapma.");
    }
    if (n.split) {
      L.push('Antrenman günü ortalama ' + n.split.gymKcal + ' kcal / ' + n.split.gymProtein + ' g protein (' + n.split.gymDays + ' gün); dinlenme günü ' +
        n.split.restKcal + ' kcal / ' + n.split.restProtein + ' g protein (' + n.split.restDays + ' gün).');
    }
    if (n.lateEatDays != null) {
      L.push('Saat kaydı olan ' + n.timedDays + ' günün ' + n.lateEatDays + "'inde 22:00'den sonra öğün var.");
    }
  } else {
    L.push('BESLENME: kayıt yok.');
  }

  // --- Kilo + enerji tutarlılığı ---
  var wt = ctx.weight;
  if (wt && wt.slopeKgPerWeek != null) {
    L.push('KİLO (son ' + wt.spanDays + ' gün, ' + wt.n + ' tartım): ' + wt.first + ' → ' + wt.last + ' kg, toplam ' +
      (wt.totalChange > 0 ? '+' : '') + wt.totalChange + ' kg. Regresyon eğimi haftada ' +
      (wt.slopeKgPerWeek > 0 ? '+' : '') + wt.slopeKgPerWeek + ' kg.');
  } else {
    L.push('KİLO: eğim hesaplanamadı (en az 4 tartım ve 2 hafta aralık gerekir).');
  }
  if (wt && wt.fat) {
    L.push('YAĞ ORANI (' + wt.fat.n + ' ölçüm, ' + wt.fat.spanDays + ' gün): %' + wt.fat.first + ' → %' + wt.fat.last +
      ', regresyon eğimi haftada ' + (wt.fat.perWeek > 0 ? '+' : '') + wt.fat.perWeek + ' puan.' +
      (wt.lean ? ' Yağsız kütle ' + wt.lean.first + ' → ' + wt.lean.last + ' kg (haftada ' +
        (wt.lean.perWeek > 0 ? '+' : '') + wt.lean.perWeek + ' kg).' : ''));
    L.push('NOT: yağ oranı biyoimpedans tartıdan geliyor — tek ölçüm ±%3-5 sapabilir, su tutumu ve öğün saatinden etkilenir. TEK ölçümü yorumlama, sadece EĞİLİMİ yorumla.');
    L.push('Kilo ile yağ oranını BİRLİKTE oku: kilo sabit + yağ düşüyor = kas kazanımı (olumlu). Kilo düşüyor + yağ oranı sabit/artıyor = kaybın bir kısmı kastan.');
  }
  if (wt && wt.comp && wt.comp.fatSharePct != null) {
    var cp = wt.comp;
    L.push('KİLO BİLEŞİMİ (regresyonla HESAPLANDI, tahmin değil): haftalık ' + (cp.kgPerWeek > 0 ? '+' : '') + cp.kgPerWeek +
      ' kg değişimin ' + (cp.fatMassPerWeek > 0 ? '+' : '') + cp.fatMassPerWeek + ' kg yağ kütlesi, ' +
      (cp.leanPerWeek > 0 ? '+' : '') + cp.leanPerWeek + ' kg yağsız kütle. Yağ payı %' + cp.fatSharePct + '.');
    L.push('NOT: bu paylaştırma sana hazır verildi — YENİDEN HESAPLAMA, olduğu gibi kullan. Okuma kılavuzu: kilo ALIRKEN yağ payı %70 üstü ise kalori fazlası büyük, %40 altı ise kazanım ağırlıklı kas. Kilo VERİRKEN yağ payı düşükse kayıp yağsız kütleden geliyor demektir.');
  }
  var en = ctx.energy;
  if (en) {
    L.push('ENERJİ TUTARLILIĞI: hesaplanan BMR ' + en.bmr + ', TDEE ' + en.tdee + ' kcal. Loglanan alım + kilo eğimine göre gerçek harcama ≈ ' +
      en.impliedBurn + ' kcal (%' + (en.devPct > 0 ? '+' + en.devPct : en.devPct) + ' sapma). ' + en.note);
  }

  if (ctx.contextLine) L.push(ctx.contextLine);
  if (ctx.patterns && ctx.patterns.length) L.push('OTOMATİK TESPİTLER: ' + ctx.patterns.join(' | '));
  return L.join('\n');
}

/* ---------------- UYKU SATIRLARI (paylaşılan) ----------------
   Uyku BORCU her tarafta kendi ikiziyle hesaplanır (sleepDebt / sleepDebtSrv),
   ama metne dökme işi burada — böylece iki taraf birebir aynı cümleyi üretir. */
function hcSleepLines(sleepArr, goalH, debt, bandLabel) {
  var to = null, from = null;
  var all = (sleepArr || []).filter(function (s) { return s && s.date; });
  if (!all.length) return ['UYKU: kayıt yok.'];
  var dates = all.map(function (s) { return s.date; }).sort();
  to = dates[dates.length - 1];
  from = hcShift(to, -(HC_WIN.sleep - 1));
  var sl = all.filter(function (s) { return s.date >= from && s.hours != null; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (!sl.length) return ['UYKU: son ' + HC_WIN.sleep + ' günde saat kaydı yok.'];

  var L = [];
  var avg = hcAvg(sl.map(function (s) { return s.hours; }));
  var short = sl.filter(function (s) { return s.hours < goalH; }).length;
  L.push('UYKU (son ' + HC_WIN.sleep + ' gün, ' + sl.length + ' gece kayıtlı): ortalama ' + hcRound(avg, 1) + ' saat, ' + short + ' gece hedefin altında.');
  if (debt) {
    L.push('Birikmiş uyku borcu ' + debt.debt + ' saat (' + (bandLabel || '-') + '), ' + debt.nights + ' geceden hesaplandı' +
      (debt.est ? ', bunun ' + debt.est + ' gecesi kalite notundan tahmin' : '') +
      '. Bu sayı üstel ağırlıklı: eski borç günde %15 erir, fazla uyku açığı ancak yarı verimle kapatır — düz toplam değildir, yeniden hesaplama.');
  }
  // Hafta içi / hafta sonu (30 gün) — sosyal jetlag sinyali
  var wFrom = hcShift(to, -29);
  var wd = [], we = [];
  all.filter(function (s) { return s.date >= wFrom && s.hours != null; }).forEach(function (s) {
    var dow = new Date(s.date + 'T12:00:00').getDay();
    (dow === 0 || dow === 6 ? we : wd).push(s.hours);
  });
  if (wd.length >= 3 && we.length >= 2) {
    L.push('Son 30 gün — hafta içi ortalama ' + hcRound(hcAvg(wd), 1) + ' saat, hafta sonu ' + hcRound(hcAvg(we), 1) + ' saat.');
  }
  L.push('Son geceler: ' + sl.slice(-8).map(function (s) {
    return s.date + ' ' + s.hours + 'sa' + (s.bedtime ? ' (' + s.bedtime + '-' + s.wake + ')' : '') + (s.quality ? ' [' + s.quality + ']' : '');
  }).join(' | '));
  return L;
}

/* ---------------- UYKU DESENLERİ (paylaşılan) ----------------
   v7-121 öncesi bu kurallar sadece PWA'daydı; worker'ın ürettiği fakta girmiyordu
   → aynı veriden iki farklı "OTOMATİK TESPİTLER" satırı çıkıyordu. Artık tek kaynak.
   badStreak/recoveryNights dışarıdan gelir (her taraf kendi ikizini kullanır). */
function hcSleepPatterns(sleepArr, goalH, debt, bandLabel, debtLabel, recoveryNights, badStreak, isTrainDay, toDate) {
  var out = [];
  var all = (sleepArr || []).filter(function (s) { return s && s.date; });

  // 1) Ardışık kötü/az uyku
  if (badStreak >= 3) out.push({ level: 'danger', text: badStreak + ' gecedir kötü/az uyuyorsun — bugünü hafif tut.' });

  // 2) Birikmiş uyku borcu (bandına göre ciddiyet)
  if (debt && debt.nights >= 3 && debt.band !== 'clear' && badStreak < 3) {
    var lvl = (debt.band === 'severe' || debt.band === 'high') ? 'danger' : 'warn';
    var rec = recoveryNights ? ' ' + recoveryNights + ' gece erken yatmak kapatır.' : '';
    out.push({ level: lvl, text: 'Birikmiş uyku borcun ' + (debtLabel || debt.debt + ' saat') + ' (' + (bandLabel || '-') + ').' + rec });
  }

  // 3) Yatış saati savrulması — düzensizlik uykuyu süreden çok bozar
  var from7 = hcShift(toDate, -6);
  var beds = all.filter(function (s) { return s.date >= from7 && s.bedtime; }).map(function (s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(s.bedtime);
    if (!m) return null;
    var mins = +m[1] * 60 + +m[2];
    if (mins < 720) mins += 1440;         // 00:30 → gece tarafına al
    return mins;
  }).filter(function (x) { return x != null; });
  if (beds.length >= 4) {
    var spread = Math.max.apply(null, beds) - Math.min.apply(null, beds);
    if (spread >= 120) out.push({ level: 'warn', text: 'Yatış saatin ' + Math.round(spread / 60) + ' saat savruluyor — sabit saat en çok işe yarayan şey.' });
  }

  // 4) ÇAPRAZ SİNYAL: az uyuduğun günlerde antrenman düşüyor mu?
  var from14 = hcShift(toDate, -13);
  var l14 = all.filter(function (s) { return s.date >= from14 && s.hours != null; });
  if (l14.length >= 7) {
    var lo = l14.filter(function (s) { return s.hours < 7; }), hi = l14.filter(function (s) { return s.hours >= 7; });
    if (lo.length >= 3 && hi.length >= 3) {
      var loR = lo.filter(function (s) { return isTrainDay(s.date); }).length / lo.length;
      var hiR = hi.filter(function (s) { return isTrainDay(s.date); }).length / hi.length;
      if (hiR - loR >= 0.4) out.push({ level: 'warn', text: 'İyi uyuduğun günlerde antrenmana çok daha sık gidiyorsun — uyku, spor planının görünmeyen yarısı.' });
    }
  }
  return out;
}

// Antrenman boşluğu / düzeni + antrenman günü protein — eskiden sadece PWA'daydı
function hcHabitPatterns(workouts, dietDays, isTrainDay, proteinGoal, toDate) {
  var out = [];
  var ds = (workouts || []).map(function (w) { return w && w.date; }).filter(Boolean).sort();
  if (ds.length) {
    var gap = hcDayDiff(ds[ds.length - 1], toDate);
    if (gap >= 7) out.push({ level: 'warn', text: gap + ' gündür antrenman kaydı yok.' });
    else if (gap <= 1) {
      var from7 = hcShift(toDate, -6);
      var n7 = ds.filter(function (d) { return d >= from7; }).length;
      if (n7 >= 3) out.push({ level: 'good', text: 'Bu hafta ' + n7 + ' antrenman — düzen oturmuş.' });
    }
  }
  if (proteinGoal) {
    var low = 0, checked = 0;
    for (var i = 1; i <= 7 && checked < 4; i++) {
      var d = hcShift(toDate, -i);
      if (!isTrainDay(d)) continue;
      var day = (dietDays || {})[d];
      var meals = (day && day.meals) || [];
      if (!meals.length) continue;
      checked++;
      var p = 0;
      for (var k = 0; k < meals.length; k++) p += meals[k].protein || 0;
      if (p < proteinGoal * 0.7) low++;
    }
    if (checked >= 2 && low >= 2) out.push({ level: 'warn', text: 'Antrenman günlerinin ' + low + "'inde protein hedefinin altında kaldın." });
  }
  return out;
}

// Tüm desenleri tek yerde topla + ciddiyete göre sırala (danger > warn > good)
function hcAllPatterns(inp) {
  var out = []
    .concat(hcSleepPatterns(inp.sleep, inp.goalH, inp.debt, inp.bandLabel, inp.debtLabel, inp.recoveryNights, inp.badStreak, inp.isTrainDay, inp.today))
    .concat(hcHabitPatterns(inp.workouts, inp.dietDays, inp.isTrainDay, inp.proteinGoal, inp.today))
    .concat(hcTrainingPatterns(inp.hev, inp.nut, inp.wt, inp.energy, inp.today))
    .concat(hcRecoveryPatterns(inp));
  var rank = { danger: 0, warn: 1, good: 2 };
  return out.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
}

// ---------- LOKAL DESEN TESPİTİ (AI'sız, $0) ----------
// Ciddiyet: danger > warn > good. En fazla 3 satır döner.
// Tüm kurallar paylaşılan çekirdekte (hcAllPatterns) — Worker ile birebir aynı sonuç.
// Burada sadece PWA'nın kendi hesaplayıcıları toplanıp içeri verilir.
function hcInputs() {
  const t = today();
  const goalH = (typeof ensureSleepGoal === 'function' ? ensureSleepGoal().targetH : 8) || 8;
  const h = typeof ensureHevy === 'function' ? ensureHevy() : { workouts: [] };
  const all = h.workouts || [];
  const trainSet = {};
  for (let i = 0; i < all.length; i++) { if (all[i] && all[i].date) trainSet[all[i].date] = 1; }
  const isTrainDay = dt => !!trainSet[dt];
  const d = data.diet || {};
  const sd = typeof sleepDebt === 'function' ? sleepDebt() : null;
  const hev = hcHevyStats(all, hcShift(t, -(HC_WIN.train - 1)), t, h.muscles || null);
  const nut = hcNutritionStats(d.days || {}, hcShift(t, -(HC_WIN.diet - 1)), t, isTrainDay, d.kcalGoal);
  const wt = hcWeightTrend(d.weights || [], hcShift(t, -(HC_WIN.weight - 1)), t);
  const en = hcEnergyCheck(nut && !nut.usingPartial ? nut.kcal : null, wt ? wt.slopeKgPerWeek : null, d.calc);
  // Toparlanma katmani: taban cizgiler -> yuk -> skor -> bakiye (sira bagimli)
  const health = data.health || [];
  const hrvB = hcBaseline(health, 'hrv', t);
  const rhrB = hcBaseline(health, 'rhr', t);
  const load = hcLoad(all, health, t);
  const rec = hcRecovery({ hrv: hrvB, rhr: rhrB, debt: sd, load });
  const bank = hcEnergyBank(data.sleep || [], load.byDate, load.chronic, goalH, t);
  return {
    today: t, goalH, sleep: data.sleep || [], debt: sd,
    bandLabel: sd ? SLEEP_BAND_LABEL[sd.band] : null,
    debtLabel: sd ? fmtSleepHours(sd.debt) : null,
    recoveryNights: sd ? sd.recoveryNights : null,
    badStreak: typeof badSleepStreak === 'function' ? badSleepStreak() : 0,
    isTrainDay, workouts: all, dietDays: d.days || {}, proteinGoal: d.proteinGoal || 0,
    hev, nut, wt, energy: en,
    health, hrv: hrvB, rhr: rhrB, load, rec, bank,
  };
}

function healthPatterns() {
  try { return hcAllPatterns(hcInputs()).slice(0, 3); }
  catch (e) { return []; }   // şerit hiçbir koşulda çökmemeli
}

// ---------- AI'A GİDECEK ÖZET (sayılar burada hesaplanır) ----------
function buildHealthFacts(days) {
  const I = hcInputs();
  const d = data.diet || {};
  const doneWeek = (data.tasks || []).filter(x => x.done && x.doneDate && x.doneDate >= shiftDateStr(I.today, -6)).length;
  const pomo = (data.pomoToday || {}).count || 0;
  return hcBuildFacts({
    goals: { sleepH: I.goalH, kcal: d.kcalGoal, protein: d.proteinGoal, waterL: d.waterGoalL },
    sleepLines: hcSleepLines(I.sleep, I.goalH, I.debt, I.bandLabel),
    hevy: I.hev, nutrition: I.nut, weight: I.wt, energy: I.energy,
    recovery: I.rec, load: I.load, bank: I.bank,
    contextLine: `BAĞLAM: son 7 günde ${doneWeek} görev tamamlandı, bugün ${pomo} odak seansı. Kullanıcı 16 yaşında, ADHD (sakin/dalgın tip), lise öğrencisi.`,
    patterns: hcAllPatterns(I).slice(0, 5).map(p => p.text),
  });
}

// Veri var mı? (yoksa AI çağırmanın anlamı yok)
function hasHealthData() {
  const s = typeof sleepSeries === 'function' ? sleepSeries(14).filter(x => x.hours != null).length : 0;
  const w = typeof hevyWorkoutsIn === 'function' ? hevyWorkoutsIn(14).length : 0;
  let n = 0;
  for (let i = 0; i < 14; i++) if (nutritionOn(shiftDateStr(today(), -i))) n++;
  return (s + w + n) >= 3;
}

// ---------- ŞERİT (Diyet sekmesi üstü) ----------
function renderHealthCoach() {
  const el = document.getElementById('healthCoachStrip');
  if (!el) return;
  ensureCoach();
  const pats = healthPatterns();
  const hasRep = !!data.coach.lastText;

  if (!pats.length && !hasRep) {
    if (!hasHealthData()) { el.innerHTML = ''; return; }   // veri yoksa gürültü yapma
    el.innerHTML = `<button class="hcoach-cta" onclick="runHealthCoach()">
      <span class="hcoach-cta-title">Aidan uyku · spor · beslenmeni birlikte incelesin</span>
      <span class="hcoach-cta-sub">Neyi değiştirmek en çok işe yarar, onu söyler</span>
    </button>`;
    return;
  }
  const rows = pats.map(p =>
    `<span class="hpat ${p.level}"><span class="hpat-dot"></span>${escapeHtml(p.text)}</span>`).join('');
  el.innerHTML = `<div class="hcoach">
    ${rows ? `<div class="hpat-row">${rows}</div>` : ''}
    <div class="hcoach-actions">
      <button class="hcoach-btn" onclick="runHealthCoach()">Analiz et</button>
      ${hasRep ? '<button class="hcoach-btn ghost" onclick="openCoachReport()">Son rapor</button>' : ''}
    </div>
  </div>`;
}

async function runHealthCoach() {
  ensureCoach();
  if (!hasHealthData()) {
    showToast('Analiz için birkaç günlük uyku/antrenman/öğün kaydı lazım.', 'info');
    return;
  }
  openCoachReport(null, true);
  try {
    const token = await getSupaToken();
    if (!token) { openCoachReport('Analiz için giriş gerekli — Ayarlar\'dan Supabase\'e gir.'); return; }
    const r = await fetch(HEALTH_COACH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ facts: buildHealthFacts(14), instructions: aiInstructions() })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.comment) {
      openCoachReport('Analiz alınamadı: ' + (j.error || ('HTTP ' + r.status)) + '\n\nBirazdan tekrar dene.');
      return;
    }
    data.coach.lastText = j.comment;
    data.coach.lastRunAt = Date.now();
    data.coach.reports = data.coach.reports.concat([{ at: Date.now(), text: j.comment }]).slice(-12);
    save();
    openCoachReport(j.comment);
    renderHealthCoach();
  } catch (e) {
    openCoachReport('Bağlantı hatası: ' + (e && e.message ? e.message : e));
  }
}

function openCoachReport(text, loading) {
  ensureCoach();
  const m = document.getElementById('coachReportModal');
  const body = document.getElementById('coachReportBody');
  const meta = document.getElementById('coachReportMeta');
  if (!m || !body) return;
  const t = (text != null) ? text : (data.coach.lastText || 'Henüz analiz yok.');
  body.innerHTML = loading
    ? '<div class="coach-loading">Aidan verilerine bakıyor…</div>'
    : String(t).split('\n').filter(l => l.trim()).map(l => `<p>${escapeHtml(l)}</p>`).join('');
  if (meta) meta.textContent = (!loading && data.coach.lastRunAt)
    ? 'Son analiz: ' + new Date(data.coach.lastRunAt).toLocaleString('tr-TR') : '';
  m.classList.add('active');
}
function closeCoachReport() {
  const m = document.getElementById('coachReportModal');
  if (m) m.classList.remove('active');
}
