import { expect, test } from "@playwright/test";
import { login, STAFF_EMAIL } from "./_helpers";

test("site staff files an incident with photo and sees it in their list", async ({ page }) => {
  await login(page, STAFF_EMAIL);

  await page.goto("/incidents/new");
  await page.getByLabel(/title/i).fill("E2E Spec 1 incident");
  await page
    .getByLabel(/description/i)
    .fill("Spec 1 description: photo attached, expected to surface in mine list.");

  // 1x1 PNG — target the gallery (multiple) file input (hidden, triggered by button)
  await page.setInputFiles('input[type="file"][multiple]', {
    name: "tracer.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=",
      "base64",
    ),
  });

  await page.getByRole("button", { name: /submit incident/i }).click();
  // Form navigates to /incidents/mine on success
  await page.waitForURL(/incidents\/mine/, { timeout: 30_000 });
  await expect(page.getByText("E2E Spec 1 incident")).toBeVisible();
});
