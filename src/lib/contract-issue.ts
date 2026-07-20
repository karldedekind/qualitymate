import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, user } from "@/db/schema";
import { renderContractDocPdf } from "@/lib/contract-docs-pdf";
import {
  type ContractDocument,
  documentTitle,
  issue,
  listDocFiles,
  listVersions,
} from "@/lib/contract-documents";
import { type MailAttachment, isConfigured as smtpConfigured, sendMail } from "@/lib/smtp";
import { saveBytes, uploadsRoot } from "@/lib/uploads";

export type IssueOutcome = {
  doc: ContractDocument;
  pdfPath: string;
  emailSent: boolean;
  /** Why the email did not go out (SMTP unset, no rep email, send failure). */
  emailError: string | null;
};

/** Public-facing PDF filename, matching the old drive naming. */
export function issuedPdfFilename(
  doc: Pick<ContractDocument, "kind" | "number" | "currentVersion">,
  jobName: string,
): string {
  const rev = doc.currentVersion > 1 ? ` (V${doc.currentVersion})` : "";
  return `${documentTitle(doc)} - ${jobName}${rev}.pdf`;
}

/**
 * Issue a draft, then email the generated PDF to the Job's Principal's rep.
 * Email failure never rolls back the issue — the document is contractually
 * issued either way; the caller surfaces `emailError` so the user can send
 * manually.
 */
export async function issueAndDistribute(
  documentId: string,
  issuedBy: string,
): Promise<IssueOutcome> {
  const issuerCheck = await db
    .select({ signaturePath: user.signaturePath })
    .from(user)
    .where(eq(user.id, issuedBy))
    .limit(1);
  if (!issuerCheck[0]?.signaturePath) {
    throw new Error(
      "Issued documents carry your signature. Store one first: ContractFlow → My signature.",
    );
  }

  const doc = await issue(documentId, issuedBy, (d) => renderContractDocPdf(d, issuedBy));

  const versions = await listVersions(doc.id);
  const current = versions.find((v) => v.version === doc.currentVersion);
  if (!current) throw new Error("Issued version not found.");

  const jobRows = await db.select().from(jobs).where(eq(jobs.id, doc.jobId)).limit(1);
  const job = jobRows[0]!;
  const filename = issuedPdfFilename(doc, job.name);
  const subject = `${job.number} - ${job.name} - ${documentTitle(doc)}${
    doc.currentVersion > 1 ? ` (V${doc.currentVersion})` : ""
  }`;

  if (!job.principalRepEmail) {
    return { doc, pdfPath: current.pdfPath, emailSent: false, emailError: "No Principal's representative email set on the job." };
  }
  if (!(await smtpConfigured())) {
    return { doc, pdfPath: current.pdfPath, emailSent: false, emailError: "SMTP is not configured." };
  }

  const issuerRows = await db.select().from(user).where(eq(user.id, issuedBy)).limit(1);
  const issuerName = issuerRows[0]?.name ?? "QualityMate";
  const pdfBytes = await readFile(join(uploadsRoot(), current.pdfPath));

  const mailAttachments: MailAttachment[] = [
    { filename, content: pdfBytes, contentType: "application/pdf" },
  ];
  const unreadable: string[] = [];
  const docFiles = await listDocFiles(doc.id);
  for (const f of docFiles.filter((f) => f.role === "attachment")) {
    try {
      mailAttachments.push({
        filename: f.originalFilename,
        content: await readFile(join(uploadsRoot(), f.path)),
      });
    } catch {
      unreadable.push(f.originalFilename);
    }
  }

  const result = await sendMail({
    to: job.principalRepEmail,
    subject,
    text:
      `Please find attached ${documentTitle(doc)} for ${job.number} - ${job.name}.\n\n` +
      `Issued by ${issuerName}.` +
      (unreadable.length > 0
        ? `\n\nNote: the following referenced documents could not be attached: ${unreadable.join(", ")}.`
        : ""),
    attachments: mailAttachments,
  });
  if (!result.ok) {
    return { doc, pdfPath: current.pdfPath, emailSent: false, emailError: result.error };
  }

  return { doc, pdfPath: current.pdfPath, emailSent: true, emailError: null };
}

/** Store an admin's reusable signature image (stamped onto issued PDFs). */
export async function saveUserSignature(userId: string, dataUrl: string): Promise<string> {
  const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Signature must be a PNG or JPEG data URL.");
  const ext = match[1] === "jpeg" ? "jpg" : "png";
  const buf = Buffer.from(match[2], "base64");
  const relPath = `user-signatures/${userId}/signature.${ext}`;
  await saveBytes(relPath, buf);
  await db.update(user).set({ signaturePath: relPath, updatedAt: new Date() }).where(eq(user.id, userId));
  return relPath;
}
