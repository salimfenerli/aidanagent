/**
 * Aidan Cloudflare Worker
 * - Cron: günlük brifingler + borsa alarmı + akşam portföy özeti + sabit hatırlatıcılar → web push
 * - PWA AI/journal/split/portföy-yorum endpoint'leri (Google Gemini)
 * - Yahoo Finance proxy + portföy görsel okuma (Gemini multimodal)
 *
 * Environment variables (Cloudflare → Worker → Settings → Variables):
 *   SUPABASE_URL          — https://xxxxx.supabase.co
 *   SUPABASE_KEY          — anon/publishable key
 *   AIDAN_EMAIL           — kullanıcı email
 *   AIDAN_PASSWORD        — kullanıcı şifre (Secret)
 *   WEBHOOK_SECRET        — manuel cron test auth (Secret)
 *   VAPID_PUBLIC_KEY      — VAPID P-256 public (web push)
 *   VAPID_PRIVATE_KEY     — VAPID P-256 private (Secret)
 *
 * Bindings:
 *   AI                    — Workers AI
 *
 * Manuel test: https://<url>/?type=morning|noon|evening|deadline|weekly|stocks|portfolio|reminders&secret=<WEBHOOK_SECRET>
 */

const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
// ============================================================
// AI PROVIDER — Google Gemini (Llama'nin yerine, Tem 2026)
// Sozlesme CF env.AI.run ile AYNI: girdi {messages, tools?, max_tokens, temperature},
// cikti { response: string, tool_calls?: [{name, arguments}] }. Boylece tum cagri
// noktalari degismeden calisir. Parali modele gecis = env.GEMINI_MODEL ayarla.
// ============================================================
const GEMINI_MODEL_DEFAULT = 'gemini-3.5-flash'; // ucretsiz katman; env.GEMINI_MODEL ile ezilebilir (or. gemini-3.5-pro)
function geminiModel(env) { return (env && env.GEMINI_MODEL) || GEMINI_MODEL_DEFAULT; }
function geminiEndpoint(model) {
  return 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
}

// OpenAI-sekilli messages -> Gemini contents + systemInstruction
function toGeminiContents(messages) {
  const contents = [];
  let sys = '';
  for (const m of (messages || [])) {
    if (!m) continue;
    if (m.role === 'system') {
      const t = typeof m.content === 'string' ? m.content : '';
      sys = sys ? sys + '\n\n' + t : t;
      continue;
    }
    const role = m.role === 'assistant' ? 'model' : 'user';
    let parts;
    if (typeof m.content === 'string') {
      parts = [{ text: m.content }];
    } else if (Array.isArray(m.content)) {
      parts = m.content.map(pt => {
        if (pt && pt.type === 'text') return { text: pt.text || '' };
        if (pt && pt.type === 'image_url') {
          const url = (pt.image_url && pt.image_url.url) || '';
          const mm = /^data:(.*?);base64,(.*)$/.exec(url);
          if (mm) return { inline_data: { mime_type: mm[1] || 'image/jpeg', data: mm[2] } };
        }
        return { text: '' };
      });
    } else {
      parts = [{ text: String(m.content || '') }];
    }
    contents.push({ role, parts });
  }
  return { contents, sys };
}

// JSON Schema -> Gemini OpenAPI semasi (type BUYUK harf ister)
function toGeminiSchema(sc) {
  if (!sc || typeof sc !== 'object') return sc;
  const out = {};
  for (const k in sc) {
    if (k === 'type' && typeof sc[k] === 'string') out.type = sc[k].toUpperCase();
    else if (k === 'properties') {
      out.properties = {};
      for (const pr in sc.properties) out.properties[pr] = toGeminiSchema(sc.properties[pr]);
    } else if (k === 'items') out.items = toGeminiSchema(sc.items);
    else out[k] = sc[k];
  }
  return out;
}

function toGeminiTools(tools) {
  if (!tools || !tools.length) return null;
  const fns = tools.map(t => {
    const f = (t && t.function) || t;
    return {
      name: f.name,
      description: f.description || '',
      parameters: f.parameters ? toGeminiSchema(f.parameters) : { type: 'OBJECT', properties: {} },
    };
  });
  return [{ functionDeclarations: fns }];
}

// Ana cagri — Gemini generateContent. CF env.AI.run yerine bunu kullan.
// ============================================================
// AI IŞ AĞIRLIĞI KATMANLARI (tier) — 3 Ağu 2026
// ============================================================
// Gemini 3.x'te `thinking_level` modelin cevap üretmeden ÖNCEKİ akıl yürütme
// derinliğini belirler (minimal | low | medium | high). Ücretsiz katmanda
// düşünme token'ı para değil, sadece gecikme demek — yani kalite BEDAVA artar.
//
// ⚠️ KRİTİK: düşünme token'ları ÇIKIŞ bütçesinden yenir. `high` + düşük
// maxOutputTokens = model düşünürken bütçeyi bitirir ve BOŞ metin döner
// (sessiz arıza). Bu yüzden her katmanın kendi minimum çıkış tavanı var.
//
// `pro: true` olan katman, env.GEMINI_MODEL_PRO tanımlıysa o modeli kullanır
// (ör. gemini-3.1-pro-preview — ücretli). Tanımlı DEĞİLSE ücretsiz Flash +
// thinking:high ile çalışır. Yani şu an $0; yükseltmek tek secret eklemek.
// Gemini guvenlik filtreleri KAPALI (7 Agu 2026). Kisisel asistan: saglik,
// antrenman, borsa ve ders iceriginde yanlis pozitif engelleme cevabi
// SESSIZCE bosaltiyordu (finishReason SAFETY + bos metin). Hepsi BLOCK_NONE.
const GEMINI_SAFETY_OFF = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

const AI_TIERS = {
  light:  { thinking: 'low',    minOut: 2048 },              // sınıflandırma, OCR, ön eleme
  normal: { thinking: 'medium', minOut: 3072 },              // sohbet, özet, yorum (varsayılan)
  deep:   { thinking: 'high',   minOut: 8192 },              // derin düşünme AMA ÜCRETSİZ model
  heavy:  { thinking: 'high',   minOut: 8192, pro: true },   // derin + ÜCRETLİ model (yalnız tetiklemeli işler)
};

// ⚠️ MALİYET SINIRI (3 Ağu 2026) — `heavy` yani ücretli modele giden çağrılar
// SADECE şu iki tipte olabilir: ① cron (günde sabit sayıda) ② kullanıcının bir
// düğmeye basmasıyla tetiklenen ağır analiz. Sohbet gibi SERBEST AKIŞLI hiçbir
// yol `heavy` kullanamaz — orada `deep` var (aynı düşünme derinliği, $0 model).
// Böylece fatura üst sınırı istek sayısıyla değil, özelliğin doğasıyla sınırlı.
//
// Ayrıca `heavy` yalnızca hesap sahibine (env.AIDAN_EMAIL) açıktır: multi-user
// modunda başka bir kullanıcı, hesabı geçerli olsa bile ücret ÜRETEMEZ — deep'e düşer.
function aiTierForUser(env, user, wanted) {
  if (wanted !== 'heavy') return wanted;
  const owner = ((env && env.AIDAN_EMAIL) || '').trim().toLowerCase();
  if (!owner) return 'heavy';                    // tek-user kurulum, sahip zaten tek kişi
  const email = ((user && user.email) || '').trim().toLowerCase();
  return email && email === owner ? 'heavy' : 'deep';
}

function geminiModelFor(env, tierName) {
  const t = AI_TIERS[tierName];
  if (t && t.pro && env && (env.GEMINI_MODEL_PRO || '').trim()) return env.GEMINI_MODEL_PRO.trim();
  return geminiModel(env);
}

async function aiRun(env, opts) {
  opts = opts || {};
  const key = env && env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY tanimli degil - Worker secret ekle');
  const conv = toGeminiContents(opts.messages);
  const tierName = AI_TIERS[opts.tier] ? opts.tier : 'normal';
  const tier = AI_TIERS[tierName];
  const thinking = opts.thinking || tier.thinking;

  const body = {
    contents: conv.contents,
    generationConfig: {
      temperature: opts.temperature != null ? opts.temperature : 0.3,
      // Düşünme token'i çıkış bütçesini yer -> katman tavanının altına inme
      maxOutputTokens: Math.max(opts.max_tokens || 512, tier.minOut),
      thinkingConfig: { thinkingLevel: thinking },
    },
  };
  if (conv.sys) body.systemInstruction = { parts: [{ text: conv.sys }] };
  const tools = toGeminiTools(opts.tools);
  if (tools) body.tools = tools;
  if (opts.json) body.generationConfig.responseMimeType = 'application/json';
  body.safetySettings = GEMINI_SAFETY_OFF;   // filtreler kapali (bkz. GEMINI_SAFETY_OFF)

  const model = opts.model || geminiModelFor(env, tierName);
  const url = geminiEndpoint(model) + '?key=' + encodeURIComponent(key);
  const call = (payload) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let resp = await call(body);
  // 503/500 = model o an aşırı yüklü (geçici). Kısa bekleyip TEK kez tekrar dene.
  // Google'ın yoğunluğu kullanıcıya hata olarak yansımamalı — bu ücret üretmez.
  if (!resp.ok && (resp.status === 503 || resp.status === 500)) {
    await new Promise(r => setTimeout(r, 1500));
    const rRetry = await call(body);
    if (rRetry.ok) resp = rRetry;
    else if (model !== geminiModel(env)) {
      // PRO hâlâ yoğun -> ücretsiz modele düş, hizmet kesilmesin
      const freeUrl2 = geminiEndpoint(geminiModel(env)) + '?key=' + encodeURIComponent(key);
      const rFree2 = await fetch(freeUrl2, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (rFree2.ok) resp = rFree2; else resp = rRetry;
    } else {
      resp = rRetry;
    }
  }
  // ⚠️ PRO modeli erişilemezse (bakiye bitti / kota doldu / model kapalı) ÜCRETSİZ modele düş.
  // Bakiye bittiğinde kullanıcı "analiz yapılamadı" görmemeli — kalite düşer ama hizmet sürer.
  // 429 kota/bakiye · 402 ödeme · 403 erişim yok · 404 model adı geçersiz.
  if (!resp.ok && model !== geminiModel(env) && [429, 402, 403, 404].includes(resp.status)) {
    const freeUrl = geminiEndpoint(geminiModel(env)) + '?key=' + encodeURIComponent(key);
    const rFree = await fetch(freeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (rFree.ok) resp = rFree;
  }
  // Model thinkingLevel'i tanımıyorsa (eski sürüm) 400 döner -> parametresiz tek tekrar
  if (!resp.ok && resp.status === 400) {
    const fb = JSON.parse(JSON.stringify(body));
    delete fb.generationConfig.thinkingConfig;
    let r2 = await call(fb);
    // Model bir guvenlik kategorisini tanimiyorsa da 400 doner -> safetySettings'siz tek deneme
    if (!r2.ok) {
      const fb2 = JSON.parse(JSON.stringify(body));
      delete fb2.safetySettings;
      delete fb2.generationConfig.thinkingConfig;
      r2 = await call(fb2);
    }
    if (r2.ok) resp = r2;
  }
  if (!resp.ok) {
    let errTxt = '';
    try { errTxt = await resp.text(); } catch (_) {}
    throw new Error('Gemini ' + resp.status + ': ' + errTxt.slice(0, 300));
  }

  const parseOut = (j) => {
    const cand = j && j.candidates && j.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    let text = '';
    const toolCalls = [];
    for (const pp of parts) {
      if (pp && typeof pp.text === 'string') text += pp.text;
      if (pp && pp.functionCall) toolCalls.push({ name: pp.functionCall.name, arguments: pp.functionCall.args || {} });
    }
    return { text, toolCalls, finish: cand && cand.finishReason };
  };

  let out = parseOut(await resp.json());
  // Düşünme bütçeyi yemiş olabilir (finishReason MAX_TOKENS + boş metin) -> düşük thinking ile tek tekrar
  if (!out.text && !out.toolCalls.length && thinking !== 'low' && thinking !== 'minimal') {
    const fb = JSON.parse(JSON.stringify(body));
    fb.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    const r3 = await call(fb);
    if (r3.ok) {
      const o3 = parseOut(await r3.json());
      if (o3.text || o3.toolCalls.length) out = o3;
    }
  }

  const res = { response: out.text };
  if (out.toolCalls.length) res.tool_calls = out.toolCalls;
  return res;
}

// ============================================================
// Zaman yardımcıları (Türkiye saati)
// ============================================================
function trToday() {
  return new Date(Date.now() + TR_OFFSET_MS).toISOString().slice(0, 10);
}
function trDate(daysFromToday = 0) {
  return new Date(Date.now() + TR_OFFSET_MS + daysFromToday * 86400000).toISOString().slice(0, 10);
}
function trDayName(daysFromToday = 0) {
  const names = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  return names[new Date(Date.now() + TR_OFFSET_MS + daysFromToday * 86400000).getUTCDay()];
}
function trClock() {
  const d = new Date(Date.now() + TR_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// ============================================================
// Supabase
// ============================================================
async function login(env) {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.AIDAN_EMAIL, password: env.AIDAN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`Login fail: ${r.status} ${await r.text()}`);
  const body = await r.json();
  return { token: body.access_token, userId: body.user.id };
}

async function fetchAidan(env) {
  const { token, userId } = await login(env);
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/aidan_data?user_id=eq.${userId}&select=data`,
    { headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${token}` } }
  );
  if (!r.ok) throw new Error(`Fetch fail: ${r.status}`);
  const rows = await r.json();
  return {
    data: rows[0]?.data || { tasks: [], dumps: [], pomoToday: { date: trToday(), count: 0 }, settings: {} },
    userId, token,
  };
}

async function saveAidan(env, data, sessionInfo) {
  let { token, userId } = sessionInfo || {};
  if (!token || !userId) ({ token, userId } = await login(env));
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/aidan_data?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ user_id: userId, data, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Save fail: ${r.status} ${await r.text()}`);
}

// ============================================================
// 👥 Multi-user — service_role ile tüm user satırlarını oku/yaz
// ============================================================
// SUPABASE_SERVICE_KEY eklendiğinde cron'lar otomatik multi-user olur.
// Yoksa fallback: AIDAN_EMAIL/PASSWORD ile tek user (eski Salim-only akış).
// Service key RLS'i bypass eder — sadece backend cron'larda kullanılır, istemciye sızmaz.
function hasServiceKey(env) {
  return !!(env.SUPABASE_SERVICE_KEY && env.SUPABASE_SERVICE_KEY.length > 20);
}

async function fetchAllUsers(env) {
  if (hasServiceKey(env)) {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/aidan_data?select=user_id,data,updated_at`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (!r.ok) throw new Error(`fetchAllUsers fail: ${r.status} ${await r.text()}`);
    const rows = await r.json();
    return rows.map(row => ({
      userId: row.user_id,
      data: row.data || { tasks: [], dumps: [], pomoToday: { date: trToday(), count: 0 }, settings: {} },
      updatedAt: row.updated_at,
    }));
  }
  // Fallback: tek user (Salim)
  const single = await fetchAidan(env);
  return [{ userId: single.userId, data: single.data, updatedAt: null, _legacyToken: single.token }];
}

async function saveUserData(env, userId, data) {
  if (hasServiceKey(env)) {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/aidan_data?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: userId, data, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(`saveUserData fail: ${r.status} ${await r.text()}`);
    return;
  }
  // Fallback: AIDAN_EMAIL login ile tek user save
  await saveAidan(env, data, null);
}

// AI endpoint'leri için: user'ın KENDİ datasını çek (Salim'inkini değil).
// service key varsa user.id'ye göre direkt oku, yoksa eski fetchAidan fallback (tek-user mod).
async function fetchUserDataForApi(env, user) {
  if (hasServiceKey(env) && user && user.id) {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/aidan_data?user_id=eq.${user.id}&select=data`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (r.ok) {
      const rows = await r.json();
      const data = rows[0]?.data || { tasks: [], dumps: [], settings: {}, pomoToday: { date: trToday(), count: 0 } };
      return { data, userId: user.id, multiUser: true };
    }
  }
  // Fallback: tek-user (Salim) akışı
  const single = await fetchAidan(env);
  return { data: single.data, userId: single.userId, token: single.token, multiUser: false };
}

async function saveUserDataForApi(env, session) {
  if (session.multiUser && session.userId) {
    await saveUserData(env, session.userId, session.data);
  } else {
    await saveAidan(env, session.data, session);
  }
}

// service_role ile aidan_backups'a INSERT (RLS bypass) — sadece cron için
async function insertBackup(env, userId, data) {
  if (!hasServiceKey(env)) {
    // Service key yoksa eski akış: AIDAN_EMAIL token'ı ile kendi satırı
    const { token } = await login(env);
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/aidan_backups`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ user_id: userId, data }),
    });
    return r;
  }
  return await fetch(`${env.SUPABASE_URL}/rest/v1/aidan_backups`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ user_id: userId, data }),
  });
}

async function listAndPruneBackups(env, userId, keep = 12) {
  const headers = hasServiceKey(env)
    ? { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` }
    : null;
  if (!headers) return 0; // Service key yoksa cleanup için ayrı login lazım — caller halletsin
  const list = await fetch(
    `${env.SUPABASE_URL}/rest/v1/aidan_backups?user_id=eq.${userId}&select=id&order=snapshot_at.desc`,
    { headers }
  );
  if (!list.ok) return 0;
  const rows = await list.json();
  if (rows.length <= keep) return 0;
  const toDelete = rows.slice(keep).map(r => r.id);
  const del = await fetch(
    `${env.SUPABASE_URL}/rest/v1/aidan_backups?id=in.(${toDelete.join(',')})`,
    { method: 'DELETE', headers }
  );
  return del.ok ? toDelete.length : 0;
}

// ============================================================
// Cron mesaj üreticiler
// ============================================================
// Akıllı MIT skoru — geçmiş, deadline, öncelik, tahmin'e göre
function scoreTaskForMit(t, today, tomorrow) {
  let score = 0;
  if (t.due) {
    if (t.due < today) score += 150; // gecikti, hemen ele al
    else if (t.due === today) score += 100;
    else if (t.due === tomorrow) score += 50;
    else {
      // Yaklaşan deadline'a göre lineer azal
      const days = Math.max(1, Math.round((new Date(t.due) - new Date(today)) / 86400000));
      if (days <= 7) score += Math.max(10, 40 - days * 4);
    }
  }
  if (t.priority === 'urgent') score += 60;
  if (t.priority === 'low') score -= 15;
  if (t.estimateMin) {
    if (t.estimateMin <= 30) score += 20;
    else if (t.estimateMin <= 60) score += 15;
    else if (t.estimateMin > 120) score -= 10;
  }
  if (t.reminderTime) score += 12;
  if (t.category === 'odev') score += 8;
  if (t.category === 'ders') score += 12; // özel ders = sabit randevu, kaçırılamaz
  // Eski / unutulmuş — created'dan en az 5 gün geçmişse hatırlat
  if (t.created) {
    const ageMs = Date.now() - new Date(t.created.replace(' ', 'T')).getTime();
    const ageDays = Math.floor(ageMs / 86400000);
    if (ageDays >= 5 && ageDays <= 30) score += 15;
  }
  // Seri görevi: sıradaki adım önemli
  if (t.seriesId) score += 10;
  return score;
}

// Yarın için MIT skoru — gecikmiş + yarın deadline + acil önde
function scoreTaskForTomorrowMit(t, today, tomorrow, dayAfter) {
  let score = 0;
  if (t.due) {
    if (t.due < today) score += 130;       // çoktan gecikmiş, yarın yap
    else if (t.due === today) score += 30; // bugün yapılmadıysa son şans yarın
    else if (t.due === tomorrow) score += 100;
    else if (t.due === dayAfter) score += 60;
    else {
      const days = Math.max(1, Math.round((new Date(t.due) - new Date(tomorrow)) / 86400000));
      if (days <= 7) score += Math.max(10, 40 - days * 4);
    }
  }
  if (t.priority === 'urgent') score += 60;
  if (t.priority === 'low') score -= 15;
  if (t.estimateMin) {
    if (t.estimateMin <= 30) score += 20;
    else if (t.estimateMin <= 60) score += 15;
    else if (t.estimateMin > 120) score -= 10;
  }
  if (t.reminderTime) score += 8;
  if (t.category === 'odev') score += 8;
  if (t.category === 'ders') score += 12;
  if (t.seriesId) score += 10;
  return score;
}

function suggestMitForTomorrow(data) {
  const today = trToday();
  const tomorrow = trDate(1);
  const dayAfter = trDate(2);
  const tasks = (data.tasks || []).filter(t => !t.done && t.mitDate !== tomorrow);
  if (!tasks.length) return [];
  const scored = tasks
    .map(t => ({ t, score: scoreTaskForTomorrowMit(t, today, tomorrow, dayAfter) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const out = [];
  const usedCats = new Set();
  for (const { t } of scored) {
    if (out.length >= 3) break;
    if (out.length < 2 && t.category && usedCats.has(t.category)) continue;
    out.push(t);
    if (t.category) usedCats.add(t.category);
  }
  if (out.length < 3) {
    for (const { t } of scored) {
      if (out.length >= 3) break;
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

function suggestMitFromTasks(data) {
  const today = trToday();
  const tomorrow = trDate(1);
  const tasks = (data.tasks || []).filter(t => !t.done);
  if (!tasks.length) return [];
  const scored = tasks
    .map(t => ({ t, score: scoreTaskForMit(t, today, tomorrow) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  // En fazla 3, kategorik çeşitlilik gözet
  const out = [];
  const usedCats = new Set();
  for (const { t } of scored) {
    if (out.length >= 3) break;
    // İlk 2 görevi her kategoriden almaya çalış, 3.'de zorlama
    if (out.length < 2 && t.category && usedCats.has(t.category)) continue;
    out.push(t);
    if (t.category) usedCats.add(t.category);
  }
  // Hâlâ 3'e ulaşamadıysak en yüksek skorlulardan tamamla
  if (out.length < 3) {
    for (const { t } of scored) {
      if (out.length >= 3) break;
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

// Sabah: MIT seçili değilse akıllı 3'ü otomatik MIT yap (data mutasyonu — runCronJob kaydeder).
// Kullanıcı zaten seçtiyse dokunma. Otomatik seçilenleri döndürür (boş = dokunulmadı).
function autoSetMorningMit(data) {
  const today = trToday();
  const tasks = data.tasks || [];
  const hasMit = tasks.some(t => t.mitDate === today && !t.done);
  if (hasMit) return [];
  const suggestions = suggestMitFromTasks(data);
  suggestions.forEach(t => { t.mitDate = today; });
  return suggestions;
}

function buildMorning(data, autoSetMit) {
  const today = trToday();
  const tasks = data.tasks || [];
  const mit = tasks.filter(t => t.mitDate === today && !t.done);
  const urgent = tasks.filter(t => t.priority === 'urgent' && !t.done);
  const dueToday = tasks.filter(t => t.due === today && !t.done);
  const dueTomorrow = tasks.filter(t => t.due === trDate(1) && !t.done);
  const overdue = tasks.filter(t => t.due && t.due < today && !t.done);

  const lines = [`🌅 Günaydın Salim`];
  let replyMarkup = null;
  if (autoSetMit && autoSetMit.length) {
    // Aidan bugünün 3'ünü otomatik seçti (push'ta buton yok — açınca hazır)
    lines.push('', `🎯 Bugünün 3'ünü senin için seçtim:`);
    autoSetMit.forEach((t, i) => {
      const extras = [];
      if (t.due === today) extras.push('bugün son');
      else if (t.due === trDate(1)) extras.push('yarın son');
      else if (t.due && t.due < today) extras.push('⚠️ gecikti');
      if (t.priority === 'urgent') extras.push('🔴 acil');
      if (t.estimateMin) extras.push(`${t.estimateMin}dk`);
      const tail = extras.length ? ` (${extras.join(' · ')})` : '';
      lines.push(`  ${i + 1}. ${t.text}${tail}`);
    });
    lines.push('', `💜 İstersen uygulamadan değiştir — yoksa sadece başla 🚀`);
  } else if (mit.length) {
    lines.push('', `⭐ Bugünün 3'ü:`);
    mit.forEach(t => lines.push(`  • ${t.text}`));
  } else {
    // MIT seçilmediyse akıllı öneri yap + inline butonlar
    const suggestions = suggestMitFromTasks(data);
    if (suggestions.length) {
      lines.push('', `🎯 Bugünün 3'ü için öneri:`);
      suggestions.forEach((t, i) => {
        const extras = [];
        if (t.due === today) extras.push('bugün son');
        else if (t.due === trDate(1)) extras.push('yarın son');
        else if (t.due && t.due < today) extras.push('⚠️ gecikti');
        if (t.priority === 'urgent') extras.push('🔴 acil');
        if (t.estimateMin) extras.push(`${t.estimateMin}dk`);
        const tail = extras.length ? ` (${extras.join(' · ')})` : '';
        lines.push(`  ${i + 1}. ${t.text}${tail}`);
      });
      lines.push('', `💡 Aşağıdaki butonlara tık → MIT'e ekle.`);
      // Telegram inline keyboard
      const ids = suggestions.map(t => String(t.id));
      const row = suggestions.map((t, i) => ({
        text: `⭐ ${i + 1}`,
        callback_data: `mit:${t.id}`
      }));
      const allBtn = { text: '⭐ Hepsi', callback_data: `mit:all:${ids.join(',')}` };
      replyMarkup = { inline_keyboard: [row, [allBtn]] };
    } else {
      lines.push('', `⭐ MIT seçilmedi ve aktif görev yok. Yeni bir görev ekleyerek başla.`);
    }
  }
  if (overdue.length) {
    lines.push('', `⚠️ Gecikmiş (${overdue.length}):`);
    overdue.slice(0, 3).forEach(t => lines.push(`  • ${t.text} (${t.due})`));
  }
  if (urgent.length) {
    lines.push('', `🔴 Acil (${urgent.length}):`);
    urgent.slice(0, 3).forEach(t => lines.push(`  • ${t.text}`));
  }
  if (dueToday.length) {
    lines.push('', `📅 Bugün son tarih (${dueToday.length}):`);
    dueToday.slice(0, 4).forEach(t => lines.push(`  • ${t.text}`));
  }
  if (dueTomorrow.length) {
    lines.push('', `⏳ Yarın son tarih (${dueTomorrow.length}):`);
    dueTomorrow.slice(0, 3).forEach(t => lines.push(`  • ${t.text}`));
  }
  const totalLeft = tasks.filter(t => !t.done).length;
  lines.push('', `📊 Toplam bekleyen: ${totalLeft} görev`);
  return { title: '🌅 Sabah brifingi', message: lines.join('\n'), replyMarkup };
}

// 🌅 Sabah AI brifingi — push bildirimini düz metin yerine kişisel AI yorumuyla yapar.
// AI fail olursa eski buildMorning fallback'i ile kayıp olmaz.
async function buildMorningAi(env, data, autoSetMit) {
  const today = trToday();
  const tasks = data.tasks || [];
  const mit = tasks.filter(t => t.mitDate === today && !t.done);
  const urgent = tasks.filter(t => t.priority === 'urgent' && !t.done);
  const dueToday = tasks.filter(t => t.due === today && !t.done);
  const dueTomorrow = tasks.filter(t => t.due === trDate(1) && !t.done);
  const overdue = tasks.filter(t => t.due && t.due < today && !t.done);
  const totalActive = tasks.filter(t => !t.done).length;
  const oldStuck = tasks.filter(t => !t.done && !t.due && t.created && (Date.now() - new Date(t.created).getTime()) > 5 * 86400000).length;
  const yesterday = trDate(-1);
  const doneYesterday = tasks.filter(t => t.doneDate === yesterday).length;
  const name = getUserDisplayName(data, '');

  // MIT bağlamı
  let mitList = [];
  let mitContext = '';
  if (autoSetMit && autoSetMit.length) {
    mitList = autoSetMit;
    mitContext = `🎯 Bugünün 3'ünü AI olarak otomatik seçtim (kullanıcı kendi seçmemiş)`;
  } else if (mit.length) {
    mitList = mit;
    mitContext = `⭐ Kullanıcı bugünün MIT'ini zaten seçmiş`;
  } else {
    mitContext = `MIT seçilmemiş ve aktif görev yok / az`;
  }
  const mitLines = mitList.map((t, i) => {
    const tags = [];
    if (t.due === today) tags.push('bugün son');
    else if (t.due === trDate(1)) tags.push('yarın son');
    else if (t.due && t.due < today) tags.push('GECİKTİ');
    if (t.priority === 'urgent') tags.push('acil');
    if (t.estimateMin) tags.push(`${t.estimateMin}dk`);
    return `${i + 1}. ${t.text}${tags.length ? ` (${tags.join(', ')})` : ''}`;
  }).join('\n');

  const sysPrompt = `Sen Aidan'sın — ${name}'in ADHD asistanı. Sabah brifingisini yazıyorsun (push bildirimi).

GÖREVİN: 3-4 cümle TÜRKÇE kişisel sabah selamı + bugün için yön.

YAPI:
1. "🌅 Günaydın ${name}" ile başla
2. Bugünün özetini somutla — sayısı kaç, kritik olan ne
3. MIT varsa onu hatırlat / yoksa nazikçe "küçük başla" öner
4. Yorgun/yoğun gün belirtisi varsa empati ("bugün dolu, küçük adım yeter")
5. Sakin gün ise enerji ("hafif gün, momentum yakala")

🚫 YASAK:
- Liste/madde imi (push'ta dağılır, AKICI cümle yaz)
- Görev başlığını tekrarlama (kullanıcı zaten uygulamada görür)
- "Şunu yapmalısın" zorlayıcı emir
- "1." "2." "3." numaralandırma
- İngilizce
- "I'm sorry", "As an AI" gibi şablon
- 5'ten fazla cümle

✅ TON: sabah çayı içen bir arkadaş. Sıcak, somut, kısa. Cümleler arasında satır atlama olabilir ama madde işareti yok.

📝 ÖRNEK ÇIKTI:
"🌅 Günaydın ${name} ☀️ Bugün 4 aktif görev var ama deadline yok — sakin bir gün. Üç tanesi 5+ gündür duruyor, küçük başla: bir tanesinin ilk adımını at, geri kalanı dökülür. Hafif bir gün, momentum yakala 💜"`;

  const context = `📅 ${trDayName()}, ${today} (${trClock()})
👤 Kullanıcı: ${name}
📊 Aktif: ${totalActive} görev | Dün biten: ${doneYesterday}${overdue.length ? ` | ⚠️ Gecikmiş: ${overdue.length}` : ''}${urgent.length ? ` | 🔴 Acil: ${urgent.length}` : ''}${dueToday.length ? ` | 📅 Bugün son: ${dueToday.length}` : ''}${dueTomorrow.length ? ` | ⏳ Yarın son: ${dueTomorrow.length}` : ''}${oldStuck >= 3 ? ` | 🕰️ 5+ gün duran: ${oldStuck}` : ''}

${mitContext}${mitLines ? ':\n' + mitLines : ''}

Bunlardan yola çıkarak ${name}'e 3-4 cümlelik kişisel sabah brifingi yaz. Madde imi YOK, akıcı paragraf.`;

  try {
    const r = await aiRun(env, {
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: context },
      ],
      max_tokens: 280,
      temperature: 0.55,
    });
    const msg = (r.response || '').trim();
    if (!msg || msg.length < 30 || /^i'?m sorry|^as an ai|your input/i.test(msg)) {
      return buildMorning(data, autoSetMit); // fallback
    }
    return { title: '🌅 Sabah brifingi', message: msg };
  } catch (e) {
    console.error('buildMorningAi fail', e.message);
    return buildMorning(data, autoSetMit); // fallback
  }
}

function buildNoon(data) {
  const today = trToday();
  const tasks = data.tasks || [];
  const mit = tasks.filter(t => t.mitDate === today);
  const mitDone = mit.filter(t => t.done).length;
  const doneToday = tasks.filter(t => t.doneDate === today).length;

  const lines = [`☀️ Öğlen check-in`];
  if (mit.length > 0) {
    lines.push(`⭐ MIT: ${mitDone}/${mit.length} bitti`);
    const remaining = mit.filter(t => !t.done);
    if (remaining.length) {
      lines.push('', `Kalan:`);
      remaining.forEach(t => lines.push(`  • ${t.text}`));
    } else {
      lines.push('', `🎉 Bugünün 3'ü tamamen bitti!`);
    }
  } else {
    lines.push('⭐ MIT seçilmedi — öğleden sonra bari 1 önemli iş belirle.');
  }
  lines.push('', `✅ Bugün şu ana kadar ${doneToday} görev bitirdin.`);
  return { title: '☀️ Öğle ping', message: lines.join('\n') };
}

function buildEvening(data) {
  const today = trToday();
  const tomorrow = trDate(1);
  const tasks = data.tasks || [];
  const doneToday = tasks.filter(t => t.doneDate === today);
  const mit = tasks.filter(t => t.mitDate === today);
  const mitDone = mit.filter(t => t.done).length;
  const pomoToday = data.pomoToday?.date === today ? (data.pomoToday.count || 0) : 0;
  const tomorrowMit = tasks.filter(t => t.mitDate === tomorrow && !t.done);

  const lines = [`🌙 Günü kapatma`];
  lines.push('', `✅ Bitirdiklerin: ${doneToday.length}`);
  doneToday.slice(0, 5).forEach(t => lines.push(`  • ${t.text}`));
  lines.push('', `⭐ MIT: ${mitDone}/${mit.length}`);
  lines.push(`🍅 Pomodoro: ${pomoToday}`);

  // Yarın için MIT — seçilmemişse akıllı öneri + inline butonlar
  let replyMarkup = null;
  if (tomorrowMit.length > 0) {
    lines.push('', `⭐ Yarının MIT'i: ${tomorrowMit.length}/3 seçili`);
    tomorrowMit.slice(0, 3).forEach(t => lines.push(`  • ${t.text}`));
  } else {
    const suggestions = suggestMitForTomorrow(data);
    if (suggestions.length) {
      lines.push('', `🎯 Yarın için 3 öneri:`);
      suggestions.forEach((t, i) => {
        const extras = [];
        if (t.due === tomorrow) extras.push('yarın son');
        else if (t.due && t.due < tomorrow) extras.push('⚠️ gecikti');
        if (t.priority === 'urgent') extras.push('🔴 acil');
        if (t.estimateMin) extras.push(`${t.estimateMin}dk`);
        const tail = extras.length ? ` (${extras.join(' · ')})` : '';
        lines.push(`  ${i + 1}. ${t.text}${tail}`);
      });
      lines.push('', `💡 Butona tık → sabah hazır.`);
      const ids = suggestions.map(t => String(t.id));
      const row = suggestions.map((t, i) => ({
        text: `⭐ ${i + 1}`,
        callback_data: `mit_tmrw:${t.id}`
      }));
      const allBtn = { text: '⭐ Hepsi', callback_data: `mit_tmrw:all:${ids.join(',')}` };
      replyMarkup = { inline_keyboard: [row, [allBtn]] };
    }
  }

  // Yarınki deadline'lı görevler (öneriden bağımsız bilgi)
  const tomorrowDue = tasks.filter(t => t.due === tomorrow && !t.done);
  if (tomorrowDue.length) {
    lines.push('', `📅 Yarın son tarih (${tomorrowDue.length}):`);
    tomorrowDue.slice(0, 4).forEach(t => lines.push(`  • ${t.text}`));
  }

  if (doneToday.length === 0 && mit.length === 0) {
    lines.push('', `💜 Bugün zor bir gün olmuş olabilir. Yarın yeni bir başlangıç.`);
  } else if (mitDone === mit.length && mit.length > 0) {
    lines.push('', `🎉 Tüm MIT'leri bitirdin, harika gün!`);
  }
  return { title: '🌙 Akşam özet', message: lines.join('\n'), replyMarkup };
}

function getWeekStartIso() {
  const d = new Date(Date.now() + TR_OFFSET_MS);
  const dow = d.getUTCDay(); // 0=Pazar
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

async function buildWeekly(env, data) {
  const today = trToday();
  const weekStart = getWeekStartIso();
  const tasks = data.tasks || [];

  const doneThisWeek = tasks.filter(t => t.doneDate && t.doneDate >= weekStart && t.doneDate <= today);
  const overdueNow = tasks.filter(t => !t.done && t.due && t.due < today);
  const mitDoneThisWeek = doneThisWeek.filter(t => t.mitDate && t.mitDate === t.doneDate);

  const byCategory = {};
  doneThisWeek.forEach(t => {
    const c = t.category || 'kategorisiz';
    byCategory[c] = (byCategory[c] || 0) + 1;
  });
  const topCategoryEntry = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

  // Pomodoro toplam (pomoHistory varsa)
  let pomoTotal = 0;
  const pomoHistory = data.pomoHistory || {};
  for (const [d, n] of Object.entries(pomoHistory)) {
    if (d >= weekStart && d <= today) pomoTotal += (n || 0);
  }
  // Bugünün pomoToday'ı pomoHistory'de yoksa ekle
  if (data.pomoToday?.date === today && !pomoHistory[today]) {
    pomoTotal += data.pomoToday.count || 0;
  }

  // Zaman tahmini doğruluğu
  const withBothEst = doneThisWeek.filter(t => t.estimateMin && t.actualMin);
  let estimateNote = '';
  if (withBothEst.length >= 3) {
    const avgEst = withBothEst.reduce((s, t) => s + t.estimateMin, 0) / withBothEst.length;
    const avgAct = withBothEst.reduce((s, t) => s + t.actualMin, 0) / withBothEst.length;
    const ratio = (avgAct / avgEst).toFixed(1);
    estimateNote = `Tahmin ${Math.round(avgEst)}dk → gerçek ${Math.round(avgAct)}dk (${ratio}x)`;
  }

  // En verimli saat (data.hourStats histogramı — PWA'da görev bitince dolar)
  let bestHourNote = '';
  {
    const hs = data.hourStats || {};
    let total = 0; const arr = new Array(24).fill(0);
    for (let h = 0; h < 24; h++) { const c = hs[String(h)] || 0; arr[h] = c; total += c; }
    if (total >= 8) {
      let bs = 0, bsum = -1;
      for (let h = 0; h < 24; h++) { const su = arr[h] + arr[(h + 1) % 24]; if (su > bsum) { bsum = su; bs = h; } }
      const pad = n => String(n).padStart(2, '0');
      bestHourNote = `${pad(bs)}:00-${pad((bs + 2) % 24)}:00`;
    }
  }

  const catLabels = { odev: 'Ödev', ders: 'Özel Ders', ev: 'Ev', kisisel: 'Kişisel' };
  const factsForAi = [
    `Bu hafta ${doneThisWeek.length} görev bitirdi.`,
    mitDoneThisWeek.length ? `MIT olarak ${mitDoneThisWeek.length} tanesini bitirdi.` : '',
    topCategoryEntry ? `En çok ${catLabels[topCategoryEntry[0]] || topCategoryEntry[0]} kategorisinde çalıştı (${topCategoryEntry[1]}).` : '',
    pomoTotal ? `${pomoTotal} pomodoro yaptı.` : '',
    overdueNow.length ? `${overdueNow.length} gecikmiş görev hâlâ bekliyor.` : '',
    estimateNote ? `Tahmin doğruluğu: ${estimateNote}.` : '',
    bestHourNote ? `En verimli olduğu saat aralığı ${bestHourNote}.` : '',
  ].filter(Boolean).join(' ');

  let aiComment = '';
  try {
    const r = await aiRun(env, {
      messages: [
        { role: 'system', content: "Sen Aidan'sın, Salim'in ADHD asistanı. Hafta sonu özetinde KISA (2-3 cümle), TÜRKÇE, samimi, övgü öncelikli ama somut bir yorum yaz. Önce başarı (sayıyla), sonra 1 ince öneri. ASLA yargılayıcı/eleştirel olma. ASLA İngilizce yazma. ADHD'li için her bitirilen iş zaferdir." },
        { role: 'user', content: `Bu haftanın özeti:\n${factsForAi}\n\nKısa hafta yorumu yaz (en fazla 3 cümle, sıcak ama somut).` },
      ],
      max_tokens: 220,
      temperature: 0.7,
    });
    aiComment = (r.response || '').trim();
    if (/^(i'm|i am|as an ai|please provide|your input)/i.test(aiComment)) aiComment = '';
  } catch (e) {
    console.error('Weekly AI fail:', e);
  }

  const lines = [`📊 Hafta özeti (${weekStart} → ${today})`];
  lines.push('');
  lines.push(`✅ Bitirilen: ${doneThisWeek.length} görev`);
  if (mitDoneThisWeek.length) lines.push(`⭐ MIT bitiş: ${mitDoneThisWeek.length}`);
  if (topCategoryEntry) {
    const emoji = { odev: '📚', ders: '📖', ev: '🏠', kisisel: '💜' }[topCategoryEntry[0]] || '🏷️';
    lines.push(`🏆 En aktif: ${emoji} ${catLabels[topCategoryEntry[0]] || topCategoryEntry[0]} (${topCategoryEntry[1]})`);
  }
  if (pomoTotal) lines.push(`🎧 Pomodoro: ${pomoTotal}`);
  if (overdueNow.length) lines.push(`⚠️ Gecikmiş bekleyen: ${overdueNow.length}`);
  if (estimateNote) lines.push(`⏱️ ${estimateNote}`);
  if (bestHourNote) lines.push(`⏰ En verimli saat: ${bestHourNote}`);
  if (aiComment) {
    lines.push('');
    lines.push(`💜 ${aiComment}`);
  }
  if (doneThisWeek.length === 0) {
    lines.push('');
    lines.push('💜 Bu hafta görev bitmemiş — bazen sadece var olmak da yeterli. Yarın yeni hafta.');
  }
  return { title: '📊 Haftalık review', message: lines.join('\n') };
}

function buildDeadlineAlerts(data) {
  const today = trToday();
  const tasks = data.tasks || [];
  const alerts = [];
  for (let offset = 1; offset <= 2; offset++) {
    const targetDate = trDate(offset);
    tasks.filter(t => t.due === targetDate && !t.done && t.mitDate !== today)
      .forEach(t => alerts.push(`⏰ ${offset === 1 ? 'YARIN' : `${offset} gün sonra`}: ${t.text}`));
  }
  tasks.filter(t => t.due === today && !t.done)
    .forEach(t => alerts.push(`🔥 BUGÜN SON GÜN: ${t.text}`));
  if (alerts.length === 0) return null;
  return { title: '⏰ Deadline uyarısı', message: alerts.join('\n') };
}

// ============================================================
// Web Push (RFC 8291 aes128gcm payload + RFC 8292 VAPID)
// Cloudflare Workers crypto.subtle ile — harici kütüphane yok
// ============================================================
function b64urlToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function bytesToB64url(bytes) {
  const arr = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concatBytes(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// VAPID private key (base64url raw 32 byte) + public → CryptoKey (ECDSA P-256, sign)
async function importVapidPrivateKey(env) {
  const d = b64urlToBytes(env.VAPID_PRIVATE_KEY);
  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY); // 65 byte uncompressed (0x04 X Y)
  const jwk = {
    kty: 'EC', crv: 'P-256',
    d: bytesToB64url(d),
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true, key_ops: ['sign'],
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// VAPID JWT (ES256) — push servisine kimlik kanıtı
async function makeVapidJwt(audience, env) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:' + (env.AIDAN_EMAIL || 'aidan@example.com'),
  };
  const enc = (o) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const key = await importVapidPrivateKey(env);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${bytesToB64url(new Uint8Array(sig))}`; // WebCrypto ES256 = raw r||s (JWT formatı)
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

// RFC 8291 payload şifreleme (aes128gcm)
async function encryptPayload(subscription, payloadStr) {
  const clientPub = b64urlToBytes(subscription.keys.p256dh); // 65 byte
  const authSecret = b64urlToBytes(subscription.keys.auth);  // 16 byte

  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPub = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey)); // 65 byte

  const clientKey = await crypto.subtle.importKey('raw', clientPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeys.privateKey, 256));

  // IKM = HKDF(auth, shared, "WebPush: info\0"+clientPub+serverPub, 32)
  const keyInfo = concatBytes(new TextEncoder().encode('WebPush: info\0'), clientPub, serverPub);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  // plaintext + record delimiter (0x02 = son ve tek record)
  const padded = concatBytes(new TextEncoder().encode(payloadStr), new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // Header: salt(16) + recordSize(4 big-endian=4096) + idlen(1=65) + serverPub(65)
  const header = concatBytes(salt, new Uint8Array([0, 0, 0x10, 0]), new Uint8Array([serverPub.length]), serverPub);
  return concatBytes(header, ciphertext);
}

async function sendWebPush(subscription, payloadStr, env) {
  const url = new URL(subscription.endpoint);
  const jwt = await makeVapidJwt(`${url.protocol}//${url.host}`, env);
  const body = await encryptPayload(subscription, payloadStr);
  const r = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Urgency': 'high',
    },
    body,
  });
  return r.status; // 201 = ok; 404/410 = ölü subscription
}

// Tüm kayıtlı cihazlara push + ölü subscription temizliği
async function sendPushToAll(env, data, payload, sessionInfo) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return; // push kurulu değil — sessizce atla
  const subs = (data.settings && data.settings.pushSubs) || [];
  if (!subs.length) return;
  const payloadStr = JSON.stringify({
    title: payload.title || '🔔 Aidan',
    body: payload.message || '',
    // tag: aynı tag'li bildirim öncekini değiştirir. Blok bildirimlerinde blok
    // başına ayrı tag → arka arkaya gelen bloklar birbirini ezmez.
    tag: payload.tag || 'aidan-cron',
    // actions: Android/masaüstü Chrome gösterir. iOS PWA desteklemez —
    // orada bildirime tıklama fallback'i devreye girer (sw.js notificationclick).
    actions: payload.actions || undefined,
    data: { url: payload.url || '/', blockId: payload.blockId || null },
  });
  const dead = [];
  for (const sub of subs) {
    if (!sub.endpoint || !sub.keys) continue;
    try {
      const status = await sendWebPush(sub, payloadStr, env);
      if (status === 404 || status === 410) dead.push(sub.endpoint);
    } catch (e) {
      console.error('Push fail:', e.message);
    }
  }
  if (dead.length) {
    data.settings.pushSubs = subs.filter(s => !dead.includes(s.endpoint));
    // Multi-user: sessionInfo.userId varsa o user'ı kaydet; yoksa eski tek-user saveAidan
    try {
      if (sessionInfo && sessionInfo.userId && hasServiceKey(env)) {
        await saveUserData(env, sessionInfo.userId, data);
      } else {
        await saveAidan(env, data, sessionInfo);
      }
    } catch (e) { console.error('pushSub cleanup save fail', e.message); }
  }
}

// 🧩 Modüller arası "dün özeti" — sabah brifingine eklenen tek satır (görev + kalori + su + odak + takviye).
// Odak: data.focusDays günlüğünden (pomoToday sadece bugünü tutar). Takviye: reminders[].takenLog.
// Sıfır değerler yazılmaz — utanç değil bilgi.
function buildDailySummaryLine(data) {
  const y = trDate(-1);
  const parts = [];
  const doneY = (data.tasks || []).filter(t => t.doneDate === y).length;
  if (doneY) parts.push(`✓ ${doneY} görev`);
  const d = data.diet || {};
  const day = (d.days || {})[y];
  if (day) {
    const kcal = (day.meals || []).reduce((s, m) => s + (+m.kcal || 0), 0);
    if (kcal) parts.push(`${kcal}/${d.kcalGoal || 2000} kcal`);
    if (day.waterL) parts.push(`${String(day.waterL).replace('.', ',')} L su`);
  }
  const focusY = (data.focusDays || {})[y];
  if (focusY) parts.push(`${focusY} odak seansı`);
  const supps = (data.reminders || []).filter(r => r.kind === 'supp');
  const takenY = supps.filter(r => (r.takenLog || []).includes(y)).length;
  if (takenY) parts.push(`💊 ${takenY}/${supps.length} takviye`);
  if (!parts.length) return '';
  return `📊 Dün: ${parts.join(' · ')}`;
}

async function runCronJob(env, type) {
  const users = await fetchAllUsers(env);
  const results = [];
  for (const u of users) {
    try {
      let payload = null;
      switch (type) {
        case 'morning': {
          payload = await buildMorningAi(env, u.data, autoSetMorningMit(u.data));
          const dsl = buildDailySummaryLine(u.data);
          if (payload && dsl) payload.message += `\n\n${dsl}`;
          break;
        }
        case 'noon':     payload = buildNoon(u.data); break;
        case 'evening':  payload = buildEvening(u.data); break;
        case 'deadline': payload = buildDeadlineAlerts(u.data); break;
        case 'weekly':   payload = await buildWeekly(env, u.data); break;
        case 'health':   payload = await buildHealthWeekly(env, u.data); break;
        default: throw new Error(`Bilinmeyen tip: ${type}`);
      }
      if (!payload) { results.push({ userId: u.userId, sent: false, reason: 'no-content' }); continue; }
      const subs = (u.data.settings && u.data.settings.pushSubs) || [];
      await sendPushToAll(env, u.data, payload, { userId: u.userId });
      logPush(u.data, type, payload, subs.length);
      try { await saveUserData(env, u.userId, u.data); } catch (e) { console.error(`save fail user=${u.userId}`, e.message); }
      results.push({ userId: u.userId, sent: true, subs: subs.length });
    } catch (e) {
      results.push({ userId: u.userId, sent: false, error: e.message });
    }
  }
  return { type, users: users.length, results, multiUser: hasServiceKey(env) };
}

// Bildirim kaydını data.pushLog'a ekle (son 7 gün + max 60 kayıt)
function logPush(data, type, payload, deviceCount) {
  data.pushLog = data.pushLog || [];
  const title = (payload.title || '🔔 Aidan');
  // Mesajı kısalt — HTML etiketlerini ayıkla, ilk 140 karakter
  let body = String(payload.message || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (body.length > 140) body = body.slice(0, 140) + '…';
  data.pushLog.unshift({ type, title, body, when: Date.now(), devices: deviceCount });
  const weekAgo = Date.now() - 7 * 86400000;
  data.pushLog = data.pushLog.filter(e => e.when >= weekAgo).slice(0, 60);
}

// ============================================================
// Aidan tool'ları (webhook'tan AI çağırır)
// ============================================================
function parseDueText(s) {
  if (!s) return null;
  s = String(s).trim().toLowerCase();
  if (!s) return null;
  if (s === 'bugün' || s === 'bugun' || s === 'today') return trToday();
  if (s === 'yarın' || s === 'yarin' || s === 'tomorrow') return trDate(1);
  if (s === 'haftaya' || s === 'next week') return trDate(7);

  const dayMap = { 'pazartesi':1, 'salı':2, 'sali':2, 'çarşamba':3, 'carsamba':3, 'perşembe':4, 'persembe':4, 'cuma':5, 'cumartesi':6, 'pazar':0 };
  for (const [name, dow] of Object.entries(dayMap)) {
    if (s.includes(name)) {
      const todayDow = new Date(Date.now() + TR_OFFSET_MS).getUTCDay();
      let diff = (dow - todayDow + 7) % 7;
      if (diff === 0) diff = 7; // "salı" denirse haftaya salı
      if (s.includes('gelecek') || s.includes('haftaya')) diff = ((dow - todayDow + 7) % 7) + 7;
      return trDate(diff);
    }
  }
  // YYYY-MM-DD veya DD.MM.YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\.\/-](\d{1,2})(?:[\.\/-](\d{4}))?$/);
  if (m) {
    const [_, d, mo, y] = m;
    const year = y || new Date(Date.now() + TR_OFFSET_MS).getUTCFullYear();
    return `${year}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  return null;
}

// Seri planlama yardımcıları (MCP'deki Python helper'larının JS karşılığı)
function countAvailDays(startIso, deadlineIso, skipWeekends) {
  let n = 0;
  const d = new Date(startIso + 'T00:00:00Z');
  const end = new Date(deadlineIso + 'T00:00:00Z');
  while (d <= end) {
    const dow = d.getUTCDay();
    if (!(skipWeekends && (dow === 0 || dow === 6))) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

function planSeriesDays(startIso, deadlineIso, parts, skipWeekends) {
  if (parts <= 0) return [];
  const avail = [];
  const d = new Date(startIso + 'T00:00:00Z');
  const end = new Date(deadlineIso + 'T00:00:00Z');
  while (d <= end) {
    const dow = d.getUTCDay();
    if (!(skipWeekends && (dow === 0 || dow === 6))) {
      avail.push(d.toISOString().slice(0, 10));
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  if (!avail.length) return new Array(parts).fill(deadlineIso);
  if (avail.length >= parts) {
    if (parts === 1) return [avail[0]];
    const step = (avail.length - 1) / (parts - 1);
    return Array.from({ length: parts }, (_, i) => avail[Math.round(i * step)]);
  }
  const out = [...avail];
  while (out.length < parts) out.push(deadlineIso);
  return out;
}

const TOOL_HANDLERS = {
  async add_task(args, ctx) {
    const text = String(args.text || '').trim();
    if (!text) return { ok: false, reply: '❌ Görev metni boş.' };
    const today = trToday();
    const tasks = ctx.data.tasks = ctx.data.tasks || [];

    let mit = !!args.mit;
    if (mit) {
      const mitCount = tasks.filter(t => t.mitDate === today && !t.done).length;
      if (mitCount >= 3) {
        return { ok: false, reply: `❌ "${text}" eklenemedi — bugünün 3'ü dolu (MIT limiti). Önce birini bitir.` };
      }
    }

    const t = {
      id: Date.now(),
      text,
      done: false,
      doneDate: null,
      subtasks: [],
      created: new Date(Date.now() + TR_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 16),
      priority: ['urgent','normal','low'].includes(args.priority) ? args.priority : 'normal',
      category: ['odev','ders','ev','kisisel'].includes(args.category) ? args.category : null,
      due: parseDueText(args.due),
      estimateMin: args.estimate_min ? parseInt(args.estimate_min) : null,
      actualMin: null,
      repeat: ['daily','weekly','weekdays','weekends'].includes(args.repeat) ? args.repeat : null,
      reminderTime: args.reminder_time && /^\d{1,2}:\d{2}$/.test(args.reminder_time) ? args.reminder_time : null,
      lastReminded: null,
      mitDate: mit ? today : null,
      streakCount: 0,
      lastStreakDate: null,
      seriesId: null,
      seriesName: null,
      seriesIndex: null,
      seriesTotal: null,
    };
    tasks.push(t);
    ctx.dirty = true;

    const bits = [`✅ Eklendi: ${text}`];
    if (t.due) bits.push(`📅 ${t.due}`);
    if (t.reminderTime) bits.push(`🔔 ${t.reminderTime}`);
    if (t.category) bits.push(`🏷️ ${({odev:'Ödev',ders:'Özel Ders',ev:'Ev',kisisel:'Kişisel'})[t.category]}`);
    if (t.priority === 'urgent') bits.push('🔴 Acil');
    if (mit) bits.push("⭐ MIT'e eklendi");
    return { ok: true, reply: bits.join(' · ') };
  },

  async list_tasks(args, ctx) {
    const today = trToday();
    let tasks = ctx.data.tasks || [];
    const filter = String(args.filter || 'active').toLowerCase();
    if (filter === 'done') tasks = tasks.filter(t => t.done);
    else if (filter === 'mit') tasks = tasks.filter(t => t.mitDate === today && !t.done);
    else if (filter === 'today') tasks = tasks.filter(t => !t.done && (t.due === today || t.mitDate === today || t.priority === 'urgent'));
    else if (filter === 'urgent') tasks = tasks.filter(t => t.priority === 'urgent' && !t.done);
    else if (filter !== 'all') tasks = tasks.filter(t => !t.done);

    if (!tasks.length) return { ok: true, reply: `📭 Görev yok (${filter}).` };

    const lines = [`📋 ${tasks.length} görev (${filter}):`];
    tasks.slice(0, 15).forEach(t => {
      const marks = [];
      if (t.priority === 'urgent') marks.push('🔴');
      if (t.mitDate === today) marks.push('⭐');
      if (t.due === today) marks.push('📅bugün');
      else if (t.due) marks.push(`📅${t.due}`);
      lines.push(`${t.done ? '✅' : '⬜'} ${t.text}${marks.length ? ' · ' + marks.join(' ') : ''}`);
    });
    if (tasks.length > 15) lines.push(`... ve ${tasks.length - 15} tane daha`);
    return { ok: true, reply: lines.join('\n') };
  },

  async complete_task(args, ctx) {
    const q = String(args.query || '').trim().toLowerCase();
    if (!q) return { ok: false, reply: '❌ Hangi görev?' };
    const tasks = ctx.data.tasks || [];
    const matches = tasks.filter(t => !t.done && (t.text || '').toLowerCase().includes(q));
    if (!matches.length) return { ok: false, reply: `❌ "${q}" eşleşen bitmemiş görev yok.` };
    if (matches.length > 1) {
      const list = matches.slice(0, 5).map(t => `• ${t.text}`).join('\n');
      return { ok: false, reply: `🤔 Birden fazla eşleşme:\n${list}\nDaha net belirt.` };
    }
    const t = matches[0];
    t.done = true;
    t.doneDate = trToday();
    ctx.dirty = true;
    return { ok: true, reply: `✅ Bitti: ${t.text}` };
  },

  async delete_task(args, ctx) {
    const q = String(args.query || '').trim().toLowerCase();
    if (!q) return { ok: false, reply: '❌ Hangi görev?' };
    const tasks = ctx.data.tasks || [];
    const matches = tasks.filter(t => (t.text || '').toLowerCase().includes(q));
    if (!matches.length) return { ok: false, reply: `❌ "${q}" eşleşmedi.` };
    if (matches.length > 1) {
      const list = matches.slice(0, 5).map(t => `• ${t.text}`).join('\n');
      return { ok: false, reply: `🤔 Birden fazla eşleşme:\n${list}\nDaha net belirt.` };
    }
    const t = matches[0];
    ctx.data.tasks = tasks.filter(x => x.id !== t.id);
    ctx.dirty = true;
    return { ok: true, reply: `🗑️ Silindi: ${t.text}` };
  },

  async show_briefing(args, ctx) {
    const payload = buildMorning(ctx.data);
    return { ok: true, reply: payload.message };
  },

  async set_mit(args, ctx) {
    const q = String(args.query || '').trim().toLowerCase();
    if (!q) return { ok: false, reply: '❌ Hangi görevi MIT yapayım?' };
    const today = trToday();
    const tasks = ctx.data.tasks || [];
    const matches = tasks.filter(t => !t.done && (t.text || '').toLowerCase().includes(q));
    if (!matches.length) return { ok: false, reply: `❌ "${q}" eşleşen aktif görev yok.` };
    if (matches.length > 1) {
      const list = matches.slice(0, 5).map(t => `• ${t.text}`).join('\n');
      return { ok: false, reply: `🤔 Birden fazla eşleşme:\n${list}\nDaha net belirt.` };
    }
    const t = matches[0];
    if (t.mitDate === today) {
      return { ok: true, reply: `⭐ "${t.text}" zaten bugünün MIT'sinde.` };
    }
    const mitCount = tasks.filter(x => x.mitDate === today && !x.done).length;
    if (mitCount >= 3) {
      return { ok: false, reply: `❌ Bugünün 3'ü dolu. Önce birini bitir veya MIT'ten çıkar.` };
    }
    t.mitDate = today;
    ctx.dirty = true;
    return { ok: true, reply: `⭐ "${t.text}" bugünün MIT'sine eklendi (${mitCount + 1}/3).` };
  },

  async unset_mit(args, ctx) {
    const q = String(args.query || '').trim().toLowerCase();
    if (!q) return { ok: false, reply: '❌ Hangi görevi MIT\'ten çıkarayım?' };
    const today = trToday();
    const tasks = ctx.data.tasks || [];
    const matches = tasks.filter(t => t.mitDate === today && (t.text || '').toLowerCase().includes(q));
    if (!matches.length) return { ok: false, reply: `❌ "${q}" eşleşen bugünün MIT'inde görev yok.` };
    const t = matches[0];
    t.mitDate = null;
    ctx.dirty = true;
    return { ok: true, reply: `✅ "${t.text}" MIT'ten çıkarıldı.` };
  },

  async postpone_task(args, ctx) {
    const q = String(args.query || '').trim().toLowerCase();
    if (!q) return { ok: false, reply: '❌ Hangi görev?' };
    const to = parseDueText(args.to || 'yarın') || trDate(1);
    const tasks = ctx.data.tasks || [];
    const matches = tasks.filter(t => !t.done && (t.text || '').toLowerCase().includes(q));
    if (!matches.length) return { ok: false, reply: `❌ "${q}" eşleşmedi.` };
    if (matches.length > 1) {
      const list = matches.slice(0, 5).map(t => `• ${t.text}`).join('\n');
      return { ok: false, reply: `🤔 Birden fazla eşleşme:\n${list}\nDaha net belirt.` };
    }
    const t = matches[0];
    t.due = to;
    // Yarına atıldığı için bugünün MIT'inden çıkar
    if (t.mitDate === trToday() && to !== trToday()) t.mitDate = null;
    ctx.dirty = true;
    return { ok: true, reply: `📅 "${t.text}" → ${to} olarak ertelendi.` };
  },

  async brain_dump(args, ctx) {
    const text = String(args.text || '').trim();
    if (!text) return { ok: false, reply: '❌ Boş.' };
    ctx.data.dumps = ctx.data.dumps || [];
    ctx.data.dumps.push({
      text,
      when: new Date(Date.now() + TR_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 16),
    });
    ctx.dirty = true;
    return { ok: true, reply: `🧠 Eklendi (dump): ${text}` };
  },

  async update_task(args, ctx) {
    const q = String(args.query || '').trim().toLowerCase();
    if (!q) return { ok: false, reply: '❌ Hangi görev?' };
    const tasks = ctx.data.tasks || [];
    const matches = tasks.filter(t => !t.done && (t.text || '').toLowerCase().includes(q));
    if (!matches.length) return { ok: false, reply: `❌ "${q}" eşleşmedi.` };
    if (matches.length > 1) {
      const list = matches.slice(0, 5).map(t => `• ${t.text}`).join('\n');
      return { ok: false, reply: `🤔 Birden fazla eşleşme:\n${list}\nDaha net belirt.` };
    }
    const t = matches[0];
    const changes = [];
    if (args.text) { t.text = String(args.text).trim(); changes.push(`metin → ${t.text}`); }
    if (['urgent','normal','low'].includes(args.priority)) {
      t.priority = args.priority;
      changes.push(`öncelik → ${args.priority === 'urgent' ? '🔴 acil' : args.priority}`);
    }
    if (['odev','ders','ev','kisisel'].includes(args.category)) {
      t.category = args.category;
      changes.push(`kategori → ${({odev:'Ödev',ders:'Özel Ders',ev:'Ev',kisisel:'Kişisel'})[args.category]}`);
    }
    if (args.due !== undefined && args.due !== null && args.due !== '') {
      const d = parseDueText(args.due);
      if (d) { t.due = d; changes.push(`📅 → ${d}`); }
    }
    if (args.estimate_min !== undefined && args.estimate_min !== null) {
      const e = parseInt(args.estimate_min);
      if (!isNaN(e)) { t.estimateMin = e; changes.push(`tahmin → ${e}dk`); }
    }
    if (args.reminder_time && /^\d{1,2}:\d{2}$/.test(args.reminder_time)) {
      t.reminderTime = args.reminder_time;
      changes.push(`🔔 → ${args.reminder_time}`);
    }
    if (!changes.length) return { ok: false, reply: '❌ Değişecek bir şey yok.' };
    ctx.dirty = true;
    return { ok: true, reply: `✏️ "${t.text}" güncellendi: ${changes.join(', ')}` };
  },

  async add_subtask(args, ctx) {
    const q = String(args.query || '').trim().toLowerCase();
    const text = String(args.text || '').trim();
    if (!q) return { ok: false, reply: '❌ Hangi göreve?' };
    if (!text) return { ok: false, reply: '❌ Alt adım metni boş.' };
    const tasks = ctx.data.tasks || [];
    const matches = tasks.filter(t => !t.done && (t.text || '').toLowerCase().includes(q));
    if (!matches.length) return { ok: false, reply: `❌ "${q}" eşleşmedi.` };
    if (matches.length > 1) {
      const list = matches.slice(0, 5).map(t => `• ${t.text}`).join('\n');
      return { ok: false, reply: `🤔 Birden fazla eşleşme:\n${list}\nDaha net belirt.` };
    }
    const t = matches[0];
    t.subtasks = t.subtasks || [];
    t.subtasks.push({ text, done: false });
    ctx.dirty = true;
    return { ok: true, reply: `➕ "${t.text}" → alt adım: ${text}` };
  },

  async find_task(args, ctx) {
    const q = String(args.query || '').trim().toLowerCase();
    if (!q) return { ok: false, reply: '❌ Ne arıyorsun?' };
    const tasks = ctx.data.tasks || [];
    const hits = tasks.filter(t =>
      (t.text || '').toLowerCase().includes(q) ||
      (t.subtasks || []).some(s => (s.text || '').toLowerCase().includes(q))
    );
    if (!hits.length) return { ok: true, reply: `🔍 "${q}" eşleşmedi.` };
    const today = trToday();
    const lines = [`🔍 ${hits.length} eşleşme:`];
    hits.slice(0, 10).forEach(t => {
      const marks = [t.done ? '✅' : '⬜'];
      if (t.priority === 'urgent' && !t.done) marks.push('🔴');
      if (t.mitDate === today && !t.done) marks.push('⭐');
      if (t.due) marks.push(`📅${t.due}`);
      lines.push(`${marks.join(' ')} ${t.text}`);
    });
    if (hits.length > 10) lines.push(`... ve ${hits.length - 10} tane daha`);
    return { ok: true, reply: lines.join('\n') };
  },

  async add_homework_series(args, ctx) {
    const name = String(args.name || '').trim();
    if (!name) return { ok: false, reply: '❌ Ödev adı boş.' };
    const deadline = parseDueText(args.deadline);
    if (!deadline) return { ok: false, reply: `❌ Son tarih anlaşılamadı: "${args.deadline || '?'}"` };
    const today = trToday();
    const startIso = args.start ? (parseDueText(args.start) || today) : today;
    if (deadline < startIso) return { ok: false, reply: '❌ Son tarih başlangıçtan önce.' };

    const skipW = !!args.skip_weekends;
    let items = [];
    if (Array.isArray(args.chunk_labels) && args.chunk_labels.length) {
      items = args.chunk_labels.map(s => `${name}: ${String(s)}`);
    } else if (args.pages_from !== undefined && args.pages_to !== undefined) {
      const pf = parseInt(args.pages_from);
      const pt = parseInt(args.pages_to);
      if (isNaN(pf) || isNaN(pt) || pt < pf) return { ok: false, reply: '❌ Sayfa aralığı hatalı.' };
      const totalPages = pt - pf + 1;
      const availDays = countAvailDays(startIso, deadline, skipW);
      const n = args.chunks ? parseInt(args.chunks) : Math.max(1, Math.min(totalPages, availDays));
      const per = Math.floor(totalPages / n);
      const rem = totalPages % n;
      let cur = pf;
      for (let i = 0; i < n; i++) {
        const extra = i < rem ? 1 : 0;
        const end = cur + per - 1 + extra;
        items.push(`${name}: s.${cur}-${end}`);
        cur = end + 1;
      }
    } else if (args.chunks) {
      const n = parseInt(args.chunks);
      if (isNaN(n) || n <= 0) return { ok: false, reply: '❌ chunks geçersiz.' };
      for (let i = 0; i < n; i++) items.push(`${name} — ${i + 1}/${n}`);
    } else {
      return { ok: false, reply: '❌ Ya pages_from/pages_to, ya chunks/chunk_labels ver.' };
    }

    const days = planSeriesDays(startIso, deadline, items.length, skipW);
    const seriesId = String(Date.now());
    const createdNow = new Date(Date.now() + TR_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 16);
    const dailyMin = args.daily_minutes ? parseInt(args.daily_minutes) : null;
    const reminderTime = args.reminder_time && /^\d{1,2}:\d{2}$/.test(args.reminder_time) ? args.reminder_time : null;
    const cat = ['odev','ders','ev','kisisel'].includes(args.category) ? args.category : 'odev';
    const mitFirst = args.mit_first !== false;

    const tasks = ctx.data.tasks = ctx.data.tasks || [];
    const added = [];
    for (let i = 0; i < items.length; i++) {
      const day = days[i];
      const t = {
        id: Date.now() + i,
        text: items[i],
        done: false,
        doneDate: null,
        subtasks: [],
        created: createdNow,
        priority: 'normal',
        category: cat,
        due: day,
        estimateMin: dailyMin,
        actualMin: null,
        repeat: null,
        reminderTime,
        lastReminded: null,
        mitDate: (mitFirst && i === 0 && day === today) ? today : null,
        streakCount: 0,
        lastStreakDate: null,
        seriesId,
        seriesName: name,
        seriesIndex: i + 1,
        seriesTotal: items.length,
      };
      tasks.push(t);
      added.push({ day, text: items[i] });
    }
    ctx.dirty = true;

    const lines = [`📚 "${name}" planlandı: ${items.length} parça, son ${deadline}`];
    added.slice(0, 8).forEach(({ day, text }) => lines.push(`  • ${day}: ${text}`));
    if (added.length > 8) lines.push(`  ... ve ${added.length - 8} parça daha`);
    if (dailyMin) lines.push(`⏱️ Her parça ~${dailyMin}dk`);
    if (reminderTime) lines.push(`🔔 Her gün ${reminderTime}`);
    if (mitFirst && added[0]?.day === today) lines.push(`⭐ İlk parça bugünün MIT'inde`);
    return { ok: true, reply: lines.join('\n') };
  },

  async reschedule_series(args, ctx) {
    const sname = String(args.series_name || '').trim().toLowerCase();
    if (!sname) return { ok: false, reply: '❌ Hangi seri? (series_name lazım)' };
    const newDeadline = parseDueText(args.new_deadline);
    if (!newDeadline) return { ok: false, reply: `❌ Yeni son tarih anlaşılamadı: "${args.new_deadline || '?'}"` };
    const tasks = ctx.data.tasks || [];
    const items = tasks.filter(t => (t.seriesName || '').toLowerCase().includes(sname));
    if (!items.length) return { ok: false, reply: `❌ "${sname}" eşleşen seri yok.` };
    items.sort((a, b) => (a.seriesIndex || 0) - (b.seriesIndex || 0));
    const pending = items.filter(t => !t.done);
    if (!pending.length) return { ok: true, reply: `✅ "${items[0].seriesName}" zaten tamamen bitmiş.` };
    const today = trToday();
    if (newDeadline < today) return { ok: false, reply: '❌ Yeni son tarih geçmişte.' };
    const days = planSeriesDays(today, newDeadline, pending.length, !!args.skip_weekends);
    for (let i = 0; i < pending.length; i++) pending[i].due = days[i];
    ctx.dirty = true;
    return { ok: true, reply: `🔄 "${items[0].seriesName}" yeniden planlandı: ${pending.length} parça → ${newDeadline}'a kadar dağıtıldı.` };
  },

  async list_series(args, ctx) {
    const tasks = ctx.data.tasks || [];
    const groups = {};
    for (const t of tasks) {
      if (t.seriesId) {
        const sid = String(t.seriesId);
        (groups[sid] = groups[sid] || []).push(t);
      }
    }
    const keys = Object.keys(groups);
    if (!keys.length) return { ok: true, reply: '📭 Hiç ödev serisi yok.' };
    const lines = [`📚 ${keys.length} seri:`];
    for (const sid of keys) {
      const items = groups[sid].sort((a, b) => (a.seriesIndex || 0) - (b.seriesIndex || 0));
      const done = items.filter(t => t.done).length;
      const total = items.length;
      const name = items[0].seriesName || '?';
      const next = items.find(t => !t.done);
      const nextStr = next ? ` · Sıradaki: ${next.text}${next.due ? ` (${next.due})` : ''}` : ' · ✅ Bitti';
      lines.push(`• ${name}: ${done}/${total}${nextStr}`);
    }
    return { ok: true, reply: lines.join('\n') };
  },
};

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Yeni bir görev ekle. Salim "ekle/yap/hatırlat/ödev var" gibi şeyler söylerse kullan.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Görev metni' },
          priority: { type: 'string', enum: ['urgent','normal','low'], description: '"acil" denirse urgent' },
          category: { type: 'string', enum: ['odev','ders','ev','kisisel'], description: 'odev=okul ödevi, ders=özel ders/kursa katılım, ev=ev işi, kisisel=kişisel' },
          due: { type: 'string', description: 'Son tarih: "bugün", "yarın", "salı", "DD.MM.YYYY" veya "YYYY-MM-DD"' },
          estimate_min: { type: 'integer', description: 'Tahmini dakika' },
          reminder_time: { type: 'string', description: 'HH:MM formatında saat hatırlatma' },
          repeat: { type: 'string', enum: ['daily','weekly','weekdays','weekends'] },
          mit: { type: 'boolean', description: '"bugünün önemlilerinden" / "MIT" denirse true' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Mevcut görevleri listele. "ne var", "görevlerim", "bugün ne var" gibi durumlarda.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['active','today','done','mit','urgent','all'], description: 'Hangi görevler' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Bir görevi tamamla. "matematik bitti", "X yaptım" gibi durumlarda.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Görev metninden parça (örn. "matematik")' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Bir görevi sil.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Görev metninden parça' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_briefing',
      description: 'Bugünün özetini ver: MIT, acil, deadline\'lar. "bugün ne yapayım", "özet", "durum" denirse.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_mit',
      description: 'Bir görevi bugünün MIT\'ine (3\'üne) ekle. "X\'i MIT yap", "X\'i bugünün 3\'üne ekle", "X öncelikli olsun" denirse.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Görev metninden parça' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unset_mit',
      description: 'Bir görevi MIT\'ten çıkar. "X\'i MIT\'ten çıkar" denirse.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Görev metninden parça' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'postpone_task',
      description: 'Bir görevi başka güne ertele. "X\'i yarına at", "X\'i salıya ertele", "X\'i 3 gün sonraya kaydır" denirse.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Görev metninden parça' },
          to: { type: 'string', description: 'Yeni tarih: "yarın", "salı", "DD.MM.YYYY", "YYYY-MM-DD"' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'brain_dump',
      description: 'Akla geleni Brain Dump\'a kaydet. "şunu unutma", "bir fikir geldi", "şu lazım" gibi yapısı olmayan şeyler için.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Mevcut görevin alanlarını güncelle (metin/tarih/saat/öncelik/kategori/tahmin). "X\'in saatini 18\'e al", "X\'i acil yap", "X\'in tahminini 30dk yap" denirse.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Hangi görev (metninden parça)' },
          text: { type: 'string', description: 'Yeni görev metni' },
          priority: { type: 'string', enum: ['urgent','normal','low'] },
          category: { type: 'string', enum: ['odev','ders','ev','kisisel'] },
          due: { type: 'string', description: 'Yeni son tarih (bugün/yarın/salı/DD.MM.YYYY)' },
          estimate_min: { type: 'integer', description: 'Yeni tahmini dakika' },
          reminder_time: { type: 'string', description: 'Yeni saat hatırlatma HH:MM' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_subtask',
      description: 'Bir göreve alt adım/madde ekle. "X görevine şu adımı ekle", "X\'in altına şunu yaz" denirse.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Ana görevin metninden parça' },
          text: { type: 'string', description: 'Alt adım metni' },
        },
        required: ['query', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_task',
      description: 'Görev metni veya alt adım metninde arama yap. "X\'e dair ne var", "matematikle ilgili görevler" denirse.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Aranacak kelime' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_homework_series',
      description: 'Bir ödevi otomatik günlere böl. "tarih kitabı 50-100 sayfa salıya bitsin", "fizik 5 konuyu önümüzdeki haftaya yay" denirse.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Ödev adı (örn: "Tarih kitabı", "Fizik test")' },
          deadline: { type: 'string', description: 'Son tarih: yarın, salı, gelecek hafta, DD.MM.YYYY' },
          pages_from: { type: 'integer', description: 'Başlangıç sayfası' },
          pages_to: { type: 'integer', description: 'Bitiş sayfası' },
          chunks: { type: 'integer', description: 'Kaç parçaya bölünsün (sayfa yoksa)' },
          chunk_labels: { type: 'array', items: { type: 'string' }, description: 'Her parçanın metni listesi (örn: ["Konu 1","Konu 2"])' },
          daily_minutes: { type: 'integer', description: 'Her parça için tahmini dk' },
          category: { type: 'string', enum: ['odev','ders','ev','kisisel'] },
          reminder_time: { type: 'string', description: 'Her gün HH:MM hatırlatma' },
          start: { type: 'string', description: 'Başlangıç günü (varsayılan bugün)' },
          skip_weekends: { type: 'boolean', description: 'Hafta sonu atla' },
          mit_first: { type: 'boolean', description: 'İlk parçayı bugünün MIT\'sine ekle (varsayılan true)' },
        },
        required: ['name','deadline'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_series',
      description: 'Bir ödev serisinin bitmemiş parçalarını yeni son tarihe göre yeniden dağıt. "tarih serisini cumaya kaydır" denirse.',
      parameters: {
        type: 'object',
        properties: {
          series_name: { type: 'string', description: 'Seri adından parça (örn: "tarih")' },
          new_deadline: { type: 'string', description: 'Yeni son tarih' },
          skip_weekends: { type: 'boolean' },
        },
        required: ['series_name','new_deadline'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_series',
      description: 'Tüm ödev serilerini ve ilerlemelerini listele. "seriler", "kaç ödev kaldı" denirse.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// ============================================================
// AI ile mesaj yorumla
// ============================================================
// Kullanıcının tercih ettiği seslenme — multi-user için.
// Öncelik: settings.displayName → user.email prefix → "kanka" nötr fallback.
function getUserDisplayName(data, userEmail) {
  const n = (data && data.settings && data.settings.displayName || '').trim();
  if (n) return n;
  if (userEmail && userEmail.includes('@')) {
    const prefix = userEmail.split('@')[0];
    // Sayı/nokta/altçizgi varsa cleanle, ilk harfi büyük yap
    const clean = prefix.replace(/[._\d]+/g, ' ').trim().split(/\s+/)[0];
    if (clean.length >= 2) return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  }
  return 'kanka';
}

function trGreetingByClock() {
  const h = new Date(Date.now() + TR_OFFSET_MS).getUTCHours();
  if (h < 6) return 'gece geç saat';
  if (h < 11) return 'sabah';
  if (h < 14) return 'öğle';
  if (h < 18) return 'öğleden sonra';
  if (h < 22) return 'akşam';
  return 'gece';
}

function buildSystemPrompt(data, userEmail) {
  const today = trToday();
  const tasks = data.tasks || [];
  const mit = tasks.filter(t => t.mitDate === today && !t.done);
  const totalActive = tasks.filter(t => !t.done).length;
  const doneToday = tasks.filter(t => t.done && t.doneDate === today).length;
  const overdue = tasks.filter(t => !t.done && t.due && t.due < today).length;
  const dueIn3 = tasks.filter(t => !t.done && t.due && t.due >= today && t.due <= trDate(3)).length;
  const oldStuck = tasks.filter(t => {
    if (t.done || !t.created) return false;
    // 5+ gündür duran, deadline'sız görev
    const createdMs = new Date(t.created).getTime();
    return !t.due && (Date.now() - createdMs) > 5 * 86400000;
  }).length;
  const pomoToday = (data.pomoToday && data.pomoToday.date === today) ? (data.pomoToday.count || 0) : 0;
  const name = getUserDisplayName(data, userEmail);
  const tod = trGreetingByClock();

  return `Sen Aidan'sın — ${name}'in ADHD asistanı. Görevin: yargısız, samimi, eylem-odaklı yardım.

⚠️ MUTLAK KURALLAR (ihlal etme):
1. TÜRKÇE konuş. Tek kelime İngilizce yok.
2. Çok kısa (1-2 cümle). Uzun monolog yok.
3. "${name}" diye hitap et. "Kullanıcı" deme.
4. "Your input is not sufficient", "As an AI" gibi robotik şablon ASLA. Anlamadığında "Anlamadım, biraz daha açar mısın ${name}?" tarzı Türkçe.
5. ASLA "tool çağırıyorum" / "şimdi ekliyorum" demeyme. Doğrudan tool'u çağır. Sonra tek cümle teyit ("Eklendi", "Bittiğini işaretledim" gibi) yeter.
6. Eleştirme, ders verme, "bunu yapmalıydın" deme. ADHD beyni utançtan beslenmez, eylemden beslenir.

📅 ${trDayName()}, ${today} (${trClock()}) — ${tod}
📊 Durum:
- ${totalActive} aktif görev, ${doneToday} bugün bitti, ${pomoToday} pomodoro
- ⭐ MIT: ${mit.length ? mit.map(t => t.text).join(' · ') : 'henüz seçilmemiş'}
${overdue ? `- ⚠️ ${overdue} gecikmiş görev var (deadline geçmiş)` : ''}
${dueIn3 ? `- 🔔 Önümüzdeki 3 günde ${dueIn3} deadline yaklaşıyor` : ''}
${oldStuck >= 3 ? `- 🕰️ ${oldStuck} görev 5+ gündür duruyor — fazla yüklenmiş olabilir` : ''}

🧠 BAĞLAM-FARKINDALIĞI (kullan ama bunu konuşma değil, sezgi olarak hisset):
- ${tod === 'sabah' ? 'Sabah — gün taze, MIT seçmediyse "bugünün 3\'ünü seçelim mi?" diye nazikçe sor.' : ''}${tod === 'akşam' || tod === 'gece' ? 'Akşam — gün biten bir gün. Yarın için ekleme yapıyorsa rahat ol, akşam günlüğü ipucu uygun düşebilir.' : ''}${overdue >= 3 ? ' Gecikmiş çok — empati önce, sonra "kaydıralım mı?" öner.' : ''}${dueIn3 >= 3 ? ' Deadline yoğunluk var — sakinleştir, küçük adıma böl ipucu uygun.' : ''}${pomoToday === 0 && (tod === 'öğle' || tod === 'öğleden sonra') ? ' Henüz pomodoro yok — odak ipucu uygun düşebilir (zorlamadan).' : ''}

📆 Tarih çözümleme:
- "bugün" = ${today} · "yarın" = ${trDate(1)} · "öbür gün" = ${trDate(2)}
- "haftaya" = ${trDate(7)} · "ay sonu" = ${trDate(30)}
- "salı/çarşamba/cuma" → en yakın o gün (bugün dahil değil)
- "gelecek hafta salı" → bir sonraki hafta + o gün
- Saat: HH:MM (örn. "akşam 7" → "19:00", "öğle 1" → "13:00")

🛠️ TOOL SEÇİMİ (hızlı karar):
| Niyet | Tool |
|---|---|
| ekle/yap/hatırlat/koy | add_task |
| göster/listele/ne var/aktif olanlar | list_tasks |
| bitti/yaptım/tamamladım | complete_task |
| sil/iptal/kaldır | delete_task |
| özet/durum/brifing/bugün ne yapayım | show_briefing |
| MIT yap/öncelikli/bugünün 3'üne | set_mit |
| MIT'ten çıkar | unset_mit |
| yarına at/erteleyelim/X gününe | postpone_task |
| saatini değiştir/acil yap/tahmini | update_task |
| alt adım ekle/böl/parçala | add_subtask |
| X'le ilgili görevler / X'i bul | find_task |
| ödev böl/N sayfa Y'ye kadar/seri | add_homework_series |
| seriyi yeniden dağıt/kaydır | reschedule_series |
| seriler/kaç ödev | list_series |
| şunu unutma/aklımda olsun | brain_dump |

🗨️ TOOL ÇAĞIRMA (sadece sohbet):
- Selam, naber, nasılsın, teşekkür, iyi geceler → samimi Türkçe cevap
- "neler yapabilirsin" → kısa liste (görev ekle/listele/MIT/erteleyelim/brain dump/özet)
- Genel sohbet/anlamsız mesaj → "${name}, açar mısın biraz?" gibi nazik soru

📝 ÖRNEK SOHBETLER (ton):
"naber" → "İyiyim ${name}, sen nasılsın? Bugün ne yapıyoruz?"
"selam" → "Selam ${name} 👋 Buradayım."
"saol" → "Rica ederim 💜"
"nasılsın" → "Burdayım, hazırım. Senin moralin nasıl?"
"iyi geceler" → "İyi geceler ${name}, yarın görüşürüz 🌙"
"yoruldum" → "Anladım ${name}. Bugün yeterince yaptın. Mola al, yarın devam."
"odaklanamıyorum" → "Anlaşıldı. 5dk dene? Küçük başla, momentumu yakala."
"bir şey unuttum" → "Sorun değil, brain dump'a not alalım mı? Yaz, bitince hatırlatırım."

🎯 ÖRNEK TOOL ÇAĞRILARI:
"yarın matematik ödevi" → add_task(text="matematik ödevi", due="yarın", category="odev")
"perşembe 16:00 matematik özel dersi" → add_task(text="matematik özel dersi", due="perşembe", category="ders", reminder_time="16:00")
"her salı 17:00 fizik özel ders" → add_task(text="fizik özel dersi", category="ders", reminder_time="17:00", repeat="weekly")
"akşam 7'de ilaç" → add_task(text="ilaç al", reminder_time="19:00")
"matematik bitti" → complete_task(query="matematik")
"bugün ne yapayım" → show_briefing()
"matematik ödevini MIT yap" → set_mit(query="matematik")
"tarihi yarına at" → postpone_task(query="tarih", to="yarın")
"fizik ödevini salıya kaydır" → postpone_task(query="fizik", to="salı")
"matematiği 30 dk yap" → update_task(query="matematik", estimate_min=30)
"fiziğin saatini 18:30'a al" → update_task(query="fizik", reminder_time="18:30")
"tarihi acil yap" → update_task(query="tarih", priority="urgent")
"matematiğe 'soruları çöz' adımı ekle" → add_subtask(query="matematik", text="soruları çöz")
"tarih kitabı 50-100 sayfa salıya" → add_homework_series(name="Tarih kitabı", deadline="salı", pages_from=50, pages_to=100, category="odev")
"fizik 5 konuyu haftaya yay" → add_homework_series(name="Fizik", deadline="gelecek hafta", chunks=5, category="odev")
"tarih serisini cumaya kaydır" → reschedule_series(series_name="tarih", new_deadline="cuma")
"şarj kablosu lazım, unutma" → brain_dump(text="şarj kablosu lazım")

❌ YANLIŞ:
- "Görevi ekliyorum..." (tool çağırırken yazma, doğrudan çağır)
- "Tool: add_task..." (asla tool ismini söyleme)
- "I will help you" (İngilizce yasak)
- "Üzgünüm bunu yapamam" (mood/tıbbi tavsiye dışında varsa öneri sun)
- "Bunu yapmalıydın" (eleştiri/utanç yasak)

✅ DOĞRU:
- Direkt tool çağır → "Eklendi ✅" gibi tek cümle teyit.
- Tool yoksa: kısa Türkçe sohbet.
- Belirsizse: tek kısa soru sor ("Hangi gün ${name}?").`;
}

async function aiInterpret(env, data, userText, userEmail) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(data, userEmail) },
    { role: 'user', content: userText },
  ];

  const r = await aiRun(env, {
    messages,
    tools: TOOL_SCHEMAS,
    max_tokens: 512,
    temperature: 0.3,
  });

  return r; // { response: '...', tool_calls?: [...] }
}

// ============================================================
// PWA AI endpoint — AI beyni (aiInterpret + TOOL_HANDLERS) HTTP arayüzü
// ============================================================
function jsonCors(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

async function verifyUser(env, userToken) {
  if (!userToken) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${userToken}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.email ? u : null;
  } catch { return null; }
}

// Multi-user gate: service_role varsa herkes (auth olmuş) geçer; yoksa sadece AIDAN_EMAIL.
// Salim multi-user'a geçince hasServiceKey(env) true olur → whitelist kalkar.
function allowUser(env, user) {
  if (!user || !user.email) return false;
  if (hasServiceKey(env)) return true; // multi-user modu
  if (!env.AIDAN_EMAIL) return true; // env yoksa engelleme
  return user.email.toLowerCase() === env.AIDAN_EMAIL.toLowerCase();
}

async function handleAiApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const text = (body.text || '').trim();
  if (!text) return jsonCors({ error: 'empty' }, 400, cors);
  if (text.length > 500) return jsonCors({ error: 'too long' }, 400, cors);

  // Auth — kullanıcının Supabase access token'ını doğrula
  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  // MVP: sadece hesap sahibi (multi-user'da bu kontrol kalkar, herkes kendi verisine yazar)
  if (!allowUser(env, user)) {
    return jsonCors({ error: 'forbidden' }, 403, cors);
  }

  try {
    const session = await fetchUserDataForApi(env, user);
    const ctx = { data: session.data, dirty: false };
    const ai = await aiInterpret(env, session.data, text, user.email);
    const toolCalls = ai.tool_calls || [];
    const replies = [];

    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        const name = call.name || (call.function && call.function.name);
        let args = call.arguments || (call.function && call.function.arguments) || {};
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
        const handler = TOOL_HANDLERS[name];
        if (!handler) { replies.push(`Bilinmeyen komut: ${name}`); continue; }
        try {
          const result = await handler(args, ctx);
          replies.push(result.reply);
        } catch (e) {
          replies.push(`❌ ${name}: ${e.message}`);
        }
      }
      if (ctx.dirty) { session.data = ctx.data; await saveUserDataForApi(env, session); }
    } else {
      let reply = (ai.response || '').trim();
      if (!reply || /your input is not sufficient|please provide|^i'?m sorry|^as an ai|^i cannot/i.test(reply)) {
        reply = 'Anlamadım, biraz daha açar mısın? Örn: "yarın matematik ödevi" 💜';
      }
      replies.push(reply);
    }
    return jsonCors({ reply: replies.join('\n\n'), changed: ctx.dirty }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// ============================================================
// Akşam günlüğü — sesli/yazılı gün özeti, AI sıcak yansıma döner (tool YOK)
// ============================================================

// ============================================================
// 🫀 AI SAĞLIK KOÇU — uyku + antrenman + beslenme birlikte
// ============================================================
// İlke: SAYILARI PWA/Worker hesaplar, AI sadece yorumlar (portföy yorumu kalıbı).
// Frontend "Analiz et" → POST /health-coach
// Pazar 21:00 → runCronJob('health') (YENİ CRON YOK, mevcut Pazar cron'una biner)

// 16 yaşındaki bir kullanıcı için katı sınırlar — bu prompt gevşetilmemeli.
const HEALTH_COACH_PROMPT = (name) => `Sen Aidan'sın — ${name}'in sağlık koçu. ${name} 16 yaşında, ADHD (sakin/dalgın tip), lise öğrencisi.
Sana verilen TÜM sayılar uygulama tarafından hesaplandı — hepsi doğru. Senin işin bu sayıları YORUMLAMAK ve GELİŞTİRİLEBİLİR NOKTAYI göstermek.

GÖREVİN — TÜRKÇE, 5-8 kısa cümle, akıcı paragraf (madde listesi değil):
1. En dikkat çeken 1-2 örüntü — özellikle uyku ↔ antrenman ↔ beslenme ARASINDAKİ ilişki
2. İyi giden 1 şey (gerçekten varsa; uydurma)
3. Önümüzdeki hafta için EN FAZLA 2 somut ve küçük adım

VERİYİ NASIL OKUYACAKSIN:
- "Set dağılımı" ve "İtme/çekme oranı": dengeli aralık 0.8-1.3. Dışındaysa hangi yönün eksik olduğunu söyle.
- "Güç eğilimi": tahmini 1RM'in ilk yarı → son yarı değişimi. %0 civarı = durgunluk, eksi = gerileme.
  Durgunluk/gerileme görürsen önce UYKU ve YETERLİ YEMEK yönünden bak — daha ağır kaldırmayı önerme.
- "Haftalık hacim": toplam kaldırılan ton. Ani düşüş devamlılık kaybı, ani artış sakatlık riski demektir.
- "kısmi gün": beslenme kaydı eksik gün. Ortalamaya ZATEN katılmadı, sen de tekrar düzeltme yapma.
- "ENERJİ TUTARLILIĞI": loglanan kalorinin gerçeği ne kadar yansıttığını söyler.
  "eksik-log" yazıyorsa kalori/protein sayıları OLDUĞUNDAN DÜŞÜKTÜR — bu durumda beslenme yetersizliği
  yorumu YAPMA, bunun yerine kaydı tamamlamayı öner.
- "Makro kapsaması" düşükse aynı kural geçerli: protein sayısı eksik ölçümdür, "protein az" deme.
- "YAĞ ORANI": akıllı tartının biyoimpedans ölçümü. TEK ölçüm ±%3-5 sapar, su tutumundan etkilenir.
  Tek bir sayıyı ASLA yorumlama — sadece haftalık regresyon EĞİLİMİNİ yorumla.
- Kilo ile yağ oranı BİRLİKTE okunur:
  · kilo sabit + yağ oranı düşüyor → kas kazanıp yağ veriyor. Bu OLUMLUDUR ve tartı bunu göstermez, açıkça söyle.
  · kilo düşüyor + yağ oranı sabit/artıyor → kaybın bir kısmı kastan. Bu durumda DAHA AZ yemeyi değil,
    protein ve uykuyu öner.
- "Yağsız kütle" düşüyorsa yeterli yememe ya da uyku eksikliği sinyalidir. Çözümü DAHA AZ yemek değildir.
- "tartım kaydı gelmiyor" tespiti varsa otomatik aktarımın durmuş olabileceğini tek cümleyle hatırlat.
- Bir sayı verilmemişse o konuda konuşma. Yokluk, kötü olduğu anlamına gelmez.

✅ İZİN VERİLEN:
- Veriler arası ilişki kurmak ("az uyuduğun günlerde antrenmana gitmemişsin")
- Genel, iyi bilinen sağlık prensipleri (sabit yatış saati, antrenman sonrası protein, su)
- Küçük ve net öneri ("yatış saatini 30 dk öne al", "antrenman günü kahvaltıya 1 yumurta ekle")
- Nazik ama dürüst dil — utandırma yok, gerçeği yumuşatma da yok

🚫 MUTLAK YASAK:
1. Sayı uydurmak — verilmemişse YOK
2. Teşhis koymak, hastalık adı vermek, ilaç veya takviye önermek
3. Kalori kısıtlaması, kilo verme diyeti, "şu kadar kilo ver/al" demek — 16 yaşındaki biri için ASLA
4. Vücut şekli/görünüm yorumu ("kilolu", "zayıf", "forma girmek" gibi)
4b. Yağ oranı için "ideal/hedef/olması gereken" bir sayı vermek — sadece kendi eğilimiyle karşılaştır
5. Aşırı antrenman teşviki ("her gün git", "daha ağır kaldır")
6. 2'den fazla öneri — ADHD'de fazla seçenek felç eder
7. İngilizce
8. "Tıbbi tavsiye değildir" eki — arayüzde zaten yazıyor, tekrarlama

TON: yanında duran, veriye bakan bir arkadaş. Kısa cümle, net, suçlamayan.`;

// Uyku borcu — core.js sleepDebt()'in birebir ikizi (üstel ağırlıklı, asimetrik).
// Düz toplam DEĞİL: borç günde %15 erir, fazla uyku %50 verimle öder, 0'ın altına inmez.
const SLEEP_BAND_LABEL_SRV = { clear: 'temiz', mild: 'hafif', high: 'belirgin', severe: 'ağır' };
function sleepDebtSrv(data, target) {
  const DECAY = 0.85, PAYBACK = 0.5, MAXGAP = 4, MAXCRED = 2, WINDOW = 14, MODEL_MIN = 8;
  const all = (data.sleep || []).filter(s => s && s.date);
  // kişisel kalite→saat modeli (sabit katsayı uydurulmaz)
  let model = null;
  const both = all.filter(s => s.quality && s.hours != null);
  if (both.length >= MODEL_MIN) {
    const by = { bad: [], ok: [], good: [] }; const out = {}; let any = false;
    both.forEach(s => { if (by[s.quality]) by[s.quality].push(s.hours); });
    for (const q of Object.keys(by)) {
      const a = by[q].slice().sort((x, y) => x - y);
      if (a.length < 2) continue;
      const m = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
      out[q] = Math.round(m * 100) / 100;   // core.js ile birebir aynı yuvarlama
      any = true;
    }
    if (any) model = out;
  }
  const byDate = {}; all.forEach(s => { byDate[s.date] = s; });
  let D = 0, nights = 0, est = 0, missing = 0, started = false;
  for (let i = WINDOW - 1; i >= 0; i--) {
    const rec = byDate[trDate(-i)];
    let h = null, isEst = false;
    if (rec && rec.hours != null) h = rec.hours;
    else if (rec && model && rec.quality && model[rec.quality] != null) { h = model[rec.quality]; isEst = true; }
    if (h == null) { if (started) { D = D * DECAY; missing++; } continue; }
    started = true;
    const gap = target - h;
    const contrib = gap > 0 ? Math.min(gap, MAXGAP) : Math.max(gap, -MAXCRED) * PAYBACK;
    D = Math.max(0, D * DECAY + contrib);
    nights++; if (isEst) est++;
  }
  const debt = Math.round(D * 10) / 10;
  const band = debt < 2 ? 'clear' : debt < 5 ? 'mild' : debt < 9 ? 'high' : 'severe';
  return { debt, nights, est, missing, band, modeled: !!model };
}

/* ===================================================================
   SAĞLIK ANALİTİĞİ ÇEKİRDEĞİ (v7-121) — PAYLAŞILAN SAF FONKSİYONLAR
   ⚠️ Bu blok ui.js ve aidan-worker/worker.js içinde BİREBİR AYNIDIR.
   Birini değiştirirsen ötekini de değiştir — ikizlik testi bunu kontrol eder.
   Hiçbir global okumaz: her girdi parametreyle gelir, çıktı deterministiktir.
   Amaç: AI'a "gittin/gitmedin" değil, ANALİZ EDİLEBİLİR veri göndermek.
   =================================================================== */

// Hevy primary_muscle_group → kaba hareket grubu (itme/çekme/bacak dengesi için)
var HC_GROUP_OF = {
  chest: 'itme', shoulders: 'itme', triceps: 'itme',
  lats: 'cekme', upper_back: 'cekme', biceps: 'cekme', traps: 'cekme', forearms: 'cekme',
  quadriceps: 'bacak', hamstrings: 'bacak', glutes: 'bacak', calves: 'bacak',
  abductors: 'bacak', adductors: 'bacak',
  abdominals: 'govde', lower_back: 'govde', neck: 'govde',
  cardio: 'kardiyo', full_body: 'tam',
};
var HC_GROUP_TR = { itme: 'itme', cekme: 'çekme', bacak: 'bacak', govde: 'gövde', kardiyo: 'kardiyo', tam: 'tüm vücut', diger: 'diğer' };

// Template haritası yoksa egzersiz adından tahmin. SIRA ÖNEMLİ:
// "leg curl" biseps kıvırmasıyla karışmasın diye bacak kalıpları önce gelir.
var HC_NAME_HINTS = [
  [/squat|leg press|lunge|hack |çömelme|bacak pres/i, 'quadriceps'],
  [/deadlift|rdl|romanian|hamstring|leg curl|arka bacak/i, 'hamstrings'],
  [/glute|hip thrust|kalça/i, 'glutes'],
  [/calf|baldır/i, 'calves'],
  [/bench|chest|göğüs|push[- ]?up|pec |fly|dip\b|dips\b/i, 'chest'],
  [/shoulder|omuz|overhead|\bohp\b|lateral raise|front raise|arnold|upright/i, 'shoulders'],
  [/tricep|triseps|pushdown|skull|kickback/i, 'triceps'],
  [/pulldown|pull[- ]?up|chin[- ]?up|\blat\b|kanat|row\b|kürek|çekiş/i, 'lats'],
  [/bicep|biseps|curl|preacher|hammer/i, 'biceps'],
  [/trap|shrug/i, 'traps'],
  [/forearm|wrist|ön kol|grip/i, 'forearms'],
  [/abs?\b|crunch|plank|karın|core|sit[- ]?up|raise leg|leg raise/i, 'abdominals'],
  [/back extension|hyperext|good morning|bel/i, 'lower_back'],
  [/run|treadmill|bike|cycl|rowing machine|cardio|koşu|kardiyo|elliptical/i, 'cardio'],
];

// Egzersizin kas grubunu bul: önce Hevy template haritası (kesin), sonra ad tahmini.
// Dönüş { muscle, group, guessed } — guessed=true ise tahmindir, güven notu düşer.
function hcMuscleOf(ex, muscleMap) {
  var name = (ex && ex.name) || '';
  var tid = ex && ex.tid;
  if (tid && muscleMap && muscleMap[tid]) {
    var m = muscleMap[tid];
    return { muscle: m, group: HC_GROUP_OF[m] || 'diger', guessed: false };
  }
  for (var i = 0; i < HC_NAME_HINTS.length; i++) {
    if (HC_NAME_HINTS[i][0].test(name)) {
      var g = HC_NAME_HINTS[i][1];
      return { muscle: g, group: HC_GROUP_OF[g] || 'diger', guessed: true };
    }
  }
  return { muscle: 'other', group: 'diger', guessed: true };
}

// --- Saf tarih yardımcıları (iki tarafta da aynı sonucu versin diye yerel) ---
function hcShift(iso, n) {
  var d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function hcDayDiff(a, b) {   // b - a, gün
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}
function hcRound(x, n) { var p = Math.pow(10, n || 0); return Math.round(x * p) / p; }
function hcAvg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

/* ---------------- ANTRENMAN İSTATİSTİĞİ ----------------
   Girdi: normalize edilmiş Hevy antrenmanları (normalizeHevyWorkout çıktısı).
   Her antrenmanda volumeKg / setCount / durationMin, her egzersizde
   {name, tid, sets, volumeKg, top:{kg,reps,e1rm}} VAR — eskiden hiç kullanılmıyordu.
   Çıktı: dönem hacmi, haftalık set, kas grubu dağılımı, haftalık hacim serisi,
          en çok çalışılan egzersizlerde e1RM eğilimi.                        */
function hcHevyStats(workouts, fromDate, toDate, muscleMap) {
  var ws = (workouts || []).filter(function (w) { return w && w.date && w.date >= fromDate && w.date <= toDate; })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  if (!ws.length) return null;

  var spanDays = hcDayDiff(fromDate, toDate) + 1;
  var weeks = Math.max(1, spanDays / 7);
  var vol = 0, sets = 0, mins = 0, guessedSets = 0;
  var byGroup = { itme: 0, cekme: 0, bacak: 0, govde: 0, kardiyo: 0, tam: 0, diger: 0 };
  var exMap = {};
  var weekVol = {};   // haftaIndex → hacim

  for (var i = 0; i < ws.length; i++) {
    var w = ws[i];
    vol += w.volumeKg || 0;
    sets += w.setCount || 0;
    mins += w.durationMin || 0;
    var wk = Math.floor(hcDayDiff(fromDate, w.date) / 7);
    weekVol[wk] = (weekVol[wk] || 0) + (w.volumeKg || 0);

    var exs = w.exercises || [];
    for (var j = 0; j < exs.length; j++) {
      var ex = exs[j];
      if (!ex) continue;
      var info = hcMuscleOf(ex, muscleMap);
      byGroup[info.group] = (byGroup[info.group] || 0) + (ex.sets || 0);
      if (info.guessed) guessedSets += ex.sets || 0;
      var key = ex.name || 'Egzersiz';
      var e = exMap[key];
      if (!e) { e = exMap[key] = { name: key, sets: 0, vol: 0, pts: [], muscle: info.muscle }; }
      e.sets += ex.sets || 0;
      e.vol += ex.volumeKg || 0;
      if (ex.top && ex.top.e1rm) e.pts.push({ date: w.date, e1rm: ex.top.e1rm });
    }
  }

  // Haftalık hacim serisi (eksik hafta = 0, antrenmansız hafta gerçek bilgidir)
  var nWeeks = Math.ceil(spanDays / 7);
  var volSeries = [];
  for (var k = 0; k < nWeeks; k++) volSeries.push(Math.round(weekVol[k] || 0));

  // Son 2 hafta vs önceki 2 hafta hacim değişimi (yeterli veri varsa)
  var volTrendPct = null;
  if (volSeries.length >= 4) {
    var recent = volSeries.slice(-2).reduce(function (s, x) { return s + x; }, 0);
    var prev = volSeries.slice(-4, -2).reduce(function (s, x) { return s + x; }, 0);
    if (prev > 0) volTrendPct = Math.round((recent - prev) / prev * 100);
  }

  // e1RM eğilimi — en çok set yapılan egzersizler, ilk yarı en iyisi vs son yarı en iyisi
  var exList = Object.keys(exMap).map(function (k2) { return exMap[k2]; })
    .sort(function (a, b) { return b.sets - a.sets; });
  var strength = [];
  for (var m = 0; m < exList.length && strength.length < 5; m++) {
    var e2 = exList[m];
    if (e2.pts.length < 4) continue;
    var pts = e2.pts.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var span = hcDayDiff(pts[0].date, pts[pts.length - 1].date);
    if (span < 21) continue;                       // 3 haftadan kısa aralıkta trend okunmaz
    var half = Math.floor(pts.length / 2);
    var firstBest = Math.max.apply(null, pts.slice(0, half).map(function (p) { return p.e1rm; }));
    var lastBest = Math.max.apply(null, pts.slice(half).map(function (p) { return p.e1rm; }));
    strength.push({
      name: e2.name,
      sessions: pts.length,
      spanDays: span,
      firstE1rm: hcRound(firstBest, 1),
      lastE1rm: hcRound(lastBest, 1),
      pct: firstBest > 0 ? Math.round((lastBest - firstBest) / firstBest * 100) : null,
    });
  }

  var pushSets = byGroup.itme, pullSets = byGroup.cekme, legSets = byGroup.bacak;
  var namedSets = pushSets + pullSets + legSets + byGroup.govde;

  return {
    sessions: ws.length,
    spanDays: spanDays,
    perWeek: hcRound(ws.length / weeks, 1),
    volumeKg: Math.round(vol),
    volPerWeek: Math.round(vol / weeks),
    sets: sets,
    setsPerWeek: hcRound(sets / weeks, 1),
    avgMin: mins && ws.length ? Math.round(mins / ws.length) : null,
    byGroup: byGroup,
    pushPullRatio: pullSets > 0 ? hcRound(pushSets / pullSets, 2) : null,
    legShare: namedSets > 0 ? Math.round(legSets / namedSets * 100) : null,
    volSeries: volSeries,
    volTrendPct: volTrendPct,
    strength: strength,
    // Kas grubu ne kadar tahmine dayanıyor — güven şeffaflığı
    guessedPct: sets > 0 ? Math.round(guessedSets / sets * 100) : 0,
    lastDate: ws[ws.length - 1].date,
    topExercises: exList.slice(0, 6).map(function (e3) { return { name: e3.name, sets: e3.sets, muscle: e3.muscle }; }),
  };
}

/* ---------------- BESLENME İSTATİSTİĞİ ----------------
   KRİTİK DÜZELTME: eskiden bir öğün girilen gün de "tam gün" sayılıp
   ortalamaya giriyordu → kcal ve protein SİSTEMATİK OLARAK DÜŞÜK çıkıyordu,
   AI da buna bakıp "yetersiz besleniyorsun" diyordu. Artık kısmi gün ayrılır. */
function hcNutritionStats(dietDays, fromDate, toDate, isTrainDay, kcalGoal) {
  var full = [], partial = [], none = 0;
  // Kısmi eşiği: 2'den az öğün VEYA hedefin yarısının altı (hedef yoksa 600 kcal)
  var minKcal = kcalGoal ? Math.max(600, Math.round(kcalGoal * 0.5)) : 600;
  var mealsTotal = 0, mealsWithProtein = 0, mealsWithTime = 0;

  for (var d = fromDate; d <= toDate; d = hcShift(d, 1)) {
    var day = (dietDays || {})[d];
    var meals = (day && day.meals) || [];
    if (!meals.length) { none++; continue; }
    var kcal = 0, protein = 0, carb = 0, fat = 0, times = [];
    for (var i = 0; i < meals.length; i++) {
      var m = meals[i];
      kcal += m.kcal || 0;
      protein += m.protein || 0;
      carb += m.carb || 0;
      fat += m.fat || 0;
      mealsTotal++;
      if (m.protein != null) mealsWithProtein++;
      if (m.at) { mealsWithTime++; times.push({ at: m.at, slot: m.slot, kcal: m.kcal || 0 }); }
    }
    var rec = {
      date: d, kcal: Math.round(kcal), protein: Math.round(protein),
      carb: Math.round(carb), fat: Math.round(fat),
      waterL: (day && day.waterL) || 0, meals: meals.length, times: times,
    };
    if (meals.length < 2 || kcal < minKcal) partial.push(rec); else full.push(rec);
  }

  if (!full.length && !partial.length) return null;
  var base = full.length ? full : partial;   // hiç tam gün yoksa kısmiden konuş, ama işaretle
  var avg = function (f) { return hcAvg(base.map(f)); };

  // Antrenman günü vs dinlenme günü — AI'ın en çok işine yarayan kesit
  var gym = base.filter(function (x) { return isTrainDay(x.date); });
  var rest = base.filter(function (x) { return !isTrainDay(x.date); });
  var split = null;
  if (gym.length >= 2 && rest.length >= 2) {
    split = {
      gymDays: gym.length, restDays: rest.length,
      gymKcal: Math.round(hcAvg(gym.map(function (x) { return x.kcal; }))),
      restKcal: Math.round(hcAvg(rest.map(function (x) { return x.kcal; }))),
      gymProtein: Math.round(hcAvg(gym.map(function (x) { return x.protein; }))),
      restProtein: Math.round(hcAvg(rest.map(function (x) { return x.protein; }))),
    };
  }

  // Geç yeme: 22:00 sonrası öğün oranı (uyku ilişkisi için — saat kaydı varsa)
  var lateDays = 0, timedDays = 0;
  for (var j = 0; j < base.length; j++) {
    if (!base[j].times.length) continue;
    timedDays++;
    var late = base[j].times.some(function (t) {
      var h = parseInt(String(t.at).slice(0, 2), 10);
      return h >= 22 || h < 4;
    });
    if (late) lateDays++;
  }

  return {
    fullDays: full.length, partialDays: partial.length, missingDays: none,
    usingPartial: !full.length,
    kcal: Math.round(avg(function (x) { return x.kcal; })),
    protein: Math.round(avg(function (x) { return x.protein; })),
    carb: Math.round(avg(function (x) { return x.carb; })),
    fat: Math.round(avg(function (x) { return x.fat; })),
    waterL: hcRound(avg(function (x) { return x.waterL; }), 1),
    mealsPerDay: hcRound(avg(function (x) { return x.meals; }), 1),
    // Makro kapsaması: kcal girilip protein girilmeyen öğün ortalamayı düşürür
    proteinCoverPct: mealsTotal ? Math.round(mealsWithProtein / mealsTotal * 100) : 0,
    timeCoverPct: mealsTotal ? Math.round(mealsWithTime / mealsTotal * 100) : 0,
    lateEatDays: timedDays >= 3 ? lateDays : null,
    timedDays: timedDays,
    split: split,
  };
}

/* ---------------- KİLO EĞİLİMİ (en küçük kareler) ----------------
   Eskiden sadece "ilk kayıt / son kayıt" vardı — gürültüye açıktı.
   Regresyon eğimi haftalık gerçek değişimi verir.                   */
// Tek seri için en küçük kareler eğimi. Kilo/yağ oranı/yağsız kütle aynı
// yöntemden geçer — biyoimpedans gürültüsünde tek ölçüm değil EĞİM anlamlıdır.
function hcRegress(pts, key) {
  var v = (pts || []).filter(function (p) { return p && p[key] != null; });
  if (v.length < 4) return null;
  var span = hcDayDiff(v[0].date, v[v.length - 1].date);
  if (span < 14) return null;                    // 2 haftadan kısa seride eğim anlamsız
  var n = v.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (var i = 0; i < n; i++) {
    var x = hcDayDiff(v[0].date, v[i].date), y = v[i][key];
    sx += x; sy += y; sxy += x * y; sxx += x * x;
  }
  var den = n * sxx - sx * sx;
  if (!den) return null;
  return {
    n: n, spanDays: span,
    first: v[0][key], last: v[n - 1][key],
    firstDate: v[0].date, lastDate: v[n - 1].date,
    perWeek: hcRound((n * sxy - sx * sy) / den * 7, 2),
    total: hcRound(v[n - 1][key] - v[0][key], 1),
  };
}
// v7-122: kilo TEK BAŞINA yanıltıcı — kilo sabitken yağ düşüp kas artabilir.
// Üç seri ayrı ayrı regres edilir; eski alan adları (slopeKgPerWeek, totalChange…)
// geriye uyumluluk için korunur, yağ/yağsız kütle alt nesne olarak eklenir.
/* ---------------- KİLO DEĞİŞİMİNİN BİLEŞİMİ (v7-123) ----------------
   "Haftada +0.40 kg" tek başına iyi mi kötü mü SÖYLEMEZ: aynı sayı kas
   kazanımı da olabilir yağlanma da. Yağ kütlesi (kg) = kilo × yağ% ; yağsız
   kütle zaten kayıtlı. İkisinin eğimi kilonun eğimini paylaştırır:
       yağ payı % = (yağ kütlesi eğimi / kilo eğimi) × 100
   Bu bir ÇIKARMA işlemi — AI'a bırakılmaz. Dil modeli regresyon eğimini her
   çalıştırmada farklı hesaplar; sağlık verisinde aynı girdiden iki farklı
   sonuç çıkması kabul edilemez. Hesap burada, YORUM AI'da.                 */
function hcComposition(kgPerWeek, fatMassPerWeek, leanPerWeek) {
  if (kgPerWeek == null || fatMassPerWeek == null) return null;
  var out = {
    kgPerWeek: kgPerWeek,
    fatMassPerWeek: fatMassPerWeek,
    leanPerWeek: leanPerWeek != null ? leanPerWeek : hcRound(kgPerWeek - fatMassPerWeek, 2),
    fatSharePct: null,
    gaining: null,
    verdict: 'sabit',
  };
  // Kilo neredeyse sabitse paylaştırma anlamsız (0'a bölme + gürültü payı
  // sonucu uçurur). O durum zaten F kuralında rekompozisyon olarak ele alınır.
  if (Math.abs(kgPerWeek) < 0.05) return out;
  out.gaining = kgPerWeek > 0;
  out.fatSharePct = Math.round(fatMassPerWeek / kgPerWeek * 100);
  // Pay NEGATİF olabilir ve bu bir hata değil: kilo alırken yağ kaybetmek
  // (en iyi durum, pay < 0) ya da kilo verirken yağ kazanmak (en kötü durum,
  // yine pay < 0). Eşikler her iki ucu da doğru tarafa düşürür.
  if (out.gaining) {
    out.verdict = out.fatSharePct >= 70 ? 'yag-agirlikli'
      : (out.fatSharePct <= 40 ? 'kas-agirlikli' : 'dengeli-alim');
  } else {
    out.verdict = out.fatSharePct <= 40 ? 'kas-kaybi'
      : (out.fatSharePct >= 70 ? 'yag-kaybi' : 'dengeli-kayip');
  }
  return out;
}

function hcWeightTrend(weights, fromDate, toDate) {
  var pts = (weights || []).filter(function (w) {
    return w && w.date && w.date >= fromDate && w.date <= toDate;
  }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (!pts.length) return null;
  var kg = hcRegress(pts, 'kg'), fat = hcRegress(pts, 'fat'), lean = hcRegress(pts, 'lean');
  if (!kg && !fat) return null;
  var base = kg || fat;
  // Yağ KÜTLESİ (kg) — oran değil. Kilo eğimini paylaştırmak için gerekli.
  // Orijinal kayıtlara YAZILMAZ, kopya seri kurulur (yoksa türetilmiş alan
  // localStorage'a ve oradan buluta sızar).
  var mpts = pts.map(function (w) {
    var fm = null;
    if (w.kg != null && w.fat != null) fm = hcRound(w.kg * w.fat / 100, 2);
    else if (w.kg != null && w.lean != null) fm = hcRound(w.kg - w.lean, 2);
    return { date: w.date, fatMass: fm };
  });
  var fatMass = hcRegress(mpts, 'fatMass');
  return {
    n: base.n, spanDays: base.spanDays,
    first: kg ? kg.first : null, last: kg ? kg.last : null,
    firstDate: base.firstDate, lastDate: base.lastDate,
    slopeKgPerWeek: kg ? kg.perWeek : null,
    totalChange: kg ? kg.total : null,
    fat: fat, lean: lean,
    fatMass: fatMass,
    comp: hcComposition(kg ? kg.perWeek : null, fatMass ? fatMass.perWeek : null, lean ? lean.perWeek : null),
  };
}

/* ---------------- ENERJİ TUTARLILIK KONTROLÜ ----------------
   "Yüksek doğruluk" burada başlıyor: loglanan kalori ile GERÇEKLEŞEN kilo
   değişimi uyuşuyor mu? Uyuşmuyorsa beslenme ortalamaları güvenilmezdir ve
   AI bunu bilmek zorunda — yoksa eksik loga tam veri muamelesi yapar.
   1 kg yağ doku ≈ 7700 kcal.                                              */
function hcEnergyCheck(avgKcal, slopeKgPerWeek, calc) {
  if (avgKcal == null || slopeKgPerWeek == null || !calc) return null;
  var kg = Number(calc.weight), cm = Number(calc.height), age = Number(calc.age);
  var act = Number(calc.activity) || 1.55;
  if (!(kg > 0 && cm > 0 && age > 0)) return null;
  var bmr = Math.round(10 * kg + 6.25 * cm - 5 * age + (calc.sex === 'male' ? 5 : -161));
  var tdee = Math.round(bmr * act);
  // Enerji dengesi: günlük fazla/eksik = eğim(kg/hafta) * 7700 / 7
  var dailyBalance = slopeKgPerWeek * 7700 / 7;
  var impliedBurn = Math.round(avgKcal - dailyBalance);   // loga göre gerçek harcama
  var devPct = Math.round((impliedBurn - tdee) / tdee * 100);
  var verdict, note;
  if (devPct <= -20) {
    verdict = 'eksik-log';
    note = 'Loglanan kalori, kilo değişiminin gerektirdiğinden belirgin düşük — muhtemelen bazı öğünler girilmiyor. Kalori ve protein ortalamalarını OLDUĞUNDAN DÜŞÜK kabul et, "az yiyorsun" yorumu YAPMA.';
  } else if (devPct >= 20) {
    verdict = 'fazla-log';
    note = 'Loglanan kalori, kilo değişiminin gerektirdiğinden belirgin yüksek — porsiyonlar olduğundan büyük girilmiş ya da kilo kaydı seyrek olabilir.';
  } else {
    verdict = 'tutarli';
    note = 'Loglanan kalori ile kilo değişimi tutarlı — beslenme kayıtları güvenilir.';
  }
  return { bmr: bmr, tdee: tdee, impliedBurn: impliedBurn, devPct: devPct, verdict: verdict, note: note };
}

/* ---------------- KATMANLI ANALİZ PENCERESİ ----------------
   Tek 14 gün her şeye yetmiyordu: uyku borcu 14 günlük bir olgu ama
   antrenman progresyonu ve kilo eğilimi 2-3 ay istiyor.               */
var HC_WIN = { sleep: 14, diet: 28, train: 84, weight: 84 };

// Yeni lokal kurallar (AI'sız, $0) — antrenman/beslenme/kilo tarafı.
// healthPatterns() bunları uyku kurallarıyla birleştirip ciddiyete göre sıralar.
function hcTrainingPatterns(hev, nut, wt, energy, toDate) {
  var out = [];

  // A) Haftalık hacim düşüşü — devamlılık kaybının erken sinyali
  if (hev && hev.volTrendPct != null && hev.sessions >= 8) {
    if (hev.volTrendPct <= -25) {
      out.push({ level: 'warn', text: 'Son 2 haftada antrenman hacmin %' + Math.abs(hev.volTrendPct) + ' düştü.' });
    } else if (hev.volTrendPct >= 15) {
      out.push({ level: 'good', text: 'Antrenman hacmin son 2 haftada %' + hev.volTrendPct + ' arttı.' });
    }
  }

  // B) Kas grubu dengesizliği — itme/çekme oranı ve bacak payı
  if (hev && hev.setsPerWeek >= 6) {
    // Bir taraf TAMAMEN boşsa oran hesaplanamaz (0'a bölme) — en uç dengesizlik
    // sessizce kaybolmasın diye ayrıca yakalanır.
    if (hev.byGroup.cekme === 0 && hev.byGroup.itme >= 10) {
      out.push({ level: 'warn', text: 'Hiç çekme hareketi yok — omuz sağlığı için sırt/kanat ekle.' });
    } else if (hev.byGroup.itme === 0 && hev.byGroup.cekme >= 10) {
      out.push({ level: 'warn', text: 'Hiç itme hareketi yok — göğüs/omuz dengeyi tamamlar.' });
    } else if (hev.pushPullRatio != null && hev.pushPullRatio >= 1.8) {
      out.push({ level: 'warn', text: 'İtme setlerin çekmenin ' + hev.pushPullRatio + ' katı — omuz sağlığı için çekmeyi artır.' });
    } else if (hev.pushPullRatio != null && hev.pushPullRatio <= 0.55) {
      out.push({ level: 'warn', text: 'Çekme setlerin itmenin belirgin üstünde — dengeyi gözden geçir.' });
    }
    if (hev.legShare != null && hev.legShare < 20 && hev.sessions >= 8) {
      out.push({ level: 'warn', text: 'Setlerinin sadece %' + hev.legShare + "'i bacak — en büyük kas grubu boşta." });
    }
  }

  // C) Güç durgunluğu — en çok çalıştığın hareketlerde e1RM ilerlemiyor
  if (hev && hev.strength && hev.strength.length >= 2) {
    var flat = hev.strength.filter(function (s) { return s.pct != null && s.pct <= 1; });
    var down = hev.strength.filter(function (s) { return s.pct != null && s.pct <= -5; });
    if (down.length >= 2) {
      out.push({ level: 'warn', text: down.length + ' ana hareketinde güç geriliyor — uyku ve yeterli yemek ilk bakılacak yer.' });
    } else if (flat.length >= Math.ceil(hev.strength.length * 0.7)) {
      out.push({ level: 'warn', text: hev.strength.length + ' ana hareketin ' + flat.length + "'inde " + Math.round(hev.strength[0].spanDays / 7) + ' haftadır ilerleme yok.' });
    } else {
      var up = hev.strength.filter(function (s) { return s.pct != null && s.pct >= 5; });
      if (up.length) out.push({ level: 'good', text: up[0].name + ' ' + up[0].pct + '% arttı — program çalışıyor.' });
    }
  }

  // D) Kilo–kalori çelişkisi: kayıtlar gerçeği yansıtmıyor
  if (energy && energy.verdict === 'eksik-log') {
    out.push({ level: 'warn', text: 'Öğün kayıtların eksik görünüyor — kilo değişimin loglanan kaloriyle uyuşmuyor.' });
  }

  // E) Kısmi loglama oranı yüksekse ortalamalar zaten güvenilmez
  if (nut && (nut.partialDays + nut.missingDays) > (nut.fullDays + nut.partialDays + nut.missingDays) * 0.5) {
    out.push({ level: 'warn', text: 'Günlerin yarısından fazlasında beslenme kaydı eksik — analiz zayıf kalıyor.' });
  }

  // F) REKOMPOZİSYON — kilo sabit, yağ düşüyor, yağsız kütle korunuyor.
  // Tartıya bakan biri "hiçbir şey olmuyor" sanır; asıl ilerleme tam da budur.
  if (wt && wt.fat && wt.slopeKgPerWeek != null &&
      Math.abs(wt.slopeKgPerWeek) < 0.15 && wt.fat.perWeek <= -0.1 &&
      (!wt.lean || wt.lean.perWeek >= -0.05)) {
    out.push({ level: 'good', text: 'Kilon sabit ama yağ oranın düşüyor — tartının göstermediği ilerleme bu.' });
  }

  // G) Yağsız kütle kaybı — kalori/protein/uyku tarafında bir şey eksik demektir.
  // Kayıtlar eksikse (eksik-log) sayı zaten güvenilmez, uyarı verilmez.
  if (wt && wt.lean && wt.lean.perWeek <= -0.2 && wt.lean.spanDays >= 21 &&
      !(energy && energy.verdict === 'eksik-log')) {
    out.push({ level: 'warn', text: 'Yağsız kütlen haftada ' + Math.abs(wt.lean.perWeek) + ' kg düşüyor — yeterli yiyor ve uyuyor musun, ona bak.' });
  }

  // H) SESSİZ ARIZA TESPİTİ — tartı verisi akmayı bırakmış olabilir.
  // Kısayol/senkron durduğunda hiçbir hata görünmez; haftalarca fark edilmez.
  if (wt && toDate && wt.lastDate) {
    var wGap = hcDayDiff(wt.lastDate, toDate);
    if (wGap >= 10) out.push({ level: 'warn', text: wGap + ' gündür tartım kaydı gelmiyor — otomatik aktarım durmuş olabilir.' });
  }

  // I) KİLO DEĞİŞİMİNİN BİLEŞİMİ (v7-123) — "+0.40 kg" tek başına anlamsız:
  // aynı sayı kas kazanımı da olabilir yağlanma da. Ayrım yağ KÜTLESİ eğiminden
  // gelir. Eksik-log burada susturmaz: bileşim doğrudan tartıdan ölçülür,
  // loglanan kaloriden türetilmez — yani kayıt eksikken de geçerlidir.
  var cmp = wt && wt.comp;
  if (cmp && cmp.fatSharePct != null && wt.fatMass && wt.fatMass.spanDays >= 21) {
    // G kuralı yağsız kütle kaybını zaten mutlak eşikle uyardıysa tekrarlama.
    var lw = !!(wt.lean && wt.lean.perWeek <= -0.2 && wt.lean.spanDays >= 21);
    if (cmp.verdict === 'yag-agirlikli') {
      out.push({ level: 'warn', text: 'Aldığın kilonun %' + cmp.fatSharePct + "'i yağ — kalori fazlan gereğinden büyük görünüyor." });
    } else if (cmp.verdict === 'kas-agirlikli') {
      out.push({ level: 'good', text: 'Aldığın kilonun %' + (100 - cmp.fatSharePct) + "'i yağsız kütle — kas kazanıyorsun." });
    } else if (cmp.verdict === 'kas-kaybi' && !lw) {
      out.push({ level: 'warn', text: 'Verdiğin kilonun %' + (100 - cmp.fatSharePct) + "'i yağsız kütle — protein ve uyku ilk bakılacak yer." });
    } else if (cmp.verdict === 'yag-kaybi') {
      out.push({ level: 'good', text: 'Verdiğin kilonun %' + cmp.fatSharePct + "'i yağ — yağsız kütlen korunuyor." });
    }
  }

  return out;
}

/* ---------------- FAKT ÜRETİCİ (AI'a giden metin) ----------------
   Sayısal kısmın tamamı burada üretilir → PWA ve Worker BİREBİR aynı metni verir.
   Uyku satırları dışarıdan gelir (her taraf kendi sleepDebt ikizini kullanır).   */
function hcBuildFacts(ctx) {
  var L = [];
  var g = ctx.goals || {};
  L.push('HEDEFLER: uyku ' + (g.sleepH || 8) + ' saat/gece · ' + (g.kcal || '-') + ' kcal · protein ' + (g.protein || '-') + ' g · su ' + (g.waterL || '-') + ' L.');
  (ctx.sleepLines || []).forEach(function (x) { if (x) L.push(x); });

  // --- Antrenman ---
  var hev = ctx.hevy;
  if (hev) {
    L.push('ANTRENMAN (son ' + hev.spanDays + ' gün): ' + hev.sessions + ' seans, haftada ' + hev.perWeek +
      (hev.avgMin ? ', ortalama ' + hev.avgMin + ' dk' : '') + '. Son antrenman ' + hev.lastDate + '.');
    L.push('Haftalık hacim ' + hcRound(hev.volPerWeek / 1000, 1) + ' ton, haftada ' + hev.setsPerWeek + ' set' +
      (hev.volTrendPct != null ? '. Son 2 haftanın hacmi önceki 2 haftaya göre %' + hev.volTrendPct : '') + '.');
    var gp = hev.byGroup;
    L.push('Set dağılımı — itme ' + gp.itme + ', çekme ' + gp.cekme + ', bacak ' + gp.bacak + ', gövde ' + gp.govde + '.' +
      (hev.pushPullRatio != null ? ' İtme/çekme oranı ' + hev.pushPullRatio + ' (dengeli aralık 0.8-1.3).' : '') +
      (hev.legShare != null ? ' Bacak payı %' + hev.legShare + '.' : ''));
    if (hev.strength.length) {
      L.push('Güç eğilimi (tahmini 1RM, ilk yarı → son yarı): ' + hev.strength.map(function (s) {
        return s.name + ' ' + s.firstE1rm + ' → ' + s.lastE1rm + ' kg (%' + (s.pct > 0 ? '+' + s.pct : s.pct) + ', ' + s.sessions + ' seans/' + s.spanDays + ' gün)';
      }).join(' | '));
    } else {
      L.push('Güç eğilimi: henüz yeterli tekrar yok (aynı hareketin 3+ hafta boyunca 4+ seansı gerekir).');
    }
    L.push('En çok çalışılan: ' + hev.topExercises.map(function (e) { return e.name + ' (' + e.sets + ' set)'; }).join(', ') + '.');
    if (hev.guessedPct >= 20) L.push('NOT: kas grubu bilgisinin %' + hev.guessedPct + "'i egzersiz adından tahmin edildi, dağılım yaklaşıktır.");
  } else {
    L.push('ANTRENMAN: son ' + HC_WIN.train + ' günde kayıt yok.');
  }

  // --- Beslenme ---
  var n = ctx.nutrition;
  if (n) {
    L.push('BESLENME (son ' + HC_WIN.diet + ' gün): ' + n.fullDays + ' tam gün, ' + n.partialDays +
      ' kısmi gün (2 öğünden az ya da çok düşük kalori — ORTALAMAYA KATILMADI), ' + n.missingDays + ' gün kayıtsız.');
    L.push((n.usingPartial ? 'Kısmi günlerin' : 'Tam günlerin') + ' ortalaması: ' + n.kcal + ' kcal, protein ' + n.protein +
      ' g, karbonhidrat ' + n.carb + ' g, yağ ' + n.fat + ' g, su ' + n.waterL + ' L, günde ' + n.mealsPerDay + ' öğün.');
    if (n.proteinCoverPct < 85) {
      L.push('DİKKAT: öğünlerin sadece %' + n.proteinCoverPct + "'inde protein değeri girilmiş — gerçek protein alımı yukarıdaki sayıdan YÜKSEK. 'Protein yetersiz' yorumu yapma.");
    }
    if (n.split) {
      L.push('Antrenman günü ortalama ' + n.split.gymKcal + ' kcal / ' + n.split.gymProtein + ' g protein (' + n.split.gymDays + ' gün); dinlenme günü ' +
        n.split.restKcal + ' kcal / ' + n.split.restProtein + ' g protein (' + n.split.restDays + ' gün).');
    }
    if (n.lateEatDays != null) {
      L.push('Saat kaydı olan ' + n.timedDays + ' günün ' + n.lateEatDays + "'inde 22:00'den sonra öğün var.");
    }
  } else {
    L.push('BESLENME: kayıt yok.');
  }

  // --- Kilo + enerji tutarlılığı ---
  var wt = ctx.weight;
  if (wt && wt.slopeKgPerWeek != null) {
    L.push('KİLO (son ' + wt.spanDays + ' gün, ' + wt.n + ' tartım): ' + wt.first + ' → ' + wt.last + ' kg, toplam ' +
      (wt.totalChange > 0 ? '+' : '') + wt.totalChange + ' kg. Regresyon eğimi haftada ' +
      (wt.slopeKgPerWeek > 0 ? '+' : '') + wt.slopeKgPerWeek + ' kg.');
  } else {
    L.push('KİLO: eğim hesaplanamadı (en az 4 tartım ve 2 hafta aralık gerekir).');
  }
  if (wt && wt.fat) {
    L.push('YAĞ ORANI (' + wt.fat.n + ' ölçüm, ' + wt.fat.spanDays + ' gün): %' + wt.fat.first + ' → %' + wt.fat.last +
      ', regresyon eğimi haftada ' + (wt.fat.perWeek > 0 ? '+' : '') + wt.fat.perWeek + ' puan.' +
      (wt.lean ? ' Yağsız kütle ' + wt.lean.first + ' → ' + wt.lean.last + ' kg (haftada ' +
        (wt.lean.perWeek > 0 ? '+' : '') + wt.lean.perWeek + ' kg).' : ''));
    L.push('NOT: yağ oranı biyoimpedans tartıdan geliyor — tek ölçüm ±%3-5 sapabilir, su tutumu ve öğün saatinden etkilenir. TEK ölçümü yorumlama, sadece EĞİLİMİ yorumla.');
    L.push('Kilo ile yağ oranını BİRLİKTE oku: kilo sabit + yağ düşüyor = kas kazanımı (olumlu). Kilo düşüyor + yağ oranı sabit/artıyor = kaybın bir kısmı kastan.');
  }
  if (wt && wt.comp && wt.comp.fatSharePct != null) {
    var cp = wt.comp;
    L.push('KİLO BİLEŞİMİ (regresyonla HESAPLANDI, tahmin değil): haftalık ' + (cp.kgPerWeek > 0 ? '+' : '') + cp.kgPerWeek +
      ' kg değişimin ' + (cp.fatMassPerWeek > 0 ? '+' : '') + cp.fatMassPerWeek + ' kg yağ kütlesi, ' +
      (cp.leanPerWeek > 0 ? '+' : '') + cp.leanPerWeek + ' kg yağsız kütle. Yağ payı %' + cp.fatSharePct + '.');
    L.push('NOT: bu paylaştırma sana hazır verildi — YENİDEN HESAPLAMA, olduğu gibi kullan. Okuma kılavuzu: kilo ALIRKEN yağ payı %70 üstü ise kalori fazlası büyük, %40 altı ise kazanım ağırlıklı kas. Kilo VERİRKEN yağ payı düşükse kayıp yağsız kütleden geliyor demektir.');
  }
  var en = ctx.energy;
  if (en) {
    L.push('ENERJİ TUTARLILIĞI: hesaplanan BMR ' + en.bmr + ', TDEE ' + en.tdee + ' kcal. Loglanan alım + kilo eğimine göre gerçek harcama ≈ ' +
      en.impliedBurn + ' kcal (%' + (en.devPct > 0 ? '+' + en.devPct : en.devPct) + ' sapma). ' + en.note);
  }

  if (ctx.contextLine) L.push(ctx.contextLine);
  if (ctx.patterns && ctx.patterns.length) L.push('OTOMATİK TESPİTLER: ' + ctx.patterns.join(' | '));
  return L.join('\n');
}

/* ---------------- UYKU SATIRLARI (paylaşılan) ----------------
   Uyku BORCU her tarafta kendi ikiziyle hesaplanır (sleepDebt / sleepDebtSrv),
   ama metne dökme işi burada — böylece iki taraf birebir aynı cümleyi üretir. */
function hcSleepLines(sleepArr, goalH, debt, bandLabel) {
  var to = null, from = null;
  var all = (sleepArr || []).filter(function (s) { return s && s.date; });
  if (!all.length) return ['UYKU: kayıt yok.'];
  var dates = all.map(function (s) { return s.date; }).sort();
  to = dates[dates.length - 1];
  from = hcShift(to, -(HC_WIN.sleep - 1));
  var sl = all.filter(function (s) { return s.date >= from && s.hours != null; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (!sl.length) return ['UYKU: son ' + HC_WIN.sleep + ' günde saat kaydı yok.'];

  var L = [];
  var avg = hcAvg(sl.map(function (s) { return s.hours; }));
  var short = sl.filter(function (s) { return s.hours < goalH; }).length;
  L.push('UYKU (son ' + HC_WIN.sleep + ' gün, ' + sl.length + ' gece kayıtlı): ortalama ' + hcRound(avg, 1) + ' saat, ' + short + ' gece hedefin altında.');
  if (debt) {
    L.push('Birikmiş uyku borcu ' + debt.debt + ' saat (' + (bandLabel || '-') + '), ' + debt.nights + ' geceden hesaplandı' +
      (debt.est ? ', bunun ' + debt.est + ' gecesi kalite notundan tahmin' : '') +
      '. Bu sayı üstel ağırlıklı: eski borç günde %15 erir, fazla uyku açığı ancak yarı verimle kapatır — düz toplam değildir, yeniden hesaplama.');
  }
  // Hafta içi / hafta sonu (30 gün) — sosyal jetlag sinyali
  var wFrom = hcShift(to, -29);
  var wd = [], we = [];
  all.filter(function (s) { return s.date >= wFrom && s.hours != null; }).forEach(function (s) {
    var dow = new Date(s.date + 'T12:00:00').getDay();
    (dow === 0 || dow === 6 ? we : wd).push(s.hours);
  });
  if (wd.length >= 3 && we.length >= 2) {
    L.push('Son 30 gün — hafta içi ortalama ' + hcRound(hcAvg(wd), 1) + ' saat, hafta sonu ' + hcRound(hcAvg(we), 1) + ' saat.');
  }
  L.push('Son geceler: ' + sl.slice(-8).map(function (s) {
    return s.date + ' ' + s.hours + 'sa' + (s.bedtime ? ' (' + s.bedtime + '-' + s.wake + ')' : '') + (s.quality ? ' [' + s.quality + ']' : '');
  }).join(' | '));
  return L;
}

/* ---------------- UYKU DESENLERİ (paylaşılan) ----------------
   v7-121 öncesi bu kurallar sadece PWA'daydı; worker'ın ürettiği fakta girmiyordu
   → aynı veriden iki farklı "OTOMATİK TESPİTLER" satırı çıkıyordu. Artık tek kaynak.
   badStreak/recoveryNights dışarıdan gelir (her taraf kendi ikizini kullanır). */
function hcSleepPatterns(sleepArr, goalH, debt, bandLabel, debtLabel, recoveryNights, badStreak, isTrainDay, toDate) {
  var out = [];
  var all = (sleepArr || []).filter(function (s) { return s && s.date; });

  // 1) Ardışık kötü/az uyku
  if (badStreak >= 3) out.push({ level: 'danger', text: badStreak + ' gecedir kötü/az uyuyorsun — bugünü hafif tut.' });

  // 2) Birikmiş uyku borcu (bandına göre ciddiyet)
  if (debt && debt.nights >= 3 && debt.band !== 'clear' && badStreak < 3) {
    var lvl = (debt.band === 'severe' || debt.band === 'high') ? 'danger' : 'warn';
    var rec = recoveryNights ? ' ' + recoveryNights + ' gece erken yatmak kapatır.' : '';
    out.push({ level: lvl, text: 'Birikmiş uyku borcun ' + (debtLabel || debt.debt + ' saat') + ' (' + (bandLabel || '-') + ').' + rec });
  }

  // 3) Yatış saati savrulması — düzensizlik uykuyu süreden çok bozar
  var from7 = hcShift(toDate, -6);
  var beds = all.filter(function (s) { return s.date >= from7 && s.bedtime; }).map(function (s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(s.bedtime);
    if (!m) return null;
    var mins = +m[1] * 60 + +m[2];
    if (mins < 720) mins += 1440;         // 00:30 → gece tarafına al
    return mins;
  }).filter(function (x) { return x != null; });
  if (beds.length >= 4) {
    var spread = Math.max.apply(null, beds) - Math.min.apply(null, beds);
    if (spread >= 120) out.push({ level: 'warn', text: 'Yatış saatin ' + Math.round(spread / 60) + ' saat savruluyor — sabit saat en çok işe yarayan şey.' });
  }

  // 4) ÇAPRAZ SİNYAL: az uyuduğun günlerde antrenman düşüyor mu?
  var from14 = hcShift(toDate, -13);
  var l14 = all.filter(function (s) { return s.date >= from14 && s.hours != null; });
  if (l14.length >= 7) {
    var lo = l14.filter(function (s) { return s.hours < 7; }), hi = l14.filter(function (s) { return s.hours >= 7; });
    if (lo.length >= 3 && hi.length >= 3) {
      var loR = lo.filter(function (s) { return isTrainDay(s.date); }).length / lo.length;
      var hiR = hi.filter(function (s) { return isTrainDay(s.date); }).length / hi.length;
      if (hiR - loR >= 0.4) out.push({ level: 'warn', text: 'İyi uyuduğun günlerde antrenmana çok daha sık gidiyorsun — uyku, spor planının görünmeyen yarısı.' });
    }
  }
  return out;
}

// Antrenman boşluğu / düzeni + antrenman günü protein — eskiden sadece PWA'daydı
function hcHabitPatterns(workouts, dietDays, isTrainDay, proteinGoal, toDate) {
  var out = [];
  var ds = (workouts || []).map(function (w) { return w && w.date; }).filter(Boolean).sort();
  if (ds.length) {
    var gap = hcDayDiff(ds[ds.length - 1], toDate);
    if (gap >= 7) out.push({ level: 'warn', text: gap + ' gündür antrenman kaydı yok.' });
    else if (gap <= 1) {
      var from7 = hcShift(toDate, -6);
      var n7 = ds.filter(function (d) { return d >= from7; }).length;
      if (n7 >= 3) out.push({ level: 'good', text: 'Bu hafta ' + n7 + ' antrenman — düzen oturmuş.' });
    }
  }
  if (proteinGoal) {
    var low = 0, checked = 0;
    for (var i = 1; i <= 7 && checked < 4; i++) {
      var d = hcShift(toDate, -i);
      if (!isTrainDay(d)) continue;
      var day = (dietDays || {})[d];
      var meals = (day && day.meals) || [];
      if (!meals.length) continue;
      checked++;
      var p = 0;
      for (var k = 0; k < meals.length; k++) p += meals[k].protein || 0;
      if (p < proteinGoal * 0.7) low++;
    }
    if (checked >= 2 && low >= 2) out.push({ level: 'warn', text: 'Antrenman günlerinin ' + low + "'inde protein hedefinin altında kaldın." });
  }
  return out;
}

// Tüm desenleri tek yerde topla + ciddiyete göre sırala (danger > warn > good)
function hcAllPatterns(inp) {
  var out = []
    .concat(hcSleepPatterns(inp.sleep, inp.goalH, inp.debt, inp.bandLabel, inp.debtLabel, inp.recoveryNights, inp.badStreak, inp.isTrainDay, inp.today))
    .concat(hcHabitPatterns(inp.workouts, inp.dietDays, inp.isTrainDay, inp.proteinGoal, inp.today))
    .concat(hcTrainingPatterns(inp.hev, inp.nut, inp.wt, inp.energy, inp.today));
  var rank = { danger: 0, warn: 1, good: 2 };
  return out.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
}

// core.js badSleepStreak / sleepRecoveryNights / fmtSleepHours ikizleri.
// Desen kuralları artık paylaşılan çekirdekte; bu üçü tarafa özgü girdileri üretir.
function badSleepStreakSrv(data) {
  const t = trToday();
  const byDate = {};
  for (const s of (data.sleep || [])) { if (s && s.date) byDate[s.date] = s; }
  let n = 0, gap = 0;
  for (let i = 0; i < 14; i++) {
    const s = byDate[hcShift(t, -i)];
    if (!s || (s.quality == null && s.hours == null)) { gap++; if (gap >= 2) break; continue; }
    gap = 0;
    const bad = s.quality === 'bad' || (s.hours != null && s.hours < 6);
    if (bad) n++; else break;
  }
  return n;
}
function sleepRecoveryNightsSrv(debt) {
  if (debt < 2) return 0;
  let D = debt, n = 0;
  const contrib = -1 * 0.5;
  while (D >= 2 && n < 21) { D = Math.max(0, D * 0.85 + contrib); n++; }
  return D < 2 ? n : null;
}
function fmtSleepHoursSrv(h) {
  if (h == null) return '';
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return mm ? `${hh}s ${mm}dk` : `${hh}s`;
}

// Worker tarafı sağlık özeti — PWA'daki buildHealthFacts'in ikizi (cron için)
function buildHealthFactsSrv(data, days) {
  var sg = (data.settings && data.settings.sleepGoal) || {};
  var goalH = sg.targetH || 8;
  var d = data.diet || {};
  var t = trToday();

  // Uyku: borç worker ikiziyle hesaplanır, metne dökme paylaşılan fonksiyonda
  var sd = sleepDebtSrv(data, goalH);
  var sleepLines = hcSleepLines(data.sleep || [], goalH, sd, SLEEP_BAND_LABEL_SRV[sd.band]);

  // Antrenman: artık sadece tarih+başlık değil — hacim, set dağılımı, e1RM eğilimi
  var hevyAll = ((data.hevy && data.hevy.workouts) || []);
  var muscleMap = (data.hevy && data.hevy.muscles) || null;
  var hev = hcHevyStats(hevyAll, hcShift(t, -(HC_WIN.train - 1)), t, muscleMap);
  var trainSet = {};
  for (var i = 0; i < hevyAll.length; i++) { if (hevyAll[i] && hevyAll[i].date) trainSet[hevyAll[i].date] = 1; }
  var isTrainDay = function (dt) { return !!trainSet[dt]; };

  // Beslenme: kısmi günler ortalamadan ayrılır (sistematik düşük sapma düzeltmesi)
  var nut = hcNutritionStats(d.days || {}, hcShift(t, -(HC_WIN.diet - 1)), t, isTrainDay, d.kcalGoal);
  var wt = hcWeightTrend(d.weights || [], hcShift(t, -(HC_WIN.weight - 1)), t);
  // Enerji kontrolü sadece güvenilir (tam günlerden gelen) ortalamayla yapılır
  var en = hcEnergyCheck(nut && !nut.usingPartial ? nut.kcal : null, wt ? wt.slopeKgPerWeek : null, d.calc);

  var doneWeek = (data.tasks || []).filter(function (x) { return x.done && x.doneDate && x.doneDate >= trDate(-6); }).length;

  return hcBuildFacts({
    goals: { sleepH: goalH, kcal: d.kcalGoal, protein: d.proteinGoal, waterL: d.waterGoalL },
    sleepLines: sleepLines,
    hevy: hev, nutrition: nut, weight: wt, energy: en,
    contextLine: 'BAĞLAM: son 7 günde ' + doneWeek + ' görev tamamlandı. Kullanıcı 16 yaşında, ADHD, lise öğrencisi.',
    patterns: hcAllPatterns({
      today: t, goalH: goalH, sleep: data.sleep || [], debt: sd,
      bandLabel: SLEEP_BAND_LABEL_SRV[sd.band], debtLabel: fmtSleepHoursSrv(sd.debt),
      recoveryNights: sleepRecoveryNightsSrv(sd.debt), badStreak: badSleepStreakSrv(data),
      isTrainDay: isTrainDay, workouts: hevyAll, dietDays: d.days || {}, proteinGoal: d.proteinGoal || 0,
      hev: hev, nut: nut, wt: wt, energy: en,
    }).slice(0, 5).map(function (p) { return p.text; }),
  });
}

// Analiz için yeterli veri var mı? (yoksa AI çağırma, boş push atma)
function hasHealthDataSrv(data, days = 14) {
  const from = trDate(-(days - 1));
  const s = (data.sleep || []).filter(x => x && x.date >= from && x.hours != null).length;
  const w = ((data.hevy && data.hevy.workouts) || []).filter(x => x && x.date >= from).length;
  const dd = (data.diet && data.diet.days) || {};
  let n = 0;
  for (let i = 0; i < days; i++) { const day = dd[trDate(-i)]; if (day && (day.meals || []).length) n++; }
  return (s + w + n) >= 3;
}

async function generateHealthCoach(env, data, name) {
  const facts = buildHealthFactsSrv(data, 14);
  const r = await aiRun(env, {
    tier: 'heavy',
    messages: [
      { role: 'system', content: HEALTH_COACH_PROMPT(name) },
      { role: 'user', content: `Sağlık verileri (doğrulanmış):\n${facts}\n\nAnalizi yaz. TÜRKÇE, kısa, en fazla 2 öneri.` },
    ],
    max_tokens: 600,
    temperature: 0.5,
  });
  let text = String((r && r.response) || '').trim();
  if (!text || /^i'?m sorry|^as an ai|your input/i.test(text)) return null;
  return text;
}

// ---------- POST /health-coach (PWA "Analiz et") ----------
async function handleHealthCoachApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const facts = (body.facts || '').trim();
  if (!facts) return jsonCors({ error: 'empty' }, 400, cors);
  if (facts.length > 8000) return jsonCors({ error: 'too long' }, 400, cors);

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  try {
    const session = await fetchUserDataForApi(env, user);
    const name = getUserDisplayName(session.data, user.email);
    const r = await aiRun(env, {
      tier: aiTierForUser(env, user, 'heavy'),
      messages: [
        { role: 'system', content: HEALTH_COACH_PROMPT(name) },
        { role: 'user', content: `Sağlık verileri (doğrulanmış):\n${facts}\n\nAnalizi yaz. TÜRKÇE, kısa, en fazla 2 öneri.` },
      ],
      max_tokens: 600,
      temperature: 0.5,
    });
    let comment = String((r && r.response) || '').trim();
    if (!comment || /^i'?m sorry|^as an ai|your input/i.test(comment)) {
      comment = `${name}, şu an analiz üretemedim — birazdan tekrar dene.`;
    }
    return jsonCors({ comment }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// ---------- Pazar akşamı otomatik haftalık sağlık raporu ----------
// Tam metni data.coach'a yazar (PWA "Son rapor" ile açar), push'a kısa özet gider.
async function buildHealthWeekly(env, data) {
  if (!hasHealthDataSrv(data, 14)) return null;
  const name = getUserDisplayName(data, null);
  let text = null;
  try { text = await generateHealthCoach(env, data, name); }
  catch (e) { console.error('health coach', e.message); }
  if (!text) return null;

  data.coach = data.coach || { reports: [] };
  data.coach.reports = data.coach.reports || [];
  data.coach.lastText = text;
  data.coach.lastRunAt = Date.now();
  data.coach.reports = data.coach.reports.concat([{ at: Date.now(), text, auto: true }]).slice(-12);

  let body = text.replace(/\s+/g, ' ').trim();
  if (body.length > 380) body = body.slice(0, 380) + '… (devamı uygulamada)';
  return { title: '🫀 Haftalık sağlık analizi', message: body };
}

async function handleJournalApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const text = (body.text || '').trim();
  if (!text) return jsonCors({ error: 'empty' }, 400, cors);
  if (text.length > 2000) return jsonCors({ error: 'too long' }, 400, cors);

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) {
    return jsonCors({ error: 'forbidden' }, 403, cors);
  }

  try {
    // User'ın KENDİ datasından bugün biten + pomodoro + MIT context'i
    const session = await fetchUserDataForApi(env, user);
    const todayStr = trToday();
    const doneToday = (session.data.tasks || []).filter(t => t.doneDate === todayStr).length;
    const pomoToday = (session.data.pomoToday && session.data.pomoToday.date === todayStr) ? (session.data.pomoToday.count || 0) : 0;
    const mit = (session.data.tasks || []).filter(t => t.mitDate === todayStr);
    const mitDone = mit.filter(t => t.done).length;
    const name = getUserDisplayName(session.data, user.email);

    const sysPrompt = `Sen Aidan'sın — ${name}'in ADHD asistanı. ${name} gününü senle paylaşıyor (akşam günlüğü).

GÖREVİN: 3-4 cümlelik sıcak, TÜRKÇE yansıma.

YAPI:
1. Duyguyu duyduğunu göster (validate). "Anladım", "Duydum seni", "Bu çok güçlü bir his" gibi.
2. Günün SOMUT bir parçasını vurgula (söylediği şeyden veya sayıdan). "${doneToday} görev kapatmışsın" gibi sayı varsa kullan ama sadece olumlu çerçevele.
3. (Opsiyonel) 1 NAZİK öneri — emir değil, davet. "Belki bir nefes" / "Belki yarın küçük başla". Yorgunsa öneri ATLA.

🚫 KESİNLİKLE YASAK:
- "ama şunu da yapmalıydın" / "keşke" / "neden yapmadın"
- Ders verme, üstten konuşma
- Liste/madde işareti (akıcı paragraf)
- İngilizce tek kelime
- Şablon cümle ("As an AI", "I'm sorry"...)
- Sayı uydurma (verilenden başka sayı yok)
- Yarın için plan dayatma

✅ TON: bir terapist arkadaş gibi. Yargısız, somut, küçük şefkat.

ADHD beyni gün sonunda "yine yapamadım" döngüsüne girer. Senin tek işin bu döngüyü kırmak — ona bugünü gördüğünü hissettir.`;

    const userMsg = `📊 Bugün bittiği bilinen: ${doneToday} görev${pomoToday ? `, ${pomoToday} pomodoro` : ''}${mit.length ? `, ⭐ MIT ${mitDone}/${mit.length}` : ''}.

💬 ${name}'in günü:
${text}

3-4 cümle sıcak akşam yansıması yaz. TÜRKÇE, samimi, yargısız.`;

    const r = await aiRun(env, {
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 320,
      temperature: 0.6, // biraz daha sıcak/insancıl
    });
    let reflection = (r.response || '').trim();
    if (!reflection || /^i'?m sorry|^as an ai|your input/i.test(reflection)) {
      reflection = `Bugünü buraya bıraktın ${name}, bu bile yeterli. Yarın yeni bir gün 💜`;
    }
    return jsonCors({ reflection, doneToday, pomoToday }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// Aidan'a sor — sohbet endpoint'i (POST {messages:[...]} → AI sohbet cevabı, tool YOK).
// Düşünme/planlama ortağı: görev EKLEMEZ, sadece konuşur. Gemini.
// ============================================================
// META-ÖĞRENME MODLARI — kanıta dayalı öğrenme yöntemleri
// ============================================================
// Chat'te "/anlat konu" gibi bir komut yazılınca sistem prompt'una
// o yöntemin kuralları eklenir. Mod, yeni bir komut gelene kadar sürer
// (kullanıcı cevap yazarken mod kaybolmasın diye geriye doğru taranır).
// PWA ayrıca `mode` alanı gönderebilir; komut yoksa o kullanılır.
// NOT: "/tekrar" burada YOK — o PWA'da lokal çalışır (AI'sız, görev ekler).
const META_MODES = {
  anlat: {
    label: 'Feynman — sen anlat, boşlukları ben bulayım',
    prompt: `AKTIF MOD: FEYNMAN. Kullanıcı konuyu KENDİ cümleleriyle anlatır, sen öğretmezsin.
- Kullanıcı henüz anlatmadıysa (sadece konu adı verdiyse): tek cümleyle "anlat bakalım, boşlukları ben işaretlerim" de ve DUR. Konuyu sen anlatma.
- Anlatım geldiğinde sırasıyla: (1) doğru kurduğu 1 noktayı söyle, (2) en fazla 2 eksik/bulanık noktayı işaretle, (3) tam o boşluğu delen TEK soru sor.
- Eksiğin cevabını SEN VERME — kullanıcı bulsun. Israr ederse önce ipucu, sonra cevap.
- Toplam 150 kelimeyi geçme.`,
  },
  sor: {
    label: 'Aktif hatırlama — tek tek soru',
    prompt: `AKTIF MOD: AKTİF HATIRLAMA (retrieval practice). Toplam 5 soru soracaksın.
- Her mesajda SADECE 1 soru sor, sonra dur. Cevabı bekle.
- Cevap gelince: doğru mu eksik mi (en fazla 2 cümle) → sonraki soruyu sor. Kaçıncı soruda olduğunu başa yaz: "2/5".
- Sorular kolaydan zora gitsin. Cevabı soruyla birlikte ASLA verme.
- "Bilmiyorum" derse: önce ipucu ver, tekrar sor. İki denemede olmazsa kısa cevabı ver ve devam et.
- 5. sorudan sonra: hangi 1 nokta zayıf, onu tek cümlede söyle.`,
  },
  basit: {
    label: 'Basit anlat — öz + benzetme + tuzak',
    prompt: `AKTIF MOD: BASİTLEŞTİRME. Konuyu 3 katmanda anlat, sırayla ve başlıksız:
1) Tek cümlelik öz.
2) Günlük hayattan somut bir benzetme (soyut benzetme yok).
3) Bu konuda en sık yapılan hata.
Sonunda kullanıcıya 1 kontrol sorusu sor. Toplam 180 kelimeyi geçme. Jargon kullanma, kullanırsan hemen parantezle açıkla.`,
  },
  karistir: {
    label: 'Karışık tekrar (interleaving)',
    prompt: `AKTIF MOD: INTERLEAVING (karışık pratik). Kullanıcının verdiği 2-4 konudan 6 soru üret.
- Soruları KARIŞIK sırala; aynı konudan iki soru arka arkaya GELMESİN.
- Hepsini tek mesajda, numaralı ver. Konu adını soru başında yazma (hangi konu olduğunu kullanıcı kendi seçmeli — zorluk kasıtlı).
- Cevap anahtarını VERME. Kullanıcı cevaplarını yazınca tek tek değerlendir.
- Kullanıcı tek konu verdiyse: o konunun farklı alt başlıklarından karıştır.`,
  },
  zorla: {
    label: 'Zor sorular — tanıma değil üretim',
    prompt: `AKTIF MOD: İSTENEN ZORLUK (desirable difficulty). Tanıma sorusu YASAK.
- "X nedir", "X'in tanımı" gibi ezber sorusu SORMA.
- Bunun yerine: karşılaştırma ("X ile Y farkını bir örnekle göster"), tahmin ("şu durumda ne olur, neden"), transfer ("bunu farklı bir örnekte uygula"), hata avı ("şu akıl yürütmede ne yanlış").
- 3 soru, tek mesajda, numaralı. Cevapları verme.
- Kullanıcı zorlanırsa bu normaldir — "zorlanman iyi işaret" gibi tek cümle destek, sonra ipucu.`,
  },
  nasil: {
    label: 'Bu konuya nasıl çalışılır',
    prompt: `AKTIF MOD: YÖNTEM SEÇİMİ (metabiliş). Önce konunun tipini belirle: ezber / kavrama / işlem-becerisi / uygulama.
- Tipi tek cümlede söyle.
- O tipe EN uygun tek yöntemi ver ve NEDEN onu seçtiğini 1 cümleyle açıkla (örnek: ezber→aralıklı tekrar+aktif hatırlama; işlem→bol soru+konuların karıştırılması; kavrama→Feynman; uygulama→değişken örnekler).
- Sonra somut bir 20 dakikalık İLK OTURUM planı ver (3 adım, dakikalı).
- En fazla 2 öneri. Fazla seçenek ADHD'de felç eder.`,
  },
  kontrol: {
    label: 'Kalibrasyon — ne kadar biliyorsun',
    prompt: `AKTIF MOD: KALİBRASYON. Amaç: kullanıcının "biliyorum" sanısı ile gerçek arasındaki farkı göstermek.
- İlk mesajında SADECE şunu sor: "Bu konuyu 1-10 arası kaç biliyorsun?" ve dur.
- Puan gelince 3 soru sor (tek mesajda, numaralı). Zorluk verdiği puana göre ayarlansın.
- Cevaplar gelince değerlendir ve tahmini ile gerçeği karşılaştır: "10'da 8 dedin, 3 sorunun 1'i tam — bu konu göründüğünden taze değil" gibi.
- Yargılamadan, veri gibi söyle. Puan düşükse güven ver, yüksek çıkarsa doğrula.`,
  },
};

// Chat geçmişinde geriye doğru tarayarak aktif modu bulur (yeni komut eskiyi ezer).
function detectMetaMode(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || m.role !== 'user') continue;
    const mt = /^\s*\/([a-zA-Z]+)/.exec(m.content || '');
    if (!mt) continue;
    const cmd = mt[1].toLowerCase();
    if (META_MODES[cmd]) return cmd;
    // Tanınmayan komut modu bitirir (kullanıcı başka bir şeye geçti)
    return null;
  }
  return null;
}

async function handleChatApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  let msgs = Array.isArray(body.messages) ? body.messages : [];
  // Sadece user/assistant rolleri, kısa tut (son 12 mesaj), her biri 2000 char sınırı
  msgs = msgs
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-12);
  // Fotograf: yalniz SON kullanici mesajina ilistirilir. Gecmise EKLENMEZ --
  // her turda tum gorselleri yeniden yollamak token/maliyeti katlar.
  const chatImgs = (Array.isArray(body.images) ? body.images : [])
    .filter(u => typeof u === 'string' && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/i.test(u) && u.length < 4000000)
    .slice(0, 3);
  if ((!msgs.length && !chatImgs.length) || !msgs.length || msgs[msgs.length - 1].role !== 'user') {
    return jsonCors({ error: 'empty' }, 400, cors);
  }
  if (!msgs[msgs.length - 1].content.trim() && !chatImgs.length) {
    return jsonCors({ error: 'empty' }, 400, cors);
  }

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  try {
    // Hafif görev context'i — Aidan kullanıcının gününü bilsin
    const session = await fetchUserDataForApi(env, user);
    const d = session.data || {};
    const todayStr = trToday();
    const tasks = d.tasks || [];
    const openCount = tasks.filter(t => !t.done).length;
    const doneToday = tasks.filter(t => t.doneDate === todayStr).length;
    const mit = tasks.filter(t => t.mitDate === todayStr && !t.done).map(t => t.text).slice(0, 3);
    const overdue = tasks.filter(t => !t.done && t.due && t.due < todayStr).length;
    const name = getUserDisplayName(d, user.email);

    const mitStr = mit.length ? ` Bugünün 3'ü (MIT): ${mit.join(', ')}.` : ` Bugünün 3'ü (MIT) henüz seçilmemiş.`;

    // Portföy özeti — para birimine göre gruplu, cache'li fiyatlarla (yaklaşık)
    let pfStr = '';
    const wl = (d.watchlist || []).filter(w => w && w.qty > 0 && w.price);
    if (wl.length) {
      const byCur = {};
      wl.forEach(w => {
        const cur = w.currency || 'TRY';
        (byCur[cur] = byCur[cur] || { val: 0, cost: 0, n: 0 });
        byCur[cur].val += w.qty * w.price;
        byCur[cur].cost += w.qty * (w.cost || 0);
        byCur[cur].n++;
      });
      const parts = Object.entries(byCur).map(([cur, o]) => {
        const pl = o.val - o.cost;
        const plPct = o.cost ? (pl / o.cost * 100) : 0;
        return `${o.n} pozisyon ${cur} — değer ~${Math.round(o.val)} ${cur}, toplam K/Z ${pl >= 0 ? '+' : ''}${Math.round(pl)} ${cur} (${plPct >= 0 ? '+' : ''}${plPct.toFixed(1)}%)`;
      });
      pfStr = ` Portföy (yaklaşık, son fiyatlarla): ${parts.join('; ')}.`;
    }

    // Meta-öğrenme modu — komut varsa yöntemin kuralları sistem prompt'una eklenir
    // "/pro <istek>" = kullanıcının BİLİNÇLİ tek seferlik yükseltmesi (düğmeye basmak gibi).
    // Sadece SON mesaja bakılır — geriye taranmaz, yani mod gibi yapışıp kalmaz.
    // Kalıcı kurala uygun: serbest akış varsayılanı hâlâ ücretsiz; PRO ancak açık talep + hesap sahibi.
    const proOnce = /^\s*\/pro\b/i.test(msgs[msgs.length - 1].content || '');
    // Antrenman programı isteği tespiti — /pro ile birlikte yapılandırılmış çıktı kuralı eklenir (formatsız düz metin program okunmuyor).
    const workoutReq = /antrenman|egzersiz program|spor program|workout|ev sporu|split program|fitness program/i.test(msgs[msgs.length - 1].content || '');
    const metaMode = (typeof body.mode === 'string' && META_MODES[body.mode]) ? body.mode : detectMetaMode(msgs);
    const modeBlock = metaMode ? `\n\n${META_MODES[metaMode].prompt}\n\nBu modda ${name} 16 yaşında lise öğrencisi — Türkiye müfredatı seviyesinde konuş. Cevabı hazır verme; hatırlama çabası öğrenmeyi kalıcı kılar. Mesaj başındaki "/komut" kısmını yok say, konu olarak kalanını al.` : '';

    const ctx = `[BAĞLAM — ${name} durumu] Açık görev: ${openCount}. Bugün biten: ${doneToday}.${overdue ? ` Gecikmiş: ${overdue}.` : ''}${mitStr}${pfStr}`;

    const sysPrompt = `Sen Aidan'sın — ${name}'in ADHD asistanı ve düşünme ortağı. ${name} 16 yaşında, lise öğrencisi, satranç/strateji seviyor, borsada işlem yapıyor.

ROLÜN: Sohbet et, düşündür, planlamaya yardım et. Bir akıl hocası gibi — net, somut, yargısız.

KURALLAR:
- TÜRKÇE konuş. Kısa ve net ol (ADHD beyni uzun duvarı okumaz). Gerekirse madde işareti kullan.
- Görev EKLEYEMEZSİN/SİLEMEZSİN — sadece konuşursun. "Şunu ekledim" deme. İstese bile "bunu üst bardaki AI butonuyla ekleyebilirsin" de.
- Boş klişe YOK ("harika soru", "yardımcı olmaktan mutluluk"). Direkt cevaba gir.
- Borsa: betimleyici konuş, AMA "al/sat/tut" yatırım tavsiyesi VERME, fiyat tahmini yapma.
- Emin değilsen "emin değilim" de, uydurma.
- Gerektiğinde sor, ama tek soruyla; cevabı boğma.
${ctx}${modeBlock}${proOnce ? '\n\n[/pro] Kullanıcı bu mesaj için DETAYLI cevap istedi. Mesaj başındaki "/pro" kısmını yok say. Kısalık kuralını gevşet: gerekirse tablo, adım adım plan ya da haftalık program gibi yapılandırılmış ve kapsamlı bir cevap ver. Yine de dolgu cümle yazma.' : ''}${(proOnce && workoutReq) ? '\n\n[ANTRENMAN PROGRAMI FORMATI] Program iste ise şu yapıyla ver: her gün için başlık (Gün 1: Göğüs+Triceps gibi), altında egzersiz listesi "Egzersiz — set x tekrar — dinlenme" biçiminde, başına 2-3 cümlelik ısınma notu, sonuna "ağrı hissedersen dur, form öncelik" uyarısı. Ekipmansız/ev antrenmanıysa vücut ağırlığı hareketleri seç. Haftalık frekans ve ilerleme (progressive overload — her hafta 1-2 tekrar/set artır) tek cümleyle belirt. Teşhis/sakatlık tedavisi YASAK — ağrı varsa doktora yönlendir.' : ''}${chatImgs.length ? '\n\n[FOTOĞRAF] Kullanıcı bu mesaja görsel ekledi. Görseldeki metni/veriyi oku ve SORUYA GÖRE yorumla. Okunmayan yer varsa "şurası net değil" de, uydurma. Ders sorusuysa doğrudan cevabı yapıştırma; önce yaklaşımı sor ya da adım adım götür.' : ''}`;

    // Gorsel varsa son kullanici mesaji multimodal parts dizisine cevrilir
    const aiMsgs = msgs.slice();
    if (chatImgs.length) {
      const last = aiMsgs[aiMsgs.length - 1];
      const txt = (last.content || '').trim() || 'Bu gorselde ne var? Turkce, kisa ve somut anlat.';
      aiMsgs[aiMsgs.length - 1] = {
        role: 'user',
        content: [
          { type: 'text', text: txt },
          ...chatImgs.map(u => ({ type: 'image_url', image_url: { url: u } })),
        ],
      };
    }

    const r = await aiRun(env, {
      messages: [{ role: 'system', content: sysPrompt }, ...aiMsgs],
      tier: proOnce ? aiTierForUser(env, user, 'heavy') : (metaMode ? 'deep' : 'normal'),
      max_tokens: proOnce ? 2200 : (chatImgs.length ? 1100 : 700),
      temperature: metaMode ? 0.35 : 0.5,
    });
    let reply = (r.response || '').trim();
    if (!reply || /^i'?m sorry|^as an ai|your input is not/i.test(reply)) {
      reply = 'Şu an net bir cevap üretemedim, biraz daha açar mısın?';
    }
    return jsonCors({ reply }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// AI cevabından adım dizisini çıkar (markdown/çer-çöp toleranslı)
function extractStepsJson(raw) {
  if (!raw) return [];
  let s = String(raw).trim().replace(/```(?:json)?/gi, '').trim();
  let arr = null;
  const m = s.match(/\[[\s\S]*\]/);
  if (m) { try { arr = JSON.parse(m[0]); } catch {} }
  if (!Array.isArray(arr)) {
    // JSON parse edilemezse satır satır "1. ..." / "- ..." ayıkla
    arr = s.split('\n').map(l => l.replace(/^\s*[-*\d.)\]]+\s*/, '').trim()).filter(Boolean);
  }
  return arr
    .map(x => (typeof x === 'string' ? x : (x && x.text) || ''))
    .map(x => x.trim().replace(/^["'\-\s]+|["'\s]+$/g, ''))
    .filter(x => x.length >= 2 && x.length <= 80)
    .slice(0, 6);
}

// Görevi küçük adımlara böl (ADHD task initiation) — Gemini, tool YOK, JSON dizi döner
async function handleSplitApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const text = (body.text || '').trim();
  if (!text) return jsonCors({ error: 'empty' }, 400, cors);
  if (text.length > 500) return jsonCors({ error: 'too long' }, 400, cors);

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) {
    return jsonCors({ error: 'forbidden' }, 403, cors);
  }

  try {
    const splitPrompt = `Sen Aidan'sın — ADHD beynine uygun görev parçalayıcı. Verilen görevi, başlama eşiğini DÜŞÜREN minik adımlara böl.

⚙️ KURALLAR:
- 3-6 adım.
- Her adım 3-7 kelime arası, somut, eylem fiiliyle başlasın (Aç, Yaz, Oku, Çöz, Ara, Topla, Listele, Kaydet, Gönder...).
- 🎯 İLK ADIM 2 dakika içinde bitebilecek bir mikro-eylem olsun (kitabı aç, dosyayı bul, listeyi yaz...). ADHD task initiation kuralı — başlamak en zor.
- Her adım bir öncekinin doğal devamı (mantık akışı).
- Sonuncu adım "kontrol/teyit" tarzı kapanış olsun ("Cevapları kontrol et", "Tekrar gözden geçir").

🚫 KESİNLİKLE YASAK:
- Açıklama / başlık / yorum / madde imi. Sadece JSON string dizisi.
- "İşte adımlar:" gibi giriş.
- Markdown (\` veya **).
- Adım numaralandırma içerik metnine ("1. Aç" yerine "Aç" yaz).
- Belirsiz adımlar ("Çalış", "Devam et" — eylem belirsiz).
- 8 kelimeden uzun adımlar.
- TÜRKÇE yaz.

✅ ÇIKTI FORMATI: Yalnızca bir JSON dizi string'i. Hiçbir açıklama yok.

📝 ÖRNEKLER:

Görev: "Tarih ödevi fransız ihtilali 10 soru"
→ ["Kitabı aç, üniteyi bul","Sayfayı bir kez göz at","İlk 3 soruyu çöz","Sonraki 4 soruyu çöz","Kalan 3'ü bitir","Cevapları kontrol et"]

Görev: "Mutfağı topla"
→ ["Bulaşıkları lavaboya taşı","Tezgahı boşalt","Bulaşıkları yıka","Tezgahı sil","Çöpü değiştir"]

Görev: "Sunumu hazırla"
→ ["Konuyu bir cümleyle yaz","Ana 3 başlığı listele","İlk slaydı kur","Kalan slaytları doldur","Bir kez baştan oku"]`;

    const r = await aiRun(env, {
      messages: [
        { role: 'system', content: splitPrompt },
        { role: 'user', content: `Görev: ${text}\n\nKüçük adımlara böl. Sadece JSON dizisi döndür.` },
      ],
      max_tokens: 400,
      temperature: 0.4,
    });
    const raw = typeof r.response === 'string' ? r.response : JSON.stringify(r.response || '');
    const steps = extractStepsJson(raw);
    if (!steps.length) return jsonCors({ error: 'no-steps' }, 200, cors);
    return jsonCors({ steps }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// Gün planı JSON ayıklayıcı — AI'dan dizi-of-obje bekler, çer-çöpe toleranslı
function extractPlanJson(raw) {
  if (!raw) return [];
  let s = String(raw).trim().replace(/```(?:json)?/gi, '').trim();
  let arr = null;
  const m = s.match(/\[[\s\S]*\]/);
  if (m) { try { arr = JSON.parse(m[0]); } catch {} }
  if (!Array.isArray(arr)) return [];
  const hm = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const pad = t => { const mt = String(t).match(/^(\d{1,2}):(\d{2})$/); return mt ? String(mt[1]).padStart(2, '0') + ':' + mt[2] : String(t); };
  return arr
    .filter(b => b && typeof b === 'object')
    .map(b => {
      const start = pad((b.start || b.from || '').toString().trim());
      const end = pad((b.end || b.to || '').toString().trim());
      let task = (b.task === 0 || b.task) ? Number(b.task) : null;
      if (!Number.isInteger(task)) task = null;
      const kind = ['task', 'break', 'fixed', 'custom'].includes(b.kind) ? b.kind : (task !== null ? 'task' : 'custom');
      return { start, end, label: (b.label || '').toString().slice(0, 100), task, kind };
    })
    .filter(b => hm.test(b.start) && hm.test(b.end))
    .slice(0, 24);
}

// 📅 Gün planlayıcı — görevler + uyanık pencere → saat saat blok dizisi. Gemini, tool YOK.
async function handlePlanApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 20) : [];
  const from = (body.from || '08:00').toString();
  const to = (body.to || '22:00').toString();
  const now = (body.now || '').toString();
  // busy = sabit program blokları (okul/ders) — AI bu aralıklara blok koymaz
  const busy = Array.isArray(body.busy) ? body.busy.slice(0, 12) : [];
  if (!tasks.length) return jsonCors({ error: 'no-tasks' }, 400, cors);

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  try {
    const blocks = await generatePlanBlocks(env, { tasks, from, to, now, busy, insight: body.insight || '', tier: aiTierForUser(env, user, 'heavy') });
    return jsonCors({ blocks }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// Plan uretimi — /plan endpoint'i ve sabah otomatik plan cron'u ORTAK kullanir.
// Girdi tasks: [{i,text,min,pri,mit,due,cat}] → Cikti: [{start,end,label,task,kind}]
async function generatePlanBlocks(env, { tasks, from, to, now, busy, insight, tier }) {
  const taskLines = tasks.map(t => {
    const bits = [`[${t.i}] ${t.text}`];
    if (t.min) bits.push(t.full ? `bugün ~${t.min}dk (toplam ${t.full}dk, son tarihe bölündü)` : `~${t.min}dk`);
    if (t.pri === 'acil') bits.push('ACİL');
    if (t.mit) bits.push('⭐bugünün-3ü');
    if (t.due) bits.push(`son-tarih:${t.due}`);
    if (t.cat) bits.push(t.cat);
    return bits.join(' · ');
  }).join('\n');

  try {
    const planPrompt = `Sen Aidan'sın — ADHD'li bir lise öğrencisi için gün planlayıcı. Verilen görevleri uyanık pencereye saat saat YERLEŞTİR.

⚙️ KURALLAR:
- Bloklar uyanık pencere içinde kalsın (verilen başlangıç-bitiş aralığı). "Şu an" verilmişse ondan önceye blok koyma.
- Her görevin ~süresi verildiyse o kadar zaman ayır. Süre yoksa 30-45 dk varsay.
- 🔥 ACİL ve ⭐bugünün-3ü görevleri güne ÖNCE / yüksek-enerji saatlerine koy (öğleden önce ya da ilk bloklar).
- Bloklar ÇAKIŞMASIN, ardışık olsun (biri biter, diğeri başlar).
- MEŞGUL saatler verilmişse o aralıklara ASLA blok koyma (okul, özel ders, antrenman gibi sabitler). Planı bu aralıkların ÖNCESİNE, ARASINA ya da SONRASINA kur. Meşgul aralıkları çıktına da EKLEME — onlar zaten plana ayrıca eklenecek.
- Uzun çalışma blokları (45 dk+) arasına 5-10 dk "break" (mola) koy. ADHD beyni molasız çalışamaz.
- Öğle/akşam yemeği için makul bir "fixed" blok bırak (saat uygunsa).
- Bütün görevleri sığdıramıyorsan en önemlilerini koy, gerisini bırak — günü tıka basa doldurma.
- Bir görevde "bugün ~X dk (toplam Y dk, son tarihe bölündü)" yazıyorsa BUGÜN sadece X dk ayır — işi güne yayıyoruz, tek oturuşta bitirmeye çalışma.
- GEÇMİŞ VERİSİ verilmişse ona MUTLAKA uy: verilen tamamlama oranları, blok sayısı sınırı ve kategori uyarısı bu kişinin ölçülmüş gerçeğidir, tahmin değil.
- Günün sonuna 20-30 dk boş tampon bırak — plan kayarsa çökmesin.
- Etiketler (label) Türkçe, kısa ve net olsun.

📦 ÇIKTI: Yalnızca JSON dizisi. Her eleman:
{"start":"HH:MM","end":"HH:MM","label":"kısa açıklama","task":<görev indeksi ya da null>,"kind":"task|break|fixed|custom"}
- "task" = ilgili görevin köşeli parantezdeki indeksi (örn [2] → 2). Göreve bağlı değilse null.
- "kind": görev=task, mola=break, ders/yemek=fixed, diğer=custom.
- Saatler 24 saat formatı, sıfır dolgulu (09:00, 14:30).

🚫 YASAK: Açıklama, başlık, markdown, \` işareti, "İşte plan:" gibi giriş. SADECE JSON dizisi.

📝 ÖRNEK (pencere 15:00-19:00, görevler [0] Matematik ~60dk ACİL, [1] Tarih oku ~30dk):
[{"start":"15:00","end":"16:00","label":"Matematik ödevi","task":0,"kind":"task"},{"start":"16:00","end":"16:10","label":"Kısa mola","task":null,"kind":"break"},{"start":"16:10","end":"16:40","label":"Tarih oku","task":1,"kind":"task"}]`;

    const busyLine = (busy && busy.length)
    ? `\n\nMEŞGUL saatler (bu aralıklar DOLU, buralara blok KOYMA):\n${busy.map(x => `${x.start}-${x.end} ${x.label}`).join('\n')}`
    : '';
  const userMsg = `Uyanık pencere: ${from} - ${to}.${now ? ` Şu an saat: ${now}.` : ''}${busyLine}${insight || ''}\n\nGörevler (indeks · metin · süre · etiketler):\n${taskLines}\n\nGünü saat saat planla. Sadece JSON dizisi döndür.`;

    const r = await aiRun(env, {
      tier: tier || 'heavy',
      messages: [
        { role: 'system', content: planPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 1200,
      temperature: 0.4,
    });
    const raw = typeof r.response === 'string' ? r.response : JSON.stringify(r.response || '');
    return extractPlanJson(raw);
  } catch (e) {
    throw new Error(e.message || 'plan-uretilemedi');
  }
}

// AI portföy yorumu — BETİMLEYİCİ özet (yatırım tavsiyesi DEĞİL). Sayılar PWA'dan gelir (uydurma yok).
async function handlePortfolioCommentApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const facts = (body.facts || '').trim();
  if (!facts) return jsonCors({ error: 'empty' }, 400, cors);
  if (facts.length > 3000) return jsonCors({ error: 'too long' }, 400, cors);

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) {
    return jsonCors({ error: 'forbidden' }, 403, cors);
  }

  try {
    const session = await fetchUserDataForApi(env, user);
    const name = getUserDisplayName(session.data, user.email);

    const pfPrompt = `Sen Aidan'sın — ${name}'in asistanı. ${name}'in borsa portföyünün GERÇEK rakamları sana veriliyor. Bunlar PWA hesapladı; senin işin **ayna olmak**, **karar vermek değil**.

GÖREVİN: 3-5 cümle TÜRKÇE betimleyici özet. Sadece görüneni tarif et.

✅ İZİN VERİLEN:
- Dağılımı söylemek ("portföyün %X'i tek hissede")
- Bugünkü genel hareket ("toplamda günü artıda kapatmışsın")
- Konsantrasyon farkındalığı, NÖTR ("yumurtaların çoğu tek sepette" gibi BİLGİ)
- Para birimi gruplaması ("TL tarafı şöyle, USD tarafı şöyle")
- Verilen sayıları KOPYALAYIP göstermek

🚫 MUTLAK YASAK (ihlal = zarar):
1. AL / SAT / TUT tavsiyesi (tek kelime bile değil)
2. Fiyat tahmini / "yükselebilir / düşebilir / artık satma vakti"
3. "İyi/kötü/doğru/yanlış yatırım" gibi değer yargısı
4. Belirli hisse övme/kötüleme
5. ASLA sayı uydurma (verilmemişse YOK)
6. "Yatırım tavsiyesi değildir" eki — gereksiz
7. İngilizce
8. Belirli stratejiler ("şu hisseyi azalt", "şuna giriş yap")
9. Geleceğe dair tahmin ("uzun vadede X olur" yasak)

✅ TON: tarafsız bir ekran okuyucu. Sayıları net göster, his katma, karar verme.

📝 ÖRNEK ÇIKTI (referans):
"Portföyün ağırlığı THYAO'da (%57.6) — yumurtaların çoğu tek sepette ${name}. GARAN ve ASELS kalan kısmı paylaşıyor. Günü genel olarak +%1.2 ile artıda kapamışsın. Toplam getiriniz +%8.4 — başlangıca göre öndesin."`;

    const r = await aiRun(env, {
      messages: [
        { role: 'system', content: pfPrompt },
        { role: 'user', content: `Portföy rakamları (PWA'dan, doğrulanmış):\n${facts}\n\nBetimleyici 3-5 cümlelik özet yaz. TÜRKÇE, tarafsız, karar verme.` },
      ],
      max_tokens: 400,
      temperature: 0.4,
    });
    let comment = (r.response || '').trim();
    if (!comment || /^i'?m sorry|^as an ai|your input/i.test(comment)) {
      comment = `${name}, şu an yorum üretemedim — portföy özetini grafik ve kartlarda görebilirsin.`;
    }
    return jsonCors({ comment }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// ============================================================
// Borsa — Yahoo Finance bedava API proxy (CORS yüzünden tarayıcı direkt çekemez)
// ============================================================
// BIST sembolü .IS ile biter (THYAO -> THYAO.IS). Kullanıcı sembolü yalın girer.
// NOT (Haz 8): ABD/Döviz/Kripto eklendi — artık PWA her hisse için kendi ySymbol'ünü
// hesaplayıp gönderiyor (toYahooSymbol). Bu fonksiyon sadece (a) eski watchlist
// kayıtları (ySymbol alanı yok, hepsi BIST varsayıldı) ve (b) eski {symbols:[...]}
// API formatı için geriye dönük uyum amaçlı kalıyor.
function bistSymbol(sym) {
  const s = String(sym || '').trim().toUpperCase();
  if (!s) return null;
  // Zaten suffix varsa dokunma (USDTRY=X, AAPL.O, BTC-USD gibi)
  if (s.includes('.') || s.includes('=') || s.includes('-')) return s;
  return s + '.IS';
}

// entries: [{ display, yahoo }] — display = kullanıcıya gösterilen sembol (THYAO, AAPL, BTC),
// yahoo = Yahoo Finance API'sine gidecek tam sembol (THYAO.IS, AAPL, BTC-USD, USDTRY=X).
// Geriye dönük uyum: düz string de kabul edilir (eski watchlist'ler için bistSymbol ile çevrilir).
async function fetchStockQuotes(entries) {
  const out = [];
  const normalized = entries.map(e =>
    (typeof e === 'string') ? { display: String(e).toUpperCase(), yahoo: bistSymbol(e) } : e
  );
  // Yahoo'yu sembol başına çek (chart endpoint tek sembol alır, paralel)
  const jobs = normalized.map(async ({ display, yahoo }) => {
    if (!yahoo) return null;
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, cf: { cacheTtl: 60, cacheEverything: true } }
      );
      if (!r.ok) return { symbol: display, error: `http ${r.status}` };
      const j = await r.json();
      const meta = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
      if (!meta || meta.regularMarketPrice == null) return { symbol: display, error: 'veri yok' };
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose;
      const changePct = (prev && prev > 0) ? ((price - prev) / prev) * 100 : null;
      return {
        symbol: display,
        ySymbol: yahoo,
        name: meta.longName || meta.shortName || display,
        price,
        prevClose: prev != null ? prev : null,
        changePct: changePct != null ? Math.round(changePct * 100) / 100 : null,
        currency: meta.currency || 'TRY',
      };
    } catch (e) {
      return { symbol: display, error: e.message };
    }
  });
  const results = await Promise.all(jobs);
  for (const r of results) if (r) out.push(r);
  return out;
}

async function handleStocksApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }

  // Yeni format: {entries:[{display,yahoo}]} — PWA artık BIST/ABD/Döviz/Kripto sembolünü kendi çevirip yolluyor.
  // Eski format: {symbols:[...]} — geriye dönük uyum, Worker bistSymbol ile çevirir (sadece BIST varsayar).
  let entries = [];
  if (Array.isArray(body.entries)) {
    entries = body.entries
      .filter(e => e && e.display && e.yahoo)
      .map(e => ({ display: String(e.display).trim().toUpperCase(), yahoo: String(e.yahoo).trim().toUpperCase() }))
      .slice(0, 30);
  } else if (Array.isArray(body.symbols)) {
    entries = body.symbols.map(s => String(s).trim()).filter(Boolean).slice(0, 30)
      .map(s => ({ display: s.toUpperCase(), yahoo: bistSymbol(s) }));
  }
  if (!entries.length) return jsonCors({ quotes: [] }, 200, cors);

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);

  try {
    const quotes = await fetchStockQuotes(entries);
    return jsonCors({ quotes, at: Date.now() }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// ============================================================
// Tek hisse geçmiş veri — mini grafik için (1A / 3A / 1Y)
// Yahoo chart endpoint'i tek sembol için close serisi döner. 5dk Cloudflare cache.
// ============================================================
const STOCK_HISTORY_RANGES = {
  '1mo': { range: '1mo', interval: '1d' },
  '3mo': { range: '3mo', interval: '1d' },
  '6mo': { range: '6mo', interval: '1d' },
  '1y':  { range: '1y',  interval: '1wk' },
};

async function handleStockHistoryApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }

  const yahoo = String(body.ySymbol || '').trim().toUpperCase();
  if (!yahoo || !/^[A-Z0-9.=-]{1,20}$/.test(yahoo)) {
    return jsonCors({ error: 'bad symbol' }, 400, cors);
  }
  const rangeKey = STOCK_HISTORY_RANGES[body.range] ? body.range : '1mo';
  const { range, interval } = STOCK_HISTORY_RANGES[rangeKey];

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);

  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?range=${range}&interval=${interval}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cf: { cacheTtl: 300, cacheEverything: true } }
    );
    if (!r.ok) return jsonCors({ error: `yahoo http ${r.status}` }, 502, cors);
    const j = await r.json();
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) return jsonCors({ error: 'veri yok' }, 404, cors);

    const ts = Array.isArray(res.timestamp) ? res.timestamp : [];
    const q = res.indicators && res.indicators.quote && res.indicators.quote[0] || {};
    const closeArr = Array.isArray(q.close) ? q.close : [];
    const openArr = Array.isArray(q.open) ? q.open : [];
    const highArr = Array.isArray(q.high) ? q.high : [];
    const lowArr = Array.isArray(q.low) ? q.low : [];
    const volArr = Array.isArray(q.volume) ? q.volume : [];
    const meta = res.meta || {};

    // null close değerleri (kapalı gün/tatil) atla — OHLCV paralel index korunur
    const points = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closeArr[i];
      if (c == null || !isFinite(c)) continue;
      const round = v => (v != null && isFinite(v)) ? Math.round(v * 100) / 100 : null;
      points.push({
        t: ts[i],
        c: round(c),
        o: round(openArr[i]),
        h: round(highArr[i]),
        l: round(lowArr[i]),
        v: (volArr[i] != null && isFinite(volArr[i])) ? Math.round(volArr[i]) : null,
      });
    }
    if (points.length < 2) return jsonCors({ error: 'yetersiz veri' }, 404, cors);

    const values = points.map(p => p.c);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const first = values[0];
    const last = values[values.length - 1];
    const changePct = first > 0 ? Math.round(((last - first) / first) * 10000) / 100 : null;

    return jsonCors({
      ySymbol: yahoo,
      range: rangeKey,
      name: meta.longName || meta.shortName || yahoo,
      currency: meta.currency || 'TRY',
      timestamps: points.map(p => p.t),
      closes: values,
      opens: points.map(p => p.o),
      highs: points.map(p => p.h),
      lows: points.map(p => p.l),
      volumes: points.map(p => p.v),
      min, max, first, last, changePct,
    }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// ============================================================
// 📊 Temel analiz verileri — Yahoo quoteSummary proxy (crumb + cookie akışı)
// ============================================================
let _yahooCrumb = null; // { crumb, cookie, at } — isolate ömrü boyunca cache
async function getYahooCrumb() {
  if (_yahooCrumb && Date.now() - _yahooCrumb.at < 30 * 60 * 1000) return _yahooCrumb;
  const UA = 'Mozilla/5.0';
  const c = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA } });
  let cookies = [];
  if (typeof c.headers.getSetCookie === 'function') cookies = c.headers.getSetCookie();
  else { const sc = c.headers.get('set-cookie'); if (sc) cookies = [sc]; }
  const cookie = cookies.map(s => s.split(';')[0]).filter(Boolean).join('; ');
  const cr = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Accept': 'text/plain', 'Cookie': cookie },
  });
  const crumb = (await cr.text()).trim();
  if (!crumb || crumb.length > 40 || crumb.includes('<')) throw new Error('crumb alınamadı');
  _yahooCrumb = { crumb, cookie, at: Date.now() };
  return _yahooCrumb;
}

// Yahoo quoteSummary'den yillik mali tablo serisi cikarir (yeniden eskiye).
// Gelir tablosu + bilanco + nakit akis ayni yil icin birlestirilir; eksik alan null kalir.
function buildFundYears(res, raw) {
  const inc = (res.incomeStatementHistory && res.incomeStatementHistory.incomeStatementHistory) || [];
  const bal = (res.balanceSheetHistory && res.balanceSheetHistory.balanceSheetStatements) || [];
  const cfs = (res.cashflowStatementHistory && res.cashflowStatementHistory.cashflowStatements) || [];
  const yearOf = s => {
    const e = raw(s && s.endDate);
    if (e == null || !isFinite(e)) return null;
    return new Date(e * 1000).getUTCFullYear();
  };
  const map = new Map();
  const slot = y => {
    if (!map.has(y)) map.set(y, { year: y, revenue: null, netIncome: null, grossProfit: null, operatingIncome: null,
      equity: null, totalAssets: null, totalLiab: null, longTermDebt: null, shortDebt: null, cash: null, retainedEarnings: null,
      dna: null, capex: null, dividendsPaid: null, opCashFlow: null });
    return map.get(y);
  };
  for (const s of inc) {
    const y = yearOf(s); if (y == null) continue;
    const o = slot(y);
    o.revenue = raw(s.totalRevenue);
    o.netIncome = raw(s.netIncome);
    o.grossProfit = raw(s.grossProfit);
    o.operatingIncome = raw(s.operatingIncome) != null ? raw(s.operatingIncome) : raw(s.ebit);
  }
  for (const s of bal) {
    const y = yearOf(s); if (y == null) continue;
    const o = slot(y);
    o.equity = raw(s.totalStockholderEquity);
    o.totalAssets = raw(s.totalAssets);
    o.totalLiab = raw(s.totalLiab);
    o.longTermDebt = raw(s.longTermDebt);
    o.shortDebt = raw(s.shortLongTermDebt);
    o.cash = raw(s.cash);
    o.retainedEarnings = raw(s.retainedEarnings);
  }
  for (const s of cfs) {
    const y = yearOf(s); if (y == null) continue;
    const o = slot(y);
    if (o.netIncome == null) o.netIncome = raw(s.netIncome);
    o.dna = raw(s.depreciation);
    o.capex = raw(s.capitalExpenditures);
    o.dividendsPaid = raw(s.dividendsPaid);
    o.opCashFlow = raw(s.totalCashFromOperatingActivities);
  }
  return Array.from(map.values()).sort((a, b) => b.year - a.year).slice(0, 6);
}

async function handleStockFundamentalsApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });
  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const yahoo = String(body.ySymbol || '').trim().toUpperCase();
  if (!yahoo || !/^[A-Z0-9.=-]{1,20}$/.test(yahoo)) return jsonCors({ error: 'bad symbol' }, 400, cors);
  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  try {
    const { crumb, cookie } = await getYahooCrumb();
    // Buffett skoru icin gecmis mali tablolar da lazim (yillik, Yahoo genelde 4 donem verir)
    const modules = 'summaryDetail,defaultKeyStatistics,financialData,price,incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory';
    const hdr = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Cookie': cookie };
    // 5 yillik aylik kapanis serisi — "1 Dolar Testi" fiyat degisimi icin (bolunme/bedelsiz duzeltilmis)
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?range=5y&interval=1mo`;
    const [r, cr] = await Promise.all([
      fetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahoo)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`,
        { headers: hdr, cf: { cacheTtl: 600, cacheEverything: true } }
      ),
      fetch(chartUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, cf: { cacheTtl: 600, cacheEverything: true } }).catch(() => null),
    ]);
    if (r.status === 401 || r.status === 403) { _yahooCrumb = null; return jsonCors({ error: 'yahoo yetki — tekrar dene' }, 502, cors); }
    if (!r.ok) return jsonCors({ error: `yahoo http ${r.status}` }, 502, cors);
    const j = await r.json();
    const res = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
    if (!res) return jsonCors({ error: 'veri yok' }, 404, cors);
    const sd = res.summaryDetail || {}, ks = res.defaultKeyStatistics || {}, fd = res.financialData || {}, pr = res.price || {};
    const raw = o => (o && typeof o === 'object' && 'raw' in o) ? o.raw : (typeof o === 'number' ? o : null);
    const pick = (a, b) => { const x = raw(a); return x != null ? x : raw(b); };

    // --- Yillik mali tablo serisi (gelir + bilanco + nakit akis birlestirilir) ---
    const years = buildFundYears(res, raw);

    // --- Aylik fiyat serisi (1 Dolar Testi) ---
    let priceHistory = null;
    try {
      if (cr && cr.ok) {
        const cj = await cr.json();
        const cres = cj && cj.chart && cj.chart.result && cj.chart.result[0];
        const ts = cres && Array.isArray(cres.timestamp) ? cres.timestamp : null;
        // adjclose varsa onu kullan — bedelsiz/bolunme duzeltmesi Buffett testinde sarttir
        const adj = cres && cres.indicators && cres.indicators.adjclose && cres.indicators.adjclose[0]
          ? cres.indicators.adjclose[0].adjclose : null;
        const cl = cres && cres.indicators && cres.indicators.quote && cres.indicators.quote[0]
          ? cres.indicators.quote[0].close : null;
        // 1 Dolar Testi icin BOLUNME duzeltilmis ama TEMETTU duzeltilmemis seri lazim
        // (temettuyu ayrica tutulan kardan dusuyoruz - adjclose kullanirsak cift sayardik)
        const series = (Array.isArray(cl) && cl.some(v => v != null)) ? cl : adj;
        if (ts && Array.isArray(series) && ts.length === series.length) {
          const t = [], c = [];
          for (let k = 0; k < ts.length; k++) {
            if (series[k] == null || !isFinite(series[k])) continue;
            t.push(ts[k]); c.push(Math.round(series[k] * 10000) / 10000);
          }
          if (t.length >= 2) priceHistory = { t, c, divAdjusted: series === adj };
        }
      }
    } catch {}

    return jsonCors({
      ySymbol: yahoo,
      name: pr.longName || pr.shortName || yahoo,
      currency: pr.currency || sd.currency || 'TRY',
      marketCap: pick(pr.marketCap, sd.marketCap),
      trailingPE: pick(sd.trailingPE, ks.trailingPE),
      forwardPE: raw(sd.forwardPE),
      priceToBook: raw(ks.priceToBook),
      dividendYield: pick(sd.dividendYield, sd.trailingAnnualDividendYield),
      eps: raw(ks.trailingEps),
      profitMargins: pick(fd.profitMargins, ks.profitMargins),
      returnOnEquity: raw(fd.returnOnEquity),
      debtToEquity: raw(fd.debtToEquity),
      revenueGrowth: raw(fd.revenueGrowth),
      earningsGrowth: raw(fd.earningsGrowth),
      targetMean: raw(fd.targetMeanPrice),
      numAnalysts: raw(fd.numberOfAnalystOpinions),
      recommendation: fd.recommendationKey || null,
      // --- Buffett katmani (ham veri; skoru PWA hesaplar) ---
      sharesOutstanding: pick(ks.sharesOutstanding, ks.impliedSharesOutstanding),
      totalCash: raw(fd.totalCash),
      totalDebt: raw(fd.totalDebt),
      freeCashflow: raw(fd.freeCashflow),
      operatingCashflow: raw(fd.operatingCashflow),
      years,
      priceHistory,
      at: Date.now(),
    }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// ============================================================
// 📰 Hisse haberleri — Yahoo Finance search news proxy + opsiyonel AI özet
// İki mod: (1) default → haber listesi döner, (2) {summarize:true, headlines:[...]} → Türkçe AI özet.
// PWA önce listeyi çeker (hızlı), kullanıcı "AI özetle" derse aynı endpoint'e başlıkları yollar.
// ============================================================
async function handleStockNewsApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  // --- Mod 2: AI özet ---
  if (body.sentiment) {
    const headlines = Array.isArray(body.headlines)
      ? body.headlines.map(h => String(h || '').trim()).filter(Boolean).slice(0, 12)
      : [];
    if (!headlines.length) return jsonCors({ error: 'no headlines' }, 400, cors);
    const sysP = `Her haber başlığını bir hisse yatırımcısı gözünden duyguya göre sınıfla: "pos" (olumlu/iyi gelişme), "neg" (olumsuz/kötü gelişme), "neu" (nötr/belirsiz). SADECE bir JSON dizi döndür; her eleman {"i":sira,"s":"pos|neg|neu"}. Açıklama, metin, İngilizce cümle YOK.`;
    const userM = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n');
    try {
      const r = await aiRun(env, {
        messages: [{ role: 'system', content: sysP }, { role: 'user', content: userM }],
        tier: 'light', max_tokens: 300, temperature: 0.1,
      });
      let raw = typeof r.response === 'string' ? r.response : JSON.stringify(r.response);
      let arr = [];
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) { try { arr = JSON.parse(m[0]); } catch {} }
      const sentiments = headlines.map((_, i) => {
        const found = Array.isArray(arr) ? arr.find(x => x && (x.i === i + 1 || x.i === i)) : null;
        const s = found && found.s;
        return (s === 'pos' || s === 'neg' || s === 'neu') ? s : 'neu';
      });
      return jsonCors({ sentiments }, 200, cors);
    } catch (e) {
      return jsonCors({ error: e.message }, 500, cors);
    }
  }

  if (body.summarize) {
    const symbol = String(body.symbol || '').trim().toUpperCase().slice(0, 20);
    const headlines = Array.isArray(body.headlines)
      ? body.headlines.map(h => String(h || '').trim()).filter(Boolean).slice(0, 12)
      : [];
    if (!headlines.length) return jsonCors({ error: 'no headlines' }, 400, cors);

    let name = 'kanka';
    try {
      const session = await fetchUserDataForApi(env, user);
      name = getUserDisplayName(session.data, user.email);
    } catch {}

    const sysPrompt = `Sen Aidan'sın — ${name}'in asistanı. Sana bir hisseyle ilgili haber BAŞLIKLARI veriliyor. Görevin: 3-5 cümlelik TARAFSIZ Türkçe özet — başlıkların ne hakkında olduğunu, ortak temayı/gündemi betimle.

🚫 YASAK: al/sat/tut tavsiyesi, fiyat tahmini, "iyi/kötü haber" yargısı, İngilizce, başlıkta olmayan bilgi uydurmak.
✅ İZİN: hangi konuların öne çıktığını betimlemek (bilanço, sözleşme, sektör, yönetim vb.), gündem hakkında nötr gözlem.
TON: kısa, net, haber bülteni dili. Son cümle: "Bu sadece haber özeti — yatırım tavsiyesi değildir. 💜"`;

    const userMsg = `${symbol} ile ilgili son haber başlıkları:\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\nBunları 3-5 cümlelik tarafsız Türkçe özete dök.`;

    try {
      const r = await aiRun(env, {
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userMsg },
        ],
        max_tokens: 320,
        temperature: 0.4,
      });
      let summary = (r.response || '').trim();
      if (!summary || /^i'?m sorry|^as an ai|your input/i.test(summary)) {
        summary = `${name}, şu an özet üretemedim — başlıkları yukarıda görebilirsin. Bu yatırım tavsiyesi değildir.`;
      }
      return jsonCors({ summary, symbol }, 200, cors);
    } catch (e) {
      return jsonCors({ error: e.message }, 500, cors);
    }
  }

  // --- Mod 1: haber listesi ---
  const ySymbol = String(body.ySymbol || body.symbol || '').trim().toUpperCase();
  if (!ySymbol || !/^[A-Z0-9.=-]{1,20}$/.test(ySymbol)) {
    return jsonCors({ error: 'bad symbol' }, 400, cors);
  }

  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ySymbol)}&newsCount=12&quotesCount=0&enableFuzzyQuery=false`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cf: { cacheTtl: 600, cacheEverything: true } }
    );
    if (!r.ok) return jsonCors({ error: `yahoo http ${r.status}` }, 502, cors);
    const j = await r.json();
    const raw = Array.isArray(j.news) ? j.news : [];
    const news = raw
      .filter(n => n && n.title && n.link)
      .map(n => ({
        title: String(n.title).slice(0, 220),
        publisher: String(n.publisher || '').slice(0, 60),
        link: String(n.link).slice(0, 400),
        time: (n.providerPublishTime && isFinite(n.providerPublishTime)) ? n.providerPublishTime : null,
      }))
      .sort((a, b) => (b.time || 0) - (a.time || 0))
      .slice(0, 10);
    return jsonCors({ ySymbol, news, at: Date.now() }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// ============================================================
// 👥 Multi-user — /signup + /invite endpoint'leri (davet kodlu kapalı kayıt)
// ============================================================
// Akış: Salim /invite/create ile kod üretir → arkadaşa yollar →
// arkadaş /signup'a email+şifre+kod yollar → kod doğruysa Supabase auth'a kayıt + kodu used işaretle.
// Service key olmadan da /invite/create çalışır (kodu kendi user'ı adına yazar),
// /signup'da service key yoksa kullanılır mevcut Supabase auth signup endpoint'i.

// 📈 AI teknik analiz — BETİMLEYİCİ (yatırım tavsiyesi DEĞİL).
// PWA göstergeleri (SMA7/SMA30/volatilite/trend) hesaplar, AI sadece tarif eder.
async function handleStockAnalysisApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  const symbol = String(body.symbol || '').trim().toUpperCase().slice(0, 20);
  const range = String(body.range || '1mo').trim();
  const isFund = String(body.mode || 'ta') === 'fund'; // 'fund' = temel analiz odakli yorum
  const facts = body.facts;
  if (!symbol || !facts || typeof facts !== 'object') return jsonCors({ error: 'missing' }, 400, cors);

  // User adı (settings.displayName)
  let name = 'kanka';
  try {
    const session = await fetchUserDataForApi(env, user);
    name = getUserDisplayName(session.data, user.email);
  } catch {}

  const rangeLabels = { '1mo': '1 ay', '3mo': '3 ay', '6mo': '6 ay', '1y': '1 yıl' };
  const rangeLabel = rangeLabels[range] || range;
  const currency = String(facts.currency || '').slice(0, 8);

  // Buffett katmani kurallari — sadece temel veri geldiyse prompt'a girer
  const bfRules = facts.buffett ? `

🧱 BUFFETT KATMANI (temel analiz — PWA hesapladı, ASLA YENİDEN HESAPLAMA):
- Buffett skoru 0-100'dür; teknik uyum skorunun temel analiz karşılığıdır. Kriter dökümü sana veriliyor — hangi maddeden kaç puan KIRILDIĞINI açıkla, en zayıf 2 maddeyi öne çıkar.
- Her kriterin NE ÖLÇTÜĞÜNÜ kısaca öğret (${name} öğreniyor): ROE = şirketin kendi sermayesiyle ürettiği kâr · Owner Earnings = Buffett'in 1986 mektubunda tanıttığı "sahip kârı", işletme nakit akışından bakım yatırımı düşülmüş hali; muhasebe kârından daha dürüsttür çünkü makineyi yenilemenin maliyetini saymaya devam eder · 1 Dolar Testi = şirketin dağıtmayıp tuttuğu her 1 birim kârın piyasa değerine en az 1 birim eklemesi beklenir, eklemiyorsa o para temettü olarak dağıtılsaydı daha iyiydi · engel oranı = paranın alternatif getirisi (TR'de mevduat/tahvil faizi).
- "veri yok" yazan kriter hakkında YORUM YAPMA — sadece eksik olduğunu söyle. Veri kapsamı %70'in altındaysa skoru temkinli sun.
- BUFFETT'İN REDDETTİKLERİNİ sen de kullanma: FAVÖK/EBITDA'ya dayanma (amortismanı geri eklemek makinelerin bedava yenilendiğini varsaymaktır), beta/oynaklığı "risk" diye sunma (risk = kalıcı sermaye kaybı ihtimalidir, fiyatın oynaması değil), analist hedefini kanıt sayma, faiz/makro tahmini yapma. ${name} sorarsa NEDEN reddedildiğini açıklayabilirsin.
- Para birimi TRY ise: 2023 sonrası enflasyon muhasebesinin net kârı çarpıttığını, bu yüzden Owner Earnings ve nakde dönüşüm satırının daha güvenilir olduğunu belirt. Nominal 1 Dolar Testi'nin enflasyon ortamında iyimser olabileceğini de söyle.
- "Ucuz/pahalı", "iyi şirket/kötü yatırım", "al/sat" YİNE YASAK. Bunun yerine sayıyı engel oranıyla karşılaştırarak betimle: "OE getirisi %X, engel oranı %Y — altında kalıyor" gibi.
- Sayıları verilenden aynen kullan; kriter puanı, skor ya da oran UYDURMA.` : '';

  const sysPrompt = `Sen Aidan'sın — ${name}'in asistanı. Sana bir hissenin teknik göstergeleri (PWA hesapladı) veriliyor. Görevin: SADECE BETİMLEYİCİ Türkçe teknik/taktik gözlem yaz. 5-8 cümle.

✅ İZİN VERİLEN (tarafsız betimleme):
- Trend yönü, volatilite, RSI/MACD/Bollinger BAND konumunu TARİF et (sayıları kullan)
- SMA20 vs SMA50 ilişkisi, altın/ölüm kesişimi TERİMİNİ kullanabilirsin ama "al/sat sinyali" deme
- Destek/direnç seviyelerini BİLGİ olarak söyle (tavsiye değil)
- Hacim ortalamanın üstünde/altında betimlemesi
- Taktik sinyaller listesini özetle (zaten nötr dilde verildi)
- SON HABER başlıkları verilebilir: teknik tabloyu bu haberlerle BİRLİKTE yorumla — sayının arkasındaki olası hikâyeyi/gündemi betimle ("şu tarihte şu haber çıktı, tablo bu dönemde şöyle görünüyor" gibi BAĞ kur), ama haberin fiyatı yükseltip düşüreceğini SÖYLEME. Haber yoksa bu kısmı atla.
- ${name}'e hitap
- KOŞULLU SENARYO dili (Analiz v2 — ARTIK SERBEST): "X seviyesinin üstünde günlük kapanış olursa teknik olarak sıradaki seviye Y'dir", "Z altına dönerse bu kurulum geçersizleşir" gibi EĞER-İSE cümleleri kurabilirsin. Bu tahmin değil, seviye haritasıdır — koşulu ve GEÇERSİZLEŞME seviyesini her zaman birlikte söyle. Koşulsuz "yükselir/düşer" cümlesi yine YASAK.
- UYUM SKORU'nu (0-100, 50 nötr) yorumla: kaç gösterge aynı yöne bakıyor, ADX'e göre bu uyum ne kadar anlamlı. Yatay piyasada (ADX<20) yüksek uyumun bile zayıf sinyal olduğunu söyle.
- ZAMAN DİLİMİ UYUMU verilmişse mutlaka değin — günlük ile haftalık ters yöndeyse bunu açıkça belirt.
- OYNAKLIK ARALIĞI (ATR×√5) istatistiksel bir banttır, hedef değildir — öyle tarif et.

📚 ÖĞRETİCİ KURAL (ÇOK ÖNEMLİ — ${name} öğrenmek istiyor):
Bahsettiğin HER göstergenin NE ANLAMA GELDİĞİNİ kısacık parantez/cümle içinde açıkla. ${name} bu göstergeleri öğreniyor — terimi söyleyip geçme, tanımını ver.
Örnekler (bu kalıpta):
- "RSI 28 — RSI son 14 günkü alış/satış baskısını 0-100 arası ölçer; 30 altı 'aşırı satım' yani yakın dönemde satıcı baskın demek."
- "Fiyat SMA50'nin altında — SMA50, son 50 günün ortalama fiyatı; fiyatın altında olması son dönem ortalamasının gerisinde işlem gördüğünü gösterir."
- "MACD histogramı negatif — MACD iki ortalamanın farkıdır, negatif histogram kısa vadeli momentumun zayıfladığını gösterir."
- "Bollinger alt bandına yakın — bantlar ortalamanın ±2 standart sapması; alt banda yakınlık fiyatın kendi oynaklığına göre düşük bölgede olduğunu gösterir."
Açıklama TANIM düzeyinde kalsın — "bu yüzden yükselir/düşer/alınır" DEME. Göstergenin ne ölçtüğünü öğret, geleceği söyleme.

🚫 MUTLAK YASAK:
1. AL / SAT / TUT emri ("al", "sat", "gir", "çık", "topla", "boşalt")
2. KOŞULSUZ gelecek tahmini ("yükselecek", "düşer", "kırar") — koşullu senaryo serbest, koşulsuz kehanet yasak
3. Değer yargısı ("iyi fırsat", "ucuz/pahalı", "fiyat düşük kalmış")
4. Verilenin dışında sayı uydurma — TÜM seviyeler sana verilen listeden gelmeli
5. İngilizce
6. Haberden fiyat yönü çıkarma ("bu haber yükseltir/düşürür" DEME — haberin varlığını ve tablonun o dönemki halini betimle)
7. Olasılık yüzdesi uydurma ("%70 ihtimalle" DEME — sana verilmedi)

✅ TON: deneyimli grafik okuyucu + sabırlı öğretmen — gözlüyor, tarif ediyor, terimi öğretiyor, koşulları kuruyor, ama KARAR VERMİYOR. Kararı ${name} verir.
Kapanışta dolgu cümle ya da uyarı yazma — arayüzde zaten var. Son cümlen analizin kendisi olsun.${bfRules}${isFund ? `

🎯 BU İSTEK TEMEL ANALİZ ODAKLI: ağırlığı Buffett katmanına ver (yaklaşık 3/4), teknik tabloyu sadece kısa bir bağlam paragrafı olarak kullan. Şirketin İŞ KALİTESİNİ anlat: kârı gerçek mi (nakde dönüyor mu), sermayesini iyi mi kullanıyor, borcu taşınabilir mi, tuttuğu kâr değer yaratmış mı. 10-14 cümle.` : ''}`;

  const news = Array.isArray(body.newsHeadlines)
    ? body.newsHeadlines.map(n => (typeof n === 'string' ? { title: n } : n)).filter(n => n && n.title).slice(0, 10)
    : [];
  const newsBlock = news.length
    ? `\n\n📰 SON HABER BAŞLIKLARI (hisseye dair, teknik tabloyla birlikte yorumla — teknik + hikaye):\n${news.map(n => `- ${String(n.title).slice(0, 160)}`).join('\n')}`
    : '';
  const signalsBlock = Array.isArray(facts.signals) && facts.signals.length
    ? facts.signals.map(s => `- ${s}`).join('\n')
    : '(yok)';

  // Analiz v2 blokları — PWA hesaplar, AI yeniden hesaplamaz
  const cf = facts.confluence;
  const confBlock = cf
    ? `\n\n🧭 UYUM SKORU: ${cf.score}/100 — ${cf.label} (50 = nötr)
${cf.bull} gösterge yukarı · ${cf.bear} aşağı · ${cf.neutral} nötr (toplam ${cf.total})
Sinyal güvenilirliği (ADX'e göre): ${cf.reliability}`
    : '';
  const sc = facts.scenarios;
  const lvlLine = (s, dirWord) => s
    ? `${dirWord}: tetik ${s.trigger} (${s.triggerSrc}, %${s.distPct} uzakta${s.sessions != null ? `, ≈${s.sessions} ortalama seans` : ''}) → sıradaki seviyeler ${s.t1} (${s.t1Src}) ve ${s.t2} (ATR×3) | geçersizleşme ${s.invalidate}`
    : `${dirWord}: yeterli seviye yok`;
  const scenBlock = sc
    ? `\n\n🗺️ KOŞULLU SEVİYE HARİTASI (tahmin değil — PWA hesapladı, sayıları aynen kullan):
${lvlLine(sc.up, 'YUKARI')}
${lvlLine(sc.down, 'AŞAĞI')}${sc.band ? `\nSıkışma bandı: ${sc.band.low} – ${sc.band.high} (genişlik %${sc.band.widthPct})` : ''}
Oynaklık aralığı (5 seans, ATR×√5): ${sc.vol5.low} – ${sc.vol5.high} — istatistiksel band, hedef DEĞİL`
    : '';
  const mt = facts.mtf;
  const mtfBlock = mt
    ? `\n\n⏳ ZAMAN DİLİMİ UYUMU: ${mt.state} — günlük ${mt.dailyLabel} (${mt.dailyScore}) · haftalık ${mt.weeklyLabel} (${mt.weeklyScore})`
    : '';

  // Buffett katmani — temel analiz faktlari (PWA hesapladi)
  const bf = facts.buffett;
  let bfBlock = '';
  if (bf) {
    const rows = (Array.isArray(bf.parts) ? bf.parts : []).map(p =>
      `- ${p.label}: ${p.pts == null ? 'VERİ YOK' : `${p.pts}/${p.max} puan`} — ${String(p.note || '').slice(0, 240)}`
    ).join('\n');
    const dl = bf.dollar
      ? `\n1 Dolar Testi detayı: ${bf.dollar.from}'den beri hisse başına tutulan kâr ${bf.dollar.retainedPerShare}, fiyat artışı ${bf.dollar.gainPerShare} → oran ${bf.dollar.ratio} (1,00 = eşik)`
      : '';
    const fl = (Array.isArray(bf.flags) && bf.flags.length)
      ? `\nUYARI BAYRAKLARI:\n${bf.flags.map(f => `- ${String(f).slice(0, 200)}`).join('\n')}`
      : '';
    bfBlock = bf.score == null
      ? `\n\n🧱 BUFFETT SKORU: hesaplanamadı — ${String(bf.reason || 'veri yetersiz').slice(0, 200)}\n${rows}`
      : `\n\n🧱 BUFFETT SKORU: ${bf.score}/100 — ${bf.label} (engel oranı %${bf.hurdlePct}, ${bf.years} yıllık tablo, veri kapsamı %${Math.round((bf.coverage || 0) * 100)})
KRİTER DÖKÜMÜ:
${rows}${dl}
Owner earnings getirisi: ${bf.oeYield != null ? `%${Math.round(bf.oeYield * 1000) / 10}` : '—'} | Sahip kârı/muhasebe kârı: ${bf.oeQuality != null ? `${bf.oeQuality}×` : '—'} | Net borç/özsermaye: ${bf.debtToEquity != null ? `${bf.debtToEquity}×` : '—'}${fl}`;
  }

  const userMsg = `📊 ${symbol} (${rangeLabel}) — teknik göstergeler:

Fiyat: ${facts.current} ${currency} | Aralık: ${facts.min} → ${facts.max} | Değişim: ${facts.changePct >= 0 ? '+' : ''}${facts.changePct}%
Trend: ${facts.trend} | ADX: ${facts.adx ?? '—'} (${facts.adxZone ?? '—'}) | Volatilite (ATR%): ${facts.atrPct ?? '—'}
SMA20: ${facts.sma20 ?? '—'} | SMA50: ${facts.sma50 ?? '—'} | Fiyat/SMA20: ${facts.priceVsSma20 ?? '—'}
RSI(14): ${facts.rsi ?? '—'} (${facts.rsiZone ?? '—'})
MACD: çizgi ${facts.macdLine ?? '—'}, sinyal ${facts.macdSignal ?? '—'}, histogram ${facts.macdHist ?? '—'}
Bollinger: alt ${facts.bbLower ?? '—'} | orta ${facts.bbMid ?? '—'} | üst ${facts.bbUpper ?? '—'} | konum ${facts.bbPosition ?? '—'}
Pivot (klasik): PP ${facts.pivotPP ?? '—'} | R1 ${facts.pivotR1 ?? '—'} | S1 ${facts.pivotS1 ?? '—'} | R2 ${facts.pivotR2 ?? '—'} | S2 ${facts.pivotS2 ?? '—'} | konum ${facts.pivotZone ?? '—'}
Destek (yakın): ${facts.support ?? '—'} | Direnç (yakın): ${facts.resistance ?? '—'}
Hacim: son/ort ${facts.volRatio ?? '—'}× | OBV akışı: ${facts.obvTrend ?? '—'}
${facts.recentChange7d != null ? `Son 7 periyot: ${facts.recentChange7d >= 0 ? '+' : ''}${facts.recentChange7d}%` : ''}

Taktik gözlemler:
${signalsBlock}${confBlock}${scenBlock}${mtfBlock}${bfBlock}${newsBlock}

Bu verileri akıcı bir teknik analize dök (8-12 cümle).
Yapı: ① tablonun genel hali + uyum skorunun ne dediği ② zaman dilimi uyumu/çatışması ③ YUKARI ve AŞAĞI koşullu senaryoyu tetik + sıradaki seviye + geçersizleşme seviyesiyle birlikte anlat ④ oynaklık aralığının ne anlama geldiği. Haber verildiyse teknik tabloyu haberlerle birlikte, akıcı bir 'teknik + hikaye' anlatısı olarak yorumla (yine tavsiye/tahmin YOK). ADX'in trend gücünü ve pivot konumunu özetle. HER bahsettiğin göstergenin ne anlama geldiğini kısaca açıkla (${name} öğreniyor). Tavsiye YOK, gelecek tahmini YOK.${bf ? `

🧱 BUFFETT KATMANI da verildi — ${isFund ? 'anlatının merkezine BUNU al' : 'analizin sonuna 2-3 cümlelik bir temel analiz paragrafı ekle'}: skorun ne dediği, hangi kriterden kırık aldığı ve o kriterin ne ölçtüğü. Teknik tabloyla temel tablonun aynı yöne mi ters yöne mi baktığını da söyle (ör. teknik güçlü ama iş kalitesi zayıf, ya da tersi) — bu bir tavsiye değil, iki farklı mercekten aynı şirkete bakmaktır.` : ''}`;

  try {
    const r = await aiRun(env, {
      tier: aiTierForUser(env, user, 'heavy'),
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: isFund ? 1400 : (facts.buffett ? 1100 : 900),
      temperature: 0.4,
    });
    let analysis = (r.response || '').trim();
    if (!analysis || /^i'?m sorry|^as an ai|your input/i.test(analysis)) {
      analysis = `${name}, şu an analiz üretemedim. Grafiği ve sayıları yukarıda görebilirsin — yatırım tavsiyesi değildir.`;
    }
    return jsonCors({ analysis, symbol, range: rangeLabel }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// ============================================================
// 📊 Portföy teknik özet — tüm pozisyonların TA snapshot'unu betimleyici özetler
// PWA her hisse için kendi /stock-history + computeStockTA çağırır, sonuçları (facts)
// burada toplar → Gemini'ye verir. Tek hisse /stock-analysis ile aynı no-advice kuralı.
// ============================================================
async function handlePortfolioTechnicalApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || items.length === 0) return jsonCors({ error: 'no items' }, 400, cors);

  let name = 'kanka';
  try {
    const session = await fetchUserDataForApi(env, user);
    name = getUserDisplayName(session.data, user.email);
  } catch {}

  // Her pozisyon için kısa özet satırı yaz — zenginleştirilmiş indikatörlerle
  const lines = items.slice(0, 20).map(it => {
    const sym = String(it.symbol || '').toUpperCase().slice(0, 12);
    const f = it.facts || {};
    const parts = [
      `Fiyat ${f.current ?? '—'} ${f.currency || ''}`.trim(),
      `aralık ${f.changePct >= 0 ? '+' : ''}${f.changePct ?? '—'}%`,
      `trend ${f.trend || '—'}`,
      f.adx != null ? `ADX ${f.adx} (${f.adxZone || '—'})` : null,
      `RSI ${f.rsi ?? '—'} (${f.rsiZone || '—'})`,
      f.sma20 != null && f.sma50 != null ? `SMA20/50 ${f.sma20 > f.sma50 ? '↑' : '↓'}` : null,
      f.macdHist != null ? `MACD hist ${f.macdHist >= 0 ? '+' : ''}${f.macdHist}` : null,
      f.bbPosition ? `BB: ${f.bbPosition}` : null,
      f.pivotZone && f.pivotZone !== '—' ? `Pivot: ${f.pivotZone}` : null,
      f.obvTrend ? `OBV ${f.obvTrend}` : null,
      f.atrPct != null ? `ATR% ${f.atrPct}` : null,
      f.confluence ? `UYUM ${f.confluence.score}/100 (${f.confluence.label}, ${f.confluence.bull}↑/${f.confluence.bear}↓)` : null,
      (f.scenarios && f.scenarios.up) ? `yukarı tetik ${f.scenarios.up.trigger}` : null,
      (f.scenarios && f.scenarios.down) ? `aşağı tetik ${f.scenarios.down.trigger}` : null,
    ].filter(Boolean);
    return `- ${sym} (${it.range || '1mo'}): ${parts.join(' · ')}`;
  }).join('\n');

  const sysPrompt = `Sen Aidan'sın — ${name}'in asistanı. Sana ${name}'in PORTFÖYÜNDEKİ tüm hisselerin teknik göstergeleri (PWA hesapladı) veriliyor. Görevin: SADECE BETİMLEYİCİ Türkçe taktik özet yaz. 4-7 cümle.

✅ İZİN VERİLEN (tarafsız betimleme):
- Portföydeki hisselerin trend dağılımını TARİF et ("3 hisseden 2'si SMA20 üzerinde", "biri aşırı alımda")
- Genel momentum gözlemi (yukarı/yatay/aşağı eğilim hakim mi)
- UYUM SKORU (0-100, 50 nötr) verildiyse portföy genelini onunla özetle: kaç hissede göstergeler aynı yöne bakıyor, portföy tek yöne mi yığılmış (yoğunlaşma riski) yoksa dağılmış mı
- Verilen "tetik" seviyelerini KOŞULLU dille anabilirsin ("X'in üstünde günlük kapanış olursa teknik olarak sıradaki seviye gündeme gelir"); koşulsuz tahmin yine yasak
- Volatilite (ATR) ve hacim karşılaştırması
- En dikkat çeken 1-2 hissenin durumu (sayıyla, betimleyici dil)
- ${name}'e hitap

📚 ÖĞRETİCİ KURAL (${name} göstergeleri öğreniyor):
Geçen göstergeyi ilk kez kullanırken NE ANLAMA GELDİĞİNİ bir kez kısaca açıkla — terimi söyleyip geçme.
Örnek: "ikisi RSI 70 üstünde (RSI 0-100 arası alış/satış baskısını ölçer, 70 üstü 'aşırı alım' yani yakın dönemde alıcı baskın demek)."
Açıklama TANIM düzeyinde — "bu yüzden alınır/yükselir" DEME.

🚫 MUTLAK YASAK:
1. AL / SAT / TUT tavsiyesi (tek tek de, toplu da)
2. Fiyat hedefi / gelecek tahmini
3. "İyi/kötü/riskli/fırsat/ucuz/pahalı/düşük kalmış" değer yargısı
4. Belirli hisseyi övme/kötüleme
5. Sayı uydurma — sadece verileni kullan
6. İngilizce

✅ TON: deneyimli grafik okuyucu + sabırlı öğretmen — gözlüyor, tarif ediyor, terimi öğretiyor, karar vermiyor.
Kapanışta dolgu cümle ya da uyarı yazma — arayüzde zaten var.`;

  const userMsg = `📊 ${name}'in portföyü — hisse hisse teknik snapshot:

${lines}

Bu verileri 4-7 cümlelik tarafsız taktik özete dök. Geçen göstergelerin ne anlama geldiğini kısaca açıkla (${name} öğreniyor). Hangisi alınır/satılır YOK.`;

  try {
    const r = await aiRun(env, {
      tier: aiTierForUser(env, user, 'heavy'),
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 450,
      temperature: 0.4,
    });
    let summary = (r.response || '').trim();
    if (!summary || /^i'?m sorry|^as an ai|your input/i.test(summary)) {
      summary = `${name}, şu an özet üretemedim. Hisselerin teknik göstergelerini yukarıda görebilirsin — yatırım tavsiyesi değildir.`;
    }
    return jsonCors({ summary, count: items.length }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// 🎯 AI "Sen ne yapayım?" — context'ten tek görev önerir (Gemini).
// PWA'dan görev özetleri + energy + saat + bugün biten/pomodoro yollanır.
// Çıktı: {taskId, reason} — kısa Türkçe cümle.
async function handleSuggestApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 40) : [];
  if (!tasks.length) return jsonCors({ error: 'no-tasks' }, 400, cors);

  const energy = ['low', 'mid', 'high'].includes(body.energy) ? body.energy : 'mid';
  const hour = Number.isFinite(body.hour) ? body.hour : new Date().getHours();
  const doneToday = Number.isFinite(body.doneToday) ? body.doneToday : 0;
  const pomoToday = Number.isFinite(body.pomoToday) ? body.pomoToday : 0;

  // User'ın datasından isim çek (PWA settings.displayName)
  let name = 'kanka';
  try {
    const session = await fetchUserDataForApi(env, user);
    name = getUserDisplayName(session.data, user.email);
  } catch {}

  const tod = hour < 11 ? 'sabah' : (hour < 14 ? 'öğle' : (hour < 18 ? 'öğleden sonra' : (hour < 22 ? 'akşam' : 'gece')));
  const energyLabel = energy === 'low' ? '🔋 düşük' : energy === 'high' ? '🚀 yüksek' : '⚡ orta';

  // Görev listesi — id + text + tags (deadline/priority/category/estimate/mit/yaş)
  const taskLines = tasks.map(t => {
    const tags = [];
    if (t.mit) tags.push('⭐MIT');
    if (t.priority === 'urgent') tags.push('🔴ACİL');
    if (t.overdue) tags.push('🚨GECİKTİ');
    else if (t.dueToday) tags.push('📅bugün-son');
    else if (t.dueTomorrow) tags.push('⏳yarın-son');
    if (t.estimateMin) tags.push(`${t.estimateMin}dk`);
    if (t.category) tags.push(t.category);
    if (t.ageDays >= 5) tags.push(`${t.ageDays}gün-bekliyor`);
    return `[id:${t.id}] ${t.text}${tags.length ? ' (' + tags.join(' ') + ')' : ''}`;
  }).join('\n');

  const sysPrompt = `Sen Aidan'sın — ${name}'in ADHD asistanı. Sana görev listesi ve durum veriliyor. Görevin: TEK görev seç + kısa Türkçe sebep.

⚡ ENERJİ AYARI (kritik):
- 🔋 Düşük: KISA görev seç (≤20dk). Acil bile olsa uzun olanı seçme — başlatma eşiği kritik.
- ⚡ Orta: Dengeli — MIT veya 30dk altı tercih et.
- 🚀 Yüksek: ZOR/UZUN/ACİL'e gir. Momentum yakala.

🕐 SAAT FARKINDALIK:
- Sabah/öğle: zihinsel ağırlık OK
- Öğleden sonra: enerji düşüşü — uzun olana dikkat
- Akşam: bitirme/kapanış işleri
- Gece: küçük/sakin (ya da hiçbiri)

🎯 ÖNCELİK SIRASI (genelde):
1. ⭐ MIT
2. 🚨 GECİKTİ
3. 🔴 ACİL
4. 📅 bugün son tarih
5. 5+ gün bekleyen (durağan)
6. ⏳ yarın son tarih
7. Diğer (energy uyumlu)

🚫 YASAK:
- Birden fazla görev seçme
- "Hepsini yap" gibi genel öneri
- Görev bulamadığını söyleme — listede ne varsa içinden seç
- İngilizce
- 25 kelimeden uzun sebep

✅ ÇIKTI FORMATI (KESİN):
SADECE şu JSON: \`{"taskId": <id>, "reason": "<kısa Türkçe sebep>"}\`
HİÇBİR açıklama yok, sadece JSON. Markdown YOK (backtick YOK).

📝 ÖRNEK ÇIKTILAR:
{"taskId": 123, "reason": "MIT'inden bir tane, 25 dakikalık temiz iş — momentumu burdan yakala."}
{"taskId": 456, "reason": "🔋 Düşük enerjide 10 dakikalık küçük kazanç — kolay başlangıç ${name}."}
{"taskId": 789, "reason": "Bu 6 gündür duruyor, bugün küçük bir adım at — ilk 5 dakika yeter."}`;

  const userMsg = `📅 ${tod}, saat ${hour}:00 · enerji: ${energyLabel}
📊 Bugün ${doneToday} görev bitti${pomoToday ? `, ${pomoToday} pomodoro` : ''}
👤 ${name}

📋 Aktif görevler:
${taskLines}

Bunlardan TEK bir tanesini ${name}'e öner. SADECE JSON döndür.`;

  try {
    const r = await aiRun(env, {
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 200,
      temperature: 0.4,
    });
    const raw = typeof r.response === 'string' ? r.response : JSON.stringify(r.response || '');
    // JSON extract — markdown veya açıklama olursa parça parça yakala
    let parsed = null;
    const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
    const m = cleaned.match(/\{[\s\S]*?"taskId"[\s\S]*?\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    if (!parsed || !parsed.taskId) return jsonCors({ error: 'no-suggestion', raw: cleaned.slice(0, 200) }, 200, cors);
    const tid = Number(parsed.taskId);
    if (!Number.isFinite(tid)) return jsonCors({ error: 'bad-id' }, 200, cors);
    // ID listede yok mu kontrolü
    if (!tasks.some(t => t.id === tid)) return jsonCors({ error: 'id-not-in-list', taskId: tid }, 200, cors);
    const reason = String(parsed.reason || '').trim().slice(0, 200) || 'AI öneri';
    return jsonCors({ taskId: tid, reason }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// PWA için public config — Supabase URL + anon key.
// Anon key zaten publishable (RLS koruyor), kod-içine gömmek yerine Worker'dan dönsün ki
// frontend bundle'a düşmeden çekilsin. Auth YOK.
async function handleConfigApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: cors });
  return jsonCors({
    supaUrl: env.SUPABASE_URL,
    supaKey: env.SUPABASE_KEY,
    vapidPublicKey: env.VAPID_PUBLIC_KEY || null,
  }, 200, cors);
}

function genInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // O/0/I/1 confusion'u önle
  let s = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) s += alphabet[bytes[i] % alphabet.length];
  return 'AIDAN-' + s;
}

async function handleInviteCreateApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  // İlk fazda sadece Salim (AIDAN_EMAIL) davet kodu üretebilir.
  // İleride bu kontrolü kaldırıp "her kullanıcı 5 kod üretebilir" gibi limit koyulabilir.
  if (env.AIDAN_EMAIL && user.email.toLowerCase() !== env.AIDAN_EMAIL.toLowerCase()) {
    return jsonCors({ error: 'sadece hesap sahibi davet kodu üretebilir' }, 403, cors);
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const note = (body.note || '').trim().slice(0, 80);

  const code = genInviteCode();
  // INSERT — RLS policy "users create own codes" sayesinde user'ın kendi token'ı ile yazılır
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/invite_codes`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ code, created_by: user.id, note: note || null }),
  });
  if (!r.ok) {
    const msg = await r.text();
    if (msg.includes('invite_codes') && msg.includes('not exist')) {
      return jsonCors({ error: 'invite_codes tablosu yok — Supabase SQL Editor\'da oluştur' }, 503, cors);
    }
    return jsonCors({ error: `kod yazılamadı: ${r.status} ${msg.slice(0, 120)}` }, 500, cors);
  }
  return jsonCors({ code, note: note || null, created_at: new Date().toISOString() }, 200, cors);
}

async function handleInviteListApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: cors });

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);

  // RLS otomatik filtreler — sadece kullanıcının kendi kodları
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/invite_codes?select=code,created_at,used_by,used_at,note&order=created_at.desc&limit=50`,
    { headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${userToken}` } }
  );
  if (!r.ok) {
    const msg = await r.text();
    if (msg.includes('invite_codes') && msg.includes('not exist')) {
      return jsonCors({ codes: [], tableExists: false }, 200, cors);
    }
    return jsonCors({ error: `liste başarısız: ${r.status}` }, 500, cors);
  }
  const codes = await r.json();
  return jsonCors({ codes, tableExists: true }, 200, cors);
}

async function handleSignupApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const code = String(body.code || '').trim().toUpperCase();
  if (!email || !password || !code) return jsonCors({ error: 'email/password/code zorunlu' }, 400, cors);
  if (password.length < 8) return jsonCors({ error: 'şifre en az 8 karakter' }, 400, cors);
  if (!hasServiceKey(env)) {
    return jsonCors({ error: 'Davet kodu doğrulama için service_role key gerekli (henüz kurulmamış)' }, 503, cors);
  }

  // 1) Kodu doğrula — service key ile (RLS bypass) tüm satıra erişim
  const codeRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/invite_codes?code=eq.${encodeURIComponent(code)}&select=code,used_by,created_by`,
    { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  if (!codeRes.ok) {
    const msg = await codeRes.text();
    return jsonCors({ error: `kod doğrulama başarısız: ${codeRes.status} ${msg.slice(0, 120)}` }, 500, cors);
  }
  const codeRows = await codeRes.json();
  if (!codeRows.length) return jsonCors({ error: 'davet kodu geçersiz' }, 400, cors);
  if (codeRows[0].used_by) return jsonCors({ error: 'bu davet kodu zaten kullanılmış' }, 400, cors);

  // 2) Supabase auth.signUp
  const su = await fetch(`${env.SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const suBody = await su.json().catch(() => ({}));
  if (!su.ok) {
    const errMsg = (suBody && (suBody.msg || suBody.error_description || suBody.error)) || `signup ${su.status}`;
    return jsonCors({ error: errMsg }, su.status, cors);
  }
  const newUserId = suBody.user?.id || suBody.id;
  if (!newUserId) return jsonCors({ error: 'signup başarılı ama user.id alınamadı' }, 500, cors);

  // 3) Kodu used işaretle (service key — RLS bypass)
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/invite_codes?code=eq.${encodeURIComponent(code)}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ used_by: newUserId, used_at: new Date().toISOString() }),
    }
  ).catch(e => console.error('used işaretleme hatası', e.message));

  return jsonCors({
    ok: true,
    user: suBody.user || { id: newUserId, email },
    session: suBody.session || null, // confirm-email kapalıysa session gelir, açıksa null
    needsEmailConfirm: !suBody.session,
  }, 200, cors);
}

// ============================================================
// Portföy görseli → AI (Cloudflare Workers AI vision modeli)
// Kullanıcı aracı kurum uygulamasının portföy ekranının fotoğrafını atar,
// vision modeli sembol + adet + ortalama maliyet + piyasayı okur, JSON döner.
// ============================================================
// Vision artik Gemini multimodal uzerinden (visionRun -> aiRun). Ayri model sabiti yok.

// base64 string → byte array (vision modeli image: number[] bekler)
function base64ToBytes(b64) {
  const clean = String(b64 || '').replace(/^data:image\/\w+;base64,/, '');
  const bin = atob(clean);
  const bytes = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Sayı parse — hem number hem Türk formatlı string ("1.250,75" / "280,50" / "2.145") güvenli çevrilir.
// NOT: model sayıları STRING ham haliyle döndürür (prompt'ta isteniyor) ki binlik/ondalık bilgisi
// kaybolmasın — number'a çevirseydi "2.145,00" → 2.145 olur, binlik ayracı ondalık sanılırdı.
function parseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',')) {
    // Virgül var → ondalık virgül (Türk format). Noktalar binlik ayracı → sil.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes('.')) {
    // Virgül yok, nokta var → binlik mi ondalık mı belirsiz.
    // Tüm nokta-gruplarının sonrası 3 hane ise binlik ayracı say (1.280 → 1280, 29.700 → 29700).
    // Aksi halde ondalık nokta bırak (280.5 → 280.5).
    const parts = s.split('.');
    const allGroupsThree = parts.slice(1).every(p => p.length === 3);
    if (parts.length > 1 && allGroupsThree && parts[0].length <= 3) {
      s = parts.join('');
    }
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

// Vision modelin metin cevabından JSON dizisini ayıkla (markdown/çer-çöp toleranslı)
function extractHoldingsJson(text) {
  if (!text) return [];
  let s = String(text).trim();
  // ```json ... ``` bloklarını temizle
  s = s.replace(/```json/gi, '').replace(/```/g, '').trim();
  // İlk [ ... ] dizisini yakala
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  let arr;
  try { arr = JSON.parse(s.slice(start, end + 1)); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const validMarkets = ['bist', 'abd', 'fx', 'crypto'];
  const out = [];
  for (const h of arr) {
    if (!h || typeof h !== 'object') continue;
    const symbol = String(h.symbol || h.sembol || '').trim().toUpperCase().replace(/[^A-Z0-9.=-]/g, '');
    if (!symbol) continue;
    const qty = parseNum(h.qty != null ? h.qty : h.adet);
    const cost = parseNum(h.cost != null ? h.cost : h.maliyet);
    const price = parseNum(h.price != null ? h.price : (h.son != null ? h.son : h.guncel));
    let market = String(h.market || '').toLowerCase().trim();
    if (!validMarkets.includes(market)) market = 'bist';
    out.push({
      symbol,
      qty: (qty != null && isFinite(qty) && qty > 0) ? qty : null,
      cost: (cost != null && isFinite(cost) && cost > 0) ? cost : null,
      price: (price != null && isFinite(price) && price > 0) ? price : null,
      market,
    });
  }
  return out.slice(0, 40);
}

async function handlePortfolioImageApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const image = body.image;
  if (!image) return jsonCors({ error: 'image yok' }, 400, cors);
  // Kaba boyut sınırı (~6MB base64) — vision modeli ve istek limiti için
  if (String(image).length > 8_000_000) return jsonCors({ error: 'görsel çok büyük' }, 413, cors);

  // Auth — hesap sahibi
  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) {
    return jsonCors({ error: 'forbidden' }, 403, cors);
  }

  let bytes;
  try { bytes = base64ToBytes(image); } catch { return jsonCors({ error: 'görsel okunamadı' }, 400, cors); }
  if (!bytes.length) return jsonCors({ error: 'boş görsel' }, 400, cors);

  const prompt = [
    'Bu bir borsa/yatırım uygulamasının portföy ekran görüntüsü.',
    'Görseldeki TÜM satırları, baştan sona, HİÇBİRİNİ ATLAMADAN oku. Her hisse/varlık satırı için:',
    '- symbol: hisse/varlık kodu (örn THYAO, AAPL, BTC). Büyük harf.',
    '- qty: elindeki ADET/LOT sayısı. "Adet", "Lot", "Miktar" sütunu. Yoksa null.',
    '- cost: lot başı ORTALAMA ALIŞ MALİYETİ (birim fiyat). "Maliyet" veya "Ort. Maliyet" sütunu.',
    '  ÖNEMLİ: cost güncel/anlık fiyat DEĞİL, toplam tutar da DEĞİL — birim alış maliyeti. Yoksa null.',
    '- price: GÜNCEL/SON birim fiyat. "Son", "Güncel", "Anlık" fiyat sütunu (maliyetten farklı). Yoksa null.',
    '- market: "bist" (Türk hissesi), "abd" (ABD hissesi), "fx" (döviz), "crypto" (kripto). Emin değilsen "bist".',
    '',
    'SAYILARI GÖRSELDEKİ HALİYLE, STRING olarak yaz — değiştirme, yuvarlamadan.',
    '  Görselde "2.145,00" yazıyorsa cost:"2.145,00" yaz. "95,20" → cost:"95,20". "100" → qty:"100".',
    '  Sayıyı number\'a çevirme, binlik/ondalık ayracını OLDUĞU GİBİ bırak. Çözümünü ben yapacağım.',
    '',
    'SADECE geçerli bir JSON dizisi döndür, başka hiçbir açıklama/metin yazma. Örnek:',
    '[{"symbol":"THYAO","qty":"100","cost":"1.280,50","price":"1.297,00","market":"bist"},{"symbol":"GARAN","qty":"50","cost":"95,20","price":"102,40","market":"bist"}]',
    'Hiç varlık göremezsen [] döndür.',
  ].join('\n');

  let lastRaw = '';
  let debug = '';
  let lastErr = '';
  try {
    const r = await visionRun(env, { image: bytes, prompt, max_tokens: 1024 });
    // r.response bazen string, bazen obje/dizi olabilir — düzgün string'e çevir
    const rr = r && (r.response != null ? r.response : (r.description != null ? r.description : r.text));
    lastRaw = (typeof rr === 'string') ? rr : JSON.stringify(rr);
    debug = (typeof r === 'object') ? JSON.stringify(r).slice(0, 700) : String(r).slice(0, 700);
    const holdings = extractHoldingsJson(lastRaw);
    if (holdings.length) return jsonCors({ holdings }, 200, cors);
  } catch (e) {
    lastErr = e.message;
  }
  // Hisse bulunamadı — debug için ham cevabı/hatayı geri yolla
  return jsonCors({
    holdings: [],
    raw: String(lastRaw || '').slice(0, 400),
    debug: debug || undefined,
    aiError: lastErr || undefined,
  }, 200, cors);
}

// Diyet programı görselinden öğün/yemek listesi çıkar (markdown/çer-çöp toleranslı)
function extractDietPlanJson(text) {
  if (!text) return [];
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const arr = s.match(/\[[\s\S]*\]/);
  if (arr) s = arr[0];
  let parsed;
  try { parsed = JSON.parse(s); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const SLOTS = { kahvalti: 'kahvalti', ogle: 'ogle', 'öğle': 'ogle', aksam: 'aksam', 'akşam': 'aksam', atistirma: 'atistirma', 'atıştırma': 'atistirma', ara: 'atistirma' };
  const out = [];
  for (const it of parsed) {
    if (!it || typeof it !== 'object') continue;
    const name = String(it.name || it.yemek || '').trim();
    if (!name || name.length > 120) continue;
    let slot = String(it.slot || it.ogun || '').toLowerCase().trim();
    slot = SLOTS[slot] || 'ogle';
    let kcal = null;
    if (it.kcal != null && it.kcal !== '') {
      const n = parseInt(String(it.kcal).replace(/[^\d]/g, ''), 10);
      if (!isNaN(n) && n >= 0 && n < 5000) kcal = n;
    }
    out.push({ slot, name, kcal });
    if (out.length >= 60) break;
  }
  return out;
}

// 🎓 Google Classroom ödev listesi görseli → ödev başlığı + son teslim tarihi çıkar.
// İki aşama: (1) vision OCR transkript, (2) 70B metin modeli ödevleri + tarihleri yapılandırır.
// Tarih çözümü: bugünün tarihi prompt'a verilir → "Yarın/Cuma/12 Tem" → tam YYYY-MM-DD.
async function handleClassroomImageApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const image = body.image;
  if (!image) return jsonCors({ error: 'image yok' }, 400, cors);
  if (String(image).length > 8_000_000) return jsonCors({ error: 'görsel çok büyük' }, 413, cors);

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  let bytes;
  try { bytes = base64ToBytes(image); } catch { return jsonCors({ error: 'görsel okunamadı' }, 400, cors); }
  if (!bytes.length) return jsonCors({ error: 'boş görsel' }, 400, cors);

  // Aşama 1: OCR transkript
  const ocrPrompt = [
    'Bu bir Google Classroom ekran görüntüsü (ödev/yapılacaklar listesi veya sınıf akışı).',
    'Görseldeki TÜM yazıyı satır satır, gördüğün gibi AYNEN yaz.',
    'Özellikle şunları koru: ödev/görev başlıkları, ders veya sınıf adları, son teslim ifadeleri',
    "('Son teslim tarihi', 'Bugün', 'Yarın', gün adı, tarih, saat).",
    'Hiçbir şey ekleme, yorumlama, özetleme. Sadece görünen metin.',
  ].join('\n');

  const today = trDate(0), todayName = trDayName(0);

  let transcript = '', lastRaw = '', lastErr = '';
  try {
    const v = await visionRun(env, { image: bytes, prompt: ocrPrompt, max_tokens: 1500 });
    const vr = v && (v.response != null ? v.response : (v.description != null ? v.description : v.text));
    transcript = (typeof vr === 'string') ? vr : JSON.stringify(vr);
  } catch (e) { lastErr = 'ocr: ' + e.message; }

  // Aşama 2: ödevleri + tam tarihleri yapılandır
  let items = [];
  if (transcript && transcript.trim()) {
    const sys = [
      'Sana bir Google Classroom ekranının ham metin transkripti verilecek. İçindeki ÖDEVLERİ / verilen görevleri çıkar.',
      'Her ödev için bir JSON nesnesi üret:',
      '- title: ödevin adı, kısa ve temiz (örn "Tarih 5. ünite özet"). Zorunlu.',
      "- due: son teslim tarihi 'YYYY-MM-DD' biçiminde. Transkriptte 'Bugün', 'Yarın', gün adı (Pazartesi..), '12 Tem', '12 Temmuz' gibi görebilirsin — AŞAĞIDAKİ bugünün tarihine göre TAM tarihe çevir. Tarih hiç yoksa null.",
      '- course: ders/sınıf adı varsa yaz, yoksa null.',
      'Duyuru, yorum, materyal gibi ödev OLMAYAN satırları ATLA — sadece teslim edilecek ödev/görevler.',
      `Bugünün tarihi: ${today} (${todayName}).`,
      'SADECE geçerli bir JSON dizisi döndür, başka metin yazma. Ödev yoksa [].',
    ].join('\n');
    try {
      const r = await aiRun(env, {
        messages: [{ role: 'system', content: sys }, { role: 'user', content: String(transcript).slice(0, 6000) }],
        max_tokens: 1024, temperature: 0.1,
      });
      lastRaw = (typeof r.response === 'string') ? r.response : JSON.stringify(r.response || '');
      items = extractClassroomJson(lastRaw);
    } catch (e) { lastErr = (lastErr ? lastErr + ' | ' : '') + 'struct: ' + e.message; }
  }

  if (items.length) return jsonCors({ items, transcript: String(transcript).slice(0, 600) || undefined }, 200, cors);
  return jsonCors({ items: [], transcript: String(transcript).slice(0, 600) || undefined, raw: String(lastRaw || '').slice(0, 400), aiError: lastErr || undefined }, 200, cors);
}

// Classroom ödev JSON ayıkla — {title, due, course}. due YYYY-MM-DD değilse null'a düşürülür.
function extractClassroomJson(text) {
  if (!text) return [];
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const arr = s.match(/\[[\s\S]*\]/);
  if (arr) s = arr[0];
  let parsed;
  try { parsed = JSON.parse(s); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  for (const it of parsed) {
    if (!it || typeof it !== 'object') continue;
    const title = String(it.title || it.ad || it.name || '').trim();
    if (!title || title.length > 140) continue;
    let due = String(it.due || it.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) due = null;
    let course = String(it.course || it.ders || '').trim();
    if (!course || course.length > 60) course = null;
    out.push({ title, due, course });
    if (out.length >= 40) break;
  }
  return out;
}

async function handleDietPlanImageApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const image = body.image;
  if (!image) return jsonCors({ error: 'image yok' }, 400, cors);
  if (String(image).length > 8_000_000) return jsonCors({ error: 'görsel çok büyük' }, 413, cors);

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  let bytes;
  try { bytes = base64ToBytes(image); } catch { return jsonCors({ error: 'görsel okunamadı' }, 400, cors); }
  if (!bytes.length) return jsonCors({ error: 'boş görsel' }, 400, cors);

  // --- Aşama 1: Vision modeli SADECE transkript (OCR) — küçük model yapılandırmaya değil okumaya odaklanır ---
  const ocrPrompt = [
    'Bu bir diyetisyen/beslenme programının görüntüsü (kağıt, ekran ya da PDF).',
    'Görseldeki TÜM yazıyı satır satır, gördüğün gibi AYNEN yaz.',
    'Öğün başlıklarını (Kahvaltı, Ara öğün, Öğle, İkindi, Akşam vb.) ve altlarındaki yemek/içecek satırlarını koru.',
    'Hiçbir şey ekleme, yorumlama, özetleme. Sadece görünen metin.',
  ].join('\n');

  // --- Fallback (iki-aşama boş dönerse) için eski tek-aşama prompt ---
  const directPrompt = [
    'Bu bir diyetisyen/beslenme programının fotoğrafı (kağıt, ekran veya PDF görüntüsü).',
    'Programdaki TÜM yemekleri, HİÇBİRİNİ ATLAMADAN oku. Her yemek/içecek satırı için bir nesne üret:',
    '- name: yemeğin adı + miktarı (örn "2 yumurta", "1 dilim tam buğday ekmeği"). Görseldeki haliyle.',
    '- slot: "kahvalti" | "ogle" | "aksam" | "atistirma". Emin değilsen "atistirma".',
    '- kcal: kalori yazıyorsa SAYI, yoksa null.',
    'SADECE geçerli bir JSON dizisi döndür, başka açıklama yazma. Hiç yemek yoksa [].',
  ].join('\n');

  let transcript = '', lastRaw = '', debug = '', lastErr = '';

  // Aşama 1: OCR transkript
  try {
    const v = await visionRun(env, { image: bytes, prompt: ocrPrompt, max_tokens: 1500 });
    const vr = v && (v.response != null ? v.response : (v.description != null ? v.description : v.text));
    transcript = (typeof vr === 'string') ? vr : JSON.stringify(vr);
  } catch (e) { lastErr = 'ocr: ' + e.message; }

  // Aşama 2: 70B metin modeli transkripti öğünlere bölüp JSON üretir (asıl doğruluk burada)
  let items = [];
  if (transcript && transcript.trim()) {
    const sys = [
      'Sana bir diyet programının ham metin transkripti verilecek. Bunu öğünlere böl.',
      'Her yemek/içecek satırı için bir JSON nesnesi üret:',
      '- name: yemeğin adı + miktarı, transkriptteki haliyle (örn "2 yumurta", "1 dilim tam buğday ekmeği").',
      '- slot: "kahvalti" | "ogle" | "aksam" | "atistirma". Sabah=kahvalti, öğlen=ogle, akşam=aksam, ara öğün/kuşluk/ikindi=atistirma. Başlıklara göre karar ver. Emin değilsen "atistirma".',
      '- kcal: kalori yazıyorsa sayı, yoksa null.',
      'SADECE geçerli bir JSON dizisi döndür, başka metin yazma. Yemek yoksa [].',
    ].join('\n');
    try {
      const r = await aiRun(env, {
        messages: [{ role: 'system', content: sys }, { role: 'user', content: String(transcript).slice(0, 6000) }],
        max_tokens: 1024, temperature: 0.1,
      });
      lastRaw = (typeof r.response === 'string') ? r.response : JSON.stringify(r.response || '');
      items = extractDietPlanJson(lastRaw);
    } catch (e) { lastErr = (lastErr ? lastErr + ' | ' : '') + 'struct: ' + e.message; }
  }

  // Fallback: iki-aşama boş döndüyse eski tek-aşama (vision direkt JSON)
  if (!items.length) {
    try {
      const r = await visionRun(env, { image: bytes, prompt: directPrompt, max_tokens: 1024 });
      const rr = r && (r.response != null ? r.response : (r.description != null ? r.description : r.text));
      const raw = (typeof rr === 'string') ? rr : JSON.stringify(rr);
      debug = (typeof r === 'object') ? JSON.stringify(r).slice(0, 700) : String(r).slice(0, 700);
      const di = extractDietPlanJson(raw);
      if (di.length) { items = di; lastRaw = raw; }
      else if (!lastRaw) lastRaw = raw;
    } catch (e) { lastErr = (lastErr ? lastErr + ' | ' : '') + 'direct: ' + e.message; }
  }

  if (items.length) return jsonCors({ items, transcript: String(transcript).slice(0, 600) || undefined }, 200, cors);
  return jsonCors({ items: [], transcript: String(transcript).slice(0, 600) || undefined, raw: String(lastRaw || '').slice(0, 400), debug: debug || undefined, aiError: lastErr || undefined }, 200, cors);
}

// Besin makro JSON ayıkla (Gemini'den {en, grams, ai:{...}} bekler)
function parseMacroJson(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/```(?:json)?/gi, '').trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o; try { o = JSON.parse(m[0]); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const en = String(o.en || '').trim().slice(0, 80);
  let grams = Number(o.grams);
  if (!isFinite(grams) || grams <= 0 || grams > 5000) grams = 100;
  const ai = (o.ai && typeof o.ai === 'object') ? o.ai : {};
  const num = v => { const n = Number(v); return (isFinite(n) && n >= 0 && n < 10000) ? Math.round(n) : null; };
  return { en, grams: Math.round(grams), ai: { kcal: num(ai.kcal), protein: num(ai.protein), carb: num(ai.carb), fat: num(ai.fat) } };
}

// Çoklu yemek: AI'dan {items:[{name,en,grams,kcal,protein,carb,fat}]} bekler (bare obje/dizi de tolere edilir)
function parseMealItemsJson(raw) {
  if (!raw) return [];
  let s = String(raw).replace(/```(?:json)?/gi, '').trim();
  let o = null;
  try { o = JSON.parse(s); } catch (_) {}
  if (o == null) { const a = s.match(/\[[\s\S]*\]/); if (a) { try { o = JSON.parse(a[0]); } catch (_) {} } }
  if (o == null) { const m = s.match(/\{[\s\S]*\}/); if (m) { try { o = JSON.parse(m[0]); } catch (_) {} } }
  if (o == null) return [];
  let arr;
  if (Array.isArray(o)) arr = o;
  else if (o && Array.isArray(o.items)) arr = o.items;
  else if (o && (o.name || o.en || o.kcal != null)) arr = [o];
  else return [];
  const num = v => { const n = Number(v); return (isFinite(n) && n >= 0 && n < 20000) ? Math.round(n * 10) / 10 : null; };
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const name = String(it.name || it.en || '').trim().slice(0, 60);
    const en = String(it.en || it.name || '').trim().slice(0, 80);
    if (!name && !en) continue;
    let grams = Number(it.grams);
    if (!isFinite(grams) || grams <= 0 || grams > 5000) grams = 100;
    out.push({ name: name || en, en, grams: Math.round(grams), kcal: num(it.kcal), protein: num(it.protein), carb: num(it.carb), fat: num(it.fat) });
    if (out.length >= 12) break;
  }
  return out;
}

// USDA FoodData Central — İngilizce besin adı → 100g makroları, porsiyona ölçekle. Key yoksa null.
// Tek sonuç yerine ilk 10 adayı çeker; ada uyum + çiğ/pişmiş + kcal-makro tutarlılığına
// göre en iyi adayı seçer (pageSize=1 yanlış eşleşmesini azaltır).
async function usdaLookup(env, enName, grams) {
  const key = env.USDA_API_KEY;
  if (!key || !enName) return null;
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(enName)}&pageSize=10&dataType=Foundation,SR%20Legacy`;
  let r;
  try { r = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } }); } catch { return null; }
  if (!r.ok) return null;
  let j; try { j = await r.json(); } catch { return null; }
  const foods = (j && j.foods) || [];
  if (!foods.length) return null;
  const macrosOf = food => {
    const ns = food.foodNutrients || [];
    const get = (num, nameRe) => {
      let n = ns.find(x => String(x.nutrientNumber) === num);
      if (!n && nameRe) n = ns.find(x => nameRe.test(String(x.nutrientName || '')));
      return n && typeof n.value === 'number' ? n.value : null;
    };
    return { kcal: get('208', /energy/i), protein: get('203', /protein/i), fat: get('204', /total lipid|fat/i), carb: get('205', /carbohydrate/i) };
  };
  const ql = String(enName).toLowerCase();
  const qWords = ql.split(/[^a-z]+/).filter(w => w.length > 2);
  const wantRaw = /(^|\s)raw(\s|$)/.test(ql);
  const wantCooked = /(cooked|roasted|boiled|grilled|baked|fried)/.test(ql);
  let best = null, bestScore = -Infinity;
  foods.forEach((food, idx) => {
    const m = macrosOf(food);
    if (m.kcal == null && m.protein == null) return;
    const desc = String(food.description || '').toLowerCase();
    let wordHits = 0;
    for (const w of qWords) if (desc.includes(w)) wordHits++;                 // ad kelime örtüşmesi
    let score = wordHits * 2;
    const descCooked = /(cooked|roasted|boiled|grilled|baked|fried)/.test(desc);
    const descRaw = /(^|,|\s)raw(\s|,|$)/.test(desc);
    if (wantRaw) score += descRaw ? 1.5 : (descCooked ? -1.5 : 0);            // çiğ istendiyse çiğ tercih
    if (wantCooked) score += descCooked ? 1.5 : (descRaw ? -1.5 : 0);         // pişmiş istendiyse pişmiş tercih
    if (m.kcal != null && m.kcal > 0) {                                       // Atwater tutarlılığı bonusu
      const at = 4 * (m.protein || 0) + 4 * (m.carb || 0) + 9 * (m.fat || 0);
      if (Math.abs(m.kcal - at) / m.kcal < 0.15) score += 1;
    }
    score += Math.max(0, 3 - idx) * 0.1;                                      // USDA alaka sırasına hafif ağırlık
    if (score > bestScore) { bestScore = score; best = { food, m, wordHits }; }
  });
  if (!best) return null;
  // KALKAN: kazanan aday sorgu kelimelerinden HİÇBİRİNİ içermiyorsa (yalnız sıra
  // tiebreak'iyle kazandıysa) güvenilmez eşleşme — reddet, çağıran AI/OFF'a düşsün.
  // (örn 'quark' USDA'da yoksa yağlı peynir dönmez.)
  if (qWords.length && best.wordHits === 0) return null;
  const f = (grams || 100) / 100;
  const sc = v => v == null ? null : Math.round(v * f);
  return { name: best.food.description || enName, kcal: sc(best.m.kcal), protein: sc(best.m.protein), carb: sc(best.m.carb), fat: sc(best.m.fat) };
}

// Curated yaygın Türk/temel besinler — PER 100g. USDA bunların çoğunu (simit, tavuk
// göğsü, beyaz peynir, pilav...) yanlış eşler; bunlar için USDA'dan ÖNCE buna bakılır.
// k=anahtar adlar (AI'nın döndürdüğü Türkçe ada göre eşleşir), per-100g: kcal/p/c/f.
const TR_FOOD_DB = [
  { k: ['tavuk göğsü', 'tavuk gögsü', 'tavuk göğüs', 'ızgara tavuk', 'tavuk ızgara'], kcal: 165, p: 31, c: 0, f: 4 },
  { k: ['tavuk but', 'tavuk baget', 'tavuk pirzola'], kcal: 209, p: 26, c: 0, f: 11 },
  { k: ['tavuk şiş', 'tavuk şinitzel', 'tavuk şnitzel'], kcal: 190, p: 28, c: 4, f: 7 },
  { k: ['tavuk döner'], kcal: 200, p: 22, c: 4, f: 10 },
  { k: ['tavuk çorbası'], kcal: 55, p: 4, c: 6, f: 2 },
  { k: ['hindi'], kcal: 189, p: 29, c: 0, f: 7 },
  { k: ['dana bonfile', 'bonfile', 'biftek', 'dana rosto'], kcal: 150, p: 25, c: 0, f: 6 },
  { k: ['dana kıyma', 'kıyma'], kcal: 250, p: 26, c: 0, f: 16 },
  { k: ['kuzu pirzola', 'kuzu'], kcal: 282, p: 25, c: 0, f: 20 },
  { k: ['kavurma'], kcal: 280, p: 28, c: 1, f: 19 },
  { k: ['köfte', 'izgara köfte', 'ızgara köfte'], kcal: 240, p: 18, c: 5, f: 16 },
  { k: ['et döner', 'döner'], kcal: 290, p: 20, c: 3, f: 22 },
  { k: ['adana kebap', 'urfa kebap', 'kebap'], kcal: 270, p: 18, c: 3, f: 21 },
  { k: ['şiş kebap', 'şiş'], kcal: 210, p: 27, c: 2, f: 11 },
  { k: ['sucuk'], kcal: 320, p: 18, c: 2, f: 26 },
  { k: ['sosis'], kcal: 290, p: 12, c: 3, f: 25 },
  { k: ['salam'], kcal: 250, p: 14, c: 2, f: 20 },
  { k: ['pastırma'], kcal: 240, p: 35, c: 1, f: 10 },
  { k: ['somon'], kcal: 208, p: 20, c: 0, f: 13 },
  { k: ['levrek', 'çupra', 'çipura'], kcal: 110, p: 20, c: 0, f: 3 },
  { k: ['hamsi'], kcal: 130, p: 20, c: 0, f: 5 },
  { k: ['ton balığı', 'ton balik'], kcal: 116, p: 26, c: 0, f: 1 },
  { k: ['simit'], kcal: 320, p: 9, c: 56, f: 5 },
  { k: ['poğaça'], kcal: 350, p: 7, c: 40, f: 18 },
  { k: ['açma'], kcal: 330, p: 8, c: 44, f: 14 },
  { k: ['börek', 'su böreği', 'sigara böreği'], kcal: 290, p: 8, c: 28, f: 16 },
  { k: ['gözleme'], kcal: 270, p: 9, c: 35, f: 11 },
  { k: ['tost'], kcal: 290, p: 13, c: 30, f: 13 },
  { k: ['menemen'], kcal: 130, p: 7, c: 5, f: 9 },
  { k: ['ekmek', 'beyaz ekmek'], kcal: 265, p: 9, c: 49, f: 3 },
  { k: ['tam buğday ekmek', 'kepekli ekmek', 'tam tahıl ekmek'], kcal: 247, p: 13, c: 41, f: 3 },
  { k: ['pilav', 'pişmiş pirinç', 'pirinç pilavı'], kcal: 165, p: 3, c: 32, f: 3 },
  { k: ['bulgur pilavı', 'bulgur', 'pişmiş bulgur'], kcal: 145, p: 4, c: 29, f: 2 },
  { k: ['pirinç', 'çiğ pirinç'], kcal: 360, p: 7, c: 80, f: 1 },
  { k: ['makarna', 'pişmiş makarna', 'spagetti'], kcal: 158, p: 6, c: 31, f: 1 },
  { k: ['kremalı makarna'], kcal: 230, p: 7, c: 28, f: 10 },
  { k: ['mantı'], kcal: 215, p: 9, c: 30, f: 7 },
  { k: ['erişte'], kcal: 200, p: 7, c: 36, f: 3 },
  { k: ['mercimek çorbası', 'mercimek çorba'], kcal: 60, p: 3, c: 9, f: 2 },
  { k: ['ezogelin çorbası', 'ezogelin'], kcal: 65, p: 3, c: 10, f: 2 },
  { k: ['domates çorbası'], kcal: 55, p: 2, c: 8, f: 2 },
  { k: ['yayla çorbası', 'yayla çorba'], kcal: 60, p: 3, c: 7, f: 3 },
  { k: ['çorba'], kcal: 50, p: 2, c: 7, f: 2 },
  { k: ['nohut', 'etli nohut', 'nohut yemeği'], kcal: 160, p: 9, c: 25, f: 3 },
  { k: ['kuru fasulye', 'etli kuru fasulye'], kcal: 140, p: 8, c: 22, f: 3 },
  { k: ['mercimek yemeği', 'mercimek'], kcal: 116, p: 9, c: 20, f: 0 },
  { k: ['zeytinyağlı fasulye', 'taze fasulye'], kcal: 90, p: 2, c: 9, f: 5 },
  { k: ['karnıyarık', 'patlıcan musakka', 'musakka'], kcal: 130, p: 5, c: 9, f: 8 },
  { k: ['imambayıldı', 'i̇mambayıldı'], kcal: 120, p: 2, c: 11, f: 8 },
  { k: ['yaprak sarma', 'sarma', 'dolma', 'biber dolması'], kcal: 150, p: 3, c: 20, f: 6 },
  { k: ['yumurta', 'haşlanmış yumurta', 'omlet'], kcal: 150, p: 13, c: 1, f: 10 },
  { k: ['sucuklu yumurta'], kcal: 220, p: 14, c: 2, f: 17 },
  { k: ['beyaz peynir', 'peynir'], kcal: 265, p: 14, c: 4, f: 21 },
  { k: ['kaşar peyniri', 'kaşar', 'kasar'], kcal: 380, p: 25, c: 2, f: 30 },
  { k: ['lor peyniri', 'lor'], kcal: 100, p: 14, c: 4, f: 3 },
  { k: ['labne'], kcal: 250, p: 6, c: 4, f: 23 },
  { k: ['quark', 'sek quark', 'düz quark', 'süzme quark'], kcal: 97, p: 8.5, c: 4.5, f: 5 },        // düz Sek Quark (ambalaj, 100g)
  { k: ['sek protein quark', 'protein quark'], kcal: 83, p: 12, c: 4, f: 2 },                        // Sek Protein Quark (OFF ambalaj, 100g)
  { k: ['yoğurt', 'yogurt'], kcal: 61, p: 4, c: 5, f: 3 },
  { k: ['süzme yoğurt'], kcal: 130, p: 10, c: 4, f: 8 },
  { k: ['ayran'], kcal: 38, p: 2, c: 3, f: 2 },
  { k: ['süt'], kcal: 64, p: 3, c: 5, f: 4 },
  { k: ['tereyağı', 'tereyağ'], kcal: 717, p: 1, c: 0, f: 81 },
  { k: ['zeytinyağı', 'zeytinyağ'], kcal: 884, p: 0, c: 0, f: 100 },
  { k: ['ayçiçek yağı', 'sıvı yağ'], kcal: 884, p: 0, c: 0, f: 100 },
  { k: ['bal'], kcal: 304, p: 0, c: 82, f: 0 },
  { k: ['reçel'], kcal: 250, p: 0, c: 65, f: 0 },
  { k: ['pekmez'], kcal: 290, p: 1, c: 73, f: 0 },
  { k: ['tahin'], kcal: 595, p: 17, c: 21, f: 54 },
  { k: ['zeytin', 'siyah zeytin', 'yeşil zeytin'], kcal: 150, p: 1, c: 4, f: 15 },
  { k: ['patates kızartması'], kcal: 312, p: 3, c: 41, f: 15 },
  { k: ['haşlanmış patates', 'patates'], kcal: 87, p: 2, c: 20, f: 0 },
  { k: ['avokado'], kcal: 160, p: 2, c: 9, f: 15 },
  { k: ['muz'], kcal: 89, p: 1, c: 23, f: 0 },
  { k: ['elma'], kcal: 52, p: 0, c: 14, f: 0 },
  { k: ['portakal'], kcal: 47, p: 1, c: 12, f: 0 },
  { k: ['mandalina'], kcal: 53, p: 1, c: 13, f: 0 },
  { k: ['armut'], kcal: 57, p: 0, c: 15, f: 0 },
  { k: ['üzüm'], kcal: 69, p: 1, c: 18, f: 0 },
  { k: ['çilek'], kcal: 32, p: 1, c: 8, f: 0 },
  { k: ['karpuz'], kcal: 30, p: 1, c: 8, f: 0 },
  { k: ['kavun'], kcal: 34, p: 1, c: 8, f: 0 },
  { k: ['kiraz'], kcal: 63, p: 1, c: 16, f: 0 },
  { k: ['şeftali'], kcal: 39, p: 1, c: 10, f: 0 },
  { k: ['nar'], kcal: 83, p: 2, c: 19, f: 1 },
  { k: ['kivi'], kcal: 61, p: 1, c: 15, f: 1 },
  { k: ['fındık'], kcal: 628, p: 15, c: 17, f: 61 },
  { k: ['badem'], kcal: 579, p: 21, c: 22, f: 50 },
  { k: ['ceviz'], kcal: 654, p: 15, c: 14, f: 65 },
  { k: ['antep fıstığı', 'fıstık'], kcal: 562, p: 20, c: 28, f: 45 },
  { k: ['yer fıstığı'], kcal: 567, p: 26, c: 16, f: 49 },
  { k: ['leblebi'], kcal: 364, p: 21, c: 61, f: 6 },
  { k: ['kuru üzüm'], kcal: 299, p: 3, c: 79, f: 0 },
  { k: ['kuru kayısı'], kcal: 241, p: 3, c: 63, f: 0 },
  { k: ['hurma'], kcal: 282, p: 2, c: 75, f: 0 },
  { k: ['baklava'], kcal: 430, p: 6, c: 50, f: 24 },
  { k: ['künefe'], kcal: 320, p: 7, c: 38, f: 16 },
  { k: ['sütlaç'], kcal: 140, p: 4, c: 25, f: 3 },
  { k: ['kazandibi'], kcal: 160, p: 4, c: 28, f: 4 },
  { k: ['dondurma'], kcal: 207, p: 4, c: 24, f: 11 },
  { k: ['kek'], kcal: 350, p: 5, c: 50, f: 14 },
  { k: ['kurabiye', 'bisküvi'], kcal: 480, p: 6, c: 64, f: 22 },
  { k: ['lokum'], kcal: 330, p: 0, c: 83, f: 0 },
  { k: ['helva', 'tahin helva'], kcal: 520, p: 12, c: 50, f: 30 },
  { k: ['çikolata'], kcal: 535, p: 8, c: 59, f: 30 },
  { k: ['cips'], kcal: 536, p: 7, c: 53, f: 34 },
  { k: ['patlamış mısır'], kcal: 387, p: 12, c: 78, f: 4 },
  { k: ['lahmacun'], kcal: 230, p: 10, c: 30, f: 8 },
  { k: ['pizza'], kcal: 266, p: 11, c: 33, f: 10 },
  { k: ['hamburger'], kcal: 295, p: 17, c: 24, f: 14 },
  { k: ['kıymalı pide', 'pide'], kcal: 270, p: 12, c: 32, f: 11 },
  { k: ['kumpir'], kcal: 200, p: 5, c: 26, f: 9 },
  { k: ['tantuni'], kcal: 220, p: 14, c: 22, f: 8 },
  { k: ['çiğ köfte'], kcal: 170, p: 5, c: 33, f: 2 },
  { k: ['kola'], kcal: 42, p: 0, c: 11, f: 0 },
  { k: ['meyve suyu'], kcal: 45, p: 0, c: 11, f: 0 },
  { k: ['limonata'], kcal: 40, p: 0, c: 10, f: 0 },
  { k: ['çay'], kcal: 1, p: 0, c: 0, f: 0 },
  { k: ['türk kahvesi', 'filtre kahve', 'kahve'], kcal: 2, p: 0, c: 0, f: 0 },
  { k: ['latte', 'sütlü kahve'], kcal: 55, p: 3, c: 5, f: 3 },
  { k: ['bira'], kcal: 43, p: 0, c: 4, f: 0 },
  { k: ['şarap'], kcal: 83, p: 0, c: 3, f: 0 },
  { k: ['yulaf', 'yulaf ezmesi'], kcal: 370, p: 13, c: 60, f: 7 },
  { k: ['granola', 'müsli'], kcal: 450, p: 10, c: 60, f: 18 },
  // === Genisletme (Tem 2026) — yaygin Turk yemekleri per-100g ===
  { k: ['hünkar beğendi'], kcal: 140, p: 9, c: 7, f: 9 },
  { k: ['tas kebabı'], kcal: 150, p: 11, c: 6, f: 9 },
  { k: ['orman kebabı'], kcal: 150, p: 10, c: 7, f: 9 },
  { k: ['saç kavurma'], kcal: 185, p: 15, c: 4, f: 12 },
  { k: ['ali nazik'], kcal: 165, p: 9, c: 6, f: 12 },
  { k: ['güveç', 'sebzeli güveç'], kcal: 120, p: 8, c: 7, f: 7 },
  { k: ['kadınbudu köfte'], kcal: 210, p: 13, c: 9, f: 14 },
  { k: ['izmir köfte', 'i̇zmir köfte'], kcal: 200, p: 12, c: 9, f: 12 },
  { k: ['etli patates'], kcal: 110, p: 6, c: 9, f: 6 },
  { k: ['etli bamya'], kcal: 95, p: 6, c: 7, f: 5 },
  { k: ['kapuska'], kcal: 75, p: 4, c: 6, f: 4 },
  { k: ['lahana yemeği', 'kıymalı lahana'], kcal: 80, p: 4, c: 7, f: 4 },
  { k: ['tavuklu pilav'], kcal: 185, p: 11, c: 22, f: 5 },
  { k: ['nohutlu pilav'], kcal: 175, p: 5, c: 27, f: 5 },
  { k: ['iç pilav', 'i̇ç pilav'], kcal: 175, p: 3, c: 28, f: 6 },
  { k: ['şehriyeli pilav'], kcal: 165, p: 3, c: 29, f: 4 },
  { k: ['zeytinyağlı barbunya', 'barbunya pilaki'], kcal: 95, p: 4, c: 12, f: 4 },
  { k: ['zeytinyağlı pırasa', 'pırasa'], kcal: 70, p: 2, c: 9, f: 4 },
  { k: ['kuru bamya'], kcal: 90, p: 3, c: 11, f: 4 },
  { k: ['semizotu yemeği', 'semizotu'], kcal: 70, p: 3, c: 7, f: 4 },
  { k: ['bakla yemeği'], kcal: 85, p: 4, c: 11, f: 3 },
  { k: ['şakşuka'], kcal: 95, p: 2, c: 7, f: 7 },
  { k: ['patlıcan kızartması', 'kızarmış patlıcan'], kcal: 150, p: 2, c: 10, f: 12 },
  { k: ['fırında sebze', 'sebze graten'], kcal: 90, p: 3, c: 11, f: 4 },
  { k: ['börülce', 'börülce yemeği'], kcal: 90, p: 5, c: 13, f: 3 },
  { k: ['fava'], kcal: 130, p: 6, c: 16, f: 4 },
  { k: ['piyaz'], kcal: 120, p: 5, c: 13, f: 6 },
  { k: ['haydari'], kcal: 130, p: 5, c: 4, f: 11 },
  { k: ['acılı ezme', 'ezme salata'], kcal: 70, p: 2, c: 7, f: 4 },
  { k: ['cacık'], kcal: 45, p: 2, c: 4, f: 2 },
  { k: ['rus salatası', 'amerikan salatası'], kcal: 150, p: 2, c: 12, f: 10 },
  { k: ['balık buğulama', 'buğulama'], kcal: 110, p: 15, c: 3, f: 5 },
  { k: ['karides güveç'], kcal: 120, p: 12, c: 5, f: 6 },
  { k: ['alabalık', 'sardalya', 'istavrit', 'i̇stavrit'], kcal: 185, p: 20, c: 0, f: 11 },
  { k: ['kızarmış tavuk', 'çıtır tavuk', 'tavuk kızartma'], kcal: 250, p: 20, c: 12, f: 14 },
  { k: ['et dürüm', 'adana dürüm', 'dürüm'], kcal: 230, p: 11, c: 22, f: 11 },
  { k: ['kadayıf', 'tel kadayıf'], kcal: 290, p: 4, c: 42, f: 12 },
  { k: ['şöbiyet'], kcal: 400, p: 7, c: 38, f: 25 },
  { k: ['lokma'], kcal: 320, p: 4, c: 50, f: 12 },
  { k: ['höşmerim'], kcal: 210, p: 6, c: 22, f: 11 },
  { k: ['katmer'], kcal: 380, p: 8, c: 36, f: 23 },
  { k: ['muhallebi', 'keşkül', 'sütlü tatlı'], kcal: 110, p: 3, c: 19, f: 3 },
  { k: ['kabak tatlısı'], kcal: 120, p: 1, c: 26, f: 2 },
  { k: ['ayva tatlısı', 'incir tatlısı'], kcal: 110, p: 1, c: 26, f: 1 },
  { k: ['kemalpaşa tatlısı', 'revani'], kcal: 240, p: 4, c: 44, f: 6 },
  { k: ['pişmaniye'], kcal: 440, p: 4, c: 78, f: 13 },
  { k: ['kestane'], kcal: 200, p: 3, c: 44, f: 1 },
  { k: ['fıstık ezmesi', 'fındık ezmesi'], kcal: 590, p: 25, c: 20, f: 50 },
];
function normTr(s) { return String(s || '').toLocaleLowerCase('tr').replace(/[.,;:!?()]/g, ' ').replace(/\s+/g, ' ').trim(); }
// AI'nın döndürdüğü Türkçe ada göre curated tablo eşleşmesi (per-100g → grama ölçekli).
function trFoodLookup(name, grams) {
  const q = normTr(name);
  if (q.length < 2) return null;
  let best = null, bestScore = 0, bestLen = 0, bestKey = '';
  for (const e of TR_FOOD_DB) {
    for (const key of e.k) {
      let score = 0;
      if (q === key) score = 4;
      else if (q.startsWith(key + ' ')) score = 3;
      else if (q.endsWith(' ' + key)) score = 2;
      else if (key.length >= 4 && q.includes(key)) score = 1;
      if (score > bestScore || (score === bestScore && key.length > bestLen)) {
        best = e; bestScore = score; bestLen = key.length; bestKey = key;
      }
    }
  }
  if (!best || bestScore === 0) return null;
  // Curated tablo PİŞMİŞ/hazır değerler tutar. Kullanıcı ÇİĞ istediyse (ve eşleşen
  // anahtar çiğ değilse) tabloyu atla — USDA ham (raw) değeri versin.
  const rawReq = /(^|\s)(çiğ|cig|raw)(\s|$)/.test(q);
  const keyRaw = /(^|\s)(çiğ|cig|raw)(\s|$)/.test(bestKey);
  if (rawReq && !keyRaw) return null;
  const f = (grams || 100) / 100;
  const r = v => Math.round(v * f);
  return { kcal: r(best.kcal), protein: r(best.p), carb: r(best.c), fat: r(best.f) };
}

async function handleFoodMacrosApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const query = (body.query || '').trim();
  if (!query) return jsonCors({ error: 'empty' }, 400, cors);
  if (query.length > 120) return jsonCors({ error: 'too long' }, 400, cors);

  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  try {
    const sys = `Sen bir beslenme asistanısın. Kullanıcının yazdığı ÖĞÜNÜ bileşenlerine ayır.
Öğünde KAÇ yemek varsa HEPSİNİ ayrı ayrı çıkar — 1, 2, 3, 4 ya da daha fazla, sayı sınırı YOK. Hiçbirini atlama, birleştirme.
SADECE şu JSON'u döndür, başka hiçbir açıklama/metin yazma:
{"items":[{"name":"<yemek adı, Türkçe>","en":"<sade İngilizce ad>","grams":<bu bileşenin toplam gram ağırlığı>,"kcal":<sayı>,"protein":<gram>,"carb":<gram>,"fat":<gram>}]}
- Her ayrı yemek için bir nesne. "ve"/virgül/boşlukla ayrılan her yemek ayrı bileşendir.
- grams + makrolar: o bileşenin BELİRTİLEN MİKTARI için (örn "4 yumurta" -> 4 yumurtanın toplamı, ~50g/yumurta).
- ÇİĞ/PİŞMİŞ: kullanıcının kelimesine sadık kal. "pirinç"=ÇİĞ (raw white rice), "pilav"=PİŞMİŞ (cooked white rice). "bulgur"/"un"/"yulaf"/"kuru makarna"=çiğ/kuru.
- BELİRTİLMEMİŞSE varsayılan ÇİĞ (raw): Türkçe adın başına "çiğ", en'e "raw" ekle (örn "tavuk"->"çiğ tavuk"/"chicken breast raw", "et"->"çiğ dana eti"/"beef raw", "somon"->"çiğ somon"/"salmon raw"). İSTİSNA: ad zaten pişmiş/hazır yemekse (pilav, köfte, kebap, döner, çorba, tost, menemen, sarma, dolma, yumurta...) pişmiş bırak.
- en: USDA için sade İngilizce ad, çiğ/pişmiş dahil ("chicken breast raw", "white bread", "raw white rice", "cooked white rice", "beef raw", "egg cooked"). Marka yazma.
- Miktar belirtilmemişse mantıklı 1 porsiyon varsay.
Örnek: "4 yumurta 2 dilim ekmek 1 kase pilav" -> {"items":[{"name":"yumurta","en":"egg cooked","grams":200,"kcal":310,"protein":26,"carb":2,"fat":22},{"name":"ekmek","en":"white bread","grams":50,"kcal":133,"protein":4,"carb":25,"fat":1},{"name":"pilav","en":"cooked white rice","grams":150,"kcal":195,"protein":4,"carb":42,"fat":0}]}
Örnek: "60 gram pirinç" -> {"items":[{"name":"pirinç","en":"raw white rice","grams":60,"kcal":216,"protein":4,"carb":47,"fat":1}]}
Örnek: "200 gram tavuk" -> {"items":[{"name":"çiğ tavuk","en":"chicken breast raw","grams":200,"kcal":240,"protein":46,"carb":0,"fat":5}]}`;
    const r = await aiRun(env, {
      tier: 'light',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: query },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });
    const raw = typeof r.response === 'string' ? r.response : JSON.stringify(r.response || '');
    const items = parseMealItemsJson(raw);
    if (!items.length) return jsonCors({ error: 'parse', raw: String(raw).slice(0, 200) }, 200, cors);
    // Her bilesen: once curated Turk besin tablosu, yoksa USDA, o da yoksa AI tahmini — sonra topla
    const resolved = await Promise.all(items.map(it => {
      const cur = trFoodLookup(it.name, it.grams);
      if (cur && cur.kcal != null) return Promise.resolve({ ...cur, _src: 'curated' });
      if (!it.en) return Promise.resolve(null);
      return usdaLookup(env, it.en, it.grams).then(u => (u && u.kcal != null) ? { ...u, _src: 'usda' } : null).catch(() => null);
    }));
    const merged = items.map((it, idx) => {
      const u = resolved[idx];
      if (u && u.kcal != null) return { name: it.name, grams: it.grams, kcal: Math.round(u.kcal), protein: Math.round(u.protein || 0), carb: Math.round(u.carb || 0), fat: Math.round(u.fat || 0), source: u._src };
      return { name: it.name, grams: it.grams, kcal: Math.round(it.kcal || 0), protein: Math.round(it.protein || 0), carb: Math.round(it.carb || 0), fat: Math.round(it.fat || 0), source: 'ai' };
    });
    const sum = merged.reduce((a, it) => ({
      kcal: a.kcal + (it.kcal || 0), protein: a.protein + (it.protein || 0),
      carb: a.carb + (it.carb || 0), fat: a.fat + (it.fat || 0), grams: a.grams + (it.grams || 0),
    }), { kcal: 0, protein: 0, carb: 0, fat: 0, grams: 0 });
    const ai = { kcal: Math.round(sum.kcal), protein: Math.round(sum.protein), carb: Math.round(sum.carb), fat: Math.round(sum.fat) };
    const isDb = m => m.source === 'usda' || m.source === 'curated';
    const anyUsda = merged.some(isDb);
    const allUsda = merged.every(isDb);
    const source = allUsda ? 'usda' : (anyUsda ? 'mixed' : 'ai');
    return jsonCors({ name: query, grams: Math.round(sum.grams), ai, items: merged, multi: items.length > 1, source }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 500, cors);
  }
}

// Byte dizisi → base64 (Gemini image_url data URL için). base64ToBytes'in tersi.
// Büyük görsellerde stack taşmasın diye parça parça (String.fromCharCode.apply sınırı).
function bytesToBase64(bytes) {
  const arr = bytes || [];
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < arr.length; i += CH) {
    bin += String.fromCharCode.apply(null, arr.slice(i, i + CH));
  }
  return btoa(bin);
}

// Vision modeli çağır — Gemini multimodal (OCR + Türkçe, tek çağrı). image_url
// data URL formatı, aiRun üzerinden gider. Çağıran arayüz: { image, prompt, max_tokens },
// dönüş { response } sözleşmesi korunur (eski CF Vision ile aynı).
async function visionRun(env, input) {
  const prompt = (input && input.prompt) || '';
  const maxTok = (input && input.max_tokens) || 1024;
  const bytes = input && input.image;
  if (!bytes || !bytes.length) throw new Error('gorsel verisi yok');
  const b64 = bytesToBase64(bytes);
  // Gemini multimodal — OCR + Turkce, tek cagri (donus { response } sozlesmesi korunur)
  return await aiRun(env, {
    tier: 'light',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } },
      ],
    }],
    max_tokens: maxTok,
    temperature: 0.1,
  });
}

// Borsa alarm cron — watchlist fiyatlarını kontrol et, eşik geçildiyse push (her user için)
async function runStockCheck(env) {
  const users = await fetchAllUsers(env);
  const results = [];
  for (const u of users) {
    try {
      const r = await runStockCheckForUser(env, u);
      results.push({ userId: u.userId, ...r });
    } catch (e) {
      results.push({ userId: u.userId, error: e.message });
    }
  }
  return { type: 'stocks', users: users.length, results, multiUser: hasServiceKey(env) };
}

async function runStockCheckForUser(env, u) {
  const data = u.data;
  const wl = (data.watchlist) || [];
  if (!wl.length) return { checked: 0 };
  const quotes = await fetchStockQuotes(wl.map(w => ({ display: (w.symbol || '').toUpperCase(), yahoo: w.ySymbol || bistSymbol(w.symbol) })));
  const bySym = {};
  for (const q of quotes) bySym[q.symbol] = q;

  const alerts = [];
  let dirty = false;
  for (const w of wl) {
    const q = bySym[(w.symbol || '').toUpperCase()];
    if (!q || q.price == null) continue;
    if (w.alarmAbove != null && q.price >= w.alarmAbove) {
      if (!w.lastAlertedAbove) {
        alerts.push(`📈 ${w.symbol} ${formatPrice(q.price)} ${q.currency} — ${formatPrice(w.alarmAbove)} üstünü geçti!`);
        w.lastAlertedAbove = true; dirty = true;
      }
    } else if (w.lastAlertedAbove) { w.lastAlertedAbove = false; dirty = true; }
    if (w.alarmBelow != null && q.price <= w.alarmBelow) {
      if (!w.lastAlertedBelow) {
        alerts.push(`📉 ${w.symbol} ${formatPrice(q.price)} ${q.currency} — ${formatPrice(w.alarmBelow)} altına düştü!`);
        w.lastAlertedBelow = true; dirty = true;
      }
    } else if (w.lastAlertedBelow) { w.lastAlertedBelow = false; dirty = true; }
    if (w.alarmPctDown != null && q.prevClose) {
      const chg = (q.price - q.prevClose) / q.prevClose * 100;
      if (chg <= -Math.abs(w.alarmPctDown)) {
        if (!w.lastAlertedPct) {
          alerts.push(`📉 ${w.symbol} bugün %${chg.toFixed(1)} — %${Math.abs(w.alarmPctDown)} düşüş eşiğini aştı!`);
          w.lastAlertedPct = true; dirty = true;
        }
      } else if (w.lastAlertedPct) { w.lastAlertedPct = false; dirty = true; }
    }
  }
  if (alerts.length) {
    const payload = { title: '🔔 Borsa alarmı', message: alerts.join('\n') };
    await sendPushToAll(env, data, payload, { userId: u.userId });
    logPush(data, 'stocks', payload, ((data.settings && data.settings.pushSubs) || []).length);
    dirty = true;
  }
  if (dirty) { try { await saveUserData(env, u.userId, data); } catch (e) { console.error('stock save fail', e.message); } }
  return { checked: wl.length, alerts: alerts.length };
}

// Akşam portföy özeti cron — BIST kapanışı sonrası (18:30 TR hafta içi). Multi-user.
async function runPortfolioSummary(env) {
  const users = await fetchAllUsers(env);
  const results = [];
  for (const u of users) {
    try {
      const r = await runPortfolioSummaryForUser(env, u);
      results.push({ userId: u.userId, ...r });
    } catch (e) {
      results.push({ userId: u.userId, error: e.message });
    }
  }
  return { type: 'portfolio', users: users.length, results, multiUser: hasServiceKey(env) };
}

async function runPortfolioSummaryForUser(env, u) {
  const data = u.data;
  const wl = (data.watchlist) || [];
  const holdings = wl.filter(w => w.qty != null && w.qty > 0 && w.cost != null);
  if (!holdings.length) return { holdings: 0 };

  const quotes = await fetchStockQuotes(holdings.map(w => ({ display: (w.symbol || '').toUpperCase(), yahoo: w.ySymbol || bistSymbol(w.symbol) })));
  const bySym = {};
  for (const q of quotes) bySym[q.symbol] = q;

  // Para birimine göre grupla (TRY/USD karışmasın — kur farkı yanıltır)
  const byCur = {};
  for (const w of holdings) {
    const q = bySym[(w.symbol || '').toUpperCase()];
    const price = (q && q.price != null) ? q.price : null;
    const prev = (q && q.prevClose != null) ? q.prevClose : null;
    const cur = (q && q.currency) ? q.currency : (w.currency || 'TRY');
    if (!byCur[cur]) byCur[cur] = { value: 0, cost: 0, daily: 0 };
    const g = byCur[cur];
    g.cost += w.qty * w.cost;
    if (price != null) {
      g.value += w.qty * price;
      if (prev != null) g.daily += w.qty * (price - prev); // bugünkü değişim tutarı
    } else {
      g.value += w.qty * w.cost; // fiyat gelmediyse maliyetle say (nötr)
    }
  }

  const currencies = Object.keys(byCur);
  if (!currencies.length) return { holdings: holdings.length, sent: 0 };

  const todayStr = new Date().toISOString().slice(0, 10);
  data.portfolioHistory = data.portfolioHistory || [];
  // Geçmişten N gün önceki değere göre değişim % (bugünü hariç tut)
  const histFor = (cur, daysAgo) => {
    const t = new Date(); t.setDate(t.getDate() - daysAgo);
    const ts = t.toISOString().slice(0, 10);
    const arr = data.portfolioHistory.filter(s => s.byCur && s.byCur[cur] && s.date !== todayStr);
    let past = null;
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].date <= ts) { past = arr[i]; break; } }
    if (!past) return null;
    const pv = past.byCur[cur].value;
    if (!(pv > 0)) return null;
    return (byCur[cur].value - pv) / pv * 100;
  };

  const lines = [];
  for (const cur of currencies) {
    const g = byCur[cur];
    const lbl = cur === 'TRY' ? 'TL' : cur;
    const totalPL = g.value - g.cost;
    const totalPct = g.cost > 0 ? (totalPL / g.cost) * 100 : 0;
    const prevValue = g.value - g.daily;
    const dailyPct = prevValue > 0 ? (g.daily / prevValue) * 100 : 0;
    const ts = totalPL >= 0 ? '+' : '';
    const ds = g.daily >= 0 ? '+' : '';
    if (currencies.length > 1) lines.push(`— ${lbl} —`);
    lines.push(`Değer: ${formatPrice(g.value)} ${lbl}`);
    lines.push(`Bugün: ${ds}${formatPrice(g.daily)} ${lbl} (${ds}${dailyPct.toFixed(1)}%)`);
    lines.push(`Toplam: ${ts}${formatPrice(totalPL)} ${lbl} (${ts}${totalPct.toFixed(1)}%)`);
    // Geçmiş varsa hafta/ay değişimi
    const wk = histFor(cur, 7), mo = histFor(cur, 30);
    const trend = [];
    if (wk != null) trend.push(`Hafta ${wk >= 0 ? '+' : ''}${wk.toFixed(1)}%`);
    if (mo != null) trend.push(`Ay ${mo >= 0 ? '+' : ''}${mo.toFixed(1)}%`);
    if (trend.length) lines.push(trend.join(' · '));
  }
  const payload = { title: '💼 Portföy özeti', message: lines.join('\n') };
  await sendPushToAll(env, data, payload, { userId: u.userId });
  logPush(data, 'portfolio', payload, ((data.settings && data.settings.pushSubs) || []).length);

  // Bugünün snapshot'ını geçmişe yaz (upsert) — kapanış değeri, otoritatif
  const snapByCur = {};
  for (const cur of currencies) snapByCur[cur] = { value: byCur[cur].value, cost: byCur[cur].cost };
  const existIdx = data.portfolioHistory.findIndex(s => s.date === todayStr);
  if (existIdx >= 0) data.portfolioHistory[existIdx].byCur = snapByCur;
  else data.portfolioHistory.push({ date: todayStr, byCur: snapByCur });
  data.portfolioHistory.sort((a, b) => a.date < b.date ? -1 : 1);
  if (data.portfolioHistory.length > 180) data.portfolioHistory = data.portfolioHistory.slice(-180);

  try { await saveUserData(env, u.userId, data); } catch (e) { console.error('portfolio save fail', e.message); }
  return { holdings: holdings.length, sent: 1 };
}

function formatPrice(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 💊 Sabit hatırlatıcılar (ilaç, su, ders...) — 15 dakikalık cron her çağrıda kontrol eder.
// data.reminders[] = [{id, label, time:'HH:MM', days:'daily'|'weekdays', enabled, lastFired:'YYYY-MM-DD'}]
// Saati gelen (ve bugün henüz atılmamış) hatırlatıcıya push atar; 30 dk'dan eski olanlar atlanır
// (gün ortasında geçmiş saate kurulan hatırlatıcı hemen patlamasın diye).
async function runFixedReminders(env) {
  const users = await fetchAllUsers(env);
  const results = [];
  for (const u of users) {
    try {
      const r = await runFixedRemindersForUser(env, u);
      results.push({ userId: u.userId, ...r });
    } catch (e) {
      results.push({ userId: u.userId, error: e.message });
    }
  }
  return { type: 'reminders', users: users.length, results, multiUser: hasServiceKey(env) };
}

async function runFixedRemindersForUser(env, u) {
  const data = u.data;
  const rems = (data.reminders || []).filter(r => r && r.enabled !== false && (r.time || (r.mode === 'interval' && r.startTime && r.endTime)));
  if (!rems.length) return { checked: 0, sent: 0 };

  const tr = new Date(Date.now() + TR_OFFSET_MS);
  const todayStr = trToday();
  const nowMin = tr.getUTCHours() * 60 + tr.getUTCMinutes();
  const isWeekday = tr.getUTCDay() >= 1 && tr.getUTCDay() <= 5;

  const due = [];
  for (const r of rems) {
    // TAKVIYE "ALINANA KADAR" MODU (Agu 2026)
    // Salim: "icildi isaretleyene kadar 15 dakikada bir hatirlatsin."
    // Sabit saatte tek push ADHD'de ise yaramiyordu: bildirim gelir, "birazdan"
    // denir, unutulur. Bu mod isaretlenene kadar nagEvery dk'da bir hatirlatir;
    // nag'i bitiren TEK sey takviyenin alindi isaretlenmesi (takenLog).
    // Pencere kapaninca (nagUntil, varsayilan +6sa, en gec 23:00) susar —
    // gece boyu bildirim yagmasin.
    if (r.kind === 'supp' && r.nagEvery) {
      const mstart = /^(\d{1,2}):(\d{2})$/.exec(r.time || '');
      if (!mstart) continue;
      // Bugun alindiysa sus
      if ((r.takenLog || []).includes(todayStr) || r.takenDate === todayStr) continue;
      if (r.days === 'weekdays' && !isWeekday) continue;
      const startM = (+mstart[1]) * 60 + (+mstart[2]);
      const muntil = /^(\d{1,2}):(\d{2})$/.exec(r.nagUntil || '');
      const untilM = muntil ? (+muntil[1]) * 60 + (+muntil[2]) : Math.min(startM + 180, 1380);
      if (nowMin < startM || nowMin > untilM) continue;
      const nagEvery = Math.max(15, +r.nagEvery || 15);
      const nagSlot = startM + Math.floor((nowMin - startM) / nagEvery) * nagEvery;
      if (nowMin - nagSlot > 5) continue;              // cron kacirdiysa eski slotu telafi etme
      const nagKey = todayStr + '@' + nagSlot;
      if (r.lastFired === nagKey) continue;
      r.lastFired = nagKey;
      r._nagIndex = Math.round((nagSlot - startM) / nagEvery);   // mesaj tonu icin
      due.push(r);
      continue;
    }
    if (r.mode === 'interval') {
      // Aralıklı hatırlatıcı (örn. takviye): startTime–endTime arasında everyMin dk'da bir.
      // lastFired = 'YYYY-MM-DD@slotDk' — her slot en fazla 1 kez atılır.
      const ms = /^(\d{1,2}):(\d{2})$/.exec(r.startTime || '');
      const me = /^(\d{1,2}):(\d{2})$/.exec(r.endTime || '');
      if (!ms || !me) continue;
      const every = Math.max(30, +r.everyMin || 60);
      const startM = (+ms[1]) * 60 + (+ms[2]);
      let endM = (+me[1]) * 60 + (+me[2]);
      if (endM <= startM) endM += 1440; // gece yarısını aşan aralık (örn. 22:00–02:00)
      let nowM = nowMin, fireDay = todayStr, fireWeekday = isWeekday;
      if (nowM < startM && nowM + 1440 <= endM) {
        // gece yarısından sonraki kısımdayız — aralık dün başladı
        nowM += 1440;
        fireDay = trDate(-1);
        const yd = new Date(Date.now() + TR_OFFSET_MS - 86400000).getUTCDay();
        fireWeekday = yd >= 1 && yd <= 5;
      }
      if (nowM < startM || nowM > endM) continue;
      if (r.days === 'weekdays' && !fireWeekday) continue;
      const slotM = startM + Math.floor((nowM - startM) / every) * every;
      if (nowM - slotM > 30) continue; // eski slot — cron kaçırdıysa spam yapma
      const slotKey = fireDay + '@' + slotM;
      if (r.lastFired === slotKey) continue;
      r.lastFired = slotKey;
      due.push(r);
      continue;
    }
    const m = /^(\d{1,2}):(\d{2})$/.exec(r.time);
    if (!m) continue;
    let diff = nowMin - ((+m[1]) * 60 + (+m[2]));
    // Gece yarısı taşması: 23:46-23:59 hatırlatıcıları son cron 23:45'i kaçırır —
    // 00:00/00:15 turunda "dünün hatırlatıcısı" olarak yakala (lastFired da düne yazılır).
    let fireDay = todayStr, fireWeekday = isWeekday;
    if (diff < 0 && nowMin <= 30) {
      diff += 1440;
      fireDay = trDate(-1);
      const yd = new Date(Date.now() + TR_OFFSET_MS - 86400000).getUTCDay();
      fireWeekday = yd >= 1 && yd <= 5;
    }
    if (r.lastFired === fireDay) continue;
    if (r.days === 'weekdays' && !fireWeekday) continue;
    if (diff >= 0 && diff <= 30) { due.push(r); r.lastFired = fireDay; }
  }
  if (!due.length) return { checked: rems.length, sent: 0 };

  for (const r of due) {
    // Nag turlarinda ton yumusak kalir: suclama yok, ne yapilacagi net.
    let msg;
    if (r._nagIndex != null) {
      msg = r._nagIndex === 0
        ? `Saat ${r.time} — aldıktan sonra Diyet sekmesinden işaretle`
        : `Hâlâ işaretlenmedi — aldıysan işaretle, hatırlatma dursun`;
    } else if (r.mode === 'interval') {
      msg = `${r.startTime}–${r.endTime} arası hatırlatma — hadi`;
    } else {
      msg = `Saat ${r.time} — günün sabiti, hadi`;
    }
    const payload = { title: `⏰ ${r.label || 'Hatırlatma'}`, message: msg };
    await sendPushToAll(env, data, payload, { userId: u.userId });
    logPush(data, 'reminder', payload, ((data.settings && data.settings.pushSubs) || []).length);
  }
  try { await saveUserData(env, u.userId, data); } catch (e) { console.error('reminder save fail', e.message); }
  return { checked: rems.length, sent: due.length };
}

// ============================================================
// 🗓️ Sabah otomatik gün planı (morning cron — 08:00 TR)
// ============================================================
// Salim "Günü planla" butonuna basmayı unutuyor → worker açık görevlere bakıp
// günü kendi planlar, data.dayPlan'a yazar, tek kısa push atar.
// data.settings.autoPlan === false ise atlanır.
// Bugün için ELLE yapılmış plan varsa (dp.auto !== true) üzerine YAZILMAZ.

// 'HH:MM' → dakika (worker tarafı; frontend'deki hmToMin'in eşi)
function hmMin(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
  return m ? (+m[1]) * 60 + (+m[2]) : -1;
}

// ratio = gecmisten olculen sure sapma katsayisi (null ise duzeltme yok).
// forDate'e gore son tarihi olan cok gunluk isler gune bolunur.
function planTasksForAi(data, forDate, ratio) {
  const open = (data.tasks || []).filter(t => t && !t.done);
  return open.slice(0, 20).map((t, i) => {
    // Gercekci sure: tahmini olculen sapmayla carp, 5 dk'ya yuvarla
    let min = t.estimateMin || null;
    if (min && ratio) min = Math.max(10, Math.round((min * ratio) / 5) * 5);
    // Cok gunluk is: son tarihe kalan gune bol → "bugun ne kadar calismali"
    let today = null;
    if (min && t.due) {
      const dl = daysBetweenDates(forDate, t.due);
      if (dl !== null && dl > 0) {
        const share = Math.max(20, Math.round(min / (dl + 1) / 5) * 5);
        if (share < min) today = share;
      }
    }
    return {
      i,
      text: String(t.text || '').slice(0, 80),
      min: today || min,
      full: today ? min : null,   // bolunduyse toplam is yuku
      pri: t.priority === 'urgent' ? 'acil' : 'normal',
      mit: t.mitDate === trToday(),
      due: t.due || null,
      cat: t.category || null,
      _id: t.id,
    };
  });
}

// Bir tarihe ait sabit program bloklari (okul/ders/antrenman).
// data.fixedSchedule = [{id, label, days:[0..6 JS getDay], start, end, enabled}]
function fixedBlocksFor(data, dateStr) {
  const dayIdx = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  return (data.fixedSchedule || [])
    .filter(f => f && f.enabled !== false && Array.isArray(f.days) && f.days.includes(dayIdx)
      && hmMin(f.start) >= 0 && hmMin(f.end) > hmMin(f.start))
    .map((f, k) => ({
      id: Date.now() + 900000 + k,
      label: String(f.label || 'Sabit').slice(0, 100),
      start: f.start, end: f.end,
      kind: 'fixed', taskId: null, done: false,
      fixedId: f.id,
    }))
    .sort((a, b) => hmMin(a.start) - hmMin(b.start));
}

function blocksOverlap(a, b) {
  return hmMin(a.start) < hmMin(b.end) && hmMin(b.start) < hmMin(a.end);
}

// ============================================================
// 🧠 PLANLAMA ZEKASI — geçmişten öğrenme + deadline farkındalığı
// ============================================================
// Sorun: planlayıcı her gün sıfırdan başlıyordu. Salim'in gerçek hızını,
// hangi saatte blok tutturduğunu, neyi sürekli ertelediğini bilmiyordu.
// Çözüm: dayPlan üzerine yazılmadan ARŞİVLENİR (data.planHistory), sonraki
// planlar bu veriyle kurulur.

// İki tarih arası gün farkı (öğlen demirli — toISOString UTC kayması bug'ı)
function daysBetweenDates(a, b) {
  const da = Date.parse(a + 'T12:00:00Z'), db = Date.parse(b + 'T12:00:00Z');
  if (isNaN(da) || isNaN(db)) return null;
  return Math.round((db - da) / 86400000);
}

// Gün planını geçmişe yaz — son 21 gün, kompakt format.
// s=start, e=end, k=kind, d=done, c=kategori (kaçan kategoriyi öğrenmek için)
function archivePlanDay(data, dp) {
  if (!dp || !dp.date || !(dp.blocks || []).length) return;
  data.planHistory = data.planHistory || [];
  if (data.planHistory.some(h => h.date === dp.date)) return; // zaten arşivlenmiş
  const tasks = data.tasks || [];
  const trained = ((data.hevy && data.hevy.workouts) || []).some(w => w.date === dp.date);
  data.planHistory.push({
    date: dp.date,
    w: trained || undefined,   // antrenman gunu mu — planlayici bunu ogrenir
    blocks: dp.blocks.map(b => {
      const t = b.taskId ? tasks.find(x => x.id === b.taskId) : null;
      return { s: b.start, e: b.end, k: b.kind || 'task', d: !!b.done, c: (t && t.category) || null };
    }),
  });
  data.planHistory = data.planHistory.slice(-21);
}

// Salim'in gerçek verisinden planlama profili çıkar.
// Yeterli veri yoksa (3 günden az) null alanlar döner — prompt'a uydurma bilgi girmez.
function planProfile(data) {
  const hist = (data.planHistory || []).slice(-14);
  const buckets = { sabah: { t: 0, d: 0 }, ogle: { t: 0, d: 0 }, aksam: { t: 0, d: 0 } };
  const catMiss = {};
  const perDay = [];

  const gym = { t: 0, d: 0 }, rest = { t: 0, d: 0 };   // antrenman gunu vs normal gun
  for (const h of hist) {
    let dn = 0;
    for (const b of (h.blocks || [])) {
      if (b.k === 'break' || b.k === 'fixed') continue; // mola/sabit "tutturma" sayılmaz
      const hm = hmMin(b.s);
      if (hm < 0) continue;
      const key = hm < 720 ? 'sabah' : hm < 1020 ? 'ogle' : 'aksam';
      buckets[key].t++;
      const bucket2 = h.w ? gym : rest;
      bucket2.t++;
      if (b.d) { buckets[key].d++; bucket2.d++; dn++; }
      else if (b.c) catMiss[b.c] = (catMiss[b.c] || 0) + 1;
    }
    perDay.push(dn);
  }

  // Süre tahmini sapması: gerçek/tahmin MEDYANI (ortalama tek uç değerle bozulur)
  const finished = (data.tasks || [])
    .filter(t => t && t.done && t.estimateMin > 0 && t.actualMin > 0)
    .slice(-30);
  let ratio = null;
  if (finished.length >= 3) {
    const rs = finished.map(t => t.actualMin / t.estimateMin).sort((a, b) => a - b);
    const mid = Math.floor(rs.length / 2);
    ratio = rs.length % 2 ? rs[mid] : (rs[mid - 1] + rs[mid]) / 2;
    ratio = Math.min(3, Math.max(0.5, ratio)); // uç değerleri kırp
  }

  const avgDone = perDay.length ? perDay.reduce((a, b) => a + b, 0) / perDay.length : null;
  return { days: hist.length, buckets, catMiss, ratio, avgDone, gym, rest };
}

const CAT_TR = { odev: 'ödev', ders: 'özel ders', ev: 'ev işi', kisisel: 'kişisel' };

// Profili AI prompt'una girecek Türkçe satırlara çevir. Veri zayıfsa boş döner.
function profileLines(prof) {
  if (!prof || prof.days < 3) return '';
  const out = [];

  const rate = b => (b.t >= 3 ? Math.round((b.d / b.t) * 100) : null);
  const parts = [];
  const rs = rate(prof.buckets.sabah), ro = rate(prof.buckets.ogle), ra = rate(prof.buckets.aksam);
  if (rs !== null) parts.push(`sabah %${rs}`);
  if (ro !== null) parts.push(`öğleden sonra %${ro}`);
  if (ra !== null) parts.push(`akşam %${ra}`);
  if (parts.length) {
    out.push(`- Blok tamamlama oranı: ${parts.join(' · ')}. DÜŞÜK oranlı saat dilimine ağır/uzun iş KOYMA, oraya kısa ya da kolay iş koy.`);
  }

  if (prof.ratio && Math.abs(prof.ratio - 1) > 0.15) {
    out.push(prof.ratio > 1
      ? `- Süre tahminleri gerçekte ~${prof.ratio.toFixed(1)} kat uzuyor. Görev süreleri BU KATSAYIYLA ZATEN DÜZELTİLDİ — verilen süreleri olduğu gibi kullan, tekrar uzatma.`
      : `- Bu kişi işleri tahmininden hızlı bitiriyor (~${prof.ratio.toFixed(1)} kat). Süreler zaten düzeltildi.`);
  }

  if (prof.avgDone !== null && prof.avgDone > 0) {
    const cap = Math.max(2, Math.round(prof.avgDone) + 1);
    out.push(`- Günde ortalama ${prof.avgDone.toFixed(1)} çalışma bloğu bitiriyor. En fazla ${cap} çalışma bloğu koy — fazlası her gün çöpe gidiyor, günü tıka basa doldurma.`);
  }

  const worst = Object.entries(prof.catMiss).sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 3) {
    out.push(`- En çok kaçırdığı kategori: "${CAT_TR[worst[0]] || worst[0]}" (${worst[1]} blok). Bu kategoriyi günün EN İYİ saatine ve KISA bloklar halinde koy.`);
  }

  // Antrenman gunu etkisi — sadece iki tarafta da yeterli veri varsa ve fark anlamliysa
  const g = prof.gym, rr = prof.rest;
  if (g && rr && g.t >= 4 && rr.t >= 4) {
    const gr = g.d / g.t, rrr = rr.d / rr.t;
    if (rrr - gr >= 0.15) {
      out.push(`- Antrenman yaptığı günlerde tamamlama oranı düşüyor (%${Math.round(gr * 100)} vs %${Math.round(rrr * 100)}). BUGÜN ANTRENMAN GÜNÜ ise daha AZ ve daha KISA blok koy.`);
    }
  }

  return out.length ? `\n\n📊 GEÇMİŞ VERİSİ (son ${prof.days} gün — uydurma değil, ölçüldü):\n${out.join('\n')}` : '';
}

// Planlanan gun antrenman gunu mu? (Hevy gecmisinden haftalik desen)
// Hevy sadece GECMISI verir — gelecek programi bilmez. Bu yuzden "aynı haftanın
// aynı gününde son 3 haftada antrenman var mı" desenine bakiyoruz.
function gymDayLine(data, forDate) {
  const ws = (data.hevy && data.hevy.workouts) || [];
  if (ws.length < 4) return '';
  const dayIdx = new Date(forDate + 'T12:00:00Z').getUTCDay();
  let hits = 0, weeks = 0;
  for (let k = 1; k <= 3; k++) {
    const d = new Date(Date.parse(forDate + 'T12:00:00Z') - k * 7 * 86400000).toISOString().slice(0, 10);
    weeks++;
    if (ws.some(w => w.date === d)) hits++;
  }
  if (weeks < 3 || hits < 2) return '';
  const names = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  return `

💪 Bu kişi son 3 haftanın ${hits}'inde ${names[dayIdx]} günü antrenman yaptı — bugün büyük ihtimalle ANTRENMAN GÜNÜ. Günü buna göre hafiflet ve antrenman için ~90 dk boşluk bırak.`;
}

// Yaklaşan sınav/teslim geri sayımları — plana bağlam
function deadlineLines(data, forDate) {
  const cds = (data.countdowns || [])
    .map(c => ({ label: c.label, d: daysBetweenDates(forDate, c.date) }))
    .filter(x => x.d !== null && x.d >= 0 && x.d <= 14)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
  if (!cds.length) return '';
  const lines = cds.map(c => `- ${c.label}: ${c.d === 0 ? 'BUGÜN' : c.d === 1 ? 'YARIN' : c.d + ' gün kaldı'}`);
  return `\n\n⏳ YAKLAŞAN SINAV / TESLİM:\n${lines.join('\n')}\nBu tarihlere hazırlık gerektiren görevleri güne ÖNCE ve yüksek-enerji saatine koy.`;
}

// 😴 Dün geceki uyku → bugünün planına enerji ipucu. Sadece BUGÜN için son gece bilinir
// (akşam yarını planlarken uyku henüz olmadı → boş döner).
function sleepLine(data, forDate) {
  if (forDate !== trToday()) return '';
  const sl = (data.sleep || []).find(s => s.date === forDate);
  if (!sl) return '';
  const bad = sl.quality === 'bad' || (sl.hours != null && sl.hours < 6);
  const great = sl.quality === 'good' && (sl.hours == null || sl.hours >= 7.5);
  const hStr = sl.hours != null ? `${sl.hours} saat ` : '';
  if (bad) return `\n\n😴 Bu kişi dün gece ${hStr}kötü/az uyudu — enerji düşük. Bugün daha AZ ve KISA blok koy, ağır işi en verimli saate al, güne fazladan 20-30 dk tampon bırak.`;
  if (great) return `\n\n😴 Bu kişi dün gece iyi dinlendi — zorlu/derin işleri güne rahatça koyabilirsin.`;
  return '';
}

async function runAutoPlan(env, opts = {}) {
  const users = await fetchAllUsers(env);
  const results = [];
  for (const u of users) {
    try { results.push({ userId: u.userId, ...(await runAutoPlanForUser(env, u, opts)) }); }
    catch (e) { results.push({ userId: u.userId, error: e.message }); }
  }
  return { type: 'autoplan', trigger: opts.trigger || 'manual', users: users.length, results, multiUser: hasServiceKey(env) };
}

// opts.forDate = 'YYYY-MM-DD' (varsayilan bugun), opts.trigger = 'morning'|'evening'|'manual'
async function runAutoPlanForUser(env, u, opts = {}) {
  const data = u.data;
  const st = data.settings || {};
  if (st.autoPlan === false) return { skipped: 'kapali' };

  const forDate = opts.forDate || trToday();
  // planWhen varsayilan 'evening' — aksam 21:00'de YARIN planlanir, sabah sadece guvenlik agi.
  const planWhen = st.planWhen === 'morning' ? 'morning' : 'evening';
  if (opts.trigger === 'evening' && planWhen !== 'evening') return { skipped: 'sabah-modunda' };

  const dp = data.dayPlan || {};
  // O tarih icin plan zaten varsa (aksam yapilmis ya da Salim elle kurmus) DOKUNMA
  if (dp.date === forDate && (dp.blocks || []).length) return { skipped: 'plan-zaten-var' };

  // Uzerine yazmadan ONCE eski gunu arsivle — ogrenmenin veri kaynagi
  if (dp.date && dp.date !== forDate) archivePlanDay(data, dp);

  const prof = planProfile(data);
  const tasks = planTasksForAi(data, forDate, prof.ratio);
  const fixed = fixedBlocksFor(data, forDate);
  if (!tasks.length) {
    // Gorev yok ama sabit program varsa yine de gunu kur (okul/ders gorunsun)
    if (!fixed.length) return { skipped: 'gorev-yok' };
    // (arsivleme yukarida yapildi)
    data.dayPlan = { date: forDate, blocks: fixed, windowFrom: st.planFrom || null, windowTo: st.planTo || null, auto: true };
    try { await saveUserData(env, u.userId, data); } catch (e) { console.error('autoplan save fail', e.message); }
    return { blocks: fixed.length, onlyFixed: true };
  }

  // Uyanik pencere: ayarlarda kalici → yoksa dunun planindan → yoksa varsayilan.
  // Varsayilan okul-duyarli: hafta ici 16:00 (okuldan sonra), hafta sonu 10:00.
  const dayIdx = new Date(forDate + 'T12:00:00Z').getUTCDay();
  const defFrom = (dayIdx >= 1 && dayIdx <= 5) ? '16:00' : '10:00';
  const from = st.planFrom || dp.windowFrom || defFrom;
  const to = st.planTo || dp.windowTo || '22:00';

  const raw = await generatePlanBlocks(env, {
    tasks, from, to,
    now: '', // ileri tarih planlanabilir — "su an" kisiti yok
    busy: fixed.map(f => ({ label: f.label, start: f.start, end: f.end })),
    insight: profileLines(prof) + deadlineLines(data, forDate) + gymDayLine(data, forDate) + sleepLine(data, forDate),
  });

  let blocks = (raw || []).map(b => {
    const ti = (b.task === 0 || b.task) ? Number(b.task) : null;
    const linked = (ti !== null && tasks[ti]) ? tasks[ti] : null;
    return {
      id: Date.now() + Math.floor(Math.random() * 100000),
      label: String(b.label || '').slice(0, 100) || (linked ? linked.text : 'Blok'),
      start: b.start, end: b.end,
      kind: b.kind || (linked ? 'task' : 'custom'),
      taskId: linked ? linked._id : null,
      done: false,
    };
  }).filter(b => hmMin(b.start) >= 0 && hmMin(b.end) > hmMin(b.start));

  // AI talimata ragmen sabit saatlere blok koyduysa AT — sabit program her zaman kazanir
  if (fixed.length) blocks = blocks.filter(b => !fixed.some(f => blocksOverlap(b, f)));

  const all = fixed.concat(blocks).sort((a, b) => hmMin(a.start) - hmMin(b.start));
  if (!all.length) return { skipped: 'ai-plan-uretemedi' };

  data.dayPlan = { date: forDate, blocks: all, windowFrom: from, windowTo: to, auto: true };

  const first = all[0];
  const isTomorrow = forDate !== trToday();
  const payload = {
    title: isTomorrow ? '🗓️ Yarının planı hazır' : '🗓️ Günün hazır',
    message: `${all.length} blok · ilk: ${first.start} ${first.label}`,
    tag: 'aidan-autoplan',
    url: '/?tab=tasks',
  };
  await sendPushToAll(env, data, payload, { userId: u.userId });
  logPush(data, 'autoplan', payload, ((data.settings && data.settings.pushSubs) || []).length);
  try { await saveUserData(env, u.userId, data); } catch (e) { console.error('autoplan save fail', e.message); }
  return { blocks: all.length, fixed: fixed.length, first: first.start, forDate, profileDays: prof.days, ratio: prof.ratio };
}

// ============================================================
// ⏱️ Gün planı blok bildirimleri (5 dk'lık cron)
// ============================================================
// Blok saati geldiğinde "Şimdi: X" push'u — geçişi tetikleyen dürtü.
// b.pinged bayrağı → blok başına tek push. Tolerans 10 dk: cron kaçırırsa
// yine yakalar ama çok eski bloğu geç saatte patlatmaz.
// data.settings.planPings === false ise kapalı.
// 🔁 Plan kaydirma cekirdegi — kural tabanli, AI YOK.
// Biten + sabit + SU AN CALISILAN blok yerinde kalir; kalanlar cursor'dan
// itibaren bosluk doldurmali yeniden dizilir. Sigmayanlar duser.
function shiftPlanBlocks(dp, nowMin, winToStr) {
  const all = (dp.blocks || []).slice().sort((a, b) => hmMin(a.start) - hmMin(b.start));
  const fixedList = all.filter(b => b.kind === 'fixed');
  // Su an calisilan blogu YERINDE birak — kullanici tam ustunde calisiyor olabilir
  const inProg = all.find(b => b.kind !== 'fixed' && !b.done
    && hmMin(b.start) <= nowMin && nowMin < hmMin(b.end));
  const keep = all.filter(b => b.kind === 'fixed' || b.done || b === inProg);
  const movable = all.filter(b => keep.indexOf(b) === -1);
  if (!movable.length) return { placed: 0, dropped: 0, changed: false };

  const winEnd = hmMin(winToStr || '22:00');
  const dur = x => Math.max(5, hmMin(x.end) - hmMin(x.start));
  let cursor = Math.ceil(Math.max(nowMin, inProg ? hmMin(inProg.end) : nowMin) / 5) * 5;

  const remaining = movable.slice();
  const placed = [];
  let guard = 0, changed = false;
  while (remaining.length && guard++ < 300) {
    if (cursor >= winEnd) break;
    const nextFixed = fixedList.find(f => hmMin(f.start) >= cursor);
    const gapEnd = nextFixed ? Math.min(hmMin(nextFixed.start), winEnd) : winEnd;
    const idx = remaining.findIndex(x => cursor + dur(x) <= gapEnd);
    if (idx === -1) {
      if (!nextFixed) break;
      cursor = hmMin(nextFixed.end);
      continue;
    }
    const b = remaining.splice(idx, 1)[0];
    const d = dur(b);
    const ns = minHM(cursor), ne = minHM(cursor + d);
    if (b.start !== ns || b.end !== ne) { changed = true; b.pinged = false; }
    b.start = ns; b.end = ne;
    placed.push(b);
    cursor += d;
  }
  if (remaining.length) changed = true;
  dp.blocks = keep.concat(placed).sort((a, b) => hmMin(a.start) - hmMin(b.start));
  return { placed: placed.length, dropped: remaining.length, changed };
}

// dakika → 'HH:MM' (worker tarafi)
function minHM(min) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

async function runPlanBlockPings(env) {
  const users = await fetchAllUsers(env);
  const results = [];
  for (const u of users) {
    try { results.push({ userId: u.userId, ...(await runPlanBlockPingsForUser(env, u)) }); }
    catch (e) { results.push({ userId: u.userId, error: e.message }); }
  }
  return { type: 'planpings', users: users.length, results };
}

async function runPlanBlockPingsForUser(env, u) {
  const data = u.data;
  const st = data.settings || {};
  if (st.planPings === false) return { sent: 0 };
  const dp = data.dayPlan;
  if (!dp || dp.date !== trToday() || !(dp.blocks || []).length) return { sent: 0 };

  const tr = new Date(Date.now() + TR_OFFSET_MS);
  const nowMin = tr.getUTCHours() * 60 + tr.getUTCMinutes();

  // 🔁 OTOMATIK TOPARLAMA — 20+ dk gecikmis blok varsa butona basmadan yeniden diz.
  // ADHD'de plan "bir blok kacti" diye terk ediliyor; toparlanma manuel olmamali.
  // Gunde en fazla 3 kez (plan surekli oynamasin), settings.autoShift === false ile kapatilir.
  // Ping'lerden ONCE calisir — yoksa az sonra kayacak bir blok icin "simdi bunu yap" denir.
  if (st.autoShift !== false && (dp.autoShifts || 0) < 3) {
    const lateBlocks = dp.blocks.filter(b => b && !b.done && b.kind !== 'fixed'
      && hmMin(b.end) >= 0 && hmMin(b.end) <= nowMin - 20);
    if (lateBlocks.length) {
      const res = shiftPlanBlocks(dp, nowMin, st.planTo || dp.windowTo || '22:00');
      if (res.changed) {
        dp.autoShifts = (dp.autoShifts || 0) + 1;
        const nxt = dp.blocks.find(b => !b.done && b.kind !== 'fixed' && hmMin(b.start) >= nowMin);
        const payload = {
          title: '🔁 Plan yeniden dizildi',
          message: (nxt ? `Sıradaki: ${nxt.start} ${nxt.label}` : 'Kalan işler kaydırıldı')
            + (res.dropped ? ` · ${res.dropped} iş güne sığmadı` : ''),
          tag: 'aidan-autoshift',
          url: '/?tab=plan',
        };
        await sendPushToAll(env, data, payload, { userId: u.userId });
        logPush(data, 'autoshift', payload, ((data.settings && data.settings.pushSubs) || []).length);
        try { await saveUserData(env, u.userId, data); } catch (e) { console.error('autoshift save fail', e.message); }
        // Bu turda ping ATMA — yeni yerlesen blok 5 dk sonraki cron'da zaten yakalanir.
        // Ayni anda iki bildirim gonderip kafa karistirmaktansa tek net mesaj.
        return { sent: 0, shifted: res };
      }
    }
  }

  const due = [];
  for (const b of dp.blocks) {
    if (!b || b.done || b.pinged) continue;
    const sm = hmMin(b.start);
    if (sm < 0) continue;
    const diff = nowMin - sm;
    if (diff < 0 || diff > 10) continue;
    b.pinged = true;
    due.push(b);
  }
  if (!due.length) return { sent: 0 };

  for (const b of due) {
    const len = Math.max(0, hmMin(b.end) - hmMin(b.start));
    const icon = b.kind === 'break' ? '☕' : b.kind === 'fixed' ? '📌' : '▶️';
    // Aksiyon butonlari sadece calisma bloklarinda anlamli (mola/sabit blokta "baslat" sacma).
    // iOS PWA actions'i GOSTERMEZ — orada bildirime tiklama /?blk=..&act=.. fallback'i calisir.
    const isWork = b.kind !== 'break' && b.kind !== 'fixed';
    const payload = {
      title: `${icon} Şimdi: ${b.label}`,
      message: `${b.start}–${b.end}${len ? ` · ${len} dk` : ''}`,
      tag: 'aidan-block-' + b.id,
      url: '/?blk=' + b.id,
      blockId: b.id,
      actions: isWork ? [
        { action: 'start', title: 'Başlat' },
        { action: 'done', title: 'Bitti' },
        { action: 'snooze', title: '15dk ertele' },
      ] : undefined,
    };
    await sendPushToAll(env, data, payload, { userId: u.userId });
    logPush(data, 'planblock', payload, ((data.settings && data.settings.pushSubs) || []).length);
  }
  try { await saveUserData(env, u.userId, data); } catch (e) { console.error('planping save fail', e.message); }
  return { sent: due.length };
}

// ============================================================
// 💪 HEVY ENTEGRASYONU — antrenman verisi + gelişim takibi
// ============================================================
// API: https://api.hevyapp.com/v1  ·  Auth: "api-key" header
// ⚠️ SADECE Hevy Pro aboneleri anahtar uretebilir (ucretsiz hesapta 401/403).
// Sema (Hevy'nin kendi hevy-gpt reposundaki OpenAPI spec'inden dogrulandi):
//   workout: { id, title, description, start_time, end_time, updated_at, created_at,
//              exercises: [{ index, title, notes, exercise_template_id, supersets_id,
//                sets: [{ index, type, weight_kg, reps, distance_meters,
//                         duration_seconds, rpe, custom_metric }] }] }
//   Tum alanlar snake_case. pageSize MAX 10.
const HEVY_API = 'https://api.hevyapp.com/v1';
const HEVY_MAX_PAGES = 5;   // 5 x 10 = son 50 antrenman (~3-4 ay)
const HEVY_KEEP_DAYS = 180;

// Epley formulu: tahmini 1 tekrar maksimum. Gelisimi tek sayiya indirger —
// 60kg x 8 ile 70kg x 5'i kiyaslayabilmek icin gerekli.
function e1rm(kg, reps) {
  if (!(kg > 0) || !(reps > 0)) return 0;
  if (reps === 1) return kg;
  return Math.round(kg * (1 + reps / 30) * 10) / 10;
}

// ISO zaman → TR takvim gunu ('YYYY-MM-DD')
function hevyTrDate(iso) {
  const ms = Date.parse(iso);
  if (isNaN(ms)) return null;
  return new Date(ms + TR_OFFSET_MS).toISOString().slice(0, 10);
}

// Hevy workout objesi → Aidan'in kompakt formati.
// Savunmaci: alan eksik/null gelirse cokmez, sayilar Number()'a zorlanir.
function normalizeHevyWorkout(w) {
  if (!w || !w.id) return null;
  const date = hevyTrDate(w.start_time) || hevyTrDate(w.created_at);
  if (!date) return null;
  const startMs = Date.parse(w.start_time), endMs = Date.parse(w.end_time);
  const durationMin = (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs)
    ? Math.round((endMs - startMs) / 60000) : null;

  let volumeKg = 0, setCount = 0;
  const exercises = [];
  for (const ex of (w.exercises || [])) {
    if (!ex) continue;
    let exVol = 0, exSets = 0, top = null;
    for (const st of (ex.sets || [])) {
      if (!st) continue;
      const kg = Number(st.weight_kg) || 0;
      const reps = Number(st.reps) || 0;
      if (kg > 0 && reps > 0) { exVol += kg * reps; }
      if (kg > 0 || reps > 0) { exSets++; }
      // Rekor hesabina isinma setleri GIRMEZ
      if (st.type !== 'warmup' && kg > 0 && reps > 0) {
        const e = e1rm(kg, reps);
        if (!top || e > top.e1rm) top = { kg, reps, e1rm: e };
      }
    }
    volumeKg += exVol; setCount += exSets;
    exercises.push({
      name: String(ex.title || 'Egzersiz').slice(0, 60),
      tid: ex.exercise_template_id || null,
      sets: exSets,
      volumeKg: Math.round(exVol),
      top,
    });
  }
  return {
    id: String(w.id),
    date,
    title: String(w.title || 'Antrenman').slice(0, 60),
    durationMin,
    volumeKg: Math.round(volumeKg),
    setCount,
    exercises,
  };
}

// Egzersiz sablonlari -> { templateId: primary_muscle_group }.
// Kas grubu dagilimi egzersiz ADINDAN TAHMIN yerine gercek veriyle hesaplansin diye.
// Cekilemezse sessizce null doner; hcMuscleOf ad tahminine duser, akis bozulmaz.
async function hevyFetchTemplates(key) {
  if (!key) return null;
  const map = {};
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${HEVY_API}/exercise_templates?page=${page}&pageSize=100`, {
      headers: { 'api-key': key, 'Accept': 'application/json' },
    });
    if (!r.ok) break;
    let j;
    try { j = await r.json(); } catch { break; }
    const list = Array.isArray(j.exercise_templates) ? j.exercise_templates : [];
    for (const tp of list) {
      if (tp && tp.id && tp.primary_muscle_group) map[tp.id] = String(tp.primary_muscle_group);
    }
    if (!list.length) break;
    if (j.page_count && page >= j.page_count) break;
  }
  return Object.keys(map).length ? map : null;
}

// Hevy'den sayfali antrenman cek. Hata mesajlari TURKCE ve eyleme donuk.
async function hevyFetchWorkouts(key, maxPages) {
  if (!key) throw new Error('Hevy anahtarı yok');
  const out = [];
  const pages = Math.min(HEVY_MAX_PAGES, Math.max(1, maxPages || HEVY_MAX_PAGES));
  for (let page = 1; page <= pages; page++) {
    const r = await fetch(`${HEVY_API}/workouts?page=${page}&pageSize=10`, {
      headers: { 'api-key': key, 'Accept': 'application/json' },
    });
    if (r.status === 401 || r.status === 403) {
      throw new Error('Hevy anahtarı kabul edilmedi — Hevy Pro aboneliği gerekiyor ya da anahtar yanlış/iptal edilmiş.');
    }
    if (r.status === 429) throw new Error('Hevy çok fazla istek dedi, birazdan tekrar dene.');
    if (!r.ok) throw new Error('Hevy sunucu hatası: ' + r.status);
    let j;
    try { j = await r.json(); } catch { throw new Error('Hevy cevabı okunamadı'); }
    const list = Array.isArray(j.workouts) ? j.workouts : [];
    for (const w of list) { const n = normalizeHevyWorkout(w); if (n) out.push(n); }
    // Son sayfaya geldiysek dur (bos sayfa ya da page_count asildi)
    if (!list.length) break;
    if (j.page_count && page >= j.page_count) break;
  }
  return out;
}

// Yeni gelenleri mevcutla birlestir — id bazli dedupe, yeni veri kazanir
function mergeHevyWorkouts(existing, incoming) {
  const byId = new Map();
  for (const w of (existing || [])) { if (w && w.id) byId.set(w.id, w); }
  for (const w of (incoming || [])) { if (w && w.id) byId.set(w.id, w); }
  const cutoff = new Date(Date.now() + TR_OFFSET_MS - HEVY_KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  return Array.from(byId.values())
    .filter(w => w.date >= cutoff)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Egzersiz bazli en iyi tahmini 1RM — "gelisim" metrigi
function computeHevyPRs(workouts) {
  const prs = {};
  for (const w of (workouts || [])) {
    for (const ex of (w.exercises || [])) {
      if (!ex || !ex.top || !ex.top.e1rm) continue;
      const cur = prs[ex.name];
      if (!cur || ex.top.e1rm > cur.e1rm) {
        prs[ex.name] = { e1rm: ex.top.e1rm, kg: ex.top.kg, reps: ex.top.reps, date: w.date };
      }
    }
  }
  return prs;
}

// Eski rekorlarla kiyasla → yeni kirilanlar (push icin)
function newHevyPRs(oldPrs, newPrs, sinceDate) {
  const out = [];
  for (const [name, pr] of Object.entries(newPrs || {})) {
    if (sinceDate && pr.date < sinceDate) continue;   // eski rekoru tekrar kutlama
    const old = (oldPrs || {})[name];
    if (!old || pr.e1rm > old.e1rm + 0.05) out.push({ name, ...pr, prev: old ? old.e1rm : null });
  }
  return out.sort((a, b) => b.e1rm - a.e1rm);
}

// PWA'dan senkron: {key} → normalize antrenmanlar. Anahtari FRONTEND gonderir,
// worker sadece proxy'dir (CORS + anahtarin Hevy'ye gitmesi icin).
async function handleHevySyncApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://aidanapp.pages.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const userToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(env, userToken);
  if (!user) return jsonCors({ error: 'unauthorized' }, 401, cors);
  if (!allowUser(env, user)) return jsonCors({ error: 'forbidden' }, 403, cors);

  const key = (body.key || '').toString().trim();
  if (!key) return jsonCors({ error: 'Hevy anahtarı boş' }, 400, cors);
  try {
    const workouts = await hevyFetchWorkouts(key, body.pages);
    // Kas grubu haritasi sadece istenince cekilir (PWA 30 gunde bir tazeler)
    let muscles = null;
    if (body.withTemplates) { try { muscles = await hevyFetchTemplates(key); } catch (e) { muscles = null; } }
    return jsonCors({ workouts, count: workouts.length, muscles }, 200, cors);
  } catch (e) {
    return jsonCors({ error: e.message }, 502, cors);
  }
}

// Gunluk arka plan senkronu (uygulama acilmasa bile veri taze kalir) + rekor push'u
async function runHevySync(env) {
  const users = await fetchAllUsers(env);
  const results = [];
  for (const u of users) {
    try { results.push({ userId: u.userId, ...(await runHevySyncForUser(env, u)) }); }
    catch (e) { results.push({ userId: u.userId, error: e.message }); }
  }
  return { type: 'hevy', users: users.length, results };
}

async function runHevySyncForUser(env, u) {
  const data = u.data;
  const key = (data.settings && data.settings.hevyKey) || '';
  if (!key) return { skipped: 'anahtar-yok' };

  data.hevy = data.hevy || { workouts: [], prs: {} };
  const before = data.hevy.workouts || [];
  let fresh;
  try {
    fresh = await hevyFetchWorkouts(key, 3);   // cron'da 3 sayfa yeter (son 30 antrenman)
  } catch (e) {
    data.hevy.lastError = e.message;
    try { await saveUserData(env, u.userId, data); } catch (e2) {}
    return { error: e.message };
  }

  // Kas grubu haritasi yoksa ya da 30 gunden eskiyse tazele (analiz dogrulugu icin)
  const mAge = Date.now() - (data.hevy.musclesAt || 0);
  if (!data.hevy.muscles || mAge > 30 * 86400000) {
    try {
      const mm = await hevyFetchTemplates(key);
      if (mm) { data.hevy.muscles = mm; data.hevy.musclesAt = Date.now(); }
    } catch (e) {}
  }

  const merged = mergeHevyWorkouts(before, fresh);
  const oldPrs = data.hevy.prs || {};
  const prs = computeHevyPRs(merged);
  // Sadece son 3 gunun rekorlarini kutla (ilk senkronda tum gecmis patlamasin)
  const since = new Date(Date.now() + TR_OFFSET_MS - 3 * 86400000).toISOString().slice(0, 10);
  const broken = Object.keys(oldPrs).length ? newHevyPRs(oldPrs, prs, since) : [];

  data.hevy.workouts = merged;
  data.hevy.prs = prs;
  data.hevy.lastSync = Date.now();
  data.hevy.lastError = null;

  if (broken.length) {
    const top = broken.slice(0, 2);
    const payload = {
      title: broken.length > 1 ? `🏆 ${broken.length} yeni rekor` : '🏆 Yeni rekor',
      message: top.map(p => `${p.name}: ${p.kg}kg × ${p.reps}`).join(' · '),
      tag: 'aidan-hevy-pr',
      url: '/?tab=diet',
    };
    await sendPushToAll(env, data, payload, { userId: u.userId });
    logPush(data, 'hevy-pr', payload, ((data.settings && data.settings.pushSubs) || []).length);
  }

  try { await saveUserData(env, u.userId, data); } catch (e) { console.error('hevy save fail', e.message); }
  return { workouts: merged.length, added: merged.length - before.length, prs: broken.length };
}

// ============================================================
// 💾 Veri yedeği — haftalık snapshot aidan_backups tablosuna
// ============================================================
// Salim'in Supabase'inde tek satırlı aidan_data row'u var. Bozulursa/silinirse
// kurtarmak için haftada bir tüm data'nın JSON kopyasını aidan_backups'a yaz.
// Son 12 yedek korunur (~3 ay), eskileri silinir. Sessiz çalışır — push YOK.
//
// Tablo (Salim'in 1 kez Supabase SQL Editor'da çalıştırması gerek):
//   create table aidan_backups (
//     id bigint primary key generated always as identity,
//     user_id uuid not null,
//     snapshot_at timestamptz not null default now(),
//     data jsonb not null
//   );
//   create index on aidan_backups (user_id, snapshot_at desc);
//   alter table aidan_backups enable row level security;
//   create policy "users see own backups" on aidan_backups
//     for select using (auth.uid() = user_id);
//   create policy "users insert own backups" on aidan_backups
//     for insert with check (auth.uid() = user_id);
//   create policy "users delete own backups" on aidan_backups
//     for delete using (auth.uid() = user_id);
async function runBackup(env) {
  const KEEP = 12;
  const users = await fetchAllUsers(env);
  const results = [];
  for (const u of users) {
    try {
      const dataKeys = Object.keys(u.data || {}).length;
      const tasksLen = Array.isArray(u.data?.tasks) ? u.data.tasks.length : 0;
      const ins = await insertBackup(env, u.userId, u.data);
      if (!ins.ok) {
        const msg = await ins.text().catch(() => '');
        if (ins.status === 404 || (msg.includes('aidan_backups') && msg.includes('not exist'))) {
          results.push({ userId: u.userId, ok: false, reason: 'table-missing' });
          continue;
        }
        results.push({ userId: u.userId, ok: false, reason: `insert ${ins.status}`, msg: msg.slice(0, 80) });
        continue;
      }
      const deleted = await listAndPruneBackups(env, u.userId, KEEP);
      results.push({ userId: u.userId, ok: true, dataKeys, tasks: tasksLen, deleted });
    } catch (e) {
      results.push({ userId: u.userId, ok: false, reason: e.message });
    }
  }
  return { type: 'backup', users: users.length, results, multiUser: hasServiceKey(env) };
}

// ============================================================
// Static file serving (PWA host)
// ============================================================
// __STATIC_FILES__ deploy.py tarafından base64 dict ile değiştirilir.
// Form: { "/path": { "content_b64": "...", "type": "text/html; charset=utf-8" } }
const STATIC_FILES = __STATIC_FILES__;

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.telegram.org",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
  ].join('; '),
};

function base64DecodeToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function serveStatic(path) {
  const file = STATIC_FILES[path];
  if (!file) return null;
  const isHtml = path.endsWith('.html') || path === '/';
  const isSw = path === '/sw.js';
  const cacheControl = (isHtml || isSw)
    ? 'no-cache, no-store, must-revalidate'  // HTML & SW: her zaman taze
    : 'public, max-age=3600';                 // ikon, manifest: 1 saat
  return new Response(base64DecodeToBytes(file.content_b64), {
    headers: {
      'Content-Type': file.type,
      'Cache-Control': cacheControl,
      ...SECURITY_HEADERS,
    },
  });
}

// ============================================================
// 📅 Takvim (ICS) — görevleri iOS/Google takvimine abone feed
// ============================================================
// GET /calendar.ics?token=<calendarToken>
// calendarToken PWA'da üretilir, data.settings.calendarToken'a yazılır.
// Tek yönlü: Aidan → takvim. due olan görevler + countdown'lar event olur.
function icsEscape(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
function icsUtcStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear().toString()
    + p(d.getUTCMonth() + 1) + p(d.getUTCDate())
    + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}
function icsDateOnly(y, m, d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${y}${p(m)}${p(d)}`;
}
function buildIcs(data) {
  const CAT = { odev: '📚', ders: '📖', ev: '🏠', kisisel: '💜' };
  const stamp = icsUtcStamp(new Date());
  const L = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aidan//ADHD Asistani//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Aidan',
    'X-WR-TIMEZONE:Europe/Istanbul',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  for (const t of tasks) {
    if (!t || !t.due || t.done) continue;
    const [y, m, d] = String(t.due).split('-').map(Number);
    if (!y || !m || !d) continue;
    let prefix = '';
    if (t.priority === 'urgent') prefix += '🔥 ';
    if (t.category && CAT[t.category]) prefix += CAT[t.category] + ' ';
    L.push('BEGIN:VEVENT');
    L.push(`UID:aidan-task-${t.id}@aidanapp.pages.dev`);
    L.push(`DTSTAMP:${stamp}`);
    if (t.reminderTime && /^\d{1,2}:\d{2}$/.test(t.reminderTime)) {
      const [hh, mm] = t.reminderTime.split(':').map(Number);
      // TR yerel saat → UTC (TR sabit UTC+3)
      const start = new Date(Date.UTC(y, m - 1, d, hh - 3, mm, 0));
      const dur = (t.estimateMin && t.estimateMin > 0) ? t.estimateMin : 30;
      const end = new Date(start.getTime() + dur * 60000);
      L.push(`DTSTART:${icsUtcStamp(start)}`);
      L.push(`DTEND:${icsUtcStamp(end)}`);
    } else {
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      L.push(`DTSTART;VALUE=DATE:${icsDateOnly(y, m, d)}`);
      L.push(`DTEND;VALUE=DATE:${icsDateOnly(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())}`);
    }
    const desc = [];
    if (t.estimateMin) desc.push(`Tahmini ${t.estimateMin} dk`);
    if (t.notes) desc.push(t.notes);
    desc.push('Aidan');
    L.push(`SUMMARY:${icsEscape(prefix + (t.text || 'Görev'))}`);
    L.push(`DESCRIPTION:${icsEscape(desc.join(' · '))}`);
    L.push('END:VEVENT');
  }
  const cds = Array.isArray(data.countdowns) ? data.countdowns : [];
  for (const c of cds) {
    if (!c || !c.date) continue;
    const [y, m, d] = String(c.date).split('-').map(Number);
    if (!y || !m || !d) continue;
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    L.push('BEGIN:VEVENT');
    L.push(`UID:aidan-cd-${c.id}@aidanapp.pages.dev`);
    L.push(`DTSTAMP:${stamp}`);
    L.push(`DTSTART;VALUE=DATE:${icsDateOnly(y, m, d)}`);
    L.push(`DTEND;VALUE=DATE:${icsDateOnly(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())}`);
    L.push(`SUMMARY:${icsEscape('⏳ ' + (c.label || 'Geri sayım'))}`);
    L.push('DESCRIPTION:Aidan geri sayım');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
async function handleCalendarApi(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token || token.length < 8) return new Response('Not found', { status: 404 });
  let data = null;
  try {
    if (hasServiceKey(env)) {
      const users = await fetchAllUsers(env);
      const match = users.find(u => u.data && u.data.settings && u.data.settings.calendarToken === token);
      if (match) data = match.data;
    } else {
      const single = await fetchAidan(env);
      if (single.data && single.data.settings && single.data.settings.calendarToken === token) data = single.data;
    }
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
  if (!data) return new Response('Not found', { status: 404 });
  return new Response(buildIcs(data), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="aidan.ics"',
      'Cache-Control': 'public, max-age=900',
    },
  });
}

// ============================================================
// ⚖️ POST /body — tartı verisi (iOS Kısayol → Apple Health → Aidan)
// ============================================================
// Kimlik: X-Aidan-Secret header'ı (ya da ?secret=). Supabase token DEĞİL —
// iOS Kısayol'un token yenileyecek yeri yok, 1 saatlik access_token her sabah
// patlardı. Bu uç SADECE diet.weights alanlarına yazar; görev/diyet/borsa
// verisine dokunmaz, böylece secret sızsa bile hasar yüzeyi dar kalır.
//
// Kabul edilen gövde:
//   { kg, fat, lean, date }              tek ölçüm
//   { items: [{ kg, fat, lean, date }] } toplu (geçmiş dolgusu)
// Kısayol her şeyi METIN yollar — sayılar string, ondalık virgüllü olabilir.
// Apple Health yağ oranını kesir verebilir (0.182 = %18.2), ikisi de kabul edilir.

// core.js'teki bodyNum/upsertBody ile AYNI kurallar. Ayrı dosyada olduğu için
// ikiz; değiştirirsen İKİSİNİ birden değiştir (test byte karşılaştırmıyor, kural karşılaştırıyor).
function srvBodyNum(v, min, max, dec) {
  if (v == null || v === '') return null;
  const n = (typeof v === 'number') ? v
    : parseFloat(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n) || n < min || n > max) return null;
  const p = Math.pow(10, dec);
  return Math.round(n * p) / p;
}
function srvUpsertBody(diet, entry) {
  if (!entry || !entry.date) return null;
  let kg = srvBodyNum(entry.kg, 20, 500, 1);
  let fatRaw = srvBodyNum(entry.fat, 0.03, 70, 3);
  // Kesirli yağ oranı (%3'ün altı ancak kesir olabilir)
  let fat = (fatRaw != null && fatRaw < 1) ? Math.round(fatRaw * 1000) / 10 : fatRaw;
  if (fat != null && (fat < 3 || fat > 70)) fat = null;
  let lean = srvBodyNum(entry.lean, 10, 300, 1);
  if (kg == null && fat == null && lean == null) return null;
  diet.weights = diet.weights || [];
  let ex = null;
  for (const w of diet.weights) { if (w && w.date === entry.date) { ex = w; break; } }
  if (!ex) { ex = { date: entry.date }; diet.weights.push(ex); }
  if (kg != null) ex.kg = kg;
  if (fat != null) ex.fat = fat;
  if (lean != null) ex.lean = lean;
  // Birleşmiş kayıttan türet (core.js upsertBody ile aynı kural)
  else if (ex.kg != null && ex.fat != null) ex.lean = Math.round(ex.kg * (100 - ex.fat) / 100 * 10) / 10;
  ex.src = entry.src || 'health';
  diet.weights.sort((a, b) => (a.date < b.date ? -1 : 1));
  return ex;
}

async function handleBodyApi(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Aidan-Secret',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  const url = new URL(request.url);
  const given = request.headers.get('X-Aidan-Secret') || url.searchParams.get('secret') || '';
  // Yanlış secret'ta 404 — uc un varlığını sızdırma (diğer cron uçlarıyla aynı davranış)
  if (!env.WEBHOOK_SECRET || given !== env.WEBHOOK_SECRET) {
    return new Response('Not found', { status: 404, headers: cors });
  }

  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: 'bad json' }, 400, cors); }
  const raw = Array.isArray(body.items) ? body.items : [body];
  if (!raw.length || raw.length > 400) return jsonCors({ error: 'bad size' }, 400, cors);

  const session = await fetchAidan(env);
  const data = session.data;
  data.diet = data.diet || {};
  data.diet.weights = data.diet.weights || [];

  const saved = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const date = (typeof it.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.date.slice(0, 10)))
      ? it.date.slice(0, 10) : trToday();
    const rec = srvUpsertBody(data.diet, {
      date, kg: it.kg, fat: it.fat, lean: it.lean, src: it.src || 'health',
    });
    if (rec) saved.push(rec);
  }
  if (!saved.length) {
    return jsonCors({ ok: false, saved: 0, error: 'geçerli ölçüm yok' }, 422, cors);
  }
  await saveAidan(env, data, session);
  const last = saved[saved.length - 1];
  // Özet metin Kısayol'un bildirimde gösterebilmesi için — sessiz başarı = fark edilmeyen arıza
  const summary = saved.length === 1
    ? `${last.date}: ${last.kg != null ? last.kg + ' kg' : ''}${last.fat != null ? ' · %' + last.fat + ' yağ' : ''}`.trim()
    : `${saved.length} ölçüm kaydedildi (son: ${last.date})`;
  return jsonCors({ ok: true, saved: saved.length, last, summary }, 200, cors);
}

// ============================================================
// Main entry
// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // PWA AI endpoint (POST metin → AI → görev operasyonu, CORS'lu)
    if (url.pathname === '/ai') {
      return handleAiApi(request, env);
    }

    // Akşam günlüğü (POST gün özeti → AI sıcak yansıma, tool YOK)
    // AI sağlık koçu — uyku + antrenman + beslenme birlikte (POST {facts})
    if (url.pathname === '/health-coach') {
      return handleHealthCoachApi(request, env);
    }

    if (url.pathname === '/journal') {
      return handleJournalApi(request, env);
    }

    // Aidan'a sor — sohbet (POST {messages} → AI cevap, tool YOK)
    if (url.pathname === '/chat') {
      return handleChatApi(request, env);
    }

    // AI görev bölücü (POST {text} → AI küçük adımlar dizisi, tool YOK)
    if (url.pathname === '/split') {
      return handleSplitApi(request, env);
    }

    // AI gün planlayıcı (POST {tasks, from, to, now} → saat saat blok dizisi, tool YOK)
    if (url.pathname === '/plan') {
      return handlePlanApi(request, env);
    }

    // AI portföy yorumu (POST {facts} → AI betimleyici özet, tavsiye YOK, tool YOK)
    if (url.pathname === '/portfolio-comment') {
      return handlePortfolioCommentApi(request, env);
    }

    // Borsa fiyatları (POST {symbols} → Yahoo proxy)
    if (url.pathname === '/stocks') {
      return handleStocksApi(request, env);
    }

    // Tek hisse geçmiş veri — mini grafik (POST {ySymbol, range:'1mo'|'3mo'|'1y'})
    if (url.pathname === '/stock-history') {
      return handleStockHistoryApi(request, env);
    }

    // Portföy görseli → AI vision (POST {image} → sembol/adet/maliyet JSON)
    if (url.pathname === '/portfolio-image') {
      return handlePortfolioImageApi(request, env);
    }

    // Diyet programı görseli → AI vision (POST {image} → öğün/yemek/kcal JSON)
    if (url.pathname === '/diet-plan-image') {
      return handleDietPlanImageApi(request, env);
    }

    // 🎓 Classroom ekran görüntüsü → AI vision (POST {image} → ödev/son-tarih JSON)
    if (url.pathname === '/classroom-image') {
      return handleClassroomImageApi(request, env);
    }

    // Besin makro arama (POST {query} → {db, ai} kalori+protein+karb+yağ)
    if (url.pathname === '/food-macros') {
      return handleFoodMacrosApi(request, env);
    }

    // 📅 Takvim ICS feed (GET ?token=, iOS/Google abonelik)
    if (url.pathname === '/calendar.ics') {
      return handleCalendarApi(request, env);
    }

    // PWA bootstrap config (Supabase URL + anon key)
    if (url.pathname === '/config') {
      return handleConfigApi(request, env);
    }

    // 🎯 AI "Sen ne yapayım?" — context'ten tek görev önerir
    if (url.pathname === '/suggest') {
      return handleSuggestApi(request, env);
    }

    // 📈 AI teknik analiz — betimleyici (yatırım tavsiyesi DEĞİL)
    if (url.pathname === '/stock-analysis') {
      return handleStockAnalysisApi(request, env);
    }

    // 📊 Portföy teknik özet — tüm pozisyonların TA snapshot'u betimleyici özet
    if (url.pathname === '/portfolio-technical') {
      return handlePortfolioTechnicalApi(request, env);
    }

    // 📰 Hisse haberleri — Yahoo news proxy + opsiyonel AI özet
    if (url.pathname === '/stock-fundamentals') {
      return handleStockFundamentalsApi(request, env);
    }
    // 💪 Hevy antrenman senkronu
    if (url.pathname === '/hevy-sync') {
      return handleHevySyncApi(request, env);
    }
    // ⚖️ Tartı verisi — iOS Kısayol her sabah buraya POST eder
    if (url.pathname === '/body') {
      return handleBodyApi(request, env);
    }
    if (url.pathname === '/stock-news') {
      return handleStockNewsApi(request, env);
    }

    // 👥 Multi-user (davet kodlu)
    if (url.pathname === '/signup') {
      return handleSignupApi(request, env);
    }
    if (url.pathname === '/invite/create') {
      return handleInviteCreateApi(request, env);
    }
    if (url.pathname === '/invite/list') {
      return handleInviteListApi(request, env);
    }

    // Static serve (PWA) — '/' → asistan.html, ve diğer asset'ler
    if (request.method === 'GET') {
      let path = url.pathname;
      if (path === '/') path = '/asistan.html';
      // Cron test mi yoksa static mi?
      const cronType = url.searchParams.get('type');
      if (cronType && url.pathname === '/') {
        // Eski test URL'leri: /?type=morning — secret zorunlu
        const providedSecret = url.searchParams.get('secret');
        if (!providedSecret || providedSecret !== env.WEBHOOK_SECRET) {
          return new Response('Not found', { status: 404 });
        }
        try {
          const result = cronType === 'stocks'
            ? await runStockCheck(env)
            : cronType === 'portfolio'
            ? await runPortfolioSummary(env)
            : cronType === 'reminders'
            ? await runFixedReminders(env)
            : cronType === 'health'
            ? await runCronJob(env, 'health')
            : cronType === 'backup'
            ? await runBackup(env)
            : cronType === 'autoplan'
            ? await runAutoPlan(env, { trigger: 'manual' })
            : cronType === 'autoplan-tomorrow'
            ? await runAutoPlan(env, { trigger: 'manual', forDate: trDate(1) })
            : cronType === 'planpings'
            ? await runPlanBlockPings(env)
            : cronType === 'hevy'
            ? await runHevySync(env)
            : await runCronJob(env, cronType);
          return new Response(JSON.stringify(result, null, 2), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }, null, 2), {
            status: 500, headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      // Static serve
      const staticResp = serveStatic(path);
      if (staticResp) return staticResp;
    }

    return new Response('Not found', { status: 404 });
  },

  // ============================================================
  // TEK CRON MIMARISI (Agu 2026)
  // ============================================================
  // Cloudflare ucretsiz planda worker basina 3 cron trigger siniri var.
  // wrangler.toml'da 9 tanimliydi -> fazlasi Cloudflare'de HIC kaydolmamis;
  // sabit hatirlatici (takviye), gun plani blok bildirimi, deadline uyarisi,
  // haftalik review, borsa alarmi, portfoy ozeti ve veri yedegi aylardir
  // calismiyordu (data.reminders[*].lastFired hep null kaldi, pushLog'da
  // hic 'reminder' kaydi yok). Tanisi: 8 hatirlatici kurulu, 0 push.
  //
  // Cozum: TEK '*/5 * * * *' tetikleyici. Hangi isin vakti geldigine TR
  // saatine bakarak burada karar veriliyor. Gunde 288 istek (limit 100K/gun).
  //
  // Hedef saatler 5'in kati secildi: tur 5 dk'da bir geldigi icin her hedefe
  // tam bir tur denk gelir. at() penceresi 5 dk tolerans tanir (cron kayarsa
  // is atlanmaz), ayni hedefe iki tur giremez.
  async scheduled(event, env, ctx) {
    const tr = new Date(Date.now() + TR_OFFSET_MS);
    const nowMin = tr.getUTCHours() * 60 + tr.getUTCMinutes();
    const dow = tr.getUTCDay();               // 0 = Pazar
    const isWeekday = dow >= 1 && dow <= 5;
    const at = (h, m) => nowMin >= h * 60 + m && nowMin < h * 60 + m + 5;
    const jobs = [];

    // HER TURDA: sabit hatirlatici (takviye) + gun plani blok bildirimleri.
    // Ikisinin de kendi lastFired guard'i var, sik cron'da tek atarlar.
    jobs.push(runFixedReminders(env));
    jobs.push(runPlanBlockPings(env));

    // 08:00 - sabah brifingi + guvenlik agi planlama (aksam planlayamadiysa
    // sabah bugunu planlar; plan zaten varsa dokunmaz)
    if (at(8, 0)) jobs.push(
      runCronJob(env, 'morning').then(() => runAutoPlan(env, { trigger: 'morning' }))
    );

    // 09:00 - deadline uyarisi
    if (at(9, 0)) jobs.push(runCronJob(env, 'deadline'));

    // 12:00 - ogle check-in
    if (at(12, 0)) jobs.push(runCronJob(env, 'noon'));

    // 21:00 - aksam ozeti -> Hevy senkron -> YARININ plani.
    // Hevy once senkronlanir: bugunun antrenmani plan gecmisine islensin,
    // planlayici yarini kurarken antrenman gununu bilsin.
    if (at(21, 0)) jobs.push(
      runCronJob(env, 'evening')
        .then(() => runHevySync(env).catch(e => console.error('hevy sync', e.message)))
        .then(() => runAutoPlan(env, { trigger: 'evening', forDate: trDate(1) }))
    );

    // Pazar 21:00 - haftalik gorev ozeti + haftalik SAGLIK analizi
    // (aksam ozetiyle ayni saat; eskiden de iki ayri trigger olarak boyleydi)
    if (dow === 0 && at(21, 0)) jobs.push(
      runCronJob(env, 'weekly').then(() => runCronJob(env, 'health'))
    );

    // Hafta ici 10:00-18:00 arasi, 30 dk'da bir - borsa alarm kontrolu
    if (isWeekday && nowMin >= 600 && nowMin < 1080 && nowMin % 30 < 5) {
      jobs.push(runStockCheck(env));
    }

    // Hafta ici 18:30 - BIST kapanisi sonrasi portfoy ozeti
    if (isWeekday && at(18, 30)) jobs.push(runPortfolioSummary(env));

    // Pazartesi 03:00 - haftalik veri yedegi (aidan_backups)
    if (dow === 1 && at(3, 0)) jobs.push(runBackup(env));

    // allSettled: bir is patlarsa digerleri devam etsin (eskiden tek is vardi,
    // artik ayni turda birden fazla is olabilir).
    ctx.waitUntil(Promise.allSettled(jobs).then(rs => {
      const bad = rs.filter(r => r.status === 'rejected');
      if (bad.length) console.error('cron fail:', bad.map(x => (x.reason && x.reason.message) || x.reason).join(' | '));
    }));
  },
};
