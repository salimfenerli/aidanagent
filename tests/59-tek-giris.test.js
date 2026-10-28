/**
 * 59 — TEK GİRİŞ KAPISI (11 Eki 2026, Faz 1)
 *
 * Salim: "otomatik olarak uygulamaya bilgilerin düşmesi — ele girme friction oluşturuyor".
 * Ölçüm: sohbet yalnız görev sayısını görüyordu, borsa sorusuna "çekemiyorum" dedi;
 * harcama/öğün/uyku/kilo için aracı yoktu.
 *
 * Kilitlenenler:
 *  - SAYI KODLA: tutar/kilo kodla çözülür (Türk biçimi), öğün kalorisi modelden HİÇ gelmez
 *    (besin veritabanından), saçma değer eylem üretmez
 *  - geçmiş tarih en fazla 7 gün, gelecek tarihli kayıt yok
 *  - [KAYITLAR] sayıları kod hesaplar (harcama/öğün/uyku/kilo/antrenman/biten görev)
 *  - KAPI: kartlar çizilir, Uygula ve "Hepsini uygula" veriyi yazar, tek Geri al hepsini geri alır
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const BLOK = W.slice(W.indexOf('// 🤖 SOHBET AJANI (5 Eki 2026)'), W.indexOf('// 🤖 SOHBET AJANI SONU'));
const ctx = { console, Date, JSON, Math, String, Array, Object, Set, Map, Error, Promise, Number, isNaN, memHeaders: () => ({}) };
vm.createContext(ctx);
vm.runInContext(BLOK + '\nthis.S = agentSanitizeActions; this.K = agentKayitlar; this.C = agentContext; this.P = AGENT_PROMPT;', ctx);
const js = (x) => JSON.parse(JSON.stringify(x));
const BUGUN = '2026-10-11';
const S = (calls) => js(ctx.S(calls, { today: BUGUN, taskIds: ['77'] }));

describe('temizleyici — yeni araçlar', () => {
  test('harcama: Türk biçimi tutar, kategori beyaz listesi, "dün"', () => {
    const a = S([
      { name: 'harcama_ekle', arguments: { tutar: '85', not: 'öğle yemeği', kategori: 'yemek' } },
      { name: 'harcama_ekle', arguments: { tutar: '1.250,50', not: 'telefon kılıfı', kategori: 'uydurma', tarih: '2026-10-10' } },
      { name: 'harcama_ekle', arguments: { tutar: 40 } },
    ]);
    assert.deepStrictEqual(a.map(x => [x.tl, x.kategori, x.tarih]), [[85, 'yemek', BUGUN], [1250.5, null, '2026-10-10'], [40, null, BUGUN]]);
  });
  test('🔒 harcama: 0, eksi, tavan üstü, sayısız → eylem YOK', () => {
    assert.deepStrictEqual(S(['0', '-50', '250000', 'bilmiyorum'].map(t => ({ name: 'harcama_ekle', arguments: { tutar: t } }))), []);
  });
  test('🔒 öğün: modelin kalorisi TAŞINMAZ; öğün beyaz listesi', () => {
    const a = S([{ name: 'ogun_ekle', arguments: { yemek: '3 yumurta', ogun: 'kahvalti', kcal: 9999, kalori: 9999 } },
      { name: 'ogun_ekle', arguments: { yemek: 'mercimek çorbası', ogun: 'gece_yarisi' } }, { name: 'ogun_ekle', arguments: { yemek: 'x' } }]);
    assert.strictEqual(a.length, 2);
    assert.deepStrictEqual(Object.keys(a[0]).sort(), ['ogun', 'tarih', 'type', 'yemek']);
    assert.strictEqual(a[1].ogun, null);
  });
  test('uyku: iki saatten süre kodla; yalnız süre; ikisi de yoksa YOK', () => {
    const a = S([
      { name: 'uyku_kaydet', arguments: { yatis: '23:30', kalkis: '7:00', saat: 99 } },
      { name: 'uyku_kaydet', arguments: { saat: '7,5' } },
      { name: 'uyku_kaydet', arguments: { yatis: '23:00' } },
      { name: 'uyku_kaydet', arguments: { saat: 30 } },
    ]);
    assert.deepStrictEqual(a.map(x => [x.yatis, x.kalkis, x.saat]), [['23:30', '07:00', 7.5], [null, null, 7.5]]);
  });
  test('kilo: upsertBody sınırları (20-500, yağ 3-70)', () => {
    const a = S([{ name: 'kilo_kaydet', arguments: { kg: '68,4', yag: '15' } }, { name: 'kilo_kaydet', arguments: { kg: '5' } }, { name: 'kilo_kaydet', arguments: { kg: '70', yag: '90' } }]);
    assert.deepStrictEqual(a.map(x => [x.kg, x.yag]), [[68.4, 15], [70, null]]);
  });
  test('🔒 tarih: gelecek ya da 7 günden eski → bugüne düşer', () => {
    const a = S([{ name: 'harcama_ekle', arguments: { tutar: '10', tarih: '2026-10-12' } }, { name: 'harcama_ekle', arguments: { tutar: '10', tarih: '2026-09-01' } },
      { name: 'harcama_ekle', arguments: { tutar: '10', tarih: '2026-10-04' } }]);
    assert.deepStrictEqual(a.map(x => x.tarih), [BUGUN, BUGUN, '2026-10-04']);
  });
  test('akşam tek mesajı: 6 farklı eylem birlikte geçer', () => {
    const a = S([
      { name: 'gorev_tamamla', arguments: { gorev_id: '77' } },
      { name: 'harcama_ekle', arguments: { tutar: '85', not: 'yemek' } },
      { name: 'harcama_ekle', arguments: { tutar: '40', not: 'otobüs' } },
      { name: 'uyku_kaydet', arguments: { saat: 7 } },
      { name: 'ogun_ekle', arguments: { yemek: '3 yumurta', ogun: 'kahvalti' } },
      { name: 'kilo_kaydet', arguments: { kg: '68' } },
    ]);
    assert.deepStrictEqual(a.map(x => x.type), ['gorev_tamamla', 'harcama_ekle', 'harcama_ekle', 'uyku_kaydet', 'ogun_ekle', 'kilo_kaydet']);
  });
});

describe('[KAYITLAR] — sayıyı kod hesaplar', () => {
  const D = {
    harcama: [{ d: '2026-10-11', tl: 85, kat: 'yemek' }, { d: '2026-10-10', tl: 40, kat: 'ulasim' }, { d: '2026-10-02', tl: 100, kat: 'yemek' }, { d: '2026-09-30', tl: 999, kat: 'diger' }],
    diet: { days: { '2026-10-11': { meals: [{ name: 'Yumurta ×3', kcal: 216 }, { name: 'Pilav', kcal: 300 }] }, '2026-10-09': { meals: [{ name: 'x', kcal: 1 }] } },
      weights: [{ date: '2026-10-01', kg: 68.1 }, { date: '2026-10-10', kg: 68.5 }] },
    sleep: [{ date: '2026-10-11', hours: 7, bedtime: '00:00', wake: '07:00' }, { date: '2026-10-10', hours: 8 }],
    hevy: { workouts: [{ date: '2026-10-08', title: 'Upper day', setCount: 13 }, { date: '2026-09-20', title: 'eski' }] },
    tasks: [{ text: 'Matematik ödevi', done: true, doneDate: '2026-10-10' }],
    settings: { harcamaLimit: 3000 },
  };
  const k = ctx.K(D, BUGUN);
  test('harcama: bugün / 7 gün (kategoriyle) / bu ay / limit', () => {
    assert.match(k, /HARCAMA: bugün 85 TL \(1 kalem\) · son 7 gün 125 TL \[yemek 85 TL, ulasim 40 TL\] · bu ay 225 TL \/ limit 3000 TL/);
  });
  test('öğün, uyku, kilo, antrenman, biten görev', () => {
    assert.match(k, /ÖĞÜN: bugün 2 kalem, 516 kcal/);
    assert.match(k, /son 7 günde kayıtlı gün: 2/);
    assert.match(k, /UYKU: son gece 2026-10-11 7 sa \(00:00-07:00\) · 7 gün ort\. 7\.5 sa \(2 gece\)/);
    assert.match(k, /KİLO: 68\.5 kg \(2026-10-10\)/);
    assert.match(k, /ANTRENMAN \(Hevy, son 7 gün\): 1 antrenman — 10-08 Upper day 13 set/);
    assert.match(k, /BİTEN GÖREV \(son 7 gün\): 1 — Matematik ödevi/);
  });
  test('boş veri çökmez, "kayıt yok" der; borsa YOK', () => {
    const b = ctx.K({}, BUGUN);
    assert.match(b, /HARCAMA: kayıt yok/);
    assert.match(b, /UYKU: son 7 günde kayıt yok/);
    assert.ok(!/borsa|hisse|portföy/i.test(b));
  });
  test('bağlama giriyor + saat var; prompt kuralları', () => {
    const c = ctx.C(D, BUGUN);
    assert.match(c, /\[KAYITLAR/);
    assert.match(ctx.P, /Sayı UYDURMA/);
    assert.match(ctx.P, /yalnız \[KAYITLAR\] bölümündeki HESAPLANMIŞ sayılarla/);
    assert.match(ctx.P, /Kilo\/vücut hakkında yorum, hedef ya da diyet önerisi YAPMA/);
  });
});

describe('KAPI — ajan.js kartları ve Uygula (PWA)', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'foods.js', 'harcama.js', 'ajan.js'] });
  after(() => A.close());
  const doc = A.window.document;
  const bugun = () => A.evalIn('today()');
  const kur = (actions) => {
    A.evalIn('data.chat = data.chat || []');
    A.window.__acts = actions;
    A.evalIn("data.chat.push({ role: 'assistant', content: 'Hazırladım', actions: window.__acts }); data.chat.length - 1");
    const mi = A.evalIn('ensureChat().length - 1');
    const slot = doc.createElement('div'); slot.className = 'chat-ajan'; slot.dataset.i = String(mi);
    doc.body.appendChild(slot);
    A.evalIn('renderChatActions()');
    return { mi, slot };
  };

  test('öğün kalorisi VERİTABANINDAN: "3 yumurta" → 216 kcal (modelin sayısı yok)', () => {
    const r = JSON.parse(JSON.stringify(A.evalIn("ajanYemekCoz('3 yumurta')")));
    assert.strictEqual(r.kcal, 216);
    assert.match(r.name, /Yumurta \(150g\)/);   // 25 Eki: gram esas
    const g = JSON.parse(JSON.stringify(A.evalIn("ajanYemekCoz('200 gr tavuk göğsü')")));
    assert.ok(g.kcal > 150 && g.kcal < 450, 'gram ölçeği: ' + g.kcal);
    assert.match(g.name, /\(200g\)/);
    const z = JSON.parse(JSON.stringify(A.evalIn("ajanYemekCoz('zxqw uydurma yemek')")));
    assert.strictEqual(z.kcal, null);
    assert.strictEqual(z.bilinmiyor, true);
  });

  test('kartlar çizilir; "Hepsini uygula" hepsini yazar, tek Geri al hepsini geri alır', () => {
    const t = bugun();
    const once = JSON.parse(JSON.stringify(A.evalIn('({ h: (data.harcama||[]).length, m: ((data.diet.days[today()]||{}).meals||[]).length, w: (data.diet.weights||[]).length })')));
    const uykuOnce = JSON.stringify(A.evalIn('sleepFor(today())'));   // fikstürde bugünün uykusu VAR — geri al onu geri getirmeli
    const { mi, slot } = kur([
      { type: 'harcama_ekle', tl: 85, not: 'öğle yemeği', kategori: null, tarih: t },
      { type: 'ogun_ekle', yemek: '3 yumurta', ogun: 'kahvalti', tarih: t },
      { type: 'uyku_kaydet', yatis: '23:30', kalkis: '07:00', saat: 7.5, tarih: t },
      { type: 'kilo_kaydet', kg: 68.4, yag: null, tarih: t },
    ]);
    const metin = slot.textContent;
    assert.match(metin, /Hepsini uygula \(4\)/);
    assert.match(metin, /Harcama: 85 ₺ · Yemek/);
    assert.match(metin, /Kahvaltı: Yumurta \(150g\)/);
    assert.match(metin, /~216 kcal/);
    assert.match(metin, /Uyku: 7,5 saat/);
    assert.match(metin, /Kilo: 68,4 kg/);
    assert.strictEqual(A.evalIn('(data.harcama||[]).length'), once.h, 'Uygula\'dan ÖNCE veri değişmez');

    let geriAl = null;
    A.window.showUndoToast = (m, fn) => { geriAl = fn; };
    A.evalIn('showUndoToast = window.showUndoToast');
    return A.evalIn('ajanApplyAll(' + mi + ')').then(() => {
      assert.strictEqual(A.evalIn('data.harcama.length'), once.h + 1);
      const h = JSON.parse(JSON.stringify(A.evalIn('data.harcama[data.harcama.length-1]')));
      assert.deepStrictEqual([h.tl, h.kat, h.d], [85, 'yemek', t]);
      const ogun = JSON.parse(JSON.stringify(A.evalIn('data.diet.days[today()].meals.slice(-1)[0]')));
      assert.deepStrictEqual([ogun.slot, ogun.kcal], ['kahvalti', 216]);
      const uyku = JSON.parse(JSON.stringify(A.evalIn('sleepFor(today())')));
      assert.deepStrictEqual([uyku.bedtime, uyku.wake, uyku.hours], ['23:30', '07:00', 7.5]);
      assert.strictEqual(A.evalIn("data.diet.weights.find(w => w.date === today()).kg"), 68.4);
      assert.match(slot.textContent, /✓ Uygulandı/);
      assert.ok(!/Hepsini uygula/.test(slot.textContent));
      // tek Geri al
      assert.strictEqual(typeof geriAl, 'function');
      geriAl();
      assert.strictEqual(A.evalIn('data.harcama.length'), once.h);
      assert.strictEqual(A.evalIn('(data.diet.days[today()].meals||[]).length'), once.m);
      assert.strictEqual(JSON.stringify(A.evalIn('sleepFor(today())')), uykuOnce, 'eski uyku kaydı aynen geri gelir');
      assert.strictEqual(A.evalIn('(data.diet.weights||[]).length'), once.w);
      assert.match(slot.textContent, /Hepsini uygula \(4\)/, 'geri alınca kartlar yeniden bekler');
    });
  });

  test('tek kart Uygula da çalışır; bilinmeyen yemek adıyla, kalorisiz kaydedilir', () => {
    const { mi, slot } = kur([{ type: 'ogun_ekle', yemek: 'zxqw anneannemin böreği', ogun: null, tarih: bugun() }]);
    assert.match(slot.textContent, /Kalori bilinmiyor/);
    assert.ok(!/Hepsini uygula/.test(slot.textContent), 'tek eylemde toplu düğme yok');
    return A.evalIn('ajanApply(' + mi + ', 0)').then(() => {
      const m = JSON.parse(JSON.stringify(A.evalIn('data.diet.days[today()].meals.slice(-1)[0]')));
      assert.strictEqual(m.kcal, null);
      assert.match(m.name, /anneannemin böreği/);
    });
  });

  test('kullanıcı metni kaçışlı', () => {
    const { slot } = kur([{ type: 'harcama_ekle', tl: 5, not: '<img src=x onerror=alert(1)>', kategori: null, tarih: bugun() }]);
    assert.ok(!slot.querySelector('img'));
  });
});
