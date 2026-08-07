/**
 * 05 — KALICI SOHBET + KAYITLAR (v7-127) ve BUDAMA (v7-120)
 *
 * Sohbet 60 mesajda budanir; KAYITLAR (data.notes) budamadan ETKILENMEZ —
 * onlari kullanici bilinçli sectigi icin antrenman programi/calisma plani
 * kaybolmamali. Budama aktif goreve de dokunmaz.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, iso } = require('./helpers/load');

describe('sohbet kaliciligi', () => {
  test('chatPush tavani CHAT_KEEP (60) ve FIFO', () => {
    const app = loadApp({ seed: { chat: [] } });
    const w = app.window;
    for (let i = 0; i < 75; i++) w.chatPush({ role: 'user', content: 'm' + i });
    const arr = w.ensureChat();
    assert.strictEqual(arr.length, 60, 'tavan 60 olmali');
    assert.strictEqual(arr[0].content, 'm15', 'en eski mesajlar dusmeli (FIFO)');
    assert.strictEqual(arr[59].content, 'm74');
    app.close();
  });

  test('chatPush her mesaja zaman damgasi koyar', () => {
    const app = loadApp({ seed: { chat: [] } });
    const once = Date.now();
    app.window.chatPush({ role: 'user', content: 'selam' });
    const m = app.window.ensureChat()[0];
    assert.ok(typeof m.at === 'number' && m.at >= once, 'at damgasi yok');
    app.close();
  });

  test('ensureChat bozuk veriyi onarir', () => {
    const app = loadApp({ seed: { chat: 'dizi-degil' } });
    assert.ok(Array.isArray(app.window.ensureChat()));
    app.close();
  });

  test('lokal komut mesajlari AI baglamina gonderilmez', () => {
    // /tekrar ve /komutlar AI'a hic gitmez ($0); baglama sizarsa maliyet uretir
    const app = loadApp();
    const gecmis = app.evalIn('_chatHistory');
    const aiye = gecmis.filter((m) => !m.local);
    assert.ok(gecmis.some((m) => m.local), 'fixture lokal mesaj icermeli');
    assert.ok(!aiye.some((m) => m.local), 'lokal mesaj filtrelenmedi');
    app.close();
  });

  test('renderChatMessages bulut pull sonrasi referansi tazeler', () => {
    // Bayat dizi bug'i: pull `data`'yi yeniden atadiginda _chatHistory eski
    // diziyi gostermeye devam ediyordu -> mesajlar ekranda kayboluyordu
    const app = loadApp();
    const d = app.evalIn('data');
    d.chat = [{ role: 'user', content: 'yeni-dizi', at: Date.now() }];
    app.window.renderChatMessages();
    const h = app.evalIn('_chatHistory');
    assert.strictEqual(h[0].content, 'yeni-dizi', '_chatHistory tazelenmedi');
    app.close();
  });
});

describe('kayitlar (data.notes)', () => {
  test('noteAutoTitle markdown isaretlerini temizler', () => {
    const app = loadApp({ seed: null });
    const f = app.window.noteAutoTitle;
    assert.strictEqual(f('## Ev antrenman programi\nicerik'), 'Ev antrenman programi');
    assert.strictEqual(f('\n\n- **Gogus** gunu'), 'Gogus gunu');
    assert.strictEqual(f(''), 'Kayıt');   // bos metinde varsayilan baslik
    assert.strictEqual(f('ab\nanlamli satir'), 'anlamli satir', 'kisa satir atlanmali');
    assert.ok(f('x'.repeat(200)).length <= 60, 'baslik 60 karakterle sinirli');
    app.close();
  });

  test('noteCatLabel bilinmeyen kategoride Genel doner', () => {
    const app = loadApp({ seed: null });
    assert.strictEqual(app.window.noteCatLabel('antrenman'), 'Antrenman');
    assert.strictEqual(app.window.noteCatLabel('ders'), 'Ders');
    assert.strictEqual(app.window.noteCatLabel('diyet'), 'Beslenme');
    assert.strictEqual(app.window.noteCatLabel('yok-boyle'), 'Genel');
    app.close();
  });
});

describe('budama (pruneOldData)', () => {
  test('180 gunden eski BITMIS gorev silinir, AKTIF gorev yasi ne olursa olsun kalir', () => {
    const app = loadApp({
      seed: {
        tasks: [
          { id: 1, text: 'cok eski bitmis', done: true, doneDate: iso(-400) },
          { id: 2, text: 'cok eski AKTIF', done: false, created: 'eski', due: iso(-400) },
          { id: 3, text: 'yeni bitmis', done: true, doneDate: iso(-5) },
        ],
        settings: {},
      },
    });
    const d = app.evalIn('data');
    const kalan = d.tasks.map((t) => t.id);
    assert.ok(!kalan.includes(1), 'eski bitmis gorev silinmeliydi');
    assert.ok(kalan.includes(2), 'AKTIF goreve dokunulmamali (yasi ne olursa olsun)');
    assert.ok(kalan.includes(3), 'yeni bitmis gorev kalmali');
    app.close();
  });

  test('60 gunden eski sohbet mesaji budanir', () => {
    const app = loadApp({
      seed: {
        chat: [
          { role: 'user', content: 'cok eski', at: Date.now() - 90 * 86400000 },
          { role: 'user', content: 'yeni', at: Date.now() - 86400000 },
        ],
        settings: {},
      },
    });
    const d = app.evalIn('data');
    assert.strictEqual(d.chat.length, 1);
    assert.strictEqual(d.chat[0].content, 'yeni');
    app.close();
  });

  test('budama KAYITLARA (notes) ASLA dokunmaz', () => {
    const app = loadApp({
      seed: {
        notes: [
          { id: 1, cat: 'antrenman', title: 'Cok eski program', text: 'x', at: Date.now() - 900 * 86400000 },
          { id: 2, cat: 'ders', title: 'Yeni', text: 'y', at: Date.now() },
        ],
        chat: [{ role: 'user', content: 'eski', at: Date.now() - 90 * 86400000 }],
        settings: {},
      },
    });
    const d = app.evalIn('data');
    assert.strictEqual(d.notes.length, 2,
      'kayitlar budanmis — kullanici bilinçli sectigi icerik kaybolur');
    app.close();
  });

  test('180 gunden eski diyet gunu silinir', () => {
    const days = {};
    days[iso(-400)] = { meals: [], water: 3 };
    days[iso(-10)] = { meals: [], water: 5 };
    const app = loadApp({ seed: { diet: { days, weights: [] }, settings: {} } });
    const d = app.evalIn('data');
    assert.ok(!(iso(-400) in d.diet.days), 'eski diyet gunu silinmeliydi');
    assert.ok(iso(-10) in d.diet.days, 'yeni diyet gunu kalmali');
    app.close();
  });

  test('budama gunde bir kez calisir (lastPrune damgasi)', () => {
    const app = loadApp({ seed: { tasks: [], settings: {} } });
    const w = app.window;
    const d = app.evalIn('data');
    assert.strictEqual(d.settings.lastPrune, w.today(), 'init sonrasi damga atilmali');
    d.tasks = [{ id: 9, text: 'eski', done: true, doneDate: iso(-400) }];
    assert.strictEqual(w.pruneOldData(), false, 'ayni gun tekrar calismamali');
    assert.strictEqual(d.tasks.length, 1, 'tekrar calismadigi icin silinmemeli');
    assert.strictEqual(w.pruneOldData(true), true, 'force ile calismali');
    assert.strictEqual(d.tasks.length, 0);
    app.close();
  });
});
