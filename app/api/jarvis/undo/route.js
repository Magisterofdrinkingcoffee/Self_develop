import { NextResponse } from "next/server";
import { authorize, undo } from "@/lib/jarvis/server";

export const dynamic = "force-dynamic";

// POST { id? } -> undo one action, or the latest group of actions
export async function POST(req) {
  const who = await authorize(req);
  if (!who) return NextResponse.json({ error: "locked" }, { status: 401 });
  try {
    const { id } = await req.json().catch(() => ({}));
    const out = await undo(id);
    return NextResponse.json(who === "session" ? out : { undone: out.undone });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}
