// ============================================================================
// BESLENME PLANLAYICI (10 Agu 2026)
//
// ⚠️ KAPSAM SINIRI — BU MOTORUN EN ONEMLI KARARI:
// Bu bir KILO VERME araci DEGILDIR ve olamaz. Kullanici 16 yasinda, buyume
// doneminde ve haftada 6 gun antrenman yapiyor. Bu profilde asil risk AZ
// YEMEKtir. Motor yalnizca iki hedef tanir: 'koru' ve 'kas' (yagsiz kazanim).
// Kalori acigi, siklet dusurme, vucut yag orani hedefi YOK — arayuzde secenek
// olarak bile bulunmuyor ve `nutTargets` BMR'nin altina ASLA inmez.
// Siklet dusurmek gerekiyorsa bu antrenor + diyetisyen isidir.
//
// AI cagrisi YOK — motor tamamen kural tabanli ve deterministik.
// Bilimsel dayanaklar: ANTRENMAN-BILIMI.md (Beslenme bolumu).
// ============================================================================

const NUT_LIMITS = {
  proteinPerKg: 1.8,        // koru — sporcu araligi 1.6-2.2 g/kg
  proteinPerKgGain: 2.0,    // kas kazanimi
  proteinMaxPerKg: 2.5,     // ustune cikmanin ek faydasi gosterilmemis
  proteinPerMealMin: 0.25,  // g/kg — ogun basi kas protein sentezi esigi
  proteinPerMealMax: 0.40,  // ustu ayni ogunde ek fayda vermiyor
  fatMinPerKg: 0.8,         // hormonal saglik tabani — ALTINA INILMEZ
  fatPct: 0.27,             // kcal'in yuzdesi (taban kuralini gecerse o kazanir)
  gainSurplus: 350,         // yagsiz kazanim; buyuk fazla yag olarak birikir
  waterMlPerKg: 35,
  waterPerSession: 600,     // ml, antrenman basina ek
};

// Gun tipine gore fiziksel aktivite katsayisi (PAL).
// Tek bir "aktivite seviyesi" sormak yerine PROGRAMDAN turetiliyor —
// antrenman gunu ile dinlenme gunu ayni kalori DEGILDIR.
const NUT_PAL = { rest: 1.4, strength: 1.6, fight: 1.75, both: 1.9 };

const NUT_DAY_LABEL = {
  rest: 'Dinlenme günü', strength: 'Ağırlık günü',
  fight: 'Dövüş günü', both: 'Ağırlık + dövüş',
};

/**
 * Bazal metabolizma — ⚠️ KENDI FORMULU YOK, paylasilan cekirdegi cagirir.
 * `hcBMR` ui.js ve worker.js'te byte-byte ozdes durur; saglik raporu ile
 * beslenme plani AYNI sayiyi kullansin diye tek kaynak orasi.
 * (Once burada Schofield, hcEnergyCheck'te Mifflin vardi — celisiyorlardi.)
 */
function nutBMR(sex, age, kg, cm) {
  if (typeof hcBMR !== 'function') return 0;   // cekirdek yuklenmeden cagrilmaz
  return hcBMR(sex, age, kg, cm);
}

/** Antrenman programindan o gunun tipini cikar. */
function nutDayType(dow, program) {
  const p = program || (typeof data !== 'undefined' ? data.program : null);
  if (!p || !Array.isArray(p.days)) return 'rest';
  const gun = p.days.filter(d => d && d.dow === dow);
  const guc = gun.some(d => d.type === 'strength');
  const dovus = gun.some(d => d.type === 'fight') ||
    (Array.isArray(p.fightDays) && p.fightDays.indexOf(dow) >= 0);
  if (guc && dovus) return 'both';
  if (dovus) return 'fight';
  if (guc) return 'strength';
  return 'rest';
}

/**
 * Gunluk enerji ve makro hedefi.
 * ⚠️ Kilo verme dali YOK. Hedef yalnizca 'koru' ya da 'kas'.
 */
