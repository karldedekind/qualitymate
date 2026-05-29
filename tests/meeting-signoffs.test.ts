import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

async function createUser(email: string, role: "admin" | "site_staff" = "admin") {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: email } });
  await db.update(user).set({ role, emailVerified: true }).where(eq(user.email, email));
  const rows = await db.select().from(user).where(eq(user.email, email));
  return rows[0]!;
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
});

async function bootstrap(opts?: { withMinutes?: boolean; withDirector?: boolean }) {
  const { schedule, manualMinutes } = await import("@/lib/meetings");
  const { set, KNOWN_KEYS } = await import("@/lib/settings");
  const admin = await createUser("director@example.com", "admin");
  const meeting = await schedule({
    title: "Q Review",
    scheduledAt: new Date("2026-06-01T10:00:00Z"),
    attendees: [
      { userId: null, name: "Alice", email: "alice@example.com" },
      { userId: null, name: "Bob", email: "bob@example.com" },
    ],
    createdBy: admin.id,
  });
  if (opts?.withMinutes ?? true) {
    await manualMinutes(meeting.id, {
      attendees: ["Alice", "Bob"],
      apologies: [],
      decisions: ["Decision A"],
      followUps: [],
      notes: "Notes",
    });
  }
  if (opts?.withDirector ?? true) {
    await set(KNOWN_KEYS.ISO_MANAGEMENT_REP, admin.id);
  }
  return { admin, meetingId: meeting.id };
}

describe("issueSignoffTokens — preconditions", () => {
  it("requires drafted minutes", async () => {
    const { issueSignoffTokens } = await import("@/lib/meetings");
    const { meetingId } = await bootstrap({ withMinutes: false });
    const r = await issueSignoffTokens(meetingId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NO_MINUTES");
  });

  it("issues one token per attendee and stores hashes (not plaintext)", async () => {
    const { issueSignoffTokens, findById } = await import("@/lib/meetings");
    const { meetingId } = await bootstrap();
    const r = await issueSignoffTokens(meetingId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issued).toHaveLength(2);

    const m = await findById(meetingId);
    expect(Object.keys(m!.signoffTokens)).toHaveLength(2);
    // tokens are hex-encoded sha256 (64 chars)
    for (const v of Object.values(m!.signoffTokens)) {
      expect(v).toMatch(/^[0-9a-f]{64}$/);
    }
    // Plaintext returned in `issued` differs from stored hash
    for (const i of r.issued) {
      expect(Object.values(m!.signoffTokens)).not.toContain(i.token);
    }
  });
});

describe("recordSignoff — state machine", () => {
  it("rejects invalid token, accepts valid token, idempotent re-sign", async () => {
    const { issueSignoffTokens, recordSignoff, findById } = await import("@/lib/meetings");
    const { meetingId } = await bootstrap();
    const issued = await issueSignoffTokens(meetingId);
    if (!issued.ok) throw new Error("issue failed");

    const bad = await recordSignoff(meetingId, "nope-not-a-token", "1.2.3.4");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("INVALID_TOKEN");

    const aliceToken = issued.issued.find((i) => i.email === "alice@example.com")!.token;
    const first = await recordSignoff(meetingId, aliceToken, "10.0.0.1");
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.alreadySigned).toBe(false);
      expect(first.meeting.signoffs).toHaveLength(1);
      expect(first.meeting.signoffs[0]!.ip).toBe("10.0.0.1");
      expect(first.meeting.signoffs[0]!.email).toBe("alice@example.com");
    }

    const second = await recordSignoff(meetingId, aliceToken, "10.0.0.1");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.alreadySigned).toBe(true);

    const m = await findById(meetingId);
    expect(m!.signoffs).toHaveLength(1);
  });

  it("re-issuing preserves signoffs for already-signed attendees, rotates token only for unsigned", async () => {
    const { issueSignoffTokens, recordSignoff, findById } = await import("@/lib/meetings");
    const { meetingId } = await bootstrap();
    const a = await issueSignoffTokens(meetingId);
    if (!a.ok) throw new Error();
    const aliceA = a.issued.find((i) => i.email === "alice@example.com")!.token;
    await recordSignoff(meetingId, aliceA, "1.1.1.1");

    // Re-issue — Alice already signed, so only Bob gets a new token.
    const b = await issueSignoffTokens(meetingId);
    if (!b.ok) throw new Error();
    expect(b.issued).toHaveLength(1);
    expect(b.issued[0]!.email).toBe("bob@example.com");

    // Alice's signoff is preserved.
    const m = await findById(meetingId);
    expect(m!.signoffs).toHaveLength(1);
    expect(m!.signoffs[0]!.email).toBe("alice@example.com");

    // Alice's old token still works (her token was not rotated).
    const aliceRetry = await recordSignoff(meetingId, aliceA, "1.1.1.1");
    expect(aliceRetry.ok).toBe(true);
    if (aliceRetry.ok) expect(aliceRetry.alreadySigned).toBe(true);

    // Bob's new token works.
    const bobToken = b.issued[0]!.token;
    const bobSign = await recordSignoff(meetingId, bobToken, "2.2.2.2");
    expect(bobSign.ok).toBe(true);
    if (bobSign.ok) expect(bobSign.alreadySigned).toBe(false);
  });
});

