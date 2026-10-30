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
import Coach from "@/components/Coach";
import Icon from "@/components/Icon";

const TABS = [
  { id: "today", label: "Today", group: "Day", C: Today },
  { id: "planner", label: "Planner", group: "Day", C: Planner },
  { id: "coach", label: "Coach", group: "Day", C: Coach },
  { id: "studies", label: "Studies", group: "Work", C: Studies },
  { id: "projects", label: "Projects", group: "Work", C: Projects },
  { id: "reading", label: "Reading", group: "Work", C: Reading },
  { id: "sport", label: "Sport", group: "Body & money", C: Sport },
  { id: "food", label: "Food", group: "Body & money", C: Food },
  { id: "finance", label: "Finance", group: "Body & money", C: Finance },
  { id: "settings", label: "Settings", group: null, C: Settings },
];
const BAR = ["today", "planner", "food", "coach"]; // iPhone tab bar; the rest live under "More"
const LOCAL_KEY = "life-tracker-data";

export default function App() {
  const [status, setStatus] = useState("loading"); // loading | locked | ready | error
  const [data, setData] = useState(null);
  const [storage, setStorage] = useState(true);
  const [save, setSave] = useState("saved"); // saved | saving | error
  const [tab, setTab] = useState("today");
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: "good"|"bad", text }
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
    const q = new URLSearchParams(location.search);
    let t = q.get("tab");
    try { if (!t) t = localStorage.getItem("life-tracker-tab"); } catch {}
    if (t && TABS.some((x) => x.id === t)) setTab(t);
    if (q.get("connected")) setNotice({ kind: "good", text: `${q.get("connected") === "google" ? "Google" : "Outlook"} is connected.` });
    if (q.get("connect_error")) setNotice({ kind: "bad", text: q.get("connect_error") });
    if ([...q.keys()].length) history.replaceState(null, "", "/");
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
    setMore(false);
    try { localStorage.setItem("life-tracker-tab", id); } catch {}
    window.scrollTo({ top: 0 });
  };

  if (status === "loading") return <div className="center muted">Loading…</div>;
  if (status === "locked") return <Login />;
  if (status === "error")
    return (
      <div className="center">
        <p>Couldn't load your data.</p>
        <button className="btn" onClick={load}>Try again</button>
      </div>
    );

  const Current = TABS.find((t) => t.id === tab).C;
  const saveText = save === "saving" ? "Saving…" : save === "error" ? "Not saved, retrying on next change" : storage ? "Saved" : "Saved on this device";
  const groups = [...new Set(TABS.map((t) => t.group))];

  return (
    <div className="shell">
      <nav className="nav" aria-label="Sections">
        <div className="brand"><img src="/icons/icon-192.png" alt="" />Life</div>
        {groups.map((g) => (
          <div key={g || "end"} style={g ? undefined : { marginTop: 12 }}>
            {g && <div className="navgroup">{g}</div>}
            {TABS.filter((t) => t.group === g).map((t) => (
              <button key={t.id} className={`navbtn ${tab === t.id ? "on" : ""}`} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined}>
                <Icon name={t.id} size={19} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        ))}
        <div className={`savestate ${save}`}>{saveText}</div>
      </nav>

      <main className="main">
        {save !== "saved" && <div className={`mobile-save ${save}`}>{saveText}</div>}
        {notice && (
          <div className={`banner ${notice.kind}`}>
            <span>{notice.text}</span>
            <button className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="close" size={16} /></button>
          </div>
        )}
        {!storage && (
          <div className="banner">
            Storage isn't connected yet, so data is only kept in this browser. Connect Supabase to sync across devices (see README).
          </div>
        )}
        <Current data={data} update={update} go={go} storage={storage} />
      </main>

      <nav className="tabbar" aria-label="Sections">
        {BAR.map((id) => {
          const t = TABS.find((x) => x.id === id);
          return (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => go(id)}>
              <Icon name={id} size={23} />
              {t.label}
            </button>
          );
        })}
        <button className={!BAR.includes(tab) ? "on" : ""} onClick={() => setMore(true)}>
          <Icon name="more" size={23} />
          More
        </button>
      </nav>

      {more && (
        <>
          <div className="sheet-backdrop" onClick={() => setMore(false)} />
          <div className="sheet" role="dialog" aria-label="More sections">
            <div className="grabber" />
            <div className="sheet-grid">
              {TABS.filter((t) => !BAR.includes(t.id)).map((t) => (
                <button key={t.id} onClick={() => go(t.id)}>
                  <Icon name={t.id} size={24} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | verifying
  const [err, setErr] = useState("");
  const post = (body) =>
    fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setState("sending");
    const res = await post({ email });
    if (res?.ok) setState("sent");
    else {
      setErr((await res?.json().catch(() => ({})))?.error || "Something went wrong");
      setState("idle");
    }
  };
  const verify = async (e) => {
    e.preventDefault();
    setErr("");
    setState("verifying");
    const res = await post({ email, code });
    if (res?.ok) location.reload();
    else {
      setErr((await res?.json().catch(() => ({})))?.error || "That code didn't work");
      setState("sent");
    }
  };

  if (state === "sent" || state === "verifying")
    return (
      <form className="center login" onSubmit={verify}>
        <div className="brand big"><img src="/icons/icon-192.png" alt="" />Life</div>
        <p className="center-msg muted">If <strong>{email}</strong> has access, an email is on its way. Type the code from it here, or open its link on this device.</p>
        <input className="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus maxLength={10} />
        <button className="btn primary" disabled={code.length < 6 || state === "verifying"}>{state === "verifying" ? "Signing in…" : "Sign in"}</button>
        {err && <p className="err">{err}</p>}
        <button type="button" className="link" onClick={() => { setState("idle"); setCode(""); }}>Use a different email</button>
      </form>
    );
  return (
    <form className="center login" onSubmit={submit}>
      <div className="brand big"><img src="/icons/icon-192.png" alt="" />Life</div>
      <p className="muted">Private. Sign in to continue.</p>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required autoComplete="email" />
      <button className="btn primary" type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a sign-in code"}</button>
      {err && <p className="err">{err}</p>}
    </form>
  );
}
