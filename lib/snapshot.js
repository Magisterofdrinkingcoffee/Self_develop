// Compact view of the tracker for Gemini: only what's useful for advice
import { addDays, dateKey, monthKey, weekDays, weekStart, weekTotal } from "@/lib/data";

export function snapshot(data, events, ws = weekStart()) {
  const today = dateKey();
  const isPast = ws < weekStart();
  const daysLeft = isPast ? 0 : 7 - weekDays(ws).indexOf(today);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const month = monthKey();
  const spend = {};
  data.money.filter((m) => m.type === "expense" && m.date.startsWith(month)).forEach((m) => { spend[m.category || "Other"] = (spend[m.category || "Other"] || 0) + Number(m.amount || 0); });
  const dow = (new Date().getDay() + 6) % 7;
  return {
    name: data.settings.name,
    now: new Date().toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    currency: data.settings.currency,
    weeklyMinimums: data.minimums.map((m) => ({ name: m.name, done: weekTotal(data, ws, m.id), target: Number(m.target), unit: m.unit, today: Number(data.minLog[today]?.[m.id] || 0) })),
    week: { from: ws, to: addDays(ws, 6) },
    daysLeftInWeekIncludingToday: daysLeft,
    minimumsByDay: weekDays(ws).map((d) => ({ d, ...Object.fromEntries(data.minimums.map((m) => [m.name, Number(data.minLog[d]?.[m.id] || 0)])) })),
    todosThisWeek: (() => { const w = data.todos.filter((t) => t.date >= ws && t.date <= addDays(ws, 6)); return { done: w.filter((t) => t.done).length, total: w.length }; })(),
    workoutsThisWeek: data.workouts.filter((w) => w.date >= ws && w.date <= addDays(ws, 6)).map((w) => ({ date: w.date, type: w.type, min: w.duration })),
    studyMinutesThisWeekBySubject: (data.focus || []).filter((f) => f.date >= ws && f.date <= addDays(ws, 6)).reduce((o, f) => { const c = data.subjects.find((s) => s.id === f.subjectId)?.code || "Other"; o[c] = (o[c] || 0) + Number(f.minutes || 0); return o; }, {}),
    dailySummariesThisWeek: weekDays(ws).filter((d) => data.daily[d]).map((d) => ({ d, text: String(data.daily[d]).slice(0, 500) })),
    todos: data.todos.filter((t) => (t.date === today) || (!t.done && t.date < today)).map((t) => ({ text: t.text, done: t.done, from: t.date })),
    deadlines: data.deadlines.filter((d) => !d.done && d.due >= today && d.due <= addDays(today, 21)).map((d) => ({ title: d.title, due: d.due, subject: data.subjects.find((s) => s.id === d.subjectId)?.code || "" })),
    timetableToday: data.schedule.filter((s) => Number(s.day) === dow).map((s) => `${s.start}-${s.end} ${s.title}`),
    weeklyTimetable: data.schedule.map((s) => `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][s.day]} ${s.start}-${s.end} ${s.title}`),
    calendarNext7Days: (events || []).slice(0, 40).map((e) => ({ title: e.title, start: e.start, allDay: e.allDay, source: e.source })),
    calorieTarget: Number(data.settings.calorieTarget),
    mealsToday: data.meals.filter((m) => m.date === today).map((m) => ({ name: m.name, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat })),
    kcalLast7Days: last7.map((d) => ({ d, kcal: data.meals.filter((m) => m.date === d).reduce((s, m) => s + Number(m.kcal || 0), 0) })),
    workoutGoalPerWeek: Number(data.settings.workoutsPerWeek),
    workoutsLast14Days: data.workouts.filter((w) => w.date >= addDays(today, -13)).map((w) => ({ date: w.date, type: w.type, min: w.duration })),
    weightKg: data.weights.slice(-10).map((w) => ({ date: w.date, kg: w.kg })),
    spendThisMonthByCategory: spend,
    spendLast7Days: data.money.filter((m) => m.type === "expense" && last7.includes(m.date)).reduce((s, m) => s + Number(m.amount || 0), 0),
    reading: data.books.filter((b) => b.status === "reading").map((b) => ({ title: b.title, page: b.currentPage, of: b.totalPages })),
    projects: data.projects.filter((p) => p.status !== "Done").map((p) => ({ name: p.name, status: p.status, nextStep: p.nextStep })),
    recentDailySummaries: Array.from({ length: 3 }, (_, i) => addDays(today, -i)).filter((d) => data.daily[d]).map((d) => ({ d, text: String(data.daily[d]).slice(0, 600) })),
  };
}

