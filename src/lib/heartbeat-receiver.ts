import { desc, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { heartbeatInstances, heartbeats } from "@/db/schema";
import { KNOWN_KEYS, get } from "@/lib/settings";
import type { HeartbeatPayload } from "@/lib/heartbeat";

export type IngestResult =
  | { ok: true; instanceId: string }
  | { ok: false; reason: "unauthorized" | "invalid"; message: string };

export function isValidPayload(value: unknown): value is HeartbeatPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.instance_id === "string" &&
    v.instance_id.length > 0 &&
    typeof v.version === "string" &&
    typeof v.uptime_seconds === "number" &&
    typeof v.user_count === "number" &&
    typeof v.incident_count_30d === "number" &&
    typeof v.error_count_24h === "number" &&
    (v.company_name === undefined || typeof v.company_name === "string")
  );
}

export async function ingest(opts: {
  authHeader: string | null;
  body: unknown;
}): Promise<IngestResult> {
  const expected = await get(KNOWN_KEYS.HEARTBEAT_INGEST_TOKEN);
  if (!expected) {
    return { ok: false, reason: "unauthorized", message: "Ingest disabled" };
  }
  const provided = (opts.authHeader ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return { ok: false, reason: "unauthorized", message: "Bad token" };
  }
  if (!isValidPayload(opts.body)) {
    return { ok: false, reason: "invalid", message: "Bad payload shape" };
  }
  const p = opts.body;
  const optedInName = typeof p.company_name === "string" && p.company_name.length > 0;

  await db
    .insert(heartbeatInstances)
    .values({
      instanceId: p.instance_id,
      companyName: optedInName ? p.company_name : null,
      version: p.version,
      optedInCompanyName: optedInName,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: heartbeatInstances.instanceId,
      set: {
        companyName: optedInName ? p.company_name : null,
        version: p.version,
        optedInCompanyName: optedInName,
        lastSeenAt: new Date(),
      },
    });

  await db.insert(heartbeats).values({
    instanceId: p.instance_id,
    payload: p,
  });

  return { ok: true, instanceId: p.instance_id };
}

export type InstanceRow = {
  instanceId: string;
  companyName: string | null;
  version: string | null;
  lastSeenAt: Date;
  staleHours: number;
};

export async function listInstances(): Promise<InstanceRow[]> {
  const rows = await db
    .select()
    .from(heartbeatInstances)
    .orderBy(desc(heartbeatInstances.lastSeenAt));
  const now = Date.now();
  return rows.map((r) => ({
    instanceId: r.instanceId,
    companyName: r.companyName,
    version: r.version,
    lastSeenAt: r.lastSeenAt,
    staleHours: (now - r.lastSeenAt.getTime()) / (60 * 60 * 1000),
  }));
}

export async function staleInstances(maxAgeMs = 60 * 60 * 1000): Promise<InstanceRow[]> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const rows = await db
    .select()
    .from(heartbeatInstances)
    .where(lt(heartbeatInstances.lastSeenAt, cutoff))
    .orderBy(desc(heartbeatInstances.lastSeenAt));
  const now = Date.now();
  return rows.map((r) => ({
    instanceId: r.instanceId,
    companyName: r.companyName,
    version: r.version,
    lastSeenAt: r.lastSeenAt,
    staleHours: (now - r.lastSeenAt.getTime()) / (60 * 60 * 1000),
  }));
}

export async function pruneOldHeartbeats(maxAgeMs = 90 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const r = await db
    .delete(heartbeats)
    .where(lt(heartbeats.receivedAt, cutoff))
    .returning({ id: heartbeats.id });
  return r.length;
}

export async function recentForInstance(instanceId: string, limit = 50) {
  return db
    .select()
    .from(heartbeats)
    .where(sql`${heartbeats.instanceId} = ${instanceId}`)
    .orderBy(desc(heartbeats.receivedAt))
    .limit(limit);
}

