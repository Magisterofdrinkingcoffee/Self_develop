import { NextResponse } from "next/server";
import { isAuthed, storageEnabled } from "@/lib/server";
import { checkToken, quickAdd, quickToken } from "@/lib/quick";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const text = (s, status = 200) => new NextResponse(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// From Siri / iOS Shortcuts: POST { text } with header "Authorization: Bearer <token>". Replies with a sentence to speak.
export async function POST(req) {
  if (!storageEnabled()) return text("Storage isn't connected.", 400);
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!(await checkToken(token))) return text("Not allowed. Copy the token from Settings again.", 401);
  try {
    const ct = req.headers.get("content-type") || "";
    const body = ct.includes("json") ? await req.json() : { text: await req.text() };
    return text(await quickAdd(body.text));
  } catch (e) {
    return text(`Couldn't save: ${e.message || e}`, 500);
  }
}

// From the app (signed in): GET -> { token }; PUT -> new token
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ error: "Supabase isn't connected yet" }, { status: 400 });
  return NextResponse.json({ token: await quickToken() });
}

export async function PUT() {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  return NextResponse.json({ token: await quickToken(true) });
}
