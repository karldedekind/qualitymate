/**
 * Admin-editable lists for the Document Register: Document Categories,
 * Document Types and Usage Triggers. All three are rows in `categories`.
 *
 * Rules that protect issued Document IDs:
 * - Labels can always be renamed.
 * - A Category/Type code is locked once any Controlled Document uses it.
 * - Removing an item in use retires it (active=false); unused items are deleted.
 * Every change is written to the audit log.
 */
import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, like } from "drizzle-orm";
import { db } from "@/db";
import {
  DOC_CATEGORY_KIND,
  DOC_TYPE_KIND,
  DOC_USAGE_TRIGGER_KIND,
  categories,
  controlledDocUsageTriggers,
  controlledDocuments,
} from "@/db/schema";
import { type Actor, type RequestMeta, record } from "@/lib/audit";

export type DocListKind =
  | typeof DOC_CATEGORY_KIND
  | typeof DOC_TYPE_KIND
  | typeof DOC_USAGE_TRIGGER_KIND;

export const DOC_LIST_KINDS: readonly DocListKind[] = [
  DOC_CATEGORY_KIND,
  DOC_TYPE_KIND,
  DOC_USAGE_TRIGGER_KIND,
];

/** Categories and Types have a code that goes into the Document ID. */
export function hasVisibleCode(kind: DocListKind): boolean {
  return kind !== DOC_USAGE_TRIGGER_KIND;
}

export const CODE_LOCKED_MESSAGE =
  "This code is used in issued Document IDs, so it can't be changed. To change it, add the new code, retire this one, and re-issue the affected documents as new Versions.";

export class DocListError extends Error {}

export type DocListItem = {
  id: string;
  kind: DocListKind;
  code: string;
  label: string;
  sortOrder: number;
  active: boolean;
  /** Number of Controlled Documents using this item. */
  usage: number;
};

type Ctx = { actor: Actor; request?: RequestMeta };

const CODE_RE = /^[A-Z][A-Z0-9]{1,9}$/;

function newId(): string {
  return randomBytes(12).toString("base64url");
}

function normaliseCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    throw new DocListError("Code must be 2–10 letters or digits, starting with a letter.");
  }
  return code;
}

function normaliseLabel(raw: string): string {
  const label = raw.trim();
  if (!label) throw new DocListError("Label is required.");
  if (label.length > 200) throw new DocListError("Label is too long.");
  return label;
}

/** Postgres error code; drizzle wraps the driver error in `cause`. */
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === "23505";
}

async function usageCount(item: { id: string; kind: string }): Promise<number> {
  const [row] =
    item.kind === DOC_CATEGORY_KIND
      ? await db
          .select({ n: count() })
          .from(controlledDocuments)
          .where(eq(controlledDocuments.categoryId, item.id))
      : item.kind === DOC_TYPE_KIND
        ? await db
            .select({ n: count() })
            .from(controlledDocuments)
            .where(eq(controlledDocuments.typeId, item.id))
        : await db
            .select({ n: count() })
            .from(controlledDocUsageTriggers)
            .where(eq(controlledDocUsageTriggers.triggerId, item.id));
  return Number(row?.n ?? 0);
}

async function getItem(id: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  if (!row || !(DOC_LIST_KINDS as readonly string[]).includes(row.kind)) {
    throw new DocListError("List item not found.");
  }
  return row;
}

function snapshot(row: typeof categories.$inferSelect) {
  return { code: row.code, label: row.label, sortOrder: row.sortOrder, active: row.active };
}

async function audit(
  ctx: Ctx,
  action: string,
  row: { id: string; kind: string },
  before: unknown,
  after: unknown,
) {
  await record({
    actor: ctx.actor,
    action: `document_list.${action}`,
    entity: { type: row.kind, id: row.id },
    before,
    after,
    request: ctx.request,
  });
}

/** Every item of a list, retired ones included, in display order. */
export async function listItems(kind: DocListKind): Promise<DocListItem[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.kind, kind))
    .orderBy(asc(categories.sortOrder), asc(categories.label));
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      kind,
      code: r.code,
      label: r.label,
      sortOrder: r.sortOrder,
      active: r.active,
      usage: await usageCount(r),
    })),
  );
}

