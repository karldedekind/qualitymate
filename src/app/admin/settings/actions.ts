"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { getRequestMeta } from "@/lib/request-meta";
import { get, set, KNOWN_KEYS } from "@/lib/settings";
import { saveImage } from "@/lib/uploads";
import { testSend } from "@/lib/smtp";
import { DECLARATION_KEYS, getDeclarations, setDeclarations } from "@/lib/checkin";
import { probe as probeAnthropic } from "@/lib/ai";

const BrandingSchema = z.object({
  companyName: z.string().min(1).max(200),
  companyShortName: z.string().min(1).max(50),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function saveBrandingAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const parsed = BrandingSchema.safeParse({
    companyName: formData.get("companyName"),
    companyShortName: formData.get("companyShortName"),
    primaryColor: formData.get("primaryColor"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = {
    companyName: await get(KNOWN_KEYS.COMPANY_NAME),
    companyShortName: await get(KNOWN_KEYS.COMPANY_SHORT_NAME),
    primaryColor: await get(KNOWN_KEYS.PRIMARY_COLOR),
  };

  await set(KNOWN_KEYS.COMPANY_NAME, parsed.data.companyName, { actor: admin });
  await set(KNOWN_KEYS.COMPANY_SHORT_NAME, parsed.data.companyShortName, { actor: admin });
  await set(KNOWN_KEYS.PRIMARY_COLOR, parsed.data.primaryColor, { actor: admin });

  const logo = formData.get("logo");
  let logoPath: string | undefined;
  if (logo instanceof File && logo.size > 0) {
    try {
      logoPath = await saveImage("branding", logo);
      await set(KNOWN_KEYS.LOGO_PATH, logoPath, { actor: admin });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Logo upload failed" };
    }
  }

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "settings.branding.update",
    entity: { type: "settings", id: "branding" },
    before,
    after: { ...parsed.data, logoPath },
    request: meta,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

const ManagementRepSchema = z.object({
  userId: z.string().min(1),
});

export async function saveManagementRepAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const parsed = ManagementRepSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "Select an admin." };

  const before = await get(KNOWN_KEYS.ISO_MANAGEMENT_REP);
  await set(KNOWN_KEYS.ISO_MANAGEMENT_REP, parsed.data.userId, { actor: admin });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "settings.iso_rep.update",
    entity: { type: "settings", id: KNOWN_KEYS.ISO_MANAGEMENT_REP },
    before: { userId: before },
    after: { userId: parsed.data.userId },
    request: meta,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

const SmtpSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().max(255).optional().nullable(),
  password: z.string().optional().nullable(),
  fromEmail: z.string().email(),
  secure: z.enum(["true", "false"]),
});

export async function saveSmtpAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const parsed = SmtpSchema.safeParse({
    host: formData.get("host"),
    port: formData.get("port"),
    user: formData.get("user"),
    password: formData.get("password"),
    fromEmail: formData.get("fromEmail"),
    secure: formData.get("secure"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await set("smtp.host", parsed.data.host, { actor: admin });
  await set("smtp.port", String(parsed.data.port), { actor: admin });
  await set("smtp.user", parsed.data.user ?? "", { actor: admin });
  if (parsed.data.password && parsed.data.password.length > 0) {
    await set("smtp.password", parsed.data.password, { actor: admin });
  }
  await set("smtp.from_email", parsed.data.fromEmail, { actor: admin });
  await set("smtp.secure", parsed.data.secure, { actor: admin });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "settings.smtp.update",
    entity: { type: "settings", id: "smtp" },
    after: {
      host: parsed.data.host,
      port: parsed.data.port,
      user: parsed.data.user,
      fromEmail: parsed.data.fromEmail,
      secure: parsed.data.secure,
      passwordChanged: !!(parsed.data.password && parsed.data.password.length > 0),
    },
    request: meta,
  });

  return { ok: true };
}

export async function testSmtpAction() {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const result = await testSend(admin.email);
  await record({
    actor: { id: admin.id, email: admin.email },
    action: result.ok ? "settings.smtp.test.success" : "settings.smtp.test.failure",
    entity: { type: "settings", id: "smtp" },
    after: result.ok ? { messageId: result.messageId } : { error: result.error },
    request: meta,
  });

  if (result.ok) return { ok: true };
  return { error: result.error };
}

const AiKeySchema = z.object({
  apiKey: z.string().min(8, "Key looks too short").max(500),
});

export async function saveAiKeyAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const parsed = AiKeySchema.safeParse({ apiKey: formData.get("apiKey") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const probeResult = await probeAnthropic(parsed.data.apiKey);
  if (!probeResult.ok) {
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "settings.ai_key.probe_failure",
      entity: { type: "settings", id: "ai.anthropic_key" },
      after: { error: probeResult.error },
      request: meta,
    });
    return { error: probeResult.error };
  }

  await set("ai.anthropic_key", parsed.data.apiKey, { actor: admin });
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "settings.ai_key.update",
    entity: { type: "settings", id: "ai.anthropic_key" },
    after: { configured: true },
    request: meta,
  });

  revalidatePath("/admin/incidents", "layout");
  return { ok: true };
}

export async function clearAiKeyAction() {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  await set("ai.anthropic_key", null, { actor: admin });
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "settings.ai_key.clear",
    entity: { type: "settings", id: "ai.anthropic_key" },
    after: { configured: false },
    request: meta,
  });

  revalidatePath("/admin/incidents", "layout");
  return { ok: true };
}

export async function saveDeclarationsAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const before = await getDeclarations();
  const next: Record<string, string> = {};
  for (const k of DECLARATION_KEYS) {
    const v = formData.get(`decl.${k}`);
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) {
      return { error: `Declaration text for ${k} cannot be empty.` };
    }
    if (trimmed.length > 500) {
      return { error: `Declaration text for ${k} is too long (max 500 chars).` };
    }
    next[k] = trimmed;
  }

  await setDeclarations(next as Partial<Record<(typeof DECLARATION_KEYS)[number], string>>, admin);

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "settings.checkin_declarations.update",
    entity: { type: "settings", id: "checkin.declarations" },
    before,
    after: next,
    request: meta,
  });

  return { ok: true };
}
