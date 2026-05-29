import type { AuditEvent } from "@/lib/audit";

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
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc
    .fillColor(branding.primaryColor)
    .fontSize(18)
    .text(branding.companyName, { continued: true })
    .fillColor("#000")
    .fontSize(14)
    .text("  —  Audit log export");

  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#555");
  const meta: string[] = [`Generated: ${new Date().toISOString()}`];
  if (filters.from) meta.push(`From: ${filters.from}`);
  if (filters.to) meta.push(`To: ${filters.to}`);
  if (filters.entityType) meta.push(`Entity: ${filters.entityType}`);
  meta.push(`Rows: ${events.length}`);
  doc.text(meta.join("    "));

  doc.moveDown(0.6);
  doc.fillColor("#000");

  doc.fontSize(8);
  for (const e of events) {
    doc
      .fillColor("#000")
      .text(
        `${e.ts.toISOString()}    ${e.action}    ${e.entityType}${e.entityId ? `:${e.entityId}` : ""}`,
        { continued: false },
      );
    doc
      .fillColor("#555")
      .text(`    user=${e.userEmailSnapshot ?? "(anonymous)"}    ip=${e.ip ?? "-"}`);
    if (e.before != null) {
      doc.text(`    before: ${truncate(JSON.stringify(e.before), 240)}`);
    }
    if (e.after != null) {
      doc.text(`    after:  ${truncate(JSON.stringify(e.after), 240)}`);
    }
    doc.moveDown(0.3);
  }

  doc.end();
  return done;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
