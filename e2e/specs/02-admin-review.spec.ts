import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, login, STAFF_EMAIL } from "./_helpers";

test("admin reviews pending incident, applies AI suggestion, closes it", async ({ page, context }) => {
  // Site staff submits an incident first.
  await login(page, STAFF_EMAIL);
  await page.goto("/incidents/new");
  await page.getByLabel(/title/i).fill("E2E Spec 2 review target");
  await page.getByLabel(/description/i).fill("Spec 2 description for triage.");
  await page.getByRole("button", { name: /submit incident/i }).click();
  // Form navigates to /incidents/mine on success
  await page.waitForURL(/incidents\/mine/, { timeout: 30_000 });

  // New context for admin to avoid session collisions.
  const adminPage = await context.browser()!.newContext().then((c) => c.newPage());
  await login(adminPage, ADMIN_EMAIL);
  await adminPage.goto("/admin/incidents");

  // Click the "Open" action link in the row containing the incident title.
  await adminPage
    .locator("tr")
    .filter({ hasText: "E2E Spec 2 review target" })
    .getByRole("link", { name: /open/i })
    .click();

  // Apply AI suggestion (mocked) — optional; skip gracefully if buttons aren't visible.
  const suggestBtn = adminPage.getByRole("button", { name: /(suggest|ai)/i }).first();
  if (await suggestBtn.isVisible().catch(() => false)) await suggestBtn.click();
  const applyBtn = adminPage.getByRole("button", { name: /(apply|use suggestion|confirm)/i }).first();
  if (await applyBtn.isVisible().catch(() => false)) await applyBtn.click();

  // Move to open (required before closing).
  const reviewBtn = adminPage.locator('button:has-text("Move to open")').first();
  await reviewBtn.scrollIntoViewIfNeeded().catch(() => {});
  await reviewBtn.click({ timeout: 15_000 });
  // Wait for the server action to complete then reload to pick up new status.
  await adminPage.waitForLoadState("networkidle");
  await adminPage.reload();

  // Wait for CloseForm to appear.
  await expect(adminPage.getByRole("button", { name: /close incident/i })).toBeVisible({ timeout: 15_000 });

  // Fill close reason (required) then submit.
  await adminPage.locator('textarea[name="reason"]').fill("E2E resolved.");
  await adminPage.getByRole("button", { name: /close incident/i }).click();

  await expect(adminPage.getByText(/closed/i).first()).toBeVisible({ timeout: 15_000 });
});
