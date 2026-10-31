// The proactive brain: called every 5 minutes, decides what (if anything) to tell the user right now.
// Pure and deterministic: given the data, the time and what was already sent today, it returns notifications.
// Each notification fires once per day (by key) within a 40-minute window after its time,
// so a late or missed tick never causes a burst of stale messages.
import { addDays, weekStart, weekTotal } from "../data.js";
import { prayerTimes } from "../prayer.js";
import { PRAYERS, PRAYER_NAMES, fastingDays } from "./islam.js";
import { dowOf, hmIn, hmToMin, minutesIn } from "./time.js";

const WINDOW = 40; // minutes a due item stays sendable

// kinds: "briefing" and "evening" (AI-written, fixed), "prayer" (reminders and checks), "reminder" (user-set), "nudge" (capped, quiet-hour aware), "memory" (silent job)
export function planTick({ data, now, tz, state = {} }) {
  const today = now.toLocaleDateString("en-CA", { timeZone: tz });
  const cfg = data.settings.jarvis || {};
  const nowMin = minutesIn(tz, now);
  const sent = state.day === today ? state.sent || {} : {};
  const out = [];
  const prayers = data.settings.showPrayers === false ? [] : prayerTimes(data.settings, today);
  const pMin = Object.fromEntries(prayers.map((p) => [p.key, minutesIn(tz, p.time)]));
  const logged = data.prayers?.[today] || {};
  const due = (key, at) => at != null && !sent[key] && nowMin >= at && nowMin < at + WINDOW;

  const fajr = pMin.fajr ?? 6 * 60;
  const quietFrom = hmToMin(cfg.quietFrom) ?? 23 * 60;
  const quiet = nowMin >= quietFrom || nowMin < fajr;
  const dow = dowOf(today);
  const inClass = data.schedule.some((s) => Number(s.day) === dow && hmToMin(s.start) <= nowMin && nowMin < hmToMin(s.end));
  let nudges = state.day === today ? state.nudges || 0 : 0;
  const cap = Number(cfg.maxNudges ?? 8);
  const nudge = (n) => {
    if (quiet || inClass || nudges >= cap) return;
    nudges++;
    out.push({ ...n, kind: "nudge" });
  };

  // Morning briefing, after Subuh
  if (cfg.briefing !== false && due("briefing", fajr + Number(cfg.briefingDelay ?? 20))) {
    out.push({ key: "briefing", kind: "briefing", tag: "morning", url: "/?tab=jarvis" });
  }

  // Prayer reminders before each prayer, and a gentle check if the previous one isn't logged
  if (prayers.length) {
    for (const p of PRAYERS) {
      const at = pMin[p];
      if (at == null) continue;
      if (cfg.prayerReminders !== false && !logged[p] && due(`pray-${p}`, at - Number(cfg.prayerReminderMin ?? 10))) {
        out.push({ key: `pray-${p}`, kind: "prayer", tag: `pray-${p}`, title: `${PRAYER_NAMES[p]} in ${cfg.prayerReminderMin ?? 10} min`, body: `${PRAYER_NAMES[p]} at ${hmIn(tz, prayers.find((x) => x.key === p).time)}`, url: "/?tab=islam" });
      }
    }
    if (cfg.prayerCheck !== false) {
      // Check each prayer 20 minutes before the next one starts; Isyak is checked before quiet hours
      const checks = [["fajr", (pMin.dhuhr ?? 13 * 60) - 120], ["dhuhr", (pMin.asr ?? 16 * 60) - 20], ["asr", (pMin.maghrib ?? 19 * 60) - 20], ["maghrib", (pMin.isha ?? 20 * 60) - 10], ["isha", quietFrom - 45]];
      for (const [p, at] of checks) {
        if (!logged[p] && pMin[p] != null && nowMin > pMin[p] && due(`check-${p}`, at)) {
          out.push({
            key: `check-${p}`, kind: "prayer", tag: `check-${p}`,
            title: `Did you pray ${PRAYER_NAMES[p]}?`, body: "Tap to log it.", url: "/?tab=islam",
            actions: [{ action: `prayer:${p}:ontime:${today}`, title: "On time" }, { action: `prayer:${p}:late:${today}`, title: "Late" }],
          });
        }
      }
    }
  }

  // User-set reminders (always delivered)
  for (const r of data.reminders || []) {
    if (r.sent || r.date !== today) continue;
    const at = hmToMin(r.time);
    if (at != null && nowMin >= at && nowMin < at + WINDOW) out.push({ key: `rem-${r.id}`, kind: "reminder", reminderId: r.id, tag: `rem-${r.id}`, title: "Reminder", body: r.text, url: "/?tab=today" });
  }

  // Evening adhkar after Asar
  if (cfg.adhkar !== false && pMin.asr != null && due("adhkar", pMin.asr + 30)) {
    nudge({ key: "adhkar", tag: "adhkar", title: "Evening adhkar", body: "A few minutes of evening adhkar before Maghrib.", url: "/?tab=islam" });
  }

  // Deadline watchdog at 18:00: due within 2 days and no study logged for that subject in the last 2 days
  if (cfg.deadlines !== false && due("deadlines", 18 * 60)) {
    const soon = data.deadlines.filter((d) => !d.done && d.due >= today && d.due <= addDays(today, 2));
    const studied = (sid) => (data.focus || []).some((f) => f.subjectId === sid && f.date >= addDays(today, -2));
    const risky = soon.filter((d) => !d.subjectId || !studied(d.subjectId));
    if (risky.length) {
      const d = risky[0];
      const when = d.due === today ? "today" : d.due === addDays(today, 1) ? "tomorrow" : "in 2 days";
      nudge({ key: "deadlines", tag: "deadlines", title: `${d.title} is due ${when}`, body: risky.length > 1 ? `Plus ${risky.length - 1} more soon. Want me to plan a study block?` : "No study logged for it lately. Want me to plan a block tonight?", url: "/?tab=jarvis" });
    }
  }

  // Weekly minimums check on Friday and Saturday evening at 20:00 when behind
  if ((dow === 4 || dow === 5) && due("minimums", 20 * 60)) {
    const ws = weekStart(today);
    const left = 7 - dow;
    const behind = data.minimums.filter((m) => weekTotal(data, ws, m.id) < Number(m.target));
    if (behind.length) {
      nudge({ key: "minimums", tag: "minimums", title: "Weekly minimums", body: behind.map((m) => `${m.name} ${weekTotal(data, ws, m.id)}/${m.target} → ~${Math.ceil((Number(m.target) - weekTotal(data, ws, m.id)) / left)}/day`).join(", "), url: "/?tab=today" });
    }
  }

  // Fasting reminder the evening before (21:00)
  if (cfg.fasting !== false && due("fasting", 21 * 60)) {
    const tomorrow = fastingDays(addDays(today, 1), 1)[0];
    if (tomorrow) {
      nudge({ key: "fasting", tag: "fasting", title: tomorrow.kind === "ramadan" ? "Ramadan fast tomorrow" : "Sunnah fast tomorrow", body: `${tomorrow.reasons.join(", ")}. Set an alarm for suhoor?`, url: "/?tab=islam" });
    }
  }

  // Evening review: an hour after Isyak, but before quiet hours
  const eveningAt = Math.min((pMin.isha ?? 20 * 60 + 30) + 60, quietFrom - 30);
  if (cfg.evening !== false && due("evening", eveningAt)) out.push({ key: "evening", kind: "evening", tag: "evening", url: "/?tab=jarvis" });

  // Nightly memory: condense today's conversations (silent)
  if (due("memory", quietFrom + 20 > 24 * 60 - 1 ? 23 * 60 + 40 : quietFrom + 20)) out.push({ key: "memory", kind: "memory" });

  return { today, notifications: out, nudges, quiet, inClass };
}
