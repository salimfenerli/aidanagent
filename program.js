/* ============================================================
   ANTRENMAN PROGRAMI — kural tabanli uretec + haftalik progresyon
   ============================================================
   NEDEN AYRI DOSYA: ui.js zaten 279 KB. Bu ozellik kendi icinde kapali
   (kutuphane + motor + render), disaridan sadece `renderProgram()` ve
   `openProgramSetup()` cagriliyor. Ileride tembel yuklemeye en uygun parca.

   TASARIM ILKESI (Aidan genelinde ayni): SAYIYI PWA HESAPLAR, AI UYDURMAZ.
   Split secimi, haftalik set dagilimi, baslangic agirliklari ve progresyon
   TAMAMEN kural tabanlidir — deterministik, $0, teste baglanabilir.

   ⚠️ 16 YAS GUVENLIK SINIRLARI (gevsetilmemeli, PROGRAM_LIMITS'te kilitli):
     - 1RM denemesi ASLA onerilmez. Agirliklar e1RM TAHMININDEN turetilir.
     - Kas grubu basina haftalik set tavani var (asiri hacim = sakatlik).
     - Ust uste 6+ agir gun kurulmaz; dovus gunleri de "agir" sayilir.
     - Agir bacak gunu, dovus gununun ertesine ya da oncesine konmaz.
     - Sakatlik/agri girilen bolge ELENIR — "calismaya devam et" denmez.
     - Kilo verme / kalori kisitlamasi ile birlestirilmez (mevcut kural).
   ============================================================ */

// ---------- Sabitler ----------

const PROGRAM_LIMITS = {
  maxSetsPerMuscleWeek: 20,   // ust tavan — uzerine cikilmaz
  maxHardDaysWeek: 6,         // guc + dovus toplami
  maxStrengthDays: 5,
  maxExercisesPerSession: 7,
  minRestDays: 1,
  deloadAfterStallWeeks: 2,   // 2 hafta ilerleme yoksa hafifletme haftasi
  deloadVolumeFactor: 0.6,
};

/**
 * PATLAYICI IS SINIRLARI — hacimle degil TEMAS (ground contact) ile olculur.
 *
 * Neden ayri butce: plyometrik is hipertrofi uyarani degil, sinir sistemi isidir.
 * Kas basina 20 set tavaniyla yonetilemez — 5 tekrarlik derinlik sicramasi ile
 * 5 tekrarlik leg extension ayni 'set' degildir. Olcu birimi yere temas sayisi.
 *
 * ⚠️ KICKBOKS ZATEN PLYOMETRIK IS. Ip atlama, adim calismasi, tekme — hepsi
 * temas uretir. Dovus gunu butceden DUSULUR; yoksa motor 'haftada 3 gun sicrama'
 * yazar, cocuk zaten 3 gun kickboks yapiyordur ve toplam yuk iki katina cikar.
 * fightEquiv bir TAHMINDIR (literatur degeri degil) — muhafazakar secildi.
 */
const PLYO_LIMITS = {
  maxContactsSession: 60,     // tek seansta yuksek siddetli temas tavani
  maxContactsWeek: 180,       // haftalik toplam (dovus gunleri DAHIL)
  fightEquiv: 40,             // 1 dovus antrenmani ~ bu kadar temas sayilir (tahmin)
  maxPowerPerSession: 2,      // seans basina en fazla 2 patlayici hareket
  teachWeeks: 2,              // ilk 2 hafta TEKNIK: dusuk tekrar, yuk/yukseklik yok
  advancedFromWeek: 9,        // sok yuklemesi (derinlik sicramasi) bundan once ACILMAZ
  dropPctDeload: 5,           // olculen cikti %5 duserse yorgunluk sinyali
};

// Hedefe gore tekrar araligi / hacim / dinlenme / artis adimi
const PROGRAM_GOALS = {
  kas:  { ad: 'Kas kütlesi',   repMin: 8,  repMax: 12, setsLow: 12, setsHigh: 18, restSec: 90,  stepPct: 2.5 },
  guc:  { ad: 'Güç',           repMin: 4,  repMax: 6,  setsLow: 10, setsHigh: 15, restSec: 180, stepPct: 2.5 },
  form: { ad: 'Genel form',    repMin: 10, repMax: 15, setsLow: 9,  setsHigh: 14, restSec: 60,  stepPct: 2.5 },
  daya: { ad: 'Dayanıklılık',  repMin: 15, repMax: 20, setsLow: 8,  setsHigh: 12, restSec: 45,  stepPct: 1.25 },
  // ⚠️ Atletik hedef DIGERLERINDEN FARKLI CALISIR (9 Agu 2026).
  // Maksimal kuvvet (guc) ile patlayicilik ayni sey DEGIL: guc, kuvvet-hiz
  // egrisinin agir ucudur; patlayicilik ortasindadir (%30-60 1RM, maksimum HIZ).
  // Bu hedef secilince seansin BASINA patlayici blok girer ve hacim degil
  // TEMAS BUTCESI ile yonetilir (bkz. PLYO_LIMITS).
  atletik: { ad: 'Atletik güç / patlayıcılık', repMin: 3, repMax: 6, setsLow: 8, setsHigh: 14, restSec: 180, stepPct: 2.5, athletic: true },
};

const PROGRAM_MUSCLES = {
  chest: 'Göğüs', back: 'Sırt', quads: 'Ön bacak', hams: 'Arka bacak',
  glutes: 'Kalça', shoulders: 'Omuz', biceps: 'Biseps', triceps: 'Triseps',
  core: 'Karın/Core', calves: 'Baldır', neck: 'Boyun',
};