function nutTargets(profil, dayType, hedef) {
  const kg = Number(profil && profil.weight) || 0;
  const cm = Number(profil && profil.height) || 0;
  const age = Number(profil && profil.age) || 16;
  const sex = (profil && profil.sex) || 'male';
  if (!(kg > 0)) return null;

  const bmr = nutBMR(sex, age, kg, cm);
  const pal = NUT_PAL[dayType] || NUT_PAL.rest;
  const tdee = Math.round(bmr * pal);
  const kas = hedef === 'kas';
  let kcal = tdee + (kas ? NUT_LIMITS.gainSurplus : 0);

  // 🔒 GUVENLIK TABANI: hedef hicbir kosulda BMR'nin altina inemez.
  kcal = Math.max(kcal, bmr);

  const proteinG = Math.min(
    Math.round(kg * (kas ? NUT_LIMITS.proteinPerKgGain : NUT_LIMITS.proteinPerKg)),
    Math.round(kg * NUT_LIMITS.proteinMaxPerKg));
  // Yag: yuzde kurali ile taban kuralindan BUYUK olani kazanir.
  const fatG = Math.max(
    Math.round(kg * NUT_LIMITS.fatMinPerKg),
    Math.round(kcal * NUT_LIMITS.fatPct / 9));
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  const seans = dayType === 'both' ? 2 : (dayType === 'rest' ? 0 : 1);
  const suMl = Math.round(kg * NUT_LIMITS.waterMlPerKg + seans * NUT_LIMITS.waterPerSession);

  return {
    dayType, hedef: kas ? 'kas' : 'koru',
    bmr, pal, tdee, kcal,
    protein: proteinG, carb: carbG, fat: fatG,
    carbPerKg: Math.round((carbG / kg) * 10) / 10,
    proteinPerKg: Math.round((proteinG / kg) * 10) / 10,
    waterL: Math.round(suMl / 100) / 10,
  };
}

/**
 * Gunluk hedefi ogunlere bol.
 * ⚠️ Protein EŞIT dagitilir — toplam kadar DAGILIM da onemli. Ogun basina
 * 0.25-0.40 g/kg araligi kas protein sentezini maksimuma cikarir; gunun
 * tamamini tek ogune yigmak ayni sonucu vermez.
 */
function nutMealSplit(t, kg) {
  if (!t) return [];
  const oran = { kahvalti: 0.25, ogle: 0.30, aksam: 0.30, atistirma: 0.15 };
  const sira = ['kahvalti', 'ogle', 'aksam', 'atistirma'];
  // ⚠️ Gunluk protein hedefi ogun basi tavana KIRPILMAZ — kirpilirsa
  // 4 x tavan < gunluk hedef olur ve toplam tutmaz. Tavan bir REHBERDIR:
  // ogun basi 0.25-0.40 g/kg araligi verimin en yuksek oldugu bant.
  const ogunProtein = Math.round(t.protein / sira.length);
  const idealAlt = Math.round(kg * NUT_LIMITS.proteinPerMealMin);
  const idealUst = Math.round(kg * NUT_LIMITS.proteinPerMealMax);
  return sira.map(slot => ({
    slot,
    kcal: Math.round(t.kcal * oran[slot]),
    protein: ogunProtein,
    bantIci: ogunProtein >= idealAlt && ogunProtein <= idealUst,
    carb: Math.round(t.carb * oran[slot]),
    fat: Math.round(t.fat * oran[slot]),
  }));
}

/**
 * KARBONHIDRAT ZAMANLAMASI.
 * ⚠️ "Anabolik pencere" abartilidir — protein alimi icin saatlerce sure var.
 * Karbonhidratta ise zamanlama GERCEKTEN onemli: glikojen deposu bir sonraki
 * seansin yakitidir, ozellikle gun icinde iki antrenman varsa.
 */
function nutCarbTiming(dayType) {
  if (dayType === 'rest') {
    return ['Dinlenme günü — zamanlama serbest. Protein günün geneline yayılsın, ' +
      'karbonhidratı öğünlere dengeli dağıt.'];
  }
  const out = [
    'Antrenmandan 1-3 saat önce: karbonhidrat ağırlıklı bir öğün + protein. ' +
      'Yağı düşük tut, mide rahat olsun.',
    'Antrenmandan sonra 1-2 saat içinde: protein + karbonhidrat. ' +
      '“30 dakika penceresi” abartıdır ama aynı gün ikinci antrenman varsa erken ye.',
  ];
  if (dayType === 'both' || dayType === 'fight') {
    out.push('Dövüş antrenmanı yüksek yoğunluklu — o gün karbonhidratı kısma. ' +
      'Yorgunluk hissinin en sık sebebi az karbonhidrattır, az protein değil.');
  }
  return out;
}

