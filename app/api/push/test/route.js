import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/server";
import { sendAll } from "@/lib/push";
import { evening, morning } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST { kind: "morning" | "evening" } -> sends that notification now
export async function POST(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  try {
    const { kind } = await req.json().catch(() => ({}));
    const payload = kind === "evening" ? await evening() : await morning();
    const r = await sendAll(payload, new URL(req.url).origin);
    if (!r.total) throw new Error("No device has notifications turned on yet.");
    return NextResponse.json({ ok: true, ...r, payload });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}
