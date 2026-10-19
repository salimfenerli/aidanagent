/**
 * 61 — FAZ 2: TEK "BUGÜN" KARTI (13 Eki 2026)
 *
 * Değerlendirme (11 Eki): Görevler sekmesi 3,2 ekran / 105 düğme; "Şu an ne yapayım?"
 * ikinci ekranda; sohbet (tek giriş kapısı) yalnız hamburger menüde.
 *
 * Kilitlenenler:
 *  - ŞU AN / SIRADA Haftam çekirdeğinden (hfGun) + gün planından — kendi takvim hesabı yok
 *  - aynı saatte Haftam + plan bloğu tekrar görünmez; biten plan bloğu "şu an" sayılmaz
 *  - gün bitince SIRADA = uyku, uyku da geçtiyse yarının ilk bloğu
 *  - KAPI: kart en üstte, Bugünün 3'ü hemen altında, eski kalabalık "Ayrıntılar"da (silinmedi),
 *    "Aidan'a yaz / Günü kapat" sohbeti açar, görev değişince kart güncellenir
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const SRC = readText('bugun.js').replace(/\r\n/g, '\n');
const saf = SRC.slice(SRC.indexOf('/* ---------- saf hesap'), SRC.indexOf('/* ---------- ekran'));
const ctx = { Math, Number, String, Array, Object, JSON };
vm.createContext(ctx);
vm.runInContext(saf + '\nthis.O = bugunOzet;', ctx);
const js = (x) => JSON.parse(JSON.stringify(x));

// Sahte Haftam çekirdeği: okul 09:00-17:00, antrenman 18:00-19:30, yatış 23:00, kalkış 07:00
const gun = (d, tarih) => ({
  bloklar: tarih === 'YARIN' ? [{ tur: 'okul', label: 'Okul', bas: 540, bit: 1020 }]
    : [{ tur: 'okul', label: 'Okul', bas: 540, bit: 1020 }, { tur: 'antrenman', label: 'Upper day', bas: 1080, bit: 1170 }],
  antrenman: tarih === 'YARIN' ? null : { ad: 'Upper day', bas: 1080, bit: 1170, agir: false },
  yatis: 1380, kalk: 420, sinav: [],
});
const D = {
  tasks: [{ text: 'Mat', due: '2026-10-13', estimateMin: 45 }, { text: 'Fizik', due: '2026-10-12' }, { text: 'Kimya', due: '2026-10-15' }, { text: 'bitti', due: '2026-10-13', done: true }],
  dayPlan: { date: '2026-10-13', blocks: [
    { label: 'Okul', start: '09:00', end: '17:00' },                    // Haftam'la aynı → tekrar YOK
    { label: 'Mat ödevi', start: '20:00', end: '20:45' },
    { label: 'Erken iş', start: '17:10', end: '17:40', done: true },    // bitti → şu an sayılmaz
  ] },
  diet: { kcalGoal: 2600, days: { '2026-10-13': { meals: [{ kcal: 500 }, { kcal: 300 }, { kcal: null }] } } },
  harcama: [{ d: '2026-10-13', tl: 85 }, { d: '2026-10-13', tl: 40.5 }, { d: '2026-10-12', tl: 999 }],
  sleep: [{ date: '2026-10-13', hours: 7.5 }],
};
const O = (dk) => js(ctx.O(D, '2026-10-13', dk, gun, 'YARIN'));

describe('bugunOzet — saf hesap', () => {
  test('okul saatinde: ŞU AN okul, SIRADA antrenman', () => {
    const o = O(600);
    assert.strictEqual(o.simdi.ad, 'Okul');
    assert.strictEqual(o.sirada.ad, 'Upper day');
    assert.strictEqual(o.siradaYarin, false);
  });
  test('biten plan bloğu şu an sayılmaz; arada serbest, sırada antrenman', () => {
    const o = O(1030);
    assert.strictEqual(o.simdi, null);
    assert.strictEqual(o.sirada.ad, 'Upper day');
  });
  test('aynı saatteki Haftam + plan bloğu tekrar görünmez; plan bloğu sıraya girer', () => {
    const o = O(1175);
    assert.strictEqual(o.sirada.ad, 'Mat ödevi');
  });
  test('gün bitince SIRADA uyku; uyku geçtiyse yarının ilk bloğu', () => {
    assert.strictEqual(O(1300).sirada.ad, 'Uyku');
    const g = O(1400);
    assert.strictEqual(g.sirada.ad, 'Okul');
    assert.strictEqual(g.siradaYarin, true);
    assert.strictEqual(g.uykuSaati, true);
  });
  test('ödev (bugün + gecikmiş, bitmemiş), öğün, harcama, uyku, antrenman', () => {
    const o = O(600);
    assert.deepStrictEqual(o.odev, { n: 2, dk: 75, gecikmis: 1 });
    assert.strictEqual(o.kcal, 800);
    assert.strictEqual(o.kcalHedef, 2600);
    assert.strictEqual(o.harcama, 125.5);
    assert.strictEqual(o.uyku, 7.5);
    assert.strictEqual(o.antrenman.ad, 'Upper day');
  });
  test('Haftam yoksa da çökmez (yalnız plan blokları)', () => {
    const o = js(ctx.O(D, '2026-10-13', 1210, null, null));
    assert.strictEqual(o.simdi.ad, 'Mat ödevi');
    assert.strictEqual(o.antrenman, null);
    const bos = js(ctx.O({}, '2026-10-13', 600, null, null));
    assert.deepStrictEqual(bos.odev, { n: 0, dk: 0, gecikmis: 0 });
  });
});

describe('KAPI — Görevler sekmesinin tepesi', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'hafta.js', 'bugun.js'] });
  after(() => A.close());
  const doc = A.window.document;
  A.evalIn('renderBugun()');

  test('kart en üstte, Bugünün 3\'ü hemen altında', () => {
    const kids = [...doc.getElementById('tasks').children];
    assert.strictEqual(kids[0].id, 'bugunKart');
    // 19 Eki: arada öğün kartı (ogun.js; planda saatli öğün yoksa gizli) — Bugünün 3'ü onun altında
    assert.strictEqual(kids[1].id, 'bugunOgun');
    assert.ok(kids[2].classList.contains('mit-box'));
    assert.match(doc.getElementById('bugunKart').textContent, /ŞU AN/);
  });
  test('eski kalabalık SİLİNMEDİ, "Ayrıntılar"a taşındı (id\'ler duruyor)', () => {
    const det = doc.getElementById('bugunAyrinti');
    assert.ok(det && det.tagName === 'DETAILS' && !det.open);
    for (const id of ['nowCard', 'dailyScore', 'capacityBar', 'eveningSummary']) {
      const el = doc.getElementById(id);
      assert.ok(el, id + ' silinmemeli');
      assert.ok(det.contains(el), id + ' Ayrıntılar\'da olmalı');
    }
    assert.strictEqual(doc.querySelectorAll('#bugunAyrinti').length, 1, 'ikinci çizimde tekrar taşınmaz');
    A.evalIn('renderBugun()');
    assert.strictEqual(doc.querySelectorAll('#bugunAyrinti').length, 1);
  });
  test('ana düğme sohbeti açar (tek giriş kapısı artık menüde saklı değil)', () => {
    const btn = [...doc.querySelectorAll('#bugunKart button')].find(b => /Aidan'a yaz|Günü kapat/.test(b.textContent));
    assert.ok(btn, 'sohbet düğmesi kartta olmalı');
    btn.click();
    assert.ok(doc.getElementById('chat').classList.contains('active'), 'sohbet paneli açılmalı');
    assert.match(doc.getElementById('chatInput').placeholder, /Örn:/);
    A.evalIn("showTab('tasks', document.querySelector('[data-tab=tasks]'))");
  });
  test('"Şu an ne yapayım?" kartta', () => {
    assert.ok([...doc.querySelectorAll('#bugunKart button')].some(b => /Şu an ne yapayım/.test(b.textContent)));
  });
  test('görev eklenince kart güncellenir (renderTasks sarmalı)', () => {
    const once = doc.getElementById('bugunKart').textContent;
    A.evalIn("data.tasks.push(makeTask({ text: 'Yeni ödev', due: today(), estimateMin: 20 })); renderTasks();");
    const sonra = doc.getElementById('bugunKart').textContent;
    assert.notStrictEqual(once, sonra);
    assert.match(sonra, /Ödev\d+ iş/);
  });
  test('kullanıcı metni kaçışlı', () => {
    A.evalIn("data.dayPlan = { date: today(), blocks: [{ id: 1, label: '<img src=x onerror=alert(1)>', start: '00:00', end: '23:59', kind: 'task' }] }; renderBugun();");
    assert.ok(!doc.querySelector('#bugunKart img'));
  });
});
