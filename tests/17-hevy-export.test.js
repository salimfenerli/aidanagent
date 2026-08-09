/**
 * 17 — HEVY'YE PROGRAM YAZMA (9 Agu 2026)
 *
 * Salim: "hevy pro var zaten, uygulama hevy icine program yazabilir mi."
 * Hevy Public API'si gerekli her seyi veriyor: POST /v1/routines,
 * POST /v1/routine_folders ve kritik olan POST /v1/exercise_templates
 * (saglik topu rotasyonel atisi, pogo gibi hareketler Hevy kutuphanesinde YOK).
 *
 * ⚠️ MIMARI KARAR (bu dosyanin kilitledigi asil sey):
 * Hevy bir KAYIT DEFTERI, antrenor degil. Aidan'in kalite koruyucularinin cogu
 * Hevy'de temsil EDILEMEZ — seans ici sira orada sadece liste sirasi olur,
 * temas butcesi hic gorunmez. Bu yuzden aktarim TEK YONLU: karar Aidan'da
 * kalir, Hevy sadece uygulama kagidi olur. Hevy'den program GERI OKUNMAZ.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(ROOT, 'aidan-worker', 'worker.js'), 'utf8');
const programSrc = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8');

// worker'in saf Hevy yardimcilarini izole calistir
function hevyHelpers() {
  const ctx = { console, String, Number, Math, JSON, Object, Array, fetch: () => { throw new Error('ag yok'); } };
  vm.createContext(ctx);
  const bas = worker.indexOf('const HEVY_FOLDER');
  const son = worker.indexOf('async function handleHevyRoutinesApi');
  assert.ok(bas > 0 && son > bas, 'Hevy blogu bulunamadi');
  vm.runInContext('const HEVY_API = "https://api.hevyapp.com/v1";\n' + worker.slice(bas, son) +
    '\n;globalThis.__H = { HEVY_FOLDER, HEVY_MUSCLE, hevyExerciseType, hevyEquipment, hevyBuildExercises };', ctx);
  return ctx.__H;
}
const H = hevyHelpers();

// program motorundan gercek bir gun uret
function motor() {
  const ctx = {
    console, Date, Math, JSON, Number, String, Array, Object, Promise,
    document: { getElementById: () => null },
    escapeHtml: (s) => String(s), save() {}, showToast() {},
    today: () => '2026-08-09',
    shiftDateStr: (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); },
    data: {}, aidanPrompt: () => Promise.resolve(null), fetch: () => { throw new Error('ag yok'); },
  };
  vm.createContext(ctx);
  vm.runInContext(programSrc + '\n;globalThis.__S = { PROGRAM_EXERCISES, PROGRAM_MUSCLES };', ctx);
  return Object.assign(ctx, ctx.__S);
}
const M = motor();
const P = M.buildProgram(
  { goal: 'atletik', strengthDays: 4, sessionMin: 60, places: ['gym'], fightDays: [2, 4], avoid: [] }, []);
const GUN = P.days.find((d) => d.type === 'strength' && (d.exercises || []).length);

// her hareket icin sahte template id
const TPL = {};
for (const d of P.days) for (const e of d.exercises || []) TPL[e.id] = 'tpl-' + e.id;

// ---------------------------------------------------------------------------
describe('Hevy şema uyumu', () => {
  const TIPLER = ['weight_reps', 'reps_only', 'bodyweight_reps', 'bodyweight_assisted_reps',
    'duration', 'weight_duration', 'distance_duration', 'short_distance_weight'];
  const EKIPMAN = ['none', 'barbell', 'dumbbell', 'kettlebell', 'machine', 'plate',
    'resistance_band', 'suspension', 'other'];
  const KASLAR = ['abdominals', 'shoulders', 'biceps', 'triceps', 'forearms', 'quadriceps',
    'hamstrings', 'calves', 'glutes', 'abductors', 'adductors', 'lats', 'upper_back',
    'traps', 'lower_back', 'chest', 'cardio', 'neck', 'full_body', 'other'];

  test('kas eşlemesi Hevy enum\'una uyuyor', () => {
    for (const k of Object.keys(H.HEVY_MUSCLE)) {
      assert.ok(KASLAR.indexOf(H.HEVY_MUSCLE[k]) >= 0,
        k + ' -> ' + H.HEVY_MUSCLE[k] + ' Hevy MuscleGroup enum\'unda yok');
    }
  });

  test('bizim her kas grubumuzun karşılığı var', () => {
    for (const k of Object.keys(M.PROGRAM_MUSCLES)) {
      assert.ok(H.HEVY_MUSCLE[k], k + ' icin Hevy karsiligi yok — hareket yazilamaz');
    }
  });

  test('exercise_type ve equipment enum dışına çıkmıyor', () => {
    for (const e of M.PROGRAM_EXERCISES) {
      assert.ok(TIPLER.indexOf(H.hevyExerciseType(e)) >= 0, e.id + ': gecersiz exercise_type');
      assert.ok(EKIPMAN.indexOf(H.hevyEquipment(e)) >= 0, e.id + ': gecersiz equipment');
    }
  });

  test('süreli hareketler duration, sıçramalar reps_only', () => {
    const bul = (id) => M.PROGRAM_EXERCISES.find((x) => x.id === id);
    assert.strictEqual(H.hevyExerciseType(bul('plank')), 'duration');
    assert.strictEqual(H.hevyExerciseType(bul('neckiso')), 'duration');
    assert.strictEqual(H.hevyExerciseType(bul('cmj')), 'reps_only',
      'sicramaya kg alani verilmis — Hevy kilo sorar, olcum cm');
    assert.strictEqual(H.hevyExerciseType(bul('bench')), 'weight_reps');
  });

  test('ekipman adı hareketin İngilizce adından doğru türetiliyor', () => {
    const bul = (id) => M.PROGRAM_EXERCISES.find((x) => x.id === id);
    assert.strictEqual(H.hevyEquipment(bul('bench')), 'barbell');
    assert.strictEqual(H.hevyEquipment(bul('dbbench')), 'dumbbell');
    assert.strictEqual(H.hevyEquipment(bul('kbswing')), 'kettlebell');
    assert.strictEqual(H.hevyEquipment(bul('legpress')), 'machine');
    assert.strictEqual(H.hevyEquipment(bul('pushup')), 'none');
  });
});

// ---------------------------------------------------------------------------
describe('rutin gövdesi', () => {
  const ex = H.hevyBuildExercises(GUN, TPL, 180);

  test('gün boş dönmüyor', () => {
    assert.ok(ex.length >= 3, 'rutine sadece ' + ex.length + ' hareket girdi');
  });

  test('⚠️ SIRA korunuyor — patlayıcı iş listede EN ÜSTTE', () => {
    // Hevy sirayi zorlamaz, sadece listeler. O yuzden dogru sirada YAZMAK sart.
    const patIdx = ex.findIndex((x) => /PATLAYICI/.test(x.notes || ''));
    if (patIdx === -1) return;
    const normalIdx = ex.findIndex((x) => !/PATLAYICI/.test(x.notes || ''));
    assert.ok(patIdx < normalIdx, 'patlayici is agir hareketten sonra yazilmis');
  });

  test('set sayısı programdakiyle aynı', () => {
    for (const e of GUN.exercises) {
      const h = ex.find((x) => x.exercise_template_id === TPL[e.id]);
      if (!h) continue;
      assert.strictEqual(h.sets.length, e.sets, e.tr + ': set sayisi kaymis');
    }
  });

  test('tekrar aralığı rep_range olarak gidiyor', () => {
    const aralikli = GUN.exercises.find((e) => e.repMax > e.repMin && !e.sure);
    if (!aralikli) return;
    const h = ex.find((x) => x.exercise_template_id === TPL[aralikli.id]);
    assert.ok(h.sets[0].rep_range, 'rep_range yok — Hevy tek sayi gosterir');
    assert.strictEqual(h.sets[0].rep_range.start, aralikli.repMin);
    assert.strictEqual(h.sets[0].rep_range.end, aralikli.repMax);
    assert.strictEqual(h.sets[0].reps, null, 'hem reps hem rep_range gonderilmis');
  });

  test('süreli hareket duration_seconds ile gidiyor', () => {
    const sureli = GUN.exercises.find((e) => e.sure);
    if (!sureli) return;
    const h = ex.find((x) => x.exercise_template_id === TPL[sureli.id]);
    assert.ok(h.sets[0].duration_seconds > 0, 'sureli hareket tekrar olarak yazilmis');
    assert.ok(h.sets[0].rep_range == null);
  });

  test('patlayıcı harekete 180 sn dinlenme yazılıyor', () => {
    for (const x of ex) {
      if (/PATLAYICI/.test(x.notes || '')) {
        assert.strictEqual(x.rest_seconds, 180, 'patlayici iste tam dinlenme yok');
      }
    }
  });

  test('kalite kuralları NOT olarak taşınıyor (Hevy zorlayamaz)', () => {
    const pat = ex.find((x) => /PATLAYICI/.test(x.notes || ''));
    if (pat) {
      assert.ok(/maksimum hızla/i.test(pat.notes), 'hiz kurali yazilmamis');
      assert.ok(/Hız düştüğü an/i.test(pat.notes), 'seti bitirme kurali yazilmamis');
    }
    const ana = ex.find((x) => /Ana kaldırış/.test(x.notes || ''));
    if (ana) assert.ok(/ısınma seti/i.test(ana.notes));
  });

  test('eşleşmeyen hareket sessizce atlanıyor, çökmüyor', () => {
    const eksik = H.hevyBuildExercises(GUN, {}, 90);
    // ⚠️ deepStrictEqual KULLANMA — vm baglamindaki dizi farkli realm'den gelir,
    // prototipi eslesmez ve test yanlis kirmizi olur.
    assert.strictEqual(eksik.length, 0, 'sablon yokken bos dizi donmeli');
  });

  test('set sayısı 1-10 arasına kırpılıyor', () => {
    const bozuk = { exercises: [{ id: 'x', sets: 999, repMin: 5, repMax: 5 }] };
    const out = H.hevyBuildExercises(bozuk, { x: 't' }, 90);
    assert.ok(out[0].sets.length <= 10, 'Hevy\'ye 999 set gonderiliyor');
  });

  test('bozuk girdide çökmüyor', () => {
    for (const g of [{}, { exercises: [] }, { exercises: [{ id: 'x' }] }]) {
      assert.doesNotThrow(() => H.hevyBuildExercises(g, { x: 't' }, 90));
    }
  });
});

// ---------------------------------------------------------------------------
describe('worker uç noktası sözleşmesi', () => {
  test('/hevy-routines route\'a bağlı', () => {
    assert.ok(worker.indexOf("url.pathname === '/hevy-routines'") >= 0, 'endpoint route\'da yok');
    assert.ok(/async function handleHevyRoutinesApi/.test(worker));
  });

  test('auth zorunlu (token + allowUser)', () => {
    const i = worker.indexOf('async function handleHevyRoutinesApi');
    const blok = worker.slice(i, i + 1600);
    assert.ok(/verifyUser\(env, userToken\)/.test(blok), 'token dogrulamasi yok');
    assert.ok(/allowUser\(env, user\)/.test(blok), 'kullanici yetkisi kontrol edilmiyor');
  });

  test('403 iki farklı durumu AYIRIYOR (rutin limiti / Pro yok)', () => {
    const i = worker.indexOf('async function hevyCall');
    const blok = worker.slice(i, i + 1200);
    assert.ok(/rutin limitin dolu/i.test(blok), 'rutin limiti mesaji yok — kullanici neden basarisiz oldugunu bilemez');
    assert.ok(/Hevy Pro/i.test(blok), 'Pro uyarisi yok');
  });

  test('"Aidan" klasörü var olanı bulur, iki kez OLUŞTURMAZ', () => {
    const i = worker.indexOf('async function hevyEnsureFolder');
    const blok = worker.slice(i, i + 900);
    assert.ok(/routine_folders\?page=/.test(blok), 'once mevcut klasorler taranmiyor');
    assert.ok(blok.indexOf("f.title).trim() === HEVY_FOLDER") >= 0, 'var olan klasor aranmiyor');
  });

  test('özel hareket iki kez oluşturulmuyor (tplMap önbelleği)', () => {
    const i = worker.indexOf('async function handleHevyRoutinesApi');
    const blok = worker.slice(i, i + 3000);
    assert.ok(/onceki\[e\.id\]/.test(blok),
      'daha once olusturulan ozel hareket tekrar yaratiliyor — Hevy kutuphanesi kirlenir');
    assert.ok(/tplMap/.test(blok), 'tplMap geri dondurulmuyor');
  });

  test('rutin silinmişse yeniden oluşturuluyor (PUT hatası yutulmuyor)', () => {
    const i = worker.indexOf('async function handleHevyRoutinesApi');
    const blok = worker.slice(i, i + 5000);
    assert.ok(/method: 'PUT'/.test(blok), 'guncelleme yolu yok — her yazimda yeni rutin olusur');
    assert.ok(/Rutin silinmis olabilir/.test(blok), 'PUT basarisiz olursa yeniden olusturma yok');
  });

  test('sadece güç günleri yazılıyor (dövüş günü Hevy\'ye gitmez)', () => {
    const i = worker.indexOf('async function handleHevyRoutinesApi');
    const blok = worker.slice(i, i + 1800);
    assert.ok(/d\.type === 'strength'/.test(blok),
      'dovus gunu de rutin olarak yaziliyor — teknik calisma antrenorun isi');
  });
});

// ---------------------------------------------------------------------------
describe('PWA tarafı', () => {
  test('pushProgramToHevy tanımlı ve karta bağlı', () => {
    assert.ok(/async function pushProgramToHevy\(/.test(programSrc));
    assert.ok(/onclick="pushProgramToHevy\(\)"/.test(programSrc), 'dugme karta baglanmamis');
  });

  test('anahtar yoksa net uyarı veriyor', () => {
    const i = programSrc.indexOf('async function pushProgramToHevy');
    const blok = programSrc.slice(i, i + 900);
    assert.ok(/Hevy Pro/.test(blok), 'Pro gerektigi soylenmemis');
    assert.ok(/hevyKey/.test(blok));
  });

  test('sonuç kaydediliyor (routines + tplMap) — sonraki yazım GÜNCELLER', () => {
    const i = programSrc.indexOf('async function pushProgramToHevy');
    const blok = programSrc.slice(i, i + 2200);
    assert.ok(/routines: j\.routines/.test(blok), 'rutin id\'leri saklanmiyor -> her seferinde yeni rutin');
    assert.ok(/tplMap: j\.tplMap/.test(blok), 'ozel hareket haritasi saklanmiyor -> mukerrer hareket');
  });

  test('hafta ilerleyince "eskimiş" uyarısı çıkıyor', () => {
    assert.ok(/function programHevyLabel/.test(programSrc));
    assert.ok(/tekrar yaz/.test(programSrc),
      'Hevy\'deki rutin eskidiginde kullaniciya soylenmiyor');
  });

  test('AI çağrısı yok — program.js hâlâ deterministik', () => {
    // ⚠️ program.js'te fetch ARTIK VAR (Hevy aktarimi) ama AI cagrisi yok.
    assert.ok(!/\/chat|\/plan|\/health-coach|aiRun/.test(programSrc),
      'program.js bir AI ucuna baglanmis — motor kural tabanli kalmali');
    const fetchler = programSrc.match(/fetch\(([A-Z_]+)/g) || [];
    assert.deepStrictEqual([...new Set(fetchler)], ['fetch(HEVY_ROUTINES_ENDPOINT'],
      'program.js beklenmeyen bir uca istek atiyor');
  });
});

// ---------------------------------------------------------------------------
describe('Impeccable — Hevy rozeti', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const blok = css.slice(css.indexOf('.prog-hevy'));

  test('yan-şerit yok, saf renk yok, gradyan yok', () => {
    assert.ok(!/border-(left|right)\s*:\s*[2-9]/.test(blok));
    assert.ok(!/#fff\b|#000\b/i.test(blok));
    assert.ok(!/linear-gradient|backdrop-filter/.test(blok));
  });

  test('styles.css hâlâ LF', () => {
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'styles.css')).indexOf(Buffer.from('\r\n')), -1);
  });
});
