"use client";

import { useEffect, useState } from "react";
import { Bar, Card, Seg } from "./ui";
import Icon from "./Icon";
import { addDays, dateKey, uid, weekStart } from "@/lib/data";

const KEY = "life-focus-timer";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const store = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} };
const fmt = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// Pomodoro-style focus sessions, logged per subject. Survives switching tabs or closing the app.
export default function FocusTimer({ data, update }) {
  const [t, setT] = useState(null); // { subjectId, plan, startedAt, pausedTotal, pausedAt }
  const [subjectId, setSubjectId] = useState(data.subjects[0]?.id || "");
  const [plan, setPlan] = useState(25);
  const [, tick] = useState(0);

  useEffect(() => { setT(load()); }, []);
  useEffect(() => {
    if (!t || t.pausedAt) return;
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [t]);

  const elapsed = t ? (t.pausedAt || Date.now()) - t.startedAt - t.pausedTotal : 0;
  const left = t ? t.plan * 60e3 - elapsed : plan * 60e3;

  const save = (v) => { setT(v); store(v); };
  const log = (minutes, subj) => {
    if (minutes < 1) return;
    update((d) => { (d.focus = d.focus || []).push({ id: uid(), date: dateKey(), subjectId: subj, minutes }); });
  };
  const finish = (complete) => {
    if (!t) return;
    log(complete ? t.plan : Math.floor(elapsed / 60e3), t.subjectId);
    save(null);
    if (complete) {
      navigator.vibrate?.([200, 100, 200]);
      const sub = data.subjects.find((s) => s.id === t.subjectId);
      if (typeof Notification !== "undefined" && Notification.permission === "granted")
        navigator.serviceWorker?.ready.then((r) => r.showNotification("Focus session done", { body: `${t.plan} min of ${sub?.code || sub?.name || "study"} logged. Take a short break.`, icon: "/icons/icon-192.png", tag: "focus" })).catch(() => {});
    }
  };
  useEffect(() => { if (t && !t.pausedAt && left <= 0) finish(true); }); // eslint-disable-line react-hooks/exhaustive-deps

  const ws = weekStart();
  const week = (data.focus || []).filter((f) => f.date >= ws && f.date <= addDays(ws, 6));
  const bySub = data.subjects.map((s) => ({ s, min: week.filter((f) => f.subjectId === s.id).reduce((a, f) => a + Number(f.minutes || 0), 0) }));
  const total = week.reduce((a, f) => a + Number(f.minutes || 0), 0);
  const maxMin = Math.max(60, ...bySub.map((b) => b.min));
  const running = t && !t.pausedAt;
  const current = t ? data.subjects.find((s) => s.id === t.subjectId) : null;

  return (
    <div className="grid2">
      <Card title={<><Icon name="flame" size={18} />Focus timer</>} right={t && <span className="pill lapis">{current?.code || current?.name || "Study"}</span>}>
        <div className={`focus-clock ${running ? "on" : ""}`}>{fmt(left)}</div>
        <Bar value={t ? elapsed : 0} max={(t ? t.plan : plan) * 60e3} />
        {!t ? (
          <div className="stack" style={{ marginTop: 12 }}>
            <div className="formgrid tight">
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject">
                {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.code || s.name}</option>)}
                <option value="">Other</option>
              </select>
              <Seg value={plan} onChange={setPlan} options={[{ value: 25, label: "25 min" }, { value: 50, label: "50 min" }, { value: 90, label: "90 min" }]} />
            </div>
            <button className="btn primary" onClick={() => save({ subjectId, plan, startedAt: Date.now(), pausedTotal: 0, pausedAt: null })}>Start focus</button>
          </div>
        ) : (
          <div className="row wrap" style={{ marginTop: 12 }}>
            {running ? (
              <button className="btn" onClick={() => save({ ...t, pausedAt: Date.now() })}>Pause</button>
            ) : (
              <button className="btn primary" onClick={() => save({ ...t, pausedTotal: t.pausedTotal + (Date.now() - t.pausedAt), pausedAt: null })}>Resume</button>
            )}
            <button className="btn" onClick={() => finish(false)}>Stop and log {Math.floor(elapsed / 60e3)} min</button>
            <button className="link small" onClick={() => confirm("Discard this session without logging it?") && save(null)}>Discard</button>
          </div>
        )}
      </Card>
      <Card title="Study time this week" right={<span className="pill">{(total / 60).toFixed(1)} h</span>}>
        <div className="cats">
          {bySub.map(({ s, min }) => (
            <div key={s.id}>
              <div className="row-between"><span>{s.code || s.name}</span><span className="num small">{min ? `${Math.floor(min / 60)}h ${min % 60}m` : "—"}</span></div>
              <Bar value={min} max={maxMin} tone="plain" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
