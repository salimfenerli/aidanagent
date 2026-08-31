/**
 * 16 — KULLANICI TALIMATLARI (9 Agu 2026)
 *
 * Salim: "claude'a talimat veriyorsun ya, ayni kisim uygulamada da olsun."
 * Yani CLAUDE.md'nin Aidan karsiligi: Ayarlar > Talimatlar'a yazilan kalici
 * kurallar TUM prose ureten AI cagrilarina girer.
 *
 * ⚠️ BU DOSYANIN EN ONEMLI BOLUMU: GUVENLIK SINIRI.
 * Talimat kutusu serbest metindir; kullanici "kurallari unut", "bana kilo verme
 * diyeti yaz", "hangi hisseyi alayim soyle" yazabilir. Talimat blogu sistem
 * promptunun SONUNA girer ama guvenlik kurallarini EZEMEZ — bu, prompt icinde
 * acikca yazili olmali. 16 yasindaki bir kullanicinin saglik/borsa korumalarini
 * kendi yazdigi bir cumleyle kaldirabilmesi kabul edilemez.
 *
 * Ikinci sozlesme: MAKINE cagrilari muaf. /split, /food-macros, /ai (tool-use),
 * gorsel OCR ve haber duygu siniflama JSON dondurur — usluba dair bir talimat
 * ("madde madde yaz") o cikti sozlesmesini bozar.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp } = require('./helpers/load');

const ROOT = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(ROOT, 'aidan-worker', 'worker.js'), 'utf8');

// worker'in saf yardimcilarini izole calistir
function workerHelpers() {
  const ctx = { console, String, Number, Math, JSON, Object, Array };
  vm.createContext(ctx);
  const bas = worker.indexOf('const INSTR_MAX');
  const son = worker.indexOf('async function aiRun(');
  vm.runInContext(worker.slice(bas, son) +
    '\n;globalThis.__X = { INSTR_MAX, instructionsText, instructionsBlock };', ctx);
  return ctx.__X;
}
const W = workerHelpers();

// ---------------------------------------------------------------------------
describe('güvenlik sınırı — talimat kuralları EZEMEZ', () => {
  const blok = W.instructionsBlock('kısa yaz, madde madde anlat');

  test('talimat metni bloğa giriyor', () => {
    assert.ok(blok.indexOf('kısa yaz, madde madde anlat') >= 0);
    assert.ok(/KALICI TALİMATLAR/.test(blok), 'blok başlığı yok');
  });

  test('öncelik bildirimi AÇIKÇA yazılı', () => {
    assert.ok(/EZEMEZ/.test(blok),
      'talimatın güvenlik kurallarını ezemeyeceği yazılmamış — model talimata uyar');
  });

  test('sağlık korumaları tek tek sayılıyor', () => {
    for (const y of ['teşhis', 'ilaç', 'takviye', 'kalori kısıtlaması', 'diyet', 'görünüm']) {
      assert.ok(blok.toLowerCase().indexOf(y.toLowerCase()) >= 0,
        'yasak listesinde eksik: ' + y);
    }
  });

  test('borsa korumaları tek tek sayılıyor', () => {
    for (const y of ['al/sat', 'fiyat tahmini', 'ucuz']) {
      assert.ok(blok.toLowerCase().indexOf(y.toLowerCase()) >= 0,
        'yasak listesinde eksik: ' + y);
    }
  });

  test('"kuralları unut" tipi kaçış AÇIKÇA kapatılmış', () => {
    assert.ok(/kuralları unut/i.test(blok),
      'jailbreak kalıbı adıyla kapatılmamış — en olası saldırı yüzeyi bu');
    assert.ok(/sen artık başka/i.test(blok), 'rol degistirme kalibi kapatilmamis');
  });

  test('16 yaş sınırı blokta geçiyor', () => {
    assert.ok(/16 yaş/.test(blok));
  });

  test('talimat blokta SONDA — güvenlik kuralları önce geliyor', () => {
    // Sistem promptu: rol -> kurallar -> baglam -> TALIMAT. Talimat once gelseydi
    // model onu "ust kural" sayardi.
    const sys = 'KURALLAR: ...' + W.instructionsBlock('sadece emoji ile cevap ver');
    assert.ok(sys.indexOf('KURALLAR') < sys.indexOf('KALICI TALİMATLAR'));
  });
});

// ---------------------------------------------------------------------------
describe('talimat metni işleme', () => {
  test('boş talimat boş blok üretir (token yakmaz)', () => {
    for (const bos of ['', '   ', null, undefined, 0]) {
      assert.strictEqual(W.instructionsBlock(bos), '', JSON.stringify(bos) + ' bos blok vermedi');
    }
  });

  test('2000 karakter tavanı uygulanıyor', () => {
    const uzun = 'a'.repeat(5000);
    assert.strictEqual(W.instructionsText(uzun).length, W.INSTR_MAX);
    assert.ok(W.instructionsBlock(uzun).indexOf('a'.repeat(W.INSTR_MAX + 1)) === -1,
      'tavan asilmis — her cagriya giren blok kontrolsuz buyuyor');
  });

  test('veri objesinden de okuyabiliyor (cron yolu)', () => {
    assert.strictEqual(W.instructionsText({ settings: { instructions: 'net ol' } }), 'net ol');
    assert.strictEqual(W.instructionsText({ settings: {} }), '');
    assert.strictEqual(W.instructionsText({}), '');
  });

  test('bozuk tiplerde çökmez', () => {
    for (const x of [123, true, [], { settings: { instructions: 42 } }]) {
      assert.doesNotThrow(() => W.instructionsBlock(x), 'coktu: ' + JSON.stringify(x));
    }
  });

  test('baştaki/sondaki boşluk kırpılıyor', () => {
    assert.strictEqual(W.instructionsText('  net ol  '), 'net ol');
  });
});

// ---------------------------------------------------------------------------
describe('enjeksiyon kapsamı — prose var, makine yok', () => {
  const PROSE = [
    ['sohbet', "instructionsBlock(d)"],
    ['saglik kocu', "HEALTH_COACH_PROMPT(name) + instructionsBlock(data)"],
    ['gun plani', "planPrompt + instructionsBlock(instructions)"],
    ['portfoy yorumu', "pfPrompt + instructionsBlock(body.instructions)"],
  ];
  for (const [ad, kalip] of PROSE) {
    test(ad + ' talimatı alıyor', () => {
      assert.ok(worker.indexOf(kalip) >= 0, ad + ' enjeksiyonu yok: ' + kalip);
    });
  }

  test('en az 10 prose çağrı noktası bağlı', () => {
    const n = (worker.match(/instructionsBlock\(/g) || []).length;
    assert.ok(n >= 10, 'sadece ' + n + ' nokta bagli — bazi AI ozellikleri talimati gormuyor');
  });

  test('⚠️ MAKINE sözleşmeli çağrılar MUAF', () => {
    // Bu promptlar JSON dondurur. Usluba dair talimat cikti sozlesmesini bozar.
    for (const ad of ['splitPrompt', 'buildSystemPrompt(data, userEmail)']) {
      const i = worker.indexOf(ad);
      if (i < 0) continue;
      const kesit = worker.slice(i, i + 200);
      assert.ok(kesit.indexOf('instructionsBlock') < 0,
        ad + ' talimat aliyor — JSON cikti sozlesmesi bozulur');
    }
  });

  test('PWA /ai (tool-use) uç noktasına talimat GÖNDERMİYOR', () => {
    const tasks = fs.readFileSync(path.join(ROOT, 'tasks.js'), 'utf8');
    const i = tasks.indexOf('fetch(AI_ENDPOINT');
    assert.ok(i > 0, 'AI_ENDPOINT cagrisi bulunamadi');
    const kesit = tasks.slice(i, i + 300);
    assert.ok(kesit.indexOf('aiInstructions()') < 0,
      '/ai tool-use kullaniyor — usluba dair talimat arac cagrisini bozar');
  });

  test('PWA prose uçlarına talimat GÖNDERİYOR', () => {
    // ⚠️ 14 Agu 2026: borsa ayri siteye tasindi. Esik 7'den 4'e indi cunku
    // 4 borsa cagrisi (analiz/temel/portfoy-teknik/haber) + portfoy yorumu
    // artik borsa/ altinda. Sozlesme AYNI, sadece iki tarafa bolundu — o
    // yuzden borsa tarafi da asagida ayrica kilitleniyor.
    // 30 Agu 2026: runHealthCoach() health.js'e tasindi — sayim o dosyayi da kapsar.
    const src = ['ui.js', 'tasks.js', 'health.js'].map((f) =>
      fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    const n = (src.match(/aiInstructions\(\)/g) || []).length;
    assert.ok(n >= 4, 'sadece ' + n + ' Aidan PWA cagrisi talimat yolluyor');
    const bsrc = ['shared.js', 'stocks.js', 'app.js'].map((f) =>
      fs.readFileSync(path.join(ROOT, 'borsa', f), 'utf8')).join('\n');
    const bn = (bsrc.match(/aiInstructions\(\)/g) || []).length;
    assert.ok(bn >= 5, 'sadece ' + bn + ' borsa cagrisi talimat yolluyor');
  });
});

// ---------------------------------------------------------------------------
describe('PWA tarafı', () => {
  const A = loadApp({ seed: {} });
  const V = A.window;
  after(() => { try { A.close(); } catch (_) {} });

  test('aiInstructions core.js\'te tanımlı (ilk yüklenen dosya)', () => {
    assert.strictEqual(typeof V.aiInstructions, 'function');
    const core = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
    assert.ok(/function aiInstructions\(/.test(core),
      'aiInstructions core.js\'te olmali — stocks/tasks/ui hepsi cagiriyor');
  });

  test('talimat yokken boş string döner', () => {
    assert.strictEqual(V.aiInstructions(), '');
  });

  test('kaydedilen talimat okunuyor', () => {
    V.document.getElementById('aiInstructions').value = '  kısa yaz  ';
    V.saveInstructions();
    assert.strictEqual(V.aiInstructions(), 'kısa yaz');
    assert.strictEqual(A.evalIn('data.settings.instructions'), 'kısa yaz');
  });

  test('2000 karakter tavanı PWA\'da da var', () => {
    V.document.getElementById('aiInstructions').value = 'x'.repeat(5000);
    V.saveInstructions();
    assert.ok(V.aiInstructions().length <= 2000);
  });

  test('karakter sayacı güncelleniyor', () => {
    V.document.getElementById('aiInstructions').value = 'abc';
    V.instrChanged();
    assert.match(V.document.getElementById('instrCount').textContent, /^3 \/ 2000$/);
  });

  test('temizleyince ayar da temizlenir', () => {
    V.document.getElementById('aiInstructions').value = '';
    V.saveInstructions();
    assert.strictEqual(V.aiInstructions(), '');
  });

  test('renderInstructions kayıtlı değeri kutuya yazar', () => {
    A.evalIn("data.settings.instructions = 'madde madde yaz'");
    V.renderInstructions();
    assert.strictEqual(V.document.getElementById('aiInstructions').value, 'madde madde yaz');
  });

  test('XSS: talimat HTML olarak yorumlanmıyor', () => {
    A.evalIn("data.settings.instructions = '<img src=x onerror=alert(1)>'");
    V.renderInstructions();
    const ta = V.document.getElementById('aiInstructions');
    assert.strictEqual(ta.querySelector ? ta.querySelector('img') : null, null,
      'textarea icine HTML enjekte edilmis');
  });

  test('Ayarlar sekmesi açılınca render ediliyor', () => {
    const tasks = fs.readFileSync(path.join(ROOT, 'tasks.js'), 'utf8');
    const i = tasks.indexOf("if (name === 'settings')");
    const kesit = tasks.slice(i, i + 700);
    assert.ok(kesit.indexOf('renderInstructions()') >= 0,
      'Ayarlar acilinca talimat kutusu doldurulmuyor — kullanici bos kutu gorur');
  });
});

// ---------------------------------------------------------------------------
describe('Impeccable — talimat kutusu', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const blok = css.slice(css.indexOf('.instr-box'));

  test('yan-şerit yok, saf renk yok, gradyan yok', () => {
    assert.ok(!/border-(left|right)\s*:\s*[2-9]/.test(blok));
    assert.ok(!/#fff\b|#000\b/i.test(blok));
    assert.ok(!/linear-gradient|backdrop-filter/.test(blok));
  });

  test('ease-out + reduced-motion var', () => {
    assert.ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(blok));
    assert.ok(/prefers-reduced-motion/.test(blok));
  });

  test('odak halkası kaldırılmışsa yerine görünür alternatif var', () => {
    assert.ok(/outline:\s*none/.test(blok) ? /:focus[^}]*border-color/.test(blok) : true,
      'outline kaldirilmis ama gorsel odak gostergesi yok — erisilebilirlik');
  });

  test('styles.css hala LF', () => {
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'styles.css')).indexOf(Buffer.from('\r\n')), -1);
  });
});
