import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

type Role = "admin" | "project_manager" | "site_staff";

describe("permission matrix", () => {
  const MATRIX: Record<string, Record<Role, boolean>> = {
    "documents.view": { site_staff: true, project_manager: true, admin: true },
    "documents.history": { site_staff: false, project_manager: true, admin: true },
    "documents.manage": { site_staff: false, project_manager: false, admin: true },
  };

  for (const [capability, byRole] of Object.entries(MATRIX)) {
    for (const [role, expected] of Object.entries(byRole)) {
      it(`${role} ${expected ? "can" : "cannot"} ${capability}`, async () => {
        const { can } = await import("@/lib/auth-helpers");
        expect(can({ role: role as Role }, capability as "documents.view")).toBe(expected);
      });
    }
  }

  it("site_staff gains no other capability", async () => {
    const { can } = await import("@/lib/auth-helpers");
    expect(can({ role: "site_staff" }, "reports.view")).toBe(false);
    expect(can({ role: "site_staff" }, "contractflow.manage")).toBe(false);
  });
});

describe("review status", () => {
  it.each([
    ["2026-12-01", "2026-10-07", "ok"],
    ["2026-11-07", "2026-10-07", "ok"], // 31 days out
    ["2026-11-06", "2026-10-07", "due_soon"], // 30 days out
    ["2026-10-07", "2026-10-07", "due_soon"], // due today
    ["2026-10-06", "2026-10-07", "overdue"], // passed yesterday
    ["2025-01-01", "2026-10-07", "overdue"],
  ])("next review %s on %s is %s", async (next, today, expected) => {
    const { reviewStatus } = await import("@/lib/document-register");
    expect(reviewStatus(next, today)).toBe(expected);
  });

  it("is null with no Next Review Date", async () => {
    const { reviewStatus } = await import("@/lib/document-register");
    expect(reviewStatus(null, "2026-10-07")).toBeNull();
  });

  it("adds 12 months, clamping leap days", async () => {
    const { addMonthsIso } = await import("@/lib/document-register");
    expect(addMonthsIso("2026-10-07", 12)).toBe("2027-10-07");
    expect(addMonthsIso("2028-02-29", 12)).toBe("2029-02-28");
  });

  it("uses RIM's time zone for today", async () => {
    const { todayIso } = await import("@/lib/document-register");
    // 15:00 UTC is already the next day in Brisbane (UTC+10).
    expect(todayIso(new Date("2026-10-07T15:00:00Z"))).toBe("2026-10-08");
  });
});

