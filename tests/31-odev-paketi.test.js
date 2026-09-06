/**
 * 31 — ÖDEV PAKETİ (6 Eyl 2026)
 *
 * NEDEN: okuldan haftalık ödev listesi geliyor ve uygulamada onu günlere
 * bölen bir yüzey YOKTU. Dağıtım motoru (`planSeriesDays`) ve seri sistemi
 * (rozet, ilerleme, "yeniden dengele", silme) yazılıydı; seriyi KURAN tek
 * yerel yol `/tekrar` komutuydu. Haftalık ödev için tek yol AI hızlı
 * yakalamaydı — bulut girişi + ağ + AI şart. Yani en sık yapılacak okul işi
 * en kırılgan yola bağlıydı. Bu dosyanın koruduğu sözleşmeler:
 *
 * - AI YOK. Dağıtım deterministik ve offline (`fetch` yasağı teste bağlı).
 * - DAĞITIM GÜN YÜKÜNE BAKAR. `planSeriesDays` parçaları takvime eşit
 *   aralıkla serpiyor ve o günde ne olduğunu görmüyor; ödev listesinde asıl
 *   soru "hangi gün ne kadar boş".
 * - PARÇALAR KRONOLOJİK. Eşit boyutlu parçalar LPT ile dağılınca "(4/4)
 *   yarın, (1/4) perşembe" çıkıyordu.
 * - SATIRDA TARİH VARSA O KAZANIR. Kullanıcı gün söylediyse motor ezmez.
 * - HER ŞEY GERİ ALINABİLİR: 6 görev tek dokunuşla eklenip tek dokunuşla
 *   geri alınabilmeli, id'ler ÇAKIŞMAMALI (makeTask Date.now() veriyor —
 *   aynı ms'de 6 görev aynı id'yi alırdı).
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, SCRIPTS, ROOT } = require('./helpers/load');

const A = loadApp({ scripts: [...SCRIPTS, 'school.js'] });
const W = A.window, D = W.document;
W.Element.prototype.scrollIntoView = function () {};
after(() => { try { A.close(); } catch (_) {} });

const veri = () => A.evalIn('data');
const bugun = () => A.evalIn('today()');
const kaydir = (n) => A.evalIn(`shiftDateStr(today(), ${n})`);
const set = (id, v) => {
  const e = D.getElementById(id);
  assert.ok(e, id + ' alani yok');
  if (e.type === 'checkbox') e.checked = v; else e.value = v;
};
const paketGorevleri = () => veri().tasks.filter(t => t.seriesId && String(t.seriesId).startsWith('hw-'));

/** Modali doldurup onizlemeyi uretir. */
function kur(metin, opts = {}) {
  W.openHomework();
  set('hwText', metin);
  set('hwDeadline', opts.son || kaydir(6));
  set('hwParca', opts.parca || 1);
  set('hwName', opts.ad || '');
  set('hwSkipWeekend', opts.haftaSonuAtla !== false);
  set('hwToday', !!opts.bugunDe);
  W.hwPreview();
  return A.evalIn('_hwPlan');
}

