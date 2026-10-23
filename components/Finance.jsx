"use client";

import { useState } from "react";
import { Bar, Card, Del, Empty, Header, Seg } from "./ui";
import { dateKey, fmtDate, money, monthKey, uid } from "@/lib/data";

export default function Finance({ data, update }) {
  const cats = data.settings.categories;
  const cur = data.settings.currency;
  const [month, setMonth] = useState(monthKey());
  const [f, setF] = useState({ type: "expense", date: dateKey(), amount: "", category: cats[0] || "Other", note: "" });

  const add = (e) => {
    e.preventDefault();
    const amount = Number(f.amount);
    if (!amount) return;
    update((d) => { d.money.push({ ...f, id: uid(), amount }); });
    setF({ ...f, amount: "", note: "" });
  };
  const remove = (id) => update((d) => { d.money = d.money.filter((m) => m.id !== id); });

  const items = data.money.filter((m) => monthKey(m.date) === month).sort((a, b) => b.date.localeCompare(a.date));
  const income = items.filter((m) => m.type === "income").reduce((s, m) => s + m.amount, 0);
  const expense = items.filter((m) => m.type === "expense").reduce((s, m) => s + m.amount, 0);
  const byCat = {};
  items.filter((m) => m.type === "expense").forEach((m) => (byCat[m.category] = (byCat[m.category] || 0) + m.amount));
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = catRows[0]?.[1] || 0;

  const shiftMonth = (n) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const monthName = new Date(month + "-01T00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <Header
        title="Finance"
        sub={monthName}
        right={
          <div className="daynav">
            <button className="btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
            {month !== monthKey() && <button className="btn" onClick={() => setMonth(monthKey())}>This month</button>}
            <button className="btn" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
          </div>
        }
      />
      <div className="stats">
        <div className="stat"><span className="muted small">Income</span><strong className="pos">{money(income, cur)}</strong></div>
        <div className="stat"><span className="muted small">Spent</span><strong className="neg">{money(expense, cur)}</strong></div>
        <div className="stat"><span className="muted small">Net</span><strong className={income - expense >= 0 ? "pos" : "neg"}>{money(income - expense, cur)}</strong></div>
      </div>

      <Card title="Add entry">
        <form className="stack" onSubmit={add}>
          <Seg value={f.type} onChange={(type) => setF({ ...f, type })} options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} />
          <div className="formgrid">
            <input type="number" step="0.01" inputMode="decimal" placeholder={`Amount (${cur})`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {cats.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <input placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <button className="btn primary">Add</button>
          </div>
        </form>
      </Card>

      <div className="grid2">
        <Card title="Spending by category">
          {catRows.length === 0 && <Empty>No expenses this month.</Empty>}
          <div className="cats">
            {catRows.map(([c, v]) => (
              <div key={c} className="catrow">
                <div className="row-between"><span>{c}</span><span className="mono">{money(v, cur)}</span></div>
                <Bar value={v} max={maxCat} tone="plain" />
              </div>
            ))}
          </div>
        </Card>
        <Card title={`Entries (${items.length})`}>
          {items.length === 0 && <Empty>Nothing logged this month.</Empty>}
          <ul className="plain compact">
            {items.map((m) => (
              <li key={m.id} className="row-between">
                <span className="grow">
                  <span className="muted small">{fmtDate(m.date)}</span> {m.category}
                  {m.note && <span className="muted"> · {m.note}</span>}
                </span>
                <strong className={`mono ${m.type === "income" ? "pos" : ""}`}>{m.type === "income" ? "+" : "−"}{Number(m.amount).toFixed(2)}</strong>
                <Del onClick={() => remove(m.id)} label="Delete entry" />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