// ---------------------------------------------------------------------------
// ORNEK GUN — Turk yemeklerinden, TURK_FOODS uzerinden olceklenir.
// Sablon: her ogunde bir PROTEIN capasi + bir KARBONHIDRAT capasi + sabit ekler.
// Capalar hedefi tutturacak sekilde porsiyon olceklenir (0.5 adimlarla).
// ⚠️ Referans verilen her besin adinin TURK_FOODS'ta bulunmasi teste baglidir.
const NUT_TEMPLATES = {
  kahvalti: [
    { protein: 'Yumurta', carb: 'Tam buğday ekmek', ek: ['Beyaz peynir', 'Zeytin', 'Domates'] },
    { protein: 'Süzme yoğurt', carb: 'Yulaf ezmesi', ek: ['Muz', 'Ceviz', 'Bal'] },
  ],
  ogle: [
    { protein: 'Tavuk göğsü', carb: 'Bulgur pilavı', ek: ['Çoban salata', 'Ayran'] },
    { protein: 'Ton balığı', carb: 'Makarna', ek: ['Çoban salata', 'Zeytinyağı'] },
  ],
  aksam: [
    { protein: 'Dana kıyma', carb: 'Pilav', ek: ['Çoban salata', 'Yoğurt'] },
    { protein: 'Somon', carb: 'Haşlanmış patates', ek: ['Çoban salata', 'Zeytinyağı'] },
  ],
  // ⚠️ Capa PROTEIN YOGUN olmali. Kefir (6 g/bardak) capa yapilinca motor
  // hedefi tutturmak icin "4 bardak kefir" yaziyordu — teknik olarak dogru,
  // pratikte sacma. Capa g/porsiyon degeri yuksek olandan secilir.
  atistirma: [
    { protein: 'Süzme yoğurt', carb: 'Muz', ek: ['Badem'] },
    { protein: 'Protein tozu', carb: 'Elma', ek: ['Fındık', 'Süt'] },
  ],
};

/**
 * Porsiyon metni. Birim zaten sayi iceriyorsa ("5 adet", "10 adet", "2 yarım")
 * bir daha sayi yazma — "1 5 adet Zeytin" gibi bozuk metin cikiyordu.
 */
function nutPortion(adet, birim) {
  const sayiliBirim = /^\d/.test(String(birim));
  if (sayiliBirim) return adet === 1 ? String(birim) : (adet + ' \u00d7 ' + birim);
  return adet + ' ' + birim;
}

/**
 * Porsiyon yuvarlama. 'adet' birimli besin (yumurta, muz, ekmek dilimi)
 * yarim olmaz — tam sayiya yuvarlanir. Digerleri 0.5 adiminda kalir.
 */
function nutRound(adet, birim) {
  const tam = /adet|dilim|kase|bardak|kutu|kaşık|olcek|ölçek/i.test(String(birim));
  return tam ? Math.max(1, Math.round(adet)) : Math.max(0.5, Math.round(adet * 2) / 2);
}

function nutFood(ad) {
  if (typeof TURK_FOODS === 'undefined') return null;
  return TURK_FOODS.find(f => f.n === ad) || null;
}

/** Bir ogunu hedefe gore olcekle. Deterministik: sablon indeksi gunden turetilir. */
function nutBuildMeal(slot, hedefOgun, sablonIdx) {
  const list = NUT_TEMPLATES[slot] || [];
  if (!list.length) return null;
  const t = list[(Number(sablonIdx) || 0) % list.length];
  const pf = nutFood(t.protein), cf = nutFood(t.carb);
  if (!pf || !cf) return null;

  const ekler = (t.ek || []).map(nutFood).filter(Boolean)
    .map(f => ({ n: f.n, u: f.u, adet: 1, k: f.k, p: f.p, c: f.c, f: f.f }));
  const ekK = ekler.reduce((a, x) => a + x.k, 0);
  const ekP = ekler.reduce((a, x) => a + x.p, 0);

  // Protein capasi: kalan protein hedefini karsila (0.5 porsiyon adimlarla, 1-6 arasi)
  // ⚠️ Alt sinir 0.5 porsiyon: tavuk gogsu 47 g protein tasiyor, "en az 1
  // porsiyon" kurali hedefi tek basina %50 asiyordu (126 g hedefe 189 g cikti).
  const gerekP = Math.max(0, hedefOgun.protein - ekP);
  let pAdet = pf.p > 0 ? nutRound(gerekP / pf.p, pf.u) : 1;
  pAdet = Math.max(pf.u === 'porsiyon' ? 0.5 : 1, Math.min(4, pAdet));

  // Karbonhidrat capasi: kalan kaloriyi doldur
  const kalanK = Math.max(0, hedefOgun.kcal - ekK - pAdet * pf.k);
  let cAdet = cf.k > 0 ? nutRound(kalanK / cf.k, cf.u) : 1;
  cAdet = Math.max(cf.u === 'porsiyon' ? 0.5 : 1, Math.min(4, cAdet));

  const kalemler = [
    { n: pf.n, u: pf.u, adet: pAdet, k: pf.k, p: pf.p, c: pf.c, f: pf.f },
    { n: cf.n, u: cf.u, adet: cAdet, k: cf.k, p: cf.p, c: cf.c, f: cf.f },
  ].concat(ekler);

  const topla = (alan) => Math.round(kalemler.reduce((a, x) => a + x.adet * x[alan], 0));
  return {
    slot,
    items: kalemler,
    kcal: topla('k'), protein: topla('p'), carb: topla('c'), fat: topla('f'),
  };
}

