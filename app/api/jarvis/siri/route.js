import { NextResponse } from "next/server";
import { storageEnabled } from "@/lib/server";
import { checkToken } from "@/lib/quick";
import { ask } from "@/lib/jarvis/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const plain = (s, status = 200) => new NextResponse(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

// The simplest possible Siri hook-up: a 3-action Shortcut with one URL.
//   GET /api/jarvis/siri?token=<token>&q=<what you said>  →  a short spoken reply as plain text
async function handle(req) {
  const url = new URL(req.url);
  let q = url.searchParams.get("q") || "";
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") || "";
    const b = ct.includes("json") ? await req.json().catch(() => ({})) : { text: await req.text() };
    q = b.text || b.q || q;
  }
  const token = url.searchParams.get("token") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!storageEnabled()) return plain("Storage isn't connected yet.");
  if (!(await checkToken(token))) return plain("Jarvis doesn't recognise this shortcut. Copy the link from Settings again.");
  if (!q.trim()) return plain("I didn't catch that.");
  try {
    const out = await ask({ text: q, source: "siri", voice: true });
    return plain(out.reply);
  } catch (e) {
    return plain(String(e.message || e));
  }
}

export const GET = handle;
export const POST = handle;
