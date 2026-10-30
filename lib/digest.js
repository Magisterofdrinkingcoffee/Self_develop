// Server-only: builds the morning plan and evening check-in notifications from the stored data.
import { addDays, normalize, parseKey, weekDays, weekStart, weekTotal } from "@/lib/data";
import { loadData } from "@/lib/server";
import { agenda } from "@/lib/integrations";
import { prayerTimes } from "@/lib/prayer";

const TZ = "Asia/Kuala_Lumpur";
const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const hhmm = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

function minimumsLine(data, today) {
  const ws = weekStart(today);
  const left = 7 - weekDays(ws).indexOf(today);
  const behind = data.minimums
    .map((m) => ({ m, done: weekTotal(data, ws, m.id), t: Number(m.target) }))
    .filter((x) => x.done < x.t)
    .map((x) => `${x.m.name} ${x.done}/${x.t}`);
  if (!behind.length) return "All weekly minimums done ✓";
  return `${behind.join(", ")} · ${left} day${left === 1 ? "" : "s"} left`;
}

export async function morning() {
  const data = normalize(await loadData());
  const today = todayKey();
  const dow = (parseKey(today).getDay() + 6) % 7;
  const lines = [];

  const classes = data.schedule.filter((s) => Number(s.day) === dow).map((s) => ({ t: s.start, title: s.title }));
  const from = new Date(`${today}T00:00:00+08:00`).toISOString();
  const to = new Date(`${addDays(today, 1)}T00:00:00+08:00`).toISOString();
  const { events } = await agenda(from, to).catch(() => ({ events: [] }));
  const evs = events.filter((e) => !e.allDay).map((e) => ({ t: hhmm(e.start), title: e.title }));
  const all = [...classes, ...evs].sort((a, b) => a.t.localeCompare(b.t));
  if (all.length) lines.push(`Today: ${all.slice(0, 3).map((x) => `${x.title} ${x.t}`).join(", ")}${all.length > 3 ? ` +${all.length - 3} more` : ""}`);

  const due = data.deadlines
    .filter((d) => !d.done && d.due >= today && d.due <= addDays(today, 3))
    .sort((a, b) => a.due.localeCompare(b.due));
  if (due.length) {
    const d = due[0];
    const n = Math.round((parseKey(d.due) - parseKey(today)) / 864e5);
    lines.push(`Due ${n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}: ${d.title}${due.length > 1 ? ` (+${due.length - 1})` : ""}`);
  }
  lines.push(minimumsLine(data, today));

  return { title: `Good morning, ${data.settings.name || "Beka"}`, body: lines.join("\n"), url: "/?tab=today", tag: "morning" };
}

export async function evening() {
  const data = normalize(await loadData());
  const today = todayKey();
  const nudges = [];
  if (!data.meals.some((m) => m.date === today)) nudges.push("no food logged");
  const loggedMins = Object.values(data.minLog[today] || {}).some((v) => Number(v) > 0);
  if (!loggedMins) nudges.push("no minimums logged");
  if (!data.daily[today]) nudges.push("daily summary not written");
  const isha = data.settings.showPrayers !== false ? prayerTimes(data.settings, today).find((p) => p.key === "isha") : null;
  const body = [
    nudges.length ? `Still open today: ${nudges.join(", ")}.` : "Everything for today is logged. Nice.",
    minimumsLine(data, today),
    isha && isha.time > new Date() ? `Isyak at ${hhmm(isha.time)}` : null,
  ].filter(Boolean).join("\n");
  return { title: "Evening check-in", body, url: "/?tab=today", tag: "evening" };
}
