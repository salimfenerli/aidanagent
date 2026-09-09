/**
 * 36 — BESLENME: KISISEL TERCIH + KALAN MAKRO ONERISI (9 Eyl 2026)
 *
 * Iki yeni katman denetleniyor:
 *   1) TERCIH — sevmedikleri / favorileri / diyet kisiti. Motor plani buna
 *      gore kuruyor. Kritik risk: bir kisit yuzunden OGUNUN KAYBOLMASI.
 *      Sessizce 4 ogunluk gun uretmek, makro toplamini da ogun sayisini da
 *      yanlis yapar — ve kullanici bunu fark etmez.
 *   2) ONERI — gunlukteki acigi kapatan tek kalem. Kritik risk: makro
 *      matematigi dogru ama UYGULANAMAZ oneri ("3 porsiyon Adana kebap").
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load.js');

const app = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js', 'health.js', 'foods.js'] });
const E = (kod) => app.evalIn(kod);
const J = (kod) => JSON.parse(E('JSON.stringify(' + kod + ')'));

const KG = 69;
const setTercih = (t) =>
  E('data.diet.nut = ' + JSON.stringify({ hedef: 'kas', sablon: 0, tercih: t }) + ', 1');
const gun = (tip, idx) =>
  J(`(function(){const p={sex:'male',age:16,height:184,weight:${KG}};` +
    `const t=nutTargets(p,'${tip}','kas');const m=nutBuildDay(t,${KG},${idx});` +
    `return {t:t,meals:m,n:nutMealCount(t.kcal),ozet:nutDaySummary(m,t,${KG})};})()`);
const TIPLER = ['rest', 'strength', 'fight', 'both'];
const IDXLER = [0, 1, 2, 3, 4];

// ---------------------------------------------------------------------------
describe('1 — tercih plani gercekten degistiriyor', () => {
  test('sevmedigi besin HICBIR ogunde cikmiyor', () => {
    setTercih({ diyet: 'yok', sevmem: ['Somon', 'Makarna', 'Protein tozu'], favori: [] });
    const kotu = [];
    for (const tip of TIPLER) for (const idx of IDXLER) {
      for (const m of gun(tip, idx).meals) {
        for (const it of m.items) {
          if (/somon|makarna|protein tozu/i.test(it.n)) kotu.push(tip + idx + ':' + it.n);
        }
      }
    }
    assert.deepStrictEqual([...new Set(kotu)], []);
  });

  test('⚠️ kisit yuzunden OGUN KAYBOLMUYOR', () => {
    // En sik ve en sessiz hata sinifi: capasi engellenen slot plandan
    // dusuyor, gun 5 yerine 4 ogun oluyor, makro toplami da bozuluyor.
    for (const diyet of ['yok', 'kirmizisiz', 'etsiz', 'laktozsuz', 'glutensiz']) {
      setTercih({ diyet, sevmem: [], favori: [] });
      for (const tip of TIPLER) for (const idx of IDXLER) {
        const g = gun(tip, idx);
        assert.strictEqual(g.meals.length, g.n,
          diyet + '/' + tip + '/idx' + idx + ': ' + g.meals.length + ' ogun (beklenen ' + g.n + ')');
      }
    }
  });

  test('sunulan her diyet kisiti KACIS KAPISI acmadan uygulanabiliyor', () => {
    // Arayuzde gorunen ama tutmayan secenek, olmayan secenekten kotudur.
    // Vejetaryen bu yuzden LISTEDE YOK — ana ogun havuzunda yogunluk
    // sozlesmesini gecen bitkisel capa bulunmuyor (bkz. NUT_DIYET notu).
    const secenekler = J('Object.keys(NUT_DIYET)');
    assert.ok(secenekler.indexOf('vejetaryen') < 0,
      'tutmayan secenek listeye geri gelmis');
    for (const diyet of secenekler) {
      setTercih({ diyet, sevmem: [], favori: [] });
      let kacis = 0;
      for (const tip of TIPLER) for (const idx of IDXLER) {
        for (const m of gun(tip, idx).meals) if (m.tercihDisi) kacis++;
      }
      assert.strictEqual(kacis, 0, diyet + ': ' + kacis + ' ogunde kurala uyulamadi');
    }
  });

  test('kisit + sevmedikleri BIRLIKTE de plani bozmuyor', () => {
    setTercih({ diyet: 'laktozsuz', sevmem: ['Somon', 'Levrek', 'Haşlanmış patates'], favori: [] });
    for (const tip of TIPLER) for (const idx of IDXLER) {
      const g = gun(tip, idx);
      assert.strictEqual(g.meals.length, g.n, tip + idx + ': ogun kayboldu');
      // Kalori hedefi tutmali — takas makroyu ucurmamali.
      assert.ok(Math.abs(g.ozet.sapma.kcal) <= 10,
        tip + idx + ': kalori sapmasi %' + g.ozet.sapma.kcal);
    }
  });

  test('tercih YOKKEN filtre hicbir seyi elemiyor (regresyon kilidi)', () => {
    setTercih({ diyet: 'yok', sevmem: [], favori: [] });
    const havuz = J('nutHavuzBesinleri()');
    for (const slot of Object.keys(havuz)) {
      for (const ad of havuz[slot]) {
        assert.ok(J('nutIzinli(' + JSON.stringify(ad) + ')'),
          'tercih bos ama ' + ad + ' elenmis');
      }
    }
  });

  test('favori sablon sirayi ONE cekiyor', () => {
    const capalar = (t) => {
      setTercih(t);
      return gun('strength', 0).meals.map((m) =>
        (m.items.find((x) => x.rol === 'p') || {}).n).join('|');
    };
    const yalin = capalar({ diyet: 'yok', sevmem: [], favori: [] });
    const favli = capalar({ diyet: 'yok', sevmem: [], favori: ['Somon'] });
    assert.ok(favli.indexOf('Somon') >= 0,
      'favori capa plana girmedi: ' + favli + ' (yalin: ' + yalin + ')');
  });

  test('tercih listesi motorun GERCEKTEN kullandigi adlardan uretiliyor', () => {
    // Arayuzde isaretlenebilen ama motorun hic gormedigi bir ad, kullaniciya
    // yalan soyleyen bir dugmedir.
    const havuz = J('nutHavuzBesinleri()');
    for (const slot of Object.keys(havuz)) {
      assert.ok(havuz[slot].length >= 6, slot + ': tercih listesi cok kisa');
      for (const ad of havuz[slot]) {
        assert.ok(J('!!nutFood(' + JSON.stringify(ad) + ')'),
          slot + ': ' + ad + ' TURK_FOODS\'ta yok');
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('2 — kalan makro onerisi', () => {
  const kur = (meals, hedef) => {
    E('ensureDiet(), 1');
    E('data.diet.kcalGoal=' + hedef.k + ',data.diet.proteinGoal=' + hedef.p +
      ',data.diet.carbGoal=' + hedef.c + ',data.diet.fatGoal=' + hedef.f + ',1');
    E('data.diet.days[today()] = ' + JSON.stringify({ meals, waterL: 0 }) + ', 1');
    E('_dietDate = null, 1');
  };
  const HEDEF = { k: 3544, p: 138, c: 510, f: 106 };
  const YARIM = [
    { id: 1, slot: 'kahvalti', name: 'Yulaf', kcal: 1500, protein: 60, carb: 250, fat: 30 },
    { id: 2, slot: 'ogle', name: 'Pilav', kcal: 1444, protein: 33, carb: 200, fat: 45 },
  ];

  test('acik varken oneri uretiliyor ve acigi KUCULTUYOR', () => {
    setTercih({ diyet: 'yok', sevmem: [], favori: [] });
    kur(YARIM, HEDEF);
    const o = J('nutOner(3)');
    assert.ok(o.length >= 1, 'acik 600 kcal ama oneri yok');
    for (const x of o) {
      assert.ok(x.puan > 0, x.n + ': puan pozitif degil');
      assert.ok(Math.abs(x.kalan.k) < 600, x.n + ': acigi kucultmuyor');
    }
  });

  test('⚠️ TEK ONERI UYGULANABILIR OLMALI — porsiyon ve kalori tavani', () => {
    // Ilk olcumde saf makro puani \"3 porsiyon Adana kebap (1440 kcal)\"
    // uretti: matematik dogru, oneri uygulanamaz.
    setTercih({ diyet: 'yok', sevmem: [], favori: [] });
    for (const meals of [YARIM, [{ id: 1, slot: 'kahvalti', name: 'X', kcal: 900, protein: null, carb: null, fat: null }]]) {
      kur(meals, HEDEF);
      for (const x of J('nutOner(3)')) {
        assert.ok(x.adet * x.k <= 700,
          x.n + ': tek oneri ' + Math.round(x.adet * x.k) + ' kcal');
        if (/porsiyon|kase|kutu|dürüm|tabak|bardak|\*/i.test(x.u)) {
          assert.ok(x.adet <= 2, x.n + ': ' + x.adet + ' ' + x.u + ' — fazla');
        } else {
          assert.ok(x.adet <= 3, x.n + ': ' + x.adet + ' ' + x.u + ' — fazla');
        }
      }
    }
  });

  test('oneri gunluk kalori hedefini %8\'den fazla asmiyor', () => {
    setTercih({ diyet: 'yok', sevmem: [], favori: [] });
    kur(YARIM, HEDEF);
    for (const x of J('nutOner(3)')) {
      assert.ok(x.kalan.k >= -HEDEF.k * 0.08,
        x.n + ': hedefi ' + Math.round(-x.kalan.k) + ' kcal asiyor');
    }
  });

  test('sevmedigi besin ONERILMIYOR', () => {
    setTercih({ diyet: 'laktozsuz', sevmem: ['Schnitzel'], favori: [] });
    kur(YARIM, HEDEF);
    for (const x of J('nutOner(5)')) {
      assert.ok(!/schnitzel/i.test(x.n), 'sevmedigi oneriye girdi: ' + x.n);
      assert.ok(!/süt|yoğurt|peynir|ayran|kefir/i.test(x.n),
        'laktozsuz secili ama oneri: ' + x.n);
    }
  });

  test('gun dolduysa / hedef asildiysa oneri YOK', () => {
    setTercih({ diyet: 'yok', sevmem: [], favori: [] });
    kur([{ id: 1, slot: 'kahvalti', name: 'X', kcal: 3500, protein: 135, carb: 500, fat: 104 }], HEDEF);
    assert.deepStrictEqual(J('nutOner(3)'), []);
    kur([{ id: 1, slot: 'kahvalti', name: 'X', kcal: 3900, protein: 150, carb: 560, fat: 120 }], HEDEF);
    assert.deepStrictEqual(J('nutOner(3)'), []);
  });

  test('kullanicinin KENDI besini esit kosulda tabloyu yeniyor', () => {
    setTercih({ diyet: 'yok', sevmem: [], favori: [] });
    kur(YARIM, HEDEF);
    E('data.diet.customFoods = [{id:9,name:"Annemin köftesi",unit:"porsiyon",kcal:300,protein:28,carb:6,fat:18}], 1');
    const o = J('nutOner(3)');
    assert.strictEqual(o[0].n, 'Annemin köftesi',
      'kendi besini ilk sirada degil: ' + o.map((x) => x.n).join(', '));
    E('data.diet.customFoods = [], 1');
  });

  test('makro kapsami dusukse siralama protein tasiyani tercih ediyor', () => {
    // Kapsam dusukken puan yalniz kaloriye bakiyor ve ayni kaloriyi tasiyan
    // her sey berabere kaliyordu — ilk uce tatli giriyordu.
    setTercih({ diyet: 'yok', sevmem: [], favori: [] });
    kur([{ id: 1, slot: 'kahvalti', name: 'X', kcal: 900, protein: null, carb: null, fat: null }], HEDEF);
    const o = J('nutOner(3)');
    assert.ok(o.length, 'oneri yok');
    for (const x of o) {
      assert.ok((x.p / x.k) >= 0.05,
        'kapsam dusukken protein yogunlugu dusuk oneri: ' + x.n + ' (' + (x.p / x.k).toFixed(3) + ')');
    }
  });
});

