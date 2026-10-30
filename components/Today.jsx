"use client";

import { useState } from "react";
import { Bar, Card, Del, Empty, NoteArea } from "./ui";
import Icon from "./Icon";
import { Agenda, Inbox } from "./Connected";
import { DAYS, addDays, dateKey, fmtDate, money, parseKey, streak, uid, weekDays, weekStart, weekTotal } from "@/lib/data";

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
    <Card title="This week's minimums" right={<span className="pill">{done}/{data.minimums.length} done</span>}>
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
                <span className="check static" aria-label={ok ? "Week done" : "In progress"}>{ok && <Icon name="check" size={15} strokeWidth="3" />}</span>
                <div className="minname">
                  <strong>{m.name}</strong>
                  <span className="muted small">
                    {total} / {target} {m.unit} this week
                    {!ok && perDay > 0 && <> · ~{perDay}/day to finish</>}
                  </span>
                </div>
                <span className="muted small today-lbl">today</span>
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
      <button className="check" onClick={() => toggle(t.id)} aria-label={t.done ? "Mark not done" : "Mark done"}>{t.done && <Icon name="check" size={15} strokeWidth="3" />}</button>
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

// How far through the week's minimums you were by the end of each day (0..1)
function dayProgress(data, ws, k) {
  if (!data.minimums.length) return 0;
  const upto = weekDays(ws).filter((d) => d <= k);
  const parts = data.minimums.map((m) => {
    const t = Number(m.target) || 1;
    const sum = upto.reduce((s, d) => s + Number(data.minLog[d]?.[m.id] || 0), 0);
    return Math.min(1, sum / t);
  });
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function WeekBand({ data, day, setDay, today }) {
  const ws = weekStart(day);
  const C = 2 * Math.PI * 18;
  return (
    <div className="weekband" role="group" aria-label="This week">
      {weekDays(ws).map((k, i) => {
        const p = k > today ? 0 : dayProgress(data, ws, k);
        return (
          <button key={k} className={`wday ${k === day ? "sel" : ""} ${k === today ? "today" : ""}`} onClick={() => setDay(k)} aria-label={`${fmtDate(k, { weekday: "long" })}: ${Math.round(p * 100)}% of weekly minimums`}>
            <span className="dn">{DAYS[i]}</span>
            <svg className="ring" viewBox="0 0 44 44">
              <circle className="track" cx="22" cy="22" r="18" />
              {p > 0 && <circle className={`arc ${p >= 1 ? "full" : ""}`} cx="22" cy="22" r="18" strokeDasharray={`${Math.max(2, p * C)} ${C}`} />}
              <text x="22" y="22.5">{Number(k.slice(8))}</text>
            </svg>
          </button>
        );
      })}
    </div>
  );
}

export default function Today({ data, update, go }) {
  const [day, setDay] = useState(dateKey());
  const today = dateKey();
  const isToday = day === today;
  const cur = data.settings.currency;
  const kcal = data.meals.filter((m) => m.date === day).reduce((s, m) => s + Number(m.kcal || 0), 0);
  const spent = data.money.filter((m) => m.date === day && m.type === "expense").reduce((s, m) => s + Number(m.amount || 0), 0);
  const upcoming = data.deadlines.filter((d) => !d.done && d.due >= today).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  const reading = data.books.filter((b) => b.status === "reading");
  const ws = weekStart(day);
  const workouts = data.workouts.filter((w) => weekDays(ws).includes(w.date)).length;
  const minsMet = data.minimums.filter((m) => weekTotal(data, ws, m.id) >= Number(m.target)).length;
  const s = streak(data);
  const hour = new Date().getHours();
  const hello = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <section className="hero">
        <div className="hero-top">
          <div>
            <h1>{isToday ? `${hello}, ${data.settings.name || "there"}` : fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}</h1>
            <p className="sub">{isToday ? fmtDate(day, { weekday: "long", day: "numeric", month: "long" }) : "Editing a past day"}</p>
          </div>
          <div className="daynav">
            <button className="btn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day"><Icon name="left" size={17} /></button>
            <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Pick a day" />
            <button className="btn" onClick={() => setDay(addDays(day, 1))} aria-label="Next day"><Icon name="right" size={17} /></button>
            {!isToday && <button className="btn" onClick={() => setDay(today)}>Today</button>}
          </div>
        </div>
        <WeekBand data={data} day={day} setDay={setDay} today={today} />
        <div className="hero-foot">
          <div><strong>{minsMet}/{data.minimums.length}</strong><span>minimums met</span></div>
          <div><strong>{s} {s === 1 ? "week" : "weeks"}</strong><span>streak</span></div>
          <div><strong>{kcal}<small style={{ opacity: .6, fontWeight: 500 }}> / {data.settings.calorieTarget}</small></strong><span>kcal {isToday ? "today" : ""}</span></div>
          <div><strong>{workouts}/{data.settings.workoutsPerWeek}</strong><span>workouts</span></div>
          <div><strong>{money(spent, cur)}</strong><span>spent</span></div>
        </div>
      </section>

      <div className="grid3">
        <div className="col">
          <Minimums data={data} update={update} day={day} />
          <Todos data={data} update={update} day={day} />
          <Card title="Daily summary">
            <NoteArea
              rows={6}
              value={data.daily[day]}
              placeholder="How did the day go? What did you learn, what went well, what to fix tomorrow…"
              onChange={(v) => update((d) => { d.daily[day] = v; })}
            />
          </Card>
        </div>
        <div className="col">
          <Agenda data={data} day={day} go={go} />
          <Card title={<><Icon name="studies" size={18} />Deadlines</>} right={<button className="link" onClick={() => go("studies")}>All</button>}>
            {upcoming.length === 0 ? <Empty>No upcoming deadlines.</Empty> : (
              <ul className="plain">
                {upcoming.map((d) => {
                  const sub = data.subjects.find((x) => x.id === d.subjectId);
                  const days = Math.round((parseKey(d.due) - parseKey(today)) / 864e5);
                  return (
                    <li key={d.id} className="row-between">
                      <span className="grow"><strong>{d.title}</strong>{sub && <span className="muted small"> {sub.code}</span>}</span>
                      <span className={`pill ${days <= 2 ? "warn" : ""}`}>{days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Inbox go={go} />
          {reading.length > 0 && (
            <Card title={<><Icon name="reading" size={18} />Reading</>} right={<button className="link" onClick={() => go("reading")}>Open</button>}>
              {reading.map((b) => (
                <div key={b.id} className="mini-book">
                  <div className="row-between"><strong>{b.title}</strong><span className="muted small num">p. {b.currentPage || 0}{b.totalPages ? ` / ${b.totalPages}` : ""}</span></div>
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
