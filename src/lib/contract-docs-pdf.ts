import { existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { contractDocuments, jobs, user } from "@/db/schema";
import { getBranding } from "@/lib/branding";
import type { ContractDocument } from "@/lib/contract-documents";
import { documentTitle, listDocFiles } from "@/lib/contract-documents";
import {
  INK,
  MUTED,
  type PdfDoc,
  contentBox,
  drawFooters,
  drawHeader,
  drawMetaPanel,
  ensureSpace,
  formatDate,
  sectionHeadingBox,
} from "@/lib/pdf-theme";
import { KNOWN_KEYS, getMany } from "@/lib/settings";
import { uploadsRoot } from "@/lib/uploads";

const DOC_TITLE: Record<ContractDocument["kind"], string> = {
  rfi: "Request for Information",
  nod: "Notice of Delay",
  eot: "Extension of Time",
};

const DOC_BANNER: Record<ContractDocument["kind"], string> = {
  rfi: "This is a formal request for more information regarding the project",
  nod: "This is a notification that there may be a delay in the critical path of this project",
  eot: "This claim is for an extension of the Date for Practical Completion Stage",
};

function num(n: number | null): string {
  return n == null ? "—" : String(n);
}

/** Long-text field: bold muted title over a matching rule, then the value
 * paragraph. A tier below sectionHeadingBox but clearly heavier than body text. */
function fieldBlock(doc: PdfDoc, label: string, value: string, minHeight = 48): void {
  const { left, width } = contentBox(doc);
  ensureSpace(doc, minHeight);
  doc
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text(label.toUpperCase(), left, doc.y, { width, characterSpacing: 0.5 });
  const ruleY = doc.y + 2;
  doc
    .moveTo(left, ruleY)
    .lineTo(left + width, ruleY)
    .lineWidth(0.75)
    .strokeColor(MUTED)
    .stroke();
  doc.y = ruleY + 6;
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(10)
    .text(value.replace(/\r\n?/g, "\n").trim() || "—", left, doc.y, { width });
  doc.moveDown(0.8);
}

/**
 * Embed uploaded photos, one per row inside a fixed-height box (pdfkit's
 * `fit` doesn't report the rendered height). Falls back to the filename for
 * unreadable or non-embeddable files (e.g. legacy WebP uploads).
 */
function photoBlock(doc: PdfDoc, label: string, photos: { path: string; name: string }[]): void {
  const { left, width } = contentBox(doc);
  const BOX_H = 250;
  ensureSpace(doc, 60);
  doc
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text(label.toUpperCase(), left, doc.y, { width, characterSpacing: 0.5 });
  const ruleY = doc.y + 2;
  doc
    .moveTo(left, ruleY)
    .lineTo(left + width, ruleY)
    .lineWidth(0.75)
    .strokeColor(MUTED)
    .stroke();
  doc.y = ruleY + 6;
  for (const p of photos) {
    const full = join(uploadsRoot(), p.path);
    const embeddable = /\.(png|jpe?g)$/i.test(p.path) && existsSync(full);
    if (embeddable) {
      ensureSpace(doc, BOX_H + 24);
      const y = doc.y;
      try {
        doc.image(full, left, y, { fit: [width, BOX_H] });
        doc.y = y + BOX_H + 4;
      } catch {
        doc.y = y;
      }
    }
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(p.name, left, doc.y, { width });
    doc.moveDown(0.8);
  }
}

function signatureImagePath(relPath: string | null): string | null {
  if (!relPath || !/\.(png|jpe?g)$/i.test(relPath)) return null;
  const full = join(uploadsRoot(), relPath);
  return existsSync(full) ? full : null;
}

function signatureBlock(
  doc: PdfDoc,
  accent: string,
  party: string,
  signer: { name: string; signaturePath: string | null; date: Date } | null,
): void {
  const { left, width } = contentBox(doc);
  ensureSpace(doc, 110);
  sectionHeadingBox(doc, `Signed by, or for and on behalf of, the ${party}`, accent);
  if (!signer) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(10);
    doc.text("Printed name: ____________________________", left, doc.y, { width });
    doc.moveDown(1.6);
    doc.text("Signature: ____________________________", left, doc.y, { width });
    doc.moveDown(1.6);
    doc.text("Date: ____________________________", left, doc.y, { width });
    doc.moveDown(0.8);
    return;
  }
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(signer.name, left, doc.y, { width });
  const sig = signatureImagePath(signer.signaturePath);
  if (sig) {
    const y = doc.y + 4;
    try {
      doc.image(sig, left, y, { fit: [160, 50] });
      doc.y = y + 54;
    } catch {
      doc.moveDown(0.5);
    }
  } else {
    doc.moveDown(0.5);
  }
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(9)
    .text(`Signed ${formatDate(signer.date)}`, left, doc.y, { width });
  doc.moveDown(0.8);
}

