import type { Meeting } from "@/lib/meetings";
import type { Branding } from "@/lib/branding";

/** Render approved meeting minutes as a single A4 PDF. Returns the file bytes. */
export async function renderMinutesPdf(
  meeting: Meeting,
  branding: Branding,
): Promise<Buffer> {
  if (!meeting.minutes) {
    throw new Error("Cannot render minutes PDF: meeting has no minutes.");
  }
  const minutes = meeting.minutes;

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc
    .fillColor(branding.primaryColor)
    .fontSize(20)
    .text(branding.companyName);
  doc.fillColor("#000").fontSize(16).text("Meeting minutes");
  doc.moveDown(0.4);

  doc.fontSize(13).text(meeting.title);
  doc
    .fontSize(10)
    .fillColor("#555")
    .text(`Scheduled: ${meeting.scheduledAt.toISOString()}`);
  if (meeting.location) doc.text(`Location: ${meeting.location}`);
  if (meeting.approvedAt) {
    doc.text(`Approved: ${meeting.approvedAt.toISOString()}`);
  }
  doc.fillColor("#000");
  doc.moveDown(0.6);

  section(doc, "Attendees", minutes.attendees);
  if (minutes.apologies.length > 0) section(doc, "Apologies", minutes.apologies);
  section(doc, "Decisions", minutes.decisions);
  if (minutes.followUps.length > 0) section(doc, "Follow-ups", minutes.followUps);

  if (minutes.notes.trim()) {
    doc.fontSize(12).text("Notes");
    doc.moveDown(0.2);
    doc.fontSize(10).text(minutes.notes, { align: "left" });
    doc.moveDown(0.5);
  }

  if (meeting.signoffs.length > 0) {
    doc.fontSize(12).text("Signoffs");
    doc.moveDown(0.2);
    doc.fontSize(10);
    for (const s of meeting.signoffs) {
      doc.text(
        `${s.name}${s.email ? ` <${s.email}>` : ""} — ${s.signedAt}${s.ip ? ` (${s.ip})` : ""}`,
      );
    }
  }

  doc.end();
  return done;
}

type PdfDoc = {
  fontSize: (n: number) => PdfDoc;
  text: (text: string, opts?: Record<string, unknown>) => PdfDoc;
  moveDown: (n?: number) => PdfDoc;
};

function section(doc: PdfDoc, title: string, items: string[]): void {
  doc.fontSize(12).text(title);
  doc.moveDown(0.2);
  doc.fontSize(10);
  if (items.length === 0) {
    doc.text("(none)");
  } else {
    for (const it of items) doc.text(`• ${it}`);
  }
  doc.moveDown(0.5);
}
