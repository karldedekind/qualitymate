import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const OUT = join(process.cwd(), "docs-site", "site-staff", "incident-card.pdf");

async function main() {
  const PDFDocumentMod = await import("pdfkit");
  const PDFDocument = (PDFDocumentMod as { default: typeof PDFDocumentMod.default })
    .default;

  await mkdir(dirname(OUT), { recursive: true });

  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));

  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  doc
    .font("Helvetica-Bold")
    .fontSize(28)
    .fillColor("#1e40af")
    .text("How to file an incident", { align: "center" })
    .moveDown(0.2)
    .fontSize(18)
    .fillColor("#334155")
    .text("on your phone", { align: "center" });

  doc.moveDown(1).strokeColor("#cbd5e1").lineWidth(1).moveTo(36, doc.y).lineTo(559, doc.y).stroke();
  doc.moveDown(0.6);

  const steps: Array<[string, string]> = [
    ["Open QualityMate on your phone.", "Sign in with your work email."],
    ["Tap “Report incident”.", "Or scan the QR poster on the site board, then tap “Report an incident”."],
    ["Pick the job.", "Select from the list, or “Not job-specific”."],
    ["Add a short title.", "One line. Plain English."],
    [
      "Describe what happened.",
      "Hands dirty? Tap the mic icon and dictate. Live text appears as you speak.",
    ],
    [
      "Take photos.",
      "Tap the camera icon. Multiple OK. Photos resize automatically — don't worry about size.",
    ],
    ["Tap “Submit incident”.", "If you're offline, it queues and uploads when you're back online."],
  ];

  doc.font("Helvetica").fontSize(12).fillColor("#0f172a");
  steps.forEach(([h, b], i) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#1e40af")
      .text(`${i + 1}. ${h}`, { continued: false });
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#0f172a")
      .text(b, { indent: 18 })
      .moveDown(0.4);
  });

  doc.moveDown(0.5);
  doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(36, doc.y).lineTo(559, doc.y).stroke();
  doc.moveDown(0.6);

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#1e40af")
    .text("If you can't sign in:");
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#0f172a")
    .text(
      "Find your invitation email. Click the link. Set your name and a password. That's your account.",
      { indent: 18 },
    )
    .moveDown(0.6);

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#1e40af")
    .text("After you submit:");
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#0f172a")
    .text(
      "Tap “My incidents” to see status. Pending review → Open → Closed. If an admin assigns you a corrective action, you'll see it under “My actions”.",
      { indent: 18 },
    );

  doc.end();
  await done;

  const pdf = Buffer.concat(chunks);
  await writeFile(OUT, pdf);
  console.log(`[incident-card] wrote ${OUT} (${pdf.length} bytes)`);
}

main().catch((err) => {
  console.error("[incident-card] failed:", err);
  process.exit(1);
});
