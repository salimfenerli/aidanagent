/**
 * 10 — SOHBETTE SAGLIK BAGLAMI (8 Agu 2026)
 *
 * NEDEN: "Aidan'a sor" simdiye kadar sadece gorev + portfoy goruyordu; uyku,
 * antrenman ve beslenme verisi VARDI ama sohbete hic gitmiyordu. Iki kademeli
 * baglam eklendi (kisa ozet her zaman, tam blok konu acilinca).
 *
 * Bu dosya iki seyi kilitler:
 *  1) Kisa ozetin sayilari dogru ve NaN sizdirmiyor
 *  2) 16 yas guvenlik sinirlari saglik verisi baglamdayken PROMPT'A GIRIYOR
 *     (bu kural gevserse 16 yasindaki kullaniciya diyet onerisi gidebilir)
 */
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { readText, extractDecl } = require('./helpers/src');

const WK = readText('aidan-worker/worker.js');

// ——— chatHealthShort'u izole calistir (jsdom yok, hizli) ———
function loadShort(todayStr = '2026-08-08') {
  const src = extractDecl(WK, 'chatHealthShort');
  assert.ok(src, 'chatHealthShort worker.js icinde bulunamadi');
  const shift = (n) => {
    const d = new Date(todayStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const ctx = vm.createContext({
    trToday: () => todayStr,
    trDate: (n = 0) => shift(n),
    sleepDebtSrv: () => ({ debt: 3.6, band: 'mild' }),
    fmtSleepHoursSrv: (h) => `${Math.round(h * 10) / 10} saat`,
    SLEEP_BAND_LABEL_SRV: { clear: 'temiz', mild: 'hafif', high: 'belirgin', severe: 'ağır' },
    console,
  });
  vm.runInContext(src + '\nglobalThis.__f = chatHealthShort;', ctx);
  return ctx.__f;
}

const FULL = {
  sleep: [
    { date: '2026-08-07', hours: 6.2, quality: 'bad' },
    { date: '2026-08-08', hours: 7.4, quality: 'good' },
  ],
  hevy: { workouts: [{ date: '2026-08-06' }, { date: '2026-08-03' }, { date: '2026-07-20' }] },
  diet: {
    kcalGoal: 2600, proteinGoal: 163,
    days: { '2026-08-08': { meals: [{ kcal: 500, protein: 30 }, { kcal: 800, protein: 55 }] } },
    weights: [{ date: '2026-08-01', kg: 71.2, fat: 17.8 }, { date: '2026-07-20', kg: 72 }],
  },
};

test('kisa ozet 4 basligi da uretir', () => {
  const s = loadShort()(FULL);
  assert.match(s, /Sağlık:/);
  assert.match(s, /7\.4 saat uyku \(iyi\)/);
  assert.match(s, /uyku borcu 3\.6 saat \(hafif\)/);
  assert.match(s, /son antrenman 2026-08-06/);
  assert.match(s, /son 7 günde 2 seans/);   // 08-06 ve 08-03 icerde, 07-20 disarda
  assert.match(s, /bugün 1300\/2600 kcal/);
  assert.match(s, /protein 85\/163 g \(2 öğün\)/);
  assert.match(s, /son tartı 71\.2 kg, yağ %17\.8/);
});

test('bos veride hicbir sey yollamaz (bos string)', () => {
  const f = loadShort();
  assert.strictEqual(f({}), '');
  assert.strictEqual(f({ sleep: [], hevy: { workouts: [] }, diet: { days: {}, weights: [] } }), '');
});

test('bozuk kayitlarda NaN/undefined sizmaz', () => {
  const f = loadShort();
  const s = f({
    sleep: [{ date: '2026-08-08', hours: null }, { date: null, hours: 7 }],
    hevy: { workouts: [{ date: null }, null] },
    diet: { days: { '2026-08-08': { meals: [{ kcal: 'abc' }, {}] } }, weights: [{ date: '2026-08-01', kg: null }] },
  });
  assert.ok(!/NaN|undefined|null/.test(s), `sizinti: ${s}`);
});

test('hedef girilmemisse bolme cizgisi basmaz', () => {
  const s = loadShort()({ diet: { days: { '2026-08-08': { meals: [{ kcal: 400, protein: 20 }] } } } });
  assert.match(s, /bugün 400 kcal/);
  assert.ok(!s.includes('400/'), 'hedef yokken bolme yazilmamali');
});

// ——— Anahtar kelime tespiti ———
test('saglik konusu dogru tespit ediliyor', () => {
  const m = /const CHAT_HEALTH_RE = (\/.+\/[a-z]*);/.exec(WK);
  assert.ok(m, 'CHAT_HEALTH_RE bulunamadi');
  const re = vm.runInNewContext(m[1]);
  const gecmeli = [
    'bu hafta antrenmanlarım nasıl', 'protein yeterli mi', 'kaç kalori aldım',
    'dün kaç saat uyudum', 'diyetim nasıl gidiyor', 'kilo veriyor muyum',
    'yağ oranım ne durumda', 'kreatin kullanmalı mıyım', 'spor programı öner',
  ];
  const gecmemeli = [
    'matematik ödevimi nasıl yaparım', 'THYAO hakkında ne düşünüyorsun',
    'yarın sınavım var ne çalışayım', 'bugün ne yapmalıyım',
  ];
  gecmeli.forEach(t => assert.ok(re.test(t), `tetiklemeliydi: ${t}`));
  gecmemeli.forEach(t => assert.ok(!re.test(t), `tetiklememeliydi: ${t}`));
});

// ——— Prompt sozlesmesi ———
test('kisa ozet HER sohbete, tam blok SADECE konu acilinca girer', () => {
  assert.ok(/const healthShort = chatHealthShort\(d\);/.test(WK), 'kisa ozet baglama girmiyor');
  assert.ok(/if \(healthTopic && hasHealthDataSrv\(d, 14\)\)/.test(WK),
    'tam blok kosulsuz gidiyor olabilir — token/dikkat maliyeti');
  assert.ok(/\$\{healthShort\}\$\{healthFull\}/.test(WK), 'ctx sablonuna eklenmemis');
});

test('16 yas guvenlik sinirlari saglik verisi baglamdayken prompta giriyor', () => {
  const g = extractDecl(WK, 'CHAT_HEALTH_GUARD') || '';
  const src = g || WK;
  for (const kural of ['teşhis koyma', 'ilaç/takviye önerme', 'kalori kısıtlaması',
    'kilo verme diyeti', 'vücut şekli', 'aşırı antrenman']) {
    assert.ok(WK.includes(kural), `guard kurali eksik: ${kural}`);
  }
  assert.ok(/const healthGuard = \(healthShort \|\| healthFull\) \? CHAT_HEALTH_GUARD\(name\)/.test(WK),
    'guard sadece tam blokla degil, kisa ozetle de gelmeli');
});

test('tam blok okuma kurallari (eksik-log, yagsiz kutle) mevcut', () => {
  assert.ok(WK.includes('CHAT_HEALTH_RULES'), 'okuma kurallari yok');
  assert.ok(/eksik-log/.test(WK) && /Yağsız kütle düşüyorsa çözüm daha az yemek değil/.test(WK),
    'kritik okuma kurallari eksik');
  assert.ok(/En fazla 2 öneri/.test(WK), 'ADHD oneri siniri yok');
});

test('sohbet varsayilani hala UCRETSIZ katman (maliyet kurali)', () => {
  // Kalici kural: serbest akisli hicbir yol ucretli modele gidemez.
  // extractDecl `async function` yakalamiyor — kaynaktan dilimle
  const i = WK.indexOf('async function handleChatApi');
  assert.ok(i > 0, 'handleChatApi bulunamadi');
  const j = WK.indexOf('async function ', i + 30);
  const fn = WK.slice(i, j > 0 ? j : i + 20000);
  assert.ok(/proOnce \? aiTierForUser\(env, user, 'heavy'\)/.test(fn),
    'heavy sadece /pro ile gelmeli — serbest akis ucretsiz kalmali');
  assert.ok(!/tier: 'heavy'/.test(fn), 'chat sabit heavy olmus — fatura tavani kalkar');
  assert.ok(/healthFull \? 900 : 700/.test(fn), 'tam blokta cevap alani genisletilmemis');
});

test('paylasilan hc* cekirdegine dokunulmadi', () => {
  // Yeni kod cekirdegin DISINDA olmali; ikizlik testi (02) byte-byte karsilastiriyor.
  const short = extractDecl(WK, 'chatHealthShort');
  assert.ok(!/function hc[A-Z]/.test(short), 'paylasilan cekirdek fonksiyonu yeniden tanimlanmis');
});
