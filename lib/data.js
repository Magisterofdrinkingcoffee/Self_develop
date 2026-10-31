// Shared client helpers and the shape of all data.

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const dateKey = (d = new Date()) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

export const parseKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (k, n) => {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

// Monday of the week containing date key k
export const weekStart = (k = dateKey()) => {
  const d = parseKey(k);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return dateKey(d);
};

export const monthKey = (k = dateKey()) => k.slice(0, 7);

export const fmtDate = (k, opts = { day: "numeric", month: "short" }) =>
  parseKey(k).toLocaleDateString("en-GB", opts);

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const defaultData = () => ({
  version: 1,
  settings: {
    name: "Beka",
    currency: "RM",
    calorieTarget: 2000,
    workoutsPerWeek: 3,
    readingMinimumId: "m-book",
    categories: ["Food", "Transport", "House", "Study", "Personal", "Other"],
    // Prayer times (Kota Warisan by default; JAKIM-style angles = "Singapore" method)
    showPrayers: true,
    lat: 2.8167,
    lng: 101.7,
    prayerMethod: "Singapore",
    madhab: "Shafi",
    timezone: "Asia/Kuala_Lumpur",
    quranMinimumId: "m-quran",
    // Jarvis: proactive behaviour (see lib/jarvis/tick.js)
    jarvis: {
      briefing: true, // morning briefing after Subuh
      briefingDelay: 20, // minutes after Subuh
      prayerReminders: true, // "Asar in 10 min"
      prayerReminderMin: 10,
      prayerCheck: true, // "Did you pray Zohor?" when the next prayer is near and nothing is logged
      adhkar: true, // evening adhkar reminder after Asar
      deadlines: true, // deadline watchdog
      fasting: true, // Monday/Thursday and white days reminder the evening before
      evening: true, // evening review
      quietFrom: "23:00", // no nudges between quietFrom and Subuh
      maxNudges: 8, // per day, not counting briefing, evening review and prayer reminders
      voiceName: "Jarvis",
    },
  },
  minimums: [
    { id: "m-book", name: "Book", target: 50, unit: "pages" },
    { id: "m-quran", name: "Quran", target: 20, unit: "pages" },
    { id: "m-lemalar", name: "Lemalar", target: 10, unit: "pages" },
    { id: "m-cv", name: "CV", target: 100, unit: "" },
  ],
  minLog: {}, // { "2026-10-23": { "m-book": 30 } }
  todos: [], // { id, text, done, date, doneAt }
  daily: {}, // { date: text }
  weekly: {}, // { mondayDate: text }
  schedule: [], // { id, day (0=Mon), start, end, title, place }
  subjects: [
    { id: uid(), code: "CST301", name: "", notes: "" },
    { id: uid(), code: "AIT201", name: "", notes: "" },
    { id: uid(), code: "AIT206", name: "", notes: "" },
  ],
  deadlines: [], // { id, subjectId, title, due, done }
  projects: [
    { id: uid(), name: "Freelance business", status: "Active", nextStep: "", notes: "" },
    { id: uid(), name: "AI project", status: "Active", nextStep: "", notes: "" },
    { id: uid(), name: "SDC Hackathon", status: "Active", nextStep: "", notes: "" },
    { id: uid(), name: "AI Club", status: "Active", nextStep: "", notes: "" },
  ],
  books: [], // { id, title, author, totalPages, currentPage, status, notes: [{id,date,page,text}], startedAt, finishedAt }
  workouts: [], // { id, date, type, duration, notes }
  weights: [], // { id, date, kg }
  meals: [], // { id, date, name, kcal }
  money: [], // { id, date, type, amount, category, note }
  focus: [], // { id, date, subjectId, minutes }
  // Islamic
  prayers: {}, // { "2026-10-31": { fajr: "ontime" | "late" | "qada" | "missed" } }
  qada: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }, // prayers still owed
  quran: { page: 0, goalDate: "", khatms: [] }, // reading position (1–604) and target date for finishing
  hifz: [], // { id, label, added, due, interval, ease, reps, lastReview } memorised portions on a review schedule
  fasts: [], // { id, date, kind: "sunnah" | "ramadan" | "qada" | "other" }
  // Studies
  cards: [], // { id, subjectId, front, back, due, interval, ease, reps, created, source }
  // Health (from Apple Health via Shortcuts)
  health: {}, // { "2026-10-31": { steps, sleepH, restingHr, activeKcal } }
  reminders: [], // { id, text, date, time, sent } one-off notifications from Jarvis
  // Jarvis long-term memory: facts, goals and preferences it should always know
  memories: [], // { id, text, kind: "fact" | "goal" | "preference" | "summary", at }
  house: {
    name: "Дом Б",
    members: ["Beka", "Иман", "Нұржау", "Арманжан", "Ақарыс"],
    monthly: 700,
    paid: {}, // { "2026-10": ["Beka", "Иман"] }
    items: [], // { id, date, desc, amount, paidBy: "Fund" | member, split: [members] }
  },
});

// Fill in anything missing (older saves, imports)
export function normalize(data) {
  const base = defaultData();
  if (!data || typeof data !== "object") return base;
  const out = { ...base, ...data };
  out.settings = { ...base.settings, ...(data.settings || {}) };
  out.settings.jarvis = { ...base.settings.jarvis, ...(data.settings?.jarvis || {}) };
  out.qada = { ...base.qada, ...(data.qada && typeof data.qada === "object" ? data.qada : {}) };
  out.quran = { ...base.quran, ...(data.quran && typeof data.quran === "object" ? data.quran : {}) };
  out.house = { ...base.house, ...(data.house && typeof data.house === "object" ? data.house : {}) };
  for (const k of Object.keys(base)) {
    if (Array.isArray(base[k]) && !Array.isArray(out[k])) out[k] = base[k];
    if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k]) && typeof out[k] !== "object") out[k] = base[k];
  }
  return out;
}

// Minimums are WEEKLY targets (Mon–Sun). Amounts are logged per day and summed per week.
export const weekDays = (ws) => Array.from({ length: 7 }, (_, i) => addDays(ws, i));

export const weekTotal = (data, ws, id) =>
  weekDays(ws).reduce((s, d) => s + Number(data.minLog[d]?.[id] || 0), 0);

export const minimumsDone = (data, ws) =>
  data.minimums.length > 0 &&
  data.minimums.every((m) => weekTotal(data, ws, m.id) >= Number(m.target || 0));

// Consecutive weeks with every minimum met (current week counts only once it's done)
export function streak(data) {
  let ws = weekStart();
  let n = 0;
  if (!minimumsDone(data, ws)) ws = addDays(ws, -7);
  while (minimumsDone(data, ws) && n < 520) {
    n++;
    ws = addDays(ws, -7);
  }
  return n;
}

// Add pages/amount to a minimum for a given day
export function logMinimum(d, day, id, delta) {
  if (!id || !delta) return;
  d.minLog[day] = { ...(d.minLog[day] || {}), [id]: Math.max(0, Number(d.minLog[day]?.[id] || 0) + delta) };
}

export const money = (n, cur) =>
  `${cur} ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
