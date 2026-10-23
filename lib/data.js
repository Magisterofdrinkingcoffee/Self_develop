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
});

// Fill in anything missing (older saves, imports)
export function normalize(data) {
  const base = defaultData();
  if (!data || typeof data !== "object") return base;
  const out = { ...base, ...data };
  out.settings = { ...base.settings, ...(data.settings || {}) };
  for (const k of Object.keys(base)) {
    if (Array.isArray(base[k]) && !Array.isArray(out[k])) out[k] = base[k];
    if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k]) && typeof out[k] !== "object") out[k] = base[k];
  }
  return out;
}

export const minimumsDone = (data, k) =>
  data.minimums.length > 0 &&
  data.minimums.every((m) => (data.minLog[k]?.[m.id] || 0) >= Number(m.target || 0));

export function streak(data) {
  let k = dateKey();
  let n = 0;
  if (!minimumsDone(data, k)) k = addDays(k, -1); // today still in progress
  while (minimumsDone(data, k)) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

export const money = (n, cur) =>
  `${cur} ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
