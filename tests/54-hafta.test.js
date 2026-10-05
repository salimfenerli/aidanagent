/**
 * 54 — HAFTAM: OKUL + SPOR + BESLENME + UYKU TEK RESİMDE (5 Eki 2026)
 *
 * Salim: "hayatımın ana odakları okul, spor, beslenme — bunları bir bütün
 * olarak inceleyip programlamalı". Takvim iki yerdeydi (diet.nut.duzen ↔
 * fixedSchedule); ödev dağıtımı okul saatini, sınavları ve antrenmanı bilmiyordu.
 *
 * Kilitlenenler:
 *  - hafta.js ↔ worker.js çekirdeği BİREBİR ikiz ve SAF
 *  - Salim'in gerçek düzeniyle gün resmi (okul, kurs, antrenman, yatış, kapasite)
 *  - çapraz kurallar: sınav+ağır antrenman, sınav haftası, ödev aşımı, geç seans; yanlış alarm yok
 *  - ödev dağıtımı kapasiteye göre (salı dolu → boş güne)
 *  - gün planı okul/kurs/antrenmanı meşgul sayar (iki tarafta)
 *  - sohbet ajanı, sabah brifingi, Pazar push'u aynı çekirdeği kullanır
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText, extractDecl, normalize } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const HJ = readText('hafta.js');
const WK = readText('aidan-worker/worker.js');
const IKIZ = ['HAFTA_KURAL', 'hfDk', 'hfSaat', 'hfEkle', 'hfGun', 'hfOdevYuk', 'hfCakismalar', 'hfGunTipi', 'hfPlanBloklari'];

function cekirdek() {
  const ctx = { Date, JSON, Math, String, Array, Object, Number, isNaN };
  vm.createContext(ctx);
  vm.runInContext(IKIZ.map(n => extractDecl(HJ.replace(/\r\n/g, '\n'), n)).join('\n') + '\n' +
    IKIZ.filter(n => n !== 'HAFTA_KURAL').map(n => `this.${n} = ${n};`).join(' ') + ' this.K = HAFTA_KURAL;', ctx);
  return ctx;
}
const M = cekirdek();
const js = (x) => JSON.parse(JSON.stringify(x));

// Salim'in gerçek düzeni (CHANGELOG 24 Eyl): okul Pzt/Çar/Cum 09-17, Sal/Per 09-19, Cmt 09-14; kurs Pzt 17:30-19, Per 19:30-21
const DUZEN = {
  okul: { 1: { bas: '09:00', bit: '17:00' }, 2: { bas: '09:00', bit: '19:00' }, 3: { bas: '09:00', bit: '17:00' }, 4: { bas: '09:00', bit: '19:00' }, 5: { bas: '09:00', bit: '17:00' }, 6: { bas: '09:00', bit: '14:00' } },
  ders: { 1: { bas: '17:30', bit: '19:00' }, 4: { bas: '19:30', bit: '21:00' } },
  antrenman: '17:00', kalk: '07:00',
};
const VERI = () => ({
  diet: { nut: { duzen: DUZEN } },
  settings: { sleepGoal: { wake: '07:00', targetH: 8 } },
  program: { days: [
    { dow: 1, type: 'strength', name: 'Alt Vücut A', agirBacak: true, hedefDk: 75, bas: '19:30' },
    { dow: 3, type: 'fight', name: 'Kickboks' },
    { dow: 5, type: 'strength', name: 'Üst Vücut', agirBacak: false, hedefDk: 60, bas: '17:30' },
  ] },
  fixedSchedule: [{ id: 1, label: 'Kickboks', days: [3], start: '18:00', end: '19:30', enabled: true }],
  school: { exams: [] },
  tasks: [],
});
const PZT = '2026-10-05'; // Pazartesi

describe('ikiz çekirdek: hafta.js ↔ worker.js', () => {
  for (const n of IKIZ) {
    test('birebir aynı: ' + n, () => {
      const a = extractDecl(HJ, n), b = extractDecl(WK, n);
      assert.ok(a && b, n + ' iki dosyada da yok');
      assert.strictEqual(normalize(a), normalize(b), n + ' KAYMIŞ — iki dosyayı da aynı yap');
    });
  }
  test('çekirdek SAF — global okumaz', () => {
    const yasak = /\b(window|document|localStorage)\b|(^|[^.\w])data\./;
    for (const n of IKIZ) assert.ok(!yasak.test(extractDecl(HJ, n).replace(/\/\/.*$/gm, '')), n + ' global okuyor');
  });
});

describe('gün resmi — gerçek düzen', () => {
  test('Pazartesi: okul + kurs + ağır bacak 19:30; yatış 23:00; kapasite küçük', () => {
    const g = js(M.hfGun(VERI(), PZT));
    assert.deepStrictEqual(g.bloklar.map(b => b.tur), ['okul', 'ders', 'antrenman']);
    assert.strictEqual(M.hfSaat(g.antrenman.bas), '19:30');
    assert.strictEqual(M.hfSaat(g.antrenman.bit), '20:45');
    assert.ok(g.antrenman.agir);
    assert.strictEqual(M.hfSaat(g.yatis), '23:00');
    // pencere 19:30-22:00 = 150 dk, antrenman 75 → boş 75, kapasite %60 = 45
    assert.strictEqual(g.bosDk, 75);
    assert.strictEqual(g.odevKap, 45);
  });
  test('Çarşamba: kickboks sabit bloktan okunur, iki kez sayılmaz', () => {
    const g = js(M.hfGun(VERI(), '2026-10-07'));
    assert.strictEqual(g.bloklar.filter(b => b.tur === 'antrenman').length, 1);
    assert.strictEqual(g.bloklar.filter(b => b.tur === 'sabit').length, 0);
    assert.strictEqual(M.hfSaat(g.antrenman.bas), '18:00');
    assert.ok(g.antrenman.agir, 'dövüş günü ağır sayılır');
  });
  test('Pazar: okulsuz → 10:00 başlar, kapasite büyük (tavan 180)', () => {
    const g = js(M.hfGun(VERI(), '2026-10-11'));
    assert.strictEqual(g.pencere.bas, 600);
    assert.strictEqual(g.odevKap, 180);
  });
  test('düzen yoksa çökmez, makul varsayılan', () => {
    const g = js(M.hfGun({}, PZT));
    assert.strictEqual(g.bloklar.length, 0);
    assert.ok(g.odevKap > 0);
    assert.doesNotThrow(() => M.hfCakismalar(null, PZT, 7));
  });
});

describe('çapraz kurallar', () => {
  test('🔒 sınavdan önceki gün ağır antrenman → YÜKSEK; hafif günde alarm yok', () => {
    const v = VERI();
    v.school.exams = [{ subject: 'Matematik', date: '2026-10-06' }, { subject: 'Fizik', date: '2026-10-10' }];
    const c = js(M.hfCakismalar(v, PZT, 7));
    const s = c.filter(x => x.kod === 'sinav-agir');
    assert.strictEqual(s.length, 1, 'yalnız Pazartesi (Salı sınavı + ağır bacak)');
    assert.strictEqual(s[0].tarih, PZT);
    assert.strictEqual(s[0].seviye, 'yuksek');
    assert.match(s[0].mesaj, /Yarın Matematik/);
    assert.ok(!c.some(x => x.kod === 'sinav-agir' && x.tarih === '2026-10-09'), 'Cuma üst vücut ağır değil → alarm yok');
    assert.ok(c.some(x => x.kod === 'sinav-haftasi'), '2 sınav → sınav haftası');
  });
  test('ödev aşımı: yük kapasiteyi geçince uyarı; geçmezse yok', () => {
    const v = VERI();
    v.tasks = [{ text: 'a', due: PZT, estimateMin: 40 }];
    assert.ok(!M.hfCakismalar(v, PZT, 1).some(x => x.kod === 'odev-asim'), '40 ≤ 45 alarm olmamalı');
    v.tasks.push({ text: 'b', due: PZT, estimateMin: 90 });
    const a = js(M.hfCakismalar(v, PZT, 1)).find(x => x.kod === 'odev-asim');
    assert.ok(a);
    assert.strictEqual(a.seviye, 'yuksek');
  });
  const gec = () => { const v = VERI(); v.program.days[0].bas = '20:00'; return v; };   // 20:00 + 75 = 21:15
  test('geç seans: 21:15 bitiş, yatış 23:00 → 2 saat payı yok; 20:45 bitişte alarm yok', () => {
    assert.ok(M.hfCakismalar(gec(), PZT, 1).some(x => x.kod === 'gec-antrenman'));
    assert.ok(!M.hfCakismalar(VERI(), PZT, 1).some(x => x.kod === 'gec-antrenman'), '20:45 bitiş yanlış alarm');
  });
  test('öneriler OKUL > UYKU > ANTRENMAN dilinde', () => {
    const v = gec(); v.school.exams = [{ subject: 'Mat', date: '2026-10-06' }];
    const c = js(M.hfCakismalar(v, PZT, 2));
    assert.match(c.find(x => x.kod === 'sinav-agir').oneri, /Okul önce/);
    assert.match(c.find(x => x.kod === 'gec-antrenman').oneri, /Uyku önce/);
  });
});

describe('haftalık sınav (Salı Mat+Sosyal, Perşembe Tr+Fiz+Kim+Biy, 17:25-19:05)', () => {
  const HS = () => { const v = VERI(); v.school.haftalikSinav = {
    2: { bas: '17:25', bit: '19:05', dersler: ['Matematik', 'Sosyal'] },
    4: { bas: '17:25', bit: '19:05', dersler: ['Türkçe', 'Fizik', 'Kimya', 'Biyoloji'] } }; return v; };
  test('sınav günü okul çıkışını 19:05\'e uzatır (okul 19:00 yazılı olsa bile)', () => {
    const g = js(M.hfGun(HS(), '2026-10-06'));
    assert.ok(g.bloklar.some(b => b.tur === 'sinav' && /Matematik, Sosyal/.test(b.label)));
    assert.strictEqual(g.pencere.bas, 19 * 60 + 5 + 30);
  });
  test('önceki akşama tekrar ayrılır, ödev kapasitesinden düşer (Çarşamba 4 ders = 80 dk)', () => {
    const car = js(M.hfGun(HS(), '2026-10-07'));
    assert.strictEqual(car.tekrar.dk, 80);
    assert.deepStrictEqual(car.tekrar.dersler, ['Türkçe', 'Fizik', 'Kimya', 'Biyoloji']);
    assert.strictEqual(car.odevKap, Math.max(0, car.hamKap - 80));
    assert.strictEqual(js(M.hfGun(HS(), '2026-10-09')).tekrar, null, 'Cuma ertesi sınav yok');
  });
  test('🔒 rutin haftalık sınav "sınav haftası" ya da "ağır antrenman" alarmı ÜRETMEZ (her hafta çalan alarm gürültü)', () => {
    const c = js(M.hfCakismalar(HS(), PZT, 7));
    assert.ok(!c.some(x => x.kod === 'sinav-haftasi' || x.kod === 'sinav-agir'));
    assert.ok(c.some(x => x.tarih === PZT && (x.kod === 'tekrar' || x.kod === 'tekrar-sigmiyor')), 'Pazartesi tekrar notu');
  });
  test('tekrar sığmıyorsa ORTA uyarı', () => {
    const v = HS(); v.tasks = [{ text: 'ödev', due: '2026-10-07', estimateMin: 120 }];
    const c = js(M.hfCakismalar(v, '2026-10-07', 1)).find(x => x.kod === 'tekrar-sigmiyor');
    assert.ok(c);
    assert.match(c.oneri, /Okul önce/);
  });
});

describe('hepsi birbirine bakar — haftalık ayar, uyku, koç, hedef', () => {
  const AY = (ayarlar) => { const v = VERI(); v.program.ayarlar = ayarlar; return v; };
  test('hafiflet: süre ~%60, ağır değil, beslenme günü yine antrenman', () => {
    const g = js(M.hfGun(AY({ [PZT]: { mod: 'hafif' } }), PZT));
    assert.strictEqual(g.antrenman.dk, 45);
    assert.strictEqual(g.antrenman.agir, false);
    assert.match(g.antrenman.ad, /hafif/);
    assert.strictEqual(M.hfGunTipi(AY({ [PZT]: { mod: 'hafif' } }), PZT), 'strength');
  });
  test('dinlenmeye al: o gün seans yok → beslenme REST, gün planında antrenman bloğu yok', () => {
    const v = AY({ [PZT]: { mod: 'dinlen' } });
    assert.strictEqual(M.hfGun(v, PZT).antrenman, null);
    assert.strictEqual(M.hfGunTipi(v, PZT), 'rest');
    assert.ok(!js(M.hfPlanBloklari(v, PZT)).some(b => b.tur === 'antrenman'));
  });
  test('kaydır: kaynak gün boşalır, hedef güne AYNI seans gelir (okul çıkışına göre saat)', () => {
    const v = AY({ [PZT]: { mod: 'kaydir', hedef: '2026-10-11' } });
    assert.strictEqual(M.hfGun(v, PZT).antrenman, null);
    const paz = js(M.hfGun(v, '2026-10-11'));
    assert.strictEqual(paz.antrenman.ad, 'Alt Vücut A');
    assert.strictEqual(M.hfGunTipi(v, '2026-10-11'), 'strength');
    assert.strictEqual(js(M.hfGun(VERI(), '2026-10-11')).antrenman, null, 'ayarsız Pazar boş');
  });
  test('🔒 ayar şablonu DEĞİŞTİRMEZ — bir sonraki Pazartesi yine ağır bacak', () => {
    const g = js(M.hfGun(AY({ [PZT]: { mod: 'dinlen' } }), '2026-10-12'));
    assert.ok(g.antrenman && g.antrenman.agir);
  });
  test('az uyku (hedef 8, 5.5 saat) + bugün ağır → YÜKSEK, hafiflet/dinlen eylemli; yeterli uykuda yok', () => {
    const v = VERI(); v.sleep = [{ date: PZT, hours: 5.5 }];
    const c = js(M.hfCakismalar(v, PZT, 1)).find(x => x.kod === 'az-uyku');
    assert.ok(c);
    assert.deepStrictEqual(c.eylemler, ['hafif', 'dinlen']);
    v.sleep = [{ date: PZT, hours: 7.5 }];
    assert.ok(!M.hfCakismalar(v, PZT, 1).some(x => x.kod === 'az-uyku'));
  });
  test('her uyarının düzeltme eylemi var', () => {
    const v = VERI(); v.program.days[0].bas = '20:00'; v.school.exams = [{ subject: 'Mat', date: '2026-10-06' }];
    v.tasks = [{ text: 'x', due: PZT, estimateMin: 200 }];
    for (const c of js(M.hfCakismalar(v, PZT, 2)).filter(x => x.seviye !== 'bilgi' && x.kod !== 'sinav-haftasi')) {
      assert.ok(Array.isArray(c.eylemler) && c.eylemler.length, c.kod + ' eylemsiz');
    }
  });

  // worker tarafı: koç ölçümleri + hedef kapasitesi
  const W = WK.replace(/\r\n/g, '\n');
  const wctx = { Date, JSON, Math, String, Array, Object, Number, isNaN, buildHealthFactsSrv: () => 'DETAY' };
  vm.createContext(wctx);
  vm.runInContext(IKIZ.map(n => extractDecl(W, n)).join('\n') + '\n' + extractDecl(W, 'haftaKocFacts') + '\n' + extractDecl(W, 'goalFitDue') +
    '\nthis.haftaKocFacts = haftaKocFacts; this.goalFitDue = goalFitDue;', wctx);
  test('koç ölçümü: ödev/antrenman/uyku/beslenme SAYILARI + gelecek hafta tablosu', () => {
    const v = VERI();
    v.tasks = [{ text: 'Mat', category: 'odev', done: true, doneDate: '2026-10-03', estimateMin: 40 }, { text: 'eski', due: '2026-10-01' }];
    v.hevy = { workouts: [{ date: '2026-10-02' }, { date: '2026-09-01' }] };
    v.sleep = [{ date: '2026-10-04', hours: 7 }, { date: '2026-10-03', hours: 6 }];
    v.diet.days = { '2026-10-04': { meals: [{ kcal: 500 }] } };
    const f = wctx.haftaKocFacts(v, '2026-10-04');
    assert.match(f.metin, /ödev\/özel ders 1, ~40 dk/);
    assert.match(f.metin, /gecikmiş 1/);
    assert.match(f.metin, /Hevy'de son 7 günde 1/);
    assert.match(f.metin, /ortalama 6\.5 saat/);
    assert.match(f.metin, /7 günün 1'inde öğün/);
    assert.match(f.metin, /GELECEK HAFTA:/);
  });
  test('🔒 hedef adımı dolu güne düşmez (kapasiteli güne itilir)', () => {
    // Pazartesi kapasite 45 → 60 dk'lık adım Salı'ya (antrenmansız, ~90 dk) itilir
    assert.strictEqual(wctx.goalFitDue(VERI(), PZT, 60), '2026-10-06');
    assert.strictEqual(wctx.goalFitDue(VERI(), PZT, 30), PZT);
    assert.strictEqual(wctx.goalFitDue(null, PZT, 30), PZT);
  });
  test('worker: gymDayLine programı + haftalık ayarı izler; Pazar 20:00 PRO koç', () => {
    const gym = extractDecl(W, 'gymDayLine');
    assert.match(gym, /hfGun\(data, forDate\)\.antrenman/);
    const run = W.slice(W.indexOf('async function runHaftaOzet'), W.indexOf('/** CRON (her akşam 19:30)'));
    assert.match(run, /tier: 'heavy', model: proModel/);
    assert.match(run, /d\.haftaKoc = \{ at: bugun, metin: koc \}/);
    assert.match(W, /goalThink\(env, goal, tasks, mem, trToday\(\), aiTierForUser\(env, user, 'heavy'\), session\.data\)/);
  });
});

describe('bağlantılar', () => {
  test('worker: gün planı okul/kurs/antrenmanı meşgul sayar', () => {
    const f = extractDecl(WK, 'fixedBlocksFor');
    assert.match(f, /hfPlanBloklari\(data, dateStr\)/);
    assert.match(f, /!sabit\.some\(s => blocksOverlap\(s, b\)\)/);
  });
  test('worker: sohbet ajanı haftayı görür, sabah brifingi + Pazar 20:00 push', () => {
    assert.match(WK, /BU HAFTA \(ödev X\/Y dk/);
    assert.match(WK, /const hcak = hfCakismalar\(u\.data, trToday\(\), 2\)/);
    assert.match(WK, /if \(dow === 0 && at\(20, 0\)\) jobs\.push\(runHaftaOzet\(env\)\);/);
    assert.match(WK, /url: '\/#hafta'/);
  });
  test('hafta.js tembel, Görevler sekmesiyle iner', () => {
    assert.match(readText('core.js'), /hafta: '\/hafta\.js'/);
    assert.match(readText('tasks.js'), /loadModule\('hafta'\)/);
    assert.ok(!/<script[^>]+hafta\.js/.test(readText('asistan.html')));
  });
});

describe('PWA: kapasiteye göre ödev dağıtımı + panel', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'school.js', 'hafta.js'] });
  after(() => { try { A.close(); } catch (_) {} });
  const kur = () => A.evalIn(`(() => { const v = ${JSON.stringify(VERI())}; data.diet = data.diet || {}; data.diet.nut = v.diet.nut;
    data.settings.sleepGoal = v.settings.sleepGoal; data.program = v.program; data.fixedSchedule = v.fixedSchedule;
    data.school = { timetable: {}, exams: [] }; data.tasks = []; })()`);

  test('🔒 dolu güne (Pzt kapasite 45) değil boş güne (Pazar 180) dağıtır', () => {
    kur();
    const plan = JSON.parse(A.evalIn(`JSON.stringify(hwSpread([{ text: 'Kompozisyon', estimateMin: 90 }], ['${PZT}', '2026-10-11']))`));
    const yer = plan.find(d => d.items.length);
    assert.strictEqual(yer.date, '2026-10-11', 'kapasitesi küçük Pazartesi seçildi');
    assert.strictEqual(plan[0].kap, 45);
  });
  test('gün planı sabit blokları okul + kurs + antrenmanı içerir, kickboks kopyası yok', () => {
    kur();
    const pzt = JSON.parse(A.evalIn(`JSON.stringify(fixedBlocksForDate('${PZT}').map(b => b.label + ' ' + b.start))`));
    assert.deepStrictEqual(pzt, ['Okul 09:00', 'Ek ders / kurs 17:30', 'Alt Vücut A 19:30']);
    const car = JSON.parse(A.evalIn(`JSON.stringify(fixedBlocksForDate('2026-10-07').map(b => b.label))`));
    assert.strictEqual(car.filter(x => /Kickboks/.test(x)).length, 1);
  });
  test('okul paneli: haftalık sınav eklenir/silinir, XSS kaçışlı', () => {
    kur();
    A.evalIn(`renderSchool();
      document.getElementById('wexDay').value = '4';
      document.getElementById('wexDers').value = 'Türkçe, Fizik, <b>x</b>';
      addWeeklyExam();`);
    assert.deepStrictEqual(JSON.parse(A.evalIn('JSON.stringify(data.school.haftalikSinav["4"].dersler)')), ['Türkçe', 'Fizik', '<b>x</b>']);
    const el = A.window.document.getElementById('schoolWeekly');
    assert.ok(el && /Per/.test(el.textContent));
    assert.strictEqual(el.querySelector('b'), null, 'XSS');
    A.evalIn(`deleteWeeklyExam('4')`);
    assert.strictEqual(A.evalIn('data.school.haftalikSinav["4"]'), undefined);
  });
  test('Haftam eylemi: hafiflet → program.ayarlar + beslenme gün tipi aynı anda; geri al', async () => {
    kur();
    A.evalIn(`data.program.days.forEach(d => { d.dow = new Date(today() + 'T12:00:00').getDay(); }); data.program.days = [data.program.days[0]];`);
    await A.evalIn(`haftaEylem(today(), 'dinlen')`);
    assert.strictEqual(A.evalIn('data.program.ayarlar[today()].mod'), 'dinlen');
    assert.strictEqual(A.evalIn('hfGunTipi(data, today())'), 'rest');
    await A.evalIn(`haftaEylem(today(), 'hafif')`);
    assert.strictEqual(A.evalIn('hfGun(data, today()).antrenman.agir'), false);
  });
  test('ödevleri dengele: aşan günün işi ÖNCEKİ boş güne alınır, son tarih geçilmez', () => {
    kur();
    A.evalIn(`data.program = null; data.diet.nut.duzen = {};
      const t2 = shiftDateStr(today(), 2);
      data.tasks = [makeTask({ text: 'a', due: t2, estimateMin: 150 }), makeTask({ text: 'b', due: t2, estimateMin: 60 })];
      data.tasks[1].id = 77;`);
    const n = A.evalIn(`haftaDengele(shiftDateStr(today(), 2)).length`);
    assert.ok(n >= 1);
    const dues = JSON.parse(A.evalIn('JSON.stringify(data.tasks.map(t => t.due))'));
    assert.ok(dues.every(x => x <= A.evalIn('shiftDateStr(today(), 2)')), 'son tarih geçildi');
    assert.ok(dues.some(x => x < A.evalIn('shiftDateStr(today(), 2)')), 'hiçbiri öne alınmadı');
  });
  test('Haftam paneli: 7 gün, çakışma rozeti, XSS kaçışlı', () => {
    kur();
    A.evalIn(`data.school.exams = [{ subject: '<img src=x onerror=1>', date: shiftDateStr(today(), 1) }];
      data.program.days.forEach(d => { d.dow = new Date(today() + 'T12:00:00').getDay(); });
      renderHafta();`);
    const el = A.window.document.getElementById('haftaInner');
    assert.strictEqual(el.querySelectorAll('.hafta-gun').length, 7);
    assert.strictEqual(el.querySelector('img'), null);
    assert.match(A.window.document.getElementById('haftaBadge').textContent, /çakışma/);
  });
});
