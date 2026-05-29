import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

export const ADMIN_EMAIL = "admin@e2e.local";
export const STAFF_EMAIL = "staff@e2e.local";
export const PASSWORD = "PasswordE2E!2026";

export async function login(page: Page, email: string, password: string = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

export function readOutbox(): Array<Record<string, unknown>> {
  const dir = join(process.cwd(), "e2e", "outbox");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")));
}
