"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalize } from "@/lib/data";
import Today from "@/components/Today";
import Planner from "@/components/Planner";
import Studies from "@/components/Studies";
import Projects from "@/components/Projects";
import Reading from "@/components/Reading";
import Sport from "@/components/Sport";
import Food from "@/components/Food";
import Finance from "@/components/Finance";
import Settings from "@/components/Settings";

const TABS = [
  { id: "today", label: "Today", icon: "◉", C: Today },
  { id: "planner", label: "Planner", icon: "▦", C: Planner },
  { id: "studies", label: "Studies", icon: "✎", C: Studies },
  { id: "projects", label: "Projects", icon: "◆", C: Projects },
  { id: "reading", label: "Reading", icon: "▤", C: Reading },
  { id: "sport", label: "Sport", icon: "▲", C: Sport },
  { id: "food", label: "Food", icon: "●", C: Food },
  { id: "finance", label: "Finance", icon: "¤", C: Finance },
  { id: "settings", label: "Settings", icon: "⚙", C: Settings },
];

const LOCAL_KEY = "life-tracker-data";

export default function App() {
  const [status, setStatus] = useState("loading"); // loading | locked | ready | error
  const [data, setData] = useState(null);
  const [storage, setStorage] = useState(true);
  const [save, setSave] = useState("saved"); // saved | saving | error
  const [tab, setTab] = useState("today");
  const timer = useRef(null);
  const first = useRef(true);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (res.status === 401) return setStatus("locked");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Load failed");
      if (json.storage) {
        setStorage(true);
        setData(normalize(json.data));
      } else {
        setStorage(false);
        let local = null;
        try { local = JSON.parse(localStorage.getItem(LOCAL_KEY)); } catch {}
        setData(normalize(local));
      }
      first.current = true;
      setStatus("ready");
    } catch (e) {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
    try {
      const t = localStorage.getItem("life-tracker-tab");
      if (t && TABS.some((x) => x.id === t)) setTab(t);
    } catch {}
  }, [load]);

  // Debounced autosave
  useEffect(() => {
    if (!data) return;
    if (first.current) { first.current = false; return; }
    setSave("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!storage) {
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); setSave("saved"); }
        catch { setSave("error"); }
        return;
      }
      try {
        const res = await fetch("/api/data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.status === 401) return setStatus("locked");
        setSave(res.ok ? "saved" : "error");
      } catch {
        setSave("error");
      }
    }, 700);
  }, [data, storage]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const h = (e) => { if (save === "saving") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);

  // fn mutates a copy (or returns a whole new object, e.g. restore from backup)
  const update = useCallback(
    (fn) =>
      setData((d) => {
        const copy = structuredClone(d);
        return fn(copy) || copy;
      }),
    []
  );

  const go = (id) => {
    setTab(id);
    try { localStorage.setItem("life-tracker-tab", id); } catch {}
    window.scrollTo({ top: 0 });
  };

  if (status === "loading") return <div className="center muted">Loading…</div>;
  if (status === "locked") return <Login onDone={load} />;
  if (status === "error")
    return (
      <div className="center">
        <p>Couldn't load your data.</p>
        <button className="btn" onClick={load}>Try again</button>
      </div>
    );

  const Current = TABS.find((t) => t.id === tab).C;

  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">Life<span>.</span></div>
        {TABS.map((t) => (
          <button key={t.id} className={`navbtn ${tab === t.id ? "on" : ""}`} onClick={() => go(t.id)}>
            <span className="ico">{t.icon}</span>
            <span className="lbl">{t.label}</span>
          </button>
        ))}
        <div className={`savestate ${save}`}>
          {save === "saving" ? "Saving…" : save === "error" ? "Not saved, retrying on next change" : storage ? "Saved" : "Saved on this device"}
        </div>
      </nav>
      <main className="main">
        {!storage && (
          <div className="banner">
            Storage isn't connected yet, so data is only kept in this browser. Connect Upstash Redis in Vercel to sync across devices (see README).
          </div>
        )}
        <Current data={data} update={update} go={go} storage={storage} />
      </main>
    </div>
  );
}

function Login({ onDone }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) onDone();
    else setErr("Wrong password");
  };
  return (
    <form className="center login" onSubmit={submit}>
      <div className="brand big">Life<span>.</span></div>
      <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      <button className="btn primary" type="submit">Unlock</button>
      {err && <p className="err">{err}</p>}
    </form>
  );
}
