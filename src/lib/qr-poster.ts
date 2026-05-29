import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { findJobById, type Job } from "@/lib/jobs";
import { getBranding, type Branding } from "@/lib/branding";
import { uploadsRoot } from "@/lib/uploads";

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

async function loadLogoBuffer(branding: Branding): Promise<Buffer | null> {
  if (!branding.logoPath) return null;
  try {
    return await readFile(join(uploadsRoot(), branding.logoPath));
  } catch {
    return null;
  }
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

  const logoBuf = await loadLogoBuffer(branding);
  let headerY = 60;
  if (logoBuf) {
    try {
      doc.image(logoBuf, 40, headerY, { fit: [80, 80] });
    } catch {
      // skip logo on decode failure
    }
  }

  doc
    .fillColor(branding.primaryColor)
    .fontSize(26)
    .text(branding.companyName, 140, headerY, { align: "left" });

  doc
    .fillColor("#000")
    .fontSize(16)
    .text("Site sign-in", 140, headerY + 36);

  headerY += 110;
  doc
    .fillColor("#000")
    .fontSize(40)
    .text(`Job ${job.number}`, 40, headerY, { align: "center", width: pageWidth - 80 });
  doc
    .fontSize(20)
    .fillColor("#333")
    .text(job.name, 40, headerY + 60, { align: "center", width: pageWidth - 80 });

  const qrSize = 360;
  const qrX = (pageWidth - qrSize) / 2;
  const qrY = headerY + 130;
  doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });

  doc
    .fillColor("#000")
    .fontSize(14)
    .text("Scan the QR code to sign in", 40, qrY + qrSize + 20, {
      align: "center",
      width: pageWidth - 80,
    });

  doc
    .fontSize(10)
    .fillColor("#555")
    .text("Or open this URL on your phone:", 40, qrY + qrSize + 50, {
      align: "center",
      width: pageWidth - 80,
    });
  doc
    .fontSize(11)
    .fillColor("#1e40af")
    .text(url, 40, qrY + qrSize + 66, {
      align: "center",
      width: pageWidth - 80,
      link: url,
      underline: true,
    });

  doc
    .fontSize(8)
    .fillColor("#888")
    .text(`Powered by QualityMate · ${branding.companyName}`, 40, pageHeight - 50, {
      align: "center",
      width: pageWidth - 80,
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
