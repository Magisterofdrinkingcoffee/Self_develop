"use client";

import { useState } from "react";
import { Bar, Card, Del, Empty, Header, Seg } from "./ui";
import { addDays, dateKey, fmtDate, uid, weekStart } from "@/lib/data";

// Daily weight jumps around with water and food; the 7-day average is the number that shows real progress.
function avgAt(weights, k) {
  const from = addDays(k, -6);
  const w = weights.filter((x) => x.date >= from && x.date <= k);
  return w.length ? w.reduce((s, x) => s + Number(x.kg), 0) / w.length : null;
}

function WeightChart({ weights }) {
  const [range, setRange] = useState(60);
  const today = dateKey();
  const from = addDays(today, -range + 1);
  const pts = weights.filter((w) => w.date >= from);
  if (pts.length < 2) return <Empty>Log your weight a few times (mornings work best) to see the trend.</Empty>;
  const days = Array.from({ length: range }, (_, i) => addDays(from, i));
  const avg = days.map((d) => ({ d, v: d < pts[0].date ? null : avgAt(weights, d) }));
  const vals = [...pts.map((p) => Number(p.kg)), ...avg.filter((a) => a.v != null).map((a) => a.v)];
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const W = 640, H = 200, L = 34, R = 8, T = 10, B = 22;
  const x = (d) => L + (days.indexOf(d) / (range - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const line = avg.filter((a) => a.v != null).map((a, i) => `${i ? "L" : "M"}${x(a.d).toFixed(1)},${y(a.v).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3);
  const months = days.filter((d) => d.endsWith("-01") || d === days[0]);
  return (
    <>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <span className="muted small"><span className="legend-dot" /> daily weigh-in <span className="legend-line" /> 7-day average</span>
        <Seg value={range} onChange={setRange} options={[{ value: 30, label: "30d" }, { value: 60, label: "60d" }, { value: 180, label: "6m" }]} />
      </div>
      <svg className="wchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weight trend">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 6} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{t.toFixed(0)}</text>
          </g>
        ))}
        {months.map((d) => <text key={d} x={x(d)} y={H - 6} className="tick">{fmtDate(d, { month: "short", day: d === days[0] ? "numeric" : undefined })}</text>)}
        {pts.map((p) => <circle key={p.id} cx={x(p.date)} cy={y(Number(p.kg))} r="3" className="dot"><title>{`${fmtDate(p.date)}: ${p.kg} kg`}</title></circle>)}
        <path d={line} className="avg" />
      </svg>
    </>
  );
}

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
  const avgNow = last ? avgAt(weights, today) : null;
  const avgWeekAgo = last ? avgAt(weights, addDays(today, -7)) : null;
  const weekly = avgNow != null && avgWeekAgo != null ? (avgNow - avgWeekAgo).toFixed(1) : null;

  return (
    <>
      <Header title="Sport" sub="Workouts and weight" />
      <div className="stats">
        <div className="stat"><span className="muted small">This week</span><strong>{thisWeek.length} / {goal} workouts</strong><Bar value={thisWeek.length} max={goal} /></div>
        <div className="stat"><span className="muted small">Minutes this week</span><strong>{thisWeek.reduce((s, x) => s + Number(x.duration || 0), 0)}</strong></div>
        <div className="stat"><span className="muted small">7-day average</span><strong>{avgNow != null ? `${avgNow.toFixed(1)} kg` : "—"}</strong></div>
        <div className="stat"><span className="muted small">Average vs last week</span><strong className={weekly < 0 ? "pos" : weekly > 0 ? "neg" : ""}>{weekly != null ? `${weekly > 0 ? "+" : ""}${weekly} kg` : "—"}</strong></div>
        <div className="stat"><span className="muted small">Since first log</span><strong>{change ? `${change > 0 ? "+" : ""}${change} kg` : "—"}</strong></div>
      </div>

      <Card title="Weight trend">
        <WeightChart weights={weights} />
      </Card>

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
