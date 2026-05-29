import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteAttendances } from "@/db/schema";
import { uploadsRoot } from "@/lib/uploads";
import { get, set } from "@/lib/settings";
import { consume, _resetForTests as _resetRateLimits } from "@/lib/rate-limit";

export type SiteAttendance = typeof siteAttendances.$inferSelect;

function newId(): string {
  return randomBytes(12).toString("base64url");
}

export const QLD_TRADES = [
  "Carpenter",
  "Concreter",
  "Electrician",
  "Plumber",
  "Painter",
  "Plasterer",
  "Tiler",
  "Bricklayer",
  "Roofer",
  "Glazier",
  "Steel fixer",
  "Welder",
  "Crane operator",
  "Excavator operator",
  "Earthworks / Civil",
  "Scaffolder",
  "Demolition",
  "Waterproofer",
  "Landscaper",
  "Surveyor",
  "Site supervisor",
  "Labourer",
  "Truck driver",
  "Other",
] as const;

export type QldTrade = (typeof QLD_TRADES)[number];

export const DECLARATION_KEYS = [
  "decl_whsmp",
  "decl_emergency",
  "decl_fit_for_work",
  "decl_emergency_action",
  "decl_hazards",
  "decl_ppe",
  "decl_competent",
  "decl_site_rules",
] as const;

export type DeclarationKey = (typeof DECLARATION_KEYS)[number];

export const DECLARATION_DEFAULTS: Record<DeclarationKey, string> = {
  decl_whsmp: "I have read the WHSMP.",
  decl_emergency: "I am aware of the emergency details.",
  decl_fit_for_work: "I am fit for work today.",
  decl_emergency_action:
    "I know what to do in an emergency and where the emergency equipment is.",
  decl_hazards:
    "I am aware of the site hazards and will notify the supervisor if any new hazards are identified.",
  decl_ppe: "I have the right PPE I need for my work.",
  decl_competent: "I am trained and competent for the work I will be doing.",
  decl_site_rules:
    "I will follow site rules and I will complete a SWMS for any high-risk construction work.",
};

const DECL_SETTING_PREFIX = "checkin.declaration.";

function declSettingKey(key: DeclarationKey): string {
  return `${DECL_SETTING_PREFIX}${key}`;
}

export async function getDeclarations(): Promise<Record<DeclarationKey, string>> {
  const out = { ...DECLARATION_DEFAULTS };
  await Promise.all(
    DECLARATION_KEYS.map(async (k) => {
      const stored = await get(declSettingKey(k));
      if (stored && stored.trim().length > 0) out[k] = stored;
    }),
  );
  return out;
}

export async function setDeclarations(
  values: Partial<Record<DeclarationKey, string>>,
  actor: { id: string },
): Promise<void> {
  for (const k of DECLARATION_KEYS) {
    const v = values[k];
    if (typeof v === "string") {
      await set(declSettingKey(k), v.trim(), { actor });
    }
  }
}

export const CHECKIN_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

export type CheckInInput = {
  jobId: string;
  fullName: string;
  mobile: string;
  companyName: string;
  trade: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  whiteCardNumber: string;
  whiteCardExpiry: string;
  declWhsmp: boolean;
  declEmergency: boolean;
  declFitForWork: boolean;
  declEmergencyAction: boolean;
  declHazards: boolean;
  declPpe: boolean;
  declCompetent: boolean;
  declSiteRules: boolean;
  consent: boolean;
  signatureDataUrl: string;
  plannedDepartureAt: Date;
  ip?: string | null;
  userAgent?: string | null;
};

export type SubmitErrorCode =
  | "WHITE_CARD_EXPIRED"
  | "DECLARATION_MISSING"
  | "CONSENT_MISSING"
  | "SIGNATURE_MISSING"
  | "RATE_LIMITED"
  | "INVALID";

export type SubmitResult =
  | { ok: true; attendance: SiteAttendance }
  | { ok: false; code: SubmitErrorCode; message: string; field?: string };

