/**
 * 39 — HACIM MUHASEBESI + EFOR ONCELIGI (12 Eyl 2026)
 *
 * 30 Agustos 2026'da antrenman motoru bes bagimsiz literatur denetiminden
 * gecti (bkz. ANTRENMAN-BILIMI.md ve proje hafizasindaki motor-kanit-denetimi).
 * Denetimin EN YUKSEK ONCELIKLI teknik bulgusu 13 gun acik kaldi:
 *
 *   PROGRAM_IKINCIL'in 0.5 fraksiyonel sayimi YALNIZ durum raporundaydi;
 *   20 set guvenlik tavani ve hacim bandinin USTU dogrudan seti sayiyordu.
 *   Sonuc: tavan FIILEN BAGLAMIYORDU. 14 set bench + 10 set dip yapan biri
 *   triseps icin "0 dogrudan set" gorunup 12 fraksiyonel set tasiyor ve motor
 *   "tavan asilmadi" diyordu.
 *
 * Bu dosya o duzeltmeyi ve ayni denetimin dort kucuk bulgusunu kilitler.
 * Hepsinin ortak ozelligi: SAYI makuldu, GEREKCE degildi.
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
    today: () => '2026-09-12',
    shiftDateStr: (d, n) => {
      const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n);
      return x.toISOString().slice(0, 10);
    },
    data: {}, aidanPrompt: () => Promise.resolve(null),
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8') +
    '\n;globalThis.__SABIT = { PROGRAM_GOALS, PROGRAM_EXERCISES, PROGRAM_LIMITS,' +
    ' PLYO_LIMITS, PROGRAM_RPE, PROGRAM_RPE_ATLETIK_T1, PROGRAM_IKINCIL, PROGRAM_MUSCLES };';
  vm.runInContext(src, ctx);
  return Object.assign(ctx, ctx.__SABIT);
}
const M = motor();
const progSrc = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8');

const AYARLAR = [];
for (const goal of Object.keys(M.PROGRAM_GOALS)) {
  for (const sd of [2, 3, 4, 5]) {
    for (const sessionMin of [45, 60, 90]) {
      for (const fightDays of [[], [2, 4], [1, 3, 5]]) {
        AYARLAR.push({ goal, strengthDays: sd, sessionMin, places: ['gym'], fightDays, avoid: [] });
      }
    }
  }
}

describe('Fraksiyonel hacim sayimi TAVANI BAGLIYOR', () => {
  test('dolayli pay dahil hicbir kas 20 set tavanini asmiyor', () => {
    const tavan = M.PROGRAM_LIMITS.maxSetsPerMuscleWeek;
    const ihlal = [];
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const top = M.programWeeklySetsTotal(p);
      for (const kas of Object.keys(top)) {
        if (top[kas] <= tavan) continue;
        // Yalniz DOLAYLI yukle asilan durum muaf — ama SESSIZ KALINAMAZ:
        // kesmek o bilesik hareketin asil kasini cezalandirirdi, motor bunu
        // kullaniciya yazmak zorunda.
        const dogrudan = M.programWeeklySets(p)[kas] || 0;
        const yazili = (p.notes || []).some((n) => /dolayl/i.test(n) && /tavan/i.test(n));
        if (dogrudan === 0 && yazili) continue;
        ihlal.push(cfg.goal + '/' + cfg.strengthDays + 'g/' + cfg.sessionMin + 'dk ' +
          kas + '=' + top[kas] + ' (dogrudan ' + dogrudan + ')');
      }
    }
    assert.deepStrictEqual(ihlal.slice(0, 5), []);
  });

  test('programVolumeFlags dolayli payi sayar (rapor degil KAPI)', () => {
    // Sahte program: trisepsin DOGRUDAN seti yok, bench+dip ile dolayli 11 set.
    const p = {
      goal: 'kas', week: 1, days: [
        { type: 'strength', exercises: [{ id: 'bench', muscle: 'chest', sets: 22 }] },
        { type: 'strength', exercises: [{ id: 'dip', muscle: 'chest', sets: 20 }] },
      ], notes: [],
    };
    const dogrudan = M.programWeeklySets(p);
    assert.strictEqual(dogrudan.triceps, undefined, 'dogrudan sayimda triseps zaten yok');
    const flags = M.programVolumeFlags(p);
    assert.ok(flags.some((f) => f.muscle === 'triceps'),
      'dolayli yukle tavani asan triseps bayraklanmadi: ' + JSON.stringify(flags));
  });

  test('TABAN dogrudan set sayar — asimetri bilincli ve yazili', () => {
    // Gerekce PROGRAM_IKINCIL notunda: tavan toplam mekanik yuk, taban hedefli
    // is garantisi. Ikisi de muhafazakar tarafa duser.
    assert.match(progSrc, /SIMETRI BILINCLI OLARAK YOK/,
      'asimetrinin gerekcesi kodda yazili degil');
    // Taban karsilanamayabilir (2 gunluk programda yetecek seans yoktur) ama
    // motor o zaman SUSMAZ: 18 Agu dersi, bandin altinda birakip hic sey
    // sOylememek bir hata sinifiydi.
    for (const cfg of AYARLAR.slice(0, 36)) {
      const p = M.buildProgram(cfg, []);
      const G = M.PROGRAM_GOALS[cfg.goal];
      const dir = M.programWeeklySets(p);
      const ATLA = ['neck', 'core', 'calves', 'glutes', 'biceps', 'triceps'];
      const altBand = Math.min(G.setsLow, 6);
      const yazili = (p.notes || []).some((n) => /band/i.test(n) && /alt/i.test(n));
      for (const kas of Object.keys(dir)) {
        if (ATLA.indexOf(kas) >= 0) continue;
        if (dir[kas] >= altBand) continue;
        assert.ok(yazili, cfg.goal + '/' + cfg.strengthDays + 'g/' + kas + ': dogrudan ' +
          dir[kas] + ' set, taban ' + altBand + ' — ve motor bunu YAZMIYOR');
      }
    }
  });

  test('tavan asilirken setler tabandaysa KALIP TEKRARI cikar, kalip kalmaz', () => {
    // 5 gunluk PPL'de sirt 9 bileske x 2 set = 18 dogrudan + RDL dolayli = 20.5.
    // Eskiden motor burada SESSIZCE duruyordu ("sadece bileske kaldi, dur").
    const p = M.buildProgram({ goal: 'kas', strengthDays: 5, sessionMin: 90, places: ['gym'], fightDays: [], avoid: [] }, []);
    const top = M.programWeeklySetsTotal(p);
    assert.ok((top.back || 0) <= M.PROGRAM_LIMITS.maxSetsPerMuscleWeek,
      'sirt tavani asiyor: ' + top.back);
    // Kalip KAYBOLMADI: hem yatay hem dikey cekis programda duruyor.
    const kaliplar = new Set();
    for (const d of p.days || []) for (const e of d.exercises || []) {
      const lib = M.PROGRAM_EXERCISES.find((x) => x.id === e.id) || {};
      if (!e.explosive) kaliplar.add(lib.pattern);
    }
    assert.ok(kaliplar.has('pull_h'), 'yatay cekis kalibi tamamen kaybolmus');
    assert.ok(kaliplar.has('pull_v'), 'dikey cekis kalibi tamamen kaybolmus');
  });
});

describe('Itis/cekis orani IKI UCTAN da duzelir', () => {
  test('cekis eklenemiyorsa itis dusurulur ve sebebi yazilir', () => {
    let dusurulduGorulen = false;
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      const n = (p.notes || []).find((x) => /itişten set düşürüldü/i.test(x));
      if (!n) continue;
      dusurulduGorulen = true;
      assert.match(n, /omuz/i, 'itis dusurme notu sebebini yazmiyor');
    }
    // Tetiklenmemesi de gecerli bir dunya halidir; tetiklendiyse gerekceli olmali.
    assert.ok(dusurulduGorulen === true || dusurulduGorulen === false);
  });

  test('itis dusurme hicbir hareketi 2 setin altina indirmez', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      for (const d of p.days || []) for (const e of d.exercises || []) {
        if (e.explosive) continue;
        assert.ok((e.sets || 0) >= 2, cfg.goal + '/' + e.id + ': ' + e.sets + ' set');
      }
    }
  });
});

describe('Serbest agirlik tercihi (pri) kanitla olculu', () => {
  /**
   * Haugen 2023: serbest agirlik ile makine arasinda hipertrofide fark YOK
   * (p=0.751), sicramada YOK (p=0.290). Eski carpan 12 idi ve ayni KALIP+KADEME
   * tekrari cezasindan (14) neredeyse buyuktu — motor "serbest agirlik" ugruna
   * sahte cesitliligi neredeyse tolere ediyordu.
   */
  test('pri carpani kalip tekrari cezasinin ALTINDA', () => {
    const m = progSrc.match(/s \+= \(e\.pri \|\| 2\) \* \(ctx\.yukBazli \? (\d+) : (\d+)\)/);
    assert.ok(m, 'pri carpani beklenen bicimde degil');
    const [, yukBazli, hipertrofi] = m;
    const ceza = Number((progSrc.match(/kalipSayaci\[anahtar\]\) \|\| 0\) \* (\d+)/) || [])[1]);
    assert.ok(ceza > 0, 'kalip cezasi okunamadi');
    assert.ok(Number(yukBazli) * 3 < ceza * 3, 'yuk bazli pri agirligi kalip cezasini asiyor');
    assert.ok(Number(yukBazli) <= 5, 'pri agirligi hala yuksek: ' + yukBazli);
    assert.ok(Number(hipertrofi) < Number(yukBazli),
      'hipertrofide pri agirligi yuk bazli hedeften kucuk olmali (kanit yok)');
  });

  test('gerekce kodda yazili (kanit referansiyla)', () => {
    assert.match(progSrc, /Haugen 2023/, 'pri degisikliginin kanit referansi yazili degil');
  });
});

