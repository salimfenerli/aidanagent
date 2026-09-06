/**
 * 30 — FRICTION: HIZLI GOREV GIRISI + OGUN MIKTARI + SIK YEDIKLERIN (6 Eyl 2026)
 *
 * Uygulama kullanici gibi gezilerek olculdu; uc ayri yerde ayni desen cikti:
 * MOTOR VARDI, KAPI YOKTU ya da KAPI YANLIS YERE ACILIYORDU.
 *
 * 1) TEKRAR EDEN GOREV. `repeat` alani motorda tam destekli (rozet + gun
 *    donumunde sifirlama, ui.js) ve ayrintili formda secilebiliyor; ama HIZLI
 *    giris bunu hic uretmiyordu. Dahasi "her sali kickboks" yazinca gun adi
 *    TARIH kuralina takiliyor, "her" kelimesi basliktda yetim kaliyor ve
 *    tekrar eden gorev SESSIZCE tek seferlige donuyordu → "her kickboks".
 *    Ayrica ay adiyla tarih ("5 eylul"), bosluklu "obur gun" ve "!" onceligi
 *    hic taninmiyordu; ucu de baslikta AYNEN kaliyordu.
 *
 * 2) OGUN DUZENLEME MIKTAR DUZENLEMESI DEGILDI. En sik duzenleme sebebi
 *    miktar; modalda ad + kcal + 3 makro vardi. "1 yumurta"yi 3'e cikarmak
 *    dort sayiyi elle hesaplamak + adin sonundaki eki elle duzeltmek demekti.
 *
 * 3) "SIK YEDIKLERIN" CHIP'I YANLIS OGUNE YAZIYORDU. `quickAddMeal` slotu
 *    kalemin GECMISINDEN aliyordu: kahvalti icin acilan modalda "Tavuk pilav"
 *    chip'ine basinca kayit AKSAM'a dusuyor ve hicbir uyari cikmiyordu.
 *    Ayni yol id catismasi (Date.now) ve geri alma eksigi de tasiyordu —
 *    arama yolunda duzeltilen her sey burada duzeltilmemisti.
 *
 * ⚠️ BU DOSYA KAPIYI OLCER, MOTORU DEGIL. Birim testi "parseQuickInput dogru
 * cikti veriyor" demek yetmez; asil soru kullanicinin o ciktiya ULASIP
 * ulasmadigi (bkz. 30 Agustos, "program kur" dugmesi 22 gun olu kaldi).
 * Bu yuzden testler quickCaptureSubmit / editMeal / chip TIKLAMASI uzerinden
 * gidiyor, ic fonksiyonlari dogrudan cagirarak degil.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { loadApp, iso } = require('./helpers/load');

const A = loadApp();
const W = A.window, D = W.document;
W.Element.prototype.scrollIntoView = function () {};
after(() => { try { A.close(); } catch (_) {} });

const veri = () => A.evalIn('data');
const yaz = (id, v) => { const e = D.getElementById(id); assert.ok(e, id + ' alani yok'); e.value = v; };

/** Hizli giris kutusuna yazip ekler; olusan gorevi dondurur (unshift → [0]). */
function hizliEkle(metin) {
  yaz('quickCapture', metin);
  W.quickCaptureSubmit();
  return veri().tasks[0];
}

