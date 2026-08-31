/**
 * 27 — TOPARLANMA KATMANI (Fitbit hatti)
 *
 * 🔴 NEDEN VAR: bu katmanin urettigi sayi kullaniciya "bugun agir calis /
 * calisma" dedirtiyor. Yanlis bir skor sessizce haftalarca yanlis karar
 * verdirir — uyku borcu motorunda oldugu gibi burada da model TESTE bagli.
 *
 * Kilitlenen sozlesme:
 *  1. TABAN OTURMADAN SKOR YOK. Ilk 2 haftada uydurma skor gostermek,
 *     hic gostermemekten kotudur — ve AI'a da "hesaplanamiyor" gitmeli.
 *  2. Medyan+MAD, ortalama+SD DEGIL: tek bir uc deger tabani kaydirmaz
 *  3. Dinlenme nabzinda ISARET TERS — dusuk nabiz IYI toparlanmadir
 *  4. Yuk oraninda kayitsiz gun 0 sayilir (payda GUN sayisi)
 *  5. Enerji bakiyesi kumulatif ve eski gunler eriyor
 *  6. AI prompt'undaki 16 yas kilitleri (kalori dusurme yasagi) duruyor
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { readText, extractDecl } = require('./helpers/src');

const UI = readText('health.js');   // 30 Agu 2026: hc* cekirdegi buraya tasindi
const WK = readText('aidan-worker/worker.js');

/** Paylasilan cekirdegi izole calistir — hicbir global okumadan. */
function loadCore() {
  const adlar = ['HC_BASE', 'HC_LOAD_W', 'HC_REC', 'hcRound', 'hcShift', 'hcDayDiff',
    'hcMedian', 'hcBaseline', 'hcLoad', 'hcRecovery', 'hcEnergyBank', 'hcRecoveryPatterns'];
  const parcalar = adlar.map((ad) => {
    const src = extractDecl(UI, ad);
    assert.ok(src, ad + ' bulunamadi — toparlanma katmani silinmis olabilir');
    return src;
  });
  return new Function(parcalar.join('\n') + '\nreturn { ' + adlar.join(', ') + ' };')();
}
const C = loadCore();

const T = '2026-08-23';
/** T gununden `k` gun geriye ISO tarih. */
const g = (k) => C.hcShift(T, -k);
/** n gunluk saglik kaydi uret; `fn(i)` i. gunun alanlarini doner. */
const seri = (n, fn) => Array.from({ length: n }, (_, i) => Object.assign({ date: g(i) }, fn(i)));

describe('hcMedian', () => {
  test('tek ve cift eleman sayisi', () => {
    assert.strictEqual(C.hcMedian([3, 1, 2]), 2);
    assert.strictEqual(C.hcMedian([4, 1, 3, 2]), 2.5);
    assert.strictEqual(C.hcMedian([]), null);
  });
});