/**
 * Gun toplamini hedefe yaklastir.
 * ⚠️ Turk mutfaginda karbonhidrat kaynaklari da protein tasiyor (bulgur 5 g,
 * pilav 4 g, ekmek 3 g/porsiyon). Ogun ogun hesap tutuyor ama GUN TOPLAMI
 * hedefi asiyordu (126 g hedefe 168 g). Bu gecis, protein capalarini
 * kucultup toplami banda cekiyor. Zararli degil ama plan tutarsiz gorunuyordu.
 */
function nutBalanceDay(meals, t) {
  const toplamP = () => meals.reduce((a, m) => a + m.protein, 0);
  for (let tur = 0; tur < 20; tur++) {
    if (toplamP() <= t.protein * 1.1) break;
    // En cok protein tasiyan ogunun CAPASINI (ilk kalem) kucult
    const aday = meals.slice().sort((a, b) => b.protein - a.protein)
      .find(m => m.items[0] && m.items[0].adet > 0.5);
    if (!aday) break;
    // Azaltirken de birim kurali gecerli — 1.5 yumurta olmaz.
    const c0 = aday.items[0];
    const adim = /adet|dilim|kase|bardak|kutu/i.test(c0.u) ? 1 : 0.5;
    if (c0.adet - adim < (adim === 1 ? 1 : 0.5)) break;
    c0.adet = nutRound(c0.adet - adim, c0.u);
    const topla = (alan) => Math.round(aday.items.reduce((a, x) => a + x.adet * x[alan], 0));
    aday.kcal = topla('k'); aday.protein = topla('p');
    aday.carb = topla('c'); aday.fat = topla('f');
  }

  // ⚠️ Protein capasi kuculunce KALORI de dustu (3034 hedefe 2692 cikti).
  // Acigi KARBONHIDRAT capasindan kapat — proteini tekrar bozmadan.
  const toplamK = () => meals.reduce((a, m) => a + m.kcal, 0);
  for (let tur = 0; tur < 20; tur++) {
    const acik = t.kcal - toplamK();
    if (acik <= t.kcal * 0.05) break;
    const aday = meals.slice().sort((a, b) => a.kcal - b.kcal)
      .find(m => m.items[1] && m.items[1].adet < 5);
    if (!aday) break;
    const c = aday.items[1];
    c.adet = nutRound(c.adet + (/adet|dilim|kase|bardak/i.test(c.u) ? 1 : 0.5), c.u);
    const topla = (alan) => Math.round(aday.items.reduce((a, x) => a + x.adet * x[alan], 0));
    aday.kcal = topla('k'); aday.protein = topla('p');
    aday.carb = topla('c'); aday.fat = topla('f');
  }
  return meals;
}

function nutBuildDay(t, kg, sablonIdx) {
  const ogunler = nutMealSplit(t, kg);
  const meals = ogunler.map(o => nutBuildMeal(o.slot, o, sablonIdx)).filter(Boolean);
  return nutBalanceDay(meals, t);
}

/** Haftanin 7 gunu icin hedef ozeti — gun tipleri programdan gelir. */
function nutWeek(profil, hedef, program) {
  const out = [];
  for (let dow = 1; dow <= 7; dow++) {
    const d = dow % 7;   // 1..6, sonra 0 (Pazar)
    const tip = nutDayType(d, program);
    out.push({ dow: d, tip, hedef: nutTargets(profil, tip, hedef) });
  }
  return out;
}

