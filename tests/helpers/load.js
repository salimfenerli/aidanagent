/**
 * Aidan test yardimcilari — PWA'yi jsdom icinde gercek asistan.html ile ayaga kaldirir.
 *
 * NEDEN: 6 Agustos 2026'da core.js sayfa yuklenirken TDZ hatasiyla comustu ve
 * hicbir buton calismiyordu. `node --check` bunu YAKALAMAZ (sozdizimi dogruydu).
 * Bu yukleyici scriptleri gercek sirayla calistirir ve calisma zamani hatasini
 * yakalar — o bug'i yeniden ureten sabotaj testi 01-smoke.test.js icinde.
 *
 * ONEMLI: bos localStorage ile yuklemek YETMEZ. 6 Agustos bug'i sadece
 * `data.chat` doluysa tetikleniyordu. Bu yuzden hem BOS hem DOLU veri ile
 * yukleme test edilir (fixture() asagida).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS = ['core.js', 'tasks.js', 'stocks.js', 'ui.js'];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function iso(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * Gercekci veri seti. Her modulun dokundugu alan temsil edilir, boylece
 * "bos state'te calisiyor ama gercek veride patliyor" sinifi bug yakalanir.
 */
function fixture() {
  const days = {};
  for (let i = 0; i < 40; i++) {
    days[iso(-i)] = {
      meals: [
        { id: 1e6 + i, slot: 'kahvalti', name: 'Yumurta', kcal: 320, protein: 22, carb: 4, fat: 24, at: '08:15' },
        { id: 2e6 + i, slot: 'aksam', name: 'Tavuk pilav', kcal: 780, protein: 52, carb: 88, fat: 18, at: '19:40' },
      ],
      water: 6,
    };
  }
  const sleep = [];
  for (let i = 0; i < 20; i++) {
    sleep.push({
      date: iso(-i),
      bedtime: '23:40', wake: i % 4 === 0 ? '06:10' : '07:30',
      hours: i % 4 === 0 ? 6.5 : 7.83,
      quality: i % 5 === 0 ? 'bad' : i % 3 === 0 ? 'ok' : 'good',
    });
  }
  const weights = [];
  for (let i = 0; i < 30; i += 2) {
    weights.push({ date: iso(-i), kg: 70 + i * 0.05, fat: 18 - i * 0.02, lean: null, src: 'health' });
  }
  return {
    tasks: [
      { id: 1, text: 'Matematik testi coz', done: false, priority: 'urgent', category: 'odev', due: iso(1), estimateMin: 45, subtasks: [{ text: 'ilk 20 soru', done: false }], postponeCount: 3, mitDate: iso(0) },
      { id: 2, text: 'Tarih kitabi 50-60', done: false, category: 'odev', due: iso(2), seriesId: 's1', seriesName: 'Tarih kitabi', seriesIndex: 1, seriesTotal: 7 },
      { id: 3, text: 'Eski bitmis gorev', done: true, doneDate: iso(-400) },
      { id: 4, text: 'Dun bitti', done: true, doneDate: iso(-1) },
      { id: 5, text: '<img src=x onerror=alert(1)>', done: false, notes: 'xss denemesi' },
    ],
    dumps: [{ text: 'aklima geleni yaz', when: iso(0) }],
    chat: [
      { role: 'user', content: 'selam', at: Date.now() - 7200000 },
      { role: 'assistant', content: '**Merhaba** Salim\n- madde bir\n- madde iki', at: Date.now() - 7100000 },
      { role: 'user', content: '/komutlar', at: Date.now() - 60000, local: true },
    ],
    notes: [{ id: 11, cat: 'antrenman', title: 'Ev programi', text: '3 set 12 tekrar sinav', at: Date.now() - 86400000 }],
    journal: [{ date: iso(-1), text: 'yorgun gun', reflection: 'yarin daha iyi' }],
    pushLog: [{ type: 'morning', title: 'Gunaydin', body: 'test', at: Date.now() - 3600000, subs: 1 }],
    reminders: [
      { id: 21, label: 'D vitamini', time: '09:00', days: 'daily', enabled: true, lastFired: null, kind: 'supp', nagEvery: 15, nagUntil: '12:00' },
      { id: 22, label: 'Su ic', time: '14:00', days: 'weekdays', enabled: true, lastFired: iso(-1) },
    ],
    watchlist: [
      { symbol: 'THYAO', ySymbol: 'THYAO.IS', market: 'bist', name: 'Turk Hava Yollari', price: 312.5, prevClose: 305, changePct: 2.46, currency: 'TRY', qty: 40, cost: 280 },
      { symbol: 'AAPL', ySymbol: 'AAPL', market: 'us', price: 232.1, prevClose: 235, changePct: -1.23, currency: 'USD', qty: 3, cost: 210, alarmAbove: 250 },
    ],
    portfolioHistory: [{ date: iso(-1), byCur: { TRY: { value: 12500, cost: 11200 } } }],
    trades: [
      { id: 31, symbol: 'THYAO', market: 'bist', side: 'long', entry: 300, stop: 290, target: 330, qty: 20, reason: 'kirilim', emotion: 'plan', opened: iso(-5), status: 'closed', exit: 325, closed: iso(-3), pnl: 500, r: 2.5 },
      { id: 32, symbol: 'AAPL', market: 'us', side: 'short', entry: 240, stop: 248, target: 220, qty: 2, reason: 'temel', emotion: 'fomo', opened: iso(-1), status: 'open' },
    ],
    sleep,
    sleepGoal: { targetH: 8, wake: '07:00' },
    diet: { kcalGoal: 2600, waterGoalL: 2.8, days, weights, plan: [] },
    hevy: {
      workouts: [
        { id: 'w1', date: iso(-2), title: 'Push', volumeKg: 8200, setCount: 18, durationMin: 62,
          exercises: [{ name: 'Bench Press', tid: 't1', sets: 4, volumeKg: 3200, top: { kg: 70, reps: 8, e1rm: 87 } }] },
        { id: 'w2', date: iso(-4), title: 'Pull', volumeKg: 7600, setCount: 16, durationMin: 58,
          exercises: [{ name: 'Barbell Row', tid: 't2', sets: 4, volumeKg: 2900, top: { kg: 60, reps: 10, e1rm: 80 } }] },
      ],
      muscles: { t1: 'chest', t2: 'upper_back' },
      musclesAt: Date.now(),
      prs: {},
    },
    coach: { lastRunAt: Date.now() - 86400000, lastText: 'gecen haftanin raporu', reports: [] },
    dayPlan: { date: iso(0), blocks: [{ from: '16:00', to: '16:45', label: 'Matematik', taskId: 1 }] },
    pomoToday: { date: iso(0), count: 2 },
    templates: [],
    settings: {},
  };
}

