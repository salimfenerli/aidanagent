"""
Aidan MCP Server
Claude Desktop'tan Aidan'a (Supabase'deki görev/mood/MIT verisi) erişim sağlar.
"""
import os
import time
import asyncio
from datetime import datetime, date, timedelta
from pathlib import Path

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
EMAIL = os.environ["AIDAN_EMAIL"]
PASSWORD = os.environ["AIDAN_PASSWORD"]

mcp = FastMCP("aidan")

_session = {"access_token": None, "refresh_token": None, "user_id": None, "expires_at": 0}


async def _login(client: httpx.AsyncClient):
    r = await client.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
        json={"email": EMAIL, "password": PASSWORD},
        timeout=15,
    )
    r.raise_for_status()
    body = r.json()
    _session["access_token"] = body["access_token"]
    _session["refresh_token"] = body["refresh_token"]
    _session["user_id"] = body["user"]["id"]
    _session["expires_at"] = time.time() + body.get("expires_in", 3600) - 60


async def _ensure_auth(client: httpx.AsyncClient):
    if not _session["access_token"] or time.time() >= _session["expires_at"]:
        await _login(client)


async def _get_data():
    async with httpx.AsyncClient() as client:
        await _ensure_auth(client)
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/aidan_data",
            params={"user_id": f"eq.{_session['user_id']}", "select": "data"},
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {_session['access_token']}",
            },
            timeout=15,
        )
        r.raise_for_status()
        rows = r.json()
        if not rows:
            return {"tasks": [], "dumps": [], "routines": [], "checkins": [],
                    "pomoToday": {"date": date.today().isoformat(), "count": 0},
                    "pomoHistory": {}, "settings": {}}
        return rows[0]["data"]


async def _save_data(data: dict):
    async with httpx.AsyncClient() as client:
        await _ensure_auth(client)
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/aidan_data",
            params={"on_conflict": "user_id"},
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {_session['access_token']}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json={
                "user_id": _session["user_id"],
                "data": data,
                "updated_at": datetime.utcnow().isoformat() + "Z",
            },
            timeout=15,
        )
        r.raise_for_status()


def _parse_due(due: str | None) -> str | None:
    if not due:
        return None
    due = due.strip().lower()
    today = date.today()
    if due in ("bugün", "bugun", "today"):
        return today.isoformat()
    if due in ("yarın", "yarin", "tomorrow"):
        return (today + timedelta(days=1)).isoformat()
    if due in ("haftaya", "next week"):
        return (today + timedelta(days=7)).isoformat()
    try:
        return datetime.strptime(due, "%Y-%m-%d").date().isoformat()
    except ValueError:
        pass
    try:
        return datetime.strptime(due, "%d.%m.%Y").date().isoformat()
    except ValueError:
        pass
    try:
        d = datetime.strptime(due, "%d.%m").date().replace(year=today.year)
        if d < today:
            d = d.replace(year=today.year + 1)
        return d.isoformat()
    except ValueError:
        pass
    return None


def _fmt_task(t: dict) -> str:
    parts = [("✅" if t.get("done") else "⬜") + " " + t.get("text", "?")]
    meta = []
    if t.get("priority") == "urgent":
        meta.append("🔴 acil")
    elif t.get("priority") == "low":
        meta.append("🔵 düşük")
    if t.get("category"):
        meta.append(t["category"])
    if t.get("due"):
        meta.append("📅 " + t["due"])
    if t.get("estimateMin"):
        meta.append(f"~{t['estimateMin']}dk")
    if t.get("reminderTime"):
        meta.append("🔔 " + t["reminderTime"])
    if t.get("mitDate") == date.today().isoformat():
        meta.append("⭐ MIT")
    if t.get("repeat"):
        meta.append("🔁 " + t["repeat"])
    if meta:
        parts.append("   " + " · ".join(meta))
    subs = t.get("subtasks") or []
    for s in subs:
        parts.append(f"     {'✅' if s.get('done') else '◻'} {s.get('text','?')}")
    return "\n".join(parts) + f"\n   #{t.get('id')}"