// ---------- Egzersiz kutuphanesi ----------
// places: gym (salon) · home (dambil/lastik/barfiks) · bw (sadece vucut agirligi)
// en: Hevy'deki Ingilizce ad — gecmis veriyle eslestirmek icin (baslangic
//     agirligi buradan okunur, uydurulmaz).
const PROGRAM_EXERCISES = [
  // --- Gogus ---
  { id: 'bench',     tr: 'Bench Press',              en: 'Bench Press (Barbell)',      muscle: 'chest', pattern: 'push_h', compound: true,  places: ['gym'] },
  { id: 'dbbench',   tr: 'Dambıl Bench Press',       en: 'Bench Press (Dumbbell)',     muscle: 'chest', pattern: 'push_h', compound: true,  places: ['gym', 'home'] },
  { id: 'incline',   tr: 'Eğimli Dambıl Press',      en: 'Incline Bench Press (Dumbbell)', muscle: 'chest', pattern: 'push_h', compound: true, places: ['gym', 'home'] },
  { id: 'dip',       tr: 'Dips (Paralel)',           en: 'Chest Dip',                  muscle: 'chest', pattern: 'push_h', compound: true,  places: ['gym', 'home', 'bw'] },
  { id: 'pushup',    tr: 'Şınav',                    en: 'Push Up',                    muscle: 'chest', pattern: 'push_h', compound: true,  places: ['gym', 'home', 'bw'] },
  { id: 'fly',       tr: 'Dambıl Fly',               en: 'Chest Fly (Dumbbell)',       muscle: 'chest', pattern: 'iso',    compound: false, places: ['gym', 'home'] },
  { id: 'cablefly',  tr: 'Kablo Fly',                en: 'Cable Fly Crossovers',       muscle: 'chest', pattern: 'iso',    compound: false, places: ['gym'] },

  // --- Sirt ---
  { id: 'pullup',    tr: 'Barfiks',                  en: 'Pull Up',                    muscle: 'back', pattern: 'pull_v', compound: true,  places: ['gym', 'home', 'bw'] },
  { id: 'chinup',    tr: 'Ters Barfiks (Chin-up)',   en: 'Chin Up',                    muscle: 'back', pattern: 'pull_v', compound: true,  places: ['gym', 'home', 'bw'] },
  { id: 'latpull',   tr: 'Lat Pulldown',             en: 'Lat Pulldown (Cable)',       muscle: 'back', pattern: 'pull_v', compound: true,  places: ['gym'] },
  { id: 'bbrow',     tr: 'Barbell Row',              en: 'Bent Over Row (Barbell)',    muscle: 'back', pattern: 'pull_h', compound: true,  places: ['gym'] },
  { id: 'dbrow',     tr: 'Tek Kol Dambıl Row',       en: 'Bent Over Row (Dumbbell)',   muscle: 'back', pattern: 'pull_h', compound: true,  places: ['gym', 'home'] },
  { id: 'seatedrow', tr: 'Oturarak Kablo Row',       en: 'Seated Cable Row',           muscle: 'back', pattern: 'pull_h', compound: true,  places: ['gym'] },
  { id: 'invrow',    tr: 'Ters Şınav (Masa Altı)',   en: 'Inverted Row',               muscle: 'back', pattern: 'pull_h', compound: true,  places: ['home', 'bw'] },
  { id: 'facepull',  tr: 'Face Pull',                en: 'Face Pull',                  muscle: 'back', pattern: 'iso',    compound: false, places: ['gym', 'home'] },

  // --- Omuz ---
  { id: 'ohp',       tr: 'Omuz Press (Barbell)',     en: 'Overhead Press (Barbell)',   muscle: 'shoulders', pattern: 'push_v', compound: true,  places: ['gym'] },
  { id: 'dbohp',     tr: 'Dambıl Omuz Press',        en: 'Shoulder Press (Dumbbell)',  muscle: 'shoulders', pattern: 'push_v', compound: true,  places: ['gym', 'home'] },
  { id: 'pikepush',  tr: 'Pike Şınav',               en: 'Pike Pushup',                muscle: 'shoulders', pattern: 'push_v', compound: true,  places: ['home', 'bw'] },
  { id: 'lateral',   tr: 'Yan Kaldırış',             en: 'Lateral Raise (Dumbbell)',   muscle: 'shoulders', pattern: 'iso',    compound: false, places: ['gym', 'home'] },
  { id: 'reardelt',  tr: 'Arka Omuz (Reverse Fly)',  en: 'Rear Delt Reverse Fly (Dumbbell)', muscle: 'shoulders', pattern: 'iso', compound: false, places: ['gym', 'home'] },

  // --- On bacak ---
  { id: 'squat',     tr: 'Squat (Barbell)',          en: 'Squat (Barbell)',            muscle: 'quads', pattern: 'squat', compound: true,  places: ['gym'] },
  { id: 'gobsquat',  tr: 'Goblet Squat',             en: 'Goblet Squat',               muscle: 'quads', pattern: 'squat', compound: true,  places: ['gym', 'home'] },
  { id: 'legpress',  tr: 'Leg Press',                en: 'Leg Press (Machine)',        muscle: 'quads', pattern: 'squat', compound: true,  places: ['gym'] },
  { id: 'bulgarian', tr: 'Bulgar Split Squat',       en: 'Bulgarian Split Squat',      muscle: 'quads', pattern: 'lunge', compound: true,  places: ['gym', 'home', 'bw'] },
  { id: 'lunge',     tr: 'Lunge',                    en: 'Lunge (Dumbbell)',           muscle: 'quads', pattern: 'lunge', compound: true,  places: ['gym', 'home', 'bw'] },
  { id: 'bwsquat',   tr: 'Vücut Ağırlığı Squat',     en: 'Squat (Bodyweight)',         muscle: 'quads', pattern: 'squat', compound: true,  places: ['home', 'bw'] },
  { id: 'legext',    tr: 'Leg Extension',            en: 'Leg Extension (Machine)',    muscle: 'quads', pattern: 'iso',   compound: false, places: ['gym'] },

  // --- Arka bacak / kalca ---
  { id: 'rdl',       tr: 'Romen Deadlift',           en: 'Romanian Deadlift (Barbell)', muscle: 'hams', pattern: 'hinge', compound: true,  places: ['gym'] },
  { id: 'dbrdl',     tr: 'Dambıl Romen Deadlift',    en: 'Romanian Deadlift (Dumbbell)', muscle: 'hams', pattern: 'hinge', compound: true, places: ['gym', 'home'] },
  { id: 'hipthrust', tr: 'Hip Thrust',               en: 'Hip Thrust (Barbell)',       muscle: 'glutes', pattern: 'hinge', compound: true,  places: ['gym', 'home'] },
  { id: 'legcurl',   tr: 'Leg Curl',                 en: 'Seated Leg Curl (Machine)',  muscle: 'hams', pattern: 'iso',   compound: false, places: ['gym'] },
  { id: 'nordic',    tr: 'Nordic Curl (Yardımlı)',   en: 'Nordic Hamstring Curl',      muscle: 'hams', pattern: 'iso',   compound: false, places: ['home', 'bw'] },
  { id: 'glutebr',   tr: 'Glute Bridge',             en: 'Glute Bridge',               muscle: 'glutes', pattern: 'hinge', compound: false, places: ['home', 'bw'] },

  // --- Kol ---
  { id: 'curl',      tr: 'Dambıl Curl',              en: 'Bicep Curl (Dumbbell)',      muscle: 'biceps', pattern: 'iso', compound: false, places: ['gym', 'home'] },
  { id: 'hammer',    tr: 'Hammer Curl',              en: 'Hammer Curl (Dumbbell)',     muscle: 'biceps', pattern: 'iso', compound: false, places: ['gym', 'home'] },
  { id: 'pushdown',  tr: 'Triceps Pushdown',         en: 'Triceps Pushdown',           muscle: 'triceps', pattern: 'iso', compound: false, places: ['gym'] },
  { id: 'skull',     tr: 'Skull Crusher',            en: 'Skullcrusher (Dumbbell)',    muscle: 'triceps', pattern: 'iso', compound: false, places: ['gym', 'home'] },
  { id: 'closepush', tr: 'Dar Tutuş Şınav',          en: 'Close Grip Push Up',         muscle: 'triceps', pattern: 'iso', compound: false, places: ['home', 'bw'] },

  // --- Core (dovus icin degerli) ---
  { id: 'plank',     tr: 'Plank',                    en: 'Plank',                      muscle: 'core', pattern: 'core', compound: false, places: ['gym', 'home', 'bw'], sure: true },
  { id: 'hollow',    tr: 'Hollow Hold',              en: 'Hollow Hold',                muscle: 'core', pattern: 'core', compound: false, places: ['gym', 'home', 'bw'], sure: true },
  { id: 'legraise',  tr: 'Bacak Kaldırış',           en: 'Hanging Leg Raise',          muscle: 'core', pattern: 'core', compound: false, places: ['gym', 'home', 'bw'] },
  { id: 'palloff',   tr: 'Pallof Press',             en: 'Pallof Press',               muscle: 'core', pattern: 'core', compound: false, places: ['gym', 'home'] },
  { id: 'deadbug',   tr: 'Dead Bug',                 en: 'Dead Bug',                   muscle: 'core', pattern: 'core', compound: false, places: ['gym', 'home', 'bw'] },

  // --- Baldir ---
  { id: 'calfraise', tr: 'Baldır Kaldırış',          en: 'Standing Calf Raise',        muscle: 'calves', pattern: 'iso', compound: false, places: ['gym', 'home', 'bw'] },

  // ============ PATLAYICI KATMAN (9 Agu 2026) ============
  // Ek alanlar: explosive · contact (tekrar basina yere temas) · metric (ilerleme
  // NEYLE olculur) · pRep (kendi tekrar araligi — hedefin 3-6'si her harekete uymaz)
  // · level (1 temel · 2 orta · 3 sok yuklemesi, hafta 9'dan once acilmaz).
  // ⚠️ metric 'cm'/'m' olanlarda ilerleme AGIRLIKLA OLCULMEZ. Hevy bu sayiyi
  // vermez; kullanici elle olcer. Olcum yoksa program agirlik UYDURMAZ.

  // --- Rotasyonel guc: vurus gucunun kaynagi ---
  // Bacaktan gelen kuvvet govde donusuyle aktarilir. Havuzdaki Pallof press
  // ANTI-rotasyondur (donuse direnc); donus URETEN tek is bunlar.
  { id: 'mbrot',     tr: 'Sağlık Topu Rotasyonel Atış', en: 'Medicine Ball Rotational Throw', muscle: 'core', pattern: 'rot',   compound: true,  places: ['gym', 'home'], explosive: true, contact: 0, metric: 'm',  pRep: [4, 6],   level: 1 },
  { id: 'mbscoop',   tr: 'Sağlık Topu Kürek Atışı',     en: 'Medicine Ball Scoop Toss',       muscle: 'core', pattern: 'rot',   compound: true,  places: ['gym', 'home'], explosive: true, contact: 0, metric: 'm',  pRep: [4, 6],   level: 1 },
  { id: 'mbslam',    tr: 'Sağlık Topu Yere Vuruş',      en: 'Medicine Ball Slam',             muscle: 'core', pattern: 'rot',   compound: true,  places: ['gym', 'home'], explosive: true, contact: 0, metric: 'kg', pRep: [5, 8],   level: 1 },

  // --- Ust govde patlayiciligi ---
  { id: 'mbchest',   tr: 'Sağlık Topu Göğüs Atışı',     en: 'Medicine Ball Chest Pass',       muscle: 'chest',     pattern: 'power', compound: true, places: ['gym', 'home'], explosive: true, contact: 0, metric: 'm',  pRep: [4, 6], level: 1 },
  { id: 'plyopush',  tr: 'Patlayıcı Şınav',             en: 'Plyometric Push Up',             muscle: 'chest',     pattern: 'power', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 1, metric: 'reps', pRep: [3, 5], level: 2 },
  { id: 'pushpress', tr: 'Push Press',                  en: 'Push Press (Barbell)',           muscle: 'shoulders', pattern: 'power', compound: true, places: ['gym'], explosive: true, contact: 0, metric: 'kg', pRep: [3, 5], level: 2 },
  { id: 'hangclean', tr: 'Hang Power Clean',            en: 'Hang Power Clean',               muscle: 'back',      pattern: 'power', compound: true, places: ['gym'], explosive: true, contact: 0, metric: 'kg', pRep: [3, 5], level: 2 },
  { id: 'kbswing',   tr: 'Kettlebell Swing',            en: 'Kettlebell Swing',               muscle: 'glutes',    pattern: 'power', compound: true, places: ['gym', 'home'], explosive: true, contact: 0, metric: 'kg', pRep: [8, 12], level: 1 },

  // --- Alt govde plyometrik (TEMAS URETIR) ---
  { id: 'pogo',      tr: 'Ayak Bileği Sıçraması',       en: 'Pogo Hops',                      muscle: 'calves', pattern: 'plyo', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 1, metric: 'reps', pRep: [10, 15], level: 1 },
  { id: 'cmj',       tr: 'Dikey Sıçrama',               en: 'Countermovement Jump',           muscle: 'quads',  pattern: 'plyo', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 1, metric: 'cm', pRep: [3, 5],   level: 1 },
  { id: 'boxjump',   tr: 'Kutu Sıçraması',              en: 'Box Jump',                       muscle: 'quads',  pattern: 'plyo', compound: true, places: ['gym', 'home'],       explosive: true, contact: 1, metric: 'cm', pRep: [3, 5],   level: 1 },
  { id: 'broadjump', tr: 'Uzun Atlama',                 en: 'Broad Jump',                     muscle: 'quads',  pattern: 'plyo', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 1, metric: 'm',  pRep: [3, 5],   level: 1 },
  { id: 'splitjump', tr: 'Makas Sıçrama',               en: 'Split Squat Jump',               muscle: 'quads',  pattern: 'plyo', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 2, metric: 'reps', pRep: [4, 6],  level: 2 },
  { id: 'bound',     tr: 'Tek Bacak Sıçrama (Bound)',   en: 'Single Leg Bound',               muscle: 'hams',   pattern: 'plyo', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 2, metric: 'm',  pRep: [3, 5],   level: 2 },
  { id: 'depthjump', tr: 'Derinlik Sıçraması',          en: 'Depth Jump',                     muscle: 'quads',  pattern: 'plyo', compound: true, places: ['gym'],               explosive: true, contact: 1, metric: 'cm', pRep: [3, 5],   level: 3 },

  // --- Boyun: dovus sporunda kafa hizlanmasini azaltir ---
  // Otomatik programda YALNIZ izometrik. Harness/koprü level 2, teknik ister.
  { id: 'neckiso',   tr: 'Boyun İzometrik (4 yön)',     en: 'Neck Isometric Hold',            muscle: 'neck', pattern: 'neck', compound: false, places: ['gym', 'home', 'bw'], sure: true, metric: 'reps', level: 1 },
  { id: 'neckharn',  tr: 'Boyun Harness',               en: 'Neck Harness Extension',         muscle: 'neck', pattern: 'neck', compound: false, places: ['gym'], metric: 'kg', level: 2 },
  { id: 'farmer',    tr: 'Farmer Carry',                en: "Farmers Walk",                   muscle: 'core', pattern: 'carry', compound: true, places: ['gym', 'home'], sure: true, metric: 'kg', level: 1 },
];

