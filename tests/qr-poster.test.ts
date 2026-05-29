import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

async function createJob(number: string, name = "Test job") {
  const { db } = await import("@/db");
  const { jobs } = await import("@/db/schema");
  const { randomBytes } = await import("node:crypto");
  const id = randomBytes(8).toString("base64url");
  await db.insert(jobs).values({ id, number, name, active: true });
  return id;
}

beforeAll(async () => {
  process.env.INSTALL_PASSPHRASE = "test-install-passphrase-32-bytes-min-aaaaa";
  process.env.APP_URL = "https://qm.example.com";
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "jobs" CASCADE`);
  await db.execute(sql`TRUNCATE "settings"`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
});

describe("generatePoster", () => {
  it("returns null for unknown job", async () => {
    const { generatePoster } = await import("@/lib/qr-poster");
    const result = await generatePoster("does-not-exist");
    expect(result).toBeNull();
  });

  it("produces a sane PDF with the check-in URL embedded", async () => {
    const { generatePoster } = await import("@/lib/qr-poster");
    const jobId = await createJob("P-001", "Riverside Stage 2");
    const result = await generatePoster(jobId);

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.filename).toBe("qr-poster-P-001.pdf");
    expect(result.url).toBe(`https://qm.example.com/checkin?job=${jobId}`);

    expect(result.buffer.length).toBeGreaterThan(1024);
    expect(result.buffer.length).toBeLessThan(500_000);

    const header = result.buffer.subarray(0, 5).toString("latin1");
    expect(header).toBe("%PDF-");

    const body = result.buffer.toString("latin1");
    // Job id appears in URL annotation (uncompressed), project number is in compressed text stream.
    expect(body).toContain(jobId);
  });
});