describe('hcBaseline — kisisel taban cizgi', () => {
  test('yeterli veri yoksa hazir DEGIL ve z uretilmez', () => {
    const b = C.hcBaseline(seri(10, () => ({ hrv: 70 })), 'hrv', T);
    assert.strictEqual(b.ready, false);
    assert.strictEqual(b.z, null, 'taban oturmadan z uretildi');
    assert.strictEqual(b.n, 10);
  });

  test('yeterli veriyle medyan ve z hesaplanir', () => {
    // 20 gun 60 ms, bugun 75 ms → z belirgin pozitif olmali
    const rows = seri(20, (i) => ({ hrv: i === 0 ? 75 : 60 }));
    const b = C.hcBaseline(rows, 'hrv', T);
    assert.strictEqual(b.ready, true);
    assert.strictEqual(b.median, 60);
    assert.strictEqual(b.last, 75);
    assert.ok(b.z > 1, 'z: ' + b.z);
    assert.strictEqual(b.dir, 1);
  });

  test('tek uc deger tabani kaydirmaz (medyan, ortalama DEGIL)', () => {
    // 19 gun 60, bir gun 300 (hatali/hastalikli olcum). Ortalama 72'ye cikardi.
    const rows = seri(20, (i) => ({ hrv: i === 5 ? 300 : 60 }));
    assert.strictEqual(C.hcBaseline(rows, 'hrv', T).median, 60);
  });

  test('MAD sifirken sifira bolme yok', () => {
    // Tum degerler ayni → MAD 0. Olcek tabani devreye girmeli, z sonlu kalmali.
    const b = C.hcBaseline(seri(20, () => ({ rhr: 58 })), 'rhr', T);
    assert.strictEqual(b.mad, 0);
    assert.ok(Number.isFinite(b.z), 'z sonlu degil: ' + b.z);
  });

  test('OLCUM GURULTUSU skoru dusurmez (gurultu tabani)', () => {
    // 🔴 Simulasyonda yakalandi: cok duzenli bir seride MAD kucucuk cikiyor ve
    // 2 ms'lik gece-gece dalgalanmasi z = -1.35 goruluyordu — hicbir sey
    // olmadigi halde skor 39'a dusuyordu. HRV gerceklikte %8-10 oynar.
    const rows = seri(30, (i) => ({ hrv: i === 0 ? 60 : 62 + (i % 5) - 2 }));
    const b = C.hcBaseline(rows, 'hrv', T);
    assert.ok(Math.abs(b.z) < 0.7, 'gurultu sinyal sayildi, z: ' + b.z);
    assert.strictEqual(b.dir, 0, 'gurultu yon uretti');
  });

  test('gercek sapma gurultu tabanini asar', () => {
    // Ayni seri, ama bugun 44 ms (%29 dusus) — bu SINYALDIR, susmamali
    const rows = seri(30, (i) => ({ hrv: i === 0 ? 44 : 62 + (i % 5) - 2 }));
    const b = C.hcBaseline(rows, 'hrv', T);
    assert.ok(b.z < -2, 'gercek dusus yakalanmadi, z: ' + b.z);
  });

  test('nabiz tabani HRV\'den DAR — %3 gurultu, %8 degil', () => {
    // Dinlenme nabzi gece gece cok az oynar; 4 bpm sapma HRV'deki 4 ms'ten
    // cok daha anlamlidir. Ayni esik ikisine uygulanamaz.
    const rhr = C.hcBaseline(seri(30, (i) => ({ rhr: i === 0 ? 62 : 56 })), 'rhr', T);
    const hrv = C.hcBaseline(seri(30, (i) => ({ hrv: i === 0 ? 66 : 60 })), 'hrv', T);
    assert.ok(Math.abs(rhr.z) > Math.abs(hrv.z),
      'ayni mutlak sapma nabizda daha guclu okunmali: rhr ' + rhr.z + ' vs hrv ' + hrv.z);
  });

  test('pencere disindaki gunler tabana girmez', () => {
    // 40 gunluk seri, pencere 30 → sadece 30'u sayilir
    assert.strictEqual(C.hcBaseline(seri(40, () => ({ rhr: 58 })), 'rhr', T).n, 30);
  });
});

