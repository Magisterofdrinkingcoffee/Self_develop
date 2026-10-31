// Server-only Gemini client. The key never reaches the browser.
// Key: GEMINI_API_KEY env var (recommended), or one saved from Settings (stored server-side).
// Model: GEMINI_MODEL env var, otherwise the newest available Flash model is picked automatically.
import { getSecret } from "@/lib/server";

const BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
let chosenModel = null;

async function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const s = await getSecret("gemini").catch(() => null);
  return s?.key || null;
}

async function pickModel(key) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (chosenModel) return chosenModel;
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, cache: "no-store" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `Gemini rejected the key (${res.status})`);
  const ok = (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-[\d.]+-flash$|^gemini-flash-latest$/.test(n));
  // Prefer the highest-numbered stable Flash model, e.g. gemini-3.8-flash over gemini-2.5-flash
  const ver = (n) => parseFloat(n.match(/gemini-([\d.]+)/)?.[1] || "0");
  ok.sort((a, b) => ver(b) - ver(a));
  chosenModel = ok[0] || "gemini-flash-latest";
  return chosenModel;
}

export async function geminiReady() {
  return !!(await apiKey());
}

// parts: [{ text }, { inline_data: { mime_type, data } }]
export async function generate({ system, parts, history = [], schema }) {
  const key = await apiKey();
  if (!key) throw new Error("Add your Gemini API key first (Settings → AI).");
  const model = await pickModel(key);
  const body = {
    contents: [...history, { role: "user", parts }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: schema ? { responseMimeType: "application/json", responseSchema: schema } : {},
  };
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404) chosenModel = null;
    if (res.status === 429) throw new Error("Gemini's free limit is used up for now. Try again in a minute.");
    throw new Error(j.error?.message || `Gemini error ${res.status}`);
  }
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty answer. Try rephrasing.");
  if (!schema) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini's answer couldn't be read. Try again.");
  }
}

// Raw call for the Jarvis agent: returns the model's content ({ parts }) including function calls.
// toolMode "NONE" forces a plain text answer.
export async function chat({ system, contents, tools, toolMode }) {
  const key = await apiKey();
  if (!key) throw new Error("Add your Gemini API key first (Settings → AI).");
  const model = await pickModel(key);
  const body = {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(tools ? { tools, toolConfig: { functionCallingConfig: { mode: toolMode || "AUTO" } } } : {}),
    generationConfig: { temperature: 0.4 },
  };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      const c = j.candidates?.[0];
      if (!c?.content) throw new Error(c?.finishReason === "SAFETY" ? "Gemini declined to answer that." : "Gemini returned an empty answer. Try rephrasing.");
      return c.content;
    }
    if (res.status === 404) chosenModel = null;
    // One quick retry on overload; the free tier's per-minute limit usually clears fast
    if ((res.status === 503 || res.status === 500) && attempt < 1) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    if (res.status === 429) throw Object.assign(new Error("Gemini's free limit is used up for now. Try again in a minute."), { code: 429 });
    throw new Error(j.error?.message || `Gemini error ${res.status}`);
  }
}

// Text embeddings for notes search. 256 dimensions is plenty for personal notes and keeps storage small.
export const EMBED_DIM = 256;
export async function embed(texts, task = "RETRIEVAL_DOCUMENT") {
  const key = await apiKey();
  if (!key) throw new Error("No Gemini key");
  const model = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch(`${BASE}/models/${model}:batchEmbedContents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        requests: batch.map((t) => ({ model: `models/${model}`, content: { parts: [{ text: t }] }, taskType: task, outputDimensionality: EMBED_DIM })),
      }),
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error?.message || `Embedding error ${res.status}`);
    out.push(...(j.embeddings || []).map((e) => e.values));
  }
  return out;
}