@mcp.tool()
async def list_tasks(filter: str = "active") -> str:
    """Aidan'daki görevleri listele.

    filter: 'active' (bitmemiş, varsayılan) | 'today' (bugün/MIT/acil) |
            'done' (bitmiş) | 'all' (hepsi) | 'mit' (sadece bugünün 3'ü)
    """
    data = await _get_data()
    tasks = data.get("tasks", [])
    today_iso = date.today().isoformat()

    if filter == "done":
        tasks = [t for t in tasks if t.get("done")]
    elif filter == "all":
        pass
    elif filter == "mit":
        tasks = [t for t in tasks if t.get("mitDate") == today_iso and not t.get("done")]
    elif filter == "today":
        tasks = [t for t in tasks
                 if not t.get("done") and (
                     t.get("due") == today_iso
                     or t.get("mitDate") == today_iso
                     or t.get("priority") == "urgent"
                     or not t.get("due"))]
    else:  # active
        tasks = [t for t in tasks if not t.get("done")]

    if not tasks:
        return f"({filter}) görev yok."
    return f"📋 {len(tasks)} görev ({filter}):\n\n" + "\n\n".join(_fmt_task(t) for t in tasks)


@mcp.tool()
async def add_task(
    text: str,
    priority: str = "normal",
    category: str | None = None,
    due: str | None = None,
    estimate_min: int | None = None,
    reminder_time: str | None = None,
    repeat: str | None = None,
    mit: bool = False,
) -> str:
    """Yeni görev ekle.

    text: Görev metni (zorunlu)
    priority: 'urgent' | 'normal' | 'low'
    category: 'odev' | 'ev' | 'kisisel'
    due: 'bugün' | 'yarın' | 'YYYY-MM-DD' | 'DD.MM.YYYY' | 'DD.MM'
    estimate_min: Tahmini dakika
    reminder_time: 'HH:MM' (telefonda bildirim)
    repeat: 'daily' | 'weekly' | 'weekdays' | 'weekends'
    mit: True ise bugünün 3'üne (en fazla 3) ekle
    """
    data = await _get_data()
    tasks = data.setdefault("tasks", [])
    today_iso = date.today().isoformat()

    if mit:
        mit_count = sum(1 for t in tasks if t.get("mitDate") == today_iso and not t.get("done"))
        if mit_count >= 3:
            return "❌ Bugünün 3'ü dolu (MIT limiti). Önce birini bitir veya mit=False ekle."

    new_task = {
        "id": int(time.time() * 1000),
        "text": text,
        "done": False,
        "doneDate": None,
        "subtasks": [],
        "created": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "priority": priority if priority in ("urgent", "normal", "low") else "normal",
        "category": category if category in ("odev", "ev", "kisisel") else None,
        "due": _parse_due(due),
        "estimateMin": estimate_min,
        "actualMin": None,
        "repeat": repeat if repeat in ("daily", "weekly", "weekdays", "weekends") else None,
        "reminderTime": reminder_time,
        "lastReminded": None,
        "mitDate": today_iso if mit else None,
        "streakCount": 0,
        "lastStreakDate": None,
        "seriesId": None,
        "seriesName": None,
        "seriesIndex": None,
        "seriesTotal": None,
    }
    tasks.append(new_task)
    await _save_data(data)
    return f"✅ Eklendi: {text}\n#{new_task['id']}"


@mcp.tool()
async def complete_task(task_id: int, actual_min: int | None = None) -> str:
    """Görevi tamamlandı işaretle.

    task_id: Görev id'si (list_tasks çıktısındaki # numarası)
    actual_min: Gerçekte kaç dakika sürdü (opsiyonel)
    """
    data = await _get_data()
    tasks = data.get("tasks", [])
    for t in tasks:
        if t.get("id") == task_id:
            t["done"] = True
            t["doneDate"] = date.today().isoformat()
            if actual_min:
                t["actualMin"] = actual_min
            await _save_data(data)
            return f"✅ Bitti: {t.get('text')}"
    return f"❌ Görev bulunamadı: #{task_id}"


@mcp.tool()
async def delete_task(task_id: int) -> str:
    """Görevi sil."""
    data = await _get_data()
    tasks = data.get("tasks", [])
    for i, t in enumerate(tasks):
        if t.get("id") == task_id:
            removed = tasks.pop(i)
            await _save_data(data)
            return f"🗑️ Silindi: {removed.get('text')}"
    return f"❌ Görev bulunamadı: #{task_id}"


