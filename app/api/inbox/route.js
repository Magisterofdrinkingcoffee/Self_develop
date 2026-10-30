import { NextResponse } from "next/server";
import { isAuthed, storageEnabled } from "@/lib/server";
import { inbox } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ messages: [], errors: [] });
  return NextResponse.json(await inbox());
}