describe("approve — director-only + all-signed gate + lock", () => {
  it("rejects non-director admins", async () => {
    const { approve } = await import("@/lib/meetings");
    const { meetingId } = await bootstrap();
    const stranger = await createUser("other@example.com", "admin");
    const r = await approve(meetingId, stranger.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_DIRECTOR");
  });

  it("rejects until all attendees have signed", async () => {
    const { approve, issueSignoffTokens, recordSignoff } = await import("@/lib/meetings");
    const { admin, meetingId } = await bootstrap();
    const issued = await issueSignoffTokens(meetingId);
    if (!issued.ok) throw new Error();

    // only Alice signs
    const alice = issued.issued.find((i) => i.email === "alice@example.com")!.token;
    await recordSignoff(meetingId, alice, "1.1.1.1");

    const r = await approve(meetingId, admin.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISSING_SIGNOFFS");

    // Now Bob signs
    const bob = issued.issued.find((i) => i.email === "bob@example.com")!.token;
    await recordSignoff(meetingId, bob, "2.2.2.2");
    const ok = await approve(meetingId, admin.id);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.meeting.status).toBe("approved");
      expect(ok.meeting.approvedBy).toBe(admin.id);
      expect(ok.meeting.approvedAt).not.toBeNull();
    }
  });

  it("locks minutes after approval — saveMinutes returns LOCKED", async () => {
    const {
      approve,
      issueSignoffTokens,
      recordSignoff,
      saveMinutes,
    } = await import("@/lib/meetings");
    const { admin, meetingId } = await bootstrap();
    const issued = await issueSignoffTokens(meetingId);
    if (!issued.ok) throw new Error();
    for (const i of issued.issued) await recordSignoff(meetingId, i.token, "9.9.9.9");
    const ok = await approve(meetingId, admin.id);
    expect(ok.ok).toBe(true);

    const r = await saveMinutes(meetingId, {
      attendees: ["x"],
      apologies: [],
      decisions: [],
      followUps: [],
      notes: "edited",
      generatedBy: "manual",
      generatedAt: new Date().toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("LOCKED");
  });

  it("rejects second approve attempt", async () => {
    const { approve, issueSignoffTokens, recordSignoff } = await import("@/lib/meetings");
    const { admin, meetingId } = await bootstrap();
    const issued = await issueSignoffTokens(meetingId);
    if (!issued.ok) throw new Error();
    for (const i of issued.issued) await recordSignoff(meetingId, i.token, "9.9.9.9");
    const a = await approve(meetingId, admin.id);
    expect(a.ok).toBe(true);
    const b = await approve(meetingId, admin.id);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.code).toBe("ALREADY_APPROVED");
  });
});
