"use client";

import { useState } from "react";
import { Card, Del, Empty, Header, NoteArea } from "./ui";
import { dateKey, fmtDate, parseKey, uid } from "@/lib/data";

export default function Studies({ data, update }) {
  const today = dateKey();
  const [f, setF] = useState({ title: "", subjectId: "", due: today });
  const [sub, setSub] = useState({ code: "", name: "" });
  const [showDone, setShowDone] = useState(false);

  const addDeadline = (e) => {
    e.preventDefault();
    if (!f.title.trim() || !f.due) return;
    update((d) => { d.deadlines.push({ id: uid(), title: f.title.trim(), subjectId: f.subjectId, due: f.due, done: false }); });
    setF({ ...f, title: "" });
  };
  const addSubject = (e) => {
    e.preventDefault();
    if (!sub.code.trim() && !sub.name.trim()) return;
    update((d) => { d.subjects.push({ id: uid(), code: sub.code.trim(), name: sub.name.trim(), notes: "" }); });
    setSub({ code: "", name: "" });
  };
  const edit = (coll, id, patch) => update((d) => { Object.assign(d[coll].find((x) => x.id === id), patch); });
  const remove = (coll, id) => update((d) => { d[coll] = d[coll].filter((x) => x.id !== id); });

  const list = data.deadlines
    .filter((d) => showDone || !d.done)
    .sort((a, b) => (a.done - b.done) || a.due.localeCompare(b.due));

  return (
    <>
      <Header title="Studies" sub="Subjects, assignments, exams and notes" />

      <Card
        title="Deadlines"
        right={<label className="small muted toggle"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done</label>}
      >
        <form className="formgrid" onSubmit={addDeadline}>
          <input placeholder="Assignment, quiz, exam…" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
            <option value="">No subject</option>
            {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.code || s.name}</option>)}
          </select>
          <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          <button className="btn primary">Add</button>
        </form>
        {list.length === 0 && <Empty>No open deadlines.</Empty>}
        <ul className="todos">
          {list.map((d) => {
            const s = data.subjects.find((x) => x.id === d.subjectId);
            const days = Math.round((parseKey(d.due) - parseKey(today)) / 864e5);
            const tag = d.done ? "Done" : days < 0 ? `${-days}d late` : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`;
            return (
              <li key={d.id} className={d.done ? "done" : ""}>
                <button className="check" onClick={() => edit("deadlines", d.id, { done: !d.done })} aria-label="Toggle done">{d.done ? "✓" : ""}</button>
                <span className="grow">
                  <strong>{d.title}</strong>
                  <span className="muted small"> · {s ? s.code || s.name : "General"} · {fmtDate(d.due, { weekday: "short", day: "numeric", month: "short" })}</span>
                </span>
                <span className={`pill ${!d.done && days <= 2 ? "warn" : ""}`}>{tag}</span>
                <Del onClick={() => remove("deadlines", d.id)} label="Delete deadline" />
              </li>
            );
          })}
        </ul>
      </Card>

      <h2 className="section">Subjects</h2>
      <form className="formgrid narrow" onSubmit={addSubject}>
        <input placeholder="Code (e.g. CST301)" value={sub.code} onChange={(e) => setSub({ ...sub, code: e.target.value })} />
        <input placeholder="Name" value={sub.name} onChange={(e) => setSub({ ...sub, name: e.target.value })} />
        <button className="btn">Add subject</button>
      </form>
      <div className="grid2">
        {data.subjects.map((s) => {
          const open = data.deadlines.filter((d) => d.subjectId === s.id && !d.done).length;
          return (
            <Card key={s.id}>
              <div className="row-between">
                <div className="grow inline-edit">
                  <input className="ghost strong" value={s.code} placeholder="Code" onChange={(e) => edit("subjects", s.id, { code: e.target.value })} />
                  <input className="ghost" value={s.name} placeholder="Subject name" onChange={(e) => edit("subjects", s.id, { name: e.target.value })} />
                </div>
                <span className="pill">{open} open</span>
                <Del onClick={() => remove("subjects", s.id)} label="Delete subject" />
              </div>
              <NoteArea rows={4} value={s.notes} placeholder="Notes, lecturer, exam format, topics to review…" onChange={(v) => edit("subjects", s.id, { notes: v })} />
            </Card>
          );
        })}
      </div>
    </>
  );
}
