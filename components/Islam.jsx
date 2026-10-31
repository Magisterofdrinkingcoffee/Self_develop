"use client";

import { useState } from "react";
import { Bar, Card, Del, Empty, Header, Seg } from "./ui";
import Icon from "./Icon";
import { addDays, dateKey, fmtDate, logMinimum, uid } from "@/lib/data";
import { prayerTimes } from "@/lib/prayer";
import { PRAYERS, PRAYER_NAMES, QURAN_PAGES, advanceQuran, fastingDays, hijri, prayerStats, quranPlan, setPrayer } from "@/lib/jarvis/islam";
import { isDue, newItem, review } from "@/lib/jarvis/srs";

const STATUS = [
  { value: "ontime", label: "On time" },
  { value: "late", label: "Late" },
  { value: "qada", label: "Qada" },
  { value: "missed", label: "Missed" },
];
const hm = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function Prayers({ data, update }) {
  const today = dateKey();
  const [day, setDay] = useState(today);
  const times = prayerTimes(data.settings, day);
  const log = data.prayers?.[day] || {};
  const now = new Date();
  const set = (p, s) => update((d) => { setPrayer(d, day, p, log[p] === s ? null : s); });
  return (
    <Card
      title={<><Icon name="islam" size={18} />Prayers</>}
      right={
        <div className="row">
          <button className="icon-btn neutral" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}><Icon name="left" size={16} /></button>
          <span className="small">{day === today ? "Today" : fmtDate(day, { weekday: "short", day: "numeric", month: "short" })}</span>
          <button className="icon-btn neutral" aria-label="Next day" disabled={day >= today} onClick={() => setDay(addDays(day, 1))}><Icon name="right" size={16} /></button>
        </div>
      }
    >
      <ul className="plain prayers">
        {PRAYERS.map((p) => {
          const t = times.find((x) => x.key === p)?.time;
          const future = day === today && t && t > now;
          return (
            <li key={p} className="row-between">
              <span className="grow"><strong>{PRAYER_NAMES[p]}</strong>{t && <span className="muted small num"> {hm(t)}</span>}</span>
              {future && !log[p] ? <span className="muted small">later</span> : <Seg value={log[p] || null} onChange={(s) => set(p, s)} options={STATUS} />}
            </li>
          );
        })}
      </ul>
      <p className="muted small" style={{ marginTop: 8 }}>Tap again to clear. "Missed" adds one to the qada count; logging it later as "Qada" pays it back.</p>
    </Card>
  );
}

function Stats({ data, update }) {
  const s7 = prayerStats(data, dateKey(), 7);
  const prayed = s7.ontime + s7.late + s7.qada;
  const total = prayed + s7.missed;
  const setQ = (p, v) => update((d) => { d.qada[p] = Math.max(0, Number(v) || 0); });
  return (
    <>
      <div className="stats">
        <div className="stat"><span className="muted small">Streak</span><strong>{s7.streak} {s7.streak === 1 ? "day" : "days"}</strong><span className="muted small">all five prayed</span></div>
        <div className="stat"><span className="muted small">On time, last 7 days</span><strong>{total ? Math.round((s7.ontime / total) * 100) : 0}%</strong><span className="muted small">{s7.ontime} of {total} logged</span></div>
        <div className="stat"><span className="muted small">Qada owed</span><strong>{s7.qadaOwed}</strong><span className="muted small">set below</span></div>
        <div className="stat"><span className="muted small">Not logged</span><strong>{s7.unlogged}</strong><span className="muted small">past 6 days</span></div>
      </div>
      <Card title="Qada counter">
        <div className="qada">
          {PRAYERS.map((p) => (
            <label key={p} className="field">
              <span className="muted small">{PRAYER_NAMES[p]}</span>
              <div className="stepper">
                <button onClick={() => setQ(p, (data.qada[p] || 0) - 1)} aria-label={`One less ${PRAYER_NAMES[p]}`}>−</button>
                <input type="number" inputMode="numeric" value={data.qada[p] || 0} onChange={(e) => setQ(p, e.target.value)} />
                <button onClick={() => setQ(p, (data.qada[p] || 0) + 1)} aria-label={`One more ${PRAYER_NAMES[p]}`}>+</button>
              </div>
            </label>
          ))}
        </div>
        <p className="muted small">Made one up? Press − (or tell Jarvis "prayed 2 qada fajr").</p>
      </Card>
    </>
  );
}

