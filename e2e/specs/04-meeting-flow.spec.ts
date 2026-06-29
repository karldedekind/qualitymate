import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, login, readOutbox, STAFF_EMAIL } from "./_helpers";

test("admin schedules meeting, drafts pack & minutes, attendee signs, director approves, email sent", async ({
  page,
  context,
}) => {
  await login(page, ADMIN_EMAIL);
  await page.goto("/admin/meetings");
  await page.getByRole("link", { name: /schedule meeting/i }).first().click();

  await page.getByLabel(/title/i).fill("E2E Spec 4 management review");
  const dt = page.getByLabel(/(date|scheduled)/i).first();
  if (await dt.isVisible().catch(() => false)) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);
    await dt.fill(tomorrow);
  }
  const attendees = page.getByLabel(/attendee/i).first();
  if (await attendees.isVisible().catch(() => false)) {
    await attendees.fill(`E2E Staff <${STAFF_EMAIL}>`);
  }
  await page.getByRole("button", { name: /(create|schedule|save)/i }).first().click();

  // Generate pack via AI.
  await page.getByRole("button", { name: /generate with ai/i }).first().click();
  // Save the pack.
  await page.getByRole("button", { name: /save pack/i }).click({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");

  // Mark meeting as held — moves status to completed, unlocks MinutesEditor.
  await page.locator('button:has-text("Mark meeting as held")').first().click({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await page.reload();
  // Verify status changed (next-step panel shows "Record the minutes" once completed without minutes).
  await expect(page.getByText(/record the minutes/i).first()).toBeVisible({ timeout: 15_000 });

  // Draft minutes via AI (unlocked now that status = completed).
  await page.getByRole("button", { name: /draft minutes with ai/i }).first().click({ timeout: 30_000 });
  // Drafted minutes land in the notes textarea — assert its value, not visible text.
  await expect(page.locator('textarea[name="notes"]')).toHaveValue(/E2E notes/i, { timeout: 30_000 });
  // Save the minutes so they're persisted (required before signoff links can be issued).
  await page.getByRole("button", { name: /save minutes/i }).first().click({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  // Issue signoff links — URLs appear in the amber box once only.
  await page.getByRole("button", { name: /issue signoff links/i }).first().click();
  // Wait for the amber links box to appear (distinct from the attendee list).
  const linksBox = page.locator(".bg-amber-50");
  await expect(linksBox).toBeVisible({ timeout: 15_000 });

  // Extract the staff member's sign-off URL from the links box.
  const linkText = await linksBox.locator("li").filter({ hasText: STAFF_EMAIL }).first().textContent() ?? "";
  const signoffUrl = linkText.match(/https?:\/\/\S+/)?.[0] ?? "";
  if (!signoffUrl) throw new Error(`Could not extract staff signoff URL from: ${linkText}`);

  // Staff navigates to their token-based signoff URL (no login required).
  const staffPage = await context.browser()!.newContext().then((c) => c.newPage());
  await staffPage.goto(signoffUrl);
  // Confirm checkbox must be checked before "Sign off" is enabled.
  await staffPage.getByRole("checkbox").first().check();
  await staffPage.getByRole("button", { name: /sign off/i }).first().click();
  await expect(staffPage.getByText(/your signoff is recorded/i).first()).toBeVisible({ timeout: 15_000 });

  // Director (admin) approves.
  await page.reload();
  const approveBtn = page.getByRole("button", { name: /approve/i }).first();
  await approveBtn.click();
  await expect(page.getByText(/(approved|distributed)/i).first()).toBeVisible({ timeout: 15_000 });

  // Verify outbox captured at least one email.
  await page.waitForTimeout(500);
  const outbox = readOutbox();
  expect(outbox.length, "no e2e outbox emails written").toBeGreaterThan(0);
  expect(
    outbox.some((m) => String(m.subject || "").toLowerCase().includes("meeting") ||
      String(m.subject || "").toLowerCase().includes("management review")),
  ).toBe(true);
});
