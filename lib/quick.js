// Server-only: turn a short phrase ("quran 10", "spent 12.50 food lunch", "ate nasi lemak") into a log entry.
import { randomBytes } from "node:crypto";
import { normalize, uid } from "@/lib/data";
import { getSecret, loadData, saveData, setSecret } from "@/lib/server";
import { generate, geminiReady } from "@/lib/gemini";

const TZ = "Asia/Kuala_Lumpur";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

export async function quickToken(regenerate = false) {
  let t = await getSecret("quick-token");
  if (!t?.token || regenerate) {
    t = { token: randomBytes(24).toString("base64url"), at: new Date().toISOString() };
    await setSecret("quick-token", t);
  }
  return t.token;
}

export async function checkToken(given) {
  const t = await getSecret("quick-token");
  if (!t?.token || !given || given.length !== t.token.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ t.token.charCodeAt(i);
  return diff === 0;
}

const MEAL_SCHEMA = {
  type: "OBJECT",
  properties: { name: { type: "STRING" }, kcal: { type: "NUMBER" }, protein: { type: "NUMBER" }, carbs: { type: "NUMBER" }, fat: { type: "NUMBER" } },
  required: ["name", "kcal"],
};

export async function quickAdd(raw) {
  const text = String(raw || "").trim().replace(/[.!]+$/, "");
  if (!text) return "Say what to log, for example: Quran 10, spent 12 food lunch, ate nasi lemak, todo call landlord, weight 82.5";
  const t = text.toLowerCase();
  const data = normalize(await loadData());
  const day = today();
  let reply;

  let m;
  if ((m = t.match(/^(?:todo|to do|task|remind me to)\s+(.+)$/))) {
    const txt = text.slice(text.length - m[1].length);
    data.todos.push({ id: uid(), text: txt, done: false, date: day });
    reply = `Added to-do: ${txt}`;
  } else if ((m = t.match(/^(?:spent|paid|expense)\s+(?:rm\s*)?(\d+(?:[.,]\d+)?)\s*(?:rm|ringgit)?\s*(?:on|for)?\s*(.*)$/))) {
    const amount = Number(m[1].replace(",", "."));
    const rest = m[2].trim();
    const cats = data.settings.categories || [];
    const cat = cats.find((c) => rest.toLowerCase().startsWith(c.toLowerCase())) || "Other";
    const note = cat !== "Other" || rest.toLowerCase().startsWith("other") ? rest.slice(cat.length).trim() : rest;
    data.money.push({ id: uid(), date: day, type: "expense", amount, category: cat, note });
    reply = `Logged ${data.settings.currency} ${amount.toFixed(2)} on ${cat}${note ? ` (${note})` : ""}`;
  } else if ((m = t.match(/^(?:weight|weigh|i weigh)\s+(\d+(?:[.,]\d+)?)/))) {
    const kg = Number(m[1].replace(",", "."));
    data.weights = data.weights.filter((w) => w.date !== day);
    data.weights.push({ id: uid(), date: day, kg });
    reply = `Weight ${kg} kg saved`;
  } else if ((m = t.match(/^(?:ate|eat|had|food|meal)\s+(.+?)(?:\s+(\d+)\s*(?:kcal|cal|calories))?$/))) {
    let name = text.slice(text.toLowerCase().indexOf(m[1]), text.toLowerCase().indexOf(m[1]) + m[1].length);
    let entry = { name, kcal: Number(m[2]) || 0 };
    if (!m[2] && (await geminiReady())) {
      try {
        const est = await generate({
          system: "Estimate calories and macros (grams) for this meal as eaten by a university student in Malaysia. Use a typical single portion. Round to whole numbers.",
          parts: [{ text: name }],
          schema: MEAL_SCHEMA,
        });
        entry = { name, kcal: Math.round(est.kcal || 0), protein: Math.round(est.protein || 0), carbs: Math.round(est.carbs || 0), fat: Math.round(est.fat || 0) };
      } catch {}
    }
    data.meals.push({ id: uid(), date: day, ...entry });
    const total = data.meals.filter((x) => x.date === day).reduce((s, x) => s + Number(x.kcal || 0), 0);
    reply = entry.kcal
      ? `Logged ${name}, about ${entry.kcal} kcal. ${total} of ${data.settings.calorieTarget} today.`
      : `Logged ${name}. Add the calories in the app.`;
  } else {
    const mm = t.match(/^(.+?)\s+(\d+)(?:\s*(?:pages?|p))?$/);
    const min = mm && data.minimums.find((x) => x.name.toLowerCase() === mm[1].trim() || x.name.toLowerCase().startsWith(mm[1].trim()));
    if (!min) {
      return `I couldn't match "${text}". Try: ${data.minimums.map((x) => x.name).slice(0, 3).join(" 10, ")} 10, spent 12 food, ate nasi lemak, todo …, weight 82.5`;
    }
    const n = Number(mm[2]);
    data.minLog[day] = { ...(data.minLog[day] || {}), [min.id]: Number(data.minLog[day]?.[min.id] || 0) + n };
    reply = `Added ${n} to ${min.name}`;
  }

  data.updatedAt = new Date().toISOString();
  await saveData(data);
  return reply;
}
