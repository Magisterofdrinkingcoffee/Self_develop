import { NextResponse } from "next/server";
import { COOKIE, emailFromToken, isAllowed, makeSession, sendLoginLink, storageEnabled } from "@/lib/server";

export const dynamic = "force-dynamic";

// POST { email }        -> sends a login link (only to allowed emails)
// POST { access_token } -> exchanges the token from the link for a session cookie
export async function POST(req) {
  if (!storageEnabled()) return NextResponse.json({ error: "Supabase isn't connected" }, { status: 500 });
  const body = await req.json().catch(() => ({}));

  if (body.access_token) {
    const email = await emailFromToken(String(body.access_token));
    if (!isAllowed(email)) return NextResponse.json({ error: "This account isn't allowed here." }, { status: 403 });
    const { value, maxAge } = await makeSession(email);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
    return res;
  }

  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  // Same answer either way, so nobody can learn which email is allowed
  if (isAllowed(email)) {
    try {
      await sendLoginLink(email, `${new URL(req.url).origin}/auth`);
    } catch (e) {
      return NextResponse.json({ error: String(e.message || e) }, { status: 429 });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
