/**
 * 35 — BAYAT TARTI ÖLÇÜMÜ (/body) · 6 Eylül 2026
 *
 * 🔴 GERÇEK ARIZA: Salim "tartıdan veri düşmüyor" dedi. Veritabanına
 * bakıldığında veri DÜŞÜYORDU — ama hep AYNI veri:
 *
 *     2026-08-14  68.8 kg / %15.5 / 58.1
 *     2026-09-01  68.8 kg / %15.5 / 58.1
 *     2026-09-08  68.8 kg / %15.5 / 58.1
 *
 * Sebep: iOS Kısayolu "EN SON Sağlık örneğini" okuyor ve `date` GÖNDERMİYOR;
 * uç da tarihsiz kaydı bugüne damgalıyor. Xiaomi → Apple Sağlık bağlantısı
 * koptuğunda örnek yenilenmiyor, Kısayol yine de çalışıyor ve haftalar
 * önceki ölçümü HER SABAH bugünün kilosu olarak yolluyor.
 *
 * ⚠️ BU, VERİ GELMEMEKTEN DAHA KÖTÜ. Trend canlı görünüyor, kilo eğimi
 * sahte düz çıkıyor, `palKat` kalibrasyonu (gerçek kilo regresyonu isteyen)
 * çöple besleniyor ve "N gündür tartım kaydı gelmiyor" uyarısı da SUSUYOR —
 * çünkü teknik olarak kayıt var. Sessiz veri zehirlenmesi.
 *
 * SÖZLEŞME:
 *  - Tek ölçüm + tarih yollanmamış + en yeni kayıtla birebir aynı +
 *    o kayıt 2+ gün eski  → YAZMA, 409 + stale:true + eyleme dönük summary.
 *  - Ardışık günde aynı değer GERÇEK olabilir → 2 gün eşiği.
 *  - Toplu dolgu (items) ve tarihli gönderim bu kuraldan MUAF.
 *  - Değer değiştiyse (0.1 kg bile) normal yazılır.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { readText } = require('./helpers/src');

const WK = readText('aidan-worker/worker.js');
const govde = WK.slice(WK.indexOf('async function handleBodyApi'),
                       WK.indexOf('// Main entry'));

/**
 * Bayat kontrolünü gövdeden ÇIKARIP izole çalıştırır: uç `fetch`/`env`
 * gerektiriyor, ama karar mantığı saf. Bloğun kendisi ölçülüyor — kopyası
 * değil; blok silinirse test bulamaz ve kırmızı olur.
 */
function bayatKarar({ weights, body, bugun }) {
  const bas = govde.indexOf('const tekOlcum =');
  const son = govde.indexOf('const saved = [];');
  assert.ok(bas > 0 && son > bas, 'bayat olcum korumasi blogu bulunamadi — silinmis mi?');
  const blok = govde.slice(bas, son);

  const srvBodyNum = new Function('return ' + WK.slice(
    WK.indexOf('function srvBodyNum'), WK.indexOf('function srvUpsertBody')).trim())();
  const data = { diet: { weights: weights.slice() } };
  const raw = Array.isArray(body.items) ? body.items : [body];
  let sonuc = null;
  const jsonCors = (o, status) => { sonuc = { status, body: o }; return sonuc; };
  const trToday = () => bugun;
  const cors = {};
  const f = new Function('body', 'raw', 'data', 'srvBodyNum', 'jsonCors', 'trToday', 'cors',
    blok + '\nreturn null;');
  f(body, raw, data, srvBodyNum, jsonCors, trToday, cors);
  return sonuc;
}

const W = (date, kg, fat) => ({ date, kg, fat, src: 'health', lean: null });