describe('hizli giris: tekrar eden gorev', () => {
  test('"her gun" → daily, baslik temiz', () => {
    const t = hizliEkle('her gün 20 sayfa oku');
    assert.strictEqual(t.repeat, 'daily');
    assert.strictEqual(t.text, '20 sayfa oku');
  });

  test('"her sali" → weekly + ILK tarih, "her" yetim kalmaz', () => {
    // 🔴 REGRESYON: eskiden gun adi once TARIH kuralina takiliyordu; sonuc
    // "her kickboks" basligi + tekrarsiz tek gorev idi.
    const t = hizliEkle('her salı kickboks');
    assert.strictEqual(t.repeat, 'weekly');
    assert.strictEqual(t.text, 'kickboks');
    assert.ok(t.due, 'ilk tarih konmadi');
    assert.strictEqual(new Date(t.due + 'T00:00:00').getDay(), 2, 'ilk tarih sali degil');
    assert.ok(t.due > iso(0), 'ilk tarih gecmiste/bugun');
  });

  test('"hafta ici" → weekdays, saat de ayrisir', () => {
    const t = hizliEkle('hafta içi 07:00 kalk');
    assert.strictEqual(t.repeat, 'weekdays');
    assert.strictEqual(t.reminderTime, '07:00');
    assert.strictEqual(t.text, 'kalk');
  });

  test('"her hafta sonu" → weekends', () => {
    const t = hizliEkle('her hafta sonu temizlik');
    assert.strictEqual(t.repeat, 'weekends');
    assert.strictEqual(t.text, 'temizlik');
  });

  test('YALIN "hafta sonu" hala TARIH — eski sozlesme korunuyor', () => {
    // ⚠️ Tekrar kurali bunu yutmamali: "hafta sonu piknik" tek seferlik bir
    // plan; her hafta tekrarlayan bir goreve cevirmek kullanicinin demedigi
    // seyi yapmaktir.
    const t = hizliEkle('hafta sonu piknik');
    assert.strictEqual(t.repeat, null);
    assert.ok(t.due, 'tarih konmadi');
    assert.strictEqual(t.text, 'piknik');
  });

  test('tekrar GOREVE yaziliyor (kapi testi)', () => {
    // Motor degil kapi: quickCaptureSubmit alani gercekten dolduruyor mu.
    const t = hizliEkle('her gün su iç');
    assert.strictEqual(t.repeat, 'daily');
    const kayitli = veri().tasks.find(x => x.id === t.id);
    assert.strictEqual(kayitli.repeat, 'daily', 'kayitli gorevde repeat yok');
  });

  test('zihin bosalt → gorev cevriminde de tekrar korunur', () => {
    const d = veri();
    d.dumps = d.dumps || [];
    const when = Date.now() + 12345;
    d.dumps.push({ text: 'her gün esneme', when });
    W.dumpToTask(when);
    assert.strictEqual(veri().tasks[0].repeat, 'daily');
  });
});

describe('hizli giris: tarih ve oncelik', () => {
  test('ay adiyla tarih ("12 kasim")', () => {
    const t = hizliEkle('12 kasım veli toplantısı');
    assert.ok(/^\d{4}-11-12$/.test(t.due), 'due=' + t.due);
    assert.strictEqual(t.text, 'veli toplantısı');
  });

  test('yil yazilmadiginda 30 gunden fazla geride kalan tarih gelecek yila gider', () => {
    // "5 ocak" aralikta yazildiysa gelecek ocak kastedilir; ama DUN olan bir
    // tarih 364 gun ileri atilmamali — kacmis teslim tarihi de girilebilir.
    const bugun = new Date(iso(0) + 'T00:00:00');
    const t = hizliEkle('5 ocak yılbaşı ödevi');
    const y = parseInt(t.due.slice(0, 4), 10);
    const fark = Math.round((bugun - new Date(t.due + 'T00:00:00')) / 86400000);
    assert.ok(fark <= 30, 'gecmise 30 gunden fazla tarih kondu: ' + t.due);
    assert.ok(y === bugun.getFullYear() || y === bugun.getFullYear() + 1, 'yil=' + y);
  });

  test('bosluklu "obur gun" taniniyor', () => {
    const t = hizliEkle('öbür gün fizik');
    assert.strictEqual(t.due, iso(2));
    assert.strictEqual(t.text, 'fizik');
  });

  test('"!!" oncelik isareti basliktan cikar', () => {
    const t = hizliEkle('!! fizik testi');
    assert.strictEqual(t.priority, 'urgent');
    assert.strictEqual(t.text, 'fizik testi');
  });

  test('bitisik "!!" de taniniyor', () => {
    const t = hizliEkle('!!kargo al');
    assert.strictEqual(t.priority, 'urgent');
    assert.strictEqual(t.text, 'kargo al');
  });

  test('mevcut kurallar bozulmadi (yarin / saat / sure / kategori)', () => {
    const t = hizliEkle('yarın 16:30 2 saat matematik ödevi');
    assert.strictEqual(t.due, iso(1));
    assert.strictEqual(t.reminderTime, '16:30');
    assert.strictEqual(t.estimateMin, 120);
    assert.strictEqual(t.category, 'odev');
    assert.strictEqual(t.text, 'matematik ödevi');
  });
});

