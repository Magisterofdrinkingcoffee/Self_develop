"use client";

import { useState } from "react";
import { Card, Del, Empty } from "./ui";
import Icon from "./Icon";
import { dateKey, fmtDate, money, monthKey, uid } from "@/lib/data";

// Who owes whom, from expenses paid personally (not from the shared fund). Greedy settle-up.
function balances(h) {
  const net = Object.fromEntries(h.members.map((m) => [m, 0]));
  for (const it of h.items) {
    if (it.paidBy === "Fund" || !(it.paidBy in net)) continue;
    const split = (it.split?.length ? it.split : h.members).filter((m) => m in net);
    if (!split.length) continue;
    net[it.paidBy] += Number(it.amount);
    split.forEach((m) => { net[m] -= Number(it.amount) / split.length; });
  }
  const debt = Object.entries(net).filter(([, v]) => v < -0.005).map(([m, v]) => ({ m, v: -v })).sort((a, b) => b.v - a.v);
  const cred = Object.entries(net).filter(([, v]) => v > 0.005).map(([m, v]) => ({ m, v })).sort((a, b) => b.v - a.v);
  const moves = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const x = Math.min(debt[i].v, cred[j].v);
    moves.push({ from: debt[i].m, to: cred[j].m, amount: Math.round(x * 100) / 100 });
    debt[i].v -= x; cred[j].v -= x;
    if (debt[i].v < 0.005) i++;
    if (cred[j].v < 0.005) j++;
  }
  return { net, moves };
}