@mcp.tool()
async def update_task(
    task_id: int,
    text: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    due: str | None = None,
    estimate_min: int | None = None,
    reminder_time: str | None = None,
    mit: bool | None = None,
) -> str:
    """Mevcut görevi güncelle. Sadece verilen alanlar değişir."""
    data = await _get_data()
    for t in data.get("tasks", []):
        if t.get("id") == task_id:
            if text is not None: t["text"] = text
            if priority in ("urgent", "normal", "low"): t["priority"] = priority
            if category in ("odev", "ev", "kisisel", None): t["category"] = category
            if due is not None: t["due"] = _parse_due(due)
            if estimate_min is not None: t["estimateMin"] = estimate_min
            if reminder_time is not None: t["reminderTime"] = reminder_time
            if mit is True: t["mitDate"] = date.today().isoformat()
            elif mit is False: t["mitDate"] = None
            await _save_data(data)
            return f"✏️ Güncellendi: {t.get('text')}"
    return f"❌ Görev bulunamadı: #{task_id}"


@mcp.tool()
async def add_subtask(task_id: int, text: str) -> str:
    """Bir göreve alt adım ekle."""
    data = await _get_data()
    for t in data.get("tasks", []):
        if t.get("id") == task_id:
            t.setdefault("subtasks", []).append({"text": text, "done": False})
            await _save_data(data)
            return f"➕ Alt adım: {text} → {t.get('text')}"
    return f"❌ Görev bulunamadı: #{task_id}"


@mcp.tool()
async def brain_dump(text: str) -> str:
    """Aklındaki bir şeyi Brain Dump'a at (sonra göreve çevirirsin)."""
    data = await _get_data()
    dumps = data.setdefault("dumps", [])
    dumps.append({"text": text, "when": datetime.now().strftime("%d.%m.%Y %H:%M")})
    await _save_data(data)
    return f"🧠 Eklendi (dump): {text}"


@mcp.tool()
async def log_mood(emoji: str, note: str = "") -> str:
    """Mood check-in kaydet.

    emoji: 😄 (harika) | 🙂 (iyi) | 😐 (idare eder) | 😩 (kötü) | 😴 (yorgun)
    note: Opsiyonel not
    """
    mapping = {"😄": "harika", "🙂": "iyi", "😐": "idare", "😩": "kötü", "😴": "yorgun"}
    label = mapping.get(emoji, "?")
    data = await _get_data()
    data.setdefault("checkins", []).append({
        "emoji": emoji, "label": label, "note": note,
        "when": datetime.now().strftime("%d.%m.%Y %H:%M"),
    })
    await _save_data(data)
    return f"{emoji} kaydedildi ({label})" + (f" — {note}" if note else "")


@mcp.tool()
async def daily_briefing() -> str:
    """Bugünün özeti: MIT, acil görevler, mood, pomodoro, streak."""
    data = await _get_data()
    tasks = data.get("tasks", [])
    today_iso = date.today().isoformat()

    mit = [t for t in tasks if t.get("mitDate") == today_iso and not t.get("done")]
    mit_done = [t for t in tasks if t.get("mitDate") == today_iso and t.get("done")]
    urgent = [t for t in tasks if t.get("priority") == "urgent" and not t.get("done")]
    today_due = [t for t in tasks if t.get("due") == today_iso and not t.get("done")]

    pomo = data.get("pomoToday", {})
    pomo_count = pomo.get("count", 0) if pomo.get("date") == today_iso else 0

    checkins = data.get("checkins", [])
    last_mood = checkins[-1] if checkins else None

    lines = [f"📆 {date.today().strftime('%d.%m.%Y')} brifingi", ""]
    lines.append(f"⭐ MIT: {len(mit_done)}/{len(mit) + len(mit_done)} bitti")
    for t in mit:
        lines.append(f"   ⬜ {t['text']}")
    if not mit and not mit_done:
        lines.append("   (henüz MIT seçilmedi)")
    lines.append("")
    if urgent:
        lines.append(f"🔴 Acil ({len(urgent)}):")
        for t in urgent[:5]:
            lines.append(f"   - {t['text']}")
        lines.append("")
    if today_due:
        lines.append(f"📅 Bugün son tarih ({len(today_due)}):")
        for t in today_due[:5]:
            lines.append(f"   - {t['text']}")
        lines.append("")
    lines.append(f"🍅 Pomodoro bugün: {pomo_count}")
    if last_mood:
        lines.append(f"😊 Son mood: {last_mood['emoji']} ({last_mood['when']})")
    return "\n".join(lines)


