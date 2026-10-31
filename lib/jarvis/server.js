// Server-only: runs Jarvis against the stored data. Chat history, the action log (for undo) and usage
// live in their own rows, so they never bloat the main document the app syncs.
import { normalize, uid } from "@/lib/data";
import { getSecret, isAuthed, loadData, loadVersion, saveData, sb, setSecret, storageEnabled } from "@/lib/server";
import { checkToken } from "@/lib/quick";
import { chat, embed, geminiReady } from "@/lib/gemini";
import { agenda } from "@/lib/integrations";
import { makeCtx, replay, runAgent, runTool } from "./agent.js";
import { systemPrompt } from "./prompt.js";
import { applyUndo } from "./undo.js";
import { chunkPages, quantize, rank } from "./notes.js";
import { dayIn, tzOf } from "./time.js";
import { fastReply, parseFast } from "./fast.js";

const CHAT = "jarvis-chat";
const LOG = "jarvis-log";
const USAGE = "jarvis-usage";
const MAX_TURNS = 40;
const MAX_LOG = 150;

// ---------- auth: signed-in session (web app) or the Siri/Shortcuts token ----------
export async function authorize(req) {
  if (await isAuthed()) return "session";
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim() || new URL(req.url).searchParams.get("token") || "";
  if (token && storageEnabled() && (await checkToken(token))) return "token";
  return null;
}

// ---------- history, log, usage ----------
export const getChat = async () => (await getSecret(CHAT)) || { turns: [] };
export const clearChat = () => setSecret(CHAT, { turns: [] });
export const getLog = async () => (await getSecret(LOG)) || [];

export async function getUsage(tz) {
  const u = (await getSecret(USAGE)) || {};
  const day = dayIn(tz);
  return u.day === day ? u : { day, calls: 0, fast: 0 };
}

async function addUsage(tz, calls, fast) {
  const u = await getUsage(tz);
  await setSecret(USAGE, { ...u, calls: u.calls + calls, fast: (u.fast || 0) + fast });
}

// Model history: the last turns as plain text, with what was done, so "undo that" or "and add 5 more" make sense.
// Gemini wants user/model turns to alternate and to start with the user, so same-role neighbours
// (e.g. a briefing after a model reply) are merged.
export function historyFor(turns) {
  const out = [];
  for (const t of turns.slice(-10)) {
    const role = t.role === "model" ? "model" : "user";
    const text = role === "model" && t.actions?.length ? `${t.text}\n[Actions taken: ${t.actions.map((a) => a.summary).join("; ")}]` : t.text;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n\n${text}`;
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

// ---------- services the tools can use ----------
const EDITIONS = { en: "en.sahih", ru: "ru.kuliev", ms: "ms.basmeih" };

export async function quranLookup({ surah, ayah, toAyah, query, lang = "en" }) {
  const ed = EDITIONS[lang] || EDITIONS.en;
  const get = async (path) => {
    const r = await fetch(`https://api.alquran.cloud/v1${path}`, { cache: "force-cache", next: { revalidate: 86400 * 30 } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.code !== 200) throw new Error(typeof j.data === "string" ? j.data : `Quran API error ${r.status}`);
    return j.data;
  };
  try {
    if (query && !surah) {
      const d = await get(`/search/${encodeURIComponent(query)}/all/${EDITIONS.en}`);
      return { matches: (d.matches || []).slice(0, 8).map((m) => ({ ref: `${m.surah.number}:${m.numberInSurah}`, surah: m.surah.englishName, text: m.text })), source: "api.alquran.cloud (Sahih International)" };
    }
    const s = Number(surah), a = Number(ayah || 1);
    if (!(s >= 1 && s <= 114)) return { error: "surah must be 1-114" };
    const last = Math.min(Number(toAyah || a), a + 9);
    const nums = Array.from({ length: Math.max(1, last - a + 1) }, (_, i) => a + i);
    const verses = await Promise.all(nums.map((n) => get(`/ayah/${s}:${n}/editions/quran-uthmani,${ed}`)));
    return {
      surah: verses[0]?.[0]?.surah?.englishName,
      verses: verses.map((v) => ({ ref: `${s}:${v[0].numberInSurah}`, arabic: v[0].text, translation: v[1]?.text })),
      translation: v1Name(ed),
      source: "api.alquran.cloud",
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}
const v1Name = (ed) => ({ "en.sahih": "Sahih International", "ru.kuliev": "Kuliev", "ms.basmeih": "Basmeih" })[ed] || ed;

// Notes are stored one row per document: id "notes:<docId>"
export async function listNotes() {
  if (!storageEnabled()) return [];
  const rows = await sb(`/rest/v1/life_data?id=like.${encodeURIComponent("notes:*")}&select=data`);
  return (rows || []).map((r) => r.data).filter(Boolean);
}

export async function indexNotes({ docId, title, subjectId = "", pages }) {
  if (!docId || !Array.isArray(pages)) throw new Error("docId and pages are needed");
  const chunks = chunkPages(pages.slice(0, 1500).map((p) => ({ page: Number(p.page), text: String(p.text || "").slice(0, 20000) })));
  if (!chunks.length) throw new Error("No text found in this PDF (it may be scanned images).");
  let embedded = false;
  if (await geminiReady()) {
    try {
      const vecs = await embed(chunks.map((c) => `${title}\n${c.t}`));
      vecs.forEach((v, i) => { chunks[i].e = quantize(v); });
      embedded = true;
    } catch {
      // Keyword search still works; embeddings can be added later by re-indexing
    }
  }
  const doc = { docId: String(docId), title: String(title || "Untitled").slice(0, 200), subjectId, chunks, pages: pages.length, embedded, at: new Date().toISOString() };
  await setSecretRaw(`notes:${doc.docId}`, doc);
  return { chunks: chunks.length, pages: pages.length, embedded };
}

export const deleteNotes = (docId) => setSecretRaw(`notes:${docId}`, null);

// Same table as secrets, but under its own id prefix
async function setSecretRaw(id, value) {
  if (value == null) {
    await sb(`/rest/v1/life_data?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return;
  }
  await sb(`/rest/v1/life_data?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id, data: value, updated_at: new Date().toISOString() }),
  });
}

