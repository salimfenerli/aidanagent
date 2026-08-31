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
  deloadAfterStallWeeks: 2,   // 2 hafta ilerleme yoksa hafifletme haftasi (REAKTIF)
  deloadEveryWeeks: 5,        // her 5. hafta PLANLI hafifletme — yorgunluk
                              // performansi dusurene kadar BEKLEMEZ
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
  // ⚠️ 30 Agu 2026: 5 -> 10. %5 ERGENDE OLCUM GURULTUSUNUN ALTINDAYDI —
  // saptanabilir en kucuk degisim CMJ yuksekliginde >%7, tek bacak sicrama
  // mesafesinde >%8 (Thomas 2017); kuvvet platformunda bile tek CMJ'nin
  // varyasyon katsayisi ~%5 (Cormack 2008), telefon uygulamasinda daha
  // kotu (%8.2, Rago 2018). Esik gurultunun icinde kalinca uyari her
  // hafta yaniyor ve gormezden gelinmeyi ogretiyor — bu, uyari
  // olmamasindan kotudur.
  dropPctDeload: 10,          // olculen cikti %10 duserse yorgunluk sinyali
};

// Hedefe gore tekrar araligi / hacim / dinlenme / artis adimi
// ⚠️ KADEME (tier) SISTEMI — 9 Agu 2026.
// Eskiden tek bir repMin/repMax vardi ve 'compound' olan her hareket ayni
// araligi aliyordu. Sonuc: atletik hedefte Bulgar split squat 3-6 tekrar
// yaziliyordu — ana kaldirisla yardimci hareket ayni muamele goruyordu.
// Artik 3 kademe: 1 ana kaldiris (agir, dusuk tekrar) · 2 yardimci bileske
// (orta) · 3 izolasyon (yuksek tekrar). repMin/repMax kademe 1'in esi olarak
// GERIYE UYUMLU korundu (advanceProgram ve eski testler kullaniyor).
const PROGRAM_GOALS = {
  kas:  { ad: 'Kas kütlesi',   repMin: 6,  repMax: 10, setsLow: 12, setsHigh: 18, restSec: 90,  stepPct: 2.5,
          tiers: { 1: [6, 10],  2: [8, 12],  3: [12, 15] }, setsByTier: { 1: 4, 2: 3, 3: 3 } },
  guc:  { ad: 'Güç',           repMin: 3,  repMax: 5,  setsLow: 10, setsHigh: 15, restSec: 180, stepPct: 2.5,
          tiers: { 1: [3, 5],   2: [5, 8],   3: [8, 12] },  setsByTier: { 1: 5, 2: 3, 3: 3 } },
  form: { ad: 'Genel form',    repMin: 8,  repMax: 12, setsLow: 9,  setsHigh: 14, restSec: 60,  stepPct: 2.5,
          tiers: { 1: [8, 12],  2: [10, 15], 3: [12, 18] }, setsByTier: { 1: 3, 2: 3, 3: 2 } },
  daya: { ad: 'Dayanıklılık',  repMin: 12, repMax: 15, setsLow: 8,  setsHigh: 12, restSec: 45,  stepPct: 1.25,
          tiers: { 1: [12, 15], 2: [15, 20], 3: [15, 25] }, setsByTier: { 1: 3, 2: 3, 3: 2 } },
  // ⚠️ Atletik hedef DIGERLERINDEN FARKLI CALISIR (9 Agu 2026).
  // Maksimal kuvvet (guc) ile patlayicilik ayni sey DEGIL: guc, kuvvet-hiz
  // egrisinin agir ucudur; patlayicilik ortasindadir (%30-60 1RM, maksimum HIZ).
  // Bu hedef secilince seansin BASINA patlayici blok girer ve hacim degil
  // TEMAS BUTCESI ile yonetilir (bkz. PLYO_LIMITS).
  // Atletik: ana kaldiris agir ve dusuk tekrar (sinir sistemi), yardimci orta
  // (dokular yuke dayansin), izolasyon yuksek (eklem sagligi + hacim).
  atletik: { ad: 'Atletik güç / patlayıcılık', repMin: 3, repMax: 5, setsLow: 8, setsHigh: 14, restSec: 180, stepPct: 2.5, athletic: true,
             tiers: { 1: [3, 5], 2: [6, 10], 3: [10, 15] }, setsByTier: { 1: 4, 2: 3, 3: 3 } },
};

// ⚠️ DINLENME KADEMEYE GORE (18 Agu 2026).
// Eskiden tek `restSec` vardi ve HER harekete uygulaniyordu: atletik hedefte
// Leg Curl'e de 3 dk dinlenme yaziliyordu. Kanit: agir bileskede 2+ dk hem
// kuvvet hem hipertrofi icin daha iyi; izolasyonda 60-90 sn ile fark yok.
// ASIL SORUN YAN ETKISIYDI: seans kapasitesi bu tek (uzun) dinlenmeye gore
// hesaplaniyordu, 60 dk'lik seansta 4 harekete duşuyordu ve sablonun son
// slotu — CORE — programa HIC girmiyordu.
const PROGRAM_REST_ORAN = { 1: 1, 2: 0.65, 3: 0.4 };
for (const __k of Object.keys(PROGRAM_GOALS)) {
  const __G = PROGRAM_GOALS[__k];
  if (__G.restByTier) continue;
  __G.restByTier = {
    1: __G.restSec,
    2: Math.max(45, Math.round(__G.restSec * PROGRAM_REST_ORAN[2] / 15) * 15),
    3: Math.max(30, Math.round(__G.restSec * PROGRAM_REST_ORAN[3] / 15) * 15),
  };
}
function programRest(G, tier) {
  return (G && G.restByTier && G.restByTier[tier]) || (G && G.restSec) || 90;
}

const PROGRAM_MUSCLES = {
  chest: 'Göğüs', back: 'Sırt', quads: 'Ön bacak', hams: 'Arka bacak',
  glutes: 'Kalça', shoulders: 'Omuz', biceps: 'Biseps', triceps: 'Triseps',
  core: 'Karın/Core', calves: 'Baldır', neck: 'Boyun',
};

/**
 * TEMPO (18 Agu 2026) — biçim: eksantrik · alt bekleme · konsantrik · üst bekleme.
 * 'X' = maksimum hız niyeti (yük ağır olduğu için bar yavaş kalkar, NIYET hızlıdır).
 *
 * NEDEN VAR: bağ dokusu (tendon/ligament) kas kadar hızlı adapte olmaz. Tendon
 * sertliği uzun süreli yüksek gerilimle artar ve bunun ana kaynağı EKSANTRIK
 * fazdır. Kickboks gibi eklemi hızla yükleyen bir branşta bu koruyucu bir
 * özelliktir, kozmetik değil.
 *
 * ⚠️ EN ONEMLI AYRIM — "yavaş tempo her yere iyi gelir" YANLIS.
 * Kademe 1'de (3-5 tekrar, ağır) konsantriği kasten yavaşlatmak kaldırılan
 * yükü DUSURUR ve kuvvet kazanımını azaltır. Doğrusu: iniş kontrollü (2 sn),
 * kalkışta maksimum hız niyeti. 5 saniyelik negatif ana kaldırışta yanlıştır —
 * yeri yardımcı hareketler ve izolasyondur.
 */
const PROGRAM_TEMPO_TIER = { 1: '2-1-X-0', 2: '3-1-1-0', 3: '3-0-1-1' };
const PROGRAM_TEMPO = {
  // Calisthenics: tepede izometrik bekleme — barfikste çene üstü, dipste dip
  pullup: '3-1-1-1', chinup: '3-1-1-1', dip: '3-1-1-1', pushup: '3-1-1-1',
  invrow: '3-1-1-1', pikepush: '3-1-1-1', closepush: '3-1-1-1',
  // Hinge: hamstring tendonu eksantrikte yüklenir
  rdl: '3-1-1-0', dbrdl: '3-1-1-0',
  // Nordic: hareketin TAMAMI eksantrik — hamstring yaralanma korumasının
  // en güçlü kanıtı olan çalışma biçimi
  nordic: '5-0-1-0',
  // Kalça: tepede sıkma olmadan uyaranın yarısı kaybolur
  hipthrust: '2-1-1-2', glutebr: '2-1-1-2',
  // Aşil tendonu: altta 2 sn gerilme — tekme ve sıçramanın yay mekanizması
  calfraise: '3-2-1-1',
  legcurl: '3-0-1-1', legext: '3-0-1-1',
  bulgarian: '3-1-1-0', lunge: '2-1-1-0', stepup: '2-1-1-0',
};

/**
 * RPE — algılanan zorluk (10 = bir tekrar daha yapılamaz).
 * ⚠️ 16 YAS KAPISI: hiçbir sette RPE 10 yazılmaz. Yetmezliğe (0 RIR) gitmek
 * ek kazanç getirmeden yorgunluğu katlar; teknik bozulur, dövüş antrenmanına
 * yorgun gidilir. Tavan 9.
 */
const PROGRAM_RPE = { 1: [7, 8], 2: [8, 8], 3: [8, 9] };

/**
 * VUCUT AGIRLIGI HAREKETLERINDE YUK ORANI — kaldırılan yükün vücut
 * ağırlığına oranı. Barfikste neredeyse tamamı, şınavda ~%65.
 * Bu oran olmadan "kaç barfiks çekebiliyorsun" verisi programa çevrilemez.
 */
const PROGRAM_BW_LOAD = {
  pullup: 1.0, chinup: 1.0, dip: 0.95, pikepush: 0.7,
  pushup: 0.65, closepush: 0.65, invrow: 0.55,
};
// Hangi hareket hangi max testinden beslenir
const PROGRAM_BW_TEST = {
  pullup: 'pullup', chinup: 'pullup', invrow: 'pullup',
  dip: 'dip', pushup: 'pushup', closepush: 'pushup', pikepush: 'pushup',
};
// Yetmeyen harekete regresyon (kolaylastirma) onerisi
const PROGRAM_BW_REGRES = {
  pullup: 'bant destekli ya da negatif barfiks (5 sn iniş)',
  chinup: 'bant destekli ya da negatif chin-up (5 sn iniş)',
  invrow: 'ayakları öne alarak açıyı dikleştir',
  dip: 'bant destekli dips ya da bench dips',
  pushup: 'eğik şınav (eller sehpada) — dizden şınav son seçenek',
  closepush: 'eğik dar tutuş şınav (eller sehpada)',
  pikepush: 'ayakları yere indir, kalçayı biraz alçalt',
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
  { id: 'stepup',    tr: 'Step-Up (Kutuya Çıkış)',   en: 'Step Up',                    muscle: 'quads', pattern: 'lunge', compound: true,  places: ['gym', 'home', 'bw'] },
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
  { id: 'palloff',   tr: 'Pallof Press',             en: 'Pallof Press',               muscle: 'core', pattern: 'core', compound: false, places: ['gym', 'home'], antiRot: true },
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
  { id: 'plyopush',  tr: 'Patlayıcı Şınav',             en: 'Plyometric Push Up',             muscle: 'chest',     pattern: 'power', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 1, plyoW: 0.5, metric: 'reps', pRep: [3, 5], level: 2 },
  { id: 'pushpress', tr: 'Push Press',                  en: 'Push Press (Barbell)',           muscle: 'shoulders', pattern: 'power', compound: true, places: ['gym'], explosive: true, contact: 0, metric: 'kg', pRep: [3, 5], level: 2 },
  { id: 'hangclean', tr: 'Hang Power Clean',            en: 'Hang Power Clean',               muscle: 'back',      pattern: 'power', compound: true, places: ['gym'], explosive: true, contact: 0, metric: 'kg', pRep: [3, 5], level: 2 },
  { id: 'kbswing',   tr: 'Kettlebell Swing',            en: 'Kettlebell Swing',               muscle: 'glutes',    pattern: 'power', compound: true, places: ['gym', 'home'], explosive: true, contact: 0, metric: 'kg', pRep: [8, 12], level: 1 },

  // --- Alt govde plyometrik (TEMAS URETIR) ---
  { id: 'pogo',      tr: 'Ayak Bileği Sıçraması',       en: 'Pogo Hops',                      muscle: 'calves', pattern: 'plyo', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 1, plyoW: 0.5, metric: 'reps', pRep: [10, 15], level: 1 },
  { id: 'cmj',       tr: 'Dikey Sıçrama',               en: 'Countermovement Jump',           muscle: 'quads',  pattern: 'plyo', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 1, plyoW: 1, metric: 'cm', pRep: [3, 5],   level: 1 },
  { id: 'boxjump',   tr: 'Kutu Sıçraması',              en: 'Box Jump',                       muscle: 'quads',  pattern: 'plyo', compound: true, places: ['gym', 'home'],       explosive: true, contact: 1, plyoW: 1, metric: 'cm', pRep: [3, 5],   level: 1 },
  { id: 'broadjump', tr: 'Uzun Atlama',                 en: 'Broad Jump',                     muscle: 'quads',  pattern: 'plyo', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 1, plyoW: 1, metric: 'm',  pRep: [3, 5],   level: 1 },
  { id: 'splitjump', tr: 'Makas Sıçrama',               en: 'Split Squat Jump',               muscle: 'quads',  pattern: 'plyo', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 2, plyoW: 1, metric: 'reps', pRep: [4, 6],  level: 2 },
  { id: 'bound',     tr: 'Tek Bacak Sıçrama (Bound)',   en: 'Single Leg Bound',               muscle: 'hams',   pattern: 'plyo', compound: true, places: ['gym', 'home', 'bw'], explosive: true, contact: 2, plyoW: 1.5, metric: 'm',  pRep: [3, 5],   level: 2 },
  { id: 'depthjump', tr: 'Derinlik Sıçraması',          en: 'Depth Jump',                     muscle: 'quads',  pattern: 'plyo', compound: true, places: ['gym'],               explosive: true, contact: 1, plyoW: 2, metric: 'cm', pRep: [3, 5],   level: 3 },

  // --- Boyun: dovus sporunda kafa hizlanmasini azaltir ---
  // Otomatik programda YALNIZ izometrik. Harness/koprü level 2, teknik ister.
  { id: 'neckiso',   tr: 'Boyun İzometrik (4 yön)',     en: 'Neck Isometric Hold',            muscle: 'neck', pattern: 'neck', compound: false, places: ['gym', 'home', 'bw'], sure: true, metric: 'sn', level: 1 },
  { id: 'neckharn',  tr: 'Boyun Harness',               en: 'Neck Harness Extension',         muscle: 'neck', pattern: 'neck', compound: false, places: ['gym'], metric: 'kg', level: 2 },
  { id: 'farmer',    tr: 'Farmer Carry',                en: "Farmers Walk",                   muscle: 'core', pattern: 'carry', compound: true, places: ['gym', 'home'], sure: true, metric: 'kg', level: 1 },
];

