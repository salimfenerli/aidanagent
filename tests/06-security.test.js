/**
 * 06 — GUVENLIK
 *
 * Aidan'da kullanici metni + AI cikisi + Yahoo/Hevy/Open Food Facts gibi
 * DIS kaynaklardan gelen metin innerHTML ile basiliyor. Escape disiplini
 * kirilirsa depolanmis XSS olusur; Supabase token'i ayni origin'de oldugu
 * icin bu ciddi bir risktir.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load');
const { readText } = require('./helpers/src');

const XSS = '<img src=x onerror=alert(1)>';

describe('XSS kacisi', () => {
  test('escapeHtml bes tehlikeli karakteri de kacirir', () => {
    const app = loadApp({ seed: null });
    const e = app.window.escapeHtml;
    assert.strictEqual(e('<'), '&lt;');
    assert.strictEqual(e('>'), '&gt;');
    assert.strictEqual(e('&'), '&amp;');
    assert.strictEqual(e('"'), '&quot;');
    assert.strictEqual(e("'"), '&#39;');
    assert.strictEqual(e(XSS), '&lt;img src=x onerror=alert(1)&gt;');
    // & once kacirilmali, yoksa cift kacis/bozulma olur
    assert.strictEqual(e('&lt;'), '&amp;lt;');
    app.close();
  });

  test('escapeHtml null/undefined/sayi ile patlamaz', () => {
    const app = loadApp({ seed: null });
    const e = app.window.escapeHtml;
    assert.strictEqual(e(null), 'null');
    assert.strictEqual(e(undefined), 'undefined');
    assert.strictEqual(e(42), '42');
    app.close();
  });

  test('chatFormat ONCE escape eder, SONRA markdown uygular', () => {
    const app = loadApp({ seed: null });
    const f = app.window.chatFormat;
    const out = f(XSS);
    assert.ok(!out.includes('<img'), 'AI cikisindan HTML sizdi: ' + out);
    assert.ok(out.includes('&lt;img'), 'escape uygulanmamis');
    // markdown hala calisiyor olmali
    assert.ok(f('**kalin**').includes('<b>kalin</b>'), 'kalin metin bozuldu');
    assert.ok(f('- madde').includes('chat-li'), 'liste bozuldu');
    assert.ok(f('a\nb').includes('<br>'), 'satir sonu bozuldu');
    // markdown ICINDE HTML de kacmis olmali
    assert.ok(!f('**<script>x</script>**').includes('<script>'), 'kalin icinde HTML sizdi');
    app.close();
  });

  test('gorev metnindeki HTML ekrana ham basilmaz', () => {
    const app = loadApp();   // fixture'da XSS iceren gorev var
    app.window.showTab('tasks');
    if (typeof app.window.renderTasks === 'function') app.window.renderTasks();
    const d = app.window.document;
    // Kanit 1: gorev metni/notu icinde canli element olusmadi
    // (Not: document genelinde script aramak yanlis alarm verir — sayfanin
    //  kendi <script> etiketleri ve test yukleyicisinin ekledigi moduller var.)
    const canli = d.querySelectorAll('.task-text *, .task-notes *');
    const tehlikeli = [...canli].filter((el) => /^(SCRIPT|IMG|IFRAME|SVG|OBJECT|EMBED)$/.test(el.tagName));
    assert.deepStrictEqual(tehlikeli.map((e) => e.tagName), [],
      'gorev metninden canli element olustu');
    // Kanit 2: metin kacirilmis haliyle gorunuyor
    const metinler = [...d.querySelectorAll('.task-text')].map((e) => e.textContent);
    assert.ok(metinler.some((t) => t.includes('<img src=x onerror=alert(1)>')),
      'gorev metni hic basilmamis — test bir sey dogrulamiyor');
    app.close();
  });

  test('chat mesaji ekrana basildiginda script elementi olusmaz', () => {
    const app = loadApp({
      seed: { chat: [{ role: 'assistant', content: XSS + '<script>window.__pwned=1</script>', at: Date.now() }] },
    });
    app.window.renderChatMessages();
    const box = app.window.document.getElementById('chatMessages');
    assert.ok(box, 'chatMessages bulunamadi');
    assert.strictEqual(box.querySelectorAll('script, img').length, 0,
      'chat mesajindan canli element olustu');
    assert.strictEqual(app.window.__pwned, undefined);
    app.close();
  });
});

describe('worker guvenlik sozlesmesi', () => {
  const WK = readText('aidan-worker/worker.js');

  test('Supabase-token uclari yalnizca production origin\'e acik', () => {
    // Bearer token'la calisan uclarda CORS joker (*) OLAMAZ: baska bir site
    // kullanicinin oturumuyla Salim adina istek atabilirdi.
    // TEK ISTISNA: /body (iOS Kisayol) — origin'i yok, kimligi X-Aidan-Secret
    // header'i sagliyor, cerez/oturum kullanmiyor. O yuzden orada * mesru.
    const bodyBaslangic = WK.indexOf('async function handleBodyApi');
    assert.ok(bodyBaslangic > 0, 'handleBodyApi bulunamadi — testi guncelle');
    const bodyBitis = WK.indexOf('\nasync function', bodyBaslangic + 10);
    const bodyBlok = WK.slice(bodyBaslangic, bodyBitis > 0 ? bodyBitis : WK.length);
    const digerleri = WK.slice(0, bodyBaslangic) + WK.slice(bodyBitis > 0 ? bodyBitis : WK.length);

    const joker = /Access-Control-Allow-Origin['"]\s*:\s*['"]\*/;
    assert.ok(!joker.test(digerleri),
      'token ile calisan bir ucta CORS joker (*) ile acilmis');
    // /body'de joker var ama secret zorunlulugu ile birlikte olmali
    if (joker.test(bodyBlok)) {
      assert.ok(/WEBHOOK_SECRET/.test(bodyBlok),
        '/body ucu CORS * ile acik AMA secret kontrolu yok — herkes tarti yazabilir');
    }
    // 14 Agu 2026: borsa ayri siteye tasindi, iki origin var. Sabit tek origin
    // yerine ALLOWLIST kullaniliyor. Kritik olan sey degismedi: istegin Origin'i
    // AYNEN YANSITILMAMALI — yansitilsaydi her site kullanicinin oturumuyla bu
    // uclari cagirabilirdi. Asagidaki iki kontrol tam bunu kilitler.
    assert.ok(/const ALLOWED_ORIGINS = \[/.test(WK), 'origin allowlist tanimi bulunamadi');
    assert.ok(WK.includes("'https://aidanapp.pages.dev'") && WK.includes("'https://aidanborsa.pages.dev'"),
      'izinli origin listesi eksik');
    assert.ok(/ALLOWED_ORIGINS\.indexOf\(o\) !== -1 \? o : ALLOWED_ORIGINS\[0\]/.test(WK),
      'origin dogrulanmadan yansitiliyor olabilir — allowlist kontrolu bulunamadi');
    assert.ok(/'Vary': 'Origin'/.test(WK),
      "Vary: Origin yok — onbellek bir origin'in yanitini digerine servis edebilir");
  });

  test('hicbir API anahtari koda gomulmemis', () => {
    // Gercek anahtarlar Worker secret'inda durur; kodda gorunmeleri sizinti demek
    const desenler = [
      /AIza[0-9A-Za-z_-]{30,}/,              // Google API key
      /sk-[A-Za-z0-9]{20,}/,                 // OpenAI benzeri
      /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/,  // JWT (service key)
      /\b[0-9]{9,10}:AA[A-Za-z0-9_-]{30,}/,  // Telegram bot token
    ];
    for (const dosya of ['aidan-worker/worker.js', 'core.js', 'ui.js', 'tasks.js', 'asistan.html', 'borsa/stocks.js', 'borsa/index.html']) {
      const src = readText(dosya);
      for (const d of desenler) {
        const m = d.exec(src);
        assert.ok(!m, dosya + ' icinde gomulu anahtar sizmis: ' + (m && m[0].slice(0, 12)) + '...');
      }
    }
  });

  test('GET cron testi secret zorunlu kiliyor', () => {
    assert.ok(/WEBHOOK_SECRET/.test(WK), 'WEBHOOK_SECRET kontrolu kalkmis — cron ucu spam\'e acik');
  });

  test('heavy (ucretli) katman yalnizca hesap sahibine acik', () => {
    // allowUser multi-user modunda herkese izin veriyordu; baskasi Salim'in
    // faturasini harcayabiliyordu. aiTierForUser bunu kilitler.
    assert.ok(/function aiTierForUser/.test(WK), 'aiTierForUser silinmis — fatura kilidi yok');
    assert.ok(/AIDAN_EMAIL/.test(WK), 'AIDAN_EMAIL kontrolu yok');
  });

  test('serbest akisli sohbet ucretli katmana CIKMAZ', () => {
    // KALICI KURAL: serbest akisli ozellik `heavy` almaz, `deep` alir.
    // Tek istisna: kullanicinin acikca yazdigi /pro komutu.
    const chatBolum = WK.slice(WK.indexOf('function handleChat'), WK.indexOf('function handleChat') + 6000);
    if (chatBolum.length > 100) {
      const heavyKullanimi = (chatBolum.match(/'heavy'/g) || []).length;
      const proVar = /proOnce/.test(chatBolum);
      assert.ok(heavyKullanimi === 0 || proVar,
        'sohbet yolunda kosulsuz heavy kullanimi var — fatura tavani kalkar');
    }
  });
});

describe('_headers guvenlik basliklari', () => {
  const H = readText('_headers');
  for (const baslik of [
    'Content-Security-Policy', 'Strict-Transport-Security', 'X-Frame-Options',
    'Referrer-Policy', 'X-Content-Type-Options', 'Permissions-Policy',
  ]) {
    test(baslik + ' tanimli', () => {
      assert.ok(H.includes(baslik), baslik + ' _headers dosyasindan dusmus');
    });
  }

  test('CSP unsafe-eval icermiyor', () => {
    assert.ok(!/unsafe-eval/.test(H), 'CSP unsafe-eval ile gevsetilmis');
  });

  test('hassas yollar 404\'e gidiyor', () => {
    const R = readText('_redirects');
    for (const yol of ['/CLAUDE.md', '/aidan-mcp/*', '/.env*']) {
      assert.ok(R.includes(yol), yol + ' _redirects korumasindan dusmus');
    }
  });
});
