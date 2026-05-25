/**
 * Aidan Cloudflare Worker
 * Supabase'den veri çeker, ntfy.sh ile telefona bildirim atar.
 *
 * Cron tetikleyiciler (wrangler.toml veya dashboard'da):
 *   - 0 5 * * *   → 08:00 TR (UTC+3) sabah brifingi
 *   - 0 9 * * *   → 12:00 TR öğle ping
 *   - 0 18 * * *  → 21:00 TR akşam özet (opsiyonel, isterse)
 *
 * Environment variables (Cloudflare → Worker → Settings → Variables):
 *   SUPABASE_URL        — https://xxxxx.supabase.co
 *   SUPABASE_KEY        — anon/publishable key
 *   AIDAN_EMAIL         — kullanıcı email
 *   AIDAN_PASSWORD      — kullanıcı şifre (Secret olarak ekle)
 *   NTFY_TOPIC          — Aidan'da kullandığın ntfy topic adı
 *
 * Manuel test için: https://<worker-url>/?type=morning
 *                   https://<worker-url>/?type=noon
 *                   https://<worker-url>/?type=evening
 *                   https://<worker-url>/?type=deadline
 */

const TR_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

function trToday() {
  const d = new Date(Date.now() + TR_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

function trDate(daysFromToday = 0) {
  const d = new Date(Date.now() + TR_OFFSET_MS + daysFromToday * 86400000);
  return d.toISOString().slice(0, 10);
}

async function login(env) {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
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
    {
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${token}`,
      },
    }
  );
  if (!r.ok) throw new Error(`Fetch fail: ${r.status}`);
  const rows = await r.json();
  return rows[0]?.data || { tasks: [], checkins: [], pomoHistory: {}, pomoToday: { date: trToday(), count: 0 }, settings: {} };
}

async function pushNtfy(env, { title, message, priority = 3, tags = [], topicOverride = null }) {
  const topic = topicOverride || env.NTFY_TOPIC;
  if (!topic) throw new Error('NTFY_TOPIC tanımsız');
  const headers = {
    'Title': encodeRFC2047(title),
    'Priority': String(priority),
  };
  if (tags.length) headers['Tags'] = tags.join(',');
  const r = await fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers,
    body: message,
  });
  if (!r.ok) throw new Error(`ntfy fail: ${r.status} ${await r.text()}`);
}

// ntfy başlığı UTF-8 için RFC 2047 ile kodlanmalı (Türkçe karakter desteği)
function encodeRFC2047(s) {
  // ASCII-only ise direkt dön
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  // UTF-8 → base64
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

function buildMorning(data) {
  const today = trToday();
  const tasks = data.tasks || [];

  const mit = tasks.filter(t => t.mitDate === today && !t.done);
  const urgent = tasks.filter(t => t.priority === 'urgent' && !t.done);
  const dueToday = tasks.filter(t => t.due === today && !t.done);
  const dueTomorrow = tasks.filter(t => t.due === trDate(1) && !t.done);

  const lines = [`🌅 Günaydın Salim`];
  if (mit.length) {
    lines.push('', `⭐ Bugünün 3'ü:`);
    mit.forEach(t => lines.push(`  • ${t.text}`));
  } else {
    lines.push('', `⭐ Henüz MIT seçilmedi — bugün için 1-3 önemli görev belirle.`);
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

  return {
    title: '🌅 Sabah brifingi',
    message: lines.join('\n'),
    tags: ['sunrise'],
    priority: 4,
  };
}

function buildNoon(data) {
  const today = trToday();
  const tasks = data.tasks || [];

  const mit = tasks.filter(t => t.mitDate === today);
  const mitDone = mit.filter(t => t.done).length;
  const mitTotal = mit.length;
  const doneToday = tasks.filter(t => t.doneDate === today).length;

  const lines = [`☀️ Öğlen check-in`];
  if (mitTotal > 0) {
    lines.push(`⭐ MIT: ${mitDone}/${mitTotal} bitti`);
    const remaining = mit.filter(t => !t.done);
    if (remaining.length) {
      lines.push('', `Kalan:`);
      remaining.forEach(t => lines.push(`  • ${t.text}`));
    } else {
      lines.push('', `🎉 Bugünün 3'ü tamamen bitti! Geri kalanı bonus.`);
    }
  } else {
    lines.push('⭐ MIT seçilmedi — öğleden sonra bari 1 önemli iş belirle.');
  }
  lines.push('', `✅ Bugün şu ana kadar ${doneToday} görev bitirdin.`);

  return {
    title: '☀️ Öğle ping',
    message: lines.join('\n'),
    tags: ['sunny'],
    priority: 3,
  };
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

  // Yarına bakış
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

  return {
    title: '🌙 Akşam özet',
    message: lines.join('\n'),
    tags: ['crescent_moon'],
    priority: 3,
  };
}

function buildDeadlineAlerts(data) {
  const today = trToday();
  const tasks = data.tasks || [];
  const alerts = [];

  // 2 gün içinde deadline olan ama bitmemiş, henüz MIT'e alınmamış
  for (let offset = 1; offset <= 2; offset++) {
    const targetDate = trDate(offset);
    const dueOnDate = tasks.filter(t =>
      t.due === targetDate &&
      !t.done &&
      t.mitDate !== today
    );
    dueOnDate.forEach(t => {
      const label = offset === 1 ? 'YARIN' : `${offset} gün sonra`;
      alerts.push(`⏰ ${label}: ${t.text}`);
    });
  }

  // Bugünün hâlâ bitmemiş deadline'ları
  const dueToday = tasks.filter(t => t.due === today && !t.done);
  dueToday.forEach(t => {
    alerts.push(`🔥 BUGÜN SON GÜN: ${t.text}`);
  });

  if (alerts.length === 0) return null;
  return {
    title: '⏰ Deadline uyarısı',
    message: alerts.join('\n'),
    tags: ['alarm_clock'],
    priority: 4,
  };
}

async function runJob(env, type) {
  const data = await fetchAidan(env);
  let payload = null;
  switch (type) {
    case 'morning':  payload = buildMorning(data); break;
    case 'noon':     payload = buildNoon(data); break;
    case 'evening':  payload = buildEvening(data); break;
    case 'deadline': payload = buildDeadlineAlerts(data); break;
    default: throw new Error(`Bilinmeyen tip: ${type}`);
  }
  if (!payload) return { type, sent: false, reason: 'no-content' };

  // ntfy topic'i settings'ten al, yoksa env'den
  const topic = data.settings?.ntfyTopic || env.NTFY_TOPIC;
  if (!topic) throw new Error('ntfy topic yok (Aidan ayarlarında veya env\'de)');
  await pushNtfy(env, { ...payload, topicOverride: topic });
  return { type, sent: true, topic };
}

export default {
  // HTTP isteği — manuel test için
  async fetch(request, env) {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'morning';
    try {
      const result = await runJob(env, type);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },

  // Cron tetikleyici
  async scheduled(event, env, ctx) {
    // event.cron: '0 5 * * *' gibi
    let type;
    switch (event.cron) {
      case '0 5 * * *':  type = 'morning'; break;   // 08:00 TR
      case '0 9 * * *':  type = 'noon'; break;      // 12:00 TR
      case '0 18 * * *': type = 'evening'; break;   // 21:00 TR
      case '0 6 * * *':  type = 'deadline'; break;  // 09:00 TR (deadline uyarısı sabah brifingden sonra)
      default:           type = 'morning';
    }
    ctx.waitUntil(runJob(env, type));
  },
};
