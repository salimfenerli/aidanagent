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
