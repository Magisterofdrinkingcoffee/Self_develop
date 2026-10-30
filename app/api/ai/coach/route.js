import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/server";
import { generate } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = (name) => `You are ${name}'s personal coach inside his life-tracker app. He is an AI Engineering student at XMUM in Malaysia.
You get a JSON snapshot of his tracker (weekly minimums, to-dos, deadlines, calendar, meals, workouts, weight, spending) and his question.
Rules:
- Base every suggestion on the numbers in the snapshot. Name the specific item and number ("Quran 8/20 pages with 3 days left → ~4 a day").
- Be direct and practical. Short paragraphs or a tight list. No filler, no generic motivation.
- Food and fitness: sensible, sustainable advice for steady weight loss; never suggest extreme restriction.
- Money is in his currency; don't lecture.
- If data is missing for what he asks, say what to log.
- Answer in the language he writes in (English, Russian or Kazakh).`;

// POST { messages: [{ role: "user"|"model", text }], snapshot: {...} }
export async function POST(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  try {
    const { messages = [], snapshot = {} } = await req.json();
    const last = messages[messages.length - 1];
    if (!last?.text?.trim()) throw new Error("Ask something first.");
    const history = messages.slice(-12, -1).map((m) => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: String(m.text).slice(0, 4000) }] }));
    const reply = await generate({
      system: SYSTEM(snapshot.name || "Beka"),
      history,
      parts: [{ text: `Tracker snapshot:\n${JSON.stringify(snapshot).slice(0, 30000)}\n\nQuestion: ${last.text.slice(0, 4000)}` }],
    });
    return NextResponse.json({ reply });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}
