import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";
import type { Transport } from "@/lib/ai";

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
  await db.execute(sql`TRUNCATE "settings" RESTART IDENTITY`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
});

function okResponse(text: string, usage?: { input_tokens?: number; output_tokens?: number }) {
  return {
    status: 200,
    json: async () => ({
      content: [{ type: "text", text }],
      usage,
    }),
    text: async () => "",
  };
}

function errResponse(status: number, body = "") {
  return {
    status,
    json: async () => ({}),
    text: async () => body,
  };
}

describe("isConfigured()", () => {
  it("returns false when no key is stored", async () => {
    const { isConfigured } = await import("@/lib/ai");
    expect(await isConfigured()).toBe(false);
  });

  it("returns true after a key is stored", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "sk-ant-test-1234");
    const { isConfigured } = await import("@/lib/ai");
    expect(await isConfigured()).toBe(true);
  });
});

describe("probe()", () => {
  it("rejects empty/short keys before calling the API", async () => {
    const { probe } = await import("@/lib/ai");
    const calls = vi.fn();
    const transport: Transport = async (req) => {
      calls(req);
      return okResponse("ok");
    };
    const r = await probe("", transport);
    expect(r.ok).toBe(false);
    expect(calls).not.toHaveBeenCalled();
  });

  it("returns ok on 200", async () => {
    const { probe } = await import("@/lib/ai");
    const transport: Transport = async () => okResponse("ok");
    const r = await probe("sk-ant-validkey", transport);
    expect(r).toEqual({ ok: true });
  });

  it("maps 401 to a clear rejection error", async () => {
    const { probe } = await import("@/lib/ai");
    const transport: Transport = async () => errResponse(401, "invalid key");
    const r = await probe("sk-ant-bad", transport);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/401/);
  });

  it("never throws on transport failure", async () => {
    const { probe } = await import("@/lib/ai");
    const transport: Transport = async () => {
      throw new Error("ECONNRESET");
    };
    const r = await probe("sk-ant-x", transport);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("ECONNRESET");
  });
});

describe("suggestStructure() — happy path", () => {
  it("parses a clean JSON response into the typed suggestion", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "sk-ant-stored");
    const { suggestStructure } = await import("@/lib/ai");

    const transport: Transport = async () =>
      okResponse(
        JSON.stringify({
          rootCause: "Loose bracket missed during last QA pass",
          priority: "high",
          category: "quality",
        }),
        { input_tokens: 80, output_tokens: 25 },
      );

    const r = await suggestStructure({ title: "Bracket failure", description: "Found loose bracket" }, transport);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.suggestion.priority).toBe("high");
      expect(r.suggestion.category).toBe("quality");
      expect(r.suggestion.rootCause).toContain("Loose bracket");
      expect(r.usage).toEqual({ inputTokens: 80, outputTokens: 25 });
    }
  });

  it("strips a markdown code fence around the JSON before parsing", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "k");
    const { suggestStructure } = await import("@/lib/ai");

    const transport: Transport = async () =>
      okResponse(
        '```json\n{"rootCause":"x","priority":"low","category":"safety"}\n```',
      );

    const r = await suggestStructure({ title: "t", description: "d" }, transport);
    expect(r.ok).toBe(true);
  });
});

describe("suggestStructure() — error handling", () => {
  it("returns NOT_CONFIGURED with no key", async () => {
    const { suggestStructure } = await import("@/lib/ai");
    const r = await suggestStructure({ title: "t", description: "d" }, async () => okResponse("{}"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_CONFIGURED");
  });

  it("returns MALFORMED on non-JSON model output", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "k");
    const { suggestStructure } = await import("@/lib/ai");
    const r = await suggestStructure(
      { title: "t", description: "d" },
      async () => okResponse("Sure, here you go: not json"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MALFORMED");
  });

  it("returns MALFORMED when JSON shape doesn't match schema", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "k");
    const { suggestStructure } = await import("@/lib/ai");
    const r = await suggestStructure(
      { title: "t", description: "d" },
      async () => okResponse(JSON.stringify({ rootCause: "x", priority: "extreme", category: "quality" })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MALFORMED");
  });

  it("returns REJECTED on non-200 response", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "k");
    const { suggestStructure } = await import("@/lib/ai");
    const r = await suggestStructure(
      { title: "t", description: "d" },
      async () => errResponse(500, "boom"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("REJECTED");
  });

  it("returns TRANSPORT when the transport throws — never propagates", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "k");
    const { suggestStructure } = await import("@/lib/ai");
    const r = await suggestStructure(
      { title: "t", description: "d" },
      async () => {
        throw new Error("ETIMEDOUT");
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("TRANSPORT");
      expect(r.error).toBe("ETIMEDOUT");
    }
  });
});
