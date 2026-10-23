import { NextResponse } from "next/server";
import { isAuthed, loadData, saveData, storageEnabled } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ storage: false, data: null });
  try {
    return NextResponse.json({ storage: true, data: await loadData() });
  } catch (e) {
    return NextResponse.json({ storage: true, error: String(e.message || e) }, { status: 500 });
  }
}

export async function PUT(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ storage: false }, { status: 400 });
  try {
    const data = await req.json();
    if (!data || typeof data !== "object") throw new Error("Invalid data");
    data.updatedAt = new Date().toISOString();
    await saveData(data);
    return NextResponse.json({ ok: true, updatedAt: data.updatedAt });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
