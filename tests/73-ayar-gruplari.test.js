/**
 * 73 — AYARLAR GRUPLARI (8 Kas 2026, düzen 2. tur)
 *
 * Ayarlar 17 ayrı kart / ~5000 px idi (telefonda 13 ekran boyu). Satırlar 5 açılır
 * gruba taşınır; kapalıyken sayfa tek ekrana sığar.
 *
 * Kilitlenenler:
 *  - KAPI: Ayarlar açılınca çağrılan renderStorageInfo ayarGrupla'yı çağırır
 *  - bilinen her satır bir gruba girer, id'ler korunur, panelde başıboş satır kalmaz
 *  - gruplar kapalı başlar; "Her şeyi sıfırla" Veri grubunun EN SONUNDA
 *  - ikinci çağrı (sekme tekrar açılınca) grup ya da satır çoğaltmaz
 *  - sağlık verisi gelmiyorsa Bağlantılar başlığı açmadan uyarır
 *  - Ayarlar'da dolu (accent) düğme sayısı ≤ 2 (Kaydet + Kopyala hariç hepsi ikincil)
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

describe('Ayarlar grupları', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'ayarlar.js', 'ogun.js'] });
  after(() => A.close());
  const doc = A.window.document;
  const ac = () => A.evalIn("data.saglikTani = null; data.health = []; data.sleep = []; renderStorageInfo()");

  test('kapı: renderStorageInfo → ayarGrupla', () => {
    assert.match(readText('ayarlar.js'), /renderHareketAyar\(\);[^\n]*\r?\n\s*ayarGrupla\(\);/);
  });

  test('5 grup, sıralı, kapalı başlar; panelde başıboş satır yok', () => {
    ac();
    const panel = doc.getElementById('settings');
    const gruplar = [...panel.querySelectorAll(':scope > details.ayar-grup')].map(d => d.id);
    assert.deepStrictEqual(gruplar, ['agBildirim', 'agPlan', 'agAi', 'agBag', 'agVeri']);
    for (const d of panel.querySelectorAll('details.ayar-grup')) assert.strictEqual(d.open, false, d.id + ' açık başladı');
    assert.strictEqual(panel.querySelectorAll(':scope > .settings-row').length, 0, 'gruba girmemiş satır var');
  });

  test('id\'ler korunur, doğru gruptalar', () => {
    ac();
    const yer = { notifSettings: 'agBildirim', muteState: 'agBildirim', fixedRemindersList: 'agBildirim', hareketAyarRow: 'agBildirim',
      autoPlanChk: 'agPlan', fixedScheduleList: 'agPlan', countdownManageList: 'agPlan', calendarSyncBox: 'agPlan',
      displayName: 'agAi', aiInstructions: 'agAi', memList: 'agAi',
      saglikTaniRow: 'agBag', hevyStatus: 'agBag', supaSetupBox: 'agBag', inviteSection: 'agBag',
      importFile: 'agVeri', backupDetails: 'agVeri', storageInfo: 'agVeri' };
    for (const [id, g] of Object.entries(yer)) {
      const el = doc.getElementById(id);
      assert.ok(el, id + ' yok');
      assert.strictEqual(el.closest('details.ayar-grup').id, g, id + ' yanlış grupta');
    }
  });

  test('sıfırla düğmesi Veri grubunun sonunda; tekrar çağrı çoğaltmaz', () => {
    ac(); ac();
    assert.strictEqual(doc.querySelectorAll('#agVeri').length, 1);
    assert.strictEqual(doc.querySelectorAll('#hareketAyarRow').length, 1);
    const son = doc.querySelector('#agVeri .ag-govde').lastElementChild;
    assert.ok(son.querySelector('button.danger'), 'son satır sıfırla değil');
  });

  test('sağlık verisi yoksa Bağlantılar başlığı uyarır', () => {
    ac();
    const alt = doc.querySelector('#agBag .ag-alt');
    assert.ok(alt.classList.contains('ag-uyari'));
    assert.match(alt.textContent, /Sağlık verisi gelmiyor/);
  });

  test('statik Ayarlar düğmelerinde dolu düğme ≤ 1 (Kaydet)', () => {
    const html = readText('asistan.html');
    const s = html.slice(html.indexOf('<div id="settings" class="panel">'), html.indexOf('<div id="chat" class="panel">'));
    const dolu = [...s.matchAll(/<button class="small"[^>]*>/g)].map(m => m[0]);
    assert.ok(dolu.length <= 1, 'dolu düğmeler: ' + dolu.join(' | '));
  });
});
