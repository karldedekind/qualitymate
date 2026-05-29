/**
 * AI BYOK module — Anthropic Messages API.
 *
 * Two public functions:
 *   - isConfigured(): cheap, settings-only check
 *   - suggestStructure(incident): returns a triage suggestion or null on any error
 *
 * The transport is injectable for tests so we never make a real network
 * call. Probe is exposed as well so the settings UI can validate before
 * persisting the key.
 *
 * suggestStructure NEVER throws to the caller. Any error path (network,
 * non-2xx, malformed JSON, schema mismatch) returns `{ ok: false, ... }`.
 */

import { z } from "zod";
import { get } from "@/lib/settings";

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = [
  "safety",
  "quality",
  "documentation",
  "equipment",
  "environment",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Suggestion = {
  rootCause: string;
  priority: Priority;
  category: Category;
};

export type SuggestInput = {
  title: string;
  description: string;
};

export type ProbeResult = { ok: true } | { ok: false; error: string };

export type SuggestResult =
  | { ok: true; suggestion: Suggestion; usage?: { inputTokens?: number; outputTokens?: number } }
  | { ok: false; code: "NOT_CONFIGURED" | "TRANSPORT" | "MALFORMED" | "REJECTED"; error: string };

const SuggestionSchema = z.object({
  rootCause: z.string().min(1).max(2000),
  priority: z.enum(PRIORITIES),
  category: z.enum(CATEGORIES),
});

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";

export type Transport = (req: {
  url: string;
  apiKey: string;
  body: unknown;
}) => Promise<{ status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

const defaultTransport: Transport = async ({ url, apiKey, body }) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    json: () => res.json(),
    text: () => res.text(),
  };
};

export async function getApiKey(): Promise<string | null> {
  return get("ai.anthropic_key");
}

export async function isConfigured(): Promise<boolean> {
  if (process.env.E2E === "1") return true;
  try {
    const key = await getApiKey();
    return typeof key === "string" && key.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validation probe: 1-token completion that proves the key is accepted.
 * Used by settings on save before persisting.
 */
export async function probe(
  apiKey: string,
  transport: Transport = defaultTransport,
): Promise<ProbeResult> {
  if (!apiKey || apiKey.length < 8) {
    return { ok: false, error: "Key looks empty or too short." };
  }
  try {
    const res = await transport({
      url: ANTHROPIC_URL,
      apiKey,
      body: {
        model: MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ok" }],
      },
    });
    if (res.status === 200) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Anthropic rejected the key (401/403)." };
    }
    if (res.status === 429) {
      return { ok: false, error: "Rate limited (429). Try again shortly." };
    }
    const body = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

const SUGGEST_SYSTEM = `You are an ISO 9001 quality assistant for a construction firm.
You triage site incidents into structured fields. Respond with a single JSON
object matching this exact shape — no prose, no markdown, no code fences:
{"rootCause": string, "priority": "low"|"medium"|"high"|"critical", "category": "safety"|"quality"|"documentation"|"equipment"|"environment"|"other"}
Keep rootCause under 400 characters. Pick the single best category.`;

function buildUserPrompt(input: SuggestInput): string {
  return `Title: ${input.title}\n\nDescription:\n${input.description}`;
}

function extractText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.length > 0 ? parts.join("") : null;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1]!.trim() : trimmed;
}

function extractUsage(payload: unknown): { inputTokens?: number; outputTokens?: number } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const inputTokens = (usage as { input_tokens?: unknown }).input_tokens;
  const outputTokens = (usage as { output_tokens?: unknown }).output_tokens;
  return {
    inputTokens: typeof inputTokens === "number" ? inputTokens : undefined,
    outputTokens: typeof outputTokens === "number" ? outputTokens : undefined,
  };
}