// Bolunmedeki her gunun hangi kaliplari isteyecegi
// focus: 'iso'/'core' gibi serbest kaliplar bu kas gruplariyla SINIRLANIR.
// Yoksa bacak gununde yan kaldiris, itme gununde baldir cikiyordu.
const UST = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
const ALT = ['quads', 'hams', 'glutes', 'calves', 'core'];

const PROGRAM_SPLITS = {
  fullbody: [
    { ad: 'Full Body A', patterns: ['squat', 'push_h', 'pull_v', 'hinge', 'core'] },
    { ad: 'Full Body B', patterns: ['hinge', 'push_v', 'pull_h', 'lunge', 'core'] },
    { ad: 'Full Body C', patterns: ['squat', 'push_h', 'pull_h', 'iso', 'core'] },
  ],
  upperlower: [
    { ad: 'Üst Vücut A', patterns: ['push_h', 'pull_v', 'push_v', 'pull_h', 'iso'], focus: UST },
    { ad: 'Alt Vücut A', patterns: ['squat', 'hinge', 'lunge', 'iso', 'core'], focus: ALT, agirBacak: true },
    { ad: 'Üst Vücut B', patterns: ['push_v', 'pull_h', 'push_h', 'pull_v', 'iso'], focus: UST },
    { ad: 'Alt Vücut B', patterns: ['hinge', 'squat', 'lunge', 'iso', 'core'], focus: ALT, agirBacak: true },
  ],
  ppl: [
    { ad: 'İtme', patterns: ['push_h', 'push_v', 'push_h', 'iso', 'iso'], focus: ['chest', 'shoulders', 'triceps'] },
    { ad: 'Çekme', patterns: ['pull_v', 'pull_h', 'pull_h', 'iso', 'iso'], focus: ['back', 'biceps'] },
    { ad: 'Bacak', patterns: ['squat', 'hinge', 'lunge', 'iso', 'core'], focus: ALT, agirBacak: true },
  ],
};

// ---------- Veri kabi ----------

function ensureProgram() {
  if (!data.program || typeof data.program !== 'object') data.program = null;
  return data.program;
}

// ---------- Yardimcilar ----------

// Kullanilabilir egzersizler: ortam + sakatlik filtresi
function programExercisePool(places, avoidMuscles) {
  const yerler = Array.isArray(places) && places.length ? places : ['home'];
  const kacin = new Set(avoidMuscles || []);
  return PROGRAM_EXERCISES.filter(e =>
    e.places.some(p => yerler.includes(p)) && !kacin.has(e.muscle));
}

/**
 * Hevy gecmisinden bir egzersizin baslangic agirligini oku.
 * ⚠️ 1RM DENEMESI YOK: e1RM tahmininden hedef tekrar araligina geri hesaplanir
 * (Epley tersi), sonra %90 ile guvenli tarafa cekilir. Veri yoksa `null` doner
 * ve programda "kendine gore ayarla" yazar — UYDURULMUS AGIRLIK YAZILMAZ.
 */
function programStartWeight(exercise, repTarget, workouts) {
  const ws = Array.isArray(workouts) ? workouts : [];
  let best = 0;
  for (const w of ws) {
    for (const ex of (w.exercises || [])) {
      if (!ex || !ex.top) continue;
      const ad = String(ex.name || '').toLowerCase();
      const hedef = String(exercise.en || '').toLowerCase();
      const kisa = hedef.split('(')[0].trim();
      if (ad === hedef || (kisa.length > 3 && ad.includes(kisa))) {
        const e1 = Number(ex.top.e1rm);
        if (Number.isFinite(e1) && e1 > best) best = e1;
      }
    }
  }
  if (!(best > 0)) return null;
  // Epley tersi: kg = e1RM / (1 + tekrar/30)
  const kg = (best / (1 + repTarget / 30)) * 0.9;
  if (!Number.isFinite(kg) || kg <= 0) return null;
  return Math.max(2.5, Math.round(kg / 2.5) * 2.5);   // 2.5 kg adimina yuvarla
}

// Gun adi (JS getDay: 0=Pazar)
const PROGRAM_GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/**
 * Guc gunlerini haftaya dagit.
 * ⚠️ Dovus gunleri de AGIR sayilir. Kurallar:
 *   - Guc gunu, dovus gunune denk getirilmez (ayni gun cift agir yuk yok).
 *   - Agir bacak gunu, dovus gununun ERTESI ya da ONCESI gune konmaz
 *     (bacak yorgunlugu teknik calismayi ve sakatlik riskini dogrudan etkiler).
 *   - Haftada en az 1 tam dinlenme gunu birakilir.
 */
function programAssignDays(strengthCount, fightDays) {
  const dovus = new Set((fightDays || []).map(Number).filter(d => d >= 0 && d <= 6));
  // Pazartesi'den basla (1..6, sonra 0=Pazar)
  const sira = [1, 2, 3, 4, 5, 6, 0];
  const musait = sira.filter(d => !dovus.has(d));
  const secili = [];
  // Once araliklarini acmaya calis: bir gun atlayarak sec
  for (let adim = 2; adim >= 1 && secili.length < strengthCount; adim--) {
    for (let i = 0; i < musait.length && secili.length < strengthCount; i += adim) {
      const g = musait[i];
      if (!secili.includes(g)) secili.push(g);
    }
  }
  // Hala eksikse kalanlari sirayla ekle
  for (const g of musait) {
    if (secili.length >= strengthCount) break;
    if (!secili.includes(g)) secili.push(g);
  }
  // En az 1 tam dinlenme gunu: guc + dovus toplami 7'yi bulamaz
  while (secili.length + dovus.size > 6) secili.pop();
  return secili.sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
}

