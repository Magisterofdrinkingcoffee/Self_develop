import { NextResponse } from "next/server";
import { COOKIE, checkPassword, loginLocked, makeSession, recordLogin, storageEnabled } from "@/lib/server";

export const dynamic = "force-dynamic";

// POST { username, password } -> session cookie (90 days)
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (storageEnabled()) {
    const mins = await loginLocked();
    if (mins) return NextResponse.json({ error: `Too many wrong tries. Try again in ${mins} min.` }, { status: 429 });
  }
  const user = String(body.username || "").trim().toLowerCase();
  const ok = await checkPassword(user, String(body.password || ""));
  await recordLogin(ok);
  if (!ok) return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  const { value, maxAge } = await makeSession(user);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
