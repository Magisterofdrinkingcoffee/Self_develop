// The agent loop: the model reads the request, calls tools, sees their results, and repeats until it can answer.
// Pure: the model call (llm) and network services are injected, so it runs the same in the app, in tests and in evals.
import { TOOL_MAP, declarations } from "./tools.js";

export function makeCtx({ data, today, now, tz, services = {} }) {
  const ctx = {
    data, today, now, tz, services,
    actions: [], // [{ tool, summary, undo }]
    calls: [], // mutating tool calls, for replay on a newer copy of the data
    mutated: false,
    current: null,
    record(summary, undo = []) {
      ctx.actions.push({ tool: ctx.current, summary, undo });
      ctx.mutated = true;
    },
  };
  return ctx;
}

export async function runTool(name, args, ctx) {
  const tool = TOOL_MAP[name];
  if (!tool) return { error: `Unknown tool ${name}` };
  ctx.current = name;
  const before = ctx.actions.length;
  try {
    const out = await tool.run(args || {}, ctx);
    if (ctx.actions.length > before && name !== "undo_last") ctx.calls.push({ name, args: args || {} });
    return out ?? { ok: true };
  } catch (e) {
    return { error: String(e?.message || e) };
  } finally {
    ctx.current = null;
  }
}

// Re-apply the same changes to a fresh copy of the data (another device saved while the model was thinking)
export async function replay(calls, ctx) {
  for (const c of calls) await runTool(c.name, c.args, ctx);
  return ctx;
}

const textOf = (content) => (content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();

export async function runAgent({ input, history = [], ctx, llm, system, maxSteps = 6, extraParts = [] }) {
  const tools = [{ functionDeclarations: declarations() }];
  const contents = [...history, { role: "user", parts: [{ text: input }, ...extraParts] }];
  let llmCalls = 0;
  for (let step = 0; step < maxSteps; step++) {
    const content = await llm({ system, contents, tools });
    llmCalls++;
    // Keep the model's turn exactly as returned (Gemini needs its thought signatures back)
    contents.push({ role: "model", parts: content?.parts || [] });
    const fcalls = (content?.parts || []).filter((p) => p.functionCall);
    if (!fcalls.length) {
      return { reply: textOf(content) || "Done.", ctx, llmCalls, steps: step + 1 };
    }
    const responses = [];
    for (const p of fcalls) {
      const { name, args, id } = p.functionCall;
      const result = await runTool(name, args, ctx);
      responses.push({ functionResponse: { ...(id ? { id } : {}), name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  // Out of steps: ask for a plain answer with tools switched off
  const content = await llm({ system, contents, tools, toolMode: "NONE" });
  llmCalls++;
  return { reply: textOf(content) || ctx.actions.map((a) => a.summary).join(". ") || "Done.", ctx, llmCalls, steps: maxSteps };
}
