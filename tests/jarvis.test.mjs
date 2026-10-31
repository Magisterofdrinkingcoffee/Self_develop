// Unit tests for Jarvis's deterministic parts. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultData, normalize, weekStart, weekTotal } from "../lib/data.js";
import { makeCtx, replay, runAgent, runTool } from "../lib/jarvis/agent.js";
import { applyUndo } from "../lib/jarvis/undo.js";
import { parseFast } from "../lib/jarvis/fast.js";
import { fastingDays, hijri, prayerStats, quranPlan, setPrayer } from "../lib/jarvis/islam.js";
import { review } from "../lib/jarvis/srs.js";
import { chunkPages, keywordScores, quantize, rank, dequantize, cosine } from "../lib/jarvis/notes.js";
import { planTick } from "../lib/jarvis/tick.js";
import { freeWindows, liftSuggestion, bestMatch, declarations } from "../lib/jarvis/tools.js";
import { startOfDay, minutesIn } from "../lib/jarvis/time.js";
import { systemPrompt } from "../lib/jarvis/prompt.js";

const TZ = "Asia/Kuala_Lumpur";
const TODAY = "2026-11-02"; // a Monday
const NOW = new Date("2026-11-02T10:00:00+08:00");
const fresh = () => normalize(defaultData());
const ctxFor = (data = fresh()) => makeCtx({ data, today: TODAY, now: NOW, tz: TZ });

test("every tool declaration is well formed", () => {
  for (const d of declarations()) {
    assert.match(d.name, /^[a-z_]+$/);
    assert.ok(d.description.length > 10, d.name);
    assert.equal(d.parameters.type, "OBJECT");
  }
});

test("log_minimum adds pages, advances Quran, and undoes exactly", async () => {
  const ctx = ctxFor();
  const before = structuredClone(ctx.data);
  const r = await runTool("log_minimum", { name: "quran", amount: 10 }, ctx);
  assert.equal(r.minimum, "Quran");
  assert.equal(ctx.data.minLog[TODAY]["m-quran"], 10);
  assert.equal(ctx.data.quran.page, 10);
  assert.equal(ctx.actions.length, 1);
  applyUndo(ctx.data, ctx.actions[0].undo);
  assert.deepEqual(ctx.data.minLog, before.minLog);
  assert.deepEqual(ctx.data.quran, before.quran);
});

test("undo of one action keeps later, unrelated changes", async () => {
  const ctx = ctxFor();
  await runTool("add_todo", { text: "Call landlord" }, ctx);
  await runTool("add_todo", { text: "Buy milk" }, ctx);
  applyUndo(ctx.data, ctx.actions[0].undo);
  assert.deepEqual(ctx.data.todos.map((t) => t.text), ["Buy milk"]);
});

test("complete_todo matches fuzzily and is reversible", async () => {
  const ctx = ctxFor();
  await runTool("add_todo", { text: "Revise CST301 week 5 slides" }, ctx);
  const r = await runTool("complete_todo", { query: "cst301 revise" }, ctx);
  assert.equal(r.todo.done, true);
  applyUndo(ctx.data, ctx.actions[1].undo);
  assert.equal(ctx.data.todos[0].done, false);
});

test("log_weight replaces the same day and undo restores the old entry", async () => {
  const data = fresh();
  data.weights.push({ id: "old", date: TODAY, kg: 84 });
  const ctx = ctxFor(data);
  await runTool("log_weight", { kg: 83.4 }, ctx);
  assert.deepEqual(ctx.data.weights.map((w) => w.kg), [83.4]);
  applyUndo(ctx.data, ctx.actions[0].undo);
  assert.deepEqual(ctx.data.weights.map((w) => w.id), ["old"]);
});

test("tool errors come back as results, not crashes", async () => {
  const ctx = ctxFor();
  const r = await runTool("log_weight", { kg: 5 }, ctx);
  assert.ok(r.error);
  assert.equal(ctx.mutated, false);
  const r2 = await runTool("nope", {}, ctx);
  assert.ok(r2.error);
});