// Agir bacak gunu dovuse komsu mu?
function programLegClash(dow, fightDays) {
  const dovus = new Set((fightDays || []).map(Number));
  const oncesi = (dow + 6) % 7, sonrasi = (dow + 1) % 7;
  return dovus.has(oncesi) || dovus.has(sonrasi) || dovus.has(dow);
}

/**
 * Programi uret. TAMAMEN kural tabanli — AI cagrisi YOK, $0, deterministik.
 * @param {object} cfg {goal, strengthDays, sessionMin, places[], fightDays[], avoid[]}
 * @param {array}  workouts Hevy gecmisi (baslangic agirliklari icin)
 */
function buildProgram(cfg, workouts) {
  const c = cfg || {};
  const goal = PROGRAM_GOALS[c.goal] ? c.goal : 'kas';
  const G = PROGRAM_GOALS[goal];
  const places = (Array.isArray(c.places) && c.places.length) ? c.places.slice() : ['home'];
  const fightDays = (Array.isArray(c.fightDays) ? c.fightDays : []).map(Number)
    .filter(d => d >= 0 && d <= 6);
  const avoid = Array.isArray(c.avoid) ? c.avoid : [];
  const sessionMin = Math.max(20, Math.min(120, Number(c.sessionMin) || 60));

  // Guc gunu sayisi: istenen, ama agir gun tavanina kirpilir
  let sd = Math.max(1, Math.min(PROGRAM_LIMITS.maxStrengthDays, Number(c.strengthDays) || 3));
  const kirpildi = (sd + fightDays.length) > PROGRAM_LIMITS.maxHardDaysWeek;
  if (kirpildi) sd = Math.max(1, PROGRAM_LIMITS.maxHardDaysWeek - fightDays.length);

  // Bolunme secimi
  const splitKey = sd <= 3 ? 'fullbody' : (sd === 4 ? 'upperlower' : 'ppl');
  const sablon = PROGRAM_SPLITS[splitKey];

  // Seans basina egzersiz sayisi — sureden turetilir (kaba: bileske 4 dk/set,
  // izolasyon 2.5 dk/set; 3 set varsayimi + 8 dk isinma)
  const setBasi = (G.restSec + 45) / 60;
  const kapasite = Math.max(3, Math.min(
    PROGRAM_LIMITS.maxExercisesPerSession,
    Math.floor((sessionMin - 8) / (3 * setBasi))
  ));

  const gunler = programAssignDays(sd, fightDays);
  const havuz = programExercisePool(places, avoid);
  const kullanilan = new Set();
  const days = [];
  const uyarilar = [];

  // Sablonlari gunlere YERLESTIR (eskiden sirayla eslesiyordu).
  // ⚠️ 9 Agu 2026: eski kod, bacak gunu dovuse komsu cikinca sablonu bir UST
  // gunuyle DEGISTIRIYORDU — sonuc "3 ust + 1 alt" gibi dengesiz programdi
  // (bacak 12 set, sirt 20). Dogrusu sablonu atmak degil, BASKA GUNE koymak.
  const sablonlar = [];
  for (let i = 0; i < sd; i++) sablonlar.push(sablon[i % sablon.length]);
  const bosSlot = gunler.slice();
  const eslesme = new Array(sd).fill(null);
  // Once agir bacak gunleri: catismayan slotlari kapsinlar
  for (let i = 0; i < sd; i++) {
    if (!sablonlar[i].agirBacak) continue;
    let s = bosSlot.findIndex(d => !programLegClash(d, fightDays));
    if (s === -1) { s = 0; uyarilar.push('bacak'); }
    eslesme[i] = bosSlot.splice(s, 1)[0];
  }
  // Kalan sablonlar kalan gunlere
  for (let i = 0; i < sd; i++) if (eslesme[i] === null) eslesme[i] = bosSlot.shift();

  for (let i = 0; i < sd; i++) {
    const dow = eslesme[i];
    if (dow == null) continue;
    const sab = sablonlar[i];
    const odak = sab.focus || null;
    const secilenler = [];
    for (const p of sab.patterns) {
      if (secilenler.length >= kapasite) break;
      // 'iso'/'core' serbest kaliplari gunun odagiyla sinirlanir
      const uygun = (e) => e.pattern === p &&
        (!odak || (p !== 'iso' && p !== 'core') || odak.includes(e.muscle));
      // Once hic kullanilmamis, kalibi tutan bir hareket ara
      let aday = havuz.find(e => uygun(e) && !kullanilan.has(e.id) &&
        !secilenler.some(s => s.ex.id === e.id));
      if (!aday) aday = havuz.find(e => uygun(e) && !secilenler.some(s => s.ex.id === e.id));
      if (!aday) continue;
      kullanilan.add(aday.id);
      const reps = aday.compound ? G.repMin : Math.round((G.repMin + G.repMax) / 2);
      secilenler.push({
        ex: aday,
        sets: aday.compound ? 4 : 3,
        reps,
        kg: programStartWeight(aday, reps, workouts),
      });
    }
    days.push({
      dow,
      type: 'strength',
      name: sab.ad,
      agirBacak: !!sab.agirBacak,
      odak: odak || null,
      exercises: secilenler.map(s => ({
        id: s.ex.id, tr: s.ex.tr, en: s.ex.en, muscle: s.ex.muscle,
        sets: s.sets,
        repMin: s.ex.compound ? G.repMin : G.repMin + 2,
        repMax: s.ex.compound ? G.repMax : G.repMax + 3,
        kg: s.kg,
        sure: !!s.ex.sure,
      })),
    });
  }

  // Dovus gunleri programa BILGI olarak girer (icerigini Aidan yazmaz —
  // teknik calisma antrenorun isi; burada sadece yuk planlamasi icin durur)
  for (const d of fightDays) {
    if (days.some(x => x.dow === d)) continue;
    days.push({ dow: d, type: 'fight', name: 'Dövüş antrenmanı', exercises: [] });
  }
  days.sort((a, b) => (a.dow === 0 ? 7 : a.dow) - (b.dow === 0 ? 7 : b.dow));

  const p = {
    id: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    goal, sessionMin, places, fightDays, avoid,
    strengthDays: sd,
    split: splitKey,
    week: 1,
    days,
    history: [],
    notes: [],
  };
  if (kirpildi) {
    p.notes.push('Güç günü sayısı ' + c.strengthDays + '→' + sd +
      ' düşürüldü: dövüş günleriyle birlikte haftada ' +
      PROGRAM_LIMITS.maxHardDaysWeek + '’dan fazla ağır gün planlanmıyor.');
  }
  if (uyarilar.length) {
    p.notes.push('Dövüş günlerin yoğun olduğu için ağır bacak gününe çatışmasız bir gün ' +
      'kalmadı. O gün bacağı biraz hafif tut ya da dövüş günlerinden birini kaydır.');
  }
  if (G.athletic) programAddExplosive(p);   // patlayici blok seansin BASINA
  programEnforceVolumeCap(p);   // 16 yas tavani: rapor degil, ZORLA
  programEnforceContacts(p);    // temas butcesi: dovus gunleri dahil
  // Patlayici olcum hareketlerinde kg ZATEN olmaz (cm/m ile olculur) — sayma.
  const eksikKg = days.reduce((n, d) => n +
    d.exercises.filter(e => e.kg == null && !(e.explosive && e.metric !== 'kg')).length, 0);
  if (eksikKg) {
    p.notes.push(eksikKg + ' harekette geçmiş veri yok — ağırlık yazılmadı. ' +
      'İlk hafta kendine göre ayarla, Aidan sonraki haftadan itibaren Hevy verisinden takip eder.');
  }
  return p;
}

// ---------- Hacim denetimi ----------

// Kas grubu basina haftalik set sayisi
// ⚠️ Patlayici is bu sayima GIRMEZ. 3 tekrarlik sicrama ile 3 tekrarlik leg
// extension ayni 'set' degil; biri sinir sistemi isi, digeri hipertrofi uyarani.
// Patlayici is PLYO_LIMITS temas butcesiyle yonetilir (programContactBudget).
function programWeeklySets(p) {
  const out = {};
  for (const d of (p && p.days) || []) {
    for (const e of d.exercises || []) {
      if (e.explosive) continue;
      out[e.muscle] = (out[e.muscle] || 0) + (Number(e.sets) || 0);
    }
  }
  return out;
}

// Tavani asan kas grubu var mi (16 yas guvenlik siniri)
function programVolumeFlags(p) {
  const sets = programWeeklySets(p);
  return Object.keys(sets)
    .filter(m => sets[m] > PROGRAM_LIMITS.maxSetsPerMuscleWeek)
    .map(m => ({ muscle: m, sets: sets[m] }));
}

