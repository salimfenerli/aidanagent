/**
 * Aidan Cloudflare Worker
 * - Cron: günde 4 brifing (sabah/öğle/akşam/deadline) Telegram'a
 * - Webhook: Telegram'dan gelen mesajları AI ile yorumla, Aidan'a uygula
 *
 * Environment variables (Cloudflare → Worker → Settings → Variables):
 *   SUPABASE_URL          — https://xxxxx.supabase.co
 *   SUPABASE_KEY          — anon/publishable key
 *   AIDAN_EMAIL           — kullanıcı email
 *   AIDAN_PASSWORD        — kullanıcı şifre (Secret)
 *   TELEGRAM_BOT_TOKEN    — BotFather token (Secret)
 *   TELEGRAM_CHAT_ID      — kullanıcının chat id'si
 *   WEBHOOK_SECRET        — webhook auth secret (Secret)
 *
 * Bindings:
 *   AI                    — Workers AI
 *
 * Manuel test: https://<url>/?type=morning|noon|evening|deadline
 */

const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

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
    data: rows[0]?.data || { tasks: [], checkins: [], dumps: [], routines: [], pomoToday: { date: trToday(), count: 0 }, pomoHistory: {}, settings: {} },
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
// Telegram
// ============================================================
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendTg(env, { title, message, chatId, silent = false, replyToMessageId = null }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const cid = chatId || env.TELEGRAM_CHAT_ID;
  if (!token || !cid) throw new Error('Telegram config eksik');
  const text = title ? `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(message)}` : escapeHtml(message);
  const body = {
    chat_id: cid, text, parse_mode: 'HTML',
    disable_notification: silent, disable_web_page_preview: true,
  };
  if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error('Telegram send fail:', r.status, await r.text());
}

async function sendTyping(env, chatId) {
  const token = env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  }).catch(() => {});
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

