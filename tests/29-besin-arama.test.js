/**
 * 29 — BESIN ARAMA + HIZLI EKLEME (2 Eyl 2026)
 *
 * NEDEN: "beslenme programina urun eklerken hep bir friction oluyor."
 * Olculdugunde iki ayri sebep cikti.
 *
 * 1) ARAMA SORGUNUN TAMAMINI ARIYORDU. Eslesme kosulu "sorgu dizesi adin
 *    icinde geciyor mu" idi; `yagsiz sut` HICBIR SEY bulmuyordu cunku ad
 *    "Sut (yagsiz)" — kelimeler var, SIRA yok. Tek harf hatasi (`yogrt`) da
 *    sonucu sifirliyordu. Iki durumda da kullanici buluttaki AI aramasina
 *    dusuyordu: oturum + ag + birkac saniye. Yani en sik yapilan is en yavas
 *    yoldan gidiyordu.
 * 2) EKLEME 4 DOKUNUSTU (modal -> yaz -> sonuca dokun -> "Ogune ekle") ve
 *    son iki dokunus arasinda porsiyon editoru listeyi kapatiyordu; arka
 *    arkaya kalem girmek her seferinde bastan aramayi gerektiriyordu.
 *
 * BU DOSYANIN SOZLESMELERI:
 * - Kelime bazli VE: her sorgu kelimesi eslesmeli, SIRA onemsiz.
 * - Yazim toleransi YALNIZ 4+ harfli kelimede. 3 harfte 'bal'/'dal'/'tal'
 *   birbirine 1 uzaklikta — orada tolerans gurultu uretir, kapali kalmali.
 * - Eslesmeyen sorgu BOS doner. "Bir sey goster" diye eslesmeyeni listelemek
 *   kullaniciya yanlis besini ekletir; hicbir sey gostermemek daha durust.
 * - Hizli ekleme modali KAPATMAZ ve GERI ALINABILIR olmali.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load');

const A = loadApp({ seed: {} });
const W = A.window;
W.Element.prototype.scrollIntoView = function () {};
after(() => { try { A.close(); } catch (_) {} });

const ara = (q, n) => A.evalIn(`seedFoodMatches(${JSON.stringify(q)}, ${n || 8}).map(f => f.n)`);
const ilk = (q) => (ara(q, 1)[0] || null);

describe('arama: kelime bazli VE (sira onemsiz)', () => {
  test('yagsiz/light varyantlar kendi adlariyla bulunur', () => {
    // ⚠️ ESKI MOTORUN DUSTUGU YER: "Süt (yağsız)" adinda iki kelime de var
    // ama sira ters; dize aramasi 0 sonuc veriyordu.
    assert.strictEqual(ilk('yağsız süt'), 'Süt (yağsız)');
    assert.strictEqual(ilk('yağsız yoğurt'), 'Yoğurt (yağsız)');
    assert.ok(ara('light peynir').length >= 2, 'light peynirler bulunamadi');
  });

  test('kelime sirasi degisince de bulunur', () => {
    assert.ok(ara('göğsü tavuk').includes('Tavuk göğsü'));
    assert.ok(ara('pirinç basmati').includes('Basmati pirinç'));
  });

  test('diyet isaretleyicileri birbirinin yerine gecer', () => {
    // "light yogurt" arayan "Yogurt (yagsiz)"i gormeli — her urune tek tek
    // takma ad yazmak yerine kural.
    assert.ok(ara('light yoğurt').some(n => /yağsız/.test(n)));
    assert.strictEqual(ilk('zero kola'), 'Kola (light)');
  });
});

describe('arama: yazim toleransi', () => {
  test('4+ harfli kelimede tek harf hatasi affedilir', () => {
    assert.ok(ara('yogrt').includes('Yoğurt'), 'yogrt -> Yoğurt bulunamadi');
    assert.strictEqual(ilk('protien tozu'), 'Protein tozu');
    assert.ok(ara('makrana').includes('Makarna'));
  });

  test('3 harfli kelimede tolerans KAPALI (bal/dal/tal ayrimi)', () => {
    // Acik olsaydi 'bal' yazan biri 'Dal'/'Tal' iceren her seyi gorurdu.
    const r = ara('bal', 10);
    assert.strictEqual(r[0], 'Bal', 'tam eslesme ilk sirada olmali');
    // 'bal' 3 harf: yalniz ICEREN adlar gelmeli, 1 harf uzaktakiler DEGIL
    assert.ok(!r.includes('Dal'), 'tolerans 3 harfte acilmis');
  });
});

describe('arama: takma adlar (yalniz aramada, ekranda yok)', () => {
  test('kullanicinin kendi kelimesiyle bulur', () => {
    assert.strictEqual(ilk('yumurta beyazı'), 'Yumurta akı');
    assert.strictEqual(ilk('jasmine'), 'Yasemin pirinç');
    assert.strictEqual(ilk('brown rice'), 'Esmer pirinç');
    assert.strictEqual(ilk('popcorn'), 'Mısır patlağı (yağsız)');
    assert.strictEqual(ilk('quinoa'), 'Kinoa');
  });

  test('takma ad EKRANDA gorunmez (yalniz eslesmede kullanilir)', () => {
    const f = A.evalIn(`TURK_FOODS.find(x => x.n === 'Yasemin pirinç')`);
    assert.ok(Array.isArray(f.a) && f.a.includes('jasmine'));
    // sonuc satiri ad + birim yazar, takma ad yazmaz
    assert.ok(!/jasmine/i.test(A.evalIn(`(function(){
      _seedMatches = seedFoodMatches('jasmine', 3);
      return _seedMatches.map((sf,i) => sf.n + ' ' + sf.u).join('|');
    })()`)));
  });
});

describe('arama: pirinc ailesi', () => {
  const PIRINCLER = ['Pirinç', 'Basmati pirinç', 'Yasemin pirinç', 'Esmer pirinç',
    'Kırmızı pirinç', 'Siyah pirinç', 'Yabani pirinç', 'Arborio pirinç',
    'Baldo pirinç', 'Osmancık pirinç', 'Sushi pirinci', 'Pirinç (çiğ)'];

  test('hepsi veritabaninda ve kendi adiyla bulunuyor', () => {
    for (const ad of PIRINCLER) {
      assert.ok(ara(ad, 3).includes(ad), ad + ' arama ile bulunamadi');
    }
  });

  test('"pirinç" yazinca PISMIS sade pirinc ilk sirada (cig degil)', () => {
    // Gunluge yazilan sey pismis porsiyondur; cig olcum istisna.
    assert.strictEqual(ilk('pirinç'), 'Pirinç');
  });

  test('esmer pirinc beyazdan dusuk kalorili (veri tutarliligi)', () => {
    const g = (n) => A.evalIn(`TURK_FOODS.find(x => x.n === ${JSON.stringify(n)})`);
    const beyaz = g('Pirinç'), esmer = g('Esmer pirinç');
    assert.ok(esmer.k / esmer.g < beyaz.k / beyaz.g, 'esmer pirinc daha kalorili cikti');
  });
});

describe('arama: eslesmeyen sorgu BOS doner', () => {
  test('anlamsiz sorgu hicbir sey dondurmez', () => {
    assert.strictEqual(ara('zzzqwx').length, 0);
  });
  test('VE sozlesmesi: kelimelerden biri tutmazsa sonuc yok', () => {
    assert.strictEqual(ara('tavuk çikolatası').length, 0);
  });
  test('miktar + birim ayiklanir, sonuc bozulmaz', () => {
    assert.ok(ara('150g tavuk göğsü').includes('Tavuk göğsü'));
    assert.ok(ara('2 dilim tam buğday ekmek').includes('Tam buğday ekmek'));
    assert.ok(ara('1 su bardağı pirinç').includes('Pirinç'));
  });
});

describe('hizli ekleme (+)', () => {
  const ogunler = () => {
    const d = A.evalIn('data').diet.days[W.today()];
    return (d && d.meals) || [];
  };

  test('+ 1 birimi dogrudan gunluge yazar', () => {
    W.openFoodModal('ogle');
    const once = ogunler().length;
    A.evalIn(`_seedMatches = seedFoodMatches('basmati', 3)`);
    W.quickAddSeed(0);
    const m = ogunler();
    assert.strictEqual(m.length, once + 1);
    const son = m[m.length - 1];
    assert.strictEqual(son.name, 'Basmati pirinç');
    assert.strictEqual(son.kcal, 190);
    assert.strictEqual(son.slot, 'ogle');
  });

  test('MODAL ACIK kalir + arama kutusu temizlenir (arka arkaya ekleme)', () => {
    W.openFoodModal('aksam');
    A.evalIn(`_seedMatches = seedFoodMatches('yumurta', 3)`);
    W.document.getElementById('foodSearchInput').value = 'yumurta';
    W.quickAddSeed(0);
    assert.ok(W.document.getElementById('foodModal').classList.contains('active'),
      'hizli ekleme modali kapatmis — arka arkaya ekleme imkansizlasir');
    assert.strictEqual(W.document.getElementById('foodSearchInput').value, '');
  });

  test('aramada yazilan miktar hizli eklemede de gecerli', () => {
    W.openFoodModal('kahvalti');
    W.document.getElementById('foodSearchInput').value = '2 haşlanmış yumurta';
    W.renderLocalMatches();
    const i = A.evalIn(`_seedMatches.findIndex(f => f.n === 'Haşlanmış yumurta')`);
    assert.ok(i >= 0, 'haslanmis yumurta sonuclarda yok');
    W.quickAddSeed(i);
    const son = ogunler().slice(-1)[0];
    assert.match(son.name, /×2$/);
    assert.strictEqual(son.kcal, 144);   // 72 × 2
  });

  test('geri alinabilir — yanlis dokunus kayit birakmaz', () => {
    W.openFoodModal('ara');
    const once = ogunler().length;
    A.evalIn(`_seedMatches = seedFoodMatches('kinoa', 2)`);
    W.quickAddSeed(0);
    assert.strictEqual(ogunler().length, once + 1);
    const btn = W.document.querySelector('#toastContainer .undo-btn');
    assert.ok(btn, 'geri al dugmesi yok — yanlis ekleme duzeltilemez');
    btn.click();
    assert.strictEqual(ogunler().length, once, 'geri al kaydi silmedi');
  });

  test('ayni milisaniyede iki ekleme catismaz (id benzersiz)', () => {
    // Catisirsa "geri al" yanlis kaydi siler.
    W.openFoodModal('ogle');
    A.evalIn(`_seedMatches = seedFoodMatches('pirinç', 5)`);
    W.quickAddSeed(0); W.quickAddSeed(0); W.quickAddSeed(0);
    const ids = ogunler().map(m => m.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'ogun id catismasi');
  });
});

describe('sonuc satiri: govde editoru acar, + dogrudan ekler', () => {
  test('her sonuc satirinda iki ayri eylem var', () => {
    W.openFoodModal('ogle');
    W.document.getElementById('foodSearchInput').value = 'pirinç';
    W.renderLocalMatches();
    const satir = W.document.querySelector('#foodLocal .food-row');
    assert.ok(satir, 'food-row sarmalayicisi yok');
    assert.ok(satir.querySelector('.food-result'), 'govde dugmesi yok');
    const q = satir.querySelector('.food-quick');
    assert.ok(q, 'hizli ekle dugmesi yok');
    assert.ok(/hızlı ekle/i.test(q.getAttribute('aria-label') || ''), 'erisilebilir ad yok');
  });

  test('dokunma alani 44px (iOS kurali)', () => {
    const css = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'styles.css'), 'utf8');
    const blok = /\.food-quick \{([^}]*)\}/.exec(css);
    assert.ok(blok, '.food-quick stili yok');
    assert.match(blok[1], /min-height:\s*44px/);
  });
});

/**
 * Asagidaki blok, uygulamayi KULLANICI GIBI adim adim deneyerek bulunan
 * friction'lari kilitler. Hepsi "calisiyordu ama kullanilmiyordu" sinifi:
 * kod hatasi degil, akis hatasi. Bu yuzden birim testi yakalamiyordu.
 */
