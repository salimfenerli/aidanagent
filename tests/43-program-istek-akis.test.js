/**
 * 43 — SERBEST METIN KUTUSU: KULLANICI AKISI (21 Eyl 2026)
 *
 * 42 numarali dosya beyaz listeyi (saf fonksiyon) kilitliyor. Bu dosya ise
 * kutuyu GERCEK asistan.html icinde, bir kullanici gibi kullanir: yazar, cip
 * tiklar, "İsteğimi oku"ya basar, "Programı üret"e basar.
 *
 * Buradaki her test 21 Eylul'de kullanici gibi test edilirken bulunan bir
 * hatanin tekrarini engeller:
 *   · cift tik iki Pro cagrisi yapiyordu (iki fatura)
 *   · istek surerken kurulum kapatilinca cevap kayboluyor, toast "güncellendi" diyordu
 *   · kutuya yazip dogrudan "Programı üret"e basinca metin SESSIZCE yok sayiliyordu
 *   · ipucu "Program kur" diyordu, dugmenin adi "Programı üret"
 *   · yanlis AI cevabinin geri alinma yolu yoktu
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, fixture } = require('./helpers/load');

const bekle = (ms) => new Promise(r => setTimeout(r, ms || 20));

function ac(yanit) {
  const app = loadApp({ seed: fixture() });
  const w = app.window;
  const cagrilar = [];
  w.fetch = (url, opt) => {
    cagrilar.push(url);
    const y = typeof yanit === 'function' ? yanit() : yanit;
    if (y && y.then) return y;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(y || {}) });
  };
  app.evalIn('getSupaToken = async () => "tok";');
  app.evalIn('showToast = (m, t) => { (window.__toast = window.__toast || []).push((t || "") + ": " + m); };');
  app.evalIn('openProgramSetup()');
  const $ = (s) => w.document.querySelector(s);
  const yaz = (m) => { const t = $('#progAiReq'); t.value = m; t.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const tikla = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const uret = () => [...w.document.querySelectorAll('#programModal button')].find(b => /üret/i.test(b.textContent));
  return { app, w, $, yaz, tikla, uret, cagrilar, toast: () => w.__toast || [] };
}

describe('Kutu, gercek kurulum formunda', () => {
  test('cip tiklamak (yeniden cizim) yazilani silmez', () => {
    const k = ac({});
    k.yaz('haftada 4 gün');
    k.tikla([...k.w.document.querySelectorAll('.prog-chip')].find(b => /^4 gün$/.test(b.textContent)));
    assert.strictEqual(k.$('#progAiReq').value, 'haftada 4 gün');
    k.app.close();
  });

  test('ipucu dugmenin GERCEK adini soyluyor ("Programı üret")', () => {
    const k = ac({});
    const dugme = k.uret();
    assert.ok(dugme, 'uret dugmesi yok');
    const metin = k.$('#programSetupBody').textContent;
    assert.ok(/Programı üret/.test(metin), 'ipucu dugme adini yazmiyor');
    assert.ok(!/Program kur”/.test(metin), 'olmayan bir dugmeye yonlendiriyor');
    k.app.close();
  });

  test('cift tik TEK istek atar', async () => {
    let coz;
    const k = ac(() => new Promise(r => { coz = r; }));
    k.yaz('x');
    k.tikla(k.$('#progAiBtn'));
    k.tikla(k.$('#progAiBtn'));
    await bekle(10);
    assert.strictEqual(k.cagrilar.length, 1, 'iki Pro cagrisi = iki fatura');
    coz({ ok: true, status: 200, json: () => Promise.resolve({ ayar: {} }) });
    await bekle(20);
    k.app.close();
  });

  test('okuma surerken form yeniden cizilirse dugme mesgul kalir, bitince duzelir', async () => {
    let coz;
    const k = ac(() => new Promise(r => { coz = r; }));
    k.yaz('x');
    k.tikla(k.$('#progAiBtn'));
    await bekle(5);
    k.tikla([...k.w.document.querySelectorAll('.prog-chip')].find(b => /^4 gün$/.test(b.textContent)));
    assert.strictEqual(k.$('#progAiBtn').disabled, true);
    coz({ ok: true, status: 200, json: () => Promise.resolve({ ayar: {} }) });
    await bekle(20);
    assert.strictEqual(k.$('#progAiBtn').disabled, false);
    assert.strictEqual(k.app.evalIn('_progSetup.strengthDays'), 4, 'kullanicinin cip secimi ezildi');
    k.app.close();
  });

  test('istek surerken kurulum kapatilirsa cevap UYGULANMAZ ve bu soylenir', async () => {
    let coz;
    const k = ac(() => new Promise(r => { coz = r; }));
    k.yaz('x');
    k.tikla(k.$('#progAiBtn'));
    await bekle(5);
    k.app.evalIn('closeProgramSetup()');
    coz({ ok: true, status: 200, json: () => Promise.resolve({ ayar: { strengthDays: 5 } }) });
    await bekle(20);
    assert.ok(k.toast().some(t => /kapatıldığı/.test(t)), JSON.stringify(k.toast()));
    assert.ok(!k.toast().some(t => /değişti/.test(t)), 'kapali forma "değişti" dendi');
    k.app.close();
  });

  test('Ctrl+Enter gonderir, duz Enter gondermez', async () => {
    const k = ac({ ayar: { strengthDays: 2 } });
    k.yaz('2 gün');
    k.$('#progAiReq').dispatchEvent(new k.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await bekle(10);
    assert.strictEqual(k.cagrilar.length, 0);
    k.$('#progAiReq').dispatchEvent(new k.w.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await bekle(30);
    assert.strictEqual(k.cagrilar.length, 1);
    assert.strictEqual(k.app.evalIn('_progSetup.strengthDays'), 2);
    k.app.close();
  });
});

describe('Okutulmamis istek', () => {
  test('yazip dogrudan "Programı üret" -> ilk basista DURUR ve soyler, ikincide uretir', async () => {
    const k = ac({});
    k.yaz('haftada 4 gün');
    k.tikla(k.uret());
    await bekle();
    assert.ok(!k.app.evalIn('data.program'), 'okutulmamis istekle program uretildi');
    assert.ok(k.toast().some(t => /henüz okunmadı/.test(t)));
    k.tikla(k.uret());
    await bekle();
    assert.ok(k.app.evalIn('data.program'), 'ikinci basista kullanicinin karari uygulanmadi');
    k.app.close();
  });

  test('okutulmus istekle uyari CIKMAZ', async () => {
    const k = ac({ ayar: { strengthDays: 4 } });
    k.yaz('haftada 4 gün');
    k.tikla(k.$('#progAiBtn'));
    await bekle(30);
    k.tikla(k.uret());
    await bekle();
    const p = k.app.evalIn('data.program');
    assert.ok(p, 'program uretilmedi');
    assert.strictEqual(p.strengthDays, 4);
    assert.ok(!k.toast().some(t => /henüz okunmadı/.test(t)));
    k.app.close();
  });

  test('kutu bossa uyari CIKMAZ (kutuyu hic kullanmayan kullanici)', async () => {
    const k = ac({});
    k.tikla(k.uret());
    await bekle();
    assert.ok(k.app.evalIn('data.program'));
    k.app.close();
  });
});

describe('Geri al ve sonuc paneli', () => {
  test('Geri al AI’dan onceki ayarlara doner', async () => {
    const k = ac({ ayar: { strengthDays: 5, sessionMin: 90 } });
    k.yaz('5 gün 90 dk');
    k.tikla(k.$('#progAiBtn'));
    await bekle(30);
    assert.strictEqual(k.app.evalIn('_progSetup.strengthDays'), 5);
    const geri = [...k.w.document.querySelectorAll('.prog-ai-sonuc button')].find(b => /Geri al/.test(b.textContent));
    assert.ok(geri, 'Geri al dugmesi yok');
    k.tikla(geri);
    assert.strictEqual(k.app.evalIn('_progSetup.strengthDays'), 3);
    assert.strictEqual(k.app.evalIn('_progSetup.sessionMin'), 60);
    assert.strictEqual(k.$('#progAiReq').value, '5 gün 90 dk', 'geri al kullanicinin METNINI silmemeli');
    k.app.close();
  });

  test('hicbir sey degismediyse "değişti" denmez, Geri al cikmaz', async () => {
    const k = ac({ ayar: { strengthDays: 3 } });
    k.yaz('3 gün');
    k.tikla(k.$('#progAiBtn'));
    await bekle(30);
    assert.ok(k.toast().some(t => /zaten/.test(t)), JSON.stringify(k.toast()));
    assert.ok(!k.$('.prog-ai-sonuc button'), 'degisiklik yokken Geri al gosteriliyor');
    k.app.close();
  });

  test('AI metni HTML olarak islenmez', async () => {
    const k = ac({ ayar: {}, uygulanamayan: [{ istek: '<img src=x onerror=alert(1)>', sebep: '<b>x</b>' }], notlar: ['<script>1</script>'] });
    k.yaz('x');
    k.tikla(k.$('#progAiBtn'));
    await bekle(30);
    assert.ok(!k.w.document.querySelector('.prog-ai-sonuc img'));
    assert.ok(!k.w.document.querySelector('.prog-ai-sonuc script'));
    assert.ok(!k.w.document.querySelector('.prog-ai-sonuc b + b'));
    k.app.close();
  });
});
