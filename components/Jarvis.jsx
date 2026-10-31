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

// Voice: record with the microphone and convert to a small 16 kHz mono WAV, which Gemini understands directly.
// No phone dictation or Siri needed, and it works in Kazakh too.
function toWav(buf, rate) {
  const data = buf.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const w = (o, str) => [...str].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); out.setUint32(4, 36 + data.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  w(36, "data"); out.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return out.buffer;
}

async function blobToWavBase64(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const ab = await blob.arrayBuffer();
  // Callback form for older Safari, promise form everywhere else
  const decoded = await new Promise((ok, bad) => { const p = ctx.decodeAudioData(ab, ok, bad); if (p?.then) p.then(ok, bad); });
  ctx.close?.();
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const wav = toWav(await off.startRendering(), rate);
  let bin = "";
  const bytes = new Uint8Array(wav);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
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
  const [undone, setUndone] = useState({});
  const [showMem, setShowMem] = useState(false);
  const endRef = useRef(null);
  const recRef = useRef(null);
  const fileRef = useRef(null);
  const name = data.settings.jarvis?.voiceName || "Jarvis";
  const canListen = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  useEffect(() => { setSpeak(store.get("jarvis-speak", false)); }, []);

  const load = useCallback(async () => {
    if (!storage) return;
    const r = await fetch("/api/jarvis", { cache: "no-store" }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (r?.ok) { setTurns(j.turns || []); setLog(j.actions || []); setUsage(j.usage); }
  }, [storage]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);

  // Voice in → voice out: replies to a voice message are always read aloud
  const say = (text, force = false) => {
    if ((!speak && !force) || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plainForSpeech(text));
    u.lang = /[а-яёәіңғүұқөһ]/i.test(text) ? "ru-RU" : "en-US";
    speechSynthesis.speak(u);
  };

  const send = async (q, opts = {}) => {
    const text = (q ?? input).trim() || (image ? "Log this meal" : "");
    if ((!text && !opts.audio) || busy) return;
    const img = image;
    setTurns((t) => [...t, { role: "user", text: text || "🎤 Voice message", at: new Date().toISOString(), image: !!img, preview: img?.preview }]);
    setInput("");
    setImage(null);
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: !!opts.voice, ...(img ? { image: { mime: img.mime, data: img.data } } : {}), ...(opts.audio ? { audio: opts.audio } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error("Signed out. Reload the app.");
      if (!r.ok) throw new Error(j.error || `${name} couldn't answer`);
      setTurns((t) => [...t, { role: "model", text: j.reply, at: new Date().toISOString(), actions: j.actions }]);
      if (j.data) adopt?.(j.data);
      if (j.actions?.length || j.undone) load();
      say(j.reply, !!opts.audio);
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

  // Tap to talk. It sends by itself when you stop speaking (or tap the red button to send now).
  const listen = async () => {
    if (listening) { recRef.current?.stop(); return; }
    setErr("");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErr("Microphone is blocked. Allow it for this site in Settings → Apps → Safari → Microphone, then try again.");
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks = [];
    let heard = false, cancelled = false, vad = null;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearTimeout(rec._limit);
      if (vad) { clearInterval(vad.timer); vad.ctx.close?.(); }
      setListening(false);
      if (cancelled) return;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/mp4" });
      if (blob.size < 2000) return;
      try {
        const data = await blobToWavBase64(blob);
        send("", { voice: true, audio: { mime: "audio/wav", data } });
      } catch {
        setErr("Couldn't process the recording. Try again, or type it.");
      }
    };
    recRef.current = rec;
    rec.start(250);
    rec._limit = setTimeout(() => rec.state === "recording" && rec.stop(), 45e3);
    setListening(true);

    // Simple voice-activity detection: stop ~1.5 s after you finish talking; give up if nothing is said in 8 s
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const started = Date.now();
      let floor = 0.01, lastLoud = 0;
      vad = { ctx, timer: setInterval(() => {
        if (rec.state !== "recording") return;
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length);
        // Room noise = a running minimum that slowly drifts up, so it adapts to a noisy room
        floor = Math.min(floor * 1.01, Math.max(rms, 0.002));
        const now = Date.now();
        if (rms > Math.max(0.02, floor * 3)) { heard = true; lastLoud = now; }
        if (heard && now - lastLoud > 1500) rec.stop();
        if (!heard && now - started > 8000) { cancelled = true; rec.stop(); }
      }, 100) };
    } catch {
      // No audio analysis available: tap the red button to send
    }
  };

  // Unlock speech on iPhone: speaking is only allowed after a tap, so prime it on the first tap anywhere
  useEffect(() => {
    const prime = () => { try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch {} };
    window.addEventListener("pointerdown", prime, { once: true });
    return () => window.removeEventListener("pointerdown", prime);
  }, []);

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
          placeholder={listening ? "Listening… just talk, it sends when you stop" : `Message ${name}…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
        />
        {canListen && (
          <button type="button" className={`btn ${listening ? "rec" : ""}`} aria-label={listening ? "Stop and send" : "Record a voice message"} onClick={listen}><Icon name={listening ? "send" : "mic"} size={18} /></button>
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
