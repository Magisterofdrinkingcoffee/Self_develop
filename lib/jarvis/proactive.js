// Server-only: runs the 5-minute tick. Sends what planTick() decides, writes the AI briefings,
// and condenses each day's conversations into long-term memory at night.
import { addDays, normalize, uid } from "@/lib/data";
import { getSecret, loadData, saveData, setSecret } from "@/lib/server";
import { generate, geminiReady } from "@/lib/gemini";
import { sendAll } from "@/lib/push";
import { evening as plainEvening, morning as plainMorning } from "@/lib/digest";
import { agenda } from "@/lib/integrations";
import { planTick } from "./tick.js";
import { context, memoryBlock } from "./prompt.js";
import { dayIn, dayRange, hmIn, tzOf } from "./time.js";
import { fastingDays } from "./islam.js";
import { getChat } from "./server.js";

const STATE = "tick-state";

const BRIEF_SCHEMA = {
  type: "OBJECT",
  properties: { push: { type: "STRING" }, full: { type: "STRING" } },
  required: ["push", "full"],
};

async function write(kind, data, { today, now, tz }) {
  if (!(await geminiReady())) return null;
  const { from, to } = dayRange(tz, today);
  const events = (await agenda(from, to).catch(() => ({ events: [] }))).events || [];
  const cal = events.filter((e) => !e.allDay).map((e) => `${hmIn(tz, new Date(e.start))} ${e.title}`).join("; ") || "none";
  const name = data.settings.name || "there";
  const fast = fastingDays(today, 2).map((f) => `${f.date}: ${f.reasons.join(", ")}`).join("; ") || "none";
  const ask = kind === "morning"
    ? `Write ${name}'s morning briefing (it's just after Subuh). Include: today's classes and events in time order, the most urgent deadline, which weekly minimums need work today (with numbers), Quran pages for today if there is a plan, due flashcards/hifz reviews, and ONE clear priority for the day. Open with a short warm greeting and a reminder of morning adhkar. "push": max 3 short lines, under 220 characters, no markdown. "full": up to 10 lines, light markdown.`
    : `Write ${name}'s evening review. Use the numbers: what got done today (minimums, prayers logged, food vs target, workout, to-dos), what's still open, and a suggestion for tomorrow (look at tomorrow's deadlines). Honest and kind, no guilt. "push": max 3 short lines, under 220 characters, no markdown. "full": up to 10 lines, light markdown.`;
  const out = await generate({
    system: `You are Jarvis, ${name}'s personal assistant. Use only the data given. Answer in English unless the memory says ${name} prefers another language.`,
    parts: [{ text: `${context(data, { today, now, tz })}\nCalendar today: ${cal}\nUpcoming fasting days: ${fast}\nTo-dos today: ${data.todos.filter((t) => t.date === today).map((t) => `${t.done ? "[x]" : "[ ]"} ${t.text}`).join("; ") || "none"}\n\n${memoryBlock(data)}\n\n${ask}` }],
    schema: BRIEF_SCHEMA,
  });
  return out?.push ? out : null;
}

// Condense today's chat into one memory line and pick up lasting facts
async function consolidate(data, { today, tz }) {
  if (!(await geminiReady())) return false;
  const turns = (await getChat()).turns.filter((t) => t.at && dayIn(tz, new Date(t.at)) === today);
  if (turns.length < 2) return false;
  const out = await generate({
    system: "You maintain a personal assistant's long-term memory. Be concise and factual. Third person.",
    parts: [{ text: `Existing memory:\n${(data.memories || []).filter((m) => m.kind !== "summary").map((m) => `- ${m.text}`).join("\n") || "(empty)"}\n\nToday's conversation:\n${turns.map((t) => `${t.role === "model" ? "Jarvis" : "User"}: ${t.text.slice(0, 600)}`).join("\n")}\n\nReturn "summary": one or two sentences on what mattered today (plans, struggles, progress). "facts": up to 3 NEW lasting facts, goals or preferences not already in memory (empty if none). Never store sensitive details beyond what helps the assistant.` }],
    schema: { type: "OBJECT", properties: { summary: { type: "STRING" }, facts: { type: "ARRAY", items: { type: "STRING" } } }, required: ["summary"] },
  });
  if (!out?.summary) return false;
  const mem = data.memories || [];
  const summaries = mem.filter((m) => m.kind === "summary").slice(-13);
  const others = mem.filter((m) => m.kind !== "summary");
  const facts = (out.facts || []).slice(0, 3).filter((f) => f && !others.some((m) => m.text.toLowerCase() === f.toLowerCase())).map((f) => ({ id: uid(), text: f.slice(0, 300), kind: "fact", at: today, auto: true }));
  data.memories = [...others, ...facts, ...summaries, { id: uid(), text: out.summary.slice(0, 400), kind: "summary", at: today }];
  return true;
}

