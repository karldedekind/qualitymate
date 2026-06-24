import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  correctiveActions,
  incidents,
  meetings,
  type MeetingAttendee,
  type MeetingMinutes,
  type MeetingPack,
  type MeetingSignoff,
} from "@/db/schema";
import {
  draftMeetingMinutes,
  draftMeetingPack,
  isConfigured as isAiConfigured,
  type Transport,
} from "@/lib/ai";
import { getBranding } from "@/lib/branding";
import { buildIcs } from "@/lib/ics";
import { renderMinutesPdf } from "@/lib/meetings-pdf";
import { get, KNOWN_KEYS, set } from "@/lib/settings";
import { isConfigured as smtpConfigured, sendMail } from "@/lib/smtp";

export type Meeting = typeof meetings.$inferSelect;

const QUARTER_MS = 90 * 24 * 60 * 60 * 1000;

function newId(): string {
  return randomBytes(12).toString("base64url");
}

export type ScheduleInput = {
  title: string;
  scheduledAt: Date;
  location?: string | null;
  attendees: MeetingAttendee[];
  createdBy: string;
};

export async function schedule(input: ScheduleInput): Promise<Meeting> {
  const [row] = await db
    .insert(meetings)
    .values({
      id: newId(),
      title: input.title.trim(),
      scheduledAt: input.scheduledAt,
      location: input.location?.trim() || null,
      attendees: input.attendees,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function findById(id: string): Promise<Meeting | null> {
  const rows = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listAll(limit = 100): Promise<Meeting[]> {
  return db.select().from(meetings).orderBy(desc(meetings.scheduledAt)).limit(limit);
}

export async function savePack(id: string, pack: MeetingPack): Promise<Meeting | null> {
  const [row] = await db
    .update(meetings)
    .set({ pack, updatedAt: new Date() })
    .where(eq(meetings.id, id))
    .returning();
  return row ?? null;
}

export type SaveResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "NOT_FOUND" | "LOCKED"; error: string };

export async function saveMinutes(
  id: string,
  minutes: MeetingMinutes,
): Promise<SaveResult<Meeting>> {
  const current = await findById(id);
  if (!current) return { ok: false, code: "NOT_FOUND", error: "Meeting not found." };
  if (current.status === "approved") {
    return {
      ok: false,
      code: "LOCKED",
      error: "Meeting is approved — minutes cannot be edited.",
    };
  }
  const [row] = await db
    .update(meetings)
    .set({ minutes, updatedAt: new Date() })
    .where(eq(meetings.id, id))
    .returning();
  return { ok: true, value: row };
}

export async function markCompleted(id: string): Promise<Meeting | null> {
  const now = new Date();
  const [row] = await db
    .update(meetings)
    .set({ status: "completed", completedAt: now, updatedAt: now })
    .where(eq(meetings.id, id))
    .returning();
  return row ?? null;
}

export async function markCancelled(id: string): Promise<Meeting | null> {
  const now = new Date();
  const [row] = await db
    .update(meetings)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(eq(meetings.id, id))
    .returning();
  return row ?? null;
}

export type GenerateResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "AI_OFF" | "AI_ERROR" | "NOT_FOUND"; error: string };

export type QuarterSnapshot = {
  incidents: { id: string; title: string; status: string; createdAt: Date }[];
  actions: { id: string; title: string; status: string; deadline: Date }[];
  since: Date;
};

export async function getQuarterSnapshot(now = new Date()): Promise<QuarterSnapshot> {
  const { inc, acts, since } = await gatherQuarterData(now);
  return { incidents: inc, actions: acts, since };
}

async function gatherQuarterData(now: Date) {
  const since = new Date(now.getTime() - QUARTER_MS);
  const inc = await db
    .select({
      id: incidents.id,
      title: incidents.title,
      status: incidents.status,
      createdAt: incidents.createdAt,
    })
    .from(incidents)
    .where(gte(incidents.createdAt, since))
    .orderBy(desc(incidents.createdAt));

  const acts = await db
    .select({
      id: correctiveActions.id,
      title: correctiveActions.title,
      status: correctiveActions.status,
      deadline: correctiveActions.deadline,
    })
    .from(correctiveActions)
    .where(gte(correctiveActions.createdAt, since))
    .orderBy(asc(correctiveActions.deadline));

  return { inc, acts, since };
}

export async function generatePack(
  id: string,
  transport?: Transport,
): Promise<GenerateResult<MeetingPack>> {
  const meeting = await findById(id);
  if (!meeting) return { ok: false, code: "NOT_FOUND", error: "Meeting not found." };
  if (!(await isAiConfigured())) {
    return { ok: false, code: "AI_OFF", error: "AI not configured." };
  }

  const { inc, acts, since } = await gatherQuarterData(new Date());
  const result = await draftMeetingPack(
    {
      meetingTitle: meeting.title,
      scheduledAt: meeting.scheduledAt.toISOString(),
      windowDescription: `${since.toISOString().slice(0, 10)} → today`,
      incidents: inc.map((i) => ({
        title: i.title,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
      })),
      actions: acts.map((a) => ({
        title: a.title,
        status: a.status,
        deadline: a.deadline.toISOString(),
      })),
    },
    transport,
  );
  if (!result.ok) {
    return { ok: false, code: "AI_ERROR", error: result.error };
  }

  const pack: MeetingPack = {
    summary: result.draft.summary,
    agenda: result.draft.agenda,
    incidents: inc.map((i) => ({ id: i.id, title: i.title, status: i.status })),
    actions: acts.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      deadline: a.deadline.toISOString(),
    })),
    trends: result.draft.trends,
    generatedBy: "ai",
    generatedAt: new Date().toISOString(),
  };
  await savePack(id, pack);
  return { ok: true, value: pack };
}

