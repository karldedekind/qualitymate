import type { AuditEvent } from "@/lib/audit";
import {
  DIVIDER,
  INK,
  MUTED,
  contentBox,
  drawFooters,
  drawHeader,
  drawMetaPanel,
  ensureSpace,
  formatDateTime,
} from "@/lib/pdf-theme";

function csvEscape(value: unknown): string {
  if (value == null) return "";
  let str: string;
  if (typeof value === "string") str = value;
  else if (value instanceof Date) str = value.toISOString();
  else str = JSON.stringify(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_HEADERS = [
  "id",
  "timestamp",
  "user_email",
  "user_id",
  "action",
  "entity_type",
  "entity_id",
  "ip",
  "user_agent",
  "before",
  "after",
];

export function toCsv(events: AuditEvent[]): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.join(","));
  for (const e of events) {
    lines.push(
      [
        e.id,
        e.ts.toISOString(),
        e.userEmailSnapshot,
        e.userId,
        e.action,
        e.entityType,
        e.entityId,
        e.ip,
        e.userAgent,
        e.before,
        e.after,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export type PdfBranding = {
  companyName: string;
  primaryColor: string;
};

export type PdfFilterSummary = {
  from?: string | null;
  to?: string | null;
  entityType?: string | null;
};

export async function toPdf(
  events: AuditEvent[],
  branding: PdfBranding,
  filters: PdfFilterSummary = {},
): Promise<Buffer> {
  const accent = branding.primaryColor;
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const { left, width } = contentBox(doc);

  drawHeader(doc, branding, "Audit Log Export");

  const period =
    filters.from || filters.to ? `${filters.from ?? "—"}  to  ${filters.to ?? "—"}` : "All time";
  const metaRows: [string, string][] = [
    ["Period", period],
    ["Entity", filters.entityType || "All"],
    ["Rows", String(events.length)],
  ];
  drawMetaPanel(doc, metaRows);
  doc.moveDown(1);

  if (events.length === 0) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(10).text("No events for this selection.", left, doc.y, { width });
  }

  for (const e of events) {
    // Keep the header line + first detail line together across page breaks.
    const y = ensureSpace(doc, 34);
    doc
      .moveTo(left, y - 4)
      .lineTo(left + width, y - 4)
      .lineWidth(0.5)
      .strokeColor(DIVIDER)
      .stroke();

    const entity = `${e.entityType}${e.entityId ? `:${e.entityId}` : ""}`;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(accent).text(e.action, left, y, {
      width: width * 0.5,
      continued: true,
    });
    doc.font("Helvetica").fillColor(MUTED).text(`   ${entity}`, { continued: false });

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `${formatDateTime(e.ts)}   ·   ${e.userEmailSnapshot ?? "(anonymous)"}   ·   ${e.ip ?? "no-ip"}`,
        left,
        doc.y,
        { width },
      );

    doc.font("Courier").fontSize(7.5).fillColor(INK);
    if (e.before != null) {
      doc.text(`before  ${truncate(JSON.stringify(e.before), 220)}`, left + 6, doc.y, { width: width - 6 });
    }
    if (e.after != null) {
      doc.text(`after   ${truncate(JSON.stringify(e.after), 220)}`, left + 6, doc.y, { width: width - 6 });
    }
    doc.moveDown(0.5);
  }

  drawFooters(doc, branding.companyName);

  doc.end();
  return done;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
