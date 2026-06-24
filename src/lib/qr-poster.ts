import { findJobById, type Job } from "@/lib/jobs";
import { getBranding } from "@/lib/branding";
import { INK, MUTED, PANEL_BG, DIVIDER, drawHeader } from "@/lib/pdf-theme";

export type PosterOptions = {
  appUrl?: string;
};

export type PosterResult = {
  buffer: Buffer;
  filename: string;
  url: string;
  job: Job;
};

function checkInUrl(base: string, jobId: string): string {
  return `${base.replace(/\/$/, "")}/checkin?job=${encodeURIComponent(jobId)}`;
}

export async function generatePoster(
  jobId: string,
  opts: PosterOptions = {},
): Promise<PosterResult | null> {
  const job = await findJobById(jobId);
  if (!job) return null;

  const branding = await getBranding();
  const base = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const url = checkInUrl(base, job.id);

  const QRCode = (await import("qrcode")).default;
  const qrPng = await QRCode.toBuffer(url, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 1200,
  });

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const left = doc.page.margins.left;
  const contentW = pageWidth - left * 2;
  const accent = branding.primaryColor;

  // Shared branded header (logo + company name + "Site Sign-In" + accent rule).
  drawHeader(doc, branding, "Site Sign-In");

  // Job identity, centred.
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(40)
    .text(`Job ${job.number}`, left, doc.y + 16, { align: "center", width: contentW });
  doc
    .font("Helvetica")
    .fontSize(18)
    .fillColor(MUTED)
    .text(job.name, left, doc.y + 4, { align: "center", width: contentW });

  // QR in a bordered panel.
  const qrSize = 320;
  const pad = 18;
  const panelW = qrSize + pad * 2;
  const panelX = (pageWidth - panelW) / 2;
  const panelY = doc.y + 24;
  doc.save();
  doc.roundedRect(panelX, panelY, panelW, panelW, 8).fillAndStroke(PANEL_BG, DIVIDER);
  doc.restore();
  const qrX = (pageWidth - qrSize) / 2;
  doc.image(qrPng, qrX, panelY + pad, { width: qrSize, height: qrSize });

  // Call to action + fallback URL.
  let y = panelY + panelW + 24;
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("Scan the QR code to sign in", left, y, { align: "center", width: contentW });
  y = doc.y + 6;
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(MUTED)
    .text("Or open this URL on your phone:", left, y, { align: "center", width: contentW });
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(accent)
    .text(url, left, doc.y + 2, {
      align: "center",
      width: contentW,
      link: url,
      underline: true,
    });

  // Poster footer. Zero the bottom margin so text() in the margin band
  // doesn't read as overflow and spawn a blank page.
  doc.page.margins.bottom = 0;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
    .text(`Powered by QualityMate · ${branding.companyName}`, left, pageHeight - 44, {
      align: "center",
      width: contentW,
    });

  doc.end();
  const buffer = await done;

  return {
    buffer,
    filename: `qr-poster-${job.number}.pdf`,
    url,
    job,
  };
}
