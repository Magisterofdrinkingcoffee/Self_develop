"use client";

import { useRef, useState } from "react";
import Icon from "./Icon";
import { Bar, Card, Del, Empty, Header } from "./ui";
import { addDays, dateKey, fmtDate, uid } from "@/lib/data";

// Shrink a photo before sending it to Gemini (faster on mobile data, well under request limits)
async function shrink(file, max = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function AiMeal({ onAdd, go }) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { setPhoto(await shrink(f)); } catch { setErr("That photo couldn't be opened."); }
  };
  const estimate = async (e) => {
    e.preventDefault();
    setErr("");
    setRes(null);
    setBusy(true);
    try {
      const r = await fetch("/api/ai/food", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, image: photo }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Estimate failed");
      setRes(j);
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setBusy(false);
    }
  };
  const addAll = () => {
    onAdd(res.items);
    setRes(null);
    setText("");
    setPhoto(null);
  };
  const sum = (k) => (res?.items || []).reduce((s, i) => s + (i[k] || 0), 0);

  return (
    <form className="ai-box" onSubmit={estimate}>
      <div className="row-between">
        <strong className="row"><Icon name="coach" size={18} />Estimate with AI</strong>
        <span className="muted small">Gemini</span>
      </div>
      <textarea rows={2} placeholder="e.g. nasi lemak with fried chicken and teh tarik kurang manis" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row wrap">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="camera" size={17} />{photo ? "Change photo" : "Photo"}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
        {photo && <img className="photo-preview" src={photo} alt="Meal photo" />}
        {photo && <button type="button" className="link small" onClick={() => setPhoto(null)}>Remove</button>}
        <span className="grow" />
        <button className="btn primary" disabled={busy || (!text.trim() && !photo)}>{busy ? "Estimating…" : "Estimate"}</button>
      </div>
      {err && (
        <p className="err">
          {err}{" "}
          {/key/i.test(err) && <button type="button" className="link" onClick={() => go("settings")}>Open Settings</button>}
        </p>
      )}
      {res && (
        <>
          <ul className="ai-items">
            {res.items.map((i, n) => (
              <li key={n}>
                <strong>{i.name}</strong><strong className="num">{i.kcal} kcal</strong>
                <span className="muted small">{i.portion}</span>
                <span className="muted small num">P {i.protein} · C {i.carbs} · F {i.fat}</span>
              </li>
            ))}
          </ul>
          <div className="row-between wrap">
            <span className="macros"><span>Total <b>{sum("kcal")} kcal</b></span><span>Protein <b>{sum("protein")}g</b></span><span>Carbs <b>{sum("carbs")}g</b></span><span>Fat <b>{sum("fat")}g</b></span></span>
            <button type="button" className="btn primary" onClick={addAll}><Icon name="plus" size={16} />Add to log</button>
          </div>
          {res.note && <p className="muted small">{res.note}</p>}
        </>
      )}
    </form>
  );
}

export default function Food({ data, update, go }) {
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
  const addMany = (items) =>
    update((d) => {
      items.forEach((i) => d.meals.push({ id: uid(), date: day, name: i.name, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat }));
    });
  const remove = (id) => update((d) => { d.meals = d.meals.filter((m) => m.id !== id); });

  const meals = data.meals.filter((m) => m.date === day);
  const total = meals.reduce((s, m) => s + Number(m.kcal || 0), 0);
  const left = target - total;
  const mac = (k) => meals.reduce((s, m) => s + Number(m[k] || 0), 0);
  const hasMacros = meals.some((m) => m.protein != null);

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
            <button className="btn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day"><Icon name="left" size={17} /></button>
            <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
            <button className="btn" onClick={() => setDay(addDays(day, 1))} aria-label="Next day"><Icon name="right" size={17} /></button>
          </div>
        }
      />
      <div className="stats">
        <div className="stat wide">
          <span className="muted small">{fmtDate(day, { weekday: "long", day: "numeric", month: "short" })}</span>
          <strong>{total} / {target} kcal</strong>
          <Bar value={total} max={target} tone={total > target ? "over" : ""} />
          <span className="muted small">{left >= 0 ? `${left} kcal left` : `${-left} kcal over`}</span>
          {hasMacros && <span className="macros"><span>Protein <b>{mac("protein")}g</b></span><span>Carbs <b>{mac("carbs")}g</b></span><span>Fat <b>{mac("fat")}g</b></span></span>}
        </div>
        <div className="stat"><span className="muted small">7-day average</span><strong>{avg ? `${avg} kcal` : "—"}</strong></div>
      </div>

      <div className="grid2">
        <Card title="Add food">
          <AiMeal onAdd={addMany} go={go} />
          <p className="muted small" style={{ margin: "14px 0 8px" }}>Or add it yourself</p>
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
              <li key={m.id} className="row-between"><span className="grow">{m.name}{m.protein != null && <span className="muted small num"> P {m.protein} · C {m.carbs} · F {m.fat}</span>}</span><strong className="num">{m.kcal}</strong><Del onClick={() => remove(m.id)} label="Delete" /></li>
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
