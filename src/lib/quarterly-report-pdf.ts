import type { Branding } from "@/lib/branding";
import type {
  ActionStatusBucket,
  CategorySlice,
  Kpis,
  TopJob,
  TrendPoint,
} from "@/lib/metrics";

export type QuarterlyReportData = {
  kpis: Kpis;
  trend: TrendPoint[];
  categories: CategorySlice[];
  actions: ActionStatusBucket[];
  topJobs: TopJob[];
  generatedAt: Date;
  managementRepName?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  approved: "Approved",
  none: "None upcoming",
};

export async function renderQuarterlyReport(
  data: QuarterlyReportData,
  branding: Branding,
): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc
    .fillColor(branding.primaryColor)
    .fontSize(22)
    .text(branding.companyName);
  doc.fillColor("#000").fontSize(16).text("Quarterly quality report");
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#555").text(
    `Generated: ${data.generatedAt.toISOString()}` +
      (data.managementRepName
        ? `  ·  Management representative: ${data.managementRepName}`
        : ""),
  );
  doc.fillColor("#000");
  doc.moveDown(0.8);

  doc.fontSize(13).text("Key indicators");
  doc.moveDown(0.2);
  doc.fontSize(10);
  const k = data.kpis;
  doc.text(`Open incidents: ${k.openIncidents}`);
  doc.text(`Corrective actions overdue: ${k.actionsOverdue}`);
  doc.text(
    `Average days to close (closed incidents): ${
      k.avgDaysToClose == null ? "—" : k.avgDaysToClose.toFixed(1)
    }`,
  );
  doc.text(
    `Next quarterly meeting: ${
      STATUS_LABEL[k.nextQuarterlyMeetingStatus] ?? k.nextQuarterlyMeetingStatus
    }`,
  );
  doc.moveDown(0.8);

  doc.fontSize(13).text("Incident trend (12 months)");
  doc.moveDown(0.2);
  doc.fontSize(10);
  for (const t of data.trend) doc.text(`  ${t.month}: ${t.count}`);
  doc.moveDown(0.8);

  doc.fontSize(13).text("Top categories (last 90 days)");
  doc.moveDown(0.2);
  doc.fontSize(10);
  if (data.categories.length === 0) doc.text("(none)");
  for (const c of data.categories) doc.text(`  ${c.label}: ${c.count}`);
  doc.moveDown(0.8);

  doc.fontSize(13).text("Top 5 jobs by incidents (last 90 days)");
  doc.moveDown(0.2);
  doc.fontSize(10);
  if (data.topJobs.length === 0) doc.text("(none)");
  for (const j of data.topJobs) doc.text(`  ${j.number} · ${j.name}: ${j.count}`);
  doc.moveDown(0.8);

  doc.fontSize(13).text("Corrective actions by status");
  doc.moveDown(0.2);
  doc.fontSize(10);
  for (const a of data.actions) doc.text(`  ${a.status}: ${a.count}`);

  doc.end();
  return done;
}
