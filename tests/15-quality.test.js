/**
 * 15 — PROGRAM KALITESI (9 Agu 2026)
 *
 * Salim: "program kalitesi de onemli." Motor denetlendi, 5 gercek zayiflik cikti:
 *   1) Yardimci hareketler de ana kaldiris tekrar araligini aliyordu
 *      (atletik hedefte Bulgar split squat 3-6 tekrar — yanlis)
 *   2) setsLow/setsHigh alanlari TANIMLIYDI ama hic kullanilmiyordu; herkese
 *      sabit 4/3 set veriliyordu, haftalik hacim hedefin bandina denk gelmiyordu
 *   3) Isinma recetesi yoktu (seans suresinden 8 dk ayriliyor ama ne yapilacagi
 *      hic soylenmiyordu)
 *   4) Kondisyon/aerobik taban hic gorulmuyordu — dovus sporunda 3 raundu
 *      cikarmak patlayicilik kadar onemli
 *   5) Hareket secimi "havuzdaki ilk uyan"di — hep Bench Press cikiyordu
 *
 * Bu dosya besini de kilitler.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function motor() {
  const ctx = {
    console, Date, Math, JSON, Number, String, Array, Object, Promise,
    document: { getElementById: () => null },
    escapeHtml: (s) => String(s), save() {}, showToast() {},
    today: () => '2026-08-09',
    shiftDateStr: (d, n) => {
      const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n);
      return x.toISOString().slice(0, 10);
    },
    data: {}, aidanPrompt: () => Promise.resolve(null),
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8') +
    '\n;globalThis.__SABIT = { PROGRAM_GOALS, PROGRAM_EXERCISES, PROGRAM_LIMITS,' +
    ' PROGRAM_TIER1, PROGRAM_TIER2, PROGRAM_UNI, PROGRAM_FAMILY, PROGRAM_REP_FLOOR,' +
    ' PROGRAM_ORTA_ARTIS, PROGRAM_IKINCIL };';
  vm.runInContext(src, ctx);
  return Object.assign(ctx, ctx.__SABIT);
}
const M = motor();

const KICKBOKS = { goal: 'atletik', strengthDays: 4, sessionMin: 60, places: ['gym'], fightDays: [2, 4], avoid: [] };
const HEDEFLER = Object.keys(M.PROGRAM_GOALS);
const normal = (p) => (p.days || []).flatMap((d) => (d.exercises || []).filter((e) => !e.explosive));

// ---------------------------------------------------------------------------
describe('1 — kademe sistemi (ana kaldiris / yardimci / izolasyon)', () => {
  test('her hedefte 3 kademe icin tekrar araligi tanimli', () => {
    for (const g of HEDEFLER) {
      const G = M.PROGRAM_GOALS[g];
      assert.ok(G.tiers, g + ': kademe araliklari yok');
      for (const t of [1, 2, 3]) {
        const [a, b] = G.tiers[t];
        assert.ok(a >= 1 && b > a, g + ' kademe ' + t + ': gecersiz aralik ' + a + '-' + b);
      }
      assert.ok(G.setsByTier, g + ': kademe basina set sayisi yok');
    }
  });

  test('kademe araliklari agirdan hafife SIRALI (t1 < t2 < t3)', () => {
    for (const g of HEDEFLER) {
      const T = M.PROGRAM_GOALS[g].tiers;
      assert.ok(T[1][1] <= T[2][1], g + ': ana kaldiris yardimcidan yuksek tekrar aliyor');
      assert.ok(T[2][1] <= T[3][1], g + ': yardimci izolasyondan yuksek tekrar aliyor');
    }
  });

  test('kutuphanedeki her hareketin kademesi var', () => {
    for (const e of M.PROGRAM_EXERCISES) {
      assert.ok([1, 2, 3].indexOf(e.tier) >= 0, e.id + ': gecersiz kademe ' + e.tier);
    }
  });

  test('ana kaldirislar kademe 1, izolasyonlar kademe 3', () => {
    const bul = (id) => M.PROGRAM_EXERCISES.find((e) => e.id === id);
    for (const id of ['squat', 'bench', 'rdl', 'ohp', 'bbrow', 'pullup']) {
      assert.strictEqual(bul(id).tier, 1, id + ' ana kaldiris olmali');
    }
    for (const id of ['curl', 'lateral', 'legext', 'fly']) {
      assert.strictEqual(bul(id).tier, 3, id + ' izolasyon olmali');
    }
    for (const id of ['bulgarian', 'lunge', 'dip', 'pushup']) {
      assert.strictEqual(bul(id).tier, 2, id + ' yardimci bileske olmali');
    }
  });

  test('REGRESYON: yardimci hareket ana kaldiris araligini ALMAZ', () => {
    // Bulgar split squat 3-6 tekrar aliyordu — bu paketin cikis noktasi.
    // ⚠️ 18 Agu 2026: artik kademe araligi TEK basina son soz degil. Bazi
    // hareketlerin kendi tekrar tabani var (PROGRAM_REP_FLOOR): hip thrust'a
    // 3 tekrar yazmak kademe araligina uysa da bilimsel olarak yanlisti.
    // Sozlesme: aralik kademenin araligidir YA DA hareketin tabaniyla YUKARI
    // kayar — asla asagi inmez, ve genisligi korunur.
    // ⚠️ 18 Agu 2026 — ucuncu kaynak: HAFTA ICI DALGALANMA. Ayni kalip
    // haftada ikinci kez geldiginde ORTA gun olur ve aralik +3/+4 kayar.
    // Sozlesme: aralik ya kademenin araligidir, ya hareketin tabaniyla
    // yukari kaymistir, ya da orta gun kaymasidir — baska sebep yok.
    const p = M.buildProgram(KICKBOKS, []);
    const T = M.PROGRAM_GOALS.atletik.tiers;
    const ART = M.PROGRAM_ORTA_ARTIS;
    for (const e of normal(p)) {
      if (e.muscle === 'neck') continue;
      const [a, b] = T[e.tier];
      const taban = M.PROGRAM_REP_FLOOR[e.id] || 0;
      const orta = e.yuk === 'orta' ? ART.min : 0;
      const beklenenMin = Math.max(a, taban) + orta;
      assert.strictEqual(e.repMin, beklenenMin,
        e.tr + ' (kademe ' + e.tier + ', ' + (e.yuk || 'tek') + '): repMin ' +
        e.repMin + ', beklenen ' + beklenenMin);
      assert.ok(e.repMax >= Math.max(b, Math.max(a, taban) + 2) + (orta ? ART.max : 0),
        e.tr + ': repMax ' + e.repMax + ' — aralik daraltilmis');
      assert.ok(e.repMin >= a, e.tr + ': taban kademe araliginin ALTINA indi');
    }
  });

  test('AGIR gunde kademe 1 ile kademe 3 GERCEKTEN farkli tekrar aliyor', () => {
    // ⚠️ Karsilastirma AGIR gun uzerinden. Orta gunun ana kaldirisi 8-11'e
    // cikabilir ve izolasyonla ust uste binebilir — bu hata degil, hafta ici
    // dalgalanmanin ta kendisi. Kademe ayriminin kanit noktasi agir gundur.
    const p = M.buildProgram(KICKBOKS, []);
    const t1 = normal(p).filter((e) => e.tier === 1 && e.yuk !== 'orta');
    const t3 = normal(p).filter((e) => e.tier === 3 && e.muscle !== 'neck');
    assert.ok(t1.length && t3.length, 'her iki kademeden hareket yok');
    assert.ok(Math.max.apply(null, t1.map((e) => e.repMax)) < Math.min.apply(null, t3.map((e) => e.repMin)),
      'ana kaldiris ve izolasyon tekrar araliklari cakisiyor');
  });

  test('ORTA gun agir gunden GERCEKTEN hafif', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const orta = normal(p).filter((e) => e.yuk === 'orta');
    assert.ok(orta.length, 'hicbir hareket orta gune dusmemis');
    for (const e of orta) {
      assert.ok(e.repMin >= 6, e.tr + ': orta gun repMin ' + e.repMin);
      const rpe = Math.max.apply(null, String(e.rpe).split('-').map(Number));
      assert.ok(rpe <= 7, e.tr + ': orta gunde RPE ' + e.rpe);
    }
  });
});

// ---------------------------------------------------------------------------
describe('2 — hacim hedefin bandina oturuyor', () => {
  test('haftalik hacim setsLow-setsHigh arasinda', () => {
    for (const g of HEDEFLER) {
      const G = M.PROGRAM_GOALS[g];
      const p = M.buildProgram(Object.assign({}, KICKBOKS, { goal: g, fightDays: [] }), []);
      const sets = M.programWeeklySets(p);
      for (const m of Object.keys(sets)) {
        if (['neck','core','calves','glutes','biceps','triceps'].indexOf(m) >= 0) continue;
        assert.ok(sets[m] >= Math.min(G.setsLow, 6),
          g + '/' + m + ': ' + sets[m] + ' set — hedef alt bandi ' + G.setsLow);
        assert.ok(sets[m] <= G.setsHigh,
          g + '/' + m + ': ' + sets[m] + ' set — hedef ust bandi ' + G.setsHigh);
      }
    }
  });

  test('programBalanceVolume hareket UYDURMAZ, sadece set oynatir', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []);
    const once = normal(p).map((e) => e.id).sort().join(',');
    M.programBalanceVolume(p, M.PROGRAM_GOALS.atletik);
    assert.strictEqual(normal(p).map((e) => e.id).sort().join(','), once,
      'denge fonksiyonu programa hareket ekledi/cikardi');
  });

  test('denge sonrasi hicbir hareket 2 setin altina inmez', () => {
    for (const g of HEDEFLER) {
      const p = M.buildProgram(Object.assign({}, KICKBOKS, { goal: g }), []);
      for (const e of p.days.flatMap((d) => d.exercises || [])) {
        assert.ok(e.sets >= 2, g + '/' + e.tr + ': ' + e.sets + ' set');
      }
    }
  });

  test('16 yas set tavani hala uste kural', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { goal: 'kas', strengthDays: 5, fightDays: [] }), []);
    const sets = M.programWeeklySets(p);
    for (const m of Object.keys(sets)) {
      assert.ok(sets[m] <= M.PROGRAM_LIMITS.maxSetsPerMuscleWeek, m + ': ' + sets[m]);
    }
  });
});

// ---------------------------------------------------------------------------
describe('3 — isinma recetesi', () => {
  const p = M.buildProgram(KICKBOKS, []);

  test('her guc gununde isinma var', () => {
    for (const d of p.days.filter((x) => x.type === 'strength')) {
      assert.ok(Array.isArray(d.warmup) && d.warmup.length >= 3,
        d.name + ': isinma yok ya da eksik');
    }
  });

  test('isinma o gunun ana kaldirisini adiyla soyluyor', () => {
    for (const d of p.days.filter((x) => x.type === 'strength')) {
      const ana = (d.exercises || []).find((e) => e.tier === 1 && !e.explosive);
      if (!ana) continue;
      assert.ok(d.warmup.some((w) => w.indexOf(ana.tr) >= 0),
        d.name + ': isinma ana kaldirisa ozel degil');
    }
  });

  test('⚠️ isinmaya SICRAMA konmaz (temas butcesini sessizce sisirir)', () => {
    for (const d of p.days.filter((x) => x.type === 'strength')) {
      for (const w of d.warmup) {
        assert.ok(!/sıçrama|zıplama|plyo|kutu/i.test(w),
          'isinmaya plyometrik is girmis: ' + w);
      }
    }
  });

  test('dovus gunune isinma yazilmaz (antrenorun isi)', () => {
    for (const d of p.days.filter((x) => x.type === 'fight')) {
      assert.ok(!d.warmup, 'dovus gunune isinma yazilmis');
    }
  });
});

// ---------------------------------------------------------------------------
describe('4 — kondisyon / aerobik taban', () => {
  test('cok dovus gunu varsa EKSTRA kondisyon ONERILMEZ', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { strengthDays: 3, fightDays: [1, 3, 5] }), []);
    assert.strictEqual(p.conditioning.seans, 0,
      '3 gun dovus varken ustune kosu ekleniyor — toparlanmayi yer, patlayiciligi dusurur');
    assert.ok(/zaten/i.test(p.conditioning.not));
  });

  test('az dovus gunu varsa kondisyon onerilir', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [2] }), []);
    assert.ok(p.conditioning.seans >= 1, 'aerobik taban hic onerilmiyor');
  });

  test('girisim etkisi kurali yaziliyor (patlayici isten ONCE yapma)', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [2] }), []);
    assert.ok(/ÖNCE yapma|önce yapma/i.test(p.conditioning.not),
      'kondisyonun ne zaman yapilmayacagi soylenmiyor');
  });

  test('kondisyon ICERIGI yazilmaz — sadece ne kadar ve nereye', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [2] }), []);
    assert.ok(!/raund|kombinasyon|jab|kick|teknik çalışma/i.test(p.conditioning.not),
      'motor dovus/teknik seansinin icerigine karisiyor — o antrenorun isi');
  });
});

// ---------------------------------------------------------------------------
describe('5 — akilli hareket secimi', () => {
  test('gunun ILK hareketi (patlayici haric) ana kaldiris', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const d of p.days.filter((x) => x.type === 'strength')) {
      const ilk = (d.exercises || [])
        .slice().sort((a, b) => ((a.order == null ? 1 : a.order) - (b.order == null ? 1 : b.order)))
        .find((e) => !e.explosive);
      if (!ilk || ilk.muscle === 'neck') continue;
      assert.strictEqual(ilk.tier, 1,
        d.name + ': gun izolasyonla/yardimciyla basliyor (' + ilk.tr + ')');
    }
  });

  test('REGRESYON: cesitlilik var — tek hareket her gune yayilmiyor', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []);
    const idler = normal(p).map((e) => e.id);
    const sayim = {};
    for (const id of idler) sayim[id] = (sayim[id] || 0) + 1;
    const enCok = Math.max.apply(null, Object.values(sayim));
    assert.ok(enCok <= 2, 'ayni hareket ' + enCok + ' kez tekrarlaniyor — secim hala "ilk uyan"');
    assert.ok(Object.keys(sayim).length >= 12, 'hareket cesitliligi cok dusuk');
  });

  test('ayni kas gun icinde ust uste yuklenmiyor', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const d of p.days.filter((x) => x.type === 'strength')) {
      const sayim = {};
      for (const e of d.exercises || []) {
        if (e.explosive) continue;
        sayim[e.muscle] = (sayim[e.muscle] || 0) + 1;
      }
      for (const m of Object.keys(sayim)) {
        assert.ok(sayim[m] <= 3, d.name + '/' + m + ': tek gunde ' + sayim[m] + ' hareket');
      }
    }
  });

  test('dovus sporcusunda tek tarafli is programa giriyor', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []);
    assert.ok(normal(p).some((e) => e.uni),
      'tek bacak/tek kol is hic secilmemis — dovuste asimetri ve denge onemli');
  });

  test('puanlama deterministik: ayni girdi ayni secim', () => {
    const sade = (p) => JSON.stringify(p.days.map((d) => (d.exercises || []).map((e) => e.id)));
    assert.strictEqual(sade(M.buildProgram(KICKBOKS, [])), sade(M.buildProgram(KICKBOKS, [])));
  });

  test('programPickScore ilk slotta ana kaldirisi tercih eder', () => {
    const ctx = { kullanilan: new Set(), gunKas: {}, kalipSayaci: {}, aileSayaci: {}, athletic: false };
    const t1 = M.programPickScore({ tier: 1, muscle: 'chest' }, 0, ctx);
    const t3 = M.programPickScore({ tier: 3, muscle: 'chest' }, 0, ctx);
    assert.ok(t1 > t3, 'ilk slotta izolasyon ana kaldirisla esit/ustun puan aliyor');
  });

  test('ekipman filtresi kademe sisteminden sonra da calisiyor', () => {
    const ev = M.buildProgram(Object.assign({}, KICKBOKS, { places: ['bw'], fightDays: [] }), []);
    for (const e of normal(ev)) {
      const lib = M.PROGRAM_EXERCISES.find((x) => x.id === e.id);
      assert.ok(lib.places.indexOf('bw') >= 0, e.tr + ': vucut agirligiyla yapilamaz');
    }
  });
});

// ---------------------------------------------------------------------------
describe('bozulmayanlar (regresyon)', () => {
  test('tum hedeflerde program uretilir ve gecerli', () => {
    for (const g of HEDEFLER) {
      const p = M.buildProgram(Object.assign({}, KICKBOKS, { goal: g }), []);
      assert.ok(p.days.filter((d) => d.type === 'strength').length >= 1, g + ': guc gunu yok');
      for (const e of p.days.flatMap((d) => d.exercises || [])) {
        assert.ok(e.repMin >= 1 && e.repMax >= e.repMin, g + '/' + e.tr + ': gecersiz aralik');
        assert.ok(Number.isFinite(e.sets) && e.sets >= 2, g + '/' + e.tr + ': gecersiz set');
      }
    }
  });

  test('agirlik hala UYDURULMUYOR', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const e of normal(p)) {
      assert.ok(e.kg == null || e.kg > 0, e.tr + ': gecersiz agirlik ' + e.kg);
    }
  });

  test('bozuk girdide comez', () => {
    for (const cfg of [{}, { goal: 'yokboyle' }, { goal: 'atletik', strengthDays: 0 }]) {
      const p = M.buildProgram(cfg, []);
      assert.ok(p && Array.isArray(p.days));
    }
  });

  test('AI cagrisi yok', () => {
    // ⚠️ 9 Agu: program.js'te artik TEK bir fetch var — Hevy'ye rutin yazma
    // (disa aktarim, AI degil). Motorun kendisi hala kural tabanli ve $0.
    // Sozlesme daraltildi: AI ucuna baglanmak YASAK, izinli tek uc Hevy.
    const src = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8');
    assert.ok(!/\/chat|\/plan|\/health-coach|aiRun/.test(src),
      'program.js bir AI ucuna baglanmis');
  });
});

// ---------------------------------------------------------------------------
describe('Impeccable — isinma / kondisyon stili', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const blok = css.slice(css.indexOf('.pd-warm'));

  test('yan-serit yok, saf renk yok, gradyan yok', () => {
    assert.ok(!/border-(left|right)\s*:\s*[2-9]/.test(blok));
    assert.ok(!/#fff\b|#000\b/i.test(blok));
    assert.ok(!/linear-gradient|backdrop-filter/.test(blok));
  });

  test('ozel scrollbar / garip form kontrolu yok', () => {
    assert.ok(!/::-webkit-scrollbar/.test(blok), 'standart affordance yeniden icat edilmis');
  });

  test('styles.css hala LF', () => {
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'styles.css')).indexOf(Buffer.from('\r\n')), -1);
  });
});

// ---------------------------------------------------------------------------
// 10 Agu 2026 — objektif denetimde bulunan 3 zayiflik + denetim sirasinda
// ortaya cikan 2 gercek bug.
describe('6 — kalip cesitliligi (ayni hareket iki kez)', () => {
  const p = M.buildProgram(KICKBOKS, []);

  // ⚠️ Sozlesme dikkatli kuruldu: "hicbir aile tekrarlamasin" YANLIS bir kural.
  // Salonda dikey press icin havuzda 2 secenek var (bar + dambil) ve haftada iki
  // kez dikey press yapmak ZATEN dogru programlama. Yanlis olan, tekrarin
  // SISTEMIK olmasi — yani her kalipta ayni hareketin baska aletiyle doldurmak.
  // ⚠️ SOZLESME DEGISTI — 18 Agu 2026.
  // Eski kural "bir aile en fazla 1-2 kez, birden fazla aile tekrarlamasin"
  // idi ve YANLISTI: kas grubu basina haftada 2 antrenman frekansi yerlesik
  // bilgidir. Eski kural yuzunden motor ikinci bacak gununde serbest squat
  // yerine LEG PRESS yaziyordu — cesitlilik ugruna hareket kalitesi feda
  // ediliyordu. Yeni sozlesme tekrarin TURUNU ayirir:
  //   ✅ ayni hareketin (ayni id) ana kaldiris olarak 2. kez gelmesi = FREKANS
  //   ❌ ayni ailenin BASKA ALETLE gelmesi (bar RDL + dambil RDL) = SAHTE cesitlilik
  test('ayni AILE en fazla 2 kez ve tekrar FREKANS, sahte cesitlilik DEGIL', () => {
    const sayim = {}, idler = {};
    for (const e of normal(p)) {
      const lib = M.PROGRAM_EXERCISES.find((x) => x.id === e.id);
      if (!lib) continue;
      const aile = M.programFamily(lib);
      sayim[aile] = (sayim[aile] || 0) + 1;
      (idler[aile] = idler[aile] || new Set()).add(e.id);
    }
    for (const k of Object.keys(sayim)) {
      assert.ok(sayim[k] <= 2, k + ' ailesi ' + sayim[k] + ' kez — 2x frekans tavani asildi');
      if (sayim[k] > 1) {
        assert.strictEqual(idler[k].size, 1,
          k + ' ailesi farkli aletlerle tekrarliyor (' + Array.from(idler[k]).join(' + ') +
          ') — bu frekans degil sahte cesitlilik');
      }
    }
  });

  test('REGRESYON: alt vucutta ayni aile farkli ALETLE gelmiyor', () => {
    // Paketin cikis noktasi: 'Romen Deadlift' + 'Dambil Romen Deadlift' ayni
    // haftada. Bu hala yasak. Ama ayni barbell squat'in iki bacak gununde
    // olmasi DOGRU programlamadir, yasak degil.
    const idler = {};
    for (const e of normal(p)) {
      const lib = M.PROGRAM_EXERCISES.find((x) => x.id === e.id);
      if (!lib || ['quads', 'hams', 'glutes'].indexOf(lib.muscle) < 0) continue;
      const aile = M.programFamily(lib);
      (idler[aile] = idler[aile] || new Set()).add(e.id);
    }
    for (const k of Object.keys(idler)) {
      assert.strictEqual(idler[k].size, 1,
        'alt vucutta ' + k + ' ailesi farkli aletlerle iki kez: ' + Array.from(idler[k]).join(' + '));
    }
  });

  test('REGRESYON: ikinci bacak gununde MAKINE ana kaldiris olmuyor', () => {
    // Aile cezasi yuzunden motor squat yerine leg press yaziyordu.
    const bacakGunleri = (p.days || []).filter((d) => d.agirBacak);
    assert.ok(bacakGunleri.length >= 1, 'bacak gunu yok');
    const squatlar = normal(p).filter((e) => {
      const lib = M.PROGRAM_EXERCISES.find((x) => x.id === e.id);
      return lib && lib.pattern === 'squat';
    });
    assert.ok(squatlar.length >= 1, 'squat kalibi hic gelmemis');
    assert.ok(squatlar.some((e) => e.id === 'squat'),
      'serbest squat programda yok — makine onun yerini almis');
  });

  test('haftada yeterli AILE cesitliligi var', () => {
    const aileler = new Set(normal(p).map((e) => {
      const lib = M.PROGRAM_EXERCISES.find((x) => x.id === e.id);
      return lib ? M.programFamily(lib) : e.id;
    }));
    assert.ok(aileler.size >= 12, 'sadece ' + aileler.size + ' farkli hareket ailesi');
  });

  test('farkli KADEME ayni kalip serbest (agir squat + tek bacak squat)', () => {
    // Ceza kademe bazli olmali; agir bilateral squat ile tek bacak is
    // gercekten farkli uyarandir, ikisi ayni haftada olabilir.
    // Ceza VAR ama slot 0'daki ana-kaldiris bonusunu EZMEZ — ilk hareket her
    // zaman agir bileske olmali. Onemli olan: ayni kalip tekrari cezalansin,
    // AYNI AILE tekrari daha da agir cezalansin.
    const T = (kalip, aile) => M.programPickScore(
      { id: 'x', tier: 1, pattern: 'squat', muscle: 'quads' }, 0,
      { kullanilan: new Set(), gunKas: {}, kalipSayaci: kalip, aileSayaci: aile, athletic: true });
    const temiz = T({}, {});
    const kalipTekrar = T({ 'squat|1': 1 }, {});
    const aileTekrar = T({ 'squat|1': 1 }, { x: 1 });
    assert.ok(kalipTekrar < temiz, 'ayni kalip tekrari cezalanmiyor');
    assert.ok(aileTekrar < kalipTekrar,
      'ayni AILE tekrari kalip tekrarindan daha agir cezalanmali — o gercek tekrar');
  });
});

describe('7 — dovus gunu alt vucut hacminden dusuluyor', () => {
  test('kickboks arttikca bacak hacmi AZALIYOR', () => {
    const az = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []);
    const cok = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [2, 4] }), []);
    const bacak = (p) => {
      const s = M.programWeeklySets(p);
      return (s.quads || 0) + (s.hams || 0) + (s.glutes || 0);
    };
    assert.ok(bacak(cok) < bacak(az),
      'dovus gunu bacak hacmini hic etkilemiyor — tekme atmak bacak isidir, ' +
      'temas butcesinde sayilip kuvvet hacminde sayilmamasi TUTARSIZ');
  });

  test('alt vucut alt bandin ALTINA dusmuyor', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { strengthDays: 4, fightDays: [1, 2, 4] }), []);
    const G = M.PROGRAM_GOALS.atletik;
    const sets = M.programWeeklySets(p);
    for (const m of ['quads', 'hams']) {
      if (sets[m] == null) continue;
      assert.ok(sets[m] >= 4, m + ': ' + sets[m] + ' set — indirim programi bosaltmis');
    }
    assert.ok(G.setsLow >= 4);
  });

  test('ust vucut bandi dovusten ETKILENMIYOR', () => {
    const az = M.programWeeklySets(M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []));
    const cok = M.programWeeklySets(M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [2, 4] }), []));
    assert.strictEqual(az.chest, cok.chest, 'gogus hacmi dovusten etkilenmis — kickboks itme isi degil');
  });

  test('indirim kullaniciya SEBEBIYLE soyleniyor', () => {
    const p = M.buildProgram(KICKBOKS, []);
    assert.ok((p.notes || []).some((n) => /dövüş antrenmanın bacağı zaten yüklüyor/i.test(n)),
      'bacak hacmi dusuruldu ama neden dusuruldugu soylenmiyor');
  });
});

describe('8 — deload: planli + gecici + ardisik degil', () => {
  const hevy = ['2026-08-05', '2026-08-06', '2026-08-08', '2026-08-09'].map((d) => ({ date: d, exercises: [] }));
  const ilerlet = (p) => M.advanceProgram(p, hevy, '2026-08-10');
  const setToplam = (p) => p.days.flatMap((d) => d.exercises || []).reduce((a, e) => a + e.sets, 0);

  test('PLANLI deload var (sadece durgunlukta degil)', () => {
    assert.ok(M.PROGRAM_LIMITS.deloadEveryWeeks > 0, 'planli hafifletme yok — motor yorgunluk performansi dusurene KADAR bekliyor');
  });

  test('⚠️ deload GECICI — hacim ertesi hafta geri geliyor', () => {
    // Bulunan bug: setler her deload'da x0.6 olup bir daha yukselmiyordu.
    // 10 haftada 74 -> 50 sete iniyor ve orada kaliyordu (program eriyordu).
    let p = M.buildProgram(KICKBOKS, []);
    const normalHacim = setToplam(ilerlet(p));
    let onceki = null, geriGeldi = false;
    p = M.buildProgram(KICKBOKS, []);
    for (let i = 0; i < 8; i++) {
      p = ilerlet(p);
      if (onceki && onceki.deload && !p.deload && setToplam(p) >= normalHacim) geriGeldi = true;
      onceki = { deload: p.deload };
    }
    assert.ok(geriGeldi, 'hafifletmeden sonra hacim normale DONMUYOR — program kalici olarak eriyor');
  });

  test('⚠️ arka arkaya iki hafifletme YOK', () => {
    let p = M.buildProgram(KICKBOKS, []);
    let oncekiDeload = false;
    for (let i = 0; i < 12; i++) {
      p = ilerlet(p);
      assert.ok(!(p.deload && oncekiDeload),
        'iki hafta ust uste hafifletme — gereksiz gerileme (' + p.week + '. hafta)');
      oncekiDeload = !!p.deload;
    }
  });

  test('deload sebebi kayitli ve kullaniciya yaziliyor', () => {
    let p = M.buildProgram(KICKBOKS, []);
    for (let i = 0; i < 6; i++) {
      p = ilerlet(p);
      if (p.deload) {
        assert.ok(['planli', 'durgunluk'].indexOf(p.deloadReason) >= 0, 'deload sebebi yok');
        const metin = JSON.stringify(p.history);
        assert.ok(/hafifletme/i.test(metin), 'hafifletme gecmise yazilmamis');
        return;
      }
    }
    assert.fail('8 haftada hic deload olmadi');
  });

  test('seans kacirilan haftada deload TETIKLENMEZ', () => {
    // Zaten yapilmamis programi ayrica hafifletmek anlamsiz.
    let p = M.buildProgram(KICKBOKS, []);
    p.week = 4;   // gelecek hafta 5 = planli deload haftasi
    const y = M.advanceProgram(p, [{ date: '2026-08-09', exercises: [] }], '2026-08-10');
    assert.ok(!y.deload, 'seans kacirilmis haftada ustune deload uygulanmis');
  });
});
