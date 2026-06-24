import { existsSync } from "node:fs";
import { join } from "node:path";
import { uploadsRoot } from "@/lib/uploads";

/** Just the branding fields a PDF header needs. logoPath is optional so callers
 * with a narrower branding shape (e.g. audit export) still satisfy it. */
export type HeaderBranding = {
  companyName: string;
  primaryColor: string;
  logoPath?: string | null;
};

// Shared visual language for QualityMate's branded PDF exports (meeting
// minutes, quarterly report, …). Accents use the tenant brand colour; the
// rest is a neutral greyscale tuned for print.
export const INK = "#111827";
export const MUTED = "#6b7280";
export const DIVIDER = "#e5e7eb";
export const PANEL_BG = "#f9fafb";

const DATE_TZ = "Australia/Brisbane";

/** Minimal structural typing for the pdfkit calls our generators use, so the
 * theme stays typecheck-clean without depending on @types/pdfkit specifics. */
export type PdfDoc = {
  y: number;
  page: { width: number; height: number; margins: { left: number; right: number; bottom: number } };
  fillColor: (c: string) => PdfDoc;
  strokeColor: (c: string) => PdfDoc;
  lineWidth: (n: number) => PdfDoc;
  fillOpacity: (n: number) => PdfDoc;
  font: (name: string) => PdfDoc;
  fontSize: (n: number) => PdfDoc;
  text: (text: string, x?: number, y?: number, opts?: Record<string, unknown>) => PdfDoc;
  list: (items: string[], x?: number, y?: number, opts?: Record<string, unknown>) => PdfDoc;
  moveDown: (n?: number) => PdfDoc;
  moveTo: (x: number, y: number) => PdfDoc;
  lineTo: (x: number, y: number) => PdfDoc;
  rect: (x: number, y: number, w: number, h: number) => PdfDoc;
  roundedRect: (x: number, y: number, w: number, h: number, r: number) => PdfDoc;
  fill: (c?: string) => PdfDoc;
  stroke: (c?: string) => PdfDoc;
  save: () => PdfDoc;
  restore: () => PdfDoc;
  image: (src: string, x: number, y: number, opts?: Record<string, unknown>) => PdfDoc;
  heightOfString: (text: string, opts?: Record<string, unknown>) => number;
  widthOfString: (text: string, opts?: Record<string, unknown>) => number;
  switchToPage: (n: number) => void;
  bufferedPageRange: () => { start: number; count: number };
  addPage: (opts?: Record<string, unknown>) => PdfDoc;
};

/** Add a page if `needed` points won't fit above the bottom margin. Returns the
 * y to draw at. Use before manually-positioned blocks (cards, chart rows). */
export function ensureSpace(doc: PdfDoc, needed: number): number {
  const limit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > limit) doc.addPage();
  return doc.y;
}

/** Inner content width between the page margins. */
export function contentBox(doc: PdfDoc): { left: number; right: number; width: number } {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  return { left, right, width: right - left };
}

/** Human date+time, e.g. "24 June 2026 at 2:30 pm". Accepts Date or ISO string. */
export function formatDateTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "—";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: DATE_TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Human date only, e.g. "24 June 2026". Accepts Date or ISO string. */
export function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "—";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: DATE_TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Lighten a #rrggbb hex toward white by `amount` (0..1). Used for tinted bars. */
export function tint(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const to2 = (c: number) => c.toString(16).padStart(2, "0");
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

/** Resolve a brand logo to an embeddable file path, or null. pdfkit only
 * embeds raster PNG/JPG — SVG/WebP logos are skipped rather than crashing. */
export function resolveLogoPath(logoPath: string | null): string | null {
  if (!logoPath) return null;
  if (!/\.(png|jpe?g)$/i.test(logoPath)) return null;
  const full = join(uploadsRoot(), logoPath);
  return existsSync(full) ? full : null;
}

/** Branded header band: logo + company name (brand colour) + document title,
 * closed by an accent rule. Leaves doc.y just below the rule. */
export function drawHeader(doc: PdfDoc, branding: HeaderBranding, title: string): void {
  const { left, right } = contentBox(doc);
  const accent = branding.primaryColor;
  const headerTop = doc.y;

  let textX = left;
  const logo = resolveLogoPath(branding.logoPath ?? null);
  if (logo) {
    try {
      doc.image(logo, left, headerTop, { fit: [120, 40] });
      textX = left + 132;
    } catch {
      textX = left;
    }
  }
  doc
    .fillColor(accent)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(branding.companyName, textX, headerTop, { width: right - textX });
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(13)
    .text(title, textX, doc.y + 1, { width: right - textX });

  const ruleY = Math.max(doc.y, headerTop + 40) + 8;
  doc.moveTo(left, ruleY).lineTo(right, ruleY).lineWidth(2).strokeColor(accent).stroke();
  doc.y = ruleY + 16;
}

/** Section heading: short accent bar + bold label, with a hairline beneath. */
export function sectionHeading(doc: PdfDoc, title: string, accent: string): void {
  const { left, width } = contentBox(doc);
  const y = doc.y;
  doc.rect(left, y + 1, 3, 12).fill(accent);
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(title, left + 10, y, { width: width - 10 });
  doc.moveDown(0.2);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.5).strokeColor(DIVIDER).stroke();
  doc.moveDown(0.4);
}

/** Boxed two-column label/value panel (meeting metadata, report header, …). */
export function drawMetaPanel(doc: PdfDoc, rows: [string, string][]): void {
  const { left, width } = contentBox(doc);
  const padX = 12;
  const padY = 10;
  const labelW = 130;
  const valueW = width - padX * 2 - labelW;
  const lineGap = 4;

  doc.font("Helvetica").fontSize(10);
  let inner = 0;
  const heights = rows.map(([, value]) => {
    const h = doc.heightOfString(value, { width: valueW });
    inner += h + lineGap;
    return h;
  });
  inner -= lineGap;
  const boxH = inner + padY * 2;
  const boxY = doc.y;

  doc.roundedRect(left, boxY, width, boxH, 4).fill(PANEL_BG);

  let cy = boxY + padY;
  rows.forEach(([label, value], i) => {
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(label.toUpperCase(), left + padX, cy + 1, { width: labelW });
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(10)
      .text(value, left + padX + labelW, cy, { width: valueW });
    cy += heights[i] + lineGap;
  });

  doc.y = boxY + boxH;
}

/** Stamp a footer (brand · page x of y · generated) on every buffered page. */
export function drawFooters(doc: PdfDoc, companyName: string): void {
  const { left, right } = contentBox(doc);
  const generated = `Generated ${formatDateTime(new Date())}`;
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - doc.page.margins.bottom + 12;
    // Footer sits inside the bottom margin band; zero the margin first so
    // text() doesn't treat it as overflow and spawn a blank page.
    doc.page.margins.bottom = 0;
    doc.moveTo(left, y - 6).lineTo(right, y - 6).lineWidth(0.5).strokeColor(DIVIDER).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    doc.text(companyName, left, y, { width: (right - left) / 3, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, left, y, {
      width: right - left,
      align: "center",
      lineBreak: false,
    });
    doc.text(generated, left, y, { width: right - left, align: "right", lineBreak: false });
  }
}
