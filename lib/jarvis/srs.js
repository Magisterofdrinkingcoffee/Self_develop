// Spaced repetition (a small SM-2 variant) shared by flashcards and Quran memorisation review.
// grade: 0 = forgot, 1 = hard, 2 = good, 3 = easy
import { addDays } from "../data.js";

export function newItem(today) {
  return { due: today, interval: 0, ease: 2.5, reps: 0, lastReview: null };
}

export function review(item, grade, today) {
  const g = Math.max(0, Math.min(3, Number(grade)));
  let { interval = 0, ease = 2.5, reps = 0 } = item;
  if (g === 0) {
    reps = 0;
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (reps === 1) interval = g === 1 ? 1 : g === 2 ? 2 : 4;
    else if (reps === 2) interval = g === 1 ? 3 : g === 2 ? 6 : 8;
    else interval = Math.max(1, Math.round(interval * (g === 1 ? 1.2 : g === 2 ? ease : ease * 1.3)));
    ease = Math.max(1.3, Math.min(3, ease + (g === 1 ? -0.15 : g === 3 ? 0.15 : 0)));
  }
  interval = Math.min(interval, 365);
  return { ...item, interval, ease: Math.round(ease * 100) / 100, reps, lastReview: today, due: addDays(today, interval) };
}

export const isDue = (item, today) => !item.due || item.due <= today;