def _plan_series_days(start: date, deadline: date, parts: int, skip_weekends: bool) -> list[date]:
    """parts adet günü start..deadline arasına yay. skip_weekends ise hafta sonu atla."""
    if parts <= 0:
        return []
    # Müsait günleri hesapla (deadline dahil)
    avail = []
    d = start
    while d <= deadline:
        if not (skip_weekends and d.weekday() >= 5):
            avail.append(d)
        d += timedelta(days=1)
    if not avail:
        return [deadline] * parts  # fallback: hepsi son güne
    if len(avail) >= parts:
        # Eşit aralıkla seç
        step = (len(avail) - 1) / max(parts - 1, 1) if parts > 1 else 0
        return [avail[round(i * step)] for i in range(parts)] if parts > 1 else [avail[0]]
    # Yeterli gün yok — son gün(ler)de yığ
    out = list(avail)
    while len(out) < parts:
        out.append(deadline)
    return out[:parts]


@mcp.tool()
async def add_homework_series(
    name: str,
    deadline: str,
    pages_from: int | None = None,
    pages_to: int | None = None,
    chunks: int | None = None,
    chunk_labels: list[str] | None = None,
    daily_minutes: int | None = None,
    category: str = "odev",
    reminder_time: str | None = None,
    start: str | None = None,
    skip_weekends: bool = False,
    mit_first: bool = True,
) -> str:
    """Bir ödevi otomatik olarak günlere böl ve Aidan'a bağlı görevler olarak ekle.

    name: Ödev adı (örn: 'Tarih kitabı')
    deadline: Son tarih ('YYYY-MM-DD', 'DD.MM.YYYY', 'yarın', 'gelecek salı')
    pages_from / pages_to: Sayfa aralığı (sayfa bölme için). Boşsa chunks kullan.
    chunks: Kaç parça (sayfa yoksa). chunk_labels verirsen onun uzunluğu kullanılır.
    chunk_labels: Her parçanın metni (örn: ['Konu 1', 'Konu 2']). Verilirse chunks = len().
    daily_minutes: Her parça için tahmini dakika
    category: 'odev' | 'ev' | 'kisisel'
    reminder_time: 'HH:MM' (her gün aynı saatte bildirim)
    start: Başlangıç günü (varsayılan: bugün)
    skip_weekends: True ise Cmt-Paz atla
    mit_first: True ise ilk parçayı bugünün MIT'sine ekle
    """
    data = await _get_data()
    tasks = data.setdefault("tasks", [])
    today_iso = date.today().isoformat()

    start_iso = _parse_due(start) if start else today_iso
    deadline_iso = _parse_due(deadline)
    if not deadline_iso:
        return f"❌ Son tarih anlaşılamadı: '{deadline}'"
    start_d = datetime.fromisoformat(start_iso).date()
    deadline_d = datetime.fromisoformat(deadline_iso).date()
    if deadline_d < start_d:
        return "❌ Son tarih başlangıçtan önce."

    # Parçaları belirle
    items: list[str] = []
    if chunk_labels:
        items = list(chunk_labels)
    elif pages_from is not None and pages_to is not None and pages_to >= pages_from:
        total_pages = pages_to - pages_from + 1
        n = chunks or max(1, min(total_pages, _count_avail_days(start_d, deadline_d, skip_weekends)))
        per = total_pages // n
        rem = total_pages % n
        cur = pages_from
        for i in range(n):
            extra = 1 if i < rem else 0
            end = cur + per - 1 + extra
            items.append(f"{name}: s.{cur}-{end}")
            cur = end + 1
    elif chunks:
        items = [f"{name} — {i+1}/{chunks}" for i in range(chunks)]
    else:
        return "❌ Ya pages_from/pages_to ver, ya chunks/chunk_labels ver."

    # Günleri yay
    days = _plan_series_days(start_d, deadline_d, len(items), skip_weekends)

    series_id = str(int(time.time() * 1000))
    created_now = datetime.now().strftime("%d.%m.%Y %H:%M")
    added = []
    for i, (item_text, day) in enumerate(zip(items, days)):
        is_first = (i == 0)
        new_task = {
            "id": int(time.time() * 1000) + i,
            "text": item_text,
            "done": False,
            "doneDate": None,
            "subtasks": [],
            "created": created_now,
            "priority": "normal",
            "category": category if category in ("odev", "ev", "kisisel") else "odev",
            "due": day.isoformat(),
            "estimateMin": daily_minutes,
            "actualMin": None,
            "repeat": None,
            "reminderTime": reminder_time,
            "lastReminded": None,
            "mitDate": today_iso if (mit_first and is_first and day.isoformat() == today_iso) else None,
            "streakCount": 0,
            "lastStreakDate": None,
            "seriesId": series_id,
            "seriesName": name,
            "seriesIndex": i + 1,
            "seriesTotal": len(items),
        }
        tasks.append(new_task)
        added.append((day, item_text))

    await _save_data(data)

    lines = [f"📚 '{name}' planlandı: {len(items)} parça, son tarih {deadline_d.strftime('%d.%m.%Y')}", ""]
    for day, txt in added:
        lines.append(f"   {day.strftime('%a %d.%m')} — {txt}")
    if daily_minutes:
        lines.append(f"\n   ⏱️ Her parça için tahmini: {daily_minutes}dk")
    if reminder_time:
        lines.append(f"   🔔 Hatırlatma: her gün {reminder_time}")
    if mit_first:
        lines.append(f"   ⭐ İlk parça MIT'e eklendi")
    return "\n".join(lines)


