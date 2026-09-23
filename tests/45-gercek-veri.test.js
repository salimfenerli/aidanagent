/**
 * 45 — GERCEK VERIYLE KURULAN PROGRAMDAN CIKAN HATALAR (22 Eyl 2026)
 *
 * Salim'in Supabase'deki gercek verisi (Hevy gecmisi + profil) ile antrenman ve
 * diyet programi kullanici gibi kuruldu. Sentetik test verisi bu hatalarin
 * hicbirini uretmiyordu, cunku sentetik veri motorun BEKLEDIGI bicimdeydi:
 *
 *   · Hevy adlari KULLANICININ DILINDE ("Squat (Bar)", "Oturarak Leg Curl (Makine)")
 *     -> 21 hareketin 21'inde "gecmis veri yok"
 *   · Ad eslesmesi aleti yok sayiyordu -> Smith e1RM'i dambila yazildi (25 kg vs ~15)
 *   · "bench press" icin "incline bench press" gecmisi sayiliyordu
 *   · Haziran'daki tek hatali kayit (curl 25 kg) Eylul'e 20 kg curl yazdiriyordu
 *   · Kutuphanede makine karsiligi yoktu -> makineyle calisan kullanicinin gecmisi bos
 *   · Cantaya gunde 3 kutu ton baligi / 2 olcek protein tozu / 2 kase yogurt
 *   · Hesaplayicida "kilo al", motorda "Kiloyu koru" — sessizce ~350 kcal eksik
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { loadApp, fixture } = require('./helpers/load');

// Gercek verinin ozeti (ad/tid/top alanlari BIREBIR, tarih ve miktar gercek).
const W = (date, ex) => ({ id: date, date, title: 'x', setCount: 10, volumeKg: 1, durationMin: 60,
  exercises: ex.map(([name, tid, kg, reps, e1rm]) => ({ name, tid, sets: 2, volumeKg: 1, top: { kg, reps, e1rm } })) });
const HEVY = [
  W('2026-09-18', [['Incline Bench Press (Dambıl)', '07B38369', 15, 10, 20], ['Triceps Pushdown', '93A552C6', 40, 10, 53.3],
    ['Iso-Lateral Row (Makine)', 'AA1EB7D8', 50, 6, 60], ['Incline Chest Press (Makine)', 'FBF92739', 60, 4, 68]]),
  W('2026-09-16', [['Squat (Bar)', 'D04AC939', 60, 3, 66], ['Leg Press (Makine)', 'C7973E0E', 80, 9, 104],
    ['Oturarak Leg Curl (Makine)', '11A123F3', 75, 7, 92.5], ['Calf Press (Makine)', '91237BDD', 40, 15, 60]]),
  W('2026-09-07', [['Bicep Curl (Dambıl)', '37FCC2BB', 10, 8, 12.7], ['Lat Pulldown (Cable)', '6A6C31A5', 30.5, 6, 36.6],
    ['Shoulder Press (Plakalı Makine)', '059E835D', 25, 5, 29.2]]),
  W('2026-06-20', [['Bicep Curl (Dambıl)', '37FCC2BB', 25, 7, 30.8]]),                    // eski, supheli kayit
  W('2026-05-07', [['Incline Bench Press (Smith Machine)', '3A6FA3D1', 30, 4, 34]]),       // baska alet
];

const A = loadApp({ seed: fixture(), scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js'] });
after(() => { try { A.close(); } catch (_) {} });
const J = (k) => JSON.parse(A.evalIn('JSON.stringify(' + k + ')'));
A.evalIn('window.__H = ' + JSON.stringify(HEVY));
const kg = (id, tekrar) => J('programStartWeight(PROGRAM_EXERCISES.find(e => e.id === "' + id + '"), ' + (tekrar || 8) + ', window.__H)');

describe('Hevy gecmisi eslestirme', () => {
  test('Turkce Hevy adi tid ile eslesir (Squat (Bar), Oturarak Leg Curl (Makine))', () => {
    assert.ok(kg('squat', 5) > 0, 'squat eslesmedi');
    assert.ok(kg('legcurl', 10) > 0, 'leg curl eslesmedi');
    assert.ok(kg('legpress', 10) > 0, 'leg press eslesmedi');
  });

  test('ALET farkliysa eslesme YOK: Smith gecmisi dambila yazilmaz', () => {
    const w = kg('incline', 8);
    assert.ok(w != null && w <= 17.5, 'egimli dambil ' + w + ' kg (Smith e1RM 34 sizmis olabilir)');
  });

  test('"bench press" icin "incline bench press" gecmisi SAYILMAZ', () => {
    assert.strictEqual(kg('dbbench', 6), null);
  });

  test('YAKIN GECMIS: Haziran\'daki 25 kg curl Eylul programina yazilmaz', () => {
    const w = kg('curl', 10);
    assert.ok(w != null && w <= 10, 'curl ' + w + ' kg — son kayit 10 kg x 8');
  });

  test('makine karsiliklari kutuphanede ve gecmisle eslesiyor', () => {
    for (const id of ['mchest', 'isorow', 'mshoulder', 'calfpress']) {
      assert.ok(kg(id) > 0, id + ' eslesmedi');
    }
  });

  test('gercek veriyle kurulan programda gecmisi olan hareket SECILIR ve agirligi yazilir', () => {
    const p = J('buildProgram({ goal: "atletik", strengthDays: 4, sessionMin: 75, places: ["gym"], fightDays: [3, 6], avoid: [], duzen: null }, window.__H)');
    const hepsi = p.days.flatMap(d => d.exercises || []).filter(e => !e.explosive);
    const agirlikli = hepsi.filter(e => e.kg != null).length;
    assert.ok(agirlikli >= 6, 'yalniz ' + agirlikli + ' harekette agirlik var (eskiden 1-2)');
  });
});

describe('Canta: gercekci ve cesitli', () => {
  test('ayni gun cantada ayni protein capasi iki kez gelmez', () => {
    const c = J('nutCanta([{slot:"ara",kcal:500,protein:25},{slot:"atistirma",kcal:500,protein:25}], ' +
      '[{tasinabilir:true,saat:"10:30"},{tasinabilir:true,saat:"18:45"}], true)');
    const capalar = c.filter(x => x.slot !== 'telafi').map(x => x.oneri.items[0].n);
    assert.notStrictEqual(capalar[0], capalar[1], 'iki ogun de ' + capalar[0]);
    const tonSayisi = c.flatMap(x => x.oneri.items).filter(i => i.n === 'Ton balığı').length;
    assert.ok(tonSayisi <= 1, 'gunde ' + tonSayisi + ' kutu ton baligi');
  });

  test('protein tozu ve sut urunu cantada ilk tercih degil (shaker / soguk zincir)', () => {
    const c = J('nutCantaOner({kcal:500, protein:25})');
    assert.ok(!/Protein tozu|yoğurt|Cottage/.test(c.items[0].n), c.items[0].n);
  });
});

describe('Iki hedef kaynagi', () => {
  test('hesaplayici "kilo al", motor "koru" ise ekranda CELISKI yazar', () => {
    A.evalIn('data.diet.calc = { sex:"male", age:16, height:184, weight:68.8, activity:"1.725", goal:"gain" }');
    const h = J('nutHedefCelisme({ hedef: "koru" })');
    assert.ok(/kilo al/.test(h) && /Kas kazan/.test(h), h);
    assert.strictEqual(J('nutHedefCelisme({ hedef: "kas" })'), '');
  });
});

describe('Haftalik cesitlilik ve ogun yeri (23 Eyl 2026)', () => {
  // Kullanici gibi 7 gun kurunca cikti: yedi gun de AYNI tabak (kahvalti
  // yumurta+tahin, ogle izgara kofte+pilav, aksam kiyma+pilav). Sablon
  // havuzunda slot basina 5+ sablon vardi ve hic kullanilmiyordu.
  const gunler = (sablon) => [1, 2, 3, 4, 5].map(dow => {
    const t = J('nutTargets({sex:"male",age:16,height:184,weight:68.8}, "strength", "kas")');
    return J('nutBuildDay(' + JSON.stringify(t) + ', 68.8, nutGunSablon({sablon:' + sablon + '}, ' + dow + '))')
      .map(m => m.items.filter(x => x.adet > 0).map(x => x.n).join('+')).join(' | ');
  });

  test('hafta ici bes gun AYNI menu degil', () => {
    const g = gunler(0);
    assert.ok(new Set(g).size >= 4, 'bes gunun ' + new Set(g).size + ' farkli menusu var');
  });

  test('"Baska oner" butun haftayi kaydirir (kullanicinin kontrolu durur)', () => {
    assert.notStrictEqual(gunler(0)[0], gunler(1)[0]);
  });

  test('okul cikisindan sonraki AKSAM yemegi "cantadan" sayilmaz', () => {
    // Persembe okul 19:00'da bitiyor, aksam 19:45: o saatte evdesin.
    const okul = { bas: 9 * 60, bit: 19 * 60 };
    const aksam = J('nutSlotYer("aksam", ' + (19 * 60 + 45) + ', ' + JSON.stringify(okul) + ', ensureNutDuzen())');
    assert.strictEqual(aksam.tasinabilir, false, 'aksam yemegi cantaya yazilmis');
    // Ara ogun ayni pencerede HALA cantadan (antrenman oncesi karbonhidrat).
    const ara = J('nutSlotYer("atistirma", ' + (19 * 60 + 20) + ', ' + JSON.stringify(okul) + ', ensureNutDuzen())');
    assert.strictEqual(ara.tasinabilir, true);
  });
});

describe('Okul duzeni: hafta sonu ve iki motorun ayni saati (24 Eyl 2026)', () => {
  // Salim'in gercek duzeni: Sal/Per 19:00, diger hafta ici 17:00, Cmt 14:00'te
  // okul bitiyor; yemekhane YALNIZ hafta ici.
  const okul = { bas: 9 * 60, bit: 14 * 60 };

  test('cumartesi okulunda "yemekhane" YOK — ogun cantaya kurulur', () => {
    A.evalIn('ensureNutDuzen().yemekhane = true');
    const cmt = J('nutSlotYer("ogle", ' + 13 * 60 + ', ' + JSON.stringify(okul) + ', ensureNutDuzen(), 6)');
    assert.strictEqual(cmt.disarida, false, 'cumartesi yemekhane sayilmis');
    assert.strictEqual(cmt.tasinabilir, true, 'cumartesi ogle cantaya kurulmuyor');
    const sal = J('nutSlotYer("ogle", ' + 13 * 60 + ', ' + JSON.stringify(okul) + ', ensureNutDuzen(), 2)');
    assert.strictEqual(sal.disarida, true, 'hafta ici yemekhane kaybolmus');
  });

  test('DIYET ve ANTRENMAN motoru ayni seans saatini veriyor', () => {
    // Okul 17:00'da bitip antrenman 17:00 yazildiginda diyet 17:00, motor 17:30
    // diyordu: ogun saatleri yarim saat kayiyordu.
    const duzen = { okul: { '1': { bas: '09:00', bit: '17:00' } }, antrenman: '17:00',
      yemekhane: false, yemekhaneSaat: '13:00', kalk: '07:00' };
    A.evalIn('data.diet.nut.duzen = ' + JSON.stringify(duzen));
    const diyet = J('nutSeansSaati(1, "strength", ensureNutDuzen())');
    const motor = J('programGunPencere(1, ' + JSON.stringify({ okul: duzen.okul, antrenman: duzen.antrenman }) + ', 75)');
    assert.strictEqual(diyet, 17 * 60 + 30, 'diyet seans saati okul cikisi + 30 degil');
    assert.strictEqual(motor.bas, '17:30');
  });
});

describe('Ek ders / kurs (24 Eyl 2026)', () => {
  // Salim: "pazartesi cikis matematik dersim var, persembe de okuldan sonra
  // matematik". Ders okul gibi: o saatte disaridasin, seans ondan SONRA baslar.
  const duzen = {
    okul: { '1': { bas: '09:00', bit: '17:00' }, '4': { bas: '09:00', bit: '19:00' } },
    ders: { '1': { bas: '17:30', bit: '19:00' }, '4': { bas: '19:30', bit: '21:00' } },
    yemekhane: true, yemekhaneSaat: '13:00', antrenman: '17:00', kalk: '07:00',
  };
  const kur = () => A.evalIn('data.diet.nut.duzen = ' + JSON.stringify(duzen));

  test('ders penceresi okul penceresine katiliyor', () => {
    kur();
    const pzt = J('nutOkulGun(1, ensureNutDuzen())');
    assert.strictEqual(pzt.bit, 19 * 60, 'pazartesi ders bitisi (19:00) pencereye girmemis');
    assert.strictEqual(J('nutOkulSaf(1, ensureNutDuzen())').bit, 17 * 60, 'saf okul bozulmus');
  });

  test('seans ders bitisinden SONRA baslar (iki motor ayni saat)', () => {
    kur();
    assert.strictEqual(J('nutSeansSaati(1, "strength", ensureNutDuzen())'), 19 * 60 + 30);
    const w = J('programGunPencere(1, programDuzenOku(), 75)');
    assert.strictEqual(w.bas, '19:30');
  });

  test('ders gunu motor icin SIKISIK — bos gun varsa oraya guc gunu konur', () => {
    kur();
    const p = J('buildProgram({goal:"atletik",strengthDays:3,sessionMin:75,places:["gym"],fightDays:[3,6],avoid:[],duzen:programDuzenOku()}, [])');
    const guc = p.days.filter(d => d.type === 'strength').map(d => d.dow);
    assert.ok(guc.indexOf(4) < 0, 'persembe (ders 21:00\'e kadar) guc gunu secilmis: ' + guc);
  });

  test('kursta yemekhane YOK (saf okul penceresi disi ogun)', () => {
    kur();
    const t = J('nutMealTimes(1, "strength", [{slot:"kahvalti"},{slot:"ara"},{slot:"ogle"},{slot:"atistirma"},{slot:"aksam"}], ensureNutDuzen())');
    const ogle = t.find(x => x.slot === 'ogle');
    assert.strictEqual(ogle.disarida, true, 'hafta ici 13:00 yemekhane olmali');
  });
});
