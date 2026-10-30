// Server-only helpers: Supabase (Postgres via REST + Storage) and password auth.
import { cookies } from "next/headers";
import { createHash } from "node:crypto";

export const COOKIE = "lt_auth";
export const BUCKET = "books";
const ROW_ID = "main";

function cfg() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  return url && key ? { url, key } : null;
}

export function storageEnabled() {
  return !!cfg();
}

export async function sb(path, init = {}) {
  const c = cfg();
  const headers = {
    apikey: c.key,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  // Legacy service_role keys are JWTs and go in Authorization; new sb_secret_ keys work via apikey alone
  if (c.key.split(".").length === 3) headers.Authorization = `Bearer ${c.key}`;
  const res = await fetch(`${c.url}${path}`, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) throw new Error((json && (json.message || json.error)) || `Supabase error ${res.status}`);
  return json;
}

export async function loadData() {
  const rows = await sb(`/rest/v1/life_data?id=eq.${ROW_ID}&select=data`);
  return rows?.[0]?.data || null;
}

// Version stamp of the stored document (data.updatedAt), used to stop a stale device overwriting newer data
export async function loadVersion() {
  const rows = await sb(`/rest/v1/life_data?id=eq.${ROW_ID}&select=v:data->>updatedAt`);
  return rows?.[0]?.v || null;
}

export async function saveData(data) {
  await sb(`/rest/v1/life_data?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: ROW_ID, data, updated_at: new Date().toISOString() }),
  });
}

// Storage: signed URLs so big files go straight from the browser to Supabase
export async function signedUploadUrl(path) {
  const c = cfg();
  const json = await sb(`/storage/v1/object/upload/sign/${BUCKET}/${encodePath(path)}`, { method: "POST", body: "{}" });
  return `${c.url}/storage/v1${json.url}`;
}

export async function signedReadUrl(path) {
  const c = cfg();
  const json = await sb(`/storage/v1/object/sign/${BUCKET}/${encodePath(path)}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn: 60 * 60 * 6 }),
  });
  return `${c.url}/storage/v1${json.signedURL || json.signedUrl}`;
}

export async function removeFile(path) {
  await sb(`/storage/v1/object/${BUCKET}`, { method: "DELETE", body: JSON.stringify({ prefixes: [path] }) });
}

const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");

// ---------- Login (Supabase email link) ----------
// Who may log in: the owner's email (stored only as a SHA-256 hash, since the repo is public)
// plus any emails in the ALLOWED_EMAIL env var (comma-separated). Everyone else is refused.
const OWNER_EMAIL_HASHES = ["f5adc0337f5872e67deb9e44b94d93c0a5d57a0c66019a94f19d2b3dbe755f20"];

const allowedEmails = () =>
  (process.env.ALLOWED_EMAIL || "").toLowerCase().split(",").map((e) => e.trim()).filter(Boolean);

const sha256 = (t) => createHash("sha256").update(t).digest("hex");

export const isAllowed = (email) => {
  if (!email) return false;
  const e = String(email).toLowerCase().trim();
  return allowedEmails().includes(e) || OWNER_EMAIL_HASHES.includes(sha256(e));
};

const SESSION_DAYS = 90;

function secret() {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_JWT_SECRET || cfg()?.key;
  if (!s) throw new Error("No session secret configured");
  return s;
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export async function hmac(text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

export async function makeSession(email) {
  const payload = b64url(JSON.stringify({ e: email.toLowerCase(), x: Date.now() + SESSION_DAYS * 864e5 }));
  return { value: `${payload}.${await hmac(payload)}`, maxAge: SESSION_DAYS * 86400 };
}

export async function isAuthed() {
  try {
    const store = await cookies();
    const raw = store.get(COOKIE)?.value;
    if (!raw || !raw.includes(".")) return false;
    const [payload, mac] = raw.split(".");
    if (mac !== (await hmac(payload))) return false;
    const { e, x } = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    return Date.now() < x && isAllowed(e);
  } catch {
    return false;
  }
}

function publicKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || cfg()?.key;
}

// Ask Supabase to email a one-click login link
export async function sendLoginLink(email, redirectTo) {
  const c = cfg();
  const res = await fetch(`${c.url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: { apikey: publicKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: true }),
    cache: "no-store",
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.msg || j.error_description || j.message || `Couldn't send email (${res.status})`);
  }
}

// Turn the token from the email link into the user's email
export async function emailFromToken(accessToken) {
  const c = cfg();
  const res = await fetch(`${c.url}/auth/v1/user`, {
    headers: { apikey: publicKey(), Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.email || null;
}

// ---------- Server-only secrets (OAuth tokens, feed URLs, API keys) ----------
// Stored as extra rows in the same locked-down life_data table (id = "secret:<name>"),
// so they never reach the browser and never end up in backups.
export async function getSecret(name) {
  if (!storageEnabled()) return null;
  const rows = await sb(`/rest/v1/life_data?id=eq.${encodeURIComponent("secret:" + name)}&select=data`);
  return rows?.[0]?.data ?? null;
}

export async function setSecret(name, value) {
  if (value === null || value === undefined) {
    await sb(`/rest/v1/life_data?id=eq.${encodeURIComponent("secret:" + name)}`, { method: "DELETE" });
    return;
  }
  await sb(`/rest/v1/life_data?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: "secret:" + name, data: value, updated_at: new Date().toISOString() }),
  });
}

// Signed, short-lived OAuth "state" so the callback can't be forged
export async function signState(provider) {
  const payload = b64url(JSON.stringify({ p: provider, x: Date.now() + 15 * 60e3 }));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyState(state, provider) {
  try {
    const [payload, mac] = String(state || "").split(".");
    if (!payload || mac !== (await hmac(payload))) return false;
    const { p, x } = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    return p === provider && Date.now() < x;
  } catch {
    return false;
  }
}

// Exchange a one-time code from the login email (works inside the iPhone home-screen app,
// where the email link would open in Safari instead)
export async function emailFromCode(email, code) {
  const c = cfg();
  const res = await fetch(`${c.url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publicKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email", email, token: code }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j?.user?.email || (j?.access_token ? await emailFromToken(j.access_token) : null);
}

// ---------- Device pairing ----------
// A signed-in device shows a 6-digit code; the iPhone home-screen app (which has its own cookies) types it in.
export async function createPairCode(email) {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, "0");
  await setSecret("pair", { h: sha256(code), email, exp: Date.now() + 10 * 60e3, tries: 0 });
  return code;
}

export async function usePairCode(code) {
  const p = await getSecret("pair");
  if (!p || Date.now() > p.exp || p.tries >= 5) return null;
  if (sha256(String(code)) !== p.h) {
    await setSecret("pair", { ...p, tries: p.tries + 1 });
    return null;
  }
  await setSecret("pair", null);
  return p.email;
}

export async function sessionEmail() {
  try {
    const store = await cookies();
    const raw = store.get(COOKIE)?.value;
    const [payload] = raw.split(".");
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()).e;
  } catch {
    return null;
  }
}
