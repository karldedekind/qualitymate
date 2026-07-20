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
  // A plain string, or Anthropic content blocks (e.g. document/image + text).
  userPrompt: string | unknown[],
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

// --- ContractFlow: rewrite + document/email extraction ---

const RewriteSchema = z.object({
  rewrite: z.string().min(1).max(20_000),
});

const REWRITE_SYSTEM = `You rewrite draft text for a construction contractor's formal
contract documents — Requests for Information (RFI), Notices of Delay (NOD), and
Extension of Time (EOT) claims — sent to the Owner / Principal's representative.
You are given the document kind and the specific field the text belongs to.

Rewrite rules:
- Preserve every technical fact, measurement, date, duration, and reference. Never
  invent details, assumptions, or references that are not in the draft.
- Formal, courteous, professional tone suitable for a contractual record.
- Australian English spelling.
- Keep it concise — tighten rambling phrasing, do not pad.
- Keep the same overall structure (one question stays one question; a list stays a
  list) and stay on the field's purpose.

Respond with a single JSON object — no prose, no markdown, no code fences:
{"rewrite": string}`;

export type RewriteInput = {
  /** Document kind, e.g. "Request for Information". */
  docKind: string;
  /** Field label the text belongs to, e.g. "The cause of delay". */
  fieldLabel: string;
  text: string;
};

/** Suggest a professional rewrite of a draft contract-document field. Never throws. */
export async function rewriteContractField(
  input: RewriteInput,
  transport: Transport = defaultTransport,
): Promise<DraftResult<{ rewrite: string }>> {
  if (process.env.E2E === "1") {
    return { ok: true, draft: { rewrite: `E2E professional rewrite of: ${input.text}`.slice(0, 2000) } };
  }
  return callJson(
    RewriteSchema,
    REWRITE_SYSTEM,
    [
      `Document kind: ${input.docKind}`,
      `Field: ${input.fieldLabel}`,
      ``,
      `Draft text to rewrite:`,
      ``,
      input.text,
    ].join("\n"),
    transport,
  );
}

const ContractExtractSchema = z.object({
  principalName: z.string().max(200).nullable(),
  principalTradingAs: z.string().max(200).nullable(),
  principalRepName: z.string().max(200).nullable(),
  principalRepPhone: z.string().max(50).nullable(),
  principalRepEmail: z.string().max(200).nullable(),
  contractDateForPc: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  contractSumDollars: z.number().min(0).nullable(),
  dayBasis: z.enum(["ordinary", "working"]).nullable(),
});

export type ContractExtract = z.infer<typeof ContractExtractSchema>;

const EXTRACT_SYSTEM = `You extract contract details for a construction contractor from
uploaded contract source documents — a Letter of Acceptance (LOA), a Purchase Order (PO),
a Principal's / Superintendent's Representative appointment document, and/or the
Conditions of Contract (general and special conditions). The Conditions of Contract are
the most authoritative source for the day basis and any contract-wide terms.

Extraction rules:
- Only report values that are actually stated in the documents. Use null for anything
  not found — NEVER guess or invent a value.
- principalName: the Owner / Principal legal entity the contractor is engaged by.
- principalTradingAs: the project managers / trading name acting for the Principal, if distinct.
- principalRepName / principalRepPhone / principalRepEmail: the named Principal's (or
  Superintendent's) representative and their contact details.
- contractDateForPc: the contract Date for Practical Completion as YYYY-MM-DD.
- contractSumDollars: the original contract sum in AUD as a plain number (no symbols,
  GST-exclusive if both are stated).
- dayBasis: "working" if the contract counts working/business days, "ordinary" if it
  counts ordinary/calendar days; null if the documents do not say.

Respond with a single JSON object — no prose, no markdown, no code fences:
{"principalName": string|null, "principalTradingAs": string|null, "principalRepName": string|null,
"principalRepPhone": string|null, "principalRepEmail": string|null, "contractDateForPc": string|null,
"contractSumDollars": number|null, "dayBasis": "ordinary"|"working"|null}`;

export type ContractDocFile = {
  filename: string;
  mediaType: "application/pdf" | "image/png" | "image/jpeg";
  base64: string;
};

function docContentBlocks(files: ContractDocFile[], instruction: string): unknown[] {
  const content: unknown[] = files.map((f) =>
    f.mediaType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: f.mediaType, data: f.base64 },
          title: f.filename,
        }
      : {
          type: "image",
          source: { type: "base64", media_type: f.mediaType, data: f.base64 },
        },
  );
  content.push({
    type: "text",
    text: `Documents supplied: ${files.map((f) => f.filename).join(", ")}. ${instruction}`,
  });
  return content;
}

/** Extract contract details from uploaded LOA / PO / rep-appointment documents. Never throws. */
export async function extractContractDetails(
  files: ContractDocFile[],
  transport: Transport = defaultTransport,
): Promise<DraftResult<ContractExtract>> {
  if (process.env.E2E === "1") {
    return {
      ok: true,
      draft: {
        principalName: "E2E Principal Pty Ltd",
        principalTradingAs: "E2E Project Managers",
        principalRepName: "E2E Rep",
        principalRepPhone: "0400 000 000",
        principalRepEmail: "rep@example.com",
        contractDateForPc: "2026-12-01",
        contractSumDollars: 100000,
        dayBasis: "working",
      },
    };
  }
  return callJson(
    ContractExtractSchema,
    EXTRACT_SYSTEM,
    docContentBlocks(files, "Extract the contract details."),
    transport,
  );
}

