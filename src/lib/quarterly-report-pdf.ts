import type { Branding } from "@/lib/branding";
import type {
  ActionStatusBucket,
  CategorySlice,
  Kpis,
  TopJob,
  TrendPoint,
} from "@/lib/metrics";
import {
  INK,
  MUTED,
  PANEL_BG,
  type PdfDoc,
  contentBox,
  drawFooters,
  drawHeader,
  drawMetaPanel,
  ensureSpace,
  formatDate,
  sectionHeading,
  tint,
} from "@/lib/pdf-theme";

export type QuarterlyReportData = {
  kpis: Kpis;
  trend: TrendPoint[];
  categories: CategorySlice[];
  actions: ActionStatusBucket[];
  topJobs: TopJob[];
  generatedAt: Date;
  managementRepName?: string | null;
};

const MEETING_STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  approved: "Approved",
  none: "None upcoming",
};

const ACTION_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  resolved: "Resolved",
};

export async function renderQuarterlyReport(
  data: QuarterlyReportData,
  branding: Branding,
): Promise<Buffer> {
  const accent = branding.primaryColor;

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  drawHeader(doc, branding, "Quarterly Quality Report");

  const metaRows: [string, string][] = [["Generated", formatDate(data.generatedAt)]];
  if (data.managementRepName) {
    metaRows.push(["Management representative", data.managementRepName]);
  }
  drawMetaPanel(doc, metaRows);
  doc.moveDown(1);

  // ---- KPI cards ----
  const k = data.kpis;
  const nextMeeting = k.nextQuarterlyMeetingAt
    ? formatDate(k.nextQuarterlyMeetingAt)
    : MEETING_STATUS_LABEL[k.nextQuarterlyMeetingStatus] ?? k.nextQuarterlyMeetingStatus;
  drawKpiCards(
    doc,
    [
      { value: String(k.openIncidents), label: "Open incidents" },
      { value: String(k.actionsOverdue), label: "Actions overdue" },
      { value: k.avgDaysToClose == null ? "—" : k.avgDaysToClose.toFixed(1), label: "Avg days to close" },
      { value: nextMeeting, label: "Next quarterly meeting" },
    ],
    accent,
  );
  doc.moveDown(1);

  // ---- Incident trend (12 months) ----
  sectionHeading(doc, "Incident trend (12 months)", accent);
  if (data.trend.length === 0) {
    emptyNote(doc);
  } else {
    barChart(
      doc,
      data.trend.map((t) => ({ label: formatMonth(t.month), value: t.count })),
      accent,
    );
  }
  doc.moveDown(0.8);

  // ---- Top categories (90 days) ----
  sectionHeading(doc, "Top categories (last 90 days)", accent);
  if (data.categories.length === 0) {
    emptyNote(doc);
  } else {
    barChart(
      doc,
      data.categories.map((c) => ({ label: c.label, value: c.count })),
      accent,
    );
  }
  doc.moveDown(0.8);

  // ---- Top 5 jobs (90 days) ----
  sectionHeading(doc, "Top 5 jobs by incidents (last 90 days)", accent);
  if (data.topJobs.length === 0) {
    emptyNote(doc);
  } else {
    barChart(
      doc,
      data.topJobs.map((j) => ({ label: `${j.number} · ${j.name}`, value: j.count })),
      accent,
    );
  }
  doc.moveDown(0.8);

  // ---- Corrective actions by status ----
  sectionHeading(doc, "Corrective actions by status", accent);
  if (data.actions.length === 0) {
    emptyNote(doc);
  } else {
    barChart(
      doc,
      data.actions.map((a) => ({
        label: ACTION_STATUS_LABEL[a.status] ?? a.status,
        value: a.count,
      })),
      accent,
    );
  }

  drawFooters(doc, branding.companyName);

  doc.end();
  return done;
}

type Kpi = { value: string; label: string };

/** Row of evenly-spaced stat cards: big value over a muted label. */
function drawKpiCards(doc: PdfDoc, cards: Kpi[], accent: string): void {
  const { left, width } = contentBox(doc);
  const gap = 10;
  const n = cards.length;
  const cardW = (width - gap * (n - 1)) / n;
  const cardH = 58;
  const y = ensureSpace(doc, cardH);

  cards.forEach((c, i) => {
    const x = left + i * (cardW + gap);
    doc.save();
    doc.roundedRect(x, y, cardW, cardH, 4).fill(PANEL_BG);
    doc.rect(x, y, 3, cardH).fill(accent);
    doc.restore();
    // Auto-shrink so longer values (e.g. a date) still fit on one line.
    let size = 20;
    doc.font("Helvetica-Bold");
    while (size > 11 && doc.fontSize(size).widthOfString(c.value) > cardW - 20) size -= 1;
    doc
      .fillColor(INK)
      .fontSize(size)
      .text(c.value, x + 10, y + 12, { width: cardW - 16, lineBreak: false, ellipsis: true });
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(c.label.toUpperCase(), x + 10, y + cardH - 18, { width: cardW - 16, lineBreak: false });
  });

  doc.y = y + cardH;
}

type Bar = { label: string; value: number };

/** Horizontal bar chart: label column, tinted accent bar, value at the end. */
function barChart(doc: PdfDoc, bars: Bar[], accent: string): void {
  const { left, width } = contentBox(doc);
  const labelW = Math.min(180, width * 0.4);
  const valueW = 34;
  const trackX = left + labelW + 8;
  const trackW = width - labelW - 8 - valueW;
  const rowH = 16;
  const barH = 9;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const barTint = tint(accent, 0.25);

  for (const b of bars) {
    const y = ensureSpace(doc, rowH);
    // Label (truncated to its column).
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(9)
      .text(b.label, left, y + 2, { width: labelW, lineBreak: false, ellipsis: true });
    // Track + filled bar.
    doc.save();
    doc.roundedRect(trackX, y + 2, trackW, barH, 2).fill(PANEL_BG);
    const w = Math.max(b.value > 0 ? 2 : 0, (b.value / max) * trackW);
    if (w > 0) doc.roundedRect(trackX, y + 2, w, barH, 2).fill(barTint);
    doc.restore();
    // Value.
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(String(b.value), trackX + trackW + 4, y + 2, {
        width: valueW - 4,
        align: "right",
        lineBreak: false,
      });
    doc.y = y + rowH;
  }
}

function emptyNote(doc: PdfDoc): void {
  const { left, width } = contentBox(doc);
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text("(none)", left, doc.y, { width });
}

/** "2026-01" → "Jan 2026"; pass anything else through unchanged. */
function formatMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = parseInt(m[2], 10) - 1;
  return idx >= 0 && idx < 12 ? `${names[idx]} ${m[1]}` : month;
}
