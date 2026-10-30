// Server-only: Google (Calendar + Gmail), Microsoft (Outlook mail + calendar) and iCal feeds (Moodle etc.).
import { getSecret, setSecret } from "@/lib/server";

// ---------- Providers ----------
export const PROVIDERS = {
  google: {
    name: "Google",
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    scope:
      "openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  microsoft: {
    name: "Outlook",
    clientId: () => process.env.MS_CLIENT_ID,
    clientSecret: () => process.env.MS_CLIENT_SECRET,
    authUrl: () => `https://login.microsoftonline.com/${process.env.MS_TENANT || "common"}/oauth2/v2.0/authorize`,
    tokenUrl: () => `https://login.microsoftonline.com/${process.env.MS_TENANT || "common"}/oauth2/v2.0/token`,
    scope: "offline_access openid email User.Read Calendars.Read Mail.Read",
    extra: { response_mode: "query", prompt: "select_account" },
  },
};

export const configured = (p) => !!(PROVIDERS[p]?.clientId() && PROVIDERS[p]?.clientSecret());
export const redirectUri = (origin, p) => `${origin}/api/connect/${p}/callback`;

export function authorizeUrl(p, origin, state) {
  const P = PROVIDERS[p];
  const q = new URLSearchParams({
    client_id: P.clientId(),
    redirect_uri: redirectUri(origin, p),
    response_type: "code",
    scope: P.scope,
    state,
    ...P.extra,
  });
  return `${P.authUrl()}?${q}`;
}

async function tokenRequest(p, params) {
  const P = PROVIDERS[p];
  const res = await fetch(P.tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: P.clientId(), client_secret: P.clientSecret(), ...params }),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error_description || j.error || `${P.name} sign-in failed (${res.status})`);
  return j;
}

const emailFromIdToken = (idt) => {
  try {
    const c = JSON.parse(Buffer.from(idt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    return c.email || c.preferred_username || c.upn || null;
  } catch {
    return null;
  }
};

export async function finishConnect(p, origin, code) {
  const t = await tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(origin, p) });
  if (!t.refresh_token) throw new Error("No refresh token returned. Remove the app's access in your account settings and connect again.");
  await setSecret(p, {
    refresh_token: t.refresh_token,
    access_token: t.access_token,
    expires_at: Date.now() + (t.expires_in - 60) * 1000,
    email: emailFromIdToken(t.id_token || ""),
    connectedAt: new Date().toISOString(),
  });
}

async function accessToken(p) {
  const s = await getSecret(p);
  if (!s?.refresh_token) return null;
  if (s.access_token && Date.now() < s.expires_at) return s.access_token;
  const t = await tokenRequest(p, { grant_type: "refresh_token", refresh_token: s.refresh_token, scope: PROVIDERS[p].scope });
  await setSecret(p, {
    ...s,
    access_token: t.access_token,
    refresh_token: t.refresh_token || s.refresh_token, // Microsoft rotates refresh tokens
    expires_at: Date.now() + (t.expires_in - 60) * 1000,
  });
  return t.access_token;
}

async function api(p, url, headers = {}) {
  const tok = await accessToken(p);
  if (!tok) return null;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}`, ...headers }, cache: "no-store" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `${PROVIDERS[p].name} request failed (${res.status})`);
  return j;
}

// ---------- Calendar ----------
async function googleEvents(from, to) {
  const list = await api("google", "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader");
  if (!list) return null;
  const cals = (list.items || []).filter((c) => c.selected !== false).slice(0, 10);
  const all = await Promise.all(
    cals.map(async (c) => {
      const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: "true", orderBy: "startTime", maxResults: "100" });
      const j = await api("google", `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?${q}`).catch(() => null);
      return (j?.items || [])
        .filter((e) => e.status !== "cancelled")
        .map((e) => ({
          id: `g:${e.id}`,
          title: e.summary || "(no title)",
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          allDay: !e.start?.dateTime,
          location: e.location || "",
          source: "google",
          calendar: c.summaryOverride || c.summary,
          link: e.htmlLink,
        }));
    })
  );
  return all.flat();
}

async function outlookEvents(from, to) {
  const q = new URLSearchParams({
    startDateTime: from,
    endDateTime: to,
    $top: "100",
    $orderby: "start/dateTime",
    $select: "subject,start,end,location,isAllDay,webLink",
  });
  const j = await api("microsoft", `https://graph.microsoft.com/v1.0/me/calendarView?${q}`, { Prefer: 'outlook.timezone="UTC"' });
  if (!j) return null;
  const z = (s) => (s && !/Z|[+-]\d\d:?\d\d$/.test(s) ? s.replace(/\.\d+$/, "") + "Z" : s);
  return (j.value || []).map((e) => ({
    id: `o:${e.id}`,
    title: e.subject || "(no title)",
    start: e.isAllDay ? e.start.dateTime.slice(0, 10) : z(e.start.dateTime),
    end: e.isAllDay ? e.end.dateTime.slice(0, 10) : z(e.end.dateTime),
    allDay: !!e.isAllDay,
    location: e.location?.displayName || "",
    source: "outlook",
    link: e.webLink,
  }));
}

