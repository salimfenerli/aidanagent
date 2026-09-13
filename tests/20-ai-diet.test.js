/**
 * 20 — AI BESLENME YAZICI (12 Agu 2026)
 *
 * ⚠️ BU DOSYANIN EN ONEMLI BOLUMU: GUVENLIK KAPISI.
 * Serbest metin kutusuna "zayiflamak istiyorum" yazilabilir. Worker prompt'u
 * bunu yasakliyor ama prompt bir RICADIR — model uyar ya da uymaz. Asil koruma
 * `nutAiValidate`: donen planin her gunu PWA'nin hesapladigi hedefle
 * karsilastirilir; BMR'nin altinda ya da hedefin %15 altinda kalan TEK bir gun
 * bile varsa PLANIN TAMAMI reddedilir ve hic kaydedilmez.
 *
 * Ikinci sozlesme: AI HEDEF BELIRLEMEZ, HEDEFI DOLDURUR. Kalori/makro sayilari
 * PWA'daki kural tabanli motordan gelir; worker'da BMR/PAL formulu YOKTUR.
 * Iki formul kaynagi olsaydi saglik raporu ile beslenme plani farkli sayilar
 * uretirdi (10 Agu'da tam bu yuzden hcBMR tek kaynaga indirilmisti).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const nutSrc = fs.readFileSync(path.join(ROOT, 'nutrition.js'), 'utf8');
const workerSrc = fs.readFileSync(path.join(ROOT, 'aidan-worker', 'worker.js'), 'utf8');

// Worker handler + JSON ayristiricinin kaynak metni (sozlesme testleri icin)
const HB = workerSrc.indexOf('async function handleDietPlanApi(');
const HE = workerSrc.indexOf('\n// Byte dizisi', HB);
assert.ok(HB > 0 && HE > HB, 'handleDietPlanApi worker.js\'te bulunamadi');
const handlerSrc = workerSrc.slice(HB, HE);

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function motor() {
  const core = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
  // 2 Eyl 2026: TURK_FOODS core.js'ten foods.js'e (tembel modul) tasindi.
  const foods = fs.readFileSync(path.join(ROOT, 'foods.js'), 'utf8');
  const i = foods.indexOf('const TURK_FOODS'), j = foods.indexOf('\n];', i) + 3;
  const slots = core.match(/const MEAL_SLOTS = \{[^}]*\};/)[0];
  // 30 Agu 2026: hcBMR ui.js'ten health.js'e tasindi (tembel modul).
  const ui = fs.readFileSync(path.join(ROOT, 'health.js'), 'utf8');
  const hb = ui.indexOf('function hcBMR('), he = ui.indexOf('\n}', hb) + 3;

  const ctx = {
    console, Date, Math, JSON, Number, String, Array, Object, Promise, isFinite,
    setTimeout, clearTimeout,
    document: { getElementById: () => null },
    escapeHtml: esc,
    save() { ctx._saved = (ctx._saved || 0) + 1; },
    showToast(msg, tip) { ctx._toasts.push({ msg, tip }); },
    ensureDiet() { ctx.data.diet = ctx.data.diet || {}; },
    getSupaToken: () => Promise.resolve('t'),
    fetch: () => { throw new Error('test ag istegi yapmamali'); },
    data: { diet: {}, program: null },
    _toasts: [],
  };
  vm.createContext(ctx);
  vm.runInContext(foods.slice(i, j) + '\n' + slots + '\n' + ui.slice(hb, he), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'program.js'), 'utf8'), ctx);
  vm.runInContext(nutSrc +
    '\n;globalThis.__N = { nutAiValidate, nutAiFacts, nutAiHtml, nutAiClear, nutDowLabel,' +
    ' nutTargets, nutWeek, nutProfile, ensureNutrition, NUT_AI_FLOOR, NUT_AI_PROTEIN_MIN,' +
    ' NUT_AI_REQ_MAX, NUT_AI_MAX_ITEMS, NUT_AI_ENDPOINT, nutAiIstek, nutAiIstekKaydet };', ctx);
  return Object.assign(ctx, ctx.__N);
}
const M = motor();

// 70 kg / 16 yas erkek icin gercek hedefler — uydurma sayi kullanilmiyor
const PROF = { sex: 'male', age: 16, height: 178, weight: 70 };
const HED = [];
for (let d = 0; d < 7; d++) {
  const t = M.nutTargets(PROF, d === 0 ? 'rest' : 'strength', 'koru');
  HED.push({
    dow: d, tip: d === 0 ? 'rest' : 'strength', etiket: '',
    kcal: t.kcal, protein: t.protein, carb: t.carb, fat: t.fat, bmr: t.bmr,
    taban: t.eaTaban, suL: t.waterL,
  });
}

/** Hedefi tam tutan gecerli plan uretir. */
function planYap(carpan) {
  const c = carpan == null ? 1 : carpan;
  return {
    gunler: HED.map(h => ({
      dow: h.dow,
      ogunler: [
        { ad: 'Kahvaltı', saat: '08:00', kalemler: ['3 adet yumurta'], kcal: Math.round(h.kcal * c * 0.25), protein: Math.round(h.protein * 0.25) },
        { ad: 'Öğle', saat: '12:30', kalemler: ['150 g tavuk'], kcal: Math.round(h.kcal * c * 0.30), protein: Math.round(h.protein * 0.30) },
        { ad: 'Akşam', saat: '19:30', kalemler: ['200 g kıyma'], kcal: Math.round(h.kcal * c * 0.30), protein: Math.round(h.protein * 0.30) },
        { ad: 'Atıştırma', saat: '16:00', kalemler: ['1 kase yoğurt'], kcal: Math.round(h.kcal * c * 0.15), protein: Math.round(h.protein * 0.15) },
      ],
    })),
    notlar: ['not'],
  };
}

