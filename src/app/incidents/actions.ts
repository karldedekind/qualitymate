"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CATEGORIES,
  PRIORITIES,
  isConfigured as isAiConfigured,
  suggestStructure,
} from "@/lib/ai";
import { record } from "@/lib/audit";
import { requireUser } from "@/lib/auth-helpers";
import { applyTriage, findById } from "@/lib/incidents";
import { getRequestMeta } from "@/lib/request-meta";

const ReviewSchema = z.object({ id: z.string().min(1) });

export async function reviewIncidentAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Admin only." };
  const meta = await getRequestMeta();
  const parsed = ReviewSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid input" };

  const { review } = await import("@/lib/incidents");
  const result = await review(parsed.data.id);
  if (!result.ok) return { error: result.message };

  await record({
    actor: { id: user.id, email: user.email },
    action: "incident.review",
    entity: { type: "incident", id: parsed.data.id },
    after: { status: result.incident.status },
    request: meta,
  });

  revalidatePath(`/admin/incidents/${parsed.data.id}`);
  revalidatePath("/admin/incidents");
  return { ok: true };
}

const SuggestSchema = z.object({ id: z.string().min(1) });

export async function suggestIncidentAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Admin only." };
  const meta = await getRequestMeta();

  if (!(await isAiConfigured())) {
    return { error: "AI not configured. Add an Anthropic key in Settings." };
  }

  const parsed = SuggestSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid input" };

  const incident = await findById(parsed.data.id);
  if (!incident) return { error: "Incident not found." };

  const result = await suggestStructure({
    title: incident.title,
    description: incident.description,
  });

  if (!result.ok) {
    await record({
      actor: { id: user.id, email: user.email },
      action: "incident.ai_suggest.failure",
      entity: { type: "incident", id: incident.id },
      after: { code: result.code, error: result.error },
      request: meta,
    });
    return { error: result.error };
  }

  await record({
    actor: { id: user.id, email: user.email },
    action: "incident.ai_suggest",
    entity: { type: "incident", id: incident.id },
    after: {
      titleLength: incident.title.length,
      descriptionLength: incident.description.length,
      suggestion: {
        priority: result.suggestion.priority,
        category: result.suggestion.category,
        rootCauseLength: result.suggestion.rootCause.length,
      },
      usage: result.usage,
    },
    request: meta,
  });

  return { ok: true, suggestion: result.suggestion };
}

const ApplyTriageSchema = z.object({
  id: z.string().min(1),
  priority: z.enum(PRIORITIES).optional().nullable(),
  rootCause: z.string().max(2000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  source: z.enum(["ai", "manual"]).default("manual"),
  suggestedCategory: z.enum(CATEGORIES).optional().nullable(),
});

export async function applyTriageAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Admin only." };
  const meta = await getRequestMeta();

  const parsed = ApplyTriageSchema.safeParse({
    id: formData.get("id"),
    priority: formData.get("priority") || undefined,
    rootCause: formData.get("rootCause") ?? undefined,
    categoryId: formData.get("categoryId") || undefined,
    source: formData.get("source") || "manual",
    suggestedCategory: formData.get("suggestedCategory") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const before = await findById(parsed.data.id);
  if (!before) return { error: "Incident not found." };

  const patch = {
    priority: parsed.data.priority ?? undefined,
    rootCause: parsed.data.rootCause ?? undefined,
    categoryId: parsed.data.categoryId ?? undefined,
  };

  const after = await applyTriage(parsed.data.id, patch);
  if (!after) return { error: "Update failed." };

  await record({
    actor: { id: user.id, email: user.email },
    action: parsed.data.source === "ai" ? "incident.triage.apply_ai" : "incident.triage.apply",
    entity: { type: "incident", id: parsed.data.id },
    before: {
      priority: before.priority,
      rootCause: before.rootCause,
      categoryId: before.categoryId,
    },
    after: {
      priority: after.priority,
      rootCause: after.rootCause,
      categoryId: after.categoryId,
      suggestedCategory: parsed.data.suggestedCategory,
    },
    request: meta,
  });

  revalidatePath(`/admin/incidents/${parsed.data.id}`);
  return { ok: true };
}

const CloseSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(3, "Reason is required").max(2000),
});

export async function closeIncidentAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Admin only." };
  const meta = await getRequestMeta();

  const parsed = CloseSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { close } = await import("@/lib/incidents");
  const result = await close(parsed.data.id, {
    reason: parsed.data.reason,
    actor: { id: user.id },
  });
  if (!result.ok) return { error: result.message };

  await record({
    actor: { id: user.id, email: user.email },
    action: "incident.close",
    entity: { type: "incident", id: parsed.data.id },
    after: {
      status: result.incident.status,
      reason: parsed.data.reason,
      registerEntryId: result.registerEntry.id,
    },
    request: meta,
  });

  revalidatePath(`/admin/incidents/${parsed.data.id}`);
  revalidatePath("/admin/incidents");
  return { ok: true };
}