function todayUtcMidnight(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parseExpiry(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

async function persistSignature(attendanceId: string, dataUrl: string): Promise<string> {
  const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Signature must be a PNG or JPEG data URL.");
  const ext = match[1] === "jpeg" ? "jpg" : "png";
  const buf = Buffer.from(match[2], "base64");
  const scope = `site_attendance/${attendanceId}`;
  const dir = join(uploadsRoot(), scope);
  await mkdir(dir, { recursive: true });
  const filename = `signature.${ext}`;
  await writeFile(join(dir, filename), buf);
  return `${scope}/${filename}`;
}

function declarationFlag(input: CheckInInput, key: DeclarationKey): boolean {
  switch (key) {
    case "decl_whsmp": return input.declWhsmp;
    case "decl_emergency": return input.declEmergency;
    case "decl_fit_for_work": return input.declFitForWork;
    case "decl_emergency_action": return input.declEmergencyAction;
    case "decl_hazards": return input.declHazards;
    case "decl_ppe": return input.declPpe;
    case "decl_competent": return input.declCompetent;
    case "decl_site_rules": return input.declSiteRules;
  }
}

export async function submit(input: CheckInInput, now: Date = new Date()): Promise<SubmitResult> {
  if (!input.signatureDataUrl || input.signatureDataUrl.trim().length === 0) {
    return { ok: false, code: "SIGNATURE_MISSING", message: "Signature is required." };
  }

  if (!input.consent) {
    return { ok: false, code: "CONSENT_MISSING", message: "Privacy consent is required." };
  }

  for (const k of DECLARATION_KEYS) {
    if (!declarationFlag(input, k)) {
      return {
        ok: false,
        code: "DECLARATION_MISSING",
        message: "All declarations must be acknowledged.",
        field: k,
      };
    }
  }

  const expiry = parseExpiry(input.whiteCardExpiry);
  if (!expiry) {
    return { ok: false, code: "INVALID", message: "White card expiry is invalid.", field: "whiteCardExpiry" };
  }
  if (expiry.getTime() < todayUtcMidnight(now).getTime()) {
    return {
      ok: false,
      code: "WHITE_CARD_EXPIRED",
      message: "White card has expired. You cannot sign in with an expired card.",
      field: "whiteCardExpiry",
    };
  }

  if (input.ip && input.ip.length > 0) {
    const limit = consume(`checkin:ip:${input.ip}`, {
      limit: CHECKIN_RATE_LIMIT.limit,
      windowMs: CHECKIN_RATE_LIMIT.windowMs,
      now: now.getTime(),
    });
    if (!limit.ok) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        message: "Too many sign-ins from this device. Please try again later.",
      };
    }
  }

  const id = newId();
  const signaturePath = await persistSignature(id, input.signatureDataUrl);

  const [row] = await db
    .insert(siteAttendances)
    .values({
      id,
      jobId: input.jobId,
      fullName: input.fullName.trim(),
      mobile: input.mobile.trim(),
      companyName: input.companyName.trim(),
      trade: input.trade.trim(),
      emergencyContactName: input.emergencyContactName.trim(),
      emergencyContactPhone: input.emergencyContactPhone.trim(),
      whiteCardNumber: input.whiteCardNumber.trim(),
      whiteCardExpiry: input.whiteCardExpiry,
      declWhsmp: input.declWhsmp,
      declEmergency: input.declEmergency,
      declFitForWork: input.declFitForWork,
      declEmergencyAction: input.declEmergencyAction,
      declHazards: input.declHazards,
      declPpe: input.declPpe,
      declCompetent: input.declCompetent,
      declSiteRules: input.declSiteRules,
      consent: input.consent,
      signaturePath,
      plannedDepartureAt: input.plannedDepartureAt,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning();
  return { ok: true, attendance: row };
}

export async function findAttendanceById(id: string): Promise<SiteAttendance | null> {
  const rows = await db.select().from(siteAttendances).where(eq(siteAttendances.id, id)).limit(1);
  return rows[0] ?? null;
}

export function _resetCheckinRateLimitsForTests(): void {
  _resetRateLimits();
}
