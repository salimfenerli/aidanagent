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

// === TELEGRAM EMEKLİLİĞİ ===
// Haz 4 2026: Salim PWA-only kullanıma geçti (push ✅ + AI ✅ + sesli ✅).
// true iken: webhook auto-reply, cron sendTg yorum satırı (push tek kanal).
// false iken: eski davranış (webhook AI/Whisper işler, cron Telegram + push).
// Rollback için bu tek satırı çevir, deploy et.
const TELEGRAM_RETIRED = true;

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

async function sendTg(env, { title, message, chatId, silent = false, replyToMessageId = null, replyMarkup = null }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const cid = chatId || env.TELEGRAM_CHAT_ID;
  if (!token || !cid) throw new Error('Telegram config eksik');
  const text = title ? `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(message)}` : escapeHtml(message);
  const body = {
    chat_id: cid, text, parse_mode: 'HTML',
    disable_notification: silent, disable_web_page_preview: true,
  };
  if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
  if (replyMarkup) body.reply_markup = replyMarkup;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error('Telegram send fail:', r.status, await r.text());
}

async function answerCallback(env, callbackQueryId, text, showAlert = false) {
  const token = env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '', show_alert: showAlert }),
  }).catch(() => {});
}

async function clearReplyMarkup(env, chatId, messageId) {
  const token = env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
  }).catch(() => {});
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

