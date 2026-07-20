import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

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

async function makeJob(number: string, contractSumCents: number | null = 150_000_00) {
  const { createJob } = await import("@/lib/jobs");
  const { db } = await import("@/db");
  const { jobs } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const u = await createUser(`vary-${number.toLowerCase()}@example.com`);
  const job = await createJob({ number, name: `Job ${number}`, createdBy: u.id });
  await db.update(jobs).set({ contractSumCents }).where(eq(jobs.id, job.id));
  return { job, user: u };
}

beforeAll(async () => {
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "communications" CASCADE`);
  await db.execute(sql`TRUNCATE "variations" CASCADE`);
  await db.execute(sql`TRUNCATE "jobs" CASCADE`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
});

describe("variations", () => {
  it("numbers sequentially per job", async () => {
    const { createVariation } = await import("@/lib/variations");
    const { job, user } = await makeJob("J2001");
    const { job: other } = await makeJob("J2002");

    const v1 = await createVariation({
      jobId: job.id,
      description: "Extra drainage",
      claimedValueCents: 12_500_00,
      createdBy: user.id,
    });
    const v2 = await createVariation({
      jobId: job.id,
      description: "Omit fencing",
      claimedValueCents: -3_000_00,
      createdBy: user.id,
    });
    const vOther = await createVariation({
      jobId: other.id,
      description: "Unrelated",
      createdBy: user.id,
    });
    expect(v1.number).toBe(1);
    expect(v2.number).toBe(2);
    expect(vOther.number).toBe(1);
  });

  it("rejects an explicit number already taken; accepts a free one", async () => {
    const { createVariation } = await import("@/lib/variations");
    const { job, user } = await makeJob("J2005");

    await createVariation({
      jobId: job.id,
      description: "First",
      number: 3,
      createdBy: user.id,
    });
    await expect(
      createVariation({ jobId: job.id, description: "Clash", number: 3, createdBy: user.id }),
    ).rejects.toThrow("Variation 3 already exists for this job.");
    // Blank number continues from the highest allocated.
    const next = await createVariation({
      jobId: job.id,
      description: "Next free",
      createdBy: user.id,
    });
    expect(next.number).toBe(4);
  });

  it("decide() stamps approval and value; contract sum reflects approved only", async () => {
    const { createVariation, decideVariation, contractSumSummary } = await import(
      "@/lib/variations"
    );
    const { job, user } = await makeJob("J2003", 150_000_00);

    const v1 = await createVariation({
      jobId: job.id,
      description: "Add",
      claimedValueCents: 10_000_00,
      createdBy: user.id,
    });
    const v2 = await createVariation({
      jobId: job.id,
      description: "Omit",
      claimedValueCents: -2_000_00,
      createdBy: user.id,
    });
    const v3 = await createVariation({
      jobId: job.id,
      description: "Pending",
      claimedValueCents: 99_000_00,
      createdBy: user.id,
    });

    const approved = await decideVariation(v1.id, {
      status: "approved",
      approvedValueCents: 9_000_00, // principal approved less than claimed
    });
    expect(approved.status).toBe("approved");
    expect(approved.decidedAt).not.toBeNull();
    await decideVariation(v2.id, { status: "approved" }); // defaults to claimed value
    await decideVariation(v3.id, { status: "rejected" });

    const summary = await contractSumSummary(job.id);
    expect(summary.originalCents).toBe(150_000_00);
    expect(summary.approvedVariationsCents).toBe(9_000_00 - 2_000_00);
    expect(summary.currentCents).toBe(150_000_00 + 7_000_00);
  });

  it("only proposed variations can be deleted", async () => {
    const { createVariation, updateVariation, deleteVariation, findVariationById } = await import(
      "@/lib/variations"
    );
    const { job, user } = await makeJob("J2006");

    const keep = await createVariation({
      jobId: job.id,
      description: "Submitted one",
      createdBy: user.id,
    });
    await updateVariation(keep.id, { status: "submitted" });
    await expect(deleteVariation(keep.id)).rejects.toThrow(
      "Only a proposed variation can be deleted.",
    );

    const gone = await createVariation({
      jobId: job.id,
      description: "Proposed one",
      createdBy: user.id,
    });
    await deleteVariation(gone.id);
    expect(await findVariationById(gone.id)).toBeNull();
  });

  it("communications: log + list for job and document, newest first", async () => {
    const { logCommunication, listCommunicationsForJob, listCommunicationsForDocument } =
      await import("@/lib/communications");
    const { createDraft } = await import("@/lib/contract-documents");
    const { job, user } = await makeJob("J2007");
    const doc = await createDraft({ jobId: job.id, kind: "rfi", createdBy: user.id, content: {} });

    await logCommunication({
      jobId: job.id,
      direction: "inbound",
      subject: "RE: RFI 002 - footpath & swale drain",
      occurredAt: new Date("2026-06-01T03:00:00Z"),
      path: "communications/abc.eml",
      originalFilename: "reply.eml",
      documentId: doc.id,
      createdBy: user.id,
    });
    await logCommunication({
      jobId: job.id,
      direction: "outbound",
      subject: "RFI 01 issued",
      occurredAt: new Date("2026-05-27T03:00:00Z"),
      createdBy: null,
    });

    const rows = await listCommunicationsForJob(job.id);
    expect(rows).toHaveLength(2);
    // newest first
    expect(rows[0]!.subject).toContain("RFI 002");
    expect(rows[0]!.documentId).toBe(doc.id);
    expect(rows[1]!.direction).toBe("outbound");

    const docRows = await listCommunicationsForDocument(doc.id);
    expect(docRows).toHaveLength(1);
    expect(docRows[0]!.subject).toContain("RFI 002");
  });
});
