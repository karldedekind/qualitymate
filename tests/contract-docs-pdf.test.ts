import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

async function createUser(email: string) {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: "Will Dedekind" } });
  await db.update(user).set({ role: "admin", emailVerified: true }).where(eq(user.email, email));
  const rows = await db.select().from(user).where(eq(user.email, email));
  return rows[0]!;
}

beforeAll(async () => {
  process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), "qm-pdf-uploads-"));
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "contract_documents" CASCADE`);
  await db.execute(sql`TRUNCATE "jobs" CASCADE`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
});

describe("renderContractDocPdf", () => {
  it("renders real PDFs for all three kinds through the issue flow", async () => {
    const { createJob } = await import("@/lib/jobs");
    const { db } = await import("@/db");
    const { jobs } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { createDraft, issue } = await import("@/lib/contract-documents");
    const { renderContractDocPdf } = await import("@/lib/contract-docs-pdf");

    const u = await createUser("pdf@example.com");
    const job = await createJob({ number: "J1474", name: "Mundubbera SC", createdBy: u.id });
    await db
      .update(jobs)
      .set({
        principalName: "QBuild",
        principalRepName: "Dean James",
        principalRepEmail: "dean@example.com",
        address: "57 Bunce St Mundubbera, QLD 4626",
        contractDateForPc: "2026-07-23",
      })
      .where(eq(jobs.id, job.id));

    const rfi = await createDraft({
      jobId: job.id,
      kind: "rfi",
      createdBy: u.id,
      content: { question: "Stormwater pipe substitution — is ATLANFLOW acceptable?" },
      responseRequiredBy: "2026-05-29",
    });
    const issuedRfi = await issue(rfi.id, u.id, (d) => renderContractDocPdf(d, u.id));
    expect(issuedRfi.number).toBe(1);

    const nod = await createDraft({
      jobId: job.id,
      kind: "nod",
      createdBy: u.id,
      content: { cause: "Pipe unavailable", datesOccurred: "15/05/2026", daysDelayed: "53 days" },
      rfiId: rfi.id,
    });
    await issue(nod.id, u.id, (d) => renderContractDocPdf(d, u.id));

    const eot = await createDraft({
      jobId: job.id,
      kind: "eot",
      createdBy: u.id,
      content: { clausePreamble: "Clause 17...", reasons: "Supply delay", request: "48 days" },
      daysClaimed: 48,
      pcDateSnapshot: "2026-07-23",
      previousEotDays: 0,
      adjustedPcDate: "2026-09-29",
      nodId: nod.id,
    });
    await issue(eot.id, u.id, (d) => renderContractDocPdf(d, u.id));

    // The issue flow stored real PDF bytes for each
    const { listVersions } = await import("@/lib/contract-documents");
    const { readFile } = await import("node:fs/promises");
    const { uploadsRoot } = await import("@/lib/uploads");
    for (const id of [rfi.id, nod.id, eot.id]) {
      const [v] = await listVersions(id);
      const bytes = await readFile(join(uploadsRoot(), v!.pdfPath));
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(1000);
    }
  });
});
