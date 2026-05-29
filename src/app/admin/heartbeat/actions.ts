"use server";

import { revalidatePath } from "next/cache";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { getOrCreateInstanceId, sendHeartbeat } from "@/lib/heartbeat";
import { getRequestMeta } from "@/lib/request-meta";
import { KNOWN_KEYS, set } from "@/lib/settings";

export async function saveHeartbeatAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const enabled = form.get("enabled") === "on" ? "true" : "false";
  const includeCompany = form.get("includeCompanyName") === "on" ? "true" : "false";
  const endpoint = ((form.get("endpoint") as string) || "").trim() || null;
  const token = ((form.get("token") as string) || "").trim();

  await getOrCreateInstanceId();
  await set(KNOWN_KEYS.HEARTBEAT_ENABLED, enabled, { actor: { id: admin.id } });
  await set(KNOWN_KEYS.HEARTBEAT_INCLUDE_COMPANY_NAME, includeCompany, {
    actor: { id: admin.id },
  });
  await set(KNOWN_KEYS.HEARTBEAT_ENDPOINT, endpoint, { actor: { id: admin.id } });
  if (token.length > 0) {
    await set("heartbeat.token", token, { actor: { id: admin.id } });
  }

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "heartbeat.config",
    entity: { type: "heartbeat" },
    after: { enabled, includeCompany, endpoint, tokenChanged: token.length > 0 },
    request: meta,
  });

  revalidatePath("/admin/heartbeat");
}

export async function sendTestHeartbeatAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const result = await sendHeartbeat();
  await record({
    actor: { id: admin.id, email: admin.email },
    action: result.ok ? "heartbeat.test_send" : "heartbeat.test_send.error",
    entity: { type: "heartbeat" },
    after: result,
    request: meta,
  });
  if (result.ok) return { ok: true, message: `Sent (HTTP ${result.status}).` };
  if (result.reason === "disabled") return { ok: false, message: "Heartbeat disabled." };
  if (result.reason === "no_endpoint")
    return { ok: false, message: "No endpoint configured." };
  return {
    ok: false,
    message: `HTTP ${result.status ?? "?"}: ${result.message ?? "send failed"}`,
  };
}

export async function saveIngestTokenAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const token = ((form.get("ingestToken") as string) || "").trim();
  await set(KNOWN_KEYS.HEARTBEAT_INGEST_TOKEN, token.length > 0 ? token : null, {
    actor: { id: admin.id },
  });
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "heartbeat.ingest_token.set",
    entity: { type: "heartbeat" },
    after: { cleared: token.length === 0 },
    request: meta,
  });
  revalidatePath("/admin/vendor/heartbeats");
}