// ---------------------------------------------------------------------------
function ensureNutrition() {
  ensureDiet();
  if (!data.diet.nut || typeof data.diet.nut !== 'object') {
    data.diet.nut = { hedef: 'koru', sablon: 0, kurulduAt: null };
  }
  return data.diet.nut;
}

function nutProfile() {
  ensureDiet();
  const c = data.diet.calc;
  if (!c || !(c.weight > 0)) return null;
  return { sex: c.sex || 'male', age: Number(c.age) || 16, height: Number(c.height) || 0, weight: Number(c.weight) || 0 };
}

function setNutGoal(h) {
  const n = ensureNutrition();
  n.hedef = h === 'kas' ? 'kas' : 'koru';   // ⚠️ ucuncu secenek YOK
  save();
  renderNutrition();
}

function nutNextTemplate() {
  const n = ensureNutrition();
  n.sablon = (Number(n.sablon) || 0) + 1;
  save();
  renderNutrition();
}

function renderNutrition() {
  const el = document.getElementById('nutSection');
  if (!el) return;
  const n = ensureNutrition();
  const prof = nutProfile();

  if (!prof) {
    el.innerHTML = '<div class="nut-wrap nut-empty">' +
      '<div class="nut-head"><h3>Beslenme planı</h3></div>' +
      '<p class="nut-lead">Önce aşağıdaki hesaplayıcıya yaş, boy ve kilonu gir — ' +
      'plan senin verinden hesaplanır, tahmin edilmez.</p></div>';
    return;
  }

  const bugun = new Date().getDay();
  const tip = nutDayType(bugun, data.program);
  const t = nutTargets(prof, tip, n.hedef);
  if (!t) { el.innerHTML = ''; return; }

  const ogunler = nutBuildDay(t, prof.weight, n.sablon);
  const gercek = ogunler.reduce((a, m) => ({
    kcal: a.kcal + m.kcal, protein: a.protein + m.protein,
  }), { kcal: 0, protein: 0 });

  const ogunHtml = ogunler.map(m =>
    '<div class="nut-meal"><div class="nm-head"><span>' + escapeHtml(MEAL_SLOTS[m.slot] || m.slot) + '</span>' +
    '<b>' + m.kcal + ' kcal · ' + m.protein + 'g P</b></div>' +
    '<div class="nm-list">' + m.items.map(x =>
      '<div class="nm-item"><span>' + escapeHtml(x.n) + '</span>' +
      '<span class="nm-qty">' + escapeHtml(nutPortion(x.adet, x.u)) + '</span></div>'
    ).join('') + '</div></div>').join('');

  const hafta = nutWeek(prof, n.hedef, data.program).map(g =>
    '<span class="nut-day' + (g.dow === bugun ? ' on' : '') + '">' +
    escapeHtml((typeof programDayLabel === 'function' ? programDayLabel(g.dow) : String(g.dow)).slice(0, 3)) +
    ' <b>' + (g.hedef ? g.hedef.kcal : '—') + '</b></span>').join('');

  el.innerHTML = '<div class="nut-wrap">' +
    '<div class="nut-head"><h3>Beslenme planı</h3>' +
    '<span class="nut-badge">' + escapeHtml(NUT_DAY_LABEL[tip] || '') + '</span></div>' +

    '<div class="nut-targets">' +
    '<div class="nt-cell"><b>' + t.kcal + '</b><span>kcal</span></div>' +
    '<div class="nt-cell"><b>' + t.protein + 'g</b><span>protein</span></div>' +
    '<div class="nt-cell"><b>' + t.carb + 'g</b><span>karbonhidrat</span></div>' +
    '<div class="nt-cell"><b>' + t.fat + 'g</b><span>yağ</span></div>' +
    '<div class="nt-cell"><b>' + t.waterL + 'L</b><span>su</span></div>' +
    '</div>' +
    '<div class="nut-sub">BMR ' + t.bmr + ' · bugünkü harcama ~' + t.tdee +
    ' (aktivite ×' + t.pal + ') · protein ' + t.proteinPerKg + ' g/kg · karb ' + t.carbPerKg + ' g/kg</div>' +

    '<div class="nut-goal">' +
    '<button class="nut-chip' + (n.hedef === 'koru' ? ' on' : '') + '" onclick="setNutGoal(\'koru\')">Kiloyu koru</button>' +
    '<button class="nut-chip' + (n.hedef === 'kas' ? ' on' : '') + '" onclick="setNutGoal(\'kas\')">Kas kazan</button>' +
    '</div>' +

    '<div class="nut-week">' + hafta + '</div>' +

    nutAiHtml(n) +

    '<details class="nut-timing"><summary>Karbonhidrat zamanlaması</summary>' +
    nutCarbTiming(tip).map(x => '<div class="nt-row">' + escapeHtml(x) + '</div>').join('') +
    '</details>' +

    '<div class="nut-sample-head">Örnek gün <button class="nut-mini" onclick="nutNextTemplate()">Başka öner</button></div>' +
    '<div class="nut-meals">' + ogunHtml + '</div>' +
    '<div class="nut-sub">Örnek toplam: ' + gercek.kcal + ' kcal · ' + gercek.protein + 'g protein. ' +
    'Bu bir şablon — sevmediğini benzer makrolu başka yiyecekle değiştir.</div>' +

    '<div class="nut-disc">Bu plan yaşına, kilona ve antrenman programına göre hesaplanmış bir ' +
    '<b>başlangıç noktasıdır</b>; diyetisyen değildir. Kilo verme / sıklet düşürme planı ' +
    'üretmez — 16 yaşında, büyüme döneminde ve haftada 6 gün antrenman yaparken asıl risk ' +
    'az yemektir. Sıklet için hocan ve bir diyetisyenle konuş.</div>' +
    '</div>';
}

