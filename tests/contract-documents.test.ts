import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

const FAKE_PDF = Buffer.from("%PDF-fake");
const renderFake = async () => FAKE_PDF;

async function createUser(email: string) {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: email } });
  await db.update(user).set({ role: "admin", emailVerified: true }).where(eq(user.email, email));
  const rows = await db.select().from(user).where(eq(user.email, email));
  return rows[0]!;
}

async function createJob(number = "J1474") {
  const { createJob } = await import("@/lib/jobs");
  const { db } = await import("@/db");
  const { jobs } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const u = await createUser(`job-owner-${number.toLowerCase()}@example.com`);
  const job = await createJob({ number, name: "Mundubbera SC - Primary Sports", createdBy: u.id });
  await db
    .update(jobs)
    .set({
      principalName: "QBuild",
      principalRepName: "Dean James",
      principalRepEmail: "dean.james@example.com",
      contractDateForPc: "2026-07-23",
    })
    .where(eq(jobs.id, job.id));
  return { job, user: u };
}

beforeAll(async () => {
  process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), "qm-cf-uploads-"));
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

describe("drafts", () => {
  it("creates an editable RFI draft with no number", async () => {
    const { createDraft, updateDraft, findById } = await import("@/lib/contract-documents");
    const { job, user } = await createJob();

    const doc = await createDraft({
      jobId: job.id,
      kind: "rfi",
      createdBy: user.id,
      content: { question: "Pipe substitution OK?" },
      responseRequiredBy: "2026-05-29",
    });
    expect(doc.status).toBe("draft");
    expect(doc.number).toBeNull();
    expect(doc.currentVersion).toBe(0);

    const updated = await updateDraft(doc.id, { content: { question: "Revised question" } });
    expect(updated?.content.question).toBe("Revised question");
    expect((await findById(doc.id))?.content.question).toBe("Revised question");
  });

  it("deleteDraft removes a never-issued draft, refuses an issued doc", async () => {
    const { createDraft, deleteDraft, issue, findById } = await import(
      "@/lib/contract-documents"
    );
    const { job, user } = await createJob();

    const d1 = await createDraft({ jobId: job.id, kind: "rfi", createdBy: user.id, content: {} });
    await deleteDraft(d1.id);
    expect(await findById(d1.id)).toBeNull();

    const d2 = await createDraft({ jobId: job.id, kind: "rfi", createdBy: user.id, content: {} });
    await issue(d2.id, user.id, renderFake);
    await expect(deleteDraft(d2.id)).rejects.toThrow(/issued/i);
  });
});

describe("issue + numbering", () => {
  it("allocates gap-free numbers per job+kind at issue; deleted drafts burn nothing", async () => {
    const { createDraft, deleteDraft, issue } = await import("@/lib/contract-documents");
    const { job, user } = await createJob();

    const a = await createDraft({ jobId: job.id, kind: "rfi", createdBy: user.id, content: {} });
    const burned = await createDraft({
      jobId: job.id,
      kind: "rfi",
      createdBy: user.id,
      content: {},
    });
    const b = await createDraft({ jobId: job.id, kind: "rfi", createdBy: user.id, content: {} });
    const nod = await createDraft({ jobId: job.id, kind: "nod", createdBy: user.id, content: {} });

    const issuedA = await issue(a.id, user.id, renderFake);
    expect(issuedA.number).toBe(1);
    await deleteDraft(burned.id);
    const issuedB = await issue(b.id, user.id, renderFake);
    expect(issuedB.number).toBe(2);
    // NOD numbering is independent of RFI numbering
    const issuedNod = await issue(nod.id, user.id, renderFake);
    expect(issuedNod.number).toBe(1);
  });

  it("issue snapshots a version, writes the PDF, and locks the draft", async () => {
    const { createDraft, issue, updateDraft, listVersions } = await import(
      "@/lib/contract-documents"
    );
    const { uploadsRoot } = await import("@/lib/uploads");
    const { job, user } = await createJob();

    const doc = await createDraft({
      jobId: job.id,
      kind: "rfi",
      createdBy: user.id,
      content: { question: "Q1" },
    });
    const issued = await issue(doc.id, user.id, renderFake);
    expect(issued.status).toBe("issued");
    expect(issued.currentVersion).toBe(1);

    const versions = await listVersions(doc.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.version).toBe(1);
    expect(versions[0]!.supersededAt).toBeNull();
    const bytes = await readFile(join(uploadsRoot(), versions[0]!.pdfPath));
    expect(bytes.equals(FAKE_PDF)).toBe(true);

    await expect(updateDraft(doc.id, { content: { question: "sneaky edit" } })).rejects.toThrow(
      /issued/i,
    );
  });

  it("cannot issue twice without revising", async () => {
    const { createDraft, issue } = await import("@/lib/contract-documents");
    const { job, user } = await createJob();
    const doc = await createDraft({ jobId: job.id, kind: "rfi", createdBy: user.id, content: {} });
    await issue(doc.id, user.id, renderFake);
    await expect(issue(doc.id, user.id, renderFake)).rejects.toThrow(/draft/i);
  });
});

