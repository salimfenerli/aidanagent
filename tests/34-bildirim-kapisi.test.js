/**
 * 34 — BİLDİRİM KAPISI: SESSİZ ÖLÜMÜN ÜÇ HALİ (6 Eyl 2026)
 *
 * ADHD uygulamasında hatırlatma gelmiyorsa uygulama hiç açılmıyor — yani
 * bildirim zincirindeki sessiz bir kopma tek başına ürünü öldürüyor.
 * Zincir denetlendi; worker tarafı sağlam çıktı (ölü subscription 404/410
 * ile temizleniyor, cron kaçırdığı slotu telafi etmiyor, blok ping'leri
 * yerel planlayıcının ürettiği alanları okuyor). Kopma UYGULAMA tarafındaydı
 * ve üç ayrı hâli vardı; üçü de KULLANICIYA HİÇBİR ŞEY SÖYLEMİYORDU:
 *
 * 1) 🔴 iOS'TA PUSH YALNIZ ANA EKRANA EKLENMİŞ PWA'DA ÇALIŞIR. Safari
 *    sekmesinde `Notification` çoğu sürümde tanımlı bile değil ve uygulama
 *    "Bu cihaz bildirimi desteklemiyor" yazıyordu — YANLIŞ ve yanlış yöne
 *    gönderen bir mesaj: cihaz destekliyor, SEKME desteklemiyor. Kullanıcı
 *    "bildirimleri aç"a basıyor, hiçbir şey olmuyor, sebep hiçbir yerde yok.
 * 2) 🔴 İZİN VAR AMA CİHAZ KAYITLI DEĞİL. En sinsi hâli: her şey açık
 *    görünüyor, tek bildirim gelmiyor. Uyarı yalnız Ayarlar ekranında vardı,
 *    ana ekranda hiçbir iz yoktu.
 * 3) Abonelik sonradan sessizce ölürse (iOS'ta olur) açılıştaki tazeleme
 *    başarısız oluyor ve yine hiçbir şey söylenmiyordu — tazeleme sonucu
 *    artık şeridi güncelliyor.
 */
const { test, describe, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, SCRIPTS, ROOT } = require('./helpers/load');

const A = loadApp({ scripts: [...SCRIPTS, 'health.js', 'school.js'] });
const W = A.window, D = W.document;
W.Element.prototype.scrollIntoView = function () {};
after(() => { try { A.close(); } catch (_) {} });

const serit = () => D.getElementById('notifBanner');
const gorunur = () => serit().style.display !== 'none';
const metin = () => serit().textContent.replace(/\s+/g, ' ').trim();

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const UA_MASAUSTU = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function ortam({ ua = UA_MASAUSTU, standalone = false, izin = 'granted', subs = [] } = {}) {
  Object.defineProperty(W.navigator, 'userAgent', { value: ua, configurable: true });
  W.navigator.standalone = standalone;
  W.matchMedia = () => ({ matches: standalone, addListener() {}, removeListener() {} });
  W.Notification.permission = izin;
  const d = A.evalIn('data');
  d.settings = d.settings || {};
  d.settings.pushSubs = subs;
}

describe('iOS: sekme mi, ana ekran mi', () => {
  test('iPhone + ana ekrana EKLENMEMIS → push imkansiz olarak taniniyor', () => {
    ortam({ ua: UA_IPHONE, standalone: false });
    assert.strictEqual(A.evalIn('iosTabda()'), true);
  });

  test('iPhone + ana ekrana EKLENMIS → normal ortam', () => {
    ortam({ ua: UA_IPHONE, standalone: true });
    assert.strictEqual(A.evalIn('iosTabda()'), false);
  });

  test('masaustu asla "iOS sekmesi" sayilmiyor', () => {
    ortam({ ua: UA_MASAUSTU, standalone: false });
    assert.strictEqual(A.evalIn('iosTabda()'), false);
  });

  test('iOS sekmesinde serit GERCEK sebebi ve cozumu yaziyor', () => {
    ortam({ ua: UA_IPHONE, standalone: false });
    W.renderNotifBanner();
    assert.ok(gorunur(), 'serit gizli');
    assert.match(metin(), /Ana Ekrana Ekle/i);
  });

  test('iOS sekmesinde Ayarlar "cihaz desteklemiyor" DEMIYOR', () => {
    // 🔴 REGRESYON: eski mesaj kullaniciyi cihaz ayarlarina gonderiyordu;
    // orada yapabilecegi hicbir sey yok.
    ortam({ ua: UA_IPHONE, standalone: false });
    W.renderNotifSettings();
    const t = D.getElementById('notifSettings').textContent;
    assert.ok(!/cihaz bildirimi desteklemiyor/i.test(t), 'hala yanlis sebep yaziyor');
    assert.match(t, /Ana Ekrana Ekle/i);
  });

  test('iOS sekmesinde izin istemek yerine SEBEP soyleniyor', () => {
    ortam({ ua: UA_IPHONE, standalone: false });
    let istendi = false;
    const eski = W.Notification.requestPermission;
    W.Notification.requestPermission = () => { istendi = true; return new Promise(() => {}); };
    W.askNotif();
    W.Notification.requestPermission = eski;
    assert.strictEqual(istendi, false, 'iOS sekmesinde bosuna izin istendi');
  });
});