const VariationExtractSchema = z.object({
  number: z.number().int().min(1).nullable(),
  description: z.string().max(5000).nullable(),
  claimedValueDollars: z.number().nullable(),
  timeImpactDays: z.number().int().nullable(),
});

export type VariationExtract = z.infer<typeof VariationExtractSchema>;

const VARIATION_EXTRACT_SYSTEM = `You extract contract variation details for a construction
contractor from an uploaded variation document — e.g. a variation request/quote, site
instruction, or the Principal's variation direction.

Extraction rules:
- Only report values actually stated in the document. Use null for anything not
  found — NEVER guess or invent a value.
- number: the variation number stated on the document (e.g. "Variation 03" or "VO-3" → 3).
- description: a SHORT headline of the varied work — one line, aim under 100 characters.
  Prefer the document's own title or "Details" field, stripping boilerplate prefixes like
  "New Variation -". NEVER concatenate line items, quantities, or cost-breakdown rows into
  the description; the itemised costs belong to the document, not this field.
- claimedValueDollars: the variation value in AUD as a plain number, GST-exclusive if
  both are stated. Negative for credits/omissions.
- timeImpactDays: the time impact in days if stated.

Respond with a single JSON object — no prose, no markdown, no code fences:
{"number": number|null, "description": string|null, "claimedValueDollars": number|null, "timeImpactDays": number|null}`;

/** Extract variation details from an uploaded variation document. Never throws. */
export async function extractVariationDetails(
  files: ContractDocFile[],
  transport: Transport = defaultTransport,
): Promise<DraftResult<VariationExtract>> {
  if (process.env.E2E === "1") {
    return {
      ok: true,
      draft: {
        number: 3,
        description: "E2E extracted variation",
        claimedValueDollars: 1234.5,
        timeImpactDays: 5,
      },
    };
  }
  return callJson(
    VariationExtractSchema,
    VARIATION_EXTRACT_SYSTEM,
    docContentBlocks(files, "Extract the variation details."),
    transport,
  );
}

const CommunicationExtractSchema = z.object({
  subject: z.string().max(500).nullable(),
  occurredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  direction: z.enum(["inbound", "outbound"]).nullable(),
  note: z.string().max(2000).nullable(),
  documentId: z.string().nullable(),
});

export type CommunicationExtract = z.infer<typeof CommunicationExtractSchema>;

const COMM_EXTRACT_SYSTEM = `You extract the details of a project email for a construction
contractor's communications register. You are given the raw .eml content and context about
the two parties.

Extraction rules:
- Only report what the email actually shows; null for anything not determinable.
- subject: the email's Subject line (without Re:/Fwd: prefixes).
- occurredAt: the email's Date header as YYYY-MM-DD.
- direction: "outbound" if the contractor sent it, "inbound" if the contractor received it
  from the Principal / project managers — judge from the From/To addresses against the
  party context provided.
- note: one short sentence summarising what the email is about.
- documentId: if the email clearly concerns one of the listed register documents (matching
  RFI/NOD/EOT numbering in the subject or body), its id from the list; otherwise null.
  Never invent an id.

Respond with a single JSON object — no prose, no markdown, no code fences:
{"subject": string|null, "occurredAt": string|null, "direction": "inbound"|"outbound"|null, "note": string|null, "documentId": string|null}`;

export type CommunicationExtractInput = {
  emailText: string;
  contractorEmail: string | null;
  principalRepEmail: string | null;
  documents: { id: string; label: string }[];
};

/** Extract communication log details from a raw .eml email. Never throws. */
export async function extractCommunicationDetails(
  input: CommunicationExtractInput,
  transport: Transport = defaultTransport,
): Promise<DraftResult<CommunicationExtract>> {
  if (process.env.E2E === "1") {
    return {
      ok: true,
      draft: {
        subject: "E2E extracted subject",
        occurredAt: "2026-07-01",
        direction: "inbound",
        note: "E2E summary.",
        documentId: input.documents[0]?.id ?? null,
      },
    };
  }
  const docList =
    input.documents.map((d) => `- ${d.id}: ${d.label}`).join("\n") || "(none)";
  const prompt = [
    `Party context:`,
    `Contractor email: ${input.contractorEmail ?? "(unknown)"}`,
    `Principal's representative email: ${input.principalRepEmail ?? "(unknown)"}`,
    ``,
    `Register documents (documentId must be one of these ids, or null):`,
    docList,
    ``,
    `Raw email (.eml):`,
    input.emailText,
  ].join("\n");
  const result = await callJson(CommunicationExtractSchema, COMM_EXTRACT_SYSTEM, prompt, transport);
  if (result.ok && result.draft.documentId != null) {
    // Guard against invented ids — the register select only accepts real ones.
    const valid = input.documents.some((d) => d.id === result.draft.documentId);
    if (!valid) result.draft.documentId = null;
  }
  return result;
}