/**
 * PWA'yi yukler.
 * @param {object} opts
 *   opts.seed      — localStorage'a yazilacak data (default: fixture()). null = bos.
 *   opts.transform — {'core.js': fn(src)=>src} ile kaynagi sabote et (test amacli).
 *   opts.scripts   — yuklenecek dosya listesi (default: dordu birlikte).
 * @returns {{window, errors, evalIn, close}}
 */
function loadApp(opts = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push((e.detail && e.detail.message) || e.message));

  const dom = new JSDOM(read('asistan.html'), {
    runScripts: 'dangerously',
    url: 'https://aidanapp.pages.dev/',
    virtualConsole: vc,
  });
  const w = dom.window;

  // Ag yok: hicbir istek gercekten gitmesin, promise'ler de asla cozulmesin
  // (cozulurse jsdom kapandiktan sonra callback patlar).
  const pending = () => new Promise(() => {});
  w.fetch = pending;
  // Tarayicida var olan ama jsdom'da olmayan API'ler. Eksik birakilirsa test
  // "undefined.then" gibi HARNESS hatasi uretir ve gercek bug'i gizler.
  w.navigator.serviceWorker = {
    register: pending, getRegistrations: () => Promise.resolve([]),
    ready: pending(), controller: null, addEventListener() {}, removeEventListener() {},
  };
  if (!w.Notification) {
    w.Notification = function () {};
    w.Notification.permission = 'default';
    w.Notification.requestPermission = pending;
  }
  if (!w.caches) {
    w.caches = { open: pending, keys: () => Promise.resolve([]), delete: () => Promise.resolve(true), match: pending };
  }
  if (!w.navigator.clipboard) w.navigator.clipboard = { writeText: pending, readText: pending };
  if (!w.AudioContext) w.AudioContext = function () { return { createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0, setValueAtTime() {} }, type: '' }), createGain: () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }), destination: {}, currentTime: 0, close() {} }; };

  const seed = opts.seed === undefined ? fixture() : opts.seed;
  if (seed) w.localStorage.setItem('aidan', JSON.stringify(seed));

  const list = opts.scripts || SCRIPTS;
  for (const f of list) {
    let src = read(f);
    if (opts.transform && opts.transform[f]) src = opts.transform[f](src);
    const s = w.document.createElement('script');
    s.textContent = src;
    w.document.body.appendChild(s);
  }

  return {
    window: w,
    errors,
    // Top-level `const`/`let` window'a yazilmaz; dolayli eval ile global
    // lexical scope'tan okunur (tarayicidaki davranisin aynisi).
    evalIn: (code) => w.eval(code),
    close: () => w.close(),
  };
}

module.exports = { loadApp, fixture, read, iso, ROOT, SCRIPTS };