// ============================================================================
// AI BESLENME YAZICI (12 Agu 2026)
//
// 🔴 MIMARI KARAR — AI HEDEFI BELIRLEMEZ, HEDEFI DOLDURUR.
// Sayilari (kcal / protein / karb / yag / su) yukaridaki kural tabanli motor
// hesaplar; AI yalnizca "bu hedefi Turk mutfagindan, senin sevdiklerinle nasil
// doldururum" sorusunu cevaplar. Portfoy yorumu ve teknik analiz kalibinin
// aynisi: SAYIYI PWA HESAPLAR, AI UYDURMAZ.
//
// 🔒 VE ASIL KORUMA — DONEN PLAN KORU KORUNE KAYDEDILMEZ.
// Serbest metin kutusuna "zayiflamak istiyorum" yazilabilir; prompt bunu
// yasakliyor ama prompt bir RICADIR, garanti degil. `nutAiValidate` donen
// planin HER gununu hedefle karsilastirir. BMR'nin altinda ya da gunluk
// hedefin %15 altinda kalan tek bir gun bile varsa PLANIN TAMAMI reddedilir
// ve HIC kaydedilmez — sebebi kullaniciya yazilir. Bu kapi promptun degil
// kodun icinde oldugu icin modelin ne dedigine bagli degildir.
// ============================================================================

const NUT_AI_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/diet-plan';
const NUT_AI_REQ_MAX = 500;      // istek metni tavani (~150 token)
const NUT_AI_FLOOR = 0.85;       // hedefin bu oraninin altinda kalan gun = gizli kalori acigi
const NUT_AI_PROTEIN_MIN = 0.70; // altinda REDDETMEZ, uyarir — protein eksigi tehlikeli degil
const NUT_AI_MAX_ITEMS = 12;     // ogun basina kalem tavani (depolama sismesin)

function nutDowLabel(dow) {
  if (typeof programDayLabel === 'function') return programDayLabel(dow);
  return ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][Number(dow) % 7] || '';
}

/** AI'a gonderilecek fakt paketi — hedefler PWA'da hesaplanmis halde gider. */
function nutAiFacts() {
  const prof = nutProfile();
  if (!prof) return null;
  const n = ensureNutrition();
  const prog = (typeof data !== 'undefined' && data) ? data.program : null;
  const hedefler = nutWeek(prof, n.hedef, prog).filter(g => g.hedef).map(g => ({
    dow: g.dow, tip: g.tip, etiket: NUT_DAY_LABEL[g.tip] || '',
    kcal: g.hedef.kcal, protein: g.hedef.protein, carb: g.hedef.carb,
    fat: g.hedef.fat, bmr: g.hedef.bmr, suL: g.hedef.waterL,
  }));
  if (!hedefler.length) return null;
  return {
    hedef: n.hedef,
    profil: { age: prof.age, weight: prof.weight, height: prof.height, sex: prof.sex },
    hedefler,
  };
}

/**
 * 🔒 GUVENLIK KAPISI. Donen plani hedeflerle karsilastirir.
 * Tek bir gun bile duserse `ok:false` — kismi kayit YOK, cunku "6 gunu dogru
 * 1 gunu ac birakan" bir plan tam da engellemek istedigimiz seydir.
 */