describe('izin var ama cihaz kayitli degil', () => {
  test('serit ANA EKRANDA uyariyor (Ayarlar\'a gitmeye gerek yok)', () => {
    ortam({ standalone: true, izin: 'granted', subs: [] });
    W.renderNotifBanner();
    assert.ok(gorunur(), 'her sey acik gorunuyor ama tek bildirim gelmiyor — serit yok');
    assert.match(metin(), /kayıtlı değil/i);
  });

  test('cihaz kayitliysa serit SUSUYOR', () => {
    ortam({ standalone: true, izin: 'granted', subs: [{ endpoint: 'https://x', keys: {} }] });
    W.renderNotifBanner();
    assert.ok(!gorunur(), 'gereksiz uyari — serit gurultuye donusur');
  });

  test('izin istenmemisse klasik izin serisi', () => {
    ortam({ standalone: true, izin: 'default', subs: [] });
    W.renderNotifBanner();
    assert.ok(gorunur());
    assert.match(metin(), /izin ver/i);
  });

  test('izin REDDEDILMISSE serit israr etmiyor', () => {
    ortam({ standalone: true, izin: 'denied', subs: [] });
    W.renderNotifBanner();
    assert.ok(!gorunur(), 'reddedilmis izin icin serit israr ediyor');
  });
});

describe('kapi sozlesmeleri', () => {
  test('acilisda abonelik tazelemesi SONUCU serite yansiyor', () => {
    // Abonelik sessizce oldugunde kullanici bunu ancak "haftalardir
    // hatirlatma gelmiyor" diye fark ederdi.
    const src = fs.readFileSync(path.join(ROOT, 'ui.js'), 'utf8');
    assert.match(src, /subscribeToPush\(\)[\s\S]{0,80}renderNotifBanner/,
      'tazeleme sonrasi serit guncellenmiyor');
  });

  test('push kaydi/sifirlamasi seridi guncelliyor', () => {
    const src = fs.readFileSync(path.join(ROOT, 'ui.js'), 'utf8');
    for (const fn of ['enablePushHere', 'resubscribePush']) {
      const i = src.indexOf('function ' + fn);
      assert.ok(i > 0, fn + ' yok');
      const blok = src.slice(i, src.indexOf('\n}', i));
      assert.ok(blok.includes('renderNotifBanner'), fn + ' seridi guncellemiyor');
    }
  });

  test('uyku trend modali TEMBEL ve kapisi ui.js\'te', () => {
    const ui = fs.readFileSync(path.join(ROOT, 'ui.js'), 'utf8');
    const health = fs.readFileSync(path.join(ROOT, 'health.js'), 'utf8');
    assert.match(ui, /async function openSleepTrend[\s\S]{0,200}loadModule\('health'\)/,
      'openSleepTrend modulu yuklemiyor');
    assert.ok(/function sleepTrendOpen\(/.test(health), 'motor health.js\'te degil');
    assert.ok(!/function renderSleepTrend\(/.test(ui), 'render hala ui.js\'te — borc odenmemis');
    // renderDailyScore KRITIK YOLDA: Gorevler sekmesi her acilista cagiriyor.
    assert.ok(/function renderDailyScore\(/.test(ui), 'renderDailyScore yanlislikla tasindi');
  });

  test('modal acilma sinifi CSS\'in tanidigi sinif', () => {
    const health = fs.readFileSync(path.join(ROOT, 'health.js'), 'utf8');
    const i = health.indexOf('function sleepTrendOpen(');
    const blok = health.slice(i, i + 260);
    assert.ok(/classList\.add\('active'\)/.test(blok), "modal 'active' disinda bir sinifla aciliyor");
  });
});

describe('worker tarafi sozlesmeleri (regresyon kilidi)', () => {
  const worker = fs.readFileSync(path.join(ROOT, 'aidan-worker', 'worker.js'), 'utf8');

  test('olu subscription TEMIZLENIYOR (404/410)', () => {
    const i = worker.indexOf('async function sendPushToAll');
    const blok = worker.slice(i, i + 1800);
    assert.ok(/status === 404 \|\| status === 410/.test(blok), 'olu abonelik temizlenmiyor');
    assert.ok(/pushSubs = subs\.filter/.test(blok), 'temizlik kaydedilmiyor');
  });

  test('cron kacirdigi eski slotu TELAFI ETMIYOR (bildirim yagmuru)', () => {
    assert.ok(/nowM - slotM > 30/.test(worker), 'aralikli hatirlatici eski slotu telafi ediyor');
    assert.ok(/nowMin - nagSlot > 5/.test(worker), 'takviye nag eski slotu telafi ediyor');
  });

  test('blok ping\'leri YEREL planlayicinin urettigi alanlari okuyor', () => {
    // Yerel planlayici bloklari {id,label,start,end,kind,done} uretiyor;
    // worker bunlari okuyor. Alan adlari kayarsa planli gun SESSIZCE
    // bildirimsiz kalir.
    const i = worker.indexOf('async function runPlanBlockPingsForUser');
    const blok = worker.slice(i, i + 4200);   // otomatik toparlama blogu uzun
    for (const alan of ['b.start', 'b.end', 'b.id', 'b.kind', 'b.done']) {
      assert.ok(blok.includes(alan), 'blok ping ' + alan + ' okumuyor');
    }
    const tasks = fs.readFileSync(path.join(ROOT, 'tasks.js'), 'utf8');
    const j = tasks.indexOf('function planLocalBlocks');
    const uretim = tasks.slice(j, tasks.indexOf('function planLocalDay'));
    for (const alan of ['id:', 'label:', 'start:', 'end:', 'kind:']) {
      assert.ok(uretim.includes(alan), 'yerel planlayici ' + alan + ' uretmiyor');
    }
  });
});
