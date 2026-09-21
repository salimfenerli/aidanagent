/**
 * 41 — OKUL SAATI KATMANI (19 Eyl 2026)
 *
 * Antrenman motoru 9 Agustos'tan bu yana okul saatini HIC bilmiyordu:
 * kurulumda "haftada kac gun" ve "seans kac dakika" soruluyor, gunleri motor
 * kendi seciyordu. Okulu 19:00'da biten birine 75 dakikalik agir bacak gunu
 * yazmak kagit uzerinde dogru, hayatta uygulanamaz bir plandir.
 *
 * Bu dosya uc seyi kilitler:
 *   1) Saat TEK kaynaktan okunur (data.diet.nut.duzen — diyetin gunluk duzeni)
 *   2) Sikisik gune guc gunu konmaz; konmak zorundaysa seans KISALIR
 *   3) Kisalma ya da kayma SESSIZ olmaz — sebebi notlarda yazar
 *
 * ⚠️ 2 ve 3 birlikte test edilir. Kisaltip susmak, kisaltmamaktan kotudur:
 * kullanici "neden bu gun 3 hareket?" sorusunu programa bakarak soramaz.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function motor(veri) {
  const ctx = {
    console, Date, Math, JSON, Number, String, Array, Object, Promise, RegExp,
    document: { getElementById: () => null },
    escapeHtml: (s) => String(s), save() {}, showToast() {},
    today: () => '2026-09-19',
    shiftDateStr: (d, n) => {
      const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n);
      return x.toISOString().slice(0, 10);
    },
    GUN_KISA: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
    data: veri || {}, aidanPrompt: () => Promise.resolve(null),
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8') +
    '\n;globalThis.__SABIT = { PROGRAM_GOALS, PROGRAM_LIMITS, PROGRAM_DUZEN, PROGRAM_GUNLER };';
  vm.runInContext(src, ctx);
  return Object.assign(ctx, ctx.__SABIT);
}

/** data iskeleti — okul saatleri DIYETIN alaninda durur. */
function veriyle(okul, antrenman) {
  return { diet: { nut: { hedef: 'koru', sablon: 0, duzen: {
    okul: okul || {}, yemekhane: false, yemekhaneSaat: '13:00',
    antrenman: antrenman || '17:00', kalk: '07:00',
  } } } };
}
const OKUL_GEC = { '1': { bas: '09:00', bit: '19:00' }, '2': { bas: '09:00', bit: '19:00' },
  '3': { bas: '09:00', bit: '19:00' }, '4': { bas: '09:00', bit: '19:00' },
  '5': { bas: '09:00', bit: '19:00' } };
const OKUL_NORMAL = { '1': { bas: '09:00', bit: '16:00' }, '2': { bas: '09:00', bit: '16:00' },
  '3': { bas: '09:00', bit: '16:00' }, '4': { bas: '09:00', bit: '16:00' },
  '5': { bas: '09:00', bit: '16:00' } };

const CFG = { goal: 'atletik', strengthDays: 3, sessionMin: 75, places: ['gym'], fightDays: [], avoid: [] };

describe('Tek kaynak: okul saati diyetten okunur', () => {
  test('duzen yoksa null doner — okul saati girmek ZORUNLU degil', () => {
    const M = motor({});
    assert.strictEqual(M.programDuzenOku(), null);
  });

  test('gecersiz gun (bitis <= baslangic) sessizce YOK SAYILIR, digerleri kalir', () => {
    const M = motor(veriyle({ '1': { bas: '09:00', bit: '08:00' }, '2': { bas: '09:00', bit: '16:00' } }));
    const d = M.programDuzenOku();
    assert.strictEqual(d.okul['1'], undefined);
    assert.strictEqual(JSON.stringify(d.okul['2']), JSON.stringify({ bas: '09:00', bit: '16:00' }));
  });

  test('yalniz antrenman saati girilmisse de duzen vardir', () => {
    const M = motor(veriyle({}, '19:00'));
    const d = M.programDuzenOku();
    assert.strictEqual(d.antrenman, '19:00');
  });

  test('programDuzenKaydet data.diet.nut’u nutrition.js varsayilanlariyla kurar', () => {
    // ⚠️ Eksik kurulursa ensureNutrition "zaten var" deyip hedef/sablon
    // alanlarini HIC yazmaz; diyet sekmesi bozuk acilirdi.
    const M = motor({});
    M.programDuzenKaydet({ okul: { '2': { bas: '09:00', bit: '19:00' } }, antrenman: '17:30' });
    const nut = M.data.diet.nut;
    assert.strictEqual(nut.hedef, 'koru');
    assert.strictEqual(nut.sablon, 0);
    assert.strictEqual(JSON.stringify(nut.duzen.okul['2']), JSON.stringify({ bas: '09:00', bit: '19:00' }));
    assert.strictEqual(nut.duzen.antrenman, '17:30');
    assert.strictEqual(nut.duzen.kalk, '07:00');   // diyet alanlari da tam
  });
});