function buildMorning(data) {
  const today = trToday();
  const tasks = data.tasks || [];
  const mit = tasks.filter(t => t.mitDate === today && !t.done);
  const urgent = tasks.filter(t => t.priority === 'urgent' && !t.done);
  const dueToday = tasks.filter(t => t.due === today && !t.done);
  const dueTomorrow = tasks.filter(t => t.due === trDate(1) && !t.done);
  const overdue = tasks.filter(t => t.due && t.due < today && !t.done);

  const lines = [`🌅 Günaydın Salim`];
  let replyMarkup = null;
  if (mit.length) {
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

  const catLabels = { odev: 'Ödev', ders: 'Özel Ders', ev: 'Ev', kisisel: 'Kişisel' };
  const factsForAi = [
    `Bu hafta ${doneThisWeek.length} görev bitirdi.`,
    mitDoneThisWeek.length ? `MIT olarak ${mitDoneThisWeek.length} tanesini bitirdi.` : '',
    topCategoryEntry ? `En çok ${catLabels[topCategoryEntry[0]] || topCategoryEntry[0]} kategorisinde çalıştı (${topCategoryEntry[1]}).` : '',
    pomoTotal ? `${pomoTotal} pomodoro yaptı.` : '',
    overdueNow.length ? `${overdueNow.length} gecikmiş görev hâlâ bekliyor.` : '',
    estimateNote ? `Tahmin doğruluğu: ${estimateNote}.` : '',
  ].filter(Boolean).join(' ');

  let aiComment = '';
  try {
    const r = await env.AI.run(AI_MODEL, {
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
    tag: 'aidan-cron',
    data: { url: '/' },
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
    try { await saveAidan(env, data, sessionInfo); } catch (e) { console.error('pushSub cleanup save fail', e.message); }
  }
}

async function runCronJob(env, type) {
  const { data, token, userId } = await fetchAidan(env);
  let payload = null;
  switch (type) {
    case 'morning':  payload = buildMorning(data); break;
    case 'noon':     payload = buildNoon(data); break;
    case 'evening':  payload = buildEvening(data); break;
    case 'deadline': payload = buildDeadlineAlerts(data); break;
    case 'weekly':   payload = await buildWeekly(env, data); break;
    default: throw new Error(`Bilinmeyen tip: ${type}`);
  }
  if (!payload) return { type, sent: false, reason: 'no-content' };
  // Telegram emekli ise sadece push gönder, değilse iki kanaldan da
  if (!TELEGRAM_RETIRED) await sendTg(env, payload);
  const subs = (data.settings && data.settings.pushSubs) || [];
  await sendPushToAll(env, data, payload, { token, userId });
  // Bildirim geçmişi — PWA "📬 Son 7 gün" listesinde gösterilir
  logPush(data, type, payload, subs.length);
  try { await saveAidan(env, data, { token, userId }); } catch (e) { console.error('pushLog save fail', e.message); }
  return { type, sent: true, channel: TELEGRAM_RETIRED ? 'push-only' : 'push+telegram' };
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
- "X'in saatini değiştir / X'i acil yap / X'in tahmini şu kadar" → update_task
- "X'e şu adımı ekle / altına şunu yaz" → add_subtask
- "X'e dair ne var / X ile ilgili görevler" → find_task
- "tarih kitabı 50-100 sayfa salıya / fizik 5 konuyu haftaya yay / ödev böl" → add_homework_series
- "X serisini cumaya kaydır / yeniden dağıt" → reschedule_series
- "seriler / kaç ödev kaldı" → list_series
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
"matematik ödevini 30 dakika yap / tahmini değiştir" → update_task(query="matematik", estimate_min=30)
"fizik ödevinin saatini 18:30'a al" → update_task(query="fizik", reminder_time="18:30")
"tarih ödevini acil yap" → update_task(query="tarih", priority="urgent")
"matematik ödevine 'soruları çöz' adımını ekle" → add_subtask(query="matematik", text="soruları çöz")
"fizikle ilgili ne var" → find_task(query="fizik")
"tarih kitabı 50-100 sayfa salıya bitsin" → add_homework_series(name="Tarih kitabı", deadline="salı", pages_from=50, pages_to=100, category="odev")
"fizik 5 konuyu önümüzdeki haftaya yay" → add_homework_series(name="Fizik", deadline="gelecek hafta", chunks=5, category="odev")
"tarih serisini cumaya kaydır" → reschedule_series(series_name="tarih", new_deadline="cuma")
"kaç ödev serisi var" → list_series()

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

// Inline button (callback_query) — sabah brifingi MIT öneri butonları
async function handleCallback(cb, env) {
  const chatId = cb.message?.chat?.id;
  const userId = cb.from?.id;
  const messageId = cb.message?.message_id;

  // Sadece sahibine cevap
  if (String(userId) !== String(env.TELEGRAM_CHAT_ID)) {
    await answerCallback(env, cb.id, 'Yetkisiz', true);
    return new Response('OK');
  }

  const data = cb.data || '';
  let targetDate, rest, isTomorrow;
  if (data.startsWith('mit_tmrw:')) {
    targetDate = trDate(1);
    rest = data.slice('mit_tmrw:'.length);
    isTomorrow = true;
  } else if (data.startsWith('mit:')) {
    targetDate = trToday();
    rest = data.slice(4);
    isTomorrow = false;
  } else {
    await answerCallback(env, cb.id, '');
    return new Response('OK');
  }

  // Parse: "<taskId>" veya "all:<id1,id2,id3>"
  let taskIds = [];
  if (rest.startsWith('all:')) {
    taskIds = rest.slice(4).split(',').filter(Boolean);
  } else if (rest) {
    taskIds = [rest];
  }
  if (!taskIds.length) {
    await answerCallback(env, cb.id, '❌ Geçersiz buton');
    return new Response('OK');
  }

  // Aidan verisini al
  let session, tasks;
  try {
    session = await fetchAidan(env);
    tasks = session.data.tasks || [];
  } catch (e) {
    await answerCallback(env, cb.id, `❌ Veri okunamadı: ${e.message}`, true);
    return new Response('OK');
  }

  const currentMitCount = tasks.filter(t => t.mitDate === targetDate && !t.done).length;
  let slotsLeft = Math.max(0, 3 - currentMitCount);
  const dayLabel = isTomorrow ? 'Yarının' : 'Bugünün';
  if (slotsLeft === 0) {
    await answerCallback(env, cb.id, `❌ ${dayLabel} 3'ü dolu.`, true);
    return new Response('OK');
  }

  const added = [];
  const alreadyMit = [];
  const notFound = [];
  for (const tid of taskIds) {
    if (slotsLeft <= 0) break;
    const t = tasks.find(x => String(x.id) === String(tid));
    if (!t) { notFound.push(tid); continue; }
    if (t.done) { notFound.push(tid); continue; }
    if (t.mitDate === targetDate) { alreadyMit.push(t.text); continue; }
    t.mitDate = targetDate;
    added.push(t.text);
    slotsLeft--;
  }

  if (added.length === 0) {
    const msg = alreadyMit.length
      ? `⭐ Zaten ${dayLabel.toLowerCase()} MIT'inde (${alreadyMit.length})`
      : '❌ Görev bulunamadı';
    await answerCallback(env, cb.id, msg);
    return new Response('OK');
  }

  // Kaydet
  try {
    await saveAidan(env, session.data, session);
  } catch (e) {
    await answerCallback(env, cb.id, `❌ Kayıt hatası: ${e.message}`, true);
    return new Response('OK');
  }

  // Popup feedback
  const target = isTomorrow ? 'yarına' : "MIT'e";
  const popup = added.length === 1
    ? `⭐ ${target} eklendi`
    : `⭐ ${added.length} görev ${target} eklendi`;
  await answerCallback(env, cb.id, popup);

  // Butonları kaldır + kısa onay mesajı
  if (chatId && messageId) {
    await clearReplyMarkup(env, chatId, messageId);
  }
  const confirmTitle = isTomorrow ? `✅ Yarına MIT eklendi:` : `✅ MIT'e eklendi:`;
  const confirmLines = [confirmTitle];
  added.forEach(name => confirmLines.push(`  ⭐ ${name}`));
  if (alreadyMit.length) confirmLines.push(`(zaten ${dayLabel.toLowerCase()} MIT'inde: ${alreadyMit.length})`);
  await sendTg(env, { chatId, message: confirmLines.join('\n'), silent: true });

  return new Response('OK');
}

async function handleWebhook(request, env) {
  // Auth
  const provided = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (provided !== env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const update = await request.json();

  // === TELEGRAM EMEKLİ (Faz 3, Haz 4 2026) ===
  // Gelen her mesaja tek bir auto-reply: "Aidan artık PWA'da". AI/Whisper/tool processing YOK
  // (token + quota tasarrufu). Sahibine bir kez bilgi mesajı gönder, sonra herkes için sessiz.
  // Rollback: bu if-bloğunu kaldır → eski webhook akışı tekrar çalışır.
  // Faz 4 = bu blok + altındaki tüm kodun silinmesi.
  if (TELEGRAM_RETIRED) {
    try {
      const msg0 = update.message || update.edited_message;
      const chatId = msg0 && msg0.chat && msg0.chat.id;
      const senderId = msg0 && msg0.from && msg0.from.id;
      // Sadece hesap sahibine bilgi mesajı, anti-flood için günlük 1 kez (in-memory KV yok, hep gönder)
      if (chatId && String(senderId) === String(env.TELEGRAM_CHAT_ID)) {
        await sendTg(env, {
          chatId,
          title: '🌙 Aidan emekli',
          message: 'Aidan artık tarayıcıdan çalışıyor:\n\n📲 https://aidanapp.pages.dev\n\nGörev ekleme, sesli giriş, AI yorumlama, bildirim — hepsi orada. Telegram bot sessiz, mesajların işlenmiyor. PWA\'yı kullan 💜',
        });
      }
    } catch (e) { console.error('emekli reply hatası', e.message); }
    return new Response('OK');
  }

  // Inline button tıklaması
  if (update.callback_query) {
    return await handleCallback(update.callback_query, env);
  }

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
      message: 'Doğal dille yaz veya 🎤 sesli mesaj at.\n\n📝 EKLEMEK:\n• "yarın matematik ödevi"\n• "akşam 8\'de ilaç hatırlat"\n• "her salı 17:00 fizik özel ders"\n\n📋 GÖRMEK:\n• "ne var bugün" · "acil olanlar"\n• "X ile ilgili görevler" (arama)\n• "seriler" / "kaç ödev var"\n\n✅ BİTİRMEK / SİLMEK:\n• "matematik bitti" · "X\'i sil"\n\n✏️ DÜZENLEMEK:\n• "matematik tahminini 30dk yap"\n• "fizik saatini 18:30\'a al"\n• "tarih ödevini acil yap"\n• "matematiğe \'soruları çöz\' ekle" (alt adım)\n\n📅 ERTELEMEK:\n• "X\'i yarına at" · "X\'i salıya kaydır"\n\n⭐ MIT (bugünün 3\'ü):\n• "X\'i MIT yap" · "X\'i MIT\'ten çıkar"\n\n📚 ÖDEV SERİSİ:\n• "tarih kitabı 50-100 sayfa salıya bitsin"\n• "fizik 5 konuyu haftaya yay"\n• "tarih serisini cumaya kaydır"\n\n🌅 ÖZET:\n• "bugün ne yapayım" · "durum" · "brifing"\n\n🧠 BRAIN DUMP:\n• "şunu unutma..." · "aklımda olsun..."'
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
// PWA AI endpoint — Telegram'daki AI beynini PWA'dan erişilebilir yapar
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
  if (env.AIDAN_EMAIL && user.email && user.email.toLowerCase() !== env.AIDAN_EMAIL.toLowerCase()) {
    return jsonCors({ error: 'forbidden' }, 403, cors);
  }

  try {
    const session = await fetchAidan(env);
    const ctx = { data: session.data, dirty: false };
    const ai = await aiInterpret(env, session.data, text);
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
      if (ctx.dirty) await saveAidan(env, ctx.data, session);
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
  if (env.AIDAN_EMAIL && user.email && user.email.toLowerCase() !== env.AIDAN_EMAIL.toLowerCase()) {
    return jsonCors({ error: 'forbidden' }, 403, cors);
  }

  try {
    // Bugün biten görev sayısı — yansımaya somutluk katar
    const session = await fetchAidan(env);
    const todayStr = trToday();
    const doneToday = (session.data.tasks || []).filter(t => t.doneDate === todayStr).length;

    const r = await env.AI.run(AI_MODEL, {
      messages: [
        { role: 'system', content: "Sen Aidan'sın, Salim'in ADHD asistanı. Salim sana gününü anlatıyor (akşam günlüğü). Görevin: KISA (3-4 cümle), TÜRKÇE, sıcak, yargısız bir yansıma yaz. Önce duygusunu duyduğunu göster (validate et), sonra günün içinden 1 olumlu şey vurgula, gerekirse nazik 1 küçük öneri. ASLA ders verme, ASLA 'ama şunu da yapmalıydın' deme. ADHD'li biri için kendini suçlamadan günü kapatmak çok değerli. ASLA İngilizce yazma." },
        { role: 'user', content: `Bugün tamamladığım görev sayısı: ${doneToday}.\n\nGünüm hakkında:\n${text}\n\nBana kısa, sıcak bir akşam yansıması yaz.` },
      ],
      max_tokens: 300,
    });
    let reflection = (r.response || '').trim();
    if (!reflection || /^i'?m sorry|^as an ai|your input/i.test(reflection)) {
      reflection = 'Bugünü buraya bıraktın, bu bile yeterli. Yarın yeni bir gün 💜';
    }
    return jsonCors({ reflection, doneToday }, 200, cors);
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
// Portföy görseli → AI (Cloudflare Workers AI vision modeli)
// Kullanıcı aracı kurum uygulamasının portföy ekranının fotoğrafını atar,
// vision modeli sembol + adet + ortalama maliyet + piyasayı okur, JSON döner.
// ============================================================
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

// base64 string → byte array (vision modeli image: number[] bekler)
function base64ToBytes(b64) {
  const clean = String(b64 || '').replace(/^data:image\/\w+;base64,/, '');
  const bin = atob(clean);
  const bytes = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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
    const qty = h.qty != null ? Number(h.qty) : (h.adet != null ? Number(h.adet) : null);
    const cost = h.cost != null ? Number(h.cost) : (h.maliyet != null ? Number(h.maliyet) : null);
    let market = String(h.market || '').toLowerCase().trim();
    if (!validMarkets.includes(market)) market = 'bist';
    out.push({
      symbol,
      qty: (qty != null && isFinite(qty) && qty > 0) ? qty : null,
      cost: (cost != null && isFinite(cost) && cost > 0) ? cost : null,
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
  if (env.AIDAN_EMAIL && user.email && user.email.toLowerCase() !== env.AIDAN_EMAIL.toLowerCase()) {
    return jsonCors({ error: 'forbidden' }, 403, cors);
  }

  let bytes;
  try { bytes = base64ToBytes(image); } catch { return jsonCors({ error: 'görsel okunamadı' }, 400, cors); }
  if (!bytes.length) return jsonCors({ error: 'boş görsel' }, 400, cors);

  const prompt = [
    'Bu bir borsa/yatırım uygulamasının portföy ekran görüntüsü.',
    'Görseldeki HER hisse/varlık satırı için şunları çıkar:',
    '- symbol: hisse/varlık kodu (örn THYAO, AAPL, BTC). Büyük harf.',
    '- qty: elindeki adet/lot sayısı (sayı). Yoksa null.',
    '- cost: ortalama alış maliyeti / birim fiyat (sayı, nokta ondalıkla). Yoksa null.',
    '- market: "bist" (Türk hissesi), "abd" (ABD hissesi), "fx" (döviz), "crypto" (kripto). Emin değilsen "bist".',
    'SADECE geçerli bir JSON dizisi döndür, başka açıklama yazma. Örnek:',
    '[{"symbol":"THYAO","qty":100,"cost":280.5,"market":"bist"},{"symbol":"GARAN","qty":50,"cost":95.2,"market":"bist"}]',
    'Hiç varlık göremezsen [] döndür.',
  ].join('\n');

  const dataUri = String(image);
  let lastRaw = '';
  let lastErr = '';
  try {
    const r = await visionRun(env, { image: bytes, prompt, max_tokens: 1536 });
    lastRaw = (r && (r.response || r.description || r.text)) || '';
    const holdings = extractHoldingsJson(lastRaw);
    if (holdings.length) return jsonCors({ holdings }, 200, cors);
  } catch (e) {
    lastErr = e.message;
  }
  // Hisse bulunamadı — debug için ham cevabı/hatayı geri yolla
  return jsonCors({
    holdings: [],
    raw: String(lastRaw || '').slice(0, 400),
    aiError: lastErr || undefined,
  }, 200, cors);
}

// Vision modeli çağır. Llama 3.2 Vision, Meta lisansı yüzünden ilk kullanımda
// 5016 hatası verir ("you must submit the prompt 'agree'"). Bunu yakalayıp bir
// kez 'agree' gönderir (lisans kabulü, hesap için kalıcı), sonra asıl isteği tekrarlar.
async function visionRun(env, input) {
  try {
    return await env.AI.run(VISION_MODEL, input);
  } catch (e) {
    const msg = String(e && e.message || '');
    if (msg.includes('5016') || /submit the prompt .?agree/i.test(msg)) {
      try { await env.AI.run(VISION_MODEL, { prompt: 'agree' }); } catch (_) {}
      return await env.AI.run(VISION_MODEL, input); // lisans kabul edildi, tekrar dene
    }
    throw e;
  }
}

// Borsa alarm cron — watchlist fiyatlarını kontrol et, eşik geçildiyse push
async function runStockCheck(env) {
  const { data, token, userId } = await fetchAidan(env);
  const wl = (data.watchlist) || [];
  if (!wl.length) return { type: 'stocks', checked: 0 };
  // Yeni eklenenler kendi ySymbol'ünü taşır (BIST/ABD/Döviz/Kripto); eski kayıtlar bistSymbol ile çevrilir
  const quotes = await fetchStockQuotes(wl.map(w => ({ display: (w.symbol || '').toUpperCase(), yahoo: w.ySymbol || bistSymbol(w.symbol) })));
  const bySym = {};
  for (const q of quotes) bySym[q.symbol] = q;

  const alerts = [];
  let dirty = false;
  for (const w of wl) {
    const q = bySym[(w.symbol || '').toUpperCase()];
    if (!q || q.price == null) continue;
    // ÜST eşik
    if (w.alarmAbove != null && q.price >= w.alarmAbove) {
      if (!w.lastAlertedAbove) {
        alerts.push(`📈 ${w.symbol} ${formatPrice(q.price)} ${q.currency} — ${formatPrice(w.alarmAbove)} üstünü geçti!`);
        w.lastAlertedAbove = true; dirty = true;
      }
    } else if (w.lastAlertedAbove) { w.lastAlertedAbove = false; dirty = true; } // tekrar altına indi → reset
    // ALT eşik
    if (w.alarmBelow != null && q.price <= w.alarmBelow) {
      if (!w.lastAlertedBelow) {
        alerts.push(`📉 ${w.symbol} ${formatPrice(q.price)} ${q.currency} — ${formatPrice(w.alarmBelow)} altına düştü!`);
        w.lastAlertedBelow = true; dirty = true;
      }
    } else if (w.lastAlertedBelow) { w.lastAlertedBelow = false; dirty = true; }
  }

  if (alerts.length) {
    const payload = { title: '🔔 Borsa alarmı', message: alerts.join('\n') };
    await sendPushToAll(env, data, payload, { token, userId });
    logPush(data, 'stocks', payload, ((data.settings && data.settings.pushSubs) || []).length);
    dirty = true;
  }
  if (dirty) { try { await saveAidan(env, data, { token, userId }); } catch (e) { console.error('stock save fail', e.message); } }
  return { type: 'stocks', checked: wl.length, alerts: alerts.length };
}

function formatPrice(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
// Main entry
// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Telegram webhook
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    // PWA AI endpoint (POST metin → AI → görev operasyonu, CORS'lu)
    if (url.pathname === '/ai') {
      return handleAiApi(request, env);
    }

    // Akşam günlüğü (POST gün özeti → AI sıcak yansıma, tool YOK)
    if (url.pathname === '/journal') {
      return handleJournalApi(request, env);
    }

    // Borsa fiyatları (POST {symbols} → Yahoo proxy)
    if (url.pathname === '/stocks') {
      return handleStocksApi(request, env);
    }

    // Portföy görseli → AI vision (POST {image} → sembol/adet/maliyet JSON)
    if (url.pathname === '/portfolio-image') {
      return handlePortfolioImageApi(request, env);
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

  async scheduled(event, env, ctx) {
    // Borsa alarm cron — BIST saatlerinde fiyat kontrol (push)
    if (event.cron === '*/30 7-15 * * 1-5') {
      ctx.waitUntil(runStockCheck(env));
      return;
    }
    let type;
    switch (event.cron) {
      case '0 5 * * *':  type = 'morning'; break;
      case '0 6 * * *':  type = 'deadline'; break;
      case '0 9 * * *':  type = 'noon'; break;
      case '0 18 * * *': type = 'evening'; break;
      case '0 18 * * SUN': type = 'weekly'; break;
      default:           type = 'morning';
    }
    ctx.waitUntil(runCronJob(env, type));
  },
};
