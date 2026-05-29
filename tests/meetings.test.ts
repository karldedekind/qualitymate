import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";
import type { Transport } from "@/lib/ai";

async function createUser(email: string, role: "admin" | "site_staff" = "admin") {
  const { auth } = await import("@/lib/auth");
  const { db } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await auth.api.signUpEmail({ body: { email, password: "password123", name: email } });
  await db.update(user).set({ role, emailVerified: true }).where(eq(user.email, email));
  const rows = await db.select().from(user).where(eq(user.email, email));
  return rows[0]!;
}

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
  await db.execute(sql`TRUNCATE "meetings" CASCADE`);
  await db.execute(sql`TRUNCATE "corrective_actions" CASCADE`);
  await db.execute(sql`TRUNCATE "incidents" CASCADE`);
  await db.execute(sql`TRUNCATE "settings" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "audit_log" RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE "session" CASCADE`);
  await db.execute(sql`TRUNCATE "account" CASCADE`);
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
});

function okResponse(text: string) {
  return {
    status: 200,
    json: async () => ({
      content: [{ type: "text", text }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
    text: async () => "",
  };
}

describe("schedule()", () => {
  it("creates a meeting with attendees + scheduled status", async () => {
    const { schedule, findById } = await import("@/lib/meetings");
    const u = await createUser("a@example.com");
    const m = await schedule({
      title: "Q2 review",
      scheduledAt: new Date("2026-06-01T10:00:00Z"),
      location: "Office",
      attendees: [{ userId: null, name: "Jane" }, { userId: null, name: "Bob", email: "bob@x.com" }],
      createdBy: u.id,
    });
    expect(m.status).toBe("scheduled");
    expect(m.attendees).toHaveLength(2);
    expect(m.attendees[1]!.email).toBe("bob@x.com");

    const fetched = await findById(m.id);
    expect(fetched?.title).toBe("Q2 review");
  });
});

describe("manual fallback — pack + minutes without AI", () => {
  it("manualPack saves with generatedBy=manual and embeds incident/action snapshot", async () => {
    const { schedule, manualPack } = await import("@/lib/meetings");
    const u = await createUser("b@example.com");
    const m = await schedule({
      title: "M",
      scheduledAt: new Date(),
      attendees: [],
      createdBy: u.id,
    });
    const pack = await manualPack(m.id, {
      summary: "All quiet quarter",
      agenda: ["Review incidents", "Action status", "AOB"],
      trends: "No notable trend",
    });
    expect(pack?.generatedBy).toBe("manual");
    expect(pack?.agenda).toEqual(["Review incidents", "Action status", "AOB"]);
    expect(Array.isArray(pack?.incidents)).toBe(true);
    expect(Array.isArray(pack?.actions)).toBe(true);
  });

  it("manualMinutes filters empty lines and stamps generatedBy=manual", async () => {
    const { schedule, manualMinutes } = await import("@/lib/meetings");
    const u = await createUser("c@example.com");
    const m = await schedule({
      title: "M",
      scheduledAt: new Date(),
      attendees: [],
      createdBy: u.id,
    });
    const result = await manualMinutes(m.id, {
      attendees: ["Jane", "", "Bob"],
      apologies: [""],
      decisions: ["Approve doc v2", ""],
      followUps: [],
      notes: "Discussed all items.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.generatedBy).toBe("manual");
      expect(result.value.attendees).toEqual(["Jane", "Bob"]);
      expect(result.value.apologies).toEqual([]);
      expect(result.value.decisions).toEqual(["Approve doc v2"]);
    }
  });

  it("generatePack returns AI_OFF when AI not configured", async () => {
    const { schedule, generatePack } = await import("@/lib/meetings");
    const u = await createUser("d@example.com");
    const m = await schedule({
      title: "M",
      scheduledAt: new Date(),
      attendees: [],
      createdBy: u.id,
    });
    const r = await generatePack(m.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("AI_OFF");
  });

  it("draftMinutes returns AI_OFF when AI not configured", async () => {
    const { schedule, draftMinutes } = await import("@/lib/meetings");
    const u = await createUser("e@example.com");
    const m = await schedule({
      title: "M",
      scheduledAt: new Date(),
      attendees: [],
      createdBy: u.id,
    });
    const r = await draftMinutes(m.id, "raw");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("AI_OFF");
  });
});

describe("AI path with stub transport", () => {
  it("generatePack persists JSON pack with generatedBy=ai", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "k");
    const { schedule, generatePack, findById } = await import("@/lib/meetings");
    const u = await createUser("f@example.com");
    const m = await schedule({
      title: "Q3 review",
      scheduledAt: new Date(),
      attendees: [],
      createdBy: u.id,
    });

    const transport: Transport = async () =>
      okResponse(
        JSON.stringify({
          summary: "Quarter overview narrative...",
          agenda: ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"],
          trends: "Trend commentary...",
        }),
      );

    const r = await generatePack(m.id, transport);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.generatedBy).toBe("ai");
      expect(r.value.agenda).toHaveLength(5);
      expect(r.value.summary).toContain("Quarter overview");
    }

    const persisted = await findById(m.id);
    expect(persisted?.pack?.generatedBy).toBe("ai");
  });

  it("draftMinutes persists structured minutes with generatedBy=ai", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "k");
    const { schedule, draftMinutes, findById } = await import("@/lib/meetings");
    const u = await createUser("g@example.com");
    const m = await schedule({
      title: "M",
      scheduledAt: new Date(),
      attendees: [{ userId: null, name: "Jane" }],
      createdBy: u.id,
    });

    const transport: Transport = async () =>
      okResponse(
        JSON.stringify({
          attendees: ["Jane"],
          apologies: [],
          decisions: ["Approve audit report"],
          followUps: ["Bob to circulate doc"],
          notes: "Meeting discussed quarterly performance.",
        }),
      );

    const r = await draftMinutes(m.id, "facilitator notes here", transport);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.generatedBy).toBe("ai");
      expect(r.value.decisions).toEqual(["Approve audit report"]);
    }

    const persisted = await findById(m.id);
    expect(persisted?.minutes?.attendees).toEqual(["Jane"]);
  });

  it("generatePack returns AI_ERROR when transport returns malformed JSON", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "k");
    const { schedule, generatePack } = await import("@/lib/meetings");
    const u = await createUser("h@example.com");
    const m = await schedule({
      title: "M",
      scheduledAt: new Date(),
      attendees: [],
      createdBy: u.id,
    });

    const transport: Transport = async () => okResponse("not json");
    const r = await generatePack(m.id, transport);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("AI_ERROR");
  });
});
