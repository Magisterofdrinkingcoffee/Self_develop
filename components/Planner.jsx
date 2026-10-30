"use client";

import { useState } from "react";
import { Card, Del, Empty, Header, NoteArea } from "./ui";
import { DAYS, addDays, dateKey, fmtDate, uid, weekStart, weekTotal } from "@/lib/data";
import Icon from "./Icon";
import { snapshot } from "@/lib/snapshot";

export default function Planner({ data, update }) {
  const [week, setWeek] = useState(weekStart());
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const today = dateKey();
  const isThisWeek = week === weekStart();

  const todosIn = data.todos.filter((t) => days.includes(t.date));
  const todosDone = todosIn.filter((t) => t.done).length;
  const workouts = data.workouts.filter((w) => days.includes(w.date)).length;
  const spent = data.money.filter((m) => days.includes(m.date) && m.type === "expense").reduce((s, m) => s + Number(m.amount || 0), 0);
  const minsMet = data.minimums.filter((m) => weekTotal(data, week, m.id) >= Number(m.target)).length;
  const studyMin = (data.focus || []).filter((f) => days.includes(f.date)).reduce((s, f) => s + Number(f.minutes || 0), 0);
  const [draft, setDraft] = useState({ busy: false, err: "" });

  // Gemini writes a first draft of the weekly review from this week's numbers
  const draftReview = async () => {
    setDraft({ busy: true, err: "" });
    try {
      const r = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: snapshot(data, [], week),
          messages: [{ role: "user", text: `Write my weekly review for ${fmtDate(week, { day: "numeric", month: "long" })} to ${fmtDate(days[6], { day: "numeric", month: "long" })}, in first person, as if I wrote it. Use the week's real numbers. Three short parts with these plain labels on their own line: "Wins:", "Slipped:", "Focus next week:". 120 to 180 words. Plain text, no markdown, no asterisks.` }],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't draft the review");
      const text = String(j.reply).replace(/\*\*/g, "").trim();
      update((d) => { d.weekly[week] = d.weekly[week] ? `${d.weekly[week]}\n\n${text}` : text; });
      setDraft({ busy: false, err: "" });
    } catch (e) {
      setDraft({ busy: false, err: String(e.message || e) });
    }
  };

  return (
    <>
      <Header
        title="Planner"
        sub={`Week of ${fmtDate(week, { day: "numeric", month: "long" })} – ${fmtDate(days[6], { day: "numeric", month: "long" })}`}
        right={
          <div className="daynav">
            <button className="btn" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><Icon name="left" size={17} /></button>
            {!isThisWeek && <button className="btn" onClick={() => setWeek(weekStart())}>This week</button>}
            <button className="btn" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><Icon name="right" size={17} /></button>
          </div>
        }
      />

      <div className="stats">
        <div className="stat"><span className="muted small">Minimums met</span><strong>{minsMet} / {data.minimums.length}</strong></div>
        <div className="stat"><span className="muted small">Tasks done</span><strong>{todosDone} / {todosIn.length}</strong></div>
        <div className="stat"><span className="muted small">Study time</span><strong>{Math.floor(studyMin / 60)}h {studyMin % 60}m</strong></div>
        <div className="stat"><span className="muted small">Workouts</span><strong>{workouts} / {data.settings.workoutsPerWeek}</strong></div>
        <div className="stat"><span className="muted small">Spent this week</span><strong>{data.settings.currency} {spent.toFixed(2)}</strong></div>
      </div>

      <Card title="Minimums this week">
        <div className="tablewrap">
          <table className="weekgrid">
            <thead>
              <tr>
                <th></th>
                {days.map((d, i) => <th key={d} className={d === today ? "today" : ""}>{DAYS[i]}<br /><span className="muted small">{fmtDate(d, { day: "numeric" })}</span></th>)}
                <th>Week</th>
              </tr>
            </thead>
            <tbody>
              {data.minimums.map((m) => {
                const total = weekTotal(data, week, m.id);
                const ok = total >= Number(m.target);
                return (
                  <tr key={m.id}>
                    <td className="rowlabel">{m.name}</td>
                    {days.map((d) => {
                      const v = data.minLog[d]?.[m.id] || 0;
                      return <td key={d} className={v > 0 ? "cell part" : "cell"}>{v > 0 ? v : ""}</td>;
                    })}
                    <td className={`cell total ${ok ? "ok" : ""}`}>{total}/{m.target}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid2">
        <Card title="Weekly summary" right={<button className="link" onClick={draftReview} disabled={draft.busy}><Icon name="coach" size={15} />{draft.busy ? "Writing…" : "Draft with AI"}</button>}>
          {draft.err && <p className="err small" style={{ marginBottom: 8 }}>{draft.err}</p>}
          <NoteArea
            rows={9}
            value={data.weekly[week]}
            placeholder="Wins this week, what didn't go to plan, lessons, focus for next week…"
            onChange={(v) => update((d) => { d.weekly[week] = v; })}
          />
        </Card>
        <Card title="Daily summaries">
          {days.filter((d) => data.daily[d]).length === 0 && <Empty>No daily summaries written this week yet.</Empty>}
          <div className="dailies">
            {days.filter((d) => data.daily[d]).map((d) => (
              <div key={d}>
                <div className="muted small">{fmtDate(d, { weekday: "long", day: "numeric", month: "short" })}</div>
                <p className="prewrap">{data.daily[d]}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Schedule data={data} update={update} />
    </>
  );
}

function Schedule({ data, update }) {
  const blank = { day: 0, start: "09:00", end: "10:00", title: "", place: "" };
  const [f, setF] = useState(blank);
  const add = (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    update((d) => { d.schedule.push({ ...f, id: uid(), day: Number(f.day), title: f.title.trim() }); });
    setF({ ...blank, day: f.day });
  };
  const del = (id) => update((d) => { d.schedule = d.schedule.filter((s) => s.id !== id); });

  return (
    <Card title="Weekly timetable">
      <form className="formgrid" onSubmit={add}>
        <select value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>
          {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        <input placeholder="Class / activity" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input placeholder="Place (optional)" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} />
        <button className="btn primary">Add</button>
      </form>
      <div className="timetable">
        {DAYS.map((name, i) => {
          const items = data.schedule.filter((s) => Number(s.day) === i).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
          return (
            <div key={name} className="ttday">
              <div className="ttname">{name}</div>
              {items.length === 0 && <div className="muted small">—</div>}
              {items.map((s) => (
                <div key={s.id} className="ttitem">
                  <div className="row-between">
                    <span className="mono small">{s.start}–{s.end}</span>
                    <Del onClick={() => del(s.id)} label="Remove from timetable" />
                  </div>
                  <strong>{s.title}</strong>
                  {s.place && <div className="muted small">{s.place}</div>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
