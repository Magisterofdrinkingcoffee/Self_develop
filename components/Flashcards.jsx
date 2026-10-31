"use client";

import { useState } from "react";
import { Card, Del, Empty } from "./ui";
import { dateKey, fmtDate, uid } from "@/lib/data";
import { isDue, newItem, review } from "@/lib/jarvis/srs";

// Spaced-repetition flashcards. Jarvis can make them from your notes ("make 10 flashcards from AIT201 lecture 4").
export default function Flashcards({ data, update }) {
  const today = dateKey();
  const cards = data.cards || [];
  const [subject, setSubject] = useState("");
  const [mode, setMode] = useState(null); // null | "review" | "browse"
  const [flip, setFlip] = useState(false);
  const [f, setF] = useState({ front: "", back: "" });
  const pool = cards.filter((c) => !subject || c.subjectId === subject);
  const due = pool.filter((c) => isDue(c, today));
  const card = due[0];
  const code = (id) => data.subjects.find((s) => s.id === id)?.code || "";

  const grade = (g) => {
    update((d) => { const c = d.cards.find((x) => x.id === card.id); Object.assign(c, review(c, g, today)); });
    setFlip(false);
  };
  const add = (e) => {
    e.preventDefault();
    if (!f.front.trim() || !f.back.trim()) return;
    update((d) => { d.cards = [...(d.cards || []), { id: uid(), subjectId: subject, front: f.front.trim(), back: f.back.trim(), created: today, ...newItem(today) }]; });
    setF({ front: "", back: "" });
  };

  return (
    <Card title="Flashcards" right={<span className={`pill ${due.length ? "warn" : ""}`}>{due.length} due · {pool.length} total</span>}>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <select value={subject} onChange={(e) => { setSubject(e.target.value); setFlip(false); }} style={{ width: "auto" }}>
          <option value="">All subjects</option>
          {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.code}{s.name ? ` ${s.name}` : ""}</option>)}
        </select>
        <button className="btn primary" disabled={!due.length} onClick={() => setMode(mode === "review" ? null : "review")}>{mode === "review" ? "Stop" : "Review"}</button>
        <button className="btn" onClick={() => setMode(mode === "browse" ? null : "browse")}>{mode === "browse" ? "Hide cards" : "All cards"}</button>
      </div>

      {mode === "review" && (card ? (
        <div className="fcard">
          <span className="muted small">{code(card.subjectId)}</span>
          <p className="front">{card.front}</p>
          {flip ? (
            <>
              <p className="back">{card.back}</p>
              <div className="row wrap">
                {["Forgot", "Hard", "Good", "Easy"].map((g, i) => <button key={g} className={`btn ${i === 2 ? "primary" : ""}`} onClick={() => grade(i)}>{g}</button>)}
              </div>
            </>
          ) : <button className="btn" onClick={() => setFlip(true)}>Show answer</button>}
        </div>
      ) : <Empty>All done for today. 🎉</Empty>)}

      {mode === "browse" && (
        <ul className="plain compact">
          {pool.map((c) => (
            <li key={c.id} className="row-between">
              <span className="grow small"><strong>{c.front}</strong><span className="muted"> — {c.back} · next {fmtDate(c.due)}</span></span>
              <Del onClick={() => update((d) => { d.cards = d.cards.filter((x) => x.id !== c.id); })} label="Delete card" />
            </li>
          ))}
        </ul>
      )}

      <form className="stack" onSubmit={add} style={{ marginTop: 12 }}>
        <input placeholder="Question" value={f.front} onChange={(e) => setF({ ...f, front: e.target.value })} />
        <input placeholder="Answer" value={f.back} onChange={(e) => setF({ ...f, back: e.target.value })} />
        <button className="btn">Add card</button>
      </form>
      <p className="muted small" style={{ marginTop: 8 }}>Or ask Jarvis: "make 10 flashcards from my AIT201 notes on overfitting".</p>
    </Card>
  );
}
