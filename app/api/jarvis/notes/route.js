import { NextResponse } from "next/server";
import { authorize, deleteNotes, indexNotes, listNotes, searchNotes } from "@/lib/jarvis/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { action: "index", docId, title, subjectId, pages: [{ page, text }] }  (text extracted in the browser)
// POST { action: "list" } | { action: "delete", docId } | { action: "search", query }
export async function POST(req) {
  if ((await authorize(req)) !== "session") return NextResponse.json({ error: "locked" }, { status: 401 });
  try {
    const b = await req.json();
    if (b.action === "index") return NextResponse.json(await indexNotes(b));
    if (b.action === "list") return NextResponse.json({ docs: (await listNotes()).map(({ chunks, ...d }) => ({ ...d, chunks: chunks?.length || 0 })) });
    if (b.action === "delete") { await deleteNotes(String(b.docId)); return NextResponse.json({ ok: true }); }
    if (b.action === "search") return NextResponse.json(await searchNotes(String(b.query || ""), { subjectId: b.subjectId }));
    throw new Error("Unknown action");
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}
