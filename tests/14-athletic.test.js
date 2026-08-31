/**
 * 14 — ATLETIK KATMAN / PATLAYICILIK (9 Agu 2026)
 *
 * NEDEN: mevcut motor iyi bir SALON sablonu ureticisiydi ama dovus sporcusu icin
 * yanlis araciti. Dort eksik vardi:
 *   1) Hedef listesinde patlayicilik yoktu ('guc' = maksimal kuvvet, ayni sey degil)
 *   2) Havuzda tek bir patlayici hareket yoktu
 *   3) Rotasyonel guc (vurus gucunun kaynagi) hic yoktu — Pallof press ANTI-rotasyon
 *   4) Dovus gunu sadece takvim engeliydi, YUK hesabina girmiyordu
 *
 * Bu dosya dordunu de kilitler. En kritik sozlesme: KICKBOKS PLYOMETRIK ISTIR
 * ve haftalik temas butcesinden dusulur. O satir olmasa motor "haftada 3 gun
 * sicrama" yazar, sporcu zaten 4 gun kickboks yapar, toplam yuk katlanir.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

// Saf motor: DOM'suz calisir (buildProgram/advanceProgram global okumaz).
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
  // ⚠️ Top-level `const` vm baglamina YAZILMAZ (tarayicidaki global lexical
  // scope davranisinin aynisi) — sabitleri acikca disari ver.
  const src = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8') +
    '\n;globalThis.__SABIT = { PROGRAM_GOALS, PLYO_LIMITS, PROGRAM_LIMITS,' +
    ' PROGRAM_EXERCISES, PROGRAM_MUSCLES, PROGRAM_SPLITS, PROGRAM_GUNLER };';
  vm.runInContext(src, ctx);
  return Object.assign(ctx, ctx.__SABIT);
}
const M = motor();

const KICKBOKS = { goal: 'atletik', strengthDays: 4, sessionMin: 60, places: ['gym'], fightDays: [2, 4], avoid: [] };
const patlayicilar = (p) => (p.days || []).flatMap((d) => (d.exercises || []).filter((e) => e.explosive));

// ---------------------------------------------------------------------------
describe('hedef ve kutuphane', () => {
  test('atletik hedef var ve digerlerinden ayrilir', () => {
    assert.ok(M.PROGRAM_GOALS.atletik, 'atletik hedef yok');
    assert.strictEqual(M.PROGRAM_GOALS.atletik.athletic, true);
    assert.ok(!M.PROGRAM_GOALS.guc.athletic,
      'maksimal kuvvet (guc) patlayicilikla ayni muamele goruyor — kuvvet-hiz egrisinin farkli bolgeleri');
  });

  test('rotasyonel guc hareketi var (vurus gucunun kaynagi)', () => {
    const rot = M.PROGRAM_EXERCISES.filter((e) => e.pattern === 'rot');
    assert.ok(rot.length >= 3, 'rotasyonel guc uretici hareket yok');
    // Pallof press ANTI-rotasyondur; donus URETEN is ayri olmali
    assert.ok(!rot.some((e) => e.id === 'palloff'), 'Pallof press rotasyonel guc sayilmis — o anti-rotasyon');
  });

  test('her patlayici harekette olcum birimi ve seviye var', () => {
    for (const e of M.PROGRAM_EXERCISES.filter((x) => x.explosive)) {
      assert.ok(e.metric, e.id + ': metric yok — ilerleme neyle olculecek?');
      assert.ok(e.level >= 1 && e.level <= 3, e.id + ': gecersiz seviye');
      assert.ok(Array.isArray(e.pRep) && e.pRep.length === 2, e.id + ': tekrar araligi yok');
      assert.ok(typeof e.contact === 'number', e.id + ': temas sayisi tanimsiz');
    }
  });

  test('boyun calismasi var (dovus sporu icin)', () => {
    assert.ok(M.PROGRAM_EXERCISES.some((e) => e.pattern === 'neck'));
    assert.strictEqual(M.PROGRAM_MUSCLES.neck, 'Boyun');
  });
});

// ---------------------------------------------------------------------------
describe('seans ici sirasi — bilimsel olarak zorunlu', () => {
  const p = M.buildProgram(KICKBOKS, []);

  test('patlayici is her guc gununde EN BASTA', () => {
    for (const d of p.days.filter((x) => x.type === 'strength')) {
      const sirali = d.exercises.slice()
        .sort((a, b) => ((a.order == null ? 1 : a.order) - (b.order == null ? 1 : b.order)));
      const ilkPatlayici = sirali.findIndex((e) => e.explosive);
      const ilkNormal = sirali.findIndex((e) => !e.explosive);
      if (ilkPatlayici === -1) continue;
      assert.ok(ilkPatlayici < ilkNormal,
        d.name + ': agir setten SONRA sicrama var — o patlayicilik degil yorgunluk antrenmani');
    }
  });

  test('patlayici hareketlerin order alani 0', () => {
    for (const e of patlayicilar(p)) assert.strictEqual(e.order, 0, e.tr + ' order 0 degil');
  });

  test('seans basina en fazla 2 patlayici hareket', () => {
    for (const d of p.days.filter((x) => x.type === 'strength')) {
      const n = (d.exercises || []).filter((e) => e.explosive).length;
      assert.ok(n <= M.PLYO_LIMITS.maxPowerPerSession,
        d.name + ': ' + n + ' patlayici hareket — sinir sistemi isi az ve kaliteli olmali');
    }
  });

  test('atletik olmayan hedefte patlayici blok EKLENMEZ', () => {
    const kas = M.buildProgram(Object.assign({}, KICKBOKS, { goal: 'kas' }), []);
    assert.strictEqual(patlayicilar(kas).length, 0, 'hipertrofi hedefine patlayici is sizmis');
  });
});

// ---------------------------------------------------------------------------
describe('temas butcesi — kickboks plyometrik istir', () => {
  test('dovus gunleri butceden dusulur', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const b = M.programContactBudget(p);
    assert.strictEqual(b.dovusYuku, 2 * M.PLYO_LIMITS.fightEquiv,
      'dovus gunu yuk hesabina girmiyor — motor sporcunun zaten yaptigi isi gormuyor');
    assert.ok(b.toplam <= b.tavan, 'haftalik temas tavani asilmis: ' + b.toplam + '/' + b.tavan);
  });

  test('cok dovus gunu -> yere temasli sicrama VERILMEZ', () => {
    // 4 gun kickboks = 160 temas. Kalan butce sicramaya yetmez; motor
    // temassiz patlayici ise (saglik topu, kettlebell) gecmeli.
    const yogun = M.buildProgram(
      { goal: 'atletik', strengthDays: 2, sessionMin: 60, places: ['gym'], fightDays: [1, 2, 4, 5], avoid: [] }, []);
    const b = M.programContactBudget(yogun);
    assert.ok(b.toplam <= b.tavan, 'yogun dovus programinda tavan asilmis: ' + b.toplam);
    assert.ok(patlayicilar(yogun).length > 0, 'patlayici is tamamen kayboldu — temassiz alternatif olmaliydi');
    assert.ok(b.kullanilan < 40, 'dovus yuku yuksekken agirlik gunune hala cok temas kondu');
  });

  test('hic dovus yoksa sicrama serbest', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []);
    const b = M.programContactBudget(p);
    assert.strictEqual(b.dovusYuku, 0);
    assert.ok(b.kullanilan > 0, 'dovus yokken bile sicrama yok — butce mantigi ters calisiyor');
  });

  test('seans basina temas tavani da zorlanir', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const d of p.days) {
      const seans = (d.exercises || []).reduce((a, e) => a + M.programContacts(e), 0);
      assert.ok(seans <= M.PLYO_LIMITS.maxContactsSession,
        M.programDayLabel(d.dow) + ': seans temasi ' + seans);
    }
  });

  test('programEnforceContacts asiri yuku KIRPAR (rapor etmekle kalmaz)', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []);
    // Yapay olarak sisir
    for (const d of p.days) for (const e of d.exercises || []) if (e.contact) { e.sets = 12; e.repMax = 20; }
    assert.ok(M.programContactBudget(p).toplam > M.PLYO_LIMITS.maxContactsWeek, 'test kurulumu sismedi');
    M.programEnforceContacts(p);
    assert.ok(M.programContactBudget(p).toplam <= M.PLYO_LIMITS.maxContactsWeek,
      'temas tavani zorlanmadi — rapor etmek yetmez');
  });
});

// ---------------------------------------------------------------------------
describe('16 yas guvenlik kapilari', () => {
  test('sok yuklemesi (derinlik sicramasi) erken haftada ACILMAZ', () => {
    const havuz1 = M.programExplosivePool(['gym'], [], 1);
    assert.ok(!havuz1.some((e) => e.level === 3), '1. haftada sok yuklemesi acik');
    const havuz3 = M.programExplosivePool(['gym'], [], 3);
    assert.ok(!havuz3.some((e) => e.level === 3), 'teknik haftalarindan hemen sonra sok yuklemesi acilmis');
    const havuz9 = M.programExplosivePool(['gym'], [], M.PLYO_LIMITS.advancedFromWeek);
    assert.ok(havuz9.some((e) => e.level === 3), 'ileri seviye hicbir zaman acilmiyor');
  });

  test('ilk haftalar TEKNIK: set ve tekrar dusuk', () => {
    const p = M.buildProgram(KICKBOKS, []);
    assert.strictEqual(p.week, 1);
    for (const e of patlayicilar(p)) {
      assert.ok(e.sets <= 2, e.tr + ': teknik haftasinda ' + e.sets + ' set');
    }
    assert.ok((p.notes || []).some((n) => /TEKNİK/i.test(n)), 'teknik haftasi kullaniciya soylenmiyor');
  });

  test('teknik haftasi bitince hacim acilir', () => {
    const p = M.buildProgram(KICKBOKS, []);
    p.week = M.PLYO_LIMITS.teachWeeks + 1;
    for (const d of p.days) d.exercises = (d.exercises || []).filter((e) => !e.explosive);
    M.programAddExplosive(p);
    assert.ok(patlayicilar(p).every((e) => e.sets >= 3), 'teknik haftasi sonrasi hala 2 sette kalmis');
  });

  test('agriyan bolge patlayici havuzdan da elenir', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { avoid: ['quads'] }), []);
    assert.ok(!patlayicilar(p).some((e) => e.muscle === 'quads'),
      'agriyan bolgeyi calistiran patlayici hareket programa girmis');
  });

  test('haftada en az 1 tam dinlenme gunu kalir', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { strengthDays: 5 }), []);
    const dolu = new Set(p.days.map((d) => d.dow));
    assert.ok(dolu.size <= 6, 'her gun dolu — dinlenme gunu yok');
  });
});

// ---------------------------------------------------------------------------
describe('hacim muhasebesi', () => {
  test('patlayici is hipertrofi set tavanina SAYILMAZ', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []);
    const sets = M.programWeeklySets(p);
    const patSet = patlayicilar(p).reduce((a, e) => a + e.sets, 0);
    assert.ok(patSet > 0, 'test icin patlayici is yok');
    const toplamSayilan = Object.values(sets).reduce((a, n) => a + n, 0);
    const tumSetler = p.days.flatMap((d) => d.exercises || []).reduce((a, e) => a + e.sets, 0);
    assert.strictEqual(tumSetler - toplamSayilan, patSet,
      'patlayici setler hipertrofi sayimina karismis — 3 tekrarlik sicrama ile leg extension ayni set degil');
  });

  test('kas basina haftalik set tavani hala zorlaniyor', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const sets = M.programWeeklySets(p);
    for (const m of Object.keys(sets)) {
      assert.ok(sets[m] <= M.PROGRAM_LIMITS.maxSetsPerMuscleWeek,
        m + ': ' + sets[m] + ' set — tavan ' + M.PROGRAM_LIMITS.maxSetsPerMuscleWeek);
    }
  });
});

// ---------------------------------------------------------------------------
describe('progresyon — cikti ile, agirlikla DEGIL', () => {
  test('sicramaya ASLA kg yazilmaz', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const hevy = [];
    for (let i = 0; i < 4; i++) hevy.push({ date: '2026-08-0' + (5 + i), exercises: [] });
    const y = M.advanceProgram(p, hevy, '2026-08-09');
    for (const e of patlayicilar(y)) {
      if (e.metric === 'kg') continue;
      assert.ok(e.kg == null || e.kg === undefined,
        e.tr + ': olcumle takip edilen harekete kg yazilmis');
    }
  });

  test('cikti dususu YORGUNLUK sinyali — hacim azalir', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []);
    p.week = 5;
    for (const d of p.days) d.exercises = (d.exercises || []).filter((e) => !e.explosive);
    M.programAddExplosive(p);   // teknik haftasi bitti -> 3 set
    const hedef = patlayicilar(p).find((e) => e.metric !== 'kg');
    assert.ok(hedef, 'olcumlu patlayici hareket yok');
    const oncekiSet = hedef.sets;
    assert.ok(oncekiSet > 2, 'test kurulumu: hacim dusurulebilir olmali');
    p.measures = {}; p.measures[hedef.id] = [{ week: 3, v: 200 }, { week: 4, v: 180 }];
    const hevy = [1, 2, 3, 4].map((i) => ({ date: '2026-08-0' + (4 + i), exercises: [] }));
    const y = M.advanceProgram(p, hevy, '2026-08-09');
    const sonra = y.days.flatMap((d) => d.exercises).find((e) => e.id === hedef.id);
    assert.ok(sonra.sets < oncekiSet,
      'cikti %10 dustu ama hacim aynen durdu — bu durgunluk degil yorgunluk sinyali');
  });

  test('cikti artisi ilerleme sayilir', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []);
    p.week = 5;
    const hedef = patlayicilar(p).find((e) => e.metric !== 'kg');
    p.measures = {}; p.measures[hedef.id] = [{ week: 3, v: 180 }, { week: 4, v: 195 }];
    const hevy = [1, 2, 3, 4].map((i) => ({ date: '2026-08-0' + (4 + i), exercises: [] }));
    const y = M.advanceProgram(p, hevy, '2026-08-09');
    assert.strictEqual(y.stall, 0, 'olculen ilerleme durgunluk sayacini sifirlamadi');
  });

  test('olcum yoksa acikca soyler (sessiz kalmaz)', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { fightDays: [] }), []);
    p.week = 5;
    const hevy = [1, 2, 3, 4].map((i) => ({ date: '2026-08-0' + (4 + i), exercises: [] }));
    const y = M.advanceProgram(p, hevy, '2026-08-09');
    const metin = JSON.stringify(y.history) + JSON.stringify(y.notes);
    assert.ok(/ölçüm/i.test(metin), 'olcum girilmemis ama kullaniciya soylenmiyor');
  });

  test('seans kacirilmissa patlayici hacim de ARTMAZ', () => {
    const p = M.buildProgram(KICKBOKS, []);
    p.week = 5;
    const y = M.advanceProgram(p, [{ date: '2026-08-08', exercises: [] }], '2026-08-09');
    assert.strictEqual(y.stall, Number(p.stall) || 0, 'kacirilan haftada durgunluk sayaci arttirilmis');
    assert.ok((y.notes || []).some((n) => /sabit|yetişemediğin/i.test(n)));
  });

  test('programExplosiveTrend uc durumu dogru ayirir', () => {
    const p = { measures: { a: [{ v: 100 }, { v: 120 }], b: [{ v: 100 }, { v: 90 }], c: [{ v: 100 }] } };
    assert.strictEqual(M.programExplosiveTrend(p, 'a').durum, 'artis');
    assert.strictEqual(M.programExplosiveTrend(p, 'b').durum, 'dusus');
    assert.strictEqual(M.programExplosiveTrend(p, 'c').durum, 'veri-yok');
    assert.strictEqual(M.programExplosiveTrend(p, 'yok').durum, 'veri-yok');
  });

  test('bozuk olcum verisi NaN sizdirmaz', () => {
    const p = { measures: { x: [{ v: 'abc' }, { v: null }], y: [{ v: 0 }, { v: 5 }] } };
    for (const id of ['x', 'y']) {
      const t = M.programExplosiveTrend(p, id);
      assert.ok(!Number.isNaN(t.pct), id + ': NaN sizdi');
    }
  });
});

// ---------------------------------------------------------------------------
describe('dayaniklilik ve sozlesmeler', () => {
  test('AI cagrisi YOK — motor deterministik kalir', () => {
    const src = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8');
    // ⚠️ 9 Agu: program.js'te artik TEK bir fetch var — Hevy'ye rutin yazma
    // (disa aktarim, AI degil). Motorun kendisi hala kural tabanli ve $0.
    // Sozlesme daraltildi: AI ucuna baglanmak YASAK, izinli tek uc Hevy.
    assert.ok(!/\/chat|\/plan|\/health-coach|aiRun/.test(src),
      'program.js bir AI ucuna baglanmis — motor kural tabanli ve $0 kalmali');
    const fetchler = [...new Set(src.match(/fetch\(([A-Z_]+)/g) || [])];
    assert.deepStrictEqual(fetchler, ['fetch(HEVY_ROUTINES_ENDPOINT'],
      'program.js beklenmeyen bir uca istek atiyor: ' + fetchler.join(', '));
  });

  test('ayni girdi ayni programi verir (deterministik)', () => {
    const a = M.buildProgram(KICKBOKS, []);
    const b = M.buildProgram(KICKBOKS, []);
    const sade = (p) => JSON.stringify(p.days.map((d) => [d.dow, d.name, (d.exercises || []).map((e) => e.id)]));
    assert.strictEqual(sade(a), sade(b));
  });

  test('bos/bozuk girdide comez', () => {
    for (const cfg of [{}, { goal: 'atletik' }, { goal: 'atletik', strengthDays: 99, fightDays: [9, -1] }]) {
      const p = M.buildProgram(cfg, []);
      assert.ok(p && Array.isArray(p.days), 'bozuk girdide program uretilmedi');
      assert.ok(M.programContactBudget(p).toplam <= M.PLYO_LIMITS.maxContactsWeek);
    }
  });

  test('gun sayisi 0 tekrar araligi uretmez', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const d of p.days) {
      for (const e of d.exercises || []) {
        assert.ok(e.sets >= 1 && e.repMin >= 1 && e.repMax >= e.repMin,
          e.tr + ': gecersiz set/tekrar ' + e.sets + '×' + e.repMin + '-' + e.repMax);
      }
    }
  });

  test('teknik haftasinda tekrar metni "3-3" degil "3"', () => {
    assert.strictEqual(M.programRepText({ sets: 2, repMin: 3, repMax: 3 }), '2 × 3');
    assert.strictEqual(M.programRepText({ sets: 3, repMin: 3, repMax: 5 }), '3 × 3-5');
    assert.strictEqual(M.programRepText({ sets: 3, repMin: 20, repMax: 20, sure: true }), '3 × 20 sn');
  });
});

// ---------------------------------------------------------------------------
describe('Impeccable — atletik UI', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const blok = css.slice(css.indexOf('.pd-ex-pow'));

  test('yan-serit kenarlik yok, tam kenar var', () => {
    assert.ok(!/border-(left|right)\s*:\s*[2-9]/.test(blok), 'yan-serit accent kenarlik yasak');
    assert.ok(/border:\s*1px/.test(blok));
  });

  test('gradyan / glass / saf renk yok', () => {
    assert.ok(!/linear-gradient|backdrop-filter/.test(blok));
    assert.ok(!/#fff\b|#ffffff\b|#000\b|#000000\b/i.test(blok));
  });

  test('ease-out + reduced-motion var', () => {
    assert.ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(blok));
    assert.ok(/prefers-reduced-motion/.test(blok));
  });

  test('styles.css hala LF', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'styles.css'));
    assert.strictEqual(raw.indexOf(Buffer.from('\r\n')), -1);
  });
});

// ---------------------------------------------------------------------------
// 30 Agu 2026 — KANIT DENETIMI DUZELTMELERI
// Bagimsiz literatur denetiminde cikan uc bulgu; ucu de burada kilitleniyor.
describe('denetim duzeltmeleri (30 Agu 2026)', () => {
  test('temas butcesi SIDDETE gore agirlikli — derinlik sicramasi pogo kadar ucuz degil', () => {
    // Eski hali sadece sayiyordu: 60 pogo hop ile 60 derinlik sicramasi ayni
    // butceyi yiyordu. Motorun kendi gerekcesi ("5 derinlik sicramasi ile
    // 5 leg extension ayni set degildir") tam bunun tersini savunuyor.
    const lib = M.PROGRAM_EXERCISES || EV('PROGRAM_EXERCISES');
    const bul = (id) => lib.find((e) => e.id === id);
    const depth = bul('depthjump'), pogo = bul('pogo');
    assert.ok(depth && pogo, 'hareketler bulunamadi');
    assert.ok((depth.plyoW || 1) > (pogo.plyoW || 1),
      'derinlik sicramasi ayak bilegi sicramasindan daha agir sayilmali');

    const ayniIs = { sets: 3, repMin: 10, repMax: 10, contact: 1 };
    const dj = M.programContacts(Object.assign({}, ayniIs, { plyoW: depth.plyoW }));
    const pg = M.programContacts(Object.assign({}, ayniIs, { plyoW: pogo.plyoW }));
    assert.ok(dj > pg, 'ayni set x tekrarda derinlik sicramasi daha cok butce yemeli');
  });

  test('yere temassiz patlayici is butceden DUSMEZ', () => {
    // Saglik topu atisi patlayici ama yere temas degil. contact: 0 kalmali,
    // yoksa agirlik carpani onu da butceye sokar.
    const lib = M.PROGRAM_EXERCISES || EV('PROGRAM_EXERCISES');
    for (const id of ['mbrot', 'mbslam', 'mbchest', 'kbswing', 'pushpress', 'hangclean']) {
      const e = lib.find((x) => x.id === id);
      assert.ok(e, id + ' yok');
      assert.strictEqual(M.programContacts(Object.assign({ sets: 3, repMin: 5, repMax: 5 }, e)), 0,
        id + ' temas butcesinden dusuyor — yere temas etmiyor');
    }
  });

  test('URETILEN programda siddet agirligi tasiniyor (entegrasyon)', () => {
    // ⚠️ Bu test, birim testin kacirdigi hatayi yakalar: `plyoW` kutuphanede
    // tanimliydi ama programAddExplosive secilen harekete kopyalamiyordu, ve
    // temas formulu uc ayri yerde elle yaziliydi. Sonuc: agirlik kutuphanede
    // duruyor, butce eski sekilde sayiyordu. Artik hesap programContacts()
    // tek kaynagindan gelir ve alan programa tasinir.
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { sessionMin: 90 }), []);
    const patlayici = patlayicilar(p).filter((e) => (Number(e.contact) || 0) > 0);
    assert.ok(patlayici.length, 'yere temasli patlayici hareket uretilmedi');
    for (const e of patlayici) {
      assert.ok(typeof e.plyoW === 'number', e.tr + ': plyoW programa tasinmamis');
    }
    const lib = M.PROGRAM_EXERCISES;
    for (const e of patlayici) {
      const kutuphane = lib.find((x) => x.id === e.id);
      assert.strictEqual(e.plyoW, Number(kutuphane.plyoW) || 1,
        e.tr + ': programdaki agirlik kutuphaneyle uyusmuyor');
    }
  });

  test('yorgunluk esigi ergen olcum gurultusunun USTUNDE', () => {
    // Ergen sporcularda saptanabilir en kucuk degisim CMJ yuksekliginde >%7
    // (Thomas 2017); tek CMJ'nin varyasyon katsayisi kuvvet platformunda ~%5
    // (Cormack 2008), telefon uygulamasinda %8.2 (Rago 2018). 5 esigi
    // gurultunun icindeydi ve uyariyi anlamsizlastiriyordu.
    const L = M.PLYO_LIMITS || EV('PLYO_LIMITS');
    assert.ok(L.dropPctDeload >= 10,
      'esik ' + L.dropPctDeload + ' — ergen olcum gurultusunun (SDC >%7) altinda');
  });

  test('boyun izometrigi SANIYE birimiyle yaziliyor', () => {
    // Izometrik tutus tekrarla olculmez. Render zaten `sure: true` ile "sn"
    // yaziyordu ama kayittaki metric alani 'reps' diyordu — celiski.
    const lib = M.PROGRAM_EXERCISES || EV('PROGRAM_EXERCISES');
    const n = lib.find((e) => e.id === 'neckiso');
    assert.ok(n, 'neckiso yok');
    assert.strictEqual(n.sure, true);
    assert.strictEqual(n.metric, 'sn', 'izometrik tutus tekrar degil saniyedir');
  });

  test('boyun haftada en fazla 2 gune konur', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { strengthDays: 5, sessionMin: 90 }), []);
    const gun = (p.days || []).filter((d) => (d.exercises || []).some((e) => e.muscle === 'neck')).length;
    assert.ok(gun <= 2, 'boyun ' + gun + ' gune kondu — yayinlanmis protokoller 2-3/hafta');
  });
});