describe('friction: klavyeden cikmadan ekleme', () => {
  const ogunler = () => {
    const d = A.evalIn('data').diet.days[W.dietKey()];
    return (d && d.meals) || [];
  };

  test('Enter YEREL ilk sonucu ekler — buluta GITMEZ', () => {
    // ⚠️ ESKI DAVRANIS: onkeydown -> aiFoodSearch(), yani Enter DOGRUDAN
    // buluta gidiyordu; aradigin sey yerel listede dururken bile. Bulut
    // girisi yoksa uyari bile veriyordu. "yaz + Enter" en dogal hareket ve
    // en yavas yola bagliydi.
    W.openFoodModal('ogle');
    A.evalIn(`window.__bulut = 0; window.__aiEski = aiFoodSearch; aiFoodSearch = function(){ window.__bulut++; };`);
    const once = ogunler().length;
    W.document.getElementById('foodSearchInput').value = 'basmati';
    W.renderLocalMatches();
    W.foodSearchEnter();
    assert.strictEqual(ogunler().length, once + 1, 'Enter eklemedi');
    assert.strictEqual(ogunler().slice(-1)[0].name, 'Basmati pirinç');
    assert.strictEqual(A.evalIn('window.__bulut'), 0, 'Enter buluta gitti');
  });

  test('yerel sonuc YOKSA Enter buluta duser (cikis yolu kapanmaz)', () => {
    W.document.getElementById('foodSearchInput').value = 'zzzqwx';
    W.renderLocalMatches();
    W.foodSearchEnter();
    assert.strictEqual(A.evalIn('window.__bulut'), 1);
    A.evalIn('aiFoodSearch = window.__aiEski;');
  });
});

