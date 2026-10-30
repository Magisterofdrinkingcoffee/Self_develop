"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { clearRemote } from "@/lib/useRemote";
import { Card, Del, Header } from "./ui";
import { dateKey, normalize, uid } from "@/lib/data";

function Connections({ storage }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState("");
  const [feed, setFeed] = useState({ kind: "moodle", name: "", url: "" });
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!storage) return;
    const r = await fetch("/api/integrations", { cache: "no-store" }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (r?.ok) setSt(j); else setErr(j?.error || "Couldn't load connections");
  }, [storage]);
  useEffect(() => { load(); }, [load]);

  const post = async (body, label) => {
    setErr("");
    setBusy(label);
    try {
      const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed");
      clearRemote();
      await load();
      return true;
    } catch (e) {
      setErr(String(e.message || e));
      return false;
    } finally {
      setBusy("");
    }
  };
  const disconnect = async (p) => {
    if (!confirm("Disconnect this account?")) return;
    await fetch(`/api/connect/${p}`, { method: "DELETE" });
    clearRemote();
    load();
  };

  if (!storage) return <Card title="Connections"><p className="muted small">Connect Supabase first. Accounts and keys are stored there, server-side.</p></Card>;

  const Acc = ({ id, logo, cls, name, what }) => {
    const a = st?.[id];
    return (
      <div className="conn">
        <span className={`logo ${cls}`}>{logo}</span>
        <div className="grow">
          <strong>{name}</strong>
          <div className="muted small">{a?.connected ? `Connected${a.email ? ` as ${a.email}` : ""}` : what}</div>
        </div>
        {a?.connected ? (
          <button className="btn danger" onClick={() => disconnect(id)}>Disconnect</button>
        ) : (
          <a className="btn primary" href={`/api/connect/${id}`}>{a && !a.configured ? "Set up" : "Connect"}</a>
        )}
      </div>
    );
  };

  return (
    <>
      <Card title={<><Icon name="link" size={18} />Connections</>}>
        <Acc id="google" logo="G" cls="g" name="Google" what="Calendar events and unread Gmail on Today" />
        <Acc id="microsoft" logo="O" cls="o" name="Outlook" what="Outlook calendar and unread mail (personal or university account)" />
        {(st?.feeds || []).map((f) => (
          <div key={f.id} className="conn">
            <span className={`logo ${f.kind === "moodle" ? "m" : "c"}`}>{f.kind === "moodle" ? "M" : <Icon name="calendar" size={18} />}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <strong>{f.name}</strong>
              <div className="muted small ellipsis">{f.url}</div>
            </div>
            <button className="btn danger" onClick={() => confirm(`Remove ${f.name}?`) && post({ action: "removeFeed", id: f.id }, "rm")}>Remove</button>
          </div>
        ))}
        <form className="conn" onSubmit={async (e) => { e.preventDefault(); if (await post({ action: "addFeed", ...feed }, "feed")) setFeed({ kind: "moodle", name: "", url: "" }); }}>
          <span className="logo m">+</span>
          <div className="grow stack" style={{ gap: 8 }}>
            <strong>Add a calendar link</strong>
            <div className="formgrid tight">
              <select value={feed.kind} onChange={(e) => setFeed({ ...feed, kind: e.target.value })} aria-label="Type">
                <option value="moodle">Moodle</option>
                <option value="calendar">Other calendar (.ics)</option>
              </select>
              <input placeholder="Name (optional)" value={feed.name} onChange={(e) => setFeed({ ...feed, name: e.target.value })} />
            </div>
            <input placeholder="https://… or webcal://… link" value={feed.url} onChange={(e) => setFeed({ ...feed, url: e.target.value })} />
            <details className="help">
              <summary>Where do I get the Moodle link?</summary>
              <ol className="howto">
                <li>In Moodle, open Calendar, then Import or export calendars, then Export calendar.</li>
                <li>Choose Events to export: All, and Time period: Recent and next 60 days.</li>
                <li>Click Get calendar URL and paste it here.</li>
              </ol>
              <p className="muted small" style={{ marginTop: 6 }}>Works for any .ics link too, e.g. an Outlook "Publish calendar" link if your university blocks the Connect button.</p>
            </details>
          </div>
          <button className="btn primary" disabled={!feed.url.trim() || busy === "feed"}>{busy === "feed" ? "Checking…" : "Add"}</button>
        </form>
        {err && <p className="err">{err}</p>}
      </Card>

      <Card title={<><Icon name="coach" size={18} />AI (Gemini)</>}>
        <div className="conn">
          <span className="logo ai"><Icon name="coach" size={18} /></span>
          <div className="grow">
            <strong>Gemini API key</strong>
            <div className="muted small">
              {st?.gemini?.connected
                ? st.gemini.fromEnv ? "Set in Vercel (GEMINI_API_KEY)." : "Saved. Used for calorie estimates and the Coach."
                : "Powers calorie estimates from text or photos, and the Coach. The key stays on the server."}
            </div>
          </div>
          {st?.gemini?.connected && !st.gemini.fromEnv && <button className="btn danger" onClick={() => post({ action: "removeGeminiKey" }, "k")}>Remove</button>}
        </div>
        {!st?.gemini?.connected && (
          <form className="addrow" onSubmit={async (e) => { e.preventDefault(); if (await post({ action: "setGeminiKey", key }, "key")) setKey(""); }}>
            <input type="password" placeholder="Paste key from aistudio.google.com/apikey" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
            <button className="btn primary" disabled={key.length < 20 || busy === "key"}>{busy === "key" ? "Checking…" : "Save"}</button>
          </form>
        )}
      </Card>
    </>
  );
}

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
      <Header title="Settings" sub="Connected accounts, minimums, targets and backups" />

      <Connections storage={storage} />

      <Card title="Weekly minimums">
        <p className="muted small">Targets are per week (Monday–Sunday). Log what you do each day on Today and it adds up toward the week.</p>
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
          <span className="muted small">Pages you read in a book (in the reader or by updating "where I stopped") count toward:</span>
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

      <Card title="Install as an app">
        <ul className="howto" style={{ paddingLeft: 18 }}>
          <li><strong>iPhone:</strong> open this site in Safari, tap Share, then Add to Home Screen.</li>
          <li><strong>Mac or Windows:</strong> in Chrome or Edge, click the install icon at the right end of the address bar.</li>
        </ul>
      </Card>

      <Card title="Data">
        <p className="muted small">
          {storage ? "Synced to your database — the same data on every device." : "Saved only in this browser. Connect storage in Vercel to sync across devices."}
          {data.updatedAt && ` Last saved ${new Date(data.updatedAt).toLocaleString("en-GB")}.`}
        </p>
        <div className="row wrap">
          <button className="btn" onClick={exportData}>Download backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Restore from backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importData} />
          <button className="btn" onClick={logout}>Log out</button>
        </div>
      </Card>
    </>
  );
}