function buildMorning(data) {
  const today = trToday();
  const tasks = data.tasks || [];
  const mit = tasks.filter(t => t.mitDate === today && !t.done);
  const urgent = tasks.filter(t => t.priority === 'urgent' && !t.done);
  const dueToday = tasks.filter(t => t.due === today && !t.done);
  const dueTomorrow = tasks.filter(t => t.due === trDate(1) && !t.done);
  const overdue = tasks.filter(t => t.due && t.due < today && !t.done);

  const lines = [`🌅 Günaydın Salim`];
  if (mit.length) {
    lines.push('', `⭐ Bugünün 3'ü:`);
    mit.forEach(t => lines.push(`  • ${t.text}`));
  } else {
    // MIT seçilmediyse akıllı öneri yap
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
      lines.push('', `💡 Uygunsa PWA'da ⭐'lara tıkla, ya da bana "MIT 1 2 3" yaz.`);
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
  return { title: '🌅 Sabah brifingi', message: lines.join('\n') };
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
  const tasks = data.tasks || [];
  const doneToday = tasks.filter(t => t.doneDate === today);
  const mit = tasks.filter(t => t.mitDate === today);
  const mitDone = mit.filter(t => t.done).length;
  const pomoToday = data.pomoToday?.date === today ? (data.pomoToday.count || 0) : 0;

  const lines = [`🌙 Günü kapatma`];
  lines.push('', `✅ Bitirdiklerin: ${doneToday.length}`);
  doneToday.slice(0, 5).forEach(t => lines.push(`  • ${t.text}`));
  lines.push('', `⭐ MIT: ${mitDone}/${mit.length}`);
  lines.push(`🍅 Pomodoro: ${pomoToday}`);
  const tomorrow = trDate(1);
  const tomorrowTasks = tasks.filter(t => t.due === tomorrow && !t.done);
  if (tomorrowTasks.length) {
    lines.push('', `📅 Yarın için ${tomorrowTasks.length} görev:`);
    tomorrowTasks.slice(0, 4).forEach(t => lines.push(`  • ${t.text}`));
  }
  if (doneToday.length === 0 && mit.length === 0) {
    lines.push('', `💜 Bugün zor bir gün olmuş olabilir. Yarın yeni bir başlangıç.`);
  } else if (mitDone === mit.length && mit.length > 0) {
    lines.push('', `🎉 Tüm MIT'leri bitirdin, harika gün!`);
  }
  return { title: '🌙 Akşam özet', message: lines.join('\n') };
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

async function runCronJob(env, type) {
  const { data } = await fetchAidan(env);
  let payload = null;
  switch (type) {
    case 'morning':  payload = buildMorning(data); break;
    case 'noon':     payload = buildNoon(data); break;
    case 'evening':  payload = buildEvening(data); break;
    case 'deadline': payload = buildDeadlineAlerts(data); break;
    default: throw new Error(`Bilinmeyen tip: ${type}`);
  }
  if (!payload) return { type, sent: false, reason: 'no-content' };
  await sendTg(env, payload);
  return { type, sent: true };
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
];

// ============================================================
// AI ile mesaj yorumla
// ============================================================
function buildSystemPrompt(data) {
  const today = trToday();
  const tasks = data.tasks || [];
  const mit = tasks.filter(t => t.mitDate === today && !t.done);
  const totalActive = tasks.filter(t => !t.done).length;

  return `Sen Aidan'sın — Salim'in ADHD asistanı.

⚠️ KRİTİK KURALLAR:
1. CEVAPLAR HER ZAMAN TÜRKÇE OLMALI. İngilizce ASLA yazma.
2. KISA cevap (1-2 cümle), samimi, "Salim" diye hitap et.
3. "Your input is not sufficient" gibi şablon İngilizce mesajları ASLA verme — onun yerine Türkçe ve samimi konuş.
4. Bilmiyorsan "anlamadım, biraz daha açar mısın?" gibi Türkçe yaz.

📅 Bugün: ${trDayName()}, ${today} (${trClock()})
📊 ${totalActive} aktif görev. ⭐ MIT: ${mit.length ? mit.map(t => t.text).join(', ') : 'yok'}

Tarih:
- "bugün" = ${today}
- "yarın" = ${trDate(1)}
- "salı/çarşamba" → en yakın o gün
- Saat: HH:MM

NE ZAMAN TOOL ÇAĞIR:
- "ekle/yap/hatırlat" → add_task
- "ne var/göster/listele" → list_tasks
- "bitti/yaptım" → complete_task
- "sil/iptal" → delete_task
- "özet/durum/brifing/ne yapayım" → show_briefing
- "X'i MIT yap / öncelikli olsun / bugünün 3'üne ekle" → set_mit
- "X'i MIT'ten çıkar" → unset_mit
- "X'i yarına at / salıya ertele / kaydır" → postpone_task
- "şunu unutma/aklımda olsun" → brain_dump

NE ZAMAN TOOL ÇAĞIRMA (sadece sohbet):
- Selam/merhaba/naber/iyi akşamlar → Türkçe samimi cevap
- Teşekkür/sağol → "rica ederim" tarzı
- "Neler yapabilirsin" → kısa Türkçe açıklama

ÖRNEK SOHBETLER:
Kullanıcı: "naber"
Sen: "İyiyim Salim, sen nasılsın? Yardımcı olabileceğim bir şey var mı?"

Kullanıcı: "selam"
Sen: "Selam Salim 👋 Bugün ne yapıyoruz?"

Kullanıcı: "saol"
Sen: "Rica ederim 💜"

Kullanıcı: "nasılsın"
Sen: "Burdayım, hazırım. Senin moralin nasıl?"

Kullanıcı: "iyi geceler"
Sen: "İyi geceler Salim, yarın görüşürüz 🌙"

Kullanıcı: "yapabildiğin neler"
Sen: "Görev ekleyebilirim, listeleyebilirim, mood kaydederim, bugünün özetini veririm, brain dump'a not alırım. Doğal yaz, anlarım."

ÖRNEK TOOL ÇAĞRILARI:
"yarın matematik ödevi" → add_task(text="matematik ödevi", due="yarın", category="odev")
"perşembe matematik özel dersim var 16:00" → add_task(text="matematik özel dersi", due="perşembe", category="ders", reminder_time="16:00")
"her salı 17:00 fizik özel ders" → add_task(text="fizik özel dersi", category="ders", reminder_time="17:00", repeat="weekly")
"matematik bitti" → complete_task(query="matematik")
"bugün ne yapayım" → show_briefing()
"akşam 7'de ilaç hatırlat" → add_task(text="ilaç al", reminder_time="19:00")
"şunu unutma: yeni şarj kablosu lazım" → brain_dump(text="yeni şarj kablosu lazım")
"matematik ödevini MIT yap" → set_mit(query="matematik")
"tarih kitabını yarına at" → postpone_task(query="tarih", to="yarın")
"fizik ödevini salıya kaydır" → postpone_task(query="fizik", to="salı")

ASLA "tool çağırıyorum" yazma. Doğrudan çağır. Tool sonrası ek yorum yazma.`;
}

async function aiInterpret(env, data, userText) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(data) },
    { role: 'user', content: userText },
  ];

  const r = await env.AI.run(AI_MODEL, {
    messages,
    tools: TOOL_SCHEMAS,
    max_tokens: 512,
    temperature: 0.3,
  });

  return r; // { response: '...', tool_calls?: [...] }
}