export default function House({ data, update, month }) {
  const h = data.house;
  const cur = data.settings.currency;
  const [f, setF] = useState({ date: dateKey(), desc: "", amount: "", paidBy: "Fund", split: [] });
  const [member, setMember] = useState("");
  const [copied, setCopied] = useState(false);
  const setH = (fn) => update((d) => { fn(d.house); });

  const paid = h.paid?.[month] || [];
  const monthItems = h.items.filter((x) => monthKey(x.date) === month).sort((a, b) => b.date.localeCompare(a.date));
  const months = Object.keys(h.paid || {});
  const fundIn = months.reduce((s, m) => s + (h.paid[m] || []).length * Number(h.monthly || 0), 0);
  const fundOut = h.items.filter((x) => x.paidBy === "Fund").reduce((s, x) => s + Number(x.amount), 0);
  const monthIn = paid.length * Number(h.monthly || 0);
  const monthOut = monthItems.filter((x) => x.paidBy === "Fund").reduce((s, x) => s + Number(x.amount), 0);
  const { moves } = balances(h);
  const monthName = new Date(month + "-01T00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const add = (e) => {
    e.preventDefault();
    const amount = Number(f.amount);
    if (!amount || !f.desc.trim()) return;
    setH((x) => { x.items.push({ id: uid(), date: f.date, desc: f.desc.trim(), amount, paidBy: f.paidBy, split: f.paidBy === "Fund" ? [] : f.split }); });
    setF({ ...f, desc: "", amount: "", split: [] });
  };
  const togglePaid = (m) => setH((x) => {
    x.paid = x.paid || {};
    const list = x.paid[month] || [];
    x.paid[month] = list.includes(m) ? list.filter((y) => y !== m) : [...list, m];
  });

  const report = [
    `${h.name}: finance report, ${monthName}`,
    "",
    `Contributions (${money(h.monthly, cur)} each)`,
    `Paid: ${paid.length ? paid.join(", ") : "nobody yet"}`,
    ...(h.members.filter((m) => !paid.includes(m)).length ? [`Not yet: ${h.members.filter((m) => !paid.includes(m)).join(", ")}`] : []),
    "",
    `Shared fund`,
    `In this month: ${money(monthIn, cur)}`,
    `Spent this month: ${money(monthOut, cur)}`,
    ...monthItems.filter((x) => x.paidBy === "Fund").map((x) => `  ${fmtDate(x.date)}  ${x.desc}  ${money(x.amount, cur)}`),
    `Fund balance now: ${money(fundIn - fundOut, cur)}`,
    ...(moves.length ? ["", "To settle between us", ...moves.map((m) => `  ${m.from} → ${m.to}: ${money(m.amount, cur)}`)] : []),
  ].join("\n");

  const copy = async () => {
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  return (
    <>
      <div className="stats">
        <div className="stat"><span className="muted small">Paid this month</span><strong>{paid.length} / {h.members.length}</strong></div>
        <div className="stat"><span className="muted small">Fund spent this month</span><strong className="neg">{money(monthOut, cur)}</strong></div>
        <div className="stat"><span className="muted small">Fund balance</span><strong className={fundIn - fundOut >= 0 ? "pos" : "neg"}>{money(fundIn - fundOut, cur)}</strong></div>
      </div>

      <div className="grid2">
        <Card title={`Contributions, ${monthName}`} right={<span className="pill">{money(h.monthly, cur)} each</span>}>
          <div className="chips">
            {h.members.map((m) => (
              <button key={m} className={`chip ${paid.includes(m) ? "paid" : ""}`} onClick={() => togglePaid(m)} aria-pressed={paid.includes(m)}>
                {paid.includes(m) && <Icon name="check" size={14} strokeWidth="2.5" />}{m}
              </button>
            ))}
          </div>
          <p className="muted small">Tap a name when their contribution arrives.</p>
        </Card>
        <Card title="To settle" right={moves.length > 0 && <span className="pill warn">{moves.length}</span>}>
          {moves.length === 0 ? <Empty>Everyone is even.</Empty> : (
            <ul className="plain compact">
              {moves.map((m) => (
                <li key={`${m.from}-${m.to}`} className="row-between">
                  <span className="grow"><strong>{m.from}</strong> owes <strong>{m.to}</strong></span>
                  <strong className="num">{money(m.amount, cur)}</strong>
                  <button className="link small" onClick={() => setH((x) => { x.items.push({ id: uid(), date: dateKey(), desc: `Settle up: ${m.from} → ${m.to}`, amount: m.amount, paidBy: m.from, split: [m.to], settle: true }); })}>Mark paid</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Add a house expense">
        <form className="stack" onSubmit={add}>
          <div className="formgrid tight">
            <input placeholder="What (rent, groceries, Wi-Fi…)" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
            <input type="number" step="0.01" inputMode="decimal" placeholder={`Amount (${cur})`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <select value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value })} aria-label="Paid by">
              <option value="Fund">Paid from shared fund</option>
              {h.members.map((m) => <option key={m} value={m}>Paid by {m}</option>)}
            </select>
          </div>
          {f.paidBy !== "Fund" && (
            <div>
              <p className="muted small">Split between (none selected = everyone)</p>
              <div className="chips">
                {h.members.map((m) => (
                  <button type="button" key={m} className={`chip ${f.split.includes(m) ? "paid" : ""}`} onClick={() => setF({ ...f, split: f.split.includes(m) ? f.split.filter((x) => x !== m) : [...f.split, m] })}>{m}</button>
                ))}
              </div>
            </div>
          )}
          <button className="btn primary">Add expense</button>
        </form>
      </Card>

      <div className="grid2">
        <Card title={`Expenses, ${monthName}`}>
          {monthItems.length === 0 && <Empty>No house expenses this month.</Empty>}
          <ul className="plain compact">
            {monthItems.map((x) => (
              <li key={x.id} className="row-between">
                <span className="grow">
                  <span className="muted small">{fmtDate(x.date)}</span> {x.desc}
                  <span className="muted small"> · {x.paidBy === "Fund" ? "fund" : `${x.paidBy}${x.split?.length ? ` for ${x.split.join(", ")}` : ", split by all"}`}</span>
                </span>
                <strong className="num">{Number(x.amount).toFixed(2)}</strong>
                <Del onClick={() => setH((h2) => { h2.items = h2.items.filter((y) => y.id !== x.id); })} label="Delete expense" />
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Monthly report" right={<button className="link" onClick={copy}>{copied ? "Copied" : "Copy"}</button>}>
          <pre className="report">{report}</pre>
        </Card>
      </div>

      <Card title="House settings">
        <div className="formgrid narrow">
          <label className="field"><span className="muted small">House name</span><input value={h.name} onChange={(e) => setH((x) => { x.name = e.target.value; })} /></label>
          <label className="field"><span className="muted small">Monthly contribution ({cur})</span><input type="number" value={h.monthly} onChange={(e) => setH((x) => { x.monthly = Number(e.target.value) || 0; })} /></label>
        </div>
        <div className="chips">
          {h.members.map((m) => (
            <span key={m} className="chip">{m}<button className="x" aria-label={`Remove ${m}`} onClick={() => confirm(`Remove ${m} from the house?`) && setH((x) => { x.members = x.members.filter((y) => y !== m); })}>×</button></span>
          ))}
        </div>
        <form className="addrow" onSubmit={(e) => { e.preventDefault(); const n = member.trim(); if (n && !h.members.includes(n)) setH((x) => { x.members.push(n); }); setMember(""); }}>
          <input placeholder="Add housemate" value={member} onChange={(e) => setMember(e.target.value)} />
          <button className="btn">Add</button>
        </form>
      </Card>
    </>
  );
}