describe('friction: sifir sonucta bos ekran birakma', () => {
  test('bulunamayan sorguda ne oldugu + iki cikis yolu yazili', () => {
    // Once HICBIR SEY yazmiyordu: kullanici uygulamanin dondugunu mu yoksa
    // besinin olmadigini mi anlayamiyordu.
    W.openFoodModal('ogle');
    W.document.getElementById('foodSearchInput').value = 'zzzqwx';
    W.renderLocalMatches();
    const kutu = W.document.querySelector('#foodLocal .food-none');
    assert.ok(kutu, 'sifir sonucta bos ekran birakiliyor');
    assert.match(kutu.textContent, /zzzqwx/);
    const btns = [...kutu.querySelectorAll('button')].map(b => b.textContent.trim());
    assert.deepStrictEqual(btns, ['Bulutta ara', 'Elle gir']);
  });

  test('"Elle gir" yazdigini TASIR (bir daha yazdirmaz)', () => {
    W.openFoodModal('ogle');
    W.document.getElementById('foodSearchInput').value = 'anneannemin mantisi';
    W.renderLocalMatches();
    W.document.querySelectorAll('#foodLocal .food-none-btns button')[1].click();
    assert.strictEqual(W.document.getElementById('foodPane-elle').style.display, 'block');
    assert.strictEqual(W.document.getElementById('mealName').value, 'anneannemin mantisi');
  });
});

