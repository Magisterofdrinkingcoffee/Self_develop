import { NextResponse } from "next/server";
import { isAuthed, storageEnabled } from "@/lib/server";
import { addSub, getSubs, publicKey, removeSub } from "@/lib/push";

export const dynamic = "force-dynamic";

// GET -> { publicKey, devices }
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ error: "Supabase isn't connected yet" }, { status: 400 });
  const subs = await getSubs();
  return NextResponse.json({ publicKey: await publicKey(), devices: subs.map((s) => ({ endpoint: s.endpoint, device: s.device, at: s.at })) });
}

// POST { subscription, device } | DELETE { endpoint }
export async function POST(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  try {
    const b = await req.json();
    await addSub(b.subscription, b.device);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}

export async function DELETE(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  await removeSub(b.endpoint);
  return NextResponse.json({ ok: true });
}