/** Usage Trigger codes are internal: derived from the label, made unique. */
async function triggerCode(label: string): Promise<string> {
  const base = `TRG_${label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`.slice(
    0,
    40,
  );
  const taken = new Set(
    (
      await db
        .select({ code: categories.code })
        .from(categories)
        .where(like(categories.code, `${base}%`))
    ).map((r) => r.code),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

export async function addItem(
  input: { kind: DocListKind; code?: string; label: string },
  ctx: Ctx,
): Promise<DocListItem> {
  const label = normaliseLabel(input.label);
  const code = hasVisibleCode(input.kind)
    ? normaliseCode(input.code ?? "")
    : await triggerCode(label);
  const [last] = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(eq(categories.kind, input.kind))
    .orderBy(desc(categories.sortOrder))
    .limit(1);
  let row: typeof categories.$inferSelect;
  try {
    [row] = await db
      .insert(categories)
      .values({
        id: newId(),
        kind: input.kind,
        code,
        label,
        sortOrder: (last?.sortOrder ?? 0) + 10,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) throw new DocListError(`Code ${code} is already in use.`);
    throw err;
  }
  await audit(ctx, "add", row, null, snapshot(row));
  return { ...row, kind: input.kind, usage: 0 };
}

/** Renames an item. The code can change only while no document uses it. */
export async function updateItem(
  input: { id: string; label: string; code?: string },
  ctx: Ctx,
): Promise<void> {
  const row = await getItem(input.id);
  const label = normaliseLabel(input.label);
  let code = row.code;
  if (hasVisibleCode(row.kind as DocListKind) && input.code !== undefined) {
    code = normaliseCode(input.code);
    if (code !== row.code && (await usageCount(row)) > 0) {
      throw new DocListError(CODE_LOCKED_MESSAGE);
    }
  }
  if (code === row.code && label === row.label) return;
  try {
    await db.update(categories).set({ code, label }).where(eq(categories.id, row.id));
  } catch (err) {
    if (isUniqueViolation(err)) throw new DocListError(`Code ${code} is already in use.`);
    throw err;
  }
  await audit(ctx, "update", row, snapshot(row), { ...snapshot(row), code, label });
}

/** Swaps an item with its neighbour in the list. */
export async function moveItem(
  input: { id: string; direction: "up" | "down" },
  ctx: Ctx,
): Promise<void> {
  const row = await getItem(input.id);
  const siblings = await db
    .select()
    .from(categories)
    .where(eq(categories.kind, row.kind))
    .orderBy(asc(categories.sortOrder), asc(categories.label));
  const i = siblings.findIndex((s) => s.id === row.id);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return;
  // Renumber the whole list so ties never block a swap.
  const order = siblings.map((s) => s.id);
  [order[i], order[j]] = [order[j], order[i]];
  await db.transaction(async (tx) => {
    for (const [n, id] of order.entries()) {
      await tx
        .update(categories)
        .set({ sortOrder: (n + 1) * 10 })
        .where(and(eq(categories.id, id), eq(categories.kind, row.kind)));
    }
  });
  await audit(
    ctx,
    "reorder",
    row,
    { position: i + 1 },
    { position: j + 1, direction: input.direction },
  );
}

/**
 * Removes an item. In use: retired (hidden from pickers and filters, still
 * shown on its documents). Unused: deleted.
 */
export async function removeItem(id: string, ctx: Ctx): Promise<"retired" | "deleted"> {
  const row = await getItem(id);
  if ((await usageCount(row)) > 0) {
    if (row.active) {
      await db.update(categories).set({ active: false }).where(eq(categories.id, row.id));
      await audit(ctx, "retire", row, snapshot(row), { ...snapshot(row), active: false });
    }
    return "retired";
  }
  try {
    await db.delete(categories).where(eq(categories.id, row.id));
  } catch (err) {
    // A document started using it since the check (FK restrict).
    if (pgCode(err) === "23503") {
      throw new DocListError("This item has just been used by a document. Try again to retire it.");
    }
    throw err;
  }
  await audit(ctx, "delete", row, snapshot(row), null);
  return "deleted";
}

/** Brings a retired item back into pickers and filters. */
export async function restoreItem(id: string, ctx: Ctx): Promise<void> {
  const row = await getItem(id);
  if (row.active) return;
  await db.update(categories).set({ active: true }).where(eq(categories.id, row.id));
  await audit(ctx, "restore", row, snapshot(row), { ...snapshot(row), active: true });
}