test("prayers: missed adds qada, logging qada later pays it back, stats and streak", () => {
  const d = fresh();
  setPrayer(d, "2026-11-01", "asr", "missed");
  assert.equal(d.qada.asr, 1);
  setPrayer(d, "2026-11-01", "asr", "qada");
  assert.equal(d.qada.asr, 0);
  for (const day of ["2026-10-31", "2026-11-01"]) for (const p of ["fajr", "dhuhr", "asr", "maghrib", "isha"]) setPrayer(d, day, p, p === "asr" && day === "2026-11-01" ? "qada" : "ontime");
  const s = prayerStats(d, TODAY, 3);
  assert.equal(s.streak, 2);
  assert.equal(s.qadaOwed, 0);
});

test("forget needs confirmation", async () => {
  const ctx = ctxFor();
  await runTool("remember", { text: "Exam for AIT201 is on 12 Dec", kind: "fact" }, ctx);
  const r = await runTool("forget", { query: "AIT201 exam" }, ctx);
  assert.equal(r.needsConfirmation, true);
  assert.equal(ctx.data.memories.length, 1);
  await runTool("forget", { query: "AIT201 exam", confirmed: true }, ctx);
  assert.equal(ctx.data.memories.length, 0);
});

test("Quran plan math", () => {
  const d = fresh();
  d.quran = { page: 304, goalDate: "2026-11-11", khatms: [] };
  const q = quranPlan(d, TODAY);
  assert.equal(q.pagesLeft, 300);
  assert.equal(q.daysLeft, 10);
  assert.equal(q.pagesPerDay, 30);
});

test("Hijri date and fasting days", () => {
  const h = hijri("2026-11-02");
  assert.ok(h.year >= 1447 && h.year <= 1449);
  const days = fastingDays(TODAY, 7);
  assert.ok(days.some((x) => x.date === TODAY && x.reasons.includes("Monday")));
  assert.ok(days.some((x) => x.reasons.includes("Thursday")));
});

test("spaced repetition grows intervals and resets on forget", () => {
  let c = { due: TODAY, interval: 0, ease: 2.5, reps: 0 };
  c = review(c, 2, TODAY);
  assert.equal(c.interval, 2);
  c = review(c, 2, c.due);
  assert.equal(c.interval, 6);
  c = review(c, 2, c.due);
  assert.equal(c.interval, 15);
  c = review(c, 0, c.due);
  assert.equal(c.interval, 1);
});

test("fast path: exact short commands only", () => {
  const d = fresh();
  assert.deepEqual(parseFast("quran 10", d), { tool: "log_minimum", args: { name: "Quran", amount: 10 } });
  assert.deepEqual(parseFast("Asr late", d), { tool: "log_prayer", args: { prayer: "asr", status: "late" } });
  assert.deepEqual(parseFast("isyak", d), { tool: "log_prayer", args: { prayer: "isha", status: "ontime" } });
  assert.equal(parseFast("weight 82,5", d).args.kg, 82.5);
  assert.equal(parseFast("spent 12.50 food lunch", d).args.category, "Food");
  assert.equal(parseFast("todo call landlord", d).args.text, "call landlord");
  assert.equal(parseFast("had a great day", d), null);
  assert.equal(parseFast("how many pages of quran left", d), null);
  assert.equal(parseFast("asr was hard today because of class", d), null);
});

