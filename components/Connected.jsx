"use client";

import { Card, Empty } from "./ui";
import Icon from "./Icon";
import { addDays, fmtDate, parseKey } from "@/lib/data";
import { localDay, localTime, useRemote } from "@/lib/useRemote";

const SRC = { google: "Google", outlook: "Outlook", moodle: "Moodle", feed: "Calendar", class: "Timetable" };

// Calendar events (Google, Outlook, iCal feeds) merged with the weekly timetable
export function Agenda({ data, day, days = 3, go }) {
  const from = parseKey(day);
  const to = parseKey(addDays(day, days));
  const { data: res, loading, error, reload } = useRemote(`/api/agenda?from=${from.toISOString()}&to=${to.toISOString()}`);

  const keys = Array.from({ length: days }, (_, i) => addDays(day, i));
  const byDay = keys.map((k) => {
    const dow = (parseKey(k).getDay() + 6) % 7;
    const classes = data.schedule
      .filter((s) => Number(s.day) === dow)
      .map((s) => ({ id: `c:${s.id}:${k}`, title: s.title, location: s.place, time: s.start, end: s.end, source: "class" }));
    const events = (res?.events || [])
      .filter((e) => localDay(e.start) === k)
      .map((e) => ({ ...e, time: e.allDay ? "" : localTime(e.start), end: e.allDay ? "" : localTime(e.end) }));
    return { k, items: [...classes, ...events].sort((a, b) => (a.time || "").localeCompare(b.time || "")) };
  });
  const total = byDay.reduce((s, d) => s + d.items.length, 0);

  return (
    <Card
      title={<><Icon name="calendar" size={18} />Agenda</>}
      right={<button className="link" onClick={reload} disabled={loading}><Icon name="sync" size={15} />{loading ? "Loading" : "Refresh"}</button>}
    >
      {total === 0 && !loading && (
        <Empty>
          Nothing on the next {days} days.{" "}
          <button className="link" onClick={() => go("settings")}>Connect calendars</button>
        </Empty>
      )}
      <ul className="agenda">
        {byDay.filter((d) => d.items.length).map((d) => (
          <li key={d.k}>
            <div className="dayhdr">{d.k === keys[0] ? "Today" : fmtDate(d.k, { weekday: "long", day: "numeric", month: "short" })}</div>
            {d.items.map((e) => {
              const body = (
                <>
                  <span className="t">{e.time || "All day"}</span>
                  <span className="sw" />
                  <span className="what">
                    <strong>{e.title}</strong>
                    <span className="muted small">{[e.location, e.calendar || SRC[e.source]].filter(Boolean).join(", ")}</span>
                  </span>
                </>
              );
              return e.link ? (
                <a key={e.id} className={`ev src-${e.source}`} href={e.link} target="_blank" rel="noreferrer">{body}</a>
              ) : (
                <div key={e.id} className={`ev src-${e.source}`}>{body}</div>
              );
            })}
          </li>
        ))}
      </ul>
      {(error || res?.errors?.length > 0) && <p className="err small" style={{ marginTop: 8 }}>{error || res.errors.join(" · ")}</p>}
    </Card>
  );
}

// Unread mail from Gmail and Outlook
export function Inbox({ go }) {
  const { data: res, loading, error, reload } = useRemote("/api/inbox");
  const msgs = res?.messages || [];
  const connected = res && (msgs.length > 0 || res.errors?.length > 0);
  return (
    <Card
      title={<><Icon name="mail" size={18} />Unread mail{msgs.length > 0 && <span className="pill lapis">{msgs.length}</span>}</>}
      right={<button className="link" onClick={reload} disabled={loading}><Icon name="sync" size={15} />{loading ? "Loading" : "Refresh"}</button>}
    >
      {!loading && msgs.length === 0 && (
        <Empty>
          {connected === false && res?.errors?.length === 0 ? "No unread mail in the last two weeks. " : "Inbox clear. "}
          <button className="link" onClick={() => go("settings")}>Manage accounts</button>
        </Empty>
      )}
      {msgs.slice(0, 6).map((m) => (
        <a key={m.id} className={`mail src-${m.source}`} href={m.link} target="_blank" rel="noreferrer">
          <span className="av">{(m.from || "?").trim()[0]?.toUpperCase()}</span>
          <span className="grow">
            <span className="row-between"><span className="small muted ellipsis">{m.from}</span><span className="small muted">{relTime(m.date)}</span></span>
            <span className="subj" style={{ display: "block" }}>{m.subject}</span>
            <span className="snip">{m.snippet}</span>
          </span>
        </a>
      ))}
      {(error || res?.errors?.length > 0) && <p className="err small" style={{ marginTop: 8 }}>{error || res.errors.join(" · ")}</p>}
    </Card>
  );
}

function relTime(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60e3);
  if (m < 60) return `${Math.max(1, m)}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}