export async function searchNotes(query, { subjectId } = {}) {
  const docs = await listNotes();
  if (!docs.length) return { results: [], note: "No notes indexed yet. In Reading, open a PDF's menu and choose 'Let Jarvis read it'." };
  let qVec = null;
  if (docs.some((d) => d.embedded)) {
    try { qVec = (await embed([query], "RETRIEVAL_QUERY"))[0]; } catch { qVec = null; }
  }
  const results = rank(query, docs, qVec, { k: 6, subjectId });
  return { results: results.map((r) => ({ ...r, text: r.text.slice(0, 1400) })), searched: docs.map((d) => d.title) };
}

// ---------- the main entry ----------
// source: "web" | "siri" | "tick"
// Voice recordings are understood by Gemini directly (any language, no phone dictation needed)
export const AUDIO_MIME = /^audio\/(wav|x-wav|wave|mp3|mpeg|aiff|x-aiff|aac|ogg|flac|mp4|m4a|x-m4a)$/;
export const normAudioMime = (m) => {
  const t = String(m || "").split(";")[0].trim().toLowerCase();
  if (/m4a|mp4/.test(t)) return "audio/mp4";
  if (/wav|wave/.test(t)) return "audio/wav";
  if (/mpeg|mp3/.test(t)) return "audio/mp3";
  if (/aiff/.test(t)) return "audio/aiff";
  return t;
};

