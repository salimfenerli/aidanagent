/**
 * 60 — BİLGİSAYAR EKRAN SÜRESİ (11 Eki 2026)
 *
 * Salim: "aidana bilgisayar ekran süresi şeyini yapalım". iPhone ekran süresi Apple
 * kuralı gereği dışarı çıkamıyor; Windows'ta ActivityWatch yerel kaydeder,
 * pc/aidan-ekran.ps1 yarım saatte bir özetini worker /screen'e yollar.
 *
 * Kilitlenenler:
 *  - /screen secret ister (yanlışta 404), aidan_screen TABLOSUNA yazar (blob'a DEĞİL)
 *  - doğrulama: gelecek/7 günden eski tarih, 24 saati aşan toplam, 1 dk altı kalem düşer
 *  - sohbet [KAYITLAR] BİLGİSAYAR satırı kodla hesaplanır; tablo okunamazsa sohbet ölmez
 *  - Windows betikleri ASCII (PowerShell 5.1 BOM'suz dosyayı ANSI okur), CRLF, gizli anahtar git'e girmez
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { readText, extractDecl } = require('./helpers/src');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const ctx = { Math, Number, String, Array, Object, Date, JSON, isNaN };
vm.createContext(ctx);
vm.runInContext(['EKRAN_MAX_KALEM', 'srvEkranTemizle'].map(n => extractDecl(W, n)).join('\n') + '\nthis.T = srvEkranTemizle;', ctx);
const js = (x) => JSON.parse(JSON.stringify(x));
const BUGUN = '2026-10-11';

describe('/screen doğrulama', () => {
  test('geçerli özet: .exe atılır, 1 dk altı düşer, süreye göre sıralı', () => {
    const r = js(ctx.T({ date: BUGUN, toplamSn: 7230, apps: [{ ad: 'Code.exe', sn: 1800 }, { ad: 'chrome.exe', sn: 5400 }, { ad: 'x.exe', sn: 30 }],
      sites: [{ ad: 'youtube.com', sn: 3000 }] }, BUGUN));
    assert.deepStrictEqual(r, { date: BUGUN, toplamSn: 7230, apps: [{ ad: 'chrome', sn: 5400 }, { ad: 'Code', sn: 1800 }], sites: [{ ad: 'youtube.com', sn: 3000 }] });
  });
  test('🔒 gelecek / 7 günden eski / 24 saati aşan / boş → null', () => {
    const app = [{ ad: 'chrome', sn: 600 }];
    assert.strictEqual(ctx.T({ date: '2026-10-12', apps: app }, BUGUN), null);
    assert.strictEqual(ctx.T({ date: '2026-10-01', apps: app }, BUGUN), null);
    assert.strictEqual(ctx.T({ date: BUGUN, toplamSn: 90000, apps: app }, BUGUN), null);
    assert.strictEqual(ctx.T({ date: BUGUN, apps: [] }, BUGUN), null);
    assert.strictEqual(ctx.T(null, BUGUN), null);
    assert.strictEqual(ctx.T({ date: 'dün', apps: app }, BUGUN), null);
  });
  test('toplam yoksa kalemlerden; en fazla 25 kalem; kontrol karakteri temizlenir', () => {
    const apps = Array.from({ length: 40 }, (_, i) => ({ ad: 'a\u0007' + i, sn: 100 + i }));
    const r = js(ctx.T({ date: BUGUN, apps }, BUGUN));
    assert.strictEqual(r.apps.length, 25);
    assert.strictEqual(r.toplamSn, apps.slice(0).reduce((s, x) => s + x.sn, 0));
    assert.ok(r.apps.every(x => !/\u0007/.test(x.ad)));
  });
  test('uç: secret zorunlu (404), aidan_screen tablosuna yazar, blob\'a DEĞİL', () => {
    const h = W.slice(W.indexOf('async function handleScreenApi('), W.indexOf('async function ekranOku('));
    assert.match(h, /given !== env\.WEBHOOK_SECRET\) return new Response\('Not found', \{ status: 404/);
    assert.match(h, /\/rest\/v1\/aidan_screen\?on_conflict=user_id,day,cihaz/);
    assert.ok(!/saveAidan|aidan_data/.test(h), 'blob\'a yazmamalı');
    assert.match(W, /if \(url\.pathname === '\/screen'\) \{\s*return handleScreenApi\(request, env\);/);
  });
  test('sohbet: tablo paralel okunur, okuma ASLA fırlatmaz, blob\'a yazılmaz', () => {
    assert.match(W, /ekranOku\(env, userToken, user\.id, todayStr\),\s*\]\);/);
    const e = W.slice(W.indexOf('async function ekranOku('), W.indexOf('async function ekranOku(') + 700);
    assert.match(e, /catch \(_\) \{ return \[\]; \}/);
    assert.match(W, /d\.__ekran = ekranRows;/);
  });
});

describe('[KAYITLAR] BİLGİSAYAR satırı', () => {
  const BLOK = W.slice(W.indexOf('// 🤖 SOHBET AJANI (5 Eki 2026)'), W.indexOf('// 🤖 SOHBET AJANI SONU'));
  const c2 = { console, Date, JSON, Math, String, Array, Object, Set, Map, Error, Promise, Number, isNaN, memHeaders: () => ({}) };
  vm.createContext(c2);
  vm.runInContext(BLOK + '\nthis.K = agentKayitlar;', c2);
  test('bugün + 7 gün + en çok program/site (kod hesaplar)', () => {
    const k = c2.K({ __ekran: [
      { day: '2026-10-11', data: { toplamSn: 7200, apps: [{ ad: 'chrome', sn: 5400 }, { ad: 'Code', sn: 1800 }], sites: [{ ad: 'youtube.com', sn: 3600 }] } },
      { day: '2026-10-10', data: { toplamSn: 3600, apps: [{ ad: 'chrome', sn: 3600 }], sites: [] } },
      { day: '2026-09-01', data: { toplamSn: 99999, apps: [{ ad: 'eski', sn: 99999 }] } },
    ] }, BUGUN);
    assert.match(k, /BİLGİSAYAR \(aktif süre\): bugün 2 sa \[chrome 1\.5 sa, Code 0\.5 sa\] · son 7 gün 3 sa \(2 gün, günlük ort\. 1\.5 sa\)/);
    assert.match(k, /en çok program: chrome 2\.5 sa, Code 0\.5 sa · en çok site: youtube\.com 1 sa/);
    assert.ok(!/eski/.test(k), '7 günden eski kayıt girmez');
  });
  test('kayıt yoksa uydurmaz', () => {
    assert.match(c2.K({}, BUGUN), /BİLGİSAYAR: kayıt yok/);
  });
});

describe('Windows betikleri (pc/)', () => {
  const R = path.join(__dirname, '..');
  const ham = (f) => fs.readFileSync(path.join(R, f));
  for (const f of ['pc/aidan-ekran.ps1', 'pc/kur.ps1', 'pc/kur.bat', 'pc/kaldir.bat', 'pc/gizli-calistir.vbs']) {
    test(f + ': ASCII + CRLF', () => {
      const b = ham(f);
      assert.ok(b.every(x => x < 128), 'Türkçe karakter PowerShell 5.1/cmd\'de bozulur');
      const s = b.toString();
      assert.ok(s.includes('\r\n') && !/[^\r]\n/.test(s), 'CRLF olmalı');
    });
  }
  test('gönderici: secret başlıkta, /screen\'e, ActivityWatch AFK süresini saymaz', () => {
    const s = readText('pc/aidan-ekran.ps1');
    assert.match(s, /'X-Aidan-Secret' = \$secret/);
    assert.match(s, /workers\.dev\/screen/);
    assert.match(s, /filter_period_intersect\(w, not_afk\)/);
    assert.match(s, /Get-Content \$ayar/);
  });
  test('🔒 gizli anahtar dosyası git\'e GİRMEZ; pc/ CRLF kuralı borsa\'dan önce', () => {
    assert.match(readText('.gitignore'), /^\/pc\/ayar\.txt$/m);
    const a = readText('.gitattributes');
    assert.match(a, /^pc\/\*\*\s+text eol=crlf$/m);
    assert.ok(a.indexOf('pc/**') < a.indexOf('borsa/**        text eol=lf'));
  });
});
