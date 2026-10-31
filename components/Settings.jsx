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
  const [setup, setSetup] = useState("");
  const [app, setApp] = useState({ id: "", secret: "" });
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(location.origin); }, []);

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

  const Acc = ({ id, logo, cls, name, what, help }) => {
    const a = st?.[id];
    const open = setup === id;
    return (
      <div className="conn">
        <span className={`logo ${cls}`}>{logo}</span>
        <div className="grow">
          <strong>{name}</strong>
          <div className="muted small">{a?.connected ? `Connected${a.email ? ` as ${a.email}` : ""}` : what}</div>
        </div>
        {a?.connected ? (
          <button className="btn danger" onClick={() => disconnect(id)}>Disconnect</button>
        ) : a && !a.configured ? (
          <button className="btn" onClick={() => setSetup(open ? "" : id)}>{open ? "Close" : "Set up"}</button>
        ) : (
          <a className="btn primary" href={`/api/connect/${id}`}>Connect</a>
        )}
        {open && (
          <form className="setup" onSubmit={async (e) => { e.preventDefault(); if (await post({ action: "setAppCreds", provider: id, id: app.id, secret: app.secret }, "app")) { setApp({ id: "", secret: "" }); setSetup(""); } }}>
            <p className="muted small">{help}</p>
            <label className="field"><span className="muted small">Redirect URI to paste there</span>
              <span className="row"><input readOnly value={`${origin}/api/connect/${id}/callback`} onFocus={(e) => e.target.select()} /><button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(`${origin}/api/connect/${id}/callback`)}>Copy</button></span>
            </label>
            <div className="formgrid tight">
              <input placeholder="Client ID" value={app.id} onChange={(e) => setApp({ ...app, id: e.target.value })} autoComplete="off" />
              <input type="password" placeholder="Client secret" value={app.secret} onChange={(e) => setApp({ ...app, secret: e.target.value })} autoComplete="off" />
            </div>
            <button className="btn primary" disabled={busy === "app"}>{busy === "app" ? "Saving…" : "Save, then press Connect"}</button>
          </form>
        )}
      </div>
    );
  };

  return (
    <>
      <Card title={<><Icon name="link" size={18} />Connections</>}>
        <Acc id="google" logo="G" cls="g" name="Google" what="Calendar events and unread Gmail on Today" help="Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Full steps are in the README." />
        <Acc id="microsoft" logo="O" cls="o" name="Outlook" what="Outlook calendar and unread mail (personal or university account)" help="entra.microsoft.com → App registrations → your app. Client ID is the Application ID; the secret is under Certificates & secrets." />
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
                ? st.gemini.fromEnv ? "Set in Vercel (GEMINI_API_KEY)." : "Saved. Powers Jarvis and calorie estimates."
                : "Powers Jarvis, calorie estimates and notes search. Free at aistudio.google.com. The key stays on the server."}
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

const urlB64ToUint8 = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

