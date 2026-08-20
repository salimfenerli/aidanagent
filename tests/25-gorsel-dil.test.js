// 25-gorsel-dil.test.js — TEK GORSEL DIL (20 Agu 2026)
//
// Neden var: uygulama iki farkli urunden parca gibi duruyordu. Sebep tek tek
// masum gorunen kararlardi — auth ekrani Dracula paletiyle yazilmis, makro
// grafigi 2024'ten kalma hex'lerle, rozetler satir ici rgba ile. Palet uc kez
// degisti (v10 GECE, v11 MONOKROM) ama bu degerler hicbirinde guncellenmedi
// cunku CSS'te degil JS dizelerinin icindeydiler; :root'u degistirmek onlara
// dokunmuyordu.
//
// Bu dosya kurali kilitler: RENK CSS'TE YASAR. JS token ismi tasir.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const oku = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Renk uretenler. borsa/ ayri site, ayri kural seti (21-borsa) — disarida.
const UI = ['core.js', 'ui.js', 'tasks.js', 'program.js', 'nutrition.js'];

// cssVar() fallback'leri: SVG sunum ozniteliginde var() guvenilir degil,
// oraya gercek deger yazilmali. Tek istisna bu ve token'la ayni olmali.
const IZINLI = new Set(['#5cbf7a', '#ff4444']);

describe('tek gorsel dil — renk', () => {
  test('JS icinde ham hex yok (cssVar fallback disinda)', () => {
    const kacak = [];
    for (const f of UI) {
      const satirlar = oku(f).split(/\r?\n/);
      satirlar.forEach((s, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(s)) return;           // yorum satiri
        for (const m of s.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
          if (IZINLI.has(m[0].toLowerCase())) continue;
          kacak.push(`${f}:${i + 1} ${m[0]}`);
        }
      });
    }
    assert.deepStrictEqual(kacak, [],
      'renk CSS token olmali: var(--danger) / SB_TONE anahtari');
  });

  test('emekli paletlerden eser yok', () => {
    // Dracula (auth ekrani), 2024 GitHub seti (konfeti), emekli amber ve
    // v10 terracotta'nin rgba hali. Hepsi bir donem "gecerli"ydi.
    const olu = ['#ff5555', '#50fa7b', '#ffb86c', '#8be9fd', '#bd93f9', '#6272a4',
                 '#f5a524', '#34c759', '#3fb950', '#f85149', '#1e1e2e', '#2a2a3e',
                 'rgba(224,138,99', 'rgba(210,153,34'];
    for (const f of UI.concat(['asistan.html'])) {
      const src = oku(f);
      for (const renk of olu) {
        assert.ok(!src.includes(renk), `${f} icinde emekli renk: ${renk}`);
      }
    }
  });

  test('renkli dolgu uzerine beyaz metin yok', () => {
    for (const f of UI.concat(['asistan.html'])) {
      const src = oku(f);
      assert.ok(!/color\s*:\s*white/i.test(src), f + ': color:white');
      assert.ok(!/color\s*:\s*#fff\b/i.test(src), f + ': color:#fff');
    }
  });

  test('makro serisi token olarak tanimli ve semantiklerle carpismiyor', () => {
    const css = oku('styles.css');
    const deger = (t) => (css.match(new RegExp('--' + t + ':\\s*([^;]+);')) || [])[1];
    const makro = ['macro-pro', 'macro-carb', 'macro-fat', 'macro-other'].map(deger);
    assert.ok(makro.every(Boolean), 'makro token eksik');
    const semantik = ['success', 'warning', 'danger', 'accent'].map(deger);
    for (const m of makro.slice(0, 3)) {
      assert.ok(!semantik.includes(m),
        'makro serisi semantik renkle ayni deger: ' + m + ' — bir renk tek anlam tasir');
    }
  });

  test('kazanan :root TEK ve en sonda — ara katman olu yuk birakmiyor', () => {
    const css = oku('styles.css');
    const bloklar = [...css.matchAll(/:root \{/g)].map((m) => m.index);
    const son = css.slice(bloklar[bloklar.length - 1], css.indexOf('}', bloklar[bloklar.length - 1]));
    for (const t of ['--bg', '--accent', '--text', '--font-sans', '--success', '--danger']) {
      assert.ok(new RegExp(t + ':').test(son), 'son :root ' + t + ' tanimlamiyor');
    }
  });
});

describe('tek gorsel dil — ikon ve metin', () => {
  // HTML uretilen yerde ikon (icon/dtIcon), metin kanalinda sadece kelime.
  // Bilerek disarida: ⚠️ (guvenlik notu, tek anlami var) ve tasks.js'in AI
  // prompt dizeleri — onlar ekrana degil modele gidiyor, emoji orada bolum
  // isaretcisi.
  const SUS = ['⏰', '⏱', '⏳', '⏸', '⏭', '▶',
               '🟢', '🔴', 'ℹ',
               '🗓', '💪', '📚', '🎓'];

  test('ekrana cikan dizelerde dekoratif emoji yok', () => {
    const kacak = [];
    for (const f of ['core.js', 'ui.js', 'tasks.js', 'asistan.html']) {
      let promptIci = false;   // `\n\n ile acilan cok satirli prompt sablonu
      oku(f).split(/\r?\n/).forEach((s, i) => {
        if (promptIci) { if (s.includes('`')) promptIci = false; return; }
        if (/^\s*(\/\/|\*|\/\*|<!--)/.test(s)) return;   // yorum
        if (/`\\n\\n/.test(s)) {
          // Ekrana degil modele giden metin. Ayni satirda kapanmadiysa devam eder.
          if ((s.split('`').length - 1) % 2 === 1) promptIci = true;
          return;
        }
        for (const e of SUS) if (s.includes(e)) kacak.push(`${f}:${i + 1} ${e}`);
      });
    }
    assert.deepStrictEqual(kacak, [], 'ekrana cikan emoji: icon(...) kullan');
  });

  test('ikon kaydi core.js\'te, dtIcon ile ureiliyor', () => {
    const core = oku('core.js');
    assert.ok(/const ICON_PATHS = \{/.test(core), 'ICON_PATHS yok');
    assert.ok(/function icon\(ad\)/.test(core), 'icon() yok');
    assert.ok(/ICON_PATHS\[ad\] \? dtIcon\(/.test(core), 'icon() dtIcon kullanmali');
  });

  test('durum kutusu escapeHtml\'den geciyor', () => {
    const ui = oku('ui.js');
    const i = ui.indexOf('function showSupaStatus');
    const govde = ui.slice(i, i + 320);
    assert.ok(/escapeHtml\(msg\)/.test(govde),
      'showSupaStatus ham innerHTML yaziyordu — hata mesaji Supabase\'den geliyor');
    assert.ok(/sbTone\(/.test(govde), 'cagri yeri renk degil ton bildirmeli');
  });
});
