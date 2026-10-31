import { NextResponse } from "next/server";
import { normalize } from "@/lib/data";
import { loadData, saveData, storageEnabled } from "@/lib/server";
import { authorize } from "@/lib/jarvis/server";
import { dayIn, tzOf } from "@/lib/jarvis/time";

export const dynamic = "force-dynamic";

// Shortcuts sends numbers as text in the phone's locale: "8,432" steps, "7,5" hours
const n = (v, whole = false) => {
  let s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return undefined;
  if (whole) s = s.replace(/[^\d]/g, "");
  else if (!s.includes(".") && /,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const x = Number(s.replace(/[^\d.\-]/g, ""));
  return Number.isFinite(x) ? x : undefined;
};

// Apple Health → Jarvis, from an iPhone Shortcuts automation (Bearer token).
// POST { date?, steps, sleepH, restingHr, activeKcal, weightKg }
export async function POST(req) {
  if (!(await authorize(req))) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!storageEnabled()) return NextResponse.json({ error: "Storage isn't connected" }, { status: 400 });
  try {
    const b = await req.json();
    const data = normalize(await loadData());
    const day = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : dayIn(tzOf(data));
    const entry = { ...(data.health[day] || {}) };
    for (const k of ["steps", "sleepH", "restingHr", "activeKcal"]) {
      const v = n(b[k], k === "steps" || k === "activeKcal");
      if (v !== undefined) entry[k] = k === "sleepH" ? Math.round(v * 10) / 10 : Math.round(v);
    }
    data.health[day] = entry;
    const kg = n(b.weightKg);
    if (kg && kg > 25 && kg < 300) {
      data.weights = data.weights.filter((w) => w.date !== day);
      data.weights.push({ id: Math.random().toString(36).slice(2, 10), date: day, kg: Math.round(kg * 10) / 10 });
    }
    data.updatedAt = new Date().toISOString();
    await saveData(data);
    return NextResponse.json({ ok: true, date: day, saved: entry });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}
