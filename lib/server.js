// Server-only helpers: storage (Upstash Redis REST) and password auth.
import { cookies } from "next/headers";

const KEY = "life-tracker:data";
export const COOKIE = "lt_auth";

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function storageEnabled() {
  return !!redisConfig();
}

async function redis(command) {
  const cfg = redisConfig();
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

export async function loadData() {
  const raw = await redis(["GET", KEY]);
  return raw ? JSON.parse(raw) : null;
}

export async function saveData(data) {
  await redis(["SET", KEY, JSON.stringify(data)]);
}

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