export type ManualPackInput = {
  summary: string;
  agenda: string[];
  trends: string;
};

export async function manualPack(id: string, input: ManualPackInput): Promise<MeetingPack | null> {
  const meeting = await findById(id);
  if (!meeting) return null;
  const { inc, acts } = await gatherQuarterData(new Date());
  const pack: MeetingPack = {
    summary: input.summary.trim(),
    agenda: input.agenda.map((a) => a.trim()).filter((a) => a.length > 0),
    incidents: inc.map((i) => ({ id: i.id, title: i.title, status: i.status })),
    actions: acts.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      deadline: a.deadline.toISOString(),
    })),
    trends: input.trends.trim(),
    generatedBy: "manual",
    generatedAt: new Date().toISOString(),
  };
  const saved = await savePack(id, pack);
  return saved?.pack ?? null;
}

export async function draftMinutes(
  id: string,
  rawNotes: string,
  transport?: Transport,
): Promise<GenerateResult<MeetingMinutes>> {
  const meeting = await findById(id);
  if (!meeting) return { ok: false, code: "NOT_FOUND", error: "Meeting not found." };
  if (!(await isAiConfigured())) {
    return { ok: false, code: "AI_OFF", error: "AI not configured." };
  }

  // All quarter incidents / actions. With facilitator notes these are grounding
  // only (the prompt forbids introducing anything not in the notes). With no
  // notes, they are the source the AI drafts the minutes from.
  const { inc, acts } = await gatherQuarterData(new Date());
  const register = {
    incidents: inc.map((i) => ({ title: i.title, status: i.status })),
    actions: acts.map((a) => ({
      title: a.title,
      status: a.status,
      deadline: a.deadline.toISOString(),
    })),
  };

  const result = await draftMeetingMinutes(
    {
      meetingTitle: meeting.title,
      scheduledAt: meeting.scheduledAt.toISOString(),
      attendees: meeting.attendees.map((a) => a.name),
      pack: meeting.pack
        ? {
            summary: meeting.pack.summary,
            agenda: meeting.pack.agenda,
            trends: meeting.pack.trends,
          }
        : null,
      rawNotes,
      register,
    },
    transport,
  );
  if (!result.ok) return { ok: false, code: "AI_ERROR", error: result.error };

  const minutes: MeetingMinutes = {
    attendees: result.draft.attendees,
    apologies: result.draft.apologies,
    decisions: result.draft.decisions,
    followUps: result.draft.followUps,
    notes: result.draft.notes,
    generatedBy: "ai",
    generatedAt: new Date().toISOString(),
  };
  const saved = await saveMinutes(id, minutes);
  if (!saved.ok) return { ok: false, code: "AI_ERROR", error: saved.error };
  return { ok: true, value: minutes };
}

