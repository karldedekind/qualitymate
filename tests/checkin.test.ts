import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

const BLANK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=";

async function createJob(number: string, name: string) {
  const { db } = await import("@/db");
  const { jobs } = await import("@/db/schema");
  const { randomBytes } = await import("node:crypto");
  const id = randomBytes(8).toString("base64url");
  await db.insert(jobs).values({ id, number, name, active: true });
  return id;
}

function tomorrowIso(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function yesterdayIso(now: Date = new Date()): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function baseInput(jobId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    jobId,
    fullName: "Jane Builder",
    mobile: "0400000000",
    companyName: "Acme Pty Ltd",
    trade: "Carpenter",
    emergencyContactName: "John Builder",
    emergencyContactPhone: "0400000001",
    whiteCardNumber: "WC-12345",
    whiteCardExpiry: tomorrowIso(),
    declWhsmp: true,
    declEmergency: true,
    declFitForWork: true,
    declEmergencyAction: true,
    declHazards: true,
    declPpe: true,
    declCompetent: true,
    declSiteRules: true,
    consent: true,
    signatureDataUrl: BLANK_PNG,
    plannedDepartureAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    ip: "203.0.113.10",
    userAgent: "vitest",
    ...overrides,
  };
}

beforeAll(async () => {
  process.env.INSTALL_PASSPHRASE = "test-install-passphrase-32-bytes-min-aaaaa";
  process.env.UPLOADS_DIR = "/tmp/qualitymate-test-uploads";
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "site_attendances" RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE "jobs" CASCADE`);
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "settings"`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
  const { _resetCheckinRateLimitsForTests } = await import("@/lib/checkin");
  _resetCheckinRateLimitsForTests();
});

describe("checkin.submit — happy path", () => {
  it("persists site_attendances row when all 8 declarations true and white card valid", async () => {
    const { submit } = await import("@/lib/checkin");
    const jobId = await createJob("J-001", "Test job");

    const result = await submit(baseInput(jobId));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attendance.fullName).toBe("Jane Builder");
      expect(result.attendance.signaturePath).toMatch(
        new RegExp(`^site_attendance/${result.attendance.id}/signature\\.png$`),
      );
      expect(result.attendance.signedInAt).toBeInstanceOf(Date);
    }
  });
});

describe("checkin.submit — declarations", () => {
  const declFlags = [
    "declWhsmp",
    "declEmergency",
    "declFitForWork",
    "declEmergencyAction",
    "declHazards",
    "declPpe",
    "declCompetent",
    "declSiteRules",
  ] as const;

  for (const flag of declFlags) {
    it(`rejects when ${flag} is false`, async () => {
      const { submit } = await import("@/lib/checkin");
      const jobId = await createJob("J-002", "Decl");
      const result = await submit(baseInput(jobId, { [flag]: false }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("DECLARATION_MISSING");
    });
  }
});

describe("checkin.submit — white card expiry", () => {
  it("rejects with WHITE_CARD_EXPIRED when expiry is in the past", async () => {
    const { submit } = await import("@/lib/checkin");
    const jobId = await createJob("J-003", "Expired");
    const result = await submit(
      baseInput(jobId, { whiteCardExpiry: yesterdayIso() }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("WHITE_CARD_EXPIRED");
  });

  it("accepts when expiry is today", async () => {
    const { submit } = await import("@/lib/checkin");
    const jobId = await createJob("J-004", "Today");
    const today = new Date().toISOString().slice(0, 10);
    const result = await submit(baseInput(jobId, { whiteCardExpiry: today }));
    expect(result.ok).toBe(true);
  });
});

describe("checkin.submit — signature + consent", () => {
  it("rejects with SIGNATURE_MISSING when signature data URL is empty", async () => {
    const { submit } = await import("@/lib/checkin");
    const jobId = await createJob("J-005", "NoSig");
    const result = await submit(baseInput(jobId, { signatureDataUrl: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SIGNATURE_MISSING");
  });

  it("rejects with CONSENT_MISSING when consent is false", async () => {
    const { submit } = await import("@/lib/checkin");
    const jobId = await createJob("J-006", "NoConsent");
    const result = await submit(baseInput(jobId, { consent: false }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONSENT_MISSING");
  });
});

describe("checkin.submit — per-IP rate limit (20/hour)", () => {
  it("blocks the 21st submission within an hour from the same IP", async () => {
    const { submit } = await import("@/lib/checkin");
    const jobId = await createJob("J-007", "RateLimit");
    const ip = "203.0.113.99";

    for (let i = 0; i < 20; i++) {
      const r = await submit(baseInput(jobId, { ip }));
      expect(r.ok).toBe(true);
    }
    const blocked = await submit(baseInput(jobId, { ip }));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("RATE_LIMITED");
  });

  it("does not affect a different IP", async () => {
    const { submit } = await import("@/lib/checkin");
    const jobId = await createJob("J-008", "RateIsolation");
    for (let i = 0; i < 20; i++) {
      await submit(baseInput(jobId, { ip: "198.51.100.1" }));
    }
    const other = await submit(baseInput(jobId, { ip: "198.51.100.2" }));
    expect(other.ok).toBe(true);
  });
});

describe("checkin.getDeclarations / setDeclarations", () => {
  it("returns PRD defaults when nothing stored", async () => {
    const { getDeclarations, DECLARATION_DEFAULTS } = await import("@/lib/checkin");
    const out = await getDeclarations();
    expect(out.decl_whsmp).toBe(DECLARATION_DEFAULTS.decl_whsmp);
    expect(out.decl_site_rules).toBe(DECLARATION_DEFAULTS.decl_site_rules);
  });

  it("setDeclarations overrides values that getDeclarations then returns", async () => {
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    await db
      .insert(user)
      .values({ id: "test-admin", email: "test-admin@example.com", name: "Test Admin", role: "admin" })
      .onConflictDoNothing();
    const { getDeclarations, setDeclarations } = await import("@/lib/checkin");
    await setDeclarations({ decl_whsmp: "Custom WHSMP wording." }, { id: "test-admin" });
    const out = await getDeclarations();
    expect(out.decl_whsmp).toBe("Custom WHSMP wording.");
  });
});