describe('bayat olcum reddediliyor', () => {
  test('GERCEK VAKA: 1 Eylul olcumu 8 Eylul\'de tekrar geliyor → RED', () => {
    const r = bayatKarar({
      weights: [W('2026-08-14', 68.8, 15.5), W('2026-09-01', 68.8, 15.5)],
      body: { kg: '68.8', fat: '15.5' },
      bugun: '2026-09-08',
    });
    assert.ok(r, 'bayat olcum sessizce yazildi — veri zehirlenmesi geri geldi');
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.stale, true);
    assert.strictEqual(r.body.saved, 0);
    assert.strictEqual(r.body.lastRealDate, '2026-09-01');
  });

  test('reddin sebebi EYLEME DONUK yaziliyor (Kisayol bunu bildirimde gosterir)', () => {
    const r = bayatKarar({
      weights: [W('2026-09-01', 68.8, 15.5)],
      body: { kg: '68.8', fat: '15.5' },
      bugun: '2026-09-08',
    });
    // Sessiz basarisizlik yok: kullanici NE yapacagini bilmeli.
    assert.match(r.body.summary, /Xiaomi Home/);
    assert.match(r.body.summary, /Apple Sağlık/);
    assert.match(r.body.summary, /2026-09-01/, 'son gercek olcumun tarihi yazilmiyor');
    assert.match(r.body.summary, /68\.8/, 'tekrarlanan deger yazilmiyor');
  });

  test('Kisayol\'un metin/virgul bicimi de yakalaniyor', () => {
    // Kisayol her seyi METIN yollar, ondalik virgullu olabilir.
    const r = bayatKarar({
      weights: [W('2026-09-01', 68.8, 15.5)],
      body: { kg: '68,8', fat: '15,5' },
      bugun: '2026-09-08',
    });
    assert.ok(r && r.body.stale, 'virgullu bicimde bayat olcum kacti');
  });

  test('Apple Saglik\'in KESIRLI yag orani (0.155) da ayni sayilir', () => {
    const r = bayatKarar({
      weights: [W('2026-09-01', 68.8, 15.5)],
      body: { kg: '68.8', fat: '0.155' },
      bugun: '2026-09-08',
    });
    assert.ok(r && r.body.stale, 'kesirli yag oraninda bayat olcum kacti');
  });
});

describe('yanlis alarm YOK', () => {
  test('deger degistiyse (0.1 kg bile) normal yazilir', () => {
    const r = bayatKarar({
      weights: [W('2026-09-01', 68.8, 15.5)],
      body: { kg: '68.9', fat: '15.5' },
      bugun: '2026-09-08',
    });
    assert.strictEqual(r, null, 'gercek olcum reddedildi');
  });

  test('yag orani degistiyse yazilir', () => {
    const r = bayatKarar({
      weights: [W('2026-09-01', 68.8, 15.5)],
      body: { kg: '68.8', fat: '15.1' },
      bugun: '2026-09-08',
    });
    assert.strictEqual(r, null);
  });

  test('ARDISIK gunde ayni deger GERCEK olabilir → yazilir', () => {
    // 2 gun esigi tam olarak bunun icin: dun 68.8, bugun 68.8 olagan.
    const r = bayatKarar({
      weights: [W('2026-09-07', 68.8, 15.5)],
      body: { kg: '68.8', fat: '15.5' },
      bugun: '2026-09-08',
    });
    assert.strictEqual(r, null, 'ardisik gun tekrari yanlis alarm verdi');
  });

  test('TARIH yollandiysa kural devre disi (dogru kurulmus Kisayol)', () => {
    const r = bayatKarar({
      weights: [W('2026-09-01', 68.8, 15.5)],
      body: { kg: '68.8', fat: '15.5', date: '2026-09-01' },
      bugun: '2026-09-08',
    });
    assert.strictEqual(r, null, 'tarihli gonderim engellendi — bayat ornek kendi gunune yazilmali');
  });

  test('TOPLU dolgu (items) muaf', () => {
    const r = bayatKarar({
      weights: [W('2026-09-01', 68.8, 15.5)],
      body: { items: [{ kg: '68.8', fat: '15.5', date: '2026-08-20' }] },
      bugun: '2026-09-08',
    });
    assert.strictEqual(r, null, 'gecmis dolgusu engellendi');
  });

  test('hic kayit yokken ILK olcum yazilir', () => {
    const r = bayatKarar({ weights: [], body: { kg: '68.8', fat: '15.5' }, bugun: '2026-09-08' });
    assert.strictEqual(r, null);
  });

  test('BUGUNE ait kayitla karsilastirma YAPILMAZ (gun ici ikinci tartim)', () => {
    // Ayni gun ikinci kez tartilmak upsert; bayat sayilmamali.
    const r = bayatKarar({
      weights: [W('2026-09-08', 68.8, 15.5)],
      body: { kg: '68.8', fat: '15.5' },
      bugun: '2026-09-08',
    });
    assert.strictEqual(r, null, 'gun ici tekrar tartim bayat sayildi');
  });
});

describe('belge ile kod ayni seyi soyluyor', () => {
  test('ios-shortcuts.md `date` alanini ve bayat uyarisini anlatiyor', () => {
    // Kurulum belgesi eksik kalirsa hata yeni telefonda aynen tekrar eder.
    const md = readText('ios-shortcuts.md');
    assert.match(md, /`date`/, 'belge date alanindan bahsetmiyor');
    assert.match(md, /Başlangıç Tarihi/, 'olcumun kendi tarihini alma adimi yok');
    assert.match(md, /yenilenmemiş/, 'bayat olcum uyarisi belgede yok');
  });
});
