"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

export function Card({ title, right, children, className = "" }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="cardhead">
          {title && <h3>{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Header({ title, sub, right }) {
  return (
    <header className="pagehead">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Bar({ value, max, tone }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar">
      <div className={`fill ${tone || (pct >= 100 ? "done" : "")}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Textarea that updates parent state on change but keeps cursor stable
export function NoteArea({ value, onChange, placeholder, rows = 5 }) {
  const [v, setV] = useState(value || "");
  useEffect(() => setV(value || ""), [value]);
  return (
    <textarea
      rows={rows}
      value={v}
      placeholder={placeholder}
      onChange={(e) => { setV(e.target.value); onChange(e.target.value); }}
    />
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

export function Del({ onClick, label = "Delete" }) {
  return (
    <button
      className="icon-btn"
      title={label}
      aria-label={label}
      onClick={() => { if (confirm(`${label}?`)) onClick(); }}
    >
      <Icon name="close" size={15} />
    </button>
  );
}

export function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}
