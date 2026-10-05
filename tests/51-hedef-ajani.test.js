/**
 * 51 — HEDEF AJANI (4 Eki 2026)
 *
 * Muse karşılaştırması adım 2: sabit kural yerine hedef odaklı arka plan döngüsü.
 * Kullanıcı hedef koyar → 19:30 cron'u düşünür → en fazla 3 öneri → kullanıcı
 * onaylarsa PWA görevi goalId ile ekler → sonraki tur ilerlemeyi görür.
 *
 * Kilitlenenler:
 *  - ONAY KAPISI: worker aidan_data'ya görev YAZMAZ, yalnız aidan_goals.agent'a
 *  - reddedilen ve zaten açık görevler tekrar önerilmez
 *  - açık görev yığılınca yeni öneri yok (kod kilidi, modele güvenilmez)
 *  - cevapsız taze öneri varken model çağrılmaz (maliyet)
 *  - MALİYET: cron 'deep' (ücretsiz), PRO yalnız "Şimdi düşün" düğmesinde
 *  - düğme spam koruması (2 dk), goalId doğrulama, kullanıcı token'ıyla okuma (RLS)
 *  - PWA paneli: tembel modül, XSS kaçışı, onay → goalId'li görev
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { readText } = require('./helpers/src');
const { loadApp } = require('./helpers/load');

const W = readText('aidan-worker/worker.js').replace(/\r\n/g, '\n');
const bas = W.indexOf('// 🎯 HEDEF AJANI (4 Eki 2026)');
const son = W.indexOf('// 🎯 HEDEF AJANI SONU');
const BLOK = W.slice(bas, son);

function kur(stub) {
  const ctx = Object.assign({
    console, Date, JSON, Math, String, Array, Object, Set, Map, Error, Promise, Number, isNaN,
    memoryBlock: () => '', aiRun: async () => ({ response: '{}' }),
  }, stub || {});
  vm.createContext(ctx);
  vm.runInContext(BLOK + `
    this.goalContext = goalContext; this.goalParseAgent = goalParseAgent; this.goalApplyAgent = goalApplyAgent;
    this.goalShouldRun = goalShouldRun; this.goalThink = goalThink; this.goalAddDays = goalAddDays;
    this.GOAL_PROMPT = GOAL_PROMPT; this.GOAL_MAX_PROPOSALS = GOAL_MAX_PROPOSALS;`, ctx);
  return ctx;
}
const js = (x) => JSON.parse(JSON.stringify(x));
const fn = (ad) => {
  const a = W.indexOf('async function ' + ad + '(');
  assert.ok(a > 0, ad + ' yok');
  const m = /\n(async )?function /.exec(W.slice(a + 10));
  return W.slice(a, a + 10 + m.index);
};

const BUGUN = '2026-10-04';
const HEDEF = { id: '11111111-2222-3333-4444-555555555555', title: 'ELO 2000', why: 'Koç bursu', deadline: '2026-12-31', status: 'active', agent: {} };

describe('hedef ajanı — saf fonksiyonlar', () => {
  const M = kur();
  test('blok worker kaynağında bulunuyor', () => {
    assert.ok(bas > 0 && son > bas);
  });

  test('bağlam: kalan gün, hedefe bağlı tamamlanan/açık görev, genel yük', () => {
    const tasks = [
      { text: 'Taktik 20 bulmaca', goalId: HEDEF.id, done: true, doneDate: '2026-10-02' },
      { text: 'Eski açılış', goalId: HEDEF.id, done: true, doneDate: '2026-09-01' },   // 14 günden eski
      { text: 'Sicilya teorisi', goalId: HEDEF.id, done: false, due: '2026-10-01' },
      { text: 'Matematik ödevi', done: false },
    ];
    const c = M.goalContext(HEDEF, tasks, BUGUN);
    assert.match(c.text, /88 gün kaldı/);
    assert.match(c.text, /TAMAMLANAN \(1\)/);
    assert.match(c.text, /Sicilya teorisi.*GECİKTİ/);
    assert.match(c.text, /TOPLAM AÇIK GÖREVİ: 2/);
    assert.ok(!/Matematik/.test(c.text.split('TOPLAM')[0]), 'başka hedefin görevi listelenmemeli');
    assert.strictEqual(c.openCount, 1);
  });

  test('ayrıştırma: en fazla 3 öneri, süre/gün sınırlanır, tarih hesaplanır', () => {
    const raw = JSON.stringify({ durum: 'geride', not: 'İki haftadır ilerleme yok.', sonraki_kontrol: 99,
      oneriler: [
        { text: '15 dk taktik bulmaca çöz', dk: 15, gun: 0 },
        { text: 'Bir oyununu analiz et', dk: 999, gun: 50 },
        { text: 'x' },
        { text: 'Sicilya ana hattını tekrar et', dk: 30, gun: 2 },
        { text: 'Dördüncü öneri', dk: 10, gun: 1 },
      ] });
    const o = js(M.goalParseAgent(raw, HEDEF, [], BUGUN));
    assert.strictEqual(o.proposals.length, 3);
    assert.strictEqual(o.proposals[0].due, BUGUN);
    assert.strictEqual(o.proposals[1].min, null, '999 dk kabul edilmemeli');
    assert.strictEqual(o.proposals[1].due, '2026-10-05', 'geçersiz gün → yarın');
    assert.strictEqual(o.nextIn, 2, 'geçersiz kontrol aralığı → 2');
    assert.strictEqual(o.status, 'geride');
  });

  test('🔒 reddedilen ve zaten açık görev tekrar önerilmez (büyük/küçük harf, noktalama)', () => {
    const g = Object.assign({}, HEDEF, { agent: { rejected: ['Satranç kitabı oku'] } });
    const raw = JSON.stringify({ durum: 'yolunda', oneriler: [
      { text: 'satranç kitabı oku!', dk: 20, gun: 1 },
      { text: 'Sicilya teorisi', dk: 20, gun: 1 },
      { text: 'Yeni bir adım', dk: 20, gun: 1 },
    ] });
    const o = js(M.goalParseAgent(raw, g, [{ text: 'Sicilya Teorisi.', done: false }], BUGUN));
    assert.deepStrictEqual(o.proposals.map(p => p.text), ['Yeni bir adım']);
  });

  test('bozuk çıktı = null (hiçbir şey yazılmaz)', () => {
    for (const r of ['', null, 'metin', '{bozuk']) assert.strictEqual(M.goalParseAgent(r, HEDEF, [], BUGUN), null);
  });

  test('uygulama: eski cevapsız öneri düşer, red listesi ve geçmiş korunur', () => {
    const g = Object.assign({}, HEDEF, { agent: { proposals: [{ id: 'eski', text: 'Eski', status: 'pending' }], rejected: ['R'], history: [{ at: '2026-10-01', status: 'yolunda', note: 'n' }] } });
    const a = js(M.goalApplyAgent(g, { status: 'risk', note: 'Yeni not', question: '', proposals: [{ text: 'Adım', min: 20, due: BUGUN }], nextIn: 3 }, BUGUN, '2026-10-04T16:30:00Z'));
    assert.deepStrictEqual(a.proposals.map(p => [p.text, p.status]), [['Adım', 'pending']]);
    assert.deepStrictEqual(a.rejected, ['R']);
    assert.strictEqual(a.history.length, 2);
    assert.strictEqual(a.nextRun, '2026-10-07');
    assert.strictEqual(a.lastRun, BUGUN);
  });

  test('zamanlama: nextRun gelmediyse ya da taze cevapsız öneri varsa ÇALIŞMAZ', () => {
    assert.ok(M.goalShouldRun(HEDEF, BUGUN), 'hiç çalışmamış hedef çalışmalı');
    assert.ok(!M.goalShouldRun(Object.assign({}, HEDEF, { agent: { nextRun: '2026-10-06' } }), BUGUN));
    const bekleyen = (lastRun) => Object.assign({}, HEDEF, { agent: { lastRun, proposals: [{ text: 'a', status: 'pending' }] } });
    assert.ok(!M.goalShouldRun(bekleyen('2026-10-03'), BUGUN), 'dün önerdi, cevap yok → bekle');
    assert.ok(M.goalShouldRun(bekleyen('2026-09-30'), BUGUN), '3+ gün cevapsız → yenile');
    assert.ok(!M.goalShouldRun(Object.assign({}, HEDEF, { status: 'paused' }), BUGUN));
  });
});

describe('hedef ajanı — model çağrısı', () => {
  test('🔒 hedefin 3+ açık görevi varsa model öneri verse bile öneri YOK', async () => {
    const M = kur({ aiRun: async () => ({ response: JSON.stringify({ durum: 'geride', not: 'n', oneriler: [{ text: 'Yeni adım', dk: 10, gun: 1 }] }) }) });
    const tasks = [1, 2, 3].map(i => ({ text: 'açık ' + i, goalId: HEDEF.id, done: false }));
    const a = js(await M.goalThink({}, HEDEF, tasks, [], BUGUN, 'deep'));
    assert.strictEqual(a.proposals.length, 0);
    assert.strictEqual(a.note, 'n');
  });
  test('katman parametresi aynen geçer, JSON modu açık, hafıza promptta', async () => {
    const log = [];
    const M = kur({ memoryBlock: (x) => '\nHAFIZA:' + x.length, aiRun: async (e, o) => { log.push(o); return { response: '{"durum":"yolunda","not":"ok","oneriler":[]}' }; } });
    await M.goalThink({}, HEDEF, [], [{ text: 'm' }], BUGUN, 'deep');
    assert.strictEqual(log[0].tier, 'deep');
    assert.ok(log[0].json);
    assert.match(log[0].messages[0].content, /HAFIZA:1/);
  });
  test('prompt güvenlik kuralları', () => {
    const p = kur().GOAL_PROMPT;
    assert.match(p, /16 yaşında/);
    assert.match(p, /al\/sat tavsiyesi YOK/);
    assert.match(p, /muğlak adım YASAK/);
    assert.match(p, /REDDEDİLEN/);
  });
});

describe('hedef ajanı — bağlantılar, maliyet, güvenlik', () => {
  const run = fn('runGoalAgent');
  const api = fn('handleGoalThinkApi');
  test('🔒 ONAY KAPISI: ajan aidan_data blob\'una YAZMAZ', () => {
    assert.ok(!/saveUserData|saveAidan/.test(run), 'cron görev listesine yazıyor');
    assert.ok(!/saveUserData|saveUserDataForApi|saveAidan/.test(api), 'uç görev listesine yazıyor');
    assert.match(run, /goalSaveAgent\(/);
  });
  test("MALİYET: cron PRO yalnız tek kullanıcılı kurulumda (sahip); çok kullanıcıda 'deep'", () => {
    assert.match(run, /goalThink\(env, g, tasks, mem, today, users\.length === 1 \? 'heavy' : 'deep', u\.data\)/);
    assert.match(api, /aiTierForUser\(env, user, 'heavy'\)/);
  });
  test('19:30 cron\'a bağlı, /goal-think yönlendirmesi var', () => {
    assert.match(W, /if \(at\(19, 30\)\) jobs\.push\(runGoalAgent\(env\)\);/);
    assert.match(W, /url\.pathname === '\/goal-think'\) \{\n\s+return handleGoalThinkApi\(request, env\);/);
  });
  test('uç: kullanıcı token\'ıyla okur (RLS), goalId doğrular, 2 dk spam kilidi', () => {
    assert.match(api, /memHeaders\(env, userToken\)/);
    assert.ok(!/SUPABASE_SERVICE_KEY/.test(api), 'uç service key kullanmamalı');
    assert.match(api, /\^\[0-9a-f-\]\{36\}\$/);
    assert.match(api, /120000/);
    assert.match(api, /429/);
  });
  test('push yalnız yeni öneri varsa ve hedefler paneline götürür', () => {
    assert.match(run, /if \(yeniOneriler\.length\)/);
    assert.match(run, /url: '\/#hedefler'/);
  });
});

describe('hedefler paneli (PWA)', () => {
  const A = loadApp({ scripts: ['core.js', 'tasks.js', 'ui.js', 'hedefler.js'] });
  after(() => { try { A.close(); } catch (_) {} });

  test('tembel modül: ilk yüklemede yok, Görevler sekmesi ve açılış indirir', () => {
    assert.match(readText('core.js'), /hedefler: '\/hedefler\.js'/);
    assert.match(readText('tasks.js'), /ensureGoalsModule\(\);/);
    assert.match(readText('ui.js'), /setTimeout\(ensureGoalsModule, 0\)/);
    assert.ok(!/<script[^>]+hedefler\.js/.test(readText('asistan.html')));
    assert.ok(A.window.document.getElementById('goalInner'));
    assert.ok(!/\.goal-card/.test(readText('styles.css')), 'panel CSS\'i statik styles.css\'e girmiş');
  });

  test('çizim: XSS kaçışlı, bekleyen öneri sayısı rozette', () => {
    A.evalIn(`_goals = [{ id: 'g1', title: '<img src=x onerror="window.__x=1">', status: 'active', deadline: null,
      agent: { note: 'Not', status: 'geride', proposals: [{ id: 'p1', text: '<b>adım</b>', status: 'pending' }, { id: 'p2', text: 'eski', status: 'accepted' }] } }];
      goalDraw();`);
    const el = A.window.document.getElementById('goalInner');
    assert.strictEqual(el.querySelector('img'), null);
    assert.strictEqual(el.querySelector('.goal-prop b'), null);
    assert.strictEqual(el.querySelectorAll('.goal-prop').length, 1, 'yalnız bekleyen öneri çizilmeli');
    assert.match(A.window.document.getElementById('goalBadge').textContent, /1 öneri/);
  });

  test('onay: öneri goalId\'li GÖREV olur, öneri accepted işaretlenir', async () => {
    A.evalIn(`window._supa = { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) };
      _goals = [{ id: 'g2', title: 'Hedef', status: 'active', agent: { proposals: [{ id: 'p9', text: 'Taktik çöz', min: 15, due: '2026-10-05', status: 'pending' }] } }];`);
    const once = A.evalIn('data.tasks.length');
    await A.evalIn(`goalAccept('g2', 'p9')`);
    const t = A.evalIn('data.tasks[data.tasks.length - 1]');
    assert.strictEqual(A.evalIn('data.tasks.length'), once + 1);
    assert.strictEqual(t.goalId, 'g2');
    assert.strictEqual(t.text, 'Taktik çöz');
    assert.strictEqual(t.estimateMin, 15);
    assert.strictEqual(t.due, '2026-10-05');
    assert.strictEqual(A.evalIn(`_goals[0].agent.proposals[0].status`), 'accepted');
  });

  test('ret: öneri red listesine girer (ajan tekrar önermez)', async () => {
    A.evalIn(`_goals = [{ id: 'g3', title: 'H', status: 'active', agent: { proposals: [{ id: 'p1', text: 'Kitap oku', status: 'pending' }] } }];`);
    const once = A.evalIn('data.tasks.length');
    await A.evalIn(`goalReject('g3', 'p1')`);
    assert.strictEqual(A.evalIn('data.tasks.length'), once, 'ret görev eklememeli');
    assert.deepStrictEqual(Array.from(A.evalIn('_goals[0].agent.rejected')), ['Kitap oku']);
  });

  test('en fazla 5 hedef — ekleme kutusu kaybolur', () => {
    A.evalIn(`_goals = [1,2,3,4,5].map(i => ({ id: 'g' + i, title: 'H' + i, status: 'active', agent: {} })); goalDraw();`);
    assert.strictEqual(A.window.document.getElementById('goalNewTitle'), null);
  });
});