function Notifications({ storage }) {
  const [st, setSt] = useState({ state: "loading", devices: [], msg: "" });
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent);
  const standalone = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone);

  const refresh = useCallback(async () => {
    if (!storage) return;
    const r = await fetch("/api/push", { cache: "no-store" }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    let mine = false;
    try { const reg = await navigator.serviceWorker?.getRegistration(); const sub = await reg?.pushManager.getSubscription(); mine = !!sub && (j?.devices || []).some((d) => d.endpoint === sub.endpoint); } catch {}
    setSt((s) => ({ ...s, state: mine ? "on" : "off", devices: j?.devices || [], key: j?.publicKey }));
  }, [storage]);
  useEffect(() => { refresh(); }, [refresh]);

  const enable = async () => {
    setSt((s) => ({ ...s, msg: "" }));
    try {
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked. Allow them in your browser or iPhone settings.");
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(st.key) }));
      const device = ios ? "iPhone" : /Mac/.test(navigator.userAgent) ? "Mac" : /Windows/.test(navigator.userAgent) ? "Windows" : "This device";
      const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), device }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't save this device");
      await refresh();
      setSt((s) => ({ ...s, msg: "Notifications are on for this device." }));
    } catch (e) {
      setSt((s) => ({ ...s, msg: String(e.message || e) }));
    }
  };
  const disable = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    } catch {}
    refresh();
  };
  const test = async (kind) => {
    setSt((s) => ({ ...s, msg: "Sending…" }));
    const r = await fetch("/api/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setSt((s) => ({ ...s, msg: r?.ok ? `Sent to ${j.sent} device${j.sent === 1 ? "" : "s"}.` : j?.error || "Couldn't send" }));
  };

  return (
    <Card title="Notifications">
      <p className="muted small">Turn on for each device where you want Jarvis to reach you: the morning briefing, prayer reminders, reminders you ask for and the evening review. What gets sent is set in the Jarvis card below.</p>
      {!storage ? <p className="muted small">Connect Supabase first.</p> : !supported ? (
        <p className="small" style={{ marginTop: 10 }}>{ios && !standalone ? "On iPhone, add the app to your Home Screen first, open it from there, then turn notifications on here." : "This browser doesn't support notifications."}</p>
      ) : (
        <div className="row wrap" style={{ marginTop: 12 }}>
          {st.state === "on" ? <button className="btn" onClick={disable}>Turn off on this device</button> : <button className="btn primary" onClick={enable} disabled={st.state === "loading" || !st.key}>Turn on for this device</button>}
          {st.devices.length > 0 && <><button className="btn" onClick={() => test("morning")}>Send morning test</button><button className="btn" onClick={() => test("evening")}>Send evening test</button></>}
        </div>
      )}
      {st.devices.length > 0 && <p className="muted small" style={{ marginTop: 10 }}>On for: {st.devices.map((d) => d.device || "device").join(", ")}</p>}
      {st.msg && <p className="small" style={{ marginTop: 8 }}>{st.msg}</p>}
    </Card>
  );
}

function Copy({ label, value, area }) {
  return (
    <label className="field">
      <span className="muted small">{label}</span>
      <span className="row">
        {area ? <textarea readOnly rows={8} value={value} onFocus={(e) => e.target.select()} className="mono" /> : <input readOnly value={value} onFocus={(e) => e.target.select()} />}
        <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(value)}>Copy</button>
      </span>
    </label>
  );
}