function Quran({ data, update }) {
  const today = dateKey();
  const q = quranPlan(data, today);
  const [n, setN] = useState("");
  const read = (pages) => {
    if (!pages) return;
    update((d) => {
      advanceQuran(d, pages, today);
      logMinimum(d, today, d.settings.quranMinimumId, pages);
    });
    setN("");
  };
  const set = (patch) => update((d) => { d.quran = { ...d.quran, ...patch }; });
  return (
    <Card title="Quran khatm" right={q.khatms > 0 && <span className="pill good">{q.khatms} khatm{q.khatms > 1 ? "s" : ""}</span>}>
      <div className="row-between"><strong className="num">Page {q.page} / {QURAN_PAGES}</strong><span className="muted small">{q.percent}%</span></div>
      <Bar value={q.page} max={QURAN_PAGES} />
      <p className="small" style={{ margin: "10px 0" }}>
        {q.goalDate ? <>Finish by {fmtDate(q.goalDate, { day: "numeric", month: "long", year: "numeric" })}: <strong>{q.pagesPerDay} pages a day</strong> ({q.daysLeft} days left).</> : <span className="muted">Set a finish date to get a daily target.</span>}
      </p>
      <div className="row wrap">
        {[1, 2, 5, 10].map((x) => <button key={x} className="btn" onClick={() => read(x)}>+{x}</button>)}
        <form className="row" onSubmit={(e) => { e.preventDefault(); read(Number(n)); }}>
          <input type="number" inputMode="numeric" placeholder="pages" value={n} onChange={(e) => setN(e.target.value)} style={{ width: 90 }} />
          <button className="btn primary">Log</button>
        </form>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>Pages also count toward your Quran minimum.</p>
      <div className="formgrid tight" style={{ marginTop: 10 }}>
        <label className="field"><span className="muted small">I'm on page</span><input type="number" min="0" max={QURAN_PAGES} value={q.page} onChange={(e) => set({ page: Math.max(0, Math.min(QURAN_PAGES, Number(e.target.value) || 0)) })} /></label>
        <label className="field"><span className="muted small">Finish by</span><input type="date" value={data.quran.goalDate || ""} onChange={(e) => set({ goalDate: e.target.value })} /></label>
      </div>
    </Card>
  );
}

function Hifz({ data, update }) {
  const today = dateKey();
  const [label, setLabel] = useState("");
  const list = [...(data.hifz || [])].sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const due = list.filter((h) => isDue(h, today));
  const add = (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    update((d) => { d.hifz = [...(d.hifz || []), { id: uid(), label: label.trim(), added: today, ...newItem(addDays(today, 1)) }]; });
    setLabel("");
  };
  const grade = (id, g) => update((d) => { const h = d.hifz.find((x) => x.id === id); Object.assign(h, review(h, g, today)); });
  return (
    <Card title="Hifz review" right={due.length > 0 && <span className="pill warn">{due.length} due</span>}>
      <p className="muted small">Memorised portions come back for review on a spaced schedule: sooner when it was hard, later when it was easy.</p>
      <form className="addrow" onSubmit={add} style={{ marginTop: 10 }}>
        <input placeholder="e.g. Al-Mulk, Juz 30 page 3" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn primary">Add</button>
      </form>
      {list.length === 0 ? <Empty>Nothing added yet.</Empty> : (
        <ul className="plain">
          {list.map((h) => (
            <li key={h.id} className="row-between">
              <span className="grow"><strong>{h.label}</strong><span className="muted small"> · {isDue(h, today) ? "due now" : `next ${fmtDate(h.due)}`}</span></span>
              {isDue(h, today) && (
                <span className="row">
                  {["Forgot", "Hard", "Good", "Easy"].map((g, i) => <button key={g} className="btn small-btn" onClick={() => grade(h.id, i)}>{g}</button>)}
                </span>
              )}
              <Del onClick={() => update((d) => { d.hifz = d.hifz.filter((x) => x.id !== h.id); })} label={`Remove ${h.label}`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Fasting({ data, update }) {
  const today = dateKey();
  const days = fastingDays(today, 21);
  const fasts = data.fasts || [];
  const thisMonth = fasts.filter((f) => f.date.slice(0, 7) === today.slice(0, 7)).length;
  const fastedToday = fasts.some((f) => f.date === today);
  return (
    <Card title="Fasting" right={<span className="pill">{thisMonth} this month</span>}>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {fastedToday ? <span className="pill good">Fasting today ✓</span> : (
          <button className="btn" onClick={() => update((d) => { d.fasts = [...(d.fasts || []), { id: uid(), date: today, kind: days.find((x) => x.date === today)?.kind || "sunnah" }]; })}>I'm fasting today</button>
        )}
      </div>
      {days.length === 0 ? <Empty>No recommended fasting days in the next 3 weeks.</Empty> : (
        <ul className="plain compact">
          {days.slice(0, 8).map((f) => (
            <li key={f.date} className="row-between">
              <span><strong>{f.date === today ? "Today" : fmtDate(f.date, { weekday: "short", day: "numeric", month: "short" })}</strong> <span className="muted small">{hijri(f.date).day} {hijri(f.date).monthName}</span></span>
              <span className="muted small">{f.reasons.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small" style={{ marginTop: 8 }}>Hijri dates use the Umm al-Qura calendar and can differ by a day from local moon sighting.</p>
    </Card>
  );
}

export default function Islam({ data, update }) {
  const today = dateKey();
  const h = hijri(today);
  return (
    <>
      <Header title="Islam" sub={`${h.label} · prayers, Quran, hifz and fasting`} />
      <Stats data={data} update={update} />
      <div className="grid2">
        <Prayers data={data} update={update} />
        <Quran data={data} update={update} />
      </div>
      <div className="grid2">
        <Hifz data={data} update={update} />
        <Fasting data={data} update={update} />
      </div>
    </>
  );
}