/**
 * Haftalik set tavanini ZORLA (rapor etmekle yetinme).
 * ⚠️ 9 Agu 2026: 5 gunluk PPL'de bolunme dongusu iki itme + iki cekme gunu
 * uretiyordu; gogus 22, sirt 27 sete cikiyordu (tavan 20). Test yakaladi.
 * Uyari gostermek yetmez — 16 yas icin tavan MOTORDA uygulanmali.
 *
 * Deterministik kirpma: tavani asan kas grubunda en cok seti olan hareketten
 * baslayarak birer set duser (izolasyon once, bileske en son ve asla 2'nin
 * altina inmez). Hala asiyorsa o kasin son izolasyon hareketi programdan cikar.
 */
function programEnforceVolumeCap(p) {
  const tavan = PROGRAM_LIMITS.maxSetsPerMuscleWeek;
  const kirpilan = [];
  for (let tur = 0; tur < 60; tur++) {
    const sets = programWeeklySets(p);
    const asan = Object.keys(sets).filter(m => sets[m] > tavan)
      .sort((a, b) => sets[b] - sets[a])[0];
    if (!asan) break;
    // Aday hareketler: once izolasyon, sonra bileske; set sayisi cok olan once
    const adaylar = [];
    for (const d of p.days) {
      for (const e of (d.exercises || [])) {
        if (e.muscle === asan) adaylar.push(e);
      }
    }
    const lib = id => PROGRAM_EXERCISES.find(x => x.id === id) || {};
    adaylar.sort((a, b) => {
      const ai = lib(a.id).compound ? 1 : 0, bi = lib(b.id).compound ? 1 : 0;
      if (ai !== bi) return ai - bi;              // izolasyon once kirpilir
      return b.sets - a.sets;                     // cok setli once
    });
    const hedef = adaylar.find(e => e.sets > 2);
    if (hedef) {
      hedef.sets -= 1;
      if (!kirpilan.includes(asan)) kirpilan.push(asan);
      continue;
    }
    // Hepsi 2 sette: son izolasyon hareketini tamamen cikar
    const cikarilacak = adaylar.filter(e => !lib(e.id).compound).pop();
    if (!cikarilacak) break;                      // sadece bileske kaldi, dur
    for (const d of p.days) {
      const i = (d.exercises || []).indexOf(cikarilacak);
      if (i >= 0) { d.exercises.splice(i, 1); break; }
    }
    if (!kirpilan.includes(asan)) kirpilan.push(asan);
  }
  if (kirpilan.length) {
    p.notes.push('Haftalık set tavanı (' + tavan + ') aşılmasın diye hacim düşürüldü: ' +
      kirpilan.map(m => PROGRAM_MUSCLES[m] || m).join(', ') + '.');
  }
  return p;
}

// ---------- Haftalik progresyon ----------

/**
 * Hevy verisine bakarak programi bir hafta ilerlet. KURAL TABANLI, AI YOK.
 *
 * Kurallar (siraya dikkat — ilk eslesen kazanir):
 *   1) Seans kacirildiysa (planlanan gucu gununun yarisindan azi yapildiysa)
 *      HACIM ARTIRILMAZ. "Yapamadigin programi agirlastirmak" en sik hata.
 *   2) Hedef tekrar araliginin USTUNE cikildiysa → agirlik bir adim artar.
 *   3) 2 hafta ust uste ilerleme yoksa → DELOAD (hacim %60'a iner, 1 hafta).
 *   4) Hicbiri degilse → ayni agirlik, "tekrar ekle" hedefi.
 */
// ============================================================================
// ATLETIK KATMAN — patlayicilik / dovus sporcusu motoru (9 Agu 2026)
// ============================================================================

/**
 * Patlayici hareket havuzu. Seviye kapisi 16 yas icin motorda ZORLANIR:
 *   level 1 — her zaman acik (sicrama, saglik topu, izometrik boyun)
 *   level 2 — teknik haftalari bittikten SONRA (tek bacak, olimpik turev, harness)
 *   level 3 — sok yuklemesi (derinlik sicramasi). advancedFromWeek'ten once ACILMAZ.
 * Gerekce: sok yuklemesi eksantrik yuku katlar; teknik oturmadan verilmez.
 */
function programExplosivePool(places, avoidMuscles, week) {
  const w = Number(week) || 1;
  const izin = w >= PLYO_LIMITS.advancedFromWeek ? 3 : (w > PLYO_LIMITS.teachWeeks ? 2 : 1);
  return programExercisePool(places, avoidMuscles)
    .filter(e => (e.explosive || e.pattern === 'neck') && (e.level || 1) <= izin);
}

/** Tek hareket ornedinin haftalik temas katkisi (set x tekrar x temas). */
function programContacts(e) {
  const c = Number(e.contact) || 0;
  if (!c) return 0;
  return (Number(e.sets) || 0) * (Number(e.repMax) || Number(e.repMin) || 0) * c;
}

/**
 * Haftalik temas butcesi.
 * ⚠️ EN ONEMLI SATIR: dovus gunleri butceden DUSULUR. Kickboks zaten yuksek
 * hacimli plyometrik istir (ip, adim, tekme). Bu satir olmasa motor "haftada
 * 3 gun sicrama" yazar, sporcu zaten 4 gun kickboks yapar, toplam yuk katlanir.
 * Cok dovus gunu varsa kalan butce SIFIRA iner — o zaman motor yalnizca temassiz
 * patlayici is (saglik topu, olimpik turev) verir. Bu dogru davranistir.
 */
function programContactBudget(p) {
  const dovus = (p && Array.isArray(p.fightDays) ? p.fightDays : []).length;
  const dovusYuku = dovus * PLYO_LIMITS.fightEquiv;
  let kullanilan = 0;
  for (const d of (p && p.days) || []) {
    for (const e of d.exercises || []) kullanilan += programContacts(e);
  }
  const tavan = PLYO_LIMITS.maxContactsWeek;
  return {
    tavan,
    dovusYuku,
    kullanilan,
    toplam: dovusYuku + kullanilan,
    kalan: Math.max(0, tavan - dovusYuku - kullanilan),
    doluluk: Math.min(100, Math.round(((dovusYuku + kullanilan) / tavan) * 100)),
  };
}

/**
 * Patlayici blogu seanslarin BASINA ekler.
 *
 * ⚠️ SIRA BILIMSEL OLARAK ZORUNLU, kozmetik degil: patlayici is dinlenmis sinir
 * sistemiyle yapilir. Agir squat'tan sonra yapilan sicrama patlayicilik degil
 * yorgunluk antrenmanidir — uretilen guc duser, adaptasyon yon degistirir.
 * Bu yuzden order:0 verilir ve render/kayit her yerde ona gore siralanir.
 */
