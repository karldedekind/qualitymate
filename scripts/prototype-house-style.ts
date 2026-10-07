/**
 * PROTOTYPE — throwaway. Do not import from app code.
 *
 * Question: what should the Document Register's House Style look like?
 * Renders the same Controlled Document (HR_POL008 DFV policy, verbatim) plus
 * a SWMS excerpt in three structurally different styles:
 *   A — IMS Manual look (green numbered headings, flowing text)
 *   B — Boxed look (current DFV policy: centred title, grey boxed sections)
 *   C — QualityMate look (app's RFI theme: brand band, meta panel, tinted section bars)
 *
 * Content is held as structured blocks (ADR 0001) — each variant is just a
 * different renderer over the same blocks.
 *
 * Run: npx tsx scripts/prototype-house-style.ts
 * Out: .scratch/document-register/prototypes/house-style-{A,B,C}.pdf
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), ".scratch", "document-register", "prototypes");
const LOGO = join(OUT_DIR, "logo-full.png");

const GREEN = "#95C236";
const GREY = "#5B5B58";
const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#d1d5db";
const PANEL = "#f3f4f6";

// ---------- Content (verbatim from HR_POL008_V3, typos and all) ----------

type Block =
  | { t: "section"; title: string }
  | { t: "p"; text: string }
  | { t: "bullets"; items: string[] }
  | { t: "defs"; rows: [string, string][] }
  | { t: "signature"; cols: string[] };

const META = {
  id: "HR_POL008",
  version: "V1",
  title: "Preventing and Addressing Domestic and Family Violence",
  typeLabel: "Policy 008",
  issued: "01/07/2026",
  nextReview: "01/07/2027",
  approver: "Will Dedekind",
  legacy: "HR_POL008_V3, POL_005_V1",
  history: [["V1", "Re-baselined from HR_POL008_V3", "01/07/2026"]] as [string, string, string][],
};

const DFV: Block[] = [
  { t: "section", title: "PURPOSE" },
  {
    t: "p",
    text: "The Company, RIM Construction is committed to providing a safe, supportive, and respectful work environment. This policy aims to outline our strategy and practices to prevent, identify, and respond to domestic and family violence (DFV). We recognize that DFV can significantly impact employees’ well-being, productivity, and workplace safety.",
  },
  { t: "section", title: "SCOPE" },
  {
    t: "p",
    text: "This policy applies to all employees, subcontractors, and other parties involved in RIM Construction operations. The company is committed to ensuring that all employees have access to the necessary support if they experience or are impacted by DFV.",
  },
  { t: "section", title: "DEFINITIONS" },
  {
    t: "defs",
    rows: [
      [
        "Domestic and Family Violence (DFV)",
        "Any act of violence or abuse that occurs within a domestic or family relationship, including physical, emotional, financial, sexual, and psychological abuse.",
      ],
    ],
  },
  { t: "section", title: "POLICY OBJECTIVES" },
  { t: "p", text: "RIM Construction is committed to:" },
  {
    t: "bullets",
    items: [
      "Promoting awareness of domestic and family violence and its impact on individuals and the workplace",
      "Helping support employees who are affected by DFV, ensuring their safety, and providing appropriate workplace options",
      "Encouraging employees to seek help and providing access to relevant support services",
      "Maintaining confidentiality and privacy for employees affected by DFV",
      "Ensuring managers and supervisors are trained to recognise the signs of DFV and respond appropriately",
    ],
  },
  { t: "section", title: "PREVENTION STRATEGY" },
  {
    t: "defs",
    rows: [
      ["Awareness", "Outlining the signs of DFV to supervisors, to help them recognize the signs of DFV and respond sensitively and effectively."],
      ["Workplace Culture", "Foster a culture of respect, support, and non-violence in the workplace by promoting diversity and inclusion and encouraging open communication around issues related to DFV."],
      ["Employee Support", "Provide internal and external resources that offer confidential support to employees facing DFV."],
    ],
  },
  { t: "section", title: "RESPONSE STRATEGY" },
  {
    t: "defs",
    rows: [
      ["Confidential Support", "Employees experiencing DFV can seek confidential support from their supervisor, manager or director. RIM Construction will ensure privacy and discretion in all matters related to DFV."],
      ["Flexible Working Arrangement", "Employees impacted by DFV may request flexible working conditions, including adjustments to work hours, location, or duties to accommodate their safety needs."],
      ["Safety Plan", "Where appropriate, RIM Construction will work with affected employees to help maintain a safe working environment"],
    ],
  },
  { t: "section", title: "ROLES AND RESPONSIBILITIES" },
  {
    t: "defs",
    rows: [
      ["Employees", "Employees are encouraged to report incidents of DFV impacting their work or colleagues. If an employee witnesses or suspects DFV, they should approach supervisor, manager or director"],
      ["Managers / Supervisors", "Managers are responsible for responding sensitively to any reports of DFV, maintaining confidentiality, and assisting employees in accessing appropriate resources and support."],
    ],
  },
  { t: "section", title: "SUPPORT SERVICES" },
  { t: "p", text: "RIM Construction encourages employees experiencing or impacted by DFV to seek professional help. Some available services include:" },
  {
    t: "bullets",
    items: [
      "Employee Assistance Program (EAP): A confidential service offering counseling and support for employees dealing with personal issues, including DFV.",
      "National Domestic Violence Helpline: 1800 737 732 (24/7 support).",
      "MensLine Australia: 1300 78 99 78 (counseling for men in crisis).",
      "1800 RESPECT: A national sexual assault, domestic and family violence counseling service (1800 737 732).",
    ],
  },
  { t: "section", title: "NON-COMPLIANCE AND DISCIPLINARY ACTION" },
  {
    t: "p",
    text: "Any employee found to be perpetrating DFV or engaging in violence or abusive behavior in the workplace may be subject to disciplinary action, including dismissal. RIM Construction maintains a zero-tolerance policy regarding any form of violence, whether in the workplace or outside of it.",
  },
  { t: "section", title: "ACKNOWLEDGEMENT" },
  {
    t: "p",
    text: "I declare that I have read and understood the Company's Policy on Preventing and Addressing Domestic and Family Violence. I acknowledge that I have had the opportunity to ask questions or clarify any points contained within the document.",
  },
  {
    t: "p",
    text: "I acknowledge that this policy applies to me during my employment. I understand that it is a condition of my employment to comply with all Company policies and/or procedures which may be subject to variation or change from time to time.",
  },
  {
    t: "p",
    text: "I further acknowledge that my signature confirming receipt and understanding of this policy may also be found on the “Policy Transmittal” (Regardless of the naming structure relevant at the time of signature)",
  },
  { t: "signature", cols: ["Employee / Worker Name", "Job Role / Position", "Signature", "Date"] },
];

// SWMS excerpt — shows how a dense, table-heavy Template sits in each style.
const SWMS_META = { id: "QSE_SWMS001", version: "V1", title: "Safe Work Method Statement", sub: "Accessing Heights" };
const SWMS_DETAILS: [string, string, string, string][] = [
  ["Work Location", "«Job Site»", "Activity", "Accessing Heights"],
  ["SWMS Written by", "Will Dedekind", "Site Supervisor", "Phil Randall"],
  ["Project Name", "«Project Name»", "Principal Contractor", "RIM Construction"],
  ["Site Address", "«Site Address»", "Project Number", "«Job Number»"],
];
const MATRIX_HEAD = ["", "Insignificant [1]", "Minor [2]", "Moderate [3]", "Major [4]", "Catastrophic [5]"];
const MATRIX: string[][] = [
  ["Almost Certain [5]", "Moderate (5)", "High (10)", "High (15)", "Catastrophic (20)", "Catastrophic (25)"],
  ["Likely [4]", "Moderate (4)", "Moderate (8)", "High (12)", "Catastrophic (16)", "Catastrophic (20)"],
  ["Possible [3]", "Low (3)", "Moderate (6)", "Moderate (9)", "High (12)", "High (15)"],
  ["Unlikely [2]", "Low (2)", "Moderate (4)", "Moderate (6)", "Moderate (8)", "High (10)"],
  ["Rare [1]", "Low (1)", "Low (2)", "Low (3)", "Moderate (4)", "Moderate (5)"],
];
const RISK_FILL: Record<string, string> = { Low: "#dcfce7", Moderate: "#fef9c3", High: "#fed7aa", Catastrophic: "#fecaca" };

// ---------- Shared helpers ----------

// biome-ignore lint/suspicious/noExplicitAny: prototype
type Doc = any;

const L = 50;
const W = 595.28 - L * 2;

function space(doc: Doc, need: number) {
  if (doc.y + need > doc.page.height - 70) doc.addPage();
}

function titleCase(s: string) {
  // Presentation-only case change; wording untouched (Fidelity Check compares case-insensitively).
  return s.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (_m, a, b) => a + b.toUpperCase()).replace(/\bDfv\b/g, "DFV");
}

function table(
  doc: Doc,
  rows: string[][],
  widths: number[],
  opts: { head?: boolean; fills?: (r: number, c: number, v: string) => string | null; bold?: (r: number, c: number) => boolean; size?: number; border?: string; pad?: number } = {},
) {
  const size = opts.size ?? 9;
  const pad = opts.pad ?? 5;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const hs = row.map((v, c) => {
      doc.font(opts.bold?.(r, c) || (opts.head && r === 0) ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      return doc.heightOfString(v || " ", { width: widths[c] - pad * 2 });
    });
    const h = Math.max(...hs) + pad * 2;
    space(doc, h);
    const y = doc.y;
    let x = L;
    row.forEach((v, c) => {
      const fill = opts.fills?.(r, c, v) ?? (opts.head && r === 0 ? PANEL : null);
      if (fill) doc.rect(x, y, widths[c], h).fill(fill);
      doc.rect(x, y, widths[c], h).lineWidth(0.5).strokeColor(opts.border ?? LINE).stroke();
      doc
        .fillColor(INK)
        .font(opts.bold?.(r, c) || (opts.head && r === 0) ? "Helvetica-Bold" : "Helvetica")
        .fontSize(size)
        .text(v, x + pad, y + pad, { width: widths[c] - pad * 2 });
      x += widths[c];
    });
    doc.y = y + h;
  }
  doc.x = L;
}

function versionBlock(doc: Doc, heading: (d: Doc, t: string) => void) {
  space(doc, 170);
  heading(doc, "Document Version");
  table(
    doc,
    [
      ["Document ID", META.id, "Version", META.version],
      ["Date Issued", META.issued, "Next Review Date", META.nextReview],
      ["Approved By", META.approver, "Legacy ID", META.legacy],
    ],
    [W * 0.2, W * 0.3, W * 0.2, W * 0.3],
    { fills: (_r, c) => (c % 2 === 0 ? PANEL : null), bold: (_r, c) => c % 2 === 0 },
  );
  doc.moveDown(0.6);
  table(doc, [["Version #", "Change", "Date"], ...META.history], [W * 0.15, W * 0.6, W * 0.25], { head: true });
}

function footers(doc: Doc, id: string, accent: string) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 40;
    doc.moveTo(L, y - 6).lineTo(L + W, y - 6).lineWidth(0.5).strokeColor(accent).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    doc.text(`${id}_${META.version}`, L, y, { width: W / 3, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, L, y, { width: W, align: "center", lineBreak: false });
    doc.text("Uncontrolled when printed", L, y, { width: W, align: "right", lineBreak: false });
  }
}

function signature(doc: Doc, cols: string[]) {
  doc.moveDown(0.5);
  table(doc, [cols, ["", "", "", ""]], cols.map(() => W / cols.length), {
    head: true,
    fills: (r) => (r === 0 ? PANEL : null),
  });
  // give the blank row writing height
  doc.y += 14;
}

function matrix(doc: Doc, headFill: string) {
  table(doc, [MATRIX_HEAD, ...MATRIX], [W * 0.2, ...Array(5).fill(W * 0.16)], {
    head: true,
    size: 8,
    fills: (r, c, v) => (r === 0 ? headFill : c === 0 ? PANEL : RISK_FILL[v.split(" ")[0]] ?? null),
    bold: (r, c) => r === 0 || c === 0,
  });
}

// ---------- Variant A: IMS Manual look ----------

function renderA(doc: Doc) {
  const logo = () => {
    doc.image(LOGO, L, 28, { width: 62 });
    doc.y = 80;
  };
  doc.on("pageAdded", logo);
  logo();

  doc.font("Helvetica-Bold").fontSize(20).fillColor(GREEN).text(META.title, L, doc.y, { width: W });
  doc.font("Helvetica").fontSize(10).fillColor(GREY).text(`${META.id}_${META.version}  ·  ${META.typeLabel}`, { width: W });
  doc.moveDown(1);

  let n = 0;
  const h = (d: Doc, t: string) => {
    space(d, 50);
    d.moveDown(0.4);
    d.font("Helvetica-Bold").fontSize(14).fillColor(GREEN).text(t, L, d.y, { width: W });
    d.moveDown(0.3);
  };
  for (const b of DFV) {
    if (b.t === "section") h(doc, `${++n}. ${titleCase(b.title)}`);
    else if (b.t === "p") doc.font("Helvetica").fontSize(10).fillColor(INK).text(b.text, L, doc.y, { width: W, lineGap: 3 }).moveDown(0.5);
    else if (b.t === "bullets") doc.font("Helvetica").fontSize(10).fillColor(INK).list(b.items, L + 10, doc.y, { width: W - 10, lineGap: 3, bulletRadius: 1.8, textIndent: 12 }).moveDown(0.5);
    else if (b.t === "defs")
      for (const [k, v] of b.rows) {
        space(doc, 30);
        doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(`${k}: `, L, doc.y, { width: W, continued: true, lineGap: 3 }).font("Helvetica").text(v).moveDown(0.4);
      }
    else if (b.t === "signature") signature(doc, b.cols);
    doc.x = L;
  }
  versionBlock(doc, (d, t) => h(d, t));

  // SWMS excerpt
  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(20).fillColor(GREEN).text(`${SWMS_META.title} — ${SWMS_META.sub}`, L, doc.y, { width: W });
  doc.font("Helvetica").fontSize(10).fillColor(GREY).text(`${SWMS_META.id}_${SWMS_META.version}  ·  Template (excerpt)`).moveDown(1);
  h(doc, "1. SWMS Details");
  table(doc, SWMS_DETAILS, [W * 0.2, W * 0.3, W * 0.2, W * 0.3], { fills: (_r, c) => (c % 2 === 0 ? PANEL : null), bold: (_r, c) => c % 2 === 0 });
  h(doc, "2. Risk Matrix");
  matrix(doc, PANEL);
  footers(doc, META.id, GREEN);
}

// ---------- Variant B: Boxed look (current DFV style) ----------

function renderB(doc: Doc) {
  const logo = () => {
    doc.image(LOGO, L, 28, { width: 70 });
    doc.y = 86;
  };
  doc.on("pageAdded", logo);
  logo();

  doc.font("Helvetica-Bold").fontSize(17).fillColor("#000").text(META.title, L, doc.y, { width: W, align: "center" });
  doc.text(`(${META.typeLabel})`, { width: W, align: "center" }).moveDown(0.8);

  const h = (d: Doc, t: string) => {
    space(d, 50);
    const y = d.y;
    d.rect(L, y, W, 18).fill("#d9d9d9");
    d.rect(L, y, W, 18).lineWidth(0.6).strokeColor("#000").stroke();
    d.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(t.toUpperCase(), L, y + 5, { width: W, align: "center" });
    d.y = y + 18;
  };
  // Bordered body box around free text, like the source
  const boxed = (draw: () => void, estimate: number) => {
    space(doc, estimate);
    const y0 = doc.y;
    doc.y += 5;
    draw();
    doc.y += 4;
    doc.rect(L, y0, W, doc.y - y0).lineWidth(0.6).strokeColor("#000").stroke();
  };
  for (let i = 0; i < DFV.length; i++) {
    const b = DFV[i];
    if (b.t === "section") {
      doc.moveDown(0.8);
      h(doc, b.title);
    } else if (b.t === "p") {
      doc.font("Helvetica").fontSize(9.5);
      const est = doc.heightOfString(b.text, { width: W - 10 }) + 12;
      boxed(() => doc.fillColor("#000").text(b.text, L + 5, doc.y, { width: W - 10 }), est);
    } else if (b.t === "bullets") {
      boxed(() => doc.font("Helvetica").fontSize(9.5).fillColor("#000").list(b.items, L + 18, doc.y, { width: W - 28, bulletRadius: 1.8, textIndent: 10 }), 80);
    } else if (b.t === "defs") {
      table(doc, b.rows, [W * 0.2, W * 0.8], { border: "#000", bold: (_r, c) => c === 0, size: 9.5 });
    } else if (b.t === "signature") signature(doc, b.cols);
    doc.x = L;
  }
  doc.moveDown(0.8);
  versionBlock(doc, (d, t) => {
    d.moveDown(0.6);
    h(d, t);
  });

  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(17).fillColor("#000").text(SWMS_META.title, L, doc.y, { width: W, align: "center" });
  doc.text(`(${SWMS_META.sub})`, { width: W, align: "center" }).moveDown(0.8);
  h(doc, "SWMS Details");
  table(doc, SWMS_DETAILS, [W * 0.2, W * 0.3, W * 0.2, W * 0.3], { border: "#000", bold: (_r, c) => c % 2 === 0 });
  doc.moveDown(0.8);
  h(doc, "Risk Matrix");
  matrix(doc, "#d9d9d9");
  footers(doc, META.id, "#000");
}

// ---------- Variant C: QualityMate look (app RFI theme, RIM green) ----------

function tint(hex: string, a: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(c + (255 - c) * a).toString(16).padStart(2, "0");
  return `#${m((n >> 16) & 255)}${m((n >> 8) & 255)}${m(n & 255)}`;
}

function renderC(doc: Doc) {
  const band = (title: string, sub: string) => {
    const top = 36;
    doc.image(LOGO, L, top, { width: 66 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text(sub.toUpperCase(), L + 80, top + 4, { width: W - 80, characterSpacing: 0.8 });
    doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(title, L + 80, doc.y + 2, { width: W - 80 });
    const ry = Math.max(doc.y, top + 44) + 8;
    doc.moveTo(L, ry).lineTo(L + W, ry).lineWidth(2).strokeColor(GREEN).stroke();
    doc.y = ry + 14;
  };
  const meta = (rows: [string, string][]) => {
    const y = doc.y;
    const colW = W / rows.length;
    doc.roundedRect(L, y, W, 40, 4).fill(PANEL);
    rows.forEach(([k, v], i) => {
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED).text(k.toUpperCase(), L + 12 + i * colW, y + 8, { width: colW - 16, characterSpacing: 0.5 });
      doc.font("Helvetica").fontSize(10).fillColor(INK).text(v, L + 12 + i * colW, y + 21, { width: colW - 16 });
    });
    doc.y = y + 52;
  };
  const h = (d: Doc, t: string) => {
    space(d, 50);
    const y = d.y;
    d.roundedRect(L, y, W, 22, 4).fill(tint(GREEN, 0.85));
    d.roundedRect(L, y, 4, 22, 2).fill(GREEN);
    d.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(t.toUpperCase(), L + 16, y + 7, { width: W - 28, characterSpacing: 0.6 });
    d.y = y + 30;
  };

  band(META.title, `${META.typeLabel} · Human Resources`);
  meta([
    ["Document ID", `${META.id}_${META.version}`],
    ["Issued", META.issued],
    ["Next review", META.nextReview],
    ["Approved by", META.approver],
  ]);
  doc.on("pageAdded", () => {
    doc.y = 50;
  });

  for (const b of DFV) {
    if (b.t === "section") {
      doc.moveDown(0.4);
      h(doc, b.title);
    } else if (b.t === "p") doc.font("Helvetica").fontSize(10).fillColor(INK).text(b.text, L, doc.y, { width: W, lineGap: 2.5 }).moveDown(0.5);
    else if (b.t === "bullets") doc.font("Helvetica").fontSize(10).fillColor(INK).list(b.items, L + 8, doc.y, { width: W - 8, lineGap: 2.5, bulletRadius: 1.8, textIndent: 12 }).moveDown(0.5);
    else if (b.t === "defs") {
      for (const [k, v] of b.rows) {
        doc.font("Helvetica").fontSize(10);
        const hh = doc.heightOfString(v, { width: W * 0.72 });
        space(doc, hh + 8);
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text(k.toUpperCase(), L, y + 1, { width: W * 0.25, characterSpacing: 0.4 });
        doc.font("Helvetica").fontSize(10).fillColor(INK).text(v, L + W * 0.28, y, { width: W * 0.72 });
        doc.y = Math.max(doc.y, y + 14) + 8;
      }
    } else if (b.t === "signature") signature(doc, b.cols);
    doc.x = L;
  }
  doc.moveDown(0.5);
  versionBlock(doc, h);

  doc.addPage();
  doc.y = 0;
  band(`${SWMS_META.title} — ${SWMS_META.sub}`, "Template · Quality, Safety & Environmental");
  meta([
    ["Document ID", `${SWMS_META.id}_${SWMS_META.version}`],
    ["Issued", META.issued],
    ["Next review", META.nextReview],
    ["Approved by", META.approver],
  ]);
  h(doc, "SWMS Details");
  table(doc, SWMS_DETAILS, [W * 0.2, W * 0.3, W * 0.2, W * 0.3], { fills: (_r, c) => (c % 2 === 0 ? PANEL : null), bold: (_r, c) => c % 2 === 0 });
  doc.moveDown(0.8);
  h(doc, "Risk Matrix");
  matrix(doc, tint(GREEN, 0.85));
  footers(doc, META.id, GREEN);
}

// ---------- Main ----------

async function main() {
  const PDFDocument = ((await import("pdfkit")) as { default: new (o: object) => Doc }).default;
  await mkdir(OUT_DIR, { recursive: true });
  const variants: [string, (d: Doc) => void][] = [
    ["A", renderA],
    ["B", renderB],
    ["C", renderC],
  ];
  for (const [name, render] of variants) {
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, left: L, right: L, bottom: 60 }, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((res, rej) => {
      doc.on("end", res);
      doc.on("error", rej);
    });
    render(doc);
    doc.end();
    await done;
    const out = join(OUT_DIR, `house-style-${name}.pdf`);
    await writeFile(out, Buffer.concat(chunks));
    console.log(`wrote ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
