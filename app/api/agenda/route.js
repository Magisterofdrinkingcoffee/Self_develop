import { NextResponse } from "next/server";
import { isAuthed, storageEnabled } from "@/lib/server";
import { agenda } from "@/lib/integrations";

export const dynamic = "force-dynamic";

// GET /api/agenda?from=ISO&to=ISO[&kind=moodle]
export async function GET(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ events: [], errors: [] });
  const q = new URL(req.url).searchParams;
  const from = q.get("from") || new Date().toISOString();
  const to = q.get("to") || new Date(Date.now() + 7 * 864e5).toISOString();
  return NextResponse.json(await agenda(from, to, { kind: q.get("kind") || undefined }));
}
