import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const OUT = join(process.cwd(), "marketing", "qualitymate-brochure.pdf");

const PRIMARY = "#1e40af";
const INK = "#0f172a";
const MUTED = "#475569";
const LINE = "#cbd5e1";

async function main() {
  const PDFDocumentMod = await import("pdfkit");
  const PDFDocument = (PDFDocumentMod as { default: typeof PDFDocumentMod.default })
    .default;

  await mkdir(dirname(OUT), { recursive: true });

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  // Cover
  doc
    .font("Helvetica-Bold")
    .fontSize(42)
    .fillColor(PRIMARY)
    .text("QualityMate", { align: "left" });
  doc
    .moveDown(0.3)
    .fontSize(20)
    .fillColor(INK)
    .text("ISO 9001 quality management for construction.");
  doc
    .moveDown(0.2)
    .fontSize(20)
    .fillColor(MUTED)
    .text("Self-hosted. Australian-built.");

  doc.moveDown(2);
  doc.strokeColor(LINE).lineWidth(1).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
  doc.moveDown(1);

  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor(INK)
    .text(
      "Construction sites generate sensitive incident data — injury reports, near-misses, contractor performance. We don't think that should leave your network. QualityMate runs on a single Linux server you control. Your data, your hardware, your audit trail.",
      { align: "left" },
    );

  doc.moveDown(1.2);
  doc.font("Helvetica-Bold").fontSize(16).fillColor(PRIMARY).text("What's included");
  doc.moveDown(0.5);

  const features: Array<[string, string]> = [
    ["Site check-in", "Per-job QR posters, on-screen signature, supervisor sign-off. No login required for the worker."],
    ["Incident logging", "Phone-first form. Photos. Voice dictation. Offline queue. Optional AI triage."],
    ["Corrective actions", "Assign, due-date scans, owner-resolved. Overdue notifications nightly."],
    ["Management reviews", "AI pack drafts, attendee sign-offs, director approval, .ics invites, distribution emails."],
    ["Audit-ready", "Every state change recorded. Quarterly PDF export. Full ZIP data export."],
    ["Yours forever", "One install per company. Open file formats throughout. No vendor lock-in."],
  ];

  doc.font("Helvetica").fontSize(11).fillColor(INK);
  for (const [h, b] of features) {
    doc.font("Helvetica-Bold").fontSize(12).fillColor(PRIMARY).text(h);
    doc.font("Helvetica").fontSize(11).fillColor(INK).text(b, { indent: 12 }).moveDown(0.4);
  }

  // Page 2 — pricing
  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(28).fillColor(PRIMARY).text("Pricing");
  doc
    .moveDown(0.2)
    .font("Helvetica")
    .fontSize(13)
    .fillColor(MUTED)
    .text("One-time licence. Annual support optional. No subscription. No per-seat fees.");
  doc.moveDown(1);

  const tiers: Array<[string, string, string[]]> = [
    [
      "Licence — $3,500 AUD (one-time)",
      "Perpetual licence for one company.",
      [
        "All features. No 'Pro' tier.",
        "Self-hosted Docker image from GHCR.",
        "Unlimited users, unlimited jobs.",
        "Full source available to licensees.",
      ],
    ],
    [
      "Support — $600 AUD per year",
      "Email support, business hours AEST.",
      [
        "Bug fixes and security patches.",
        "Minor and major version upgrades.",
        "Release-channel access (`:1-stable-rc` canary).",
        "Cancel anytime — install keeps running.",
      ],
    ],
    [
      "White-glove install — $750 AUD (one-time)",
      "We provision your server.",
      [
        "DNS, TLS, reverse proxy, backups configured.",
        "First admin onboarded.",
        "QR posters generated for your active jobs.",
        "One-hour training session for your team.",
      ],
    ],
  ];

  for (const [title, lede, items] of tiers) {
    doc.font("Helvetica-Bold").fontSize(14).fillColor(PRIMARY).text(title);
    doc.font("Helvetica").fontSize(11).fillColor(INK).text(lede, { indent: 12 });
    doc.font("Helvetica").fontSize(11).fillColor(INK);
    for (const it of items) doc.text(`• ${it}`, { indent: 12 });
    doc.moveDown(0.6);
  }

  doc.moveDown(1.2);
  doc.strokeColor(LINE).lineWidth(1).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(14).fillColor(PRIMARY).text("Get in touch");
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(INK)
    .text("hello@qualitymate.com.au", { indent: 12 });
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(INK)
    .text("https://qualitymate.com.au", { indent: 12 });

  doc.end();
  await done;

  const pdf = Buffer.concat(chunks);
  await writeFile(OUT, pdf);
  console.log(`[brochure] wrote ${OUT} (${pdf.length} bytes)`);
}

main().catch((err) => {
  console.error("[brochure] failed:", err);
  process.exit(1);
});
