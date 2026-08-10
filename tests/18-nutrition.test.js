/**
 * 18 — BESLENME PLANLAYICI (10 Agu 2026)
 *
 * ⚠️ BU DOSYANIN EN ONEMLI BOLUMU: KAPSAM SINIRI.
 * Motor bir KILO VERME araci DEGILDIR ve olamaz. Kullanici 16 yasinda, buyume
 * doneminde, haftada 6 gun antrenman yapiyor — bu profilde asil risk AZ YEMEK.
 * Yalnizca 'koru' ve 'kas' hedefleri var; kalori acigi uretilemez ve hedef
 * hicbir kosulda BMR'nin altina inemez. Bu sozlesme burada kilitleniyor.
 *
 * Ikinci onemli sozlesme: yasa gore BMR denklemi degisir. Mifflin-St Jeor
 * 19-78 yas araliginda dogrulanmistir; 16 yasinda ~%8 dusuk tahmin verir.
 * 18 alti icin Schofield kullaniliyor.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const nutSrc = fs.readFileSync(path.join(ROOT, 'nutrition.js'), 'utf8');

// core.js'in TAMAMI degil — sadece besin DB + ogun slotlari (localStorage yok)
function motor() {
  const core = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
  const i = core.indexOf('const TURK_FOODS'), j = core.indexOf('\n];', i) + 3;
  const slots = core.match(/const MEAL_SLOTS = \{[^}]*\};/)[0];
  const ctx = {
    console, Date, Math, JSON, Number, String, Array, Object, Promise,
    document: { getElementById: () => null },
    escapeHtml: (s) => String(s), save() {}, showToast() {}, ensureDiet() {},
    data: { diet: {} }, fetch: () => { throw new Error('ag yok'); },
  };
  vm.createContext(ctx);
  vm.runInContext(core.slice(i, j) + '\n' + slots, ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8'), ctx);
  vm.runInContext(nutSrc +
    '\n;globalThis.__N = { NUT_LIMITS, NUT_PAL, NUT_TEMPLATES, nutBMR, nutTargets,' +
    ' nutMealSplit, nutDayType, nutCarbTiming, nutBuildDay, nutBuildMeal, nutFood,' +
    ' nutPortion, nutRound, nutWeek, TURK_FOODS };', ctx);
  return Object.assign(ctx, ctx.__N);
}
const M = motor();
const PROF = { sex: 'male', age: 16, height: 178, weight: 70 };

// ---------------------------------------------------------------------------
describe('KAPSAM SINIRI — kilo verme YOK', () => {
  test('sadece iki hedef var: koru ve kas', () => {
    for (const h of ['koru', 'kas']) {
      assert.ok(M.nutTargets(PROF, 'rest', h), h + ' hedefi calismiyor');
    }
    // Taninmayan hedef sessizce 'koru' olur — acik ASLA uretilmez
    const uydurma = M.nutTargets(PROF, 'rest', 'kilo-ver');
    const koru = M.nutTargets(PROF, 'rest', 'koru');
    assert.strictEqual(uydurma.kcal, koru.kcal,
      'taninmayan hedef farkli sonuc veriyor — acik sizmis olabilir');
    assert.strictEqual(uydurma.hedef, 'koru');
  });

  test('hiçbir gün tipinde kalori BMR\'nin altına inmiyor', () => {
    for (const kg of [45, 55, 70, 95]) {
      for (const tip of ['rest', 'strength', 'fight', 'both']) {
        for (const h of ['koru', 'kas', 'lose', 'cut', '']) {
          const t = M.nutTargets(Object.assign({}, PROF, { weight: kg }), tip, h);
          assert.ok(t.kcal >= t.bmr,
            kg + 'kg/' + tip + '/' + h + ': ' + t.kcal + ' kcal < BMR ' + t.bmr);
        }
      }
    }
  });

  test('kaynakta kalori AÇIĞI aritmetiği YOK', () => {
    // Yalniz KOD aranir; "kilo verme planı üretmez" gibi kullaniciya yazilan
    // uyari metinleri ve yorumlar haric tutulur.
    const kod = nutSrc
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""');
    assert.ok(!/(tdee|kcal)\s*-\s*\d{2,}/i.test(kod), 'kalori cikarma islemi var');
    assert.ok(!/deficit|surplus\s*<\s*0/i.test(kod), 'acik degiskeni var');
    assert.ok(/Math\.max\(kcal, bmr\)/.test(kod), 'BMR tabani zorlanmiyor');
  });

  test('arayüzde üçüncü hedef seçeneği yok', () => {
    const i = nutSrc.indexOf('function setNutGoal');
    const blok = nutSrc.slice(i, i + 300);
    assert.ok(/'kas' : 'koru'/.test(blok), 'hedef iki secenege kilitli degil');
  });

  test('kullanıcıya sınır AÇIKÇA yazılıyor', () => {
    assert.ok(/Kilo verme|sıklet/i.test(nutSrc), 'kapsam siniri kullaniciya soylenmiyor');
    assert.ok(/diyetisyen/i.test(nutSrc), 'diyetisyen yonlendirmesi yok');
  });

  test('yağ hormonal sağlık tabanının altına inmiyor', () => {
    for (const kg of [45, 55, 70, 95]) {
      const t = M.nutTargets(Object.assign({}, PROF, { weight: kg }), 'rest', 'koru');
      assert.ok(t.fat >= kg * M.NUT_LIMITS.fatMinPerKg,
        kg + 'kg: yag ' + t.fat + 'g — taban ' + (kg * M.NUT_LIMITS.fatMinPerKg));
    }
  });

  test('protein üst sınırı aşılmıyor', () => {
    for (const kg of [45, 70, 95]) {
      for (const h of ['koru', 'kas']) {
        const t = M.nutTargets(Object.assign({}, PROF, { weight: kg }), 'both', h);
        assert.ok(t.protein <= kg * M.NUT_LIMITS.proteinMaxPerKg,
          kg + 'kg: protein ' + t.protein + 'g — tavan asilmis');
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('BMR — yaşa göre denklem', () => {
  test('18 altı Schofield, 18+ Mifflin', () => {
    const genc = M.nutBMR('male', 16, 70, 178);
    const yetiskin = M.nutBMR('male', 25, 70, 178);
    const mifflin = Math.round(10 * 70 + 6.25 * 178 - 5 * 16 + 5);
    assert.notStrictEqual(genc, mifflin,
      '16 yasinda yetiskin denklemi kullanilmis — Mifflin ergende dogrulanmamis');
    assert.ok(genc > mifflin, 'ergen BMR yetiskin formulunden dusuk cikmis');
    assert.ok(yetiskin > 0);
  });

  test('yaş grubu sınırında çökmüyor', () => {
    for (const y of [10, 14, 15, 17, 18, 19, 40]) {
      assert.ok(M.nutBMR('male', y, 70, 178) > 800, y + ' yasinda BMR mantiksiz');
      assert.ok(M.nutBMR('female', y, 60, 165) > 700, y + ' yas kadin BMR mantiksiz');
    }
  });

  test('kilo yoksa 0 döner, çökmez', () => {
    assert.strictEqual(M.nutBMR('male', 16, 0, 178), 0);
    assert.strictEqual(M.nutTargets({ weight: 0 }, 'rest', 'koru'), null);
    assert.strictEqual(M.nutTargets(null, 'rest', 'koru'), null);
  });
});

// ---------------------------------------------------------------------------
describe('gün tipi programdan türetiliyor', () => {
  const prog = M.buildProgram(
    { goal: 'atletik', strengthDays: 4, sessionMin: 60, places: ['gym'], fightDays: [2, 4], avoid: [] }, []);

  test('dövüş günü, ağırlık günü ve dinlenme ayrılıyor', () => {
    assert.strictEqual(M.nutDayType(2, prog), 'fight', 'Salı dövüş günü tanınmadı');
    const tipler = new Set([0, 1, 2, 3, 4, 5, 6].map((d) => M.nutDayType(d, prog)));
    assert.ok(tipler.has('strength'), 'hiç ağırlık günü tanınmadı');
    assert.ok(tipler.has('rest'), 'hiç dinlenme günü yok');
  });

  test('program yoksa hepsi dinlenme (çökmez)', () => {
    for (const d of [0, 3, 6]) assert.strictEqual(M.nutDayType(d, null), 'rest');
    assert.strictEqual(M.nutDayType(3, { days: 'bozuk' }), 'rest');
  });

  test('⚠️ antrenman günü dinlenme gününden DAHA ÇOK kalori alıyor', () => {
    const r = M.nutTargets(PROF, 'rest', 'koru');
    const s = M.nutTargets(PROF, 'strength', 'koru');
    const f = M.nutTargets(PROF, 'fight', 'koru');
    const b = M.nutTargets(PROF, 'both', 'koru');
    assert.ok(r.kcal < s.kcal, 'agirlik gunu dinlenme gunuyle ayni kalori — tek "aktivite seviyesi" hatasi');
    assert.ok(s.kcal < f.kcal, 'dovus gunu agirlik gununden dusuk');
    assert.ok(f.kcal < b.kcal, 'cift antrenman gunu en yuksek olmali');
  });

  test('PAL değerleri makul aralıkta', () => {
    for (const k of Object.keys(M.NUT_PAL)) {
      assert.ok(M.NUT_PAL[k] >= 1.2 && M.NUT_PAL[k] <= 2.4, k + ': ' + M.NUT_PAL[k]);
    }
  });

  test('haftalık özet 7 gün veriyor', () => {
    const h = M.nutWeek(PROF, 'koru', prog);
    assert.strictEqual(h.length, 7);
    assert.ok(h.every((g) => g.hedef && g.hedef.kcal > 0));
  });
});

// ---------------------------------------------------------------------------
describe('makro dağılımı', () => {
  test('makrolar kaloriyi tutuyor (±%6)', () => {
    for (const tip of ['rest', 'strength', 'fight', 'both']) {
      for (const h of ['koru', 'kas']) {
        const t = M.nutTargets(PROF, tip, h);
        const hesap = t.protein * 4 + t.carb * 4 + t.fat * 9;
        const sapma = Math.abs(hesap - t.kcal) / t.kcal;
        assert.ok(sapma < 0.06, tip + '/' + h + ': makro toplami ' + hesap + ' vs ' + t.kcal);
      }
    }
  });

  test('protein öğünlere EŞİT dağıtılıyor', () => {
    const t = M.nutTargets(PROF, 'strength', 'koru');
    const ogunler = M.nutMealSplit(t, 70);
    assert.strictEqual(ogunler.length, 4);
    const p = ogunler.map((o) => o.protein);
    assert.ok(Math.max.apply(null, p) - Math.min.apply(null, p) <= 1,
      'protein ogunlere esit dagitilmamis: ' + p.join(', '));
  });

  test('⚠️ öğün başı protein KIRPILMIYOR (toplam tutmalı)', () => {
    // Ogun basi tavana kirpilirsa 4 x tavan < gunluk hedef olur ve
    // plan sessizce eksik protein verir.
    const t = M.nutTargets(PROF, 'strength', 'kas');
    const toplam = M.nutMealSplit(t, 70).reduce((a, o) => a + o.protein, 0);
    assert.ok(Math.abs(toplam - t.protein) <= 4,
      'ogun toplami ' + toplam + ' vs gunluk hedef ' + t.protein);
  });

  test('kas hedefi korumadan daha çok kalori ve protein veriyor', () => {
    const k = M.nutTargets(PROF, 'strength', 'koru');
    const g = M.nutTargets(PROF, 'strength', 'kas');
    assert.ok(g.kcal > k.kcal && g.protein > k.protein);
    assert.ok(g.kcal - k.kcal <= 500, 'fazla cok buyuk — yag olarak birikir');
  });
});

// ---------------------------------------------------------------------------
describe('karbonhidrat zamanlaması', () => {
  test('antrenman gününde öncesi/sonrası kuralı var', () => {
    const s = M.nutCarbTiming('strength').join(' ');
    assert.ok(/önce/i.test(s) && /sonra/i.test(s));
  });

  test('"anabolik pencere" abartısı düzeltiliyor', () => {
    const s = M.nutCarbTiming('strength').join(' ');
    assert.ok(/abartı/i.test(s), 'yaygin efsane duzeltilmiyor');
  });

  test('dinlenme gününde zamanlama serbest', () => {
    assert.ok(/serbest/i.test(M.nutCarbTiming('rest').join(' ')));
  });

  test('dövüş gününde karbonhidrat kısılmıyor', () => {
    assert.ok(/kısma/i.test(M.nutCarbTiming('fight').join(' ')));
  });
});

// ---------------------------------------------------------------------------
describe('örnek gün — gerçek Türk yemekleri', () => {
  const t = M.nutTargets(PROF, 'strength', 'koru');
  const gun = M.nutBuildDay(t, 70, 0);

  test('⚠️ şablondaki HER besin TURK_FOODS\'ta var', () => {
    const eksik = [];
    for (const slot of Object.keys(M.NUT_TEMPLATES)) {
      for (const tpl of M.NUT_TEMPLATES[slot]) {
        for (const ad of [tpl.protein, tpl.carb].concat(tpl.ek || [])) {
          if (!M.nutFood(ad)) eksik.push(slot + '/' + ad);
        }
      }
    }
    assert.deepStrictEqual(eksik, [], 'sablon var olmayan besine referans veriyor');
  });

  test('4 öğün üretiliyor', () => {
    assert.strictEqual(gun.length, 4);
    assert.ok(gun.every((m) => m.items.length >= 3));
  });

  test('gün toplamı hedefe yakın (kalori ±%12, protein hedefin üstünde)', () => {
    const kcal = gun.reduce((a, m) => a + m.kcal, 0);
    const prot = gun.reduce((a, m) => a + m.protein, 0);
    assert.ok(Math.abs(kcal - t.kcal) / t.kcal < 0.12,
      'kalori ' + kcal + ' vs hedef ' + t.kcal);
    assert.ok(prot >= t.protein * 0.9, 'protein ' + prot + ' vs hedef ' + t.protein);
    assert.ok(prot <= t.protein * 1.35, 'protein hedefi cok asiyor: ' + prot);
  });

  test('⚠️ "adet" birimli besinler TAM sayı (1.5 yumurta olmaz)', () => {
    for (const m of gun) {
      for (const x of m.items) {
        if (/adet|dilim|kase|bardak|kutu/i.test(x.u)) {
          assert.strictEqual(x.adet % 1, 0, x.n + ': ' + x.adet + ' ' + x.u);
        }
      }
    }
  });

  test('⚠️ saçma porsiyon yok (hiçbir kalem 5 birimi geçmiyor)', () => {
    // "4 bardak kefir" hatasi: capa protein yogun olmayinca motor hedefi
    // tutturmak icin absurd miktar yaziyordu.
    for (const m of gun) {
      for (const x of m.items) {
        assert.ok(x.adet <= 5, m.slot + ': ' + x.adet + ' ' + x.u + ' ' + x.n);
      }
    }
  });

  test('protein çapası şablonun EN protein yoğun kalemi', () => {
    // "4 bardak kefir" hatasinin kok nedeni: capa protein yogun degildi.
    // Mutlak esik yanlis olur (yumurta 6 g/adet ama 4 adet = 24 g) — dogru
    // sozlesme: capa, kendi sablonundaki en yuksek proteinli besin olmali.
    for (const slot of Object.keys(M.NUT_TEMPLATES)) {
      for (const tpl of M.NUT_TEMPLATES[slot]) {
        const capa = M.nutFood(tpl.protein);
        for (const ad of [tpl.carb].concat(tpl.ek || [])) {
          const f = M.nutFood(ad);
          assert.ok(capa.p >= f.p,
            slot + ': capa ' + tpl.protein + ' (' + capa.p + 'g) < ' + ad + ' (' + f.p + 'g)');
        }
      }
    }
  });

  test('porsiyon metni bozuk değil ("1 5 adet" olmaz)', () => {
    assert.strictEqual(M.nutPortion(1, '5 adet'), '5 adet');
    assert.strictEqual(M.nutPortion(2, '5 adet'), '2 × 5 adet');
    assert.strictEqual(M.nutPortion(1, 'porsiyon'), '1 porsiyon');
    assert.strictEqual(M.nutPortion(0.5, 'porsiyon'), '0.5 porsiyon');
  });

  test('farklı şablon indeksi farklı gün üretiyor', () => {
    const a = M.nutBuildDay(t, 70, 0).flatMap((m) => m.items.map((x) => x.n)).join();
    const b = M.nutBuildDay(t, 70, 1).flatMap((m) => m.items.map((x) => x.n)).join();
    assert.notStrictEqual(a, b, 'sablon degistirmek ayni gunu veriyor');
  });

  test('deterministik: aynı girdi aynı gün', () => {
    const a = JSON.stringify(M.nutBuildDay(t, 70, 0));
    const b = JSON.stringify(M.nutBuildDay(t, 70, 0));
    assert.strictEqual(a, b);
  });

  test('bozuk girdide çökmüyor', () => {
    assert.doesNotThrow(() => M.nutBuildMeal('yokboyle', { kcal: 500, protein: 30 }, 0));
    assert.strictEqual(M.nutBuildMeal('yokboyle', { kcal: 500, protein: 30 }, 0), null);
    assert.doesNotThrow(() => M.nutBuildDay(M.nutTargets(PROF, 'rest', 'koru'), 70, 999));
  });

  test('NaN sızmıyor', () => {
    for (const m of M.nutBuildDay(t, 70, 0)) {
      for (const k of ['kcal', 'protein', 'carb', 'fat']) {
        assert.ok(Number.isFinite(m[k]), m.slot + '.' + k + ' = ' + m[k]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('mimari sözleşmeler', () => {
  test('AI çağrısı YOK — motor deterministik', () => {
    assert.ok(!/\bfetch\s*\(|\/chat|\/health-coach|aiRun/.test(nutSrc),
      'nutrition.js ag istegi yapiyor');
  });

  test('tembel yükleniyor ve deploy zincirinde var', () => {
    const core = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
    assert.ok(/nutrition:\s*'\/nutrition\.js'/.test(core), 'LAZY_MODULES\'te yok');
    for (const f of ['sw.js', 'aidan-pages-deploy.py', '.github/workflows/deploy.yml']) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(s.indexOf('nutrition.js') >= 0, f + ' deploy zincirinde eksik — 404 verir');
    }
  });

  test('Diyet sekmesi açılınca render ediliyor', () => {
    const tasks = fs.readFileSync(path.join(ROOT, 'tasks.js'), 'utf8');
    const i = tasks.indexOf("if (name === 'diet')");
    assert.ok(tasks.slice(i, i + 250).indexOf('renderNutrition()') >= 0);
    assert.ok(/'program', 'nutrition'/.test(tasks), 'diyet sekmesi nutrition modulunu yuklemiyor');
  });

  test('asistan.html\'de bölüm var', () => {
    assert.ok(/id="nutSection"/.test(fs.readFileSync(path.join(ROOT, 'asistan.html'), 'utf8')));
  });

  test('ölü ayar yok (tanımlı her limit kullanılıyor)', () => {
    const govde = nutSrc.slice(nutSrc.indexOf('};', nutSrc.indexOf('NUT_LIMITS')));
    for (const k of Object.keys(M.NUT_LIMITS)) {
      assert.ok(govde.indexOf(k) >= 0, 'NUT_LIMITS.' + k + ' hic kullanilmiyor — olu ayar');
    }
  });
});

// ---------------------------------------------------------------------------
describe('Impeccable — beslenme kartı', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const blok = css.slice(css.indexOf('.nut-wrap'));

  test('yan-şerit yok, saf renk yok, gradyan yok', () => {
    assert.ok(!/border-(left|right)\s*:\s*[2-9]/.test(blok));
    assert.ok(!/#fff\b|#000\b/i.test(blok));
    assert.ok(!/linear-gradient|backdrop-filter/.test(blok));
  });

  test('özel scrollbar yok, reduced-motion var', () => {
    assert.ok(!/::-webkit-scrollbar/.test(blok));
    assert.ok(/prefers-reduced-motion/.test(blok));
  });

  test('styles.css hâlâ LF', () => {
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'styles.css')).indexOf(Buffer.from('\r\n')), -1);
  });
});