describe('hcLoad — akut:kronik oran', () => {
  test('kayitsiz gun 0 yuk sayilir (payda GUN sayisi)', () => {
    // 28 gunun hepsinde kayit, ama yalniz 14'unde antrenman → oran 1 civari degil,
    // ortalama gun sayisina bolundugu icin dusuk cikmali
    const health = seri(28, () => ({ steps: 8000, kcalOut: 300 }));
    const l = C.hcLoad([], health, T);
    assert.strictEqual(l.ready, true);
    assert.ok(Math.abs(l.acute - l.chronic) < 0.01, 'sabit veride akut ve kronik ayni olmali');
    assert.strictEqual(l.ratio, 1);
  });

  test('kronik pencere dolmadan hazir DEGIL', () => {
    const l = C.hcLoad([], seri(10, () => ({ steps: 8000 })), T);
    assert.strictEqual(l.ready, false);
    assert.strictEqual(l.ratio, null);
  });

  test('ani sicrama yakalanir', () => {
    // 28 gun hafif, son 7 gun agir
    const health = seri(28, (i) => ({ steps: i < 7 ? 20000 : 5000, kcalOut: i < 7 ? 900 : 200 }));
    const l = C.hcLoad([], health, T);
    assert.ok(l.ratio > 1.5, 'oran: ' + l.ratio);
    assert.strictEqual(l.band, 'sicrama');
  });

  test('devamlilik dususu yakalanir', () => {
    const health = seri(28, (i) => ({ steps: i < 7 ? 2000 : 12000, kcalOut: i < 7 ? 100 : 600 }));
    const l = C.hcLoad([], health, T);
    assert.ok(l.ratio < 0.8, 'oran: ' + l.ratio);
    assert.strictEqual(l.band, 'dusuk');
  });

  test('Hevy hacmi ve saglik verisi ayni gunde toplanir', () => {
    const l = C.hcLoad([{ date: T, volumeKg: 10000 }], [{ date: T, steps: 8000, kcalOut: 600 }], T);
    // 10 ton = 10 birim, 600 kcal = 6, 8000 adim = 2 → 18
    assert.strictEqual(l.today, 18);
  });
});

describe('hcRecovery — toparlanma skoru', () => {
  const hazirBase = (key, val, med) => C.hcBaseline(
    seri(20, (i) => ({ [key]: i === 0 ? val : med })), key, T);

  test('TABAN YOKSA SKOR YOK — en kritik kural', () => {
    const r = C.hcRecovery({
      hrv: C.hcBaseline(seri(5, () => ({ hrv: 60 })), 'hrv', T),
      rhr: C.hcBaseline(seri(5, () => ({ rhr: 58 })), 'rhr', T),
    });
    assert.strictEqual(r.ready, false);
    assert.strictEqual(r.score, null, 'taban oturmadan skor uretildi — uydurma sayi');
    assert.ok(r.missing.length === 2, 'eksik girdiler bildirilmedi');
  });

  test('tek girdi eksikse yine skor YOK', () => {
    const r = C.hcRecovery({
      hrv: hazirBase('hrv', 60, 60),
      rhr: C.hcBaseline(seri(5, () => ({ rhr: 58 })), 'rhr', T),
    });
    assert.strictEqual(r.ready, false);
    assert.strictEqual(r.missing.length, 1);
  });

  test('HRV tabanin ustunde -> skor 50 uzeri, sebep yazili', () => {
    const r = C.hcRecovery({ hrv: hazirBase('hrv', 85, 60), rhr: hazirBase('rhr', 58, 58) });
    assert.strictEqual(r.ready, true);
    assert.ok(r.score > 55, 'skor: ' + r.score);
    assert.strictEqual(r.band, 'iyi');
    assert.ok(r.drivers.some((d) => /HRV/.test(d)), 'sebep listesinde HRV yok');
  });

  test('dinlenme nabzinda ISARET TERS — yuksek nabiz skoru DUSURUR', () => {
    const yuksek = C.hcRecovery({ hrv: hazirBase('hrv', 60, 60), rhr: hazirBase('rhr', 72, 58) });
    const dusuk = C.hcRecovery({ hrv: hazirBase('hrv', 60, 60), rhr: hazirBase('rhr', 50, 58) });
    assert.ok(yuksek.score < dusuk.score,
      'yuksek nabiz skoru dusurmedi (' + yuksek.score + ' vs ' + dusuk.score + ')');
  });

  test('uyku borcu skoru dusurur', () => {
    const temiz = C.hcRecovery({ hrv: hazirBase('hrv', 60, 60), rhr: hazirBase('rhr', 58, 58), debt: { debt: 0 } });
    const borclu = C.hcRecovery({ hrv: hazirBase('hrv', 60, 60), rhr: hazirBase('rhr', 58, 58), debt: { debt: 8 } });
    assert.ok(borclu.score < temiz.score - 15, 'borc cezasi yetersiz: ' + borclu.score + ' vs ' + temiz.score);
    assert.ok(borclu.drivers.some((d) => /uyku borcu/.test(d)));
  });

  test('yuk sicramasi skoru dusurur, cezanin tavani var', () => {
    const b = { hrv: hazirBase('hrv', 60, 60), rhr: hazirBase('rhr', 58, 58) };
    const normal = C.hcRecovery(Object.assign({ load: { ratio: 1 } }, b));
    const sicrama = C.hcRecovery(Object.assign({ load: { ratio: 3 } }, b));
    assert.ok(sicrama.score < normal.score);
    assert.ok(normal.score - sicrama.score <= 15 + 1, 'yuk cezasi tavani asildi');
  });

  test('skor 0-100 disina cikmaz', () => {
    const kotu = C.hcRecovery({
      hrv: hazirBase('hrv', 5, 90), rhr: hazirBase('rhr', 120, 50),
      debt: { debt: 40 }, load: { ratio: 9 },
    });
    assert.ok(kotu.score >= 0 && kotu.score <= 100, 'skor: ' + kotu.score);
    assert.strictEqual(kotu.band, 'dusuk');
  });
});

