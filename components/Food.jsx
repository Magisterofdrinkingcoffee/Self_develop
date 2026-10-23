"use client";

import { useState } from "react";
import { Bar, Card, Del, Empty, Header } from "./ui";
import { addDays, dateKey, fmtDate, uid } from "@/lib/data";

export default function Food({ data, update }) {
  const [day, setDay] = useState(dateKey());
  const [f, setF] = useState({ name: "", kcal: "" });
  const target = Number(data.settings.calorieTarget) || 0;

  const add = (e, preset) => {
    e?.preventDefault();
    const item = preset || f;
    if (!item.name.trim()) return;
    update((d) => { d.meals.push({ id: uid(), date: day, name: item.name.trim(), kcal: Number(item.kcal) || 0 }); });
    if (!preset) setF({ name: "", kcal: "" });
  };
  const remove = (id) => update((d) => { d.meals = d.meals.filter((m) => m.id !== id); });

  const meals = data.meals.filter((m) => m.date === day);
  const total = meals.reduce((s, m) => s + Number(m.kcal || 0), 0);
  const left = target - total;

  // Frequent foods for one-tap logging
  const freq = {};
  data.meals.forEach((m) => {
    const k = m.name.toLowerCase();
    freq[k] = freq[k] || { name: m.name, kcal: m.kcal, n: 0 };
    freq[k].n++;
    freq[k].kcal = m.kcal;
  });
  const quick = Object.values(freq).sort((a, b) => b.n - a.n).slice(0, 8);

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(dateKey(), i - 6)).map((d) => ({
    d, kcal: data.meals.filter((m) => m.date === d).reduce((s, m) => s + Number(m.kcal || 0), 0),
  }));
  const logged = last7.filter((x) => x.kcal > 0);
  const avg = logged.length ? Math.round(logged.reduce((s, x) => s + x.kcal, 0) / logged.length) : 0;

  return (
    <>
      <Header
        title="Food"
        sub="Calorie counting"
        right={
          <div className="daynav">
            <button className="btn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">‹</button>
            <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
            <button className="btn" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">›</button>
          </div>
        }
      />
      <div className="stats">
        <div className="stat wide">
          <span className="muted small">{fmtDate(day, { weekday: "long", day: "numeric", month: "short" })}</span>
          <strong>{total} / {target} kcal</strong>
          <Bar value={total} max={target} tone={total > target ? "over" : ""} />
          <span className="muted small">{left >= 0 ? `${left} kcal left` : `${-left} kcal over`}</span>
        </div>
        <div className="stat"><span className="muted small">7-day average</span><strong>{avg ? `${avg} kcal` : "—"}</strong></div>
      </div>

      <div className="grid2">
        <Card title="Add food">
          <form className="formgrid tight" onSubmit={add}>
            <input placeholder="What did you eat?" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input type="number" inputMode="numeric" placeholder="kcal" value={f.kcal} onChange={(e) => setF({ ...f, kcal: e.target.value })} />
            <button className="btn primary">Add</button>
          </form>
          {quick.length > 0 && (
            <>
              <p className="muted small">Quick add</p>
              <div className="chips">
                {quick.map((q) => (
                  <button key={q.name} className="chip" onClick={() => add(null, q)}>{q.name} · {q.kcal}</button>
                ))}
              </div>
            </>
          )}
        </Card>
        <Card title="Eaten">
          {meals.length === 0 && <Empty>Nothing logged for this day.</Empty>}
          <ul className="plain compact">
            {meals.map((m) => (
              <li key={m.id} className="row-between"><span className="grow">{m.name}</span><strong>{m.kcal}</strong><Del onClick={() => remove(m.id)} label="Delete" /></li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Last 7 days">
        <div className="days7">
          {last7.map((x) => (
            <button key={x.d} className={`d7 ${x.d === day ? "on" : ""}`} onClick={() => setDay(x.d)}>
              <span className="muted small">{fmtDate(x.d, { weekday: "short" })}</span>
              <Bar value={x.kcal} max={target} tone={x.kcal > target ? "over" : ""} />
              <span className="small">{x.kcal || "—"}</span>
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}
