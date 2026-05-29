import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

async function createUser(email: string, role: "admin" | "site_staff" = "site_staff") {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: email } });
  await db.update(user).set({ role, emailVerified: true }).where(eq(user.email, email));
  const rows = await db.select().from(user).where(eq(user.email, email));
  return rows[0]!;
}

async function fileBasic(filedBy: string, title = "T") {
  const { file } = await import("@/lib/incidents");
  return file({ filedBy, title, description: "desc" });
}

beforeAll(async () => {
  process.env.INSTALL_PASSPHRASE = "test-install-passphrase-32-bytes-min-aaaaa";
  process.env.UPLOADS_DIR = "/tmp/qualitymate-incident-test-uploads";
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "register_entries" CASCADE`);
  await db.execute(sql`TRUNCATE "incident_photos" CASCADE`);
  await db.execute(sql`TRUNCATE "incidents" CASCADE`);
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
});

describe("canTransition — status matrix", () => {
  it("legal: pending_review → open, open → closed", async () => {
    const { canTransition } = await import("@/lib/incidents");
    expect(canTransition("pending_review", "open")).toBe(true);
    expect(canTransition("open", "closed")).toBe(true);
  });

  it("illegal: skipping or reversing transitions", async () => {
    const { canTransition } = await import("@/lib/incidents");
    expect(canTransition("pending_review", "closed")).toBe(false);
    expect(canTransition("open", "pending_review")).toBe(false);
    expect(canTransition("closed", "open")).toBe(false);
    expect(canTransition("closed", "pending_review")).toBe(false);
    expect(canTransition("pending_review", "pending_review")).toBe(false);
    expect(canTransition("open", "open")).toBe(false);
  });
});

describe("review() — pending_review → open", () => {
  it("succeeds from pending_review and refuses if already open", async () => {
    const { review } = await import("@/lib/incidents");
    const u = await createUser("a@example.com");
    const incident = await fileBasic(u.id);
    expect(incident.status).toBe("pending_review");

    const r1 = await review(incident.id);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.incident.status).toBe("open");

    const r2 = await review(incident.id);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe("ILLEGAL_TRANSITION");
  });
});

describe("close() — register entry creation", () => {
  it("rejects closing a pending incident, succeeds from open, creates register_entries row", async () => {
    const { review, close, findRegisterEntryByIncident } = await import("@/lib/incidents");
    const admin = await createUser("admin@example.com", "admin");
    const incident = await fileBasic(admin.id, "Cracked beam");

    const direct = await close(incident.id, { reason: "x", actor: { id: admin.id } });
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(direct.code).toBe("ILLEGAL_TRANSITION");

    await review(incident.id);
    const closed = await close(incident.id, { reason: "Repaired and re-inspected", actor: { id: admin.id } });
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.incident.status).toBe("closed");
      expect(closed.incident.closeReason).toBe("Repaired and re-inspected");
      expect(closed.registerEntry.incidentId).toBe(incident.id);
      expect(closed.registerEntry.summary).toBe("Cracked beam");
    }

    const fetched = await findRegisterEntryByIncident(incident.id);
    expect(fetched?.id).toBe(closed.ok ? closed.registerEntry.id : "");
  });

  it("refuses second close attempt", async () => {
    const { review, close } = await import("@/lib/incidents");
    const admin = await createUser("admin2@example.com", "admin");
    const i = await fileBasic(admin.id);
    await review(i.id);
    const c1 = await close(i.id, { reason: "ok", actor: { id: admin.id } });
    expect(c1.ok).toBe(true);
    const c2 = await close(i.id, { reason: "again", actor: { id: admin.id } });
    expect(c2.ok).toBe(false);
    if (!c2.ok) expect(c2.code).toBe("ALREADY_CLOSED");
  });
});

describe("attachPhotos — path scheme + EXIF date capture", () => {
  it("writes to incidents/{id}/{uuid}.{ext} and persists EXIF DateTime as taken_at", async () => {
    const sharpMod = (await import("sharp")).default;
    const { attachPhotos, photosFor } = await import("@/lib/incidents");
    const u = await createUser("ph@example.com");
    const incident = await fileBasic(u.id);

    const exifBuffer = await sharpMod({
      create: { width: 200, height: 150, channels: 3, background: { r: 200, g: 50, b: 50 } },
    })
      .withExif({ IFD0: { DateTime: "2026:05:06 09:30:00" } })
      .jpeg()
      .toBuffer();

    const f = new File([new Uint8Array(exifBuffer)], "site.JPG", { type: "image/jpeg" });
    const saved = await attachPhotos(incident.id, [f]);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.path).toMatch(
      new RegExp(`^incidents/${incident.id}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(saved[0]!.takenAt?.toISOString()).toBe("2026-05-06T09:30:00.000Z");

    const list = await photosFor(incident.id);
    expect(list).toHaveLength(1);
  });

  it("downsizes images wider than 1920px", async () => {
    const sharpMod = (await import("sharp")).default;
    const { attachPhotos } = await import("@/lib/incidents");
    const u = await createUser("ph2@example.com");
    const incident = await fileBasic(u.id);

    const big = await sharpMod({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const f = new File([new Uint8Array(big)], "big.jpg", { type: "image/jpeg" });
    const [saved] = await attachPhotos(incident.id, [f]);
    expect(saved!.width).toBe(1920);
    expect(saved!.height).toBe(1440);
  });
});
