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
    ' PROGRAM_BW_TEST, PROGRAM_REP_FLOOR };';
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