describe('Pencere hesabi', () => {
  const M = motor({});
  test('okul cikisina 30 dk hazirlik eklenir (nutrition.js ile AYNI sayi)', () => {
    const w = M.programGunPencere(2, { okul: { '2': { bas: '09:00', bit: '19:00' } }, antrenman: '17:00' }, 75);
    assert.strictEqual(w.bas, '19:30');
    assert.strictEqual(w.kaydi, true);
    assert.strictEqual(w.dk, 75);          // 21:30'a 120 dk var, kisilma yok
    assert.strictEqual(w.kisildi, false);
  });

  test('gec bitiste sure KISILIR, seans 21:30’u gecmez', () => {
    const w = M.programGunPencere(2, { okul: { '2': { bas: '09:00', bit: '20:00' } }, antrenman: '17:00' }, 75);
    assert.strictEqual(w.bas, '20:30');
    assert.strictEqual(w.dk, 60);
    assert.strictEqual(w.kisildi, true);
    assert.ok(w.basDk + w.dk <= M.PROGRAM_DUZEN.gecBitis);
  });

  test('30 dk bile kalmiyorsa gun "sigmaz" isaretlenir', () => {
    const w = M.programGunPencere(2, { okul: { '2': { bas: '09:00', bit: '21:10' } }, antrenman: '17:00' }, 60);
    assert.strictEqual(w.sigmaz, true);
  });

  test('okul yoksa antrenman saati aynen kalir', () => {
    const w = M.programGunPencere(6, { okul: {}, antrenman: '11:00' }, 60);
    assert.strictEqual(w.bas, '11:00');
    assert.strictEqual(w.kaydi, false);
    assert.strictEqual(w.kisildi, false);
  });
});

describe('Ceza siralamasi: toparlanma > uygunluk', () => {
  const M = motor({});
  test('okul cezasi dovus komsulugu cezasinin (70) ALTINDA kalir', () => {
    // Sikisik aksam kotu bir seans; agir bacagi kickboks gunune yapistirmak
    // sakatlik riski. Ikisi ayni terazide tartilamaz.
    const duzen = { okul: { '2': { bas: '09:00', bit: '20:00' } }, antrenman: '17:00' };
    const alt = M.programDuzenCezasi(2, duzen, 75, true);
    const ust = M.programDuzenCezasi(2, duzen, 75, false);
    assert.ok(alt < 70 && ust < 70, 'okul cezasi 70’i gecmemeli: ' + alt + '/' + ust);
    assert.ok(alt > ust, 'agir bacak gunu daha cok cezalanmali');
  });

  test('sigmayan gun agir cezalanir (150)', () => {
    const duzen = { okul: { '2': { bas: '09:00', bit: '21:10' } }, antrenman: '17:00' };
    assert.strictEqual(M.programDuzenCezasi(2, duzen, 60, false), 150);
  });

  test('saat KAYIYOR ama sigiyorsa kucuk ceza — yalniz beraberlik bozucu (21 Eyl)', () => {
    // 19:00 cikis -> 19:30 seans, 75 dk sigar. Eskiden ceza 0'di ve motor bos
    // Cuma dururken Sali/Persembe aksamina guc gunu koyuyordu.
    const duzen = { okul: { '2': { bas: '09:00', bit: '19:00' } }, antrenman: '17:00' };
    const ust = M.programDuzenCezasi(2, duzen, 75, false);
    const alt = M.programDuzenCezasi(2, duzen, 75, true);
    assert.ok(ust > 0 && ust < 20, 'kayma cezasi 0 ya da iki-ust-gun kuralini (20) ezecek kadar buyuk: ' + ust);
    assert.ok(alt > ust && alt < 30, 'agir bacak icin biraz daha fazla, kisilmadan (30) az olmali: ' + alt);
  });

  test('bos erken gun varken gec gune guc gunu KONMAZ', () => {
    // Salim'in gercek haftasi: okul 9-16, Sal/Per 19:00'a kadar; kickboks Car+Cmt.
    const okul = { '1': { bas: '09:00', bit: '16:00' }, '2': { bas: '09:00', bit: '19:00' },
      '3': { bas: '09:00', bit: '16:00' }, '4': { bas: '09:00', bit: '19:00' }, '5': { bas: '09:00', bit: '16:00' } };
    const p = motor(veriyle(okul)).buildProgram(Object.assign({}, CFG,
      { strengthDays: 4, sessionMin: 75, fightDays: [3, 6] }), []);
    const guc = p.days.filter(d => d.type === 'strength').map(d => d.dow);
    // 5 aday (Pzt Sal Per Cum Paz) icinden 4'u: gec gunlerden (Sal, Per) EN FAZLA biri.
    const gec = guc.filter(d => d === 2 || d === 4);
    assert.ok(gec.length <= 1, 'iki gec aksam birden secilmis: ' + guc);
    assert.ok(guc.indexOf(5) >= 0, 'bos Cuma kullanilmamis: ' + guc);
  });

  test('duzen yoksa ceza 0 — eski davranis aynen korunur', () => {
    assert.strictEqual(M.programDuzenCezasi(2, null, 60, true), 0);
  });
});

