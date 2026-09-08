/**
 * 33 — TEK HEDEF KAYNAĞI + GÜN KISALTMASI (6 Eyl 2026)
 *
 * Salim "diyet ve antrenman kısmını kullanmaya başlayacağım" dedi; iki akış
 * sıfırdan kurulum yapan bir kullanıcı gibi koşturuldu ve iki hata çıktı.
 *
 * 1) 🔴 AYNI EKRANDA İKİ FARKLI HEDEF. Diyet sekmesindeki hesaplayıcı
 *    (`calcGoals`) kendi Mifflin BMR'sini, kullanıcının seçtiği PAL'i ve
 *    sabit 1.8 g/kg proteini kullanıp `data.diet.kcalGoal`e yazıyordu;
 *    beslenme motoru ise paylaşılan `hcBMR`yi, GÜN TİPİNE göre PAL'i ve
 *    enerji mevcudiyeti tabanını kullanıyor. 16 yaş / 178 cm / 68.5 kg için
 *    hesaplayıcı BMR 1723 → 3274 kcal, motor BMR 1870 → 2899 kcal diyordu.
 *    Günlük ekranı 3274'e göre "kalan" sayıyor, plan 2899 öneriyordu; 375
 *    kcal fark ve hangisinin geçerli olduğu hiçbir yerde yazmıyordu.
 *    ⚠️ MOTOR KAZANIR — sağlık raporuyla ortak çekirdek, gün tipine duyarlı,
 *    16 yaş kilitleri ona bağlı. Hesaplayıcının işi artık PROFİL toplamak.
 *
 * 2) 🔴 GÜN KISALTMASI TÜRKÇEDE `slice(0,3)` İLE YAPILMIŞTI.
 *    "Pazartesi"→"Paz" ile "Pazar"→"Paz", "Cumartesi"→"Cum" ile "Cuma"→"Cum"
 *    çakışıyor. Antrenman kurulum ekranındaki dövüş günü çipleri tam olarak
 *    böyleydi: yedi çipin ikisi ayırt edilemiyordu, kullanıcı hangi güne
 *    bastığını göremiyordu. Bu ekran programın İLK adımı.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, SCRIPTS, ROOT } = require('./helpers/load');

const MODULLER = [...SCRIPTS, 'program.js', 'nutrition.js', 'health.js', 'school.js'];
const A = loadApp({ seed: {}, scripts: MODULLER });
const W = A.window, D = A.window.document;
W.Element.prototype.scrollIntoView = function () {};
after(() => { try { A.close(); } catch (_) {} });

const veri = () => A.evalIn('data');
const PROFIL = { sex: 'male', age: 16, height: 178, weight: 68.5, activity: '1.55', goal: 'gain' };

function profilYaz() {
  const d = veri();
  A.evalIn('ensureDiet()');
  d.diet.calc = Object.assign({}, PROFIL);
  return d;
}

describe('gun kisaltmasi', () => {
  test('yedi gun de BIRBIRINDEN AYIRT EDILEBILIR', () => {
    const g = A.evalIn('GUN_KISA');
    assert.strictEqual(g.length, 7);
    assert.strictEqual(new Set(g).size, 7, 'iki gun ayni kisaltmayi aliyor: ' + g.join(','));
    assert.strictEqual(g[0], 'Paz');
    assert.strictEqual(g[1], 'Pzt');
    assert.strictEqual(g[6], 'Cmt');
  });

  test('gun adindan slice(0,3) ile kisaltma YAPILMIYOR (sabotaj)', () => {
    // 🔴 Bu kural olmazsa hata sessizce geri gelir: Türkçe gün adlarının ilk
    // üç harfi benzersiz DEĞİL.
    for (const f of ['program.js', 'nutrition.js', 'ui.js', 'core.js', 'tasks.js', 'school.js', 'karne.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const kotu = /(GUNLER|GUN_ADLARI|dayLabel|DayLabel|programDayLabel)[^\n]{0,60}\.slice\(\s*0\s*,\s*3\s*\)/.test(src);
      assert.ok(!kotu, f + ' gun adini slice(0,3) ile kisaltiyor — Paz/Paz ve Cum/Cum cakisir');
    }
  });

  test('nutrition.js\'in kendi dizisi core.js ile AYNI (kayma nobeti)', () => {
    // nutrition.js core.js OLMADAN yalitilmis vm'de yukleniyor (18-nutrition),
    // o yuzden GUN_KISA'ya dogrudan baglanamiyor. Iki dizi kopya; kaymasin.
    const core = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
    const nut = fs.readFileSync(path.join(ROOT, 'nutrition.js'), 'utf8');
    const oku = (src, ad) => {
      const m = new RegExp('const ' + ad + ' = (\\[[^\\]]+\\])').exec(src);
      assert.ok(m, ad + ' okunamadi');
      return m[1].replace(/\s+/g, '');
    };
    assert.strictEqual(oku(nut, 'DKRN_WD'), oku(core, 'GUN_KISA'),
      'nutrition.js DKRN_WD ile core.js GUN_KISA kaymis');
  });

  test('dovus gunu cipleri ekranda ayirt edilebilir (kapi)', () => {
    W.openProgramSetup();
    const cipler = [...D.querySelectorAll('#programSetupBody .prog-chip')]
      .map(c => c.textContent.trim());
    const gunler = cipler.slice(cipler.indexOf('Pzt'), cipler.indexOf('Pzt') + 7);
    assert.strictEqual(gunler.join(''), 'PztSalÇarPerCumCmtPaz', gunler.join('|'));
    W.closeProgramSetup();
  });
});

describe('tek hedef kaynagi', () => {
  test('motor ile hesaplayici AYNI sayiyi veriyor', () => {
    profilYaz();
    W.calcGoals ? null : assert.fail('calcGoals yok');
    // Hesaplayici alanlarini doldur, sonucu uret
    D.getElementById('calcAge').value = String(PROFIL.age);
    D.getElementById('calcHeight').value = String(PROFIL.height);
    D.getElementById('calcWeight').value = String(PROFIL.weight);
    W.calcGoals();
    const kart = D.getElementById('calcResult').textContent;
    const tip = A.evalIn('nutDayType(new Date().getDay(), data.program)');
    const t = A.evalIn(`nutTargets(nutProfile(), '${tip}', (data.diet.nut && data.diet.nut.hedef) || 'koru')`);
    assert.ok(t && t.kcal > 0, 'motor hedef uretmedi');
    assert.ok(kart.includes(String(t.kcal)), `hesaplayici ${t.kcal} yazmiyor: ${kart.slice(0, 90)}`);
    assert.ok(kart.includes(String(t.bmr)), 'hesaplayici motorun BMR\'sini yazmiyor');
  });

  test('hesaplayici artik KENDI kcal hedefini yazmiyor', () => {
    // 🔴 REGRESYON: eskiden Mifflin + kullanici PAL'i ile hesaplayip
    // dogrudan data.diet.kcalGoal'e yaziyordu.
    const src = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
    const blok = src.slice(src.indexOf('function calcGoals()'), src.indexOf('function addMealReminder'));
    const yedek = blok.indexOf('Motor inmediyse yedek hesap');
    assert.ok(yedek > 0, 'yedek hesap bolumu isaretlenmemis');
    const anaYol = blok.slice(0, yedek);
    assert.ok(!/data\.diet\.kcalGoal\s*=/.test(anaYol), 'ana yol hala kendi hedefini yaziyor');
    assert.ok(/nutTargets\(/.test(anaYol), 'ana yol motoru cagirmiyor');
  });

  test('motor hedefi GUNLUGE senkronlaniyor', () => {
    profilYaz();
    const d = veri();
    d.diet.kcalGoal = 1; d.diet.proteinGoal = 1; d.diet.carbGoal = 1; d.diet.fatGoal = 1;
    W.renderNutrition();
    const tip = A.evalIn('nutDayType(new Date().getDay(), data.program)');
    const t = A.evalIn(`nutTargets(nutProfile(), '${tip}', (data.diet.nut && data.diet.nut.hedef) || 'koru')`);
    assert.strictEqual(d.diet.kcalGoal, t.kcal, 'gunluk hedefi motorla ayni degil');
    assert.strictEqual(d.diet.proteinGoal, t.protein);
    assert.strictEqual(d.diet.carbGoal, t.carb);
    assert.strictEqual(d.diet.fatGoal, t.fat);
  });

  test('hedef GUN TIPINE gore degisiyor (dinlenme < agirlik+dovus)', () => {
    profilYaz();
    const dinlenme = A.evalIn("nutTargets(nutProfile(), 'rest', 'kas')");
    const ikisi = A.evalIn("nutTargets(nutProfile(), 'both', 'kas')");
    assert.ok(ikisi.kcal > dinlenme.kcal, `both ${ikisi.kcal} <= rest ${dinlenme.kcal}`);
  });

  test('senkron GEREKSIZ save() yapmiyor', () => {
    profilYaz();
    W.renderNutrition();                       // ilk cagri senkronlar
    const t = A.evalIn('nutSyncDietGoals(nutTargets(nutProfile(), nutDayType(new Date().getDay(), data.program), (data.diet.nut && data.diet.nut.hedef) || "koru"))');
    assert.strictEqual(t, false, 'degismeyen hedef icin yine yazdi — senkron trafigi bosa siser');
  });

  test('profil yoksa hedef UYDURULMUYOR', () => {
    const d = veri();
    const yedek = d.diet.calc;
    d.diet.calc = null;
    assert.strictEqual(A.evalIn('nutProfile()'), null);
    assert.strictEqual(A.evalIn('nutSyncDietGoals(null)'), false);
    d.diet.calc = yedek;
  });
});

describe('antrenman kurulumu ucdan uca', () => {
  test('cipleri tiklayarak program URETILIYOR', () => {
    W.openProgramSetup();
    const bas = (etiket) => {
      const b = [...D.querySelectorAll('#programSetupBody .prog-chip')].find(x => x.textContent.trim() === etiket);
      assert.ok(b, 'cip yok: ' + etiket);
      b.click();
    };
    ['Atletik güç / patlayıcılık', '4 gün', '60 dk', 'Sal', 'Per'].forEach(bas);
    W.saveProgramSetup();
    const p = veri().program;
    assert.ok(p && p.days.length, 'program uretilmedi');
    assert.strictEqual(p.days.filter(g => g.type === 'strength').length, 4, 'guc gunu sayisi tutmuyor');
    assert.strictEqual(p.days.filter(g => g.type === 'fight').length, 2, 'dovus gunu sayisi tutmuyor');
    assert.ok(!D.getElementById('programModal').classList.contains('active'), 'modal kapanmadi');
  });

  test('uretilen her harekette AD, set ve tekrar var', () => {
    const p = veri().program;
    for (const g of p.days.filter(x => x.type === 'strength')) {
      assert.ok(g.exercises && g.exercises.length, g.dow + '. gun bos');
      for (const e of g.exercises) {
        assert.ok(e.tr && e.tr.length > 1, 'hareket adi yok: ' + JSON.stringify(e).slice(0, 80));
        assert.ok(e.sets > 0, e.tr + ': set yok');
        assert.ok(e.repMin > 0 || e.sure, e.tr + ': tekrar/sure yok');
        assert.ok(e.rest > 0, e.tr + ': dinlenme yok');
      }
    }
  });

  test('program kurulunca beslenme hedefi GUN TIPINI okuyor', () => {
    // Iki motorun baglandigi yer: antrenman gunu daha yuksek kalori demek.
    profilYaz();
    const p = veri().program;
    const gucGun = p.days.find(g => g.type === 'strength').dow;
    const dinGun = [0, 1, 2, 3, 4, 5, 6].find(d => A.evalIn(`nutDayType(${d}, data.program)`) === 'rest');
    assert.strictEqual(A.evalIn(`nutDayType(${gucGun}, data.program)`), 'strength');
    if (dinGun !== undefined) {
      const a = A.evalIn("nutTargets(nutProfile(), 'strength', 'kas')");
      const b = A.evalIn("nutTargets(nutProfile(), 'rest', 'kas')");
      assert.ok(a.kcal > b.kcal, 'antrenman gunu dinlenme gununden yuksek degil');
    }
  });
});

describe('ornek gunun plana aktarimi', () => {
  test('aktarim KALORI KAYBETMIYOR', () => {
    profilYaz();
    const gun = A.evalIn("nutBuildDay(nutTargets(nutProfile(),'strength','kas'), nutProfile().weight, 0)");
    const satir = A.evalIn("nutOrnekSatirlari(nutBuildDay(nutTargets(nutProfile(),'strength','kas'), nutProfile().weight, 0))");
    const gunKcal = gun.reduce((s, m) => s + (m.kcal || 0), 0);
    const satirKcal = satir.reduce((s, r) => s + (r.kcal || 0), 0);
    assert.ok(satir.length > 0, 'aktarilacak satir yok');
    assert.strictEqual(satirKcal, gunKcal, `aktarimda ${gunKcal - satirKcal} kcal kayboldu`);
  });

  test('plana yazilan satirlar kaynak:aidan ile isaretli', () => {
    // Isaret PLANA YAZILIRKEN konuyor (nutPlanaYaz). Onemli olan katman bu:
    // yeniden aktarimda YALNIZ isaretli satirlar siliniyor, elle eklenenler
    // duruyor. Isaret kaybolursa kullanicinin kendi girdikleri de silinir.
    profilYaz();
    A.evalIn('nutPlanBul().meals = { all: [] }');
    A.evalIn("nutPlanBul().meals.all.push({ id: 1, slot: 'ogle', name: 'ELLE EKLENEN', kcal: 100 })");
    W.nutOrnekPlana();
    const kova = A.evalIn('nutPlanBul().meals');
    const hepsi = Object.keys(kova).reduce((a, k) => a.concat(kova[k] || []), []);
    const aidan = hepsi.filter(r => r.kaynak === 'aidan');
    assert.ok(aidan.length > 0, 'aktarim isaretli satir uretmedi');
    assert.ok(aidan.every(r => r.slot && r.name), 'slot/ad eksik satir var');
    assert.ok(hepsi.some(r => r.name === 'ELLE EKLENEN'), 'elle eklenen satir silindi');
    // Ikinci aktarim: isaretliler yenilenir, elle eklenen DURUR
    W.nutOrnekPlana();
    const kova2 = A.evalIn('nutPlanBul().meals');
    const hepsi2 = Object.keys(kova2).reduce((a, k) => a.concat(kova2[k] || []), []);
    assert.ok(hepsi2.some(r => r.name === 'ELLE EKLENEN'), 'ikinci aktarimda elle eklenen silindi');
    assert.strictEqual(hepsi2.filter(r => r.kaynak === 'aidan').length, aidan.length,
      'ikinci aktarim satirlari CIFTLEDI');
  });
});

describe('kurulum kapisi: motor var, profil yoktu', () => {
  /**
   * 🔴 GERÇEK DURUM (6 Eyl 2026, canlı veri): `data.diet.calc` NULL,
   * `kcalGoal` 2200 elle kalmış, plan 0 satır — ama antrenman programı
   * kurulmuş ve tartı her gün kilo yolluyordu. Yani motor hazırdı,
   * PROFİL girilmemişti ve bunu hiçbir yer söylemiyordu: hesaplayıcı
   * KAPALI bir `<details>` içinde ("Hedefler & öğün hatırlatıcıları"),
   * boş durum da yalnızca "aşağıdaki hesaplayıcıya gir" diyordu.
   * 68.8 kg'da 6 gün antrenman yapan biri 2200 kcal hedefiyle diyet
   * yazmaya başlayacaktı.
   */
  const bosProfil = () => {
    const d = veri();
    A.evalIn('ensureDiet()');
    d.diet.calc = null;
    d.diet.kcalGoal = 2200;
    d.diet.weights = [{ date: A.evalIn('today()'), kg: 68.8, fat: 15.5, lean: 58.1, src: 'health' }];
    // ⚠️ Ayni jsdom'da onceki testlerin DOM'a yazdigi degerler kaliyor;
    // `renderCalcInputs` dolu alanin uzerine YAZMIYOR (kullanicinin yazdigini
    // ezmemek dogru davranis) — o yuzden temiz kurulum icin alanlar bosaltilir.
    for (const id of ['calcAge', 'calcHeight', 'calcWeight']) {
      const e = D.getElementById(id); if (e) e.value = '';
    }
    return d;
  };

  test('KILO tartidan geliyor — eksik sayilmiyor', () => {
    bosProfil();
    const eksik = A.evalIn('dietSetupEksik()');
    assert.ok(!eksik.includes('kilo'), 'tarti kaydi varken kilo isteniyor: ' + eksik.join(','));
    assert.deepStrictEqual(eksik.join('|'), 'yaş|boy');
  });

  test('profil YOKKEN motor SUSUYOR (uydurma hedef uretmiyor)', () => {
    bosProfil();
    assert.strictEqual(A.evalIn('nutProfile()'), null, 'boysuz profil uretildi — hcBMR uydurur');
  });

  test('boy girilince profil aciliyor, kilo yine TARTIDAN', () => {
    const d = bosProfil();
    d.diet.calc = { sex: 'male', age: 16, height: 178 };   // kilo YOK
    const p = A.evalIn('nutProfile()');
    assert.ok(p, 'boy + yas varken profil hala null');
    assert.strictEqual(p.weight, 68.8, 'kilo tartidan alinmadi');
  });

  test('tarti kilosu ESKI calc.weight\'i EZIYOR', () => {
    // Hesaplayici bir kez calistirildiginda girilen kilo AYLARCA donuyordu.
    const d = bosProfil();
    d.diet.calc = { sex: 'male', age: 16, height: 178, weight: 72.0 };
    assert.strictEqual(A.evalIn('nutProfile()').weight, 68.8, 'donmus calc.weight kullanildi');
  });

  test('gunlukte "elle konmus hedef" uyarisi cikiyor', () => {
    bosProfil();
    W.renderDiet();
    const el = D.getElementById('dietGoalWarn');
    assert.notStrictEqual(el.style.display, 'none', 'yanlis hedef sessizce sayiliyor');
    assert.match(el.textContent, /elle konmuş/);
    assert.match(el.textContent, /yaş ve boy/, 'eksigin ADI yazilmiyor');
    assert.ok(el.querySelector('button'), 'kurulum kapisi yok — bilgi var, yol yok');
  });

  test('uyari YALNIZ bugun icin — gecmis gun incelerken gurultu yapmiyor', () => {
    bosProfil();
    A.evalIn('dietDateShift(-1)');
    W.renderDiet();
    assert.strictEqual(D.getElementById('dietGoalWarn').style.display, 'none');
    A.evalIn('dietDateShift(1)');
  });

  test('bos beslenme plani EKSIGIN ADINI ve tarti kilosunu yaziyor', () => {
    bosProfil();
    W.renderNutrition();
    const t = D.getElementById('nutSection').textContent;
    assert.match(t, /yaş ve boy/, 'hangi alanin eksik oldugu yazmiyor');
    assert.match(t, /68\.8 kg/, 'kilonun tartidan geldigi soylenmiyor');
    assert.ok(D.querySelector('#nutSection button'), 'kurulum kapisi yok');
  });

  test('kurulum kutusu ACILIYOR ve ilk EKSIK alana odaklaniyor', () => {
    bosProfil();
    W.renderDiet();                 // alan on-doldurmasi renderDiet'te
    W.dietSetupOpen();
    assert.strictEqual(D.getElementById('dietSetupBox').open, true, 'kapali <details> acilmadi');
    // Kilo alani tartidan ON-DOLU olmali: yazmasi gereken tek sey yas + boy.
    assert.strictEqual(D.getElementById('calcWeight').value, '68.8', 'kilo alani tartidan doldurulmadi');
    assert.strictEqual(D.getElementById('calcAge').value, '', 'yas alani beklenmedik sekilde dolu');
  });

  test('yas + boy girilince zincirin TAMAMI ayaga kalkiyor', () => {
    bosProfil();
    D.getElementById('calcAge').value = '16';
    D.getElementById('calcHeight').value = '178';
    W.calcGoals();
    const btn = D.querySelector('#calcResult button');
    assert.ok(btn, 'uygula dugmesi yok');
    btn.click();
    const d = veri();
    assert.ok(d.diet.kcalGoal > 2500, 'hedef hala elle konmus degerde: ' + d.diet.kcalGoal);
    W.renderDiet();
    assert.strictEqual(D.getElementById('dietGoalWarn').style.display, 'none', 'uyari kalkmadi');
    W.renderNutrition();
    assert.ok(!/Kurulumu aç/.test(D.getElementById('nutSection').textContent), 'plan hala bos durumda');
  });
});
