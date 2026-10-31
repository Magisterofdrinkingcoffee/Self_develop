"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Header } from "./ui";
import Icon from "./Icon";

const PROMPTS = [
  { q: "Plan the rest of my day", sub: "Around classes, prayers and deadlines" },
  { q: "Did 30 push-ups and read 5 pages of Quran", sub: "Log several things at once" },
  { q: "Quiz me on my flashcards", sub: "Spaced repetition, right here" },
  { q: "How am I doing this week?", sub: "Minimums, prayers, gym, food" },
  { q: "What does Surah Al-Asr say?", sub: "Real verses with translation" },
  { q: "Should I add weight on bench press?", sub: "Progressive overload from your log" },
];

const LANGS = [
  { v: "en-US", l: "EN" },
  { v: "ru-RU", l: "RU" },
  { v: "kk-KZ", l: "KZ" },
];

const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Minimal, safe markdown: paragraphs, "- " lists, **bold**
export function Rich({ text }) {
  const blocks = String(text).split(/\n{2,}/);
  const inline = (t, k) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong> : p));
  return blocks.map((b, i) => {
    const lines = b.split("\n").filter(Boolean);
    if (lines.length && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)))
      return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${i}-${j}`)}</li>)}</ul>;
    return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l.replace(/^#+\s*/, ""), `${i}-${j}`)}</span>)}</p>;
  });
}

// Resize a photo in the browser before sending (keeps requests small and fast)
async function shrink(file, max = 1280) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.82);
  return { mime: "image/jpeg", data: url.split(",")[1], preview: url };
}

const plainForSpeech = (t) => String(t).replace(/\*\*/g, "").replace(/^\s*[-*•]\s+/gm, "").replace(/#+\s*/g, "");

export default function Jarvis({ data, update, go, storage, adopt, listenAt }) {
  const [turns, setTurns] = useState([]);
  const [log, setLog] = useState([]);
  const [usage, setUsage] = useState(null);
  const [input, setInput] = useState("");
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [lang, setLang] = useState("en-US");
  const [undone, setUndone] = useState({});
  const [showMem, setShowMem] = useState(false);
  const endRef = useRef(null);
  const recRef = useRef(null);
  const fileRef = useRef(null);
  const name = data.settings.jarvis?.voiceName || "Jarvis";
  const canListen = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => { setSpeak(store.get("jarvis-speak", false)); setLang(store.get("jarvis-lang", "en-US")); }, []);

  const load = useCallback(async () => {
    if (!storage) return;
    const r = await fetch("/api/jarvis", { cache: "no-store" }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (r?.ok) { setTurns(j.turns || []); setLog(j.actions || []); setUsage(j.usage); }
  }, [storage]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);

  const say = (text) => {
    if (!speak || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plainForSpeech(text));
    u.lang = lang;
    speechSynthesis.speak(u);
  };

  const send = async (q, opts = {}) => {
    const text = (q ?? input).trim() || (image ? "Log this meal" : "");
    if (!text || busy) return;
    const img = image;
    setTurns((t) => [...t, { role: "user", text, at: new Date().toISOString(), image: !!img, preview: img?.preview }]);
    setInput("");
    setImage(null);
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: !!opts.voice, ...(img ? { image: { mime: img.mime, data: img.data } } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error("Signed out. Reload the app.");
      if (!r.ok) throw new Error(j.error || `${name} couldn't answer`);
      setTurns((t) => [...t, { role: "model", text: j.reply, at: new Date().toISOString(), actions: j.actions }]);
      if (j.data) adopt?.(j.data);
      if (j.actions?.length || j.undone) load();
      say(j.reply);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const undo = async (id) => {
    const r = await fetch("/api/jarvis/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (r?.ok && j.undone?.length) {
      setUndone((u) => ({ ...u, [id]: true }));
      if (j.data) adopt?.(j.data);
      load();
    } else setErr(j?.error || "Couldn't undo");
  };

  const listen = () => {
    if (listening) { recRef.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    let final = "";
    rec.onresult = (e) => {
      let interim = "";
      for (const res of e.results) (res.isFinal ? (final = res[0].transcript) : (interim += res[0].transcript));
      setInput(final || interim);
    };
    rec.onerror = (e) => { setListening(false); if (e.error !== "no-speech" && e.error !== "aborted") setErr(`Microphone: ${e.error}`); };
    rec.onend = () => { setListening(false); if (final.trim()) send(final, { voice: speak }); };
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  // Opened from the mic button on another screen (or the app shortcut): start listening straight away
  useEffect(() => {
    if (!listenAt || !canListen || listening) return;
    try { listen(); } catch { /* the browser wants a tap first; the mic button is right there */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenAt]);

  const newChat = async () => {
    if (!confirm("Start a new conversation? Logged things stay logged.")) return;
    await fetch("/api/jarvis", { method: "DELETE" }).catch(() => {});
    setTurns([]);
  };

  const pickImage = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { setImage(await shrink(f)); } catch { setErr("Couldn't read that photo."); }
  };

  const memories = (data.memories || []).filter((m) => m.kind !== "summary");
  const summaries = (data.memories || []).filter((m) => m.kind === "summary");

  if (!storage) {
    return (
      <>
        <Header title={name} sub="Your assistant" />
        <Card><p className="muted">{name} needs Supabase connected (see README), because it works on the server with your synced data.</p></Card>
      </>
    );
  }

  return (
    <>
      <Header
        title={name}
        sub="Tell it what you did, ask what to do next. It logs, plans, quizzes and remembers."
        right={
          <div className="row wrap">
            {usage && <span className="pill" title="Gemini calls today (fast commands don't use any)">{usage.calls} AI · {usage.fast || 0} fast</span>}
            <button className={`icon-btn neutral ${speak ? "on" : ""}`} title={speak ? "Speaking replies" : "Replies are silent"} aria-pressed={speak} onClick={() => { setSpeak(!speak); store.set("jarvis-speak", !speak); if (speak) speechSynthesis?.cancel(); }}>
              <Icon name="speaker" size={18} />
            </button>
            <button className="btn" onClick={() => setShowMem(!showMem)}>Memory ({memories.length})</button>
            {turns.length > 0 && <button className="btn" onClick={newChat}>New chat</button>}
          </div>
        }
      />

      {showMem && (
        <Card title="What Jarvis knows about you" right={<button className="link small" onClick={() => setShowMem(false)}>Close</button>}>
          <p className="muted small">Saved when you share lasting facts, goals or preferences, and condensed from your chats each night. Remove anything that's wrong.</p>
          {memories.length === 0 ? <p className="empty">Nothing yet. Try: "Remember that my goal is 75 kg by June."</p> : (
            <ul className="plain compact">
              {memories.map((m) => (
                <li key={m.id} className="row-between">
                  <span className="grow"><span className="pill">{m.kind}</span> {m.text}</span>
                  <button className="icon-btn" aria-label="Forget" title="Forget" onClick={() => confirm(`Forget "${m.text}"?`) && update((d) => { d.memories = d.memories.filter((x) => x.id !== m.id); })}><Icon name="close" size={15} /></button>
                </li>
              ))}
            </ul>
          )}
          {summaries.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary className="muted small">Daily notes ({summaries.length})</summary>
              <ul className="plain compact">{summaries.slice().reverse().map((m) => <li key={m.id} className="small"><span className="muted">{m.at}</span> {m.text}</li>)}</ul>
            </details>
          )}
        </Card>
      )}

      {turns.length === 0 && (
        <div className="prompts">
          {PROMPTS.map((p) => <button key={p.q} onClick={() => send(p.q)}>{p.q}<span>{p.sub}</span></button>)}
        </div>
      )}

      <div className="chat">
        {turns.map((m, i) => (
          <div key={i} className={`msg ${m.role === "model" ? "model" : "user"}`}>
            {m.role === "model" ? <Rich text={m.text} /> : <>{m.preview && <img className="msg-img" src={m.preview} alt="" />}{m.image && !m.preview && <span className="small">📷 </span>}{m.text}</>}
            {m.source === "siri" && <span className="via">via Siri</span>}
            {m.source === "tick" && <span className="via">briefing</span>}
            {m.actions?.length > 0 && (
              <div className="acts">
                {m.actions.map((a) => (
                  <span key={a.id} className={`act ${undone[a.id] || log.find((x) => x.id === a.id)?.undone ? "undone" : ""}`}>
                    <Icon name="check" size={13} strokeWidth="2.5" />{a.summary}
                    {!(undone[a.id] || log.find((x) => x.id === a.id)?.undone) && <button onClick={() => undo(a.id)} title="Undo" aria-label={`Undo ${a.summary}`}><Icon name="undo" size={13} /></button>}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg model thinking">Thinking…</div>}
        {err && (
          <p className="err">
            {err}{" "}
            {/key/i.test(err) && <button className="link" onClick={() => go("settings")}>Open Settings</button>}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {image && (
          <div className="attach">
            <img src={image.preview} alt="Photo to send" />
            <button type="button" className="icon-btn" aria-label="Remove photo" onClick={() => setImage(null)}><Icon name="close" size={14} /></button>
          </div>
        )}
        <button type="button" className="btn" aria-label="Add a photo" title="Photo of a meal, a page, a whiteboard…" onClick={() => fileRef.current?.click()}><Icon name="image" size={18} /></button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
        <textarea
          rows={1}
          value={input}
          placeholder={listening ? "Listening…" : `Message ${name}…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
        />
        {canListen && (
          <>
            <select className="lang" value={lang} onChange={(e) => { setLang(e.target.value); store.set("jarvis-lang", e.target.value); }} aria-label="Voice language">
              {LANGS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
            </select>
            <button type="button" className={`btn ${listening ? "rec" : ""}`} aria-label={listening ? "Stop listening" : "Speak"} onClick={listen}><Icon name="mic" size={18} /></button>
          </>
        )}
        <button className="btn primary" disabled={busy || (!input.trim() && !image)} aria-label="Send"><Icon name="send" size={18} /></button>
      </form>

      {log.length > 0 && (
        <Card title="Recent actions" className="recent-acts">
          <ul className="plain compact">
            {log.slice(0, 12).map((a) => (
              <li key={a.id} className="row-between">
                <span className={`grow small ${a.undone ? "muted strike" : ""}`}>{a.summary}<span className="muted"> · {a.source} · {new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></span>
                {!a.undone && <button className="link small" onClick={() => undo(a.id)}>Undo</button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
