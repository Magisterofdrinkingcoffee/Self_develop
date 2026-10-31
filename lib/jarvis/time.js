// Time helpers that always use the user's timezone. The server runs in UTC, so "today" must never
// come from the server clock's local date.
import { addDays, parseKey } from "../data.js";

export const DEFAULT_TZ = "Asia/Kuala_Lumpur";
export const tzOf = (data) => data?.settings?.timezone || DEFAULT_TZ;

export const dayIn = (tz, d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: tz });

export const hmIn = (tz, d = new Date()) =>
  d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// Minutes since local midnight
export const minutesIn = (tz, d = new Date()) => {
  const [h, m] = hmIn(tz, d).split(":").map(Number);
  return (h % 24) * 60 + m;
};

export const hmToMin = (s) => {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export const minToHm = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// Monday = 0
export const dowOf = (key) => (parseKey(key).getDay() + 6) % 7;

export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);

// Start of a local day as a real instant. Works for any fixed-offset zone and DST zones away from the switch hour.
export function startOfDay(tz, key) {
  const guess = new Date(`${key}T00:00:00Z`);
  const offsetMin = (d) => {
    const local = new Date(d.toLocaleString("en-US", { timeZone: tz }));
    const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
    return (local - utc) / 60e3;
  };
  return new Date(guess.getTime() - offsetMin(guess) * 60e3);
}

export const dayRange = (tz, key, days = 1) => ({
  from: startOfDay(tz, key).toISOString(),
  to: startOfDay(tz, addDays(key, days)).toISOString(),
});

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