describe('ogun duzenleme: miktar', () => {
  const kur = (m) => {
    W.showTab('diet');
    const g = W.dietDay();
    g.meals = g.meals.filter(x => x.id !== m.id);
    g.meals.push(m);
    return m.id;
  };
  const al = (id) => W.dietDay(false).meals.find(x => x.id === id);
  const alan = (id) => D.getElementById(id).value;

  test('miktar alani modalda VAR (kapi testi)', () => {
    // Motor olmadan once kapi: alan yoksa asagidaki hicbir sey kullanilamaz.
    assert.ok(D.getElementById('editMealQty'), 'editMealQty alani yok');
    assert.ok(D.getElementById('editMealQtyUnit'), 'birim etiketi yok');
  });

  test('1 → 3: kcal ve UC makro birlikte olcekleniyor, ad "×3" oluyor', () => {
    const id = kur({ id: 90001, slot: 'kahvalti', name: 'Yumurta', kcal: 320, protein: 22, carb: 4, fat: 24, at: '08:00' });
    W.editMeal(id);
    assert.strictEqual(alan('editMealName'), 'Yumurta', 'ad alaninda ek kalmamali');
    assert.strictEqual(alan('editMealQty'), '1');
    yaz('editMealQty', '3'); W.editMealQtyChanged(); W.saveMealEdit();
    const m = al(id);
    assert.deepStrictEqual(
      { name: m.name, kcal: m.kcal, protein: m.protein, carb: m.carb, fat: m.fat },
      { name: 'Yumurta ×3', kcal: 960, protein: 66, carb: 12, fat: 72 });
  });

  test('mevcut "×2" okunur ve 1e dusurulunce ad sadelesir', () => {
    const id = kur({ id: 90002, slot: 'ogle', name: 'Pilav ×2', kcal: 600, protein: 12, carb: 110, fat: 8, at: '12:00' });
    W.editMeal(id);
    assert.strictEqual(alan('editMealName'), 'Pilav');
    assert.strictEqual(alan('editMealQty'), '2');
    yaz('editMealQty', '1'); W.editMealQtyChanged(); W.saveMealEdit();
    const m = al(id);
    assert.strictEqual(m.name, 'Pilav', 'x1 eki kalmamali');
    assert.strictEqual(m.kcal, 300);
    assert.strictEqual(m.carb, 55);
  });

  test('gram kipi: "(180g)" → 250g', () => {
    const id = kur({ id: 90003, slot: 'aksam', name: 'Tavuk (180g)', kcal: 300, protein: 54, carb: 0, fat: 8, at: '19:00' });
    W.editMeal(id);
    assert.strictEqual(D.getElementById('editMealQtyUnit').textContent, 'g');
    yaz('editMealQty', '250'); W.editMealQtyChanged(); W.saveMealEdit();
    const m = al(id);
    assert.strictEqual(m.name, 'Tavuk (250g)');
    assert.strictEqual(m.kcal, 417);
    assert.strictEqual(m.protein, 75);
  });

  test('artir/azalt dugmesi alani BOSALTMIYOR (virgul tuzagi)', () => {
    // 🔴 input[type=number] virgullu degeri GECERSIZ sayip alani bosaltir.
    // "3,5" yazilirsa miktar sifirlanir ve bir sonraki adim 0'dan baslar.
    const id = kur({ id: 90004, slot: 'kahvalti', name: 'Tost', kcal: 200, protein: 8, carb: 24, fat: 8, at: '09:00' });
    W.editMeal(id);
    W.editMealQtyStep(1);
    assert.strictEqual(D.getElementById('editMealQty').value, '1.5', 'yarim adimda alan bozuldu');
    assert.strictEqual(alan('editMealKcal'), '300');
    W.editMealQtyStep(-1);
    assert.strictEqual(D.getElementById('editMealQty').value, '1');
    W.closeMealEdit();
  });

  test('makrosu bilinmeyen kalemde makro UYDURULMAZ', () => {
    // Bilinmeyen 0 degildir: 2 x null hala null. (Gunluk zaten "—" gosteriyor.)
    const id = kur({ id: 90005, slot: 'atistirma', name: 'Elma', kcal: 80, protein: null, carb: null, fat: null, at: '15:00' });
    W.editMeal(id);
    yaz('editMealQty', '2'); W.editMealQtyChanged(); W.saveMealEdit();
    const m = al(id);
    assert.strictEqual(m.kcal, 160);
    assert.strictEqual(m.protein, null);
    assert.strictEqual(m.fat, null);
  });

  test('art arda ayar yuvarlama biriktirmez (taban birim uzerinden)', () => {
    const id = kur({ id: 90006, slot: 'kahvalti', name: 'Muz', kcal: 105, protein: 1, carb: 27, fat: 0, at: '10:00' });
    W.editMeal(id);
    for (const q of ['3', '7', '2', '1']) { yaz('editMealQty', q); W.editMealQtyChanged(); }
    W.saveMealEdit();
    const m = al(id);
    assert.strictEqual(m.kcal, 105, 'yuvarlama birikti');
    assert.strictEqual(m.name, 'Muz');
  });
});

