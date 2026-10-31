// Fast path: short, unambiguous commands are handled with plain code, no AI call.
// This keeps the free Gemini quota for real conversations. Anything not matched exactly goes to the model.
import { PRAYERS, PRAYER_NAMES } from "./islam.js";

const PRAYER_ALIASES = {
  fajr: ["fajr", "subuh", "subh", "bamdat", "фаджр", "фаджир", "бамдат", "таң"],
  dhuhr: ["dhuhr", "zuhr", "zohor", "dhuhur", "zuhur", "бесін", "зухр", "обед"],
  asr: ["asr", "asar", "екінті", "аср"],
  maghrib: ["maghrib", "magrib", "ақшам", "акшам", "магриб"],
  isha: ["isha", "isyak", "ishaa", "құптан", "куптан", "иша"],
};
const STATUS_ALIASES = [
  ["ontime", /^(?:on ?time|done|prayed|ok|✓|вовремя|уақытында)$/],
  ["late", /^(?:late|поздно|кеш)$/],
  ["qada", /^(?:qada|qadha|kaza|қаза|каза)$/],
  ["missed", /^(?:missed|miss|пропустил|пропущен|қалды)$/],
];

const numOf = (s) => Number(String(s).replace(",", "."));

export function parseFast(text, data) {
  const raw = String(text || "").trim().replace(/[.!]+$/, "");
  const t = raw.toLowerCase();
  if (!t || t.length > 80) return null;
  let m;

  if ((m = t.match(/^(?:todo|to do|task)[:\s]+(.+)$/))) {
    return { tool: "add_todo", args: { text: raw.slice(raw.length - m[1].length) } };
  }
  if ((m = t.match(/^(?:spent|paid)\s+(?:rm\s*)?(\d+(?:[.,]\d+)?)\s*(?:rm|ringgit)?(?:\s+(?:on|for))?\s*(.*)$/))) {
    const rest = raw.slice(raw.length - m[2].length).trim();
    const cats = data.settings.categories || [];
    const cat = cats.find((c) => rest.toLowerCase().startsWith(c.toLowerCase()));
    return { tool: "log_money", args: { amount: numOf(m[1]), category: cat || "Other", note: cat ? rest.slice(cat.length).trim() : rest } };
  }
  if ((m = t.match(/^(?:weight|weigh|i weigh|вес|салмақ)\s+(\d+(?:[.,]\d+)?)\s*(?:kg|кг)?$/))) {
    return { tool: "log_weight", args: { kg: numOf(m[1]) } };
  }
  // "asr", "asr late", "isha done"
  if ((m = t.match(/^([\p{L}]+)(?:\s+(.+))?$/u))) {
    const prayer = PRAYERS.find((p) => PRAYER_ALIASES[p].includes(m[1]));
    if (prayer) {
      const st = m[2] ? STATUS_ALIASES.find(([, re]) => re.test(m[2].trim()))?.[0] : "ontime";
      if (st) return { tool: "log_prayer", args: { prayer, status: st } };
    }
  }
  // "quran 10", "book 25 pages"
  if ((m = t.match(/^(.+?)\s+(-?\d+)(?:\s*(?:pages?|p|стр|бет))?$/))) {
    const name = m[1].trim();
    const min = data.minimums.find((x) => x.name.toLowerCase() === name) || data.minimums.find((x) => name.length >= 3 && x.name.toLowerCase().startsWith(name));
    if (min) return { tool: "log_minimum", args: { name: min.name, amount: Number(m[2]) } };
  }
  return null;
}

export function fastReply(tool, result, ctx, voice) {
  const said = ctx.actions.map((a) => a.summary).join(". ");
  if (tool === "log_minimum") {
    const q = result.quran;
    return `${said}. This week ${result.week}.${q?.pagesPerDay ? ` Quran plan: ${q.pagesPerDay} pages a day to finish on time.` : ""}${result.khatmCompleted ? " Khatm complete, mashaAllah!" : ""}`;
  }
  if (tool === "log_prayer") {
    const s = result.stats;
    const left = PRAYERS.filter((p) => !result.logged?.[p]).map((p) => PRAYER_NAMES[p]);
    return `${said}.${s?.streak ? ` ${s.streak}-day streak.` : ""}${left.length && !voice ? ` Not logged yet today: ${left.join(", ")}.` : ""}`;
  }
  if (tool === "log_weight") return `${said}. 7-day average ${result.avg7} kg.`;
  return `${said}.`;
}
