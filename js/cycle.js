/**
 * cycle.js — the 15th → 14th billing cycle.
 *
 * A cycle is keyed by the YYYY-MM of its START month.
 *   cycle '2026-08'  ==  15 Aug 2026 → 14 Sep 2026 (inclusive both ends)
 *
 * Pure date math, no dependencies. Safe to import from React Native.
 */

export const CYCLE_START_DAY = 15;

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/* ---------------- key helpers ---------------- */

/** '2026-08' -> { year: 2026, month: 7 }  (month is 0-indexed) */
export function parseCycleKey(key) {
  const [y, m] = String(key).split('-').map(Number);
  return { year: y, month: m - 1 };
}

/** (2026, 7) -> '2026-08' */
export function toCycleKey(year, month) {
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Shift a cycle key by n cycles (n may be negative). */
export function shiftCycle(key, n) {
  const { year, month } = parseCycleKey(key);
  return toCycleKey(year, month + n);
}

export const nextCycle = (key) => shiftCycle(key, 1);
export const prevCycle = (key) => shiftCycle(key, -1);

/** Whole cycles from `from` to `to`. Negative if `to` is earlier. */
export function cyclesBetween(from, to) {
  const a = parseCycleKey(from);
  const b = parseCycleKey(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** Inclusive list of cycle keys. */
export function cycleRange(from, to) {
  const n = cyclesBetween(from, to);
  const out = [];
  for (let i = 0; i <= n; i += 1) out.push(shiftCycle(from, i));
  return out;
}

/* ---------------- date <-> cycle ---------------- */

/** Local-midnight Date for the first day (the 15th) of a cycle. */
export function cycleStartDate(key, startDay = CYCLE_START_DAY) {
  const { year, month } = parseCycleKey(key);
  return new Date(year, month, startDay);
}

/** Local-midnight Date for the last day (the 14th of the next month). */
export function cycleEndDate(key, startDay = CYCLE_START_DAY) {
  const { year, month } = parseCycleKey(key);
  return new Date(year, month + 1, startDay - 1);
}

/** Which cycle does this date belong to? */
export function cycleForDate(date, startDay = CYCLE_START_DAY) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  // On/after the 15th -> this month's cycle; before -> previous month's.
  return d.getDate() >= startDay ? toCycleKey(y, m) : toCycleKey(y, m - 1);
}

export function currentCycle(now = new Date(), startDay = CYCLE_START_DAY) {
  return cycleForDate(now, startDay);
}

export function isDateInCycle(date, key, startDay = CYCLE_START_DAY) {
  return cycleForDate(date, startDay) === key;
}

/* ---------------- formatting ---------------- */

/** '2026-08' -> 'Aug 2026' */
export function cycleMonthLabel(key) {
  const { year, month } = parseCycleKey(key);
  return `${MONTH_NAMES[month]} ${year}`;
}

/** '2026-08' -> '15 Aug – 14 Sep 2026' */
export function cycleRangeLabel(key, startDay = CYCLE_START_DAY) {
  const s = cycleStartDate(key, startDay);
  const e = cycleEndDate(key, startDay);
  const sameYear = s.getFullYear() === e.getFullYear();
  const left = `${s.getDate()} ${MONTH_NAMES[s.getMonth()]}${sameYear ? '' : ` ${s.getFullYear()}`}`;
  const right = `${e.getDate()} ${MONTH_NAMES[e.getMonth()]} ${e.getFullYear()}`;
  return `${left} – ${right}`;
}

/** Days elapsed / total, for the cycle progress bar. */
export function cycleProgress(key, now = new Date(), startDay = CYCLE_START_DAY) {
  const s = cycleStartDate(key, startDay);
  const e = cycleEndDate(key, startDay);
  const total = Math.round((e - s) / 86400000) + 1;
  const elapsed = Math.round((now - s) / 86400000) + 1;
  return {
    total,
    elapsed: Math.max(0, Math.min(total, elapsed)),
    daysLeft: Math.max(0, total - Math.max(0, Math.min(total, elapsed))),
    pct: Math.max(0, Math.min(1, elapsed / total)),
    isCurrent: now >= s && now <= new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59),
  };
}

/** ISO yyyy-mm-dd in *local* time (avoids the toISOString UTC shift). */
export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** '2026-08-17' -> '17 Aug' */
export function shortDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]}`;
}
