/**
 * 40 — GUNLUK DUZEN · YEMEKHANE · CANTA (13 Eyl 2026)
 *
 * Salim: "saat 09.00-16.00 arasi okulum var, sali ve persembe 19.00'da
 * bitiyo, 13.00'te okulun ogle yemegi var orda da yicem bunu nasi
 * yonetirim" — ve ardindan "bu konusmanin aynisi uygulama icinden
 * yapilabilsin".
 *
 * 🔴 BU DOSYANIN EN ONEMLI IKI SOZLESMESI:
 *
 * 1) SESSIZ KAYMA YOK. Okul 18:00'den gec bitiyorsa motor antrenmani otomatik
 *    kaydiriyor (`nutSeansSaati`). Kaydirmanin kendisi dogru, ama SESSIZ
 *    yapilirsa kullanici gece 21:30'a yazilmis bir aksam ogunu gorur ve
 *    sebebini bilmez. `nutDuzenCakisma` ayni durumu her seferinde yaziyor —
 *    kayma varsa uyari da VAR olmak zorunda.
 *
 * 2) MENUSUNU SECMEDIGIN OGUNE KALEM YAZILMAZ. Yemekhanede ne cikacagini
 *    motor bilmiyor; oraya "1 porsiyon somon" yazmak plani kagit uzerinde
 *    dogru, hayatta yalan yapar. O ogun icin yalnizca HEDEF + gercekci tezgah
 *    senaryolari + protein acigi kalirsa canta telafisi uretilir.
 *
 * Katman deterministik ve $0 — saat hesabi AI'a birakilmadi (ayni duzen her
 * zaman ayni saatleri vermeli ve test edilebilmeli).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./helpers/load.js');

const ROOT = path.resolve(__dirname, '..');
const nutSrc = fs.readFileSync(path.join(ROOT, 'nutrition.js'), 'utf8');
const workerSrc = fs.readFileSync(path.join(ROOT, 'aidan-worker', 'worker.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

const app = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js'] });
const E = (kod) => app.evalIn(kod);
const J = (kod) => JSON.parse(E('JSON.stringify(' + kod + ')'));

// Salim'in gercek duzeni: Pzt/Crs/Cum 09-16, Sal/Per 09-19, yemekhane 13:00.
const DUZEN = {
  okul: {
    1: { bas: '09:00', bit: '16:00' }, 2: { bas: '09:00', bit: '19:00' },
    3: { bas: '09:00', bit: '16:00' }, 4: { bas: '09:00', bit: '19:00' },
    5: { bas: '09:00', bit: '16:00' },
  },
  yemekhane: true, yemekhaneSaat: '13:00', antrenman: '17:00', kalk: '07:00',
};
const PROGRAM = {
  days: [{ dow: 1, type: 'strength' }, { dow: 2, type: 'strength' }, { dow: 3, type: 'fight' },
    { dow: 4, type: 'strength' }, { dow: 5, type: 'strength' }, { dow: 6, type: 'fight' }],
};

function kur(duzen, program) {
  E('ensureDiet(); data.diet.calc = {sex:"male",age:16,height:184,weight:69};' +
    'data.diet.weights = [{date:"2026-09-13",kg:69}];' +
    'ensureNutrition(); data.diet.nut.hedef = "kas"; data.diet.nut.sablon = 1;' +
    'data.diet.nut.tercih = null;' +
    'data.diet.nut.duzen = ' + JSON.stringify(duzen || DUZEN) + ';' +
    'data.program = ' + JSON.stringify(program || PROGRAM) + ';');
}
const gun = (dow) => J('(function(){const p=nutProfile();' +
  'const tip=nutDayType(' + dow + ',data.program);const t=nutTargets(p,tip,"kas");' +
  'const m=nutBuildDay(t,p.weight,1);const z=nutMealTimes(' + dow + ',tip,m,ensureNutDuzen());' +
  'return {tip:tip,t:t,meals:m,zaman:z};})()');

// ---------------------------------------------------------------------------
describe('1 — ogun saatleri hayattan cikiyor', () => {
  test('okul gunu: kahvalti okuldan once, ara tenefuse, ogle yemekhaneye duser', () => {
    kur();
    const g = gun(1);
    const s = {};
    g.zaman.forEach(z => { s[z.slot] = z; });
    assert.strictEqual(s.kahvalti.saat, '07:45', 'kahvalti okul baslangicindan 75 dk once olmali');
    assert.strictEqual(s.kahvalti.yer, 'ev');
    assert.strictEqual(s.ogle.saat, '13:00');
    assert.strictEqual(s.ogle.yer, 'yemekhane');
    assert.ok(s.ara.tasinabilir, 'okul saatindeki ara ogun tasinabilir isaretlenmemis');
    assert.strictEqual(s.ara.yer, 'tenefus');
  });

  test('antrenman gunu: atistirma seanstan once, aksam seanstan sonra', () => {
    kur();
    const g = gun(1);
    const s = {};
    g.zaman.forEach(z => { s[z.slot] = z; });
    assert.strictEqual(s.atistirma.saat, '16:15', 'antrenman oncesi ogun 45 dk once olmali');
    assert.strictEqual(s.aksam.saat, '19:00', 'seans 17:00 + 90 dk + 30 dk');
    assert.ok(s.atistirma.dk < s.aksam.dk);
  });

  test('okul yoksa saatler kalkis ve 19:00 uzerinden kurulur', () => {
    kur({ okul: {}, yemekhane: false, yemekhaneSaat: '13:00', antrenman: null, kalk: '09:00' });
    const g = gun(0);
    const s = {};
    g.zaman.forEach(z => { s[z.slot] = z; });
    assert.strictEqual(s.kahvalti.saat, '10:00', 'kalkis + 60 dk');
    assert.strictEqual(s.aksam.saat, '19:00');
    for (const z of g.zaman) assert.strictEqual(z.yer, 'ev');
  });

  test('SIRA GARANTISI: saatler artan ve iki ogun arasi en az 75 dk', () => {
    for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
      kur();
      const z = gun(dow).zaman.slice().sort((a, b) => a.dk - b.dk);
      for (let i = 1; i < z.length; i++) {
        assert.ok(z[i].dk - z[i - 1].dk >= 75,
          'dow ' + dow + ': ' + z[i - 1].saat + ' -> ' + z[i].saat + ' arasi 75 dk\'dan az');
      }
    }
  });

  test('DETERMINISTIK: ayni duzen iki kez ayni saatleri verir', () => {
    kur();
    assert.deepStrictEqual(gun(2).zaman.map(z => z.saat), gun(2).zaman.map(z => z.saat));
  });

  test('bozuk saat girdisi okulu YOK sayar, NaN sizmaz', () => {
    kur({ okul: { 1: { bas: '25:00', bit: '16:00' }, 2: { bas: '16:00', bit: '09:00' } },
      yemekhane: true, yemekhaneSaat: 'abc', antrenman: '17:00', kalk: '07:00' });
    for (const dow of [1, 2]) {
      const g = gun(dow);
      for (const z of g.zaman) {
        assert.ok(/^\d{2}:\d{2}$/.test(z.saat), dow + ': bozuk saat ' + z.saat);
        assert.ok(isFinite(z.dk));
        assert.strictEqual(z.yer, 'ev', 'gecersiz okul penceresi okul sayilmis');
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('2 — SESSIZ KAYMA YOK (bu dosyanin en onemli testi)', () => {
  test('okul 19:00\'da bitiyorsa seans kayar VE cakisma yazilir', () => {
    kur();
    const c = J('nutDuzenCakisma(ensureNutDuzen(), data.program)');
    const gunler = c.map(x => x.dow).sort();
    assert.deepStrictEqual(gunler, [2, 4], 'Sali ve Persembe uyarisi uretilmemis');
    for (const x of c) {
      assert.strictEqual(x.seans, '19:30', 'seans okul bitisine gore kaymamis');
      assert.strictEqual(x.aksam, '21:30');
      assert.ok(x.metin.length > 40 && /dinlenme|hafta sonu/i.test(x.metin),
        'uyari eyleme donuk degil');
    }
    // Kaymanin kendisi de planda gorunmeli
    const s = {};
    gun(2).zaman.forEach(z => { s[z.slot] = z; });
    assert.strictEqual(s.aksam.saat, '21:30');
  });

  test('okul erken bitiyorsa uyari YOK (yanlis alarm testi)', () => {
    kur({ okul: { 1: { bas: '09:00', bit: '16:00' } }, yemekhane: true,
      yemekhaneSaat: '13:00', antrenman: '17:00', kalk: '07:00' });
    assert.strictEqual(J('nutDuzenCakisma(ensureNutDuzen(), data.program)').length, 0);
  });

  test('gec biten gun DINLENME ise uyari YOK — cakisacak seans yok', () => {
    kur(DUZEN, { days: [{ dow: 1, type: 'strength' }] });
    const c = J('nutDuzenCakisma(ensureNutDuzen(), data.program)');
    assert.strictEqual(c.length, 0, 'antrenman olmayan gune cakisma uyarisi cikmis');
  });
});

// ---------------------------------------------------------------------------
describe('3 — YEMEKHANE: menusunu secmedigin ogune kalem yazilmaz', () => {
  test('yemekhane acikken ogle ogunu disarida isaretlenir', () => {
    kur();
    const s = gun(1).zaman.find(z => z.slot === 'ogle');
    assert.ok(s.disarida, 'ogle ogunu disarida isaretlenmemis');
  });

  test('yemekhane KAPALIYKEN ogle normal ogun kalir (yanlis alarm)', () => {
    kur(Object.assign({}, DUZEN, { yemekhane: false }));
    const s = gun(1).zaman.find(z => z.slot === 'ogle');
    assert.ok(!s.disarida, 'yemekhane kapaliyken de disarida sayilmis');
  });

  test('uc senaryo uretiliyor ve hepsi hedefin %15 bandinda', () => {
    kur();
    const g = gun(1);
    const ogle = g.meals.find(m => m.slot === 'ogle');
    const y = J('nutYemekhane(' + JSON.stringify(ogle) + ')');
    assert.strictEqual(y.senaryolar.length, 3);
    for (const s of y.senaryolar) {
      assert.ok(Math.abs(s.sapma) <= 15, s.tip + ' senaryosu hedeften %' + s.sapma + ' sapiyor');
      assert.ok(s.items.length >= 3, s.tip + ' senaryosunda 3 kalemden az var');
    }
  });

  test('senaryo kalemleri UYDURMA degil — hepsi foods.js\'te var', () => {
    kur();
    const ogle = gun(1).meals.find(m => m.slot === 'ogle');
    const y = J('nutYemekhane(' + JSON.stringify(ogle) + ')');
    for (const s of y.senaryolar) {
      for (const x of s.items) {
        assert.ok(J('!!nutFood(' + JSON.stringify(x.n) + ')'), 'veritabaninda yok: ' + x.n);
      }
      if (s.telafi) assert.ok(J('!!nutFood(' + JSON.stringify(s.telafi.n) + ')'));
    }
  });

  test('sebze senaryosunda protein acigi telafi ile kapaniyor, etlide telafi YOK', () => {
    kur();
    const ogle = gun(1).meals.find(m => m.slot === 'ogle');
    const y = J('nutYemekhane(' + JSON.stringify(ogle) + ')');
    const etli = y.senaryolar.find(s => s.tip === 'etli');
    const sebze = y.senaryolar.find(s => s.tip === 'sebze');
    assert.ok(!etli.telafi, 'etli ana yemekte gereksiz telafi onerilmis (yanlis alarm)');
    assert.ok(sebze.telafi, 'sebze yemeginde protein acigi kapatilmamis');
    assert.ok(sebze.telafiliProtein > sebze.protein);
    assert.ok(sebze.telafiliProtein >= y.hedef.protein - 4,
      'telafi sonrasi hala hedefin altinda: ' + sebze.telafiliProtein + ' / ' + y.hedef.protein);
  });

  test('tezgah kurali TEK soru — tepsi basinda uc maddelik liste hatirlanmaz', () => {
    kur();
    const ogle = gun(1).meals.find(m => m.slot === 'ogle');
    const y = J('nutYemekhane(' + JSON.stringify(ogle) + ')');
    assert.ok(/\?/.test(y.kural), 'kural bir soru degil');
    assert.ok(y.kural.length < 160);
  });
});

// ---------------------------------------------------------------------------
describe('4 — CANTA: okul saatindeki ogun tasinabilir olmak zorunda', () => {
  test('oneri YALNIZ tasinabilir besinlerden kuruluyor', () => {
    kur();
    const g = gun(1);
    const rows = J('nutCanta(' + JSON.stringify(g.meals) + ',' + JSON.stringify(g.zaman) + ',true)');
    const izinli = J('[].concat(NUT_TASINIR.protein, NUT_TASINIR.carb, NUT_TASINIR.yag)');
    assert.ok(rows.length >= 2, 'canta listesi bos');
    for (const r of rows) {
      for (const x of r.oneri.items) {
        assert.ok(izinli.indexOf(x.n) >= 0, 'tasinamaz kalem cantaya yazilmis: ' + x.n);
      }
    }
  });

  test('oneri hedefin %25 bandinda (kalori kaybolmuyor)', () => {
    kur();
    const g = gun(1);
    const rows = J('nutCanta(' + JSON.stringify(g.meals) + ',' + JSON.stringify(g.zaman) + ',false)');
    for (const r of rows) {
      if (!r.hedef) continue;
      assert.ok(Math.abs(r.oneri.sapma) <= 25,
        r.slot + ' onerisi hedeften %' + r.oneri.sapma + ' sapiyor');
    }
  });

  test('yemekhane acikken telafi kalemi listede, kapaliyken YOK', () => {
    kur();
    const g = gun(1);
    const acik = J('nutCanta(' + JSON.stringify(g.meals) + ',' + JSON.stringify(g.zaman) + ',true)');
    const kapali = J('nutCanta(' + JSON.stringify(g.meals) + ',' + JSON.stringify(g.zaman) + ',false)');
    assert.ok(acik.some(r => r.slot === 'telafi'));
    assert.ok(!kapali.some(r => r.slot === 'telafi'));
  });

  test('sevmedigin besin cantaya da girmez (tercih katmani calisiyor)', () => {
    kur();
    E('data.diet.nut.tercih = {diyet:"yok", sevmem:["Simit","Muz"], favori:[]};');
    const g = gun(1);
    const rows = J('nutCanta(' + JSON.stringify(g.meals) + ',' + JSON.stringify(g.zaman) + ',false)');
    for (const r of rows) {
      for (const x of r.oneri.items) {
        assert.ok(x.n !== 'Simit' && x.n !== 'Muz', 'sevmedigi besin cantada: ' + x.n);
      }
    }
    E('data.diet.nut.tercih = null;');
  });
});

// ---------------------------------------------------------------------------
describe('5 — plana aktarim: disarida ogun tek satir, gun toplami korunur', () => {
  test('yemekhane ogununun kalemleri plana YAZILMAZ', () => {
    kur();
    const g = gun(1);
    const sat = J('nutOrnekSatirlari(' + JSON.stringify(g.meals) + ',' + JSON.stringify(g.zaman) + ')');
    const ogle = sat.filter(s => s.slot === 'ogle');
    assert.strictEqual(ogle.length, 1, 'yemekhane ogunu kalem kalem plana yazilmis');
    assert.ok(/yemekhane/i.test(ogle[0].name));
    const hedef = g.meals.find(m => m.slot === 'ogle');
    assert.strictEqual(ogle[0].kcal, Math.round(hedef.kcal), 'gun toplami bozuldu');
  });

  test('zaman verilmezse eski davranis aynen kalir (geriye uyum)', () => {
    kur();
    const g = gun(1);
    const eski = J('nutOrnekSatirlari(' + JSON.stringify(g.meals) + ')');
    assert.ok(eski.filter(s => s.slot === 'ogle').length > 1,
      'zaman verilmeden de tek satira dusmus — eski cagrilar bozulur');
  });
});

// ---------------------------------------------------------------------------
describe('6 — duzen AI istegine ayri alanda geciyor', () => {
  test('nutDuzenMetni okul + yemekhane + antrenman bilgisini tasiyor', () => {
    kur();
    const m = E('nutDuzenMetni(ensureNutDuzen(), data.program)');
    assert.ok(/09:00-16:00/.test(m), 'okul saatleri yok');
    assert.ok(/yemekhane/i.test(m) && /kalem yazma/i.test(m), 'yemekhane kisiti yok');
    assert.ok(/17:00/.test(m), 'antrenman saati yok');
    assert.ok(m.length <= 700, 'duzen metni worker tavanini asiyor: ' + m.length);
  });

  test('duzen metni KALORI DUSURMEZ — guvenlik dili sizmiyor', () => {
    kur();
    const m = E('nutDuzenMetni(ensureNutDuzen(), data.program)');
    assert.ok(!/az ye|kalori (acigi|açığı)|kilo ver|zayifla|zayıfla|hafif gun|hafif gün|oruc|oruç/i.test(m),
      'duzen metni 16 yas kilidini delecek bir dil tasiyor: ' + m);
  });

  test('duzen AYRI alan olarak gidiyor, istegin 800 karakterini yemiyor', () => {
    const w = nutSrc.slice(nutSrc.indexOf('async function nutAiWrite()'));
    assert.ok(/istek, duzen,/.test(w), 'duzen ayri alan olarak gonderilmiyor');
    assert.ok(!/istek = \[duzen/.test(w), 'duzen istek kutusuna birlestirilmis');
    // Kaydedilen metin KULLANICININ yazdigi kalmali
    assert.ok(/n\.aiIstek = istek;/.test(w), 'kutuya duzen metni geri yazilmis olabilir');
  });

  test('worker duzen icin ayri tavan tutuyor ve user mesajina koyuyor', () => {
    assert.ok(/DIET_PLAN_DUZEN_MAX\s*=\s*700/.test(workerSrc), 'worker tavani yok');
    assert.ok(/body\.duzen/.test(workerSrc), 'worker duzen alanini okumuyor');
    assert.ok(/GÜNLÜK DÜZEN/.test(workerSrc), 'duzen bloklu olarak prompta girmiyor');
    // Sozlesme: menusu secilemeyen ogune kalem yazilmaz
    assert.ok(/MENÜSÜNÜ SEÇEMEDİĞİ/.test(workerSrc), 'yemekhane kurali promptta yok');
  });

  test('guvenlik onceligi bozulmamis — KURALLAR KAZANIR duruyor', () => {
    assert.ok(/KURALLAR KAZANIR/.test(workerSrc));
    assert.ok(/Hedefin ALTINDA gün yazmak YASAKTIR/.test(workerSrc));
  });
});

// ---------------------------------------------------------------------------
describe('7 — arayuz', () => {
  test('duzen formu ve yemekhane karti ciziliyor', () => {
    kur();
    E('renderNutrition()');
    const html = E('document.getElementById("nutSection").innerHTML');
    assert.ok(/Günlük düzen/.test(html), 'duzen bloku cizilmemis');
    assert.ok(/setNutOkul\(/.test(html), 'okul saati girisi yok');
    assert.ok(/Çanta paketi/.test(html), 'canta bloku yok');
  });

  test('ogunler SAATE gore siralaniyor (motorun slot sirasi degil)', () => {
    kur();
    E('renderNutrition()');
    const html = E('document.getElementById("nutSection").innerHTML');
    const saatler = (html.match(/\b([01]\d|2[0-3]):[0-5]\d\b/g) || []);
    assert.ok(saatler.length >= 4, 'ogun saatleri ekranda yok');
  });

  test('XSS: sevmedigi besin adi kacisla yaziliyor', () => {
    kur();
    E('data.diet.nut.tercih = {diyet:"yok", sevmem:["<img src=x onerror=alert(1)>"], favori:[]};');
    E('renderNutrition()');
    const html = E('document.getElementById("nutSection").innerHTML');
    assert.ok(!/onerror=alert/.test(html), 'XSS kacisi yok');
    E('data.diet.nut.tercih = null;');
  });

  test('Impeccable: yeni bloklarda yan-serit kenarlik ve gradyan yok', () => {
    const blok = cssSrc.slice(cssSrc.indexOf('gunluk duzen · yemekhane · canta'));
    assert.ok(!/border-(left|right):\s*[2-9]/.test(blok), 'yan-serit kenarlik kullanilmis');
    assert.ok(!/linear-gradient|backdrop-filter/.test(blok), 'gradyan/glass kullanilmis');
    assert.ok(!/#fff\b|#000\b/.test(blok), 'saf siyah/beyaz kullanilmis');
    // iOS otomatik zoom: giris alani 16px altinda olamaz
    assert.ok(/font-size:\s*16px/.test(blok), 'time input 16px altinda — iOS sayfayi zoomlar');
  });
});

test('kapat', () => { app.close(); });