export type ManualMinutesInput = {
  attendees: string[];
  apologies: string[];
  decisions: string[];
  followUps: string[];
  notes: string;
};

export async function manualMinutes(
  id: string,
  input: ManualMinutesInput,
): Promise<SaveResult<MeetingMinutes>> {
  const minutes: MeetingMinutes = {
    attendees: input.attendees.map((s) => s.trim()).filter((s) => s.length > 0),
    apologies: input.apologies.map((s) => s.trim()).filter((s) => s.length > 0),
    decisions: input.decisions.map((s) => s.trim()).filter((s) => s.length > 0),
    followUps: input.followUps.map((s) => s.trim()).filter((s) => s.length > 0),
    notes: input.notes.trim(),
    generatedBy: "manual",
    generatedAt: new Date().toISOString(),
  };
  const saved = await saveMinutes(id, minutes);
  if (!saved.ok) return saved;
  return { ok: true, value: saved.value.minutes ?? minutes };
}

// ---------- Signoffs + approval ----------

function attendeeKeyOf(att: MeetingAttendee): string {
  if (att.email) return att.email.trim().toLowerCase();
  return `name:${att.name.trim().toLowerCase()}`;
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type IssuedSignoff = {
  attendeeKey: string;
  name: string;
  email: string | null;
  token: string;
};

/**
 * Issue per-attendee signoff tokens. Stores sha256 of each token; returns
 * the plaintext tokens once for emailing/copy. Partial re-issue: attendees
 * who have already signed keep their signoff; only unsigned attendees get a
 * new token. This prevents accidentally wiping completed signoffs when
 * recovering a lost link for a single attendee.
 */
export async function issueSignoffTokens(id: string): Promise<{
  ok: true;
  meeting: Meeting;
  issued: IssuedSignoff[];
} | { ok: false; code: "NOT_FOUND" | "NO_MINUTES" | "LOCKED"; error: string }> {
  const m = await findById(id);
  if (!m) return { ok: false, code: "NOT_FOUND", error: "Meeting not found." };
  if (!m.minutes) return { ok: false, code: "NO_MINUTES", error: "Draft minutes first." };
  if (m.status === "approved") {
    return { ok: false, code: "LOCKED", error: "Meeting already approved." };
  }

  const signedKeys = new Set(m.signoffs.map((s) => s.attendeeKey));
  const issued: IssuedSignoff[] = [];
  // Preserve existing tokens (including those for already-signed attendees).
  const tokens: Record<string, string> = { ...m.signoffTokens };
  for (const att of m.attendees) {
    const key = attendeeKeyOf(att);
    if (signedKeys.has(key)) continue; // already signed — preserve signoff and token
    const token = newToken();
    tokens[key] = hashToken(token);
    issued.push({ attendeeKey: key, name: att.name, email: att.email ?? null, token });
  }

  const now = new Date();
  const [row] = await db
    .update(meetings)
    .set({
      signoffTokens: tokens,
      signoffIssuedAt: now,
      updatedAt: now,
    })
    .where(eq(meetings.id, id))
    .returning();
  return { ok: true, meeting: row, issued };
}

function constantEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export async function findSignoffTarget(
  id: string,
  token: string,
): Promise<{ meeting: Meeting; attendeeKey: string; attendee: MeetingAttendee } | null> {
  const m = await findById(id);
  if (!m) return null;
  const tokenHash = hashToken(token);
  for (const att of m.attendees) {
    const key = attendeeKeyOf(att);
    const stored = m.signoffTokens[key];
    if (stored && constantEqualHex(stored, tokenHash)) {
      return { meeting: m, attendeeKey: key, attendee: att };
    }
  }
  return null;
}

export type SignoffResult =
  | { ok: true; meeting: Meeting; alreadySigned: boolean }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID_TOKEN" | "NO_MINUTES" | "LOCKED";
      error: string;
    };

