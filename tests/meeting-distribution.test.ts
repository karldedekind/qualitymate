import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import nodemailer, { type Transporter } from "nodemailer";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

type SentMail = {
  to: string | string[];
  subject: string;
  attachments?: { filename: string; content: unknown; contentType?: string }[];
  text?: string;
};

function captureTransport(): { transport: Transporter; sent: SentMail[] } {
  const sent: SentMail[] = [];
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const original = transport.sendMail.bind(transport);
  transport.sendMail = (async (mail: Parameters<typeof original>[0]) => {
    const rawAttachments = (mail.attachments ?? []) as { filename?: string; content?: unknown; contentType?: string }[];
    const snapshotAttachments = rawAttachments.map((a) => {
      let snapContent: unknown = a.content;
      if (Buffer.isBuffer(a.content)) snapContent = Buffer.from(a.content);
      else if (a.content instanceof Uint8Array) snapContent = Buffer.from(a.content);
      return { filename: a.filename ?? "", content: snapContent, contentType: a.contentType };
    });
    sent.push({
      to: mail.to as string | string[],
      subject: String(mail.subject ?? ""),
      attachments: snapshotAttachments as SentMail["attachments"],
      text: typeof mail.text === "string" ? mail.text : undefined,
    });
    return original(mail);
  }) as typeof original;
  return { transport, sent };
}

beforeAll(async () => {
  process.env.INSTALL_PASSPHRASE = "test-install-passphrase-32-bytes-min-aaaaa";
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "meetings" CASCADE`);
  await db.execute(sql`TRUNCATE "settings" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
  const { _setTransportForTests } = await import("@/lib/smtp");
  _setTransportForTests(null);
});

async function createAdmin(email: string) {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: email } });
  await db.update(user).set({ role: "admin", emailVerified: true }).where(eq(user.email, email));
  const rows = await db.select().from(user).where(eq(user.email, email));
  return rows[0]!;
}

async function smtpOn() {
  const { set } = await import("@/lib/settings");
  await set("smtp.host", "test");
  await set("smtp.port", "587");
  await set("smtp.from_email", "noreply@example.com");
}

async function approvedMeeting(opts?: {
  attendees?: { name: string; email: string | null }[];
  perMeetingDist?: string[];
  defaultDist?: string[];
}) {
  const admin = await createAdmin("director@example.com");
  const {
    schedule,
    manualMinutes,
    issueSignoffTokens,
    recordSignoff,
    approve,
    setDefaultDistributionList,
    setMeetingDistributionList,
  } = await import("@/lib/meetings");
  const { set, KNOWN_KEYS } = await import("@/lib/settings");

  const attendees = opts?.attendees ?? [
    { name: "Alice", email: "alice@example.com" },
    { name: "Bob", email: "bob@example.com" },
  ];

  const meeting = await schedule({
    title: "Q Review",
    scheduledAt: new Date("2026-06-01T10:00:00Z"),
    attendees: attendees.map((a) => ({ userId: null, name: a.name, email: a.email })),
    createdBy: admin.id,
  });
  await manualMinutes(meeting.id, {
    attendees: attendees.map((a) => a.name),
    apologies: [],
    decisions: ["Decision A"],
    followUps: [],
    notes: "Notes",
  });
  await set(KNOWN_KEYS.ISO_MANAGEMENT_REP, admin.id);
  if (opts?.defaultDist) await setDefaultDistributionList(opts.defaultDist, { id: admin.id });
  if (opts?.perMeetingDist) await setMeetingDistributionList(meeting.id, opts.perMeetingDist);

  const issued = await issueSignoffTokens(meeting.id);
  if (!issued.ok) throw new Error("issue failed");
  for (const i of issued.issued) await recordSignoff(meeting.id, i.token, "1.1.1.1");
  const r = await approve(meeting.id, admin.id);
  if (!r.ok) throw new Error("approve failed");
  return { admin, meetingId: meeting.id };
}

describe("parseDistributionList — input hardening", () => {
  it("dedupes, lowercases, trims, drops invalid", async () => {
    const { parseDistributionList } = await import("@/lib/meetings");
    const out = parseDistributionList(
      "  Alice@Example.com\nbob@example.com\nALICE@example.com\nnot-an-email\n,\n,jane@example.com\n",
    );
    expect(out).toEqual(["alice@example.com", "bob@example.com", "jane@example.com"]);
  });

  it("accepts Name <email> format", async () => {
    const { parseDistributionList } = await import("@/lib/meetings");
    const out = parseDistributionList("Karl Dedekind <karl@example.com>\nplain@example.com");
    expect(out).toEqual(["karl@example.com", "plain@example.com"]);
  });
});

describe("resolveRecipients — merge attendees + per-meeting + default", () => {
  it("dedupes across all three sources, preserves attendees-first order", async () => {
    const { findById, resolveRecipients } = await import("@/lib/meetings");
    const { meetingId } = await approvedMeeting({
      perMeetingDist: ["alice@example.com", "carol@example.com"],
      defaultDist: ["BOB@example.com", "dave@example.com"],
    });
    const m = await findById(meetingId);
    const merged = await resolveRecipients(m!);
    expect(merged).toEqual([
      "alice@example.com",
      "bob@example.com",
      "carol@example.com",
      "dave@example.com",
    ]);
  });
});

