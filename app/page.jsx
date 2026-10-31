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
import Jarvis from "@/components/Jarvis";
import Islam from "@/components/Islam";
import Icon from "@/components/Icon";

const TABS = [
  { id: "today", label: "Today", group: "Day", C: Today },
  { id: "planner", label: "Planner", group: "Day", C: Planner },
  { id: "jarvis", label: "Jarvis", group: "Day", C: Jarvis },
  { id: "islam", label: "Islam", group: "Day", C: Islam },
  { id: "studies", label: "Studies", group: "Work", C: Studies },
  { id: "projects", label: "Projects", group: "Work", C: Projects },
  { id: "reading", label: "Reading", group: "Work", C: Reading },
  { id: "sport", label: "Sport", group: "Body & money", C: Sport },
  { id: "food", label: "Food", group: "Body & money", C: Food },
  { id: "finance", label: "Finance", group: "Body & money", C: Finance },
  { id: "settings", label: "Settings", group: null, C: Settings },
];
const BAR = ["today", "jarvis", "islam", "planner"]; // iPhone tab bar; the rest live under "More"
const LOCAL_KEY = "life-tracker-data";

export default function App() {
  const [status, setStatus] = useState("loading"); // loading | locked | ready | error
  const [data, setData] = useState(null);
  const [storage, setStorage] = useState(true);
  const [save, setSave] = useState("saved"); // saved | saving | error
  const [tab, setTab] = useState("today");
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: "good"|"bad", text }
  const [listenAt, setListenAt] = useState(0); // set to start Jarvis listening right away
  const askedTab = useRef(false);
  const timer = useRef(null);
  const first = useRef(true);
  const version = useRef(null); // data.updatedAt of what we last loaded/saved
  const saveRef = useRef("saved");
  saveRef.current = save;

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (res.status === 401) return setStatus("locked");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Load failed");
      if (json.storage) {
        setStorage(true);
        version.current = json.data?.updatedAt ?? null;
        const d = normalize(json.data);
        setData(d);
        if (!askedTab.current && d.settings.jarvis?.openOnJarvis) setTab("jarvis");
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
    if (t === "coach") t = "jarvis";
    if (q.get("tab")) askedTab.current = true;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
    // Opened by the Siri shortcut (/?listen=1): remember it, so it still works after signing in
    if (q.get("listen")) { try { sessionStorage.setItem("jarvis-listen", String(Date.now())); } catch {} }
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
          body: JSON.stringify({ ...data, _base: version.current }),
        });
        if (res.status === 401) return setStatus("locked");
        const json = await res.json().catch(() => ({}));
        if (res.status === 409 && json.data) {
          // Another device (or a Siri quick-add) saved first: take the newer data
          version.current = json.data.updatedAt ?? null;
          first.current = true;
          setData(normalize(json.data));
          setNotice({ kind: "bad", text: "This was changed on another device, so the newest version was loaded. Your last edit here wasn't saved; please redo it." });
          setSave("saved");
          return;
        }
        if (res.ok) version.current = json.updatedAt;
        setSave(res.ok ? "saved" : "error");
      } catch {
        setSave("error");
      }
    }, 700);
  }, [data, storage]);

  // Pick up changes from other devices: when the app comes back to the foreground, and every minute while open
  useEffect(() => {
    if (status !== "ready" || !storage) return;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || saveRef.current !== "saved") return;
      try {
        const res = await fetch("/api/data", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const v = json.data?.updatedAt ?? null;
        if (v && v !== version.current && saveRef.current === "saved") {
          version.current = v;
          first.current = true;
          setData(normalize(json.data));
        }
      } catch {}
    };
    document.addEventListener("visibilitychange", refresh);
    const iv = setInterval(refresh, 60e3);
    return () => { document.removeEventListener("visibilitychange", refresh); clearInterval(iv); };
  }, [status, storage]);

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

  // Start listening once the app is ready, if Siri (or the app shortcut) opened it with ?listen=1
  useEffect(() => {
    if (status !== "ready") return;
    let at = 0;
    try { at = Number(sessionStorage.getItem("jarvis-listen") || 0); sessionStorage.removeItem("jarvis-listen"); } catch {}
    if (at && Date.now() - at < 5 * 60e3) { setTab("jarvis"); setListenAt(Date.now()); }
  }, [status]);

  // Take a newer copy of the data saved on the server (by Jarvis, an undo, a notification button)
  const adopt = useCallback((d) => {
    if (!d) return;
    version.current = d.updatedAt ?? null;
    first.current = true;
    setData(normalize(d));
  }, []);

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
        <Current data={data} update={update} go={go} storage={storage} adopt={adopt} listenAt={listenAt} />
      </main>

      {tab !== "jarvis" && (
        <button className="fab" aria-label={`Talk to ${data.settings.jarvis?.voiceName || "Jarvis"}`} title={`Talk to ${data.settings.jarvis?.voiceName || "Jarvis"}`} onClick={() => { go("jarvis"); setListenAt(Date.now()); }}>
          <Icon name="mic" size={24} />
        </button>
      )}

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
  const [f, setF] = useState({ username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    if (res?.ok) return location.reload();
    setErr((await res?.json().catch(() => ({})))?.error || "Couldn't reach the server. Check your connection.");
    setBusy(false);
  };
  return (
    <form className="center login" onSubmit={submit}>
      <div className="brand big"><img src="/icons/icon-192.png" alt="" />Life</div>
      <p className="muted">Private. Sign in to continue.</p>
      <input placeholder="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoFocus required autoCapitalize="none" autoCorrect="off" autoComplete="username" />
      <input type="password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required autoComplete="current-password" />
      <button className="btn primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      {err && <p className="err">{err}</p>}
    </form>
  );
}
