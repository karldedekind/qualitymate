import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

async function createUser(email: string) {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: "Will Dedekind" } });
  await db.update(user).set({ role: "admin", emailVerified: true }).where(eq(user.email, email));
  const rows = await db.select().from(user).where(eq(user.email, email));
  const u = rows[0]!;
  // issueAndDistribute requires a stored signature
  const { saveUserSignature } = await import("@/lib/contract-issue");
  await saveUserSignature(
    u.id,
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  );
  return { ...u, signaturePath: `user-signatures/${u.id}/signature.png` };
}

async function makeJob(repEmail: string | null) {
  const { createJob } = await import("@/lib/jobs");
  const { db } = await import("@/db");
  const { jobs } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const u = await createUser(`issuer-${Math.random().toString(36).slice(2, 8)}@example.com`);
  const job = await createJob({ number: "J1474", name: "Mundubbera SC", createdBy: u.id });
  await db
    .update(jobs)
    .set({ principalName: "QBuild", principalRepEmail: repEmail })
    .where(eq(jobs.id, job.id));
  return { job, user: u };
}

beforeAll(async () => {
  process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), "qm-issue-uploads-"));
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "communications" CASCADE`);
  await db.execute(sql`TRUNCATE "contract_documents" CASCADE`);
  await db.execute(sql`TRUNCATE "jobs" CASCADE`);
  await db.execute(sql`TRUNCATE "settings"`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
});

afterEach(async () => {
  const { _setTransportForTests } = await import("@/lib/smtp");
  _setTransportForTests(null);
});

describe("issueAndDistribute", () => {
  it("emails the PDF to the rep", async () => {
    const { _setTransportForTests } = await import("@/lib/smtp");
    const { set } = await import("@/lib/settings");
    const { createDraft } = await import("@/lib/contract-documents");
    const { issueAndDistribute } = await import("@/lib/contract-issue");

    const { job, user: u } = await makeJob("dean@example.com");
    // smtp "configured" for isConfigured(): host/port/from present
    await set("smtp.host", "localhost", { actor: { id: u.id } });
    await set("smtp.port", "2525", { actor: { id: u.id } });
    await set("smtp.from_email", "qm@rim.example", { actor: { id: u.id } });
    const sent: unknown[] = [];
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const original = transport.sendMail.bind(transport);
    transport.sendMail = (async (opts: unknown) => {
      sent.push(opts);
      return original(opts as never);
    }) as typeof transport.sendMail;
    _setTransportForTests(transport);

    const draft = await createDraft({
      jobId: job.id,
      kind: "rfi",
      createdBy: u.id,
      content: { question: "OK?" },
    });
    const outcome = await issueAndDistribute(draft.id, u.id);

    expect(outcome.doc.status).toBe("issued");
    expect(outcome.emailSent).toBe(true);
    expect(outcome.emailError).toBeNull();
    expect(sent).toHaveLength(1);
    const mail = sent[0] as { to: string; subject: string; attachments: { filename: string }[] };
    expect(mail.to).toBe("dean@example.com");
    expect(mail.subject).toBe("J1474 - Mundubbera SC - RFI 01");
    expect(mail.attachments[0]!.filename).toBe("RFI 01 - Mundubbera SC.pdf");

    const { listCommunicationsForJob } = await import("@/lib/communications");
    const comms = await listCommunicationsForJob(job.id);
    expect(comms).toHaveLength(1);
    expect(comms[0]!.direction).toBe("outbound");
    expect(comms[0]!.documentId).toBe(draft.id);
    expect(comms[0]!.subject).toBe("J1474 - Mundubbera SC - RFI 01");
    expect(comms[0]!.note).toBe("Emailed to dean@example.com");
  });

  it("issue succeeds with an emailError when no rep email is set; no Communication logged", async () => {
    const { createDraft } = await import("@/lib/contract-documents");
    const { issueAndDistribute } = await import("@/lib/contract-issue");
    const { listCommunicationsForJob } = await import("@/lib/communications");

    const { job, user: u } = await makeJob(null);
    const draft = await createDraft({ jobId: job.id, kind: "nod", createdBy: u.id, content: {} });
    const outcome = await issueAndDistribute(draft.id, u.id);

    expect(outcome.doc.status).toBe("issued");
    expect(outcome.doc.number).toBe(1);
    expect(outcome.emailSent).toBe(false);
    expect(outcome.emailError).toMatch(/representative email/i);
    expect(await listCommunicationsForJob(job.id)).toHaveLength(0);
  });

  it("refuses to issue when the issuer has no stored signature", async () => {
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { createDraft } = await import("@/lib/contract-documents");
    const { issueAndDistribute } = await import("@/lib/contract-issue");

    const { job, user: u } = await makeJob("dean@example.com");
    await db.update(user).set({ signaturePath: null }).where(eq(user.id, u.id));
    const draft = await createDraft({
      jobId: job.id,
      kind: "rfi",
      createdBy: u.id,
      content: { question: "OK?" },
    });
    await expect(issueAndDistribute(draft.id, u.id)).rejects.toThrow(/My signature/);
  });

  it("saveUserSignature stores the image and stamps the user row", async () => {
    const { saveUserSignature } = await import("@/lib/contract-issue");
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { readFile } = await import("node:fs/promises");
    const { uploadsRoot } = await import("@/lib/uploads");

    const u = await createUser("signer@example.com");
    // 1x1 transparent PNG
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const path = await saveUserSignature(u.id, png);
    expect(path).toBe(`user-signatures/${u.id}/signature.png`);
    const bytes = await readFile(join(uploadsRoot(), path));
    expect(bytes.length).toBeGreaterThan(20);
    const rows = await db.select().from(user).where(eq(user.id, u.id));
    expect(rows[0]!.signaturePath).toBe(path);

    await expect(saveUserSignature(u.id, "data:text/plain;base64,aGk=")).rejects.toThrow(
      /PNG or JPEG/,
    );
  });
});
