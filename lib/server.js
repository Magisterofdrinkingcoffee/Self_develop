// Server-only helpers: Supabase (Postgres via REST + Storage) and password auth.
import { cookies } from "next/headers";
import { createHash, scrypt, timingSafeEqual } from "node:crypto";

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

// ---------- Login (username + password) ----------
// Only a salted scrypt hash is stored (the repo is public). Override with LOGIN_USER / LOGIN_PASSWORD_HASH env vars.
const LOGIN_USER = () => (process.env.LOGIN_USER || "tuf").toLowerCase();
const LOGIN_HASH = () => process.env.LOGIN_PASSWORD_HASH || "scrypt$65536$J2f-DDSApAwdQKbzhQCYuA$36oH3U_VVamX1sTK26XlbBWmHsgEy02X1CRq28oJpbg";

export const isAllowed = (user) => !!user && String(user).toLowerCase().trim() === LOGIN_USER();

const scryptAsync = (pw, salt, N) =>
  new Promise((ok, bad) => scrypt(pw, salt, 32, { N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (e, k) => (e ? bad(e) : ok(k))));

export async function checkPassword(user, password) {
  if (!isAllowed(user) || typeof password !== "string" || password.length > 200) {
    await scryptAsync("x", Buffer.alloc(16), 65536); // same timing either way
    return false;
  }
  const [, n, salt, hash] = LOGIN_HASH().split("$");
  const got = await scryptAsync(password, Buffer.from(salt, "base64url"), Number(n));
  const want = Buffer.from(hash, "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}

// Lock login for 15 minutes after 5 wrong passwords (stored in Supabase, so it holds across server instances)
export async function loginLocked() {
  const f = await getSecret("login-fails").catch(() => null);
  return f && f.until && Date.now() < f.until ? Math.ceil((f.until - Date.now()) / 60e3) : 0;
}

export async function recordLogin(ok) {
  if (!storageEnabled()) return;
  if (ok) return setSecret("login-fails", null).catch(() => {});
  const f = (await getSecret("login-fails").catch(() => null)) || { n: 0 };
  const n = (f.until && Date.now() > f.until ? 0 : f.n) + 1;
  await setSecret("login-fails", { n, until: n >= 5 ? Date.now() + 15 * 60e3 : null }).catch(() => {});
}

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