export async function runTick(origin, now = new Date()) {
  const data = normalize(await loadData());
  const tz = tzOf(data);
  const today = dayIn(tz, now);
  let state = (await getSecret(STATE)) || {};
  if (state.day !== today) state = { day: today, sent: {}, nudges: 0 };
  const plan = planTick({ data, now, tz, state });
  const results = [];
  let dataChanged = false;
  let memoryChanged = false;
  const chatAdds = [];

  for (const n of plan.notifications) {
    state.sent[n.key] = true; // mark first, so a failure never causes repeats every 5 minutes
    try {
      if (n.kind === "memory") {
        memoryChanged = await consolidate(data, { today, tz });
        dataChanged = memoryChanged || dataChanged;
        results.push({ key: n.key, ok: true });
        continue;
      }
      let payload;
      if (n.kind === "briefing" || n.kind === "evening") {
        const kind = n.kind === "briefing" ? "morning" : "evening";
        const ai = await write(kind, data, { today, now, tz }).catch(() => null);
        const plain = kind === "morning" ? await plainMorning() : await plainEvening();
        payload = { ...plain, body: ai?.push || plain.body, url: n.url, tag: n.tag };
        if (ai?.full) chatAdds.push({ role: "model", text: ai.full, at: now.toISOString(), source: "tick" });
        // Share the dedupe key with the Vercel cron so it doesn't send a second one
        const last = (await getSecret("push-last")) || {};
        await setSecret("push-last", { ...last, [kind]: today });
      } else {
        payload = { title: n.title, body: n.body, url: n.url, tag: n.tag, ...(n.actions ? { actions: n.actions } : {}) };
      }
      if (n.kind === "reminder") {
        const r = data.reminders.find((x) => x.id === n.reminderId);
        if (r) { r.sent = true; dataChanged = true; }
      }
      const r = await sendAll(payload, origin);
      results.push({ key: n.key, ...r });
    } catch (e) {
      results.push({ key: n.key, error: String(e.message || e) });
    }
  }

  state.nudges = plan.nudges;
  state.lastRun = now.toISOString();
  // Drop reminders that were sent more than a week ago
  const cutoff = addDays(today, -7);
  const stale = (r) => r.sent && r.date < cutoff;
  if (data.reminders.some(stale)) dataChanged = true;

  await Promise.all([
    setSecret(STATE, state),
    dataChanged ? (async () => { const fresh = normalize(await loadData()); mergeTickChanges(fresh, data, { memory: memoryChanged, stale }); fresh.updatedAt = new Date().toISOString(); await saveData(fresh); })() : null,
    chatAdds.length ? (async () => { const c = await getChat(); await setSecret("jarvis-chat", { turns: [...c.turns, ...chatAdds].slice(-40) }); })() : null,
  ]);
  return { today, sent: results, quiet: plan.quiet, inClass: plan.inClass };
}

// Only the fields the tick touches are copied onto the freshest data, so a save from another device isn't lost
function mergeTickChanges(fresh, ours, { memory, stale }) {
  if (memory) fresh.memories = ours.memories;
  const sentIds = new Set(ours.reminders.filter((r) => r.sent).map((r) => r.id));
  fresh.reminders = (fresh.reminders || []).map((r) => (sentIds.has(r.id) ? { ...r, sent: true } : r)).filter((r) => !stale(r));
}
