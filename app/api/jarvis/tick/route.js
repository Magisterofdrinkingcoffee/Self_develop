import { NextResponse } from "next/server";
import { storageEnabled } from "@/lib/server";
import { checkToken } from "@/lib/quick";
import { runTick } from "@/lib/jarvis/proactive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called every 5 minutes by Supabase pg_cron (see supabase/jarvis.sql).
// Auth: "Authorization: Bearer <quick-add token>" or "Bearer <CRON_SECRET>".
async function handle(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const ok = (process.env.CRON_SECRET && token === process.env.CRON_SECRET) || (storageEnabled() && (await checkToken(token)));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ skipped: "no storage" });
  try {
    const url = new URL(req.url);
    // For testing only: JARVIS_TEST=1 lets ?now=<ISO time> simulate another time of day
    const now = process.env.JARVIS_TEST === "1" && url.searchParams.get("now") ? new Date(url.searchParams.get("now")) : new Date();
    return NextResponse.json(await runTick(url.origin, now));
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