type LinkedRefs = {
  rfiNumber: number | null;
  nodNumber: number | null;
  linkedNodNumbers: number[];
  linkedEotNumbers: number[];
};

async function resolveLinks(docRow: ContractDocument): Promise<LinkedRefs> {
  const refs: LinkedRefs = {
    rfiNumber: null,
    nodNumber: null,
    linkedNodNumbers: [],
    linkedEotNumbers: [],
  };
  if (docRow.rfiId) {
    const r = await db
      .select({ number: contractDocuments.number })
      .from(contractDocuments)
      .where(eq(contractDocuments.id, docRow.rfiId))
      .limit(1);
    refs.rfiNumber = r[0]?.number ?? null;
  }
  if (docRow.nodId) {
    const r = await db
      .select({ number: contractDocuments.number })
      .from(contractDocuments)
      .where(eq(contractDocuments.id, docRow.nodId))
      .limit(1);
    refs.nodNumber = r[0]?.number ?? null;
  }
  if (docRow.kind === "rfi") {
    const nods = await db
      .select({ id: contractDocuments.id, number: contractDocuments.number })
      .from(contractDocuments)
      .where(and(eq(contractDocuments.kind, "nod"), eq(contractDocuments.rfiId, docRow.id)));
    refs.linkedNodNumbers = nods.map((n) => n.number).filter((n): n is number => n != null);

    const nodIds = nods.map((n) => n.id);
    const eotWhere =
      nodIds.length > 0
        ? or(eq(contractDocuments.rfiId, docRow.id), inArray(contractDocuments.nodId, nodIds))
        : eq(contractDocuments.rfiId, docRow.id);
    const eots = await db
      .select({ number: contractDocuments.number })
      .from(contractDocuments)
      .where(and(eq(contractDocuments.kind, "eot"), eotWhere));
    refs.linkedEotNumbers = eots.map((e) => e.number).filter((n): n is number => n != null);
  }
  return refs;
}

/**
 * Render an RFI / NOD / EOT as a branded A4 PDF. `docRow` must already carry
 * its allocated number (i.e. call from within issue()).
 */
