// Jarvis's hands: every action it can take, as Gemini function declarations plus a handler.
// Handlers are pure: they get the data document and a context, mutate the data, and record what they did
// (with an exact undo). Anything that needs the network (calendar, notes search, Quran API) comes in via ctx.services.
import { addDays, fmtDate, uid, weekDays, weekStart, weekTotal } from "../data.js";
import { prayerTimes } from "../prayer.js";
import { PRAYERS, PRAYER_NAMES, STATUSES, advanceQuran, fastingDays, hijri, prayerStats, quranPlan, setPrayer } from "./islam.js";
import { isDue, newItem, review } from "./srs.js";
import { snapshotOp } from "./undo.js";
import { dayRange, dowOf, hmIn, hmToMin, minToHm, minutesIn } from "./time.js";

// ---------- schema helpers (Gemini OpenAPI subset) ----------
const S = (description, extra = {}) => ({ type: "STRING", description, ...extra });
const N = (description) => ({ type: "NUMBER", description });
const I = (description) => ({ type: "INTEGER", description });
const B = (description) => ({ type: "BOOLEAN", description });
const O = (properties, required = []) => ({ type: "OBJECT", properties, ...(required.length ? { required } : {}) });
const A = (items, description) => ({ type: "ARRAY", items, ...(description ? { description } : {}) });
const DATE = S("Date as YYYY-MM-DD. Omit for today.");