describe('kapi: dugme, modal, motor birbirine bagli mi', () => {
  test('dugme HTML\'de var ve tembel modulu yukluyor', () => {
    const html = fs.readFileSync(path.join(ROOT, 'asistan.html'), 'utf8');
    assert.ok(/onclick="openHomeworkModal\(\)"/.test(html), 'Odev paketi dugmesi yok');
    const tasks = fs.readFileSync(path.join(ROOT, 'tasks.js'), 'utf8');
    assert.ok(/function openHomeworkModal[\s\S]*?loadModule\('school'\)/.test(tasks),
      'dugme school modulunu yuklemiyor — motor var kapi yok');
  });

  test('modal acilma sinifi CSS\'in tanidigi sinif', () => {
    // 30 Agustos dersi: openProgramSetup 'open' yaziyordu, CSS 'active' taniyor.
    const sc = fs.readFileSync(path.join(ROOT, 'school.js'), 'utf8');
    const yorumsuz = sc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const siniflar = [...yorumsuz.matchAll(/classList\.add\('([^']+)'\)/g)].map((m) => m[1]);
    assert.ok(siniflar.length, 'hicbir acilma sinifi bulunamadi');
    for (const c of siniflar) {
      assert.strictEqual(c, 'active',
        `modal '${c}' sinifiyla aciliyor — CSS yalniz .modal-overlay.active taniyor, dugme gorunmez kalir`);
    }
  });

  test('AI/ag cagrisi YOK — offline calisir', () => {
    const sc = fs.readFileSync(path.join(ROOT, 'school.js'), 'utf8');
    const hw = sc.slice(0, sc.indexOf('OKUL BLOĞU'));   // odev paketi bolumu
    assert.ok(!/\bfetch\s*\(/.test(hw), 'odev paketi ag istegi yapiyor — offline calismali');
  });
});

describe('dagitim motoru', () => {
  test('gun yuku dikkate aliniyor (esit aralik DEGIL)', () => {
    // Bir gunu bilerek doldur: motor o gune yeni is yigmamali.
    const d = veri();
    const dolu = kaydir(2);
    d.tasks.push(A.evalIn(`makeTask({ text: 'dolu gun', due: '${dolu}', estimateMin: 200 })`));
    const plan = kur('a 30dk\nb 30dk\nc 30dk\nd 30dk', { son: kaydir(5) });
    const o = plan.days.find(g => g.date === dolu);
    if (o) assert.strictEqual(o.items.length, 0, 'zaten 200 dk yuklu gune ödev kondu');
    d.tasks = d.tasks.filter(t => t.text !== 'dolu gun');
  });

  test('hafta sonu atlanabiliyor', () => {
    const plan = kur('a\nb\nc\nd\ne', { son: kaydir(13), haftaSonuAtla: true });
    for (const g of plan.days) {
      const dow = new Date(g.date + 'T00:00:00').getDay();
      assert.ok(dow !== 0 && dow !== 6, 'hafta sonuna gun kondu: ' + g.date);
    }
  });

  test('varsayilan olarak BUGUNE is konmaz', () => {
    const plan = kur('a\nb\nc', { son: kaydir(5) });
    assert.ok(!plan.days.some(g => g.date === bugun()), 'bugune is kondu — baski yapar');
  });

  test('"bugune de koy" isaretlenince bugun de kullanilir', () => {
    // ⚠️ hafta sonu atlama ACIK kalirsa ve bugun Cmt/Paz ise bugun zaten
    // elenir — bu test o kurali degil "bugunden basla"yi olcuyor.
    const plan = kur('a\nb\nc', { son: kaydir(5), bugunDe: true, haftaSonuAtla: false });
    assert.strictEqual(plan.days[0].date, bugun());
  });

  test('satirda tarih varsa dagitim onu EZMEZ', () => {
    const hedef = kaydir(3);
    const dow = new Date(hedef + 'T00:00:00').getDay();
    // Hafta sonuna denk gelirse kural devre disi kalir; testi hafta ici gunle kur
    const gun = (dow === 0 || dow === 6) ? kaydir(5) : hedef;
    const ad = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'][new Date(gun + 'T00:00:00').getDay()];
    const plan = kur(`a 10dk\nb 10dk\n${ad} fizik testi 10dk`, { son: kaydir(9) });
    const g = plan.days.find(x => x.date === gun);
    assert.ok(g && g.items.some(it => /fizik testi/.test(it.text)),
      'kullanicinin yazdigi gun korunmadi');
  });

  test('gun sayisindan fazla odev varsa gunlere yayilir, son gune yigilmaz', () => {
    const plan = kur(Array.from({ length: 8 }, (_, i) => `odev${i} 20dk`).join('\n'), { son: kaydir(5) });
    const dolu = plan.days.filter(g => g.items.length);
    assert.ok(dolu.length >= 3, 'odevler tek gune yigildi');
    const enCok = Math.max(...dolu.map(g => g.items.length));
    const enAz = Math.min(...dolu.map(g => g.items.length));
    assert.ok(enCok - enAz <= 2, `dengesiz dagilim: ${enAz}-${enCok}`);
  });
});

describe('tek odevi parcaya bolme', () => {
  test('N parca uretiliyor ve sure bolunuyor', () => {
    const plan = kur('matematik 40 soru 120dk', { parca: 4, son: kaydir(5) });
    const hepsi = plan.days.flatMap(g => g.items);
    assert.strictEqual(hepsi.length, 4);
    assert.ok(hepsi.every(it => it.estimateMin === 30), 'sure bolunmedi');
    assert.ok(hepsi.every(it => /matematik 40 soru \(\d\/4\)/.test(it.text)), hepsi[0].text);
  });

  test('parcalar KRONOLOJIK sirada', () => {
    // 🔴 REGRESYON: esit boyutlu parcalar gun yukune gore dagilinca
    // "(4/4) yarin, (1/4) persembe" cikiyordu.
    const plan = kur('kitap oku 120dk', { parca: 4, son: kaydir(6) });
    const sira = plan.days.flatMap(g => g.items.map(it => ({ date: g.date, n: parseInt(/\((\d)\//.exec(it.text)[1], 10) })));
    for (let i = 1; i < sira.length; i++) {
      assert.ok(sira[i].date >= sira[i - 1].date, 'gun sirasi bozuk');
      assert.ok(sira[i].n > sira[i - 1].n, `parca sirasi bozuk: ${sira[i - 1].n} sonra ${sira[i].n}`);
    }
  });

  test('parca sayisi 1 ise bolme yapilmaz', () => {
    const plan = kur('matematik 40 soru 120dk', { parca: 1, son: kaydir(3) });
    assert.strictEqual(plan.days.flatMap(g => g.items).length, 1);
  });
});

describe('satir cozumleme', () => {
  test('sure / kategori / oncelik satirdan okunuyor', () => {
    const plan = kur('!! kimya testi 45dk', { son: kaydir(4) });
    const it = plan.days.flatMap(g => g.items)[0];
    assert.strictEqual(it.estimateMin, 45);
    assert.strictEqual(it.priority, 'urgent');
    assert.strictEqual(it.text, 'kimya testi');
  });

  test('madde isaretleri temizleniyor', () => {
    const plan = kur('- fizik\n* kimya\n1. tarih', { son: kaydir(4) });
    // ⚠️ vm baglamindan donen dizide deepStrictEqual KULLANMA (farkli realm,
    // prototip eslesmez, yanlis kirmizi verir) — bkz. CLAUDE.md test notu.
    const adlar = plan.days.flatMap(g => g.items).map(i => i.text).sort().join('|');
    assert.strictEqual(adlar, 'fizik|kimya|tarih');
  });

  test('bos satirlar sayilmaz', () => {
    const plan = kur('fizik\n\n\n  \nkimya', { son: kaydir(4) });
    assert.strictEqual(plan.days.flatMap(g => g.items).length, 2);
  });
});

describe('gorevlere yazma', () => {
  test('gorevler seri olarak ekleniyor ve id\'ler CAKISMIYOR', () => {
    // 🔴 makeTask id'yi Date.now() ile veriyor: ayni ms'de 6 gorev ayni id
    // alirdi ve tamamla/sil YANLIS kaydi vururdu.
    const once = paketGorevleri().length;
    kur('a 20dk\nb 20dk\nc 20dk\nd 20dk\ne 20dk\nf 20dk', { son: kaydir(6), ad: 'Hafta 1' });
    W.hwAdd();
    const yeni = paketGorevleri().slice(once);
    assert.strictEqual(yeni.length, 6);
    assert.strictEqual(new Set(yeni.map(t => t.id)).size, 6, 'id catismasi');
    assert.ok(yeni.every(t => t.seriesName === 'Hafta 1'), 'paket adi yazilmadi');
    assert.ok(yeni.every(t => t.seriesTotal === 6), 'seriesTotal yanlis');
    assert.strictEqual(yeni.map(t => t.seriesIndex).sort((a, b) => a - b).join(','), '1,2,3,4,5,6');
    assert.ok(yeni.every(t => t.due), 'tarihsiz gorev kaldi');
    assert.ok(yeni.every(t => t.category === 'odev'), 'kategori odev degil');
  });

  test('seriesIndex takvim sirasiyla artiyor', () => {
    const g = paketGorevleri().filter(t => t.seriesName === 'Hafta 1')
      .sort((a, b) => a.seriesIndex - b.seriesIndex);
    for (let i = 1; i < g.length; i++) {
      assert.ok(g[i].due >= g[i - 1].due, 'seri sirasi takvimle uyusmuyor');
    }
  });

  test('paket eklenince modal kapanir ve GERI ALINABILIR', () => {
    const once = veri().tasks.length;
    kur('x 15dk\ny 15dk', { son: kaydir(4) });
    W.hwAdd();
    assert.ok(!D.getElementById('homeworkModal').classList.contains('active'), 'modal acik kaldi');
    assert.strictEqual(veri().tasks.length, once + 2);
    const toastlar = [...D.querySelectorAll('#toastContainer .toast')];
    const toast = toastlar[toastlar.length - 1];
    assert.ok(toast && /geri al/i.test(toast.textContent), 'geri alma sunulmuyor');
    const btn = toast.querySelector('button');
    assert.ok(btn, 'geri al dugmesi yok');
    btn.click();
    assert.strictEqual(veri().tasks.length, once, 'geri alma calismadi');
  });

  test('onizleme bossa ekleme dugmesi KAPALI', () => {
    kur('', { son: kaydir(4) });
    assert.ok(D.getElementById('hwAddBtn').disabled, 'bos pakette dugme acik');
    kur('a\nb', { son: kaydir(4) });
    assert.ok(!D.getElementById('hwAddBtn').disabled, 'dolu pakette dugme kapali');
  });

  test('gecmis son tarih reddediliyor', () => {
    W.openHomework();
    set('hwText', 'a\nb'); set('hwDeadline', kaydir(-3)); W.hwPreview();
    assert.strictEqual(A.evalIn('_hwPlan'), null);
    assert.ok(D.getElementById('hwAddBtn').disabled);
    assert.ok(/olamaz/.test(D.getElementById('hwPreview').textContent), 'sebep yazilmadi');
    W.closeHomework();
  });
});

describe('okul blogu tasindiktan sonra da calisiyor', () => {
  test('renderSchool / ensureSchool school.js\'te ve cagrilabiliyor', () => {
    assert.strictEqual(typeof W.renderSchool, 'function');
    assert.strictEqual(typeof W.ensureSchool, 'function');
    W.renderSchool();   // patlamamali
  });

  test('ui.js ve tasks.js okul fonksiyonlarini KORUMASIZ cagirmiyor', () => {
    // Modul inmeden cagrilirsa "not defined" ile acilis coker.
    const ui = fs.readFileSync(path.join(ROOT, 'ui.js'), 'utf8');
    const tasks = fs.readFileSync(path.join(ROOT, 'tasks.js'), 'utf8');
    const korumasiz = (src, ad) => new RegExp(`(^|[^.\\w'"])${ad}\\(`, 'm').test(
      src.split('\n').filter(l => !/typeof|function |ensureSchoolModule/.test(l)).join('\n'));
    assert.ok(!korumasiz(ui, 'renderSchool'), 'ui.js renderSchool\'u korumasiz cagiriyor');
    assert.ok(!korumasiz(tasks, 'renderSchool'), 'tasks.js renderSchool\'u korumasiz cagiriyor');
  });
});