test("agent loop: calls tools, feeds results back, returns the final text", async () => {
  const ctx = ctxFor();
  const seen = [];
  const script = [
    { parts: [{ functionCall: { name: "log_minimum", args: { name: "Quran", amount: 5 } } }, { functionCall: { name: "log_workout", args: { type: "Home workout", minutes: 0, exercises: [{ name: "Push-ups", sets: 1, reps: 30, kg: 0 }] } } }] },
    { parts: [{ text: "Logged 5 pages and your push-ups." }] },
  ];
  const llm = async ({ contents }) => { seen.push(contents.length); return script.shift(); };
  const out = await runAgent({ input: "did 30 pushups and 5 pages quran", ctx, llm, system: "x" });
  assert.equal(out.reply, "Logged 5 pages and your push-ups.");
  assert.equal(out.llmCalls, 2);
  assert.equal(ctx.actions.length, 2);
  assert.equal(ctx.data.workouts[0].exercises[0].reps, 30);
  assert.deepEqual(seen, [1, 3]);
});

test("agent loop stops after max steps and asks for a plain answer", async () => {
  const ctx = ctxFor();
  let calls = 0;
  const llm = async ({ toolMode }) => { calls++; return toolMode === "NONE" ? { parts: [{ text: "Stopped." }] } : { parts: [{ functionCall: { name: "get_progress", args: { area: "food" } } }] }; };
  const out = await runAgent({ input: "loop", ctx, llm, system: "x", maxSteps: 3 });
  assert.equal(out.reply, "Stopped.");
  assert.equal(calls, 4);
});

test("replay applies the same changes to newer data", async () => {
  const ctx = ctxFor();
  await runTool("add_todo", { text: "A" }, ctx);
  await runTool("get_progress", { area: "food" }, ctx);
  assert.equal(ctx.calls.length, 1);
  const newer = fresh();
  newer.todos.push({ id: "x", text: "From phone", done: false, date: TODAY });
  const ctx2 = ctxFor(newer);
  await replay(ctx.calls, ctx2);
  assert.deepEqual(newer.todos.map((t) => t.text), ["From phone", "A"]);
});

test("free windows skip busy blocks", () => {
  const w = freeWindows([{ from: 9 * 60, to: 11 * 60 }, { from: 13 * 60, to: 13 * 60 + 20 }], 8 * 60, 15 * 60);
  assert.deepEqual(w.map((x) => `${x.from}-${x.to}`), ["08:00-09:00", "11:00-13:00", "13:20-15:00"]);
});

test("get_day works without network services", async () => {
  const d = fresh();
  d.schedule.push({ id: "s", day: 0, start: "09:00", end: "11:00", title: "CST301 Lecture" });
  const r = await runTool("get_day", {}, ctxFor(d));
  assert.equal(r.classes.length, 1);
  assert.equal(r.prayers.length, 5);
  assert.ok(r.freeWindows.every((w) => w.from >= "10:00"));
});

test("progressive overload suggestion", () => {
  const w = [
    { date: "2026-10-28", exercises: [{ name: "Bench press", sets: 3, reps: 8, kg: 40 }] },
    { date: "2026-10-31", exercises: [{ name: "Bench press", sets: 3, reps: 8, kg: 40 }] },
  ];
  assert.match(liftSuggestion(w, "bench press").suggestion, /42\.5 kg/);
});

test("notes: chunking, quantized vectors, hybrid ranking", () => {
  const pages = [
    { page: 1, text: "Gradient descent updates the weights in the direction of the negative gradient. ".repeat(10) },
    { page: 2, text: "Convolutional networks use filters that slide over the image to detect edges. ".repeat(10) },
  ];
  const chunks = chunkPages(pages);
  assert.ok(chunks.length >= 2);
  const v = Array.from({ length: 256 }, (_, i) => Math.sin(i));
  assert.ok(cosine(v, dequantize(quantize(v))) > 0.99);
  const kw = keywordScores("convolutional filters", chunks.map((c) => ({ t: c.t })));
  assert.ok(kw.some((x) => x > 0));
  const top = rank("convolutional filters", [{ docId: "d", title: "Lecture 3", chunks }], null)[0];
  assert.equal(top.page, 2);
});