function programAddExplosive(p) {
  const hafta = Number(p.week) || 1;
  const havuz = programExplosivePool(p.places, p.avoid, hafta);
  if (!havuz.length) return p;
  const gucGunler = (p.days || []).filter(d => d.type === 'strength');
  if (!gucGunler.length) return p;

  const teknik = hafta <= PLYO_LIMITS.teachWeeks;
  const dovusYuku = (Array.isArray(p.fightDays) ? p.fightDays.length : 0) * PLYO_LIMITS.fightEquiv;
  let kalanTemas = Math.max(0, PLYO_LIMITS.maxContactsWeek - dovusYuku);
  const temassizOldu = [];
  const kullanilan = new Set();

  gucGunler.forEach((d, idx) => {
    // Alt gun -> sicrama. Ust gun -> ust govde patlayiciligi.
    // Full body gununde odak YOK: gunler arasi donusumlu ver, yoksa sicrama
    // hic gelmez (3 gun ve alti programlarda tum gunler full body'dir).
    const altGun = !!d.agirBacak;
    const sira = altGun ? ['plyo', 'rot']
      : (d.odak ? ['power', 'rot'] : (idx % 2 === 0 ? ['plyo', 'rot'] : ['power', 'rot']));
    const secilenler = [];

    for (const pat of sira) {
      if (secilenler.length >= PLYO_LIMITS.maxPowerPerSession) break;
      const uygun = (e) => e.pattern === pat && !secilenler.some(x => x.id === e.id);
      let aday = havuz.find(e => uygun(e) && !kullanilan.has(e.id)) || havuz.find(uygun);
      if (!aday) continue;

      const sets = teknik ? 2 : 3;
      const [rMin, rMax] = aday.pRep || [3, 5];
      const reps = teknik ? rMin : rMax;
      const temas = (Number(aday.contact) || 0) * sets * reps;

      // Butce yetmiyorsa TEMAS URETEN hareketi atla, temassiz alternatif ara.
      if (temas > kalanTemas) {
        if (Number(aday.contact) || 0) temassizOldu.push(aday.tr);
        const alt = havuz.find(e => uygun(e) && !(Number(e.contact) || 0));
        if (!alt) continue;
        aday = alt;
      }
      const gercekTemas = (Number(aday.contact) || 0) * sets * reps;
      kalanTemas -= gercekTemas;
      kullanilan.add(aday.id);
      secilenler.push({
        id: aday.id, tr: aday.tr, en: aday.en, muscle: aday.muscle,
        sets, repMin: teknik ? rMin : rMin, repMax: reps,
        kg: aday.metric === 'kg' ? null : undefined,
        explosive: true, pattern: aday.pattern, contact: Number(aday.contact) || 0,
        metric: aday.metric || 'reps', order: 0,
      });
    }

    for (const e of (d.exercises || [])) if (e.order == null) e.order = 1;
    d.exercises = secilenler.concat(d.exercises || []);
  });

  // Boyun: dovus sporunda kafa hizlanmasini azaltir. Haftada 1 gun, UST gunune.
  const boyun = havuz.find(e => e.pattern === 'neck');
  if (boyun) {
    const hedefGun = gucGunler.find(d => !d.agirBacak) || gucGunler[0];
    if (hedefGun && !(hedefGun.exercises || []).some(e => e.muscle === 'neck')) {
      hedefGun.exercises.push({
        id: boyun.id, tr: boyun.tr, en: boyun.en, muscle: 'neck',
        sets: 3, repMin: 15, repMax: 25, kg: null, sure: !!boyun.sure,
        metric: boyun.metric || 'reps', order: 2,
      });
    }
  }

  if (teknik) {
    p.notes.push('İlk ' + PLYO_LIMITS.teachWeeks + ' hafta patlayıcı işte TEKNİK haftası: ' +
      'set ve tekrar düşük, yükseklik/mesafe zorlanmaz. Amaç iniş kontrolü ve ' +
      'hareketin oturması — sayı kovalamak değil.');
  }
  if (temassizOldu.length) {
    p.notes.push('Dövüş günlerin haftalık sıçrama bütçesinin çoğunu kullanıyor, o yüzden ' +
      'yere temaslı sıçrama azaltıldı (' + temassizOldu.slice(0, 3).join(', ') + '). ' +
      'Yerine sağlık topu / bar hızı işi kondu — patlayıcılık kalır, eklem yükü artmaz.');
  }
  p.notes.push('Patlayıcı hareketler seansın EN BAŞINDA, ısınmadan hemen sonra yapılır. ' +
    'Ağır setten sonra yapılan sıçrama patlayıcılık geliştirmez. Setler arası tam dinlen ' +
    '(2-3 dk); hız düştüğü an o hareketi bitir.');
  return p;
}

/**
 * Temas butcesi zorlamasi — rapor degil, KIRPMA (hacim tavaninin esi).
 * Once tekrari, sonra seti duser; hala asiyorsa temas ureten hareketi cikarir.
 */
function programEnforceContacts(p) {
  const dovus = (Array.isArray(p.fightDays) ? p.fightDays.length : 0) * PLYO_LIMITS.fightEquiv;
  const tavan = PLYO_LIMITS.maxContactsWeek;
  let kirpildi = false;

  for (let tur = 0; tur < 80; tur++) {
    const b = programContactBudget(p);
    if (b.toplam <= tavan) break;
    const adaylar = [];
    for (const d of p.days || []) {
      for (const e of d.exercises || []) if (programContacts(e) > 0) adaylar.push({ d, e });
    }
    if (!adaylar.length) break;
    adaylar.sort((a, x) => programContacts(x.e) - programContacts(a.e));
    const { d, e } = adaylar[0];
    if (e.repMax > e.repMin) { e.repMax -= 1; kirpildi = true; continue; }
    if (e.sets > 2) { e.sets -= 1; kirpildi = true; continue; }
    const i = d.exercises.indexOf(e);
    if (i >= 0) d.exercises.splice(i, 1);
    kirpildi = true;
  }

  // Seans basina tavan
  for (const d of p.days || []) {
    let seans = (d.exercises || []).reduce((a, e) => a + programContacts(e), 0);
    while (seans > PLYO_LIMITS.maxContactsSession) {
      const hedef = (d.exercises || []).filter(e => programContacts(e) > 0)
        .sort((a, b) => programContacts(b) - programContacts(a))[0];
      if (!hedef) break;
      if (hedef.repMax > hedef.repMin) hedef.repMax -= 1;
      else if (hedef.sets > 2) hedef.sets -= 1;
      else d.exercises.splice(d.exercises.indexOf(hedef), 1);
      kirpildi = true;
      seans = d.exercises.reduce((a, e) => a + programContacts(e), 0);
    }
  }

  if (kirpildi) {
    p.notes.push('Sıçrama hacmi haftalık temas tavanına (' + tavan + ') göre kırpıldı. ' +
      'Dövüş antrenmanların bunun ' + dovus + ' kadarını zaten kullanıyor.');
  }
  return p;
}

/** Olculen cikti gecmisi: { [hareketId]: [{week, v, at}] } */
function programMeasures(p, id) {
  if (!p.measures || typeof p.measures !== 'object') p.measures = {};
  if (!Array.isArray(p.measures[id])) p.measures[id] = [];
  return p.measures[id];
}

/**
 * Patlayici ilerleme degerlendirmesi — AGIRLIKLA DEGIL CIKTIYLA.
 * Sicramada "bir tekrar daha" ilerleme degildir; ilerleme daha YUKSEK/UZAK
 * sicramaktir. Cikti duserse bu durgunluk degil YORGUNLUK sinyalidir — bu
 * durumda hacim artirilmaz, AZALTILIR (ters yon: klasik deload'un tersi degil,
 * ayni yon ama farkli tetikleyici).
 */
function programExplosiveTrend(p, id) {
  const seri = (p.measures && p.measures[id]) || [];
  if (seri.length < 2) return { durum: 'veri-yok', n: seri.length };
  const son = Number(seri[seri.length - 1].v);
  const onceki = Number(seri[seri.length - 2].v);
  if (!Number.isFinite(son) || !Number.isFinite(onceki) || onceki <= 0) {
    return { durum: 'veri-yok', n: seri.length };
  }
  const pct = ((son - onceki) / onceki) * 100;
  if (pct <= -PLYO_LIMITS.dropPctDeload) return { durum: 'dusus', pct, son, onceki };
  if (pct > 0) return { durum: 'artis', pct, son, onceki };
  return { durum: 'sabit', pct, son, onceki };
}