// ---------- small helpers ----------
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// Best fuzzy match of `query` among items by text(item); null if nothing is close
export function bestMatch(items, query, text) {
  const q = norm(query);
  if (!q) return null;
  const qWords = q.split(" ");
  let best = null, bestScore = 0;
  for (const it of items) {
    const t = norm(text(it));
    if (!t) continue;
    let score = 0;
    if (t === q) score = 100;
    else if (t.startsWith(q) || q.startsWith(t)) score = 80;
    else if (t.includes(q)) score = 60;
    else {
      const tWords = t.split(" ");
      const hits = qWords.filter((w) => w.length > 1 && tWords.some((x) => x.startsWith(w) || w.startsWith(x))).length;
      score = (hits / qWords.length) * 50;
    }
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= 25 ? best : null;
}

const validDate = (d, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? d : fallback);
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
const round1 = (n) => Math.round(n * 10) / 10;

function subjectBy(data, q) {
  if (!q) return null;
  return bestMatch(data.subjects, q, (s) => `${s.code} ${s.name}`);
}

function minimumBy(data, q) {
  const n = norm(q);
  return data.minimums.find((m) => norm(m.name) === n) || bestMatch(data.minimums, q, (m) => m.name);
}

// Prayer windows and busy blocks for a day, for free-time planning
function busyBlocks(data, day, events, tz) {
  const blocks = [];
  const dow = dowOf(day);
  for (const s of data.schedule.filter((x) => Number(x.day) === dow)) {
    const a = hmToMin(s.start), b = hmToMin(s.end);
    if (a != null && b != null) blocks.push({ from: a, to: b, what: s.title });
  }
  for (const e of events || []) {
    if (e.allDay || !e.start) continue;
    const a = minutesIn(tz, new Date(e.start));
    const b = e.end && e.end !== e.start ? minutesIn(tz, new Date(e.end)) : a + 60;
    blocks.push({ from: a, to: Math.max(a + 15, b < a ? 24 * 60 : b), what: e.title });
  }
  if (data.settings.showPrayers !== false) {
    for (const p of prayerTimes(data.settings, day)) {
      const a = minutesIn(tz, p.time);
      blocks.push({ from: a, to: a + (p.key === "maghrib" ? 25 : 20), what: `${p.name} prayer` });
    }
  }
  return blocks.sort((x, y) => x.from - y.from);
}

export function freeWindows(blocks, startMin, endMin, minLen = 30) {
  const out = [];
  let cur = startMin;
  for (const b of blocks) {
    if (b.to <= cur) continue;
    if (b.from > cur && b.from - cur >= minLen) out.push({ from: minToHm(cur), to: minToHm(Math.min(b.from, endMin)), minutes: Math.min(b.from, endMin) - cur });
    cur = Math.max(cur, b.to);
    if (cur >= endMin) break;
  }
  if (endMin - cur >= minLen) out.push({ from: minToHm(cur), to: minToHm(endMin), minutes: endMin - cur });
  return out.filter((w) => w.minutes >= minLen);
}

// Progressive overload: if the last two sessions of an exercise hit the target reps on every set, add weight
export function liftSuggestion(workouts, exercise) {
  const sessions = [];
  for (const w of [...workouts].sort((a, b) => b.date.localeCompare(a.date))) {
    const ex = (w.exercises || []).find((e) => norm(e.name) === norm(exercise));
    if (ex) sessions.push({ date: w.date, ...ex });
    if (sessions.length >= 3) break;
  }
  if (!sessions.length) return { exercise, sessions, suggestion: "No history yet. Start light, focus on form, and log sets × reps × kg." };
  const last = sessions[0];
  const repsGoal = Math.max(Number(last.reps) || 8, 5);
  const hit = sessions.slice(0, 2).length === 2 && sessions.slice(0, 2).every((s) => Number(s.kg) === Number(last.kg) && Number(s.reps) >= repsGoal);
  const step = Number(last.kg) >= 40 ? 2.5 : 1.25;
  return {
    exercise,
    sessions,
    suggestion: hit
      ? `Two sessions at ${last.kg} kg × ${last.reps}. Go ${round1(Number(last.kg) + step)} kg next time.`
      : `Stay at ${last.kg} kg and aim for ${last.sets || 3}×${repsGoal} with good form before adding weight.`,
  };
}

// ---------- the tools ----------
export const TOOLS = [
  // ----- Day and planning -----
  {
    name: "get_day",
    description: "Everything about a day: timetable classes, calendar events, prayer times and what's logged, to-dos, deadlines soon, minimums, meals, workouts, and free time windows. Use before planning or when asked about the schedule.",
    parameters: O({ date: DATE }),
    async run({ date }, ctx) {
      const { data, tz } = ctx;
      const day = validDate(date, ctx.today);
      const { from, to } = dayRange(tz, day);
      const events = ctx.services?.agenda ? (await ctx.services.agenda(from, to).catch(() => ({ events: [] }))).events || [] : [];
      const blocks = busyBlocks(data, day, events, tz);
      const nowMin = day === ctx.today ? minutesIn(tz, ctx.now) : 7 * 60;
      const ws = weekStart(day);
      const prayers = data.settings.showPrayers === false ? [] : prayerTimes(data.settings, day).map((p) => ({ prayer: p.key, name: p.name, time: hmIn(tz, p.time), logged: data.prayers?.[day]?.[p.key] || null }));
      return {
        date: day,
        weekday: fmtDate(day, { weekday: "long" }),
        hijri: hijri(day).label,
        classes: data.schedule.filter((s) => Number(s.day) === dowOf(day)).map((s) => `${s.start}-${s.end} ${s.title}${s.place ? ` @ ${s.place}` : ""}`),
        calendar: events.slice(0, 25).map((e) => ({ title: e.title, time: e.allDay ? "all day" : hmIn(tz, new Date(e.start)), source: e.source })),
        prayers,
        todos: data.todos.filter((t) => t.date === day || (!t.done && t.date < day)).map((t) => ({ id: t.id, text: t.text, done: !!t.done, from: t.date !== day ? t.date : undefined })),
        deadlinesNext7Days: data.deadlines.filter((d) => !d.done && d.due >= day && d.due <= addDays(day, 7)).map((d) => ({ title: d.title, due: d.due, subject: data.subjects.find((s) => s.id === d.subjectId)?.code })),
        minimumsThisWeek: data.minimums.map((m) => ({ name: m.name, done: weekTotal(data, ws, m.id), target: Number(m.target), today: Number(data.minLog[day]?.[m.id] || 0), unit: m.unit })),
        kcal: { eaten: data.meals.filter((m) => m.date === day).reduce((s, m) => s + num(m.kcal), 0), target: Number(data.settings.calorieTarget) },
        workoutsThisWeek: data.workouts.filter((w) => weekDays(ws).includes(w.date)).length,
        workoutGoal: Number(data.settings.workoutsPerWeek),
        freeWindows: freeWindows(blocks, Math.max(nowMin, 7 * 60), 23 * 60),
        flashcardsDue: (data.cards || []).filter((c) => isDue(c, day)).length,
        hifzDue: (data.hifz || []).filter((h) => isDue(h, day)).map((h) => h.label),
      };
    },
  },
  {
    name: "add_todo",
    description: "Add a to-do. For a study or work block, put the time in the text, e.g. '18:00-19:30 Revise CST301 week 5'.",
    parameters: O({ text: S("The task"), date: DATE }, ["text"]),
    mutates: true,
    run({ text, date }, ctx) {
      const item = { id: uid(), text: String(text).trim().slice(0, 300), done: false, date: validDate(date, ctx.today) };
      if (!item.text) throw new Error("Empty to-do");
      ctx.data.todos.push(item);
      ctx.record(`To-do: ${item.text}${item.date !== ctx.today ? ` (${fmtDate(item.date)})` : ""}`, [{ op: "pull", key: "todos", id: item.id }]);
      return { added: item };
    },
  },
  {
    name: "complete_todo",
    description: "Mark a to-do as done (or not done) by its text or id.",
    parameters: O({ query: S("Words from the to-do, or its id"), done: B("false to un-check. Default true.") }, ["query"]),
    mutates: true,
    run({ query, done = true }, ctx) {
      const pool = ctx.data.todos.filter((t) => !!t.done !== !!done);
      const t = pool.find((x) => x.id === query) || bestMatch(pool, query, (x) => x.text);
      if (!t) return { error: `No ${done ? "open" : "done"} to-do matches "${query}".`, open: ctx.data.todos.filter((x) => !x.done).slice(-15).map((x) => x.text) };
      const before = structuredClone(t);
      t.done = !!done;
      t.doneAt = done ? ctx.today : null;
      ctx.record(`${done ? "Done" : "Reopened"}: ${t.text}`, [{ op: "put", key: "todos", item: before }]);
      return { todo: t };
    },
  },
  {
    name: "add_deadline",
    description: "Add a study deadline (assignment, quiz, exam).",
    parameters: O({ title: S("What is due"), due: S("Due date YYYY-MM-DD"), subject: S("Subject code or name, if known") }, ["title", "due"]),
    mutates: true,
    run({ title, due, subject }, ctx) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due))) throw new Error("due must be YYYY-MM-DD");
      const s = subjectBy(ctx.data, subject);
      const item = { id: uid(), title: String(title).trim(), subjectId: s?.id || "", due, done: false };
      ctx.data.deadlines.push(item);
      ctx.record(`Deadline: ${item.title} on ${fmtDate(due)}${s ? ` (${s.code})` : ""}`, [{ op: "pull", key: "deadlines", id: item.id }]);
      return { added: item, subject: s?.code || null };
    },
  },
  {
    name: "remind",
    description: "Send the user a phone notification at a specific time, e.g. 'remind me at 17:00 to call mum'.",
    parameters: O({ text: S("What to remind about"), time: S("Local time HH:MM"), date: DATE }, ["text", "time"]),
    mutates: true,
    run({ text, time, date }, ctx) {
      const t = hmToMin(time);
      if (t == null) throw new Error("time must be HH:MM");
      const item = { id: uid(), text: String(text).trim(), date: validDate(date, ctx.today), time: minToHm(t), sent: false };
      ctx.data.reminders = ctx.data.reminders || [];
      ctx.data.reminders.push(item);
      ctx.record(`Reminder ${item.date === ctx.today ? "today" : fmtDate(item.date)} at ${item.time}: ${item.text}`, [{ op: "pull", key: "reminders", id: item.id }]);
      return { added: item, note: "Delivered as a push notification if notifications are on and the 5-minute tick is set up." };
    },
  },
  {
    name: "write_summary",
    description: "Append to the user's daily (or weekly) summary journal.",
    parameters: O({ text: S("Text to append"), date: DATE, weekly: B("true for the weekly summary") }, ["text"]),
    mutates: true,
    run({ text, date, weekly }, ctx) {
      const day = validDate(date, ctx.today);
      const key = weekly ? "weekly" : "daily";
      const k = weekly ? weekStart(day) : day;
      ctx.record(`${weekly ? "Weekly" : "Daily"} summary updated`, [snapshotOp(ctx.data, [key, k])]);
      const prev = ctx.data[key][k] ? `${ctx.data[key][k]}\n` : "";
      ctx.data[key][k] = prev + String(text).trim();
      return { saved: true };
    },
  },

  // ----- Logging -----
  {
    name: "log_minimum",
    description: "Add an amount to a weekly minimum (e.g. Book pages, Quran pages, Lemalar pages). Negative amounts correct a mistake. For Quran, this also moves the khatm position forward.",
    parameters: O({ name: S("Minimum name, e.g. Quran, Book"), amount: N("Amount to add"), date: DATE }, ["name", "amount"]),
    mutates: true,
    run({ name, amount, date }, ctx) {
      const { data } = ctx;
      const m = minimumBy(data, name);
      if (!m) return { error: `No minimum called "${name}".`, minimums: data.minimums.map((x) => x.name) };
      const day = validDate(date, ctx.today);
      const n = num(amount);
      const undo = [snapshotOp(data, ["minLog", day])];
      data.minLog[day] = { ...(data.minLog[day] || {}), [m.id]: Math.max(0, num(data.minLog[day]?.[m.id]) + n) };
      let khatm = false;
      if (m.id === data.settings.quranMinimumId && n > 0) {
        undo.push(snapshotOp(data, ["quran"]));
        khatm = advanceQuran(data, n, day);
      }
      const ws = weekStart(day);
      ctx.record(`${m.name} ${n > 0 ? "+" : ""}${n}${m.unit ? ` ${m.unit}` : ""}`, undo);
      return { minimum: m.name, week: `${weekTotal(data, ws, m.id)}/${m.target}`, ...(m.id === data.settings.quranMinimumId ? { quran: quranPlan(data, day), khatmCompleted: khatm } : {}) };
    },
  },
  {
    name: "log_meal",
    description: "Log food. Estimate calories and macros yourself for a typical single portion in Malaysia unless the user gave numbers.",
    parameters: O({ name: S("What was eaten"), kcal: N("Calories"), protein: N("grams"), carbs: N("grams"), fat: N("grams"), date: DATE }, ["name", "kcal"]),
    mutates: true,
    run({ name, kcal, protein, carbs, fat, date }, ctx) {
      const day = validDate(date, ctx.today);
      const item = { id: uid(), date: day, name: String(name).trim(), kcal: Math.round(num(kcal)), protein: Math.round(num(protein)), carbs: Math.round(num(carbs)), fat: Math.round(num(fat)) };
      ctx.data.meals.push(item);
      const total = ctx.data.meals.filter((m) => m.date === day).reduce((s, m) => s + num(m.kcal), 0);
      ctx.record(`Meal: ${item.name}, ${item.kcal} kcal`, [{ op: "pull", key: "meals", id: item.id }]);
      return { logged: item, kcalToday: total, target: Number(ctx.data.settings.calorieTarget) };
    },
  },
  {
    name: "log_workout",
    description: "Log a workout. Include exercises with sets, reps and kg when the user mentions them, so progress can be tracked.",
    parameters: O({
      type: S("e.g. 'Gym – upper body', 'Running', 'Basketball', 'Swimming', 'Home workout'"),
      minutes: N("Duration in minutes, 0 if unknown"),
      exercises: A(O({ name: S("Exercise, e.g. Bench press, Push-ups"), sets: I("sets"), reps: I("reps per set"), kg: N("weight in kg, 0 for bodyweight") }, ["name"])),
      notes: S("Anything else"),
      date: DATE,
    }, ["type"]),
    mutates: true,
    run({ type, minutes, exercises = [], notes, date }, ctx) {
      const item = {
        id: uid(), date: validDate(date, ctx.today), type: String(type).trim(), duration: Math.round(num(minutes)),
        exercises: exercises.map((e) => ({ name: String(e.name).trim(), sets: num(e.sets) || undefined, reps: num(e.reps) || undefined, kg: num(e.kg) })),
        notes: [notes, ...exercises.map((e) => `${e.name}${e.sets ? ` ${e.sets}×${e.reps || "?"}` : e.reps ? ` ${e.reps}` : ""}${num(e.kg) ? ` @${e.kg}kg` : ""}`)].filter(Boolean).join(", "),
      };
      ctx.data.workouts.push(item);
      const ws = weekStart(item.date);
      ctx.record(`Workout: ${item.type}${item.duration ? `, ${item.duration} min` : ""}`, [{ op: "pull", key: "workouts", id: item.id }]);
      return { logged: item, thisWeek: ctx.data.workouts.filter((w) => weekDays(ws).includes(w.date)).length, goal: Number(ctx.data.settings.workoutsPerWeek) };
    },
  },
  {
    name: "log_weight",
    description: "Log body weight in kg (one entry per day; replaces that day's entry).",
    parameters: O({ kg: N("Weight in kg"), date: DATE }, ["kg"]),
    mutates: true,
    run({ kg, date }, ctx) {
      const day = validDate(date, ctx.today);
      const w = num(kg);
      if (w < 25 || w > 300) throw new Error("That weight looks wrong");
      const old = ctx.data.weights.filter((x) => x.date === day);
      ctx.data.weights = ctx.data.weights.filter((x) => x.date !== day);
      const item = { id: uid(), date: day, kg: w };
      ctx.data.weights.push(item);
      ctx.record(`Weight: ${w} kg`, [{ op: "pull", key: "weights", id: item.id }, ...old.map((o) => ({ op: "put", key: "weights", item: o }))]);
      const recent = [...ctx.data.weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
      return { logged: item, avg7: round1(recent.reduce((s, x) => s + num(x.kg), 0) / recent.length) };
    },
  },
  {
    name: "log_money",
    description: "Log an expense or income.",
    parameters: O({
      amount: N("Amount in the user's currency"),
      category: S("One of the user's categories (see context); 'Other' if none fits"),
      note: S("What it was"),
      income: B("true for income"),
      date: DATE,
    }, ["amount"]),
    mutates: true,
    run({ amount, category, note, income, date }, ctx) {
      const cats = ctx.data.settings.categories || [];
      const cat = income ? category || "Income" : cats.find((c) => norm(c) === norm(category)) || bestMatch(cats.map((c) => ({ c })), category, (x) => x.c)?.c || "Other";
      const item = { id: uid(), date: validDate(date, ctx.today), type: income ? "income" : "expense", amount: Math.abs(num(amount)), category: cat, note: String(note || "").trim() };
      ctx.data.money.push(item);
      ctx.record(`${income ? "Income" : "Spent"} ${ctx.data.settings.currency} ${item.amount.toFixed(2)}${income ? "" : ` on ${cat}`}${item.note ? ` (${item.note})` : ""}`, [{ op: "pull", key: "money", id: item.id }]);
      return { logged: item };
    },
  },

  // ----- Islamic -----
  {
    name: "log_prayer",
    description: "Record a prayer: ontime, late (prayed after its preferred time but within its time), qada (made up after its time), or missed (adds one to the qada count). Use 'qada' with an earlier date to pay back a missed one.",
    parameters: O({ prayer: S("Prayer", { enum: PRAYERS }), status: S("Status", { enum: STATUSES }), date: DATE }, ["prayer", "status"]),
    mutates: true,
    run({ prayer, status, date }, ctx) {
      const day = validDate(date, ctx.today);
      const undo = [snapshotOp(ctx.data, ["prayers", day]), snapshotOp(ctx.data, ["qada"])];
      setPrayer(ctx.data, day, prayer, status);
      ctx.record(`${PRAYER_NAMES[prayer]}: ${status}${day !== ctx.today ? ` (${fmtDate(day)})` : ""}`, undo);
      return { day, logged: ctx.data.prayers[day], stats: prayerStats(ctx.data, ctx.today, 7) };
    },
  },
  {
    name: "pay_qada",
    description: "Record made-up (qada) prayers that are not tied to a logged day, reducing the qada counter.",
    parameters: O({ prayer: S("Prayer", { enum: PRAYERS }), count: I("How many were made up") }, ["prayer"]),
    mutates: true,
    run({ prayer, count = 1 }, ctx) {
      if (!PRAYERS.includes(prayer)) throw new Error("Unknown prayer");
      const undo = [snapshotOp(ctx.data, ["qada"])];
      ctx.data.qada[prayer] = Math.max(0, num(ctx.data.qada[prayer]) - Math.max(1, num(count, 1)));
      ctx.record(`Qada ${PRAYER_NAMES[prayer]} ×${count}`, undo);
      return { qada: ctx.data.qada };
    },
  },
  {
    name: "set_qada_count",
    description: "Set how many of each prayer the user still owes (for a starting estimate).",
    parameters: O(Object.fromEntries(PRAYERS.map((p) => [p, I(`${PRAYER_NAMES[p]} owed`)]))),
    mutates: true,
    run(args, ctx) {
      const undo = [snapshotOp(ctx.data, ["qada"])];
      for (const p of PRAYERS) if (args[p] != null) ctx.data.qada[p] = Math.max(0, Math.round(num(args[p])));
      ctx.record("Qada counter updated", undo);
      return { qada: ctx.data.qada };
    },
  },
  {
    name: "quran_plan",
    description: "Read or change the Quran reading plan: current page (1-604) and the date to finish the khatm by. Returns pages per day needed.",
    parameters: O({ page: I("Current page reached, 0-604"), goalDate: S("Finish by YYYY-MM-DD") }),
    async run({ page, goalDate }, ctx) {
      if (page != null || goalDate) {
        ctx.mutated = true;
        const undo = [snapshotOp(ctx.data, ["quran"])];
        ctx.data.quran = { ...ctx.data.quran };
        if (page != null) ctx.data.quran.page = Math.max(0, Math.min(604, Math.round(num(page))));
        if (goalDate && /^\d{4}-\d{2}-\d{2}$/.test(goalDate)) ctx.data.quran.goalDate = goalDate;
        ctx.record(`Quran plan: page ${ctx.data.quran.page}${ctx.data.quran.goalDate ? `, finish by ${fmtDate(ctx.data.quran.goalDate)}` : ""}`, undo);
      }
      return quranPlan(ctx.data, ctx.today);
    },
  },
  {
    name: "hifz",
    description: "Quran memorisation on a spaced-review schedule. action 'add' a memorised portion (label like 'Al-Mulk' or 'Juz 30 p.1'), 'review' one with a grade (0 forgot, 1 hard, 2 good, 3 easy), or 'list' what is due.",
    parameters: O({ action: S("add | review | list", { enum: ["add", "review", "list"] }), label: S("Portion name"), grade: I("0-3 for review") }, ["action"]),
    async run({ action, label, grade }, ctx) {
      const { data } = ctx;
      data.hifz = data.hifz || [];
      if (action === "list") {
        return { due: data.hifz.filter((h) => isDue(h, ctx.today)).map((h) => h.label), all: data.hifz.map((h) => ({ label: h.label, due: h.due, interval: h.interval })) };
      }
      ctx.mutated = true;
      if (action === "add") {
        if (!label) throw new Error("label needed");
        const item = { id: uid(), label: String(label).trim(), added: ctx.today, ...newItem(addDays(ctx.today, 1)) };
        data.hifz.push(item);
        ctx.record(`Hifz added: ${item.label}`, [{ op: "pull", key: "hifz", id: item.id }]);
        return { added: item };
      }
      const h = bestMatch(data.hifz, label, (x) => x.label);
      if (!h) return { error: `Nothing memorised called "${label}".`, all: data.hifz.map((x) => x.label) };
      const before = structuredClone(h);
      Object.assign(h, review(h, grade ?? 2, ctx.today));
      ctx.record(`Hifz review: ${h.label} → next ${fmtDate(h.due)}`, [{ op: "put", key: "hifz", item: before }]);
      return { reviewed: h.label, nextReview: h.due };
    },
  },
  {
    name: "log_fast",
    description: "Record a fast (sunnah, ramadan, qada or other).",
    parameters: O({ kind: S("Type", { enum: ["sunnah", "ramadan", "qada", "other"] }), date: DATE }),
    mutates: true,
    run({ kind = "sunnah", date }, ctx) {
      const item = { id: uid(), date: validDate(date, ctx.today), kind };
      ctx.data.fasts = ctx.data.fasts || [];
      ctx.data.fasts.push(item);
      ctx.record(`Fast (${kind}) on ${fmtDate(item.date)}`, [{ op: "pull", key: "fasts", id: item.id }]);
      return { logged: item };
    },
  },
  {
    name: "islamic_calendar",
    description: "Hijri date and upcoming recommended fasting days (Mon/Thu, white days, Arafah, Ashura, Ramadan) for the next days.",
    parameters: O({ days: I("How many days ahead, default 14") }),
    run({ days = 14 }, ctx) {
      return { today: hijri(ctx.today).label, fasting: fastingDays(ctx.today, Math.min(60, Math.max(1, num(days, 14)))) };
    },
  },
  {
    name: "quran_lookup",
    description: "Fetch real Quran text with translation from quran API. Use this whenever quoting the Quran; never quote verses from memory. Give surah (1-114) and ayah, optionally toAyah for a range; or a search query to find verses.",
    parameters: O({ surah: I("Surah number 1-114"), ayah: I("Ayah number"), toAyah: I("Last ayah for a range (max 10 verses)"), query: S("Keyword search instead of a reference (English)"), lang: S("Translation language", { enum: ["en", "ru", "ms"] }) }),
    async run(args, ctx) {
      if (!ctx.services?.quran) return { error: "Quran lookup is not available here." };
      return ctx.services.quran(args);
    },
  },

  // ----- Studies -----
  {
    name: "search_notes",
    description: "Search the user's own uploaded lecture notes and books (PDFs Jarvis has read). Use for study questions, explanations and making quizzes from course material. Cite title and page.",
    parameters: O({ query: S("What to look for"), subject: S("Subject code to narrow down, optional") }, ["query"]),
    async run({ query, subject }, ctx) {
      if (!ctx.services?.searchNotes) return { error: "Notes search is not available here." };
      const s = subjectBy(ctx.data, subject);
      return ctx.services.searchNotes(query, { subjectId: s?.id });
    },
  },
  {
    name: "add_flashcards",
    description: "Save flashcards for spaced-repetition review (e.g. made from lecture notes).",
    parameters: O({ subject: S("Subject code"), cards: A(O({ front: S("Question"), back: S("Answer") }, ["front", "back"])) }, ["cards"]),
    mutates: true,
    run({ subject, cards = [] }, ctx) {
      const s = subjectBy(ctx.data, subject);
      ctx.data.cards = ctx.data.cards || [];
      const added = cards.slice(0, 40).map((c) => ({ id: uid(), subjectId: s?.id || "", front: String(c.front).trim(), back: String(c.back).trim(), created: ctx.today, ...newItem(ctx.today) }));
      ctx.data.cards.push(...added);
      ctx.record(`${added.length} flashcard${added.length === 1 ? "" : "s"}${s ? ` for ${s.code}` : ""}`, added.map((c) => ({ op: "pull", key: "cards", id: c.id })));
      return { added: added.length };
    },
  },
  {
    name: "flashcards_due",
    description: "Get flashcards due for review, to quiz the user in chat. Ask the front, wait for the answer, then grade it with grade_flashcard.",
    parameters: O({ subject: S("Subject code, optional"), limit: I("How many, default 5") }),
    run({ subject, limit = 5 }, ctx) {
      const s = subjectBy(ctx.data, subject);
      const due = (ctx.data.cards || []).filter((c) => isDue(c, ctx.today) && (!s || c.subjectId === s.id));
      return { totalDue: due.length, cards: due.slice(0, Math.min(20, num(limit, 5))).map((c) => ({ id: c.id, front: c.front, back: c.back })) };
    },
  },
  {
    name: "grade_flashcard",
    description: "Grade a flashcard after quizzing: 0 forgot, 1 hard, 2 good, 3 easy. Schedules the next review.",
    parameters: O({ id: S("Card id"), grade: I("0-3") }, ["id", "grade"]),
    mutates: true,
    run({ id, grade }, ctx) {
      const c = (ctx.data.cards || []).find((x) => x.id === id);
      if (!c) return { error: "No card with that id" };
      const before = structuredClone(c);
      Object.assign(c, review(c, grade, ctx.today));
      ctx.record(`Card reviewed → next ${fmtDate(c.due)}`, [{ op: "put", key: "cards", item: before }]);
      return { nextReview: c.due };
    },
  },
  {
    name: "log_study",
    description: "Log focused study time for a subject.",
    parameters: O({ subject: S("Subject code"), minutes: I("Minutes studied"), date: DATE }, ["minutes"]),
    mutates: true,
    run({ subject, minutes, date }, ctx) {
      const s = subjectBy(ctx.data, subject);
      const item = { id: uid(), date: validDate(date, ctx.today), subjectId: s?.id || "", minutes: Math.round(num(minutes)) };
      ctx.data.focus.push(item);
      ctx.record(`Study: ${item.minutes} min${s ? ` ${s.code}` : ""}`, [{ op: "pull", key: "focus", id: item.id }]);
      return { logged: item };
    },
  },

  // ----- Progress -----
  {
    name: "get_progress",
    description: "Stats for an area over recent days: minimums, islam, sport (incl. lift progression), food, money, studies, health, reading.",
    parameters: O({
      area: S("Area", { enum: ["minimums", "islam", "sport", "food", "money", "studies", "health", "reading"] }),
      days: I("How many days back, default 7"),
      exercise: S("For sport: an exercise to get a progressive-overload suggestion for"),
    }, ["area"]),
    run({ area, days = 7, exercise }, ctx) {
      const { data, today } = ctx;
      const n = Math.min(120, Math.max(1, num(days, 7)));
      const from = addDays(today, -n + 1);
      const inRange = (d) => d >= from && d <= today;
      const ws = weekStart(today);
      switch (area) {
        case "minimums":
          return { week: data.minimums.map((m) => ({ name: m.name, done: weekTotal(data, ws, m.id), target: Number(m.target) })), daysLeftInWeek: 7 - weekDays(ws).indexOf(today) };
        case "islam":
          return { prayers: prayerStats(data, today, n), quran: quranPlan(data, today), hifzDue: (data.hifz || []).filter((h) => isDue(h, today)).map((h) => h.label), fasts: (data.fasts || []).filter((f) => inRange(f.date)), hijri: hijri(today).label };
        case "sport": {
          const ws2 = data.workouts.filter((w) => inRange(w.date));
          const names = [...new Set(data.workouts.flatMap((w) => (w.exercises || []).map((e) => e.name)))];
          return {
            workouts: ws2.map((w) => ({ date: w.date, type: w.type, min: w.duration, exercises: w.exercises })),
            goalPerWeek: Number(data.settings.workoutsPerWeek),
            weights: data.weights.filter((w) => inRange(w.date)).map((w) => ({ date: w.date, kg: w.kg })),
            knownExercises: names.slice(0, 30),
            ...(exercise ? { lift: liftSuggestion(data.workouts, exercise) } : {}),
          };
        }
        case "food": {
          const byDay = {};
          for (const m of data.meals.filter((x) => inRange(x.date))) byDay[m.date] = (byDay[m.date] || 0) + num(m.kcal);
          const vals = Object.values(byDay);
          return { target: Number(data.settings.calorieTarget), kcalByDay: byDay, avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, today: data.meals.filter((m) => m.date === today) };
        }
        case "money": {
          const cat = {};
          let income = 0;
          for (const m of data.money.filter((x) => inRange(x.date))) {
            if (m.type === "income") income += num(m.amount);
            else cat[m.category || "Other"] = (cat[m.category || "Other"] || 0) + num(m.amount);
          }
          return { currency: data.settings.currency, spentByCategory: cat, totalSpent: Object.values(cat).reduce((a, b) => a + b, 0), income };
        }
        case "studies": {
          const mins = {};
          for (const f of (data.focus || []).filter((x) => inRange(x.date))) {
            const c = data.subjects.find((s) => s.id === f.subjectId)?.code || "Other";
            mins[c] = (mins[c] || 0) + num(f.minutes);
          }
          return {
            subjects: data.subjects.map((s) => `${s.code}${s.name ? ` ${s.name}` : ""}`),
            studyMinutes: mins,
            deadlines: data.deadlines.filter((d) => !d.done && d.due >= today).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 12).map((d) => ({ title: d.title, due: d.due, subject: data.subjects.find((s) => s.id === d.subjectId)?.code })),
            flashcardsDue: (data.cards || []).filter((c) => isDue(c, today)).length,
            flashcardsTotal: (data.cards || []).length,
          };
        }
        case "health":
          return { days: Object.fromEntries(Object.entries(data.health || {}).filter(([d]) => inRange(d))) };
        case "reading":
          return { books: data.books.map((b) => ({ title: b.title, status: b.status, page: b.currentPage, of: b.totalPages })) };
        default:
          return { error: "Unknown area" };
      }
    },
  },

  // ----- Memory -----
  {
    name: "remember",
    description: "Save a lasting fact, goal or preference about the user to long-term memory (things worth knowing in future conversations).",
    parameters: O({ text: S("The fact, in third person, short"), kind: S("Type", { enum: ["fact", "goal", "preference"] }) }, ["text"]),
    mutates: true,
    run({ text, kind = "fact" }, ctx) {
      const t = String(text).trim().slice(0, 300);
      ctx.data.memories = ctx.data.memories || [];
      if (ctx.data.memories.some((m) => norm(m.text) === norm(t))) return { alreadyKnown: true };
      const item = { id: uid(), text: t, kind, at: ctx.today };
      ctx.data.memories.push(item);
      ctx.record(`Remembered: ${t}`, [{ op: "pull", key: "memories", id: item.id }]);
      return { saved: item };
    },
  },
  {
    name: "forget",
    description: "Remove something from long-term memory. Ask the user to confirm first, then call with confirmed=true.",
    parameters: O({ query: S("Words from the memory"), confirmed: B("true only after the user said yes") }, ["query"]),
    mutates: true,
    run({ query, confirmed }, ctx) {
      const m = bestMatch(ctx.data.memories || [], query, (x) => x.text);
      if (!m) return { error: "Nothing in memory matches that." };
      if (!confirmed) return { needsConfirmation: true, memory: m.text };
      ctx.data.memories = ctx.data.memories.filter((x) => x.id !== m.id);
      ctx.record(`Forgot: ${m.text}`, [{ op: "put", key: "memories", item: m }]);
      return { forgotten: m.text };
    },
  },
  {
    name: "undo_last",
    description: "Undo the most recent change(s) Jarvis made, when the user says 'undo', 'that was wrong', 'cancel that'.",
    parameters: O({}),
    async run(_, ctx) {
      if (!ctx.services?.undoLast) return { error: "Undo is not available here." };
      return ctx.services.undoLast();
    },
  },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
export const declarations = () => TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