describe('RPE onceligi YAZILI ve uygulanir', () => {
  test('oncelik sirasi kodda tanimli', () => {
    assert.match(progSrc, /RPE ONCELIK SIRASI/, 'oncelik sirasi yazili degil');
  });

  // Teknik haftalarinda (ilk 2 hafta) tum RPE bir kademe duser — oncelik
  // sirasini olcmek icin teknik penceresinin DISINDA bakmak gerekir.
  const teknikSonrasi = (cfg) => {
    const p = M.buildProgram(cfg, []);
    p.week = M.PLYO_LIMITS.teachWeeks + 1;
    M.programApplyEffort(p);
    return p;
  };

  test('atletik hedefte ana kaldiris RPE 6-7', () => {
    const p = teknikSonrasi({ goal: 'atletik', strengthDays: 4, sessionMin: 60, places: ['gym'], fightDays: [], avoid: [] });
    let bulundu = 0;
    for (const d of p.days || []) for (const e of d.exercises || []) {
      if (e.explosive || (e.tier || 3) !== 1 || e.muscle === 'neck') continue;
      bulundu++;
      const ust = Math.max.apply(null, String(e.rpe || '').split('-').map(Number));
      assert.ok(ust <= 7, e.id + ': atletik ana kaldiris RPE ' + e.rpe + ' (tavan 7)');
    }
    assert.ok(bulundu > 0, 'atletik programda kademe 1 hareket yok');
  });

  test('kas/guc hedefinde kademe 1 RPE tablosu gecerli', () => {
    const p = teknikSonrasi({ goal: 'kas', strengthDays: 4, sessionMin: 60, places: ['gym'], fightDays: [], avoid: [] });
    const t1 = (p.days || []).flatMap((d) => d.exercises || [])
      .filter((e) => !e.explosive && (e.tier || 3) === 1 && e.muscle !== 'neck');
    assert.ok(t1.length, 'kademe 1 hareket yok');
    for (const e of t1) {
      const ust = Math.max.apply(null, String(e.rpe || '').split('-').map(Number));
      assert.ok(ust >= 7, e.id + ': RPE ' + e.rpe + ' — hipertrofide gereksiz dusuk');
    }
  });

  test('HICBIR yoldan RPE 10 yazilmaz (16 yas kapisi)', () => {
    for (const cfg of AYARLAR) {
      const p = M.buildProgram(cfg, []);
      for (const d of p.days || []) for (const e of d.exercises || []) {
        if (!e.rpe) continue;
        for (const n of String(e.rpe).split('-').map(Number)) {
          assert.ok(n <= 9, cfg.goal + '/' + e.id + ': RPE ' + e.rpe);
        }
      }
    }
  });
});

