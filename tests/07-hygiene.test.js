/**
 * 07 — PROJE HIJYENI
 *
 * CLAUDE.md'deki KALICI KURALLARI dokumantasyondan TESTE cevirir. Bir kural
 * sadece yaziyorsa unutulur; test olursa deploy'u durdurur.
 *
 * Kilitlenen kurallar:
 *  1. Satir sonu disiplini (styles.css LF, digerleri CRLF)
 *  2. `new Date().toISOString().slice(0,10)` yasagi (v7-119 saat dilimi bug'i)
 *  3. Cloudflare ucretsiz plan: worker basina EN FAZLA 3 cron
 *  4. Deploy edilen dosya listesi ile sw.js/asistan.html tutarliligi
 *  5. Sozdizimi (node --check karsiligi)
 *  6. Olu dosya birikmesi
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT, readRaw, readText } = require('./helpers/src');

const LF_DOSYALAR = ['styles.css'];
const CRLF_DOSYALAR = [
  'core.js', 'ui.js', 'tasks.js', 'stocks.js', 'sw.js', 'asistan.html',
  'aidan-worker/worker.js', 'CLAUDE.md',
];

describe('satir sonu disiplini', () => {
  for (const f of CRLF_DOSYALAR) {
    test(f + ' CRLF', () => {
      const b = readRaw(f);
      const crlf = (b.toString('binary').match(/\r\n/g) || []).length;
      const lf = (b.toString('binary').match(/\n/g) || []).length;
      assert.ok(crlf > 0, f + ' hic CRLF icermiyor');
      assert.strictEqual(lf, crlf,
        f + ' karisik satir sonu: ' + lf + ' LF, ' + crlf + ' CRLF. ' +
        'Python byte-replace yaparken `\\r\\n` kullan (CLAUDE.md duzenleme kurali).');
    });
  }

  for (const f of LF_DOSYALAR) {
    test(f + ' LF (tek basina)', () => {
      const s = readRaw(f).toString('binary');
      assert.ok(!/\r\n/.test(s), f + ' CRLF olmus — bu dosya LF kalmali');
    });
  }
});

describe('saat dilimi yasagi', () => {
  test('isoLocal disinda ham toISOString().slice(0,10) YOK', () => {
    // v7-119: 21 ham cagri saat diliminden dolayi 00:00-03:00 arasi yanlis
    // gun uretiyordu. Yeni kodda ASLA yazilmaz.
    const ihlal = [];
    for (const f of ['core.js', 'ui.js', 'tasks.js', 'stocks.js']) {
      const satirlar = readText(f).split(/\r?\n/);
      satirlar.forEach((s, i) => {
        if (!/toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(s)) return;
        // isoLocal'in kendi govdesi tek mesru kullanim
        if (/getTimezoneOffset/.test(s)) return;
        ihlal.push(f + ':' + (i + 1) + ' -> ' + s.trim());
      });
    }
    assert.deepStrictEqual(ihlal, [],
      'ham toISOString kullanimi: isoLocal(d) / today() / shiftDateStr() kullan');
  });
});

describe('cron siniri (Cloudflare ucretsiz plan)', () => {
  test('wrangler.toml en fazla 3 cron tanimlar', () => {
    // Fazlasi Cloudflare\'de HIC kaydolmaz ve sessizce duser — Agustos 2026\'da
    // 6 ozellik (takviye nag, blok bildirimi, deadline, haftalik, borsa, yedek)
    // aylarca bu yuzden oluydu.
    const t = readText('aidan-worker/wrangler.toml');
    const blok = /crons\s*=\s*\[([\s\S]*?)\]/.exec(t);
    assert.ok(blok, 'crons blogu bulunamadi');
    const sayi = (blok[1].match(/"[^"]+"/g) || []).length;
    assert.ok(sayi <= 3,
      sayi + ' cron tanimli. Ucretsiz plan 3 kabul eder, fazlasi SESSIZCE duser. ' +
      'Yeni zamanli isi worker.js scheduled() icine `if (at(h,m))` olarak ekle.');
  });

  test('is dagitimi worker.js scheduled() icinde yapiliyor', () => {
    const wk = readText('aidan-worker/worker.js');
    assert.ok(/async\s+scheduled\s*\(|scheduled\s*\(\s*event/.test(wk), 'scheduled() bulunamadi');
    assert.ok(/function at\s*\(|const at\s*=/.test(wk),
      'at(h,m) zaman penceresi yardimcisi yok — is dagitimi nasil yapiliyor?');
  });
});

describe('deploy tutarliligi', () => {
  const deploy = readText('aidan-pages-deploy.py');
  const sw = readText('sw.js');
  const html = readText('asistan.html');

  test('asistan.html\'in yukledigi her script deploy listesinde var', () => {
    const scriptler = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''));
    assert.ok(scriptler.length >= 5, 'script etiketi bulunamadi');
    const eksik = scriptler.filter((s) => !deploy.includes('"' + s + '"'));
    assert.deepStrictEqual(eksik, [],
      'bu dosyalar deploy INCLUDE listesinde YOK — canlida 404 verir');
  });

  test('asistan.html\'in yukledigi her stylesheet deploy listesinde var', () => {
    const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
      .map((m) => m[1]).filter((h) => !/^https?:/.test(h)).map((h) => h.replace(/^\//, ''));
    const eksik = css.filter((s) => !deploy.includes('"' + s + '"'));
    assert.deepStrictEqual(eksik, [], 'CSS deploy listesinde yok');
  });

  test('sw.js\'in on-belleklediği her dosya deploy listesinde var', () => {
    const blok = /const ASSETS = \[([\s\S]*?)\]/.exec(sw);
    assert.ok(blok, 'ASSETS bulunamadi');
    const yollar = (blok[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1))
      .filter((p) => p !== '/').map((p) => p.replace(/^\//, ''));
    const eksik = yollar.filter((p) => !deploy.includes('"' + p + '"'));
    assert.deepStrictEqual(eksik, [],
      'sw.js bu dosyalari on-bellege almaya calisiyor ama deploy edilmiyorlar -> ' +
      'install asamasi patlar ve SW hic aktif olmaz');
  });

  test('deploy edilen her dosya diskte VAR', () => {
    const yollar = [...deploy.matchAll(/\(\s*"([^"]+)"\s*,\s*"\/[^"]*"\s*\)/g)].map((m) => m[1]);
    assert.ok(yollar.length >= 10, 'INCLUDE listesi okunamadi');
    const yok = yollar.filter((f) => !fs.existsSync(path.join(ROOT, f)));
    assert.deepStrictEqual(yok, [], 'deploy listesindeki dosya diskte yok');
  });

  test('sw.js cache versiyonu aidan-v7-NN formatinda', () => {
    const m = /const CACHE = '(aidan-v7-\d+)'/.exec(sw);
    assert.ok(m, 'cache versiyonu okunamadi — her buyuk degisikte artirilmali');
  });
});

describe('yukleme sirasi bagimliligi', () => {
  // 5 dosya TEK global scope'ta, sirayla yuklenir: core -> tasks -> stocks -> ui.
  // Erken yuklenen bir dosya, gec yuklenen bir dosyada tanimli fonksiyonu
  // MODUL GOVDESINDE (init sirasinda) cagirirsa "not defined" ile comer —
  // 6 Agu 2026 TDZ cokusunun ayni sinifi. escapeHtml tam bu durumdaydi:
  // tanim ui.js'te, 145 cagrinin cogu core/tasks/stocks icinde.
  const SIRA = ['core.js', 'tasks.js', 'stocks.js', 'ui.js'];

  test('escapeHtml core.js\'te tanimli (ui.js\'te DEGIL)', () => {
    assert.ok(/function escapeHtml\s*\(/.test(readText('core.js')),
      'escapeHtml core.js\'te tanimli olmali — ilk yuklenen dosya');
    for (const f of ['tasks.js', 'stocks.js', 'ui.js']) {
      assert.ok(!/function escapeHtml\s*\(/.test(readText(f)),
        f + ' escapeHtml\'i yeniden tanimliyor — ayni isim iki kez, sonuncusu sessizce kazanir');
    }
  });

  test('paylasilan yardimcilar erken dosyada tanimli', () => {
    // Cok dosyadan cagrilan saf yardimcilar. Her biri, kendisini KULLANAN en
    // erken dosyada ya da ondan once tanimlanmis olmali.
    const YARDIMCILAR = ['escapeHtml', 'isoLocal', 'today', 'shiftDateStr'];
    const kaynak = Object.fromEntries(SIRA.map((f) => [f, readText(f)]));
    const ihlal = [];
    for (const fn of YARDIMCILAR) {
      const tanimSira = SIRA.findIndex((f) =>
        new RegExp('function\\s+' + fn + '\\s*\\(').test(kaynak[f]));
      if (tanimSira === -1) continue;  // baska yerde tanimliysa bu test kapsam disi
      const ilkKullanim = SIRA.findIndex((f) =>
        new RegExp('[^\\w.]' + fn + '\\s*\\(').test(kaynak[f]));
      if (ilkKullanim !== -1 && ilkKullanim < tanimSira) {
        ihlal.push(fn + ': ' + SIRA[ilkKullanim] + ' kullaniyor ama tanim ' + SIRA[tanimSira]);
      }
    }
    assert.deepStrictEqual(ihlal, [],
      'yardimci fonksiyon kendisini kullanan dosyadan SONRA tanimlanmis');
  });
});

describe('sozdizimi', () => {
  for (const f of ['core.js', 'tasks.js', 'stocks.js', 'ui.js', 'sw.js', 'aidan-worker/worker.js']) {
    test('node --check ' + f, () => {
      execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
    });
  }
});

describe('olu dosya birikmesi', () => {
  test('yedek/olu dosyalar repoda durmuyor', () => {
    // Temmuz 2026\'da iki kopya repo karisikligi bir seansin yanlis tabana
    // yazilmasina yol acti. Olu kopyalar diskte durursa tekrar eder.
    const olu = ['app.js', 'app.js.bak', 'asistan.html.bak',
                 'aidan-worker/worker.js.pre-llama4', 'netlify.toml',
                 // 8 Agu 2026 denetiminde bulunanlar
                 'blackjack.html',  // deploy listesinde yok, _redirects 404'e yolluyor
                 'probe.txt'];
    const duran = olu.filter((f) => fs.existsSync(path.join(ROOT, f)));
    assert.deepStrictEqual(duran, [],
      'olu dosyalar silinmeli (deploy edilmiyorlar ama karisiklik uretiyorlar)');
  });

  test('SILINECEK-DOSYALAR klasoru bosaltilmis', () => {
    // Sandbox `rm` yapamadigi icin olu dosyalar buraya tasindi. Salim klasoru
    // silene kadar bu test kirmizi kalir — hatirlatici gorevi gorur.
    assert.ok(!fs.existsSync(path.join(ROOT, 'SILINECEK-DOSYALAR')),
      'SILINECEK-DOSYALAR klasorunu sil (icindeki OKU-VE-SIL.txt aciklıyor)');
  });

  test('.gitignore hassas dosyalari kapsiyor', () => {
    const g = readText('.gitignore');
    for (const d of ['.env', '*.env', '__pycache__/']) {
      assert.ok(g.includes(d), '.gitignore icinde ' + d + ' yok');
    }
  });

  test('node_modules commit edilmiyor', () => {
    assert.ok(readText('.gitignore').includes('node_modules'),
      'node_modules .gitignore\'da olmali — test bagimliliklari repoya girmesin');
  });
});
