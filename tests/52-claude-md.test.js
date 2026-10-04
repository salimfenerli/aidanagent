/**
 * 52 — CLAUDE.md BÜTÇESİ (5 Eki 2026)
 *
 * CLAUDE.md her oturumda Claude'un bağlamına otomatik yüklenir. Seans
 * günlükleri biriktikçe 347 KB'a (~90 bin token) çıkmıştı: asıl kurallar
 * gürültüde kayboluyor, her oturum pahalılaşıyordu.
 *
 * Kural: tavan 30 KB. Aşılırsa CI kırmızı → deploy çıkmaz.
 * ⚠️ Eşiği YÜKSELTME. Eskimiş maddeyi sil/birleştir, günlüğü CHANGELOG.md'ye taşı.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { readText } = require('./helpers/src');

const TAVAN = 30 * 1024;
const md = readText('CLAUDE.md');

test('CLAUDE.md 30 KB tavanının altında', () => {
  const boyut = Buffer.byteLength(md, 'utf8');
  assert.ok(boyut <= TAVAN,
    `CLAUDE.md ${Math.round(boyut / 1024)} KB — tavan 30 KB. Seans günlüğünü CHANGELOG.md'nin en üstüne taşı, ` +
    'eskimiş kuralları birleştir. Eşiği yükseltme.');
});

test('dosyanın kendi kuralı başta duruyor (silinirse şişme geri gelir)', () => {
  assert.ok(md.indexOf('## 📏 BU DOSYANIN KURALI') >= 0 && md.indexOf('## 📏 BU DOSYANIN KURALI') < 300);
});

test('tarihli seans günlüğü başlığı yok — günlük CHANGELOG.md\'ye gider', () => {
  const gunluk = md.match(/^#{2,3} .*\b\d{1,2} (Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık) 20\d\d\b/gm) || [];
  assert.strictEqual(gunluk.length, 0, 'tarihli başlık bulundu: ' + gunluk.join(' | '));
});
