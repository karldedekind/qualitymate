/**
 * Working-day arithmetic for EOT claims: Monday–Friday excluding Queensland
 * state-wide public holidays (the contracts count "Working Days").
 *
 * Holiday dates are the gazetted QLD dates including substitute days when a
 * holiday falls on a weekend. Brisbane-only holidays (Ekka) are excluded.
 * Extend this table each year; addWorkingDays throws if it walks past the
 * table's coverage so a stale table fails loudly instead of silently
 * miscounting.
 */

const QLD_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025
  "2025-01-01", "2025-01-27", "2025-04-18", "2025-04-19", "2025-04-20",
  "2025-04-21", "2025-04-25", "2025-05-05", "2025-10-06", "2025-12-25",
  "2025-12-26",
  // 2026
  "2026-01-01", "2026-01-26", "2026-04-03", "2026-04-04", "2026-04-05",
  "2026-04-06", "2026-04-25", "2026-05-04", "2026-10-05", "2026-12-25",
  "2026-12-28",
  // 2027
  "2027-01-01", "2027-01-26", "2027-03-26", "2027-03-27", "2027-03-28",
  "2027-03-29", "2027-04-25", "2027-04-26", "2027-05-03", "2027-10-04",
  "2027-12-27", "2027-12-28",
  // 2028
  "2028-01-03", "2028-01-26", "2028-04-14", "2028-04-15", "2028-04-16",
  "2028-04-17", "2028-04-25", "2028-05-01", "2028-10-02", "2028-12-25",
  "2028-12-26",
  // 2029
  "2029-01-01", "2029-01-26", "2029-03-30", "2029-03-31", "2029-04-01",
  "2029-04-02", "2029-04-25", "2029-05-07", "2029-10-01", "2029-12-25",
  "2029-12-26",
  // 2030
  "2030-01-01", "2030-01-28", "2030-04-19", "2030-04-20", "2030-04-21",
  "2030-04-22", "2030-04-25", "2030-05-06", "2030-10-07", "2030-12-25",
  "2030-12-26",
]);

const TABLE_LAST_YEAR = 2030;

function parseIso(iso: string): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return d;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(iso: string): boolean {
  const d = parseIso(iso);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !QLD_HOLIDAYS.has(iso);
}

/** Advance `days` working days from `startIso` (exclusive of the start date). */
export function addWorkingDays(startIso: string, days: number): string {
  if (days < 0 || !Number.isInteger(days)) {
    throw new Error(`Working days must be a non-negative integer, got ${days}`);
  }
  const d = parseIso(startIso);
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCFullYear() > TABLE_LAST_YEAR) {
      throw new Error(
        `Working-day calculation passed ${TABLE_LAST_YEAR}; extend the QLD holiday table in working-days.ts.`,
      );
    }
    if (isWorkingDay(toIso(d))) remaining--;
  }
  return toIso(d);
}

/** Advance `days` ordinary (calendar) days from `startIso` — for contracts whose
 * day basis is ordinary days rather than working days. */
export function addOrdinaryDays(startIso: string, days: number): string {
  if (days < 0 || !Number.isInteger(days)) {
    throw new Error(`Ordinary days must be a non-negative integer, got ${days}`);
  }
  const d = parseIso(startIso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Count working days after `startIso`, up to and including `endIso`. */
export function workingDaysBetween(startIso: string, endIso: string): number {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (end < start) throw new Error("endIso is before startIso");
  if (end.getUTCFullYear() > TABLE_LAST_YEAR) {
    throw new Error(
      `Working-day calculation passed ${TABLE_LAST_YEAR}; extend the QLD holiday table in working-days.ts.`,
    );
  }
  let count = 0;
  const d = new Date(start);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(toIso(d))) count++;
  }
  return count;
}