describe('hcEnergyBank — kumulatif bakiye', () => {
  test('hedefin ustunde uyku bakiyeyi artirir', () => {
    const sleep = seri(20, () => ({ hours: 9 }));
    const b = C.hcEnergyBank(sleep, null, null, 8, T);
    assert.strictEqual(b.ready, true);
    assert.ok(b.balance > 0, 'bakiye: ' + b.balance);
  });

  test('kronik az uyku bakiyeyi eksiye dusurur', () => {
    const b = C.hcEnergyBank(seri(20, () => ({ hours: 5.5 })), null, null, 8, T);
    assert.ok(b.balance < -25, 'bakiye: ' + b.balance);
    assert.ok(b.band === 'azaliyor' || b.band === 'tukenmis', 'band: ' + b.band);
  });

  test('kayit yoksa hazir DEGIL', () => {
    assert.strictEqual(C.hcEnergyBank([], null, null, 8, T).ready, false);
  });

  test('eski gunler eriyor — 3 hafta onceki kotu gece bugunu belirlemiyor', () => {
    // Ayni 21 kotu gece, tek fark son 7 gunun hedefte olmasi. Duz toplamda
    // ikisi arasinda fark olmazdi; ustel erimede belirgin fark olmali.
    // NOT: hedefte uyumak borcu ODEMEZ, sadece birikmeyi durdurur — bakiyeyi
    // yukari tasiyan sey eski gunlerin silinmesidir.
    const hepKotu = C.hcEnergyBank(seri(28, () => ({ hours: 4 })), null, null, 8, T);
    const sonHaftaIyi = C.hcEnergyBank(seri(28, (i) => ({ hours: i < 7 ? 8 : 4 })), null, null, 8, T);
    assert.ok(sonHaftaIyi.balance > hepKotu.balance + 40,
      'eski gunler erimemis: ' + hepKotu.balance + ' -> ' + sonHaftaIyi.balance);
  });

  test('bakiye -100..100 disina cikmaz', () => {
    const b = C.hcEnergyBank(seri(28, () => ({ hours: 16 })), null, null, 8, T);
    assert.ok(b.balance <= 100 && b.balance >= -100, 'bakiye: ' + b.balance);
  });
});