export async function recordSignoff(
  meetingId: string,
  token: string,
  ip: string | null,
): Promise<SignoffResult> {
  const target = await findSignoffTarget(meetingId, token);
  if (!target) return { ok: false, code: "INVALID_TOKEN", error: "Invalid or expired link." };
  const { meeting, attendeeKey, attendee } = target;
  if (!meeting.minutes) {
    return { ok: false, code: "NO_MINUTES", error: "Minutes not drafted yet." };
  }
  if (meeting.status === "approved") {
    return { ok: false, code: "LOCKED", error: "Meeting already approved." };
  }

  const existing = meeting.signoffs.find((s) => s.attendeeKey === attendeeKey);
  if (existing) {
    return { ok: true, meeting, alreadySigned: true };
  }
  const entry: MeetingSignoff = {
    attendeeKey,
    name: attendee.name,
    email: attendee.email ?? null,
    signedAt: new Date().toISOString(),
    ip,
  };
  const next = [...meeting.signoffs, entry];
  const [row] = await db
    .update(meetings)
    .set({ signoffs: next, updatedAt: new Date() })
    .where(eq(meetings.id, meetingId))
    .returning();
  return { ok: true, meeting: row, alreadySigned: false };
}

export function allSigned(meeting: Meeting): boolean {
  if (meeting.attendees.length === 0) return false;
  const signed = new Set(meeting.signoffs.map((s) => s.attendeeKey));
  return meeting.attendees.every((att) => signed.has(attendeeKeyOf(att)));
}

export async function getDirectorUserId(): Promise<string | null> {
  return get(KNOWN_KEYS.ISO_MANAGEMENT_REP);
}

// ---------- Distribution list ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a newline/comma-separated list of email addresses. Lowercases, trims,
 * de-duplicates, and discards anything that does not look like an email.
 */