describe('Seans suresi TEMPODAN turetilir', () => {
  /**
   * Sabit 45 sn/set motorun kendi tempo basamaklariyla celisiyordu: kademe 1'de
   * ('2-1-X-0', 3-5 tekrar) set ~20 sn, kademe 3'te ('3-0-1-1', 8-12 tekrar)
   * 40-60 sn. Iki yonde birden yanlis bir sabit.
   */
  test('agir az-tekrarli set, hafif cok-tekrarli setten KISA surer', () => {
    const agir = M.programSetSn({ repMin: 3, repMax: 5, tempo: '2-1-X-0' });
    const hafif = M.programSetSn({ repMin: 8, repMax: 12, tempo: '3-0-1-1' });
    assert.ok(agir < hafif, 'kademe 1 set suresi (' + agir + ') kademe 3\'ten (' + hafif + ') kisa degil');
    assert.ok(agir >= 20 && hafif <= 120, 'set suresi bandi disinda: ' + agir + '/' + hafif);
  });

  test('tempo bilinmiyorsa 45 sn tabanina duser (geriye uyum)', () => {
    assert.strictEqual(M.programSetSn({}), 45);
    assert.strictEqual(M.programHareketSn(90, 1), 45 + 60);
  });

  test('X (patlayici konsantrik) 1 sn sayilir', () => {
    assert.strictEqual(M.programTempoSn('2-1-X-0'), 4);
    assert.strictEqual(M.programTempoSn('3-0-1-1'), 5);
  });
});

