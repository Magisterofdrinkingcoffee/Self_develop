import { NextResponse } from "next/server";
import { storageEnabled } from "@/lib/server";
import { checkToken } from "@/lib/quick";
import { ask } from "@/lib/jarvis/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const plain = (s, status = 200) => new NextResponse(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

// Siri / Shortcuts. Two ways in, both answer with plain text to speak:
//   GET  /api/jarvis/siri?token=…&q=<text>                       (Dictate Text / Ask for Input)
//   POST /api/jarvis/siri?token=…   body = the recorded audio file  (Record Audio; no phone dictation needed)
async function handle(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!storageEnabled()) return plain("Storage isn't connected yet.");
  if (!(await checkToken(token))) return plain("Jarvis doesn't recognise this shortcut. Copy the link from Settings again.");

  let q = url.searchParams.get("q") || "";
  let audio;
  if (req.method === "POST") {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("json")) {
      const b = await req.json().catch(() => ({}));
      q = b.text || b.q || q;
    } else if (ct.startsWith("text/")) {
      q = (await req.text()) || q;
    } else {
      // Shortcuts sends the recording as the raw body (audio/x-m4a, or application/octet-stream)
      const buf = Buffer.from(await req.arrayBuffer());
      if (buf.length > 4e6) return plain("That recording is too long. Keep it under a minute.");
      if (buf.length > 1000) audio = { mime: ct.startsWith("audio/") ? ct : "audio/mp4", data: buf.toString("base64") };
    }
  }
  if (!q.trim() && !audio) return plain("I didn't catch that.");
  try {
    const out = await ask({ text: q, source: "siri", voice: true, audio });
    return plain(out.reply);
  } catch (e) {
    // Some Gemini versions are picky about the m4a label: try once more as AAC
    if (audio && /mime|unsupported|invalid/i.test(String(e.message))) {
      try { return plain((await ask({ text: q, source: "siri", voice: true, audio: { ...audio, mime: "audio/aac" } })).reply); } catch {}
    }
    return plain(String(e.message || e));
  }
}

export const GET = handle;
export const POST = handle;