export async function suggestStructure(
  input: SuggestInput,
  transport: Transport = defaultTransport,
): Promise<SuggestResult> {
  if (process.env.E2E === "1") {
    return {
      ok: true,
      suggestion: {
        rootCause: `E2E canned root cause for: ${input.title}`.slice(0, 1000),
        priority: "medium",
        category: "safety",
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
  let apiKey: string | null;
  try {
    apiKey = await getApiKey();
  } catch (err) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      error: err instanceof Error ? err.message : "Settings unavailable",
    };
  }
  if (!apiKey) {
    return { ok: false, code: "NOT_CONFIGURED", error: "Anthropic key not set." };
  }

  let res: Awaited<ReturnType<Transport>>;
  try {
    res = await transport({
      url: ANTHROPIC_URL,
      apiKey,
      body: {
        model: MODEL,
        max_tokens: 600,
        system: SUGGEST_SYSTEM,
        messages: [{ role: "user", content: buildUserPrompt(input) }],
      },
    });
  } catch (err) {
    return {
      ok: false,
      code: "TRANSPORT",
      error: err instanceof Error ? err.message : "Network error",
    };
  }

  if (res.status !== 200) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      code: "REJECTED",
      error: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (err) {
    return {
      ok: false,
      code: "MALFORMED",
      error: err instanceof Error ? err.message : "Bad JSON envelope",
    };
  }

  const text = extractText(payload);
  if (!text) {
    return { ok: false, code: "MALFORMED", error: "Response had no text content." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return { ok: false, code: "MALFORMED", error: "Model output was not valid JSON." };
  }

  const validated = SuggestionSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      code: "MALFORMED",
      error: validated.error.issues[0]?.message ?? "Suggestion schema mismatch.",
    };
  }

  return { ok: true, suggestion: validated.data, usage: extractUsage(payload) };
}

const PackSchema = z.object({
  summary: z.string().min(1).max(4000),
  agenda: z.array(z.string().min(1).max(300)).min(1).max(20),
  trends: z.string().min(1).max(4000),
});

export type PackDraft = z.infer<typeof PackSchema>;

export type MeetingPackInput = {
  meetingTitle: string;
  scheduledAt: string;
  windowDescription: string;
  incidents: Array<{ title: string; status: string; createdAt: string }>;
  actions: Array<{ title: string; status: string; deadline: string }>;
};

const PACK_SYSTEM = `You prepare a quarterly management review pre-pack for an ISO 9001
construction firm. Respond with a single JSON object — no prose, no markdown, no code fences:
{"summary": string, "agenda": string[], "trends": string}
- summary: 2–4 paragraph overview of the quarter
- agenda: 5–8 bullet items, each a short string
- trends: 1–2 paragraph trend commentary tied to the data provided
Keep tone factual and concise.`;

function buildPackPrompt(input: MeetingPackInput): string {
  const incidentLines = input.incidents
    .slice(0, 50)
    .map((i) => `- [${i.status}] ${i.title} (${i.createdAt.slice(0, 10)})`)
    .join("\n");
  const actionLines = input.actions
    .slice(0, 50)
    .map((a) => `- [${a.status}] ${a.title} due ${a.deadline.slice(0, 10)}`)
    .join("\n");
  return [
    `Meeting: ${input.meetingTitle}`,
    `Scheduled: ${input.scheduledAt}`,
    `Window: ${input.windowDescription}`,
    `Incidents (${input.incidents.length}):`,
    incidentLines || "(none)",
    `Corrective actions (${input.actions.length}):`,
    actionLines || "(none)",
  ].join("\n\n");
}

export type DraftResult<T> =
  | { ok: true; draft: T; usage?: { inputTokens?: number; outputTokens?: number } }
  | { ok: false; code: "NOT_CONFIGURED" | "TRANSPORT" | "MALFORMED" | "REJECTED"; error: string };

