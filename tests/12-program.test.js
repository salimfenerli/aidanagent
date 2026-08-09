/**
 * 12 — ANTRENMAN PROGRAMI (9 Agu 2026)
 *
 * NEDEN: bu ozellik 16 yasindaki bir kullaniciya ANTRENMAN YUKU oneriyor.
 * Yanlis sayi burada sadece "kotu cikti" degil, sakatlik demek. O yuzden
 * guvenlik tavanlarinin her biri ayri ayri kilitlenir.
 *
 * Kritik davranislar:
 *   - Agirlik UYDURULMAZ: gecmis veri yoksa null kalir.
 *   - 1RM denemesi ASLA onerilmez; agirlik e1RM tahmininden %90 ile turetilir.
 *   - Dovus gunu agir sayilir; agir bacak gunu dovuse komsu OLMAZ.
 *   - Yetisemedigin hafta program AGIRLASTIRILMAZ.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT } = require('./helpers/load');

const A = loadApp({ seed: {} });
const W = A.window;
after(() => { try { A.close(); } catch (_) {} });

// ⚠️ Top-level `const` window'a YAZILMAZ (tarayicidaki davranisin aynisi).
// Sabitler dolayli eval ile global lexical scope'tan okunur.
const EV = (kod) => A.evalIn(kod);
const LIMITS = EV('PROGRAM_LIMITS');
const LIB = EV('PROGRAM_EXERCISES');
const MUSCLES = EV('PROGRAM_MUSCLES');
// `data` da top-level let — atama eval icinden yapilmali
const setProgram = (p) => EV('data.program = ' + JSON.stringify(p) + ';');

const build = (cfg, ws) => W.buildProgram(cfg, ws || []);
const G = (cfg) => Object.assign({ goal: 'kas', strengthDays: 3, sessionMin: 60, places: ['gym'], fightDays: [], avoid: [] }, cfg);

// Sahte Hevy gecmisi
function hevy(gunOnce, ad, kg, reps) {
  const d = new Date(Date.now() - gunOnce * 86400000);
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return {
    id: 'w' + gunOnce, date: iso, title: 'Test', volumeKg: kg * reps * 3, setCount: 3, durationMin: 55,
    exercises: [{ name: ad, tid: 't1', sets: 3, volumeKg: kg * reps * 3, top: { kg, reps, e1rm: Math.round(kg * (1 + reps / 30) * 10) / 10 } }],
  };
}

// ============================================================
// Uretim — temel
// ============================================================
describe('program uretimi', () => {
  test('3 gun / salon → gun sayisi ve yapi dogru', () => {
    const p = build(G({ strengthDays: 3 }));
    const guc = p.days.filter((d) => d.type === 'strength');
    assert.strictEqual(guc.length, 3);
    assert.strictEqual(p.split, 'fullbody');
    assert.ok(guc.every((d) => d.exercises.length >= 3), 'her gunde en az 3 hareket olmali');
    assert.strictEqual(p.week, 1);
  });

  test('4 gun → upper/lower, 5 gun → ppl', () => {
    assert.strictEqual(build(G({ strengthDays: 4 })).split, 'upperlower');
    assert.strictEqual(build(G({ strengthDays: 5 })).split, 'ppl');
  });

  test('ayni gun icinde ayni hareket iki kez gecmez', () => {
    for (const n of [2, 3, 4, 5]) {
      const p = build(G({ strengthDays: n }));
      for (const d of p.days) {
        const idler = d.exercises.map((e) => e.id);
        assert.strictEqual(new Set(idler).size, idler.length,
          n + ' gunluk programda ' + d.name + ' gununde tekrar eden hareket var');
      }
    }
  });

  test('gunler haftaya dagilmis, ayni gune iki seans dusmemis', () => {
    const p = build(G({ strengthDays: 4 }));
    const dowlar = p.days.map((d) => d.dow);
    assert.strictEqual(new Set(dowlar).size, dowlar.length, 'ayni gune iki seans dusmus');
  });
});

// ============================================================
// Ekipman filtresi
// ============================================================
describe('ekipman filtresi', () => {
  test('sadece vucut agirligi → barbell/makine hareketi GIRMEZ', () => {
    const p = build(G({ places: ['bw'], strengthDays: 3 }));
    const hepsi = p.days.flatMap((d) => d.exercises);
    assert.ok(hepsi.length > 0, 'vucut agirligiyla program uretilemedi');
    for (const e of hepsi) {
      const lib = LIB.find((x) => x.id === e.id);
      assert.ok(lib.places.includes('bw'), e.tr + ' vucut agirligiyla yapilamaz');
    }
  });

  test('ev (dambil) → salon-only hareket girmez', () => {
    const p = build(G({ places: ['home'], strengthDays: 3 }));
    for (const e of p.days.flatMap((d) => d.exercises)) {
      const lib = LIB.find((x) => x.id === e.id);
      assert.ok(lib.places.includes('home'), e.tr + ' evde yapilamaz');
    }
  });

  test('salon + ev secilirse ikisinden de hareket kullanilabilir', () => {
    const p = build(G({ places: ['gym', 'home'], strengthDays: 5 }));
    for (const e of p.days.flatMap((d) => d.exercises)) {
      const lib = LIB.find((x) => x.id === e.id);
      assert.ok(lib.places.some((x) => x === 'gym' || x === 'home'));
    }
  });
});

// ============================================================
// 16 YAS GUVENLIK SINIRLARI
// ============================================================
describe('guvenlik sinirlari', () => {
  test('dovus + guc toplami haftalik agir gun tavanini ASMAZ', () => {
    const p = build(G({ strengthDays: 5, fightDays: [2, 4, 6] }));
    const agir = p.days.length;
    assert.ok(agir <= LIMITS.maxHardDaysWeek,
      agir + ' agir gun kurulmus, tavan ' + LIMITS.maxHardDaysWeek);
    assert.ok(p.notes.some((n) => /düşürüldü/.test(n)), 'kirpma kullaniciya soylenmemis');
  });

  test('guc gunu dovus gunune denk getirilmez', () => {
    const dovus = [2, 5];
    const p = build(G({ strengthDays: 4, fightDays: dovus }));
    for (const d of p.days.filter((x) => x.type === 'strength')) {
      assert.ok(!dovus.includes(d.dow),
        'guc gunu dovus gunune (' + d.dow + ') denk gelmis — ayni gun cift agir yuk');
    }
  });

  const bacakGunleri = (p) => p.days
    .filter((d) => d.type === 'strength' && /Alt Vücut|Bacak/.test(d.name))
    .map((d) => d.dow);

  test('yer varsa agir bacak gunu dovuse KOMSU OLMAZ', () => {
    const dovus = [3];   // sadece Carsamba dovus → bol bos gun var
    const p = build(G({ strengthDays: 3, fightDays: dovus }));
    for (const g of bacakGunleri(p)) {
      assert.ok(!W.programLegClash(g, dovus),
        'bos gun varken bacak gunu dovusun yanina konmus (gun ' + g + ')');
    }
  });

  test('yer YOKSA zorlar ama kullaniciyi UYARIR (sessizce yapmaz)', () => {
    // 4 guc + 2 dovus = 6 agir gun; catismasiz tek slot kaliyor.
    // Dogru davranis bacak gununu ATMAK degil (eski hata "3 ust + 1 alt"
    // uretiyordu), zorlayip sebebini soylemek.
    const dovus = [2, 5];
    const p = build(G({ strengthDays: 4, fightDays: dovus }));
    const bacak = bacakGunleri(p);
    assert.strictEqual(bacak.length, 2, 'bacak gunu sayisi korunmali, gelen: ' + bacak.length);
    const catisan = bacak.filter((g) => W.programLegClash(g, dovus));
    assert.ok(catisan.length <= 1, 'gereksiz yere ' + catisan.length + ' bacak gunu catisiyor');
    if (catisan.length) {
      assert.ok(p.notes.some((n) => /bacak/i.test(n)),
        'catisma zorlandi ama kullaniciya soylenmemis');
    }
  });

  test('ust/alt dengesi bozulmuyor (eski regresyon)', () => {
    // 9 Agu: catisma cozumu bacak sablonunu bir UST gunuyle degistiriyordu →
    // 4 gunluk programda 3 ust + 1 alt cikiyordu, bacak hacmi yarilaniyordu.
    const p = build(G({ strengthDays: 4, fightDays: [2, 5] }));
    const ust = p.days.filter((d) => /Üst Vücut/.test(d.name)).length;
    const alt = p.days.filter((d) => /Alt Vücut/.test(d.name)).length;
    assert.strictEqual(ust, 2, 'ust gun sayisi 2 olmali, gelen ' + ust);
    assert.strictEqual(alt, 2, 'alt gun sayisi 2 olmali, gelen ' + alt);
    const adlar = p.days.filter((d) => d.type === 'strength').map((d) => d.name);
    assert.strictEqual(new Set(adlar).size, adlar.length, 'ayni sablon iki kez kullanilmis');
  });

  test('izolasyon hareketi gunun odagina uyar', () => {
    // Bacak gununde yan kaldiris, itme gununde baldir cikmamali.
    const p = build(G({ strengthDays: 4, places: ['gym'] }));
    const UST = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
    for (const d of p.days.filter((x) => /Alt Vücut/.test(x.name))) {
      for (const e of d.exercises) {
        assert.ok(!UST.includes(e.muscle),
          'bacak gununde ust vucut hareketi: ' + e.tr);
      }
    }
  });

  test('haftada en az 1 tam dinlenme gunu kalir', () => {
    const p = build(G({ strengthDays: 5, fightDays: [3] }));
    assert.ok(p.days.length <= 6, 'her gun dolu — dinlenme gunu birakilmamis');
  });

  test('kas grubu haftalik set tavani asilmiyor', () => {
    for (const n of [2, 3, 4, 5]) {
      const p = build(G({ strengthDays: n, sessionMin: 90 }));
      // jsdom realm'inden gelen dizi — deepStrictEqual prototip farkina takilir
      const flags = W.programVolumeFlags(p);
      assert.strictEqual(flags.length, 0,
        n + ' gunluk programda set tavani asildi: ' + JSON.stringify(flags));
    }
  });

  test('tavan zorlanirken program kullanilamaz hale GELMEZ', () => {
    // 9 Agu: 5 gunluk PPL gogus 22 / sirt 27 sete cikiyordu. Kirpma calisiyor
    // ama programi bosaltmamali — her gunde calisilabilir is kalmali.
    const p = build(G({ strengthDays: 5, sessionMin: 90, places: ['gym'] }));
    for (const d of p.days.filter((x) => x.type === 'strength')) {
      assert.ok(d.exercises.length >= 3,
        d.name + ' kirpma sonrasi ' + d.exercises.length + ' harekete dustu');
      assert.ok(d.exercises.every((e) => e.sets >= 2), d.name + ' 2 setin altina inmis');
    }
    assert.ok(p.notes.some((n) => /set tavanı/.test(n)),
      'hacim dusuruldu ama kullaniciya soylenmemis');
  });

  test('agriyan bolge secilirse o kas HIC calistirilmaz', () => {
    const p = build(G({ avoid: ['shoulders', 'chest'], strengthDays: 4, places: ['gym'] }));
    for (const e of p.days.flatMap((d) => d.exercises)) {
      assert.ok(e.muscle !== 'shoulders' && e.muscle !== 'chest',
        'kacinilan bolge programa girmis: ' + e.tr);
    }
  });
});

// ============================================================
// Baslangic agirligi — UYDURMA YASAK
// ============================================================
describe('baslangic agirligi', () => {
  test('gecmis veri yoksa kg null kalir ve kullaniciya soylenir', () => {
    const p = build(G({ strengthDays: 3 }), []);
    assert.ok(p.days.flatMap((d) => d.exercises).every((e) => e.kg === null),
      'veri yokken agirlik uydurulmus');
    assert.ok(p.notes.some((n) => /geçmiş veri yok/.test(n)), 'eksik veri bildirilmemis');
  });

  test('gecmis veri varsa e1RM tahmininden %90 ile turetilir', () => {
    const ws = [hevy(3, 'Bench Press (Barbell)', 60, 8)];   // e1RM ≈ 76
    const p = build(G({ strengthDays: 3, goal: 'kas', places: ['gym'] }), ws);
    const bench = p.days.flatMap((d) => d.exercises).find((e) => e.id === 'bench');
    assert.ok(bench, 'bench programa girmemis');
    assert.ok(bench.kg > 0 && bench.kg < 60,
      'agirlik gecmisteki calisma agirliginin ustunde olmamali, gelen: ' + bench.kg);
    assert.strictEqual(bench.kg % 2.5, 0, '2.5 kg adimina yuvarlanmali');
  });

  test('kullaniciya gosterilen metinde 1RM denemesi ONERILMEZ yaziyor', () => {
    // Not: kaynak yorumlarinda "1RM denemesi ASLA onerilmez" gectigi icin
    // negatif regex kaynak uzerinde calismaz — KULLANICIYA GIDEN metne bakilir.
    setProgram(build(G({})));
    let el = W.document.getElementById('programSection');
    if (!el) {
      el = W.document.createElement('div');
      el.id = 'programSection';
      W.document.body.appendChild(el);
    }
    W.eval('renderProgram()');
    const t = el.textContent;
    assert.ok(/1RM\) denemesi/.test(t) && /önerilmez/.test(t),
      'kullaniciya "1RM denemesi onerilmez" uyarisi gosterilmiyor');
  });

  test('bozuk gecmis veri (NaN/eksik top) agirliga sizmaz', () => {
    const bozuk = [
      { id: 'x', date: '2026-08-01', exercises: [{ name: 'Bench Press (Barbell)', top: { kg: NaN, reps: 8, e1rm: NaN } }] },
      { id: 'y', date: '2026-08-02', exercises: [{ name: 'Bench Press (Barbell)' }] },
      { id: 'z', date: '2026-08-03', exercises: null },
    ];
    const p = build(G({ strengthDays: 3 }), bozuk);
    for (const e of p.days.flatMap((d) => d.exercises)) {
      assert.ok(e.kg === null || Number.isFinite(e.kg), 'NaN agirlik sizdi: ' + e.tr);
    }
  });
});

// ============================================================
// Haftalik progresyon
// ============================================================
describe('progresyon', () => {
  function hazir() {
    const ws = [hevy(3, 'Bench Press (Barbell)', 60, 8)];
    return { p: build(G({ strengthDays: 3, places: ['gym'] }), ws), ws };
  }

  test('hedef tekrar araligi ASILDIYSA agirlik artar', () => {
    const { p } = hazir();
    const bench = p.days.flatMap((d) => d.exercises).find((e) => e.id === 'bench');
    const onceki = bench.kg;
    // repMax'in uzerinde tekrar yapilmis bir hafta
    const ws = [hevy(2, 'Bench Press (Barbell)', onceki, bench.repMax + 2),
                hevy(4, 'Bench Press (Barbell)', onceki, bench.repMax + 2)];
    const y = W.advanceProgram(p, ws, W.today());
    const yeni = y.days.flatMap((d) => d.exercises).find((e) => e.id === 'bench');
    assert.ok(yeni.kg > onceki, 'tekrar asildi ama agirlik artmadi');
    assert.strictEqual(y.week, 2);
  });

  test('SEANS KACIRILDIYSA program agirlastirilmaz', () => {
    const { p } = hazir();
    const bench = p.days.flatMap((d) => d.exercises).find((e) => e.id === 'bench');
    const onceki = bench.kg;
    const ws = [hevy(2, 'Bench Press (Barbell)', onceki, bench.repMax + 5)];  // 3 planli, 1 yapilmis
    const y = W.advanceProgram(p, ws, W.today());
    const yeni = y.days.flatMap((d) => d.exercises).find((e) => e.id === 'bench');
    assert.strictEqual(yeni.kg, onceki, 'yetisilemeyen hafta agirlastirilmis');
    assert.ok(y.notes.some((n) => /sabit bırakıldı/.test(n)), 'kullaniciya sebep soylenmemis');
    assert.strictEqual(y.stall, 0, 'kacirilan hafta durgunluk sayilmamali');
  });

  test('2 hafta ilerleme yoksa DELOAD (hacim duser)', () => {
    let { p } = hazir();
    const setOnce = p.days[0].exercises[0].sets;
    // tam katilim ama ilerleme yok
    const durgun = () => [hevy(1, 'X', 10, 5), hevy(3, 'X', 10, 5), hevy(5, 'X', 10, 5)];
    p = W.advanceProgram(p, durgun(), W.today());
    assert.strictEqual(p.deload, false, 'ilk durgun haftada deload olmamali');
    p = W.advanceProgram(p, durgun(), W.today());
    assert.strictEqual(p.deload, true, '2. durgun haftada deload bekleniyordu');
    assert.ok(p.days[0].exercises[0].sets < setOnce, 'deload haftasinda set azalmadi');
    assert.strictEqual(p.stall, 0, 'deload sonrasi sayac sifirlanmali');
  });

  test('gecmis en fazla 12 kayit tutar, en yeni basta', () => {
    let { p } = hazir();
    const tam = () => [hevy(1, 'X', 10, 5), hevy(3, 'X', 10, 5), hevy(5, 'X', 10, 5)];
    for (let i = 0; i < 16; i++) p = W.advanceProgram(p, tam(), W.today());
    assert.ok(p.history.length <= 12, 'gecmis budanmiyor: ' + p.history.length);
    assert.ok(p.history[0].week > p.history[1].week, 'en yeni kayit basta olmali');
  });

  test('bozuk program girdisinde patlamaz', () => {
    assert.strictEqual(W.advanceProgram(null, [], '2026-08-09'), null);
    assert.strictEqual(W.advanceProgram({}, [], '2026-08-09'), null);
  });
});

// ============================================================
// DOM
// ============================================================
describe('render', () => {
  function kap() {
    let el = W.document.getElementById('programSection');
    if (!el) {
      el = W.document.createElement('div');
      el.id = 'programSection';
      W.document.body.appendChild(el);
    }
    return el;
  }

  test('program yokken kurulum daveti gosterilir', () => {
    W.eval('data.program = null;');
    const el = kap();
    W.eval('renderProgram()');
    assert.ok(/Program kur/.test(el.textContent), 'bos durumda davet yok');
  });

  test('program varken gunler ve hacim basilir', () => {
    setProgram(build(G({ strengthDays: 4, fightDays: [6] })));
    const el = kap();
    W.eval('renderProgram()');
    assert.ok(/hafta/.test(el.textContent));
    assert.ok(/Dövüş/.test(el.textContent), 'dovus gunu gorunmuyor');
    assert.ok(!/NaN|undefined|\[object/.test(el.textContent),
      'ciktida NaN/undefined sizdi: ' + el.textContent.slice(0, 200));
  });

  test('sorumluluk notu her zaman gosterilir', () => {
    setProgram(build(G({})));
    W.eval('renderProgram()');
    const t = kap().textContent;
    assert.ok(/Ağrı hissedersen dur/.test(t), 'agri uyarisi yok');
    assert.ok(/antrenörlük değildir/.test(t), 'sorumluluk notu yok');
  });

  test('XSS: zararli program adi kacisla yazilir', () => {
    const p = build(G({}));
    p.days[0].name = '<img src=x onerror=alert(1)>';
    setProgram(p);
    const el = kap();
    W.eval('renderProgram()');
    assert.strictEqual(el.querySelectorAll('img').length, 0, 'HTML enjeksiyonu gecti');
    assert.ok(el.innerHTML.includes('&lt;img'), 'kacis uygulanmamis');
  });
});

// ============================================================
// Kaynak sozlesmesi
// ============================================================
describe('kaynak sozlesmesi', () => {
  const src = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'asistan.html'), 'utf8');

  test('AI cagrisi YOK — motor tamamen kural tabanli ve $0', () => {
    assert.ok(!/fetch\s*\(|WORKER|\/chat|\/plan|aiRun/.test(src),
      'program.js ag istegi yapiyor — bu motor deterministik ve ucretsiz kalmali');
  });

  test('ham toISOString yasagina uyuyor', () => {
    assert.ok(!/toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(src),
      'isoLocal/today() kullan (v7-119 saat dilimi bug\'i)');
  });

  test('asistan.html program bolumunu ve modali iceriyor', () => {
    assert.ok(/id="programSection"/.test(html));
    assert.ok(/id="programModal"/.test(html));
    // 9 Agu 2026: program.js artik <script> etiketiyle GELMIYOR — Diyet sekmesi
    // ilk acildiginda core.js loadModule ile tembel yukleniyor (bkz. 13-lazy).
    const coreSrc = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
    assert.ok(/const LAZY_MODULES = \{[^}]*program:\s*'\/program\.js'/.test(coreSrc),
      'program.js ne script etiketinde ne LAZY_MODULES\'te — bolum hic yuklenmez');
  });

  test('Impeccable: yan-serit yok, glass/gradyan yok, reduced-motion var', () => {
    const blok = css.slice(css.indexOf('.prog-wrap'));
    assert.ok(!/border-(left|right):\s*[2-9]/.test(blok), 'yan-serit kenarlik yasak');
    assert.ok(!/backdrop-filter|linear-gradient/.test(blok), 'glass/gradyan yasak');
    assert.ok(/prefers-reduced-motion/.test(blok), 'reduced-motion alternatifi zorunlu');
    assert.ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(blok), 'ease-out egrisi bekleniyor');
    assert.ok(!/#000\b|#fff\b/.test(blok), 'saf siyah/beyaz yasak');
  });

  test('egzersiz kutuphanesi tutarli', () => {
    const idler = LIB.map((e) => e.id);
    assert.strictEqual(new Set(idler).size, idler.length, 'tekrar eden egzersiz id');
    for (const e of LIB) {
      assert.ok(e.tr && e.en, e.id + ': tr/en adi eksik');
      assert.ok(MUSCLES[e.muscle], e.id + ': tanimsiz kas grubu ' + e.muscle);
      assert.ok(e.places.length, e.id + ': ekipman bilgisi yok');
    }
    // Her ortamda program kurulabilecek kadar hareket olmali
    for (const yer of ['gym', 'home', 'bw']) {
      const n = LIB.filter((e) => e.places.includes(yer)).length;
      assert.ok(n >= 12, yer + ' icin sadece ' + n + ' hareket var');
    }
  });
});
