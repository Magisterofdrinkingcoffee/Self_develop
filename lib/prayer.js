// Prayer times computed on the device (no network). Default: Kota Warisan, JAKIM-style angles (adhan "Singapore").
import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";
import { parseKey } from "@/lib/data";

const NAMES = [["fajr", "Subuh"], ["dhuhr", "Zohor"], ["asr", "Asar"], ["maghrib", "Maghrib"], ["isha", "Isyak"]];

export function prayerTimes(settings, dayKey) {
  try {
    const lat = Number(settings.lat), lng = Number(settings.lng);
    if (!isFinite(lat) || !isFinite(lng)) return [];
    const method = (CalculationMethod[settings.prayerMethod] || CalculationMethod.Singapore)();
    method.madhab = settings.madhab === "Hanafi" ? Madhab.Hanafi : Madhab.Shafi;
    const pt = new PrayerTimes(new Coordinates(lat, lng), parseKey(dayKey), method);
    return NAMES.map(([k, name]) => ({ key: k, name, time: pt[k] }));
  } catch {
    return [];
  }
}

// Same shape as calendar events, for the agenda
export function prayerEvents(settings, dayKey) {
  if (settings.showPrayers === false) return [];
  return prayerTimes(settings, dayKey).map((p) => ({
    id: `p:${dayKey}:${p.key}`,
    title: p.name,
    start: p.time.toISOString(),
    end: p.time.toISOString(),
    allDay: false,
    source: "prayer",
  }));
}

export function nextPrayer(settings, now = new Date()) {
  if (settings.showPrayers === false) return null;
  const k = now.toLocaleDateString("en-CA");
  return prayerTimes(settings, k).find((p) => p.time > now) || null;
}
