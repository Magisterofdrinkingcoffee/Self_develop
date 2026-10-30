import { NextResponse } from "next/server";
import { isAuthed, setSecret, storageEnabled } from "@/lib/server";
import { getFeeds, parseIcs, status } from "@/lib/integrations";
import { uid } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ error: "Supabase isn't connected yet" }, { status: 400 });
  try {
    return NextResponse.json(await status());
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}

// POST { action: "addFeed", name, url, kind } | { action: "removeFeed", id }
//      { action: "setGeminiKey", key } | { action: "removeGeminiKey" }
export async function POST(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ error: "Supabase isn't connected yet" }, { status: 400 });
  try {
    const b = await req.json();
    if (b.action === "addFeed") {
      const url = String(b.url || "").trim().replace(/^webcal:\/\//i, "https://");
      if (!/^https:\/\/\S+$/i.test(url)) throw new Error("Paste the full https:// or webcal:// link.");
      const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "LifeTracker/1.0" } }).catch(() => null);
      const text = res?.ok ? await res.text() : "";
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link didn't return a calendar. Copy the export/subscribe link again.");
      const feeds = await getFeeds();
      feeds.push({ id: uid(), name: String(b.name || "").trim() || (b.kind === "moodle" ? "Moodle" : "Calendar"), url, kind: b.kind === "moodle" ? "moodle" : "calendar" });
      await setSecret("feeds", feeds);
      return NextResponse.json({ ok: true, events: parseIcs(text).length });
    }
    if (b.action === "removeFeed") {
      await setSecret("feeds", (await getFeeds()).filter((f) => f.id !== b.id));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "setGeminiKey") {
      const key = String(b.key || "").trim();
      if (key.length < 20) throw new Error("That doesn't look like a Gemini API key.");
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": key }, cache: "no-store" });
      if (!res.ok) throw new Error("Google rejected that key. Copy it again from AI Studio.");
      await setSecret("gemini", { key });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "removeGeminiKey") {
      await setSecret("gemini", null);
      return NextResponse.json({ ok: true });
    }
    throw new Error("Unknown action");
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}
