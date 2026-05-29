import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, login, STAFF_EMAIL } from "./_helpers";

test("admin creates action, assigns staff, staff resolves it", async ({ page, context }) => {
  // Staff submits an incident so admin has something to attach the action to
  await login(page, STAFF_EMAIL);
  await page.goto("/incidents/new");
  await page.getByLabel(/title/i).fill("E2E Spec 3 incident");
  await page.getByLabel(/description/i).fill("Spec 3 incident for action test.");
  await page.getByRole("button", { name: /submit incident/i }).click();
  await page.waitForURL(/incidents\/mine/, { timeout: 30_000 });

  // Admin opens the incident and creates a corrective action
  const adminPage = await context.browser()!.newContext().then((c) => c.newPage());
  await login(adminPage, ADMIN_EMAIL);
  await adminPage.goto("/admin/incidents");
  await adminPage
    .locator("tr")
    .filter({ hasText: "E2E Spec 3 incident" })
    .getByRole("link", { name: /open/i })
    .click();

  // Expand the create-action form
  const addBtn = adminPage.getByRole("button", { name: /add corrective action/i }).first();
  await addBtn.click();

  await adminPage.getByLabel(/title/i).fill("E2E Spec 3 action");
  const desc = adminPage.getByLabel(/description/i).first();
  if (await desc.isVisible().catch(() => false)) await desc.fill("Spec 3 description.");

  // Set a deadline (required; datetime-local needs YYYY-MM-DDTHH:MM format)
  const deadline = adminPage.getByLabel(/deadline/i).first();
  if (await deadline.isVisible().catch(() => false)) {
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    await deadline.fill(nextWeek);
  }

  // Assign to staff — option text is "E2E Staff (staff@e2e.local)"
  const assignee = adminPage.getByLabel(/assigne[ed]/i).first();
  if (await assignee.isVisible().catch(() => false)) {
    await assignee.selectOption({ label: "E2E Staff (staff@e2e.local)" });
  }

  await adminPage.getByRole("button", { name: /save action/i }).first().click();
  await expect(adminPage.getByText("E2E Spec 3 action")).toBeVisible({ timeout: 15_000 });

  // Staff logs in and resolves the action
  const staffPage = await context.browser()!.newContext().then((c) => c.newPage());
  await login(staffPage, STAFF_EMAIL);
  await staffPage.goto("/actions/mine");
  await staffPage.getByText("E2E Spec 3 action").click();
  await staffPage.getByRole("button", { name: /mark resolved/i }).first().click();
  // Confirm the resolution (form shows note + Confirm button)
  await staffPage.getByRole("button", { name: /confirm/i }).first().click();
  await expect(staffPage.getByText(/resolved/i).first()).toBeVisible({ timeout: 15_000 });
});
