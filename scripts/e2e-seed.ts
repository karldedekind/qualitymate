import { eq } from "drizzle-orm";
import { runMigrations } from "@/db/migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[e2e-seed] DATABASE_URL is required");
    process.exit(1);
  }

  await runMigrations(url);

  // Defer drizzle/auth imports so the schema and pool pick up DATABASE_URL.
  const { db } = await import("@/db");
  const { user, jobs, categories, setupState } = await import("@/db/schema");
  const { auth } = await import("@/lib/auth");
  const { set, KNOWN_KEYS } = await import("@/lib/settings");

  const ADMIN_EMAIL = "admin@e2e.local";
  const STAFF_EMAIL = "staff@e2e.local";
  const PASSWORD = "PasswordE2E!2026";

  for (const [email, name, role] of [
    [ADMIN_EMAIL, "E2E Admin", "admin"],
    [STAFF_EMAIL, "E2E Staff", "site_staff"],
  ] as const) {
    const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
    if (existing.length > 0) continue;
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
    await db
      .update(user)
      .set({ role, emailVerified: true, updatedAt: new Date() })
      .where(eq(user.email, email));
  }

  // Set admin as the ISO management rep (director) so they can approve meetings.
  const adminUser = await db.select().from(user).where(eq(user.email, ADMIN_EMAIL)).limit(1);
  if (adminUser[0]) {
    await set(KNOWN_KEYS.ISO_MANAGEMENT_REP, adminUser[0].id);
  }

  // Mark setup as complete so /login is the entrypoint for non-setup specs.
  await db
    .insert(setupState)
    .values({ id: 1, step: "done", companyName: "E2E Construction", completedAt: new Date() })
    .onConflictDoUpdate({
      target: setupState.id,
      set: { step: "done", companyName: "E2E Construction", completedAt: new Date() },
    });

  // Seed one job + category so incident & action specs have a target.
  const { randomUUID } = await import("node:crypto");
  const existingJob = await db.select().from(jobs).where(eq(jobs.number, "E2E-001")).limit(1);
  if (existingJob.length === 0) {
    await db.insert(jobs).values({
      id: randomUUID(),
      number: "E2E-001",
      name: "E2E Job",
      address: "1 Test St",
      active: true,
    });
  }
  const existingCat = await db
    .select()
    .from(categories)
    .where(eq(categories.code, "E2E_CAT"))
    .limit(1);
  if (existingCat.length === 0) {
    await db.insert(categories).values({
      id: randomUUID(),
      code: "E2E_CAT",
      kind: "company",
      label: "E2E Subcontractor",
      sortOrder: 0,
      active: true,
    });
  }

  console.log("[e2e-seed] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[e2e-seed] failed:", err);
  process.exit(1);
});
