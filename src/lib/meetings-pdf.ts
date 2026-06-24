import type { Meeting } from "@/lib/meetings";
import type { Branding } from "@/lib/branding";
import {
  INK,
  MUTED,
  type PdfDoc,
  contentBox,
  drawFooters,
  drawHeader,
  drawMetaPanel,
  formatDateTime,
  sectionHeading,
} from "@/lib/pdf-theme";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  approved: "Approved",
};

/** Render approved meeting minutes as a branded A4 PDF. Returns the file bytes. */
export async function renderMinutesPdf(
  meeting: Meeting,
  branding: Branding,
): Promise<Buffer> {
  if (!meeting.minutes) {
    throw new Error("Cannot render minutes PDF: meeting has no minutes.");
  }
  const minutes = meeting.minutes;
  const accent = branding.primaryColor;

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const { left, width } = contentBox(doc);

  drawHeader(doc, branding, "Meeting Minutes");

  const metaRows: [string, string][] = [
    ["Meeting", meeting.title],
    ["Scheduled", formatDateTime(meeting.scheduledAt)],
  ];
  if (meeting.location) metaRows.push(["Location", meeting.location]);
  if (meeting.approvedAt) metaRows.push(["Approved", formatDateTime(meeting.approvedAt)]);
  metaRows.push(["Status", STATUS_LABEL[meeting.status] ?? meeting.status]);

  drawMetaPanel(doc, metaRows);
  doc.moveDown(1);

  section(doc, "Attendees", minutes.attendees, accent);
  if (minutes.apologies.length > 0) section(doc, "Apologies", minutes.apologies, accent);
  section(doc, "Decisions", minutes.decisions, accent);
  if (minutes.followUps.length > 0) section(doc, "Follow-ups", minutes.followUps, accent);

  if (minutes.notes.trim()) {
    sectionHeading(doc, "Notes", accent);
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(10)
      .text(minutes.notes.trim(), left, doc.y, { width, align: "left" });
    doc.moveDown(0.8);
  }

  if (meeting.signoffs.length > 0) {
    sectionHeading(doc, "Sign-offs", accent);
    for (const s of meeting.signoffs) {
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(s.name, left, doc.y, { width });
      if (s.email) {
        doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(s.email, left, doc.y, { width });
      }
      const meta = `Signed ${formatDateTime(s.signedAt)}${s.ip ? `  ·  ${s.ip}` : ""}`;
      doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(meta, left, doc.y, { width });
      doc.moveDown(0.5);
    }
  }

  drawFooters(doc, branding.companyName);

  doc.end();
  return done;
}

function section(doc: PdfDoc, title: string, items: string[], accent: string): void {
  const { left, width } = contentBox(doc);
  sectionHeading(doc, title, accent);
  doc.font("Helvetica").fontSize(10);
  if (items.length === 0) {
    doc.fillColor(MUTED).text("(none)", left, doc.y, { width });
  } else {
    // Native list = reliable pagination + hanging indent for wrapped lines.
    doc.fillColor(INK).list(items, left, doc.y, {
      width,
      bulletRadius: 1.6,
      textIndent: 12,
      bulletIndent: 0,
      lineGap: 2,
    });
  }
  doc.moveDown(0.8);
}