function JarvisSetup({ storage, data, update }) {
  const [token, setToken] = useState("");
  const [open, setOpen] = useState("");
  const [origin, setOrigin] = useState("");
  const [tick, setTick] = useState(null);
  useEffect(() => { setOrigin(location.origin); }, []);
  const get = async (regen) => {
    const r = await fetch("/api/quick", { method: regen ? "PUT" : "GET", cache: "no-store" }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (j?.token) setToken(j.token);
  };
  useEffect(() => {
    if (!storage) return;
    fetch("/api/jarvis", { cache: "no-store" }).then((r) => r.json()).then((j) => setTick(j.tick || false)).catch(() => {});
  }, [storage]);
  const show = (k) => { setOpen(open === k ? "" : k); if (!token) get(false); };
  const j = data.settings.jarvis || {};
  const setJ = (patch) => update((d) => { d.settings.jarvis = { ...d.settings.jarvis, ...patch }; });
  const sql = `create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('jarvis-tick') where exists (select 1 from cron.job where jobname = 'jarvis-tick');
select cron.schedule('jarvis-tick', '*/5 * * * *', $$
  select net.http_post(
    url := '${origin}/api/jarvis/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ${token || "YOUR-TOKEN"}'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);`;
  const lastTick = tick?.lastRun ? Math.round((Date.now() - new Date(tick.lastRun)) / 60e3) : null;
  const Toggle = ({ k, children }) => (
    <label className="toggle small"><input type="checkbox" checked={j[k] !== false} onChange={(e) => setJ({ [k]: e.target.checked })} /> {children}</label>
  );

  if (!storage) return <Card title={<><Icon name="jarvis" size={18} />Jarvis</>}><p className="muted small">Connect Supabase first.</p></Card>;

  return (
    <Card title={<><Icon name="jarvis" size={18} />Jarvis</>}>
      <p className="muted small">Tap the round mic button on any screen to talk to Jarvis. Short commands like "quran 10" or "asr late" are handled instantly without using any AI quota.</p>
      <label className="toggle small" style={{ marginTop: 10 }}><input type="checkbox" checked={!!j.openOnJarvis} onChange={(e) => setJ({ openOnJarvis: e.target.checked })} /> Open the app straight on Jarvis</label>

      <div className="setup-list">
        <button className="setup-row" onClick={() => show("siri")} aria-expanded={open === "siri"}>
          <strong>Siri: "Hey Siri, Jarvis"</strong><span className="muted small">3 steps, about 1 minute</span>
        </button>
        {open === "siri" && (
          <div className="stack setup-body">
            <Copy label="Your Siri link (private, it works like a password)" value={token ? `${origin}/api/jarvis/siri?token=${token}&q=` : "Loading…"} />
            <ol className="howto">
              <li>Shortcuts app → <strong>+</strong> → rename it <strong>Jarvis</strong>.</li>
              <li>Add <strong>Dictate Text</strong>.</li>
              <li>Add <strong>Get Contents of URL</strong>. Paste the link, then at the very end tap and insert <strong>Dictated Text</strong>. Nothing else to change.</li>
              <li>Add <strong>Speak Text</strong>.</li>
            </ol>
            <p className="small">Now say <strong>"Hey Siri, Jarvis"</strong>, then talk. Tip: put it on the Action Button or Back Tap for one press.</p>
            <button className="link small" onClick={() => confirm("Make a new link? The old Siri shortcut, health automation and tick stop working until you update them.") && get(true)}>Make a new link</button>
          </div>
        )}

        <button className="setup-row" onClick={() => show("tick")} aria-expanded={open === "tick"}>
          <strong>1. Proactive notifications</strong>
          <span className={`small ${lastTick != null && lastTick < 15 ? "pos" : "muted"}`}>{lastTick == null ? "Not set up yet" : lastTick < 15 ? `Running · last check ${lastTick} min ago` : `Last check ${lastTick} min ago (stopped?)`}</span>
        </button>
        {open === "tick" && (
          <div className="stack setup-body">
            <p className="small">Supabase calls Jarvis every 5 minutes (free) and Jarvis decides if anything is due. Turn on Notifications above first, on each device.</p>
            <ol className="howto">
              <li>Supabase → your project → <strong>SQL Editor</strong> → New query.</li>
              <li>Paste this and press <strong>Run</strong>. It's already filled in with your site and token.</li>
            </ol>
            <Copy label="SQL" value={sql} area />
            <p className="muted small">Check: run <code>select * from cron.job_run_details order by start_time desc limit 5;</code>. This card shows "Running" once the first check arrives.</p>
          </div>
        )}

        <button className="setup-row" onClick={() => show("health")} aria-expanded={open === "health"}>
          <strong>2. Apple Health</strong><span className="muted small">Steps, sleep, heart rate and weight every night</span>
        </button>
        {open === "health" && (
          <div className="stack setup-body">
            <ol className="howto">
              <li>Shortcuts → <strong>Automation</strong> → <strong>+</strong> → <strong>Time of Day</strong> 23:00, Daily, <strong>Run Immediately</strong>.</li>
              <li>Add <strong>Find Health Samples</strong>: Type Steps, Start Date is today, Group by Day. Then <strong>Calculate Statistics</strong> → Sum.</li>
              <li>Add <strong>Find Health Samples</strong>: Sleep Analysis, Start Date in the last 1 day. Then <strong>Calculate Statistics</strong> → Sum of Duration (in hours).</li>
              <li>Optional: Resting Heart Rate (latest) and Weight (latest, kg).</li>
              <li>Add <strong>Get Contents of URL</strong>: URL below, POST, header <code>Authorization</code> = <code>Bearer</code> + token, JSON body with keys <code>steps</code>, <code>sleepH</code>, <code>restingHr</code>, <code>weightKg</code> set to those results.</li>
            </ol>
            <Copy label="URL" value={`${origin}/api/jarvis/health`} />
            <Copy label="Token (private)" value={token} />
            <button className="link small" onClick={() => confirm("Make a new token? The health automation and the 5-minute tick need the new one.") && get(true)}>Make a new token</button>
          </div>
        )}
      </div>

      <h4 className="subhead">What Jarvis tells you on its own</h4>
      <div className="toggles">
        <Toggle k="briefing">Morning briefing, {j.briefingDelay ?? 20} min after Subuh</Toggle>
        <Toggle k="prayerReminders">Reminder {j.prayerReminderMin ?? 10} min before each prayer</Toggle>
        <Toggle k="prayerCheck">"Did you pray…?" if a prayer isn't logged</Toggle>
        <Toggle k="adhkar">Evening adhkar after Asar</Toggle>
        <Toggle k="deadlines">Deadline watchdog (18:00)</Toggle>
        <Toggle k="fasting">Sunnah fasting the evening before</Toggle>
        <Toggle k="evening">Evening review after Isyak</Toggle>
      </div>
      <div className="formgrid tight" style={{ marginTop: 10 }}>
        <label className="field"><span className="muted small">Quiet from (until Subuh)</span><input type="time" value={j.quietFrom || "23:00"} onChange={(e) => setJ({ quietFrom: e.target.value })} /></label>
        <label className="field"><span className="muted small">Max nudges a day</span><input type="number" min="0" max="30" value={j.maxNudges ?? 8} onChange={(e) => setJ({ maxNudges: Number(e.target.value) || 0 })} /></label>
        <label className="field"><span className="muted small">Minutes before prayer</span><input type="number" min="0" max="60" value={j.prayerReminderMin ?? 10} onChange={(e) => setJ({ prayerReminderMin: Number(e.target.value) || 0 })} /></label>
        <label className="field"><span className="muted small">Assistant's name</span><input value={j.voiceName || "Jarvis"} onChange={(e) => setJ({ voiceName: e.target.value })} /></label>
      </div>
      <p className="muted small">Nudges never come during your classes or quiet hours. Prayer reminders and your own reminders always do.</p>
    </Card>
  );
}

function Prayer({ data, update }) {
  const s = data.settings;
  const setS = (patch) => update((d) => { Object.assign(d.settings, patch); });
  const [msg, setMsg] = useState("");
  const here = () => {
    setMsg("Finding your location…");
    navigator.geolocation?.getCurrentPosition(
      (p) => { setS({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 }); setMsg("Location updated."); },
      () => setMsg("Location isn't available. Enter it by hand."),
      { timeout: 10000 }
    );
  };
  return (
    <Card title="Prayer times" right={<label className="toggle small"><input type="checkbox" checked={s.showPrayers !== false} onChange={(e) => setS({ showPrayers: e.target.checked })} /> Show</label>}>
      <p className="muted small">Shown in the agenda, on Today and in the evening check-in. Calculated on your device.</p>
      <div className="formgrid" style={{ marginTop: 10 }}>
        <label className="field"><span className="muted small">Latitude</span><input type="number" step="0.0001" value={s.lat} onChange={(e) => setS({ lat: Number(e.target.value) })} /></label>
        <label className="field"><span className="muted small">Longitude</span><input type="number" step="0.0001" value={s.lng} onChange={(e) => setS({ lng: Number(e.target.value) })} /></label>
        <label className="field"><span className="muted small">Method</span>
          <select value={s.prayerMethod} onChange={(e) => setS({ prayerMethod: e.target.value })}>
            <option value="Singapore">Malaysia / JAKIM (20°, 18°)</option>
            <option value="Turkey">Kazakhstan / Turkey</option>
            <option value="MuslimWorldLeague">Muslim World League</option>
            <option value="Karachi">Karachi</option>
            <option value="UmmAlQura">Umm al-Qura</option>
          </select>
        </label>
        <label className="field"><span className="muted small">Asr</span>
          <select value={s.madhab} onChange={(e) => setS({ madhab: e.target.value })}>
            <option value="Shafi">Standard (Shafi'i), used in Malaysia</option>
            <option value="Hanafi">Hanafi, used in Kazakhstan</option>
          </select>
        </label>
      </div>
      <div className="row wrap"><button className="btn" onClick={here}>Use my location</button>{msg && <span className="muted small">{msg}</span>}</div>
    </Card>
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

      <Notifications storage={storage} />
      <JarvisSetup storage={storage} data={data} update={update} />

      <Card title="Install as an app">
        <ul className="howto" style={{ paddingLeft: 18 }}>
          <li><strong>iPhone:</strong> open this site in Safari, tap Share, then Add to Home Screen. Open it and sign in once.</li>
          <li><strong>Mac or Windows:</strong> in Chrome or Edge, click the install icon at the right end of the address bar.</li>
        </ul>
      </Card>

      <Prayer data={data} update={update} />

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