test("bestMatch is forgiving but not random", () => {
  const items = [{ t: "CST301 Software Engineering" }, { t: "AIT201 Machine Learning" }];
  assert.equal(bestMatch(items, "machine learning", (x) => x.t).t, "AIT201 Machine Learning");
  assert.equal(bestMatch(items, "cooking", (x) => x.t), null);
});

test("time helpers use the user's timezone", () => {
  assert.equal(startOfDay(TZ, "2026-11-02").toISOString(), "2026-11-01T16:00:00.000Z");
  assert.equal(minutesIn(TZ, NOW), 600);
});

test("tick: briefing after Subuh, once", () => {
  const data = fresh();
  const t = (hm) => new Date(`2026-11-02T${hm}:00+08:00`);
  // Subuh in Kota Warisan is around 05:50, so the briefing is due ~06:10
  const early = planTick({ data, now: t("05:00"), tz: TZ });
  assert.ok(!early.notifications.some((n) => n.key === "briefing"));
  const r = planTick({ data, now: t("06:20"), tz: TZ });
  assert.ok(r.notifications.some((n) => n.key === "briefing"));
  const again = planTick({ data, now: t("06:25"), tz: TZ, state: { day: "2026-11-02", sent: { briefing: true } } });
  assert.ok(!again.notifications.some((n) => n.key === "briefing"));
  const stale = planTick({ data, now: t("09:00"), tz: TZ });
  assert.ok(!stale.notifications.some((n) => n.key === "briefing"));
});

test("tick: prayer reminder only when not yet logged; nudges respect class time and cap", () => {
  const data = fresh();
  const t = (hm) => new Date(`2026-11-02T${hm}:00+08:00`);
  // Find Asar time by scanning
  let asr = null;
  for (let m = 15 * 60; m < 17 * 60 && !asr; m += 5) {
    const hm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    if (planTick({ data, now: t(hm), tz: TZ }).notifications.some((n) => n.key === "pray-asr")) asr = hm;
  }
  assert.ok(asr, "asr reminder fires");
  data.prayers["2026-11-02"] = { asr: "ontime" };
  assert.ok(!planTick({ data, now: t(asr), tz: TZ }).notifications.some((n) => n.key === "pray-asr"));

  data.deadlines.push({ id: "d", title: "Lab report", subjectId: "", due: "2026-11-03", done: false });
  assert.ok(planTick({ data, now: t("18:05"), tz: TZ }).notifications.some((n) => n.key === "deadlines"));
  data.schedule.push({ id: "c", day: 0, start: "18:00", end: "20:00", title: "Evening class" });
  assert.ok(!planTick({ data, now: t("18:05"), tz: TZ }).notifications.some((n) => n.key === "deadlines"));
  data.schedule = [];
  assert.ok(!planTick({ data, now: t("18:05"), tz: TZ, state: { day: "2026-11-02", nudges: 99, sent: {} } }).notifications.some((n) => n.key === "deadlines"));
});

test("tick: reminders fire at their time", () => {
  const data = fresh();
  data.reminders.push({ id: "r1", text: "Call mum", date: "2026-11-02", time: "17:00", sent: false });
  const n = planTick({ data, now: new Date("2026-11-02T17:02:00+08:00"), tz: TZ }).notifications;
  assert.ok(n.some((x) => x.key === "rem-r1" && x.body === "Call mum"));
});

test("system prompt includes context and memory and stays compact", () => {
  const d = fresh();
  d.memories.push({ id: "m", text: "Wants to reach 75 kg by June", kind: "goal", at: TODAY });
  const p = systemPrompt(d, { today: TODAY, now: NOW, tz: TZ, voice: true });
  assert.match(p, /75 kg/);
  assert.match(p, /VOICE MODE/);
  assert.match(p, /quran_lookup/);
  assert.ok(p.length < 9000, `prompt is ${p.length} chars`);
});

test("weekly totals still work with new data fields", () => {
  const d = fresh();
  d.minLog[TODAY] = { "m-book": 12 };
  assert.equal(weekTotal(d, weekStart(TODAY), "m-book"), 12);
});
