import { NextResponse } from "next/server";
import { act, authorize } from "@/lib/jarvis/server";

export const dynamic = "force-dynamic";

// Buttons on notifications and one-tap actions in the app.
// POST { action: "prayer:asr:ontime[:2026-10-31]" } | { action: "reminder-done:<id>" }
export async function POST(req) {
  const who = await authorize(req);
  if (!who) return NextResponse.json({ error: "locked" }, { status: 401 });
  try {
    const { action = "" } = await req.json();
    const [kind, a, b, c] = String(action).split(":");
    let out;
    if (kind === "prayer") out = await act("log_prayer", { prayer: a, status: b, ...(c ? { date: c } : {}) }, "notification");
    else throw new Error("Unknown action");
    return NextResponse.json({ ok: true, actions: out.actions, ...(who === "session" ? { data: out.data } : {}) });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}