export async function ask({ text, source = "web", voice = false, image, audio }) {
  const input = String(text || "").trim().slice(0, 4000) || (audio ? "(voice message, see the attached recording)" : "");
  if (!input) throw new Error("Say something first.");
  const loaded = normalize(await loadData());
  const tz = tzOf(loaded);
  const now = new Date();
  const today = dayIn(tz, now);
  const chatState = await getChat();
  const log = await getLog();
  const undone = new Set(); // action ids undone during this request

  const services = (ctx) => ({
    agenda: (from, to) => agenda(from, to),
    searchNotes,
    quran: quranLookup,
    undoLast: async () => {
      const last = [...log].reverse().find((a) => !a.undone && !undone.has(a.id));
      if (!last) return { error: "Nothing to undo." };
      const group = log.filter((a) => a.group === last.group && !a.undone && !undone.has(a.id));
      for (const a of [...group].reverse()) { applyUndo(ctx.data, a.undo); undone.add(a.id); }
      ctx.mutated = true;
      return { undone: group.map((a) => a.summary) };
    },
  });

  let ctx = makeCtx({ data: loaded, today, now, tz });
  ctx.services = services(ctx);
  let reply, llmCalls = 0, fast = 0;

  const quick = !image && !audio && parseFast(input, loaded);
  if (quick) {
    const result = await runTool(quick.tool, quick.args, ctx);
    if (!result?.error) {
      reply = fastReply(quick.tool, result, ctx, voice);
      fast = 1;
    } else {
      ctx = makeCtx({ data: normalize(await loadData()), today, now, tz });
      ctx.services = services(ctx);
    }
  }
  if (!reply) {
    const out = await runAgent({
      input,
      history: historyFor(chatState.turns),
      ctx,
      llm: chat,
      system: systemPrompt(loaded, { today, now, tz, voice }),
      extraParts: [
        ...(image ? [{ inline_data: { mime_type: image.mime, data: image.data } }] : []),
        ...(audio ? [
          { inline_data: { mime_type: normAudioMime(audio.mime), data: audio.data } },
          { text: `The recording above is ${loaded.settings.name || "the user"} talking to you (English, Russian or Kazakh). Understand it and act on it exactly as if it had been typed.${voice ? "" : " Start your reply with one line: 🎤 followed by what you heard, in the original language, in quotes."}` },
        ] : []),
      ],
    });
    reply = out.reply;
    llmCalls = out.llmCalls;
  }

  // Save, without overwriting a newer version saved by another device in the meantime
  let data = ctx.data;
  if (ctx.mutated) {
    const current = await loadVersion();
    if (current && current !== loaded.updatedAt) {
      const fresh = normalize(await loadData());
      const ctx2 = makeCtx({ data: fresh, today, now, tz });
      ctx2.services = services(ctx2);
      for (const a of log.filter((x) => undone.has(x.id)).reverse()) applyUndo(fresh, a.undo);
      await replay(ctx.calls, ctx2);
      ctx.actions = ctx2.actions;
      data = fresh;
    }
    data.updatedAt = new Date().toISOString();
    await saveData(data);
  }

  const group = uid();
  const at = now.toISOString();
  const entries = ctx.actions.map((a) => ({ id: uid(), group, at, source, tool: a.tool, summary: a.summary, undo: a.undo, undone: false }));
  const newLog = [...log.map((a) => (undone.has(a.id) ? { ...a, undone: true } : a)), ...entries].slice(-MAX_LOG);
  const turns = [
    ...chatState.turns,
    { role: "user", text: audio ? (text ? input : "🎤 Voice message") : input, at, source, ...(image ? { image: true } : {}), ...(audio ? { audio: true } : {}) },
    { role: "model", text: reply, at, source, actions: entries.map((e) => ({ id: e.id, summary: e.summary })) },
  ].slice(-MAX_TURNS);
  await Promise.all([
    setSecret(CHAT, { turns }),
    entries.length || undone.size ? setSecret(LOG, newLog) : null,
    addUsage(tz, llmCalls, fast).catch(() => {}),
  ]);

  return {
    reply,
    actions: entries.map((e) => ({ id: e.id, summary: e.summary })),
    undone: [...undone].length,
    changed: ctx.mutated,
    data: ctx.mutated ? data : undefined,
    llmCalls,
  };
}

// Undo one action (by id) or the latest group
export async function undo(id) {
  const log = await getLog();
  const targets = id
    ? log.filter((a) => a.id === id && !a.undone)
    : (() => { const last = [...log].reverse().find((a) => !a.undone); return last ? log.filter((a) => a.group === last.group && !a.undone) : []; })();
  if (!targets.length) return { undone: [], error: "Nothing to undo." };
  const data = normalize(await loadData());
  for (const a of [...targets].reverse()) applyUndo(data, a.undo);
  data.updatedAt = new Date().toISOString();
  await saveData(data);
  const ids = new Set(targets.map((a) => a.id));
  await setSecret(LOG, log.map((a) => (ids.has(a.id) ? { ...a, undone: true } : a)));
  return { undone: targets.map((a) => a.summary), data };
}

// Run one tool directly (notification buttons, health import) with logging and undo, no model call
export async function act(tool, args, source = "app") {
  const data = normalize(await loadData());
  const tz = tzOf(data);
  const now = new Date();
  const ctx = makeCtx({ data, today: dayIn(tz, now), now, tz });
  const result = await runTool(tool, args, ctx);
  if (result?.error) throw new Error(result.error);
  if (ctx.mutated) {
    data.updatedAt = new Date().toISOString();
    await saveData(data);
    const group = uid();
    const entries = ctx.actions.map((a) => ({ id: uid(), group, at: now.toISOString(), source, tool: a.tool, summary: a.summary, undo: a.undo, undone: false }));
    await setSecret(LOG, [...(await getLog()), ...entries].slice(-MAX_LOG));
  }
  return { result, actions: ctx.actions.map((a) => a.summary), data };
}
