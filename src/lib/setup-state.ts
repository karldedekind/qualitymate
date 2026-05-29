import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { setupState, user } from "@/db/schema";
import { env } from "@/lib/env";

export type SetupStatus = {
  completed: boolean;
  step: string;
  companyName: string | null;
  companyShortName: string | null;
  primaryColor: string | null;
  unlockedByRecovery: boolean;
};

async function readRow() {
  const rows = await db.select().from(setupState).where(eq(setupState.id, 1)).limit(1);
  if (rows.length === 0) {
    await db.insert(setupState).values({ id: 1 }).onConflictDoNothing();
    const created = await db.select().from(setupState).where(eq(setupState.id, 1)).limit(1);
    return created[0]!;
  }
  return rows[0]!;
}

async function adminCount(): Promise<number> {
  const result = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM "user" WHERE "role" = 'admin' AND "deactivated_at" IS NULL`,
  );
  return Number(result[0]?.n ?? 0);
}

export async function getStatus(recoveryPassphrase?: string | null): Promise<SetupStatus> {
  const row = await readRow();
  const completed = row.completedAt != null;
  let unlockedByRecovery = false;

  if (completed && env.RECOVERY_PASSPHRASE && recoveryPassphrase) {
    const matches = recoveryPassphrase === env.RECOVERY_PASSPHRASE;
    const empty = (await adminCount()) === 0;
    unlockedByRecovery = matches && empty;
  }

  return {
    completed,
    step: row.step,
    companyName: row.companyName,
    companyShortName: row.companyShortName,
    primaryColor: row.primaryColor,
    unlockedByRecovery,
  };
}

export async function isLocked(recoveryPassphrase?: string | null): Promise<boolean> {
  const status = await getStatus(recoveryPassphrase);
  return status.completed && !status.unlockedByRecovery;
}

export async function saveCompanyInfo(input: {
  companyName: string;
  companyShortName: string;
  primaryColor: string;
}): Promise<void> {
  await db
    .update(setupState)
    .set({
      companyName: input.companyName,
      companyShortName: input.companyShortName,
      primaryColor: input.primaryColor,
      step: "admin",
      updatedAt: new Date(),
    })
    .where(eq(setupState.id, 1));
}

export async function markComplete(): Promise<void> {
  await db
    .update(setupState)
    .set({ step: "done", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(setupState.id, 1));
}

export async function unlockForRecovery(): Promise<void> {
  await db
    .update(setupState)
    .set({ step: "admin", completedAt: null, updatedAt: new Date() })
    .where(eq(setupState.id, 1));
}

export async function hasAnyAdmin(): Promise<boolean> {
  return (await adminCount()) > 0;
}