describe('Gun secimi okul saatine gore kayar', () => {
  test('hafta ici gec bitiyorsa guc gunleri HAFTA SONUNA kayar', () => {
    const M = motor(veriyle({
      '1': { bas: '09:00', bit: '20:30' }, '2': { bas: '09:00', bit: '20:30' },
      '3': { bas: '09:00', bit: '20:30' }, '4': { bas: '09:00', bit: '20:30' },
      '5': { bas: '09:00', bit: '20:30' },
    }));
    const p = M.buildProgram(Object.assign({}, CFG, { strengthDays: 2 }), []);
    const gunler = p.days.filter(d => d.type === 'strength').map(d => d.dow).sort();
    assert.strictEqual(String(gunler), '0,6', 'bos aksamlar dururken sikisik gune konmus: ' + gunler);
  });

  test('normal okul saatinde secim DEGISMEZ (yanlis alarm testi)', () => {
    const bos = motor({}).buildProgram(CFG, []);
    const okullu = motor(veriyle(OKUL_NORMAL)).buildProgram(CFG, []);
    assert.strictEqual(
      String(okullu.days.filter(d => d.type === 'strength').map(d => d.dow)),
      String(bos.days.filter(d => d.type === 'strength').map(d => d.dow)));
  });

  test('ayni girdi ayni programi verir — saat katmani determinizmi bozmaz', () => {
    const a = motor(veriyle(OKUL_GEC)).buildProgram(CFG, []);
    const b = motor(veriyle(OKUL_GEC)).buildProgram(CFG, []);
    const sadelestir = (p) => JSON.stringify(p.days.map(d => [d.dow, d.name, d.hedefDk, d.bas,
      (d.exercises || []).map(e => e.id + ':' + e.sets)]));
    assert.strictEqual(sadelestir(a), sadelestir(b));
  });
});

describe('Kisilma gercek: seans butcesi ve saatler', () => {
  test('sikisik gunde hedef sure DUSER ve seans 21:30’u gecmez', () => {
    // 5 guc gunu: kacacak bos gun yok, motor kisaltmak ZORUNDA.
    const M = motor(veriyle({
      '1': { bas: '09:00', bit: '20:00' }, '2': { bas: '09:00', bit: '20:00' },
      '3': { bas: '09:00', bit: '20:00' }, '4': { bas: '09:00', bit: '20:00' },
      '5': { bas: '09:00', bit: '20:00' },
    }));
    const p = M.buildProgram(Object.assign({}, CFG, { strengthDays: 5, sessionMin: 90 }), []);
    const haftaIci = p.days.filter(d => d.type === 'strength' && d.dow >= 1 && d.dow <= 5);
    assert.ok(haftaIci.length >= 3, 'hafta ici gun bekleniyordu');
    for (const d of haftaIci) {
      assert.strictEqual(d.bas, '20:30');
      assert.strictEqual(d.hedefDk, 60, d.dow + '. gun kisilmamis');
      assert.strictEqual(d.kisildi, true);
    }
  });

  test('bitis saati yazilir ve baslangictan sonradir', () => {
    const M = motor(veriyle(OKUL_NORMAL));
    const p = M.buildProgram(CFG, []);
    for (const d of p.days.filter(x => x.type === 'strength')) {
      assert.match(d.bas, /^\d{2}:\d{2}$/);
      assert.match(d.bitis, /^\d{2}:\d{2}$/);
      assert.ok(d.bitis > d.bas, d.dow + '. gun bitisi baslangictan once');
    }
  });

  test('okul saati YOKKEN saat yazilmaz — uydurma saat gostermektense hic gosterme', () => {
    const p = motor({}).buildProgram(CFG, []);
    for (const d of p.days.filter(x => x.type === 'strength')) {
      assert.strictEqual(d.bas, null);
      assert.strictEqual(d.bitis, undefined);
    }
  });
});