describe('hcRecoveryPatterns — otomatik tespitler', () => {
  test('SESSIZ ARIZA: 5 gundur veri yoksa uyarir', () => {
    const p = C.hcRecoveryPatterns({ today: T, health: seri(3, () => ({ steps: 8000 })).map((r, i) => ({ date: g(i + 6), steps: 8000 })) });
    assert.ok(p.some((x) => /gelmiyor/.test(x.text)), 'sessiz ariza yakalanmadi: ' + JSON.stringify(p));
  });

  test('hic veri yoksa Kisayol sorulur', () => {
    const p = C.hcRecoveryPatterns({ today: T, health: [] });
    assert.ok(p.some((x) => /Kısayol/.test(x.text)));
  });

  test('taban olusurken skor yerine BEKLE mesaji verilir', () => {
    const p = C.hcRecoveryPatterns({
      today: T, health: [{ date: T, steps: 8000 }],
      rec: { ready: false, need: 14, missing: ['HRV tabanı'], drivers: [] },
    });
    assert.ok(p.some((x) => /taban çizgi oluşuyor/.test(x.text)));
    assert.ok(!p.some((x) => /\/100/.test(x.text)), 'taban yokken skor metni cikti');
  });

  test('toparlanma dusukken nabiz uyarisi TEKRARLANMAZ', () => {
    const p = C.hcRecoveryPatterns({
      today: T, health: [{ date: T, steps: 8000 }],
      rec: { ready: true, score: 20, band: 'dusuk', drivers: ['dinlenme nabzı tabanının üstünde'], need: 14 },
      rhr: { ready: true, z: 2, last: 72, median: 58 },
    });
    const nabiz = p.filter((x) => /nab[ız]/i.test(x.text));
    assert.strictEqual(nabiz.length, 1, 'ayni sinyal iki kez yazildi: ' + JSON.stringify(nabiz));
  });

  test('yuk sicramasi uyarisi cikar', () => {
    const p = C.hcRecoveryPatterns({
      today: T, health: [{ date: T, steps: 8000 }],
      load: { ready: true, ratio: 1.8, band: 'sicrama' },
    });
    assert.ok(p.some((x) => x.level === 'warn' && /sıçrama/.test(x.text)));
  });
});

describe('AI sozlesmesi', () => {
  test('hesaplanamayan skor AI\'a "UYDURMA" notuyla gider', () => {
    const src = extractDecl(UI, 'hcBuildFacts');
    assert.ok(/henüz hesaplanamıyor/.test(src), 'hesaplanamiyor dali kalkmis');
    assert.ok(/UYDURMA/.test(src), 'AI\'a sayi uydurmama talimati yok');
  });

  test('skor satiri "yeniden hesaplama" notuyla gonderiliyor', () => {
    const src = extractDecl(UI, 'hcBuildFacts');
    assert.ok(/TOPARLANMA: ' \+ rc\.score/.test(src), 'toparlanma satiri yok');
    assert.ok(/YENİDEN HESAPLAMA/.test(src), 'AI sayiyi yeniden hesaplayabilir');
  });

  test('16 yas kilitleri prompt\'ta DURUYOR', () => {
    // Yeni oneri kilavuzu eklendi diye eski guvenlik kilitleri dusmemeli
    assert.ok(/Kalori kısıtlaması/.test(WK), 'kalori kisitlama yasagi silinmis');
    assert.ok(/Kalori düşürme önerisi her koşulda YASAK/.test(WK), 'beslenme kilavuzunda kalori kilidi yok');
    assert.ok(/Aşırı antrenman teşviki/.test(WK), 'asiri antrenman yasagi silinmis');
  });

  test('antrenman ve beslenme kilavuzlari prompt\'a girmis', () => {
    assert.ok(/ANTRENMAN ÖNERİSİ NASIL VERİLİR/.test(WK));
    assert.ok(/BESLENME ÖNERİSİ NASIL VERİLİR/.test(WK));
    assert.ok(/BİRİ ANTRENMAN, BİRİ BESLENME/.test(WK), 'gorev tanimi guncellenmemis');
  });

  test('toparlanma okuma kurallari prompt\'ta', () => {
    assert.ok(/tamamen iptal ETTİRME/.test(WK), 'dusuk skorda tam istirahat onerisi engellenmemis');
    assert.ok(/HİÇBİR ŞEY söyleme, skor uydurma/.test(WK), 'hesaplanamiyor durumu prompt\'ta yok');
  });
});