// Ana kaldiris: agir yuklenebilir, iki tarafli, gunun asil uyarani.
const PROGRAM_TIER1 = new Set(['bench', 'dbbench', 'dip', 'squat', 'legpress', 'rdl', 'dbrdl',
  'ohp', 'dbohp', 'bbrow', 'seatedrow', 'pullup', 'chinup', 'latpull', 'hipthrust']);
// Yardimci bileske: tek tarafli ya da vucut agirligi; orta tekrar.
const PROGRAM_TIER2 = new Set(['incline', 'pushup', 'invrow', 'pikepush', 'gobsquat',
  'bulgarian', 'lunge', 'bwsquat', 'glutebr', 'closepush', 'dbrow', 'stepup']);
// Tek tarafli is: dovus sporcusunda ayri deger tasir (tekme, denge, asimetri).
const PROGRAM_UNI = new Set(['bulgarian', 'lunge', 'dbrow', 'bound', 'stepup']);
// ⚠️ HAREKET AILESI (10 Agu 2026) — ayni hareketin farkli aletle yapilan
// versiyonlari. 'Romen Deadlift' ile 'Dambil Romen Deadlift' ayri id'ler ama
// AYNI harekettir; motor bunu cesitlilik saniyordu. Aile ayni ise ceza agir.
// Aileye yazilmayan hareket kendi basina bir ailedir (id = aile).
// ⚠️ Aile SADECE "ayni hareket, farkli alet" demektir. Leg press bir squat
// DEGILDIR (makine, farkli yuklenme, farkli stabilite) — ayri aile. Fazla genis
// gruplamak havuzu tuketir ve motor cesitlilik uretemez hale gelir.
const PROGRAM_FAMILY = {
  rdl: 'rdl', dbrdl: 'rdl',                             // ayni hinge, bar vs dambil
  squat: 'squat', gobsquat: 'squat', bwsquat: 'squat',  // ayni squat, yuk farkli
  bench: 'bench', dbbench: 'bench',                     // ayni press, bar vs dambil
  ohp: 'ohp', dbohp: 'ohp',                             // ayni omuz press
  pullup: 'pullup', chinup: 'pullup',                   // ayni cekis, tutus farkli
};
function programFamily(e) { return PROGRAM_FAMILY[e.id] || e.id; }
// ⚠️ HAREKET KALITESI / TRANSFER PUANI (18 Agu 2026) — `pri`.
//   3 = serbest agirlik TEMEL bileske (stabilizasyon talebi var, sporcuya
//       transferi en yuksek olan uyaran)
//   2 = serbest agirlik yardimci / tek tarafli / serbest izolasyon
//   1 = makine ya da kablo (yol sabit, stabilizasyon yok)
// NEDEN EKLENDI: aile cezasi yuzunden motor ikinci bacak gununde serbest
// squat yerine LEG PRESS yaziyordu — "cesitlilik" hareket kalitesinin onune
// geciyordu. Makine bir squat degildir; cesitlilik ucuz, transfer degil.
// ⚠️ 30 Agu 2026: 'bench' bu listeden CIKTI, 'dip' girdi. pri bir TRANSFER
// puani olarak tanimli; bench sirti destekli yatay itistir ve dovus
// sporcusunda transferi zayif — ileri duzey amator boksorlerde izometrik
// bench maksimal kuvveti yumruk darbe guculuyle anlamli iliskili cikmadi,
// balistik olcumler ciktı (Beattie & Ruddock 2022). Dips bilateral,
// yuklenebilir ve govde kontrolu istiyor.
const PROGRAM_PRI3 = new Set(['squat', 'dip', 'ohp', 'rdl', 'bbrow', 'pullup',
  'chinup', 'dip', 'hangclean', 'pushpress']);
const PROGRAM_MAKINE = new Set(['legpress', 'latpull', 'seatedrow', 'legext',
  'legcurl', 'cablefly', 'pushdown', 'neckharn']);

// ⚠️ TEKRAR TABANI (18 Agu 2026) — kademe araligi her harekete uymaz.
// Atletik hedefte kademe 1 araligi 3-5 ve motor bunu HIP THRUST'a da
// yaziyordu. Kisa ROM'lu, kalca dominant ya da makine hareketlerinde 3 tekrar
// ne kuvvet uyaranidir ne de guvenli teknik verir — bu hareketler kendi
// alt sinirlarini dayatir. Kademe araligi bu tabanin altina inemez.
const PROGRAM_REP_FLOOR = {
  hipthrust: 6, latpull: 6, seatedrow: 6, dbrow: 6, dbrdl: 6, legpress: 5,
  rdl: 5, dbbench: 5, dbohp: 5, glutebr: 8, calfraise: 8, legcurl: 8,
  legext: 8, nordic: 3,
  // ⚠️ 30 Agu 2026: dips kademe 1'e alindi (asagidaki nota bak) ama
  // atletik kademe-1 araligi 3-5. Agirlikli dips'te dip pozisyonu
  // omuz on kapsulunu son ROM'da yukler; 3 tekrar bunu maksimum yukle
  // birlestirir. 16 yasinda kazanci riskinden kucuk — taban 6.
  dip: 6,
};

/**
 * IKINCIL KAS PAYI (18 Agu 2026) — dokumandaki bilinen sinir 4b.
 *
 * Motor yalnizca hareketin BIRINCIL kasini sayiyordu. Hip thrust arka bacagi
 * da calistirir ama hacim muhasebesinde sadece `glutes` sayiliyor; sonuc,
 * motorun "arka bacak bandin altinda" demesi — teknik olarak dogru, pratikte
 * olduğundan kotu goruntu.
 *
 * Yerlesik yaklasim: dogrudan calisan kas 1 set, dolayli calisan 0.5 set.
 * ⚠️ Bu sayim yalniz DURUM RAPORUNDA kullanilir; band zorlamasi ve 16 yas
 * set tavani DOGRUDAN sette kalir. Sebebi: hacim onerilerinin dayandigi
 * calismalar dogrudan set sayar, tavani dolayli setle sismek guvenlik
 * kuralini gevsetmek olur.
 */
const PROGRAM_IKINCIL = {
  squat: { glutes: 0.5 }, gobsquat: { glutes: 0.5 }, legpress: { glutes: 0.5 },
  bwsquat: { glutes: 0.5 }, lunge: { glutes: 0.5, hams: 0.5 },
  bulgarian: { glutes: 0.5, hams: 0.5 }, stepup: { glutes: 0.5 },
  rdl: { glutes: 0.5, back: 0.5 }, dbrdl: { glutes: 0.5, back: 0.5 },
  hipthrust: { hams: 0.5 }, glutebr: { hams: 0.5 }, kbswing: { hams: 0.5 },
  bench: { triceps: 0.5, shoulders: 0.5 }, dbbench: { triceps: 0.5, shoulders: 0.5 },
  incline: { triceps: 0.5, shoulders: 0.5 }, dip: { triceps: 0.5, shoulders: 0.5 },
  pushup: { triceps: 0.5, shoulders: 0.5 },
  ohp: { triceps: 0.5 }, dbohp: { triceps: 0.5 }, pikepush: { triceps: 0.5 },
  pushpress: { triceps: 0.5 },
  pullup: { biceps: 0.5 }, chinup: { biceps: 0.5 }, latpull: { biceps: 0.5 },
  bbrow: { biceps: 0.5 }, dbrow: { biceps: 0.5 }, seatedrow: { biceps: 0.5 },
  invrow: { biceps: 0.5 }, hangclean: { quads: 0.5, hams: 0.5 },
};

for (const e of PROGRAM_EXERCISES) {
  if (e.tier == null) e.tier = PROGRAM_TIER1.has(e.id) ? 1 : (PROGRAM_TIER2.has(e.id) ? 2 : 3);
  if (PROGRAM_UNI.has(e.id)) e.uni = true;
  if (e.pri == null) e.pri = PROGRAM_MAKINE.has(e.id) ? 1 : (PROGRAM_PRI3.has(e.id) ? 3 : 2);
}

// Bolunmedeki her gunun hangi kaliplari isteyecegi
// focus: 'iso'/'core' gibi serbest kaliplar bu kas gruplariyla SINIRLANIR.
// Yoksa bacak gununde yan kaldiris, itme gununde baldir cikiyordu.
const UST = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
const ALT = ['quads', 'hams', 'glutes', 'calves', 'core'];

