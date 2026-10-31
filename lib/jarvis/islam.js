// Islamic helpers: prayer log stats, Hijri date, sunnah fasting days, Quran khatm plan.
// No rulings are generated here; this only tracks what the user does.
import { addDays, parseKey } from "../data.js";
import { daysBetween, dowOf } from "./time.js";

export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
export const PRAYER_NAMES = { fajr: "Subuh", dhuhr: "Zohor", asr: "Asar", maghrib: "Maghrib", isha: "Isyak" };
export const STATUSES = ["ontime", "late", "qada", "missed"];
export const QURAN_PAGES = 604;

const prayed = (s) => s === "ontime" || s === "late" || s === "qada";

// Hijri date (Umm al-Qura). Midday is used so the date doesn't flip on timezone edges.
export function hijri(key) {
  const d = parseKey(key);
  d.setHours(12);
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const monthName = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "long" }).format(d);
  return { day: get("day"), month: get("month"), year: get("year"), monthName, label: `${get("day")} ${monthName} ${get("year")} AH` };
}

// Fasting days in the next n days. Eid days are never suggested.
export function fastingDays(fromKey, n = 14) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = addDays(fromKey, i);
    const h = hijri(k);
    const reasons = [];
    const eid = (h.month === 10 && h.day === 1) || (h.month === 12 && h.day >= 10 && h.day <= 13);
    if (eid) continue;
    if (h.month === 9) { out.push({ date: k, kind: "ramadan", reasons: ["Ramadan"] }); continue; }
    const dow = dowOf(k);
    if (dow === 0) reasons.push("Monday");
    if (dow === 3) reasons.push("Thursday");
    if (h.day >= 13 && h.day <= 15) reasons.push("White days (Ayyam al-Bid)");
    if (h.month === 12 && h.day === 9) reasons.push("Day of Arafah");
    if (h.month === 1 && (h.day === 9 || h.day === 10)) reasons.push(h.day === 10 ? "Ashura" : "Tasu'a (9 Muharram)");
    if (h.month === 10 && h.day >= 2) reasons.push("Six days of Shawwal (any 6 this month)");
    if (reasons.length) out.push({ date: k, kind: "sunnah", reasons });
  }
  return out;
}

// Prayer stats for the last `days` days ending today
export function prayerStats(data, today, days = 7) {
  const log = data.prayers || {};
  let ontime = 0, late = 0, qada = 0, missed = 0, unlogged = 0;
  for (let i = 0; i < days; i++) {
    const k = addDays(today, -i);
    for (const p of PRAYERS) {
      const s = log[k]?.[p];
      if (s === "ontime") ontime++;
      else if (s === "late") late++;
      else if (s === "qada") qada++;
      else if (s === "missed") missed++;
      else if (i > 0) unlogged++; // today's not-yet-logged prayers don't count against you
    }
  }
  // Streak: consecutive full days (all five prayed) ending yesterday, plus today if already complete
  let streak = 0;
  let k = PRAYERS.every((p) => prayed(log[today]?.[p])) ? today : addDays(today, -1);
  while (PRAYERS.every((p) => prayed(log[k]?.[p])) && streak < 3650) { streak++; k = addDays(k, -1); }
  const qadaOwed = Object.values(data.qada || {}).reduce((s, n) => s + Number(n || 0), 0);
  return { days, ontime, late, qada, missed, unlogged, streak, qadaOwed, qadaByPrayer: data.qada || {} };
}

// Set one prayer's status and keep the qada counter in step: "missed" adds one owed prayer, a later "qada" pays one back
export function setPrayer(data, day, prayer, status) {
  if (!PRAYERS.includes(prayer)) throw new Error(`Unknown prayer "${prayer}"`);
  if (!STATUSES.includes(status) && status !== null) throw new Error(`Unknown status "${status}"`);
  data.prayers = data.prayers || {};
  data.qada = data.qada || { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  const prev = data.prayers[day]?.[prayer] ?? null;
  if (prev === "missed") data.qada[prayer] = Math.max(0, Number(data.qada[prayer] || 0) - 1);
  if (status === "missed") data.qada[prayer] = Number(data.qada[prayer] || 0) + 1;
  const dayLog = { ...(data.prayers[day] || {}) };
  if (status === null) delete dayLog[prayer];
  else dayLog[prayer] = status;
  data.prayers[day] = dayLog;
  return prev;
}

// Khatm plan: how many pages a day to finish by the goal date
export function quranPlan(data, today) {
  const q = data.quran || {};
  const page = Math.max(0, Math.min(QURAN_PAGES, Number(q.page || 0)));
  const left = QURAN_PAGES - page;
  const daysLeft = q.goalDate ? Math.max(1, daysBetween(today, q.goalDate) + 1) : null;
  return {
    page,
    pagesLeft: left,
    percent: Math.round((page / QURAN_PAGES) * 100),
    goalDate: q.goalDate || null,
    daysLeft,
    pagesPerDay: daysLeft ? Math.ceil(left / daysLeft) : null,
    khatms: (q.khatms || []).length,
  };
}

// Move the reading position forward; wraps into a new khatm at the end
export function advanceQuran(data, pages, today) {
  data.quran = { page: 0, goalDate: "", khatms: [], ...(data.quran || {}) };
  let page = Number(data.quran.page || 0) + Number(pages || 0);
  let finished = false;
  if (page >= QURAN_PAGES) {
    finished = true;
    data.quran.khatms = [...(data.quran.khatms || []), today];
    page -= QURAN_PAGES;
  }
  data.quran.page = Math.max(0, page);
  return finished;
}