describe('friction: "Son aramalar" olu ozellikti', () => {
  test('yerel/hizli ekleme de son aramalara yazar', () => {
    // pushRecentFood YALNIZ aiFoodSearch icinden cagriliyordu; yerel arama
    // yayginlasinca serit hic dolmaz oldu.
    A.evalIn(`data.diet.recentFoods = []; save();`);
    W.openFoodModal('kahvalti');
    W.document.getElementById('foodSearchInput').value = 'kinoa';
    W.renderLocalMatches();
    W.foodSearchEnter();
    assert.ok((A.evalIn('data.diet.recentFoods') || []).includes('kinoa'));
    assert.ok(W.document.querySelector('#foodRecent .freq-chip'), 'serit cizilmedi');
  });

  test('son arama cipi YEREL arar (ag beklemez)', () => {
    A.evalIn(`window.__bulut = 0; window.__aiEski = aiFoodSearch; aiFoodSearch = function(){ window.__bulut++; };`);
    W.recentFoodSearch('kinoa');
    assert.strictEqual(A.evalIn('window.__bulut'), 0, 'cip buluta gidiyor');
    assert.match(W.document.getElementById('foodLocal').textContent, /Kinoa/);
    A.evalIn('aiFoodSearch = window.__aiEski;');
  });
});

describe('friction: hangi gune / hangi ogune yaziyorum', () => {
  test('gecmis gunde modal basligi gunu SOYLER', () => {
    // dietDay() secili gunu kullaniyor: dune bakarken acilan modal dune
    // yaziyordu ama baslik yalniz "Kahvalti" diyordu.
    W.dietDateShift(-1);
    W.openFoodModal('ogle');
    assert.match(W.document.getElementById('foodModalSlot').textContent, /Öğle · Dün/);
    W.dietDateToday();
    W.openFoodModal('ogle');
    assert.strictEqual(W.document.getElementById('foodModalSlot').textContent, 'Öğle');
  });

  test('slot degisince baslik da degisir', () => {
    W.openFoodModal('kahvalti');
    W.document.querySelector('#mealSlotChips [data-slot="aksam"]').click();
    assert.strictEqual(W.document.getElementById('foodModalSlot').textContent, 'Akşam');
    assert.strictEqual(A.evalIn('_mealSlot'), 'aksam');
  });
});

describe('friction: arka arkaya ekleme', () => {
  test('toastlar yigilmaz — ekranda tek toast kalir', () => {
    W.openFoodModal('ogle');
    for (const q of ['pilav', 'kinoa', 'bulgur']) {
      W.document.getElementById('foodSearchInput').value = q;
      W.renderLocalMatches();
      W.foodSearchEnter();
    }
    assert.strictEqual(W.document.querySelectorAll('#toastContainer .toast').length, 1,
      'ust uste toast listeyi kapatiyor');
  });
});
