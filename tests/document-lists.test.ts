import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

const SEED_SQL = readFileSync(
  join(__dirname, "..", "drizzle", "0020_document_register_lists.sql"),
  "utf-8",
);

const ctx = { actor: { id: "admin1", email: "admin@example.com" } };

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
  await db.execute(sql.raw(SEED_SQL));
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
});

async function useInDocument(opts: { categoryId?: string; typeId?: string; triggerId?: string }) {
  const { createDocument } = await import("@/lib/document-register");
  return createDocument({
    documentId: "QSE_MAN001",
    categoryId: opts.categoryId ?? "doc_cat_qse",
    typeId: opts.typeId ?? "doc_type_man",
    number: 1,
    title: "IMS Manual",
    triggerIds: opts.triggerId ? [opts.triggerId] : [],
  });
}

async function auditActions() {
  const { query } = await import("@/lib/audit");
  return (await query()).map((e) => ({
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    before: e.before,
    after: e.after,
  }));
}

describe("seeded lists", () => {
  it("seeds Categories, Types and Usage Triggers from IMS §4.2.1", async () => {
    const { listItems } = await import("@/lib/document-lists");
    expect((await listItems("doc_category")).map((i) => i.code)).toEqual([
      "QSE",
      "PRO",
      "MAR",
      "HR",
      "AM",
      "SAL",
    ]);
    expect((await listItems("doc_type")).map((i) => i.code)).toEqual([
      "TEMP",
      "MAN",
      "FRM",
      "CTR",
      "REG",
      "PLA",
      "GEN",
      "CHK",
      "COP",
      "SWMS",
      "SOP",
      "SOPS",
      "SOPE",
      "SOPQ",
      "SOPA",
      "SOPM",
      "POL",
    ]);
    expect((await listItems("doc_usage_trigger")).map((i) => i.label)).toEqual([
      "Onboarding",
      "Project start",
      "Site activity",
      "As required",
    ]);
  });
});

