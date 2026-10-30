import { NextResponse } from "next/server";
import { getSecret, setSecret, storageEnabled } from "@/lib/server";
import { sendAll } from "@/lib/push";
import { evening, morning } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Called by Vercel Cron (see vercel.json): ?slot=morning (07:xx MYT) or ?slot=evening (21:xx MYT).
// Sends at most once per slot per day, so calling it by hand can't spam you.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!storageEnabled()) return NextResponse.json({ skipped: "no storage" });
  const slot = new URL(req.url).searchParams.get("slot") === "evening" ? "evening" : "morning";
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  const last = (await getSecret("push-last")) || {};
  if (last[slot] === day) return NextResponse.json({ skipped: "already sent" });
  try {
    const payload = slot === "evening" ? await evening() : await morning();
    const r = await sendAll(payload, new URL(req.url).origin);
    await setSecret("push-last", { ...last, [slot]: day });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