async function callJson<T>(
  schema: z.ZodType<T>,
  system: string,
  userPrompt: string,
  transport: Transport,
): Promise<DraftResult<T>> {
  let apiKey: string | null;
  try {
    apiKey = await getApiKey();
  } catch (err) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      error: err instanceof Error ? err.message : "Settings unavailable",
    };
  }
  if (!apiKey) {
    return { ok: false, code: "NOT_CONFIGURED", error: "Anthropic key not set." };
  }

  let res: Awaited<ReturnType<Transport>>;
  try {
    res = await transport({
      url: ANTHROPIC_URL,
      apiKey,
      body: {
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: userPrompt }],
      },
    });
  } catch (err) {
    return {
      ok: false,
      code: "TRANSPORT",
      error: err instanceof Error ? err.message : "Network error",
    };
  }

  if (res.status !== 200) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      code: "REJECTED",
      error: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (err) {
    return {
      ok: false,
      code: "MALFORMED",
      error: err instanceof Error ? err.message : "Bad JSON envelope",
    };
  }

  const text = extractText(payload);
  if (!text) {
    return { ok: false, code: "MALFORMED", error: "Response had no text content." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return { ok: false, code: "MALFORMED", error: "Model output was not valid JSON." };
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      code: "MALFORMED",
      error: validated.error.issues[0]?.message ?? "Schema mismatch.",
    };
  }
  return { ok: true, draft: validated.data, usage: extractUsage(payload) };
}

export async function draftMeetingPack(
  input: MeetingPackInput,
  transport: Transport = defaultTransport,
): Promise<DraftResult<PackDraft>> {
  if (process.env.E2E === "1") {
    return {
      ok: true,
      draft: {
        summary: `E2E summary for ${input.meetingTitle}`,
        agenda: ["Review open actions", "Incident trends", "AOB"],
        trends: "E2E canned trends.",
      } as PackDraft,
    };
  }
  return callJson(PackSchema, PACK_SYSTEM, buildPackPrompt(input), transport);
}

const MinutesSchema = z.object({
  attendees: z.array(z.string().min(1).max(200)).max(50),
  apologies: z.array(z.string().min(1).max(200)).max(50),
  decisions: z.array(z.string().min(1).max(500)).max(50),
  followUps: z.array(z.string().min(1).max(500)).max(50),
  notes: z.string().min(1).max(8000),
});

export type MinutesDraft = z.infer<typeof MinutesSchema>;

export type MeetingMinutesInput = {
  meetingTitle: string;
  scheduledAt: string;
  attendees: string[];
  pack: { summary: string; agenda: string[]; trends: string } | null;
  rawNotes: string;
};

const MINUTES_SYSTEM = `You produce ISO 9001 management review minutes for a construction firm.
Respond with a single JSON object — no prose, no markdown, no code fences:
{"attendees": string[], "apologies": string[], "decisions": string[], "followUps": string[], "notes": string}
- attendees: names from the input
- apologies: people noted as absent (may be empty)
- decisions: short actionable strings, one per decision
- followUps: short strings naming the responsible party where stated
- notes: 2–4 paragraph narrative of discussion`;

function buildMinutesPrompt(input: MeetingMinutesInput): string {
  return [
    `Meeting: ${input.meetingTitle}`,
    `Scheduled: ${input.scheduledAt}`,
    `Attendees provided: ${input.attendees.join(", ") || "(none)"}`,
    input.pack
      ? `Pre-pack summary:\n${input.pack.summary}\n\nAgenda:\n${input.pack.agenda.map((x) => `- ${x}`).join("\n")}\n\nTrends:\n${input.pack.trends}`
      : "(no pre-pack)",
    `Raw notes from facilitator:\n${input.rawNotes || "(none)"}`,
  ].join("\n\n");
}

export async function draftMeetingMinutes(
  input: MeetingMinutesInput,
  transport: Transport = defaultTransport,
): Promise<DraftResult<MinutesDraft>> {
  if (process.env.E2E === "1") {
    return {
      ok: true,
      draft: {
        attendees: input.attendees.length > 0 ? input.attendees : ["E2E Attendee"],
        apologies: [],
        decisions: ["E2E decision A"],
        followUps: ["E2E follow-up A"],
        notes: `E2E notes from ${input.meetingTitle}.`,
      } as MinutesDraft,
    };
  }
  return callJson(MinutesSchema, MINUTES_SYSTEM, buildMinutesPrompt(input), transport);
}
