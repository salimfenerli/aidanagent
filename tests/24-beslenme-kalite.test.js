/**
 * 24 — BESLENME PLANI KALITESI (18 Agu 2026)
 *
 * Salim: "beslenme planı da yapabilsin, yine bilime uygun."
 * Motor denetlendi, bes gercek zayiflik cikti:
 *   1) YAG CAPASI YOKTU — yag hedefin %30 altinda kaliyor, acik
 *      karbonhidratla doluyordu (68 g / 97 g)
 *   2) Karbonhidrat capasi tek basina kalan kaloriyi kapatmak zorunda kalinca
 *      "5 muz" / "5 dilim ekmek" gibi ogunler cikiyordu
 *   3) 3200 kcal 4 ogune bolunuyordu — ogun basi 900 kcal, pratikte yenmez
 *   4) Karbonhidrat zamanlamasi METIN olarak yaziliyor ama makro dagilimi
 *      bunu YANSITMIYORDU
 *   5) Protein capasi ekleri dusuyordu ama karbonhidrat capasinin tasidigi
 *      proteini SAYMIYORDU — protein sistematik %20-48 fazla cikiyordu
 *
 * Ayrica mikro besin katmani hic yoktu (kalsiyum, demir, D vitamini, lif).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load.js');

const app = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'program.js', 'nutrition.js'] });
const E = (kod) => app.evalIn(kod);
const J = (kod) => JSON.parse(E('JSON.stringify(' + kod + ')'));

const PROF = "{sex:'male',age:16,height:178,weight:65}";
const gun = (kg, tip, hedef, idx) =>
  J(`(function(){const p={sex:'male',age:16,height:175,weight:${kg}};` +
    `const t=nutTargets(p,'${tip}','${hedef}');const g=nutBuildDay(t,${kg},${idx || 0});` +
    `return {t:t,meals:g,ozet:nutDaySummary(g,t,${kg})};})()`);

const KOMBINASYONLAR = [];
for (const kg of [45, 50, 55, 65, 75, 90]) {
  for (const hedef of ['koru', 'kas']) {
    for (const tip of ['rest', 'strength', 'fight', 'both']) {
      for (const idx of [0, 1]) KOMBINASYONLAR.push({ kg, hedef, tip, idx });
    }
  }
}

// ---------------------------------------------------------------------------
describe('1 — kapsam siniri korunuyor (motorun en onemli karari)', () => {
  test('kilo verme hedefi YOK', () => {
    const hedefler = J('Object.keys(NUT_PAL)');
    assert.ok(hedefler.length, 'PAL tablosu yok');
    const kod = E('String(nutTargets)');
    assert.ok(!/acik|deficit|kilo.?ver|zayifla/i.test(kod), 'nutTargets\'ta kalori acigi dali var');
  });

  test('hicbir kombinasyonda hedef BMR altina inmiyor', () => {
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      assert.ok(g.t.kcal >= g.t.bmr,
        k.kg + 'kg ' + k.tip + ': hedef ' + g.t.kcal + ' < BMR ' + g.t.bmr);
    }
  });

  test('yag hormonal saglik tabaninin altina inmiyor', () => {
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      assert.ok(!g.ozet.yagTabanAltinda,
        k.kg + 'kg ' + k.tip + ': yag ' + g.ozet.gercek.fat + ' g — taban 0.8 g/kg');
    }
  });
});

// ---------------------------------------------------------------------------
describe('2 — makro hedefi gercekten tutuyor', () => {
  test('REGRESYON: kalori sapmasi %10\'u gecmiyor', () => {
    // ⚠️ Neden %10 ve neden daha siki degil: 45 kg + 3100 kcal gibi kose
    // durumlarda (hafif sporcu, cift antrenmanli gun) sablonlardan kaloriyi
    // tam tutturmak, protein 2.5 g/kg tavanini asmadan MUMKUN DEGIL —
    // Turk karbonhidrat kaynaklari da protein tasiyor. Motor bu durumda
    // tavani korur, kaloriyi eksik birakir ve SAPMAYI KARTTA YAZAR.
    // Sessizce tavani asmak ya da sapmayi gizlemek daha kotu olurdu.
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      assert.ok(Math.abs(g.ozet.sapma.kcal) <= 10,
        k.kg + 'kg ' + k.hedef + '/' + k.tip + ': kalori %' + g.ozet.sapma.kcal + ' sapiyor');
    }
  });

  test('REGRESYON: yag hedefi karbonhidratla doldurulmuyor', () => {
    // Cikis noktasi: yag 68 g / hedef 97 g, aradaki fark karbonhidrata gidiyordu.
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      assert.ok(g.ozet.sapma.fat >= -25,
        k.kg + 'kg ' + k.tip + ': yag hedefin %' + Math.abs(g.ozet.sapma.fat) + ' altinda');
    }
  });

  test('karbonhidrat hedefi tutuyor', () => {
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      assert.ok(Math.abs(g.ozet.sapma.carb) <= 25,
        k.kg + 'kg ' + k.tip + ': karbonhidrat %' + g.ozet.sapma.carb + ' sapiyor');
    }
  });

  test('protein 2.5 g/kg TAVANINI belirgin sekilde asmiyor', () => {
    // Hedef (1.8-2.0) bir hedeftir, asilmasi zararli degil. Tavan farkli sey.
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      // ⚠️ Esik 2.5 DEGIL 2.9: sablonlarin sabit ekleri (peynir, ayran,
      // yogurt) hafif profillerde tek baslarina tavana yaklasiyor ve motor
      // bunu ogunden protein SILEREK cozmuyor — silerse tabak bozuluyor.
      // Asildiginda kartta yaziyor (proteinTavanAsildi), gizlenmiyor.
      assert.ok(g.ozet.proteinPerKg <= 2.9,
        k.kg + 'kg ' + k.tip + ': ' + g.ozet.proteinPerKg + ' g/kg protein');
    }
  });

  test('tavan asildiysa motor bunu RAPORLUYOR (sessiz kalmiyor)', () => {
    const kod = E('String(renderNutrition)');
    assert.ok(/proteinTavanAsildi/.test(kod), 'render tavan asimini gostermiyor');
    assert.ok(/sapma\.kcal/.test(kod), 'render gercek-hedef sapmasini gostermiyor');
  });
});

// ---------------------------------------------------------------------------
describe('3 — ogun pratikte uygulanabilir', () => {
  test('REGRESYON: hicbir kalem 4 porsiyonu gecmiyor ("5 muz" yok)', () => {
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      for (const m of g.meals) {
        for (const it of m.items) {
          assert.ok(it.adet <= 4,
            k.kg + 'kg ' + m.slot + ': ' + it.adet + '× ' + it.n);
        }
      }
    }
  });

  test('REGRESYON: her ogunde protein kaynagi var', () => {
    // "3 porsiyon pilav + salata" bir aksam yemegi degildir.
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      for (const m of g.meals) {
        assert.ok(m.protein >= 8,
          k.kg + 'kg ' + m.slot + ': ' + m.protein + ' g protein — proteinsiz ogun');
      }
    }
  });

  test('ana ogunde (ogle/aksam) protein CAPASI silinmiyor', () => {
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      for (const m of g.meals) {
        if (!m.ana) continue;
        const capa = m.items.filter((x) => x.rol === 'p');
        assert.strictEqual(capa.length, 1,
          k.kg + 'kg ' + m.slot + ': ana ogunde protein capasi yok');
      }
    }
  });

  test('SOZLESME: protein capasi sablonun en protein yogun kalemi', () => {
    // Ilk denemede 'ara' ogunune Kefir (6 g/bardak) capa yazilmisti ve motor
    // 90 kg profilde "4 bardak sut" uretti — 'kefir capasi' hatasinin aynisi.
    const rapor = J(`(function(){
      const out = [];
      for (const slot of Object.keys(NUT_TEMPLATES)) {
        for (const t of NUT_TEMPLATES[slot]) {
          const hepsi = [t.protein, t.carb, t.yag].concat(t.ek || [])
            .filter(Boolean).map(function(n){ return TURK_FOODS.find(function(f){ return f.n === n; }); })
            .filter(Boolean);
          const capa = TURK_FOODS.find(function(f){ return f.n === t.protein; });
          const enYogun = hepsi.slice().sort(function(a,b){ return b.p - a.p; })[0];
          out.push({ slot: slot, capa: t.protein, capaP: capa ? capa.p : -1,
                     yogunluk: capa ? Math.round((capa.p / capa.k) * 1000) / 1000 : 0,
                     enYogun: enYogun ? enYogun.n : null, enYogunP: enYogun ? enYogun.p : -1 });
        }
      }
      return out;
    })()`);
    for (const r of rapor) {
      assert.strictEqual(r.capa, r.enYogun,
        r.slot + ': capa ' + r.capa + ' (' + r.capaP + 'g) ama en yogun kalem ' +
        r.enYogun + ' (' + r.enYogunP + 'g)');
      // ⚠️ Olcu mutlak gram DEGIL, protein/kalori YOGUNLUGU. Yumurta 6 g
      // tasir ama 72 kcal'dir (0.083 g/kcal) — 3-4 adet yemek normaldir.
      // Kefir de 6 g tasir ama 100 kcal'dir (0.060): capayi hedefe gore
      // olceklemek "4 bardak kefir" uretir. Kiran esik yogunluktur.
      assert.ok(r.yogunluk >= 0.08,
        r.slot + ': capa ' + r.capa + ' protein yogunlugu ' + r.yogunluk +
        ' g/kcal — hedefe olceklenince porsiyon sisirir');
    }
  });

  test('adet birimli besinlerde yarim porsiyon yok', () => {
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      for (const m of g.meals) {
        for (const it of m.items) {
          if (!/adet|dilim|kase|bardak|kutu/i.test(it.u)) continue;
          assert.strictEqual(it.adet % 1, 0, m.slot + ': ' + it.adet + '× ' + it.n);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('4 — ogun sayisi ve zamanlama', () => {
  test('3000 kcal ustunde 5 ogun aciliyor', () => {
    assert.strictEqual(E('nutMealCount(2800)'), 4);
    assert.strictEqual(E('nutMealCount(3400)'), 5);
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      const beklenen = g.t.kcal > 3000 ? 5 : 4;
      assert.strictEqual(g.meals.length, beklenen,
        k.kg + 'kg ' + k.tip + ' (' + g.t.kcal + ' kcal): ' + g.meals.length + ' ogun');
    }
  });

  test('REGRESYON: karbonhidrat antrenmanin ETRAFINA kayiyor', () => {
    // Motor zamanlama kuralini metin olarak yaziyordu ama makro dagilimi
    // yansitmiyordu — her ogun ayni orani aliyordu.
    const din = J(`nutMealSplit(nutTargets(${PROF},'rest','kas'), 65)`);
    const ant = J(`nutMealSplit(nutTargets(${PROF},'strength','kas'), 65)`);
    const pay = (liste, slot) => {
      const t = liste.reduce((a, x) => a + x.carb, 0);
      const m = liste.find((x) => x.slot === slot);
      return m ? m.carb / t : 0;
    };
    assert.ok(pay(ant, 'ogle') > pay(din, 'ogle'),
      'antrenman gununde ogle ogununun karbonhidrat payi artmiyor');
    assert.ok(pay(ant, 'aksam') > pay(din, 'aksam'),
      'antrenman gununde aksam ogununun karbonhidrat payi artmiyor');
    assert.ok(pay(ant, 'kahvalti') < pay(din, 'kahvalti'),
      'antrenman uzagindaki ogunden karbonhidrat alinmamis');
  });

  test('antrenman gununde once/sonra ogunleri isaretli', () => {
    const g = gun(65, 'strength', 'kas', 0);
    const zamanlar = g.meals.map((m) => m.zaman).filter(Boolean);
    assert.ok(zamanlar.indexOf('once') >= 0, 'antrenman ONCESI ogun isaretli degil');
    assert.ok(zamanlar.indexOf('sonra') >= 0, 'antrenman SONRASI ogun isaretli degil');
  });

  test('dinlenme gununde zamanlama isareti YOK', () => {
    const g = gun(65, 'rest', 'kas', 0);
    for (const m of g.meals) {
      assert.ok(!m.zaman, 'dinlenme gununde ' + m.slot + ' antrenmana gore isaretlenmis');
    }
  });

  test('gun tipi kalorisi ayri — tek "aktivite seviyesi" yok', () => {
    const k = ['rest', 'strength', 'fight', 'both']
      .map((tip) => J(`nutTargets(${PROF},'${tip}','kas')`).kcal);
    for (let i = 1; i < k.length; i++) {
      assert.ok(k[i] > k[i - 1], 'gun tipleri arasinda kalori artmiyor: ' + k.join(' < '));
    }
  });
});

// ---------------------------------------------------------------------------
describe('5 — mikro besinler', () => {
  test('dort hedef tanimli ve yasa uygun', () => {
    const m = J('NUT_MICRO');
    const idler = m.map((x) => x.id).sort();
    assert.deepStrictEqual(idler, ['demir', 'dvit', 'kalsiyum', 'lif']);
    for (const mi of m) {
      assert.ok(mi.hedef && mi.neden && mi.porsiyon, mi.id + ': eksik alan');
      assert.ok(mi.kaynak.length >= 4, mi.id + ': yeterli kaynak yok');
    }
  });

  test('kalsiyum hedefi buyume donemine gore (1300 mg)', () => {
    const k = J('NUT_MICRO').find((x) => x.id === 'kalsiyum');
    assert.match(k.hedef, /1300/);
    assert.match(k.neden, /kemik/i);
  });

  test('SOZLESME: sayi HER ZAMAN kapsamiyla birlikte veriliyor', () => {
    // Kismi veriden uretilen bir toplam, kapsami yazilmadan gosterilirse
    // kullanici hayali bir acigi takviyeyle kapatmaya kalkar.
    const c = J('nutMicroCheck(nutBuildDay(nutTargets(' + PROF + ",'strength','kas'), 65, 0))");
    for (const x of c) {
      assert.strictEqual(typeof x.alinan, 'number', x.id + ': sayi yok');
      assert.strictEqual(typeof x.kapsam, 'number', x.id + ': kapsam yok');
      assert.strictEqual(typeof x.guvenilir, 'boolean', x.id + ': guvenilirlik bayragi yok');
    }
    const kod = E('String(renderNutrition)');
    assert.ok(/kapsam/.test(kod), 'render kapsami gostermiyor');
  });

  test('mikro besin tablosundaki her ad besin veritabaninda var', () => {
    const eksik = J(`Object.keys(NUT_MICRO_DATA).filter(function(n){
      return !TURK_FOODS.some(function(f){ return f.n === n; }); })`);
    assert.deepStrictEqual(eksik, [], 'veritabaninda olmayan besin: ' + eksik.join(', '));
  });

  test('mikro degerleri makul aralikta (yazim hatasi kapisi)', () => {
    const d = J('NUT_MICRO_DATA');
    for (const ad of Object.keys(d)) {
      const v = d[ad];
      assert.ok(v.ca >= 0 && v.ca <= 400, ad + ': kalsiyum ' + v.ca + ' mg/porsiyon');
      assert.ok(v.fe >= 0 && v.fe <= 10, ad + ': demir ' + v.fe + ' mg/porsiyon');
      assert.ok(v.d >= 0 && v.d <= 900, ad + ': D vitamini ' + v.d + ' IU/porsiyon');
      assert.ok(v.lif >= 0 && v.lif <= 15, ad + ': lif ' + v.lif + ' g/porsiyon');
    }
  });

  test('sablon besinlerinin tamami mikro tablosunda (kapsam %100)', () => {
    for (const k of KOMBINASYONLAR) {
      const g = gun(k.kg, k.tip, k.hedef, k.idx);
      const t = J('nutMicroTotals(' + JSON.stringify(g.meals) + ')');
      assert.strictEqual(t.kapsam, 100,
        k.kg + 'kg ' + k.tip + ': kapsam %' + t.kapsam + ' — eksik: ' + t.kapsanmayan.join(', '));
    }
  });

  test('kaynak adlarinin tamami besin veritabaninda var', () => {
    const eksik = J(`(function(){
      const out = [];
      for (const mi of NUT_MICRO) for (const k of mi.kaynak) {
        if (!TURK_FOODS.some(function(f){ return f.n === k; })) out.push(mi.id + '/' + k);
      }
      return out;
    })()`);
    assert.deepStrictEqual(eksik, [], 'veritabaninda olmayan kaynak: ' + eksik.join(', '));
  });

  test('ornek gunde kalsiyum kaynagi bulunuyor', () => {
    const c = J('nutMicroCheck(nutBuildDay(nutTargets(' + PROF + ",'strength','kas'), 65, 0))");
    const ca = c.find((x) => x.id === 'kalsiyum');
    assert.ok(ca.varMi, 'ornek gunde hic sut urunu yok');
  });

  test('D vitamininde doz karari hekime birakiliyor', () => {
    const d = J('NUT_MICRO').find((x) => x.id === 'dvit');
    assert.match(d.ipucu || '', /hekim/i);
    const supp = J('NUT_SUPP').dvit;
    assert.match(supp.uyari, /kan değeri|25\(OH\)D/i);
  });
});

// ---------------------------------------------------------------------------
describe('6 — takviye katmani', () => {
  const kontrol = (kg, tip, hedef, idx) =>
    J(`(function(){const p={sex:'male',age:16,height:175,weight:${kg}};` +
      `const t=nutTargets(p,'${tip}','${hedef}');` +
      `return nutMicroCheck(nutBuildDay(t,${kg},${idx || 0}));})()`);

  test('🔴 DEMIRDE ASLA TAKVIYE ONERILMIYOR', () => {
    // Fazla demir vucuttan atilamaz, karacigerde birikir. Ferritin ve
    // hemoglobin bakilmadan baslanmaz — motorun bunu bilmesine imkan yok.
    for (const k of KOMBINASYONLAR) {
      const c = kontrol(k.kg, k.tip, k.hedef, k.idx);
      const fe = c.find((x) => x.id === 'demir');
      assert.strictEqual(fe.takviye, null,
        k.kg + 'kg ' + k.tip + ': demir takviyesi onerilmis');
    }
    assert.strictEqual(J('NUT_SUPP').demir.ad, null, 'demir icin takviye adi tanimli');
    assert.match(J('NUT_SUPP').demir.uyari, /KAN DEĞERİ OLMADAN/);
  });

  test('demir acigi GIDAYLA kapatiliyor ve somut', () => {
    const c = kontrol(65, 'strength', 'kas', 0);
    const fe = c.find((x) => x.id === 'demir');
    assert.ok(/mg/.test(fe.gidaOnce), 'gida onerisi somut degil');
    assert.match(fe.uyari, /Ferritin|ferritin/);
  });

  test('SOZLESME: hedef tutuyorsa takviye ONERILMEZ (once gida)', () => {
    for (const k of KOMBINASYONLAR) {
      const c = kontrol(k.kg, k.tip, k.hedef, k.idx);
      for (const x of c) {
        if (!x.yeterli) continue;
        assert.strictEqual(x.takviye, null,
          k.kg + 'kg ' + x.ad + ': hedef tutuyor ama takviye onerilmis');
      }
    }
  });

  test('kapsam guvenilir degilse takviye ONERILMEZ', () => {
    // Hayali acik uretip takviye onermek, hic onermemekten kotu.
    const c = J(`nutMicroCheck([{ slot:'x', items:[
      { n:'Kola', adet:1, k:500, p:0, c:100, f:0 },
      { n:'Süt', adet:1, k:122, p:6, c:9, f:7 }]}])`);
    for (const x of c) {
      assert.ok(x.kapsam < 70, 'test kurgusu bozuk: kapsam %' + x.kapsam);
      assert.strictEqual(x.guvenilir, false, x.ad + ': dusuk kapsamda guvenilir denmis');
      assert.strictEqual(x.takviye, null, x.ad + ': dusuk kapsamda takviye onerilmis');
    }
  });

  test('gida + takviye toplami UST SINIRI gecmiyor', () => {
    for (const k of KOMBINASYONLAR) {
      const c = kontrol(k.kg, k.tip, k.hedef, k.idx);
      for (const x of c) {
        if (!x.takviye) continue;
        const mi = J('NUT_MICRO').find((y) => y.id === x.id);
        if (!mi.ustSinir) continue;
        assert.ok(x.alinan + x.takviye.doz <= mi.ustSinir,
          x.ad + ': gida ' + x.alinan + ' + takviye ' + x.takviye.doz + ' > ust sinir ' + mi.ustSinir);
      }
    }
  });

  test('D vitamini acigi gercek ve takviye oneriliyor', () => {
    // Gidadan 600 IU karsilamak pratikte zor — motor bunu gormeli.
    const c = kontrol(65, 'strength', 'kas', 0);
    const d = c.find((x) => x.id === 'dvit');
    assert.ok(!d.yeterli, 'D vitamini acigi gorulmemis');
    assert.ok(d.takviye, 'gercek acikta takviye onerilmemis');
    assert.ok(d.takviye.doz >= 600 && d.takviye.doz <= 1000, 'doz ' + d.takviye.doz);
    assert.match(d.takviye.nasil, /yağ/i, 'D3 yagda cozunur bilgisi yok');
  });

  test('her takviyede kanit seviyesi ve nasil alinacagi var', () => {
    const supp = J('NUT_SUPP');
    for (const id of Object.keys(supp)) {
      assert.ok(supp[id].kanit, id + ': kanit seviyesi yok');
      assert.ok(supp[id].oncelik, id + ': gida onceligi yazilmamis');
      assert.ok(supp[id].nasil, id + ': nasil alinacagi yok');
      assert.ok(supp[id].uyari, id + ': uyari yok');
    }
  });

  test('performans takviyeleri BILGI — motor plana koymuyor', () => {
    const ergo = J('NUT_ERGO');
    assert.ok(ergo.length >= 4, 'performans takviyesi listesi yetersiz');
    for (const e of ergo) {
      assert.match(e.kanit, /🟢|🟡|🔴/, e.ad + ': kanit seviyesi yok');
      assert.ok(e.not, e.ad + ': sinir notu yok');
    }
    // Ogun sablonlarina hicbir ergojenik girmemis olmali
    const sablonlar = JSON.stringify(J('NUT_TEMPLATES'));
    for (const e of ergo) {
      if (e.ad === 'Protein tozu') continue;   // o bir GIDA, sablonda olabilir
      assert.ok(sablonlar.indexOf(e.ad) < 0, e.ad + ' ogun sablonuna girmis');
    }
  });

  test('kafein icin ergende uyku uyarisi var', () => {
    const k = J('NUT_ERGO').find((x) => /Kafein/i.test(x.ad));
    assert.ok(k, 'kafein listede yok');
    assert.match(k.not, /uyku/i, 'kafeinde uyku uyarisi yok');
  });
});

// ---------------------------------------------------------------------------
describe('6 — determinizm ve dayaniklilik', () => {
  test('ayni girdi ayni plani verir', () => {
    const a = JSON.stringify(gun(65, 'strength', 'kas', 0).meals);
    const b = JSON.stringify(gun(65, 'strength', 'kas', 0).meals);
    assert.strictEqual(a, b, 'plan deterministik degil');
  });

  test('AI cagrisi YOK — hedefler kural tabanli', () => {
    const kod = E('String(nutTargets) + String(nutBuildDay) + String(nutMealSplit)');
    assert.ok(!/fetch|aidanPrompt|endpoint/i.test(kod), 'hedef hesabinda ag cagrisi var');
  });

  test('bos/bozuk profilde comuyor', () => {
    assert.strictEqual(E("nutTargets(null,'rest','kas')"), null);
    assert.strictEqual(E("nutTargets({weight:0},'rest','kas')"), null);
    assert.deepStrictEqual(J('nutMealSplit(null, 65)'), []);
  });

  test('sablon degistirince plan degisiyor ama kurallar bozulmuyor', () => {
    const a = gun(65, 'strength', 'kas', 0);
    const b = gun(65, 'strength', 'kas', 1);
    assert.notStrictEqual(JSON.stringify(a.meals), JSON.stringify(b.meals));
    assert.ok(Math.abs(b.ozet.sapma.kcal) <= 8, 'ikinci sablonda kalori sapiyor');
  });
});

test('kapat', () => { app.close(); });
