// Jarvis evals: does the model pick the right tools for real phrases?
// Runs against a throwaway in-memory copy of the data (nothing is saved), with real Gemini.
//   GEMINI_API_KEY=... npm run eval            (optional: GEMINI_MODEL=gemini-2.5-flash)
// Add your own phrases to evals/cases.json. Run this after changing tools or the prompt.
import { readFileSync } from "node:fs";
import { defaultData, normalize } from "../lib/data.js";
import { makeCtx, runAgent, runTool } from "../lib/jarvis/agent.js";
import { systemPrompt } from "../lib/jarvis/prompt.js";
import { dayIn } from "../lib/jarvis/time.js";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("Set GEMINI_API_KEY to run evals."); process.exit(1); }
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

async function llm({ system, contents, tools, toolMode }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: system }] }, tools, toolConfig: { functionCallingConfig: { mode: toolMode || "AUTO" } }, generationConfig: { temperature: 0.4 } }),
    });
    const j = await res.json();
    if (res.ok) return j.candidates?.[0]?.content || { parts: [] };
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 15000 * (attempt + 1))); continue; }
    throw new Error(j.error?.message || res.status);
  }
  throw new Error("rate limited");
}

const fake = {
  agenda: async () => ({ events: [] }),
  searchNotes: async () => ({ results: [{ title: "AIT201 Lecture 4", page: 12, text: "Backpropagation computes gradients layer by layer using the chain rule." }] }),
  quran: async () => ({ verses: [{ ref: "103:1", translation: "By time," }] }),
  undoLast: async () => ({ undone: ["Quran +5"] }),
};

const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url)));
const only = process.argv[2];
let pass = 0;
const fails = [];
for (const [i, c] of cases.entries()) {
  if (only && !c.say.toLowerCase().includes(only.toLowerCase())) continue;
  const data = normalize(defaultData());
  data.subjects = [{ id: "s1", code: "AIT201", name: "Machine Learning" }, { id: "s2", code: "CST301", name: "Software Engineering" }];
  const tz = data.settings.timezone, now = new Date(), today = dayIn(tz, now);
  const ctx = makeCtx({ data, today, now, tz, services: fake });
  for (const [tool, args] of c.setup || []) await runTool(tool, args, ctx);
  const called = [];
  const wrapped = async (req) => { const out = await llm(req); for (const p of out.parts || []) if (p.functionCall) called.push(p.functionCall); return out; };
  try {
    const out = await runAgent({ input: c.say, ctx, llm: wrapped, system: systemPrompt(data, { today, now, tz }) });
    const names = called.map((f) => f.name);
    let ok = c.expect.length ? c.expect.every((e) => names.includes(e)) : !ctx.actions.length;
    for (const [tool, want] of Object.entries(c.args || {})) {
      const call = called.find((f) => f.name === tool);
      if (!call || Object.entries(want).some(([k, v]) => String(call.args?.[k]).toLowerCase() !== String(v).toLowerCase())) ok = false;
    }
    if (ok) pass++; else fails.push({ say: c.say, expected: c.expect, got: called.map((f) => `${f.name}(${JSON.stringify(f.args)})`), reply: out.reply });
    console.log(`${ok ? "✓" : "✗"} ${c.say}  →  ${names.join(", ") || "(no tools)"}`);
  } catch (e) {
    fails.push({ say: c.say, error: String(e.message || e) });
    console.log(`! ${c.say}  →  ${e.message || e}`);
  }
  if (i < cases.length - 1) await new Promise((r) => setTimeout(r, 4000)); // stay under the free per-minute limit
}
const total = pass + fails.length;
console.log(`\n${pass}/${total} passed (${Math.round((pass / (total || 1)) * 100)}%) with ${MODEL}`);
if (fails.length) console.log(JSON.stringify(fails, null, 2));
process.exit(fails.length ? 1 : 0);
