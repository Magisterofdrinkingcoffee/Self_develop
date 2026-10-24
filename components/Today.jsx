"use client";

import { useState } from "react";
import { Bar, Card, Del, Empty, Header, NoteArea } from "./ui";
import { addDays, dateKey, fmtDate, minimumsDone, money, parseKey, streak, uid, weekStart, weekTotal } from "@/lib/data";

export function Minimums({ data, update, day }) {
  const log = data.minLog[day] || {};
  const ws = weekStart(day);
  const set = (id, val) =>
    update((d) => {
      d.minLog[day] = { ...(d.minLog[day] || {}), [id]: Math.max(0, Number(val) || 0) };
    });
  const done = data.minimums.filter((m) => weekTotal(data, ws, m.id) >= Number(m.target)).length;
  const daysLeft = 7 - Math.round((parseKey(day) - parseKey(ws)) / 864e5); // incl. this day

  return (
    <Card title="Weekly minimums" right={<span className="pill">{done}/{data.minimums.length} done this week</span>}>
      {data.minimums.length === 0 && <Empty>Add your weekly minimums in Settings.</Empty>}
      <div className="mins">
        {data.minimums.map((m) => {
          const v = log[m.id] || 0;
          const total = weekTotal(data, ws, m.id);
          const target = Number(m.target);
          const ok = total >= target;
          const perDay = ok ? 0 : Math.ceil((target - (total - v)) / daysLeft);
          return (
            <div key={m.id} className={`min ${ok ? "ok" : ""}`}>
              <div className="minrow">
                <span className="check static" aria-label={ok ? "Week done" : "In progress"}>{ok ? "✓" : ""}</span>
                <div className="minname">
                  <strong>{m.name}</strong>
                  <span className="muted small">
                    {total} / {target} {m.unit} this week
                    {!ok && perDay > 0 && <> · ~{perDay}/day to finish</>}
                  </span>
                </div>
                <span className="muted small">today</span>
                <div className="stepper">
                  <button onClick={() => set(m.id, v - 1)} aria-label="Minus one">−</button>
                  <input type="number" inputMode="numeric" value={v || ""} placeholder="0" onChange={(e) => set(m.id, e.target.value)} />
                  <button onClick={() => set(m.id, v + 1)} aria-label="Plus one">+</button>
                </div>
              </div>
              <Bar value={total} max={target} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function Todos({ data, update, day }) {
  const [text, setText] = useState("");
  const isToday = day === dateKey();
  const list = data.todos.filter((t) => t.date === day);
  const carried = isToday ? data.todos.filter((t) => !t.done && t.date < day) : [];
  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    update((d) => { d.todos.push({ id: uid(), text: text.trim(), done: false, date: day }); });
    setText("");
  };
  const toggle = (id) =>
    update((d) => {
      const t = d.todos.find((x) => x.id === id);
      t.done = !t.done;
      t.doneAt = t.done ? dateKey() : null;
    });
  const move = (id) => update((d) => { d.todos.find((x) => x.id === id).date = day; });
  const del = (id) => update((d) => { d.todos = d.todos.filter((x) => x.id !== id); });
  const doneCount = list.filter((t) => t.done).length;

  const Row = ({ t, old }) => (
    <li className={t.done ? "done" : ""}>
      <button className="check" onClick={() => toggle(t.id)} aria-label="Toggle">{t.done ? "✓" : ""}</button>
      <span className="grow">{t.text}{old && <span className="muted small"> · from {fmtDate(t.date)}</span>}</span>
      {old && <button className="link small" onClick={() => move(t.id)}>Move to today</button>}
      <Del onClick={() => del(t.id)} label="Delete task" />
    </li>
  );

  return (
    <Card title="To-do" right={list.length > 0 && <span className="pill">{doneCount}/{list.length}</span>}>
      <form onSubmit={add} className="addrow">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task…" />
        <button className="btn primary">Add</button>
      </form>
      <ul className="todos">
        {list.map((t) => <Row key={t.id} t={t} />)}
        {carried.map((t) => <Row key={t.id} t={t} old />)}
      </ul>
      {list.length + carried.length === 0 && <Empty>Nothing yet for this day.</Empty>}
    </Card>
  );
}

export default function Today({ data, update, go }) {
  const [day, setDay] = useState(dateKey());
  const today = dateKey();
  const isToday = day === today;
  const cur = data.settings.currency;
  const kcal = data.meals.filter((m) => m.date === day).reduce((s, m) => s + Number(m.kcal || 0), 0);
  const spent = data.money.filter((m) => m.date === day && m.type === "expense").reduce((s, m) => s + Number(m.amount || 0), 0);
  const dow = (parseKey(day).getDay() + 6) % 7;
  const classes = data.schedule.filter((s) => Number(s.day) === dow).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const upcoming = data.deadlines.filter((d) => !d.done && d.due >= today).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
  const reading = data.books.filter((b) => b.status === "reading");
  const s = streak(data);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <Header
        title={isToday ? `${hello}, ${data.settings.name || "there"}` : fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}
        sub={isToday ? fmtDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Editing a past day"}
        right={
          <div className="daynav">
            <button className="btn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">‹</button>
            <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
            <button className="btn" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">›</button>
            {!isToday && <button className="btn" onClick={() => setDay(today)}>Today</button>}
          </div>
        }
      />

      <div className="stats">
        <div className="stat"><span className="muted small">Minimums streak</span><strong>{s} {s === 1 ? "week" : "weeks"}</strong></div>
        <div className="stat"><span className="muted small">Calories</span><strong>{kcal} / {data.settings.calorieTarget}</strong></div>
        <div className="stat"><span className="muted small">Spent</span><strong>{money(spent, cur)}</strong></div>
        <div className="stat"><span className="muted small">This week's minimums</span><strong>{minimumsDone(data, weekStart(day)) ? "Done ✓" : "In progress"}</strong></div>
      </div>

      <div className="grid2">
        <div className="col">
          <Minimums data={data} update={update} day={day} />
          <Todos data={data} update={update} day={day} />
        </div>
        <div className="col">
          <Card title="Daily summary">
            <NoteArea
              rows={7}
              value={data.daily[day]}
              placeholder="How did the day go? What did you learn, what went well, what to fix tomorrow…"
              onChange={(v) => update((d) => { d.daily[day] = v; })}
            />
          </Card>
          <Card title="Schedule" right={<button className="link" onClick={() => go("planner")}>Edit</button>}>
            {classes.length === 0 ? <Empty>Nothing scheduled on this weekday.</Empty> : (
              <ul className="plain">
                {classes.map((c) => (
                  <li key={c.id}><span className="mono muted">{c.start}–{c.end}</span> <strong>{c.title}</strong>{c.place && <span className="muted"> · {c.place}</span>}</li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Upcoming deadlines" right={<button className="link" onClick={() => go("studies")}>All</button>}>
            {upcoming.length === 0 ? <Empty>No upcoming deadlines.</Empty> : (
              <ul className="plain">
                {upcoming.map((d) => {
                  const sub = data.subjects.find((x) => x.id === d.subjectId);
                  const days = Math.round((parseKey(d.due) - parseKey(today)) / 864e5);
                  return (
                    <li key={d.id}>
                      <span className={`pill ${days <= 2 ? "warn" : ""}`}>{days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`}</span>{" "}
                      <strong>{d.title}</strong>{sub && <span className="muted"> · {sub.code}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          {reading.length > 0 && (
            <Card title="Currently reading" right={<button className="link" onClick={() => go("reading")}>Open</button>}>
              {reading.map((b) => (
                <div key={b.id} className="mini-book">
                  <div className="row-between"><strong>{b.title}</strong><span className="muted small">p. {b.currentPage || 0}{b.totalPages ? ` / ${b.totalPages}` : ""}</span></div>
                  <Bar value={Number(b.currentPage || 0)} max={Number(b.totalPages || 0)} />
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