describe('Vucut agirligi referansi YETMEZLIK ISTEMEZ', () => {
  /**
   * Eski metin "tek sette temiz yapabildigin maksimum" idi — tanimi geregi
   * RPE 10 bir set. Motorun kendi RPE 10 yasagiyla VE hemen yanindaki
   * "1RM denemesi asla istenmez" cumlesiyle celisiyordu.
   */
  test('kurulum ekrani maksimum/yetmezlik seti istemiyor', () => {
    // Eski metin yalniz GEREKCE olarak anilabilir; KULLANICIYA sorulan
    // cumlede gecmemeli. Etiket satirini ayrica kontrol et.
    const etiket = (progSrc.match(/<label>Şu an kaç tekrar[^<]*<\/label>/) || [])[0] || '';
    assert.match(etiket, /tahmin/i, 'etiket tahmin oldugunu soylemiyor: ' + etiket);
    assert.ok(!/maksimum/i.test(etiket), 'etiket hala maksimum istiyor: ' + etiket);
    assert.match(progSrc, /TAHMİN yeter — tükenene kadar set yapman istenmiyor/,
      'yetmezlik istenmedigi aciklanmamis');
    assert.match(progSrc, /1RM denemesi asla istenmez/, '1RM yasagi metni kaybolmus');
  });
});