// ============================================================
// Webhook handler
// ============================================================
async function transcribeVoice(env, fileId) {
  const token = env.TELEGRAM_BOT_TOKEN;
  // 1) file_path al
  const info = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`).then(r => r.json());
  if (!info.ok) throw new Error('getFile fail: ' + JSON.stringify(info));
  const filePath = info.result.file_path;
  // 2) Sesi indir
  const audioResp = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  const audioBuffer = await audioResp.arrayBuffer();
  // 3) Whisper'a ver
  const audioArray = [...new Uint8Array(audioBuffer)];
  const transcribe = await env.AI.run('@cf/openai/whisper', { audio: audioArray });
  return (transcribe.text || '').trim();
}

async function handleWebhook(request, env) {
  // Auth
  const provided = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (provided !== env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const update = await request.json();
  const msg = update.message || update.edited_message;
  if (!msg) return new Response('OK');

  const chatId = msg.chat.id;
  let text = '';
  let wasVoice = false;

  if (msg.voice || msg.audio) {
    // Sesli mesaj
    wasVoice = true;
    await sendTyping(env, chatId);
    try {
      const fileId = (msg.voice || msg.audio).file_id;
      text = await transcribeVoice(env, fileId);
      if (!text) {
        await sendTg(env, { chatId, message: '🎤 Sesi anlayamadım, tekrar dener misin?' });
        return new Response('OK');
      }
      // Salim'e ne duyduğumuzu göster (yanlışsa fark etsin)
      await sendTg(env, { chatId, message: `🎤 Duyduğum: "${text}"`, silent: true });
    } catch (e) {
      console.error('Voice error:', e);
      await sendTg(env, { chatId, message: `🎤 Ses çevirme hatası: ${e.message}` });
      return new Response('OK');
    }
  } else if (msg.text) {
    text = msg.text.trim();
  } else {
    return new Response('OK'); // text yok, voice yok → ignore
  }

  // Sadece sahibine cevap ver
  if (String(chatId) !== String(env.TELEGRAM_CHAT_ID)) {
    await sendTg(env, { message: 'Bu bot kişisel kullanıma özel.', chatId });
    return new Response('OK');
  }

  // /start ve /help
  if (text === '/start') {
    await sendTg(env, {
      chatId,
      title: '🧠 Aidan',
      message: 'Selam Salim! Ben Aidan. Bana yaz veya 🎤 sesli mesaj at:\n\n• "yarın matematik ödevi"\n• "bugün ne yapayım"\n• "matematik bitti"\n• "akşam 19\'da ilaç hatırlat"\n\nGörevlerin Aidan PWA ile senkron, telefon/PC her yerden gör. /help yazarsan tüm komutları gör.'
    });
    return new Response('OK');
  }
  if (text === '/help') {
    await sendTg(env, {
      chatId,
      title: 'Komutlar',
      message: 'Doğal dille yaz veya 🎤 sesli mesaj at, anlarım.\n\n📝 EKLEMEK:\n• "yarın matematik ödevi"\n• "akşam 8\'de ilaç hatırlat"\n• "alışveriş yapmam lazım"\n\n📋 GÖRMEK:\n• "ne var bugün"\n• "acil olanlar"\n• "bitenleri göster"\n\n✅ BİTİRMEK:\n• "matematik bitti"\n• "X yaptım"\n\n🗑️ SİLMEK:\n• "X\'i sil"\n\n🌅 ÖZET:\n• "bugün ne yapayım"\n• "durum"\n• "brifing"\n\n🧠 BRAIN DUMP:\n• "şunu unutma..."\n• "aklımda olsun..."'
    });
    return new Response('OK');
  }

  // Typing indicator
  await sendTyping(env, chatId);

  try {
    const session = await fetchAidan(env);
    const ctx = { data: session.data, dirty: false };

    const ai = await aiInterpret(env, session.data, text);

    // Tool çağrıları (Workers AI Llama format)
    const toolCalls = ai.tool_calls || [];
    const replies = [];

    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        const name = call.name || (call.function && call.function.name);
        let args = call.arguments || (call.function && call.function.arguments) || {};
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch { args = {}; }
        }
        const handler = TOOL_HANDLERS[name];
        if (!handler) {
          replies.push(`⚠️ Bilinmeyen tool: ${name}`);
          continue;
        }
        try {
          const result = await handler(args, ctx);
          replies.push(result.reply);
        } catch (e) {
          replies.push(`❌ ${name} hata: ${e.message}`);
        }
      }

      if (ctx.dirty) {
        await saveAidan(env, ctx.data, session);
      }

      const finalReply = replies.join('\n\n');
      await sendTg(env, { chatId, message: finalReply });
    } else {
      // Düz sohbet cevabı
      let reply = (ai.response || '').trim();
      // İngilizce/şablon fallback'leri filtrele
      const englishGarbage = [
        /your input is not sufficient/i,
        /please provide more details/i,
        /^i'?m sorry/i,
        /^i don'?t understand/i,
        /^as an ai/i,
        /^i cannot/i,
      ];
      const isEnglishJunk = englishGarbage.some(rx => rx.test(reply));
      if (!reply || isEnglishJunk) {
        const friendly = [
          'Burdayım, ne yapıyoruz?',
          'Selam Salim 👋',
          'Naber? Yardım edebileceğim bir şey var mı?',
          'Anlamadım, biraz daha açar mısın?',
        ];
        reply = friendly[Math.floor(Math.random() * friendly.length)];
      }
      await sendTg(env, { chatId, message: reply });
    }
  } catch (e) {
    console.error('Webhook error:', e);
    await sendTg(env, { chatId, message: `❌ Hata: ${e.message}` });
  }

  return new Response('OK');
}

// ============================================================
// Main entry
// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Telegram webhook
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    // Manuel cron testi (GET) — secret param zorunlu (spam'i önler)
    if (request.method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!providedSecret || providedSecret !== env.WEBHOOK_SECRET) {
        // Saldırgana bilgi sızdırmamak için sade 404
        return new Response('Not found', { status: 404 });
      }
      const type = url.searchParams.get('type') || 'morning';
      try {
        const result = await runCronJob(env, type);
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }, null, 2), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    let type;
    switch (event.cron) {
      case '0 5 * * *':  type = 'morning'; break;
      case '0 6 * * *':  type = 'deadline'; break;
      case '0 9 * * *':  type = 'noon'; break;
      case '0 18 * * *': type = 'evening'; break;
      default:           type = 'morning';
    }
    ctx.waitUntil(runCronJob(env, type));
  },
};
