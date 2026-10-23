"use client";

import { useRef, useState } from "react";
import { Card, Del, Header } from "./ui";
import { dateKey, normalize, uid } from "@/lib/data";

export default function Settings({ data, update, storage }) {
  const [m, setM] = useState({ name: "", target: "", unit: "pages" });
  const [cat, setCat] = useState("");
  const fileRef = useRef(null);
  const s = data.settings;
  const setS = (patch) => update((d) => { Object.assign(d.settings, patch); });

  const addMin = (e) => {
    e.preventDefault();
    if (!m.name.trim()) return;
    update((d) => { d.minimums.push({ id: uid(), name: m.name.trim(), target: Number(m.target) || 1, unit: m.unit.trim() }); });
    setM({ name: "", target: "", unit: "pages" });
  };
  const editMin = (id, patch) => update((d) => { Object.assign(d.minimums.find((x) => x.id === id), patch); });
  const delMin = (id) => update((d) => { d.minimums = d.minimums.filter((x) => x.id !== id); });
  const moveMin = (i, dir) => update((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.minimums.length) return;
    [d.minimums[i], d.minimums[j]] = [d.minimums[j], d.minimums[i]];
  });

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `life-tracker-backup-${dateKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = normalize(JSON.parse(await file.text()));
      if (confirm("Replace ALL current data with this backup?")) update(() => parsed);
    } catch {
      alert("That file isn't a valid backup.");
    }
    e.target.value = "";
  };
  const logout = async () => {
    await fetch("/api/login", { method: "DELETE" });
    location.reload();
  };

  return (
    <>
      <Header title="Settings" sub="Minimums, targets and backups" />

      <Card title="Daily minimums">
        <p className="muted small">These show on Today every day. Change targets any time; past days keep what you logged.</p>
        <div className="minedit">
          {data.minimums.map((x, i) => (
            <div key={x.id} className="minedit-row">
              <div className="updown">
                <button onClick={() => moveMin(i, -1)} aria-label="Move up">▲</button>
                <button onClick={() => moveMin(i, 1)} aria-label="Move down">▼</button>
              </div>
              <input value={x.name} onChange={(e) => editMin(x.id, { name: e.target.value })} aria-label="Name" />
              <input type="number" inputMode="numeric" value={x.target} onChange={(e) => editMin(x.id, { target: Number(e.target.value) || 0 })} aria-label="Target" />
              <input value={x.unit} placeholder="unit" onChange={(e) => editMin(x.id, { unit: e.target.value })} aria-label="Unit" />
              <Del onClick={() => delMin(x.id)} label={`Delete minimum "${x.name}"`} />
            </div>
          ))}
        </div>
        <form className="minedit-row add" onSubmit={addMin}>
          <span />
          <input placeholder="New minimum" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
          <input type="number" inputMode="numeric" placeholder="Target" value={m.target} onChange={(e) => setM({ ...m, target: e.target.value })} />
          <input placeholder="unit" value={m.unit} onChange={(e) => setM({ ...m, unit: e.target.value })} />
          <button className="btn primary">Add</button>
        </form>
        <label className="field">
          <span className="muted small">When you update the page you stopped at in a book, add the pages read to:</span>
          <select value={s.readingMinimumId || ""} onChange={(e) => setS({ readingMinimumId: e.target.value })}>
            <option value="">Don't count automatically</option>
            {data.minimums.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      </Card>

      <div className="grid2">
        <Card title="General">
          <div className="stack">
            <label className="field"><span className="muted small">Your name</span><input value={s.name} onChange={(e) => setS({ name: e.target.value })} /></label>
            <label className="field"><span className="muted small">Currency</span><input value={s.currency} onChange={(e) => setS({ currency: e.target.value })} /></label>
            <label className="field"><span className="muted small">Daily calorie target</span><input type="number" value={s.calorieTarget} onChange={(e) => setS({ calorieTarget: Number(e.target.value) || 0 })} /></label>
            <label className="field"><span className="muted small">Workouts per week goal</span><input type="number" value={s.workoutsPerWeek} onChange={(e) => setS({ workoutsPerWeek: Number(e.target.value) || 0 })} /></label>
          </div>
        </Card>
        <Card title="Expense categories">
          <div className="chips">
            {s.categories.map((c) => (
              <span key={c} className="chip">
                {c}
                <button className="x" aria-label={`Remove ${c}`} onClick={() => setS({ categories: s.categories.filter((x) => x !== c) })}>×</button>
              </span>
            ))}
          </div>
          <form className="addrow" onSubmit={(e) => { e.preventDefault(); if (cat.trim() && !s.categories.includes(cat.trim())) setS({ categories: [...s.categories, cat.trim()] }); setCat(""); }}>
            <input placeholder="New category" value={cat} onChange={(e) => setCat(e.target.value)} />
            <button className="btn">Add</button>
          </form>
        </Card>
      </div>

      <Card title="Data">
        <p className="muted small">
          {storage ? "Synced to your database — the same data on every device." : "Saved only in this browser. Connect storage in Vercel to sync across devices."}
          {data.updatedAt && ` Last saved ${new Date(data.updatedAt).toLocaleString("en-GB")}.`}
        </p>
        <div className="row wrap">
          <button className="btn" onClick={exportData}>Download backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Restore from backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importData} />
          <button className="btn" onClick={logout}>Lock</button>
        </div>
      </Card>
    </>
  );
}