export async function renderContractDocPdf(
  docRow: ContractDocument,
  issuedByUserId: string,
): Promise<Buffer> {
  const [jobRows, branding, contractor, issuerRows, files, links] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.id, docRow.jobId)).limit(1),
    getBranding(),
    getMany([
      KNOWN_KEYS.CONTRACTOR_LEGAL_NAME,
      KNOWN_KEYS.CONTRACTOR_PHONE,
      KNOWN_KEYS.CONTRACTOR_EMAIL,
    ]),
    db.select().from(user).where(eq(user.id, issuedByUserId)).limit(1),
    listDocFiles(docRow.id),
    resolveLinks(docRow),
  ]);
  const job = jobRows[0];
  if (!job) throw new Error("Job not found for PDF render.");
  const issuer = issuerRows[0] ?? null;
  const accent = branding.primaryColor;
  const photos = files.filter((f) => f.role === "photo");
  const attachments = files.filter((f) => f.role === "attachment");

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    bufferPages: true,
  }) as unknown as PdfDoc & { on: (ev: string, cb: (c: Buffer) => void) => void; end: () => void };
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  drawHeader(doc, branding, DOC_TITLE[docRow.kind]);

  const metaRows: [string, string][] = [
    [`${documentTitle(docRow).split(" ")[0]} Number`, num(docRow.number)],
    ["Job Number", job.number],
    ["Job Name", job.name],
  ];
  if (docRow.kind === "nod") metaRows.splice(1, 0, ["RFI Reference", num(links.rfiNumber)]);
  if (docRow.kind === "eot") metaRows.splice(1, 0, ["NOD Reference", num(links.nodNumber)]);
  if (docRow.currentVersion > 1) {
    metaRows.push(["Revision", `V${docRow.currentVersion}`]);
  }
  drawMetaPanel(doc, metaRows);
  doc.moveDown(1);

  sectionHeadingBox(doc, "Parties", accent);
  drawMetaPanel(doc, [
    ["To the Owner / Principal", job.principalName ?? "—"],
    ["Project Managers", job.principalTradingAs ?? "—"],
    ["Addressed to", job.principalRepName ?? "—"],
    ["Phone", job.principalRepPhone ?? "—"],
    ["Email", job.principalRepEmail ?? "—"],
  ]);
  doc.moveDown(0.5);
  drawMetaPanel(doc, [
    ["From the Contractor", contractor[KNOWN_KEYS.CONTRACTOR_LEGAL_NAME] ?? branding.companyName],
    ["Trading as", branding.companyName],
    ["Phone", contractor[KNOWN_KEYS.CONTRACTOR_PHONE] ?? "—"],
    ["Email", contractor[KNOWN_KEYS.CONTRACTOR_EMAIL] ?? "—"],
    ["Site address", job.address ?? "—"],
  ]);
  doc.moveDown(1);

  sectionHeadingBox(doc, `Details of ${DOC_TITLE[docRow.kind]}`, accent);
  const { left, width } = contentBox(doc);
  doc
    .fillColor(MUTED)
    .font("Helvetica-Oblique")
    .fontSize(9)
    .text(DOC_BANNER[docRow.kind], left, doc.y, { width });
  doc.moveDown(0.6);

  const content = docRow.content;
  if (docRow.kind === "rfi") {
    fieldBlock(doc, "Question", content.question ?? "");
    if (docRow.responseRequiredBy) {
      fieldBlock(doc, "Response required by", formatDate(docRow.responseRequiredBy));
    }
    if (photos.length > 0) {
      photoBlock(
        doc,
        "Photos",
        photos.map((a) => ({ path: a.path, name: a.originalFilename })),
      );
    }
  } else if (docRow.kind === "nod") {
    fieldBlock(doc, "The cause of delay", content.cause ?? "");
    fieldBlock(doc, "Date(s) on which it occurred", content.datesOccurred ?? "");
    fieldBlock(doc, "Number of days delayed", content.daysDelayed ?? "");
  } else {
    if (content.clausePreamble?.trim()) {
      fieldBlock(doc, "Contractual basis of claim", content.clausePreamble);
    }
    fieldBlock(doc, "Reason(s) for delay and the date(s) on which it occurred", content.reasons ?? "");
    fieldBlock(doc, "Request", content.request ?? "");
    const dayLabel = job.dayBasis === "ordinary" ? "ordinary days" : "working days";
    fieldBlock(doc, `Number of days claimed (${dayLabel})`, num(docRow.daysClaimed));

    ensureSpace(doc, 120);
    sectionHeadingBox(doc, "Adjusted Date for Practical Completion Stage", accent);
    drawMetaPanel(doc, [
      [
        "Date for Practical Completion Stage",
        docRow.pcDateSnapshot ? formatDate(docRow.pcDateSnapshot) : "—",
      ],
      [`Previous extension of time claims (${dayLabel})`, num(docRow.previousEotDays)],
      [`This extension of time claim (${dayLabel})`, num(docRow.daysClaimed)],
      [
        "Adjusted Date for Practical Completion",
        docRow.adjustedPcDate ? formatDate(docRow.adjustedPcDate) : "—",
      ],
    ]);
    doc.moveDown(1);
  }

  if (attachments.length > 0) {
    fieldBlock(
      doc,
      "Attached documents",
      attachments.map((a) => a.originalFilename).join("\n"),
    );
  }

  if (docRow.kind === "rfi") {
    const linked: [string, string][] = [];
    if (links.linkedNodNumbers.length > 0)
      linked.push(["Linked NOD", links.linkedNodNumbers.join(", ")]);
    if (links.linkedEotNumbers.length > 0)
      linked.push(["Linked EOT", links.linkedEotNumbers.join(", ")]);
    if (linked.length > 0) {
      ensureSpace(doc, 80);
      sectionHeadingBox(doc, "Linked documents", accent);
      drawMetaPanel(doc, linked);
      doc.moveDown(1);
    }
  }

  signatureBlock(doc, accent, "CONTRACTOR", {
    name: issuer?.name ?? "—",
    signaturePath: issuer?.signaturePath ?? null,
    date: new Date(),
  });
  if (docRow.kind === "eot") {
    signatureBlock(doc, accent, "OWNER / PRINCIPAL", null);
  }

  drawFooters(doc, branding.companyName);
  doc.end();
  return done;
}
