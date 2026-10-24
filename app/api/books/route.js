import { NextResponse } from "next/server";
import { isAuthed, removeFile, signedReadUrl, signedUploadUrl, storageEnabled } from "@/lib/server";

export const dynamic = "force-dynamic";

// POST { action: "upload", name } -> { path, uploadUrl }
// POST { action: "read", path }   -> { url }
// POST { action: "delete", path } -> { ok }
export async function POST(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ error: "Supabase isn't connected yet" }, { status: 400 });
  try {
    const body = await req.json();
    if (body.action === "upload") {
      const clean = String(body.name || "book.pdf").replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `${Date.now().toString(36)}-${clean}`;
      return NextResponse.json({ path, uploadUrl: await signedUploadUrl(path) });
    }
    if (!body.path || typeof body.path !== "string" || body.path.includes("..")) throw new Error("Bad path");
    if (body.action === "read") return NextResponse.json({ url: await signedReadUrl(body.path) });
    if (body.action === "delete") { await removeFile(body.path); return NextResponse.json({ ok: true }); }
    throw new Error("Unknown action");
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