function advanceProgram(p, workouts, todayStr) {
  if (!p || !Array.isArray(p.days)) return null;
  const t = todayStr || (typeof today === 'function' ? today() : null);
  const ws = Array.isArray(workouts) ? workouts : [];
  const sonHafta = t ? ws.filter(w => w.date > shiftDateStr(t, -7) && w.date <= t) : [];
  const planliGuc = p.days.filter(d => d.type === 'strength').length;
  const yapilan = sonHafta.length;
  const degisiklikler = [];
  const yeni = JSON.parse(JSON.stringify(p));

  // 1) Seans kacirma kontrolu
  const kacirdi = planliGuc > 0 && yapilan < Math.ceil(planliGuc / 2);
  if (kacirdi) {
    yeni.week = (Number(p.week) || 1) + 1;
    yeni.updatedAt = Date.now();
    yeni.stall = (Number(p.stall) || 0);   // durgunluk sayaci ARTMAZ — hak edilmedi
    yeni.notes = ['Bu hafta ' + yapilan + '/' + planliGuc + ' seans yapıldı. ' +
      'Ağırlıklar sabit bırakıldı — yetişemediğin programı ağırlaştırmak işe yaramıyor. ' +
      'Aynı programı bir hafta daha dene.'];
    yeni.history = [{ week: p.week, at: Date.now(), changes: ['seans eksik — hacim sabit'] }]
      .concat(p.history || []).slice(0, 12);
    return yeni;
  }

  // 2) Egzersiz bazinda ilerleme
  let ilerleyen = 0;
  const G = PROGRAM_GOALS[p.goal] || PROGRAM_GOALS.kas;
  for (const d of yeni.days) {
    for (const e of d.exercises || []) {
      // ⚠️ Patlayici is bu daldan GECMEZ. Sicramada "bir tekrar daha yaptin,
      // kilo ekleyelim" mantigi yanlistir — ilerleme daha YUKSEK/UZAK sicramaktir,
      // olcusu de metre/santim. Asagida ayri dalda ele alinir.
      if (e.explosive && e.metric !== 'kg') continue;
      const gercek = programLastPerformance(e, sonHafta);
      if (!gercek) continue;
      if (gercek.reps > e.repMax && e.kg != null) {
        const adim = Math.max(1.25, Math.round((e.kg * G.stepPct / 100) / 1.25) * 1.25);
        e.kg = Math.round((e.kg + adim) * 100) / 100;
        degisiklikler.push(e.tr + ' → ' + e.kg + ' kg');
        ilerleyen++;
      } else if (e.kg == null && gercek.kg > 0) {
        e.kg = gercek.kg;   // ilk kez veri geldi, programa yaz
        degisiklikler.push(e.tr + ' başlangıç: ' + e.kg + ' kg');
        ilerleyen++;
      }
    }
  }

  // 2b) PATLAYICI IS — olculen ciktiya gore, agirliga gore DEGIL.
  // Cikti dusuyorsa bu "durgunluk" degil YORGUNLUK sinyalidir: sinir sistemi
  // toparlamamis demektir. Cevap hacmi artirmak degil AZALTMAK.
  const patNot = [];
  for (const d of yeni.days) {
    for (const e of d.exercises || []) {
      if (!e.explosive || e.metric === 'kg') continue;
      const t = programExplosiveTrend(yeni, e.id);
      if (t.durum === 'dusus') {
        if (e.sets > 2) e.sets -= 1;
        patNot.push(e.tr + ': çıktı %' + Math.abs(Math.round(t.pct)) + ' düştü → hacim azaltıldı');
      } else if (t.durum === 'artis') {
        ilerleyen++;
        degisiklikler.push(e.tr + ' → ' + t.son + (e.metric === 'cm' ? ' cm' : e.metric === 'm' ? ' m' : ''));
      } else if (t.durum === 'veri-yok') {
        if (!patNot.some(x => x.indexOf('ölçüm') >= 0)) {
          patNot.push('Patlayıcı hareketlerde ölçüm girmedin — sıçrama/atış mesafeni ' +
            'yazmadan ilerleme takip edilemez. Kartta "ölç" düğmesi var.');
        }
      }
    }
  }
  if (patNot.length) degisiklikler.push.apply(degisiklikler, patNot.slice(0, 3));

  // 3) Durgunluk / deload
  yeni.stall = ilerleyen > 0 ? 0 : (Number(p.stall) || 0) + 1;
  if (yeni.stall >= PROGRAM_LIMITS.deloadAfterStallWeeks) {
    for (const d of yeni.days) {
      for (const e of d.exercises || []) {
        e.sets = Math.max(2, Math.round(e.sets * PROGRAM_LIMITS.deloadVolumeFactor));
      }
    }
    yeni.stall = 0;
    yeni.deload = true;
    degisiklikler.push('hafifletme haftası — set sayısı düşürüldü');
  } else {
    yeni.deload = false;
  }

  yeni.week = (Number(p.week) || 1) + 1;
  yeni.updatedAt = Date.now();
  yeni.notes = degisiklikler.length
    ? []
    : ['Bu hafta ağırlık artışı yok. Aynı ağırlıkta bir tekrar daha yapmayı hedefle — ' +
       'ilerleme sadece ağırlıkla olmuyor.'];
  yeni.history = [{ week: p.week, at: Date.now(), changes: degisiklikler.slice(0, 8) }]
    .concat(p.history || []).slice(0, 12);
  return yeni;
}

// Bir egzersizin son haftadaki en iyi seti
function programLastPerformance(e, workouts) {
  let en = null;
  for (const w of workouts || []) {
    for (const ex of (w.exercises || [])) {
      if (!ex || !ex.top) continue;
      const ad = String(ex.name || '').toLowerCase();
      const hedef = String(e.en || '').toLowerCase();
      const kisa = hedef.split('(')[0].trim();
      if (ad === hedef || (kisa.length > 3 && ad.includes(kisa))) {
        const kg = Number(ex.top.kg) || 0, reps = Number(ex.top.reps) || 0;
        if (!en || kg > en.kg || (kg === en.kg && reps > en.reps)) en = { kg, reps };
      }
    }
  }
  return en;
}

// ---------- Render ----------

function programDayLabel(dow) { return PROGRAM_GUNLER[dow] || '—'; }

function programRepText(e) {
  const tek = Number(e.repMin) === Number(e.repMax);
  const aralik = tek ? String(e.repMin) : (e.repMin + '-' + e.repMax);
  if (e.sure) return e.sets + ' × ' + aralik + ' sn';
  return e.sets + ' × ' + aralik;
}

/**
 * Patlayici hareket ciktisini elle kaydet (sicrama cm, atis m).
 * Hevy bu sayiyi vermez — olcum olmadan patlayici ilerleme takip EDILEMEZ.
 * Bu yuzden kart "olc" der ve advanceProgram olcum yoksa acikca soyler.
 */
async function programMeasure(id) {
  const p = ensureProgram();
  if (!p) return;
  let ex = null;
  for (const d of p.days || []) for (const e of d.exercises || []) if (e.id === id) ex = e;
  if (!ex) return;
  const br = ex.metric === 'cm' ? 'santim' : (ex.metric === 'm' ? 'metre' : 'tekrar');
  const seri = programMeasures(p, id);
  const son = seri.length ? String(seri[seri.length - 1].v) : '';
  const cev = await aidanPrompt(ex.tr, 'En iyi denemen kaç ' + br + '?', son);
  if (cev == null) return;
  const v = Number(String(cev).replace(',', '.').trim());
  if (!Number.isFinite(v) || v <= 0) { showToast('Geçerli bir sayı yaz.', 'warning'); return; }
  seri.push({ week: p.week, v, at: Date.now() });
  p.measures[id] = seri.slice(-12);
  save();
  renderProgram();
  const t = programExplosiveTrend(p, id);
  if (t.durum === 'artis') showToast('Kayıt alındı — önceki ölçümden %' + Math.round(t.pct) + ' daha iyi.', 'success');
  else if (t.durum === 'dusus') showToast('Kayıt alındı. Çıktı düştü — bu yorgunluk sinyali, hafta ilerletince hacim azalacak.', 'info', 5000);
  else showToast('Kayıt alındı.', 'success');
}

function renderProgram() {
  const el = document.getElementById('programSection');
  if (!el) return;
  const p = ensureProgram();

  if (!p) {
    el.innerHTML = '<div class="prog-wrap prog-empty">' +
      '<div class="prog-head"><h3>Antrenman programı</h3></div>' +
      '<p class="prog-lead">Hedefini ve haftalık düzenini yaz, Aidan sana bir program kursun. ' +
      'Sonraki haftalarda Hevy’den gelen gerçek veriye bakıp kendini ayarlar.</p>' +
      '<button class="small" onclick="openProgramSetup()">Program kur</button></div>';
    return;
  }

  const G = PROGRAM_GOALS[p.goal] || PROGRAM_GOALS.kas;
  const sets = programWeeklySets(p);
  const flags = programVolumeFlags(p);
  const dovusSayisi = (p.days || []).filter(d => d.type === 'fight').length;
  const gucSayisi = (p.days || []).filter(d => d.type === 'strength').length;

  const gunlerHtml = (p.days || []).map(d => {
    if (d.type === 'fight') {
      return '<div class="prog-day prog-day-fight">' +
        '<div class="pd-head"><span class="pd-dow">' + escapeHtml(programDayLabel(d.dow)) + '</span>' +
        '<span class="pd-name">' + escapeHtml(d.name) + '</span></div>' +
        '<div class="pd-note">Teknik çalışma antrenörünün işi — Aidan buraya karışmaz, ' +
        'sadece yükü planlarken hesaba katar.</div></div>';
    }
    // Patlayici is HER ZAMAN once gosterilir — sira bilimsel olarak zorunlu.
    const sirali = (d.exercises || []).slice()
      .sort((a, b) => ((a.order == null ? 1 : a.order) - (b.order == null ? 1 : b.order)));
    const satirlar = sirali.map(e => {
      const olcum = (e.explosive && e.metric !== 'kg')
        ? (function () {
            const seri = (p.measures && p.measures[e.id]) || [];
            const son = seri.length ? seri[seri.length - 1].v : null;
            const br = e.metric === 'cm' ? ' cm' : (e.metric === 'm' ? ' m' : '');
            return '<button class="pe-measure" onclick="programMeasure(\'' + e.id + '\')">' +
              (son != null ? escapeHtml(String(son)) + br : 'ölç') + '</button>';
          })()
        : '<span class="pe-kg">' + (e.kg != null ? escapeHtml(String(e.kg)) + ' kg' : '—') + '</span>';
      return '<div class="pd-ex' + (e.explosive ? ' pd-ex-pow' : '') + '">' +
        (e.explosive ? '<span class="pe-badge">patlayıcı</span>' : '') +
        '<span class="pe-name">' + escapeHtml(e.tr) + '</span>' +
        '<span class="pe-sets">' + escapeHtml(programRepText(e)) + '</span>' + olcum + '</div>';
    }).join('');
    return '<div class="prog-day">' +
      '<div class="pd-head"><span class="pd-dow">' + escapeHtml(programDayLabel(d.dow)) + '</span>' +
      '<span class="pd-name">' + escapeHtml(d.name) + '</span></div>' +
      '<div class="pd-list">' + satirlar + '</div></div>';
  }).join('');

  const hacimHtml = Object.keys(sets).sort((a, b) => sets[b] - sets[a]).map(m =>
    '<span class="prog-vol' + (sets[m] > PROGRAM_LIMITS.maxSetsPerMuscleWeek ? ' over' : '') + '">' +
    escapeHtml(PROGRAM_MUSCLES[m] || m) + ' <b>' + sets[m] + '</b></span>').join('');

  el.innerHTML = '<div class="prog-wrap">' +
    '<div class="prog-head"><h3>Antrenman programı</h3>' +
    '<span class="prog-week">' + p.week + '. hafta' + (p.deload ? ' · hafifletme' : '') + '</span></div>' +
    '<div class="prog-meta">' + escapeHtml(G.ad) + ' · ' + gucSayisi + ' güç günü' +
    (dovusSayisi ? ' + ' + dovusSayisi + ' dövüş' : '') + ' · ' + p.sessionMin + ' dk' + '</div>' +
    (p.notes || []).map(n => '<div class="prog-note">' + escapeHtml(n) + '</div>').join('') +
    (flags.length ? '<div class="prog-note prog-warn">Haftalık set tavanı aşıldı: ' +
      flags.map(f => escapeHtml(PROGRAM_MUSCLES[f.muscle] || f.muscle) + ' ' + f.sets).join(', ') +
      '. Tavan ' + PROGRAM_LIMITS.maxSetsPerMuscleWeek + ' set.</div>' : '') +
    '<div class="prog-days">' + gunlerHtml + '</div>' +
    (G.athletic ? (function () {
      const b = programContactBudget(p);
      return '<div class="prog-plyo">' +
        '<div class="pp-head"><span>Haftalık sıçrama yükü</span>' +
        '<b>' + b.toplam + ' / ' + b.tavan + '</b></div>' +
        '<div class="pp-bar"><i style="width:' + b.doluluk + '%"></i></div>' +
        '<div class="pp-legend">Dövüş antrenmanı ' + b.dovusYuku + ' · ağırlık günü ' +
        b.kullanilan + ' temas. Kickboks zaten plyometrik iş — bütçeden düşülüyor.</div>' +
        '</div>';
    })() : '') +
    '<div class="prog-volume">' + hacimHtml + '</div>' +
    '<div class="prog-actions">' +
    '<button class="small" onclick="runProgramAdvance()">Haftayı ilerlet</button>' +
    '<button class="small secondary" onclick="openProgramSetup()">Yeniden kur</button>' +
    '<button class="small secondary" onclick="deleteProgram()">Sil</button></div>' +
    ((p.history || []).length ? '<details class="prog-hist"><summary>Geçmiş değişiklikler</summary>' +
      p.history.map(h => '<div class="ph-row"><b>' + h.week + '. hafta</b> ' +
        escapeHtml((h.changes || []).join(' · ') || '—') + '</div>').join('') + '</details>' : '') +
    '<div class="prog-disc">Bu program geçmiş verinden üretilmiş bir başlangıç noktasıdır, ' +
    'kişiye özel antrenörlük değildir. Ağrı hissedersen dur. Maksimum tekrar (1RM) denemesi ' +
    'önerilmez — ağırlıklar tahminden hesaplanır.</div>' +
    '</div>';
}

