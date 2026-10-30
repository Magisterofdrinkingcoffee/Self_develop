"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "./ui";
import Icon from "./Icon";
import { snapshot } from "@/lib/snapshot";
import { useRemote } from "@/lib/useRemote";

const PROMPTS = [
  { q: "Plan the rest of my day", sub: "From your agenda, to-dos, deadlines and minimums" },
  { q: "How do I catch up on this week's minimums?", sub: "Per-day split for what's left" },
  { q: "What should I eat for the rest of today?", sub: "Based on calories left and what you've eaten" },
  { q: "Give me a short weekly review", sub: "Wins, slips and one focus for next week" },
  { q: "Where is my money going this month?", sub: "Categories and what to cut" },
  { q: "Plan my gym sessions for this week", sub: "Around your timetable and goal" },
];

const HISTORY_KEY = "life-coach-chat";

// Minimal, safe markdown: paragraphs, "- " lists, **bold**
function Rich({ text }) {
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

export default function Coach({ data, go }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const { data: ag } = useRemote(`/api/agenda?from=${from.toISOString()}&to=${new Date(from.getTime() + 7 * 864e5).toISOString()}`);

  useEffect(() => {
    try { const h = JSON.parse(localStorage.getItem(HISTORY_KEY)); if (Array.isArray(h)) setMsgs(h); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-30))); } catch {}
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const ask = async (q) => {
    const text = (q ?? input).trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user", text }];
    setMsgs(next);
    setInput("");
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, snapshot: snapshot(data, ag?.events) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "The coach couldn't answer");
      setMsgs((m) => [...m, { role: "model", text: j.reply }]);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header
        title="Coach"
        sub="Advice from your own numbers: minimums, food, gym, money and schedule"
        right={msgs.length > 0 && <button className="btn" onClick={() => setMsgs([])}>New chat</button>}
      />

      {msgs.length === 0 && (
        <div className="prompts">
          {PROMPTS.map((p) => (
            <button key={p.q} onClick={() => ask(p.q)}>{p.q}<span>{p.sub}</span></button>
          ))}
        </div>
      )}

      <div className="chat">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.role === "model" ? <Rich text={m.text} /> : m.text}</div>
        ))}
        {busy && <div className="msg model thinking">Looking at your week…</div>}
        {err && (
          <p className="err">
            {err}{" "}
            {/key/i.test(err) && <button className="link" onClick={() => go("settings")}>Open Settings</button>}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <textarea
          rows={1}
          value={input}
          placeholder="Ask anything about your week…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }}
        />
        <button className="btn primary" disabled={busy || !input.trim()} aria-label="Send"><Icon name="send" size={18} /></button>
      </form>
    </>
  );
}
