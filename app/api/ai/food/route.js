import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/server";
import { generate } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          portion: { type: "STRING" },
          kcal: { type: "NUMBER" },
          protein: { type: "NUMBER" },
          carbs: { type: "NUMBER" },
          fat: { type: "NUMBER" },
        },
        required: ["name", "kcal", "protein", "carbs", "fat"],
      },
    },
    note: { type: "STRING" },
  },
  required: ["items"],
};

const SYSTEM = `You estimate calories and macros for meals a university student in Malaysia logs.
Split the meal into separate items with realistic portion sizes (Malaysian mamak/hawker portions when it fits, e.g. nasi lemak, roti canai, teh tarik, chicken rice).
Give kcal and grams of protein, carbs and fat per item, rounded to whole numbers. If a photo is given, judge the portion from it.
"note" is one short sentence: anything uncertain, or a practical tip if the meal is unusually heavy. No moralising.`;

// POST { text, image?: "data:image/jpeg;base64,..." }
export async function POST(req) {
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  try {
    const { text, image } = await req.json();
    if (!text?.trim() && !image) throw new Error("Describe the meal or add a photo.");
    const parts = [{ text: text?.trim() ? `Meal: ${text.trim()}` : "Estimate the meal in this photo." }];
    if (image) {
      const m = String(image).match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
      if (!m) throw new Error("That photo couldn't be read.");
      if (m[2].length > 6_000_000) throw new Error("That photo is too large.");
      parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
    }
    const out = await generate({ system: SYSTEM, parts, schema: SCHEMA });
    const items = (out.items || []).map((i) => ({
      name: String(i.name || "Food").slice(0, 80),
      portion: String(i.portion || "").slice(0, 60),
      kcal: Math.round(Number(i.kcal) || 0),
      protein: Math.round(Number(i.protein) || 0),
      carbs: Math.round(Number(i.carbs) || 0),
      fat: Math.round(Number(i.fat) || 0),
    }));
    return NextResponse.json({ items, note: out.note || "" });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}
