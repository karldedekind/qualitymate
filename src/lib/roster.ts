import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { siteAttendances } from "@/db/schema";
import { get, set } from "@/lib/settings";

export type RosterRow = typeof siteAttendances.$inferSelect;

export type RosterFilters = {
  trade?: string | null;
  company?: string | null;
};

export function dayBoundsUtc(dateIso: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!m) return null;
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function todayIsoUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function listForJob(jobId: string, dateIso: string): Promise<RosterRow[]> {
  const bounds = dayBoundsUtc(dateIso);
  if (!bounds) return [];
  return db
    .select()
    .from(siteAttendances)
    .where(
      and(
        eq(siteAttendances.jobId, jobId),
        gte(siteAttendances.signedInAt, bounds.start),
        lt(siteAttendances.signedInAt, bounds.end),
      ),
    )
    .orderBy(asc(siteAttendances.signedInAt));
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function filterRows(rows: RosterRow[], filters: RosterFilters): RosterRow[] {
  const trade = norm(filters.trade);
  const company = norm(filters.company);
  return rows.filter((r) => {
    if (trade && norm(r.trade) !== trade) return false;
    if (company && !norm(r.companyName).includes(company)) return false;
    return true;
  });
}

export function isCurrentlyOnSite(row: RosterRow, now: Date = new Date()): boolean {
  const t = now.getTime();
  return row.signedInAt.getTime() <= t && t <= row.plannedDepartureAt.getTime();
}

export function countCurrentlyOnSite(rows: RosterRow[], now: Date = new Date()): number {
  return rows.reduce((n, r) => n + (isCurrentlyOnSite(r, now) ? 1 : 0), 0);
}

export type WhiteCardStatus = "valid" | "expires_today" | "expired";

export function whiteCardStatus(expiry: string, now: Date = new Date()): WhiteCardStatus {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiry);
  if (!m) return "expired";
  const exp = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (exp.getTime() < today.getTime()) return "expired";
  if (exp.getTime() === today.getTime()) return "expires_today";
  return "valid";
}

const TOKEN_KEY_PREFIX = "roster.token.";
const TOKEN_LENGTH_BYTES = 24;

function tokenSettingKey(jobId: string): string {
  return `${TOKEN_KEY_PREFIX}${jobId}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function rotateSupervisorToken(
  jobId: string,
  actor: { id: string },
): Promise<{ token: string }> {
  const token = randomBytes(TOKEN_LENGTH_BYTES).toString("base64url");
  await set(tokenSettingKey(jobId), hashToken(token), { actor });
  return { token };
}

export async function verifySupervisorToken(jobId: string, token: string): Promise<boolean> {
  if (!token) return false;
  const stored = await get(tokenSettingKey(jobId));
  if (!stored) return false;
  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(hashToken(token), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function hasSupervisorToken(jobId: string): Promise<boolean> {
  const stored = await get(tokenSettingKey(jobId));
  return !!stored;
}

function csvEscape(value: string | null | undefined): string {
  const str = value ?? "";
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const CSV_TIME_ZONE = "Australia/Brisbane";

function formatIsoWithOffset(d: Date, timeZone: string = CSV_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const offsetRaw = get("timeZoneName");
  const m = /GMT([+\-])(\d{1,2})(?::?(\d{2}))?/.exec(offsetRaw);
  const offset = m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}` : "+00:00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
}

export function toCsv(rows: RosterRow[], now: Date = new Date()): string {
  const header = [
    "signed_in_at",
    "full_name",
    "company",
    "trade",
    "mobile",
    "planned_departure_at",
    "white_card_number",
    "white_card_expiry",
    "white_card_status",
  ];
  const lines: string[] = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        formatIsoWithOffset(r.signedInAt),
        r.fullName,
        r.companyName,
        r.trade,
        r.mobile,
        formatIsoWithOffset(r.plannedDepartureAt),
        r.whiteCardNumber,
        r.whiteCardExpiry,
        whiteCardStatus(r.whiteCardExpiry, now),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