function nutAiValidate(plan, hedefler) {
  const out = { ok: false, gunler: [], red: [], uyari: [] };
  const gunler = (plan && Array.isArray(plan.gunler)) ? plan.gunler : [];
  if (!gunler.length) { out.red.push('AI okunabilir bir plan döndürmedi.'); return out; }

  const hMap = {};
  (hedefler || []).forEach(h => { if (h && isFinite(Number(h.dow))) hMap[Number(h.dow)] = h; });

  gunler.forEach(g => {
    const dow = Number(g && g.dow);
    const h = hMap[dow];
    if (!h) { out.red.push('Plan tanınmayan bir gün içeriyor.'); return; }
    const ham = Array.isArray(g.ogunler) ? g.ogunler : [];
    if (!ham.length) { out.red.push(nutDowLabel(dow) + ': hiç öğün yok.'); return; }

    let kcal = 0, protein = 0, bozuk = false;
    ham.forEach(o => {
      const k = Number(o && o.kcal), p = Number(o && o.protein);
      if (!isFinite(k) || !isFinite(p) || k < 0 || p < 0) { bozuk = true; return; }
      kcal += k; protein += p;
    });
    if (bozuk || !(kcal > 0)) { out.red.push(nutDowLabel(dow) + ': sayılar okunamadı.'); return; }
    kcal = Math.round(kcal); protein = Math.round(protein);

    // ⚠️ Iki ayri kapi. BMR tabani mutlak (bazal metabolizmanin altinda gun
    // olamaz); %15 tabani ise gizli acik yakalar — hedef 3000'ken 2400 yazmak
    // teknik olarak "az" degil, kalori acigidir.
    if (kcal < h.bmr) {
      out.red.push(nutDowLabel(dow) + ': ' + kcal + ' kcal — bazal metabolizmanın (' + h.bmr + ') altında.');
      return;
    }
    if (kcal < Math.round(h.kcal * NUT_AI_FLOOR)) {
      out.red.push(nutDowLabel(dow) + ': ' + kcal + ' kcal — hedef ' + h.kcal + ', bu bir kalori açığı.');
      return;
    }
    if (protein < Math.round(h.protein * NUT_AI_PROTEIN_MIN)) {
      out.uyari.push(nutDowLabel(dow) + ': protein ' + protein + 'g, hedef ' + h.protein + 'g — düşük.');
    }

    out.gunler.push({
      dow, tip: h.tip, kcal, protein,
      hedefKcal: h.kcal, hedefProtein: h.protein,
      ogunler: ham.slice(0, 8).map(o => ({
        ad: String((o && o.ad) || '').slice(0, 60),
        saat: String((o && o.saat) || '').slice(0, 6),
        kcal: Math.round(Number(o && o.kcal) || 0),
        protein: Math.round(Number(o && o.protein) || 0),
        kalemler: (Array.isArray(o && o.kalemler) ? o.kalemler : [])
          .slice(0, NUT_AI_MAX_ITEMS).map(x => String(x).slice(0, 90)),
      })),
    });
  });

  out.ok = out.gunler.length > 0 && out.red.length === 0;
  return out;
}