describe('"sik yediklerin" chip yolu', () => {
  const chipler = () => [...D.querySelectorAll('#freqMeals .freq-chip')];

  test('chip SECILI ogune yazar, kalemin gecmisindeki oguna DEGIL', () => {
    // 🔴 REGRESYON: `slot: m.slot` — kahvalti icin acilan modalda aksam
    // gecmisli bir kalem eklenince kayit sessizce AKSAM'a dusuyordu.
    const g = W.dietDay();
    g.meals.push({ id: 91001, slot: 'aksam', name: 'Test Aksam Yemegi', kcal: 700, protein: 40, carb: 60, fat: 20, at: '19:30' });
    W.save();
    W.openFoodModal('kahvalti');
    const c = chipler().find(x => /Test Aksam Yemegi/.test(x.textContent));
    assert.ok(c, 'chip listede yok');
    const oncekiSayi = W.dietDay(false).meals.length;
    c.click();
    const eklenen = W.dietDay(false).meals[W.dietDay(false).meals.length - 1];
    assert.strictEqual(W.dietDay(false).meals.length, oncekiSayi + 1);
    assert.strictEqual(eklenen.slot, 'kahvalti', 'chip yanlis ogune yazdi');
    assert.strictEqual(eklenen.name, 'Test Aksam Yemegi');
  });

  test('chip eklemesi modali KAPATMAZ ve geri alinabilir', () => {
    // Arama yolundaki sozlesmenin aynisi: arka arkaya kalem girilebilmeli,
    // yanlis dokunus geri alinabilmeli (sessiz ekleme cift kayit uretir).
    W.openFoodModal('ogle');
    chipler()[0].click();
    assert.ok(D.getElementById('foodModal').classList.contains('active'), 'modal kapandi');
    const toastlar = [...D.querySelectorAll('#toastContainer .toast')];
    assert.strictEqual(toastlar.length, 1, 'toast yigildi ya da hic yok');
    assert.ok(/geri al/i.test(toastlar[0].textContent), 'geri alma sunulmuyor');
  });

  test('siralama secili ogune gore degisiyor', () => {
    // Tek genel liste "sik" kelimesini anlamsizlastiriyordu: kahvalti icin
    // acilan modalin en ustunde aksam yemegi duruyordu.
    W.openFoodModal('kahvalti');
    const kahv = chipler().map(c => c.textContent);
    W.openFoodModal('aksam');
    const aks = chipler().map(c => c.textContent);
    assert.ok(kahv.length && aks.length, 'chip uretilmedi');
    assert.notDeepStrictEqual(kahv, aks, 'slot degisince sira hic degismedi');
  });

  test('slot cipini degistirmek listeyi yeniler', () => {
    W.openFoodModal('kahvalti');
    const once = D.querySelector('#freqMeals .freq-head').textContent;
    const sc = D.querySelector('#mealSlotChips [data-slot="aksam"]');
    assert.ok(sc, 'slot cipi yok');
    sc.click();
    const sonra = D.querySelector('#freqMeals .freq-head').textContent;
    assert.notStrictEqual(once, sonra, 'baslik/siralama slotla guncellenmedi');
  });

  test('arka arkaya iki chip eklemesinde id CATISMIYOR', () => {
    // 🔴 Date.now() ayni ms'de iki kayit uretebiliyordu; geri alma o zaman
    // YANLIS kaydi siliyordu. _mealId() bunun icin var.
    W.openFoodModal('atistirma');
    const c = chipler();
    c[0].click(); c[0].click();
    const ms = W.dietDay(false).meals;
    const son2 = ms.slice(-2);
    assert.notStrictEqual(son2[0].id, son2[1].id, 'iki kayit ayni id aldi');
  });
});
