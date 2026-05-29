import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { expect, test } from "@playwright/test";

// Spec 5 cold-boots the install: it wipes the seeded DB, restarts the
// setup wizard, completes it, and signs the first admin in.
// MUST run last because it destroys the seeded fixtures the other specs use.

test.describe.configure({ mode: "serial" });

test("setup wizard from empty DB to first admin login", async ({ page }) => {
  const cfg = JSON.parse(
    readFileSync(join(process.cwd(), "e2e", ".e2e-config.json"), "utf-8"),
  ) as { databaseUrl: string };

  const sql = postgres(cfg.databaseUrl, { max: 1 });
  try {
    await sql`TRUNCATE
      "setup_state","verification","account","session","audit_log",
      "incident_photos","incidents","corrective_actions","register_entries",
      "site_attendances","jobs","categories","meetings",
      "notifications","invite","user","settings","heartbeats","heartbeat_instances"
      CASCADE`;
  } finally {
    await sql.end({ timeout: 5 });
  }

  await page.goto("/setup");
  await page.fill('input[name="companyName"]', "Setup E2E Co");
  await page.fill('input[name="companyShortName"]', "SETUP");
  await page.fill('input[name="adminName"]', "First Admin");
  await page.fill('input[name="adminEmail"]', "first.admin@e2e.local");
  await page.fill('input[name="adminPassword"]', "PasswordSetupE2E!2026");
  await page.getByRole("button", { name: /(complete|finish|create|save)/i }).first().click();

  // Wizard typically redirects to /login or /dashboard after success.
  await page.waitForURL(/\/login|\/dashboard/, { timeout: 30_000 });

  // If at /login, sign in. Otherwise assume already authenticated.
  if (page.url().includes("/login")) {
    await page.getByLabel(/email/i).fill("first.admin@e2e.local");
    await page.getByLabel(/password/i).fill("PasswordSetupE2E!2026");
    await page.getByRole("button", { name: /sign in/i }).click();
  }

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard/);
});
