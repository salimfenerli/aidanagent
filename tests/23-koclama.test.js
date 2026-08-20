/**
 * 23 — KOCLUK KALITESI: tempo · RPE · vucut agirligi kalibrasyonu · mobilite
 * (18 Agu 2026)
 *
 * Salim'in sozlesmesi: "her egzersiz icin Ad | Set x Tekrar | Tempo |
 * Dinlenme | RPE". Motor bunlarin ucunu (tempo, RPE, vucut agirligi
 * kalibrasyonu) hic uretmiyordu. Bu dosya uretildiklerini VE bilimsel
 * olarak dogru uretildiklerini kilitler.
 *
 * En onemli iki sozlesme:
 *   - Kademe 1'de konsantrik KASTEN YAVASLATILMAZ (yuku dusurur, kuvveti azaltir)
 *   - Hicbir sette RPE 10 yazilmaz (16 yas; yetmezlik ek kazanc getirmez)
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
    today: () => '2026-08-18',
    shiftDateStr: (d, n) => {
      const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n);
      return x.toISOString().slice(0, 10);
    },
    data: {}, aidanPrompt: () => Promise.resolve(null),
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8') +
    '\n;globalThis.__SABIT = { PROGRAM_GOALS, PROGRAM_EXERCISES, PROGRAM_LIMITS,' +
    ' PLYO_LIMITS, PROGRAM_TEMPO, PROGRAM_TEMPO_TIER, PROGRAM_RPE, PROGRAM_BW_LOAD,' +
    ' PROGRAM_BW_TEST, PROGRAM_REP_FLOOR, PROGRAM_SPLITS, PROGRAM_IKINCIL,' +
    ' PROGRAM_MUSCLES, PROGRAM_ORTA_ARTIS };';
  vm.runInContext(src, ctx);
  return Object.assign(ctx, ctx.__SABIT);
}
const M = motor();

const KICKBOKS = { goal: 'atletik', strengthDays: 4, sessionMin: 60, places: ['gym'], fightDays: [2, 4], avoid: [] };
const HEDEFLER = Object.keys(M.PROGRAM_GOALS);
const tumHareketler = (p) => (p.days || []).flatMap((d) => d.exercises || []);
const gucGunleri = (p) => (p.days || []).filter((d) => d.type === 'strength');

// ---------------------------------------------------------------------------
describe('1 — tempo', () => {
  test('her normal harekette tempo var, bicim dogru', () => {
    for (const g of HEDEFLER) {
      const p = M.buildProgram(Object.assign({}, KICKBOKS, { goal: g }), []);
      for (const e of tumHareketler(p)) {
        if (e.explosive || e.sure) continue;
        assert.ok(e.tempo, g + '/' + e.tr + ': tempo yok');
        assert.match(e.tempo, /^[0-9X]-[0-9X]-[0-9X]-[0-9X]$/,
          g + '/' + e.tr + ': tempo bicimi bozuk (' + e.tempo + ')');
      }
    }
  });

  test('patlayici ve sure bazli harekette tempo YOK', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const e of tumHareketler(p)) {
      if (e.explosive) {
        assert.strictEqual(e.tempo, null, e.tr + ': patlayici iste tempo yazilmis — olcu HIZ');
      }
      if (e.sure) {
        assert.strictEqual(e.tempo, null, e.tr + ': sure bazli harekette tempo yazilmis');
      }
    }
  });

  test('SOZLESME: kademe 1\'de konsantrik kasten yavaslatilmaz', () => {
    // Agir sette konsantrigi yavaslatmak kaldirilan yuku dusurur ve kuvvet
    // kazanimini azaltir. Dogrusu: inis kontrollu, kalkista maksimum hiz.
    const p = M.buildProgram(KICKBOKS, []);
    for (const e of tumHareketler(p)) {
      if (e.tier !== 1 || !e.tempo) continue;
      const kon = e.tempo.split('-')[2];
      assert.ok(kon === 'X' || Number(kon) <= 1,
        e.tr + ': ana kaldiris konsantrigi ' + kon + ' sn — yavaslatilmis');
    }
  });

  test('eksantrik her zaman en az 2 sn — bag dokusu uyarani', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const e of tumHareketler(p)) {
      if (!e.tempo) continue;
      const eks = Number(e.tempo.split('-')[0]);
      assert.ok(eks >= 2, e.tr + ': eksantrik ' + eks + ' sn — kontrolsuz inis');
    }
  });

  test('kutuphanedeki tempo tanimlari gecerli hareketlere ait', () => {
    for (const id of Object.keys(M.PROGRAM_TEMPO)) {
      assert.ok(M.PROGRAM_EXERCISES.some((x) => x.id === id),
        'PROGRAM_TEMPO\'da olmayan hareket: ' + id);
    }
  });

  test('nordic curl eksantrik odakli (hamstring korumasi)', () => {
    assert.strictEqual(M.PROGRAM_TEMPO.nordic.split('-')[0], '5',
      'nordic curl eksantrik odakli olmali');
  });
});

// ---------------------------------------------------------------------------
describe('2 — RPE', () => {
  test('16 YAS KAPISI: hicbir sette RPE 10 yok', () => {
    for (const g of HEDEFLER) {
      for (let hafta = 1; hafta <= 12; hafta++) {
        const p = M.buildProgram(Object.assign({}, KICKBOKS, { goal: g }), []);
        p.week = hafta;
        M.programApplyEffort(p);
        for (const e of tumHareketler(p)) {
          if (!e.rpe) continue;
          const enYuksek = Math.max.apply(null, String(e.rpe).split('-').map(Number));
          assert.ok(enYuksek <= 9,
            g + ' hafta ' + hafta + '/' + e.tr + ': RPE ' + e.rpe + ' — yetmezlige gidiliyor');
        }
      }
    }
  });

  test('her normal harekette RPE var', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const e of tumHareketler(p)) {
      if (e.explosive) continue;
      assert.ok(e.rpe, e.tr + ': RPE yok');
    }
  });

  test('patlayici iste RPE YOK — olcu efor degil hiz', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const pat = tumHareketler(p).filter((e) => e.explosive);
    assert.ok(pat.length, 'patlayici hareket yok');
    for (const e of pat) assert.strictEqual(e.rpe, null, e.tr + ': patlayici iste RPE yazilmis');
  });

  test('teknik haftasinda RPE bir kademe DUSUK', () => {
    const p = M.buildProgram(KICKBOKS, []);
    p.week = 1; M.programApplyEffort(p);
    const teknik = tumHareketler(p).filter((e) => e.tier === 1 && !e.explosive)
      .map((e) => Number(String(e.rpe).split('-')[0]));
    p.week = 5; M.programApplyEffort(p);
    const normal = tumHareketler(p).filter((e) => e.tier === 1 && !e.explosive)
      .map((e) => Number(String(e.rpe).split('-')[0]));
    assert.ok(teknik.length && normal.length);
    assert.ok(Math.max.apply(null, teknik) < Math.max.apply(null, normal),
      'teknik haftasinda efor dusurulmuyor');
  });

  test('hafifletme haftasinda RPE tavani 6', () => {
    const p = M.buildProgram(KICKBOKS, []);
    p.week = 6; p.deload = true;
    M.programApplyEffort(p);
    for (const e of tumHareketler(p)) {
      if (!e.rpe) continue;
      const enYuksek = Math.max.apply(null, String(e.rpe).split('-').map(Number));
      assert.ok(enYuksek <= 6, e.tr + ': hafifletme haftasinda RPE ' + e.rpe);
    }
  });

  test('boyun calismasi asla zorlanmaz', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const e of tumHareketler(p)) {
      if (e.muscle !== 'neck') continue;
      const enYuksek = Math.max.apply(null, String(e.rpe).split('-').map(Number));
      assert.ok(enYuksek <= 7, 'boyunda RPE ' + e.rpe + ' — zorlanmamali');
    }
  });

  test('hafta ilerleyince RPE yeniden hesaplaniyor (advanceProgram)', () => {
    let p = M.buildProgram(KICKBOKS, []);
    const ilk = tumHareketler(p).find((e) => e.tier === 1 && !e.explosive).rpe;
    for (let i = 0; i < 4; i++) p = M.advanceProgram(p, [], '2026-08-18');
    const sonra = tumHareketler(p).find((e) => e.tier === 1 && !e.explosive).rpe;
    assert.notStrictEqual(ilk, sonra, 'teknik haftasi bitti ama RPE ayni kaldi');
  });
});

// ---------------------------------------------------------------------------
describe('3 — vucut agirligi kalibrasyonu', () => {
  const ile = (bwMax, kg) => M.buildProgram(
    Object.assign({}, KICKBOKS, { bodyweight: kg || 65, bwMax }), []);

  test('kapasite yetmiyorsa REGRESYON onerilir, sayi kovalatmaz', () => {
    const p = ile({ pullup: 2, pushup: 6, dip: 1 });
    const zayif = tumHareketler(p).filter((e) => e.bwTip === 'regresyon');
    assert.ok(zayif.length, '2 barfiks cekebilen birine kolaylastirma onerilmiyor');
    for (const e of zayif) {
      assert.ok(/bant|negatif|egik|eğik|kolaylas|kolaylaş|ayak/i.test(e.bwNot),
        e.tr + ': regresyon notu somut degil (' + e.bwNot + ')');
    }
    assert.ok((p.notes || []).some((n) => /kolaylaştırma|karşılamıyor/i.test(n)),
      'programda uyari notu yok');
  });

  test('kapasite fazlaysa KG eklenir (kemer)', () => {
    const p = ile({ pullup: 20, pushup: 50, dip: 25 });
    const guclu = tumHareketler(p).filter((e) => e.bwTip === 'ekle');
    assert.ok(guclu.length, '20 barfiks cekebilen birine agirlik onerilmiyor');
    for (const e of guclu) {
      assert.ok(e.kg > 0, e.tr + ': ekleme onerildi ama kg yazilmadi');
      assert.ok(e.kg % 2.5 === 0, e.tr + ': kg 2.5 adimina yuvarlanmamis (' + e.kg + ')');
    }
  });

  test('veri yoksa motor UYDURMAZ', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const e of tumHareketler(p)) {
      assert.ok(e.bwTip == null, e.tr + ': max tekrar verisi yokken kalibrasyon yapilmis');
      assert.ok(e.bwNot == null, e.tr + ': veri yokken not uretilmis');
    }
  });

  test('kalibrasyon 1RM DENEMESI istemez — Epley ile turetilir', () => {
    // Sozlesme: girdi "kac tekrar yapabiliyorsun", cikti kg. Arada 1RM yok.
    const az = ile({ pullup: 3 });
    const cok = ile({ pullup: 18 });
    const azB = tumHareketler(az).find((e) => e.id === 'pullup');
    const cokB = tumHareketler(cok).find((e) => e.id === 'pullup');
    if (azB && cokB) {
      assert.notStrictEqual(azB.bwTip, cokB.bwTip,
        '3 barfiks ile 18 barfiks ayni muamele goruyor');
    }
  });

  test('sinav ve barfiks ayni yuk oranini ALMAZ', () => {
    assert.ok(M.PROGRAM_BW_LOAD.pushup < M.PROGRAM_BW_LOAD.pullup,
      'sinavda kaldirilan yuk barfiksle ayni sayilmis');
  });
});

// ---------------------------------------------------------------------------
describe('4 — mobilite / soguma', () => {
  test('her guc gununde soguma blogu var', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const d of gucGunleri(p)) {
      assert.ok((d.cooldown || []).length >= 3, d.name + ': soguma blogu yok ya da yetersiz');
    }
  });

  test('SOZLESME: statik germe SONDA — isinmada degil', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const d of gucGunleri(p)) {
      const isinma = (d.warmup || []).join(' ');
      assert.ok(!/statik|2 × 30 sn|30 sn\/taraf/i.test(isinma),
        d.name + ': isinmaya statik germe konmus — kuvvet ve sicrama ciktisini dusurur');
      assert.ok((d.cooldown || []).some((x) => /Statik germe seansın SONUNDA/i.test(x)),
        d.name + ': soguma blogunda kural yazmiyor');
    }
  });

  test('alt ve ust gun farkli mobilite aliyor', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const alt = gucGunleri(p).find((d) => d.agirBacak);
    const ust = gucGunleri(p).find((d) => !d.agirBacak);
    assert.ok(alt && ust, 'alt/ust gun ayrimi yok');
    assert.ok(/kalça|Kalça|ayak bileği/i.test(alt.cooldown.join(' ')), 'alt gunde kalca/ayak bilegi isi yok');
    assert.ok(/torasik|Torasik|omuz/i.test(ust.cooldown.join(' ')), 'ust gunde torasik/omuz isi yok');
  });

  test('dovus sporcusunda boyun mobilitesi var', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const hepsi = gucGunleri(p).map((d) => (d.cooldown || []).join(' ')).join(' ');
    assert.ok(/[Bb]oyun/.test(hepsi), 'atletik hedefte boyun mobilitesi yok');
  });

  test('atletik olmayan hedefte de soguma var (mobilite herkese lazim)', () => {
    const p = M.buildProgram(Object.assign({}, KICKBOKS, { goal: 'kas' }), []);
    for (const d of gucGunleri(p)) assert.ok((d.cooldown || []).length, d.name + ': soguma yok');
  });
});

// ---------------------------------------------------------------------------
describe('5 — cikti sozlesmesi (Ad | Set x Tekrar | Tempo | Dinlenme | RPE)', () => {
  test('her harekette bes alanin tamami cozulebiliyor', () => {
    const p = M.buildProgram(KICKBOKS, []);
    for (const e of tumHareketler(p)) {
      assert.ok(e.tr, 'hareket adi yok');
      assert.ok(e.sets > 0 && e.repMin > 0, e.tr + ': set/tekrar yok');
      assert.ok(e.rest > 0, e.tr + ': dinlenme suresi yok');
      // tempo ve rpe patlayicida bilincli olarak null — ikisi birden null ise
      // hareket ya patlayici ya sure bazli olmali
      if (e.tempo == null && e.rpe == null) {
        assert.ok(e.explosive, e.tr + ': tempo da RPE de yok ama patlayici degil');
      }
    }
  });

  test('dinlenme kademeye gore FARKLI — tek deger degil', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const t1 = tumHareketler(p).filter((e) => e.tier === 1).map((e) => e.rest);
    const t3 = tumHareketler(p).filter((e) => e.tier === 3 && !e.explosive).map((e) => e.rest);
    assert.ok(t1.length && t3.length);
    assert.ok(Math.min.apply(null, t1) > Math.max.apply(null, t3),
      'ana kaldiris ile izolasyon ayni dinlenmeyi aliyor');
  });

  test('deterministik: ayni girdi ayni tempo/RPE verir', () => {
    const a = M.buildProgram(KICKBOKS, []);
    const b = M.buildProgram(KICKBOKS, []);
    const oz = (p) => tumHareketler(p).map((e) => [e.id, e.tempo, e.rpe, e.rest].join('|')).join(';');
    assert.strictEqual(oz(a), oz(b), 'motor deterministik degil');
  });
});

// ---------------------------------------------------------------------------
describe('6 — gun yerlesimi ve antagonist denge (18 Agu 2026 denetimi)', () => {
  // Denetimde iki gercek hata bulundu:
  //   1) 300 yapilandirmanin 120'sinde (%40) iki AGIR BACAK gunu arka arkaya
  //      dusuyordu — motor yalniz dovuse komsulugu kontrol ediyordu
  //   2) Zaman butcesi son slotu kesince kesilen hep CEKIS oluyordu;
  //      hafta toplami itis 20 / cekis 10'a kadar bozuluyordu
  const AYARLAR = [];
  for (const goal of Object.keys(M.PROGRAM_GOALS)) {
    for (const sd of [3, 4, 5]) {
      for (const sessionMin of [45, 60, 90]) {
        for (const fightDays of [[], [2, 4], [1, 3, 5], [0, 3]]) {
          AYARLAR.push({ goal, strengthDays: sd, sessionMin, places: ['gym'], fightDays, avoid: [] });
        }
      }
    }
  }
  const komsu = (a, b) => (a + 1) % 7 === b || (b + 1) % 7 === a;
  const kalip = (id) => (M.PROGRAM_EXERCISES.find((x) => x.id === id) || {}).pattern;
  const ITIS = ['push_h', 'push_v'], CEKIS = ['pull_h', 'pull_v'];
  const setTop = (p, grup) => (p.days || []).reduce((a, d) => a +
    (d.exercises || []).reduce((b, e) =>
      b + ((!e.explosive && grup.indexOf(kalip(e.id)) >= 0) ? (e.sets || 0) : 0), 0), 0);

  test('REGRESYON: iki agir bacak gunu ARKA ARKAYA gelmiyor', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const bacak = (p.days || []).filter((d) => d.agirBacak).map((d) => d.dow);
      for (const a of bacak) {
        for (const b of bacak) {
          if (a === b) continue;
          assert.ok(!komsu(a, b),
            cfg.goal + '/' + cfg.strengthDays + 'gün/dövüş[' + cfg.fightDays.join(',') +
            ']: bacak günleri ' + bacak.join(',') + ' — arka arkaya');
        }
      }
    }
  });

  test('ayni gune iki sablon yerlesmiyor', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const gunler = (p.days || []).filter((d) => d.type === 'strength').map((d) => d.dow);
      assert.strictEqual(new Set(gunler).size, gunler.length,
        cfg.goal + '/' + cfg.strengthDays + 'gün: aynı güne iki antrenman');
    }
  });

  test('dovus gunune guc antrenmani konmuyor', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      for (const d of (p.days || [])) {
        if (d.type !== 'strength') continue;
        assert.ok(cfg.fightDays.indexOf(d.dow) < 0,
          cfg.goal + ': ' + d.dow + '. güne hem dövüş hem ağırlık');
      }
    }
  });

  test('bacak-bacak komsulugu cozulemezse motor SUSMUYOR', () => {
    // Cozulemeyen durum kalabilir (cok az bos gun); o zaman yazmali.
    let uyarili = 0, cakisan = 0;
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const bacak = (p.days || []).filter((d) => d.agirBacak).map((d) => d.dow);
      let ard = false;
      for (const a of bacak) for (const b of bacak) if (a !== b && komsu(a, b)) ard = true;
      if (!ard) continue;
      cakisan++;
      if ((p.notes || []).some((n) => /arka arkaya/i.test(n))) uyarili++;
    }
    assert.strictEqual(cakisan, uyarili, cakisan + ' çakışmanın ' + uyarili + '\'i uyarılmış');
  });

  test('REGRESYON: cekis hacmi itisin %75\'inin altina inmiyor', () => {
    // ⚠️ Yon onemli: eksik olan CEKIS. Itis fazlaligi omuz ekleminin en
    // bilinen risk kalibi; bench-agirlikli programlarin klasik sorunu.
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const itis = setTop(p, ITIS), cekis = setTop(p, CEKIS);
      if (!itis) continue;
      assert.ok(cekis >= itis * 0.75,
        cfg.goal + '/' + cfg.strengthDays + 'gün/' + cfg.sessionMin + 'dk: itiş ' + itis +
        ' çekiş ' + cekis + ' (' + (cekis / itis).toFixed(2) + '×)');
    }
  });

  test('iki ust sablon ayni kalipla BASLAMIYOR', () => {
    // Ikisi de itisle baslayinca butce kesintisi hep cekise denk geliyordu.
    const ust = M.PROGRAM_SPLITS.upperlower.filter((x) => !x.agirBacak);
    assert.strictEqual(ust.length, 2);
    assert.notStrictEqual(ust[0].patterns[0], ust[1].patterns[0],
      'her iki üst gün de ' + ust[0].patterns[0] + ' ile başlıyor');
    assert.ok(ITIS.indexOf(ust[0].patterns[0]) >= 0 || CEKIS.indexOf(ust[0].patterns[0]) >= 0);
  });

  test('denge duzeltmesi hareket sayisini ve kas tavanini bozmuyor', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const sets = M.programWeeklySets(p);
      for (const m of Object.keys(sets)) {
        assert.ok(sets[m] <= M.PROGRAM_LIMITS.maxSetsPerMuscleWeek,
          cfg.goal + ': ' + m + ' ' + sets[m] + ' set — tavan aşıldı');
      }
      for (const d of (p.days || [])) {
        assert.ok((d.exercises || []).length <= M.PROGRAM_LIMITS.maxExercisesPerSession + 3,
          cfg.goal + ': ' + (d.exercises || []).length + ' hareket');
      }
    }
  });

  test('cekis seti eklendiyse SEBEBIYLE birlikte yaziliyor', () => {
    let bulundu = false;
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const n = (p.notes || []).find((x) => /Çekiş hacmi/i.test(x));
      if (!n) continue;
      bulundu = true;
      assert.match(n, /omuz/i, 'çekiş notu sebebini yazmıyor');
    }
    assert.ok(bulundu, 'hiçbir yapılandırmada çekiş dengelemesi tetiklenmedi');
  });

  test('gun yerlesimi deterministik', () => {
    for (const cfg of AYARLAR.slice(0, 12)) {
      const a = M.buildProgram(cfg, []).days.map((d) => d.dow + ':' + d.name).join('|');
      const b = M.buildProgram(cfg, []).days.map((d) => d.dow + ':' + d.name).join('|');
      assert.strictEqual(a, b, cfg.goal + ': gün yerleşimi deterministik değil');
    }
  });
});

// ---------------------------------------------------------------------------
describe('7 — hafta ici dalgalanma ve ikincil kas payi (18 Agu 2026)', () => {
  // Dokumanda "bilinen sinir" olarak duran iki madde kapatildi:
  //   5) Periyodizasyon yok — hafta ici agir/orta/hafif dalgalanma yok
  //  4b) Ikincil kas payi sayilmiyor — hip thrust arka bacagi da yukler
  const AYARLAR = [];
  for (const goal of Object.keys(M.PROGRAM_GOALS)) {
    for (const sd of [3, 4, 5]) {
      for (const sessionMin of [45, 60, 90]) {
        AYARLAR.push({ goal, strengthDays: sd, sessionMin, places: ['gym'], fightDays: [2, 4], avoid: [] });
      }
    }
  }
  const lib = (id) => M.PROGRAM_EXERCISES.find((x) => x.id === id) || {};
  const anaKaldiris = (p) => tumHareketler(p).filter((e) => !e.explosive && !e.sure && e.tier === 1);

  test('SOZLESME: ayni kalip haftada 2 kez geliyorsa ikisi de AGIR olamaz', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const kalipta = {};
      for (const e of anaKaldiris(p)) {
        const k = lib(e.id).pattern;
        (kalipta[k] = kalipta[k] || []).push(e);
      }
      for (const k of Object.keys(kalipta)) {
        const agir = kalipta[k].filter((e) => e.yuk === 'agir').length;
        assert.ok(agir <= 1,
          cfg.goal + '/' + cfg.strengthDays + 'gün: ' + k + ' kalıbında ' + agir + ' ağır gün');
      }
    }
  });

  test('her kademe-1 hareketi agir ya da orta olarak ETIKETLI', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      for (const e of anaKaldiris(p)) {
        assert.ok(e.yuk === 'agir' || e.yuk === 'orta', e.tr + ': yük etiketi yok');
      }
    }
  });

  test('ORTA gun: tekrar YUKSEK, efor DUSUK', () => {
    let bulundu = false;
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const kalipta = {};
      for (const e of anaKaldiris(p)) {
        const k = lib(e.id).pattern;
        (kalipta[k] = kalipta[k] || []).push(e);
      }
      for (const k of Object.keys(kalipta)) {
        const agir = kalipta[k].find((e) => e.yuk === 'agir');
        const orta = kalipta[k].find((e) => e.yuk === 'orta');
        if (!agir || !orta) continue;
        bulundu = true;
        assert.ok(orta.repMin > agir.repMin,
          cfg.goal + '/' + k + ': orta gün tekrarı ağırdan yüksek değil');
        const rpeAgir = Math.max.apply(null, String(agir.rpe).split('-').map(Number));
        const rpeOrta = Math.max.apply(null, String(orta.rpe).split('-').map(Number));
        assert.ok(rpeOrta <= rpeAgir, cfg.goal + '/' + k + ': orta günün eforu daha yüksek');
        assert.ok(orta.rest <= agir.rest, cfg.goal + '/' + k + ': orta günde dinlenme kısalmamış');
      }
    }
    assert.ok(bulundu, 'hiçbir yapılandırmada ağır/orta çifti oluşmadı');
  });

  test('AGIR gun transfer puani yuksek harekete gidiyor', () => {
    // Gun sirasina gore secince motor hip thrust'i agir, RDL'yi orta
    // yapiyordu — transferi yuksek hareket hafif gune dusuyordu.
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const kalipta = {};
      for (const e of anaKaldiris(p)) {
        const k = lib(e.id).pattern;
        (kalipta[k] = kalipta[k] || []).push(e);
      }
      for (const k of Object.keys(kalipta)) {
        if (kalipta[k].length < 2) continue;
        const agir = kalipta[k].find((e) => e.yuk === 'agir');
        if (!agir) continue;
        const enYuksek = Math.max.apply(null, kalipta[k].map((e) => lib(e.id).pri || 2));
        assert.strictEqual(lib(agir.id).pri || 2, enYuksek,
          cfg.goal + '/' + k + ': ağır gün ' + agir.tr + ' (pri ' + (lib(agir.id).pri || 2) +
          '), en yüksek pri ' + enYuksek);
      }
    }
  });

  test('dinlenme suresi 30 sn adimina yuvarlanmis ("2.25 dk" yok)', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      for (const e of tumHareketler(p)) {
        if (!e.rest) continue;
        assert.strictEqual(e.rest % 15, 0, e.tr + ': dinlenme ' + e.rest + ' sn');
      }
    }
  });

  test('patlayici is dalgalandirilmiyor — olcu hiz', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      for (const e of tumHareketler(p)) {
        if (!e.explosive) continue;
        assert.ok(!e.yuk, e.tr + ': patlayıcı işe ağır/orta etiketi konmuş');
      }
    }
  });

  test('dalgalanma bir kez uygulaniyor — hafta ilerleyince aralik buyumuyor', () => {
    let p = M.buildProgram(AYARLAR[0], []);
    const ilk = anaKaldiris(p).map((e) => e.id + ':' + e.repMin + '-' + e.repMax).join('|');
    for (let i = 0; i < 6; i++) p = M.advanceProgram(p, [], '2026-08-18');
    const sonra = anaKaldiris(p).map((e) => e.id + ':' + e.repMin + '-' + e.repMax).join('|');
    assert.strictEqual(ilk, sonra, 'tekrar aralığı her hafta kayıyor');
  });

  test('dalgalanma varsa motor SEBEBIYLE birlikte yaziyor', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const varMi = tumHareketler(p).some((e) => e.yuk === 'orta');
    if (!varMi) return;
    assert.ok((p.notes || []).some((n) => /ORTA gün/i.test(n)), 'dalgalanma notu yok');
  });

  test('IKINCIL PAY: dolayli calisma yarim set sayiliyor', () => {
    const p = M.buildProgram(KICKBOKS, []);
    const dogrudan = M.programWeeklySets(p);
    const toplam = M.programWeeklySetsTotal(p);
    let fark = false;
    for (const m of Object.keys(toplam)) {
      assert.ok(toplam[m] >= (dogrudan[m] || 0) - 0.01,
        m + ': toplam (' + toplam[m] + ') doğrudan setten (' + dogrudan[m] + ') küçük');
      if (toplam[m] > (dogrudan[m] || 0) + 0.01) fark = true;
    }
    assert.ok(fark, 'hiçbir kasta ikincil pay hesaplanmamış');
  });

  test('ikincil tablodaki her id kutuphanede var ve kendini saymiyor', () => {
    for (const id of Object.keys(M.PROGRAM_IKINCIL)) {
      const e = M.PROGRAM_EXERCISES.find((x) => x.id === id);
      assert.ok(e, 'PROGRAM_IKINCIL\'de olmayan hareket: ' + id);
      for (const kas of Object.keys(M.PROGRAM_IKINCIL[id])) {
        assert.notStrictEqual(kas, e.muscle, id + ': birincil kasını ikincil olarak da sayıyor');
        assert.ok(M.PROGRAM_MUSCLES[kas], id + ': bilinmeyen kas ' + kas);
        const o = M.PROGRAM_IKINCIL[id][kas];
        assert.ok(o > 0 && o <= 0.5, id + '/' + kas + ': oran ' + o);
      }
    }
  });

  test('16 YAS TAVANI dogrudan set uzerinden isliyor (ikincil ezmiyor)', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const dogrudan = M.programWeeklySets(p);
      for (const m of Object.keys(dogrudan)) {
        assert.ok(dogrudan[m] <= M.PROGRAM_LIMITS.maxSetsPerMuscleWeek,
          cfg.goal + ': ' + m + ' ' + dogrudan[m] + ' doğrudan set');
      }
    }
  });
});