const PROGRAM_SPLITS = {
  fullbody: [
    { ad: 'Full Body A', patterns: ['squat', 'push_h', 'pull_v', 'hinge', 'core'] },
    { ad: 'Full Body B', patterns: ['hinge', 'push_v', 'pull_h', 'lunge', 'core'] },
    { ad: 'Full Body C', patterns: ['squat', 'push_h', 'pull_h', 'core', 'iso'] },
  ],
  // ⚠️ CORE HER GUNDE ve IZOLASYONDAN ONCE (18 Agu 2026). Eskiden core yalniz
  // bacak/full-body sablonlarinda ve EN SON slottaydi; kapasite kesintisi hep
  // oraya denk geliyordu, 60 dk'lik programda haftalik core = 0 set cikiyordu.
  // Dovus sporcusunda govde isi pazarlik konusu degil: vurus gucu bacaktan
  // gelip GOVDE DONUSUYLE aktarilir, anti-rotasyon dayanikliligi ayni zamanda
  // bel korumasidir. Bir yan kaldiristan once gelir.
  upperlower: [
    { ad: 'Üst Vücut A', patterns: ['push_h', 'pull_v', 'push_v', 'pull_h', 'core', 'iso'], focus: UST },
    { ad: 'Alt Vücut A', patterns: ['squat', 'hinge', 'lunge', 'core', 'iso'], focus: ALT, agirBacak: true },
    // ⚠️ UST B CEKISLE BASLAR (18 Agu 2026). Iki ust sablon da itisle
    // baslayinca, zaman butcesi son slotu kestiginde hafta toplami
    // itis 20 / cekis 10 cikiyordu — kesilen hep cekisti. Tek bir gunde
    // 3 hareket varsa denge zaten kurulamaz (2-1 olur); denge GUNLER
    // ARASINDA kurulur: A itis agirlikli, B cekis agirlikli.
    // Itis fazlaligi omuz ekleminin en bilinen risk kalibidir.
    { ad: 'Üst Vücut B', patterns: ['pull_h', 'push_v', 'pull_v', 'push_h', 'core', 'iso'], focus: UST },
    { ad: 'Alt Vücut B', patterns: ['hinge', 'squat', 'lunge', 'core', 'iso'], focus: ALT, agirBacak: true },
  ],
  ppl: [
    { ad: 'İtme', patterns: ['push_h', 'push_v', 'push_h', 'core', 'iso'], focus: ['chest', 'shoulders', 'triceps'] },
    { ad: 'Çekme', patterns: ['pull_v', 'pull_h', 'pull_h', 'core', 'iso'], focus: ['back', 'biceps'] },
    { ad: 'Bacak', patterns: ['squat', 'hinge', 'lunge', 'core', 'iso'], focus: ALT, agirBacak: true },
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

/**
 * HAFTA ICI DALGALANMA — gunluk undulating periyodizasyon (18 Agu 2026).
 *
 * Dokumanda "bilinen sinir" olarak duruyordu: *"Periyodizasyon yok. Hafta ici
 * dalgalanma (agir/orta/hafif gun) modellenmiyor."*
 *
 * ⚠️ SORUN 2x/HAFTA FREKANSIN YAN URUNU. Motor ayni ana kaldirisi haftada iki
 * kez veriyor (dogru), ama IKISINI DE 3-5 tekrar / RPE 8'de veriyordu.
 * Ayni kalibi haftada iki kez maksimum yukte calismak toparlanma kapasitesini
 * asar: ikinci seansta uretilen guc duser, teknik bozulur, kazanc birinci
 * seansin altina iner. Frekansi artirmanin sarti, seans SIDDETINI dagitmaktir.
 *
 * Kural: ayni kalip (squat/hinge/push_h/...) kademe 1 olarak haftada ikinci
 * kez geldiginde ORTA gun olur.
 *
 *   AGIR gun  → kademe araligi (orn. 3-5), RPE 7-8   · sinir sistemi
 *   ORTA gun  → aralik +3/+4 (orn. 6-9), RPE 7       · hacim ve teknik
 *
 * ⚠️ Yalniz KADEME 1'e uygulanir. Yardimci ve izolasyon zaten orta-yuksek
 * tekrarda; onlari da dalgalandirmak uyarani seyreltir, dagitmaz.
 * ⚠️ Patlayici is DISARIDA: onun olcusu hiz, dalgalandirilmaz.
 * ⚠️ Bir kez uygulanir (buildProgram) — advanceProgram tekrar cagirmaz,
 * yoksa aralik her hafta 3 tekrar buyur.
 */
const PROGRAM_ORTA_ARTIS = { min: 3, max: 4 };

function programUndulate(p, G, workouts, bw, bwMax) {
  const lib = (id) => PROGRAM_EXERCISES.find(x => x.id === id) || {};
  const gunler = (p.days || []).filter(d => d.type === 'strength')
    .slice().sort((a, b) => (a.dow === 0 ? 7 : a.dow) - (b.dow === 0 ? 7 : b.dow));

  // Ayni kalibin haftadaki tum kademe-1 girisleri
  const kaliplar = {};
  for (const d of gunler) {
    for (const e of (d.exercises || [])) {
      if (e.explosive || e.sure || (e.tier || 3) !== 1) continue;
      const k = lib(e.id).pattern;
      if (!k) continue;
      (kaliplar[k] = kaliplar[k] || []).push(e);
    }
  }

  for (const k of Object.keys(kaliplar)) {
    const liste = kaliplar[k];
    if (liste.length < 2) { liste[0].yuk = 'agir'; continue; }
    // ⚠️ AGIR GUNU HAFTANIN ILK GUNUNE DEGIL, EN IYI HAREKETE VER.
    // Ayni kalibin iki farkli hareketi olabilir (hinge = hip thrust + RDL).
    // Gun sirasina gore secince motor hip thrust'i agir, RDL'yi orta
    // yapiyordu — transferi yuksek olan hareket hafif gune dusuyordu.
    // Sira: transfer puani (pri) yuksek olan AGIR. Beraberlikte hafta sirasi.
    const sirali = liste.slice().sort((a, b) => (lib(b.id).pri || 2) - (lib(a.id).pri || 2));
    sirali[0].yuk = 'agir';
    for (let i = 1; i < sirali.length; i++) {
      const e = sirali[i];
      e.yuk = 'orta';
      e.repMin = Number(e.repMin) + PROGRAM_ORTA_ARTIS.min;
      e.repMax = Number(e.repMax) + PROGRAM_ORTA_ARTIS.max;
      // ⚠️ Tekrar araligi degisince AGIRLIK da degismeli. Ayni kiloyu
      // 3-5 yerine 6-9 tekrar yapmak "orta gun" degil "basarisiz agir gun".
      const yeniKg = programStartWeight(lib(e.id), e.repMin, workouts);
      if (yeniKg != null) e.kg = yeniKg;
      // Vucut agirligi hareketinde de ek yuk yeni tekrara gore hesaplanir
      const yeniBw = programBodyweightCue(
        e.id, bw, Number((bwMax || {})[PROGRAM_BW_TEST[e.id]]) || 0, e.repMin);
      if (yeniBw) {
        e.bwTip = yeniBw.tip; e.bwNot = yeniBw.not;
        if (yeniBw.tip === 'ekle') e.kg = yeniBw.kg;
        else if (yeniBw.tip === 'regresyon') e.kg = null;
      }
      // Orta gunde dinlenme de kisalir: yuk dustu, toparlanma daha hizli.
      // 30 sn adimina yuvarlanir — "2.25 dk" diye bir dinlenme yoktur.
      // ⚠️ Taban, agir gunun dinlenmesini ASLA GECEMEZ: kisa dinlenmeli
      // hedeflerde (genel form 60 sn) sabit 90 sn tabani, "hafif" gunu
      // agir gunden daha uzun dinlenmeli hale getiriyordu.
      const eskiRest = Number(e.rest) || 180;
      e.rest = Math.min(eskiRest, Math.max(45, Math.round(eskiRest * 0.7 / 30) * 30));
    }
  }
  const ortaVar = gunler.some(d => (d.exercises || []).some(e => e.yuk === 'orta'));
  void G;
  if (ortaVar) {
    p.notes.push('Aynı ana kaldırış haftada iki kez geliyor — ikisi de ağır olamaz. ' +
      'İkinci seans ORTA gün: tekrar aralığı yükseldi, ağırlık düştü, RPE 7. ' +
      'Frekansı artırmanın şartı şiddeti dağıtmaktır; iki seansı da zorlarsan ' +
      'ikincisinde ürettiğin güç düşer ve kazanç birincinin altına iner.');
  }
  return p;
}

/**
 * Bir hareketin tempo dizesi. Patlayici ve sure bazli hareketlerde tempo YOK
 * (birinin olcusu hiz, digerinin olcusu zaten sure).
 */
function programTempo(e) {
  if (!e || e.explosive || e.sure) return null;
  return PROGRAM_TEMPO[e.id] || PROGRAM_TEMPO_TIER[e.tier || 3] || '2-1-1-0';
}

/**
 * TEMPO + RPE'yi programin TAMAMINA uygula. Hafta bagimlidir, bu yuzden hem
 * buildProgram sonunda hem advanceProgram sonunda cagrilir (idempotent).
 *   - Teknik haftalarinda (ilk 2 hafta) RPE bir kademe duser: once hareket otursun.
 *   - Hafifletme (deload) haftasinda tavan 6 — amac toparlanmak.
 *   - Patlayici iste RPE YOK: olcu efor degil HIZ. "Zorlanana kadar" yapmak
 *     patlayici isin amacini bozar.
 */
function programApplyEffort(p) {
  if (!p) return p;
  const teknik = (Number(p.week) || 1) <= PLYO_LIMITS.teachWeeks;
  const deload = !!p.deload;
  for (const d of (p.days || [])) {
    for (const e of (d.exercises || [])) {
      e.tempo = programTempo(e);
      if (e.explosive) { e.rpe = null; continue; }
      // Boyun asla zorlanmaz — izometrik is, amaci hipertrofi degil koruma.
      let [a, b] = e.muscle === 'neck' ? [6, 7] : (PROGRAM_RPE[e.tier || 3] || [8, 8]);
      // ⚠️ ORTA gun (hafta ici dalgalanma): daha yuksek tekrar, daha dusuk
      // yuk, daha dusuk efor. Ust sinir agir gunun ALT sinirina cekilir.
      if (e.yuk === 'orta') b = a;
      if (teknik && e.muscle !== 'neck') { a -= 1; b -= 1; }
      if (deload) { a = Math.min(a, 6); b = Math.min(b, 6); }
      e.rpe = a === b ? String(a) : (a + '-' + b);
    }
  }
  return p;
}

/**
 * VUCUT AGIRLIGI KALIBRASYONU.
 * "Barfiks 4 × 3-5" yazmak, 2 barfiks cekebilen biri icin imkansiz; 20
 * cekebilen icin isinma. Motor bunu bilmeden yazmamali.
 *
 * Yontem barbell ile AYNI: Epley. Toplam yuk = vucut agirligi x hareket orani.
 *   e1RM = yuk x (1 + maxTekrar / 30)
 *   hedefYuk = e1RM / (1 + hedefTekrar / 30)
 *   ek = hedefYuk - yuk        (kemerle eklenecek kg; negatifse hareket agir geliyor)
 * Boylece ayni formul hem 1RM denemesi ISTEMEDEN calisir hem de tutarli kalir.
 */
function programBodyweightCue(id, bw, maxRep, repTarget) {
  const oran = PROGRAM_BW_LOAD[id];
  if (!oran || !(bw > 0) || !(maxRep > 0) || !(repTarget > 0)) return null;
  const yuk = bw * oran;
  const e1 = yuk * (1 + maxRep / 30);
  const hedefYuk = e1 / (1 + repTarget / 30);
  const ek = hedefYuk - yuk;
  if (ek >= 2.5) {
    return { tip: 'ekle', kg: Math.round(ek / 2.5) * 2.5,
      not: 'Kemerle +' + (Math.round(ek / 2.5) * 2.5) + ' kg ekle — vücut ağırlığı bu tekrar ' +
        'aralığı için hafif kalıyor (' + maxRep + ' tekrar çekebiliyorsun).' };
  }
  if (ek <= -3) {
    return { tip: 'regresyon',
      not: 'Bu tekrarı temiz yapamazsın (' + maxRep + ' tekrar maksimumun) — ' +
        (PROGRAM_BW_REGRES[id] || 'hareketi kolaylaştır') + '. Sayı değil TEKNİK kovala.' };
  }
  return { tip: 'uygun', not: null };
}

/**
 * SOGUMA / MOBILITE — programin ayri bir blogu, "unutulursa olur" degil.
 * ⚠️ STATIK GERME ANTRENMANDAN SONRA. Once yapilan uzun statik germe kuvvet
 * ve sicrama ciktisini gecici olarak DUSURUR — isinma dinamik olmali (bkz.
 * programWarmup), germe buraya aittir.
 * Dovus sporcusunda hedef bolgeler rastgele degil: kalca (tekme yuksekligi),
 * torasik (vurusun donusu), ayak bilegi (adim ve denge).
 */
function programCooldown(d, G) {
  const alt = !!d.agirBacak || (d.odak || []).indexOf('quads') >= 0;
  const out = [];
  if (alt) {
    out.push('Kalça fleksör germe 2 × 30 sn/taraf — tekme yüksekliğinin ilk sınırı burası');
    out.push('90/90 kalça dönüşü 8 tekrar/taraf');
    out.push('Ayak bileği duvar testi 10 tekrar/taraf');
  } else {
    out.push('Torasik açılım (foam roller ya da duvar) 10 tekrar — vuruşun dönüşü buradan gelir');
    out.push('Lat + göğüs germe 2 × 30 sn/taraf');
    out.push('Omuz dış rotasyon mobilitesi 10 tekrar/taraf');
  }
  if (G && G.athletic) out.push('Boyun serbest hareket: her yöne 5 yavaş tekrar — zorlama, uç noktada bekleme');
  out.push('⚠️ Statik germe seansın SONUNDA. Öncesinde yapılırsa kuvvet ve sıçrama çıktısı düşer.');
  return out;
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

// Iki gun haftalik donguda komsu mu? (Pazar ile Pazartesi de komsudur)
function programKomsuGun(a, b) {
  const x = Number(a), y = Number(b);
  return (x + 1) % 7 === y || (y + 1) % 7 === x;
}

/**
 * ⚠️ GUN YERLESTIRME CEZASI (18 Agu 2026) — motorun bulunan en agir hatasi.
 *
 * Eski kod agir bacak gununu yerlestirirken YALNIZ dovuse komsulugu
 * kontrol ediyordu; iki bacak gununun BIRBIRINE komsu olmasini hic
 * kontrol etmiyordu. Sonuc: 300 yapilandirmanin 120'sinde (%40) Pazar
 * ve Pazartesi arka arkaya agir bacak gunu cikiyordu — Pazar 4 set squat,
 * ertesi gun 3 set daha. Ayni kas grubunu 24 saat arayla agir yuklemek
 * toparlanmaya izin vermez; hipertrofi ve kuvvet uyarani degil yorgunluk
 * birikimi uretir.
 *
 * Ceza agirliklari SIRAYI belirler, mutlak deger degil:
 *   200 — ayni gune iki agir yuk (olmamali)
 *    90 — iki agir bacak gunu arka arkaya   ← eklenen kural
 *    70 — agir bacak gunu dovuse komsu       ← eski tek kural
 *    20 — iki ust gun arka arkaya (hafif; ust govde daha hizli toparlar)
 */
function programGunCezasi(dow, fightDays, yerlesikAlt, yerlesikUst, altMi) {
  let ceza = 0;
  if (altMi) {
    if (programLegClash(dow, fightDays)) ceza += 70;
    for (const g of yerlesikAlt) {
      if (g === dow) ceza += 200;
      else if (programKomsuGun(dow, g)) ceza += 90;
    }
  } else {
    for (const g of yerlesikUst) {
      if (g === dow) ceza += 200;
      else if (programKomsuGun(dow, g)) ceza += 20;
    }
    // Ust gun bacak gunune komsu olabilir — sorun degil, hafif tercih
    for (const g of yerlesikAlt) if (programKomsuGun(dow, g)) ceza += 4;
  }
  return ceza;
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
  // Vucut agirligi: beslenme hesaplayicisindan okunur, ayri soru sorulmaz.
  // ⚠️ BOY antrenman programlamasinda KULLANILMAZ. ROM'u etkiler ama hareket
  // secimini ya da hacmi degistirecek bir kanit yok — uydurma parametre eklemek
  // motoru bilimsel degil, bilimsel GORUNUMLU yapar.
  const bw = Number(c.bodyweight) ||
    (typeof data === 'object' && data && data.diet && data.diet.calc &&
      Number(data.diet.calc.weight)) || 0;
  const bwMax = (c.bwMax && typeof c.bwMax === 'object') ? c.bwMax : {};

  // Guc gunu sayisi: istenen, ama agir gun tavanina kirpilir
  let sd = Math.max(1, Math.min(PROGRAM_LIMITS.maxStrengthDays, Number(c.strengthDays) || 3));
  const kirpildi = (sd + fightDays.length) > PROGRAM_LIMITS.maxHardDaysWeek;
  if (kirpildi) sd = Math.max(1, PROGRAM_LIMITS.maxHardDaysWeek - fightDays.length);

  // Bolunme secimi
  const splitKey = sd <= 3 ? 'fullbody' : (sd === 4 ? 'upperlower' : 'ppl');
  const sablon = PROGRAM_SPLITS[splitKey];

  // ⚠️ SEANS SURESI: sabit "hareket sayisi" yerine GERCEK ZAMAN BUTCESI
  // (18 Agu 2026). Eski hesap en uzun dinlenmeyi her harekete uyguluyor,
  // 60 dk'lik atletik seansta kapasiteyi 4 harekete indiriyor ve sablonun
  // son slotlarini (core dahil) sessizce dusuruyordu. Artik her hareketin
  // suresi KENDI kademesinin dinlenmesiyle hesaplanir.
  const ISINMA_DK = 8;
  const PATLAYICI_DK = G.athletic ? 10 : 0;   // seans basindaki patlayici blok
  const butceSn = Math.max(300, (sessionMin - ISINMA_DK - PATLAYICI_DK) * 60);
  // ⚠️ %15 tolerans: butce sert bir duvar degil. Seans sonunda antagonist
  // superset uygulanip sure GERI kazanildigi icin (bkz. programPairSupersets)
  // secim asamasinda hafif tasmaya izin verilir; aksi halde ucuz ama degerli
  // son slotlar (core, izolasyon) 15 saniyelik farkla programdan dusuyordu.
  const butceTavan = butceSn * 1.15;
  const hareketSn = (tier, sets) => programHareketSn(programRest(G, tier), sets);

  const gunler = programAssignDays(sd, fightDays);
  const havuz = programExercisePool(places, avoid);
  const kullanilan = new Set();
  const kalipSayaci = {};   // 'hinge|1' -> kac kez kullanildi (hafta geneli)
  const aileSayaci = {};    // 'rdl' -> kac kez (alet farki cesitlilik degil)
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
  const yerlesikAlt = [], yerlesikUst = [];
  let bacakCakisma = false;
  // ⚠️ Once AGIR BACAK gunleri yerlesir (kisiti en dar olan onceliklidir),
  // her biri en dusuk cezali gunu alir. Beraberlikte hafta sirasi kazanir
  // -> secim DETERMINISTIK kalir.
  const yerlestir = (i, altMi) => {
    let enIyi = 0, enDusuk = Infinity;
    for (let j = 0; j < bosSlot.length; j++) {
      const c = programGunCezasi(bosSlot[j], fightDays, yerlesikAlt, yerlesikUst, altMi);
      if (c < enDusuk) { enDusuk = c; enIyi = j; }
    }
    const dow = bosSlot.splice(enIyi, 1)[0];
    eslesme[i] = dow;
    (altMi ? yerlesikAlt : yerlesikUst).push(dow);
    return enDusuk;
  };
  for (let i = 0; i < sd; i++) {
    if (!sablonlar[i].agirBacak) continue;
    const ceza = yerlestir(i, true);
    // Bacak-bacak komsulugu (90) hala kaldiysa bu ayri bir uyari: dovus
    // catismasindan (70) daha ciddi, cunku ayni kasi 24 saat arayla yukler.
    if (ceza >= 90) bacakCakisma = true;
    else if (ceza >= 70) uyarilar.push('bacak');
  }
  for (let i = 0; i < sd; i++) if (eslesme[i] === null) yerlestir(i, false);

  for (let i = 0; i < sd; i++) {
    const dow = eslesme[i];
    if (dow == null) continue;
    const sab = sablonlar[i];
    const odak = sab.focus || null;
    const secilenler = [];
    const gunKas = {};
    let harcanan = 0;
    for (let slot = 0; slot < sab.patterns.length; slot++) {
      const pat = sab.patterns[slot];
      if (secilenler.length >= PROGRAM_LIMITS.maxExercisesPerSession) break;
      // 'iso' serbest kalibi gunun odagiyla sinirlanir (bacak gununde yan
      // kaldiris cikmasin diye). ⚠️ CORE ODAKLA SINIRLANMAZ: govde her gune
      // aittir, ust gunun odagi (gogus/sirt/omuz) core'u eliyordu.
      const uygun = (e) => e.pattern === pat &&
        (!odak || pat !== 'iso' || odak.includes(e.muscle)) &&
        !secilenler.some(x => x.ex.id === e.id);
      // ⚠️ Eskiden "havuzdaki ilk uyan" seciliyordu — hep Bench Press cikiyordu.
      // Artik puanlama: ilk slot ANA KALDIRIS ister, sonraki slotlar yardimci/
      // izolasyona kayar, ayni kasi ust uste yuklemek cezalanir, dovus
      // sporcusunda tek tarafli is bonus alir. Beraberlikte kutuphane sirasi
      // kazanir -> secim hala DETERMINISTIK.
      const adaylar = havuz.filter(uygun);
      if (!adaylar.length) continue;
      let aday = null, enIyi = -Infinity;
      for (const e of adaylar) {
        const sk = programPickScore(e, slot, { kullanilan, gunKas, kalipSayaci, aileSayaci, athletic: !!G.athletic });
        if (sk > enIyi) { enIyi = sk; aday = e; }
      }
      if (!aday) continue;
      kullanilan.add(aday.id);
      gunKas[aday.muscle] = (gunKas[aday.muscle] || 0) + 1;
      const kAnahtar = aday.pattern + '|' + (aday.tier || 3);
      kalipSayaci[kAnahtar] = (kalipSayaci[kAnahtar] || 0) + 1;
      const kAile = programFamily(aday);
      aileSayaci[kAile] = (aileSayaci[kAile] || 0) + 1;
      const tier = aday.tier || 3;
      const setSayisi = (G.setsByTier && G.setsByTier[tier]) || 3;
      const sure = hareketSn(tier, setSayisi);
      // Zaman butcesi dolduysa bu slotu ATLA (donguyu kirma — sonraki slot
      // daha kisa olabilir). En az 3 hareket her zaman kalir; CORE ve gunun
      // ana kaldirisi butceye bakilmaksizin girer.
      if (harcanan + sure > butceTavan && secilenler.length >= 3 && pat !== 'core') {
        kullanilan.delete(aday.id);
        gunKas[aday.muscle] = Math.max(0, (gunKas[aday.muscle] || 1) - 1);
        kalipSayaci[kAnahtar] = Math.max(0, (kalipSayaci[kAnahtar] || 1) - 1);
        aileSayaci[kAile] = Math.max(0, (aileSayaci[kAile] || 1) - 1);
        continue;
      }
      harcanan += sure;
      const [tMin0, tMax0] = (G.tiers && G.tiers[tier]) || [G.repMin, G.repMax];
      // ⚠️ Hareketin kendi tekrar tabani kademe araligini EZER (hip thrust 3
      // tekrar yazilmaz). Aralik daralmasin diye tavan da birlikte kayar.
      const taban = PROGRAM_REP_FLOOR[aday.id] || 0;
      const tMin = Math.max(tMin0, taban);
      const tMax = Math.max(tMax0, tMin + 2);
      secilenler.push({
        ex: aday, tier,
        sets: setSayisi,
        repMin: tMin, repMax: tMax,
        reps: tMin,
        rest: programRest(G, tier),
        kg: programStartWeight(aday, tMin, workouts),
        bw: programBodyweightCue(aday.id, bw, Number(bwMax[PROGRAM_BW_TEST[aday.id]]) || 0, tMin),
      });
    }

    // ⚠️ ITIS / CEKIS DENGESI (18 Agu 2026) — bulunan ikinci hata.
    //
    // Sablonlar 2 itis + 2 cekis olacak sekilde KURULMUSTU, ama zaman
    // butcesi son slotlari kesince kesilen hep CEKIS oluyordu (her iki ust
    // sablonda da pull son siradaydi). 45 dk'lik programda hafta toplami
    // itis 20 / cekis 10 cikiyordu — 300 yapilandirmanin 114'unde bozuk.
    //
    // ⚠️ YON ONEMLI: eksik olan CEKIS. Itis fazlaligi omuz eklemi icin
    // en bilinen risk kalibidir (on omuz ve gogus kisalir, skapula
    // kontrolu zayiflar); bench-agirlikli programlarin klasik sorunu.
    // Kural: bir gunde itis, cekisi EN FAZLA 1 gecebilir. Asarsa en az
    // degerli itis hareketi cekisle DEGISTIRILIR — hareket sayisi ve
    // seans suresi degismez, yalnizca kalip degisir.
    // Olcu HAREKET SAYISI degil SET: gucte kademe 1'e 5 set veriliyor,
    // "2 itis 1 cekis" gunu 10'a 5 set demek. Ayrica degisiklik dengeyi
    // GERCEKTEN iyilestirmiyorsa yapilmaz (3 harekette 2-1 kacinilmazdir;
    // orada denge gunler arasinda kurulur, bkz. UST B sablonu).
    const setTop = (grup) => secilenler
      .filter(x => grup.has(x.ex.pattern)).reduce((a, x) => a + x.sets, 0);
    for (let tur = 0; tur < 4; tur++) {
      const itisler = secilenler.filter(x => PROGRAM_ITIS.has(x.ex.pattern));
      const cekisler = secilenler.filter(x => PROGRAM_CEKIS.has(x.ex.pattern));
      const fark = setTop(PROGRAM_ITIS) - setTop(PROGRAM_CEKIS);
      if (fark <= 2 || !itisler.length) break;
      // Cikarilacak: en yuksek kademeli (en az degerli) itis; esitlikte sondaki
      const cikar = itisler.slice()
        .sort((a, b) => ((a.tier || 3) - (b.tier || 3)))[itisler.length - 1];
      const yer = secilenler.indexOf(cikar);
      if (yer < 0) break;
      // Degisiklik dengeyi iyilestirmiyorsa yapma (isaret degistirip ayni
      // buyuklukte kalmak kazanc degil).
      if (Math.abs(fark - 2 * cikar.sets) >= Math.abs(fark)) break;
      const cAdaylar = havuz.filter(e => PROGRAM_CEKIS.has(e.pattern) &&
        !secilenler.some(x => x.ex.id === e.id));
      if (!cAdaylar.length) break;
      // Cikan hareketin defterini geri al ki puanlama dogru olsun
      kullanilan.delete(cikar.ex.id);
      gunKas[cikar.ex.muscle] = Math.max(0, (gunKas[cikar.ex.muscle] || 1) - 1);
      const eskiK = cikar.ex.pattern + '|' + (cikar.tier || 3);
      kalipSayaci[eskiK] = Math.max(0, (kalipSayaci[eskiK] || 1) - 1);
      const eskiA = programFamily(cikar.ex);
      aileSayaci[eskiA] = Math.max(0, (aileSayaci[eskiA] || 1) - 1);

      let yeni = null, enIyiC = -Infinity;
      for (const e of cAdaylar) {
        const sk = programPickScore(e, yer, { kullanilan, gunKas, kalipSayaci, aileSayaci, athletic: !!G.athletic });
        if (sk > enIyiC) { enIyiC = sk; yeni = e; }
      }
      if (!yeni) break;
      kullanilan.add(yeni.id);
      gunKas[yeni.muscle] = (gunKas[yeni.muscle] || 0) + 1;
      const yTier = yeni.tier || 3;
      kalipSayaci[yeni.pattern + '|' + yTier] = (kalipSayaci[yeni.pattern + '|' + yTier] || 0) + 1;
      aileSayaci[programFamily(yeni)] = (aileSayaci[programFamily(yeni)] || 0) + 1;
      const [yMin0, yMax0] = (G.tiers && G.tiers[yTier]) || [G.repMin, G.repMax];
      const yTaban = PROGRAM_REP_FLOOR[yeni.id] || 0;
      const yMin = Math.max(yMin0, yTaban);
      secilenler[yer] = {
        ex: yeni, tier: yTier,
        sets: (G.setsByTier && G.setsByTier[yTier]) || 3,
        repMin: yMin, repMax: Math.max(yMax0, yMin + 2), reps: yMin,
        rest: programRest(G, yTier),
        kg: programStartWeight(yeni, yMin, workouts),
        bw: programBodyweightCue(yeni.id, bw, Number(bwMax[PROGRAM_BW_TEST[yeni.id]]) || 0, yMin),
      };
    }

    // ⚠️ CORE GARANTISI (18 Agu 2026): sablonda core slotu varsa ama secim
    // sirasinda dusmusse ZORLA eklenir. Maliyeti ~3 dk; dovus sporcusunda
    // haftalik core = 0 set kabul edilebilir bir sonuc degil.
    if (sab.patterns.indexOf('core') >= 0 && !secilenler.some(x => x.ex.pattern === 'core')) {
      const coreAdaylar = havuz.filter(e => e.pattern === 'core' && !e.explosive &&
        !secilenler.some(x => x.ex.id === e.id));
      let cAday = null, cEnIyi = -Infinity;
      for (const e of coreAdaylar) {
        const sk = programPickScore(e, 4, { kullanilan, gunKas, kalipSayaci, aileSayaci, athletic: !!G.athletic });
        if (sk > cEnIyi) { cEnIyi = sk; cAday = e; }
      }
      if (cAday) {
        kullanilan.add(cAday.id);
        kalipSayaci['core|' + (cAday.tier || 3)] = (kalipSayaci['core|' + (cAday.tier || 3)] || 0) + 1;
        const cTier = cAday.tier || 3;
        const [cMin, cMax] = (G.tiers && G.tiers[cTier]) || [G.repMin, G.repMax];
        secilenler.push({
          ex: cAday, tier: cTier, sets: (G.setsByTier && G.setsByTier[cTier]) || 3,
          repMin: cMin, repMax: cMax, reps: cMin,
          rest: programRest(G, cTier), kg: null,
        });
      }
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
        repMin: s.repMin, repMax: s.repMax,
        tier: s.tier, uni: !!s.ex.uni,
        rest: s.rest,
        kg: (s.bw && s.bw.tip === 'ekle') ? s.bw.kg : s.kg,
        bwNot: (s.bw && s.bw.not) || null,
        bwTip: (s.bw && s.bw.tip) || null,
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
    bodyweight: bw || null,
    bwMax,
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
  if (bacakCakisma) {
    p.notes.push('İki ağır bacak günü arka arkaya düştü — haftada bu kadar ağır gün varken ' +
      'başka yer kalmadı. Aynı kası 24 saat arayla ağır yüklemek toparlanmaya izin vermez: ' +
      'ya güç günü sayısını 1 azalt ya da dövüş günlerinden birini kaydır.');
  }
  if (G.athletic) programAddExplosive(p);   // patlayici blok seansin BASINA
  programBalanceVolume(p, G);   // haftalik hacmi hedefin bandina otur
  programEnforceVolumeCap(p);   // 16 yas tavani: rapor degil, ZORLA
  programEnforceContacts(p);    // temas butcesi: dovus gunleri dahil
  for (const d of p.days) if (d.type === 'strength') {
    d.warmup = programWarmup(d, G);
    d.cooldown = programCooldown(d, G);
  }
  programUndulate(p, G, workouts, bw, bwMax);   // hafta ici agir/orta dalgalanmasi
  programApplyEffort(p);
  // ⚠️ SURE DURUSTLUGU (18 Agu 2026). Motor "60 dk" diyen kullaniciya 77 dk'lik
  // seans yaziyor ve bunu SOYLEMIYORDU. Atletik hedefte ana kaldirislarda 3 dk
  // dinlenme sart oldugu icin 3 agir hareket tek basina 45 dk eder.
  // Once bilimsel cozum denenir (antagonist superset), yetmiyorsa DURUSTCE
  // sure yazilir — sessizce kirpmak da, susmak da yanlis.
  const hedefDk = Math.max(20, sessionMin - ISINMA_DK);
  const tasan = [];
  for (const d of p.days) {
    if (d.type !== 'strength') continue;
    if (programSessionMinutes(d) > hedefDk) programPairSupersets(d, hedefDk);
    d.estMin = programSessionMinutes(d) + ISINMA_DK;
    if (d.estMin > sessionMin + 3) tasan.push(d.estMin);
  }
  if (p.days.some(d => d.type === 'strength' && (d.exercises || []).some(e => e.pair))) {
    p.notes.push('Seans süreye sığsın diye bazı hareketler EŞLEŞTİRİLDİ (aynı harfli ' +
      'olanlar): itiş–çekiş dönüşümlü yapılır. A1 → 45-60 sn → A2 → tam dinlenme → tekrar. ' +
      'Çalışan kasın dinlenmesi kısalmaz, sadece boş bekleme dolar. ' +
      'Dinlenmeyi kısaltmak yerine bunu tercih et — kısaltmak kuvvet çıktısını düşürür.');
  }
  if (tasan.length) {
    p.notes.push('Dürüst uyarı: seansların ' + Math.min.apply(null, tasan) + '-' +
      Math.max.apply(null, tasan) + ' dk sürüyor, sen ' + sessionMin + ' dk demiştin. ' +
      'Sebep uydurma değil: ağır ana kaldırışta 3 dk dinlenme patlayıcılık ve kuvvet ' +
      'için şart, kısaltırsan bu programın amacı kalmaz. İki gerçek seçenek var — ' +
      'ya süreyi ' + Math.max.apply(null, tasan) + ' dk’ya çıkar, ya da güç günü sayısını ' +
      'artırıp seans başına düşen hareketi azalt.');
  }
  p.conditioning = programConditioning(p);
  // Patlayici olcum hareketlerinde kg ZATEN olmaz (cm/m ile olculur) — sayma.
  const bwUyari = [];
  for (const d of p.days) {
    for (const e of (d.exercises || [])) {
      if (e.bwTip === 'regresyon' && bwUyari.indexOf(e.tr) < 0) bwUyari.push(e.tr);
    }
  }
  if (bwUyari.length) {
    p.notes.push('Vücut ağırlığı hareketlerinde mevcut kapasiten hedef tekrarı ' +
      'karşılamıyor (' + bwUyari.join(', ') + '). Kartta yazan kolaylaştırmayı kullan — ' +
      'yarım tekrar yapmak yerine hareketi kolaylaştırmak doğru olan.');
  } else if (bw > 0 && Object.keys(bwMax).length) {
    const ekleyenler = [];
    for (const d of p.days) for (const e of (d.exercises || [])) {
      if (e.bwTip === 'ekle' && ekleyenler.indexOf(e.tr) < 0) ekleyenler.push(e.tr);
    }
    if (ekleyenler.length) {
      p.notes.push('Şu hareketlerde vücut ağırlığın artık yetmiyor, ağırlık ekleniyor: ' +
        ekleyenler.join(', ') + '. Kilo kemeri ya da sırt çantası yeterli.');
    }
  }
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
/**
 * Hareket secim puani — deterministik, rastgelelik YOK.
 * Beraberlikte kutuphane sirasi kazanir, yani ayni girdi ayni programi verir.
 */
function programPickScore(e, slot, ctx) {
  const tier = e.tier || 3;
  let s = 0;
  // Slot 0 gunun ana kaldirisidir: agir, iki tarafli, yuklenebilir olsun.
  if (slot === 0) s += tier === 1 ? 45 : (tier === 2 ? 12 : 0);
  else if (slot === 1) s += tier === 1 ? 28 : (tier === 2 ? 22 : 6);
  else s += tier === 3 ? 16 : (tier === 2 ? 14 : 8);
  // ⚠️ HAREKET KALITESI CESITLILIKTEN ONCE GELIR (18 Agu 2026).
  // pri: 3 serbest temel bileske · 2 serbest yardimci · 1 makine/kablo.
  s += (e.pri || 2) * 12;
  // Cesitlilik: hafta icinde tekrarlanan hareketi geri plana at
  if (!ctx.kullanilan.has(e.id)) s += 20;
  // ⚠️ ASIL CESITLILIK KALIP DUZEYINDE. Eskiden sadece id'ye bakiliyordu, o
  // yuzden 'Romen Deadlift' ve 'Dambil Romen Deadlift' ayni haftaya birlikte
  // giriyordu — ikisi de ayni hareket, sadece alet farkli. Ayni KALIP + ayni
  // KADEME tekrari cezalandirilir; farkli kademe (agir squat + tek bacak
  // squat) serbest, cunku onlar gercekten farkli uyaran.
  // Ayni AILE (ayni hareketin baska aleti) — agir ceza, gercek tekrar.
  // ⚠️ 18 Agu 2026 — 2x/HAFTA FREKANS ARTIK CEZALANDIRILMIYOR.
  // Ana kaldirisin haftada ikinci kez tekrarlanmasi "cesitlilik eksigi" degil
  // DOGRU programlamadir; kas grubu basina 2 frekans yerlesik bilgidir.
  // Eski kural yuzunden motor ikinci bacak gununde squat yerine leg press
  // yaziyordu. Muafiyet DAR: yalniz AYNI hareketin (ayni id) kademe 1 olarak
  // IKINCI kez girmesi bedava. Ayni ailenin BASKA ALETLE tekrari (bar RDL +
  // dambil RDL) hala sahte cesitliliktir ve tam ceza alir. Ucuncu tekrar da.
  const aile = programFamily(e);
  const aileKez = (ctx.aileSayaci && ctx.aileSayaci[aile]) || 0;
  if (aileKez) {
    const frekansMuaf = ctx.kullanilan.has(e.id) && (e.tier || 3) === 1 && aileKez === 1;
    if (!frekansMuaf) s -= aileKez * 40;
  }
  // Ayni KALIP + KADEME — hafif ceza. Farkli kademe serbest: agir bilateral
  // squat ile tek bacak is gercekten farkli uyarandir.
  const anahtar = e.pattern + '|' + tier;
  s -= ((ctx.kalipSayaci && ctx.kalipSayaci[anahtar]) || 0) * 14;
  // Dovus sporcusu: tek bacak kuvveti ve asimetri kontrolu ayri deger tasir
  if (ctx.athletic && e.uni) s += 12;
  // Dovus sporcusunda ANTI-ROTASYON ve TASIMA isi, plank'tan once gelir:
  // govde donusune direnc ve tek tarafli yuk altinda pozisyon korumak
  // vurusa ve klinclere dogrudan aktarilir.
  if (ctx.athletic && (e.antiRot || e.pattern === 'carry')) s += 10;
  // Ayni kasi o gun ust uste yuklemeyi cezalandir
  s -= (ctx.gunKas[e.muscle] || 0) * 8;
  return s;
}

/**
 * ISINMA — patlayici ya da agir is yapan biri icin opsiyonel degil.
 * Eskiden hic yoktu; seans kapasitesi hesabinda 8 dk ayriliyordu ama
 * kullaniciya NE yapacagi hic soylenmiyordu.
 * ⚠️ Isinmaya sicrama KONMAZ — temas butcesini sessizce sisirir.
 */
function programWarmup(d, G) {
  const alt = !!d.agirBacak || (d.odak || []).indexOf('quads') >= 0;
  const out = ['5 dk hafif kardiyo — ip, bisiklet ya da hafif koşu'];
  if (G.athletic) out.push('Dinamik hareketlilik: kalça salınımı, bacak savurma, gövde rotasyonu (yavaş)');
  out.push(alt
    ? 'Kalça + ayak bileği hazırlığı: glute bridge 10, ayak bileği esnetme 10/taraf'
    : 'Omuz hazırlığı: bant dış rotasyon 15, scapula çekişi 10');
  const ana = (d.exercises || []).find(e => e.tier === 1 && !e.explosive);
  if (ana) {
    out.push('Ana kaldırışta (' + ana.tr + ') 2 ısınma seti: boş bar 8 tekrar, ' +
      'sonra çalışma ağırlığının ~%60’ı 5 tekrar. Bu setler sayıya girmez.');
  }
  return out;
}

/**
 * KONDISYON — dovus sporcusunda aerobik taban patlayicilik kadar onemli
 * (3 raundu cikarmak lazim), ama motor teknik/kondisyon seansinin ICERIGINI
 * yazmaz: o antrenorun isi. Burada sadece NE KADAR ve NEREYE sorusu var.
 *
 * Girisim etkisi (interference): uzun sureli yuksek siddetli kondisyon,
 * kuvvet/patlayicilik adaptasyonunu ayni gun icinde bastirir. Bu yuzden
 * kural: patlayici isten ONCE kondisyon YAPILMAZ, ayri gune ya da sonrasina.
 */
function programConditioning(p) {
  const dovus = (Array.isArray(p.fightDays) ? p.fightDays : []).length;
  const gucGun = (p.days || []).filter(d => d.type === 'strength').length;
  const bosGun = Math.max(0, 7 - dovus - gucGun);
  if (dovus >= 3) {
    return { seans: 0, not: 'Haftada ' + dovus + ' gün dövüş antrenmanın var — aerobik ' +
      'tabanı zaten o sağlıyor. Ayrıca koşu eklemek toparlanmayı yer, patlayıcılığı ' +
      'düşürür. Ekleme.' };
  }
  const seans = bosGun >= 2 ? 2 : 1;
  return { seans, not: seans + ' gün düşük şiddetli kondisyon ekleyebilirsin (20-30 dk, ' +
    'konuşabildiğin tempoda — ip, bisiklet, hafif koşu). ' +
    'Kuralı: patlayıcı/ağır seanstan ÖNCE yapma; dinlenme gününe ya da üst vücut ' +
    'gününün sonuna koy. Sert interval işini dövüş antrenmanına bırak.' };
}

/**
 * HACIM DENGESI — setsLow/setsHigh alanlari tanimliydi ama HIC KULLANILMIYORDU.
 * Herkese sabit 4/3 set veriliyordu; haftalik hacim hedefin kanita dayali
 * bandina denk gelip gelmedigi kontrol edilmiyordu.
 * Bu fonksiyon bandin ALTINDA kalan kasa set ekler, USTUNDE kalandan alir.
 * Hareket UYDURMAZ — sadece programda zaten olan hareketin setini oynatir.
 */
// Alt govde kaslari — dovus antrenmani bunlari zaten yukluyor.
const PROGRAM_ALT_KAS = new Set(['quads', 'hams', 'glutes', 'calves']);
// ⚠️ Dovus gunu basina alt vucut set indirimi. Temas butcesinde kickboksu
// sayip kuvvet hacminde saymamak TUTARSIZDI: tekme atmak bacak isidir.
// 1.5 set/gun LITERATUR DEGERI DEGIL, muhafazakar tahmin.
const FIGHT_LEG_SETS = 1.5;

function programBalanceVolume(p, G) {
  const low = Number(G.setsLow) || 0, high = Number(G.setsHigh) || 99;
  const dovus = (Array.isArray(p.fightDays) ? p.fightDays : []).length;
  const altIndirim = Math.round(dovus * FIGHT_LEG_SETS);
  // Alt vucut bandi dovusle daralir; alt sinirin altina DUSMEZ.
  const altHigh = Math.max(low, high - altIndirim);
  const bandHigh = (m) => (PROGRAM_ALT_KAS.has(m) ? altHigh : high);
  // Ayri hacim hedefi DEGIL: boyun sabit, core/baldir kucuk, kalca ise squat ve
  // hinge tarafindan zaten dolayli calisiyor; biseps/triseps cekis-itisten payini alir.
  const ATLA = new Set(['neck', 'core', 'calves', 'glutes', 'biceps', 'triceps']);
  const hareketler = (m) => {
    const out = [];
    for (const d of p.days || []) {
      for (const e of d.exercises || []) if (e.muscle === m && !e.explosive) out.push(e);
    }
    return out;
  };
  const eklendi = [], kirpildi = [];
  for (let tur = 0; tur < 60; tur++) {
    const sets = programWeeklySets(p);
    const kaslar = Object.keys(sets).filter(m => !ATLA.has(m));
    // ⚠️ 18 Agu 2026: eskiden SADECE en dusuk kas alinip, ona set eklenemezse
    // dongu kiriliyordu — band altindaki diger kaslar hic denenmiyordu
    // (arka bacak tavana dayaninca gogus 7 sette unutuluyordu).
    const dusukler = kaslar.filter(m => sets[m] < low).sort((a, b) => sets[a] - sets[b]);
    const yuksek = kaslar.filter(m => sets[m] > bandHigh(m))
      .sort((a, b) => sets[b] - sets[a])[0];
    const dusuk = dusukler[0];
    if (!dusuk && !yuksek) break;
    let eklendiTur = false;
    for (const mKas of dusukler) {
      // ⚠️ SET EKLERKEN KADEME ONEMLI (18 Agu 2026). Eskiden "en az setli
      // hareket" seciliyordu ve bu hep IZOLASYONA denk geliyordu: Leg Curl
      // 4 sete cikiyor, Lunge 2 sette kaliyordu. Dovus sporcusunda tek
      // tarafli bileske isin degeri izolasyonun onundedir. Sira: 2 > 1 > 3.
      const ONCELIK_EKLE = { 2: 0, 1: 1, 3: 2 };
      // Tek harekette set tavani 5. Bir kasi tek hareket tasiyorsa (orn.
      // arka bacagi sadece RDL) motor bandi TUTTURAMAZ — ve tutturmak icin
      // tek harekete 6-7 set yiginmak dogru cozum degil: 16 yasta, ustelik
      // haftada 2 gun kickboks varken tek seansta 6 set RDL arka zincir
      // yorgunlugunu gereksiz yukseltir. Motor 5'te durur ve DURUMU SOYLER.
      const aday = hareketler(mKas).filter(e => e.sets < 5)
        .sort((a, b) => (ONCELIK_EKLE[a.tier || 3] - ONCELIK_EKLE[b.tier || 3]) ||
                        (a.sets - b.sets))[0];
      if (aday) {
        aday.sets += 1;
        if (eklendi.indexOf(mKas) < 0) eklendi.push(mKas);
        eklendiTur = true;
        break;
      }
    }
    if (eklendiTur) continue;
    if (yuksek) {
      // ⚠️ KIRPARKEN SIRA: once izolasyon, esitlikte once MAKINE (18 Agu 2026).
      // Eskiden iki kademe-1 hareket esit oldugunda dizi sonundaki kirpiliyor,
      // sonuc olarak SQUAT 4->3 sete iniyor, Leg Press 4 sette kaliyordu.
      const __lib = id => PROGRAM_EXERCISES.find(x => x.id === id) || {};
      const aday = hareketler(yuksek).filter(e => e.sets > 2)
        .sort((a, b) => ((b.tier || 3) - (a.tier || 3)) ||
                        ((__lib(a.id).pri || 2) - (__lib(b.id).pri || 2)) ||
                        (b.sets - a.sets))[0];
      if (aday) {
        aday.sets -= 1;
        if (kirpildi.indexOf(yuksek) < 0) kirpildi.push(yuksek);
        continue;
      }
    }
    break;   // yapilabilecek bir sey kalmadi
  }
  // ⚠️ Sessiz kalma: hacim degistiyse SEBEBIYLE birlikte soyle.
  const ad = (m) => PROGRAM_MUSCLES[m] || m;
  if (kirpildi.length) {
    const altVar = kirpildi.some(m => PROGRAM_ALT_KAS.has(m));
    p.notes.push('Haftalık set tavanı aşılmasın diye hacim düşürüldü: ' +
      kirpildi.map(ad).join(', ') + '. Hedefin bandı ' + low + '-' + high + ' set.' +
      ((altVar && altIndirim) ? ' Alt vücutta tavan ' + altHigh + ' sete çekildi — ' +
        'haftada ' + dovus + ' gün dövüş antrenmanın bacağı zaten yüklüyor (tekme bacak işidir).' : ''));
  }
  if (eklendi.length) {
    p.notes.push('Şu kaslarda haftalık hacim hedefin alt bandının (' + low + ' set) ' +
      'altında kalıyordu, set eklendi: ' + eklendi.map(ad).join(', ') + '.');
  }
  // ⚠️ ANTAGONIST DENGE — CEKIS >= ITIS x 0.8 (18 Agu 2026).
  //
  // Kas bazli band tek basina yetmiyor: ITIS iki kasa bolunuyor (gogus +
  // omuz) ve her biri kendi bandini ayri ayri dolduruyor; CEKIS ise tek
  // etikette (sirt) toplaniyor ve tek band aliyor. Sonuc, sablon slotlari
  // 1-1 dengeli olsa bile hafta toplaminda itisin cekisi gecmesi.
  //
  // ⚠️ YON ONEMLI: eksik olan taraf CEKIS. Itis fazlaligi omuz ekleminin
  // en bilinen risk kalibidir — on omuz ve gogus kisalir, skapula kontrolu
  // zayiflar. Bench-agirlikli programlarin klasik sorunu; dovus sporcusunda
  // ayrica klincte ve savunmada cekis kuvveti dogrudan is goruyor.
  //
  // Kural sert degil: cekis, itisin %80'ine cekilir. Kas tavani (20) ve
  // hareket basi 6 set siniri gecerli kalir — bu adim onlari EZEMEZ.
  const KALIP = (id) => (PROGRAM_EXERCISES.find(x => x.id === id) || {}).pattern;
  const ITIS_K = new Set(['push_h', 'push_v']), CEKIS_K = new Set(['pull_h', 'pull_v']);
  const kalipSet = (grup) => {
    let n = 0;
    for (const d of p.days || []) for (const e of d.exercises || []) {
      if (!e.explosive && grup.has(KALIP(e.id))) n += Number(e.sets) || 0;
    }
    return n;
  };
  const cekisEklendi = [];
  for (let tur = 0; tur < 20; tur++) {
    const itis = kalipSet(ITIS_K), cekis = kalipSet(CEKIS_K);
    if (!itis || cekis >= itis * 0.8) break;
    const setler = programWeeklySets(p);
    const adaylar = [];
    for (const d of p.days || []) for (const e of d.exercises || []) {
      if (e.explosive || !CEKIS_K.has(KALIP(e.id))) continue;
      if (e.sets >= 6) continue;
      if ((setler[e.muscle] || 0) >= PROGRAM_LIMITS.maxSetsPerMuscleWeek) continue;
      if ((setler[e.muscle] || 0) >= bandHigh(e.muscle)) continue;
      adaylar.push(e);
    }
    if (!adaylar.length) break;
    // Kademe onceligi eklemedekiyle ayni: 2 > 1 > 3
    const ONC = { 2: 0, 1: 1, 3: 2 };
    const aday = adaylar.sort((a, b) =>
      (ONC[a.tier || 3] - ONC[b.tier || 3]) || (a.sets - b.sets))[0];
    aday.sets += 1;
    if (cekisEklendi.indexOf(aday.tr) < 0) cekisEklendi.push(aday.tr);
  }
  if (cekisEklendi.length) {
    p.notes.push('Çekiş hacmi itişin gerisinde kalıyordu, set eklendi: ' +
      cekisEklendi.join(', ') + '. İtişin çekişi geçmesi omuz ekleminin en bilinen ' +
      'risk kalıbı — dövüşte klinç ve savunma da doğrudan çekiş işidir.');
  }

  // ⚠️ SESSIZ KALMA (18 Agu 2026): set ekleyecek hareket bulunamadiginda motor
  // hicbir sey demeden bandin altinda birakiyordu. Bu bir programlama hatasi
  // degil kutuphane/sure sinirinin sonucudur ama kullanici BILMELI.
  // ⚠️ 18 Agu 2026: bu not IKINCIL PAYI da sayar. Eskiden yalniz dogrudan
  // sete bakiyordu ve "arka bacak bandin altinda" diyordu — oysa ayni gunde
  // 4 set hip thrust var ve arka bacagi da yukluyor. Uyari teknik olarak
  // dogruydu ama kullaniciya olan bitenden daha kotu bir tablo gosteriyordu.
  const kalanSets = programWeeklySets(p);
  const kalanToplam = programWeeklySetsTotal(p);
  const eksikKalan = Object.keys(kalanSets)
    .filter(m => !ATLA.has(m) && (kalanToplam[m] || kalanSets[m]) < low).map(ad);
  if (eksikKalan.length) {
    p.notes.push('Şu kaslar hâlâ hedef bandın (' + low + ' set) altında: ' +
      eksikKalan.join(', ') + '. Sebep: o kası çalıştıran hareket sayısı ya da ' +
      'seans süresi yetmiyor. Seans süresini artırırsan ya da salon seçeneğini ' +
      'açarsan motor buraya hareket ekleyebilir. (Sayıma dolaylı çalışma da ' +
      'dahil: bir hareket ikincil olarak yüklediği kasa yarım set sayılır.)');
  }
  return p;
}

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

/**
 * Haftalik set — IKINCIL PAYLA birlikte (dogrudan 1, dolayli 0.5).
 * ⚠️ Yalniz durum raporu icin. Band zorlamasi ve 16 yas tavani
 * `programWeeklySets` (dogrudan set) uzerinden yurur.
 */
function programWeeklySetsTotal(p) {
  const out = {};
  for (const d of (p && p.days) || []) {
    for (const e of d.exercises || []) {
      if (e.explosive) continue;
      const s = Number(e.sets) || 0;
      out[e.muscle] = (out[e.muscle] || 0) + s;
      const ik = PROGRAM_IKINCIL[e.id];
      if (!ik) continue;
      for (const kas of Object.keys(ik)) {
        if (kas === e.muscle) continue;
        out[kas] = (out[kas] || 0) + s * ik[kas];
      }
    }
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 10) / 10;
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
    // ⚠️ 18 Agu 2026: 'compound' ikili bir bayrakti, kademe ayrimini gormuyordu.
    // Sira: once izolasyon (kademe 3), esitlikte once MAKINE, sonra cok setli.
    // Ana kaldiris (kademe 1, serbest agirlik) en son kirpilir.
    adaylar.sort((a, b) => {
      const at = a.tier || (lib(a.id).tier || 3), bt = b.tier || (lib(b.id).tier || 3);
      if (at !== bt) return bt - at;              // izolasyon once kirpilir
      const ap = lib(a.id).pri || 2, bp = lib(b.id).pri || 2;
      if (ap !== bp) return ap - bp;              // makine once kirpilir
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

/**
 * SEANS SURESI TAHMINI — dakika.
 * Bir setin maliyeti: dinlenme + ~45 sn calisma. Eslestirilmis (superset)
 * hareketlerde iki hareket TEK dinlenme penceresini paylasir.
 */
/**
 * Bir hareketin gercek suresi.
 * ⚠️ Eski model `set x (dinlenme + 45)` idi ve her hareket icin BIR fazla
 * dinlenme sayiyordu: son setten sonra o hareketin dinlenmesi degil, bir
 * sonraki harekete GECIS dinlenmesi vardir (farkli kas, ~60 sn yeter).
 * 4 set x 3 dk'lik bir kaldiriste fark 2 dk — seans basina 6-8 dk, yani
 * tam bir hareketlik yer. Bu yuzden onemli.
 */
function programHareketSn(rest, sets) {
  const n = Math.max(1, Number(sets) || 0);
  const r = Number(rest) || 90;
  return n * 45 + (n - 1) * r + 60;
}

function programSessionMinutes(d) {
  const ex = (d && d.exercises) || [];
  const ciftler = {};
  let sn = 0;
  for (const e of ex) {
    if (e.pair) { (ciftler[e.pair] = ciftler[e.pair] || []).push(e); continue; }
    sn += programHareketSn(e.rest, e.sets);
  }
  for (const k of Object.keys(ciftler)) {
    const g = ciftler[k];
    const sets = Math.max.apply(null, g.map(e => Number(e.sets) || 0));
    const rest = Math.max.apply(null, g.map(e => Number(e.rest) || 90));
    // Cift: iki hareketin CALISMA suresi toplanir, dinlenme PAYLASILIR.
    sn += sets * 45 * g.length + (Math.max(1, sets) - 1) * rest + 60;
  }
  return Math.round(sn / 60);
}

/**
 * ANTAGONIST SUPERSET — seans suresini kisaltmanin BILIMSEL yolu.
 *
 * Zit kalibi (itis <-> cekis) donusumlu yapmak, CALISAN KASIN dinlenmesini
 * kisaltmadan toplam sureyi ~%30-35 dusurur; kuvvet ciktisi duz setlere
 * kiyasla anlamli olarak dusmez. Alternatifi — herkesin yaptigi sey —
 * dinlenmeyi 90 sn'ye indirmektir; O kuvvet ciktisini gercekten dusurur.
 *
 * ⚠️ Kurallar:
 *   - AYNI kas ya da ayni kalip ASLA eslestirilmez (dinlenme amaci kalkar).
 *   - Patlayici is eslestirilmez: amaci maksimum hiz, tam dinlenme sart.
 *   - Alt vucut ana kaldirislari (squat/hinge) eslestirilmez — teknik
 *     yorgunlukla bozulur, risk kazanctan buyuk.
 *   - Yalnizca seans istenen sureye SIGMIYORSA uygulanir.
 */
const PROGRAM_ITIS = new Set(['push_h', 'push_v']);
const PROGRAM_CEKIS = new Set(['pull_h', 'pull_v']);

function programPairSupersets(d, hedefDk) {
  const ex = (d.exercises || []).filter(e => !e.explosive && !e.pair);
  const lib = id => PROGRAM_EXERCISES.find(x => x.id === id) || {};
  const kalip = e => lib(e.id).pattern;
  let harf = 65;   // 'A'
  // Once itis <-> cekis; sonra bileske <-> core (govde isi dolgu olarak ideal)
  const turler = [
    (a, b) => PROGRAM_ITIS.has(kalip(a)) && PROGRAM_CEKIS.has(kalip(b)),
    (a, b) => (PROGRAM_ITIS.has(kalip(a)) || PROGRAM_CEKIS.has(kalip(a))) && kalip(b) === 'core',
  ];
  for (const eslesir of turler) {
    for (let i = 0; i < ex.length; i++) {
      if (programSessionMinutes(d) <= hedefDk) return d;
      const a = ex[i];
      if (a.pair) continue;
      for (let j = 0; j < ex.length; j++) {
        const b = ex[j];
        if (i === j || b.pair) continue;
        if (a.muscle === b.muscle) continue;
        if (!eslesir(a, b) && !eslesir(b, a)) continue;
        const et = harf++;
        a.pair = String.fromCharCode(et);
        b.pair = String.fromCharCode(et);
        break;
      }
    }
  }
  return d;
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
/**
 * TEMAS BUTCESI SIDDETE GORE AGIRLIKLI (30 Agu 2026).
 *
 * ⚠️ ESKI HALI SADECE SAYIYORDU. `contact` bir hareketin tekrar basina kac kez
 * yere degdigiydi (pogo 1, makas sicrama 2). Sonuc: 60 pogo hop ile 60 DERINLIK
 * SICRAMASI ayni butceyi yiyordu — halbuki motorun kendi gerekcesi "5 derinlik
 * sicramasi ile 5 leg extension ayni set degildir" diyerek tam bunun tersini
 * savunuyor. Olcu birimi temas olunca da siddet farki kayboluyordu.
 *
 * `plyoW` = siddet agirligi. Dayanak dikey yer tepki kuvveti: cocuk/ergen
 * verisinde kosu ~1.7-1.9 BW, alcak sicrama ~3.0-3.5 BW, yuksek sicrama
 * ~3.3-3.8 BW (Brailey 2026). Alcak genlikli ayak bilegi isi bu bandin
 * altinda, sok yuklemesi ustunde.
 *
 * 🔴 AGIRLIKLAR TAHMIN. Literatur bir "temas esdegeri" katsayisi vermiyor;
 * sayilar vGRF siralamasindan turetildi ve muhafazakar secildi. Sira
 * dogru, mutlak degerler degil.
 */
function programContacts(e) {
  const c = Number(e.contact) || 0;
  if (!c) return 0;
  const w = Number(e.plyoW) || 1;
  const tek = Number(e.repMax) || Number(e.repMin) || 0;
  return (Number(e.sets) || 0) * tek * c * w;
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
      // ⚠️ Hesap programContacts()'ten gelir — formul iki yerde durursa
      // siddet agirligi gibi bir ekleme birini gunceller, otekini unutur.
      const temas = programContacts({ sets, repMax: reps, contact: aday.contact, plyoW: aday.plyoW });

      // Butce yetmiyorsa TEMAS URETEN hareketi atla, temassiz alternatif ara.
      if (temas > kalanTemas) {
        if (Number(aday.contact) || 0) temassizOldu.push(aday.tr);
        const alt = havuz.find(e => uygun(e) && !(Number(e.contact) || 0));
        if (!alt) continue;
        aday = alt;
      }
      const gercekTemas = programContacts({ sets, repMax: reps, contact: aday.contact, plyoW: aday.plyoW });
      kalanTemas -= gercekTemas;
      kullanilan.add(aday.id);
      secilenler.push({
        id: aday.id, tr: aday.tr, en: aday.en, muscle: aday.muscle,
        sets, repMin: teknik ? rMin : rMin, repMax: reps,
        kg: aday.metric === 'kg' ? null : undefined,
        explosive: true, pattern: aday.pattern, contact: Number(aday.contact) || 0,
        plyoW: Number(aday.plyoW) || 1,
        // Patlayici iste dinlenme TAM olmali: amac yorulmak degil, her
        // tekrarda maksimum hiz uretmek. Kisa dinlenme bunu imkansiz kilar.
        // 180 sn = notta ve Hevy'de yazan "2-3 dk" ile ayni deger.
        rest: 180,
        metric: aday.metric || 'reps', order: 0,
      });
    }

    for (const e of (d.exercises || [])) if (e.order == null) e.order = 1;
    d.exercises = secilenler.concat(d.exercises || []);
  });

  // Boyun: dovus sporunda kafa hizlanmasini (dolayisiyla konkusyon riskini)
  // azaltir. ⚠️ 18 Agu 2026: haftada 1 gundu, 2 gune cikti. Boyun da diger
  // kaslar gibi frekansa cevap verir ve izometrik is toparlanma maliyeti
  // neredeyse sifirdir — 1 seans koruyucu esik icin zayif kaliyordu.
  const boyun = havuz.find(e => e.pattern === 'neck');
  if (boyun) {
    const sirali = gucGunler.filter(d => !d.agirBacak).concat(gucGunler.filter(d => d.agirBacak));
    let kondu = 0;
    for (const g of sirali) {
      if (kondu >= 2) break;
      if ((g.exercises || []).some(e => e.muscle === 'neck')) { kondu++; continue; }
      g.exercises.push({
        id: boyun.id, tr: boyun.tr, en: boyun.en, muscle: 'neck',
        sets: 3, repMin: 15, repMax: 25, kg: null, sure: !!boyun.sure,
        rest: 60, metric: boyun.metric || 'sn', order: 2,   // izometrik tutus: saniye
      });
      kondu++;
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
    // ⚠️ Hacim sabit kalir ama HAFTA ilerler: teknik haftasi bitiyorsa RPE
    // yukselmeli. Erken cikista bunu atlamak, 10. haftada hala teknik haftasi
    // eforu yazmak demekti.
    programApplyEffort(yeni);
    return yeni;
  }

  // 1b) ⚠️ GECEN HAFTA HAFIFLETME IDIYSE HACMI GERI YUKLE.
  // Deload GECICIDIR. Bu blok olmadan set sayisi her deload'da x0.6 olup
  // bir daha yukselmiyordu — program haftalar icinde sessizce eriyordu
  // (10 haftada 74 -> 50 set ve orada kaliyordu).
  if (p.deload) {
    for (const d of yeni.days) {
      for (const e of d.exercises || []) {
        if (e.setsBase != null) { e.sets = e.setsBase; e.setsBase = null; }
      }
    }
    degisiklikler.push('hafifletme bitti — hacim normale döndü');
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

  // 3) Deload — İKİ tetikleyici var, ikisi de aynı hafifletmeyi uygular.
  //    a) PLANLI: her N. hafta. Yorgunluk birikimi performans düşene KADAR
  //       beklenmez; okul + dövüş + ağırlık yükünde bu şart.
  //    b) REAKTİF: 2 hafta üst üste ilerleme yoksa.
  const gelecekHafta = (Number(p.week) || 1) + 1;
  const planliDeload = PROGRAM_LIMITS.deloadEveryWeeks > 0 &&
    gelecekHafta % PROGRAM_LIMITS.deloadEveryWeeks === 0;
  yeni.stall = ilerleyen > 0 ? 0 : (Number(p.stall) || 0) + 1;
  const reaktifDeload = yeni.stall >= PROGRAM_LIMITS.deloadAfterStallWeeks;
  // ⚠️ ARKA ARKAYA IKI HAFIFLETME OLMAZ. Planli ve reaktif tetikleyiciler
  // ust uste denk gelebiliyordu (9. hafta durgunluk + 10. hafta planli);
  // sonuc iki hafta boyunca dusuk hacim = gereksiz gerileme.
  if ((planliDeload || reaktifDeload) && !p.deload) {
    for (const d of yeni.days) {
      for (const e of d.exercises || []) {
        if (e.setsBase == null) e.setsBase = e.sets;   // normal hacmi sakla
        e.sets = Math.max(2, Math.round(e.sets * PROGRAM_LIMITS.deloadVolumeFactor));
      }
    }
    yeni.stall = 0;
    yeni.deload = true;
    yeni.deloadReason = planliDeload ? 'planli' : 'durgunluk';
    degisiklikler.push(planliDeload
      ? 'PLANLI hafifletme haftası (her ' + PROGRAM_LIMITS.deloadEveryWeeks +
        '. hafta) — set sayısı düşürüldü. Ağırlığı düşürme, seti azalt; ' +
        'amaç toparlanmak, gerilemek değil.'
      : 'hafifletme haftası — 2 haftadır ilerleme yok, set sayısı düşürüldü');
  } else {
    yeni.deload = false;
    yeni.deloadReason = null;
  }

  yeni.week = (Number(p.week) || 1) + 1;
  yeni.updatedAt = Date.now();
  yeni.notes = degisiklikler.length
    ? []
    : ['Bu hafta ağırlık artışı yok. Aynı ağırlıkta bir tekrar daha yapmayı hedefle — ' +
       'ilerleme sadece ağırlıkla olmuyor.'];
  yeni.history = [{ week: p.week, at: Date.now(), changes: degisiklikler.slice(0, 8) }]
    .concat(p.history || []).slice(0, 12);
  // ⚠️ RPE hafta bagimlidir: teknik haftasi bitince yukselir, hafifletme
  // haftasinda 6'ya iner. Hacmi guncelleyip eforu guncellememek tutarsiz olurdu.
  programApplyEffort(yeni);
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

// Dinlenme metni: 180 -> "3 dk", 75 -> "75 sn"
function programRestText(sn) {
  const v = Number(sn) || 0;
  if (!v) return '';
  return v >= 120 ? (Math.round(v / 60 * 10) / 10) + ' dk' : v + ' sn';
}

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

// ============ HEVY'YE YAZ (9 Agu 2026) ============
// Tek yonlu disa aktarim: karar Aidan'da, uygulama kagidi Hevy'de.
// Hevy'de temsil EDILEMEYENLER (seans ici sira zorlamasi, temas butcesi)
// hareket notlarina yazilir — kullanici salonda okusun diye.
const HEVY_ROUTINES_ENDPOINT = 'https://aidan-pusher.fenerlisalim04.workers.dev/hevy-routines';

async function pushProgramToHevy() {
  const p = ensureProgram();
  if (!p) { showToast('Önce program kur.', 'warning'); return; }
  const key = (data.settings && data.settings.hevyKey || '').trim();
  if (!key) {
    showToast('Hevy anahtarı yok — Ayarlar → Hevy bölümünden ekle (Hevy Pro gerekiyor).', 'warning', 5000);
    return;
  }
  const btn = document.getElementById('progHevyBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Yazılıyor…'; }
  try {
    const token = await getSupaToken();
    if (!token) { showToast('Giriş gerekli — Ayarlar\'dan bulut girişi yap.', 'warning'); return; }
    p.hevy = p.hevy || {};
    const r = await fetch(HEVY_ROUTINES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        key, program: p,
        routines: p.hevy.routines || {},
        tplMap: p.hevy.tplMap || {},
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { showToast(j.error || ('Hevy hatası ' + r.status), 'error', 6000); return; }

    p.hevy = {
      folderId: j.folderId,
      routines: j.routines || {},
      tplMap: j.tplMap || {},
      syncedAt: Date.now(),
      week: p.week,
    };
    save();
    renderProgram();
    const n = (j.created || []).length, g = (j.updated || []).length;
    let msg = 'Hevy\'ye yazıldı — "Aidan" klasörü: ' +
      (n ? n + ' yeni rutin' : '') + (n && g ? ', ' : '') + (g ? g + ' güncellendi' : '');
    if ((j.customCreated || []).length) msg += ' · ' + j.customCreated.length + ' özel hareket oluşturuldu';
    showToast(msg, 'success', 6000);
    if ((j.unmatched || []).length) {
      showToast('Şu hareketler Hevy\'ye yazılamadı: ' + j.unmatched.slice(0, 3).join(', '), 'warning', 7000);
    }
  } catch (e) {
    showToast('Bağlantı hatası: ' + (e && e.message ? e.message : e), 'error', 5000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Hevy\'ye yaz'; }
  }
}

function programHevyLabel(p) {
  if (!p.hevy || !p.hevy.syncedAt) return '';
  const eskimis = p.hevy.week != null && p.hevy.week !== p.week;
  return '<div class="prog-hevy' + (eskimis ? ' stale' : '') + '">' +
    (eskimis
      ? 'Hevy\'deki rutinler ' + p.hevy.week + '. haftaya ait — program ilerledi, tekrar yaz.'
      : 'Hevy\'ye yazıldı (' + new Date(p.hevy.syncedAt).toLocaleDateString('tr-TR') + ') · "Aidan" klasörü') +
    '</div>';
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
    // Superset numaralandirmasi: A1 / A2 — ayni harf donusumlu yapilir.
    const ciftSayac = {};
    const ciftEtiket = {};
    for (const e of sirali) {
      if (!e.pair) continue;
      ciftSayac[e.pair] = (ciftSayac[e.pair] || 0) + 1;
      ciftEtiket[e.id + '|' + e.pair] = e.pair + ciftSayac[e.pair];
    }
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
      const ciftEt = e.pair ? (ciftEtiket[e.id + '|' + e.pair] || e.pair) : '';
      return '<div class="pd-ex' + (e.explosive ? ' pd-ex-pow' : '') +
        (e.pair ? ' pd-ex-pair' : '') +
        (e.bwTip === 'regresyon' ? ' pd-ex-reg' : '') + '">' +
        '<span class="pe-name">' +
          (ciftEt ? '<span class="pe-pair">' + escapeHtml(ciftEt) + '</span>' : '') +
          (e.explosive ? '<span class="pe-badge">patlayıcı</span>' : '') +
          (e.yuk ? '<span class="pe-yuk pe-yuk-' + escapeHtml(e.yuk) + '" title="' +
            (e.yuk === 'agir'
              ? 'Haftanın ağır seansı — düşük tekrar, yüksek yük'
              : 'Haftanın orta seansı — aynı kalıbın ikinci günü, yük düşük') +
            '">' + (e.yuk === 'agir' ? 'ağır' : 'orta') + '</span>' : '') +
          escapeHtml(e.tr) + '</span>' +
        '<span class="pe-sets">' + escapeHtml(programRepText(e)) + '</span>' +
        '<span class="pe-tempo" title="eksantrik-bekleme-konsantrik-bekleme">' +
          (e.tempo ? escapeHtml(e.tempo) : (e.explosive ? 'MAKS HIZ' : '—')) + '</span>' +
        '<span class="pe-rest">' + (e.rest ? escapeHtml(programRestText(e.rest)) : '—') + '</span>' +
        '<span class="pe-rpe">' + (e.rpe ? escapeHtml(e.rpe) : '—') + '</span>' +
        olcum +
        (e.bwNot ? '<span class="pe-bwnot">' + escapeHtml(e.bwNot) + '</span>' : '') +
        '</div>';
    }).join('');
    const baslik = '<div class="pd-ex pd-ex-head">' +
      '<span class="pe-name">Hareket</span>' +
      '<span class="pe-sets">Set × Tekrar</span>' +
      '<span class="pe-tempo">Tempo</span>' +
      '<span class="pe-rest">Dinlenme</span>' +
      '<span class="pe-rpe">RPE</span>' +
      '<span class="pe-kg">Yük</span></div>';
    const isinma = (d.warmup || []).length
      ? '<details class="pd-warm"><summary>Isınma · 8 dk</summary>' +
        d.warmup.map(w => '<div class="pw-row">' + escapeHtml(w) + '</div>').join('') + '</details>'
      : '';
    const soguma = (d.cooldown || []).length
      ? '<details class="pd-warm pd-cool"><summary>Soğuma · mobilite</summary>' +
        d.cooldown.map(w => '<div class="pw-row">' + escapeHtml(w) + '</div>').join('') + '</details>'
      : '';
    return '<div class="prog-day">' +
      '<div class="pd-head"><span class="pd-dow">' + escapeHtml(programDayLabel(d.dow)) + '</span>' +
      '<span class="pd-name">' + escapeHtml(d.name) + '</span>' +
      (d.estMin ? '<span class="pd-min">~' + d.estMin + ' dk</span>' : '') + '</div>' +
      isinma + '<div class="pd-list">' + baslik + satirlar + '</div>' + soguma + '</div>';
  }).join('');

  // ⚠️ Hacim satiri artik iki sayi gosteriyor: dogrudan set ve — farkliysa —
  // ikincil payla birlikte toplam. Hip thrust arka bacagi da yukler; yalniz
  // dogrudan seti gostermek olan bitenden kotu bir tablo cizer. Band ve
  // 16 yas tavani yine DOGRUDAN set uzerinden isler.
  const setsTop = programWeeklySetsTotal(p);
  const hacimHtml = Object.keys(sets).sort((a, b) => sets[b] - sets[a]).map(m => {
    const t = setsTop[m];
    const ek = (t != null && t > sets[m]) ? '<i>+' + Math.round((t - sets[m]) * 10) / 10 + '</i>' : '';
    return '<span class="prog-vol' + (sets[m] > PROGRAM_LIMITS.maxSetsPerMuscleWeek ? ' over' : '') +
      '" title="doğrudan ' + sets[m] + ' set' + (ek ? ' · dolaylı ' + (t - sets[m]) : '') + '">' +
      escapeHtml(PROGRAM_MUSCLES[m] || m) + ' <b>' + sets[m] + '</b>' + ek + '</span>';
  }).join('');
  // Yalniz ikincil pay alan kaslar (dogrudan hic set almamis)
  for (const m of Object.keys(setsTop)) {
    if (sets[m] != null) continue;
    void m;
  }

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
    (p.conditioning ? '<div class="prog-cond"><b>Kondisyon</b> ' +
      escapeHtml(p.conditioning.not) + '</div>' : '') +
    '<div class="prog-actions">' +
    '<button class="small" onclick="runProgramAdvance()">Haftayı ilerlet</button>' +
    '<button class="small secondary" onclick="openProgramSetup()">Yeniden kur</button>' +
    '<button class="small secondary" onclick="deleteProgram()">Sil</button>' +
    '<button class="small secondary" id="progHevyBtn" onclick="pushProgramToHevy()">Hevy\'ye yaz</button></div>' +
    programHevyLabel(p) +
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
    bwMax: (p && p.bwMax) ? Object.assign({}, p.bwMax) : {},
  };
  renderProgramSetup();
  const m = document.getElementById('programModal');
  // ⚠️ Sinif adi 'active' — CSS'te acilma kurali YALNIZ `.modal-overlay.active`.
  // 30 Agu 2026'ya kadar burada 'open' yaziyordu: modal hic acilmadi ve
  // 'Program kur' dugmesi sessizce hicbir sey yapmadi. Hata mesaji da yok,
  // cunku kod basariyla calisiyor — yalnizca gorunmez bir sinif ekliyordu.
  if (m) m.classList.add('active');
}

function closeProgramSetup() {
  const m = document.getElementById('programModal');
  if (m) m.classList.remove('active');
}

// Vucut agirligi max tekrar girdisi (barfiks / sinav / dips)
function progSetupBw(test, deger) {
  if (!_progSetup) return;
  const n = Math.max(0, Math.min(100, Math.floor(Number(deger) || 0)));
  _progSetup.bwMax = _progSetup.bwMax || {};
  if (n > 0) _progSetup.bwMax[test] = n; else delete _progSetup.bwMax[test];
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
    '<div class="prog-f"><label>Şu an kaç tekrar yapabiliyorsun?</label><div class="prog-nums">' +
    [['pullup', 'Barfiks'], ['pushup', 'Şınav'], ['dip', 'Dips']].map(t =>
      '<label class="prog-num"><span>' + t[1] + '</span>' +
      '<input type="number" min="0" max="100" inputmode="numeric" value="' +
      (s.bwMax && s.bwMax[t[0]] ? escapeHtml(String(s.bwMax[t[0]])) : '') +
      '" oninput="progSetupBw(\'' + t[0] + '\', this.value)"></label>').join('') +
    '</div><div class="prog-hint">Tek sette temiz yapabildiğin maksimum. Boş bırakabilirsin — ' +
    'yazarsan motor bu hareketleri sana göre ayarlar: yetmiyorsa kolaylaştırma önerir, ' +
    'fazla geliyorsa kemerle kaç kg ekleyeceğini yazar. 1RM denemesi asla istenmez.</div></div>' +
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
