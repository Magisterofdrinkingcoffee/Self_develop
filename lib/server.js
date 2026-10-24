// Server-only helpers: Supabase (Postgres via REST + Storage) and password auth.
import { cookies } from "next/headers";

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

async function sb(path, init = {}) {
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

export async function tokenFor(password) {
  const bytes = new TextEncoder().encode(`life-tracker:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(hash).toString("hex");
}

export function passwordEnabled() {
  return !!process.env.APP_PASSWORD;
}

export async function isAuthed() {
  if (!passwordEnabled()) return true;
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  return value === (await tokenFor(process.env.APP_PASSWORD));
}