describe("revisions", () => {
  it("startRevision reopens the draft; reissue keeps the number, archives V1", async () => {
    const { createDraft, issue, startRevision, updateDraft, listVersions } = await import(
      "@/lib/contract-documents"
    );
    const { job, user } = await createJob();

    const doc = await createDraft({
      jobId: job.id,
      kind: "rfi",
      createdBy: user.id,
      content: { question: "First question" },
    });
    await issue(doc.id, user.id, renderFake);

    const revising = await startRevision(doc.id);
    expect(revising.status).toBe("draft");
    expect(revising.number).toBe(1);
    await updateDraft(doc.id, { content: { question: "Second question" } });
    const reissued = await issue(doc.id, user.id, renderFake);

    expect(reissued.number).toBe(1);
    expect(reissued.currentVersion).toBe(2);
    const versions = await listVersions(doc.id);
    expect(versions).toHaveLength(2);
    const v1 = versions.find((v) => v.version === 1)!;
    const v2 = versions.find((v) => v.version === 2)!;
    expect(v1.supersededAt).not.toBeNull();
    expect(v2.supersededAt).toBeNull();
    expect((v1.snapshot as { content: { question: string } }).content.question).toBe(
      "First question",
    );
  });

  it("startRevision refuses a never-issued draft", async () => {
    const { createDraft, startRevision } = await import("@/lib/contract-documents");
    const { job, user } = await createJob();
    const doc = await createDraft({ jobId: job.id, kind: "rfi", createdBy: user.id, content: {} });
    await expect(startRevision(doc.id)).rejects.toThrow(/draft/i);
  });
});

describe("withdraw", () => {
  it("withdraw only from issued", async () => {
    const { createDraft, issue, withdraw } = await import("@/lib/contract-documents");
    const { job, user } = await createJob();
    const doc = await createDraft({ jobId: job.id, kind: "rfi", createdBy: user.id, content: {} });
    await expect(withdraw(doc.id)).rejects.toThrow();
    await issue(doc.id, user.id, renderFake);
    const w = await withdraw(doc.id);
    expect(w.status).toBe("withdrawn");
    expect(w.withdrawnAt).not.toBeNull();
  });
});

describe("register queries", () => {
  it("listForJob groups by kind, ordered by number", async () => {
    const { createDraft, issue, listForJob } = await import("@/lib/contract-documents");
    const { job, user } = await createJob();
    const r1 = await createDraft({ jobId: job.id, kind: "rfi", createdBy: user.id, content: {} });
    await createDraft({ jobId: job.id, kind: "rfi", createdBy: user.id, content: {} });
    await issue(r1.id, user.id, renderFake);

    const rows = await listForJob(job.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.number).toBe(1); // issued first
  });
});