// ---------- Aksiyonlar ----------

function runProgramAdvance() {
  const p = ensureProgram();
  if (!p) return;
  const h = (typeof ensureHevy === 'function') ? ensureHevy() : (data.hevy || { workouts: [] });
  const yeni = advanceProgram(p, h.workouts || [], today());
  if (!yeni) return;
  data.program = yeni;
  save();
  renderProgram();
  const son = (yeni.history || [])[0];
  const ozet = (son && son.changes && son.changes.length) ? son.changes.join(' · ') : 'değişiklik yok';
  showToast(yeni.week + '. hafta hazır: ' + ozet, 'success', 5000);
}

function deleteProgram() {
  if (!confirm('Programı silmek istediğine emin misin? Geçmiş değişiklikler de gider.')) return;
  data.program = null;
  save();
  renderProgram();
  showToast('Program silindi.', 'info');
}

// Kurulum modali — durumu burada tutulur
let _progSetup = null;

function openProgramSetup() {
  const p = ensureProgram();
  _progSetup = {
    goal: (p && p.goal) || 'kas',
    strengthDays: (p && p.strengthDays) || 3,
    sessionMin: (p && p.sessionMin) || 60,
    places: (p && p.places) ? p.places.slice() : ['gym'],
    fightDays: (p && p.fightDays) ? p.fightDays.slice() : [],
    avoid: (p && p.avoid) ? p.avoid.slice() : [],
  };
  renderProgramSetup();
  const m = document.getElementById('programModal');
  if (m) m.classList.add('open');
}

function closeProgramSetup() {
  const m = document.getElementById('programModal');
  if (m) m.classList.remove('open');
}

function progSetupPick(alan, deger) {
  if (!_progSetup) return;
  if (alan === 'places' || alan === 'fightDays' || alan === 'avoid') {
    const dizi = _progSetup[alan];
    const i = dizi.indexOf(deger);
    if (i >= 0) dizi.splice(i, 1); else dizi.push(deger);
  } else {
    _progSetup[alan] = deger;
  }
  renderProgramSetup();
}

function renderProgramSetup() {
  const el = document.getElementById('programSetupBody');
  if (!el || !_progSetup) return;
  const s = _progSetup;
  const chip = (alan, deger, etiket) => {
    const dizi = s[alan];
    const aktif = Array.isArray(dizi) ? dizi.includes(deger) : dizi === deger;
    return '<button class="prog-chip' + (aktif ? ' on' : '') + '" onclick="progSetupPick(\'' +
      alan + '\',' + (typeof deger === 'number' ? deger : '\'' + deger + '\'') + ')">' +
      escapeHtml(etiket) + '</button>';
  };
  const agirGun = s.strengthDays + s.fightDays.length;
  el.innerHTML =
    '<div class="prog-f"><label>Hedef</label><div class="prog-chips">' +
    Object.keys(PROGRAM_GOALS).map(k => chip('goal', k, PROGRAM_GOALS[k].ad)).join('') +
    '</div></div>' +
    '<div class="prog-f"><label>Haftada kaç gün ağırlık?</label><div class="prog-chips">' +
    [1, 2, 3, 4, 5].map(n => chip('strengthDays', n, n + ' gün')).join('') +
    '</div></div>' +
    '<div class="prog-f"><label>Seans süresi</label><div class="prog-chips">' +
    [30, 45, 60, 75, 90].map(n => chip('sessionMin', n, n + ' dk')).join('') +
    '</div></div>' +
    '<div class="prog-f"><label>Nerede antrenman yapıyorsun?</label><div class="prog-chips">' +
    chip('places', 'gym', 'Spor salonu') + chip('places', 'home', 'Ev · dambıl') +
    chip('places', 'bw', 'Vücut ağırlığı') +
    '</div></div>' +
    '<div class="prog-f"><label>Dövüş antrenmanı günleri</label><div class="prog-chips">' +
    [1, 2, 3, 4, 5, 6, 0].map(d => chip('fightDays', d, PROGRAM_GUNLER[d].slice(0, 3))).join('') +
    '</div><div class="prog-hint">Bu günlere ağırlık koymaz; ağır bacak gününü de bu günlerin ' +
    'yanına yerleştirmez.</div></div>' +
    '<div class="prog-f"><label>Ağrıyan / kaçınılacak bölge</label><div class="prog-chips">' +
    Object.keys(PROGRAM_MUSCLES).map(m => chip('avoid', m, PROGRAM_MUSCLES[m])).join('') +
    '</div><div class="prog-hint">Seçtiğin bölgeyi çalıştıran hareketler programa hiç girmez.</div></div>' +
    '<div class="prog-sum' + (agirGun > PROGRAM_LIMITS.maxHardDaysWeek ? ' over' : '') + '">' +
    'Haftada ' + agirGun + ' ağır gün' +
    (agirGun > PROGRAM_LIMITS.maxHardDaysWeek
      ? ' — tavan ' + PROGRAM_LIMITS.maxHardDaysWeek + '. Güç günü otomatik düşürülecek.'
      : ' · ' + (7 - agirGun) + ' gün dinlenme') + '</div>';
}

function saveProgramSetup() {
  if (!_progSetup) return;
  if (!_progSetup.places.length) { showToast('En az bir antrenman yeri seç.', 'warning'); return; }
  const h = (typeof ensureHevy === 'function') ? ensureHevy() : (data.hevy || { workouts: [] });
  const p = buildProgram(_progSetup, h.workouts || []);
  if (!p.days.length) { showToast('Program üretilemedi — gün seçimini gözden geçir.', 'error'); return; }
  data.program = p;
  save();
  closeProgramSetup();
  renderProgram();
  showToast('Program hazır: ' + p.days.filter(d => d.type === 'strength').length + ' güç günü.', 'success', 5000);
}
