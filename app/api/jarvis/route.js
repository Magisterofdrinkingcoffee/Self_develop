import { NextResponse } from "next/server";
import { storageEnabled } from "@/lib/server";
import { AUDIO_MIME, ask, authorize, clearChat, getChat, getLog, getUsage } from "@/lib/jarvis/server";
import { getSecret, loadData } from "@/lib/server";
import { normalize } from "@/lib/data";
import { tzOf } from "@/lib/jarvis/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const plain = (s, status = 200) => new NextResponse(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// POST { text, voice?, image?: { mime, data(base64) }, audio?: { mime, data(base64) } }
// From the app (signed in): JSON { reply, actions, data? }.
// From Siri/Shortcuts (Bearer token): plain text to speak, unless ?format=json.
export async function POST(req) {
  const who = await authorize(req);
  const url = new URL(req.url);
  const asText = who === "token" && url.searchParams.get("format") !== "json";
  if (!who) return asText ? plain("Not allowed. Copy the token from Settings again.", 401) : NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ error: "Connect Supabase first (see README)." }, { status: 400 });
  try {
    const ct = req.headers.get("content-type") || "";
    const body = ct.includes("json") ? await req.json() : { text: await req.text() };
    const voice = body.voice ?? (who === "token" || url.searchParams.get("voice") === "1");
    const image = body.image?.data && /^image\/(png|jpe?g|webp|heic|heif)$/.test(body.image.mime || "") && body.image.data.length < 6e6 ? body.image : undefined;
    const audio = body.audio?.data && AUDIO_MIME.test(String(body.audio.mime || "").split(";")[0]) && body.audio.data.length < 5.5e6 ? body.audio : undefined;
    const out = await ask({ text: body.text, source: who === "token" ? "siri" : "web", voice: !!voice, image, audio });
    if (asText) return plain(out.reply);
    // The Siri token never gets the full data document back
    return NextResponse.json(who === "session" ? out : { reply: out.reply, actions: out.actions });
  } catch (e) {
    const msg = String(e.message || e);
    return asText ? plain(msg, 200) : NextResponse.json({ error: msg }, { status: 400 });
  }
}

// GET -> { turns, actions, usage, tick }
export async function GET(req) {
  if ((await authorize(req)) !== "session") return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ turns: [], actions: [], usage: null });
  const data = normalize(await loadData());
  const [chat, log, usage, tick] = await Promise.all([getChat(), getLog(), getUsage(tzOf(data)), getSecret("tick-state")]);
  return NextResponse.json({
    turns: chat.turns,
    actions: log.slice(-30).reverse().map(({ undo, ...a }) => a),
    usage,
    tick: tick ? { lastRun: tick.lastRun, sentToday: Object.keys(tick.sent || {}).length } : null,
  });
}

export async function DELETE(req) {
  if ((await authorize(req)) !== "session") return NextResponse.json({ error: "locked" }, { status: 401 });
  await clearChat();
  return NextResponse.json({ ok: true });
}