// ---------- Mail ----------
async function gmailUnread() {
  const list = await api("google", "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=" + encodeURIComponent("in:inbox is:unread newer_than:14d"));
  if (!list) return null;
  const msgs = await Promise.all(
    (list.messages || []).map((m) =>
      api("google", `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`).catch(() => null)
    )
  );
  return msgs.filter(Boolean).map((m) => {
    const h = (n) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value || "";
    return {
      id: `g:${m.id}`,
      from: h("from").replace(/<.*>/, "").replace(/"/g, "").trim() || h("from"),
      subject: h("subject") || "(no subject)",
      snippet: decodeEntities(m.snippet || ""),
      date: new Date(Number(m.internalDate)).toISOString(),
      source: "gmail",
      link: `https://mail.google.com/mail/u/0/#inbox/${m.threadId}`,
    };
  });
}

async function outlookUnread() {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const q = new URLSearchParams({
    $filter: `receivedDateTime ge ${since} and isRead eq false`,
    $orderby: "receivedDateTime desc",
    $top: "8",
    $select: "subject,from,receivedDateTime,bodyPreview,webLink",
  });
  const j = await api("microsoft", `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${q}`);
  if (!j) return null;
  return (j.value || []).map((m) => ({
    id: `o:${m.id}`,
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "",
    subject: m.subject || "(no subject)",
    snippet: (m.bodyPreview || "").slice(0, 160),
    date: m.receivedDateTime,
    source: "outlook",
    link: m.webLink,
  }));
}

const decodeEntities = (s) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// ---------- iCal feeds (Moodle, Outlook/Google "publish calendar" links, anything .ics) ----------
export async function getFeeds() {
  return (await getSecret("feeds")) || [];
}

function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function icsText(v = "") {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

// Wall-clock time in an IANA zone -> UTC ISO string
function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const parts = Object.fromEntries(f.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const asTz = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return new Date(guess - (asTz - guess)).toISOString();
  } catch {
    return new Date(guess).toISOString();
  }
}

function icsDate(line) {
  // line like "DTSTART;TZID=Asia/Kuala_Lumpur:20261103T235900" or "DTSTART;VALUE=DATE:20261103" or "DTSTART:20261103T155900Z"
  const [head, val] = [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()];
  const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { value: `${y}-${mo}-${d}`, allDay: true };
  if (z) return { value: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString(), allDay: false };
  const tz = head.match(/TZID=([^;:]+)/)?.[1] || "Asia/Kuala_Lumpur";
  return { value: zonedToUtc(+y, +mo, +d, +h, +mi, +s, tz), allDay: false };
}

export function parseIcs(text) {
  const events = [];
  let cur = null;
  for (const line of unfold(text).split("\n")) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") { if (cur?.start) events.push(cur); cur = null; }
    else if (cur) {
      const key = line.split(/[;:]/)[0].toUpperCase();
      const val = line.slice(line.indexOf(":") + 1);
      if (key === "DTSTART") { const d = icsDate(line); if (d) { cur.start = d.value; cur.allDay = d.allDay; } }
      else if (key === "DTEND") { const d = icsDate(line); if (d) cur.end = d.value; }
      else if (key === "SUMMARY") cur.title = icsText(val);
      else if (key === "UID") cur.uid = val.trim();
      else if (key === "LOCATION") cur.location = icsText(val);
      else if (key === "CATEGORIES") cur.categories = icsText(val);
      else if (key === "DESCRIPTION") cur.description = icsText(val).slice(0, 400);
    }
  }
  return events;
}

async function feedEvents(feed, from, to) {
  const url = feed.url.replace(/^webcal:\/\//i, "https://");
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "LifeTracker/1.0" } });
  if (!res.ok) throw new Error(`${feed.name}: feed returned ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error(`${feed.name}: that link isn't an iCal feed`);
  const lo = from.slice(0, 10), hi = to.slice(0, 10);
  return parseIcs(text)
    .filter((e) => e.start.slice(0, 10) >= lo && e.start.slice(0, 10) <= hi)
    .map((e) => ({
      id: `f:${feed.id}:${e.uid || e.start + e.title}`,
      uid: e.uid,
      title: e.title || "(no title)",
      start: e.start,
      end: e.end || e.start,
      allDay: e.allDay,
      location: e.location || "",
      categories: e.categories || "",
      description: e.description || "",
      source: feed.kind === "moodle" ? "moodle" : "feed",
      calendar: feed.name,
    }));
}

// ---------- Combined ----------
async function settle(label, p, errors) {
  try {
    return (await p) || [];
  } catch (e) {
    errors.push(`${label}: ${e.message || e}`);
    return [];
  }
}

export async function agenda(from, to, { kind } = {}) {
  const errors = [];
  const feeds = (await getFeeds()).filter((f) => !kind || f.kind === kind);
  const parts = await Promise.all([
    kind ? [] : settle("Google Calendar", googleEvents(from, to), errors),
    kind ? [] : settle("Outlook", outlookEvents(from, to), errors),
    ...feeds.map((f) => settle(f.name, feedEvents(f, from, to), errors)),
  ]);
  const events = parts.flat().sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return { events, errors };
}

export async function inbox() {
  const errors = [];
  const parts = await Promise.all([settle("Gmail", gmailUnread(), errors), settle("Outlook mail", outlookUnread(), errors)]);
  return { messages: parts.flat().sort((a, b) => String(b.date).localeCompare(String(a.date))), errors };
}

export async function status() {
  const [g, m, feeds, gem] = await Promise.all([getSecret("google"), getSecret("microsoft"), getFeeds(), getSecret("gemini")]);
  const mask = (u) => u.replace(/(authtoken|token|key|userid)=([^&]+)/gi, (_, k, v) => `${k}=${v.slice(0, 3)}…`);
  return {
    google: { configured: configured("google"), connected: !!g?.refresh_token, email: g?.email || null },
    microsoft: { configured: configured("microsoft"), connected: !!m?.refresh_token, email: m?.email || null },
    feeds: feeds.map((f) => ({ id: f.id, name: f.name, kind: f.kind, url: mask(f.url) })),
    gemini: { connected: !!(process.env.GEMINI_API_KEY || gem?.key), fromEnv: !!process.env.GEMINI_API_KEY },
  };
}
