import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

beforeAll(async () => {
  process.env.INSTALL_PASSPHRASE = "test-install-passphrase-32-bytes-min-aaaaa";
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "settings"`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
});

describe("settings — plaintext keys", () => {
  it("set then get round-trips a value", async () => {
    const { set, get } = await import("@/lib/settings");
    await set("branding.company_name", "Acme Builders");
    expect(await get("branding.company_name")).toBe("Acme Builders");
  });

  it("returns null for an unset key", async () => {
    const { get } = await import("@/lib/settings");
    expect(await get("does.not.exist")).toBeNull();
  });

  it("getCached includes plaintext values after set()", async () => {
    const { set, getCached } = await import("@/lib/settings");
    await set("branding.company_name", "Acme");
    await set("branding.primary_color", "#ff0000");
    const cached = await getCached();
    expect(cached["branding.company_name"]).toBe("Acme");
    expect(cached["branding.primary_color"]).toBe("#ff0000");
  });

  it("set invalidates cached value", async () => {
    const { set, getCached } = await import("@/lib/settings");
    await set("branding.company_name", "First");
    let cached = await getCached();
    expect(cached["branding.company_name"]).toBe("First");
    await set("branding.company_name", "Second");
    cached = await getCached();
    expect(cached["branding.company_name"]).toBe("Second");
  });
});

describe("settings — secret keys (encryption at rest)", () => {
  it("ciphertext stored at rest is not equal to plaintext", async () => {
    const { set } = await import("@/lib/settings");
    const { db } = await import("@/db");
    const { settings } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    await set("smtp.password", "hunter2-real-password");
    const rows = await db.select().from(settings).where(eq(settings.key, "smtp.password"));
    expect(rows[0]?.value).not.toBe("hunter2-real-password");
    expect(rows[0]?.value).toMatch(/^v1:/);
    expect(rows[0]?.isSecret).toBe(true);
  });

  it("get() decrypts a secret key back to plaintext", async () => {
    const { set, get } = await import("@/lib/settings");
    await set("smtp.password", "hunter2");
    expect(await get("smtp.password")).toBe("hunter2");
  });

  it("getCached omits secret keys", async () => {
    const { set, getCached } = await import("@/lib/settings");
    await set("smtp.password", "secret-value");
    await set("branding.company_name", "Public");
    const cached = await getCached();
    expect(cached).not.toHaveProperty("smtp.password");
    expect(cached["branding.company_name"]).toBe("Public");
  });

  it("encrypted values differ across writes (random IV)", async () => {
    const { set } = await import("@/lib/settings");
    const { db } = await import("@/db");
    const { settings } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    await set("smtp.password", "same-plaintext");
    const first = (await db.select().from(settings).where(eq(settings.key, "smtp.password")))[0]?.value;
    await set("smtp.password", "same-plaintext");
    const second = (await db.select().from(settings).where(eq(settings.key, "smtp.password")))[0]?.value;
    expect(first).not.toBe(second);
  });
});

describe("crypto", () => {
  it("decrypt(encrypt(x)) === x", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const plain = "the quick brown fox";
    const ct = encrypt(plain);
    expect(ct).not.toBe(plain);
    expect(decrypt(ct)).toBe(plain);
  });

  it("ciphertext fails to decrypt with a different passphrase", async () => {
    const { encrypt, decrypt, _resetKeyCacheForTests } = await import("@/lib/crypto");
    const ct = encrypt("payload");
    const original = process.env.INSTALL_PASSPHRASE;
    try {
      process.env.INSTALL_PASSPHRASE = "different-passphrase";
      _resetKeyCacheForTests();
      expect(() => decrypt(ct)).toThrow();
    } finally {
      process.env.INSTALL_PASSPHRASE = original;
      _resetKeyCacheForTests();
    }
  });
});
