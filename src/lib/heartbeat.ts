import { randomUUID } from "node:crypto";
import { and, gte, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, incidents, user } from "@/db/schema";
import { KNOWN_KEYS, get, set } from "@/lib/settings";

const APP_VERSION = process.env.npm_package_version || "0.0.0";
const APP_START = Date.now();

export type HeartbeatPayload = {
  instance_id: string;
  version: string;
  uptime_seconds: number;
  user_count: number;
  incident_count_30d: number;
  error_count_24h: number;
  company_name?: string;
};

export type HeartbeatGatherDeps = {
  countUsers: () => Promise<number>;
  countIncidentsLast30d: () => Promise<number>;
  countErrorsLast24h: () => Promise<number>;
  uptimeSeconds: () => number;
  version: string;
};

export const liveDeps: HeartbeatGatherDeps = {
  countUsers: async () => {
    const r = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(user);
    return r[0]?.n ?? 0;
  },
  countIncidentsLast30d: async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const r = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(incidents)
      .where(gte(incidents.createdAt, since));
    return r[0]?.n ?? 0;
  },
  countErrorsLast24h: async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const r = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(and(gte(auditLog.ts, since), like(auditLog.action, "%.error")));
    return r[0]?.n ?? 0;
  },
  uptimeSeconds: () => Math.floor((Date.now() - APP_START) / 1000),
  version: APP_VERSION,
};

export async function getOrCreateInstanceId(): Promise<string> {
  const existing = await get(KNOWN_KEYS.HEARTBEAT_INSTANCE_ID);
  if (existing) return existing;
  const id = randomUUID();
  await set(KNOWN_KEYS.HEARTBEAT_INSTANCE_ID, id);
  return id;
}

export async function buildPayload(
  deps: HeartbeatGatherDeps = liveDeps,
): Promise<HeartbeatPayload> {
  const [
    instanceId,
    includeCompany,
    companyName,
    userCount,
    incidentCount,
    errorCount,
  ] = await Promise.all([
    getOrCreateInstanceId(),
    get(KNOWN_KEYS.HEARTBEAT_INCLUDE_COMPANY_NAME),
    get(KNOWN_KEYS.COMPANY_NAME),
    deps.countUsers(),
    deps.countIncidentsLast30d(),
    deps.countErrorsLast24h(),
  ]);

  const payload: HeartbeatPayload = {
    instance_id: instanceId,
    version: deps.version,
    uptime_seconds: deps.uptimeSeconds(),
    user_count: userCount,
    incident_count_30d: incidentCount,
    error_count_24h: errorCount,
  };

  if (includeCompany === "true" && companyName) {
    payload.company_name = companyName;
  }

  return payload;
}

export type SendResult =
  | { ok: true; status: number }
  | { ok: false; reason: "disabled" | "no_endpoint" | "http"; status?: number; message?: string };

export async function sendHeartbeat(
  fetchImpl: typeof fetch = fetch,
  deps: HeartbeatGatherDeps = liveDeps,
): Promise<SendResult> {
  const enabled = (await get(KNOWN_KEYS.HEARTBEAT_ENABLED)) === "true";
  if (!enabled) return { ok: false, reason: "disabled" };

  const endpoint = await get(KNOWN_KEYS.HEARTBEAT_ENDPOINT);
  if (!endpoint) return { ok: false, reason: "no_endpoint" };

  const token = await get("heartbeat.token");
  const payload = await buildPayload(deps);

  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    return { ok: false, reason: "http", status: res.status, message: snippet || "send failed" };
  }

  await set(KNOWN_KEYS.HEARTBEAT_LAST_AT, new Date().toISOString());
  return { ok: true, status: res.status };
}