def _count_avail_days(start: date, deadline: date, skip_weekends: bool) -> int:
    n = 0
    d = start
    while d <= deadline:
        if not (skip_weekends and d.weekday() >= 5):
            n += 1
        d += timedelta(days=1)
    return n


@mcp.tool()
async def reschedule_series(
    series_id: str | None = None,
    series_name: str | None = None,
    new_deadline: str | None = None,
    skip_weekends: bool = False,
) -> str:
    """Bir ödev serisini yeniden planla.
    Bitmemiş parçaları yeni son tarihe göre yeniden dağıtır.

    series_id VEYA series_name ver (birinden biri).
    new_deadline: Yeni son tarih
    """
    if not series_id and not series_name:
        return "❌ series_id veya series_name lazım"
    if not new_deadline:
        return "❌ new_deadline lazım"

    data = await _get_data()
    tasks = data.get("tasks", [])

    # Seriyi bul
    items = [t for t in tasks
             if (series_id and str(t.get("seriesId")) == str(series_id))
             or (series_name and (t.get("seriesName") or "").lower() == series_name.lower())]
    if not items:
        return f"❌ Seri bulunamadı"

    items.sort(key=lambda x: x.get("seriesIndex") or 0)
    pending = [t for t in items if not t.get("done")]
    if not pending:
        return f"✅ '{items[0].get('seriesName')}' zaten tamamen bitmiş — planlanacak şey yok"

    deadline_iso = _parse_due(new_deadline)
    if not deadline_iso:
        return f"❌ Tarih anlaşılamadı: '{new_deadline}'"
    deadline_d = datetime.fromisoformat(deadline_iso).date()
    start_d = date.today()
    if deadline_d < start_d:
        return "❌ Yeni son tarih bugünden önce"

    days = _plan_series_days(start_d, deadline_d, len(pending), skip_weekends)
    for t, day in zip(pending, days):
        t["due"] = day.isoformat()

    await _save_data(data)
    name = items[0].get("seriesName")
    return (f"🔄 '{name}' yeniden planlandı: {len(pending)} bitmemiş parça {deadline_d.strftime('%d.%m.%Y')} sonuna dağıtıldı.")


@mcp.tool()
async def list_series() -> str:
    """Tüm ödev serilerini ve ilerlemelerini listele."""
    data = await _get_data()
    tasks = data.get("tasks", [])
    groups: dict[str, list[dict]] = {}
    for t in tasks:
        sid = t.get("seriesId")
        if sid:
            groups.setdefault(str(sid), []).append(t)
    if not groups:
        return "Hiç ödev serisi yok."
    lines = [f"📚 {len(groups)} seri:", ""]
    for sid, items in groups.items():
        items.sort(key=lambda x: x.get("seriesIndex") or 0)
        done = sum(1 for t in items if t.get("done"))
        total = len(items)
        name = items[0].get("seriesName") or "?"
        next_pending = next((t for t in items if not t.get("done")), None)
        next_str = f" · Sıradaki: {next_pending['text']} ({next_pending.get('due') or '-'})" if next_pending else " · ✅ Bitti"
        lines.append(f"• {name}: {done}/{total}{next_str}")
        lines.append(f"   #seriesId: {sid}")
    return "\n".join(lines)


@mcp.tool()
async def find_task(query: str) -> str:
    """Görev metninde arama yap, eşleşenleri döndür (silmeden/güncellemeden önce id bulmak için)."""
    data = await _get_data()
    q = query.lower()
    hits = [t for t in data.get("tasks", [])
            if q in (t.get("text") or "").lower()
            or any(q in (s.get("text") or "").lower() for s in (t.get("subtasks") or []))]
    if not hits:
        return f"🔍 '{query}' eşleşmedi."
    return f"🔍 {len(hits)} eşleşme:\n\n" + "\n\n".join(_fmt_task(t) for t in hits)


if __name__ == "__main__":
    mcp.run()