// ---------------------------------------------------------------------------
describe('🔒 GÜVENLİK KAPISI — hedefin altındaki plan kaydedilmez', () => {
  test('hedefi tutan plan geçer', () => {
    const v = M.nutAiValidate(planYap(1), HED);
    assert.strictEqual(v.ok, true, v.red.join(' | '));
    assert.strictEqual(v.gunler.length, 7);
    assert.strictEqual(v.red.length, 0);
  });

  test('ENERJİ TABANININ altında kalan gün REDDEDİLİR', () => {
    // ⚠️ 20 Agu 2026: kapi BMR degil ENERJI MEVCUDIYETI tabani. BMR alti
    // olmayan bir gun de EA olarak bozulma bolgesinde olabilir — antrenman
    // harcamasi dusuldukten sonra geriye kalan onemli. IOC REDs: <30 kcal/kg
    // yagsiz kutle. Eski kapi gunde 600-1000 kcal'lik antrenman yukunu hic
    // gormuyordu.
    const p = planYap(1);
    p.gunler[1].ogunler = [{ ad: 'Tek öğün', kalemler: ['salata'], kcal: HED[1].taban - 200, protein: 40 }];
    const v = M.nutAiValidate(p, HED);
    assert.strictEqual(v.ok, false);
    assert.ok(/enerji taban/i.test(v.red.join(' ')),
      'sebep enerji tabanini soylemeli: ' + v.red.join(' | '));
  });

  test('⚠️ enerji tabanı BMR\'den YÜKSEK — antrenman günü yükü sayılıyor', () => {
    // Eski kapinin kacirdigi arali: BMR ustunde ama EA olarak bozulma
    // bolgesinde olan gun. Antrenman gununde taban BMR'yi asmali.
    const antrenman = HED[1];
    assert.ok(antrenman.taban > antrenman.bmr,
      'antrenman gunu tabani (' + antrenman.taban + ') BMR\'yi (' + antrenman.bmr + ') asmiyor');
  });

  test('hedefin %15 altı = gizli kalori açığı, REDDEDİLİR', () => {
    // BMR'nin USTUNDE ama hedefin altinda — "az degil, acik" hali
    const p = planYap(0.75);
    const v = M.nutAiValidate(p, HED);
    assert.strictEqual(v.ok, false);
    assert.ok(/kalori açığı/i.test(v.red.join(' ')), v.red.join(' | '));
    // Bu senaryonun BMR kapisiyla degil ACIK kapisiyla yakalandigi kanitlansin
    const g = p.gunler[1].ogunler.reduce((a, o) => a + o.kcal, 0);
    assert.ok(g > HED[1].bmr, 'kurgu hatali — bu gun zaten BMR altinda');
  });

  test('%5 sapma kabul edilir (motor da tam sayı tutturmuyor)', () => {
    assert.strictEqual(M.nutAiValidate(planYap(0.96), HED).ok, true);
  });

  test('TEK gün düşse bile PLANIN TAMAMI reddedilir — kısmi kayıt yok', () => {
    const p = planYap(1);
    p.gunler[4].ogunler.forEach(o => { o.kcal = Math.round(o.kcal * 0.5); });
    const v = M.nutAiValidate(p, HED);
    assert.strictEqual(v.ok, false, '6 gunu dogru 1 gunu ac plan gecti — kismi kayit tehlikeli');
    assert.strictEqual(v.red.length, 1);
  });

  test('düşük protein REDDETMEZ, uyarır', () => {
    const p = planYap(1);
    p.gunler[2].ogunler.forEach(o => { o.protein = Math.round(o.protein * 0.4); });
    const v = M.nutAiValidate(p, HED);
    assert.strictEqual(v.ok, true, 'protein eksigi plani reddetmemeli');
    assert.strictEqual(v.uyari.length, 1);
    assert.ok(/protein/i.test(v.uyari[0]));
  });

  test('bozuk sayı reddedilir, NaN sızmaz', () => {
    for (const kotu of ['abc', null, undefined, NaN, -500, Infinity]) {
      const p = planYap(1);
      p.gunler[3].ogunler[0].kcal = kotu;
      const v = M.nutAiValidate(p, HED);
      assert.strictEqual(v.ok, false, 'kotu deger gecti: ' + String(kotu));
      const s = JSON.stringify(v);
      assert.ok(!/NaN|null,"kcal"/.test(s.replace(/"[^"]*"/g, m => m)) || !/NaN/.test(s),
        'NaN sizdi: ' + String(kotu));
    }
  });

  test('boş / bozuk plan reddedilir', () => {
    for (const p of [null, {}, { gunler: [] }, { gunler: 'x' }, undefined]) {
      assert.strictEqual(M.nutAiValidate(p, HED).ok, false, JSON.stringify(p));
    }
  });

  test('tanınmayan gün reddedilir', () => {
    const p = planYap(1);
    p.gunler.push({ dow: 99, ogunler: [{ ad: 'x', kcal: 3000, protein: 100, kalemler: [] }] });
    assert.strictEqual(M.nutAiValidate(p, HED).ok, false);
  });

  test('öğünsüz gün reddedilir', () => {
    const p = planYap(1);
    p.gunler[0].ogunler = [];
    assert.strictEqual(M.nutAiValidate(p, HED).ok, false);
  });

  test('deterministik — aynı girdi aynı sonuç', () => {
    const a = JSON.stringify(M.nutAiValidate(planYap(1), HED));
    const b = JSON.stringify(M.nutAiValidate(planYap(1), HED));
    assert.strictEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
describe('depolama — plan localStorage\'ı şişirmez', () => {
  test('öğün başına kalem tavanı uygulanır', () => {
    const p = planYap(1);
    p.gunler[0].ogunler[0].kalemler = new Array(40).fill('1 adet yumurta');
    const v = M.nutAiValidate(p, HED);
    assert.strictEqual(v.ok, true);
    assert.strictEqual(v.gunler[0].ogunler[0].kalemler.length, M.NUT_AI_MAX_ITEMS);
  });

  test('uzun metin kırpılır', () => {
    const p = planYap(1);
    p.gunler[0].ogunler[0].kalemler = ['x'.repeat(500)];
    p.gunler[0].ogunler[0].ad = 'y'.repeat(500);
    const v = M.nutAiValidate(p, HED);
    assert.ok(v.gunler[0].ogunler[0].kalemler[0].length <= 90);
    assert.ok(v.gunler[0].ogunler[0].ad.length <= 60);
  });

  test('gün başına öğün sayısı sınırlı', () => {
    const p = planYap(1);
    const o = p.gunler[0].ogunler[0];
    p.gunler[0].ogunler = new Array(20).fill(null).map(() => ({ ...o, kcal: Math.round(HED[0].kcal / 20 * 20 / 20) }));
    // toplam hedefi tutsun diye kcal'i yeniden dagit
    p.gunler[0].ogunler.forEach(x => { x.kcal = Math.round(HED[0].kcal / 20); x.protein = Math.round(HED[0].protein / 20); });
    const v = M.nutAiValidate(p, HED);
    assert.ok(v.gunler[0].ogunler.length <= 8, 'ogun tavani yok');
  });
});

// ---------------------------------------------------------------------------
describe('fakt paketi — sayıyı PWA hesaplar', () => {
  test('profil yoksa null döner (uydurma profil YOK)', () => {
    M.data.diet = {};
    assert.strictEqual(M.nutAiFacts(), null);
  });

  test('profil varsa 7 günün hesaplanmış hedefi gider', () => {
    M.data.diet = { calc: { sex: 'male', age: 16, height: 178, weight: 70 } };
    const f = M.nutAiFacts();
    assert.ok(f && Array.isArray(f.hedefler));
    assert.strictEqual(f.hedefler.length, 7);
    for (const h of f.hedefler) {
      assert.ok(h.kcal > 0 && h.bmr > 0 && h.protein > 0, 'hedef eksik: ' + JSON.stringify(h));
      assert.ok(h.kcal >= h.bmr, 'hedef BMR altina inmis');
    }
    assert.ok(['koru', 'kas'].includes(f.hedef), 'ucuncu hedef sizmis');
  });
});

// ---------------------------------------------------------------------------
describe('render — XSS ve red şeridi', () => {
  test('AI metni kaçışsız basılmaz', () => {
    const n = { ai: { istek: '<img src=x onerror=alert(1)>', at: Date.now(), gunler: [
      { dow: 1, kcal: 3000, protein: 140, hedefKcal: 3000, hedefProtein: 140,
        ogunler: [{ ad: '<script>bad()</script>', saat: '', kcal: 3000, protein: 140, kalemler: ['<b>x</b>'] }] },
    ], uyari: [], notlar: ['<i>n</i>'] } };
    const h = M.nutAiHtml(n);
    assert.ok(!/<script>bad/.test(h), 'ogun adi kacisilmamis');
    assert.ok(!/<img\s/.test(h), 'istek metni kacisilmamis — canli etiket basildi');
    assert.ok(h.indexOf('&lt;b&gt;x&lt;/b&gt;') >= 0, 'kalem kacisilmamis');
  });

  test('reddedilen planın sebebi kullanıcıya yazılır', () => {
    const h = M.nutAiHtml({ aiRed: { at: Date.now(), istek: '', sebep: ['Salı: 1200 kcal — bazal metabolizmanın altında.'] } });
    assert.ok(/reddedildi/i.test(h));
    assert.ok(/bazal metabolizma/i.test(h));
    assert.ok(/kilo verme/i.test(h), 'kapsam siniri kullaniciya yazilmali');
  });

  test('plan yokken de kutu ve düğme var', () => {
    const h = M.nutAiHtml({});
    assert.ok(/id="nutAiReq"/.test(h) && /id="nutAiBtn"/.test(h));
    assert.ok(/maxlength="' \+ NUT_AI_REQ_MAX|maxlength="\d+"/.test(h));
  });
});

// ---------------------------------------------------------------------------
describe('mimari sözleşmeler — PWA', () => {
  test('kural tabanlı motor hâlâ AI\'sız (fetch motor bölümünde YOK)', () => {
    const kesim = nutSrc.indexOf('// AI BESLENME YAZICI');
    assert.ok(kesim > 0, 'AI bolumu isaretlenmemis');
    const motorSrc = nutSrc.slice(0, kesim);
    assert.ok(!/\bfetch\s*\(/.test(motorSrc),
      'hedef hesaplayan motor ag istegi yapiyor — deterministik olmali');
  });

  test('izinli TEK ağ isteği /diet-plan ucuna', () => {
    const cagrilar = nutSrc.match(/\bfetch\s*\(([^,)]*)/g) || [];
    assert.strictEqual(cagrilar.length, 1, 'beklenmeyen fetch: ' + cagrilar.join(' | '));
    assert.ok(/NUT_AI_ENDPOINT/.test(cagrilar[0]), cagrilar[0]);
    assert.ok(/\/diet-plan'/.test(nutSrc), 'endpoint adresi degismis');
  });

  test('istek metni tavanı hem gönderimde hem kutuda', () => {
    assert.ok(M.NUT_AI_REQ_MAX <= 800, 'tavan cok yuksek — her cagriya giriyor');
    assert.ok(/slice\(0, NUT_AI_REQ_MAX\)/.test(nutSrc), 'gonderimde kirpma yok');
    assert.ok(/maxlength="' \+ NUT_AI_REQ_MAX/.test(nutSrc), 'textarea tavani yok');
  });

  test('kullanıcı talimatları GÖNDERİLMEZ (makine sözleşmeli uç)', () => {
    const g = nutSrc.slice(nutSrc.indexOf('body: JSON.stringify({', nutSrc.indexOf('NUT_AI_ENDPOINT')));
    assert.ok(!/instructions/.test(g.slice(0, 400)),
      'JSON cikti sozlesmesini bozar — uslup talimati bu uca gitmemeli');
  });

  test('reddedilen plan mevcut planı silmez', () => {
    const i = nutSrc.indexOf('if (!v.ok)');
    const blok = nutSrc.slice(i, nutSrc.indexOf('return;', i));   // sadece red dali
    assert.ok(/n\.aiRed =/.test(blok));
    assert.ok(!/n\.ai = /.test(blok), 'red yolunda kayitli plan eziliyor');
  });
});

// ---------------------------------------------------------------------------
describe('mimari sözleşmeler — worker', () => {
  test('route bağlı', () => {
    assert.ok(/url\.pathname === '\/diet-plan'/.test(workerSrc));
    assert.ok(/return handleDietPlanApi\(request, env\)/.test(workerSrc));
  });

  test('auth zorunlu', () => {
    assert.ok(/verifyUser\(env, userToken\)/.test(handlerSrc));
    assert.ok(/allowUser\(env, user\)/.test(handlerSrc));
    assert.ok(/'unauthorized'/.test(handlerSrc) && /'forbidden'/.test(handlerSrc));
  });

  test('💸 maliyet kilidi — çıplak heavy YOK', () => {
    assert.ok(/aiTierForUser\(env, user, 'heavy'\)/.test(handlerSrc),
      'heavy hesap sahibine kilitlenmemis');
    assert.ok(!/tier:\s*'heavy'/.test(handlerSrc), 'ciplak heavy — baska kullanici fatura uretebilir');
  });

  test('worker HEDEF HESAPLAMAZ — BMR/PAL formülü yok', () => {
    for (const kat of ['17.686', '13.384', '6.25', '9.99', '1.75', 'Schofield', 'Mifflin']) {
      assert.ok(handlerSrc.indexOf(kat) < 0,
        'worker kendi BMR/PAL hesabini yapiyor (' + kat + ') — tek kaynak PWA motoru olmali');
    }
    assert.ok(/body\.hedefler/.test(handlerSrc), 'hedefler PWA\'dan alinmiyor');
  });

  test('hedefsiz istek reddedilir (uydurma hedefle plan yazılmaz)', () => {
    assert.ok(/if \(!hedefler\.length\) return jsonCors\(\{ error/.test(handlerSrc));
  });

  test('🔒 16 yaş güvenlik sınırları prompt\'ta', () => {
    const yasak = ['kilo verme', 'sıklet düşürme', 'Kalori açığı', 'aralıklı oruç',
      'Takviye', 'Vücut şekli', 'Teşhis koyma', 'ALTINDA gün yazmak YASAKTIR'];
    for (const y of yasak) {
      assert.ok(handlerSrc.indexOf(y) >= 0, 'prompt\'ta eksik yasak: ' + y);
    }
    assert.ok(/KURALLAR KAZANIR/.test(handlerSrc),
      'kullanici istegi guvenlik kurallarini ezebilir gorunuyor');
  });

  test('miktar zorunluluğu ve JSON sözleşmesi prompt\'ta', () => {
    assert.ok(/MİKTAR olmalı/.test(handlerSrc));
    assert.ok(/"gunler":\[\{"dow"/.test(handlerSrc), 'JSON sablonu yok');
    assert.ok(/json: true/.test(handlerSrc), 'responseMimeType JSON acilmamis');
  });

  test('kullanıcı talimatları ENJEKTE EDİLMEZ', () => {
    assert.ok(!/instructionsBlock|instructionsText/.test(handlerSrc),
      'makine sozlesmeli ucta uslup talimati JSON\'u bozar');
  });

  test('JSON ayrıştırıcı toleranslı ama uydurmuyor', () => {
    const b = workerSrc.indexOf('function parseDietPlanJson('), e = workerSrc.indexOf('\n}', b) + 2;
    const ctx = { JSON, String };
    vm.createContext(ctx);
    vm.runInContext(workerSrc.slice(b, e) + ';globalThis.f = parseDietPlanJson;', ctx);
    const f = ctx.f;
    assert.ok(f('```json\n{"gunler":[{"dow":1}]}\n```'), 'markdown cit tolere edilmiyor');
    assert.ok(f('İşte plan: {"gunler":[{"dow":1}]} umarim olur'), 'metin icindeki JSON bulunamadi');
    assert.strictEqual(f('{"gunler":"x"}'), null, 'gunler dizi degilken null donmeli');
    assert.strictEqual(f('bozuk'), null);
    assert.strictEqual(f(''), null);
    assert.strictEqual(f(null), null);
  });
});

// ---------------------------------------------------------------------------
describe('Impeccable — AI plan kartı', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const blok = css.slice(css.indexOf('.nut-ai {'), css.indexOf('BIST TEMEL TARAMA'));

  test('blok gerçekten var', () => assert.ok(blok.length > 400));

  test('yan-şerit yok, saf renk yok, gradyan/glass yok', () => {
    assert.ok(!/border-(left|right)\s*:\s*[2-9]/.test(blok));
    assert.ok(!/#fff\b|#000\b/i.test(blok));
    assert.ok(!/linear-gradient|backdrop-filter/.test(blok));
  });

  test('özel scrollbar yok, ease-out + reduced-motion var', () => {
    assert.ok(!/::-webkit-scrollbar/.test(blok));
    assert.ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(blok), 'ease-out yok');
    assert.ok(/prefers-reduced-motion/.test(blok));
  });

  test('satır sonları korunmuş', () => {
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'styles.css')).indexOf(Buffer.from('\r\n')), -1,
      'styles.css LF olmali');
    for (const f of ['nutrition.js', 'aidan-worker/worker.js', 'sw.js']) {
      const b = fs.readFileSync(path.join(ROOT, f));
      const lf = (b.toString('binary').match(/\n/g) || []).length;
      const crlf = (b.toString('binary').match(/\r\n/g) || []).length;
      assert.strictEqual(lf, crlf, f + ' CRLF olmali');
    }
  });
});

// ---------------------------------------------------------------------------
// 13 Eyl 2026 — KISITLARIN GERCEKTEN UYGULANMASI
//
// Salim: "ozel program kismina kisit yazdim ama duzenlemiyo, bi bug var."
// Uc ayri kusur cikti ve UCU DE ayni sonuca cikiyordu: yazdigi metin ya hic
// gitmiyor ya da AI icin baglayici degil.
//   1. istek prompt'ta "uslup/tercih" etiketiyle user mesajinin SONUNDAydi;
//      sistem promptundaki varsayilan kalip daha buyurgandi.
//   2. `nutAiReq` yalniz DOM'da duruyordu -> renderNutrition() cagiran her sey
//      yazilani siliyor, "Yeniden yaz" eski/bos istekle plan uretiyordu.
//   3. max_tokens 4000 + thinking:high -> 7 gunluk JSON ortasindan kesilebiliyordu.
// ---------------------------------------------------------------------------
describe('kişisel kısıtlar bağlayıcı', () => {
  test('istek prompt\'ta ZORUNLU girdi — "üslup/tercih" etiketi YOK', () => {
    assert.ok(!/üslup\/tercih/.test(handlerSrc),
      'istek hala uslup tercihi diye etiketli — varsayilan kalip onu eziyor');
    assert.ok(/KULLANICININ KISITLARI/.test(handlerSrc), 'kisit blogu yok');
    assert.ok(/BAĞLAYICI/.test(handlerSrc), 'kisitlarin baglayici oldugu yazmiyor');
    assert.ok(/KISIT KAZANIR/.test(handlerSrc),
      'kisit ile varsayilan kalip catistiginda hangisinin kazandigi yazmiyor');
  });

  test('🔒 güvenlik kuralları hâlâ kısıtın ÜSTÜNDE', () => {
    // Kisitlari baglayici yapmak, 16 yas kilitlerini gevsetmek DEGILDIR.
    assert.ok(/KURALLAR KAZANIR/.test(handlerSrc));
    assert.ok(/yalnız 1-5 numaralı güvenlik kuralları bunu ezer/.test(handlerSrc),
      'kisit blogunun ustunde guvenlik onceligi yazmiyor');
    assert.ok(/KISIT KALORİYİ DÜŞÜRMEZ/.test(handlerSrc),
      '"az yiyeyim" tipi bir kisit kaloriyi dusurebilir gorunuyor');
  });

  test('uygulanamayan kısıt ve kullanıcının sorusu sessiz geçmiyor', () => {
    assert.ok(/uygulamadığını/.test(handlerSrc) && /Sessizce yok sayma/.test(handlerSrc),
      'uygulanmayan kisit sessizce yok sayilabiliyor');
    assert.ok(/SORU varsa/.test(handlerSrc), 'kisit metnindeki soru cevapsiz kaliyor');
  });

  test('"uygulanan" alanı JSON sözleşmesinde ve PWA onu kırpıp saklıyor', () => {
    assert.ok(/"uygulanan":\[/.test(handlerSrc), 'JSON sablonunda uygulanan yok');
    assert.ok(/uygulanan: \(j\.plan && Array\.isArray\(j\.plan\.uygulanan\)/.test(nutSrc),
      'donen uygulanan listesi kaydedilmiyor');
    assert.ok(/slice\(0, 6\)\.map\(s => String\(s\)\.slice\(0, 160\)\)/.test(nutSrc),
      'depolama tavani yok — tek JSON blob sisebilir');
  });

  test('uygulanan listesi kartta görünüyor ve kaçışlı basılıyor', () => {
    const n = { ai: { at: Date.now(), gunler: [
      { dow: 1, tip: 'strength', kcal: 3000, protein: 150, hedefKcal: 3000, hedefProtein: 150, ogunler: [] },
    ], uygulanan: ['<img src=x onerror=alert(1)>', 'kahvaltı tek kalem'], uyari: [], notlar: [] } };
    const h = M.nutAiHtml(n);
    assert.ok(/uyguladıklarım/.test(h), 'uygulanan bloku cizilmiyor');
    assert.ok(/kahvaltı tek kalem/.test(h));
    assert.ok(!/<img\s/.test(h), 'uygulanan metni kacisilmamis');
  });
});

describe('istek kutusu kalıcı', () => {
  test('yazarken kaydediliyor (render kutuyu boşaltamaz)', () => {
    assert.ok(/oninput="nutAiIstekKaydet\(this\.value\)"/.test(nutSrc),
      'textarea yazileni kaydetmiyor — renderNutrition() metni siler');
    assert.ok(/n && n\.aiIstek != null \? n\.aiIstek/.test(nutSrc),
      'kutu kayitli metinden cizilmiyor');
  });

  test('gönderim kutuyu değil KAYITLI metni de okuyabiliyor', () => {
    const m = nutSrc.slice(nutSrc.indexOf('async function nutAiWrite()'));
    assert.ok(/const istek = nutAiIstek\(\);/.test(m.slice(0, 300)),
      'nutAiWrite hala yalniz DOM okuyor');
  });

  test('kaydedilen metin tavanı aşmıyor ve geri okunuyor', () => {
    M.data.diet = {};
    M.nutAiIstekKaydet('x'.repeat(5000));
    const n = M.ensureNutrition();
    assert.strictEqual(n.aiIstek.length, M.NUT_AI_REQ_MAX);
    assert.strictEqual(M.nutAiIstek().length, M.NUT_AI_REQ_MAX);
    M.nutAiIstekKaydet('  zeytin çıkar  ');
    assert.strictEqual(M.nutAiIstek(), 'zeytin çıkar');
  });
});

describe('PRO model — diyet planı', () => {
  test('PRO yalnız heavy katmanında geçiriliyor (maliyet kilidi)', () => {
    assert.ok(/const tier = aiTierForUser\(env, user, 'heavy'\)/.test(handlerSrc));
    assert.ok(/model: tier === 'heavy' \? geminiModelPro\(env\) : undefined/.test(handlerSrc),
      'model acik gecilirse aiTierForUser kilidi delinir');
  });

  test('secret yoksa PRO adı var ama diğer heavy çağrılar ETKİLENMİYOR', () => {
    assert.ok(/const GEMINI_MODEL_PRO_DEFAULT = '/.test(workerSrc));
    // geminiModelFor bilerek eski davranista: secret yoksa ucretsiz.
    assert.ok(/if \(t && t\.pro && env && \(env\.GEMINI_MODEL_PRO \|\| ''\)\.trim\(\)\) return/.test(workerSrc),
      'tum heavy cagrilar ucretliye cevrilmis — bu bir MALIYET karari, sessizce alinmaz');
  });

  test('düşünme bütçesi 7 günlük JSON\'u kesmiyor', () => {
    const m = handlerSrc.match(/max_tokens:\s*(\d+)/);
    assert.ok(m && Number(m[1]) >= 8192,
      'thinking:high cikis butcesini yer — plan ortasindan kesilir ve "okunabilir plan donmedi" hatasi cikar');
  });

  test('hangi modelin yazdığı kullanıcıya söyleniyor', () => {
    assert.ok(/res = \{ response: out\.text, model: usedModel \}/.test(workerSrc),
      'aiRun gercekten kullanilan modeli dondurmuyor');
    assert.ok(/jsonCors\(\{ plan, model: r\.model/.test(handlerSrc));
    const n = { ai: { at: Date.now(), model: 'gemini-3.5-pro', gunler: [
      { dow: 1, tip: 'strength', kcal: 3000, protein: 150, hedefKcal: 3000, hedefProtein: 150, ogunler: [] },
    ], uyari: [], notlar: [] } };
    assert.ok(/Pro model ile yazıldı/.test(M.nutAiHtml(n)));
    n.ai.model = 'gemini-3.5-flash';
    assert.ok(/ücretsiz model ile yazıldı/.test(M.nutAiHtml(n)),
      'PRO ucretsize dustugunde bu sessiz kaliyor');
  });
});