describe("register data", () => {
  beforeAll(async () => {
    await startEphemeralPostgres();
  });

  afterAll(async () => {
    await stopEphemeralPostgres();
  });

  beforeEach(async () => {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`TRUNCATE "controlled_doc_reviews", "controlled_doc_versions",
      "controlled_doc_legacy_ids", "controlled_doc_usage_triggers", "controlled_documents" CASCADE`);
    await db.execute(sql`DELETE FROM "categories" WHERE "kind" LIKE 'doc_%'`);
  });

  async function seedLists() {
    const { db } = await import("@/db");
    const { categories } = await import("@/db/schema");
    const rows = [
      { id: "c_qse", code: "QSE", kind: "doc_category", label: "Quality, Safety, Environmental" },
      { id: "c_hr", code: "HR", kind: "doc_category", label: "Human Resources" },
      { id: "t_man", code: "MAN", kind: "doc_type", label: "Manual" },
      { id: "t_pol", code: "POL", kind: "doc_type", label: "Policy" },
      { id: "u_onb", code: "TRG_ONBOARDING", kind: "doc_usage_trigger", label: "Onboarding" },
      { id: "u_site", code: "TRG_SITE", kind: "doc_usage_trigger", label: "Site activity" },
    ];
    await db.insert(categories).values(rows);
  }

  async function issuedDoc(opts: {
    documentId: string;
    categoryId: string;
    typeId: string;
    number: number;
    title: string;
    dateIssued: string;
    legacyIds?: string[];
    triggerIds?: string[];
  }) {
    const { createDocument, createDraftVersion, issueVersion } = await import(
      "@/lib/document-register"
    );
    const doc = await createDocument({
      ...opts,
      legacyIds: opts.legacyIds?.map((legacyId) => ({ legacyId })),
    });
    const v = await createDraftVersion({ documentId: doc.id, content: [] });
    await issueVersion({
      versionId: v.id,
      approver: { id: null, name: "Karl Dedekind" },
      dateIssued: opts.dateIssued,
    });
    return doc;
  }

  it("hides unissued documents from non-admins", async () => {
    const { createDocument, createDraftVersion, listRegister, findDocument } = await import(
      "@/lib/document-register"
    );
    await seedLists();
    await issuedDoc({
      documentId: "QSE_MAN001",
      categoryId: "c_qse",
      typeId: "t_man",
      number: 1,
      title: "IMS Manual",
      dateIssued: "2026-10-01",
    });
    const draftOnly = await createDocument({
      documentId: "HR_POL001",
      categoryId: "c_hr",
      typeId: "t_pol",
      number: 1,
      title: "Drug and Alcohol Policy",
    });
    await createDraftVersion({ documentId: draftOnly.id, content: [] });

    const staff = await listRegister({ includeDrafts: false, today: "2026-10-07" });
    expect(staff.map((r) => r.documentId)).toEqual(["QSE_MAN001"]);
    expect(await findDocument(draftOnly.id, { includeDrafts: false })).toBeNull();

    const admin = await listRegister({ includeDrafts: true, today: "2026-10-07" });
    expect(admin.map((r) => [r.documentId, r.versionStatus])).toEqual([
      ["HR_POL001", "draft"],
      ["QSE_MAN001", "issued"],
    ]);
  });

  it("shows only the issued Version to non-admins when a new draft is open", async () => {
    const { createDraftVersion, findDocument, listVersionHistory } = await import(
      "@/lib/document-register"
    );
    await seedLists();
    const doc = await issuedDoc({
      documentId: "QSE_MAN001",
      categoryId: "c_qse",
      typeId: "t_man",
      number: 1,
      title: "IMS Manual",
      dateIssued: "2026-10-01",
    });
    await createDraftVersion({ documentId: doc.id, content: [] });

    const staffView = await findDocument(doc.id, { includeDrafts: false });
    expect(staffView?.current?.version).toBe(1);
    expect(staffView?.draft).toBeNull();
    expect((await listVersionHistory(doc.id, { includeDrafts: false })).map((v) => v.version)).toEqual([1]);
    expect((await listVersionHistory(doc.id, { includeDrafts: true })).map((v) => v.version)).toEqual([2, 1]);
  });

  it("issuing supersedes the previous Version and sets the Next Review Date", async () => {
    const { createDraftVersion, issueVersion, listVersionHistory } = await import(
      "@/lib/document-register"
    );
    await seedLists();
    const doc = await issuedDoc({
      documentId: "QSE_MAN001",
      categoryId: "c_qse",
      typeId: "t_man",
      number: 1,
      title: "IMS Manual",
      dateIssued: "2026-10-01",
    });
    const v2 = await createDraftVersion({ documentId: doc.id, content: [] });
    const issued = await issueVersion({
      versionId: v2.id,
      approver: { id: null, name: "Karl Dedekind" },
      dateIssued: "2027-03-15",
    });
    expect(issued.nextReviewDate).toBe("2028-03-15");
    expect(issued.approvedByName).toBe("Karl Dedekind");

    const history = await listVersionHistory(doc.id, { includeDrafts: false });
    expect(history.map((v) => [v.version, v.status, v.archiveDate])).toEqual([
      [2, "issued", null],
      [1, "superseded", "2027-03-15"],
    ]);
  });

  it("never deletes issued or Superseded Versions", async () => {
    const { db } = await import("@/db");
    const { controlledDocVersions, controlledDocuments } = await import("@/db/schema");
    const { createDraftVersion, issueVersion } = await import("@/lib/document-register");
    const { eq } = await import("drizzle-orm");
    await seedLists();
    const doc = await issuedDoc({
      documentId: "QSE_MAN001",
      categoryId: "c_qse",
      typeId: "t_man",
      number: 1,
      title: "IMS Manual",
      dateIssued: "2026-10-01",
    });
    const v2 = await createDraftVersion({ documentId: doc.id, content: [] });
    await issueVersion({ versionId: v2.id, approver: { id: null, name: "A" }, dateIssued: "2027-01-01" });

    await expect(
      db.delete(controlledDocVersions).where(eq(controlledDocVersions.status, "superseded")),
    ).rejects.toThrow();
    await expect(
      db.delete(controlledDocVersions).where(eq(controlledDocVersions.status, "issued")),
    ).rejects.toThrow();
    await expect(
      db.delete(controlledDocuments).where(eq(controlledDocuments.id, doc.id)),
    ).rejects.toThrow();

    // An unissued draft can still be abandoned.
    const v3 = await createDraftVersion({ documentId: doc.id, content: [] });
    await db.delete(controlledDocVersions).where(eq(controlledDocVersions.id, v3.id));
  });

  it("keeps the Number unique per Type across Categories, and Document IDs unique", async () => {
    const { createDocument } = await import("@/lib/document-register");
    await seedLists();
    await createDocument({ documentId: "HR_POL002", categoryId: "c_hr", typeId: "t_pol", number: 2, title: "A" });
    await expect(
      createDocument({ documentId: "QSE_POL002", categoryId: "c_qse", typeId: "t_pol", number: 2, title: "B" }),
    ).rejects.toThrow();
    await expect(
      createDocument({ documentId: "HR_POL002", categoryId: "c_hr", typeId: "t_man", number: 9, title: "C" }),
    ).rejects.toThrow();
    // Same number under a different Type is fine.
    await createDocument({ documentId: "QSE_MAN002", categoryId: "c_qse", typeId: "t_man", number: 2, title: "D" });
  });

  it("filters by Category, Type, Usage Trigger and review status, and searches Legacy IDs", async () => {
    const { listRegister } = await import("@/lib/document-register");
    await seedLists();
    await issuedDoc({
      documentId: "QSE_MAN001",
      categoryId: "c_qse",
      typeId: "t_man",
      number: 1,
      title: "IMS Manual",
      dateIssued: "2026-10-01", // next review 2027-10-01: ok
      legacyIds: ["QSE_MAN001_V2"],
      triggerIds: ["u_onb"],
    });
    await issuedDoc({
      documentId: "HR_POL008",
      categoryId: "c_hr",
      typeId: "t_pol",
      number: 8,
      title: "Drug and Alcohol Policy",
      dateIssued: "2025-10-20", // next review 2026-10-20: due soon
      legacyIds: ["HR_POL008_V3", "POL_005_V1"],
      triggerIds: ["u_onb", "u_site"],
    });
    await issuedDoc({
      documentId: "QSE_POL003",
      categoryId: "c_qse",
      typeId: "t_pol",
      number: 3,
      title: "Environmental Policy",
      dateIssued: "2025-06-01", // next review 2026-06-01: overdue
    });

    const ids = async (filters: Parameters<typeof listRegister>[0]["filters"]) =>
      (await listRegister({ includeDrafts: false, filters, today: "2026-10-07" })).map(
        (r) => r.documentId,
      );

    expect(await ids({ categoryId: "c_qse" })).toEqual(["QSE_MAN001", "QSE_POL003"]);
    expect(await ids({ typeId: "t_pol" })).toEqual(["HR_POL008", "QSE_POL003"]);
    expect(await ids({ triggerId: "u_site" })).toEqual(["HR_POL008"]);
    expect(await ids({ reviewStatus: "ok" })).toEqual(["QSE_MAN001"]);
    expect(await ids({ reviewStatus: "due_soon" })).toEqual(["HR_POL008"]);
    expect(await ids({ reviewStatus: "overdue" })).toEqual(["QSE_POL003"]);
    expect(await ids({ q: "pol_005" })).toEqual(["HR_POL008"]);
    expect(await ids({ q: "environmental" })).toEqual(["QSE_POL003"]);
    expect(await ids({ q: "100%" })).toEqual([]);
    expect(await ids({ categoryId: "c_qse", typeId: "t_pol" })).toEqual(["QSE_POL003"]);

    const [hr] = await listRegister({
      includeDrafts: false,
      filters: { q: "HR_POL008" },
      today: "2026-10-07",
    });
    expect(hr.triggers.map((t) => t.label)).toEqual(["Onboarding", "Site activity"]);
    expect(hr.version).toBe(1);
  });
});