describe("code lock", () => {
  it("lets an unused code change", async () => {
    const { updateItem, listItems } = await import("@/lib/document-lists");
    await updateItem({ id: "doc_type_frm", code: "form", label: "Form" }, ctx);
    const frm = (await listItems("doc_type")).find((i) => i.id === "doc_type_frm");
    expect(frm?.code).toBe("FORM");
  });

  it("locks a Type code once a document uses it, but still allows relabelling", async () => {
    const { updateItem, listItems, CODE_LOCKED_MESSAGE } = await import("@/lib/document-lists");
    await useInDocument({});
    await expect(
      updateItem({ id: "doc_type_man", code: "MNL", label: "Manual" }, ctx),
    ).rejects.toThrow(CODE_LOCKED_MESSAGE);
    await updateItem({ id: "doc_type_man", code: "MAN", label: "Manuals" }, ctx);
    const man = (await listItems("doc_type")).find((i) => i.id === "doc_type_man");
    expect(man).toMatchObject({ code: "MAN", label: "Manuals", usage: 1 });
  });

  it("locks a Category code once a document uses it", async () => {
    const { updateItem } = await import("@/lib/document-lists");
    await useInDocument({});
    await expect(
      updateItem({ id: "doc_cat_qse", code: "QHSE", label: "Quality, Safety, Environmental" }, ctx),
    ).rejects.toThrow(/can't be changed/);
  });

  it("rejects a code another list item already has", async () => {
    const { addItem } = await import("@/lib/document-lists");
    await expect(addItem({ kind: "doc_category", code: "MAN", label: "Manuals" }, ctx)).rejects.toThrow(
      "Code MAN is already in use.",
    );
  });

  it("rejects a malformed code", async () => {
    const { addItem } = await import("@/lib/document-lists");
    await expect(addItem({ kind: "doc_type", code: "W H S", label: "x" }, ctx)).rejects.toThrow(
      /Code must be/,
    );
  });
});

describe("retire vs delete", () => {
  it("deletes an unused item", async () => {
    const { removeItem, listItems } = await import("@/lib/document-lists");
    expect(await removeItem("doc_type_cop", ctx)).toBe("deleted");
    expect((await listItems("doc_type")).some((i) => i.id === "doc_type_cop")).toBe(false);
  });

  it("retires a Type in use: hidden from pickers, still shown on its document", async () => {
    const { removeItem, listItems } = await import("@/lib/document-lists");
    const { listFilterOptions, findDocument } = await import("@/lib/document-register");
    const doc = await useInDocument({});
    expect(await removeItem("doc_type_man", ctx)).toBe("retired");

    const man = (await listItems("doc_type")).find((i) => i.id === "doc_type_man");
    expect(man?.active).toBe(false);
    expect((await listFilterOptions()).types.some((t) => t.id === "doc_type_man")).toBe(false);
    const found = await findDocument(doc.id, { includeDrafts: true });
    expect(found?.type.code).toBe("MAN");
  });

  it("retires a Usage Trigger in use and keeps it on the document", async () => {
    const { removeItem } = await import("@/lib/document-lists");
    const { listFilterOptions, findDocument } = await import("@/lib/document-register");
    const doc = await useInDocument({ triggerId: "doc_trg_onboarding" });
    expect(await removeItem("doc_trg_onboarding", ctx)).toBe("retired");
    expect((await listFilterOptions()).triggers.some((t) => t.id === "doc_trg_onboarding")).toBe(
      false,
    );
    const found = await findDocument(doc.id, { includeDrafts: true });
    expect(found?.triggers.map((t) => t.label)).toEqual(["Onboarding"]);
  });

  it("restores a retired item", async () => {
    const { removeItem, restoreItem, listItems } = await import("@/lib/document-lists");
    await useInDocument({});
    await removeItem("doc_cat_qse", ctx);
    await restoreItem("doc_cat_qse", ctx);
    const qse = (await listItems("doc_category")).find((i) => i.id === "doc_cat_qse");
    expect(qse?.active).toBe(true);
  });
});

describe("add and reorder", () => {
  it("adds to the end; Usage Trigger codes are generated from the label", async () => {
    const { addItem, listItems } = await import("@/lib/document-lists");
    await addItem({ kind: "doc_usage_trigger", label: "Onboarding" }, ctx);
    const triggers = await listItems("doc_usage_trigger");
    expect(triggers.at(-1)).toMatchObject({ label: "Onboarding", code: "TRG_ONBOARDING_2" });
  });

  it("moves an item up and down", async () => {
    const { moveItem, listItems } = await import("@/lib/document-lists");
    await moveItem({ id: "doc_cat_pro", direction: "up" }, ctx);
    expect((await listItems("doc_category")).slice(0, 2).map((i) => i.code)).toEqual([
      "PRO",
      "QSE",
    ]);
    await moveItem({ id: "doc_cat_pro", direction: "up" }, ctx); // already first: no-op
    await moveItem({ id: "doc_cat_pro", direction: "down" }, ctx);
    expect((await listItems("doc_category")).slice(0, 2).map((i) => i.code)).toEqual([
      "QSE",
      "PRO",
    ]);
  });
});

describe("audit log", () => {
  it("records every list change", async () => {
    const { addItem, updateItem, moveItem, removeItem, restoreItem } = await import(
      "@/lib/document-lists"
    );
    await useInDocument({});
    const added = await addItem({ kind: "doc_type", code: "WI", label: "Work Instruction" }, ctx);
    await updateItem({ id: added.id, code: "WIN", label: "Work Instruction" }, ctx);
    await moveItem({ id: added.id, direction: "up" }, ctx);
    await removeItem(added.id, ctx);
    await removeItem("doc_type_man", ctx);
    await restoreItem("doc_type_man", ctx);

    const events = (await auditActions()).reverse();
    expect(events.map((e) => [e.action, e.entityType, e.entityId])).toEqual([
      ["document_list.add", "doc_type", added.id],
      ["document_list.update", "doc_type", added.id],
      ["document_list.reorder", "doc_type", added.id],
      ["document_list.delete", "doc_type", added.id],
      ["document_list.retire", "doc_type", "doc_type_man"],
      ["document_list.restore", "doc_type", "doc_type_man"],
    ]);
    expect(events[1]).toMatchObject({
      before: { code: "WI", label: "Work Instruction" },
      after: { code: "WIN", label: "Work Instruction" },
    });
    expect(events[4]).toMatchObject({ before: { active: true }, after: { active: false } });
  });

  it("writes nothing when nothing changed", async () => {
    const { updateItem } = await import("@/lib/document-lists");
    await updateItem({ id: "doc_type_man", code: "MAN", label: "Manual" }, ctx);
    expect(await auditActions()).toEqual([]);
  });
});
