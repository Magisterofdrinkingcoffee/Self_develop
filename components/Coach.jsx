"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "./ui";
import Icon from "./Icon";
import { addDays, dateKey, monthKey, weekDays, weekStart, weekTotal } from "@/lib/data";
import { useRemote } from "@/lib/useRemote";

const PROMPTS = [
  { q: "Plan the rest of my day", sub: "From your agenda, to-dos, deadlines and minimums" },
  { q: "How do I catch up on this week's minimums?", sub: "Per-day split for what's left" },
  { q: "What should I eat for the rest of today?", sub: "Based on calories left and what you've eaten" },
  { q: "Give me a short weekly review", sub: "Wins, slips and one focus for next week" },
  { q: "Where is my money going this month?", sub: "Categories and what to cut" },
  { q: "Plan my gym sessions for this week", sub: "Around your timetable and goal" },
];

const HISTORY_KEY = "life-coach-chat";

// Compact view of the tracker for the model: only what's useful for advice
function snapshot(data, events) {
  const today = dateKey();
  const ws = weekStart();
  const daysLeft = 7 - weekDays(ws).indexOf(today);
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
    daysLeftInWeekIncludingToday: daysLeft,
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

// Minimal, safe markdown: paragraphs, "- " lists, **bold**
function Rich({ text }) {
  const blocks = String(text).split(/\n{2,}/);
  const inline = (t, k) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong> : p));
  return blocks.map((b, i) => {
    const lines = b.split("\n").filter(Boolean);
    if (lines.length && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)))
      return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${i}-${j}`)}</li>)}</ul>;
    return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l.replace(/^#+\s*/, ""), `${i}-${j}`)}</span>)}</p>;
  });
}

export default function Coach({ data, go }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const { data: ag } = useRemote(`/api/agenda?from=${from.toISOString()}&to=${new Date(from.getTime() + 7 * 864e5).toISOString()}`);

  useEffect(() => {
    try { const h = JSON.parse(localStorage.getItem(HISTORY_KEY)); if (Array.isArray(h)) setMsgs(h); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-30))); } catch {}
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const ask = async (q) => {
    const text = (q ?? input).trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user", text }];
    setMsgs(next);
    setInput("");
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, snapshot: snapshot(data, ag?.events) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "The coach couldn't answer");
      setMsgs((m) => [...m, { role: "model", text: j.reply }]);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header
        title="Coach"
        sub="Advice from your own numbers: minimums, food, gym, money and schedule"
        right={msgs.length > 0 && <button className="btn" onClick={() => setMsgs([])}>New chat</button>}
      />

      {msgs.length === 0 && (
        <div className="prompts">
          {PROMPTS.map((p) => (
            <button key={p.q} onClick={() => ask(p.q)}>{p.q}<span>{p.sub}</span></button>
          ))}
        </div>
      )}

      <div className="chat">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.role === "model" ? <Rich text={m.text} /> : m.text}</div>
        ))}
        {busy && <div className="msg model thinking">Looking at your week…</div>}
        {err && (
          <p className="err">
            {err}{" "}
            {/key/i.test(err) && <button className="link" onClick={() => go("settings")}>Open Settings</button>}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <textarea
          rows={1}
          value={input}
          placeholder="Ask anything about your week…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }}
        />
        <button className="btn primary" disabled={busy || !input.trim()} aria-label="Send"><Icon name="send" size={18} /></button>
      </form>
    </>
  );
}