describe('SESSIZ KAYMA YOK', () => {
  test('sure kisildiyse notlarda SEBEBI ve gunu yazar', () => {
    const M = motor(veriyle({
      '1': { bas: '09:00', bit: '20:00' }, '2': { bas: '09:00', bit: '20:00' },
      '3': { bas: '09:00', bit: '20:00' }, '4': { bas: '09:00', bit: '20:00' },
      '5': { bas: '09:00', bit: '20:00' },
    }));
    const p = M.buildProgram(Object.assign({}, CFG, { strengthDays: 5, sessionMin: 90 }), []);
    const kisik = p.days.filter(d => d.type === 'strength' && d.kisildi);
    assert.ok(kisik.length, 'kisilma bekleniyordu');
    const not = (p.notes || []).find(n => /KISALTILAN/i.test(n));
    assert.ok(not, 'kisaltma notu yok: ' + JSON.stringify(p.notes));
    assert.ok(/20:00/.test(not), 'not okul saatini yazmiyor');
    assert.ok(/21:30/.test(not), 'not gec saat esigini yazmiyor');
    assert.ok(/günler/.test(not) && /kısıldı/.test(not), 'not Turkce karaktersiz yaziliyor');
  });

  test('saat kaydi ama kisilmadiysa BILGI notu var, kisaltma notu YOK (yanlis alarm)', () => {
    const M = motor(veriyle(OKUL_GEC));   // 19:00 cikis -> 19:30 seans, 75 dk sigar
    const p = M.buildProgram(CFG, []);
    assert.ok((p.notes || []).every(n => !/KISALTILAN/i.test(n)), 'gereksiz kisaltma notu');
    const haftaIci = p.days.filter(d => d.type === 'strength' && d.dow >= 1 && d.dow <= 5);
    if (haftaIci.length) {
      assert.ok((p.notes || []).some(n => /kaydırıldı/i.test(n)), 'kayma notu yok');
    }
  });

  test('okul var ama saat KAYMADIYSA "kaydirildi" notu CIKMAZ (21 Eyl yanlis alarmi)', () => {
    // 16:00 cikis + 30 dk = 16:30 < 17:00 seans: hicbir sey kaymadi. Eskiden
    // `okulBit` dolu diye bu gun de "kaydirildi" notuna giriyordu.
    const p = motor(veriyle(OKUL_NORMAL)).buildProgram(CFG, []);
    assert.ok((p.notes || []).every(n => !/kaydırıldı/i.test(n)), 'yanlis kayma notu: ' + JSON.stringify(p.notes));
    for (const d of p.days.filter(x => x.type === 'strength')) assert.strictEqual(d.kaydi, false);
  });

  test('kullaniciya giden okul notlari Turkce karakterle yazilir', () => {
    // v7-189'da notlar ASCII yazilmisti ("gunler", "kisildi") — diger notlarin
    // hepsi Turkce karakterli; tek bir kart iki farkli dil gibi okunuyordu.
    // Hafta ici hepsi gec: 5 gunun en az 3'u hafta icine dusmek ZORUNDA ->
    // kisaltma notu kesin cikar. (Bos gun varken motor gec gune hic koymaz.)
    const M = motor(veriyle({ '1': { bas: '09:00', bit: '20:00' }, '2': { bas: '09:00', bit: '20:00' },
      '3': { bas: '09:00', bit: '20:00' }, '4': { bas: '09:00', bit: '20:00' }, '5': { bas: '09:00', bit: '20:00' } }));
    const p = M.buildProgram(Object.assign({}, CFG, { strengthDays: 5, sessionMin: 90 }), []);
    const okulNotlari = (p.notes || []).filter(n => /okul/i.test(n));
    assert.ok(okulNotlari.length, 'okul notu yok');
    for (const n of okulNotlari) {
      assert.ok(!/\b(gunler|kisildi|cikisi|kaydirildi|varsayimiyla|demistin)\b/.test(n), 'ASCII Turkce: ' + n);
    }
  });

  test('okul saati girilmemisse motor 17:00 VARSAYDIGINI soyler', () => {
    const p = motor({}).buildProgram(CFG, []);
    assert.ok((p.notes || []).some(n => /17:00/.test(n) && /varsay/i.test(n)),
      'varsayim notu yok: ' + JSON.stringify(p.notes));
  });

  test('normal okul saatinde ne kisaltma ne varsayim notu cikar', () => {
    const p = motor(veriyle(OKUL_NORMAL)).buildProgram(CFG, []);
    assert.ok((p.notes || []).every(n => !/KISALTILAN/i.test(n) && !/varsay/i.test(n)),
      'yanlis alarm: ' + JSON.stringify(p.notes));
  });
});

describe('Program snapshot’u duzeni saklar', () => {
  test('p.duzen kurulus anindaki okul saatini tasir', () => {
    const p = motor(veriyle(OKUL_GEC)).buildProgram(CFG, []);
    assert.strictEqual(JSON.stringify(p.duzen.okul['2']), JSON.stringify({ bas: '09:00', bit: '19:00' }));
  });

  test('duzen yoksa p.duzen null — alan uydurulmaz', () => {
    assert.strictEqual(motor({}).buildProgram(CFG, []).duzen, null);
  });
});