export function parseDistributionList(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const trimmed = raw.trim();
    // Accept "Name <email>" format — extract just the email part.
    const angleMatch = /^[^<]*<([^>]+)>$/.exec(trimmed);
    const e = (angleMatch ? angleMatch[1]!.trim() : trimmed).toLowerCase();
    if (!e || !EMAIL_RE.test(e)) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

export async function getDefaultDistributionList(): Promise<string[]> {
  const raw = await get(KNOWN_KEYS.MEETING_DISTRIBUTION_LIST);
  return parseDistributionList(raw);
}

export async function setDefaultDistributionList(
  list: string[],
  actor?: { id: string },
): Promise<void> {
  const cleaned = parseDistributionList(list.join("\n"));
  await set(KNOWN_KEYS.MEETING_DISTRIBUTION_LIST, cleaned.join("\n") || null, { actor });
}

export async function setMeetingDistributionList(
  id: string,
  list: string[],
): Promise<Meeting | null> {
  const cleaned = parseDistributionList(list.join("\n"));
  const [row] = await db
    .update(meetings)
    .set({ distributionList: cleaned, updatedAt: new Date() })
    .where(eq(meetings.id, id))
    .returning();
  return row ?? null;
}

/**
 * Merge attendee emails + per-meeting distribution + default distribution.
 * Lowercased, deduped, in stable insertion order (attendees first).
 */
export async function resolveRecipients(meeting: Meeting): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (e: string | null | undefined) => {
    if (!e) return;
    const v = e.trim().toLowerCase();
    if (!v || !EMAIL_RE.test(v) || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  for (const a of meeting.attendees) push(a.email ?? null);
  for (const e of meeting.distributionList) push(e);
  const def = await getDefaultDistributionList();
  for (const e of def) push(e);
  return out;
}

export type DistributeResult =
  | {
      ok: true;
      messageId: string;
      recipients: string[];
      pdfBytes: number;
      skipped: false;
    }
  | { ok: true; skipped: true; reason: "NO_RECIPIENTS" | "SMTP_OFF" }
  | { ok: false; code: "NOT_FOUND" | "NOT_APPROVED" | "SEND_FAILED"; error: string };

/**
 * Email approved minutes PDF to attendees + distribution list. Caller is
 * responsible for audit-logging — failures here MUST NOT roll back approval.
 */
export async function distributeMinutes(id: string): Promise<DistributeResult> {
  const meeting = await findById(id);
  if (!meeting) return { ok: false, code: "NOT_FOUND", error: "Meeting not found." };
  if (meeting.status !== "approved") {
    return { ok: false, code: "NOT_APPROVED", error: "Meeting is not approved." };
  }

  const recipients = await resolveRecipients(meeting);
  if (recipients.length === 0) {
    return { ok: true, skipped: true, reason: "NO_RECIPIENTS" };
  }
  if (!(await smtpConfigured())) {
    return { ok: true, skipped: true, reason: "SMTP_OFF" };
  }

  const branding = await getBranding();
  const pdf = await renderMinutesPdf(meeting, branding);

  const subject = `Approved minutes — ${meeting.title}`;
  const text =
    `The minutes for "${meeting.title}" have been approved.\n\n` +
    `Scheduled: ${meeting.scheduledAt.toISOString()}\n` +
    (meeting.location ? `Location: ${meeting.location}\n` : "") +
    `\nThe approved minutes PDF is attached.`;

  const result = await sendMail({
    to: recipients,
    subject,
    text,
    attachments: [
      {
        filename: `minutes-${meeting.id}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });

  if (!result.ok) {
    return { ok: false, code: "SEND_FAILED", error: result.error };
  }

  await db
    .update(meetings)
    .set({ distributedAt: new Date(), updatedAt: new Date() })
    .where(eq(meetings.id, id));

  return {
    ok: true,
    skipped: false,
    messageId: result.messageId,
    recipients,
    pdfBytes: pdf.length,
  };
}

// ---------- Signoff notifications ----------

export type SignoffNotifyResult =
  | { ok: true; sent: number; skipped: false }
  | { ok: true; skipped: true; reason: "NO_RECIPIENTS" | "SMTP_OFF" }
  | { ok: false; code: "SEND_FAILED"; error: string };

/** Email each unsigned attendee their personal signoff link. */
export async function notifySignoffs(
  meeting: Meeting,
  issued: IssuedSignoff[],
  appUrl: string,
): Promise<SignoffNotifyResult> {
  const eligible = issued.filter((i) => i.email);
  if (eligible.length === 0) {
    return { ok: true, skipped: true, reason: "NO_RECIPIENTS" };
  }
  if (!(await smtpConfigured())) {
    return { ok: true, skipped: true, reason: "SMTP_OFF" };
  }

  let sent = 0;
  for (const entry of eligible) {
    const url = `${appUrl}/meetings/sign/${meeting.id}?token=${entry.token}`;
    const result = await sendMail({
      to: entry.email!,
      subject: `Please sign off on minutes — ${meeting.title}`,
      text:
        `Hi ${entry.name},\n\n` +
        `You are requested to sign off on the minutes for "${meeting.title}".\n\n` +
        `Review and sign off here:\n${url}\n\n` +
        `This link is personal — do not share it.`,
    });
    if (!result.ok) {
      return { ok: false, code: "SEND_FAILED", error: result.error };
    }
    sent++;
  }
  return { ok: true, skipped: false, sent };
}

// ---------- Schedule notifications ----------

/**
 * Build an .ics body for this meeting. Default 1-hour duration when no
 * explicit end is recorded.
 */
export function buildScheduleIcs(meeting: Meeting, organizerEmail: string | null): string {
  const start = meeting.scheduledAt;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return buildIcs({
    uid: `meeting-${meeting.id}@qualitymate`,
    start,
    end,
    summary: meeting.title,
    location: meeting.location ?? null,
    organizer: organizerEmail ? { email: organizerEmail } : null,
    attendees: meeting.attendees
      .filter((a) => a.email)
      .map((a) => ({ name: a.name, email: a.email! })),
  });
}

export type ScheduleNotifyResult =
  | { ok: true; recipients: string[]; skipped: false }
  | { ok: true; skipped: true; reason: "NO_RECIPIENTS" | "SMTP_OFF" }
  | { ok: false; code: "NOT_FOUND" | "SEND_FAILED"; error: string };

/** Send schedule-notification email to attendees with .ics attached. */
export async function notifySchedule(
  id: string,
  organizerEmail: string | null,
): Promise<ScheduleNotifyResult> {
  const meeting = await findById(id);
  if (!meeting) return { ok: false, code: "NOT_FOUND", error: "Meeting not found." };
  const recipients = meeting.attendees
    .map((a) => a.email?.trim().toLowerCase())
    .filter((e): e is string => !!e && EMAIL_RE.test(e));
  const dedup = Array.from(new Set(recipients));
  if (dedup.length === 0) {
    return { ok: true, skipped: true, reason: "NO_RECIPIENTS" };
  }
  if (!(await smtpConfigured())) {
    return { ok: true, skipped: true, reason: "SMTP_OFF" };
  }

  const ics = buildScheduleIcs(meeting, organizerEmail);
  const result = await sendMail({
    to: dedup,
    subject: `Meeting: ${meeting.title}`,
    text:
      `You're invited to "${meeting.title}".\n\n` +
      `When: ${meeting.scheduledAt.toISOString()}\n` +
      (meeting.location ? `Where: ${meeting.location}\n` : "") +
      `\nA calendar invite is attached.`,
    ics,
  });

  if (!result.ok) {
    return { ok: false, code: "SEND_FAILED", error: result.error };
  }
  return { ok: true, skipped: false, recipients: dedup };
}

export type ApproveResult =
  | { ok: true; meeting: Meeting }
  | {
      ok: false;
      code: "NOT_FOUND" | "NOT_DIRECTOR" | "MISSING_SIGNOFFS" | "ALREADY_APPROVED" | "NO_MINUTES";
      error: string;
    };

export async function approve(id: string, actorUserId: string): Promise<ApproveResult> {
  const m = await findById(id);
  if (!m) return { ok: false, code: "NOT_FOUND", error: "Meeting not found." };
  if (m.status === "approved") {
    return { ok: false, code: "ALREADY_APPROVED", error: "Meeting already approved." };
  }
  if (!m.minutes) return { ok: false, code: "NO_MINUTES", error: "Minutes not drafted." };

  const directorId = await getDirectorUserId();
  if (!directorId || directorId !== actorUserId) {
    return {
      ok: false,
      code: "NOT_DIRECTOR",
      error: "Only the management representative can approve meetings.",
    };
  }

  if (!allSigned(m)) {
    return {
      ok: false,
      code: "MISSING_SIGNOFFS",
      error: "All attendees must sign off before approval.",
    };
  }

  const now = new Date();
  const [row] = await db
    .update(meetings)
    .set({
      status: "approved",
      approvedAt: now,
      approvedBy: actorUserId,
      updatedAt: now,
    })
    .where(eq(meetings.id, id))
    .returning();
  return { ok: true, meeting: row };
}