async function nutAiWrite() {
  const el = document.getElementById('nutAiReq');
  const istek = String((el && el.value) || '').trim().slice(0, NUT_AI_REQ_MAX);
  const facts = nutAiFacts();
  if (!facts) {
    showToast('Önce yaş, boy ve kilonu gir — plan senin verinden hesaplanır.', 'warning', 5000);
    return;
  }
  const btn = document.getElementById('nutAiBtn');
  const eski = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Yazılıyor…'; }
  try {
    const token = await getSupaToken();
    if (!token) { showToast('Giriş gerekli — Ayarlar\'dan bulut girişi yap.', 'warning'); return; }
    const r = await fetch(NUT_AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        istek, hedef: facts.hedef, profil: facts.profil, hedefler: facts.hedefler,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { showToast(j.error || ('Plan yazılamadı (' + r.status + ')'), 'error', 6000); return; }

    const v = nutAiValidate(j.plan, facts.hedefler);
    const n = ensureNutrition();
    if (!v.ok) {
      // 🔒 Reddedilen plan KAYDEDILMEZ — eskisi de silinmez, oldugu gibi kalir.
      n.aiRed = { at: Date.now(), istek, sebep: v.red.slice(0, 5) };
      save(); renderNutrition();
      showToast('Plan reddedildi: hedefin altında kalıyor. Kaydedilmedi.', 'error', 7000);
      return;
    }
    n.ai = {
      istek, at: Date.now(), hedefTipi: facts.hedef,
      gunler: v.gunler, uyari: v.uyari,
      notlar: (j.plan && Array.isArray(j.plan.notlar) ? j.plan.notlar : [])
        .slice(0, 5).map(s => String(s).slice(0, 240)),
    };
    n.aiRed = null;
    save(); renderNutrition();
    showToast('Beslenme programın yazıldı.', 'success');
  } catch (e) {
    showToast('Bağlantı hatası: ' + e.message, 'error', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = eski || 'Aidan yazsın'; }
  }
}

function nutAiClear() {
  const n = ensureNutrition();
  n.ai = null; n.aiRed = null;
  save();
  renderNutrition();
}

function nutAiHtml(n) {
  const ai = n && n.ai;
  const red = n && n.aiRed;
  const bugun = new Date().getDay();

  let h = '<div class="nut-ai">' +
    '<div class="nut-sample-head">Sana özel program' +
    (ai ? '<button class="nut-mini" onclick="nutAiClear()">Sil</button>' : '') +
    '</div>' +
    '<textarea id="nutAiReq" class="nut-ai-req" rows="2" maxlength="' + NUT_AI_REQ_MAX + '" ' +
    'placeholder="Sevmediklerin, bütçen, okul saatlerin, yemek yapabilme durumun…">' +
    escapeHtml((ai && ai.istek) || (red && red.istek) || '') + '</textarea>' +
    '<div class="nut-ai-row">' +
    '<button id="nutAiBtn" class="nut-chip on" onclick="nutAiWrite()">' +
    (ai ? 'Yeniden yaz' : 'Aidan yazsın') + '</button>' +
    '<span class="nut-ai-hint">Kalori ve makro hedefini yukarıdaki motor hesaplar; ' +
    'AI sadece o hedefi doldurur.</span></div>';

  if (red && Array.isArray(red.sebep) && red.sebep.length) {
    h += '<div class="nut-ai-red"><b>Son plan reddedildi — kaydedilmedi.</b>' +
      red.sebep.map(s => '<div>' + escapeHtml(s) + '</div>').join('') +
      '<div class="nut-ai-sub">Hedefin altında kalan bir gün kaydedilmez. ' +
      'Bu araç kilo verme / sıklet düşürme planı üretmez.</div></div>';
  }

  if (ai && Array.isArray(ai.gunler) && ai.gunler.length) {
    h += '<div class="nut-ai-days">' + ai.gunler.map(g =>
      '<details class="nut-ai-day"' + (Number(g.dow) === bugun ? ' open' : '') + '>' +
      '<summary><span>' + escapeHtml(nutDowLabel(g.dow)) + '</span>' +
      '<b>' + g.kcal + ' kcal · ' + g.protein + 'g P</b>' +
      '<i>hedef ' + g.hedefKcal + ' · ' + g.hedefProtein + 'g</i></summary>' +
      (g.ogunler || []).map(o =>
        '<div class="nut-meal"><div class="nm-head"><span>' + escapeHtml(o.ad) +
        (o.saat ? ' · ' + escapeHtml(o.saat) : '') + '</span>' +
        '<b>' + o.kcal + ' kcal · ' + o.protein + 'g P</b></div>' +
        '<div class="nm-list">' + (o.kalemler || []).map(x =>
          '<div class="nm-item"><span>' + escapeHtml(x) + '</span></div>').join('') +
        '</div></div>').join('') +
      '</details>').join('') + '</div>';

    if (Array.isArray(ai.uyari) && ai.uyari.length) {
      h += '<div class="nut-ai-warn">' + ai.uyari.map(s =>
        '<div>' + escapeHtml(s) + '</div>').join('') + '</div>';
    }
    if (Array.isArray(ai.notlar) && ai.notlar.length) {
      h += '<div class="nut-ai-notes">' + ai.notlar.map(s =>
        '<div class="nt-row">' + escapeHtml(s) + '</div>').join('') + '</div>';
    }
    h += '<div class="nut-ai-sub">Her günü hedefinle karşılaştırıp öyle kaydettim — ' +
      'hedefin altında kalan bir plan buraya hiç düşmez.</div>';
  }

  return h + '</div>';
}
