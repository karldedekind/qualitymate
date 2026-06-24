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
  /** A category code from the firm's list (or a generic CATEGORIES value). */
  category: string;
};

export type CategoryChoice = { code: string; label: string };

export type SuggestInput = {
  title: string;
  description: string;
  /**
   * The firm's actual incident categories. When provided, the model must pick
   * one of these codes. Falls back to the generic CATEGORIES list when empty.
   */
  categories?: CategoryChoice[];
};

export type ProbeResult = { ok: true } | { ok: false; error: string };

export type SuggestResult =
  | { ok: true; suggestion: Suggestion; usage?: { inputTokens?: number; outputTokens?: number } }
  | { ok: false; code: "NOT_CONFIGURED" | "TRANSPORT" | "MALFORMED" | "REJECTED"; error: string };

const SuggestionSchema = z.object({
  reason: z.string().max(500).optional(),
  rootCause: z.string().min(1).max(2000),
  priority: z.enum(PRIORITIES),
  category: z.string().min(1),
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
You triage a site incident into structured fields, choosing a category from a
fixed list supplied in the user message.

Classification rules:
- Choose the category that names the ROOT QUALITY CAUSE, not the surface symptom.
- A safety hazard usually exists because a required control, procedure, or
  specification was not followed. Prefer the category describing that failure
  over a generic "safety" label.
- Example: "Worker without hi-vis in plant zone" → the category meaning a
  procedure/control was not followed (a PPE rule was not applied), NOT a
  generic safety category.
- "category" MUST be exactly one of the category codes listed in the user
  message. Never invent a code.

Respond with a single JSON object — no prose, no markdown, no code fences:
{"reason": string, "rootCause": string, "priority": "low"|"medium"|"high"|"critical", "category": "<one of the listed codes>"}
- reason: one short sentence justifying the category choice
- rootCause: under 400 characters
Pick the single best category even if uncertain — never leave it blank.`;

function categoriesFor(input: SuggestInput): CategoryChoice[] {
  if (input.categories && input.categories.length > 0) return input.categories;
  return CATEGORIES.map((c) => ({ code: c, label: c }));
}

/**
 * Resolve the model's category string to a valid code from the supplied list.
 * Forces a best guess (never blank): exact code match → fuzzy label/word
 * overlap → first category as last resort.
 */
function resolveCategoryCode(raw: string, cats: CategoryChoice[]): string {
  if (cats.length === 0) return raw;
  const want = raw.trim().toLowerCase();
  const exact = cats.find((c) => c.code.toLowerCase() === want);
  if (exact) return exact.code;
  const fuzzy = cats.find(
    (c) =>
      c.label.toLowerCase().includes(want) ||
      want.includes(c.code.toLowerCase()) ||
      c.label
        .toLowerCase()
        .split(/\W+/)
        .some((w) => w.length > 2 && want.includes(w)),
  );
  return (fuzzy ?? cats[0]!).code;
}

function buildUserPrompt(input: SuggestInput): string {
  const list = categoriesFor(input)
    .map((c) => `- ${c.code}: ${c.label}`)
    .join("\n");
  return [
    `Available categories (choose exactly one code):`,
    list,
    ``,
    `Incident`,
    `Title: ${input.title}`,
    ``,
    `Description:`,
    input.description,
  ].join("\n");
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
        category: input.categories?.[0]?.code ?? "safety",
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
        temperature: 0,
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

  const suggestion: Suggestion = {
    rootCause: validated.data.rootCause,
    priority: validated.data.priority,
    category: resolveCategoryCode(validated.data.category, categoriesFor(input)),
  };
  return { ok: true, suggestion, usage: extractUsage(payload) };
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

// Cross-cutting house style shared by both meeting-notes prompts (pre-pack and
// minutes). Rules apply to the CONTENTS of the JSON fields, not the JSON
// envelope. Tense is deliberately NOT set here — it differs per document and is
// supplied by each prompt. Exported so the anti-drift test can assert both
// compiled prompts share this single source.
export const STYLE_GUIDE = `House style (applies to the text inside every JSON field):
- Voice: third-person impersonal. No "I", "we", or "you"; write as a formal record.
- Spelling: Australian English throughout (e.g. organisation, prioritise, programme, metre).
- Agenda items: short noun phrases, sentence case, no trailing full stop.
- Decisions: record what was resolved, in past tense (e.g. "Agreed to ...", "Resolved to ..."), sentence case, no trailing full stop.
- Follow-ups: "<owner> to <action> by <date>" — name the owner and the date where stated.
- Length: size the prose to the quarter's actual activity. Do not pad a quiet quarter with filler to hit a length target.`;

const PACK_SYSTEM = `You prepare a quarterly management review pre-pack for an ISO 9001
construction firm. Respond with a single JSON object — no prose, no markdown, no code fences:
{"summary": string, "agenda": string[], "trends": string}
- summary: 2–3 short paragraphs overviewing the quarter
- agenda: 5–8 bullet items, each a short string
- trends: 1–2 short paragraphs of trend commentary tied to the data provided

${STYLE_GUIDE}

Framing: this is preparation for an upcoming meeting — use present/future framing.
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
        temperature: 0.2,
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
  /**
   * Recent open incidents / actions, supplied as grounding ONLY. Used to name
   * or disambiguate items the raw notes already reference — never as content
   * to introduce. May be omitted.
   */
  register?: {
    incidents: { title: string; status: string }[];
    actions: { title: string; status: string; deadline: string }[];
  } | null;
};

// Source rules differ by mode. With facilitator notes, the notes are the only
// source and the register is context-only (anti-fabrication fence). Without
// notes, there is nothing to ground against, so produce a data-driven STARTING
// DRAFT from the register + pre-pack for the user to edit before the meeting.
const MINUTES_GROUNDED_RULES = `Grounding rules:
- The facilitator's raw notes are the ONLY source of what occurred. Record only what the notes state took place.
- A "Reference register" of recent incidents and corrective actions may be supplied for CONTEXT ONLY. Use it solely to correctly name or disambiguate items the notes already refer to. NEVER introduce incidents, actions, decisions, or follow-ups that are not present in the raw notes, and do not summarise the register.`;

const MINUTES_DRAFT_RULES = `Drafting from data (no facilitator notes were provided):
- No raw notes exist yet, so produce a STARTING DRAFT for the review to edit — this is not yet a final record.
- Base every field on the supplied Reference register (recent incidents and corrective actions) and the pre-pack. Use ALL items provided.
- decisions: propose the decisions this management review should make about the items — e.g. confirm a closure, accept a risk, escalate, or set a target — phrased as resolutions to confirm.
- followUps: propose follow-up actions for the open items, naming the responsible party where the data gives one and the deadline where stated.
- notes: summarise the quarter's position — incident themes and corrective-action progress — from the register and pre-pack.
- Do not fabricate attendance or events that did not happen: leave attendees/apologies to what is provided.`;

function minutesSystem(hasNotes: boolean): string {
  return `You produce ISO 9001 management review minutes for a construction firm.
Respond with a single JSON object — no prose, no markdown, no code fences:
{"attendees": string[], "apologies": string[], "decisions": string[], "followUps": string[], "notes": string}
- attendees: names from the input
- apologies: people noted as absent (may be empty)
- decisions: short actionable strings, one per decision
- followUps: short strings naming the responsible party where stated
- notes: 2–3 short paragraphs of discussion narrative

${hasNotes ? MINUTES_GROUNDED_RULES : MINUTES_DRAFT_RULES}

${STYLE_GUIDE}

Framing: these are minutes for the official record — write in past tense.`;
}

function buildMinutesPrompt(input: MeetingMinutesInput): string {
  const hasNotes = input.rawNotes.trim().length > 0;
  const reg = input.register;
  const registerLabel = hasNotes
    ? `Reference register (CONTEXT ONLY — do not introduce anything not in the raw notes):`
    : `Reference register (source data — draft the decisions, follow-ups and notes from these):`;
  const registerBlock =
    reg && (reg.incidents.length > 0 || reg.actions.length > 0)
      ? [
          registerLabel,
          `Incidents (${reg.incidents.length}):`,
          reg.incidents.map((i) => `- [${i.status}] ${i.title}`).join("\n") || "(none)",
          `Corrective actions (${reg.actions.length}):`,
          reg.actions
            .map((a) => `- [${a.status}] ${a.title} (due ${a.deadline.slice(0, 10)})`)
            .join("\n") || "(none)",
        ].join("\n")
      : null;

  return [
    `Meeting: ${input.meetingTitle}`,
    `Scheduled: ${input.scheduledAt}`,
    `Attendees provided: ${input.attendees.join(", ") || "(none)"}`,
    input.pack
      ? `Pre-pack summary:\n${input.pack.summary}\n\nAgenda:\n${input.pack.agenda.map((x) => `- ${x}`).join("\n")}\n\nTrends:\n${input.pack.trends}`
      : "(no pre-pack)",
    registerBlock,
    `Raw notes from facilitator:\n${
      hasNotes
        ? input.rawNotes
        : "(none — no notes were taken; draft from the reference register and pre-pack above)"
    }`,
  ]
    .filter((x): x is string => x != null)
    .join("\n\n");
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
  const hasNotes = input.rawNotes.trim().length > 0;
  return callJson(MinutesSchema, minutesSystem(hasNotes), buildMinutesPrompt(input), transport);
}