// ---------------------------------------------------------------------------
describe('3 — protein dagilimi ana ogune agirlikli', () => {
  test('ana ogun capasi TAM PORSIYON (yarim somon donmuyor)', () => {
    setTercih({ diyet: 'yok', sevmem: [], favori: [] });
    const yarim = [];
    for (const tip of TIPLER) for (const idx of IDXLER) {
      for (const m of gun(tip, idx).meals) {
        if (!m.ana) continue;
        const c = m.items.find((x) => x.rol === 'p');
        if (c && /porsiyon/i.test(c.u) && c.adet < 1) yarim.push(tip + idx + ':' + c.adet + ' ' + c.n);
      }
    }
    assert.deepStrictEqual(yarim, []);
  });

  test('ana ogun proteini ara ogunden BUYUK', () => {
    setTercih({ diyet: 'yok', sevmem: [], favori: [] });
    const kotu = [];
    for (const tip of TIPLER) for (const idx of IDXLER) {
      const meals = gun(tip, idx).meals;
      const ana = meals.filter((m) => m.ana).map((m) => m.protein);
      const yan = meals.filter((m) => !m.ana).map((m) => m.protein);
      if (!ana.length || !yan.length) continue;
      if (Math.min.apply(null, ana) <= Math.max.apply(null, yan)) {
        kotu.push(tip + idx + ': ana ' + ana.join('/') + ' vs yan ' + yan.join('/'));
      }
    }
    assert.deepStrictEqual(kotu, []);
  });

  test('yag enerji payi DRI ergen tabaninin (%25) altina dusmuyor', () => {
    // 5 Eyl denetiminin \"kalan bilinen zayifligi\" buydu: 20 gunun 16'si
    // yag hedefinin altinda bitiyor, pay zaman zaman %24'e iniyordu.
    setTercih({ diyet: 'yok', sevmem: [], favori: [] });
    const kotu = [];
    for (const tip of TIPLER) for (const idx of IDXLER) {
      const g = gun(tip, idx);
      const pay = (g.ozet.gercek.fat * 9) / g.ozet.gercek.kcal;
      if (pay < 0.235) kotu.push(tip + idx + ': %' + Math.round(pay * 1000) / 10);
    }
    assert.ok(kotu.length <= 3, 'yag payi cok dusuk kalan gunler: ' + kotu.join(', '));
  });
});

test('kapat', () => { app.close(); });
