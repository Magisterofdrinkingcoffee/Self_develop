"use client";

import { useState } from "react";
import { Bar, Card, Del, Empty, Header } from "./ui";
import { addDays, dateKey, fmtDate, uid, weekStart } from "@/lib/data";

const TYPES = ["Gym – upper body", "Gym – lower body", "Gym – full body", "Basketball", "Swimming", "Running", "Cycling", "Other"];

export default function Sport({ data, update }) {
  const today = dateKey();
  const [w, setW] = useState({ date: today, type: TYPES[0], duration: "", notes: "" });
  const [kg, setKg] = useState({ date: today, kg: "" });

  const addWorkout = (e) => {
    e.preventDefault();
    update((d) => { d.workouts.push({ ...w, id: uid(), duration: Number(w.duration) || 0 }); });
    setW({ ...w, duration: "", notes: "" });
  };
  const addWeight = (e) => {
    e.preventDefault();
    if (!kg.kg) return;
    update((d) => {
      d.weights = d.weights.filter((x) => x.date !== kg.date);
      d.weights.push({ id: uid(), date: kg.date, kg: Number(kg.kg) });
    });
    setKg({ ...kg, kg: "" });
  };
  const remove = (coll, id) => update((d) => { d[coll] = d[coll].filter((x) => x.id !== id); });

  const ws = weekStart();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const thisWeek = data.workouts.filter((x) => weekDays.includes(x.date));
  const goal = Number(data.settings.workoutsPerWeek) || 0;
  const workouts = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date));
  const weights = [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
  const first = weights[0], last = weights[weights.length - 1];
  const change = first && last && first !== last ? (last.kg - first.kg).toFixed(1) : null;

  return (
    <>
      <Header title="Sport" sub="Workouts and weight" />
      <div className="stats">
        <div className="stat"><span className="muted small">This week</span><strong>{thisWeek.length} / {goal} workouts</strong><Bar value={thisWeek.length} max={goal} /></div>
        <div className="stat"><span className="muted small">Minutes this week</span><strong>{thisWeek.reduce((s, x) => s + Number(x.duration || 0), 0)}</strong></div>
        <div className="stat"><span className="muted small">Current weight</span><strong>{last ? `${last.kg} kg` : "—"}</strong></div>
        <div className="stat"><span className="muted small">Change since first log</span><strong>{change ? `${change > 0 ? "+" : ""}${change} kg` : "—"}</strong></div>
      </div>

      <div className="grid2">
        <Card title="Log a workout">
          <form className="stack" onSubmit={addWorkout}>
            <div className="formgrid tight">
              <input type="date" value={w.date} onChange={(e) => setW({ ...w, date: e.target.value })} />
              <select value={w.type} onChange={(e) => setW({ ...w, type: e.target.value })}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input type="number" inputMode="numeric" placeholder="Minutes" value={w.duration} onChange={(e) => setW({ ...w, duration: e.target.value })} />
            </div>
            <input placeholder="Notes (exercises, sets, how it felt…)" value={w.notes} onChange={(e) => setW({ ...w, notes: e.target.value })} />
            <button className="btn primary">Log workout</button>
          </form>
        </Card>
        <Card title="Log weight">
          <form className="formgrid tight" onSubmit={addWeight}>
            <input type="date" value={kg.date} onChange={(e) => setKg({ ...kg, date: e.target.value })} />
            <input type="number" step="0.1" inputMode="decimal" placeholder="kg" value={kg.kg} onChange={(e) => setKg({ ...kg, kg: e.target.value })} />
            <button className="btn primary">Save</button>
          </form>
          {weights.length === 0 ? <Empty>No weight logged yet.</Empty> : (
            <ul className="plain compact">
              {[...weights].reverse().slice(0, 8).map((x) => (
                <li key={x.id} className="row-between"><span className="muted">{fmtDate(x.date)}</span><strong>{x.kg} kg</strong><Del onClick={() => remove("weights", x.id)} label="Delete entry" /></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Workout history">
        {workouts.length === 0 && <Empty>No workouts logged yet.</Empty>}
        <ul className="plain">
          {workouts.slice(0, 40).map((x) => (
            <li key={x.id} className="row-between">
              <span className="grow">
                <span className="muted">{fmtDate(x.date, { weekday: "short", day: "numeric", month: "short" })}</span> · <strong>{x.type}</strong>
                {x.duration ? <span className="muted"> · {x.duration} min</span> : null}
                {x.notes && <div className="muted small">{x.notes}</div>}
              </span>
              <Del onClick={() => remove("workouts", x.id)} label="Delete workout" />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
