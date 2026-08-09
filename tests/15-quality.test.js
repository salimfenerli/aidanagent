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
    ' PROGRAM_TIER1, PROGRAM_TIER2, PROGRAM_UNI };';
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
    const p = M.buildProgram(KICKBOKS, []);
    const T = M.PROGRAM_GOALS.atletik.tiers;
    for (const e of normal(p)) {
      if (e.muscle === 'neck') continue;
      const [a, b] = T[e.tier];
      assert.strictEqual(e.repMin, a, e.tr + ' (kademe ' + e.tier + '): repMin ' + e.repMin + ', beklenen ' + a);
      assert.strictEqual(e.repMax, b, e.tr + ' (kademe ' + e.tier + '): repMax ' + e.repMax + ', beklenen ' + b);
    }
  });

  test('kademe 1 ile kademe 3 GERCEKTEN farkli tekrar aliyor', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const t1 = normal(p).filter((e) => e.tier === 1);
    const t3 = normal(p).filter((e) => e.tier === 3 && e.muscle !== 'neck');
    assert.ok(t1.length && t3.length, 'her iki kademeden hareket yok');
    assert.ok(Math.max.apply(null, t1.map((e) => e.repMax)) < Math.min.apply(null, t3.map((e) => e.repMin)),
      'ana kaldiris ve izolasyon tekrar araliklari cakisiyor');
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
        if (m === 'neck' || m === 'core' || m === 'calves') continue;
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
    const ctx = { kullanilan: new Set(), gunKas: {}, athletic: false };
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
    assert.ok(!/\bfetch\s*\(/.test(fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8')));
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
