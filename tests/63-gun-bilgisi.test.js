/**
 * 63 — GÜN BİLGİSİ: ADLI DERS / KURS (14 Eki 2026)
 *
 * Salim: "Pazartesi-Çarşamba 17:30-18:30 matematik dersim var". Kurs bloğu hep
 * "Ek ders / kurs" yazıyordu → Bugün kartında / Haftam'da / sohbette ne olduğu belli değildi.
 *
 * Kilitlenenler:
 *  - diet.nut.duzen.ders[dow].ad blok adına geçer (hafta.js + worker ikizi aynı satır)
 *  - adsız eski kayıt "Ek ders / kurs" kalır
 *  - beslenme ekranından saat düzenlenince ad SİLİNMEZ
 */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'hafta.js'] });
after(() => A.close());

test('adlı ders blok adına geçer, adsız eski kayıt değişmez', () => {
  A.evalIn(`data.diet.nut = data.diet.nut || {}; data.diet.nut.duzen = { ders: {
    '1': { bas: '17:30', bit: '18:30', ad: 'Matematik' }, '3': { bas: '17:30', bit: '18:30' } } };`);
  // 2026-10-12 Pazartesi, 2026-10-14 Çarşamba
  const pzt = JSON.parse(A.evalIn("JSON.stringify(hfGun(data, '2026-10-12').bloklar)"));
  const car = JSON.parse(A.evalIn("JSON.stringify(hfGun(data, '2026-10-14').bloklar)"));
  assert.ok(pzt.some(b => b.tur === 'ders' && b.label === 'Matematik' && b.bas === 1050 && b.bit === 1110));
  assert.ok(car.some(b => b.tur === 'ders' && b.label === 'Ek ders / kurs'));
});

test('worker ikizi aynı satırı taşır', () => {
  const satir = "if (kurs) ekle('ders', kurs.ad ? String(kurs.ad).slice(0, 40) : 'Ek ders / kurs', hfDk(kurs.bas), hfDk(kurs.bit));";
  assert.ok(readText('hafta.js').includes(satir));
  assert.ok(readText('aidan-worker/worker.js').includes(satir));
});

test('beslenme ekranında saat düzenlenince ad korunur', () => {
  assert.match(readText('nutrition.js'), /d\.ders\[String\(dow\)\] = Object\.assign\(\{\}, d\.ders\[String\(dow\)\], \{ bas: nutSaat\(b\), bit: nutSaat\(e\) \}\)/);
});

test('sohbete gelen ödev listesi görseli odev_plani aracına yönlendirilir', () => {
  const W = readText('aidan-worker/worker.js');
  assert.match(W, /Görsel bir ÖDEV LİSTESİ ise[^']*odev_plani aracıyla TEK pakette/);
  assert.match(W, /const agentOn = !metaMode;/);   // görselli mesajda da araçlar açık
});

// 14 Eki — Salim: "perşembe günleri ödev listeni paylaş diye de hatırlatsın"
const { describe } = require('node:test');
const vm = require('vm');
describe('belirli günlü hatırlatıcı (her Perşembe ödev listesi)', () => {
  const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
  const kur = (isoUtc) => {
    const sabit = Date.parse(isoUtc);
    const FakeDate = class extends Date { constructor(...a) { super(...(a.length ? a : [sabit])); } static now() { return sabit; } };
    const giden = [];
    const c = { Math, Number, String, Array, Object, JSON, console, Date: FakeDate, TR_OFFSET_MS: 3 * 3600000,
      trToday: () => new Date(sabit + 3 * 3600000).toISOString().slice(0, 10),
      trDate: (n) => new Date(sabit + 3 * 3600000 + n * 86400000).toISOString().slice(0, 10),
      sendPushToAll: async (env, d, p) => { giden.push(p); }, logPush: () => {}, saveUserData: async () => {} };
    vm.createContext(c);
    const kaynak = W.slice(W.indexOf('async function runFixedRemindersForUser('), W.indexOf('\n}\n', W.indexOf('async function runFixedRemindersForUser(')) + 3);
    vm.runInContext(kaynak + '\nthis.R = runFixedRemindersForUser;', c);
    return { c, giden };
  };
  const rem = () => ({ id: 1, time: '20:00', label: 'Ödev listesi', days: [4], msg: 'Bu haftanın ödev mesajını Aidan sohbetine yapıştır.', url: '/?ac=sohbet' });
  test('Perşembe 20:00 atar, sohbeti açar; Çarşamba atmaz', async () => {
    let k = kur('2026-10-15T17:02:00Z');   // Perşembe 20:02 TR
    await k.c.R({}, { userId: 'u', data: { reminders: [rem()] } });
    assert.strictEqual(k.giden.length, 1);
    assert.strictEqual(k.giden[0].url, '/?ac=sohbet');
    assert.match(k.giden[0].message, /ödev mesajını/);
    k = kur('2026-10-14T17:02:00Z');       // Çarşamba
    await k.c.R({}, { userId: 'u', data: { reminders: [rem()] } });
    assert.strictEqual(k.giden.length, 0);
  });
  test('🔒 dış adres bildirime girmez', async () => {
    const k = kur('2026-10-15T17:02:00Z');
    await k.c.R({}, { userId: 'u', data: { reminders: [Object.assign(rem(), { url: 'https://kotu.example' })] } });
    assert.strictEqual(k.giden[0].url, undefined);
  });
});
