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

  it("lists the supplied category codes in the prompt and resolves output to a code", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "k");
    const { suggestStructure } = await import("@/lib/ai");

    let userPrompt = "";
    const transport: Transport = async (req) => {
      const body = req.body as { messages: { content: string }[] };
      userPrompt = body.messages[0]!.content;
      return okResponse(
        JSON.stringify({ rootCause: "PPE rule not applied", priority: "medium", category: "Q1" }),
      );
    };

    const r = await suggestStructure(
      {
        title: "Worker without hi-vis in plant zone",
        description: "No high-visibility clothing worn",
        categories: [
          { code: "Q1", label: "Procedure not followed" },
          { code: "Q2", label: "Material defect" },
        ],
      },
      transport,
    );
    expect(userPrompt).toContain("Q1: Procedure not followed");
    expect(userPrompt).toContain("Q2: Material defect");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.suggestion.category).toBe("Q1");
  });

  it("forces an off-list category back onto the supplied list (best guess)", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "k");
    const { suggestStructure } = await import("@/lib/ai");

    const transport: Transport = async () =>
      okResponse(
        JSON.stringify({ rootCause: "x", priority: "low", category: "safety" }),
      );

    const r = await suggestStructure(
      {
        title: "t",
        description: "d",
        categories: [{ code: "Q1", label: "Procedure not followed" }],
      },
      transport,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.suggestion.category).toBe("Q1");
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

describe("meeting-notes house style", () => {
  const packInput = {
    meetingTitle: "Q2 review",
    scheduledAt: "2026-06-30",
    windowDescription: "Apr–Jun 2026",
    incidents: [],
    actions: [],
  };
  const minutesInput = {
    meetingTitle: "Q2 review",
    scheduledAt: "2026-06-30",
    attendees: ["A. Person"],
    pack: null,
    rawNotes: "",
  };

  // Captures the system prompt and request body each draft function actually
  // sends to the transport — the "compiled" prompt, not the source constant.
  async function captureBody(
    fn: "draftMeetingPack" | "draftMeetingMinutes",
  ): Promise<{ system: string; temperature?: number }> {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "sk-ant-stored");
    const ai = await import("@/lib/ai");
    let captured: { system: string; temperature?: number } | null = null;
    const transport: Transport = async (req) => {
      const body = req.body as Record<string, unknown>;
      captured = { system: body.system as string, temperature: body.temperature as number };
      return okResponse(
        fn === "draftMeetingPack"
          ? JSON.stringify({ summary: "s", agenda: ["a"], trends: "t" })
          : JSON.stringify({ attendees: ["A"], apologies: [], decisions: ["d"], followUps: ["f"], notes: "n" }),
      );
    };
    if (fn === "draftMeetingPack") await ai.draftMeetingPack(packInput, transport);
    else await ai.draftMeetingMinutes(minutesInput, transport);
    if (!captured) throw new Error("transport was not called");
    return captured;
  }

  it("interpolates the shared STYLE_GUIDE into both compiled prompts", async () => {
    const { STYLE_GUIDE } = await import("@/lib/ai");
    const pack = await captureBody("draftMeetingPack");
    const minutes = await captureBody("draftMeetingMinutes");
    expect(pack.system).toContain(STYLE_GUIDE);
    expect(minutes.system).toContain(STYLE_GUIDE);
  });

  it("keeps tense per-document: present/future in pre-pack, past in minutes", async () => {
    const pack = await captureBody("draftMeetingPack");
    const minutes = await captureBody("draftMeetingMinutes");
    expect(pack.system).toMatch(/present\/future framing/);
    expect(minutes.system).toMatch(/past tense/);
  });

  it("sends temperature 0.2 on both meeting drafts", async () => {
    const pack = await captureBody("draftMeetingPack");
    const minutes = await captureBody("draftMeetingMinutes");
    expect(pack.temperature).toBe(0.2);
    expect(minutes.temperature).toBe(0.2);
  });

  it("includes the reference register (context-only) in the minutes prompt when supplied", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "sk-ant-stored");
    const ai = await import("@/lib/ai");
    let userPrompt = "";
    let system = "";
    const transport: Transport = async (req) => {
      const body = req.body as { system: string; messages: { content: string }[] };
      system = body.system;
      userPrompt = body.messages[0]!.content;
      return okResponse(
        JSON.stringify({ attendees: ["A"], apologies: [], decisions: ["d"], followUps: ["f"], notes: "n" }),
      );
    };
    await ai.draftMeetingMinutes(
      {
        ...minutesInput,
        rawNotes: "Discussed the scaffold edge incident.",
        register: {
          incidents: [{ title: "Unsecured scaffold edge protection", status: "open" }],
          actions: [{ title: "Install edge rails", status: "open", deadline: "2026-07-15T00:00:00.000Z" }],
        },
      },
      transport,
    );
    // Grounding instruction present in the system prompt.
    expect(system).toMatch(/CONTEXT ONLY/);
    expect(system).toMatch(/NEVER introduce/);
    // Register rendered into the user prompt.
    expect(userPrompt).toContain("Reference register");
    expect(userPrompt).toContain("Unsecured scaffold edge protection");
    expect(userPrompt).toContain("Install edge rails");
  });

  it("omits the reference register block when none is supplied", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "sk-ant-stored");
    const ai = await import("@/lib/ai");
    let userPrompt = "";
    const transport: Transport = async (req) => {
      const body = req.body as { messages: { content: string }[] };
      userPrompt = body.messages[0]!.content;
      return okResponse(
        JSON.stringify({ attendees: ["A"], apologies: [], decisions: ["d"], followUps: ["f"], notes: "n" }),
      );
    };
    await ai.draftMeetingMinutes(minutesInput, transport);
    expect(userPrompt).not.toContain("Reference register");
  });

  it("switches to data-driven draft mode when no raw notes are provided", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "sk-ant-stored");
    const ai = await import("@/lib/ai");
    let system = "";
    let userPrompt = "";
    const transport: Transport = async (req) => {
      const body = req.body as { system: string; messages: { content: string }[] };
      system = body.system;
      userPrompt = body.messages[0]!.content;
      return okResponse(
        JSON.stringify({ attendees: ["A"], apologies: [], decisions: ["d"], followUps: ["f"], notes: "n" }),
      );
    };
    await ai.draftMeetingMinutes(
      {
        ...minutesInput,
        rawNotes: "   ", // whitespace only → treated as empty
        register: {
          incidents: [{ title: "Unsecured scaffold edge protection", status: "open" }],
          actions: [{ title: "Install edge rails", status: "open", deadline: "2026-07-15T00:00:00.000Z" }],
        },
      },
      transport,
    );
    // Draft-mode system, not the anti-fabrication fence.
    expect(system).toMatch(/STARTING DRAFT/);
    expect(system).not.toContain("NEVER introduce");
    // Register framed as source data, and a no-notes marker in the prompt.
    expect(userPrompt).toContain("source data");
    expect(userPrompt).toContain("no notes were taken");
  });

  it("sends temperature 0 on incident triage for deterministic classification", async () => {
    const { set } = await import("@/lib/settings");
    await set("ai.anthropic_key", "sk-ant-stored");
    const { suggestStructure } = await import("@/lib/ai");
    let body: Record<string, unknown> | null = null;
    const transport: Transport = async (req) => {
      body = req.body as Record<string, unknown>;
      return okResponse(JSON.stringify({ rootCause: "x", priority: "low", category: "safety" }));
    };
    await suggestStructure({ title: "t", description: "d" }, transport);
    expect(body).not.toBeNull();
    expect(body!.temperature).toBe(0);
  });
});