describe("distributeMinutes — email shape + attachment", () => {
  it("emails approved minutes with PDF attachment to merged recipient list", async () => {
    const { _setTransportForTests } = await import("@/lib/smtp");
    const { transport, sent } = captureTransport();
    _setTransportForTests(transport);
    await smtpOn();

    const { distributeMinutes } = await import("@/lib/meetings");
    const { meetingId } = await approvedMeeting({
      perMeetingDist: ["board@example.com"],
    });

    const r = await distributeMinutes(meetingId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("skipped" in r && r.skipped).toBe(false);
    if ("skipped" in r && r.skipped) return;

    expect(r.recipients).toEqual([
      "alice@example.com",
      "bob@example.com",
      "board@example.com",
    ]);
    expect(r.pdfBytes).toBeGreaterThan(500); // basic sanity — real PDF, not empty

    expect(sent).toHaveLength(1);
    const mail = sent[0]!;
    expect(mail.subject).toContain("Q Review");
    expect(mail.to).toEqual([
      "alice@example.com",
      "bob@example.com",
      "board@example.com",
    ]);
    expect(mail.attachments).toHaveLength(1);
    const att = mail.attachments![0]!;
    expect(att.filename).toMatch(/\.pdf$/);
    expect(att.contentType).toBe("application/pdf");
    const content = att.content as Buffer | Uint8Array;
    expect(Buffer.isBuffer(content) || content instanceof Uint8Array).toBe(true);
    // PDF magic header
    expect(Buffer.from(content.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("skips when SMTP is not configured but reports ok", async () => {
    const { distributeMinutes } = await import("@/lib/meetings");
    const { meetingId } = await approvedMeeting();
    const r = await distributeMinutes(meetingId);
    expect(r.ok).toBe(true);
    if (r.ok && "skipped" in r) {
      expect(r.skipped).toBe(true);
      if (r.skipped) expect(r.reason).toBe("SMTP_OFF");
    }
  });

  it("rejects when meeting is not approved", async () => {
    await smtpOn();
    const { schedule, manualMinutes, distributeMinutes } = await import("@/lib/meetings");
    const admin = await createAdmin("ops@example.com");
    const m = await schedule({
      title: "Pending",
      scheduledAt: new Date("2026-06-01T10:00:00Z"),
      attendees: [{ userId: null, name: "Alice", email: "alice@example.com" }],
      createdBy: admin.id,
    });
    await manualMinutes(m.id, {
      attendees: ["Alice"],
      apologies: [],
      decisions: [],
      followUps: [],
      notes: "",
    });
    const r = await distributeMinutes(m.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_APPROVED");
  });

  it("send failure does NOT roll back approval — meeting stays approved", async () => {
    const { _setTransportForTests } = await import("@/lib/smtp");
    const failing = nodemailer.createTransport({ jsonTransport: true });
    failing.sendMail = (async () => {
      throw new Error("connection refused");
    }) as typeof failing.sendMail;
    _setTransportForTests(failing);
    await smtpOn();

    const { distributeMinutes, findById } = await import("@/lib/meetings");
    const { meetingId } = await approvedMeeting();

    const r = await distributeMinutes(meetingId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("SEND_FAILED");

    const m = await findById(meetingId);
    expect(m!.status).toBe("approved");
    expect(m!.distributedAt).toBeNull();
  });

  it("marks distributedAt on success", async () => {
    const { _setTransportForTests } = await import("@/lib/smtp");
    const { transport } = captureTransport();
    _setTransportForTests(transport);
    await smtpOn();

    const { distributeMinutes, findById } = await import("@/lib/meetings");
    const { meetingId } = await approvedMeeting();
    const r = await distributeMinutes(meetingId);
    expect(r.ok).toBe(true);
    const m = await findById(meetingId);
    expect(m!.distributedAt).not.toBeNull();
  });
});

describe("notifySchedule — .ics attached", () => {
  it("attaches a text/calendar invite.ics to attendees with email", async () => {
    const { _setTransportForTests } = await import("@/lib/smtp");
    const { transport, sent } = captureTransport();
    _setTransportForTests(transport);
    await smtpOn();

    const { schedule, notifySchedule } = await import("@/lib/meetings");
    const admin = await createAdmin("director@example.com");
    const m = await schedule({
      title: "Quarterly",
      scheduledAt: new Date("2026-06-01T10:00:00Z"),
      location: "Boardroom",
      attendees: [
        { userId: null, name: "Alice", email: "alice@example.com" },
        { userId: null, name: "Bob", email: null },
      ],
      createdBy: admin.id,
    });

    const r = await notifySchedule(m.id, "director@example.com");
    expect(r.ok).toBe(true);
    if (r.ok && "skipped" in r && r.skipped) throw new Error("unexpected skip");

    expect(sent).toHaveLength(1);
    const mail = sent[0]!;
    expect(mail.to).toEqual(["alice@example.com"]);
    expect(mail.attachments).toHaveLength(1);
    const att = mail.attachments![0]!;
    expect(att.filename).toBe("invite.ics");
    expect(att.contentType).toContain("text/calendar");
    const body = String(att.content);
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("DTSTART:20260601T100000Z");
    expect(body).toContain("SUMMARY:Quarterly");
    expect(body).toContain("LOCATION:Boardroom");
  });
});
